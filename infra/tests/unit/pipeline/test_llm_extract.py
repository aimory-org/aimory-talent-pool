"""Tests for llm_extract Lambda (document-block extraction).

llm_extract now hands the raw document (bytes from S3) to Bedrock Converse and
parses the structured JSON back out — it no longer receives pre-extracted text.
Tests seed the S3 object, reload the module inside moto so its clients bind to
the fake backend, and patch the Bedrock client.
"""

import json
from unittest.mock import patch

import boto3
import pytest
from _lambda_loader import load as _load_lambda

BUCKET = "test-resume-bucket"


def _reload_app():
    return _load_lambda("modules/document_pipeline/lambda_src/llm_extract")


def _seed(key="raw/file.pdf", body=b"%PDF-1.4 fake document bytes"):
    """Put a document object in the (moto) resume bucket and return the event."""
    s3 = boto3.client("s3", region_name="us-east-1")
    try:
        s3.create_bucket(Bucket=BUCKET)
    except s3.exceptions.BucketAlreadyOwnedByYou:
        pass
    s3.put_object(Bucket=BUCKET, Key=key, Body=body)
    return {"bucket": BUCKET, "key": key}


def _bedrock_response(payload: dict):
    """Build a fake Bedrock converse() response."""
    return {"output": {"message": {"content": [{"text": json.dumps(payload)}]}}}


class TestLLMExtractInputValidation:
    def test_missing_bucket_key_raises(self, aws_mocks):
        app = _reload_app()
        with pytest.raises(ValueError, match="Missing bucket"):
            app.handler({}, None)

    def test_unsupported_file_type_raises(self, aws_mocks):
        app = _reload_app()
        with pytest.raises(ValueError, match="Unsupported file type"):
            app.handler({"bucket": BUCKET, "key": "raw/notes.txt"}, None)

    def test_missing_model_id_raises(self, aws_mocks, monkeypatch):
        monkeypatch.setenv("MODEL_ID", "")
        app = _reload_app()
        with pytest.raises(ValueError, match="MODEL_ID"):
            app.handler({"bucket": BUCKET, "key": "raw/file.pdf"}, None)


class TestLLMExtractResume:
    def test_valid_resume_returns_profile(self, aws_mocks):
        event = _seed("raw/file.pdf")
        app = _reload_app()
        profile = {
            "is_valid": True,
            "name": "Jane",
            "contact": {"email": "j@x.com", "phone": "555", "linkedin": None, "github": None},
            "summary": "Dev",
            "skillsets": [{"name": "Python", "evidence": ["code"]}],
            "years_of_experience": 5,
            "clearance_level": None,
            "certifications": [],
            "companies": [{"name": "Acme", "evidence": ["dev"]}],
            "location": {"city": "DC", "state": "DC"},
        }
        with patch.object(app, "bedrock_client") as mock_bedrock:
            mock_bedrock.converse.return_value = _bedrock_response(profile)
            result = app.handler(event, None)
        assert result["is_valid"] is True
        assert result["name"] == "Jane"
        assert "rejection_reason" not in result

    def test_pdf_document_block_has_citations(self, aws_mocks):
        event = _seed("raw/file.pdf")
        app = _reload_app()
        with patch.object(app, "bedrock_client") as mock_bedrock:
            mock_bedrock.converse.return_value = _bedrock_response({"is_valid": True, "name": "X"})
            app.handler(event, None)
            content = mock_bedrock.converse.call_args.kwargs["messages"][0]["content"]
        doc_block = content[0]["document"]
        assert doc_block["format"] == "pdf"
        assert doc_block["citations"] == {"enabled": True}
        assert doc_block["source"]["bytes"]

    def test_non_resume_deletes_s3_file(self, aws_mocks):
        event = _seed("raw/invoice.pdf")
        app = _reload_app()
        with patch.object(app, "bedrock_client") as mock_bedrock:
            mock_bedrock.converse.return_value = _bedrock_response(
                {"is_valid": False, "rejection_reason": "This is an invoice", "name": None}
            )
            result = app.handler(event, None)
        assert result["is_valid"] is False
        assert result["deleted"] is True
        s3 = boto3.client("s3", region_name="us-east-1")
        objs = s3.list_objects_v2(Bucket=BUCKET, Prefix="raw/invoice.pdf")
        assert objs.get("KeyCount", 0) == 0


