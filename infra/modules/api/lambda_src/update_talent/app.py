"""
Update a talent profile's editable fields (status, bill_rate).
"""
import json
import os
import urllib.parse
from datetime import datetime, timezone
from decimal import Decimal
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
        
        # Parse request body
        body = json.loads(event.get("body", "{}"))
        
        # Build update expression dynamically
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
        
        if not update_parts:
            return {
                "statusCode": 400,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": "No valid fields to update. Supported: status, bill_rate"}),
            }
        
        # Add updated_at timestamp
        now = datetime.now(timezone.utc).isoformat()
        update_parts.append("updated_at = :updated_at")
        expression_values[":updated_at"] = now
        
        # Build final update expression
        update_expression = "SET " + ", ".join(update_parts)
        
        # Execute update
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
        
        # Convert Decimal to float for JSON serialization
        result = {
            "message": "Talent profile updated successfully",
            "pk": pk,
            "updated_at": now,
        }
        
        if "status" in body:
            result["status"] = body["status"]
        if "bill_rate" in body:
            result["bill_rate"] = float(updated_item.get("bill_rate")) if updated_item.get("bill_rate") is not None else None
        
        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps(result),
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
