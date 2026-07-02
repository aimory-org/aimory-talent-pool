"""
Sync DynamoDB Stream records to OpenSearch.

Handles INSERT/MODIFY → upsert document
Handles REMOVE → delete document

Creates the index with explicit mappings on first run (idempotent).
"""

import json
import os
from decimal import Decimal

import boto3
from boto3.dynamodb.types import TypeDeserializer
from opensearchpy import AWSV4SignerAuth, OpenSearch, RequestsHttpConnection

OPENSEARCH_ENDPOINT = os.environ["OPENSEARCH_ENDPOINT"]
INDEX_NAME = "talent-profiles"

# --- Semantic search (Phase 2a): résumé chunk embeddings -----------------------
# Chunks live in a SIBLING index so kNN settings never touch the main profile index.
CHUNK_INDEX = "talent-chunks"
EMBED_MODEL_ID = os.environ.get("EMBED_MODEL_ID", "amazon.titan-embed-text-v2:0")
EMBED_DIM = int(os.environ.get("EMBED_DIM", "512"))
# Fixed-window chunking (Fork A). ~1400 chars ≈ ~350 tokens, ~200 char overlap.
CHUNK_CHARS = int(os.environ.get("CHUNK_CHARS", "1400"))
CHUNK_OVERLAP = int(os.environ.get("CHUNK_OVERLAP", "200"))

_deserializer = TypeDeserializer()
_bedrock = boto3.client("bedrock-runtime", region_name=os.environ.get("AWS_REGION", "us-east-1"))


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


def _ensure_chunk_index(client):
    """Create the sibling kNN chunk index if it doesn't exist (idempotent)."""
    if client.indices.exists(index=CHUNK_INDEX):
        return
    client.indices.create(
        index=CHUNK_INDEX,
        body={
            "settings": {"index": {"knn": True}},
            "mappings": {
                "properties": {
                    "parent_pk": {"type": "keyword"},
                    "chunk_index": {"type": "integer"},
                    "chunk_type": {"type": "keyword"},
                    "text": {"type": "text"},
                    "vector": {
                        "type": "knn_vector",
                        "dimension": EMBED_DIM,
                        "method": {
                            "name": "hnsw",
                            "space_type": "cosinesimil",
                            "engine": "lucene",
                        },
                    },
                }
            },
        },
    )
    print(f"Created index: {CHUNK_INDEX}")


def _chunk_text(text, size=CHUNK_CHARS, overlap=CHUNK_OVERLAP):
    """Split text into overlapping fixed-size character windows (Fork A)."""
    text = (text or "").strip()
    if not text:
        return []
    chunks = []
    start, n = 0, len(text)
    step = max(1, size - overlap)
    while start < n:
        chunks.append(text[start : start + size])
        if start + size >= n:
            break
        start += step
    return chunks


def _embed(text):
    """Return a normalized embedding vector for a single chunk via Titan v2."""
    resp = _bedrock.invoke_model(
        modelId=EMBED_MODEL_ID,
        body=json.dumps({"inputText": text[:8000], "dimensions": EMBED_DIM, "normalize": True}),
    )
    return json.loads(resp["body"].read())["embedding"]


def _delete_chunks(client, pk):
    """Remove all chunk docs for a candidate (idempotent)."""
    try:
        client.delete_by_query(
            index=CHUNK_INDEX,
            body={"query": {"term": {"parent_pk": pk}}},
            conflicts="proceed",
            refresh=True,
            ignore=[404],
        )
    except Exception as e:
        print(f"Chunk cleanup failed for {pk}: {e}")


def _sync_chunks(client, pk, resume_text):
    """Re-chunk and re-embed a candidate's résumé into the chunk index.

    Best-effort: an embedding failure on one chunk is logged and skipped; it never
    blocks the main profile document from being indexed.
    """
    _delete_chunks(client, pk)
    chunks = _chunk_text(resume_text)
    if not chunks:
        return 0
    actions = []
    for i, chunk in enumerate(chunks):
        try:
            vector = _embed(chunk)
        except Exception as e:
            print(f"Embed failed for {pk} chunk {i}: {e}")
            continue
        actions.append({"index": {"_index": CHUNK_INDEX, "_id": f"{pk}::{i}"}})
        actions.append({"parent_pk": pk, "chunk_index": i, "chunk_type": "resume", "text": chunk, "vector": vector})
    if actions:
        client.bulk(body=actions, refresh=False)
    return len(actions) // 2


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
        item["industry_category_list"] = [c.strip() for c in item["industry_category"].split(",") if c.strip()]
    # Ensure tags is a list
    if not isinstance(item.get("tags"), list):
        item["tags"] = []
    return item


def handler(event, context):
    client = _get_client()
    _ensure_index(client)
    _ensure_chunk_index(client)

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

            # Re-embed résumé chunks only when resume_text actually changed, so
            # recruiter edits (status/notes/tags) don't trigger needless re-embedding.
            resume_text = item.get("resume_text") or ""
            old_image = record["dynamodb"].get("OldImage")
            old_resume = _deserialize(old_image).get("resume_text") or "" if old_image else ""
            if resume_text and (event_name == "INSERT" or resume_text != old_resume):
                try:
                    n = _sync_chunks(client, pk, resume_text)
                    print(f"Embedded {n} chunks for {pk}")
                except Exception as e:
                    print(f"Chunk sync failed for {pk}: {e}")

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
            _delete_chunks(client, pk)

        processed += 1

    return {"processed": processed}
