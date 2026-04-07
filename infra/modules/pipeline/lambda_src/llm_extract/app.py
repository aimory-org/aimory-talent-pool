import json
import os
import random
import time

import boto3
from botocore.exceptions import ClientError

# Example model id: set this in Lambda env var MODEL_ID
# (Choose a Claude Sonnet model available in your region.)
MODEL_ID = os.environ.get("MODEL_ID", "")
AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")

bedrock_client = boto3.client("bedrock-runtime", region_name=AWS_REGION)
s3_client = boto3.client("s3", region_name=AWS_REGION)
dynamodb = boto3.resource("dynamodb", region_name=AWS_REGION)

# Lookup table names for injecting existing values into the prompt
SKILLS_LOOKUP_TABLE = os.environ.get("SKILLS_LOOKUP_TABLE", "")
CERTIFICATIONS_LOOKUP_TABLE = os.environ.get("CERTIFICATIONS_LOOKUP_TABLE", "")
JOB_TITLES_LOOKUP_TABLE = os.environ.get("JOB_TITLES_LOOKUP_TABLE", "")
INDUSTRY_CATEGORIES_LOOKUP_TABLE = os.environ.get("INDUSTRY_CATEGORIES_LOOKUP_TABLE", "")


def _fetch_lookup_values(table_name, key_attr, limit=500):
    """Scan a lookup table and return up to `limit` values."""
    if not table_name:
        return []
    try:
        tbl = dynamodb.Table(table_name)
        response = tbl.scan(ProjectionExpression=key_attr, Limit=limit)
        return sorted({item[key_attr] for item in response.get("Items", [])})
    except Exception as e:
        print(f"Warning: failed to fetch lookups from {table_name}: {e}")
        return []


# JSON Schema for talent profile extraction
TALENT_SCHEMA = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "title": "TalentProfile",
    "type": "object",
    "additionalProperties": False,
    "required": [
        "is_resume",
        "name",
        "contact",
        "summary",
        "service_category",
        "industry_category",
        "job_title",
        "skillsets",
        "years_of_experience",
        "companies",
        "location",
        "clearance_level",
        "certifications",
        "requested_salary",
    ],
    "properties": {
        "is_resume": {"type": "boolean", "description": "True if the document is a resume/CV, false otherwise"},
        "rejection_reason": {
            "type": ["string", "null"],
            "description": (
                "If is_resume is false, explain why (e.g. 'document is an invoice', 'document is a contract')"
            ),
        },
        "name": {"type": ["string", "null"], "minLength": 1},
        "summary": {
            "type": ["string", "null"],
            "minLength": 1,
            "maxLength": 1000,
            "description": (
                "Professional summary of up to 1000 characters covering key experience, "
                "skills, and accomplishments. May include line breaks."
            ),
        },
        "service_category": {
            "type": ["string", "null"],
            "enum": [
                "IT",
                "Accounting",
                "FSP Headhunting",
                "Cybersecurity",
                None,
            ],
            "description": "Aimory company service category this talent aligns to",
        },
        "industry_category": {
            "type": ["string", "null"],
            "description": (
                "The organizational/industry function this talent works in. "
                "Common values: HR, Accounting, Finance, IT Engineering, Manufacturing, Federal Government. "
                "If the resume clearly fits a different industry not listed, use the most appropriate industry name. "
                "Use null if truly indeterminate."
            ),
        },
        "job_title": {
            "type": ["string", "null"],
            "description": (
                "The most specific standard job title that describes this candidate's primary role. "
                "Examples: Full Stack Developer, Network Engineer, ServiceNow Developer, Data Analyst, "
                "Project Manager, Cybersecurity Analyst, HR Generalist, Staff Accountant. "
                "Use standard industry titles, not creative/internal titles."
            ),
        },
        "contact": {
            "type": "object",
            "additionalProperties": False,
            "required": ["email", "phone", "linkedin", "github"],
            "properties": {
                "email": {"type": ["string", "null"], "minLength": 3},
                "phone": {"type": ["string", "null"], "minLength": 7},
                "linkedin": {"type": ["string", "null"]},
                "github": {"type": ["string", "null"]},
            },
        },
        "skillsets": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["name", "evidence"],
                "properties": {
                    "name": {"type": "string", "minLength": 1},
                    "evidence": {"type": "array", "items": {"type": "string", "minLength": 1}, "minItems": 1},
                },
            },
        },
        "years_of_experience": {"type": ["number", "null"]},
        "clearance_level": {
            "type": ["string", "null"],
            "enum": ["Secret", "TS", "TS/SCI", "TS/SCI/FSP", "TS/SCI/CI", "Yankee White", None],
            "description": (
                "Security clearance level. Only use these exact values if CLEARLY stated in resume: "
                "Secret, TS (Top Secret without SCI), TS/SCI, TS/SCI/FSP (Full Scope Poly), "
                "TS/SCI/CI (CI Poly), Yankee White. Use null if no clearance mentioned "
                "OR if clearance is below Secret (e.g., Public Trust, Confidential)."
            ),
        },
        "certifications": {
            "type": "array",
            "items": {"type": "string", "minLength": 1},
            "description": (
                "List of certifications using full official names, e.g. "
                "'Project Management Professional (PMP)', "
                "'Certified Information Systems Security Professional (CISSP)', "
                "'AWS Solutions Architect - Associate'"
            ),
        },
        "companies": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["name", "evidence"],
                "properties": {
                    "name": {"type": "string", "minLength": 1},
                    "evidence": {"type": "array", "items": {"type": "string", "minLength": 1}, "minItems": 1},
                },
            },
        },
        "location": {
            "type": "object",
            "additionalProperties": False,
            "required": ["city", "state"],
            "properties": {"city": {"type": ["string", "null"]}, "state": {"type": ["string", "null"]}},
        },
        "requested_salary": {
            "type": ["number", "null"],
            "description": (
                "Requested or expected salary in annual USD. If rate is given hourly, multiply by 2080. "
                "If per day, multiply by 260. If per week, multiply by 52. If per month, multiply by 12. "
                "If already annual, use as-is. If no salary/rate mentioned, use null."
            ),
        },
    },
}

