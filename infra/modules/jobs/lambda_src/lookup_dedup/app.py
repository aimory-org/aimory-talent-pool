"""
Scheduled Lambda to deduplicate lookup tables using AI.

Scans skills, certifications, job_titles, and industry_categories lookup tables,
uses Bedrock Claude to identify near-duplicates, then updates all talent profiles
to use canonical names and cleans up the lookup tables.

Triggered weekly by EventBridge, or manually via:
    aws lambda invoke --function-name <name> --payload '{}' /dev/stdout
    aws lambda invoke --function-name <name> --payload '{"dry_run": true}' /dev/stdout
"""

import json
import os
import re
import time
from datetime import datetime, timezone

import boto3

PROFILES_TABLE = os.environ["TALENT_PROFILES_TABLE"]
AUDIT_LOG_TABLE = os.environ.get("AUDIT_LOG_TABLE", "")
SKILLS_TABLE = os.environ.get("SKILLS_LOOKUP_TABLE", "")
CERTS_TABLE = os.environ.get("CERTIFICATIONS_LOOKUP_TABLE", "")
JOB_TITLES_TABLE = os.environ.get("JOB_TITLES_LOOKUP_TABLE", "")
INDUSTRY_CAT_TABLE = os.environ.get("INDUSTRY_CATEGORIES_LOOKUP_TABLE", "")
CITIES_TABLE = os.environ.get("CITIES_LOOKUP_TABLE", "")
BEDROCK_MODEL_ID = os.environ.get("BEDROCK_MODEL_ID", "us.anthropic.claude-sonnet-4-20250514-v1:0")

dynamodb = boto3.resource("dynamodb")
bedrock = boto3.client("bedrock-runtime")
DEDUP_RUN_PK = "SYSTEM#LOOKUP_DEDUP_RUN"

# Lookup table configuration: (type_name, table_env, key_attr)
LOOKUP_CONFIGS = [
    ("skills", SKILLS_TABLE, "skill"),
    ("certifications", CERTS_TABLE, "certification"),
    ("job_titles", JOB_TITLES_TABLE, "job_title"),
    ("industry_categories", INDUSTRY_CAT_TABLE, "industry_category"),
]

DEDUP_PROMPT = """You are a data quality assistant. Given this list of {item_type} values
extracted from resumes, identify groups of duplicates or near-duplicates.

For each group, pick ONE canonical name (the most professional, standard, commonly-used form).

Return ONLY a JSON object with a "rename" key where:
- Keys are the duplicate names that should be RENAMED
- Values are the canonical name each should be renamed to

If no duplicates exist, return: {{"rename": {{}}}}

Rules:
- Case-only differences are duplicates: "agile" should map to "Agile"
- Abbreviation pairs — prefer the FULL spelled-out name:
  "AWS" → "Amazon Web Services", "GCP" → "Google Cloud Platform"
- Wording variations are duplicates: "Project Management Skills" → "Project Management"
- Suffix variations are duplicates: "Agile Methodologies" → "Agile"
- DO NOT group genuinely different concepts (e.g., "Python" and "Java" are NOT duplicates)
- Prefer the FULL, spelled-out canonical name (not abbreviations)
- EXCEPTIONS where the abbreviation IS the standard name:
  "SQL", "HTML", "CSS", "API", "REST", "DevOps", "CI/CD", "Power BI", "SAP"
- The canonical name itself must NOT appear as a key (only duplicates are keys)

Current {item_type} list ({count} items):
{items_json}"""

