"""
Match candidates against a job description.

1. Fetch the JD from DynamoDB by pk (path parameter).
2. Pre-filter candidates via OpenSearch (should-based scoring query).
3. Send top candidates to Bedrock Claude for alignment scoring.
4. Return ranked candidates with scores and rationale.
"""

import json
import os
import re
from decimal import Decimal
from difflib import SequenceMatcher

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
SCORING_LIMIT = int(os.environ.get("SCORING_LIMIT", "15"))
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


_TITLE_NOISE_WORDS = {
    "senior",
    "jr",
    "junior",
    "sr",
    "lead",
    "staff",
    "principal",
    "ii",
    "iii",
    "iv",
    "the",
    "and",
    "of",
}

_SKILL_NOISE_TOKENS = {
    "skill",
    "skills",
    "framework",
    "frameworks",
    "methodology",
    "methodologies",
    "development",
    "delivery",
    "experience",
    "knowledge",
    "proficiency",
    "tools",
    "tool",
    "platform",
    "platforms",
    "technologies",
    "technology",
    "hands",
    "on",
    "and",
}


def _to_list(value):
    """Normalize comma-delimited or list fields into a clean string list."""
    if value is None:
        return []
    if isinstance(value, list):
        return [str(v).strip() for v in value if str(v).strip()]
    if isinstance(value, str):
        return [v.strip() for v in value.split(",") if v.strip()]
    return [str(value).strip()] if str(value).strip() else []


def _to_float(value):
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _title_tokens(title):
    if not title:
        return set()
    clean = re.sub(r"[^a-z0-9\s]", " ", str(title).lower())
    return {tok for tok in clean.split() if tok and tok not in _TITLE_NOISE_WORDS}


def _skill_tokens(skill):
    """Return normalized tokens for fuzzy skill matching."""
    if not skill:
        return set()

    clean = str(skill).lower().replace("&", " and ")
    clean = re.sub(r"[^a-z0-9\s]", " ", clean)
    tokens = []
    for raw in clean.split():
        tok = raw.strip()
        if not tok or tok in _SKILL_NOISE_TOKENS:
            continue
        if len(tok) > 4 and tok.endswith("ies"):
            tok = tok[:-3] + "y"
        elif len(tok) > 4 and tok.endswith("s"):
            tok = tok[:-1]
        tokens.append(tok)
    return set(tokens)


def _skills_semantically_match(required_skill, candidate_skill):
    """Return True when two skill phrases appear semantically equivalent for matching."""
    req_raw = str(required_skill or "").strip().lower()
    cand_raw = str(candidate_skill or "").strip().lower()
    if not req_raw or not cand_raw:
        return False
    if req_raw == cand_raw:
        return True

    req_tokens = _skill_tokens(required_skill)
    cand_tokens = _skill_tokens(candidate_skill)
    if not req_tokens or not cand_tokens:
        return False

    # Require meaningful tokens — very short token sets match too broadly
    if len(req_tokens) == 1 and len(cand_tokens) == 1:
        # Single-token skills must match exactly (e.g. "AI" != "BI")
        return req_tokens == cand_tokens

    overlap = len(req_tokens & cand_tokens)
    overlap_req = overlap / max(1, len(req_tokens))
    if overlap_req >= 0.80:
        return True

    req_phrase = " ".join(sorted(req_tokens))
    cand_phrase = " ".join(sorted(cand_tokens))
    phrase_similarity = SequenceMatcher(None, req_phrase, cand_phrase).ratio()
    return overlap_req >= 0.6 and phrase_similarity >= 0.85


def _count_missing_required_skills(required_skills, candidate_skills):
    """Count required skills that have no semantic match in candidate skills."""
    missing = 0
    for req_skill in required_skills:
        if not any(_skills_semantically_match(req_skill, cand_skill) for cand_skill in candidate_skills):
            missing += 1
    return missing


def _titles_semantically_match(jd_title, cand_title):
    """Return True when two job titles appear to describe the same role family."""
    jd_tokens = _title_tokens(jd_title)
    cand_tokens = _title_tokens(cand_title)
    if not jd_tokens or not cand_tokens:
        return True  # can't compare — don't penalize

    overlap = len(jd_tokens & cand_tokens)
    # At least half the JD title tokens should appear in candidate title
    if overlap / len(jd_tokens) >= 0.5:
        return True

    # Fall back to string similarity on the full normalized titles
    jd_norm = " ".join(sorted(jd_tokens))
    cand_norm = " ".join(sorted(cand_tokens))
    return SequenceMatcher(None, jd_norm, cand_norm).ratio() >= 0.6


