"""
Update a talent profile's status.
"""
import json
import os
from datetime import datetime, timezone
import boto3

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(os.environ["TALENT_PROFILES_TABLE"])

VALID_STATUSES = [
    "Potential Candidate",
    "Active Candidate",
    "Placed Candidate",
    "Stale Candidate",
    "Do Not Contact",
]


def handler(event, context):
    try:
        # Get pk from path parameters
        pk = event.get("pathParameters", {}).get("pk")
        
        if not pk:
            return {
                "statusCode": 400,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": "Missing pk parameter"}),
            }
        
        # URL decode the pk
        import urllib.parse
        pk = urllib.parse.unquote(pk)
        
        # Parse request body
        body = json.loads(event.get("body", "{}"))
        new_status = body.get("status")
        
        if not new_status:
            return {
                "statusCode": 400,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": "Missing status in request body"}),
            }
        
        if new_status not in VALID_STATUSES:
            return {
                "statusCode": 400,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({
                    "error": f"Invalid status. Must be one of: {VALID_STATUSES}"
                }),
            }
        
        # Update the item
        now = datetime.now(timezone.utc).isoformat()
        
        response = table.update_item(
            Key={"pk": pk},
            UpdateExpression="SET #status = :status, updated_at = :updated_at",
            ExpressionAttributeNames={"#status": "status"},
            ExpressionAttributeValues={
                ":status": new_status,
                ":updated_at": now,
            },
            ConditionExpression="attribute_exists(pk)",
            ReturnValues="ALL_NEW",
        )
        
        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({
                "message": "Status updated successfully",
                "pk": pk,
                "status": new_status,
                "updated_at": now,
            }),
        }
        
    except dynamodb.meta.client.exceptions.ConditionalCheckFailedException:
        return {
            "statusCode": 404,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": "Talent profile not found"}),
        }
    except Exception as e:
        print(f"Error: {e}")
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": str(e)}),
        }