SKILLS_DEDUP_PROMPT = """You are a data quality assistant for a talent/recruiting platform.
Given this list of skills extracted from resumes, do TWO things:

1. Identify groups of duplicates or near-duplicates. For each group, pick ONE canonical name.
2. Identify skills that are too vague or generic to be useful for recruiter search and should be REMOVED entirely.

Return ONLY a JSON object with two keys:
- "rename": object where keys are duplicate names to rename, values are canonical names
- "remove": array of skill names that should be deleted entirely

Rename rules:
- Case-only differences are duplicates: "agile" → "Agile"
- Abbreviation pairs — prefer FULL names:
  "AWS" → "Amazon Web Services", "GCP" → "Google Cloud Platform",
  "AI/ML" → "Artificial Intelligence/Machine Learning"
- Wording variations are duplicates: "Project Management Skills" → "Project Management"
- DO NOT group genuinely different concepts
- Prefer the FULL, spelled-out canonical name (not abbreviations)
- EXCEPTIONS where the abbreviation IS the standard name:
  "SQL", "HTML", "CSS", "API", "REST", "DevOps", "CI/CD", "Power BI", "SAP"
- The canonical name itself must NOT appear as a rename key

Removal rules — flag skills that a recruiter would NEVER search for:
- Generic workplace activities: Briefing, Meetings, Filing, Scheduling, Emailing, Travel
- Trivially common abilities: Typing, Multitasking, Phone Skills, Reading, Writing
- Vague soft skills without substance: Teamwork, Collaboration, Detail-Oriented, Self-Motivated,
  Hard Working, Dependable, Reliable, Adaptability, Flexibility, Professionalism, Dedicated
- Overly broad terms: Research, Analysis, Organization, Planning, Training, Presentations,
  Documentation, Reporting, Customer Service, Interpersonal Skills, Critical Thinking
- Basic computer literacy: Microsoft Windows, Windows, Internet, Basic Computer Skills, Computer Skills
- DO NOT remove specific/searchable skills like: Agile, AWS, Python, Power BI, ITIL, Six Sigma,
  Financial Modeling, SAP, Kubernetes, Project Management, Data Analysis, Salesforce, etc.
- Rule of thumb: Would a recruiter type this into a search box? If not, remove it.

If nothing to rename or remove, use empty values: {{"rename": {{}}, "remove": []}}

Current skills list ({count} items):
{items_json}"""

CERTS_DEDUP_PROMPT = """You are a data quality assistant for a talent/recruiting platform.
Given this list of certifications extracted from resumes, do TWO things:

1. Identify groups of duplicates or near-duplicates. For each group, pick ONE canonical name.
2. Identify entries that are NOT actual certifications and should be REMOVED entirely.

Return ONLY a JSON object with two keys:
- "rename": object where keys are duplicate names to rename, values are canonical names
- "remove": array of entries that should be deleted entirely

Rename rules:
- Only rename when there are TRUE duplicates (two entries meaning the same thing)
- Use FULL official names with abbreviation in parentheses:
  "CSM" → "Certified Scrum Master (CSM)", "PMP" → "Project Management Professional (PMP)"
- Normalize versions: "ITIL v3" and "ITIL v3 Foundation" → "ITIL V3 Foundation"
- Merge synonyms: "CompTIA Security+ CE" → "CompTIA Security+"
- Prefer the FULL spelled-out name, not abbreviations
- Format: "Full Name (ABBREV)" when a well-known abbreviation exists
- IMPORTANT: If a name already contains both a descriptive name AND an abbreviation in
  parentheses, it is ALREADY in the correct format — do NOT rename it.
  Examples of CORRECT names that should NOT be renamed:
  "SAFe Agilist (SA)", "SAFe Scrum Master (SSM)", "SAFe DevOps Practitioner (SDP)",
  "Project Management Professional (PMP)", "Certified Scrum Master (CSM)"
- DO NOT append framework names, organization names, or other suffixes to cert names
- A rename key must NEVER map to the same value (that's a no-op)
- DO NOT group genuinely different certifications
- The canonical name itself must NOT appear as a rename key

Removal rules — flag entries that are NOT real certifications:
- Courses or training without a certification: "CCNA Preparation", "AWS Training", "Agile Workshop"
- Vague or unverifiable claims: "Certified Professional", "Various Certifications"
- Skills mistakenly listed as certs: "Python", "Microsoft Excel", "Project Management"
- In-progress or expired without completion: anything ending in "(in progress)" or "(expired)"
- DO NOT remove legitimate certifications: PMP, CISSP, CompTIA Security+, AWS Solutions Architect,
  CSM, ITIL, CPA, Six Sigma Green Belt, etc.
- Rule of thumb: Is this an actual credential issued by a recognized authority? If not, remove it.

If nothing to rename or remove, use empty values: {{"rename": {{}}, "remove": []}}

Current certifications list ({count} items):
{items_json}"""

