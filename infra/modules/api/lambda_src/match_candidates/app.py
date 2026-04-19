"""
Match candidates against a job description.

1. Fetch the JD from DynamoDB by pk (path parameter).
2. Pre-filter candidates via OpenSearch (should-based scoring query).
3. Send top candidates to Bedrock Claude for alignment scoring.
4. Return ranked candidates with scores and rationale.
"""

import json
import os
from decimal import Decimal

import boto3
from opensearchpy import AWSV4SignerAuth, OpenSearch, RequestsHttpConnection

dynamodb = boto3.resource("dynamodb")
jd_table = dynamodb.Table(os.environ["JOB_DESCRIPTIONS_TABLE"])

OPENSEARCH_ENDPOINT = os.environ["OPENSEARCH_ENDPOINT"]
INDEX_NAME = "talent-profiles"

AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")
MODEL_ID = os.environ.get("BEDROCK_MODEL_ID", "us.anthropic.claude-sonnet-4-20250514-v1:0")
bedrock = boto3.client("bedrock-runtime", region_name=AWS_REGION)

# How many candidates to pull from OpenSearch pre-filter
PRE_FILTER_LIMIT = int(os.environ.get("PRE_FILTER_LIMIT", "50"))
# How many candidates to send to Bedrock for scoring
SCORING_LIMIT = int(os.environ.get("SCORING_LIMIT", "10"))
# Default number of results to return
DEFAULT_RETURN_LIMIT = 10


class DecimalEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, Decimal):
            return int(o) if o % 1 == 0 else float(o)
        return super().default(o)


def _get_os_client():
    credentials = boto3.Session().get_credentials()
    auth = AWSV4SignerAuth(credentials, AWS_REGION, "es")
    return OpenSearch(
        hosts=[{"host": OPENSEARCH_ENDPOINT, "port": 443}],
        http_auth=auth,
        use_ssl=True,
        verify_certs=True,
        connection_class=RequestsHttpConnection,
        timeout=30,
    )


# Clearance hierarchy: higher index = higher clearance
_CLEARANCE_HIERARCHY = [
    "Secret",
    "TS",
    "TS/SCI",
    "TS/SCI/CI",
    "TS/SCI/FSP",
    "Yankee White",
]


def _clearance_rank(clearance):
    """Return numeric rank for a clearance level, or -1 if not found."""
    try:
        return _CLEARANCE_HIERARCHY.index(clearance)
    except (ValueError, TypeError):
        return -1


def _build_prefilter_query(jd):
    """Build an OpenSearch bool query to pre-filter and score candidates."""
    should = []
    filters = []

    # Boost candidates with matching skills (required skills weighted higher)
    for skill in jd.get("required_skills") or []:
        should.append({"term": {"skill_names": {"value": skill, "boost": 3}}})
    for skill in jd.get("desired_skills") or []:
        should.append({"term": {"skill_names": {"value": skill, "boost": 1}}})

    # Boost matching certifications
    for cert in jd.get("required_certifications") or []:
        should.append({"term": {"cert_names": {"value": cert, "boost": 3}}})
    for cert in jd.get("desired_certifications") or []:
        should.append({"term": {"cert_names": {"value": cert, "boost": 1}}})

    # Boost matching industry / job title
    if jd.get("industry_category"):
        should.append({"term": {"industry_category": {"value": jd["industry_category"], "boost": 2}}})
    if jd.get("job_title"):
        should.append({"term": {"job_title": {"value": jd["job_title"], "boost": 2}}})

    # Clearance: filter to candidates who meet or exceed the requirement
    required_clearance = jd.get("required_clearance")
    if required_clearance:
        req_rank = _clearance_rank(required_clearance)
        if req_rank >= 0:
            qualifying = _CLEARANCE_HIERARCHY[req_rank:]
            filters.append({"terms": {"clearance_level": qualifying}})

    # Experience: filter to candidates meeting minimum
    min_exp = jd.get("min_experience_years")
    if min_exp is not None:
        filters.append({"range": {"years_of_experience": {"gte": float(min_exp)}}})

    query = {
        "bool": {
            "should": should,
            "minimum_should_match": 1 if should else 0,
        }
    }
    if filters:
        query["bool"]["filter"] = filters

    return query


def _build_scoring_prompt(jd, candidates):
    """Build the Bedrock prompt for alignment scoring."""
    jd_summary = {
        "title": jd.get("title"),
        "description_summary": jd.get("description_summary"),
        "required_skills": jd.get("required_skills", []),
        "desired_skills": jd.get("desired_skills", []),
        "required_certifications": jd.get("required_certifications", []),
        "desired_certifications": jd.get("desired_certifications", []),
        "required_clearance": jd.get("required_clearance"),
        "min_experience_years": jd.get("min_experience_years"),
        "industry_category": jd.get("industry_category"),
        "job_title": jd.get("job_title"),
        "location": jd.get("location"),
    }

    candidate_summaries = []
    for c in candidates:
        candidate_summaries.append(
            {
                "pk": c.get("pk"),
                "name": c.get("name"),
                "skills": c.get("skill_names", []),
                "certifications": c.get("cert_names", []),
                "clearance_level": c.get("clearance_level"),
                "years_of_experience": c.get("years_of_experience"),
                "industry_category": c.get("industry_category"),
                "job_title": c.get("job_title"),
                "location_state": c.get("location_state"),
                "summary": (c.get("summary") or "")[:500],
            }
        )

    return f"""You are a talent matching assistant. Score each candidate's alignment with the job description.

JOB DESCRIPTION:
{json.dumps(jd_summary, cls=DecimalEncoder, indent=2)}

CANDIDATES:
{json.dumps(candidate_summaries, cls=DecimalEncoder, indent=2)}

For each candidate, produce a JSON object with:
- "pk": the candidate's pk (string, EXACT match from input)
- "score": alignment score from 0-100 (integer)
- "rationale": 1-2 sentence explanation of the score

Scoring guidelines:
- 90-100: Meets all required skills/certs/clearance, has desired skills, strong experience match
- 70-89: Meets most required skills/clearance, some gaps in desired skills
- 50-69: Meets some requirements, notable gaps in skills or experience
- 30-49: Significant gaps, but has transferable skills
- 0-29: Poor match, few relevant qualifications

Return ONLY a JSON array of objects, sorted by score descending. No markdown, no extra text."""


