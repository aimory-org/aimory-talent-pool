import os
from datetime import datetime, timezone
from decimal import Decimal

import boto3

TABLE_NAME = os.environ["TALENT_PROFILES_TABLE"]
AUDIT_LOG_TABLE = os.environ.get("AUDIT_LOG_TABLE", "")
SKILLS_LOOKUP_TABLE = os.environ.get("SKILLS_LOOKUP_TABLE", "")
CERTIFICATIONS_LOOKUP_TABLE = os.environ.get("CERTIFICATIONS_LOOKUP_TABLE", "")
CITIES_LOOKUP_TABLE = os.environ.get("CITIES_LOOKUP_TABLE", "")
JOB_TITLES_LOOKUP_TABLE = os.environ.get("JOB_TITLES_LOOKUP_TABLE", "")
INDUSTRY_CATEGORIES_LOOKUP_TABLE = os.environ.get("INDUSTRY_CATEGORIES_LOOKUP_TABLE", "")

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(TABLE_NAME)

# State name to abbreviation mapping
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


def _normalize_state(state: str) -> str:
    """Normalize state to 2-letter abbreviation (e.g., 'Virginia' -> 'VA', 'va' -> 'VA')."""
    if not state:
        return state
    state_clean = state.strip()
    state_upper = state_clean.upper()
    # Already a valid abbreviation
    if state_upper in _VALID_ABBREVS:
        return state_upper
    # Look up by full name
    abbrev = _STATE_ABBREVS.get(state_clean.lower())
    return abbrev if abbrev else state_clean


def _normalize_city(city: str) -> str:
    """Normalize city to title case (e.g., 'HERNDON' -> 'Herndon', 'herndon' -> 'Herndon')."""
    if not city:
        return city
    return city.strip().title()


def _normalize_name(name: str) -> str:
    """Normalize name to title case."""
    if not name:
        return name
    return name.strip().title()


def _normalize_email(email: str) -> str:
    """Normalize email to lowercase."""
    if not email:
        return email
    return email.strip().lower()


def _normalize_phone(phone: str) -> str:
    """Normalize phone to (XXX) XXX-XXXX format."""
    if not phone:
        return phone
    # Extract only digits
    digits = "".join(c for c in phone if c.isdigit())
    # Handle US numbers with country code
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    # Format as (XXX) XXX-XXXX if we have 10 digits
    if len(digits) == 10:
        return f"({digits[:3]}) {digits[3:6]}-{digits[6:]}"
    # Return cleaned version for other formats
    return phone.strip()


def _normalize_company(company: str) -> str:
    """Normalize company name to title case, preserving common suffixes."""
    if not company:
        return company
    return company.strip().title()


def _normalize_profile(profile: dict) -> dict:
    """Apply all normalizations to a profile before persisting."""
    # Normalize name
    if profile.get("name"):
        profile["name"] = _normalize_name(profile["name"])

    # Normalize contact info
    if profile.get("contact"):
        if profile["contact"].get("email"):
            profile["contact"]["email"] = _normalize_email(profile["contact"]["email"])
        if profile["contact"].get("phone"):
            profile["contact"]["phone"] = _normalize_phone(profile["contact"]["phone"])

    # Normalize location
    if profile.get("location"):
        if profile["location"].get("city"):
            profile["location"]["city"] = _normalize_city(profile["location"]["city"])
        if profile["location"].get("state"):
            profile["location"]["state"] = _normalize_state(profile["location"]["state"])

    # Deduplicate skills (LLM canonicalizes via prompt; persist just deduplicates)
    if profile.get("skillsets"):
        seen = {}
        deduped = []
        for skill in profile["skillsets"]:
            if skill.get("name"):
                skill["name"] = skill["name"].strip()
                key = skill["name"].lower()
                if key not in seen:
                    seen[key] = True
                    deduped.append(skill)
        profile["skillsets"] = deduped

    # Deduplicate certifications
    if profile.get("certifications"):
        seen = {}
        deduped = []
        for cert in profile["certifications"]:
            stripped = cert.strip() if cert else ""
            if stripped:
                key = stripped.lower()
                if key not in seen:
                    seen[key] = True
                    deduped.append(stripped)
        profile["certifications"] = deduped

    # Normalize companies
    if profile.get("companies"):
        for company in profile["companies"]:
            if company.get("name"):
                company["name"] = _normalize_company(company["name"])

    # Strip job title and industry category
    if profile.get("job_title"):
        profile["job_title"] = profile["job_title"].strip()
    if profile.get("industry_category"):
        profile["industry_category"] = profile["industry_category"].strip()

    return profile


