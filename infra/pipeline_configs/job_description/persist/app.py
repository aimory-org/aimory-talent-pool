import os
import uuid
from datetime import datetime, timezone
from decimal import Decimal

import boto3

TABLE_NAME = os.environ["JOB_DESCRIPTIONS_TABLE"]
AUDIT_LOG_TABLE = os.environ.get("AUDIT_LOG_TABLE", "")
SKILLS_LOOKUP_TABLE = os.environ.get("SKILLS_LOOKUP_TABLE", "")
CERTIFICATIONS_LOOKUP_TABLE = os.environ.get("CERTIFICATIONS_LOOKUP_TABLE", "")
CITIES_LOOKUP_TABLE = os.environ.get("CITIES_LOOKUP_TABLE", "")
JOB_TITLES_LOOKUP_TABLE = os.environ.get("JOB_TITLES_LOOKUP_TABLE", "")
INDUSTRY_CATEGORIES_LOOKUP_TABLE = os.environ.get("INDUSTRY_CATEGORIES_LOOKUP_TABLE", "")

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(TABLE_NAME)

# State abbreviation mapping (subset for normalisation)
_STATE_ABBREVS = {
    "alabama": "AL",
    "alaska": "AK",
    "arizona": "AZ",
    "arkansas": "AR",
    "california": "CA",
    "colorado": "CO",
    "connecticut": "CT",
    "delaware": "DE",
    "florida": "FL",
    "georgia": "GA",
    "hawaii": "HI",
    "idaho": "ID",
    "illinois": "IL",
    "indiana": "IN",
    "iowa": "IA",
    "kansas": "KS",
    "kentucky": "KY",
    "louisiana": "LA",
    "maine": "ME",
    "maryland": "MD",
    "massachusetts": "MA",
    "michigan": "MI",
    "minnesota": "MN",
    "mississippi": "MS",
    "missouri": "MO",
    "montana": "MT",
    "nebraska": "NE",
    "nevada": "NV",
    "new hampshire": "NH",
    "new jersey": "NJ",
    "new mexico": "NM",
    "new york": "NY",
    "north carolina": "NC",
    "north dakota": "ND",
    "ohio": "OH",
    "oklahoma": "OK",
    "oregon": "OR",
    "pennsylvania": "PA",
    "rhode island": "RI",
    "south carolina": "SC",
    "south dakota": "SD",
    "tennessee": "TN",
    "texas": "TX",
    "utah": "UT",
    "vermont": "VT",
    "virginia": "VA",
    "washington": "WA",
    "west virginia": "WV",
    "wisconsin": "WI",
    "wyoming": "WY",
    "washington dc": "DC",
    "district of columbia": "DC",
}
_VALID_ABBREVS = set(_STATE_ABBREVS.values())


def _normalize_state(state):
    if not state:
        return state
    s = state.strip()
    if s.upper() in _VALID_ABBREVS:
        return s.upper()
    return _STATE_ABBREVS.get(s.lower(), s)


def _to_decimal(value):
    if isinstance(value, list):
        return [_to_decimal(v) for v in value]
    if isinstance(value, dict):
        return {k: _to_decimal(v) for k, v in value.items()}
    if isinstance(value, float):
        return Decimal(str(value))
    if isinstance(value, int) and not isinstance(value, bool):
        return Decimal(value)
    return value


def _validate_jd(jd):
    if not isinstance(jd, dict):
        raise ValueError("extracted must be an object")

    required = {
        "title",
        "required_skills",
        "desired_skills",
        "required_certifications",
        "desired_certifications",
        "required_clearance",
        "min_experience_years",
        "location",
        "industry_category",
        "job_title",
    }
    allowed = required | {
        "is_valid",
        "rejection_reason",
        "salary_range",
        "description_summary",
        "responsibilities",
        "seniority",
        "domain",
    }
    missing = required - jd.keys()
    if missing:
        raise ValueError(f"Missing required keys: {sorted(missing)}")
    extra = jd.keys() - allowed
    if extra:
        raise ValueError(f"Unexpected keys: {sorted(extra)}")


def _populate_lookup_tables(jd):
    now = datetime.now(timezone.utc).isoformat()

    all_skills = list(jd.get("required_skills") or []) + list(jd.get("desired_skills") or [])
    if SKILLS_LOOKUP_TABLE and all_skills:
        skills_table = dynamodb.Table(SKILLS_LOOKUP_TABLE)
        for skill in all_skills:
            name = skill.strip() if skill else ""
            if name:
                skills_table.put_item(Item={"skill": name, "updated_at": now})

    all_certs = list(jd.get("required_certifications") or []) + list(jd.get("desired_certifications") or [])
    if CERTIFICATIONS_LOOKUP_TABLE and all_certs:
        certs_table = dynamodb.Table(CERTIFICATIONS_LOOKUP_TABLE)
        for cert in all_certs:
            name = cert.strip() if cert else ""
            if name:
                certs_table.put_item(Item={"certification": name, "updated_at": now})

    if CITIES_LOOKUP_TABLE and jd.get("location"):
        city = (jd["location"].get("city") or "").strip()
        state = (jd["location"].get("state") or "").strip()
        if city and state:
            dynamodb.Table(CITIES_LOOKUP_TABLE).put_item(Item={"city": city, "state": state, "updated_at": now})

    if JOB_TITLES_LOOKUP_TABLE and jd.get("job_title"):
        title = jd["job_title"].strip()
        if title:
            dynamodb.Table(JOB_TITLES_LOOKUP_TABLE).put_item(Item={"job_title": title, "updated_at": now})

    if INDUSTRY_CATEGORIES_LOOKUP_TABLE and jd.get("industry_category"):
        industry = jd["industry_category"].strip()
        if industry:
            dynamodb.Table(INDUSTRY_CATEGORIES_LOOKUP_TABLE).put_item(
                Item={"industry_category": industry, "updated_at": now}
            )


