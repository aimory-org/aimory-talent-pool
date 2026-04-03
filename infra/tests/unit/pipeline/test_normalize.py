"""Tests for normalize Lambda."""

import json

import boto3
from _lambda_loader import load as _load_lambda


def _reload_app():
    return _load_lambda("modules/pipeline/lambda_src/normalize")


class TestNormalizeDirectText:
    def test_direct_text_path(self, aws_mocks):
        app = _reload_app()
        event = {
            "prep": {"skip_textract": True, "direct_text": "Jane Doe  Senior Developer   Python AWS"},
            "textractBlocks": {},
        }
        result = app.handler(event, None)
        assert "text" in result
        assert result["line_count"] >= 1

    def test_whitespace_collapsed(self, aws_mocks):
        app = _reload_app()
        event = {
            "prep": {"skip_textract": True, "direct_text": "Hello     World    Test"},
        }
        result = app.handler(event, None)
        # Multiple spaces should be collapsed
        assert "Hello     World" not in result["text"]

    def test_separator_breaks(self, aws_mocks):
        app = _reload_app()
        event = {
            "prep": {"skip_textract": True, "direct_text": "Python | AWS | Terraform"},
        }
        result = app.handler(event, None)
        assert "\n" in result["text"]

    def test_bullet_breaks(self, aws_mocks):
        app = _reload_app()
        event = {
            "prep": {"skip_textract": True, "direct_text": "Python • AWS • Terraform"},
        }
        result = app.handler(event, None)
        assert "\n" in result["text"]

    def test_section_header_breaks(self, aws_mocks):
        app = _reload_app()
        event = {
            "prep": {"skip_textract": True, "direct_text": "some text Education University of Test Skills Python"},
        }
        result = app.handler(event, None)
        assert "\nEducation" in result["text"]
        assert "\nSkills" in result["text"]

    def test_year_range_breaks(self, aws_mocks):
        app = _reload_app()
        event = {
            "prep": {"skip_textract": True, "direct_text": "Company A 2019-2022 Company B 2015-2018"},
        }
        result = app.handler(event, None)
        assert "\n2019-2022" in result["text"] or "\n2019" in result["text"]

    def test_month_year_breaks(self, aws_mocks):
        app = _reload_app()
        event = {
            "prep": {"skip_textract": True, "direct_text": "Project Lead January 2020 through December 2022"},
        }
        result = app.handler(event, None)
        assert "\nJanuary 2020" in result["text"]

    def test_empty_text(self, aws_mocks):
        app = _reload_app()
        event = {"prep": {"skip_textract": True, "direct_text": "   "}}
        result = app.handler(event, None)
        assert result["text"] == ""

    def test_excessive_newlines_collapsed(self, aws_mocks):
        app = _reload_app()
        event = {
            "prep": {"skip_textract": True, "direct_text": "a\n\n\n\n\n\nb"},
        }
        result = app.handler(event, None)
        assert "\n\n\n" not in result["text"]


class TestNormalizeTextractPath:
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
            "prep": {},
            "textractBlocks": {
                "s3_bucket": "test-output-bucket",
                "s3_key": "extracted/raw/file.pdf.textract.json",
            },
        }
        result = app.handler(event, None)
        assert "Jane Doe" in result["text"]
        assert "Senior Developer" in result["text"]
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
            "prep": {},
            "textractBlocks": {"s3_bucket": "test-output-bucket", "s3_key": "extracted/empty.json"},
        }
        result = app.handler(event, None)
        assert result["text"] == ""
        assert result["line_count"] == 0