_SERVICE_CATEGORIES = {
    "IT",
    "Accounting",
    "FSP Headhunting",
    "Cybersecurity",
}
_CANDIDATE_STATUSES = {
    "Potential Candidate",
    "Active Candidate",
    "Placed Candidate",
    "Stale Candidate",
    "Do Not Contact",
}


def _is_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _require_keys(obj, required, allowed, context):
    missing = required - obj.keys()
    if missing:
        raise ValueError(f"{context} missing required keys: {sorted(missing)}")
    extra = obj.keys() - allowed
    if extra:
        raise ValueError(f"{context} has unexpected keys: {sorted(extra)}")


def _validate_string(value, context, min_len=None, max_len=None, allow_null=True):
    if value is None:
        if allow_null:
            return
        raise ValueError(f"{context} cannot be null")
    if not isinstance(value, str):
        raise ValueError(f"{context} must be a string")
    if min_len is not None and len(value) < min_len:
        raise ValueError(f"{context} must be at least {min_len} chars")
    if max_len is not None and len(value) > max_len:
        raise ValueError(f"{context} must be at most {max_len} chars")


def _validate_contact(contact):
    if not isinstance(contact, dict):
        raise ValueError("contact must be an object")
    required = {"email", "phone", "linkedin", "github"}
    _require_keys(contact, required, required, "contact")
    _validate_string(contact["email"], "contact.email", min_len=3)
    _validate_string(contact["phone"], "contact.phone", min_len=7)
    _validate_string(contact["linkedin"], "contact.linkedin")
    _validate_string(contact["github"], "contact.github")


def _validate_skillset(skill, index):
    if not isinstance(skill, dict):
        raise ValueError(f"skillsets[{index}] must be an object")
    required = {"name", "evidence"}
    _require_keys(skill, required, required, f"skillsets[{index}]")
    _validate_string(skill["name"], f"skillsets[{index}].name", min_len=1, allow_null=False)
    evidence = skill["evidence"]
    if not isinstance(evidence, list) or len(evidence) < 1:
        raise ValueError(f"skillsets[{index}].evidence must be list of 1+ strings")
    for j, snippet in enumerate(evidence):
        _validate_string(snippet, f"skillsets[{index}].evidence[{j}]", min_len=1, allow_null=False)


def _validate_company(company, index):
    if not isinstance(company, dict):
        raise ValueError(f"companies[{index}] must be an object")
    required = {"name", "evidence"}
    _require_keys(company, required, required, f"companies[{index}]")
    _validate_string(company["name"], f"companies[{index}].name", min_len=1, allow_null=False)
    evidence = company["evidence"]
    if not isinstance(evidence, list) or len(evidence) < 1:
        raise ValueError(f"companies[{index}].evidence must be list of 1+ strings")
    for j, snippet in enumerate(evidence):
        _validate_string(snippet, f"companies[{index}].evidence[{j}]", min_len=1, allow_null=False)


def _validate_location(location):
    if not isinstance(location, dict):
        raise ValueError("location must be an object")
    required = {"city", "state"}
    _require_keys(location, required, required, "location")
    _validate_string(location["city"], "location.city")
    _validate_string(location["state"], "location.state")


def _validate_certifications(certifications):
    if not isinstance(certifications, list):
        raise ValueError("certifications must be a list")
    for i, cert in enumerate(certifications):
        _validate_string(cert, f"certifications[{i}]", min_len=1, allow_null=False)


