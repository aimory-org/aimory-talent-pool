"""Return audit history for a candidate profile."""

import json
import os
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(os.environ["AUDIT_LOG_TABLE"])


def _decimal_converter(obj):
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")


def _json_response(body, status_code=200):
    return {
        "statusCode": status_code,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body, default=_decimal_converter),
    }


def _parse_limit(query_params):
    raw_limit = (query_params.get("limit") or "").strip()
    if not raw_limit:
        return 200

    limit = int(raw_limit)
    if limit <= 0:
        raise ValueError("limit must be greater than 0")

    return min(limit, 500)


def _load_items_for_pk(pk):
    items = []
    kwargs = {
        "KeyConditionExpression": Key("pk").eq(pk),
        "ScanIndexForward": False,
    }

    while True:
        response = table.query(**kwargs)
        items.extend(response.get("Items", []))

        if "LastEvaluatedKey" not in response:
            break

        kwargs["ExclusiveStartKey"] = response["LastEvaluatedKey"]

    return items


def _load_global_items():
    items = []
    kwargs = {}

    while True:
        response = table.scan(**kwargs)
        items.extend(response.get("Items", []))

        if "LastEvaluatedKey" not in response:
            break

        kwargs["ExclusiveStartKey"] = response["LastEvaluatedKey"]

    return sorted(items, key=lambda item: item.get("timestamp", ""), reverse=True)


def handler(event, context):
    try:
        query_params = event.get("queryStringParameters") or {}
        pk = (query_params.get("pk") or "").strip()
        scope = (query_params.get("scope") or "").strip().lower()
        limit = _parse_limit(query_params)

        if scope == "global":
            return _json_response({"items": _load_global_items()[:limit]})

        if not pk:
            return _json_response({"error": "Missing pk query parameter"}, 400)

        return _json_response({"items": _load_items_for_pk(pk)[:limit]})

    except ValueError as exc:
        return _json_response({"error": str(exc)}, 400)

    except Exception as exc:
        print(f"Error loading audit history: {exc}")
        return _json_response({"error": str(exc)}, 500)
