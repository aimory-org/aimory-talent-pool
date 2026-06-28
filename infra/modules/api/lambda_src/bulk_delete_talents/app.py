"""
Bulk delete multiple talent profiles and optionally their S3 resumes.
Body: { "pks": ["pk1", "pk2", ...] }
Returns: { "deleted_count": N, "failed_pks": [...] }
"""

import json
import os
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError

dynamodb = boto3.resource("dynamodb")
dynamodb_client = boto3.client("dynamodb")
table = dynamodb.Table(os.environ["TALENT_PROFILES_TABLE"])
TALENT_PROFILES_TABLE = os.environ["TALENT_PROFILES_TABLE"]
s3_client = boto3.client("s3")
RESUME_BUCKET = os.environ.get("RESUME_BUCKET", "")
AUDIT_LOG_TABLE = os.environ.get("AUDIT_LOG_TABLE", "")

MAX_PKS = 100
BATCH_SIZE = 25  # DynamoDB BatchWriteItem maximum


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


def _fetch_items(pks):
    """Fetch all items via BatchGetItem (25 per request)."""
    items = {}
    for i in range(0, len(pks), BATCH_SIZE):
        chunk = pks[i : i + BATCH_SIZE]
        request = {TALENT_PROFILES_TABLE: {"Keys": [{"pk": {"S": pk}} for pk in chunk]}}
        while request:
            response = dynamodb_client.batch_get_item(RequestItems=request)
            for raw in response.get("Responses", {}).get(TALENT_PROFILES_TABLE, []):
                pk = raw["pk"]["S"]
                # Convert from DynamoDB low-level format to Python dict
                items[pk] = {k: list(v.values())[0] if len(v) == 1 else v for k, v in raw.items()}
            # Retry unprocessed keys
            request = response.get("UnprocessedKeys") or None
    return items


def _batch_delete(pks):
    """Delete items from DynamoDB in batches of 25, retrying UnprocessedItems."""
    failed = []
    for i in range(0, len(pks), BATCH_SIZE):
        chunk = pks[i : i + BATCH_SIZE]
        request = {TALENT_PROFILES_TABLE: [{"DeleteRequest": {"Key": {"pk": {"S": pk}}}} for pk in chunk]}
        max_retries = 5
        attempt = 0
        while request and attempt < max_retries:
            response = dynamodb_client.batch_write_item(RequestItems=request)
            unprocessed = response.get("UnprocessedItems", {})
            if unprocessed:
                request = unprocessed
                attempt += 1
            else:
                request = None
        if request:
            # Still have unprocessed after retries
            for req in request.get(TALENT_PROFILES_TABLE, []):
                failed.append(req["DeleteRequest"]["Key"]["pk"]["S"])
    return failed


def _write_audit_entry(pk, snapshot, now, user_email, user_name):
    if not AUDIT_LOG_TABLE:
        return
    item = {
        "pk": pk,
        "sk": f"{now}#DELETE",
        "action": "DELETE",
        "timestamp": now,
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
        print(f"Warning: failed to write audit entry for {pk}: {exc}")


def handler(event, context):
    try:
        body = json.loads(event.get("body") or "{}")
        pks = body.get("pks")

        if not pks or not isinstance(pks, list):
            return {
                "statusCode": 400,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": "Missing or invalid 'pks' array"}),
            }
        if len(pks) > MAX_PKS:
            return {
                "statusCode": 400,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": f"Too many pks. Maximum is {MAX_PKS}."}),
            }

        now = _iso_now()
        user_email, user_name = _extract_actor(event)

        # Fetch items first for S3 keys and audit snapshots
        existing_items = _fetch_items(pks)

        # Only delete PKs that exist
        existing_pks = list(existing_items.keys())
        not_found_pks = [pk for pk in pks if pk not in existing_items]

        failed_pks = list(not_found_pks)

        if existing_pks:
            batch_failed = _batch_delete(existing_pks)
            failed_pks.extend(batch_failed)
            deleted_pks = [pk for pk in existing_pks if pk not in batch_failed]

            # S3 cleanup and audit entries for successfully deleted items
            for pk in deleted_pks:
                item = existing_items[pk]
                s3_key = item.get("key")
                if RESUME_BUCKET and s3_key:
                    try:
                        s3_client.delete_object(Bucket=RESUME_BUCKET, Key=s3_key)
                    except ClientError as e:
                        print(f"Warning: Failed to delete S3 object {s3_key}: {e}")

                _write_audit_entry(pk, item, now, user_email, user_name)

        deleted_count = len(pks) - len(failed_pks)
        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"deleted_count": deleted_count, "failed_pks": failed_pks}),
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
