"""Tests for get_lookups Lambda."""

import json

from _lambda_loader import load as _load_lambda


def _reload_app():
    return _load_lambda("modules/api/lambda_src/get_lookups")


class TestGetLookupsHandler:
    def test_returns_all_by_default(self, all_tables):
        all_tables["skills_lookup"].put_item(Item={"skill": "Python"})
        all_tables["skills_lookup"].put_item(Item={"skill": "AWS"})
        all_tables["certifications_lookup"].put_item(Item={"certification": "PMP"})
        all_tables["cities_lookup"].put_item(Item={"city": "Herndon", "state": "VA"})
        all_tables["job_titles_lookup"].put_item(Item={"job_title": "Software Engineer"})
        all_tables["industry_categories_lookup"].put_item(Item={"industry_category": "IT Engineering"})
        app = _reload_app()

        resp = app.handler({"queryStringParameters": None}, None)
        assert resp["statusCode"] == 200
        body = json.loads(resp["body"])
        assert "skills" in body
        assert "certifications" in body
        assert "cities" in body
        assert "job_titles" in body
        assert "industry_categories" in body
        assert sorted(body["skills"]) == ["AWS", "Python"]
        assert body["certifications"] == ["PMP"]
        assert body["job_titles"] == ["Software Engineer"]
        assert body["industry_categories"] == ["IT Engineering"]

    def test_include_skills_only(self, all_tables):
        all_tables["skills_lookup"].put_item(Item={"skill": "Go"})
        app = _reload_app()

        resp = app.handler({"queryStringParameters": {"include": "skills"}}, None)
        body = json.loads(resp["body"])
        assert "skills" in body
        assert "certifications" not in body
        assert "cities" not in body

    def test_include_certifications_only(self, all_tables):
        all_tables["certifications_lookup"].put_item(Item={"certification": "CISSP"})
        app = _reload_app()

        resp = app.handler({"queryStringParameters": {"include": "certifications"}}, None)
        body = json.loads(resp["body"])
        assert "certifications" in body
        assert "skills" not in body

    def test_include_cities_only(self, all_tables):
        all_tables["cities_lookup"].put_item(Item={"city": "Reston", "state": "VA"})
        app = _reload_app()

        resp = app.handler({"queryStringParameters": {"include": "cities"}}, None)
        body = json.loads(resp["body"])
        assert "cities" in body
        assert len(body["cities"]) == 1

    def test_skills_sorted(self, all_tables):
        for s in ["Terraform", "AWS", "Python"]:
            all_tables["skills_lookup"].put_item(Item={"skill": s})
        app = _reload_app()

        resp = app.handler({"queryStringParameters": {"include": "skills"}}, None)
        body = json.loads(resp["body"])
        assert body["skills"] == ["AWS", "Python", "Terraform"]

    def test_cities_sorted_by_state_then_city(self, all_tables):
        all_tables["cities_lookup"].put_item(Item={"city": "Reston", "state": "VA"})
        all_tables["cities_lookup"].put_item(Item={"city": "Herndon", "state": "VA"})
        all_tables["cities_lookup"].put_item(Item={"city": "Austin", "state": "TX"})
        app = _reload_app()

        resp = app.handler({"queryStringParameters": {"include": "cities"}}, None)
        body = json.loads(resp["body"])
        states = [c["state"] for c in body["cities"]]
        assert states == ["TX", "VA", "VA"]

    def test_empty_tables_return_empty_lists(self, all_tables):
        app = _reload_app()
        resp = app.handler({"queryStringParameters": None}, None)
        body = json.loads(resp["body"])
        assert body["skills"] == []
        assert body["certifications"] == []
        assert body["cities"] == []
        assert body["job_titles"] == []
        assert body["industry_categories"] == []

    def test_multiple_include_params(self, all_tables):
        all_tables["skills_lookup"].put_item(Item={"skill": "Go"})
        all_tables["certifications_lookup"].put_item(Item={"certification": "PMP"})
        app = _reload_app()

        resp = app.handler({"queryStringParameters": {"include": "skills,certifications"}}, None)
        body = json.loads(resp["body"])
        assert "skills" in body
        assert "certifications" in body
        assert "cities" not in body