SYSTEM_INSTRUCTIONS = """You extract structured talent info from a resume.

CRITICAL: Return ONLY valid JSON. Every string must be properly quoted. Do not include any text outside the JSON object.

Rules:
- Return ONLY JSON matching the schema - no markdown, no code fences, no commentary.
- FIRST determine if the document is actually a resume/CV. Set is_resume to true or false.
- If is_resume is false, set rejection_reason explaining what the document is, and set all other fields to null.
- If is_resume is true, extract all fields.

JSON Formatting Rules (IMPORTANT):
- All strings must be enclosed in double quotes
- Escape any double quotes inside strings with backslash: \"
- Keep evidence snippets SHORT (under 50 chars each) to avoid formatting issues
- Limit to 2-3 evidence snippets per skill

Company Service Category Assignment (pick exactly one):
- IT: Developers, Network Engineers, Database Analysts, Cloud Experts,
  Project Managers, IT professionals, Software Engineers
- Accounting: Accountants, Finance professionals, Data Analysts, Forensics specialists, Auditors, Bookkeepers
- FSP Headhunting: Executive-level placements, Senior leadership roles, C-suite candidates, Directors, VPs
- Cybersecurity: Security Analysts, Penetration Testers, SOC Analysts, Security Engineers, CISO-track professionals

Industry Category:
- This represents the organizational/industry function the candidate works in.
- Common values: HR, Accounting, Finance, IT Engineering, Manufacturing, Federal Government
- If the resume clearly fits a DIFFERENT industry not listed above, use the most appropriate industry name.
  For example: Healthcare, Education, Legal, Retail, Logistics, Energy, Telecommunications, etc.
- The AI MAY create new industry categories when a resume doesn't fit existing ones.
- Use null only if truly indeterminate.

Job Title:
- Extract the MOST SPECIFIC standard job title for this candidate's primary role.
- Use standard industry titles (e.g., "Full Stack Developer", not "Code Ninja" or "Dev III").
- Examples: Network Engineer, Full Stack Developer, ServiceNow Developer, Data Analyst,
  Project Manager, Cybersecurity Analyst, HR Generalist, Staff Accountant, Cloud Architect.
- Normalize to title case (e.g., "Network Engineer" not "network engineer" or "NETWORK ENGINEER").
- Use null only if the role is truly unclear.

Summary:
- Write a professional summary of up to 1000 characters (not words).
- Use line breaks (\n) to separate paragraphs or sections for readability.
- Cover the candidate's key experience, technical skills, notable accomplishments, and career trajectory.
- Be comprehensive but concise. Include specifics from the resume.

Field guidance:
- Skills: Extract MEANINGFUL, SPECIFIC skills from the resume. Include:
  - Technical skills (languages, frameworks, tools, platforms)
  - Domain skills (accounting, auditing, recruiting, compliance, etc.)
  - Soft/management skills only if strongly evidenced (e.g., "led team of 12")
  - QUALITY FILTER: Do NOT extract vague, generic, or trivially common terms as skills:
    - BAD (too vague): Briefing, Documentation, Meetings, Reporting, Filing, Typing,
      Multitasking, Phone Skills, Emailing, Travel, Scheduling, Research, Analysis,
      Organization, Planning, Time Management, Teamwork, Collaboration, Detail-Oriented,
      Self-Motivated, Critical Thinking, Interpersonal Skills, Customer Service, Training,
      Presentations, Writing, Reading, Microsoft Windows, Internet, Basic Computer Skills
    - GOOD (specific & searchable): Agile, Scrum, Amazon Web Services, Python, SQL, Power BI, ServiceNow,
      ITIL, Six Sigma, Financial Modeling, Risk Assessment, Penetration Testing, SAP,
      Tableau, Kubernetes, Terraform, JIRA, Salesforce, SOC 2 Compliance
    - Rule of thumb: Would a recruiter search for this term? If not, skip it.
  - Use FULL SPELLED-OUT canonical names (not abbreviations):
    "Amazon Web Services" not "AWS", "Google Cloud Platform" not "GCP",
    "Artificial Intelligence/Machine Learning" not "AI/ML",
    "Business Intelligence" not "BI", "Computer Science" not "CS",
    "JavaScript" not "JS", "PostgreSQL" not "Postgres", "CI/CD" not "CICD",
    "React" not "ReactJS", "Node.js" not "NodeJS", ".NET" not "dotnet",
    "CompTIA Security+" not "Sec+", "Power BI" not "PowerBI"
  - EXCEPTIONS where the abbreviation IS the standard name (keep as-is):
    "SQL", "HTML", "CSS", "API", "REST", "DevOps", "CI/CD", "Power BI", "SAP"
  - CRITICAL DEDUPLICATION: Never create variations of the same skill:
    - Use "Agile" not "Agile Methodologies" or "Agile Methodology" or "Agile Development"
    - Use "Scrum" not "Scrum Framework" or "Scrum Methodology"
    - Use "Project Management" not "Project Management Skills" or "PM"
    - Use "Data Analysis" not "Data Analytics" or "Data Analytical Skills"
    - Use "Microsoft Office" not "MS Office" or "Microsoft Office Suite" or "Office 365"
    - Use "Microsoft Excel" not "MS Excel" or "Excel"
    - Use "Communication" not "Communication Skills" or "Verbal Communication"
    - Use "Leadership" not "Leadership Skills" or "Team Leadership"
    - Use the FULL SPELLED-OUT canonical name for each skill
    - If the existing skills list already contains a similar skill, use THAT exact name
  - Preserve proper casing: "Amazon Web Services", "SQL", "DevOps", "ServiceNow", "Salesforce"
  - Do NOT list the same skill twice under different names
  - Evidence snippets: SHORT phrases from resume (not full sentences)
- Certifications: Use the FULL official certification name (not abbreviations):
  - "Project Management Professional (PMP)" not just "PMP"
  - "Certified Information Systems Security Professional (CISSP)" not just "CISSP"
  - "CompTIA Security+" not "Security+" or "Sec+"
  - "Certified Scrum Master (CSM)" not just "CSM"
  - "AWS Solutions Architect - Associate" not "AWS SAA"
  - Format: "Full Name (ABBREV)" when a well-known abbreviation exists
  - Do NOT list the same cert twice under different names
- Clearance: Must be exactly one of: Secret, TS, TS/SCI, TS/SCI/FSP, TS/SCI/CI, Yankee White, or null
  - Secret: Standard Secret clearance
  - TS: Top Secret (no SCI)
  - TS/SCI: Top Secret with Sensitive Compartmented Information
  - TS/SCI/FSP: TS/SCI with Full Scope Polygraph (also called Lifestyle Poly)
  - TS/SCI/CI: TS/SCI with Counterintelligence Polygraph (CI Poly)
  - Yankee White: Presidential support clearance
  - If "Top Secret" mentioned without SCI, use "TS"
  - If polygraph mentioned, determine if Full Scope (FSP) or CI Poly
  - IMPORTANT: Only assign a clearance if the resume CLEARLY states one of these levels
  - If clearance is lower than Secret (e.g., Public Trust, Confidential, None) or unclear, use null
  - If no clearance mentioned, use null
- requested_salary: Annual salary in USD. IMPORTANT: Convert to annual if given in other units:
  - Hourly rate: multiply by 2080 (e.g., $50/hour = $104,000/year)
  - Daily rate: multiply by 260 (e.g., $400/day = $104,000/year)
  - Weekly rate: multiply by 52 (e.g., $2000/week = $104,000/year)
  - Monthly rate: multiply by 12 (e.g., $8333/month = $100,000/year)
  - If already annual, use as-is
  - If no salary/rate mentioned, use null
- If a field cannot be determined, use null (or empty array [] for lists)
"""


