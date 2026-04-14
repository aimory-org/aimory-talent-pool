"""
Update a talent profile's editable fields.
Supports: status, requested_salary, name, contact, summary, service_category,
          industry_category, job_title, clearance_level, skillsets, certifications,
          companies, location, years_of_experience, notes, tags
"""

import json
import os
from datetime import datetime, timezone
from decimal import Decimal

import boto3

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(os.environ["TALENT_PROFILES_TABLE"])
AUDIT_LOG_TABLE = os.environ.get("AUDIT_LOG_TABLE", "")

# Lookup tables for populating filter dropdowns when recruiters add new values
SKILLS_LOOKUP_TABLE = os.environ.get("SKILLS_LOOKUP_TABLE", "")
CERTIFICATIONS_LOOKUP_TABLE = os.environ.get("CERTIFICATIONS_LOOKUP_TABLE", "")
CITIES_LOOKUP_TABLE = os.environ.get("CITIES_LOOKUP_TABLE", "")
JOB_TITLES_LOOKUP_TABLE = os.environ.get("JOB_TITLES_LOOKUP_TABLE", "")
INDUSTRY_CATEGORIES_LOOKUP_TABLE = os.environ.get("INDUSTRY_CATEGORIES_LOOKUP_TABLE", "")
TAGS_LOOKUP_TABLE = os.environ.get("TAGS_LOOKUP_TABLE", "")

VALID_STATUSES = {
    "Active Candidate",
    "Do Not Contact",
    "Placed Candidate",
    "Potential Candidate",
    "Stale Candidate",
}

VALID_SERVICE_CATEGORIES = {
    "IT",
    "Accounting",
    "FSP Headhunting",
    "Cybersecurity",
    "Unknown",
}

VALID_CLEARANCES = {
    "None",
    "Secret",
    "TS",
    "TS/SCI",
    "TS/SCI/FSP",
    "TS/SCI/CI",
    "Yankee White",
}

# State abbreviation mappings
STATE_ABBREVIATIONS = {
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
    "district of columbia": "DC",
}


def _normalize_state(state: str) -> str:
    """Normalize state to 2-letter abbreviation."""
    if not state:
        return state
    state = state.strip()
    if len(state) == 2:
        return state.upper()
    return STATE_ABBREVIATIONS.get(state.lower(), state.upper())


def _normalize_city(city: str) -> str:
    """Normalize city to title case."""
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


def _normalize_skill(skill: str) -> str:
    """Normalize skill name - title case but preserve common acronyms."""
    if not skill:
        return skill
    skill = skill.strip()
    acronyms = {
        "AWS",
        "GCP",
        "API",
        "REST",
        "SQL",
        "NoSQL",
        "HTML",
        "CSS",
        "JSON",
        "XML",
        "CI/CD",
        "DevOps",
        "AI",
        "ML",
        "NLP",
        "ETL",
        "SaaS",
        "PaaS",
        "IaaS",
        "IAM",
        "VPN",
        "DNS",
        "TCP",
        "UDP",
        "HTTP",
        "HTTPS",
        "SSH",
        "SSL",
        "TLS",
        "OAuth",
        "JWT",
        "LDAP",
        "AD",
        "SSO",
        "MFA",
        "SIEM",
        "SOC",
        "NIST",
        "ISO",
        "PCI",
        "HIPAA",
        "SOX",
        "GDPR",
        "FedRAMP",
        "FISMA",
        "RMF",
        "SCRUM",
        "SAFe",
        "PMI",
        "ITIL",
        "COBIT",
        "TOGAF",
        "UML",
        "OOP",
        "TDD",
        "BDD",
        "DDD",
        "UI",
        "UX",
    }
    if skill.upper() in acronyms:
        return skill.upper()
    return skill.title()


def _normalize_company(company: str) -> str:
    """Normalize company name to title case."""
    if not company:
        return company
    return company.strip().title()


