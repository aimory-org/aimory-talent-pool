"""Post-deployment integration tests for pipeline Lambda handlers and Step Functions e2e."""

import base64
import io
import json
import os
import time
import uuid
import xml.etree.ElementTree as ET
import zipfile

import boto3
import pytest
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

from ._lambda_integration_utils import bool_env, invoke_lambda, resolve_function_name

pytestmark = pytest.mark.integration

REGION = os.environ.get("AWS_REGION", "us-east-1")
RESUME_BUCKET = os.environ.get("RESUME_BUCKET", "").strip()
RAW_PREFIX = os.environ.get("RAW_PREFIX", "resumes/raw").strip().strip("/")
TALENT_TABLE = os.environ.get("TALENT_PROFILES_TABLE", "").strip()
STATE_MACHINE_ARN = (
    os.environ.get("PIPELINE_STATE_MACHINE_ARN", "").strip() or os.environ.get("STATE_MACHINE_ARN", "").strip()
)

SKILLS_LOOKUP_TABLE = os.environ.get("SKILLS_LOOKUP_TABLE", "").strip()
CERTIFICATIONS_LOOKUP_TABLE = os.environ.get("CERTIFICATIONS_LOOKUP_TABLE", "").strip()
CITIES_LOOKUP_TABLE = os.environ.get("CITIES_LOOKUP_TABLE", "").strip()
JOB_TITLES_LOOKUP_TABLE = os.environ.get("JOB_TITLES_LOOKUP_TABLE", "").strip()
INDUSTRY_CATEGORIES_LOOKUP_TABLE = os.environ.get("INDUSTRY_CATEGORIES_LOOKUP_TABLE", "").strip()
AUDIT_LOG_TABLE = os.environ.get("AUDIT_LOG_TABLE", "").strip()

S3_CLIENT = boto3.client("s3", region_name=REGION)
DDB_RESOURCE = boto3.resource("dynamodb", region_name=REGION)
SFN_CLIENT = boto3.client("stepfunctions", region_name=REGION)

# A valid 1x1 PNG image used for Textract smoke tests.
ONE_BY_ONE_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5sX5kAAAAASUVORK5CYII="
)


def _ensure_resume_bucket():
    if not RESUME_BUCKET:
        pytest.skip("RESUME_BUCKET not set")


def _delete_s3_object(bucket: str, key: str):
    if not bucket or not key:
        return
    try:
        S3_CLIENT.delete_object(Bucket=bucket, Key=key)
    except ClientError:
        pass


def _object_exists(bucket: str, key: str) -> bool:
    try:
        S3_CLIENT.head_object(Bucket=bucket, Key=key)
        return True
    except ClientError as exc:
        code = str(exc.response.get("Error", {}).get("Code", ""))
        return code not in {"404", "NoSuchKey", "NotFound"}


def _safe_delete_item(table_name: str, key: dict):
    if not table_name:
        return
    try:
        DDB_RESOURCE.Table(table_name).delete_item(Key=key)
    except ClientError:
        pass


def _cleanup_audit_entries(pk: str):
    if not AUDIT_LOG_TABLE:
        return
    table = DDB_RESOURCE.Table(AUDIT_LOG_TABLE)
    kwargs = {"KeyConditionExpression": Key("pk").eq(pk)}
    while True:
        try:
            resp = table.query(**kwargs)
        except ClientError:
            return

        for item in resp.get("Items", []):
            if "pk" in item and "sk" in item:
                _safe_delete_item(AUDIT_LOG_TABLE, {"pk": item["pk"], "sk": item["sk"]})

        if "LastEvaluatedKey" not in resp:
            break
        kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]


def _make_docx_bytes(text: str) -> bytes:
    ns = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
    root = ET.Element(f"{{{ns}}}document")
    body = ET.SubElement(root, f"{{{ns}}}body")
    paragraph = ET.SubElement(body, f"{{{ns}}}p")
    run = ET.SubElement(paragraph, f"{{{ns}}}r")
    node = ET.SubElement(run, f"{{{ns}}}t")
    node.text = text

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("word/document.xml", ET.tostring(root, encoding="unicode"))
    return buffer.getvalue()


def _raw_test_key(filename: str) -> str:
    return f"{RAW_PREFIX}/integration-tests/{filename}"


