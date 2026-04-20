"""Post-deployment integration smoke tests for API Lambda handlers."""

import pytest

from ._lambda_integration_utils import bool_env, invoke_lambda, resolve_function_name

pytestmark = pytest.mark.integration


API_SMOKE_CASES = [
    (
        "list_talents",
        "API_LIST_TALENTS_FUNCTION_NAME",
        {"queryStringParameters": None},
        {200},
    ),
    (
        "get_talent",
        "API_GET_TALENT_FUNCTION_NAME",
        {"pathParameters": {}},
        {400},
    ),
    (
        "update_talent",
        "API_UPDATE_TALENT_FUNCTION_NAME",
        {"queryStringParameters": {}, "body": "{}"},
        {400},
    ),
    (
        "delete_talent",
        "API_DELETE_TALENT_FUNCTION_NAME",
        {"queryStringParameters": {}},
        {400},
    ),
    (
        "get_lookups",
        "API_GET_LOOKUPS_FUNCTION_NAME",
        {"queryStringParameters": None},
        {200},
    ),
    (
        "get_resume_url",
        "API_GET_RESUME_URL_FUNCTION_NAME",
        {"queryStringParameters": {}},
        {400},
    ),
    (
        "get_audit_history",
        "API_GET_AUDIT_HISTORY_FUNCTION_NAME",
        {"queryStringParameters": {}},
        {400},
    ),
    (
        "get_deployments",
        "API_GET_DEPLOYMENTS_FUNCTION_NAME",
        {},
        None,
    ),
    (
        "delete_tag",
        "API_DELETE_TAG_FUNCTION_NAME",
        {"queryStringParameters": {}},
        {400},
    ),
    (
        "list_job_descriptions",
        "API_LIST_JOB_DESCRIPTIONS_FUNCTION_NAME",
        {"queryStringParameters": None},
        {200},
    ),
    (
        "get_job_description",
        "API_GET_JOB_DESCRIPTION_FUNCTION_NAME",
        {"pathParameters": {}},
        {400},
    ),
    (
        "update_job_description",
        "API_UPDATE_JOB_DESCRIPTION_FUNCTION_NAME",
        {"queryStringParameters": {}, "body": "{}"},
        {400},
    ),
    (
        "delete_job_description",
        "API_DELETE_JOB_DESCRIPTION_FUNCTION_NAME",
        {"queryStringParameters": {}},
        {400},
    ),
    (
        "match_candidates",
        "API_MATCH_CANDIDATES_FUNCTION_NAME",
        {"pathParameters": {}},
        {400},
    ),
    (
        "get_jd_upload_url",
        "API_GET_JD_UPLOAD_URL_FUNCTION_NAME",
        {"queryStringParameters": {}},
        {400},
    ),
    (
        "get_resume_upload_url",
        "API_GET_RESUME_UPLOAD_URL_FUNCTION_NAME",
        {"queryStringParameters": {}},
        {400},
    ),
]


@pytest.mark.parametrize(
    "lambda_key,override_var,event,expected_statuses",
    API_SMOKE_CASES,
)
def test_api_lambdas_post_deployment_smoke(lambda_key, override_var, event, expected_statuses):
    function_name = resolve_function_name("api", lambda_key, override_var)
    payload = invoke_lambda(function_name, event)

    assert "statusCode" in payload

    if lambda_key == "get_deployments" and expected_statuses is None:
        expected_statuses = {200} if bool_env("REQUIRE_GITHUB_DEPLOYMENTS_SUCCESS") else {200, 500, 502}

    assert payload["statusCode"] in expected_statuses
