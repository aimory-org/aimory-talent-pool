"""Tests for delete_job_description Lambda."""

import json

from _lambda_loader import load as _load_lambda
from boto3.dynamodb.conditions import Key


def _reload_app():
    return _load_lambda("modules/api/lambda_src/delete_job_description")


class TestDeleteJobDescriptionHandler:
    def test_missing_pk_returns_400(self, job_descriptions_table):
        app = _reload_app()
        resp = app.handler({"queryStringParameters": {}}, None)
        assert resp["statusCode"] == 400

    def test_not_found_returns_404(self, job_descriptions_table):
        app = _reload_app()
        resp = app.handler({"queryStringParameters": {"pk": "no-exist"}}, None)
        assert resp["statusCode"] == 404

    def test_deletes_from_dynamodb(self, job_descriptions_table):
        job_descriptions_table.put_item(Item={"pk": "jd-123", "title": "Test JD"})
        app = _reload_app()

        resp = app.handler({"queryStringParameters": {"pk": "jd-123"}}, None)
        assert resp["statusCode"] == 200
        assert json.loads(resp["body"])["pk"] == "jd-123"

        result = job_descriptions_table.get_item(Key={"pk": "jd-123"})
        assert "Item" not in result

    def test_writes_delete_audit_entry(self, all_jd_tables):
        all_jd_tables["job_descriptions"].put_item(Item={"pk": "jd-456", "title": "Audit Test JD"})
        app = _reload_app()

        resp = app.handler(
            {
                "queryStringParameters": {"pk": "jd-456"},
                "requestContext": {
                    "authorizer": {
                        "jwt": {
                            "claims": {
                                "email": "recruiter@aimory.com",
                                "name": "Sarah Chen",
                            }
                        }
                    }
                },
            },
            None,
        )

        assert resp["statusCode"] == 200

        items = all_jd_tables["audit_log"].query(KeyConditionExpression=Key("pk").eq("jd-456"))["Items"]
        assert len(items) == 1
        assert items[0]["action"] == "DELETE"
        assert items[0]["document_type"] == "job_description"
        assert items[0]["user_email"] == "recruiter@aimory.com"
        assert items[0]["title"] == "Audit Test JD"

    def test_null_query_params_returns_400(self, job_descriptions_table):
        app = _reload_app()
        resp = app.handler({"queryStringParameters": None}, None)
        assert resp["statusCode"] == 400
