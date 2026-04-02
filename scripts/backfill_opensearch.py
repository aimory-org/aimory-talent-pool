"""
One-time backfill: scans the DynamoDB talent_profiles table and bulk-indexes
all records into OpenSearch.

Usage:
    python scripts/backfill_opensearch.py \
        --table   aimory-dev-talent-profiles \
        --endpoint <opensearch-endpoint-without-https://> \
        --region  us-east-1

The script is idempotent — running it again will upsert existing documents.
"""

import argparse
import os
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Attr
from opensearchpy import OpenSearch, RequestsHttpConnection, AWSV4SignerAuth
from opensearchpy.helpers import bulk

INDEX_NAME = "talent-profiles"


def _get_opensearch_client(endpoint, region):
    credentials = boto3.Session().get_credentials()
    auth = AWSV4SignerAuth(credentials, region, "es")
    return OpenSearch(
        hosts=[{"host": endpoint, "port": 443}],
        http_auth=auth,
        use_ssl=True,
        verify_certs=True,
        connection_class=RequestsHttpConnection,
    )


def _convert_decimals(obj):
    """Recursively convert Decimal to int/float for JSON serialization."""
    if isinstance(obj, list):
        return [_convert_decimals(v) for v in obj]
    if isinstance(obj, dict):
        return {k: _convert_decimals(v) for k, v in obj.items()}
    if isinstance(obj, Decimal):
        return int(obj) if obj % 1 == 0 else float(obj)
    return obj


def _prepare_document(item):
    """Convert comma-separated skill/cert strings to lists for term queries."""
    if isinstance(item.get("skill_names"), str):
        item["skill_names"] = [
            s.strip() for s in item["skill_names"].split(",") if s.strip()
        ]
    if isinstance(item.get("cert_names"), str):
        item["cert_names"] = [
            c.strip() for c in item["cert_names"].split(",") if c.strip()
        ]
    return item


def _scan_all(table):
    """Scan entire DynamoDB table, handling pagination."""
    items = []
    kwargs = {}
    while True:
        response = table.scan(**kwargs)
        items.extend(response.get("Items", []))
        if not response.get("LastEvaluatedKey"):
            break
        kwargs["ExclusiveStartKey"] = response["LastEvaluatedKey"]
    return items


def _generate_actions(items):
    for item in items:
        item = _convert_decimals(item)
        item = _prepare_document(item)
        yield {
            "_index": INDEX_NAME,
            "_id": item["pk"],
            "_source": item,
        }


def main():
    parser = argparse.ArgumentParser(
        description="Backfill talent profiles into OpenSearch"
    )
    parser.add_argument("--table", required=True, help="DynamoDB table name")
    parser.add_argument(
        "--endpoint", required=True, help="OpenSearch endpoint (no https://)"
    )
    parser.add_argument("--region", default="us-east-1", help="AWS region")
    args = parser.parse_args()

    dynamodb = boto3.resource("dynamodb", region_name=args.region)
    table = dynamodb.Table(args.table)

    print(f"Scanning {args.table}...")
    items = _scan_all(table)
    print(f"Found {len(items)} items")

    if not items:
        print("Nothing to backfill.")
        return

    client = _get_opensearch_client(args.endpoint, args.region)

    # Create index if it doesn't exist
    if not client.indices.exists(index=INDEX_NAME):
        client.indices.create(
            index=INDEX_NAME,
            body={
                "mappings": {
                    "properties": {
                        "pk": {"type": "keyword"},
                        "name": {"type": "text"},
                        "name_lower": {"type": "keyword"},
                        "summary": {"type": "text"},
                        "status": {"type": "keyword"},
                        "talent_bucket": {"type": "keyword"},
                        "talent_category": {"type": "keyword"},
                        "clearance_level": {"type": "keyword"},
                        "location_state": {"type": "keyword"},
                        "location": {
                            "properties": {
                                "city": {"type": "keyword"},
                                "state": {"type": "keyword"},
                            }
                        },
                        "skill_names": {"type": "keyword"},
                        "cert_names": {"type": "keyword"},
                        "years_of_experience": {"type": "float"},
                        "bill_rate": {"type": "float"},
                        "date_received": {"type": "keyword"},
                        "updated_at": {"type": "keyword"},
                    }
                }
            },
        )
        print(f"Created index: {INDEX_NAME}")

    success, failed = bulk(
        client, _generate_actions(items), chunk_size=200, raise_on_error=False
    )
    print(f"Indexed: {success}  Failed: {len(failed)}")
    if failed:
        for err in failed:
            print(f"  ERROR: {err}")


if __name__ == "__main__":
    main()
