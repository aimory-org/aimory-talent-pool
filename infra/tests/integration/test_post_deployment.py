"""
Post-deployment (integration) smoke tests.

These tests run against a LIVE deployed environment — they make real AWS API
calls / HTTP requests and are intentionally excluded from the unit test run.

Usage:
    # Set env vars from Terraform outputs first, then:
    pytest infra/tests/integration/ -m integration -v

Required environment variables:
    API_ENDPOINT        – API Gateway base URL  (e.g. https://xxx.execute-api.us-east-1.amazonaws.com)
    PRESIGN_API_KEY     – API key for the presign endpoint
    AWS_REGION          – AWS region (default: us-east-1)
    RESUME_BUCKET       – S3 bucket name for resumes
    TALENT_PROFILES_TABLE  – DynamoDB table name
    SKILLS_LOOKUP_TABLE    – DynamoDB skills lookup table name
    CERTIFICATIONS_LOOKUP_TABLE  – DynamoDB certs lookup table name
    CITIES_LOOKUP_TABLE    – DynamoDB cities lookup table name
"""

import json
import os
import time

import boto3
import pytest
import requests

pytestmark = pytest.mark.integration

API = os.environ.get("API_ENDPOINT", "").rstrip("/")
PRESIGN_KEY = os.environ.get("PRESIGN_API_KEY", "")
REGION = os.environ.get("AWS_REGION", "us-east-1")
RESUME_BUCKET = os.environ.get("RESUME_BUCKET", "")
TALENT_TABLE = os.environ.get("TALENT_PROFILES_TABLE", "")

# ── Helpers ─────────────────────────────────────────────────────────────────


def _api(method, path, **kwargs):
    url = f"{API}{path}"
    return requests.request(method, url, timeout=10, **kwargs)


def _skip_if_no_api():
    if not API:
        pytest.skip("API_ENDPOINT not set — skipping integration test")


# ── Presign Lambda ───────────────────────────────────────────────────────────


class TestPresignEndpoint:
    def test_presign_invalid_key_returns_401(self):
        _skip_if_no_api()
        resp = _api("POST", "/presign", headers={"x-api-key": "wrong"}, json={"filename": "test.pdf"})
        assert resp.status_code == 401

    def test_presign_valid_key_returns_url(self):
        _skip_if_no_api()
        if not PRESIGN_KEY:
            pytest.skip("PRESIGN_API_KEY not set")
        resp = _api("POST", "/presign", headers={"x-api-key": PRESIGN_KEY}, json={"filename": "smoke_test.pdf"})
        assert resp.status_code == 200
        body = resp.json()
        assert "url" in body
        assert body["url"].startswith("https://")


# ── Get Lookups Lambda ───────────────────────────────────────────────────────


class TestGetLookupsEndpoint:
    def test_lookups_returns_200(self):
        _skip_if_no_api()
        resp = _api("GET", "/lookups")
        assert resp.status_code == 200
        body = resp.json()
        assert "skills" in body
        assert "certifications" in body
        assert "cities" in body
        assert isinstance(body["skills"], list)

    def test_lookups_include_skills_only(self):
        _skip_if_no_api()
        resp = _api("GET", "/lookups", params={"include": "skills"})
        assert resp.status_code == 200
        body = resp.json()
        assert "skills" in body
        assert "certifications" not in body


# ── Get Talent Lambda ─────────────────────────────────────────────────────────


class TestGetTalentEndpoint:
    def test_not_found_returns_404(self):
        _skip_if_no_api()
        resp = _api("GET", "/talent/nonexistent-pk-smoke-test")
        assert resp.status_code == 404

    def test_missing_pk_returns_400(self):
        _skip_if_no_api()
        resp = _api("GET", "/talent/")
        assert resp.status_code in (400, 403, 404)  # depends on API GW config


# ── Update Talent Lambda ──────────────────────────────────────────────────────


class TestUpdateTalentEndpoint:
    def test_nonexistent_pk_returns_404(self):
        _skip_if_no_api()
        resp = _api("PUT", "/talent", params={"pk": "smoke-test-nonexistent"}, json={"status": "Active Candidate"})
        assert resp.status_code == 404

    def test_invalid_status_returns_400(self):
        _skip_if_no_api()
        resp = _api("PUT", "/talent", params={"pk": "any"}, json={"status": "InvalidStatus"})
        assert resp.status_code == 400


# ── Delete Talent Lambda ──────────────────────────────────────────────────────


class TestDeleteTalentEndpoint:
    def test_missing_pk_returns_400(self):
        _skip_if_no_api()
        resp = _api("DELETE", "/talent")
        assert resp.status_code in (400, 403)

    def test_nonexistent_pk_returns_404(self):
        _skip_if_no_api()
        resp = _api("DELETE", "/talent", params={"pk": "smoke-test-nonexistent"})
        assert resp.status_code == 404


# ── Resume URL Lambda ─────────────────────────────────────────────────────────


class TestGetResumeUrlEndpoint:
    def test_missing_key_returns_400(self):
        _skip_if_no_api()
        resp = _api("GET", "/resume-url")
        assert resp.status_code == 400

    def test_nonexistent_key_returns_404(self):
        _skip_if_no_api()
        resp = _api("GET", "/resume-url", params={"key": "raw/smoke-test-nonexistent.pdf"})
        assert resp.status_code == 404


# ── DynamoDB Health Checks ────────────────────────────────────────────────────


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


# ── S3 Health Check ────────────────────────────────────────────────────────────


class TestS3Health:
    def test_resume_bucket_accessible(self):
        if not RESUME_BUCKET:
            pytest.skip("RESUME_BUCKET not set")
        s3 = boto3.client("s3", region_name=REGION)
        resp = s3.list_objects_v2(Bucket=RESUME_BUCKET, MaxKeys=1)
        assert "ResponseMetadata" in resp
