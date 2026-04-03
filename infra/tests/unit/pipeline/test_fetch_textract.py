"""Tests for fetch_textract Lambda."""

import json
from unittest.mock import patch, MagicMock

import boto3
import pytest

from _lambda_loader import load as _load_lambda


def _reload_app():
    return _load_lambda("modules/pipeline/lambda_src/fetch_textract")


class TestFetchTextractHandler:
    def setup_method(self):
        _load_lambda("modules/pipeline/lambda_src/fetch_textract")

    @patch("app.textract")
    def test_single_page_result(self, mock_textract, aws_mocks):
        import app

        s3 = boto3.client("s3", region_name="us-east-1")
        s3.create_bucket(Bucket="test-output-bucket")

        blocks = [{"BlockType": "LINE", "Text": "Hello"}]
        mock_textract.get_document_text_detection.return_value = {
            "Blocks": blocks,
        }

        result = app.handler({"bucket": "b", "key": "raw/file.pdf", "textract": {"job_id": "j-1"}}, None)
        assert result["block_count"] == 1
        assert result["s3_bucket"] == "test-output-bucket"
        assert result["s3_key"] == "extracted/raw/file.pdf.textract.json"

        # Verify S3 output
        obj = s3.get_object(Bucket="test-output-bucket", Key=result["s3_key"])
        data = json.loads(obj["Body"].read())
        assert data["job_id"] == "j-1"
        assert len(data["blocks"]) == 1

    @patch("app.textract")
    def test_pagination(self, mock_textract, aws_mocks):
        import app

        s3 = boto3.client("s3", region_name="us-east-1")
        s3.create_bucket(Bucket="test-output-bucket")

        mock_textract.get_document_text_detection.side_effect = [
            {"Blocks": [{"BlockType": "LINE", "Text": "Page1"}], "NextToken": "tok"},
            {"Blocks": [{"BlockType": "LINE", "Text": "Page2"}]},
        ]

        result = app.handler({"bucket": "b", "key": "raw/file.pdf", "textract": {"job_id": "j-2"}}, None)
        assert result["block_count"] == 2

    @patch("app.textract")
    def test_empty_blocks(self, mock_textract, aws_mocks):
        import app

        s3 = boto3.client("s3", region_name="us-east-1")
        s3.create_bucket(Bucket="test-output-bucket")

        mock_textract.get_document_text_detection.return_value = {"Blocks": []}

        result = app.handler({"bucket": "b", "key": "raw/file.pdf", "textract": {"job_id": "j-3"}}, None)
        assert result["block_count"] == 0
