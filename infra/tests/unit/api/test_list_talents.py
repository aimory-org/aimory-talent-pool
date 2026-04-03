"""Tests for list_talents Lambda (OpenSearch-based)."""

import json
from unittest.mock import patch, MagicMock

import pytest

from _lambda_loader import load as _load_lambda


class TestListTalentsHandler:
    def setup_method(self):
        _load_lambda("modules/api/lambda_src/list_talents")

    def _os_response(self, docs):
        return {"hits": {"hits": [{"_source": d} for d in docs], "total": {"value": len(docs)}}}

    @patch("app._get_client")
    def test_no_filters_returns_all(self, mock_get_client):
        import app

        docs = [{"pk": "b#k1", "name": "Alice"}, {"pk": "b#k2", "name": "Bob"}]
        mc = MagicMock()
        mc.search.return_value = self._os_response(docs)
        mock_get_client.return_value = mc

        resp = app.handler({"queryStringParameters": None}, None)
        body = json.loads(resp["body"])
        assert resp["statusCode"] == 200
        assert body["count"] == 2
        assert body["items"] == docs

    @patch("app._get_client")
    def test_search_includes_name_phrase_prefix(self, mock_get_client):
        import app

        mc = MagicMock()
        mc.search.return_value = self._os_response([{"name": "Alice"}])
        mock_get_client.return_value = mc

        resp = app.handler({"queryStringParameters": {"search": "Alice"}}, None)
        assert resp["statusCode"] == 200
        q = mc.search.call_args[1]["body"]["query"]["bool"]["must"]
        assert any("bool" in c for c in q)

    @patch("app._get_client")
    def test_short_search_no_summary_clause(self, mock_get_client):
        import app

        mc = MagicMock()
        mc.search.return_value = self._os_response([])
        mock_get_client.return_value = mc
        app.handler({"queryStringParameters": {"search": "A"}}, None)
        should = mc.search.call_args[1]["body"]["query"]["bool"]["must"][0]["bool"]["should"]
        assert len(should) == 1  # only name, not summary

    @patch("app._get_client")
    def test_keyword_filter_status(self, mock_get_client):
        import app

        mc = MagicMock()
        mc.search.return_value = self._os_response([])
        mock_get_client.return_value = mc
        app.handler({"queryStringParameters": {"status": "Active Candidate"}}, None)
        f = mc.search.call_args[1]["body"]["query"]["bool"]["filter"]
        assert {"term": {"status": "Active Candidate"}} in f

    @patch("app._get_client")
    def test_multiple_keyword_filters(self, mock_get_client):
        import app

        mc = MagicMock()
        mc.search.return_value = self._os_response([])
        mock_get_client.return_value = mc
        app.handler(
            {
                "queryStringParameters": {
                    "status": "Active Candidate",
                    "talent_bucket": "IT Resources",
                    "location_state": "VA",
                }
            },
            None,
        )
        f = mc.search.call_args[1]["body"]["query"]["bool"]["filter"]
        assert len(f) == 3

    @patch("app._get_client")
    def test_city_filter(self, mock_get_client):
        import app

        mc = MagicMock()
        mc.search.return_value = self._os_response([])
        mock_get_client.return_value = mc
        app.handler({"queryStringParameters": {"city": "Herndon"}}, None)
        f = mc.search.call_args[1]["body"]["query"]["bool"]["filter"]
        assert {"term": {"location.city": "Herndon"}} in f

    @patch("app._get_client")
    def test_skills_and_logic(self, mock_get_client):
        import app

        mc = MagicMock()
        mc.search.return_value = self._os_response([])
        mock_get_client.return_value = mc
        app.handler({"queryStringParameters": {"skills": "Python,AWS"}}, None)
        f = mc.search.call_args[1]["body"]["query"]["bool"]["filter"]
        assert {"term": {"skill_names": "Python"}} in f
        assert {"term": {"skill_names": "AWS"}} in f

    @patch("app._get_client")
    def test_certifications_and_logic(self, mock_get_client):
        import app

        mc = MagicMock()
        mc.search.return_value = self._os_response([])
        mock_get_client.return_value = mc
        app.handler({"queryStringParameters": {"certifications": "PMP,CISSP"}}, None)
        f = mc.search.call_args[1]["body"]["query"]["bool"]["filter"]
        assert {"term": {"cert_names": "PMP"}} in f
        assert {"term": {"cert_names": "CISSP"}} in f

    @patch("app._get_client")
    def test_years_range(self, mock_get_client):
        import app

        mc = MagicMock()
        mc.search.return_value = self._os_response([])
        mock_get_client.return_value = mc
        app.handler({"queryStringParameters": {"minYears": "5", "maxYears": "15"}}, None)
        f = mc.search.call_args[1]["body"]["query"]["bool"]["filter"]
        assert {"range": {"years_of_experience": {"gte": 5, "lte": 15}}} in f

    @patch("app._get_client")
    def test_empty_results(self, mock_get_client):
        import app

        mc = MagicMock()
        mc.search.return_value = self._os_response([])
        mock_get_client.return_value = mc
        resp = app.handler({"queryStringParameters": {"search": "nobody"}}, None)
        body = json.loads(resp["body"])
        assert body["count"] == 0 and body["items"] == []

    @patch("app._get_client")
    def test_opensearch_error_500(self, mock_get_client):
        import app

        mc = MagicMock()
        mc.search.side_effect = Exception("boom")
        mock_get_client.return_value = mc
        resp = app.handler({"queryStringParameters": None}, None)
        assert resp["statusCode"] == 500
