"""
Delete a tag from the lookup table and remove it from all talent profiles.

DELETE /tags?tag=<tag_value>
"""

import json
import os
from datetime import datetime, timezone

import boto3
from boto3.dynamodb.conditions import Attr

dynamodb = boto3.resource("dynamodb")
tags_table = dynamodb.Table(os.environ["TAGS_LOOKUP_TABLE"])
profiles_table = dynamodb.Table(os.environ["TALENT_PROFILES_TABLE"])
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


def _write_tag_removal_audit_entry(
    pk,
    timestamp,
    user_email,
    old_tags,
    new_tags,
    user_name=None,
    candidate_name=None,
):
    if not AUDIT_LOG_TABLE:
        return

    item = {
        "pk": pk,
        "sk": f"{timestamp}#UPDATE",
        "action": "UPDATE",
        "timestamp": timestamp,
        "user_email": user_email,
        "changes": {
            "tags": {
                "old": old_tags,
                "new": new_tags,
            }
        },
    }
    if user_name:
        item["user_name"] = user_name
    if candidate_name:
        item["candidate_name"] = candidate_name

    try:
        dynamodb.Table(AUDIT_LOG_TABLE).put_item(Item=item)
    except Exception as exc:
        print(f"Warning: failed to write tag removal audit entry for {pk}: {exc}")


def handler(event, context):
    try:
        params = event.get("queryStringParameters") or {}
        tag = params.get("tag", "").strip()

        if not tag:
            return {
                "statusCode": 400,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": "Missing tag query parameter"}),
            }

        # 1. Remove from lookup table
        tags_table.delete_item(Key={"tag": tag})

        actor_email, actor_name = _extract_actor(event)
        timestamp = _iso_now()

        # 2. Find all profiles that contain this tag and remove it
        removed_count = 0
        scan_kwargs = {
            "FilterExpression": Attr("tags").contains(tag),
            "ProjectionExpression": "pk, tags, #name",
            "ExpressionAttributeNames": {"#name": "name"},
        }

        while True:
            response = profiles_table.scan(**scan_kwargs)
            for item in response.get("Items", []):
                old_tags = item.get("tags", [])
                new_tags = [t for t in old_tags if t != tag]

                if old_tags == new_tags:
                    continue

                profiles_table.update_item(
                    Key={"pk": item["pk"]},
                    UpdateExpression="SET tags = :tags",
                    ExpressionAttributeValues={":tags": new_tags},
                )

                _write_tag_removal_audit_entry(
                    pk=item["pk"],
                    timestamp=timestamp,
                    user_email=actor_email,
                    user_name=actor_name,
                    candidate_name=item.get("name"),
                    old_tags=old_tags,
                    new_tags=new_tags,
                )
                removed_count += 1

            if "LastEvaluatedKey" not in response:
                break
            scan_kwargs["ExclusiveStartKey"] = response["LastEvaluatedKey"]

        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps(
                {
                    "message": f"Tag '{tag}' deleted",
                    "profiles_updated": removed_count,
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
