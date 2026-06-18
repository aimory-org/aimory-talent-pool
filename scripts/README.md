# Scripts

Operational scripts for managing the AIMORY Talent Pool backend. All scripts require AWS credentials configured in your environment (`aws configure` or via environment variables).

## Prerequisites

```bash
pip install -r requirements-dev.txt
```

Required AWS permissions: DynamoDB, Lambda, S3, Step Functions.

## Scripts

### `backfill_lookups.py`

Scans the `talent_profiles` DynamoDB table and repopulates all lookup tables (skills, certifications, cities, job titles, industry categories, tags) from the existing profile data.

**When to use:** After manually editing DynamoDB profiles directly, or if lookup tables become out of sync with profile data.

**Idempotent:** Safe to run multiple times.

```bash
python scripts/backfill_lookups.py
python scripts/backfill_lookups.py --env dev --region us-east-1
```

| Flag | Default | Description |
|------|---------|-------------|
| `--env` | `dev` | Environment name (dev / staging / prod) |
| `--region` | `us-east-1` | AWS region |

---

### `backfill_opensearch.py`

Bulk-indexes all records from the `talent_profiles` DynamoDB table into OpenSearch. Converts comma-separated `skill_names` and `cert_names` fields into arrays for term-level queries.

**When to use:**
- After recreating an OpenSearch index
- After OpenSearch sync falls behind DynamoDB (e.g., DynamoDB Streams outage)

**Idempotent:** Re-running upserts existing documents without duplication.

```bash
python scripts/backfill_opensearch.py \
  --table   aimory-talent-pool-dev-talent-profiles \
  --endpoint <opensearch-endpoint-without-https://> \
  --region  us-east-1
```

| Flag | Required | Description |
|------|----------|-------------|
| `--table` | Yes | DynamoDB table name |
| `--endpoint` | Yes | OpenSearch domain endpoint (no `https://`) |
| `--region` | No (default: `us-east-1`) | AWS region |

---

### `reprocess_resumes.py`

Lists all objects under the `raw/` prefix in the resume S3 bucket and triggers a new Step Functions execution for each. Useful after pipeline logic changes when you want all existing resumes re-extracted and re-persisted.

Supports a `--batch-size` mode that waits for each batch to complete before starting the next, preventing Step Functions rate limit errors and allowing lookup tables to stabilize between batches.

```bash
# Process all resumes (fire-and-forget)
python scripts/reprocess_resumes.py \
  --bucket  aimory-talent-pool-dev-resumes \
  --sfn-arn arn:aws:states:us-east-1:123456789012:stateMachine:aimory-talent-pool-dev-pipeline

# Batched with wait (recommended for large datasets)
python scripts/reprocess_resumes.py \
  --bucket     aimory-talent-pool-dev-resumes \
  --sfn-arn    arn:aws:states:... \
  --batch-size 5

# Full clean reprocess — clear lookup tables first, then reprocess in batches
python scripts/reprocess_resumes.py \
  --bucket        aimory-talent-pool-dev-resumes \
  --sfn-arn       arn:aws:states:... \
  --batch-size    5 \
  --clear-lookups skills=TABLE_NAME certs=TABLE_NAME cities=TABLE_NAME
```

| Flag | Required | Description |
|------|----------|-------------|
| `--bucket` | Yes | S3 bucket name |
| `--sfn-arn` | Yes | Step Functions state machine ARN |
| `--batch-size` | No | Process N at a time, waiting for completion between batches |
| `--clear-lookups` | No | Clear specified lookup tables before processing |

---

### `reprocess_job_descriptions.py`

Lists all objects under the `job-descriptions/raw/` prefix and triggers a new JD pipeline Step Functions execution for each file.

Supports `--batch-size` mode to process in controlled batches and wait for completion between batches.

```bash
# Process all job descriptions (fire-and-forget)
python scripts/reprocess_job_descriptions.py \
  --bucket  aimory-talent-pool-dev-resumes \
  --sfn-arn arn:aws:states:us-east-1:123456789012:stateMachine:aimory-talent-pool-dev-jd-pipeline

# Batched with wait (recommended for large datasets)
python scripts/reprocess_job_descriptions.py \
  --bucket     aimory-talent-pool-dev-resumes \
  --sfn-arn    arn:aws:states:... \
  --batch-size 5
```

| Flag | Required | Description |
|------|----------|-------------|
| `--bucket` | Yes | S3 bucket name |
| `--sfn-arn` | Yes | JD pipeline Step Functions state machine ARN |
| `--prefix` | No | Prefix to scan (default: `job-descriptions/raw/`) |
| `--batch-size` | No | Process N at a time, waiting for completion between batches |

Note: JD persist currently writes new UUID primary keys, so reprocessing creates new JD records rather than updating existing rows in place.

---

### `run_dedup.py`

Invokes the `aimory-talent-pool-{env}-lookup-dedup` Lambda, which uses Claude (Bedrock) to identify and canonicalize near-duplicate lookup entries (e.g., "JavaScript" vs "Javascript" vs "JS"). Changes are applied to both the lookup tables and all affected profiles.

**Always run with `--dry-run` first** to review changes before applying.

```bash
# Preview what would be changed
python scripts/run_dedup.py --dry-run

# Apply changes
python scripts/run_dedup.py

# Specify environment and region
python scripts/run_dedup.py --env dev --region us-east-1
```

| Flag | Default | Description |
|------|---------|-------------|
| `--env` | `dev` | Environment name |
| `--region` | `us-east-1` | AWS region |
| `--dry-run` | off | Preview changes without applying them |
