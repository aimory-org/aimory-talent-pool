"""Tests for check_textract Lambda."""

from unittest.mock import patch

from _lambda_loader import load as _load_lambda


def _reload_app():
    return _load_lambda("modules/pipeline/lambda_src/check_textract")


class TestCheckTextractHandler:
    def setup_method(self):
        _load_lambda("modules/pipeline/lambda_src/check_textract")

    @patch("app.textract")
    def test_succeeded_status(self, mock_textract):
        import app

        mock_textract.get_document_text_detection.return_value = {"JobStatus": "SUCCEEDED"}
        result = app.handler({"textract": {"job_id": "j-1"}}, None)
        assert result["status"] == "SUCCEEDED"

    @patch("app.textract")
    def test_in_progress_status(self, mock_textract):
        import app

        mock_textract.get_document_text_detection.return_value = {"JobStatus": "IN_PROGRESS"}
        result = app.handler({"textract": {"job_id": "j-1"}}, None)
        assert result["status"] == "IN_PROGRESS"

    @patch("app.textract")
    def test_failed_status(self, mock_textract):
        import app

        mock_textract.get_document_text_detection.return_value = {"JobStatus": "FAILED"}
        result = app.handler({"textract": {"job_id": "j-1"}}, None)
        assert result["status"] == "FAILED"

    @patch("app.textract")
    def test_partial_success_maps_to_succeeded(self, mock_textract):
        import app

        mock_textract.get_document_text_detection.return_value = {"JobStatus": "PARTIAL_SUCCESS"}
        result = app.handler({"textract": {"job_id": "j-1"}}, None)
        assert result["status"] == "SUCCEEDED"
