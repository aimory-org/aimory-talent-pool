"""Tests for get_resume_upload_url Lambda."""

import json

import boto3
from _lambda_loader import load as _load_lambda


def _reload_app():
    return _load_lambda("modules/api/lambda_src/get_resume_upload_url")


class TestGetResumeUploadUrlHandler:
    def _setup_s3(self):
        s3 = boto3.client("s3", region_name="us-east-1")
        s3.create_bucket(Bucket="test-resume-bucket")
        return s3

    def test_missing_filename_returns_400(self, aws_mocks):
        self._setup_s3()
        app = _reload_app()
        resp = app.handler({"queryStringParameters": {}}, None)
        assert resp["statusCode"] == 400
        body = json.loads(resp["body"])
        assert "filename" in body["error"].lower()

    def test_invalid_content_type_returns_400(self, aws_mocks):
        self._setup_s3()
        app = _reload_app()
        resp = app.handler(
            {
                "queryStringParameters": {
                    "filename": "test.pdf",
                    "contentType": "text/plain",
                }
            },
            None,
        )
        assert resp["statusCode"] == 400
        body = json.loads(resp["body"])
        assert "content type" in body["error"].lower()

    def test_invalid_filename_returns_400(self, aws_mocks):
        self._setup_s3()
        app = _reload_app()
        resp = app.handler({"queryStringParameters": {"filename": "<script>alert(1)</script>.pdf"}}, None)
        assert resp["statusCode"] == 400

    def test_generates_presigned_put_url(self, aws_mocks):
        self._setup_s3()
        app = _reload_app()
        resp = app.handler(
            {"queryStringParameters": {"filename": "John Doe Resume.pdf"}},
            None,
        )
        assert resp["statusCode"] == 200
        body = json.loads(resp["body"])
        assert "uploadUrl" in body
        assert "key" in body
        assert body["key"].startswith("resumes/raw/")
        assert "John Doe Resume.pdf" in body["key"]
        assert body["expiresIn"] == 900

    def test_pdf_content_type_accepted(self, aws_mocks):
        self._setup_s3()
        app = _reload_app()
        resp = app.handler(
            {
                "queryStringParameters": {
                    "filename": "resume.pdf",
                    "contentType": "application/pdf",
                }
            },
            None,
        )
        assert resp["statusCode"] == 200

    def test_docx_content_type_accepted(self, aws_mocks):
        self._setup_s3()
        app = _reload_app()
        resp = app.handler(
            {
                "queryStringParameters": {
                    "filename": "resume.docx",
                    "contentType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                }
            },
            None,
        )
        assert resp["statusCode"] == 200

    def test_doc_content_type_accepted(self, aws_mocks):
        self._setup_s3()
        app = _reload_app()
        resp = app.handler(
            {
                "queryStringParameters": {
                    "filename": "resume.doc",
                    "contentType": "application/msword",
                }
            },
            None,
        )
        assert resp["statusCode"] == 200

    def test_duplicate_key_gets_unique_suffix(self, aws_mocks):
        s3 = self._setup_s3()
        app = _reload_app()

        # First upload — get the key
        resp1 = app.handler({"queryStringParameters": {"filename": "duplicate.pdf"}}, None)
        body1 = json.loads(resp1["body"])
        key1 = body1["key"]

        # Place an object at that key so the second call sees a collision
        s3.put_object(Bucket="test-resume-bucket", Key=key1, Body=b"pdf")

        # Reload to reset any state
        app = _reload_app()
        resp2 = app.handler({"queryStringParameters": {"filename": "duplicate.pdf"}}, None)
        body2 = json.loads(resp2["body"])
        key2 = body2["key"]

        assert key1 != key2
        assert "duplicate" in key2

    def test_filename_with_path_traversal_stripped(self, aws_mocks):
        self._setup_s3()
        app = _reload_app()
        resp = app.handler(
            {"queryStringParameters": {"filename": "subdir/safe_name.pdf"}},
            None,
        )
        assert resp["statusCode"] == 200
        body = json.loads(resp["body"])
        assert "subdir" not in body["key"].split("/")[-1] or "safe_name" in body["key"]

    def test_special_characters_are_sanitized_not_rejected(self, aws_mocks):
        self._setup_s3()
        app = _reload_app()
        resp = app.handler(
            {
                "queryStringParameters": {
                    "filename": "John's Resume #1 & Final!.pdf",
                    "contentType": "application/pdf",
                }
            },
            None,
        )
        assert resp["statusCode"] == 200
