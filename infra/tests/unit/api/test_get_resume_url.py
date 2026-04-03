"""Tests for get_resume_url Lambda."""

import json

import boto3
from _lambda_loader import load as _load_lambda


def _reload_app():
    return _load_lambda("modules/api/lambda_src/get_resume_url")


class TestGetResumeUrlHandler:
    def _setup_s3(self):
        s3 = boto3.client("s3", region_name="us-east-1")
        s3.create_bucket(Bucket="test-resume-bucket")
        return s3

    def test_missing_key_returns_400(self, aws_mocks):
        self._setup_s3()
        app = _reload_app()
        resp = app.handler({"queryStringParameters": {}}, None)
        assert resp["statusCode"] == 400

    def test_object_not_found_returns_404(self, aws_mocks):
        self._setup_s3()
        app = _reload_app()
        resp = app.handler({"queryStringParameters": {"key": "raw/missing.pdf"}}, None)
        assert resp["statusCode"] == 404

    def test_generates_presigned_url(self, aws_mocks):
        s3 = self._setup_s3()
        s3.put_object(Bucket="test-resume-bucket", Key="raw/file.pdf", Body=b"pdf")
        app = _reload_app()

        resp = app.handler({"queryStringParameters": {"key": "raw/file.pdf"}}, None)
        assert resp["statusCode"] == 200
        body = json.loads(resp["body"])
        assert "url" in body
        assert body["expiresIn"] == 3600

    def test_url_decodes_key(self, aws_mocks):
        s3 = self._setup_s3()
        s3.put_object(Bucket="test-resume-bucket", Key="raw/my file.pdf", Body=b"pdf")
        app = _reload_app()

        resp = app.handler({"queryStringParameters": {"key": "raw%2Fmy%20file.pdf"}}, None)
        assert resp["statusCode"] == 200
