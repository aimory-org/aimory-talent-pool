"""
List job descriptions from DynamoDB.
Supports optional filtering by job_title, industry_category, required_clearance, location_state.
"""

import json
import os
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Attr

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(os.environ["JOB_DESCRIPTIONS_TABLE"])


class DecimalEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, Decimal):
            return int(o) if o % 1 == 0 else float(o)
        return super().default(o)


def handler(event, context):
    try:
        params = event.get("queryStringParameters") or {}

        filter_expr = None
        for field in ("job_title", "industry_category", "required_clearance", "location_state"):
            if params.get(field):
                condition = Attr(field).eq(params[field])
                filter_expr = condition if filter_expr is None else filter_expr & condition

        kwargs = {}
        if filter_expr is not None:
            kwargs["FilterExpression"] = filter_expr

        items = []
        while True:
            response = table.scan(**kwargs)
            items.extend(response.get("Items", []))
            if "LastEvaluatedKey" not in response:
                break
            kwargs["ExclusiveStartKey"] = response["LastEvaluatedKey"]

        # Sort by newest first
        items.sort(key=lambda x: x.get("created_at", ""), reverse=True)

        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps(items, cls=DecimalEncoder),
        }

    except Exception as e:
        print(f"Error: {e}")
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": str(e)}),
        }
