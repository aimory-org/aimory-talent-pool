"""
Get a single talent profile by primary key.
"""

import json
import os
from decimal import Decimal

import boto3

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(os.environ["TALENT_PROFILES_TABLE"])


class DecimalEncoder(json.JSONEncoder):
    """Handle Decimal types from DynamoDB."""

    def default(self, o):
        if isinstance(o, Decimal):
            return int(o) if o % 1 == 0 else float(o)
        return super().default(o)


def handler(event, context):
    try:
        # Get pk from query string parameters
        pk = (event.get("queryStringParameters") or {}).get("pk")

        if not pk:
            # Fall back to path parameters for backward compatibility
            pk = (event.get("pathParameters") or {}).get("pk")

        if not pk:
            return {
                "statusCode": 400,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": "Missing pk parameter"}),
            }

        # URL decode the pk (it may contain special characters)
        import urllib.parse

        pk = urllib.parse.unquote(pk)

        response = table.get_item(Key={"pk": pk})

        item = response.get("Item")
        if not item:
            return {
                "statusCode": 404,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": "Talent profile not found"}),
            }

        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps(item, cls=DecimalEncoder),
        }

    except Exception as e:
        print(f"Error: {e}")
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": str(e)}),
        }