CITIES_DEDUP_PROMPT = """You are a data quality assistant for a talent/recruiting platform.
Given this list of city/state pairs extracted from resumes, identify groups of duplicates
or near-duplicates that refer to the SAME city.

For each group, pick ONE canonical spelling.

Return ONLY a JSON object with a "rename" key where:
- Keys are the duplicate "city, state" strings that should be RENAMED
- Values are the canonical "city, state" string each should be renamed to

If no duplicates exist, return: {{"rename": {{}}}}

Rules:
- Fix misspellings: "Washingon, DC" → "Washington, DC"
- Normalize case: "arlington, VA" → "Arlington, VA"
- Merge equivalent names: "DC, DC" → "Washington, DC"
- State codes must stay as-is (two-letter abbreviations)
- DO NOT merge genuinely different cities (e.g., "Arlington, VA" and "Arlington, TX" are DIFFERENT)
- The canonical name itself must NOT appear as a key
- Format: "City, ST" (city name followed by comma, space, two-letter state code)

Current cities list ({count} items):
{items_json}"""

JOB_TITLES_DEDUP_PROMPT = """You are a data quality assistant for a talent/recruiting platform.
Given this list of job titles extracted from resumes, identify groups of duplicates or near-duplicates.

For each group, pick ONE canonical name (the most standard, commonly-used form).

Return ONLY a JSON object with a "rename" key where:
- Keys are the duplicate names that should be RENAMED
- Values are the canonical name each should be renamed to

If no duplicates exist, return: {{"rename": {{}}}}

Rules:
- Singular/plural variations: "Systems Engineer" and "System Engineer" are duplicates
- Abbreviation pairs — spell out fully: "Sr. Software Engineer" → "Senior Software Engineer"
- Wording variations: "SW Developer" → "Software Developer"
- Level normalization: "Dev III" → "Senior Developer" (use standard titles)
- Prefer the FULL, spelled-out title form (no abbreviations)
- DO NOT group genuinely different roles (e.g., "Data Analyst" and "Data Engineer" are NOT duplicates)
- DO NOT merge titles that differ only by seniority level
  (e.g., "Systems Engineer" and "Senior Systems Engineer" are DIFFERENT titles — keep both)
- The canonical name itself must NOT appear as a rename key

Current job titles list ({count} items):
{items_json}"""


def _scan_lookup_table(table_name, key_attr):
    """Scan a lookup table and return all values for the key attribute."""
    table = dynamodb.Table(table_name)
    items = []
    kwargs = {}
    while True:
        response = table.scan(**kwargs)
        for item in response.get("Items", []):
            val = item.get(key_attr, "").strip()
            if val:
                items.append(val)
        if "LastEvaluatedKey" not in response:
            break
        kwargs["ExclusiveStartKey"] = response["LastEvaluatedKey"]
    return sorted(set(items))


def _scan_cities_table(table_name):
    """Scan the cities lookup table and return 'city, state' strings."""
    table = dynamodb.Table(table_name)
    items = []
    kwargs = {}
    while True:
        response = table.scan(**kwargs)
        for item in response.get("Items", []):
            city = (item.get("city") or "").strip()
            state = (item.get("state") or "").strip()
            if city and state:
                items.append(f"{city}, {state}")
        if "LastEvaluatedKey" not in response:
            break
        kwargs["ExclusiveStartKey"] = response["LastEvaluatedKey"]
    return sorted(set(items))


def _parse_city_state(city_state_str):
    """Parse 'City, ST' into (city, state) tuple."""
    parts = city_state_str.rsplit(", ", 1)
    if len(parts) == 2:
        return parts[0].strip(), parts[1].strip()
    return city_state_str.strip(), ""


def _write_audit_entry(pk, timestamp, changes, candidate_name=None):
    if not AUDIT_LOG_TABLE or not changes:
        return

    item = {
        "pk": pk,
        "sk": f"{timestamp}#UPDATE",
        "action": "UPDATE",
        "timestamp": timestamp,
        "user_email": "dedup@system",
        "user_name": "Dedup",
        "changes": changes,
    }
    if candidate_name:
        item["candidate_name"] = candidate_name

    try:
        dynamodb.Table(AUDIT_LOG_TABLE).put_item(Item=item)
    except Exception as exc:
        print(f"Warning: failed to write dedup audit entry for {pk}: {exc}")


