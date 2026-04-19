"""
Delete a job description by primary key.
"""

import json
import os
from datetime import datetime, timezone

import boto3

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(os.environ["JOB_DESCRIPTIONS_TABLE"])
AUDIT_LOG_TABLE = os.environ.get("AUDIT_LOG_TABLE", "")


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


def _write_audit_entry(pk, snapshot, event):
    if not AUDIT_LOG_TABLE:
        return
    timestamp = _iso_now()
    user_email, user_name = _extract_actor(event)
    item = {
        "pk": pk,
        "sk": f"{timestamp}#DELETE",
        "action": "DELETE",
        "timestamp": timestamp,
        "document_type": "job_description",
        "user_email": user_email,
    }
    if user_name:
        item["user_name"] = user_name
    title = snapshot.get("title") if isinstance(snapshot, dict) else None
    if title:
        item["title"] = title
    try:
        dynamodb.Table(AUDIT_LOG_TABLE).put_item(Item=item)
    except Exception as exc:
        print(f"Warning: failed to write audit entry for {pk}: {exc}")


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

        # Fetch current item for audit snapshot
        existing = table.get_item(Key={"pk": pk}).get("Item")
        if not existing:
            return {
                "statusCode": 404,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": "Job description not found"}),
            }

        # Delete from DynamoDB
        table.delete_item(Key={"pk": pk})

        # Audit log
        _write_audit_entry(pk, existing, event)

        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"status": "deleted", "pk": pk}),
        }

    except Exception as e:
        print(f"Error: {e}")
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": str(e)}),
        }
