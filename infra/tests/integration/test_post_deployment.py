"""
Post-deployment (integration) smoke tests.

These tests run against a LIVE deployed environment — they make real AWS API
calls / HTTP requests and are intentionally excluded from the unit test run.

Usage:
    # Set env vars from Terraform outputs first, then:
    pytest infra/tests/integration/ -m integration -v

Required environment variables:
    API_ENDPOINT           – API Gateway base URL  (e.g. https://xxx.execute-api.us-east-1.amazonaws.com)
    PRESIGN_FUNCTION_URL   – Lambda Function URL for presign (separate from API GW)
    PRESIGN_API_KEY        – API key for the presign endpoint
    AWS_REGION             – AWS region (default: us-east-1)
    RESUME_BUCKET          – S3 bucket name for resumes
    TALENT_PROFILES_TABLE  – DynamoDB table name
    SKILLS_LOOKUP_TABLE    – DynamoDB skills lookup table name
    CERTIFICATIONS_LOOKUP_TABLE – DynamoDB certs lookup table name
    CITIES_LOOKUP_TABLE    – DynamoDB cities lookup table name

Notes:
    - All API Gateway routes require Cognito JWT auth. Tests that hit the API
      without a valid token expect 401 Unauthorized.
    - The presign endpoint is a standalone Lambda Function URL (not behind API GW)
      and does its own x-api-key authentication.
"""

import os

import boto3
import pytest
import requests

pytestmark = pytest.mark.integration

API = os.environ.get("API_ENDPOINT", "").rstrip("/")
PRESIGN_URL = os.environ.get("PRESIGN_FUNCTION_URL", "").rstrip("/")
PRESIGN_KEY = os.environ.get("PRESIGN_API_KEY", "")
REGION = os.environ.get("AWS_REGION", "us-east-1")
RESUME_BUCKET = os.environ.get("RESUME_BUCKET", "")
TALENT_TABLE = os.environ.get("TALENT_PROFILES_TABLE", "")

# ── Helpers ─────────────────────────────────────────────────────────────────


def _api(method, path, **kwargs):
    url = f"{API}{path}"
    return requests.request(method, url, timeout=10, **kwargs)


def _presign(method="POST", **kwargs):
    return requests.request(method, PRESIGN_URL, timeout=10, **kwargs)


def _skip_if_no_api():
    if not API:
        pytest.skip("API_ENDPOINT not set — skipping integration test")


def _skip_if_no_presign():
    if not PRESIGN_URL:
        pytest.skip("PRESIGN_FUNCTION_URL not set — skipping presign test")


# ═════════════════════════════════════════════════════════════════════════════
# Presign Lambda (Lambda Function URL — NOT behind API Gateway)
# ═════════════════════════════════════════════════════════════════════════════


class TestPresignEndpoint:
    def test_presign_invalid_key_returns_401(self):
        _skip_if_no_presign()
        resp = _presign(headers={"x-api-key": "wrong"}, json={"filename": "test.pdf"})
        assert resp.status_code == 401

    def test_presign_valid_key_returns_url(self):
        _skip_if_no_presign()
        if not PRESIGN_KEY:
            pytest.skip("PRESIGN_API_KEY not set")
        resp = _presign(headers={"x-api-key": PRESIGN_KEY}, json={"filename": "smoke_test.pdf"})
        assert resp.status_code == 200
        body = resp.json()
        assert "url" in body
        assert body["url"].startswith("https://")


# ═════════════════════════════════════════════════════════════════════════════
# API Gateway routes — all protected by Cognito JWT authorizer
#
# Without a valid token these should all return 401.  This validates that:
#   1. The API Gateway is reachable
#   2. The Cognito authorizer is correctly attached
#   3. Routes are wired to Lambda integrations (not 404)
# ═════════════════════════════════════════════════════════════════════════════


class TestAPIGatewayAuth:
    """Unauthenticated requests to protected routes must return 401."""

    def test_get_talents_requires_auth(self):
        _skip_if_no_api()
        resp = _api("GET", "/talents")
        assert resp.status_code == 401

    def test_get_talent_requires_auth(self):
        _skip_if_no_api()
        resp = _api("GET", "/talents/some-pk")
        assert resp.status_code == 401

    def test_patch_talent_requires_auth(self):
        _skip_if_no_api()
        resp = _api("PATCH", "/talents", params={"pk": "x"}, json={"status": "Active Candidate"})
        assert resp.status_code == 401

    def test_delete_talent_requires_auth(self):
        _skip_if_no_api()
        resp = _api("DELETE", "/talents", params={"pk": "x"})
        assert resp.status_code == 401

    def test_get_lookups_requires_auth(self):
        _skip_if_no_api()
        resp = _api("GET", "/lookups")
        assert resp.status_code == 401

    def test_get_resume_url_requires_auth(self):
        _skip_if_no_api()
        resp = _api("GET", "/resume-url", params={"key": "raw/test.pdf"})
        assert resp.status_code == 401


class TestAPIGatewayRouting:
    """Verify that non-existent routes return 404 (not 500 or connection errors)."""

    def test_unknown_route_returns_404(self):
        _skip_if_no_api()
        resp = _api("GET", "/nonexistent-route-smoke-test")
        assert resp.status_code in (401, 403, 404)


# ═════════════════════════════════════════════════════════════════════════════
# DynamoDB Health Checks — direct AWS SDK calls (no auth needed, uses IAM)
# ═════════════════════════════════════════════════════════════════════════════


class TestDynamoDBHealth:
    def _ddb(self):
        return boto3.resource("dynamodb", region_name=REGION)

    def test_talent_profiles_table_accessible(self):
        if not TALENT_TABLE:
            pytest.skip("TALENT_PROFILES_TABLE not set")
        ddb = self._ddb()
        table = ddb.Table(TALENT_TABLE)
        resp = table.scan(Limit=1)
        assert "Items" in resp

    def test_skills_lookup_accessible(self):
        table_name = os.environ.get("SKILLS_LOOKUP_TABLE", "")
        if not table_name:
            pytest.skip("SKILLS_LOOKUP_TABLE not set")
        ddb = self._ddb()
        table = ddb.Table(table_name)
        resp = table.scan(Limit=1)
        assert "Items" in resp


# ═════════════════════════════════════════════════════════════════════════════
# S3 Health Check
# ═════════════════════════════════════════════════════════════════════════════


class TestS3Health:
    def test_resume_bucket_accessible(self):
        if not RESUME_BUCKET:
            pytest.skip("RESUME_BUCKET not set")
        s3 = boto3.client("s3", region_name=REGION)
        resp = s3.list_objects_v2(Bucket=RESUME_BUCKET, MaxKeys=1)
        assert "ResponseMetadata" in resp