def _decimal_converter(obj):
    """Convert Decimal to float for JSON serialization."""
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")


def _iso_now():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _extract_actor(event):
    claims = (((event or {}).get("requestContext") or {}).get("authorizer") or {}).get("jwt", {}).get("claims", {})
    email = claims.get("email") or claims.get("preferred_username") or claims.get("cognito:username")
    name = claims.get("name")

    if not name:
        given = claims.get("given_name")
        family = claims.get("family_name")
        if given and family:
            name = f"{given} {family}"
        elif given:
            name = given

    return email or "unknown@user", name


def _write_audit_entry(
    pk,
    action,
    timestamp,
    user_email,
    user_name=None,
    changes=None,
    snapshot=None,
    candidate_name=None,
):
    if not AUDIT_LOG_TABLE:
        return

    item = {
        "pk": pk,
        "sk": f"{timestamp}#{action}",
        "action": action,
        "timestamp": timestamp,
        "user_email": user_email,
    }
    if user_name:
        item["user_name"] = user_name
    if candidate_name:
        item["candidate_name"] = candidate_name
    if changes:
        item["changes"] = changes
    if snapshot is not None:
        item["snapshot"] = snapshot

    try:
        dynamodb.Table(AUDIT_LOG_TABLE).put_item(Item=item)
    except Exception as exc:
        print(f"Warning: failed to write audit entry for {pk}: {exc}")


def _populate_lookups(body):
    """Populate lookup tables with any new values from the update."""
    now = datetime.now(timezone.utc).isoformat()
    try:
        if SKILLS_LOOKUP_TABLE and "skillsets" in body:
            skills_table = dynamodb.Table(SKILLS_LOOKUP_TABLE)
            for skill in body["skillsets"]:
                name = skill.get("name", "").strip()
                if name:
                    skills_table.put_item(Item={"skill": name, "updated_at": now})

        if CERTIFICATIONS_LOOKUP_TABLE and "certifications" in body:
            certs_table = dynamodb.Table(CERTIFICATIONS_LOOKUP_TABLE)
            for cert in body["certifications"]:
                cert = cert.strip() if cert else ""
                if cert:
                    certs_table.put_item(Item={"certification": cert, "updated_at": now})

        if CITIES_LOOKUP_TABLE and "location" in body:
            loc = body["location"]
            city = loc.get("city", "").strip() if loc.get("city") else ""
            state = loc.get("state", "").strip() if loc.get("state") else ""
            if city and state:
                cities_table = dynamodb.Table(CITIES_LOOKUP_TABLE)
                cities_table.put_item(Item={"city": city, "state": state, "updated_at": now})

        if JOB_TITLES_LOOKUP_TABLE and "job_title" in body:
            title = body["job_title"].strip() if body["job_title"] else ""
            if title and title != "Unknown":
                titles_table = dynamodb.Table(JOB_TITLES_LOOKUP_TABLE)
                titles_table.put_item(Item={"job_title": title, "updated_at": now})

        if INDUSTRY_CATEGORIES_LOOKUP_TABLE and "industry_category" in body:
            industry = body["industry_category"].strip() if body["industry_category"] else ""
            if industry and industry != "Unknown":
                industries_table = dynamodb.Table(INDUSTRY_CATEGORIES_LOOKUP_TABLE)
                industries_table.put_item(Item={"industry_category": industry, "updated_at": now})

        if TAGS_LOOKUP_TABLE and "tags" in body:
            tags_table = dynamodb.Table(TAGS_LOOKUP_TABLE)
            for tag in body["tags"]:
                tag = tag.strip() if tag else ""
                if tag:
                    tags_table.put_item(Item={"tag": tag, "updated_at": now})
    except Exception as e:
        # Don't fail the update over lookup population
        print(f"Warning: failed to populate lookups: {e}")


