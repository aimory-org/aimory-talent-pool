"""
Sync DynamoDB Stream records to OpenSearch.

Handles INSERT/MODIFY → upsert document
Handles REMOVE → delete document

Creates the index with explicit mappings on first run (idempotent).
"""

import os
from decimal import Decimal

import boto3
from boto3.dynamodb.types import TypeDeserializer
from opensearchpy import AWSV4SignerAuth, OpenSearch, RequestsHttpConnection

OPENSEARCH_ENDPOINT = os.environ["OPENSEARCH_ENDPOINT"]
INDEX_NAME = "talent-profiles"

_deserializer = TypeDeserializer()


def _get_client():
    credentials = boto3.Session().get_credentials()
    region = os.environ.get("AWS_REGION", "us-east-1")
    auth = AWSV4SignerAuth(credentials, region, "es")
    return OpenSearch(
        hosts=[{"host": OPENSEARCH_ENDPOINT, "port": 443}],
        http_auth=auth,
        use_ssl=True,
        verify_certs=True,
        connection_class=RequestsHttpConnection,
        timeout=30,
    )


# Fields added after the index was first created. Applied additively to existing
# indices via put_mapping (idempotent) so deploys don't require recreating the index.
_ADDITIVE_PROPERTIES = {
    "industry_category_list": {"type": "keyword"},
}


def _ensure_index(client):
    """Create talent-profiles index with explicit mappings if it doesn't exist.

    For a pre-existing index, additively ensure newer fields exist (idempotent).
    """
    if client.indices.exists(index=INDEX_NAME):
        client.indices.put_mapping(index=INDEX_NAME, body={"properties": _ADDITIVE_PROPERTIES})
        return
    client.indices.create(
        index=INDEX_NAME,
        body={
            "mappings": {
                "properties": {
                    "pk": {"type": "keyword"},
                    "name": {"type": "text"},
                    "name_lower": {"type": "keyword"},
                    "summary": {"type": "text"},
                    "resume_text": {"type": "text"},
                    "status": {"type": "keyword"},
                    "service_category": {"type": "keyword"},
                    "industry_category": {"type": "keyword"},
                    "industry_category_list": {"type": "keyword"},
                    "job_title": {"type": "keyword"},
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
                    "tags": {"type": "keyword"},
                    "years_of_experience": {"type": "float"},
                    "requested_salary": {"type": "float"},
                    "date_received": {"type": "keyword"},
                    "updated_at": {"type": "keyword"},
                    "possible_duplicate_of": {"type": "keyword"},
                }
            }
        },
    )
    print(f"Created index: {INDEX_NAME}")


def _deserialize(dynamo_item):
    """Convert DynamoDB typed JSON (e.g. {'S': 'foo'}) to plain Python values."""
    return {k: _deserializer.deserialize(v) for k, v in dynamo_item.items()}


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
    """Normalize fields that need special treatment for OpenSearch queries."""
    # Convert comma-separated strings to lists for exact term matching
    if isinstance(item.get("skill_names"), str):
        item["skill_names"] = [s.strip() for s in item["skill_names"].split(",") if s.strip()]
    if isinstance(item.get("cert_names"), str):
        item["cert_names"] = [c.strip() for c in item["cert_names"].split(",") if c.strip()]
    # Split the (display) industry_category string into a list for exact AND-term matching.
    # The original string field is preserved for display; the list field powers filtering.
    if isinstance(item.get("industry_category"), str):
        item["industry_category_list"] = [
            c.strip() for c in item["industry_category"].split(",") if c.strip()
        ]
    # Ensure tags is a list
    if not isinstance(item.get("tags"), list):
        item["tags"] = []
    return item


def handler(event, context):
    client = _get_client()
    _ensure_index(client)

    processed = 0
    for record in event.get("Records", []):
        event_name = record["eventName"]

        if event_name in ("INSERT", "MODIFY"):
            new_image = record["dynamodb"].get("NewImage")
            if not new_image:
                continue
            item = _deserialize(new_image)
            item = _convert_decimals(item)
            item = _prepare_document(item)
            pk = item["pk"]
            client.index(index=INDEX_NAME, id=pk, body=item)
            print(f"Indexed: {pk}")

        elif event_name == "REMOVE":
            old_image = record["dynamodb"].get("OldImage")
            if not old_image:
                continue
            item = _deserialize(old_image)
            pk = item["pk"]
            try:
                client.delete(index=INDEX_NAME, id=pk)
                print(f"Deleted: {pk}")
            except Exception as e:
                print(f"Delete failed for {pk}: {e}")

        processed += 1

    return {"processed": processed}
