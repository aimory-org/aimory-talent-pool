"""Tests for list_job_descriptions Lambda."""

import json
from decimal import Decimal

from _lambda_loader import load as _load_lambda


def _reload_app():
    return _load_lambda("modules/api/lambda_src/list_job_descriptions")


class TestListJobDescriptionsHandler:
    def _put_jd(self, table, pk, **kwargs):
        item = {"pk": pk, "title": kwargs.get("title", f"JD {pk}"), **kwargs}
        table.put_item(Item=item)

    def test_returns_empty_list(self, job_descriptions_table):
        app = _reload_app()
        resp = app.handler({}, None)
        assert resp["statusCode"] == 200
        assert json.loads(resp["body"]) == []

    def test_returns_all_jds(self, job_descriptions_table):
        self._put_jd(job_descriptions_table, "jd-1")
        self._put_jd(job_descriptions_table, "jd-2")
        app = _reload_app()

        resp = app.handler({}, None)
        body = json.loads(resp["body"])
        assert len(body) == 2

    def test_sorted_by_created_at_descending(self, job_descriptions_table):
        self._put_jd(job_descriptions_table, "old", created_at="2025-01-01T00:00:00Z")
        self._put_jd(job_descriptions_table, "new", created_at="2025-06-01T00:00:00Z")
        app = _reload_app()

        resp = app.handler({}, None)
        body = json.loads(resp["body"])
        assert body[0]["pk"] == "new"
        assert body[1]["pk"] == "old"

    def test_filter_by_job_title(self, job_descriptions_table):
        self._put_jd(job_descriptions_table, "jd-1", job_title="Data Analyst")
        self._put_jd(job_descriptions_table, "jd-2", job_title="Software Engineer")
        app = _reload_app()

        resp = app.handler({"queryStringParameters": {"job_title": "Data Analyst"}}, None)
        body = json.loads(resp["body"])
        assert len(body) == 1
        assert body[0]["job_title"] == "Data Analyst"

    def test_filter_by_required_clearance(self, job_descriptions_table):
        self._put_jd(job_descriptions_table, "jd-1", required_clearance="TS/SCI")
        self._put_jd(job_descriptions_table, "jd-2", required_clearance="Secret")
        app = _reload_app()

        resp = app.handler({"queryStringParameters": {"required_clearance": "TS/SCI"}}, None)
        body = json.loads(resp["body"])
        assert len(body) == 1
        assert body[0]["required_clearance"] == "TS/SCI"

    def test_filter_by_location_state(self, job_descriptions_table):
        self._put_jd(job_descriptions_table, "jd-1", location_state="VA")
        self._put_jd(job_descriptions_table, "jd-2", location_state="MD")
        app = _reload_app()

        resp = app.handler({"queryStringParameters": {"location_state": "VA"}}, None)
        body = json.loads(resp["body"])
        assert len(body) == 1
        assert body[0]["location_state"] == "VA"

    def test_decimal_serialization(self, job_descriptions_table):
        job_descriptions_table.put_item(Item={"pk": "jd-1", "title": "Test", "min_experience_years": Decimal("5")})
        app = _reload_app()

        resp = app.handler({}, None)
        body = json.loads(resp["body"])
        assert body[0]["min_experience_years"] == 5

    def test_null_query_params(self, job_descriptions_table):
        self._put_jd(job_descriptions_table, "jd-1")
        app = _reload_app()

        resp = app.handler({"queryStringParameters": None}, None)
        assert resp["statusCode"] == 200
        assert len(json.loads(resp["body"])) == 1
