"""
Post-deployment HTTP smoke tests.

These tests validate:
- Presign Lambda Function URL authentication and response shape
- API Gateway protected route behavior without JWTs
"""

import os

import pytest
import requests

pytestmark = pytest.mark.integration

API = os.environ.get("API_ENDPOINT", "").rstrip("/")
PRESIGN_URL = os.environ.get("PRESIGN_FUNCTION_URL", "").rstrip("/")
PRESIGN_KEY = os.environ.get("PRESIGN_API_KEY", "")


def _api(method, path, **kwargs):
    url = f"{API}{path}"
    return requests.request(method, url, timeout=10, **kwargs)


def _presign(method="POST", **kwargs):
    return requests.request(method, PRESIGN_URL, timeout=10, **kwargs)


def _skip_if_no_api():
    if not API:
        pytest.skip("API_ENDPOINT not set - skipping integration test")


def _skip_if_no_presign():
    if not PRESIGN_URL:
        pytest.skip("PRESIGN_FUNCTION_URL not set - skipping presign test")


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

    def test_get_job_descriptions_requires_auth(self):
        _skip_if_no_api()
        resp = _api("GET", "/job-descriptions")
        assert resp.status_code == 401

    def test_get_job_description_requires_auth(self):
        _skip_if_no_api()
        resp = _api("GET", "/job-descriptions/some-pk")
        assert resp.status_code == 401

    def test_patch_job_description_requires_auth(self):
        _skip_if_no_api()
        resp = _api("PATCH", "/job-descriptions", params={"pk": "x"}, json={"title": "Test"})
        assert resp.status_code == 401

    def test_delete_job_description_requires_auth(self):
        _skip_if_no_api()
        resp = _api("DELETE", "/job-descriptions", params={"pk": "x"})
        assert resp.status_code == 401

    def test_match_candidates_requires_auth(self):
        _skip_if_no_api()
        resp = _api("POST", "/job-descriptions/some-pk/match")
        assert resp.status_code == 401


class TestAPIGatewayRouting:
    """Verify that non-existent routes return 404 (not 500 or connection errors)."""

    def test_unknown_route_returns_404(self):
        _skip_if_no_api()
        resp = _api("GET", "/nonexistent-route-smoke-test")
        assert resp.status_code in (401, 403, 404)
