import os
from datetime import datetime, timezone
from decimal import Decimal

import boto3

TABLE_NAME = os.environ["TALENT_PROFILES_TABLE"]

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(TABLE_NAME)

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
    required = {"name", "category", "evidence"}
    _require_keys(skill, required, required, f"skillsets[{index}]")
    _validate_string(skill["name"], f"skillsets[{index}].name", min_len=1, allow_null=False)
    _validate_string(skill["category"], f"skillsets[{index}].category")
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
    _validate_string(profile["summary"], "summary", min_len=1)
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

    item = {
        "pk": pk,
        "bucket": bucket,
        "key": key,
        "name": profile["name"],
        "contact": profile["contact"],
        "summary": profile["summary"],
        "talent_category": profile["talent_category"],
        "skillsets": profile["skillsets"],
        "years_of_experience": profile["years_of_experience"],
        "companies": profile["companies"],
        "location": profile["location"],
        "rates": profile["rates"],
        "updated_at": now,
    }

    table.put_item(Item=_to_decimal(item))

    return {
        "status": "ok",
        "step": "persist",
        "pk": pk,
        "updated_at": now,
    }
