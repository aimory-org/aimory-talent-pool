"""
Reprocess all job descriptions through the JD Step Functions pipeline.

Lists all objects under the job-description raw prefix in S3 and starts a
new Step Functions execution for each one.  Use --clean to delete old JD
records from DynamoDB before reprocessing (prevents duplicates).

Usage:
    # Fire-and-forget (looks up bucket/SFN from Terraform outputs)
    python scripts/reprocess_job_descriptions.py --env dev

    # With explicit bucket/SFN
    python scripts/reprocess_job_descriptions.py \
        --bucket  aimory-dev-resumes \
        --sfn-arn arn:aws:states:us-east-1:123456789012:stateMachine:aimory-dev-jd-pipeline

    # Clean old records first, then reprocess in batches
    python scripts/reprocess_job_descriptions.py --env dev --clean --batch-size 5
"""

import argparse
import json
import time

import boto3


def _list_objects(s3, bucket, prefix):
    """List all S3 object keys under the given prefix, handling pagination."""
    keys = []
    kwargs = {"Bucket": bucket, "Prefix": prefix}
    while True:
        response = s3.list_objects_v2(**kwargs)
        for obj in response.get("Contents", []):
            key = obj["Key"]
            if not key.endswith("/"):
                keys.append(key)
        if not response.get("IsTruncated"):
            break
        kwargs["ContinuationToken"] = response["NextContinuationToken"]
    return keys


def _start_execution(sfn, sfn_arn, bucket, key, label):
    """Start one SFN execution. Returns (key, execution_arn) or (key, None)."""
    sfn_input = json.dumps({"bucket": bucket, "key": key})
    try:
        resp = sfn.start_execution(stateMachineArn=sfn_arn, input=sfn_input)
        print(f"  {label} Started: {key}")
        return key, resp["executionArn"]
    except Exception as exc:
        print(f"  {label} FAILED to start: {key} - {exc}")
        return key, None


def _wait_for_executions(sfn, executions, poll_interval):
    """Poll execution ARNs until all have terminal status."""
    pending = dict(executions)
    succeeded = 0
    failed = 0

    while pending:
        time.sleep(poll_interval)
        still_pending = {}
        for key, arn in pending.items():
            try:
                resp = sfn.describe_execution(executionArn=arn)
                status = resp["status"]
            except Exception as exc:
                print(f"    Error polling {key}: {exc}")
                still_pending[key] = arn
                continue

            if status == "SUCCEEDED":
                succeeded += 1
                print(f"    OK: {key}")
            elif status in ("FAILED", "TIMED_OUT", "ABORTED"):
                failed += 1
                print(f"    FAIL: {key} - {status}")
            else:
                still_pending[key] = arn

        if still_pending:
            print(f"    ... {len(still_pending)} still running")
        pending = still_pending

    return succeeded, failed


def _run_fire_and_forget(sfn, args, keys):
    """Start all executions without waiting for completion."""
    started = 0
    failed = 0

    for i, key in enumerate(keys, 1):
        label = f"[{i}/{len(keys)}]"
        _, arn = _start_execution(sfn, args.sfn_arn, args.bucket, key, label)
        if arn:
            started += 1
        else:
            failed += 1

        if args.delay and i < len(keys):
            time.sleep(args.delay)

    print(f"\nDone. {started} started, {failed} failed out of {len(keys)} total.")


def _run_batched(sfn, args, keys):
    """Process N keys at a time, waiting between batches."""
    batch_size = args.batch_size
    total = len(keys)
    batches = [keys[i : i + batch_size] for i in range(0, total, batch_size)]

    total_succeeded = 0
    total_failed = 0
    total_start_failures = 0

    print(f"\nProcessing {total} job descriptions in {len(batches)} batches of up to {batch_size}\n")

    for batch_num, batch_keys in enumerate(batches, 1):
        print(f"--- Batch {batch_num}/{len(batches)} ({len(batch_keys)} files) ---")
        executions = []

        for i, key in enumerate(batch_keys, 1):
            global_idx = (batch_num - 1) * batch_size + i
            label = f"[{global_idx}/{total}]"
            key_name, arn = _start_execution(sfn, args.sfn_arn, args.bucket, key, label)
            if arn:
                executions.append((key_name, arn))
            else:
                total_start_failures += 1

            if args.delay and i < len(batch_keys):
                time.sleep(args.delay)

        if executions:
            print(f"\n  Waiting for {len(executions)} executions to complete (polling every {args.poll_interval}s)...")
            succeeded, failed = _wait_for_executions(sfn, executions, args.poll_interval)
            total_succeeded += succeeded
            total_failed += failed
            print(f"  Batch {batch_num} done: {succeeded} succeeded, {failed} failed\n")
        else:
            print(f"  Batch {batch_num}: no executions started\n")

    print(
        f"\nAll batches complete. {total_succeeded} succeeded, {total_failed} failed, "
        f"{total_start_failures} failed to start, out of {total} total."
    )