def _score_candidates(jd, candidates):
    """Call Bedrock to score candidate alignment."""
    if not candidates:
        return []

    prompt = _build_scoring_prompt(jd, candidates)

    try:
        response = bedrock.converse(
            modelId=MODEL_ID,
            messages=[{"role": "user", "content": [{"text": prompt}]}],
            inferenceConfig={"maxTokens": 4096, "temperature": 0},
        )

        text = response["output"]["message"]["content"][0]["text"]

        # Parse the JSON response — handle markdown code blocks
        text = text.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1] if "\n" in text else text[3:]
            if text.endswith("```"):
                text = text[:-3]
            text = text.strip()

        scores = json.loads(text)

        # Build lookup of scores by pk
        score_map = {}
        for entry in scores:
            pk = entry.get("pk")
            if pk:
                score_map[pk] = {
                    "score": max(0, min(100, int(entry.get("score", 0)))),
                    "rationale": str(entry.get("rationale", "")),
                }

        return score_map

    except Exception as e:
        print(f"Bedrock scoring error: {e}")
        return {}


def handler(event, context):
    try:
        pk = (event.get("pathParameters") or {}).get("pk")

        if not pk:
            return {
                "statusCode": 400,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": "Missing pk path parameter"}),
            }

        # Parse optional limit from query params
        params = event.get("queryStringParameters") or {}
        try:
            limit = min(int(params.get("limit", DEFAULT_RETURN_LIMIT)), PRE_FILTER_LIMIT)
        except (ValueError, TypeError):
            limit = DEFAULT_RETURN_LIMIT

        # 1. Fetch job description
        jd_response = jd_table.get_item(Key={"pk": pk})
        jd = jd_response.get("Item")
        if not jd:
            return {
                "statusCode": 404,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": "Job description not found"}),
            }

        # 2. Pre-filter candidates from OpenSearch
        os_client = _get_os_client()
        query = _build_prefilter_query(jd)

        search_body = {
            "query": query,
            "size": PRE_FILTER_LIMIT,
            "sort": [{"_score": {"order": "desc"}}],
        }

        try:
            os_response = os_client.search(index=INDEX_NAME, body=search_body)
            hits = os_response.get("hits", {}).get("hits", [])
        except Exception as e:
            print(f"OpenSearch query error: {e}")
            hits = []

        candidates = [hit["_source"] for hit in hits]

        # 3. Score top candidates with Bedrock
        to_score = candidates[:SCORING_LIMIT]
        score_map = _score_candidates(jd, to_score)

        # 4. Build results — merge scores with candidate data
        results = []
        for candidate in candidates:
            cpk = candidate.get("pk", "")
            scoring = score_map.get(cpk)
            if scoring:
                results.append(
                    {
                        "pk": cpk,
                        "name": candidate.get("name"),
                        "job_title": candidate.get("job_title"),
                        "clearance_level": candidate.get("clearance_level"),
                        "years_of_experience": candidate.get("years_of_experience"),
                        "location_state": candidate.get("location_state"),
                        "skills": candidate.get("skill_names", []),
                        "certifications": candidate.get("cert_names", []),
                        "industry_category": candidate.get("industry_category"),
                        "score": scoring["score"],
                        "rationale": scoring["rationale"],
                    }
                )
            else:
                # Candidates beyond SCORING_LIMIT or scoring failed
                results.append(
                    {
                        "pk": cpk,
                        "name": candidate.get("name"),
                        "job_title": candidate.get("job_title"),
                        "clearance_level": candidate.get("clearance_level"),
                        "years_of_experience": candidate.get("years_of_experience"),
                        "location_state": candidate.get("location_state"),
                        "skills": candidate.get("skill_names", []),
                        "certifications": candidate.get("cert_names", []),
                        "industry_category": candidate.get("industry_category"),
                        "score": None,
                        "rationale": None,
                    }
                )

        # Sort scored candidates first (by score desc), then unscored
        results.sort(key=lambda x: (x["score"] is not None, x["score"] or 0), reverse=True)

        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps(
                {
                    "job_description": {
                        "pk": jd.get("pk"),
                        "title": jd.get("title"),
                    },
                    "total_candidates": len(results),
                    "matches": results[:limit],
                },
                cls=DecimalEncoder,
            ),
        }

    except Exception as e:
        print(f"Error: {e}")
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": str(e)}),
        }
