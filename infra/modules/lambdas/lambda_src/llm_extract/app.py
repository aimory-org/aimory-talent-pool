import os
import json
import boto3
from botocore.exceptions import ClientError

# Example model id: set this in Lambda env var MODEL_ID
# (Choose a Claude Sonnet model available in your region.)
MODEL_ID = os.environ.get("MODEL_ID", "")
AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")

client = boto3.client("bedrock-runtime", region_name=AWS_REGION)

# JSON Schema from the message above (paste it as a single string)
TALENT_SCHEMA = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "TalentProfile",
  "type": "object",
  "additionalProperties": False,
  "required": ["name", "contact", "skillsets", "years_of_experience", "companies", "location", "rates"],
  "properties": {
    "name": {"type": ["string", "null"], "minLength": 1},
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
        "required": ["name", "category", "evidence"],
        "properties": {
          "name": {"type": "string", "minLength": 1},
          "category": {"type": "string", "enum": ["language","framework","cloud","database","data","devops","tooling","security","other"]},
          "evidence": {"type": "array", "items": {"type": "string", "minLength": 1}, "minItems": 1, "maxItems": 3}
        }
      }
    },
    "years_of_experience": {"type": ["number", "null"]},
    "companies": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": False,
        "required": ["name", "evidence"],
        "properties": {
          "name": {"type": "string", "minLength": 1},
          "evidence": {"type": "array", "items": {"type": "string", "minLength": 1}, "minItems": 1, "maxItems": 2}
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
    "rates": {
      "type": "object",
      "additionalProperties": False,
      "required": ["amount", "unit", "currency", "evidence"],
      "properties": {
        "amount": {"type": ["number", "null"]},
        "unit": {"type": "string", "enum": ["hour","day","year","project","unknown"]},
        "currency": {"type": "string", "enum": ["USD","unknown"]},
        "evidence": {"type": "array", "items": {"type": "string"}, "minItems": 0, "maxItems": 2}
      }
    }
  }
}

SYSTEM_INSTRUCTIONS = """You extract structured talent info from a resume.
Rules:
- Return ONLY JSON matching the schema.
- Do NOT include markdown, code fences, or commentary.
- Extract only: name, contact, skillsets, years_of_experience, companies, location, rates.
- Evidence snippets must be short and taken verbatim from the resume text.
- If a field is not present or cannot be confidently inferred, use null (or "unknown" for rate unit/currency).
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

    user_prompt = f"""Resume text:
{resume_text}
"""

    # Note: boto3 Converse does not accept outputConfig; enforce JSON via prompt and validate on parse.
    try:
      resp = client.converse(
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

    return result
