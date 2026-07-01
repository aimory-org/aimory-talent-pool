"""
One-time backfill: chunk + embed every candidate's résumé into the OpenSearch
`talent-chunks` kNN index (Phase 2a semantic retrieval).

Why a script (not the stream path): re-writing an identical DynamoDB item emits no
stream event, so the sync_to_opensearch lambda can't be used to backfill existing
records. This reads profiles directly and writes chunks.

Usage:
    python scripts/backfill_embeddings.py \
        --table    aimory-talent-pool-dev-talent-profiles \
        --endpoint <opensearch-endpoint-without-https://> \
        --region   us-east-1 \
        [--limit N]   # process only N records (validation runs)

Idempotent: existing chunks for a candidate are deleted before re-indexing.
Keep chunking params in sync with sync_to_opensearch/app.py.
"""

import argparse
import json

import boto3
from opensearchpy import AWSV4SignerAuth, OpenSearch, RequestsHttpConnection
from opensearchpy.helpers import bulk

CHUNK_INDEX = "talent-chunks"
CHUNK_CHARS = 1400
CHUNK_OVERLAP = 200


def _get_opensearch_client(endpoint, region):
    credentials = boto3.Session().get_credentials()
    auth = AWSV4SignerAuth(credentials, region, "es")
    return OpenSearch(
        hosts=[{"host": endpoint, "port": 443}],
        http_auth=auth,
        use_ssl=True,
        verify_certs=True,
        connection_class=RequestsHttpConnection,
        timeout=60,
    )


def _ensure_chunk_index(client, dim):
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
                        "dimension": dim,
                        "method": {"name": "hnsw", "space_type": "cosinesimil", "engine": "lucene"},
                    },
                }
            },
        },
    )
    print(f"Created index: {CHUNK_INDEX}")


def _chunk_text(text, size=CHUNK_CHARS, overlap=CHUNK_OVERLAP):
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


def _embed(bedrock, model_id, text, dim):
    resp = bedrock.invoke_model(
        modelId=model_id,
        body=json.dumps({"inputText": text[:8000], "dimensions": dim, "normalize": True}),
    )
    return json.loads(resp["body"].read())["embedding"]


def _scan_all(table, limit=None):
    items, kwargs = [], {}
    while True:
        response = table.scan(**kwargs)
        items.extend(response.get("Items", []))
        if limit and len(items) >= limit:
            return items[:limit]
        if not response.get("LastEvaluatedKey"):
            break
        kwargs["ExclusiveStartKey"] = response["LastEvaluatedKey"]
    return items


def main():
    parser = argparse.ArgumentParser(description="Backfill résumé chunk embeddings into OpenSearch")
    parser.add_argument("--table", required=True, help="DynamoDB talent-profiles table name")
    parser.add_argument("--endpoint", required=True, help="OpenSearch endpoint (no https://)")
    parser.add_argument("--region", default="us-east-1")
    parser.add_argument("--model", default="amazon.titan-embed-text-v2:0")
    parser.add_argument("--dim", type=int, default=512)
    parser.add_argument("--limit", type=int, default=None, help="Process only N records")
    args = parser.parse_args()

    dynamodb = boto3.resource("dynamodb", region_name=args.region)
    table = dynamodb.Table(args.table)
    bedrock = boto3.client("bedrock-runtime", region_name=args.region)
    client = _get_opensearch_client(args.endpoint, args.region)

    _ensure_chunk_index(client, args.dim)

    print(f"Scanning {args.table}...")
    items = _scan_all(table, args.limit)
    items = [it for it in items if (it.get("resume_text") or "").strip()]
    print(f"Found {len(items)} candidates with résumé text")

    total_chunks, done, embed_failures = 0, 0, 0
    for item in items:
        pk = item["pk"]
        # Idempotent: clear any existing chunks for this candidate first.
        client.delete_by_query(
            index=CHUNK_INDEX,
            body={"query": {"term": {"parent_pk": pk}}},
            conflicts="proceed",
            refresh=False,
            ignore=[404],
        )
        actions = []
        for i, chunk in enumerate(_chunk_text(item["resume_text"])):
            try:
                vector = _embed(bedrock, args.model, chunk, args.dim)
            except Exception as e:  # noqa: BLE001
                embed_failures += 1
                print(f"  embed failed {pk} chunk {i}: {e}")
                continue
            actions.append(
                {
                    "_index": CHUNK_INDEX,
                    "_id": f"{pk}::{i}",
                    "_source": {
                        "parent_pk": pk,
                        "chunk_index": i,
                        "chunk_type": "resume",
                        "text": chunk,
                        "vector": vector,
                    },
                }
            )
        if actions:
            bulk(client, actions, raise_on_error=False)
            total_chunks += len(actions)
        done += 1
        if done % 20 == 0:
            print(f"  {done}/{len(items)} candidates, {total_chunks} chunks...")

    client.indices.refresh(index=CHUNK_INDEX)
    print(f"Done. {done} candidates, {total_chunks} chunks indexed, {embed_failures} embed failures.")


if __name__ == "__main__":
    main()
