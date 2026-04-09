"""
Delete a tag from the lookup table and remove it from all talent profiles.

DELETE /tags?tag=<tag_value>
"""

import json
import os

import boto3
from boto3.dynamodb.conditions import Attr

dynamodb = boto3.resource("dynamodb")
tags_table = dynamodb.Table(os.environ["TAGS_LOOKUP_TABLE"])
profiles_table = dynamodb.Table(os.environ["TALENT_PROFILES_TABLE"])


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

        # 2. Find all profiles that contain this tag and remove it
        removed_count = 0
        scan_kwargs = {
            "FilterExpression": Attr("tags").contains(tag),
            "ProjectionExpression": "pk, tags",
        }

        while True:
            response = profiles_table.scan(**scan_kwargs)
            for item in response.get("Items", []):
                new_tags = [t for t in item.get("tags", []) if t != tag]
                profiles_table.update_item(
                    Key={"pk": item["pk"]},
                    UpdateExpression="SET tags = :tags",
                    ExpressionAttributeValues={":tags": new_tags},
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