def _write_audit_entry(pk, action, timestamp, title=None):
    if not AUDIT_LOG_TABLE:
        return
    item = {
        "pk": pk,
        "sk": f"{timestamp}#{action}",
        "action": action,
        "timestamp": timestamp,
        "document_type": "job_description",
        "user_email": "pipeline@system",
        "user_name": "Pipeline",
    }
    if title:
        item["title"] = title
    try:
        dynamodb.Table(AUDIT_LOG_TABLE).put_item(Item=item)
    except Exception as exc:
        print(f"Warning: failed to write audit entry for {pk}: {exc}")


def _check_duplicate(title, current_pk):
    """Check if a JD with the same title already exists. Returns existing pk or None."""
    if not title:
        return None
    title_lower = title.strip().lower()
    if not title_lower or title_lower == "unknown" or title_lower == "untitled":
        return None
    try:
        kwargs = {
            "ProjectionExpression": "pk, title",
        }
        while True:
            response = table.scan(**kwargs)
            for item in response.get("Items", []):
                if item["pk"] == current_pk:
                    continue
                existing_title = (item.get("title") or "").strip().lower()
                if existing_title == title_lower:
                    return item["pk"]
            if "LastEvaluatedKey" not in response:
                return None
            kwargs["ExclusiveStartKey"] = response["LastEvaluatedKey"]
    except Exception:
        # Don't fail the pipeline over duplicate detection
        return None


def handler(event, context):
    jd = event.get("extracted")
    if jd is None:
        raise ValueError("Missing extracted job description in event")

    _validate_jd(jd)

    bucket = event.get("bucket")
    key = event.get("key")
    if not bucket or not key:
        raise ValueError("Missing bucket or key in event")

    # Normalize location state
    if jd.get("location") and jd["location"].get("state"):
        jd["location"]["state"] = _normalize_state(jd["location"]["state"])
    if jd.get("location") and jd["location"].get("city"):
        jd["location"]["city"] = jd["location"]["city"].strip().title()

    pk = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    # Full normalized JD text (mirrors resume_text) — richer query signal for matching than
    # the 500-char summary, for both the LLM scorer and the embedding/rerank query.
    jd_text = ""
    if event.get("normalized") and event["normalized"].get("text"):
        jd_text = event["normalized"]["text"]

    # Denormalized fields for filtering/search
    all_skills = list(jd.get("required_skills") or []) + list(jd.get("desired_skills") or [])
    skill_names = ",".join(all_skills) if all_skills else ""
    all_certs = list(jd.get("required_certifications") or []) + list(jd.get("desired_certifications") or [])
    cert_names = ",".join(all_certs) if all_certs else ""

    location_state = ""
    if jd.get("location") and jd["location"].get("state"):
        location_state = jd["location"]["state"]

    item = {
        "pk": pk,
        "bucket": bucket,
        "key": key,
        "title": jd.get("title"),
        "required_skills": jd.get("required_skills") or [],
        "desired_skills": jd.get("desired_skills") or [],
        "required_certifications": jd.get("required_certifications") or [],
        "desired_certifications": jd.get("desired_certifications") or [],
        "required_clearance": jd.get("required_clearance"),
        "min_experience_years": jd.get("min_experience_years"),
        "location": jd.get("location"),
        "location_state": location_state,
        "industry_category": jd.get("industry_category") or "Unknown",
        "job_title": jd.get("job_title") or "Unknown",
        "salary_range": jd.get("salary_range"),
        "description_summary": jd.get("description_summary"),
        "responsibilities": jd.get("responsibilities") or [],
        "seniority": jd.get("seniority"),
        "domain": jd.get("domain"),
        "jd_text": jd_text,
        "skill_names": skill_names,
        "cert_names": cert_names,
        "created_at": now,
        "updated_at": now,
    }

    # Check for duplicate JDs (same title)
    existing_pk = _check_duplicate(jd.get("title"), pk)
    if existing_pk:
        item["possible_duplicate_of"] = existing_pk

    table.put_item(Item=_to_decimal(item))

    _populate_lookup_tables(jd)
    _write_audit_entry(pk, "CREATE", now, jd.get("title"))

    return {
        "status": "ok",
        "step": "persist",
        "pk": pk,
        "updated_at": now,
    }
