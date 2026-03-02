import os
from datetime import datetime, timezone
from decimal import Decimal

import boto3

TABLE_NAME = os.environ["TALENT_PROFILES_TABLE"]
SKILLS_LOOKUP_TABLE = os.environ.get("SKILLS_LOOKUP_TABLE", "")
CERTIFICATIONS_LOOKUP_TABLE = os.environ.get("CERTIFICATIONS_LOOKUP_TABLE", "")
CITIES_LOOKUP_TABLE = os.environ.get("CITIES_LOOKUP_TABLE", "")

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(TABLE_NAME)

_TALENT_BUCKETS = {
    "IT Resources",
    "Accounting and Finance Resources",
    "HR Resources",
    "Business Development/Sales Resources"
}
_TALENT_CATEGORIES = {
    "Accounting", "Finance", "Data Analysis", "Forensics",
    "Developer", "Network Engineer", "Database Analyst", "Cloud Expert", "Project Manager",
    "HR",
    "Business Development", "Sales"
}
_CANDIDATE_STATUSES = {
    "Potential Candidate",
    "Active Candidate",
    "Placed Candidate",
    "Stale Candidate",
    "Do Not Contact"
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
        "talent_bucket",
        "talent_category",
        "skillsets",
        "years_of_experience",
        "clearance_level",
        "certifications",
        "companies",
        "location",
        "bill_rate",
    }
    # Allow is_resume field from llm_extract (used by Step Function choice)
    allowed = required | {"is_resume"}
    _require_keys(profile, required, allowed, "extracted")

    _validate_string(profile["name"], "name", min_len=1)
    _validate_string(profile["summary"], "summary", min_len=1)
    
    bucket = profile["talent_bucket"]
    if bucket is not None and bucket not in _TALENT_BUCKETS:
        raise ValueError(f"talent_bucket invalid: {bucket}")
    
    category = profile["talent_category"]
    if category is not None and category not in _TALENT_CATEGORIES:
        raise ValueError(f"talent_category invalid: {category}")
    
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
    
    bill_rate = profile["bill_rate"]
    if bill_rate is not None and not _is_number(bill_rate):
        raise ValueError("bill_rate must be a number or null")


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
    """Populate lookup tables with skills, certifications, and cities for dropdown menus."""
    now = datetime.now(timezone.utc).isoformat()
    
    # Populate skills lookup
    if SKILLS_LOOKUP_TABLE and profile["skillsets"]:
        skills_table = dynamodb.Table(SKILLS_LOOKUP_TABLE)
        for skill in profile["skillsets"]:
            skill_name = skill["name"].strip()
            if skill_name:
                skills_table.put_item(Item={
                    "skill": skill_name,
                    "updated_at": now
                })
    
    # Populate certifications lookup
    if CERTIFICATIONS_LOOKUP_TABLE and profile["certifications"]:
        certs_table = dynamodb.Table(CERTIFICATIONS_LOOKUP_TABLE)
        for cert in profile["certifications"]:
            cert_name = cert.strip()
            if cert_name:
                certs_table.put_item(Item={
                    "certification": cert_name,
                    "updated_at": now
                })
    
    # Populate cities lookup
    if CITIES_LOOKUP_TABLE and profile["location"]:
        city = profile["location"].get("city")
        state = profile["location"].get("state")
        if city and city.strip() and state and state.strip():
            cities_table = dynamodb.Table(CITIES_LOOKUP_TABLE)
            cities_table.put_item(Item={
                "city": city.strip(),
                "state": state.strip(),
                "updated_at": now
            })


def handler(event, context):
    profile = event.get("extracted")
    if profile is None:
        raise ValueError("Missing extracted profile in event")

    _validate_profile(profile)

    bucket = event.get("bucket")
    key = event.get("key")
    if not bucket or not key:
        raise ValueError("Missing bucket or key in event")

    pk = f"{bucket}#{key}"
    now = datetime.now(timezone.utc).isoformat()
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # Denormalized fields for GSI queries and filtering
    # GSI keys cannot be NULL, so use placeholder values
    name_lower = profile["name"].lower() if profile["name"] else "unknown"
    location_state = profile["location"]["state"] if profile["location"] and profile["location"].get("state") else "Unknown"
    skill_names = ",".join(s["name"] for s in profile["skillsets"]) if profile["skillsets"] else ""
    cert_names = ",".join(profile["certifications"]) if profile["certifications"] else ""
    
    # GSI key fields - use "None" placeholder for null values
    clearance_level = profile["clearance_level"] if profile["clearance_level"] else "None"
    talent_bucket = profile["talent_bucket"] if profile["talent_bucket"] else "Unclassified"
    talent_category = profile["talent_category"] if profile["talent_category"] else "Unclassified"

    item = {
        "pk": pk,
        "bucket": bucket,
        "key": key,
        "name": profile["name"],
        "name_lower": name_lower,
        "contact": profile["contact"],
        "summary": profile["summary"],
        "talent_bucket": talent_bucket,
        "talent_category": talent_category,
        "skillsets": profile["skillsets"],
        "skill_names": skill_names,
        "years_of_experience": profile["years_of_experience"],
        "clearance_level": clearance_level,
        "certifications": profile["certifications"],
        "cert_names": cert_names,
        "companies": profile["companies"],
        "location": profile["location"],
        "location_state": location_state,
        "bill_rate": profile["bill_rate"],
        "status": "Potential Candidate",
        "date_received": today,
        "updated_at": now,
    }

    table.put_item(Item=_to_decimal(item))

    # Populate lookup tables for dropdown menus
    _populate_lookup_tables(profile)

    return {
        "status": "ok",
        "step": "persist",
        "pk": pk,
        "updated_at": now,
    }
