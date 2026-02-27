import os
import json
import boto3
from botocore.exceptions import ClientError

# Example model id: set this in Lambda env var MODEL_ID
# (Choose a Claude Sonnet model available in your region.)
MODEL_ID = os.environ.get("MODEL_ID", "")
AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")

bedrock_client = boto3.client("bedrock-runtime", region_name=AWS_REGION)
s3_client = boto3.client("s3", region_name=AWS_REGION)

# JSON Schema for talent profile extraction
TALENT_SCHEMA = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "TalentProfile",
  "type": "object",
  "additionalProperties": False,
  "required": ["is_resume", "name", "contact", "summary", "talent_bucket", "talent_category", "skillsets", "years_of_experience", "companies", "location", "clearance_level", "certifications", "bill_rate"],
  "properties": {
    "is_resume": {"type": "boolean", "description": "True if the document is a resume/CV, false otherwise"},
    "rejection_reason": {"type": ["string", "null"], "description": "If is_resume is false, explain why (e.g. 'document is an invoice', 'document is a contract')"},
    "name": {"type": ["string", "null"], "minLength": 1},
    "summary": {"type": ["string", "null"], "minLength": 1, "maxLength": 300},
    "talent_bucket": {
      "type": ["string", "null"],
      "enum": ["IT Resources", "Accounting and Finance Resources", "HR Resources", "Business Development/Sales Resources", None],
      "description": "Primary bucket classification for the talent"
    },
    "talent_category": {
      "type": ["string", "null"],
      "enum": [
        "Accounting", "Finance", "Data Analysis", "Forensics",
        "Developer", "Network Engineer", "Database Analyst", "Cloud Expert", "Project Manager",
        "HR",
        "Business Development", "Sales",
        None
      ],
      "description": "Specific category within the bucket"
    },
    "contact": {
      "type": "object",
      "additionalProperties": False,
      "required": ["email", "phone", "linkedin", "github"],
      "properties": {
        "email": {"type": ["string", "null"], "minLength": 3},
        "phone": {"type": ["string", "null"], "minLength": 7},
        "linkedin": {"type": ["string", "null"]},
        "github": {"type": ["string", "null"]}
      }
    },
    "skillsets": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": False,
        "required": ["name", "evidence"],
        "properties": {
          "name": {"type": "string", "minLength": 1},
          "evidence": {"type": "array", "items": {"type": "string", "minLength": 1}, "minItems": 1}
        }
      }
    },
    "years_of_experience": {"type": ["number", "null"]},
    "clearance_level": {
      "type": ["string", "null"],
      "description": "Security clearance level if mentioned (e.g. Secret, Top Secret, TS/SCI, Public Trust)"
    },
    "certifications": {
      "type": "array",
      "items": {"type": "string", "minLength": 1},
      "description": "List of certifications (e.g. PMP, CPA, AWS Solutions Architect, CISSP)"
    },
    "companies": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": False,
        "required": ["name", "evidence"],
        "properties": {
          "name": {"type": "string", "minLength": 1},
          "evidence": {"type": "array", "items": {"type": "string", "minLength": 1}, "minItems": 1}
        }
      }
    },
    "location": {
      "type": "object",
      "additionalProperties": False,
      "required": ["city", "state"],
      "properties": {
        "city": {"type": ["string", "null"]},
        "state": {"type": ["string", "null"]}
      }
    },
    "bill_rate": {
      "type": ["number", "null"],
      "description": "Hourly bill rate in USD if mentioned in resume"
    }
  }
}

SYSTEM_INSTRUCTIONS = """You extract structured talent info from a resume.
Rules:
- Return ONLY JSON matching the schema.
- Do NOT include markdown, code fences, or commentary.
- FIRST determine if the document is actually a resume/CV. Set is_resume to true or false.
- If is_resume is false, set rejection_reason explaining what the document is (e.g. "document is an invoice"), and set all other fields to null.
- If is_resume is true, extract all fields: name, contact, summary, talent_bucket, talent_category, skillsets, years_of_experience, clearance_level, certifications, companies, location, bill_rate.

Bucket Assignment Rules:
- IT Resources: Developers, Network Engineers, Database Analysts, Cloud Experts, Project Managers, IT professionals
- Accounting and Finance Resources: Accountants, Finance professionals, Data Analysts, Forensics specialists
- HR Resources: Human Resources professionals, Recruiters, HR Managers
- Business Development/Sales Resources: Sales, Business Development, Account Managers

Category should match one of: Accounting, Finance, Data Analysis, Forensics, Developer, Network Engineer, Database Analyst, Cloud Expert, Project Manager, HR, Business Development, Sales

- Evidence snippets must be short and taken verbatim from the resume text.
- Extract certifications as a list of strings (e.g. ["PMP", "AWS Solutions Architect", "CPA"]).
- Extract clearance_level if mentioned (Secret, Top Secret, TS/SCI, Public Trust, etc.).
- bill_rate is the hourly rate in USD if mentioned; use null if not found.
- If a field is not present or cannot be confidently inferred, use null or empty array for certifications.
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

    schema_text = json.dumps(TALENT_SCHEMA, indent=2)
    user_prompt = f"""Target JSON schema:
  {schema_text}

  Resume text:
  {resume_text}
  """

    # Note: boto3 Converse does not accept outputConfig; enforce JSON via prompt and validate on parse.
    try:
      resp = bedrock_client.converse(
        modelId=MODEL_ID,
        messages=[{
          "role": "user",
          "content": [{"text": user_prompt}]
        }],
        system=[{"text": SYSTEM_INSTRUCTIONS}],
        inferenceConfig={
          "maxTokens": 1200,
          "temperature": 0.2,
          "topP": 0.9
        }
      )
    except ClientError as e:
      raise RuntimeError(f"Bedrock converse failed: {e}")

    # Bedrock returns assistant message content blocks; the JSON will be in a text block
    content = resp["output"]["message"]["content"]
    text_blocks = [c.get("text") for c in content if "text" in c]
    if not text_blocks:
        raise RuntimeError(f"No text content returned from model. Raw content: {content}")

    # Validate the model output as JSON and return it.
    try:
      raw = text_blocks[0].strip()
      if raw.startswith("```"):
        # Strip fenced code blocks if the model ignores instructions.
        raw = raw.strip("`")
        raw = raw.replace("json\n", "", 1).strip()
      result = json.loads(raw)
    except json.JSONDecodeError as e:
      raise RuntimeError(f"Model output was not valid JSON: {e}; output={text_blocks[0]}")

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
        "rejection_reason": result.get("rejection_reason", "Document is not a resume")
      }

    # Ensure is_resume is set for Step Function choice state
    result["is_resume"] = True
    result.pop("rejection_reason", None)

    return result
