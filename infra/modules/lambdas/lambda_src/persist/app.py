import os
import json
from datetime import datetime, timezone

import boto3

DB_CLUSTER_ARN = os.environ["DB_CLUSTER_ARN"]
DB_SECRET_ARN = os.environ["DB_SECRET_ARN"]
DB_NAME = os.environ["DB_NAME"]

rds_data = boto3.client("rds-data")

_TABLE_READY = False

_RATE_UNITS = {"hour", "day", "year", "project", "unknown"}
_RATE_CURRENCIES = {"USD", "unknown"}
_TALENT_CATEGORIES = {"IT Resources", "Accounting and Finance Resources"}


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


def _validate_rates(rates):
    if not isinstance(rates, dict):
        raise ValueError("rates must be an object")
    required = {"amount", "unit", "currency", "evidence"}
    _require_keys(rates, required, required, "rates")

    amount = rates["amount"]
    if amount is not None and not _is_number(amount):
        raise ValueError("rates.amount must be a number or null")

    unit = rates["unit"]
    if unit not in _RATE_UNITS:
        raise ValueError("rates.unit invalid")

    currency = rates["currency"]
    if currency not in _RATE_CURRENCIES:
        raise ValueError("rates.currency invalid")

    evidence = rates["evidence"]
    if not isinstance(evidence, list):
        raise ValueError("rates.evidence must be list of strings")
    for j, snippet in enumerate(evidence):
        _validate_string(snippet, f"rates.evidence[{j}]", allow_null=False)


def _validate_profile(profile):
    if not isinstance(profile, dict):
        raise ValueError("extracted must be an object")

    required = {
        "name",
        "contact",
        "summary",
        "talent_category",
        "skillsets",
        "years_of_experience",
        "companies",
        "location",
        "rates",
    }
    _require_keys(profile, required, required, "extracted")

    _validate_string(profile["name"], "name", min_len=1)
    _validate_string(profile["summary"], "summary", min_len=1, max_len=300)
    category = profile["talent_category"]
    if category not in _TALENT_CATEGORIES:
        raise ValueError("talent_category invalid")
    _validate_contact(profile["contact"])

    years = profile["years_of_experience"]
    if years is not None and not _is_number(years):
        raise ValueError("years_of_experience must be a number or null")

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
    _validate_rates(profile["rates"])


def _param(name, value):
    if value is None:
        return {"name": name, "value": {"isNull": True}}
    if isinstance(value, bool):
        return {"name": name, "value": {"booleanValue": value}}
    if isinstance(value, int):
        return {"name": name, "value": {"longValue": value}}
    if isinstance(value, float):
        return {"name": name, "value": {"doubleValue": value}}
    return {"name": name, "value": {"stringValue": str(value)}}


def _execute(sql, parameters=None):
    kwargs = {
        "resourceArn": DB_CLUSTER_ARN,
        "secretArn": DB_SECRET_ARN,
        "database": DB_NAME,
        "sql": sql,
    }
    if parameters:
        kwargs["parameters"] = parameters
    return rds_data.execute_statement(**kwargs)


def _ensure_table():
    global _TABLE_READY
    if _TABLE_READY:
        return

    create_sql = """
    CREATE TABLE IF NOT EXISTS talent_profiles (
      pk TEXT PRIMARY KEY,
      bucket TEXT NOT NULL,
      key TEXT NOT NULL,
      name TEXT,
      contact JSONB,
      summary TEXT,
      talent_category TEXT,
      skillsets JSONB,
      years_of_experience NUMERIC,
      companies JSONB,
      location JSONB,
      rates JSONB,
      updated_at TIMESTAMPTZ NOT NULL
    );
    """

    _execute(create_sql)

    index_sql = [
        "CREATE INDEX IF NOT EXISTS idx_talent_category ON talent_profiles (talent_category)",
        "CREATE INDEX IF NOT EXISTS idx_years_experience ON talent_profiles (years_of_experience)",
        "CREATE INDEX IF NOT EXISTS idx_location_state ON talent_profiles ((location->>'state'))",
        "CREATE INDEX IF NOT EXISTS idx_skillsets_gin ON talent_profiles USING GIN (skillsets jsonb_path_ops)",
    ]
    for stmt in index_sql:
        _execute(stmt)

    _TABLE_READY = True


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

    _ensure_table()

    params = [
        _param("pk", pk),
        _param("bucket", bucket),
        _param("key", key),
        _param("name", profile["name"]),
        _param("contact", json.dumps(profile["contact"])),
        _param("summary", profile["summary"]),
        _param("talent_category", profile["talent_category"]),
        _param("skillsets", json.dumps(profile["skillsets"])),
        _param("years_of_experience", profile["years_of_experience"]),
        _param("companies", json.dumps(profile["companies"])),
        _param("location", json.dumps(profile["location"])),
        _param("rates", json.dumps(profile["rates"])),
        _param("updated_at", now),
    ]

    upsert_sql = """
    INSERT INTO talent_profiles (
        pk, bucket, key, name, contact, summary, talent_category,
        skillsets, years_of_experience, companies, location, rates, updated_at
    ) VALUES (
        :pk, :bucket, :key, :name, CAST(:contact AS jsonb), :summary, :talent_category,
        CAST(:skillsets AS jsonb), :years_of_experience, CAST(:companies AS jsonb),
        CAST(:location AS jsonb), CAST(:rates AS jsonb), :updated_at
    )
    ON CONFLICT (pk) DO UPDATE SET
        bucket = EXCLUDED.bucket,
        key = EXCLUDED.key,
        name = EXCLUDED.name,
        contact = EXCLUDED.contact,
        summary = EXCLUDED.summary,
        talent_category = EXCLUDED.talent_category,
        skillsets = EXCLUDED.skillsets,
        years_of_experience = EXCLUDED.years_of_experience,
        companies = EXCLUDED.companies,
        location = EXCLUDED.location,
        rates = EXCLUDED.rates,
        updated_at = EXCLUDED.updated_at;
    """

    _execute(upsert_sql, params)

    return {
        "status": "ok",
        "step": "persist",
        "pk": pk,
        "updated_at": now,
    }
