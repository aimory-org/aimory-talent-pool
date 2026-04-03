"""Tests for start_textract Lambda."""

from unittest.mock import patch

from _lambda_loader import load as _load_lambda


def _reload_app():
    return _load_lambda("modules/pipeline/lambda_src/start_textract")


class TestStartTextractHandler:
    def setup_method(self):
        _load_lambda("modules/pipeline/lambda_src/start_textract")

    @patch("app.textract")
    def test_returns_job_id(self, mock_textract):
        import app

        mock_textract.start_document_text_detection.return_value = {"JobId": "job-123"}

        result = app.handler({"bucket": "b", "key": "raw/file.pdf"}, None)
        assert result["job_id"] == "job-123"

    @patch("app.textract")
    def test_passes_s3_location(self, mock_textract):
        import app

        mock_textract.start_document_text_detection.return_value = {"JobId": "j"}

        app.handler({"bucket": "mybucket", "key": "raw/resume.pdf"}, None)
        call_args = mock_textract.start_document_text_detection.call_args
        s3_obj = call_args[1]["DocumentLocation"]["S3Object"]
        assert s3_obj["Bucket"] == "mybucket"
        assert s3_obj["Name"] == "raw/resume.pdf"
