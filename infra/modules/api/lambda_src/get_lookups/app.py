"""
Get lookup table data for dropdowns (skills, certifications, cities).
Returns all unique values from the lookup tables.
"""

import json
import os

import boto3

dynamodb = boto3.resource("dynamodb")

skills_table = dynamodb.Table(os.environ["SKILLS_LOOKUP_TABLE"])
certifications_table = dynamodb.Table(os.environ["CERTIFICATIONS_LOOKUP_TABLE"])
cities_table = dynamodb.Table(os.environ["CITIES_LOOKUP_TABLE"])


def scan_all(table, key_attr):
    """Scan a table and return all values of the key attribute."""
    items = []
    response = table.scan(ProjectionExpression=key_attr)
    items.extend([item[key_attr] for item in response.get("Items", [])])

    while response.get("LastEvaluatedKey"):
        response = table.scan(ProjectionExpression=key_attr, ExclusiveStartKey=response["LastEvaluatedKey"])
        items.extend([item[key_attr] for item in response.get("Items", [])])

    return sorted(items)


def scan_cities():
    """Scan cities table and return city/state pairs."""
    items = []
    response = cities_table.scan()
    items.extend(response.get("Items", []))

    while response.get("LastEvaluatedKey"):
        response = cities_table.scan(ExclusiveStartKey=response["LastEvaluatedKey"])
        items.extend(response.get("Items", []))

    # Return sorted by state, then city
    return sorted(items, key=lambda x: (x.get("state", ""), x.get("city", "")))


def handler(event, context):
    try:
        # Get optional filter parameter to only fetch certain lookups
        params = event.get("queryStringParameters") or {}
        include = params.get("include", "all").split(",")

        result = {}

        if "all" in include or "skills" in include:
            result["skills"] = scan_all(skills_table, "skill")

        if "all" in include or "certifications" in include:
            result["certifications"] = scan_all(certifications_table, "certification")

        if "all" in include or "cities" in include:
            result["cities"] = scan_cities()

        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps(result),
        }

    except Exception as e:
        print(f"Error: {e}")
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": str(e)}),
        }