def _clean_old_jd_records(region, table_name, dry_run=False):
    """Delete all existing JD records before a full reprocess."""
    ddb = boto3.resource("dynamodb", region_name=region)
    table = ddb.Table(table_name)

    print(f"Scanning {table_name} for existing JD records...")
    kwargs = {}
    all_items = []
    while True:
        resp = table.scan(
            ProjectionExpression="pk, title",
            **kwargs,
        )
        all_items.extend(resp.get("Items", []))
        if "LastEvaluatedKey" not in resp:
            break
        kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]

    if not all_items:
        print("  No JD records found.")
        return 0

    print(f"  Found {len(all_items)} records to delete")
    for item in all_items:
        if dry_run:
            print(f"    [dry-run] Would delete: {item.get('title', '?')!r}")
        else:
            table.delete_item(Key={"pk": item["pk"]})
            print(f"    Deleted: {item.get('title', '?')!r}")

    return len(all_items)


def _resolve_env_args(env, region):
    """Look up bucket and SFN ARN from Terraform outputs via SSM/naming convention."""
    project = "aimory-talent-pool"
    bucket = f"{project}-{env}-resumes-290088417978"
    # Get SFN ARN from the known naming pattern
    sfn = boto3.client("stepfunctions", region_name=region)
    sfn_arn = f"arn:aws:states:{region}:290088417978:stateMachine:{project}-{env}-jd-pipeline"
    jd_table = f"{project}-{env}-job-descriptions"
    return bucket, sfn_arn, jd_table


def main():
    parser = argparse.ArgumentParser(description="Reprocess all job descriptions through Step Functions")
    parser.add_argument("--env", help="Environment (dev/staging/prod) — auto-resolves bucket and SFN ARN")
    parser.add_argument("--bucket", help="S3 bucket containing job description files")
    parser.add_argument("--sfn-arn", help="Step Functions state machine ARN for JD pipeline")
    parser.add_argument("--region", default="us-east-1", help="AWS region")
    parser.add_argument(
        "--prefix",
        default="job-descriptions/raw/",
        help="S3 key prefix to scan (default: job-descriptions/raw/)",
    )
    parser.add_argument("--dry-run", action="store_true", help="List files without starting executions")
    parser.add_argument(
        "--clean",
        action="store_true",
        help="Delete all existing JD records before reprocessing (prevents duplicates)",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=0.5,
        help="Seconds between execution starts to avoid throttling (default: 0.5)",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=0,
        help="Process N files at a time, waiting for each batch to finish. 0 = fire-and-forget.",
    )
    parser.add_argument(
        "--poll-interval",
        type=float,
        default=15,
        help="Seconds between status polls in batch mode (default: 15)",
    )
    args = parser.parse_args()

    # Resolve env-based args
    if args.env:
        bucket, sfn_arn, jd_table = _resolve_env_args(args.env, args.region)
        if not args.bucket:
            args.bucket = bucket
        if not args.sfn_arn:
            args.sfn_arn = sfn_arn
    else:
        jd_table = None

    if not args.bucket or not args.sfn_arn:
        parser.error("Either --env or both --bucket and --sfn-arn are required")

    # Clean old records if requested
    if args.clean:
        if not jd_table and args.env:
            jd_table = f"aimory-talent-pool-{args.env}-job-descriptions"
        if jd_table:
            deleted = _clean_old_jd_records(args.region, jd_table, args.dry_run)
            if deleted:
                print()
        else:
            print("Warning: --clean requires --env to know the JD table name. Skipping cleanup.\n")

    s3 = boto3.client("s3", region_name=args.region)
    sfn = boto3.client("stepfunctions", region_name=args.region)

    print(f"Listing objects in s3://{args.bucket}/{args.prefix} ...")
    keys = _list_objects(s3, args.bucket, args.prefix)
    print(f"Found {len(keys)} objects")

    if not keys:
        print("Nothing to reprocess.")
        return

    if args.dry_run:
        for key in keys:
            print(f"  [dry-run] {key}")
        print(f"\nDry run complete. {len(keys)} files would be reprocessed.")
        return

    if args.batch_size > 0:
        _run_batched(sfn, args, keys)
    else:
        _run_fire_and_forget(sfn, args, keys)


if __name__ == "__main__":
    main()