def _wait_for_textract_success(check_function_name: str, job_id: str, timeout_seconds: int = 240) -> str:
    deadline = time.time() + timeout_seconds
    latest_status = "UNKNOWN"

    while time.time() < deadline:
        result = invoke_lambda(check_function_name, {"textract": {"job_id": job_id}})
        latest_status = result.get("status", "UNKNOWN")

        if latest_status in {"SUCCEEDED", "FAILED"}:
            return latest_status

        time.sleep(3)

    pytest.fail(f"Timed out waiting for textract job {job_id}; last status={latest_status}")


def _wait_for_execution(execution_arn: str, timeout_seconds: int = 600) -> dict:
    deadline = time.time() + timeout_seconds
    terminal = {"SUCCEEDED", "FAILED", "TIMED_OUT", "ABORTED"}

    while time.time() < deadline:
        desc = SFN_CLIENT.describe_execution(executionArn=execution_arn)
        if desc["status"] in terminal:
            return desc
        time.sleep(5)

    pytest.fail(f"Timed out waiting for execution {execution_arn}")


def test_pipeline_starter_lambda_smoke():
    function_name = resolve_function_name("pipeline", "starter", "PIPELINE_STARTER_FUNCTION_NAME")
    payload = invoke_lambda(function_name, {"Records": []})

    assert payload.get("ok") is True


def test_pipeline_classify_lambda_docx_path():
    _ensure_resume_bucket()

    function_name = resolve_function_name("pipeline", "classify", "PIPELINE_CLASSIFY_FUNCTION_NAME")
    key = _raw_test_key(f"classify-{uuid.uuid4().hex}.docx")

    try:
        document = _make_docx_bytes("Jane Doe Senior Software Engineer Python AWS Experience Education Certifications")
        S3_CLIENT.put_object(Bucket=RESUME_BUCKET, Key=key, Body=document)

        payload = invoke_lambda(function_name, {"bucket": RESUME_BUCKET, "key": key})
        assert payload.get("doc_type") == "word"
        assert payload.get("extension") == "docx"
        assert payload.get("skip_textract") is True
        assert isinstance(payload.get("direct_text"), str)
        assert payload["direct_text"]
    finally:
        _delete_s3_object(RESUME_BUCKET, key)


def test_pipeline_normalize_lambda_direct_text_path():
    function_name = resolve_function_name("pipeline", "normalize", "PIPELINE_NORMALIZE_FUNCTION_NAME")
    event = {
        "prep": {
            "skip_textract": True,
            "direct_text": "Jane Doe | Skills Python AWS | Experience 2022-2026",
        }
    }

    payload = invoke_lambda(function_name, event)

    assert isinstance(payload.get("text"), str)
    assert payload["text"]
    assert isinstance(payload.get("line_count"), int)


def test_pipeline_persist_lambda_smoke_write_and_cleanup():
    _ensure_resume_bucket()
    if not TALENT_TABLE:
        pytest.skip("TALENT_PROFILES_TABLE not set")

    function_name = resolve_function_name("pipeline", "persist", "PIPELINE_PERSIST_FUNCTION_NAME")
    suffix = uuid.uuid4().hex[:8]
    key = _raw_test_key(f"persist-{suffix}.docx")
    pk = f"{RESUME_BUCKET}#{key}"

    profile = {
        "name": f"Integration User {suffix}",
        "contact": {
            "email": f"integration-{suffix}@example.com",
            "phone": "5551234567",
            "linkedin": None,
            "github": None,
        },
        "summary": "Integration profile generated by post-deployment test.",
        "service_category": "IT",
        "industry_category": f"IntegrationCategory{suffix}",
        "job_title": f"Integration Engineer {suffix}",
        "skillsets": [{"name": f"IntegrationSkill{suffix}", "evidence": ["integration test"]}],
        "years_of_experience": 5,
        "clearance_level": "Secret",
        "certifications": [f"IntegrationCert{suffix}"],
        "companies": [{"name": f"Integration Company {suffix}", "evidence": ["integration"]}],
        "location": {"city": f"IntegrationCity{suffix}", "state": "va"},
        "requested_salary": 150000,
        "is_valid": True,
    }

    event = {
        "bucket": RESUME_BUCKET,
        "key": key,
        "normalized": {"text": "Integration resume text for full-text search."},
        "extracted": profile,
    }

    try:
        payload = invoke_lambda(function_name, event)
        assert payload.get("status") == "ok"
        assert payload.get("pk") == pk

        item = DDB_RESOURCE.Table(TALENT_TABLE).get_item(Key={"pk": pk}).get("Item")
        assert item is not None
        assert item.get("pk") == pk
        assert item.get("name") == f"Integration User {suffix}".title()
    finally:
        _safe_delete_item(TALENT_TABLE, {"pk": pk})
        _safe_delete_item(SKILLS_LOOKUP_TABLE, {"skill": f"IntegrationSkill{suffix}"})
        _safe_delete_item(CERTIFICATIONS_LOOKUP_TABLE, {"certification": f"IntegrationCert{suffix}"})
        _safe_delete_item(CITIES_LOOKUP_TABLE, {"city": f"Integrationcity{suffix}", "state": "VA"})
        _safe_delete_item(JOB_TITLES_LOOKUP_TABLE, {"job_title": f"Integration Engineer {suffix}"})
        _safe_delete_item(INDUSTRY_CATEGORIES_LOOKUP_TABLE, {"industry_category": f"IntegrationCategory{suffix}"})
        _cleanup_audit_entries(pk)


