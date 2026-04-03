"""Tests for presign Lambda."""

import json

import boto3
import pytest

from _lambda_loader import load as _load_lambda


def _reload_app():
    return _load_lambda("modules/pipeline/lambda_src/presign")


def _make_event(body=None, api_key="test-api-key-1234567890abcdef"):
    return {
        "headers": {"x-api-key": api_key},
        "body": json.dumps(body or {"filename": "resume.pdf"}),
    }


class TestPresignAuth:
    def test_valid_api_key(self, aws_mocks):
        s3 = boto3.client("s3", region_name="us-east-1")
        s3.create_bucket(Bucket="test-resume-bucket")
        app = _reload_app()

        resp = app.handler(_make_event(), None)
        assert resp["statusCode"] == 200

    def test_invalid_api_key_returns_401(self, aws_mocks):
        app = _reload_app()
        resp = app.handler(_make_event(api_key="wrong-key"), None)
        assert resp["statusCode"] == 401

    def test_missing_api_key_returns_401(self, aws_mocks):
        app = _reload_app()
        resp = app.handler({"headers": {}, "body": "{}"}, None)
        assert resp["statusCode"] == 401

    def test_case_insensitive_headers(self, aws_mocks):
        s3 = boto3.client("s3", region_name="us-east-1")
        s3.create_bucket(Bucket="test-resume-bucket")
        app = _reload_app()

        resp = app.handler(
            {
                "headers": {"X-Api-Key": "test-api-key-1234567890abcdef"},
                "body": json.dumps({"filename": "test.pdf"}),
            },
            None,
        )
        assert resp["statusCode"] == 200


class TestPresignUrl:
    def test_returns_presigned_url(self, aws_mocks):
        s3 = boto3.client("s3", region_name="us-east-1")
        s3.create_bucket(Bucket="test-resume-bucket")
        app = _reload_app()

        resp = app.handler(_make_event({"filename": "resume.pdf"}), None)
        body = json.loads(resp["body"])
        assert "url" in body
        assert body["key"] == "raw/onedrive/resume.pdf"
        assert body["bucket"] == "test-resume-bucket"

    def test_metadata_in_response(self, aws_mocks):
        s3 = boto3.client("s3", region_name="us-east-1")
        s3.create_bucket(Bucket="test-resume-bucket")
        app = _reload_app()

        resp = app.handler(
            _make_event(
                {
                    "filename": "resume.pdf",
                    "source": "onedrive",
                    "flowRunId": "flow-123",
                }
            ),
            None,
        )
        body = json.loads(resp["body"])
        assert body["metadata"]["source"] == "onedrive"
        assert body["metadata"]["flow-run-id"] == "flow-123"

    def test_default_filename(self, aws_mocks):
        s3 = boto3.client("s3", region_name="us-east-1")
        s3.create_bucket(Bucket="test-resume-bucket")
        app = _reload_app()

        resp = app.handler(_make_event({}), None)
        body = json.loads(resp["body"])
        assert "resume.pdf" in body["key"]


class TestPresignSanitization:
    def test_sanitize_filename_removes_special_chars(self):
        app = _reload_app()
        assert app._sanitize_filename("resume<script>.pdf") == "resume_script_.pdf"

    def test_sanitize_filename_preserves_safe_chars(self):
        app = _reload_app()
        assert app._sanitize_filename("my-resume (2).pdf") == "my-resume (2).pdf"

    def test_sanitize_filename_default(self):
        app = _reload_app()
        assert app._sanitize_filename(None) == "resume.pdf"

    def test_sanitize_meta_truncates(self):
        app = _reload_app()
        long_val = "x" * 300
        assert len(app._sanitize_meta(long_val)) == 200

    def test_sanitize_meta_strips_control_chars(self):
        app = _reload_app()
        assert "\n" not in app._sanitize_meta("hello\nworld")
        assert "\t" not in app._sanitize_meta("hello\tworld")
