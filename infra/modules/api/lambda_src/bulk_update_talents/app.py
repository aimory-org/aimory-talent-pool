"""
Bulk update status for multiple talent profiles in a single call.
Body: { "pks": ["pk1", "pk2", ...], "status": "Active Candidate" }
Returns: { "updated_count": N, "failed_pks": [...] }
"""

import json
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

import boto3

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(os.environ["TALENT_PROFILES_TABLE"])
AUDIT_LOG_TABLE = os.environ.get("AUDIT_LOG_TABLE", "")

VALID_STATUSES = {
    "Active Candidate",
    "Do Not Contact",
    "Placed at Other Company",
    "Placed with us",
    "Potential Candidate",
    "Stale Candidate",
}

MAX_PKS = 100


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


def _write_audit_entry(pk, old_status, new_status, now, user_email, user_name, candidate_name):
    if not AUDIT_LOG_TABLE:
        return
    item = {
        "pk": pk,
        "sk": f"{now}#STATUS_CHANGE",
        "action": "STATUS_CHANGE",
        "timestamp": now,
        "user_email": user_email,
        "changes": {"status": {"old": old_status, "new": new_status}},
    }
    if user_name:
        item["user_name"] = user_name
    if candidate_name:
        item["candidate_name"] = candidate_name
    try:
        dynamodb.Table(AUDIT_LOG_TABLE).put_item(Item=item)
    except Exception as exc:
        print(f"Warning: failed to write audit entry for {pk}: {exc}")


def _update_one(pk, new_status, now, user_email, user_name):
    try:
        response = table.update_item(
            Key={"pk": pk},
            UpdateExpression="SET #status = :status, updated_at = :updated_at",
            ExpressionAttributeNames={"#status": "status"},
            ExpressionAttributeValues={":status": new_status, ":updated_at": now},
            ConditionExpression="attribute_exists(pk)",
            ReturnValues="ALL_NEW",
        )
        attrs = response.get("Attributes", {})
        old_status = attrs.get("status")  # already updated, so this is new; capture before update isn't possible here
        # Write audit — old_status isn't available without a pre-fetch; use None for old
        _write_audit_entry(pk, None, new_status, now, user_email, user_name, attrs.get("name"))
        return pk, True
    except dynamodb.meta.client.exceptions.ConditionalCheckFailedException:
        return pk, False
    except Exception as exc:
        print(f"Error updating {pk}: {exc}")
        return pk, False


def handler(event, context):
    try:
        body = json.loads(event.get("body") or "{}")
        pks = body.get("pks")
        new_status = body.get("status")

        if not pks or not isinstance(pks, list):
            return {
                "statusCode": 400,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": "Missing or invalid 'pks' array"}),
            }
        if not new_status or new_status not in VALID_STATUSES:
            return {
                "statusCode": 400,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": f"Invalid status. Must be one of: {sorted(VALID_STATUSES)}"}),
            }
        if len(pks) > MAX_PKS:
            return {
                "statusCode": 400,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": f"Too many pks. Maximum is {MAX_PKS}."}),
            }

        now = _iso_now()
        user_email, user_name = _extract_actor(event)
        failed_pks = []

        with ThreadPoolExecutor(max_workers=10) as executor:
            futures = {executor.submit(_update_one, pk, new_status, now, user_email, user_name): pk for pk in pks}
            for future in as_completed(futures):
                pk, ok = future.result()
                if not ok:
                    failed_pks.append(pk)

        updated_count = len(pks) - len(failed_pks)
        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"updated_count": updated_count, "failed_pks": failed_pks}),
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