def test_pipeline_presign_lambda_unauthorized_smoke():
    function_name = resolve_function_name("pipeline", "presign", "PIPELINE_PRESIGN_FUNCTION_NAME")
    event = {
        "headers": {"x-api-key": "wrong-key"},
        "body": json.dumps({"filename": "integration.pdf"}),
    }

    payload = invoke_lambda(function_name, event)
    assert payload.get("statusCode") == 401


def test_pipeline_textract_lambdas_start_check_fetch_png():
    if not bool_env("RUN_TEXTRACT_INTEGRATION"):
        pytest.skip("Set RUN_TEXTRACT_INTEGRATION=1 to run textract integration test")
    _ensure_resume_bucket()

    start_fn = resolve_function_name("pipeline", "start_textract", "PIPELINE_START_TEXTRACT_FUNCTION_NAME")
    check_fn = resolve_function_name("pipeline", "check_textract", "PIPELINE_CHECK_TEXTRACT_FUNCTION_NAME")
    fetch_fn = resolve_function_name("pipeline", "fetch_textract", "PIPELINE_FETCH_TEXTRACT_FUNCTION_NAME")

    key = _raw_test_key(f"textract-{uuid.uuid4().hex}.png")
    extracted_key = ""
    extracted_bucket = ""

    try:
        S3_CLIENT.put_object(Bucket=RESUME_BUCKET, Key=key, Body=ONE_BY_ONE_PNG, ContentType="image/png")

        start_payload = invoke_lambda(start_fn, {"bucket": RESUME_BUCKET, "key": key})
        job_id = start_payload.get("job_id")
        assert job_id

        status = _wait_for_textract_success(check_fn, job_id)
        assert status == "SUCCEEDED"

        fetch_payload = invoke_lambda(fetch_fn, {"bucket": RESUME_BUCKET, "key": key, "textract": {"job_id": job_id}})
        assert fetch_payload.get("s3_bucket")
        assert fetch_payload.get("s3_key")

        extracted_bucket = fetch_payload["s3_bucket"]
        extracted_key = fetch_payload["s3_key"]

        S3_CLIENT.head_object(Bucket=extracted_bucket, Key=extracted_key)
    finally:
        _delete_s3_object(RESUME_BUCKET, key)
        _delete_s3_object(extracted_bucket, extracted_key)


def test_pipeline_llm_extract_lambda_smoke():
    if not bool_env("RUN_BEDROCK_LAMBDA_TEST"):
        pytest.skip("Set RUN_BEDROCK_LAMBDA_TEST=1 to run Bedrock-backed llm_extract test")

    function_name = resolve_function_name("pipeline", "llm_extract", "PIPELINE_LLM_EXTRACT_FUNCTION_NAME")
    event = {
        "bucket": RESUME_BUCKET or "integration-bucket",
        "key": _raw_test_key(f"llm-{uuid.uuid4().hex}.docx"),
        "normalized": {
            "text": (
                "Jane Doe\nSenior Software Engineer\n"
                "Skills: Python, AWS, Terraform, CI/CD\n"
                "Experience: 8 years building distributed systems."
            )
        },
    }

    payload = invoke_lambda(function_name, event)
    assert "is_valid" in payload
    assert isinstance(payload["is_valid"], bool)


