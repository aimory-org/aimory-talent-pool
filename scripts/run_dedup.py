"""
Manually invoke the lookup dedup Lambda to deduplicate lookup tables using AI.

Supports dry-run mode to preview changes before applying them.

Usage:
    # Dry run — show what would be changed
    python scripts/run_dedup.py --dry-run

    # Live run — apply changes
    python scripts/run_dedup.py

    # Specify environment and region
    python scripts/run_dedup.py --env dev --region us-east-1
"""

import argparse
import json
import sys

import boto3


def main():
    parser = argparse.ArgumentParser(description="Manually invoke the lookup dedup Lambda")
    parser.add_argument("--env", default="dev", help="Environment (dev/staging/prod)")
    parser.add_argument("--region", default="us-east-1", help="AWS region")
    parser.add_argument("--dry-run", action="store_true", help="Preview changes without applying")
    args = parser.parse_args()

    function_name = f"aimory-talent-pool-{args.env}-lookup-dedup"
    payload = {"dry_run": args.dry_run}
    mode = "DRY RUN" if args.dry_run else "LIVE"

    print(f"Invoking {function_name} ({mode})...")
    print()

    client = boto3.client("lambda", region_name=args.region)

    try:
        response = client.invoke(
            FunctionName=function_name,
            InvocationType="RequestResponse",
            Payload=json.dumps(payload).encode(),
        )
    except client.exceptions.ResourceNotFoundException:
        print(f"Error: Lambda function '{function_name}' not found.")
        sys.exit(1)

    status_code = response["StatusCode"]
    result_payload = json.loads(response["Payload"].read().decode())

    if "FunctionError" in response:
        print(f"Lambda error (status {status_code}):")
        print(json.dumps(result_payload, indent=2))
        sys.exit(1)

    # Print summary
    renames = result_payload.get("renames", {})
    removals = result_payload.get("removals", {})
    profiles_updated = result_payload.get("profiles_updated", 0)
    rename_details = result_payload.get("rename_details", {})
    removal_details = result_payload.get("removal_details", {})

    if not renames and not removals:
        print(result_payload.get("message", "No duplicates found."))
        return

    # Show rename details
    for type_name, count in renames.items():
        details = rename_details.get(type_name, {})
        print(f"{type_name}: {count} rename(s)")
        for old, canonical in sorted(details.items()):
            print(f"  {old!r} -> {canonical!r}")
        print()

    # Show removal details
    for type_name, count in removals.items():
        details = removal_details.get(type_name, [])
        print(f"{type_name}: {count} removal(s)")
        for name in sorted(details):
            print(f"  {name!r}")
        print()

    print(f"Profiles updated: {profiles_updated}")

    if args.dry_run:
        print("\nThis was a dry run. Run without --dry-run to apply changes.")


if __name__ == "__main__":
    main()
