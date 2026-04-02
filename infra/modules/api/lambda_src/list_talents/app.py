"""
List talents via OpenSearch.
Replaces the DynamoDB GSI + Python post-filter approach with a single
OpenSearch bool query, enabling multi-dimension filtering and name search.
"""

import json
import os

import boto3
from opensearchpy import OpenSearch, RequestsHttpConnection, AWSV4SignerAuth

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
    )


def handler(event, context):
    try:
        params = event.get("queryStringParameters") or {}
        client = _get_client()

        must = []
        filters = []

        # Full-text search across name and summary.
        # name: match_phrase_prefix — strict prefix matching, no fuzziness
        # summary: match with fuzziness 1 — allows one typo per token
        if params.get("search"):
            search_term = params["search"]
            must.append(
                {
                    "bool": {
                        "should": [
                            {
                                "match_phrase_prefix": {
                                    "name": {"query": search_term, "boost": 3}
                                }
                            },
                            {
                                "match": {
                                    "summary": {
                                        "query": search_term,
                                        "fuzziness": 1,
                                    }
                                }
                            },
                        ],
                        "minimum_should_match": 1,
                    }
                }
            )

        # Exact keyword filters
        for field in (
            "status",
            "talent_bucket",
            "talent_category",
            "clearance_level",
            "location_state",
        ):
            if params.get(field):
                filters.append({"term": {field: params[field]}})

        if params.get("city"):
            filters.append({"term": {"location.city": params["city"]}})

        # Skills — each must be present (AND logic)
        if params.get("skills"):
            for skill in [s.strip() for s in params["skills"].split(",") if s.strip()]:
                filters.append({"term": {"skill_names": skill}})

        # Certifications — each must be present (AND logic)
        if params.get("certifications"):
            for cert in [
                c.strip() for c in params["certifications"].split(",") if c.strip()
            ]:
                filters.append({"term": {"cert_names": cert}})

        # Years of experience range
        years_range = {}
        if params.get("minYears"):
            years_range["gte"] = int(params["minYears"])
        if params.get("maxYears"):
            years_range["lte"] = int(params["maxYears"])
        if years_range:
            filters.append({"range": {"years_of_experience": years_range}})

        search_active = bool(params.get("search"))

        query = {
            "query": {
                "bool": {
                    "must": must if must else [{"match_all": {}}],
                    "filter": filters,
                }
            },
            "sort": [{"date_received": {"order": "desc"}}],
            "size": 1000,
        }

        if search_active:
            query["highlight"] = {
                "pre_tags": ["<em>"],
                "post_tags": ["</em>"],
                "number_of_fragments": 1,
                "fragment_size": 120,
                "fields": {
                    "name": {},
                    "summary": {},
                },
            }

        response = client.search(index=INDEX_NAME, body=query)
        items = []
        for hit in response["hits"]["hits"]:
            doc = hit["_source"]
            if search_active and hit.get("highlight"):
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
