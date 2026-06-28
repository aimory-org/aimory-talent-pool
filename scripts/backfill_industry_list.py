"""
Backfill the OpenSearch `industry_category_list` field for existing talent profiles.

The multi-industry feature stores `industry_category` as a comma-separated display string
and relies on a split `industry_category_list` keyword field in OpenSearch for AND-term
filtering. Documents indexed before that field existed lack it, so they silently drop out
of industry filters once `list_talents` queries the new field.

This script runs an OpenSearch `update_by_query` that splits each document's existing
`industry_category` string into the `industry_category_list` keyword array, server-side.
No LLM/Textract cost, no DynamoDB stream dependency, and idempotent (safe to re-run).

NOTE: re-writing the DynamoDB items unchanged does NOT work for this — DynamoDB suppresses
stream records when the new image is identical to the old image, so `sync_to_opensearch`
never fires. Updating OpenSearch directly is the reliable path.

Run this AFTER `terraform apply` (so the `industry_category_list` keyword mapping exists).

Usage:
    python scripts/backfill_industry_list.py \
        --endpoint search-...-.us-east-1.es.amazonaws.com [--region us-east-1] [--dry-run]
"""

import argparse

import boto3
from opensearchpy import AWSV4SignerAuth, OpenSearch, RequestsHttpConnection

INDEX_NAME = "talent-profiles"

# Painless: split the comma-separated industry_category string into a trimmed,
# non-empty keyword list. Leaves docs without an industry_category untouched.
_PAINLESS = (
    "if (ctx._source.industry_category != null) {"
    "  def parts = ctx._source.industry_category.splitOnToken(',');"
    "  def out = [];"
    "  for (p in parts) { def t = p.trim(); if (t.length() > 0) { out.add(t); } }"
    "  ctx._source.industry_category_list = out;"
    "}"
)


def _client(endpoint, region):
    auth = AWSV4SignerAuth(boto3.Session().get_credentials(), region, "es")
    return OpenSearch(
        hosts=[{"host": endpoint, "port": 443}],
        http_auth=auth,
        use_ssl=True,
        verify_certs=True,
        connection_class=RequestsHttpConnection,
        timeout=120,
    )


def main():
    parser = argparse.ArgumentParser(description="Populate industry_category_list on existing OpenSearch docs")
    parser.add_argument("--endpoint", required=True, help="OpenSearch domain endpoint (no https://)")
    parser.add_argument("--region", default="us-east-1", help="AWS region")
    parser.add_argument("--dry-run", action="store_true", help="Count affected docs without updating")
    args = parser.parse_args()

    client = _client(args.endpoint, args.region)

    total = client.count(index=INDEX_NAME)["count"]
    print(f"Index {INDEX_NAME}: {total} documents")

    if args.dry_run:
        print(f"[dry-run] Would run update_by_query to populate industry_category_list on up to {total} docs.")
        return

    resp = client.update_by_query(
        index=INDEX_NAME,
        body={"script": {"source": _PAINLESS, "lang": "painless"}, "query": {"match_all": {}}},
        refresh=True,
        conflicts="proceed",
        wait_for_completion=True,
    )
    print(f"Done. updated={resp.get('updated')} total={resp.get('total')} conflicts={resp.get('version_conflicts')}")


if __name__ == "__main__":
    main()
