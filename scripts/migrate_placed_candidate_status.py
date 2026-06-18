"""
Migrate talent profiles with the retired "Placed Candidate" status to
"Placed at Other Company".

The "Placed Candidate" status was split into two distinct statuses:
"Placed at Other Company" and "Placed with us". Since there is no way to
retroactively know which placements were made by this agency, every
existing "Placed Candidate" record is migrated to "Placed at Other
Company". Any records that should instead be "Placed with us" need to be
moved manually afterward (e.g. via the dashboard's status dropdown).

Usage:
    python scripts/migrate_placed_candidate_status.py --dry-run
    python scripts/migrate_placed_candidate_status.py --env dev --region us-east-1

Uses the standard table naming convention:
    aimory-talent-pool-{env}-talent-profiles
"""

import argparse

import boto3
from boto3.dynamodb.conditions import Attr

OLD_STATUS = "Placed Candidate"
NEW_STATUS = "Placed at Other Company"


def _scan_matching(table):
    items = []
    kwargs = {"FilterExpression": Attr("status").eq(OLD_STATUS)}
    while True:
        resp = table.scan(**kwargs)
        items.extend(resp.get("Items", []))
        if not resp.get("LastEvaluatedKey"):
            break
        kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]
    return items


def main():
    parser = argparse.ArgumentParser(
        description="Migrate 'Placed Candidate' status to 'Placed at Other Company'"
    )
    parser.add_argument("--env", default="dev", help="Environment (dev/staging/prod)")
    parser.add_argument("--region", default="us-east-1", help="AWS region")
    parser.add_argument(
        "--dry-run", action="store_true", help="Preview changes without applying them"
    )
    args = parser.parse_args()

    table_name = f"aimory-talent-pool-{args.env}-talent-profiles"
    dynamodb = boto3.resource("dynamodb", region_name=args.region)
    table = dynamodb.Table(table_name)

    print(f"Scanning {table_name} for status == {OLD_STATUS!r}...")
    items = _scan_matching(table)
    print(f"Found {len(items)} matching profile(s)")

    if args.dry_run:
        for item in items:
            print(f"  Would update {item['pk']}: {OLD_STATUS!r} -> {NEW_STATUS!r}")
        print("\nDry run complete. No changes written.")
        return

    for item in items:
        table.update_item(
            Key={"pk": item["pk"]},
            UpdateExpression="SET #status = :new_status",
            ExpressionAttributeNames={"#status": "status"},
            ExpressionAttributeValues={":new_status": NEW_STATUS},
        )
    print(f"\nUpdated {len(items)} profile(s) to {NEW_STATUS!r}.")


if __name__ == "__main__":
    main()
