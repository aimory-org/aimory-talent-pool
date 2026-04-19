"""Tests for get_job_description Lambda."""

import json
from decimal import Decimal

from _lambda_loader import load as _load_lambda


def _reload_app():
    return _load_lambda("modules/api/lambda_src/get_job_description")


class TestGetJobDescriptionHandler:
    def test_returns_jd_by_pk(self, job_descriptions_table):
        job_descriptions_table.put_item(Item={"pk": "jd-123", "title": "Data Analyst"})
        app = _reload_app()

        resp = app.handler({"pathParameters": {"pk": "jd-123"}}, None)
        assert resp["statusCode"] == 200
        body = json.loads(resp["body"])
        assert body["title"] == "Data Analyst"

    def test_decimal_serialization(self, job_descriptions_table):
        job_descriptions_table.put_item(
            Item={
                "pk": "jd-1",
                "title": "X",
                "min_experience_years": Decimal("5"),
                "salary_range": {"min": Decimal("90000"), "max": Decimal("120000")},
            }
        )
        app = _reload_app()

        resp = app.handler({"pathParameters": {"pk": "jd-1"}}, None)
        body = json.loads(resp["body"])
        assert body["min_experience_years"] == 5
        assert body["salary_range"]["min"] == 90000

    def test_missing_pk_returns_400(self, job_descriptions_table):
        app = _reload_app()
        resp = app.handler({"pathParameters": {}}, None)
        assert resp["statusCode"] == 400

    def test_not_found_returns_404(self, job_descriptions_table):
        app = _reload_app()
        resp = app.handler({"pathParameters": {"pk": "no-exist"}}, None)
        assert resp["statusCode"] == 404
