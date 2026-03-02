import os
import json
import time
import random
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
      "enum": ["Secret", "TS", "TS/SCI", "TS/SCI/FSP", "TS/SCI/CI", "Yankee White", None],
      "description": "Security clearance level. Only use these exact values if CLEARLY stated in resume: Secret, TS (Top Secret without SCI), TS/SCI, TS/SCI/FSP (Full Scope Poly), TS/SCI/CI (CI Poly), Yankee White. Use null if no clearance mentioned OR if clearance is below Secret (e.g., Public Trust, Confidential)."
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

Bucket Assignment:
- IT Resources: Developers, Network Engineers, Database Analysts, Cloud Experts, Project Managers, IT professionals
- Accounting and Finance Resources: Accountants, Finance professionals, Data Analysts, Forensics specialists  
- HR Resources: Human Resources professionals, Recruiters, HR Managers
- Business Development/Sales Resources: Sales, Business Development, Account Managers

Category options: Accounting, Finance, Data Analysis, Forensics, Developer, Network Engineer, Database Analyst, Cloud Expert, Project Manager, HR, Business Development, Sales

Field guidance:
- Evidence snippets: SHORT phrases from resume (not full sentences)
- Certifications: list of strings like ["PMP", "AWS Solutions Architect"]
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
- bill_rate: hourly USD rate if mentioned, otherwise null
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

    schema_text = json.dumps(TALENT_SCHEMA, indent=2)
    user_prompt = f"""Target JSON schema:
  {schema_text}

  Resume text:
  {resume_text}
  """

    # Note: boto3 Converse does not accept outputConfig; enforce JSON via prompt and validate on parse.
    # Retry with exponential backoff for throttling
    max_retries = 5
    base_delay = 2
    resp = None
    
    for attempt in range(max_retries):
      try:
        resp = bedrock_client.converse(
          modelId=MODEL_ID,
          messages=[{
            "role": "user",
            "content": [{"text": user_prompt}]
          }],
          system=[{"text": SYSTEM_INSTRUCTIONS}],
          inferenceConfig={
            "maxTokens": 2500,
            "temperature": 0.1,
            "topP": 0.9
          }
        )
        break  # Success, exit retry loop
      except ClientError as e:
        error_code = e.response.get("Error", {}).get("Code", "")
        if error_code == "ThrottlingException" and attempt < max_retries - 1:
          # Exponential backoff with jitter
          delay = base_delay * (2 ** attempt) + random.uniform(0, 1)
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
          raw = re.sub(r',\s*}', '}', raw)
          raw = re.sub(r',\s*]', ']', raw)
        elif attempt == 1:
          # Attempt 2: Try to truncate at last complete object/array
          last_brace = raw.rfind('}')
          if last_brace > 0:
            raw = raw[:last_brace + 1]
    
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
        "rejection_reason": result.get("rejection_reason", "Document is not a resume")
      }

    # Ensure is_resume is set for Step Function choice state
    result["is_resume"] = True
    result.pop("rejection_reason", None)

    return result
