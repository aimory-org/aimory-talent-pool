import json
import os
import random
import re
import time

import boto3
from botocore.exceptions import ClientError

MODEL_ID = os.environ.get("MODEL_ID", "")
AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")

bedrock_client = boto3.client("bedrock-runtime", region_name=AWS_REGION)
dynamodb = boto3.resource("dynamodb", region_name=AWS_REGION)

# Lookup table names for injecting existing values into the prompt
SKILLS_LOOKUP_TABLE = os.environ.get("SKILLS_LOOKUP_TABLE", "")
CERTIFICATIONS_LOOKUP_TABLE = os.environ.get("CERTIFICATIONS_LOOKUP_TABLE", "")
JOB_TITLES_LOOKUP_TABLE = os.environ.get("JOB_TITLES_LOOKUP_TABLE", "")
INDUSTRY_CATEGORIES_LOOKUP_TABLE = os.environ.get("INDUSTRY_CATEGORIES_LOOKUP_TABLE", "")

# Pipeline config files are bundled into the same zip by Terraform.
# In tests, set PIPELINE_CONFIG_DIR env var to point to the config directory.
_CONFIG_DIR = os.environ.get("PIPELINE_CONFIG_DIR", os.path.dirname(os.path.abspath(__file__)))


def _load_config_file(filename):
    path = os.path.join(_CONFIG_DIR, filename)
    with open(path, "r") as f:
        return f.read()


def _load_schema():
    return json.loads(_load_config_file("schema.json"))


def _load_prompt():
    return _load_config_file("prompt.txt")


def _load_hooks():
    import importlib.util

    hooks_path = os.path.join(_CONFIG_DIR, "hooks.py")
    spec = importlib.util.spec_from_file_location("hooks", hooks_path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _fetch_lookup_values(table_name, key_attr):
    if not table_name:
        return []
    try:
        tbl = dynamodb.Table(table_name)
        values = set()
        kwargs = {"ProjectionExpression": key_attr}
        while True:
            response = tbl.scan(**kwargs)
            values.update(item[key_attr] for item in response.get("Items", []))
            if "LastEvaluatedKey" not in response:
                break
            kwargs["ExclusiveStartKey"] = response["LastEvaluatedKey"]
        return sorted(values)
    except Exception as e:
        print(f"Warning: failed to fetch lookups from {table_name}: {e}")
        return []


def _extract_text(event: dict) -> str:
    try:
        return str(event["normalized"]["text"])
    except KeyError as e:
        raise ValueError(f"Missing normalized text in event: {e}")


def handler(event, context):
    if not MODEL_ID:
        raise ValueError("MODEL_ID env var is required (set to a Bedrock model ID available in your region).")

    document_text = _extract_text(event)

    # Load pipeline-specific config
    schema = _load_schema()
    system_instructions = _load_prompt()
    hooks = _load_hooks()

    # Fetch existing lookup values to help Claude stay consistent.
    # NOTE: industry_category is intentionally NOT fed back here. Feeding the growing industry
    # vocabulary with a "use these exact names" instruction creates a convergence attractor that
    # collapses every candidate onto whatever the first few resumes produced. Industry sectors are
    # canonicalized via a stable curated list in the prompt instead, so each extraction stays
    # independent and truthful (and can assign multiple sectors when warranted).
    existing_skills = _fetch_lookup_values(SKILLS_LOOKUP_TABLE, "skill")
    existing_certs = _fetch_lookup_values(CERTIFICATIONS_LOOKUP_TABLE, "certification")
    existing_titles = _fetch_lookup_values(JOB_TITLES_LOOKUP_TABLE, "job_title")

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

    schema_text = json.dumps(schema, indent=2)
    user_prompt = f"""Target JSON schema:
  {schema_text}
  {lookups_context}
  Document text:
  {document_text}
  """

    # Retry with exponential backoff for throttling. Delays are capped so the
    # total sleep (~180s worst case) stays well within the Lambda's 300s
    # timeout; if throttling persists beyond that, the Step Functions retry
    # policy on this state takes over with longer intervals.
    max_retries = 8
    base_delay = 3
    max_delay = 45
    resp = None

    for attempt in range(max_retries):
        try:
            resp = bedrock_client.converse(
                modelId=MODEL_ID,
                messages=[{"role": "user", "content": [{"text": user_prompt}]}],
                system=[{"text": system_instructions}],
                inferenceConfig={"maxTokens": 4096, "temperature": 0.1, "topP": 0.9},
            )
            break
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "")
            if error_code == "ThrottlingException" and attempt < max_retries - 1:
                delay = min(base_delay * (2**attempt), max_delay) + random.uniform(0, 1)
                print(f"Throttled, retrying in {delay:.1f}s (attempt {attempt + 1}/{max_retries})")
                time.sleep(delay)
            else:
                raise RuntimeError(f"Bedrock converse failed: {e}")

    if resp is None:
        raise RuntimeError("Bedrock converse failed after max retries")

    content = resp["output"]["message"]["content"]
    text_blocks = [c.get("text") for c in content if "text" in c]
    if not text_blocks:
        raise RuntimeError(f"No text content returned from model. Raw content: {content}")

    raw = text_blocks[0].strip()
    if raw.startswith("```"):
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
                raw = re.sub(r",\s*}", "}", raw)
                raw = re.sub(r",\s*]", "]", raw)
            elif attempt == 1:
                last_brace = raw.rfind("}")
                if last_brace > 0:
                    raw = raw[: last_brace + 1]

    if result is None:
        raise RuntimeError(f"Model output was not valid JSON: {parse_error}; output={text_blocks[0]}")

    # Delegate post-processing to pipeline-specific hooks
    return hooks.post_process(result, event)