def _validate_profile(profile):
    if not isinstance(profile, dict):
        raise ValueError("extracted must be an object")

    required = {
        "name",
        "contact",
        "summary",
        "service_category",
        "industry_category",
        "job_title",
        "skillsets",
        "years_of_experience",
        "clearance_level",
        "certifications",
        "companies",
        "location",
        "requested_salary",
    }
    # Allow is_valid field from llm_extract (used by Step Function choice)
    allowed = required | {"is_valid"}
    _require_keys(profile, required, allowed, "extracted")

    _validate_string(profile["name"], "name", min_len=1)
    _validate_string(profile["summary"], "summary", min_len=1)

    svc = profile["service_category"]
    if svc is not None and svc not in _SERVICE_CATEGORIES:
        raise ValueError(f"service_category invalid: {svc}")

    _validate_string(profile["industry_category"], "industry_category")
    _validate_string(profile["job_title"], "job_title")

    _validate_contact(profile["contact"])

    years = profile["years_of_experience"]
    if years is not None and not _is_number(years):
        raise ValueError("years_of_experience must be a number or null")

    _validate_string(profile["clearance_level"], "clearance_level")
    _validate_certifications(profile["certifications"])

    skillsets = profile["skillsets"]
    if not isinstance(skillsets, list):
        raise ValueError("skillsets must be a list")
    for i, skill in enumerate(skillsets):
        _validate_skillset(skill, i)

    companies = profile["companies"]
    if not isinstance(companies, list):
        raise ValueError("companies must be a list")
    for i, company in enumerate(companies):
        _validate_company(company, i)

    _validate_location(profile["location"])

    salary = profile["requested_salary"]
    if salary is not None and not _is_number(salary):
        raise ValueError("requested_salary must be a number or null")


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


def _populate_lookup_tables(profile):
    """Populate lookup tables with skills, certifications, cities, and job titles for dropdown menus."""
    now = datetime.now(timezone.utc).isoformat()

    # Populate skills lookup
    if SKILLS_LOOKUP_TABLE and profile.get("skillsets"):
        skills_table = dynamodb.Table(SKILLS_LOOKUP_TABLE)
        for skill in profile["skillsets"]:
            skill_name = skill.get("name", "").strip()
            if skill_name:
                skills_table.put_item(Item={"skill": skill_name, "updated_at": now})

    # Populate certifications lookup
    if CERTIFICATIONS_LOOKUP_TABLE and profile.get("certifications"):
        certs_table = dynamodb.Table(CERTIFICATIONS_LOOKUP_TABLE)
        for cert in profile["certifications"]:
            cert_name = cert.strip() if cert else ""
            if cert_name:
                certs_table.put_item(Item={"certification": cert_name, "updated_at": now})

    # Populate cities lookup
    if CITIES_LOOKUP_TABLE and profile.get("location"):
        city = profile["location"].get("city", "")
        state = profile["location"].get("state", "")
        if city and state:
            cities_table = dynamodb.Table(CITIES_LOOKUP_TABLE)
            cities_table.put_item(Item={"city": city, "state": state, "updated_at": now})

    # Populate job titles lookup
    if JOB_TITLES_LOOKUP_TABLE and profile.get("job_title"):
        job_title = profile["job_title"].strip()
        if job_title:
            titles_table = dynamodb.Table(JOB_TITLES_LOOKUP_TABLE)
            titles_table.put_item(Item={"job_title": job_title, "updated_at": now})

    # Populate industry categories lookup
    if INDUSTRY_CATEGORIES_LOOKUP_TABLE and profile.get("industry_category"):
        industry = profile["industry_category"].strip()
        if industry:
            industries_table = dynamodb.Table(INDUSTRY_CATEGORIES_LOOKUP_TABLE)
            industries_table.put_item(Item={"industry_category": industry, "updated_at": now})


def _write_audit_entry(pk, action, timestamp, candidate_name=None):
    if not AUDIT_LOG_TABLE:
        return

    item = {
        "pk": pk,
        "sk": f"{timestamp}#{action}",
        "action": action,
        "timestamp": timestamp,
        "user_email": "pipeline@system",
        "user_name": "Pipeline",
    }
    if candidate_name:
        item["candidate_name"] = candidate_name

    try:
        dynamodb.Table(AUDIT_LOG_TABLE).put_item(Item=item)
    except Exception as exc:
        print(f"Warning: failed to write pipeline audit entry for {pk}: {exc}")


