"""
List talents via OpenSearch.
Replaces the DynamoDB GSI + Python post-filter approach with a single
OpenSearch bool query, enabling multi-dimension filtering and name search.
"""

import json
import os

import boto3
from opensearchpy import AWSV4SignerAuth, NotFoundError, OpenSearch, RequestsHttpConnection

OPENSEARCH_ENDPOINT = os.environ["OPENSEARCH_ENDPOINT"]
INDEX_NAME = "talent-profiles"


def _get_client():
    credentials = boto3.Session().get_credentials()
    region = os.environ.get("AWS_REGION", "us-east-1")
    auth = AWSV4SignerAuth(credentials, region, "es")
    return OpenSearch(
        hosts=[{"host": OPENSEARCH_ENDPOINT, "port": 443}],
        http_auth=auth,
        use_ssl=True,
        verify_certs=True,
        connection_class=RequestsHttpConnection,
        timeout=30,
    )


def handler(event, context):
    try:
        params = event.get("queryStringParameters") or {}
        client = _get_client()

        must = []
        filters = []

        # Full-text search across name and resume text only.
        # Name uses match_phrase_prefix (prefix on last token).
        # resume_text uses match_phrase (exact phrase only) to avoid
        # noisy prefix expansion (e.g. "ben" → "benefit", "best").
        if params.get("search"):
            search_term = params["search"]
            should_clauses = [
                {
                    "match_phrase_prefix": {
                        "name": {
                            "query": search_term,
                            "boost": 10,
                            "max_expansions": 10,
                        }
                    }
                },
                {
                    "match": {
                        "tags": {
                            "query": search_term,
                            "boost": 5,
                        }
                    }
                },
            ]
            if len(search_term.strip()) >= 2:
                should_clauses.append({"match_phrase": {"resume_text": {"query": search_term, "boost": 1}}})
            must.append(
                {
                    "bool": {
                        "should": should_clauses,
                        "minimum_should_match": 1,
                    }
                }
            )

        # Exact keyword filters
        for field in (
            "status",
            "service_category",
            "job_title",
            "clearance_level",
            "location_state",
        ):
            if params.get(field):
                filters.append({"term": {field: params[field]}})

        # Industry categories — each must be present (AND logic)
        if params.get("industry_category"):
            for cat in [c.strip() for c in params["industry_category"].split(",") if c.strip()]:
                filters.append({"term": {"industry_category": cat}})

        if params.get("city"):
            filters.append({"term": {"location.city": params["city"]}})

        # Skills — each must be present (AND logic)
        if params.get("skills"):
            for skill in [s.strip() for s in params["skills"].split(",") if s.strip()]:
                filters.append({"term": {"skill_names": skill}})

        # Certifications — each must be present (AND logic)
        if params.get("certifications"):
            for cert in [c.strip() for c in params["certifications"].split(",") if c.strip()]:
                filters.append({"term": {"cert_names": cert}})

        # Tags — each must be present (AND logic)
        if params.get("tags"):
            for tag in [t.strip() for t in params["tags"].split(",") if t.strip()]:
                filters.append({"term": {"tags": tag}})

        # Years of experience range
        years_range = {}
        if params.get("minYears"):
            years_range["gte"] = int(params["minYears"])
        if params.get("maxYears"):
            years_range["lte"] = int(params["maxYears"])
        if years_range:
            filters.append({"range": {"years_of_experience": years_range}})

        # When searching, sort by relevance so name matches rank first;
        # otherwise sort by newest received.
        sort_clause = (
            [{"_score": {"order": "desc"}}, {"date_received": {"order": "desc"}}]
            if params.get("search")
            else [{"date_received": {"order": "desc"}}]
        )

        query = {
            "query": {
                "bool": {
                    "must": must if must else [{"match_all": {}}],
                    "filter": filters,
                }
            },
            "sort": sort_clause,
            "size": 1000,
        }

        # Add highlighting when a search query is active
        if params.get("search"):
            query["highlight"] = {
                "fields": {
                    "resume_text": {"fragment_size": 200, "number_of_fragments": 1},
                },
                "pre_tags": ["<mark>"],
                "post_tags": ["</mark>"],
            }

        try:
            response = client.search(index=INDEX_NAME, body=query)
        except NotFoundError:
            # Index hasn't been created yet — no data processed
            return {
                "statusCode": 200,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"items": [], "count": 0}),
            }
        items = []
        for hit in response["hits"]["hits"]:
            doc = hit["_source"]
            if "highlight" in hit:
                doc["_highlight"] = hit["highlight"]
            items.append(doc)

        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"items": items, "count": len(items)}),
        }

    except Exception as e:
        print(f"Error: {e}")
        import traceback

        traceback.print_exc()
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": str(e)}),
        }
