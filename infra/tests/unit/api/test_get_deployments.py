"""Tests for get_deployments Lambda."""

import io
import json
from urllib.error import HTTPError
from unittest.mock import MagicMock, patch

from _lambda_loader import load as _load_lambda


def _reload_app():
    return _load_lambda("modules/api/lambda_src/get_deployments")


def _urlopen_response(payload):
    response = MagicMock()
    response.__enter__.return_value = response
    response.read.return_value = json.dumps(payload).encode("utf-8")
    return response


class TestGetDeployments:
    def test_returns_transformed_deployments(self, aws_mocks):
        app = _reload_app()
        app.ssm.get_parameter = MagicMock(return_value={"Parameter": {"Value": "ghp_test"}})
        with patch.object(
            app,
            "urlopen",
            return_value=_urlopen_response(
                {
                    "workflow_runs": [
                        {
                            "id": 1001,
                            "status": "completed",
                            "conclusion": "success",
                            "head_branch": "main",
                            "head_sha": "abc123456789",
                            "head_commit": {"message": "Add audit history\n\nMore detail"},
                            "actor": {"login": "bencas21"},
                            "run_started_at": "2026-04-14T12:00:00Z",
                            "updated_at": "2026-04-14T12:05:47Z",
                            "html_url": "https://github.com/example/run/1001",
                        }
                    ]
                }
            ),
        ) as mock_urlopen:
            resp = app.handler({}, None)

        assert resp["statusCode"] == 200

        body = json.loads(resp["body"])
        assert len(body["deployments"]) == 1
        deployment = body["deployments"][0]
        assert deployment["id"] == 1001
        assert deployment["branch"] == "main"
        assert deployment["commit_sha"] == "abc1234"
        assert deployment["commit_message"] == "Add audit history"
        assert deployment["triggered_by"] == "bencas21"
        assert deployment["duration_seconds"] == 347

        request = mock_urlopen.call_args[0][0]
        assert request.full_url.endswith("/actions/workflows/terraform-deploy.yml/runs?per_page=20")

    def test_ssm_failure_returns_500(self, aws_mocks):
        app = _reload_app()
        app.ssm.get_parameter = MagicMock(side_effect=Exception("parameter missing"))

        resp = app.handler({}, None)
        assert resp["statusCode"] == 500
        assert "GitHub token" in json.loads(resp["body"])["error"]

    def test_github_api_error_returns_502(self, aws_mocks):
        app = _reload_app()
        app.ssm.get_parameter = MagicMock(return_value={"Parameter": {"Value": "ghp_test"}})
        with patch.object(
            app,
            "urlopen",
            side_effect=HTTPError(
                url="https://api.github.com",
                code=403,
                msg="Forbidden",
                hdrs=None,
                fp=io.BytesIO(b'{"message":"GitHub API rate limited"}'),
            ),
        ):
            resp = app.handler({}, None)

        assert resp["statusCode"] == 502
        assert json.loads(resp["body"])["error"] == "GitHub API rate limited"