def _write_run_audit_entry(
    timestamp,
    details,
    profiles_updated,
    renames,
    removals,
    dry_run,
    trigger,
):
    if not AUDIT_LOG_TABLE or dry_run:
        return

    item = {
        "pk": DEDUP_RUN_PK,
        "sk": f"{timestamp}#UPDATE",
        "action": "UPDATE",
        "timestamp": timestamp,
        "user_email": "dedup@system",
        "user_name": "Dedup",
        "details": details,
        "snapshot": {
            "profiles_updated": profiles_updated,
            "renames": renames,
            "removals": removals,
            "dry_run": dry_run,
            "trigger": trigger,
        },
    }

    try:
        dynamodb.Table(AUDIT_LOG_TABLE).put_item(Item=item)
    except Exception as exc:
        print(f"Warning: failed to write dedup run audit entry: {exc}")


def _detect_run_trigger(event):
    explicit = str((event or {}).get("trigger", "")).strip().lower()
    if explicit in {"manual", "scheduled"}:
        return explicit

    source = str((event or {}).get("source", "")).strip().lower()
    detail_type = str((event or {}).get("detail-type", "")).strip().lower()

    if source == "aws.events" or "scheduled" in detail_type:
        return "scheduled"

    return "manual"


def _extract_json(text):
    """Extract JSON object from Claude's response, handling markdown code blocks."""
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # Try extracting from code block
    match = re.search(r"```(?:json)?\s*\n?(.*?)\n?```", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1).strip())
        except json.JSONDecodeError:
            pass
    # Try finding first { ... }
    match = re.search(r"\{[^{}]*\}", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass
    return {}


def _get_rename_map(item_type, items):
    """Use Bedrock Claude to identify duplicates and return a rename map."""
    if len(items) <= 1:
        return {}, []

    if item_type == "skills":
        prompt = SKILLS_DEDUP_PROMPT.format(
            count=len(items),
            items_json=json.dumps(items, indent=2),
        )
    elif item_type == "certifications":
        prompt = CERTS_DEDUP_PROMPT.format(
            count=len(items),
            items_json=json.dumps(items, indent=2),
        )
    elif item_type == "job_titles":
        prompt = JOB_TITLES_DEDUP_PROMPT.format(
            count=len(items),
            items_json=json.dumps(items, indent=2),
        )
    elif item_type == "cities":
        prompt = CITIES_DEDUP_PROMPT.format(
            count=len(items),
            items_json=json.dumps(items, indent=2),
        )
    else:
        prompt = DEDUP_PROMPT.format(
            item_type=item_type,
            count=len(items),
            items_json=json.dumps(items, indent=2),
        )

    max_retries = 5
    for attempt in range(max_retries):
        try:
            response = bedrock.converse(
                modelId=BEDROCK_MODEL_ID,
                messages=[{"role": "user", "content": [{"text": prompt}]}],
                inferenceConfig={"maxTokens": 4096, "temperature": 0},
            )
            text = response["output"]["message"]["content"][0]["text"]
            result = _extract_json(text)

            if not isinstance(result, dict):
                print(f"  Warning: Claude returned non-dict for {item_type}, skipping")
                return {}, []

            # Handle both old format (flat dict) and new format ({"rename": {}, "remove": []})
            if "rename" in result:
                raw_renames = result.get("rename", {})
                raw_removals = result.get("remove", [])
            else:
                raw_renames = result
                raw_removals = []

            # Validate renames
            validated = {}
            items_lower = {i.lower(): i for i in items}
            for old, canonical in raw_renames.items():
                if not isinstance(old, str) or not isinstance(canonical, str):
                    continue
                if old in items or old.lower() in items_lower:
                    actual_old = old if old in items else items_lower[old.lower()]
                    validated[actual_old] = canonical

            # Validate removals
            validated_removals = []
            for name in raw_removals:
                if not isinstance(name, str):
                    continue
                if name in items:
                    validated_removals.append(name)
                elif name.lower() in items_lower:
                    validated_removals.append(items_lower[name.lower()])

            return validated, validated_removals

        except bedrock.exceptions.ThrottlingException:
            if attempt < max_retries - 1:
                wait = 2 ** (attempt + 1)
                print(f"  Throttled on {item_type}, retrying in {wait}s...")
                time.sleep(wait)
            else:
                print(f"  Throttled on {item_type} after {max_retries} retries, skipping")
                return {}, []
        except Exception as e:
            print(f"  Error getting rename map for {item_type}: {e}")
            return {}, []


def _apply_skill_renames(skillsets, rename_map, removals=None):
    """Rename skills, remove useless ones, and dedup (merging evidence)."""
    if not skillsets:
        return skillsets, False

    remove_set = {r.lower() for r in (removals or [])}
    changed = False
    renamed = []
    for skill in skillsets:
        name = skill.get("name", "")
        # Remove useless skills
        if name.lower() in remove_set:
            changed = True
            continue
        if name in rename_map:
            skill = {**skill, "name": rename_map[name]}
            changed = True
        renamed.append(skill)

    # Dedup by canonical name, merging evidence
    seen = {}
    deduped = []
    for skill in renamed:
        key = skill["name"].lower()
        if key in seen:
            # Merge evidence into the first occurrence
            existing = deduped[seen[key]]
            existing_evidence = set(existing.get("evidence", []))
            for ev in skill.get("evidence", []):
                if ev not in existing_evidence:
                    existing["evidence"].append(ev)
            changed = True
        else:
            seen[key] = len(deduped)
            deduped.append(skill)

    return deduped, changed


def _apply_cert_renames(certifications, rename_map, removals=None):
    """Rename certifications, remove bogus ones, and dedup."""
    if not certifications:
        return certifications, False

    remove_set = {r.lower() for r in (removals or [])}
    changed = False
    renamed = []
    for cert in certifications:
        # Remove bogus certs
        if cert.lower() in remove_set:
            changed = True
            continue
        if cert in rename_map:
            renamed.append(rename_map[cert])
            changed = True
        else:
            renamed.append(cert)

    # Dedup (case-insensitive)
    seen = {}
    deduped = []
    for cert in renamed:
        key = cert.lower()
        if key not in seen:
            seen[key] = True
            deduped.append(cert)
        else:
            changed = True

    return deduped, changed


def _update_profiles(all_renames, all_removals, dry_run):
    """Scan all profiles and apply renames. Returns count of updated profiles."""
    skills_map = all_renames.get("skills", {})
    skills_removals = all_removals.get("skills", [])
    certs_map = all_renames.get("certifications", {})
    certs_removals = all_removals.get("certifications", [])
    titles_map = all_renames.get("job_titles", {})
    industry_map = all_renames.get("industry_categories", {})
    cities_map = all_renames.get("cities", {})
    # Pre-parse cities rename map into (old_city, old_state) -> (new_city, new_state)
    cities_parsed = {}
    for old_cs, new_cs in cities_map.items():
        old_city, old_state = _parse_city_state(old_cs)
        new_city, new_state = _parse_city_state(new_cs)
        if old_city and old_state and new_city and new_state:
            cities_parsed[(old_city, old_state)] = (new_city, new_state)

    table = dynamodb.Table(PROFILES_TABLE)
    updated = 0
    scanned = 0
    kwargs = {}

    while True:
        response = table.scan(**kwargs)
        items = response.get("Items", [])
        scanned += len(items)

        for item in items:
            pk = item["pk"]
            updates = {}
            changes = {}

            # Skills (rename + remove)
            if (skills_map or skills_removals) and item.get("skillsets"):
                new_skillsets, changed = _apply_skill_renames(item["skillsets"], skills_map, skills_removals)
                if changed:
                    updates["skillsets"] = new_skillsets
                    updates["skill_names"] = ",".join(s["name"] for s in new_skillsets)
                    changes["skillsets"] = {"old": item.get("skillsets"), "new": new_skillsets}

            # Certifications (rename + remove)
            if (certs_map or certs_removals) and item.get("certifications"):
                new_certs, changed = _apply_cert_renames(item["certifications"], certs_map, certs_removals)
                if changed:
                    updates["certifications"] = new_certs
                    updates["cert_names"] = ",".join(new_certs)
                    changes["certifications"] = {"old": item.get("certifications"), "new": new_certs}

            # Job title
            if titles_map and item.get("job_title") in titles_map:
                updates["job_title"] = titles_map[item["job_title"]]
                changes["job_title"] = {"old": item.get("job_title"), "new": updates["job_title"]}

            # Industry category
            if industry_map and item.get("industry_category") in industry_map:
                updates["industry_category"] = industry_map[item["industry_category"]]
                changes["industry_category"] = {
                    "old": item.get("industry_category"),
                    "new": updates["industry_category"],
                }

            # City (inside location map)
            if cities_parsed and isinstance(item.get("location"), dict):
                loc = item["location"]
                loc_city = (loc.get("city") or "").strip()
                loc_state = (loc.get("state") or "").strip()
                if (loc_city, loc_state) in cities_parsed:
                    new_city, new_state = cities_parsed[(loc_city, loc_state)]
                    updates["location"] = {**loc, "city": new_city, "state": new_state}
                    updates["location_state"] = new_state
                    changes["location"] = {"old": item.get("location"), "new": updates["location"]}

            if updates:
                updated += 1
                if dry_run:
                    print(f"  [dry-run] Would update {pk}: {list(updates.keys())}")
                else:
                    now = datetime.now(timezone.utc).isoformat()
                    updates["updated_at"] = now
                    expr_parts = []
                    expr_names = {}
                    expr_values = {}
                    for i, (field, value) in enumerate(updates.items()):
                        attr_name = f"#f{i}"
                        attr_val = f":v{i}"
                        expr_parts.append(f"{attr_name} = {attr_val}")
                        expr_names[attr_name] = field
                        expr_values[attr_val] = value
                    table.update_item(
                        Key={"pk": pk},
                        UpdateExpression="SET " + ", ".join(expr_parts),
                        ExpressionAttributeNames=expr_names,
                        ExpressionAttributeValues=expr_values,
                    )
                    _write_audit_entry(pk, now, changes, item.get("name"))
                    print(f"  Updated {pk}: {list(updates.keys())}")

        if "LastEvaluatedKey" not in response:
            break
        kwargs["ExclusiveStartKey"] = response["LastEvaluatedKey"]

    print(f"  Scanned {scanned} profiles, updated {updated}")
    return updated


def _cleanup_lookup_table(table_name, key_attr, rename_map, dry_run):
    """Delete old entries and ensure canonical entries exist in a lookup table."""
    table = dynamodb.Table(table_name)
    now = datetime.now(timezone.utc).isoformat()
    deleted = 0
    created = 0

    # Ensure all canonical values exist
    canonical_values = set(rename_map.values())
    for canonical in canonical_values:
        if dry_run:
            print(f"  [dry-run] Would ensure lookup entry: {canonical}")
        else:
            table.put_item(Item={key_attr: canonical, "updated_at": now})
            created += 1

    # Delete old (non-canonical) entries
    for old_name in rename_map:
        if old_name not in canonical_values:
            if dry_run:
                print(f"  [dry-run] Would delete lookup entry: {old_name}")
            else:
                table.delete_item(Key={key_attr: old_name})
                deleted += 1

    return created, deleted


def handler(event, context):
    dry_run = event.get("dry_run", False)
    run_trigger = _detect_run_trigger(event)
    mode = "DRY RUN" if dry_run else "LIVE"
    print(f"=== Lookup Dedup Job ({mode}) ===")

    # Step 1: Build rename maps and removal lists from each lookup table
    all_renames = {}
    all_removals = {}
    for type_name, table_name, key_attr in LOOKUP_CONFIGS:
        if not table_name:
            print(f"Skipping {type_name}: no table configured")
            continue

        print(f"\nScanning {type_name} ({table_name})...")
        items = _scan_lookup_table(table_name, key_attr)
        print(f"  Found {len(items)} unique values")

        if len(items) <= 1:
            print("  Nothing to dedup")
            continue

        rename_map, removals = _get_rename_map(type_name, items)
        if rename_map:
            print(f"  Found {len(rename_map)} duplicates to rename:")
            for old, canonical in sorted(rename_map.items()):
                print(f"    {old!r} -> {canonical!r}")
            all_renames[type_name] = rename_map
        if removals:
            print(f"  Found {len(removals)} useless entries to remove:")
            for name in sorted(removals):
                print(f"    {name!r}")
            all_removals[type_name] = removals
        if not rename_map and not removals:
            print("  No duplicates or useless entries found")

    # Cities dedup (composite key table — handled separately)
    if CITIES_TABLE:
        print(f"\nScanning cities ({CITIES_TABLE})...")
        city_items = _scan_cities_table(CITIES_TABLE)
        print(f"  Found {len(city_items)} unique city/state pairs")
        if len(city_items) > 1:
            city_renames, _ = _get_rename_map("cities", city_items)
            if city_renames:
                print(f"  Found {len(city_renames)} city duplicates to rename:")
                for old, canonical in sorted(city_renames.items()):
                    print(f"    {old!r} -> {canonical!r}")
                all_renames["cities"] = city_renames
            else:
                print("  No city duplicates found")
        else:
            print("  Nothing to dedup")

    if not all_renames and not all_removals:
        print("\nNo duplicates or useless entries found across any lookup tables. Done.")

        _write_run_audit_entry(
            timestamp=datetime.now(timezone.utc).isoformat(),
            details=f"{run_trigger.title()} lookup dedup run completed with no duplicates or removals.",
            profiles_updated=0,
            renames=0,
            removals=0,
            dry_run=dry_run,
            trigger=run_trigger,
        )

        return {
            "status": "ok",
            "message": "No duplicates or useless entries found",
            "dry_run": dry_run,
            "trigger": run_trigger,
            "renames": {},
            "removals": {},
            "profiles_updated": 0,
        }

    # Step 2: Update talent profiles
    total_renames = sum(len(v) for v in all_renames.values())
    total_removals = sum(len(v) for v in all_removals.values())
    print(f"\n--- Updating profiles ({total_renames} renames, {total_removals} removals) ---")
    profiles_updated = _update_profiles(all_renames, all_removals, dry_run)

    # Step 3: Clean up lookup tables (renames)
    print("\n--- Cleaning up lookup tables ---")
    for type_name, table_name, key_attr in LOOKUP_CONFIGS:
        if type_name not in all_renames:
            continue
        print(f"Cleaning {type_name} renames ({table_name})...")
        created, deleted = _cleanup_lookup_table(table_name, key_attr, all_renames[type_name], dry_run)
        if not dry_run:
            print(f"  Created {created} canonical entries, deleted {deleted} old entries")

    # Step 3b: Clean up cities lookup table (composite key)
    if "cities" in all_renames and CITIES_TABLE:
        print(f"Cleaning cities renames ({CITIES_TABLE})...")
        cities_tbl = dynamodb.Table(CITIES_TABLE)
        now = datetime.now(timezone.utc).isoformat()
        c_created = 0
        c_deleted = 0
        canonical_set = set(all_renames["cities"].values())
        for canonical_cs in canonical_set:
            new_city, new_state = _parse_city_state(canonical_cs)
            if new_city and new_state:
                if dry_run:
                    print(f"  [dry-run] Would ensure city entry: {canonical_cs}")
                else:
                    cities_tbl.put_item(Item={"city": new_city, "state": new_state, "updated_at": now})
                    c_created += 1
        for old_cs in all_renames["cities"]:
            if old_cs not in canonical_set:
                old_city, old_state = _parse_city_state(old_cs)
                if old_city and old_state:
                    if dry_run:
                        print(f"  [dry-run] Would delete city entry: {old_cs}")
                    else:
                        cities_tbl.delete_item(Key={"city": old_city, "state": old_state})
                        c_deleted += 1
        if not dry_run:
            print(f"  Created {c_created} canonical entries, deleted {c_deleted} old entries")

    # Step 4: Delete useless entries from lookup tables
    for type_name, table_name, key_attr in LOOKUP_CONFIGS:
        if type_name not in all_removals:
            continue
        print(f"Removing useless {type_name} from {table_name}...")
        table = dynamodb.Table(table_name)
        for name in all_removals[type_name]:
            if dry_run:
                print(f"  [dry-run] Would delete: {name!r}")
            else:
                table.delete_item(Key={key_attr: name})
                print(f"  Deleted: {name!r}")

    _write_run_audit_entry(
        timestamp=datetime.now(timezone.utc).isoformat(),
        details=(
            f"{run_trigger.title()} lookup dedup run completed: {profiles_updated} profiles updated, "
            f"{total_renames} renames, {total_removals} removals."
        ),
        profiles_updated=profiles_updated,
        renames=total_renames,
        removals=total_removals,
        dry_run=dry_run,
        trigger=run_trigger,
    )

    print("\n=== Done ===")
    return {
        "status": "ok",
        "dry_run": dry_run,
        "trigger": run_trigger,
        "renames": {k: len(v) for k, v in all_renames.items()},
        "removals": {k: len(v) for k, v in all_removals.items()},
        "rename_details": all_renames,
        "removal_details": all_removals,
        "profiles_updated": profiles_updated,
    }