def _apply_score_guardrails(jd, candidate, score, rationale):
    """Apply deterministic caps so skills-only matches do not over-score misaligned candidates."""
    capped_score = max(0, min(100, int(score)))
    cap = 100
    reasons = []

    # Penalize missing required skills even when overall skill overlap is high.
    required_skills = _to_list(jd.get("required_skills"))
    candidate_skills = _to_list(candidate.get("skill_names"))
    missing_required = _count_missing_required_skills(required_skills, candidate_skills)
    if missing_required >= 2:
        cap = min(cap, 65)
        reasons.append("missing multiple required skills")
    elif missing_required == 1:
        cap = min(cap, 78)
        reasons.append("missing one required skill")

    # Penalize years-of-experience gaps.
    min_exp = _to_float(jd.get("min_experience_years"))
    cand_exp = _to_float(candidate.get("years_of_experience"))
    if min_exp is not None and cand_exp is not None and cand_exp < min_exp:
        shortfall = min_exp - cand_exp
        if shortfall >= 3:
            cap = min(cap, 60)
            reasons.append("experience shortfall (3+ years)")
        elif shortfall >= 1:
            cap = min(cap, 75)
            reasons.append("experience shortfall")

    # Penalize role-title mismatch to avoid overvaluing keyword overlap.
    if not _titles_semantically_match(jd.get("job_title"), candidate.get("job_title")):
        cap = min(cap, 70)
        reasons.append("job title mismatch")

    adjusted = min(capped_score, cap)
    if adjusted < capped_score and rationale:
        rationale = f"{rationale} Guardrail adjustment: {', '.join(reasons)}."

    return adjusted, rationale


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

    # Boost matching industry / job title (use match for title for partial word overlap)
    if jd.get("industry_category"):
        should.append({"term": {"industry_category": {"value": jd["industry_category"], "boost": 2}}})
    if jd.get("job_title"):
        should.append({"match": {"job_title": {"query": jd["job_title"], "boost": 2}}})

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
        company_names = []
        for company in c.get("companies") or []:
            if isinstance(company, dict):
                company_name = company.get("name")
                if company_name:
                    company_names.append(str(company_name))

        candidate_summaries.append(
            {
                "pk": c.get("pk"),
                "name": c.get("name"),
                "skills": _to_list(c.get("skill_names")),
                "certifications": _to_list(c.get("cert_names")),
                "clearance_level": c.get("clearance_level"),
                "years_of_experience": c.get("years_of_experience"),
                "industry_category": c.get("industry_category"),
                "job_title": c.get("job_title"),
                "location_state": c.get("location_state"),
                "companies": company_names[:5],
                "summary": (c.get("summary") or "")[:1000],
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

Scoring rubric (100 points total):
- Skills + certifications alignment: 30
- Summary & role alignment (compare candidate summary against JD description_summary —
  do their actual responsibilities, domain expertise, and mission focus overlap?): 35
- Years-of-experience fit: 20
- Clearance + location + industry fit: 15

IMPORTANT: The summary/role alignment category (35 pts) is the MOST weighted factor.
Read both summaries carefully. A candidate whose work history describes hands-on experience
in the same domain, mission area, and responsibility scope as the JD should score high here.
A candidate with overlapping skill keywords but a fundamentally different role focus
(e.g., project manager vs. hands-on engineer) should score LOW on this category.

Hard constraints:
- If the candidate is below required years of experience by 1-2 years, score MUST NOT exceed 75.
- If the candidate is below required years by 3+ years, score MUST NOT exceed 60.
- If the candidate's role/work history is not genuinely aligned (keyword overlap only), score MUST NOT exceed 72.
- Missing multiple required skills should keep score <= 65.

Scoring bands:
- 90-100: Strongly aligned role history, meets requirements, minimal risk
- 70-89: Good fit with small gaps
- 50-69: Partial fit with notable gaps
- 30-49: Weak fit with substantial gaps
- 0-29: Poor fit

Rationale requirements:
- Mention specific summary/role alignment (or mismatch) —
  what in their work history does or does not match the JD mission.
- Mention years-of-experience comparison to JD requirement explicitly.
- Keep rationale to 1-2 concise sentences.

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
        candidate_by_pk = {c.get("pk"): c for c in candidates if c.get("pk")}
        score_map = {}
        for entry in scores:
            pk = entry.get("pk")
            if pk:
                raw_score = max(0, min(100, int(entry.get("score", 0))))
                raw_rationale = str(entry.get("rationale", ""))
                adjusted_score, adjusted_rationale = _apply_score_guardrails(
                    jd,
                    candidate_by_pk.get(pk, {}),
                    raw_score,
                    raw_rationale,
                )
                score_map[pk] = {
                    "score": adjusted_score,
                    "rationale": adjusted_rationale,
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
                        "skills": _to_list(candidate.get("skill_names")),
                        "certifications": _to_list(candidate.get("cert_names")),
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
                        "skills": _to_list(candidate.get("skill_names")),
                        "certifications": _to_list(candidate.get("cert_names")),
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
