"""Tests for gather_text Lambda (plain text assembly for search/dedup).

gather_text intentionally does NOT reformat — the text is not sent to the LLM,
so it just faithfully assembles the direct text or the Textract LINE blocks.
"""

import json

import boto3
from _lambda_loader import load as _load_lambda


def _reload_app():
    return _load_lambda("modules/document_pipeline/lambda_src/gather_text")


class TestGatherTextDirectText:
    def test_direct_text_returned_verbatim(self, aws_mocks):
        app = _reload_app()
        text = "Jane Doe\nSenior Developer\nPython AWS"
        result = app.handler({"prep": {"skip_textract": True, "direct_text": text}}, None)
        assert result["text"] == text
        assert result["line_count"] == 3

    def test_separators_not_reformatted(self, aws_mocks):
        app = _reload_app()
        # Unlike the old normalize step, bullets/pipes are left untouched here.
        text = "Python | AWS • Terraform"
        result = app.handler({"prep": {"skip_textract": True, "direct_text": text}}, None)
        assert result["text"] == text

    def test_whitespace_only_direct_text(self, aws_mocks):
        app = _reload_app()
        result = app.handler({"prep": {"skip_textract": True, "direct_text": "   "}}, None)
        assert result["line_count"] == 0

    def test_no_direct_text_and_no_blocks(self, aws_mocks):
        app = _reload_app()
        result = app.handler({"prep": {"skip_textract": True, "direct_text": ""}}, None)
        assert result["text"] == ""
        assert result["line_count"] == 0


class TestGatherTextTextractPath:
    def test_reads_textract_blocks_from_s3(self, aws_mocks):
        s3 = boto3.client("s3", region_name="us-east-1")
        s3.create_bucket(Bucket="test-output-bucket")
        blocks = {
            "blocks": [
                {"BlockType": "LINE", "Text": "Jane Doe"},
                {"BlockType": "LINE", "Text": "Senior Developer"},
                {"BlockType": "WORD", "Text": "ignored"},
            ]
        }
        s3.put_object(
            Bucket="test-output-bucket",
            Key="extracted/raw/file.pdf.textract.json",
            Body=json.dumps(blocks).encode(),
        )
        app = _reload_app()

        event = {
            "prep": {"skip_textract": False},
            "textractBlocks": {
                "s3_bucket": "test-output-bucket",
                "s3_key": "extracted/raw/file.pdf.textract.json",
            },
        }
        result = app.handler(event, None)
        assert result["text"] == "Jane Doe\nSenior Developer"
        assert result["line_count"] == 2

    def test_empty_blocks(self, aws_mocks):
        s3 = boto3.client("s3", region_name="us-east-1")
        s3.create_bucket(Bucket="test-output-bucket")
        s3.put_object(
            Bucket="test-output-bucket",
            Key="extracted/empty.json",
            Body=json.dumps({"blocks": []}).encode(),
        )
        app = _reload_app()

        event = {
            "prep": {"skip_textract": False},
            "textractBlocks": {"s3_bucket": "test-output-bucket", "s3_key": "extracted/empty.json"},
        }
        result = app.handler(event, None)
        assert result["text"] == ""
        assert result["line_count"] == 0
