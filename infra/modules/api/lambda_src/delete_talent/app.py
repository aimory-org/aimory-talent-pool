"""
Delete a talent profile and optionally its resume from S3.
"""

import json
import os
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(os.environ["TALENT_PROFILES_TABLE"])
s3_client = boto3.client("s3")
RESUME_BUCKET = os.environ.get("RESUME_BUCKET", "")
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
        "user_email": user_email,
        "snapshot": snapshot,
    }
    if user_name:
        item["user_name"] = user_name
    candidate_name = snapshot.get("name") if isinstance(snapshot, dict) else None
    if candidate_name:
        item["candidate_name"] = candidate_name

    try:
        dynamodb.Table(AUDIT_LOG_TABLE).put_item(Item=item)
    except Exception as exc:
        print(f"Warning: failed to write delete audit entry for {pk}: {exc}")


def handler(event, context):
    try:
        # Get pk from query parameters (path params don't work with slashes in pk)
        query_params = event.get("queryStringParameters") or {}
        pk = query_params.get("pk")

        if not pk:
            return {
                "statusCode": 400,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": "Missing pk query parameter"}),
            }

        # pk is already decoded by API Gateway

        # Get the item first to extract the S3 key
        response = table.get_item(Key={"pk": pk})
        item = response.get("Item")

        if not item:
            return {
                "statusCode": 404,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": "Talent profile not found"}),
            }

        # Delete from DynamoDB
        table.delete_item(Key={"pk": pk})

        # Delete from S3 if bucket is configured and key exists
        s3_key = item.get("key")
        if RESUME_BUCKET and s3_key:
            try:
                s3_client.delete_object(Bucket=RESUME_BUCKET, Key=s3_key)
            except ClientError as e:
                # Log but don't fail if S3 delete fails
                print(f"Warning: Failed to delete S3 object {s3_key}: {e}")

        _write_audit_entry(pk, item, event)

        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps(
                {
                    "message": "Talent profile deleted successfully",
                    "pk": pk,
                }
            ),
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