class TestLLMExtractJSONRepair:
    def test_strips_code_fences(self, aws_mocks):
        event = _seed("raw/file.pdf")
        app = _reload_app()
        payload = '{"is_valid": true, "name": "X", "skillsets": []}'
        fenced = f"```json\n{payload}\n```"
        with patch.object(app, "bedrock_client") as mock_bedrock:
            mock_bedrock.converse.return_value = {"output": {"message": {"content": [{"text": fenced}]}}}
            result = app.handler(event, None)
        assert result["is_valid"] is True

    def test_fixes_trailing_commas(self, aws_mocks):
        event = _seed("raw/file.pdf")
        app = _reload_app()
        bad_json = '{"is_valid": true, "name": "X", "skillsets": [],}'
        with patch.object(app, "bedrock_client") as mock_bedrock:
            mock_bedrock.converse.return_value = {"output": {"message": {"content": [{"text": bad_json}]}}}
            result = app.handler(event, None)
        assert result["name"] == "X"

    def test_concatenates_multiple_text_blocks(self, aws_mocks):
        # Citations mode can split the answer across text blocks.
        event = _seed("raw/file.pdf")
        app = _reload_app()
        content = [{"text": '{"is_valid": true, "na'}, {"text": 'me": "Split"}'}]
        with patch.object(app, "bedrock_client") as mock_bedrock:
            mock_bedrock.converse.return_value = {"output": {"message": {"content": content}}}
            result = app.handler(event, None)
        assert result["name"] == "Split"

    def test_no_text_content_raises(self, aws_mocks):
        event = _seed("raw/file.pdf")
        app = _reload_app()
        with patch.object(app, "bedrock_client") as mock_bedrock:
            mock_bedrock.converse.return_value = {"output": {"message": {"content": [{"image": "data"}]}}}
            with pytest.raises(RuntimeError, match="No text content"):
                app.handler(event, None)

    def test_invalid_json_raises(self, aws_mocks):
        event = _seed("raw/file.pdf")
        app = _reload_app()
        with patch.object(app, "bedrock_client") as mock_bedrock:
            mock_bedrock.converse.return_value = {"output": {"message": {"content": [{"text": "not json at all {{{"}]}}}
            with pytest.raises(RuntimeError, match="not valid JSON"):
                app.handler(event, None)


class TestLLMExtractThrottling:
    def test_retries_on_throttle(self, aws_mocks):
        from botocore.exceptions import ClientError

        event = _seed("raw/file.pdf")
        app = _reload_app()
        throttle_err = ClientError({"Error": {"Code": "ThrottlingException", "Message": "Rate exceeded"}}, "Converse")
        success_resp = _bedrock_response({"is_valid": True, "name": "X"})
        with patch.object(app.time, "sleep"), patch.object(app, "bedrock_client") as mock_bedrock:
            mock_bedrock.converse.side_effect = [throttle_err, throttle_err, success_resp]
            result = app.handler(event, None)
        assert result["is_valid"] is True
        assert mock_bedrock.converse.call_count == 3

    def test_exhausted_retries_raises(self, aws_mocks):
        from botocore.exceptions import ClientError

        event = _seed("raw/file.pdf")
        app = _reload_app()
        throttle_err = ClientError({"Error": {"Code": "ThrottlingException", "Message": "Rate exceeded"}}, "Converse")
        with patch.object(app.time, "sleep"), patch.object(app, "bedrock_client") as mock_bedrock:
            mock_bedrock.converse.side_effect = [throttle_err] * 8
            with pytest.raises(RuntimeError, match="Bedrock converse failed"):
                app.handler(event, None)