def handler(event, context):
    try:
        query_params = event.get("queryStringParameters") or {}
        pk = query_params.get("pk")

        if not pk:
            return {
                "statusCode": 400,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": "Missing pk query parameter"}),
            }

        body = json.loads(event.get("body", "{}"))

        original_item = table.get_item(Key={"pk": pk}).get("Item")
        if not original_item:
            return {
                "statusCode": 404,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": "Talent profile not found"}),
            }

        update_parts = []
        expression_names = {}
        expression_values = {}

        # Handle status update
        if "status" in body:
            new_status = body["status"]
            if new_status not in VALID_STATUSES:
                return {
                    "statusCode": 400,
                    "headers": {"Content-Type": "application/json"},
                    "body": json.dumps({"error": f"Invalid status. Must be one of: {VALID_STATUSES}"}),
                }
            update_parts.append("#status = :status")
            expression_names["#status"] = "status"
            expression_values[":status"] = new_status

        # Handle requested_salary update
        if "requested_salary" in body:
            salary = body["requested_salary"]
            if salary is not None:
                try:
                    salary = Decimal(str(salary))
                    if salary < 0:
                        raise ValueError("Requested salary cannot be negative")
                except (ValueError, TypeError) as e:
                    return {
                        "statusCode": 400,
                        "headers": {"Content-Type": "application/json"},
                        "body": json.dumps({"error": f"Invalid requested_salary: {e}"}),
                    }
            update_parts.append("requested_salary = :requested_salary")
            expression_values[":requested_salary"] = salary

        # Handle name update
        if "name" in body:
            normalized_name = _normalize_name(body["name"])
            update_parts.append("#name = :name")
            expression_names["#name"] = "name"
            expression_values[":name"] = normalized_name

        # Handle contact update
        if "contact" in body:
            contact = body["contact"]
            if contact.get("email"):
                contact["email"] = _normalize_email(contact["email"])
            if contact.get("phone"):
                contact["phone"] = _normalize_phone(contact["phone"])
            update_parts.append("contact = :contact")
            expression_values[":contact"] = contact

        # Handle summary update
        if "summary" in body:
            update_parts.append("summary = :summary")
            expression_values[":summary"] = body["summary"].strip() if body["summary"] else ""

        # Handle service_category update
        if "service_category" in body:
            svc = body["service_category"]
            if svc not in VALID_SERVICE_CATEGORIES:
                return {
                    "statusCode": 400,
                    "headers": {"Content-Type": "application/json"},
                    "body": json.dumps(
                        {"error": f"Invalid service_category. Must be one of: {sorted(VALID_SERVICE_CATEGORIES)}"}
                    ),
                }
            update_parts.append("service_category = :service_category")
            expression_values[":service_category"] = svc

        # Handle industry_category update (free-text, AI-detected)
        if "industry_category" in body:
            category = body["industry_category"].strip() if body["industry_category"] else "Unknown"
            update_parts.append("industry_category = :industry_category")
            expression_values[":industry_category"] = category

        # Handle job_title update (free-text, AI-detected)
        if "job_title" in body:
            title = body["job_title"].strip() if body["job_title"] else "Unknown"
            update_parts.append("job_title = :job_title")
            expression_values[":job_title"] = title

        # Handle clearance_level update
        if "clearance_level" in body:
            clearance = body["clearance_level"]
            if clearance not in VALID_CLEARANCES:
                return {
                    "statusCode": 400,
                    "headers": {"Content-Type": "application/json"},
                    "body": json.dumps({"error": f"Invalid clearance_level. Must be one of: {VALID_CLEARANCES}"}),
                }
            update_parts.append("clearance_level = :clearance_level")
            expression_values[":clearance_level"] = clearance

        # Handle skillsets update
        if "skillsets" in body:
            skillsets = body["skillsets"]
            for skill in skillsets:
                if skill.get("name"):
                    skill["name"] = _normalize_skill(skill["name"])
                if skill.get("years") is not None:
                    skill["years"] = Decimal(str(skill["years"]))
            update_parts.append("skillsets = :skillsets")
            expression_values[":skillsets"] = skillsets

        # Handle certifications update
        if "certifications" in body:
            certs = [c.strip() for c in body["certifications"] if c and c.strip()]
            update_parts.append("certifications = :certifications")
            expression_values[":certifications"] = certs

        # Handle companies update
        if "companies" in body:
            companies = body["companies"]
            for company in companies:
                if company.get("name"):
                    company["name"] = _normalize_company(company["name"])
            update_parts.append("companies = :companies")
            expression_values[":companies"] = companies

        # Handle location update
        if "location" in body:
            location = body["location"]
            if location.get("city"):
                location["city"] = _normalize_city(location["city"])
            if location.get("state"):
                location["state"] = _normalize_state(location["state"])
            update_parts.append("#location = :location")
            expression_names["#location"] = "location"
            expression_values[":location"] = location

        # Handle years_of_experience update
        if "years_of_experience" in body:
            yoe = body["years_of_experience"]
            if yoe is not None:
                try:
                    yoe = int(yoe)
                    if yoe < 0:
                        raise ValueError("Years of experience cannot be negative")
                except (ValueError, TypeError) as e:
                    return {
                        "statusCode": 400,
                        "headers": {"Content-Type": "application/json"},
                        "body": json.dumps({"error": f"Invalid years_of_experience: {e}"}),
                    }
            update_parts.append("years_of_experience = :yoe")
            expression_values[":yoe"] = yoe

        # Handle notes update
        if "notes" in body:
            update_parts.append("notes = :notes")
            expression_values[":notes"] = body["notes"].strip() if body["notes"] else ""

        # Handle tags update
        if "tags" in body:
            tags = [t.strip() for t in body["tags"] if t and t.strip()]
            update_parts.append("tags = :tags")
            expression_values[":tags"] = tags

        if not update_parts:
            return {
                "statusCode": 400,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps(
                    {
                        "error": (
                            "No valid fields to update. Supported: status, requested_salary, name, "
                            "contact, summary, service_category, industry_category, job_title, "
                            "clearance_level, skillsets, certifications, companies, location, "
                            "years_of_experience, notes, tags"
                        )
                    }
                ),
            }

        # Add updated_at timestamp
        now = _iso_now()
        update_parts.append("updated_at = :updated_at")
        expression_values[":updated_at"] = now

        update_expression = "SET " + ", ".join(update_parts)

        update_kwargs = {
            "Key": {"pk": pk},
            "UpdateExpression": update_expression,
            "ExpressionAttributeValues": expression_values,
            "ConditionExpression": "attribute_exists(pk)",
            "ReturnValues": "ALL_NEW",
        }

        if expression_names:
            update_kwargs["ExpressionAttributeNames"] = expression_names

        response = table.update_item(**update_kwargs)
        updated_item = response.get("Attributes", {})

        # Populate lookup tables so new values appear in filter dropdowns
        _populate_lookups(body)

        changes = {}
        for field in body:
            old_value = original_item.get(field)
            new_value = updated_item.get(field)
            if old_value != new_value:
                changes[field] = {"old": old_value, "new": new_value}

        if changes:
            actor_email, actor_name = _extract_actor(event)
            action = "STATUS_CHANGE" if set(changes.keys()) == {"status"} else "UPDATE"
            _write_audit_entry(
                pk=pk,
                action=action,
                timestamp=now,
                user_email=actor_email,
                user_name=actor_name,
                changes=changes,
                candidate_name=updated_item.get("name") or original_item.get("name"),
            )

        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps(
                {
                    "message": "Talent profile updated successfully",
                    "pk": pk,
                    "updated_at": now,
                    "profile": updated_item,
                },
                default=_decimal_converter,
            ),
        }

    except dynamodb.meta.client.exceptions.ConditionalCheckFailedException:
        return {
            "statusCode": 404,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": "Talent profile not found"}),
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
