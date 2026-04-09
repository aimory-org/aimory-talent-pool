"""Tests for llm_extract Lambda."""

import json
from unittest.mock import patch

import boto3
import pytest
from _lambda_loader import load as _load_lambda


def _reload_app():
    return _load_lambda("modules/pipeline/lambda_src/llm_extract")


def _make_event(text="Resume text here", bucket="test-resume-bucket", key="raw/file.pdf"):
    return {"normalized": {"text": text}, "bucket": bucket, "key": key}


def _bedrock_response(payload: dict):
    """Build a fake Bedrock converse() response."""
    return {"output": {"message": {"content": [{"text": json.dumps(payload)}]}}}


class TestLLMExtractText:
    def test_missing_normalized_text_raises(self, aws_mocks):
        app = _reload_app()
        with pytest.raises(ValueError, match="Missing normalized text"):
            app.handler({"bucket": "b", "key": "k"}, None)

    def test_missing_model_id_raises(self, aws_mocks, monkeypatch):
        monkeypatch.setenv("MODEL_ID", "")
        app = _reload_app()
        with pytest.raises(ValueError, match="MODEL_ID"):
            app.handler(_make_event(), None)


class TestLLMExtractResume:
    def setup_method(self):
        _load_lambda("modules/pipeline/lambda_src/llm_extract")

    @patch("app.bedrock_client")
    def test_valid_resume_returns_profile(self, mock_bedrock, aws_mocks):
        import app

        profile = {
            "is_resume": True,
            "name": "Jane",
            "contact": {"email": "j@x.com", "phone": "555", "linkedin": None, "github": None},
            "summary": "Dev",
            "talent_bucket": "IT Resources",
            "talent_category": "Developer",
            "skillsets": [{"name": "Python", "evidence": ["code"]}],
            "years_of_experience": 5,
            "clearance_level": None,
            "certifications": [],
            "companies": [{"name": "Acme", "evidence": ["dev"]}],
            "location": {"city": "DC", "state": "DC"},
            "bill_rate": None,
        }
        mock_bedrock.converse.return_value = _bedrock_response(profile)

        result = app.handler(_make_event(), None)
        assert result["is_resume"] is True
        assert result["name"] == "Jane"
        assert "rejection_reason" not in result

    @patch("app.bedrock_client")
    def test_non_resume_deletes_s3_file(self, mock_bedrock, aws_mocks):
        s3 = boto3.client("s3", region_name="us-east-1")
        s3.create_bucket(Bucket="test-resume-bucket")
        s3.put_object(Bucket="test-resume-bucket", Key="raw/invoice.pdf", Body=b"pdf")

        import app

        mock_bedrock.converse.return_value = _bedrock_response(
            {
                "is_resume": False,
                "rejection_reason": "This is an invoice",
                "name": None,
                "contact": None,
                "summary": None,
                "talent_bucket": None,
                "talent_category": None,
                "skillsets": [],
                "years_of_experience": None,
                "clearance_level": None,
                "certifications": [],
                "companies": [],
                "location": None,
                "bill_rate": None,
            }
        )

        result = app.handler(_make_event(bucket="test-resume-bucket", key="raw/invoice.pdf"), None)
        assert result["is_resume"] is False
        assert result["deleted"] is True

        # Verify file was deleted from S3
        objs = s3.list_objects_v2(Bucket="test-resume-bucket", Prefix="raw/invoice.pdf")
        assert objs.get("KeyCount", 0) == 0


class TestLLMExtractJSONRepair:
    def setup_method(self):
        _load_lambda("modules/pipeline/lambda_src/llm_extract")

    @patch("app.bedrock_client")
    def test_strips_code_fences(self, mock_bedrock, aws_mocks):
        import app

        payload = (
            '{"is_resume": true, "name": "X", "contact": {"email": null, "phone": null,'
            ' "linkedin": null, "github": null}, "summary": "Y", "talent_bucket": null,'
            ' "talent_category": null, "skillsets": [], "years_of_experience": null,'
            ' "clearance_level": null, "certifications": [], "companies": [],'
            ' "location": {"city": null, "state": null}, "bill_rate": null}'
        )
        fenced = f"```json\n{payload}\n```"
        mock_bedrock.converse.return_value = {"output": {"message": {"content": [{"text": fenced}]}}}
        result = app.handler(_make_event(), None)
        assert result["is_resume"] is True

    @patch("app.bedrock_client")
    def test_fixes_trailing_commas(self, mock_bedrock, aws_mocks):
        import app

        bad_json = (
            '{"is_resume": true, "name": "X", "contact": {"email": null, "phone": null,'
            ' "linkedin": null, "github": null,}, "summary": "Y", "talent_bucket": null,'
            ' "talent_category": null, "skillsets": [], "years_of_experience": null,'
            ' "clearance_level": null, "certifications": [], "companies": [],'
            ' "location": {"city": null, "state": null}, "bill_rate": null,}'
        )
        mock_bedrock.converse.return_value = {"output": {"message": {"content": [{"text": bad_json}]}}}
        result = app.handler(_make_event(), None)
        assert result["name"] == "X"

    @patch("app.bedrock_client")
    def test_no_text_content_raises(self, mock_bedrock, aws_mocks):
        import app

        mock_bedrock.converse.return_value = {"output": {"message": {"content": [{"image": "data"}]}}}
        with pytest.raises(RuntimeError, match="No text content"):
            app.handler(_make_event(), None)

    @patch("app.bedrock_client")
    def test_invalid_json_raises(self, mock_bedrock, aws_mocks):
        import app

        mock_bedrock.converse.return_value = {"output": {"message": {"content": [{"text": "not json at all {{{"}]}}}
        with pytest.raises(RuntimeError, match="not valid JSON"):
            app.handler(_make_event(), None)


class TestLLMExtractThrottling:
    def setup_method(self):
        _load_lambda("modules/pipeline/lambda_src/llm_extract")

    @patch("app.time.sleep")  # Don't actually wait during tests
    @patch("app.bedrock_client")
    def test_retries_on_throttle(self, mock_bedrock, mock_sleep, aws_mocks):
        import app
        from botocore.exceptions import ClientError

        throttle_err = ClientError(
            {"Error": {"Code": "ThrottlingException", "Message": "Rate exceeded"}},
            "Converse",
        )
        profile_json = json.dumps(
            {
                "is_resume": True,
                "name": "X",
                "contact": {"email": None, "phone": None, "linkedin": None, "github": None},
                "summary": "Y",
                "talent_bucket": None,
                "talent_category": None,
                "skillsets": [],
                "years_of_experience": None,
                "clearance_level": None,
                "certifications": [],
                "companies": [],
                "location": {"city": None, "state": None},
                "bill_rate": None,
            }
        )
        success_resp = {"output": {"message": {"content": [{"text": profile_json}]}}}

        mock_bedrock.converse.side_effect = [throttle_err, throttle_err, success_resp]

        result = app.handler(_make_event(), None)
        assert result["is_resume"] is True
        assert mock_bedrock.converse.call_count == 3

    @patch("app.time.sleep")
    @patch("app.bedrock_client")
    def test_exhausted_retries_raises(self, mock_bedrock, mock_sleep, aws_mocks):
        import app
        from botocore.exceptions import ClientError

        throttle_err = ClientError(
            {"Error": {"Code": "ThrottlingException", "Message": "Rate exceeded"}},
            "Converse",
        )
        mock_bedrock.converse.side_effect = [throttle_err] * 8

        with pytest.raises(RuntimeError, match="Bedrock converse failed"):
            app.handler(_make_event(), None)
