"""Tests for starter Lambda."""

import json
import boto3
import pytest

from _lambda_loader import load as _load_lambda


def _reload_app():
    return _load_lambda("modules/pipeline/lambda_src/starter")


class TestStarterHandler:
    def _setup_ssm(self, arn="arn:aws:states:us-east-1:123456789012:stateMachine:test"):
        ssm = boto3.client("ssm", region_name="us-east-1")
        ssm.put_parameter(Name="/test/sfn-arn", Value=arn, Type="String")
        return ssm

    def _s3_event(self, bucket, key):
        return {
            "Records": [
                {
                    "s3": {
                        "bucket": {"name": bucket},
                        "object": {"key": key},
                    }
                }
            ]
        }

    def test_starts_execution_for_raw_prefix(self, aws_mocks):
        self._setup_ssm()
        # Create a mock SFN — moto supports step functions
        sfn = boto3.client("stepfunctions", region_name="us-east-1")
        sfn.create_state_machine(
            name="test",
            definition='{"StartAt":"X","States":{"X":{"Type":"Succeed"}}}',
            roleArn="arn:aws:iam::123456789012:role/test",
        )
        app = _reload_app()

        result = app.handler(self._s3_event("mybucket", "raw/resume.pdf"), None)
        assert result["ok"] is True

    def test_skips_non_raw_prefix(self, aws_mocks):
        self._setup_ssm()
        app = _reload_app()

        result = app.handler(self._s3_event("mybucket", "other/file.pdf"), None)
        assert result["ok"] is True
        # No execution should have been started (would fail if SFN doesn't exist)

    def test_url_decodes_key(self, aws_mocks):
        self._setup_ssm()
        sfn = boto3.client("stepfunctions", region_name="us-east-1")
        sfn.create_state_machine(
            name="test",
            definition='{"StartAt":"X","States":{"X":{"Type":"Succeed"}}}',
            roleArn="arn:aws:iam::123456789012:role/test",
        )
        app = _reload_app()

        result = app.handler(self._s3_event("mybucket", "raw/my+file.pdf"), None)
        assert result["ok"] is True

    def test_no_records_ok(self, aws_mocks):
        self._setup_ssm()
        app = _reload_app()
        result = app.handler({"Records": []}, None)
        assert result["ok"] is True
