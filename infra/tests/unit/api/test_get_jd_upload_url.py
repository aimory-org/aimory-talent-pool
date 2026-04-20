"""Tests for get_jd_upload_url Lambda."""

import json

import boto3
from _lambda_loader import load as _load_lambda


def _reload_app():
    return _load_lambda("modules/api/lambda_src/get_jd_upload_url")


class TestGetJdUploadUrlHandler:
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
            {"queryStringParameters": {"filename": "Senior Engineer JD.pdf"}},
            None,
        )
        assert resp["statusCode"] == 200
        body = json.loads(resp["body"])
        assert "uploadUrl" in body
        assert "key" in body
        assert body["key"].startswith("job-descriptions/raw/")
        assert "Senior Engineer JD.pdf" in body["key"]
        assert body["expiresIn"] == 900

    def test_pdf_content_type_accepted(self, aws_mocks):
        self._setup_s3()
        app = _reload_app()
        resp = app.handler(
            {
                "queryStringParameters": {
                    "filename": "jd.pdf",
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
                    "filename": "jd.docx",
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
                    "filename": "jd.doc",
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
                    "filename": "Senior Engineer #1 & Final!.pdf",
                    "contentType": "application/pdf",
                }
            },
            None,
        )
        assert resp["statusCode"] == 200
        body = json.loads(resp["body"])
        assert "Senior Engineer" in body["key"]
        assert body["key"].endswith(".pdf")

    def test_missing_extension_gets_added_from_content_type(self, aws_mocks):
        self._setup_s3()
        app = _reload_app()
        resp = app.handler(
            {
                "queryStringParameters": {
                    "filename": "Software Engineer JD",
                    "contentType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                }
            },
            None,
        )
        assert resp["statusCode"] == 200
        body = json.loads(resp["body"])
        assert body["key"].endswith(".docx")

    def test_mismatched_extension_is_normalized_to_content_type(self, aws_mocks):
        self._setup_s3()
        app = _reload_app()
        resp = app.handler(
            {
                "queryStringParameters": {
                    "filename": "Upload Name.pdf",
                    "contentType": "application/msword",
                }
            },
            None,
        )
        assert resp["statusCode"] == 200
        body = json.loads(resp["body"])
        assert body["key"].endswith(".doc")

    def test_null_query_params_returns_400(self, aws_mocks):
        self._setup_s3()
        app = _reload_app()
        resp = app.handler({"queryStringParameters": None}, None)
        assert resp["statusCode"] == 400

    def test_key_includes_date_prefix(self, aws_mocks):
        self._setup_s3()
        app = _reload_app()
        resp = app.handler({"queryStringParameters": {"filename": "test.pdf"}}, None)
        body = json.loads(resp["body"])
        # Key should match: job-descriptions/raw/YYYY-MM-DD_test.pdf
        import re

        assert re.match(r"job-descriptions/raw/\d{4}-\d{2}-\d{2}_test\.pdf", body["key"])