def _check_duplicate(name_lower, current_pk):
    """Check if a candidate with the same name already exists. Returns existing pk or None."""
    if not name_lower or name_lower == "unknown":
        return None
    try:
        kwargs = {
            "FilterExpression": "name_lower = :name AND pk <> :self",
            "ExpressionAttributeValues": {":name": name_lower, ":self": current_pk},
            "ProjectionExpression": "pk",
            "Limit": 1,
        }
        while True:
            response = table.scan(**kwargs)
            items = response.get("Items", [])
            if items:
                return items[0]["pk"]
            if "LastEvaluatedKey" not in response:
                return None
            kwargs["ExclusiveStartKey"] = response["LastEvaluatedKey"]
    except Exception:
        # Don't fail the pipeline over duplicate detection
        return None


def handler(event, context):
    profile = event.get("extracted")
    if profile is None:
        raise ValueError("Missing extracted profile in event")

    _validate_profile(profile)

    # Normalize profile data for consistency
    profile = _normalize_profile(profile)

    bucket = event.get("bucket")
    key = event.get("key")
    if not bucket or not key:
        raise ValueError("Missing bucket or key in event")

    pk = f"{bucket}#{key}"
    now = datetime.now(timezone.utc).isoformat()
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # Get resume text from the normalize step (for full-text search)
    resume_text = ""
    if event.get("normalized") and event["normalized"].get("text"):
        resume_text = event["normalized"]["text"]

    # Denormalized fields for filtering
    name_lower = profile["name"].lower() if profile["name"] else "unknown"
    location_state = (
        profile["location"]["state"] if profile["location"] and profile["location"].get("state") else "Unknown"
    )
    skill_names = ",".join(s["name"] for s in profile["skillsets"]) if profile["skillsets"] else ""
    cert_names = ",".join(profile["certifications"]) if profile["certifications"] else ""

    # Use "Unknown" for null classification fields (GSI keys can't be NULL)
    clearance_level = profile["clearance_level"] if profile["clearance_level"] else "None"
    service_category = profile["service_category"] if profile["service_category"] else "Unknown"
    industry_category = profile["industry_category"] if profile["industry_category"] else "Unknown"
    job_title = profile["job_title"] if profile["job_title"] else "Unknown"

    # Check for duplicate candidates (same name)
    existing_pk = _check_duplicate(name_lower, pk)

    # Preserve recruiter-curated fields if the record already exists
    existing = None
    existing_status = "Potential Candidate"
    existing_notes = ""
    existing_tags = []
    existing_date_received = today
    try:
        existing = table.get_item(
            Key={"pk": pk},
            ProjectionExpression="#s, notes, tags, date_received",
            ExpressionAttributeNames={"#s": "status"},
        ).get("Item")
        if existing:
            existing_status = existing.get("status", "Potential Candidate")
            existing_notes = existing.get("notes", "")
            existing_tags = existing.get("tags", [])
            existing_date_received = existing.get("date_received", today)
    except Exception:
        pass  # If lookup fails, use defaults

    item = {
        "pk": pk,
        "bucket": bucket,
        "key": key,
        "name": profile["name"],
        "name_lower": name_lower,
        "contact": profile["contact"],
        "summary": profile["summary"],
        "service_category": service_category,
        "industry_category": industry_category,
        "job_title": job_title,
        "skillsets": profile["skillsets"],
        "skill_names": skill_names,
        "years_of_experience": profile["years_of_experience"],
        "clearance_level": clearance_level,
        "certifications": profile["certifications"],
        "cert_names": cert_names,
        "companies": profile["companies"],
        "location": profile["location"],
        "location_state": location_state,
        "requested_salary": profile["requested_salary"],
        "resume_text": resume_text,
        "notes": existing_notes,
        "tags": existing_tags,
        "status": existing_status,
        "date_received": existing_date_received,
        "updated_at": now,
    }

    # If duplicate found, flag it but still create the new record
    if existing_pk:
        item["possible_duplicate_of"] = existing_pk

    table.put_item(Item=_to_decimal(item))

    # Populate lookup tables for dropdown menus
    _populate_lookup_tables(profile)

    _write_audit_entry(pk, "UPDATE" if existing else "CREATE", now, item.get("name"))

    return {
        "status": "ok",
        "step": "persist",
        "pk": pk,
        "updated_at": now,
        "possible_duplicate_of": existing_pk,
    }