def _extract_text(event: dict) -> str:
    # Expect Step Functions to pass normalized text here:
    # event["normalized"]["text"]
    try:
        return event["normalized"]["text"]
    except KeyError as e:
        raise ValueError(f"Missing normalized text in event: {e}")


def handler(event, context):
    if not MODEL_ID:
        raise ValueError("MODEL_ID env var is required (set to a Bedrock model ID available in your region).")

    resume_text = _extract_text(event)
    bucket = event.get("bucket")
    key = event.get("key")

    # Fetch existing lookup values to help Claude stay consistent
    existing_skills = _fetch_lookup_values(SKILLS_LOOKUP_TABLE, "skill")
    existing_certs = _fetch_lookup_values(CERTIFICATIONS_LOOKUP_TABLE, "certification")
    existing_titles = _fetch_lookup_values(JOB_TITLES_LOOKUP_TABLE, "job_title")
    existing_industries = _fetch_lookup_values(INDUSTRY_CATEGORIES_LOOKUP_TABLE, "industry_category")

    lookups_context = ""
    if existing_skills:
        lookups_context += (
            f"\nIMPORTANT — Existing skills in our database. "
            f"You MUST use these exact names instead of creating variations. "
            f"If 'Agile' exists, do NOT output 'Agile Methodologies': "
            f"{', '.join(existing_skills)}\n"
        )
    if existing_certs:
        lookups_context += (
            f"\nExisting certifications in our database "
            f"(use these exact names when matched): {', '.join(existing_certs)}\n"
        )
    if existing_titles:
        lookups_context += (
            f"\nExisting job titles in our database "
            f"(use these exact names when matched, create new only if nothing fits): "
            f"{', '.join(existing_titles)}\n"
        )
    if existing_industries:
        lookups_context += (
            f"\nExisting industry categories in our database "
            f"(use these exact names when matched, create new only if nothing fits): "
            f"{', '.join(existing_industries)}\n"
        )

    schema_text = json.dumps(TALENT_SCHEMA, indent=2)
    user_prompt = f"""Target JSON schema:
  {schema_text}
  {lookups_context}
  Resume text:
  {resume_text}
  """

    # Note: boto3 Converse does not accept outputConfig; enforce JSON via prompt and validate on parse.
    # Retry with exponential backoff for throttling
    max_retries = 8
    base_delay = 3
    resp = None

    for attempt in range(max_retries):
        try:
            resp = bedrock_client.converse(
                modelId=MODEL_ID,
                messages=[{"role": "user", "content": [{"text": user_prompt}]}],
                system=[{"text": SYSTEM_INSTRUCTIONS}],
                inferenceConfig={"maxTokens": 4096, "temperature": 0.1, "topP": 0.9},
            )
            break  # Success, exit retry loop
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "")
            if error_code == "ThrottlingException" and attempt < max_retries - 1:
                # Exponential backoff with jitter
                delay = base_delay * (2**attempt) + random.uniform(0, 1)
                print(f"Throttled, retrying in {delay:.1f}s (attempt {attempt + 1}/{max_retries})")
                time.sleep(delay)
            else:
                raise RuntimeError(f"Bedrock converse failed: {e}")

    if resp is None:
        raise RuntimeError("Bedrock converse failed after max retries")

    # Bedrock returns assistant message content blocks; the JSON will be in a text block
    content = resp["output"]["message"]["content"]
    text_blocks = [c.get("text") for c in content if "text" in c]
    if not text_blocks:
        raise RuntimeError(f"No text content returned from model. Raw content: {content}")

    # Validate the model output as JSON and return it.
    raw = text_blocks[0].strip()
    if raw.startswith("```"):
        # Strip fenced code blocks if the model ignores instructions.
        raw = raw.strip("`")
        raw = raw.replace("json\n", "", 1).strip()

    # Try to parse JSON, with repair attempts for common LLM errors
    result = None
    parse_error = None
    for attempt in range(3):
        try:
            result = json.loads(raw)
            break
        except json.JSONDecodeError as e:
            parse_error = e
            if attempt == 0:
                # Attempt 1: Fix trailing commas
                import re

                raw = re.sub(r",\s*}", "}", raw)
                raw = re.sub(r",\s*]", "]", raw)
            elif attempt == 1:
                # Attempt 2: Try to truncate at last complete object/array
                last_brace = raw.rfind("}")
                if last_brace > 0:
                    raw = raw[: last_brace + 1]

    if result is None:
        raise RuntimeError(f"Model output was not valid JSON: {parse_error}; output={text_blocks[0]}")

    # Check if the document is a resume
    if not result.get("is_resume", True):
        # Delete the non-resume file from S3
        if bucket and key:
            try:
                s3_client.delete_object(Bucket=bucket, Key=key)
            except ClientError as e:
                raise RuntimeError(f"Failed to delete non-resume file from S3: {e}")

        return {
            "is_resume": False,
            "deleted": True,
            "bucket": bucket,
            "key": key,
            "rejection_reason": result.get("rejection_reason", "Document is not a resume"),
        }

    # Ensure is_resume is set for Step Function choice state
    result["is_resume"] = True
    result.pop("rejection_reason", None)

    return result
