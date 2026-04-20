"""
Backfill lookup tables from existing talent profiles in DynamoDB.

Scans the talent_profiles table and populates the lookup tables for:
  - skills, certifications, cities, job_titles, industry_categories

Usage:
    python scripts/backfill_lookups.py --region us-east-1

Uses the standard table naming convention:
    aimory-talent-pool-{env}-{table-name}

The script is idempotent — running it again will upsert existing entries.
"""

import argparse

import boto3


ENV = "dev"
PREFIX = f"aimory-talent-pool-{ENV}"

TABLE_NAMES = {
    "profiles": f"{PREFIX}-talent-profiles",
    "skills": f"{PREFIX}-skills-lookup",
    "certifications": f"{PREFIX}-certifications-lookup",
    "cities": f"{PREFIX}-cities-lookup",
    "job_titles": f"{PREFIX}-job-titles-lookup",
    "industry_categories": f"{PREFIX}-industry-categories-lookup",
    "tags": f"{PREFIX}-tags-lookup",
}


def _scan_all(table):
    items = []
    kwargs = {}
    while True:
        resp = table.scan(**kwargs)
        items.extend(resp.get("Items", []))
        if not resp.get("LastEvaluatedKey"):
            break
        kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]
    return items


def main():
    parser = argparse.ArgumentParser(description="Backfill lookup tables from talent profiles")
    parser.add_argument("--region", default="us-east-1", help="AWS region")
    parser.add_argument("--env", default="dev", help="Environment (dev/staging/prod)")
    args = parser.parse_args()

    global ENV, PREFIX, TABLE_NAMES
    ENV = args.env
    PREFIX = f"aimory-talent-pool-{ENV}"
    TABLE_NAMES = {
        "profiles": f"{PREFIX}-talent-profiles",
        "skills": f"{PREFIX}-skills-lookup",
        "certifications": f"{PREFIX}-certifications-lookup",
        "cities": f"{PREFIX}-cities-lookup",
        "job_titles": f"{PREFIX}-job-titles-lookup",
        "industry_categories": f"{PREFIX}-industry-categories-lookup",
        "tags": f"{PREFIX}-tags-lookup",
    }

    dynamodb = boto3.resource("dynamodb", region_name=args.region)
    profiles_table = dynamodb.Table(TABLE_NAMES["profiles"])

    print(f"Scanning {TABLE_NAMES['profiles']}...")
    items = _scan_all(profiles_table)
    print(f"Found {len(items)} profiles")

    skills = set()
    certifications = set()
    cities = set()  # (city, state) tuples
    job_titles = set()
    industry_categories = set()
    tags = set()

    for item in items:
        # Skills from skillsets list
        for skill in item.get("skillsets", []):
            name = skill.get("name", "").strip() if isinstance(skill, dict) else ""
            if name:
                skills.add(name)

        # Certifications
        for cert in item.get("certifications", []):
            c = cert.strip() if isinstance(cert, str) else ""
            if c:
                certifications.add(c)

        # City/state from location map
        loc = item.get("location", {})
        if isinstance(loc, dict):
            city = (loc.get("city") or "").strip()
            state = (loc.get("state") or "").strip()
            if city and state:
                cities.add((city, state))

        # Job title
        jt = (item.get("job_title") or "").strip()
        if jt:
            job_titles.add(jt)

        # Industry category
        ic = (item.get("industry_category") or "").strip()
        if ic:
            industry_categories.add(ic)

        # Tags
        import json

        t = item.get("tags", [])
        if isinstance(t, str):
            try:
                t = json.loads(t)
            except (json.JSONDecodeError, ValueError):
                t = []
        if isinstance(t, list):
            for tag in t:
                if isinstance(tag, str) and tag.strip():
                    tags.add(tag.strip())

    print(f"\nUnique values found:")
    print(f"  Skills:              {len(skills)}")
    print(f"  Certifications:      {len(certifications)}")
    print(f"  Cities:              {len(cities)}")
    print(f"  Job titles:          {len(job_titles)}")
    print(f"  Industry categories: {len(industry_categories)}")
    print(f"  Tags:                {len(tags)}")

    # Write skills
    tbl = dynamodb.Table(TABLE_NAMES["skills"])
    with tbl.batch_writer() as batch:
        for s in skills:
            batch.put_item(Item={"skill": s})
    print(f"\nWrote {len(skills)} skills")

    # Write certifications
    tbl = dynamodb.Table(TABLE_NAMES["certifications"])
    with tbl.batch_writer() as batch:
        for c in certifications:
            batch.put_item(Item={"certification": c})
    print(f"Wrote {len(certifications)} certifications")

    # Write cities
    tbl = dynamodb.Table(TABLE_NAMES["cities"])
    with tbl.batch_writer() as batch:
        for city, state in cities:
            batch.put_item(Item={"city": city, "state": state})
    print(f"Wrote {len(cities)} cities")

    # Write job titles
    tbl = dynamodb.Table(TABLE_NAMES["job_titles"])
    with tbl.batch_writer() as batch:
        for jt in job_titles:
            batch.put_item(Item={"job_title": jt})
    print(f"Wrote {len(job_titles)} job titles")

    # Write industry categories
    tbl = dynamodb.Table(TABLE_NAMES["industry_categories"])
    with tbl.batch_writer() as batch:
        for ic in industry_categories:
            batch.put_item(Item={"industry_category": ic})
    print(f"Wrote {len(industry_categories)} industry categories")

    # Write tags
    if tags:
        tbl = dynamodb.Table(TABLE_NAMES["tags"])
        with tbl.batch_writer() as batch:
            for tag in tags:
                batch.put_item(Item={"tag": tag})
    print(f"Wrote {len(tags)} tags")

    print("\nDone!")


if __name__ == "__main__":
    main()
