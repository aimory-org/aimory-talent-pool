"""
Update a job description's editable fields.
Supports: title, required_skills, desired_skills,
          required_certifications, desired_certifications, required_clearance,
          min_experience_years, location, industry_category, job_title, salary_range
"""

import json
import os
from datetime import datetime, timezone
from decimal import Decimal

import boto3

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(os.environ["JOB_DESCRIPTIONS_TABLE"])
AUDIT_LOG_TABLE = os.environ.get("AUDIT_LOG_TABLE", "")

VALID_CLEARANCES = {
    None,
    "Secret",
    "TS",
    "TS/SCI",
    "TS/SCI/FSP",
    "TS/SCI/CI",
    "Yankee White",
}

EDITABLE_FIELDS = {
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
    "salary_range",
    "archived",
}


class DecimalEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, Decimal):
            return int(o) if o % 1 == 0 else float(o)
        return super().default(o)


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


def _write_audit_entry(pk, action, timestamp, event, changes=None, title=None):
    if not AUDIT_LOG_TABLE:
        return
    user_email, user_name = _extract_actor(event)
    item = {
        "pk": pk,
        "sk": f"{timestamp}#{action}",
        "action": action,
        "timestamp": timestamp,
        "document_type": "job_description",
        "user_email": user_email,
    }
    if user_name:
        item["user_name"] = user_name
    if title:
        item["title"] = title
    if changes:
        item["changes"] = changes
    try:
        dynamodb.Table(AUDIT_LOG_TABLE).put_item(Item=_to_decimal(item))
    except Exception as exc:
        print(f"Warning: failed to write audit entry for {pk}: {exc}")


def handler(event, context):
    try:
        body = json.loads(event.get("body") or "{}")
        pk = body.get("pk")

        if not pk:
            return {
                "statusCode": 400,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": "Missing pk in request body"}),
            }

        # Validate only allowed fields
        update_fields = {k: v for k, v in body.items() if k in EDITABLE_FIELDS}
        dismiss_duplicate = body.get("dismiss_duplicate", False)

        if not update_fields and not dismiss_duplicate:
            return {
                "statusCode": 400,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": "No editable fields provided"}),
            }

        # Validate clearance if provided
        if "required_clearance" in update_fields:
            if update_fields["required_clearance"] not in VALID_CLEARANCES:
                return {
                    "statusCode": 400,
                    "headers": {"Content-Type": "application/json"},
                    "body": json.dumps({"error": f"Invalid clearance: {update_fields['required_clearance']}"}),
                }

        # Check the JD exists
        existing = table.get_item(Key={"pk": pk}).get("Item")
        if not existing:
            return {
                "statusCode": 404,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": "Job description not found"}),
            }

        now = _iso_now()

        # Build update expression
        expr_parts = ["#updated_at = :updated_at"]
        attr_names = {"#updated_at": "updated_at"}
        attr_values = {":updated_at": now}

        for field, value in update_fields.items():
            safe_name = f"#{field}"
            safe_value = f":{field}"
            expr_parts.append(f"{safe_name} = {safe_value}")
            attr_names[safe_name] = field
            attr_values[safe_value] = _to_decimal(value)

        # Recompute denormalized fields
        if "required_skills" in update_fields or "desired_skills" in update_fields:
            all_skills = list(update_fields.get("required_skills", existing.get("required_skills", [])) or [])
            all_skills += list(update_fields.get("desired_skills", existing.get("desired_skills", [])) or [])
            expr_parts.append("#skill_names = :skill_names")
            attr_names["#skill_names"] = "skill_names"
            attr_values[":skill_names"] = ",".join(all_skills) if all_skills else ""

        if "required_certifications" in update_fields or "desired_certifications" in update_fields:
            all_certs = list(
                update_fields.get("required_certifications", existing.get("required_certifications", [])) or []
            )
            all_certs += list(
                update_fields.get("desired_certifications", existing.get("desired_certifications", [])) or []
            )
            expr_parts.append("#cert_names = :cert_names")
            attr_names["#cert_names"] = "cert_names"
            attr_values[":cert_names"] = ",".join(all_certs) if all_certs else ""

        if "location" in update_fields:
            loc = update_fields["location"] or {}
            state = loc.get("state", "")
            expr_parts.append("#location_state = :location_state")
            attr_names["#location_state"] = "location_state"
            attr_values[":location_state"] = state if state else ""

        # Build update expression
        remove_parts = []
        if dismiss_duplicate:
            remove_parts.append("possible_duplicate_of")

        parts = []
        if expr_parts:
            parts.append("SET " + ", ".join(expr_parts))
        if remove_parts:
            parts.append("REMOVE " + ", ".join(remove_parts))

        update_kwargs = {
            "Key": {"pk": pk},
            "UpdateExpression": " ".join(parts),
        }
        if attr_names:
            update_kwargs["ExpressionAttributeNames"] = attr_names
        if attr_values:
            update_kwargs["ExpressionAttributeValues"] = attr_values

        table.update_item(**update_kwargs)

        changes_dict = {
            field: {"old": existing.get(field), "new": new_val}
            for field, new_val in update_fields.items()
        }
        _write_audit_entry(
            pk,
            "UPDATE",
            now,
            event,
            changes=changes_dict,
            title=update_fields.get("title", existing.get("title")),
        )

        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"status": "ok", "pk": pk, "updated_at": now}),
        }

    except Exception as e:
        print(f"Error: {e}")
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": str(e)}),
        }
