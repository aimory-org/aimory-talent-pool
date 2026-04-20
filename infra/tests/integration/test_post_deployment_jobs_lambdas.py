"""Post-deployment integration tests for scheduled jobs Lambda handlers."""

import pytest

from ._lambda_integration_utils import bool_env, invoke_lambda, resolve_function_name

pytestmark = pytest.mark.integration


def test_jobs_lookup_dedup_lambda_dry_run():
    function_name = resolve_function_name("jobs", "lookup-dedup", "JOBS_LOOKUP_DEDUP_FUNCTION_NAME")
    payload = invoke_lambda(function_name, {"dry_run": True, "trigger": "manual"})

    assert payload.get("status") == "ok"
    assert payload.get("dry_run") is True


def test_jobs_stale_checker_lambda_opt_in():
    if not bool_env("RUN_STALE_CHECKER_INTEGRATION"):
        pytest.skip(
            "Set RUN_STALE_CHECKER_INTEGRATION=1 to invoke stale-checker. This lambda can mutate candidate status."
        )

    function_name = resolve_function_name("jobs", "stale-checker", "JOBS_STALE_CHECKER_FUNCTION_NAME")
    payload = invoke_lambda(function_name, {})

    assert payload.get("status") == "ok"
    assert payload.get("step") == "stale_checker"
    assert "updated_count" in payload
