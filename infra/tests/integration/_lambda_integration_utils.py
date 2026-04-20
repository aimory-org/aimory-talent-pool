"""Shared helpers for post-deployment Lambda integration tests."""

import json
import os

import boto3
import pytest

REGION = os.environ.get("AWS_REGION", "us-east-1")
PROJECT_NAME = os.environ.get("PROJECT_NAME", "").strip()
ENVIRONMENT = os.environ.get("ENVIRONMENT", "").strip()

LAMBDA_CLIENT = boto3.client("lambda", region_name=REGION)


def bool_env(name: str) -> bool:
    return os.environ.get(name, "").strip().lower() in {"1", "true", "yes", "on"}


def _default_function_name(kind: str, key: str) -> str:
    if not PROJECT_NAME or not ENVIRONMENT:
        return ""

    if kind == "api":
        return f"{PROJECT_NAME}-{ENVIRONMENT}-api-{key.replace('_', '-')}"

    if kind == "resume_pipeline":
        return f"{PROJECT_NAME}-{ENVIRONMENT}-{key.replace('_', '-')}"

    if kind == "jd_pipeline":
        return f"{PROJECT_NAME}-{ENVIRONMENT}-jd-{key.replace('_', '-')}"

    if kind in {"pipeline", "jobs"}:
        return f"{PROJECT_NAME}-{ENVIRONMENT}-{key.replace('_', '-')}"

    return ""


def resolve_function_name(kind: str, key: str, override_env_var: str) -> str:
    explicit = os.environ.get(override_env_var, "").strip()
    if explicit:
        return explicit

    derived = _default_function_name(kind, key)
    if derived:
        return derived

    pytest.skip(f"Missing {override_env_var}; set it or set PROJECT_NAME and ENVIRONMENT")


def invoke_lambda(function_name: str, payload: dict) -> dict:
    response = LAMBDA_CLIENT.invoke(
        FunctionName=function_name,
        InvocationType="RequestResponse",
        Payload=json.dumps(payload).encode("utf-8"),
    )
    raw_payload = response["Payload"].read().decode("utf-8")

    if response.get("FunctionError"):
        pytest.fail(f"Lambda function error from {function_name}: {response['FunctionError']} ; payload={raw_payload}")

    if not raw_payload:
        return {}

    try:
        parsed = json.loads(raw_payload)
    except json.JSONDecodeError:
        pytest.fail(f"Non-JSON payload from {function_name}: {raw_payload}")

    if not isinstance(parsed, dict):
        pytest.fail(f"Unexpected payload type from {function_name}: {type(parsed).__name__}")

    return parsed
