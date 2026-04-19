"""
Reprocess all resumes through the Step Functions pipeline.

Lists all objects under the raw/ prefix in the resume S3 bucket and starts
a new Step Functions execution for each one. This is useful after data model
changes to re-extract and re-persist all talent profiles.

Usage:
    # Fire-and-forget (old behaviour)
    python scripts/reprocess_resumes.py \
        --bucket  aimory-dev-resumes \
        --sfn-arn arn:aws:states:us-east-1:123456789012:stateMachine:aimory-dev-pipeline

    # Batched with wait — processes N at a time, waits for completion, then next batch.
    # This ensures lookup tables are populated between batches for consistent skill names.
    python scripts/reprocess_resumes.py \
        --bucket  aimory-dev-resumes \
        --sfn-arn arn:aws:states:us-east-1:123456789012:stateMachine:aimory-dev-pipeline \
        --batch-size 5

    # Full clean reprocess with batching
    python scripts/reprocess_resumes.py \
        --bucket  aimory-dev-resumes \
        --sfn-arn arn:aws:states:us-east-1:123456789012:stateMachine:aimory-dev-pipeline \
        --batch-size 5 \
        --clear-lookups skills=TABLE certs=TABLE cities=TABLE job_titles=TABLE industry_categories=TABLE

The script throttles executions to avoid hitting Step Functions rate limits.
"""

import argparse
import json
import time

import boto3


def _clear_table(dynamodb, table_name, key_attrs):
    """Delete all items from a DynamoDB table. key_attrs is a list of key attribute names."""
    table = dynamodb.Table(table_name)
    count = 0
    # Use expression attribute names to avoid reserved word conflicts (e.g. "state")
    expr_names = {f"#k{i}": attr for i, attr in enumerate(key_attrs)}
    projection = ", ".join(expr_names.keys())
    kwargs = {"ProjectionExpression": projection, "ExpressionAttributeNames": expr_names}
    while True:
        response = table.scan(**kwargs)
        items = response.get("Items", [])
        with table.batch_writer() as batch:
            for item in items:
                batch.delete_item(Key={k: item[k] for k in key_attrs})
                count += 1
        if not response.get("LastEvaluatedKey"):
            break
        kwargs["ExclusiveStartKey"] = response["LastEvaluatedKey"]
    return count


def _list_objects(s3, bucket, prefix):
    """List all S3 object keys under the given prefix, handling pagination."""
    keys = []
    kwargs = {"Bucket": bucket, "Prefix": prefix}
    while True:
        response = s3.list_objects_v2(**kwargs)
        for obj in response.get("Contents", []):
            key = obj["Key"]
            # Skip "directory" markers
            if not key.endswith("/"):
                keys.append(key)
        if not response.get("IsTruncated"):
            break
        kwargs["ContinuationToken"] = response["NextContinuationToken"]
    return keys


def _start_execution(sfn, sfn_arn, bucket, key, label):
    """Start a single SFN execution. Returns (key, execution_arn) or (key, None) on failure."""
    sfn_input = json.dumps({"bucket": bucket, "key": key})
    try:
        resp = sfn.start_execution(stateMachineArn=sfn_arn, input=sfn_input)
        print(f"  {label} Started: {key}")
        return key, resp["executionArn"]
    except Exception as e:
        print(f"  {label} FAILED to start: {key} — {e}")
        return key, None


def _wait_for_executions(sfn, executions, poll_interval):
    """Poll until all executions reach a terminal state. Returns (succeeded, failed) counts."""
    pending = dict(executions)  # key -> execution_arn
    succeeded = 0
    failed = 0
    while pending:
        time.sleep(poll_interval)
        still_pending = {}
        for key, arn in pending.items():
            try:
                resp = sfn.describe_execution(executionArn=arn)
                status = resp["status"]
            except Exception as e:
                print(f"    Error polling {key}: {e}")
                still_pending[key] = arn
                continue
            if status == "SUCCEEDED":
                succeeded += 1
                print(f"    ✓ {key}")
            elif status in ("FAILED", "TIMED_OUT", "ABORTED"):
                failed += 1
                print(f"    ✗ {key} — {status}")
            else:
                still_pending[key] = arn
        remaining = len(still_pending)
        if remaining:
            print(f"    … {remaining} still running")
        pending = still_pending
    return succeeded, failed