def test_pipeline_full_state_machine_resume_e2e():
    if not bool_env("RUN_FULL_PIPELINE_E2E"):
        pytest.skip("Set RUN_FULL_PIPELINE_E2E=1 to run full Step Functions resume e2e")
    _ensure_resume_bucket()

    if not STATE_MACHINE_ARN:
        pytest.skip("PIPELINE_STATE_MACHINE_ARN (or STATE_MACHINE_ARN) not set")

    suffix = uuid.uuid4().hex[:12]
    key = _raw_test_key(f"full-run-resume-{suffix}.docx")
    pk = f"{RESUME_BUCKET}#{key}"

    try:
        docx = _make_docx_bytes(
            "John Resume Candidate Software Engineer Python AWS Terraform Education Experience Certifications"
        )
        S3_CLIENT.put_object(Bucket=RESUME_BUCKET, Key=key, Body=docx)

        start = SFN_CLIENT.start_execution(
            stateMachineArn=STATE_MACHINE_ARN,
            name=f"integration-full-resume-{suffix}",
            input=json.dumps({"bucket": RESUME_BUCKET, "key": key}),
        )

        execution = _wait_for_execution(start["executionArn"], timeout_seconds=600)
        assert execution["status"] == "SUCCEEDED", execution.get("cause", "Execution failed")

        output = json.loads(execution.get("output", "{}"))
        assert output.get("bucket") == RESUME_BUCKET
        assert output.get("key") == key

        if TALENT_TABLE and output.get("extracted", {}).get("is_valid") is True:
            item = DDB_RESOURCE.Table(TALENT_TABLE).get_item(Key={"pk": pk}).get("Item")
            assert item is not None
    finally:
        _delete_s3_object(RESUME_BUCKET, key)
        if TALENT_TABLE:
            _safe_delete_item(TALENT_TABLE, {"pk": pk})
            _cleanup_audit_entries(pk)


def test_pipeline_full_state_machine_non_resume_e2e_delete_or_no_persist():
    if not bool_env("RUN_FULL_PIPELINE_NON_RESUME_E2E"):
        pytest.skip("Set RUN_FULL_PIPELINE_NON_RESUME_E2E=1 to run full Step Functions non-resume e2e")
    _ensure_resume_bucket()

    if not STATE_MACHINE_ARN:
        pytest.skip("PIPELINE_STATE_MACHINE_ARN (or STATE_MACHINE_ARN) not set")

    suffix = uuid.uuid4().hex[:12]
    key = _raw_test_key(f"full-run-not-resume-{suffix}.docx")
    pk = f"{RESUME_BUCKET}#{key}"

    try:
        docx = _make_docx_bytes(
            "INVOICE\nInvoice Number 10042\nBill To Acme Corp\nAmount Due 1250.00\n"
            "This document is an invoice and not a resume or CV."
        )
        S3_CLIENT.put_object(Bucket=RESUME_BUCKET, Key=key, Body=docx)

        start = SFN_CLIENT.start_execution(
            stateMachineArn=STATE_MACHINE_ARN,
            name=f"integration-full-nonresume-{suffix}",
            input=json.dumps({"bucket": RESUME_BUCKET, "key": key}),
        )

        execution = _wait_for_execution(start["executionArn"], timeout_seconds=600)
        assert execution["status"] == "SUCCEEDED", execution.get("cause", "Execution failed")

        output = json.loads(execution.get("output", "{}"))
        assert output.get("bucket") == RESUME_BUCKET
        assert output.get("key") == key
        assert output.get("extracted", {}).get("is_valid") is False

        if TALENT_TABLE:
            item = DDB_RESOURCE.Table(TALENT_TABLE).get_item(Key={"pk": pk}).get("Item")
            assert item is None

        assert _object_exists(RESUME_BUCKET, key) is False
    finally:
        _delete_s3_object(RESUME_BUCKET, key)
        if TALENT_TABLE:
            _safe_delete_item(TALENT_TABLE, {"pk": pk})
            _cleanup_audit_entries(pk)
