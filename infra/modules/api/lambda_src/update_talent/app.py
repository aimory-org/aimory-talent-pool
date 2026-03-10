"""
Update a talent profile's editable fields.
Supports: status, bill_rate, name, contact, summary, talent_bucket, talent_category,
          clearance_level, skillsets, certifications, companies, location, years_of_experience
"""
import json
import os
from datetime import datetime, timezone
from decimal import Decimal
import boto3

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(os.environ["TALENT_PROFILES_TABLE"])

VALID_STATUSES = {
    "Active Candidate",
    "Do Not Contact",
    "Placed Candidate",
    "Potential Candidate",
    "Stale Candidate",
}

VALID_BUCKETS = {
    "IT Resources",
    "Accounting and Finance Resources",
    "HR Resources",
    "Business Development/Sales Resources",
    "Unclassified",
}

VALID_CATEGORIES = {
    "Accounting",
    "Finance",
    "Data Analysis",
    "Forensics",
    "Developer",
    "Network Engineer",
    "Database Analyst",
    "Cloud Expert",
    "Project Manager",
    "HR",
    "Business Development",
    "Sales",
    "Unclassified",
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
    "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR",
    "california": "CA", "colorado": "CO", "connecticut": "CT", "delaware": "DE",
    "florida": "FL", "georgia": "GA", "hawaii": "HI", "idaho": "ID",
    "illinois": "IL", "indiana": "IN", "iowa": "IA", "kansas": "KS",
    "kentucky": "KY", "louisiana": "LA", "maine": "ME", "maryland": "MD",
    "massachusetts": "MA", "michigan": "MI", "minnesota": "MN", "mississippi": "MS",
    "missouri": "MO", "montana": "MT", "nebraska": "NE", "nevada": "NV",
    "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
    "north carolina": "NC", "north dakota": "ND", "ohio": "OH", "oklahoma": "OK",
    "oregon": "OR", "pennsylvania": "PA", "rhode island": "RI", "south carolina": "SC",
    "south dakota": "SD", "tennessee": "TN", "texas": "TX", "utah": "UT",
    "vermont": "VT", "virginia": "VA", "washington": "WA", "west virginia": "WV",
    "wisconsin": "WI", "wyoming": "WY", "district of columbia": "DC",
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
    digits = ''.join(c for c in phone if c.isdigit())
    # Handle US numbers with country code
    if len(digits) == 11 and digits.startswith('1'):
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
    acronyms = {'AWS', 'GCP', 'API', 'REST', 'SQL', 'NoSQL', 'HTML', 'CSS', 'JSON', 'XML',
                'CI/CD', 'DevOps', 'AI', 'ML', 'NLP', 'ETL', 'SaaS', 'PaaS', 'IaaS', 'IAM',
                'VPN', 'DNS', 'TCP', 'UDP', 'HTTP', 'HTTPS', 'SSH', 'SSL', 'TLS', 'OAuth',
                'JWT', 'LDAP', 'AD', 'SSO', 'MFA', 'SIEM', 'SOC', 'NIST', 'ISO', 'PCI',
                'HIPAA', 'SOX', 'GDPR', 'FedRAMP', 'FISMA', 'RMF', 'SCRUM', 'SAFe', 'PMI',
                'ITIL', 'COBIT', 'TOGAF', 'UML', 'OOP', 'TDD', 'BDD', 'DDD', 'UI', 'UX'}
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
                    "body": json.dumps({
                        "error": f"Invalid status. Must be one of: {VALID_STATUSES}"
                    }),
                }
            update_parts.append("#status = :status")
            expression_names["#status"] = "status"
            expression_values[":status"] = new_status
        
        # Handle bill_rate update
        if "bill_rate" in body:
            bill_rate = body["bill_rate"]
            if bill_rate is not None:
                try:
                    bill_rate = Decimal(str(bill_rate))
                    if bill_rate < 0:
                        raise ValueError("Bill rate cannot be negative")
                except (ValueError, TypeError) as e:
                    return {
                        "statusCode": 400,
                        "headers": {"Content-Type": "application/json"},
                        "body": json.dumps({"error": f"Invalid bill_rate: {e}"}),
                    }
            update_parts.append("bill_rate = :bill_rate")
            expression_values[":bill_rate"] = bill_rate
        
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
        
        # Handle talent_bucket update
        if "talent_bucket" in body:
            bucket = body["talent_bucket"]
            if bucket not in VALID_BUCKETS:
                return {
                    "statusCode": 400,
                    "headers": {"Content-Type": "application/json"},
                    "body": json.dumps({
                        "error": f"Invalid talent_bucket. Must be one of: {VALID_BUCKETS}"
                    }),
                }
            update_parts.append("talent_bucket = :talent_bucket")
            expression_values[":talent_bucket"] = bucket
        
        # Handle talent_category update
        if "talent_category" in body:
            category = body["talent_category"]
            if category not in VALID_CATEGORIES:
                return {
                    "statusCode": 400,
                    "headers": {"Content-Type": "application/json"},
                    "body": json.dumps({
                        "error": f"Invalid talent_category. Must be one of: {VALID_CATEGORIES}"
                    }),
                }
            update_parts.append("talent_category = :talent_category")
            expression_values[":talent_category"] = category
        
        # Handle clearance_level update
        if "clearance_level" in body:
            clearance = body["clearance_level"]
            if clearance not in VALID_CLEARANCES:
                return {
                    "statusCode": 400,
                    "headers": {"Content-Type": "application/json"},
                    "body": json.dumps({
                        "error": f"Invalid clearance_level. Must be one of: {VALID_CLEARANCES}"
                    }),
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
        
        if not update_parts:
            return {
                "statusCode": 400,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({
                    "error": "No valid fields to update. Supported: status, bill_rate, name, contact, summary, talent_bucket, talent_category, clearance_level, skillsets, certifications, companies, location, years_of_experience"
                }),
            }
        
        # Add updated_at timestamp
        now = datetime.now(timezone.utc).isoformat()
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
        
        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({
                "message": "Talent profile updated successfully",
                "pk": pk,
                "updated_at": now,
                "profile": updated_item,
            }, default=_decimal_converter),
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