def _run_fire_and_forget(sfn, args, keys):
    """Start all executions without waiting for completion."""
    succeeded = 0
    failed = 0
    for i, key in enumerate(keys, 1):
        label = f"[{i}/{len(keys)}]"
        _, arn = _start_execution(sfn, args.sfn_arn, args.bucket, key, label)
        if arn:
            succeeded += 1
        else:
            failed += 1
        if args.delay and i < len(keys):
            time.sleep(args.delay)
    print(f"\nDone. {succeeded} started, {failed} failed out of {len(keys)} total.")


def _run_batched(sfn, args, keys):
    """Process in batches of N, waiting for each batch to finish before starting the next."""
    batch_size = args.batch_size
    total = len(keys)
    batches = [keys[i : i + batch_size] for i in range(0, total, batch_size)]
    total_succeeded = 0
    total_failed = 0
    total_start_failures = 0

    print(f"\nProcessing {total} resumes in {len(batches)} batches of up to {batch_size}\n")

    for batch_num, batch_keys in enumerate(batches, 1):
        print(f"--- Batch {batch_num}/{len(batches)} ({len(batch_keys)} resumes) ---")
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
            s, f = _wait_for_executions(sfn, executions, args.poll_interval)
            total_succeeded += s
            total_failed += f
            print(f"  Batch {batch_num} done: {s} succeeded, {f} failed\n")
        else:
            print(f"  Batch {batch_num}: no executions started\n")

    print(
        f"\nAll batches complete. {total_succeeded} succeeded, {total_failed} failed, "
        f"{total_start_failures} failed to start, out of {total} total."
    )


def main():
    parser = argparse.ArgumentParser(description="Reprocess all resumes through the Step Functions pipeline")
    parser.add_argument("--bucket", required=True, help="S3 bucket containing resumes")
    parser.add_argument("--sfn-arn", required=True, help="Step Functions state machine ARN")
    parser.add_argument("--region", default="us-east-1", help="AWS region")
    parser.add_argument("--prefix", default="resumes/raw/", help="S3 key prefix to scan (default: resumes/raw/)")
    parser.add_argument("--dry-run", action="store_true", help="List files without starting executions")
    parser.add_argument(
        "--clear-lookups",
        nargs="*",
        metavar="KEY=TABLE",
        help="Clear lookup tables before reprocessing. Format: skills=TABLE certs=TABLE cities=TABLE job_titles=TABLE industry_categories=TABLE",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=0.5,
        help="Seconds between executions to avoid throttling (default: 0.5)",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=0,
        help="Process N resumes at a time, waiting for each batch to complete before starting the next. "
        "This ensures lookup tables are populated between batches for consistent AI-extracted values. "
        "0 = fire-and-forget (default, all at once). Recommended: 5 for clean reprocessing.",
    )
    parser.add_argument(
        "--poll-interval",
        type=float,
        default=15,
        help="Seconds between polls when waiting for batch completion (default: 15)",
    )
    args = parser.parse_args()

    s3 = boto3.client("s3", region_name=args.region)
    sfn = boto3.client("stepfunctions", region_name=args.region)

    # Clear lookup tables if requested
    if args.clear_lookups:
        dynamodb = boto3.resource("dynamodb", region_name=args.region)
        lookup_key_schemas = {
            "skills": ["skill"],
            "certs": ["certification"],
            "cities": ["city", "state"],
            "job_titles": ["job_title"],
            "industry_categories": ["industry_category"],
        }
        for entry in args.clear_lookups:
            if "=" not in entry:
                print(f"  Skipping invalid entry (expected KEY=TABLE): {entry}")
                continue
            lookup_type, table_name = entry.split("=", 1)
            if lookup_type not in lookup_key_schemas:
                print(f"  Unknown lookup type: {lookup_type} (expected: {', '.join(lookup_key_schemas)})")
                continue
            if args.dry_run:
                print(f"  [dry-run] Would clear {table_name}")
            else:
                deleted = _clear_table(dynamodb, table_name, lookup_key_schemas[lookup_type])
                print(f"  Cleared {table_name}: {deleted} items deleted")

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
