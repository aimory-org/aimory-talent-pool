"""
Lambda function to mark candidates as "Stale Candidate" after 90 days.
Runs on a schedule (e.g., daily) via EventBridge.
"""

import os
from datetime import datetime, timedelta, timezone

import boto3
from boto3.dynamodb.conditions import Attr

TABLE_NAME = os.environ.get("TALENT_PROFILES_TABLE", "")
STALE_DAYS = int(os.environ.get("STALE_DAYS", "90"))

dynamodb = boto3.resource("dynamodb")


def handler(event, context):
    if not TABLE_NAME:
        raise ValueError("TALENT_PROFILES_TABLE env var is required")

    table = dynamodb.Table(TABLE_NAME)

    # Calculate the cutoff date (90 days ago)
    cutoff_date = (datetime.now(timezone.utc) - timedelta(days=STALE_DAYS)).strftime("%Y-%m-%d")

    # Scan for candidates that:
    # 1. Have date_received older than cutoff
    # 2. Are still "Potential Candidate" status (don't change other statuses)
    scan_kwargs = {
        "FilterExpression": (Attr("date_received").lt(cutoff_date) & Attr("status").eq("Potential Candidate")),
        "ProjectionExpression": "pk, #name_attr, date_received, #status_attr",
        "ExpressionAttributeNames": {"#name_attr": "name", "#status_attr": "status"},
    }

    updated_count = 0
    stale_candidates = []

    # Paginate through all results
    while True:
        response = table.scan(**scan_kwargs)
        items = response.get("Items", [])

        for item in items:
            pk = item["pk"]
            # Update status to Stale Candidate
            table.update_item(
                Key={"pk": pk},
                UpdateExpression="SET #status_attr = :stale, updated_at = :now",
                ExpressionAttributeNames={"#status_attr": "status"},
                ExpressionAttributeValues={
                    ":stale": "Stale Candidate",
                    ":now": datetime.now(timezone.utc).isoformat(),
                },
            )
            updated_count += 1
            stale_candidates.append(
                {
                    "pk": pk,
                    "name": item.get("name"),
                    "date_received": item.get("date_received"),
                }
            )

        # Check for pagination
        if "LastEvaluatedKey" not in response:
            break
        scan_kwargs["ExclusiveStartKey"] = response["LastEvaluatedKey"]

    return {
        "status": "ok",
        "step": "stale_checker",
        "cutoff_date": cutoff_date,
        "stale_days": STALE_DAYS,
        "updated_count": updated_count,
        "stale_candidates": stale_candidates[:10],  # Return first 10 for logging
    }
