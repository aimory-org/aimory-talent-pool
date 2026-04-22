"""Return recent deployment history from GitHub Actions."""

import json
import os
from datetime import datetime
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import boto3

GITHUB_PAT_PARAM = os.environ["GITHUB_PAT_PARAM"]
GITHUB_REPO = os.environ["GITHUB_REPO"]
GITHUB_WORKFLOW_FILE = os.environ["GITHUB_WORKFLOW_FILE"]

ssm = boto3.client("ssm")


def _json_response(body, status_code=200):
    return {
        "statusCode": status_code,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body),
    }


def _get_github_token():
    response = ssm.get_parameter(Name=GITHUB_PAT_PARAM, WithDecryption=True)
    return response["Parameter"]["Value"]


def _normalize_status(status):
    if status in {"completed", "in_progress", "queued"}:
        return status
    return "queued"


def _parse_timestamp(value):
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _duration_seconds(started_at, completed_at):
    started = _parse_timestamp(started_at)
    completed = _parse_timestamp(completed_at)
    if not started or not completed:
        return None
    return max(int((completed - started).total_seconds()), 0)


def _run_to_deployment(run):
    started_at = run.get("run_started_at") or run.get("created_at")
    completed_at = run.get("updated_at") if run.get("status") == "completed" else None
    head_commit = run.get("head_commit") or {}

    return {
        "id": run.get("id"),
        "status": _normalize_status(run.get("status")),
        "conclusion": run.get("conclusion"),
        "branch": run.get("head_branch") or "unknown",
        "commit_sha": (run.get("head_sha") or "")[:7],
        "commit_message": (head_commit.get("message") or run.get("display_title") or "").splitlines()[0],
        "triggered_by": (run.get("actor") or {}).get("login") or "unknown",
        "started_at": started_at,
        "completed_at": completed_at,
        "duration_seconds": _duration_seconds(started_at, completed_at),
        "url": run.get("html_url") or "",
    }


def _fetch_runs(token):
    url = f"https://api.github.com/repos/{GITHUB_REPO}/actions/workflows/{GITHUB_WORKFLOW_FILE}/runs?per_page=20"
    request = Request(
        url,
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "aimory-talent-pool",
        },
    )

    with urlopen(request, timeout=15) as response:  # nosec B310 — URL is hardcoded to api.github.com, not user-controlled
        payload = json.loads(response.read().decode("utf-8"))

    return payload.get("workflow_runs", [])


def _http_error_message(exc):
    try:
        payload = json.loads(exc.read().decode("utf-8"))
        return payload.get("message") or str(exc)
    except Exception:
        return str(exc)


def handler(event, context):
    try:
        token = _get_github_token()
    except Exception as exc:
        print(f"Error reading GitHub token: {exc}")
        return _json_response({"error": f"Failed to read GitHub token: {exc}"}, 500)

    try:
        runs = _fetch_runs(token)
        deployments = [_run_to_deployment(run) for run in runs]
        return _json_response({"deployments": deployments})
    except HTTPError as exc:
        message = _http_error_message(exc)
        print(f"GitHub API error: {message}")
        return _json_response({"error": message}, 502)
    except URLError as exc:
        print(f"GitHub request failed: {exc}")
        return _json_response({"error": f"GitHub request failed: {exc.reason}"}, 502)
    except Exception as exc:
        print(f"Unexpected deployments error: {exc}")
        return _json_response({"error": str(exc)}, 500)
