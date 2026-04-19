"""Tests for match_candidates Lambda."""

import json
from decimal import Decimal
from unittest.mock import MagicMock, patch

from _lambda_loader import load as _load_lambda


def _os_response(docs):
    return {"hits": {"hits": [{"_source": d, "_score": 5.0} for d in docs], "total": {"value": len(docs)}}}


def _bedrock_response(scores):
    """Build a mock Bedrock converse response returning a JSON array of scores."""
    return {"output": {"message": {"content": [{"text": json.dumps(scores)}]}}}


SAMPLE_JD = {
    "pk": "jd-001",
    "title": "Senior Python Engineer",
    "required_skills": ["Python", "AWS"],
    "desired_skills": ["Terraform"],
    "required_certifications": ["AWS Solutions Architect"],
    "desired_certifications": [],
    "required_clearance": "Secret",
    "min_experience_years": Decimal("5"),
    "industry_category": "Technology",
    "job_title": "Software Engineer",
    "location": {"city": "Herndon", "state": "VA", "remote": "Hybrid"},
}

SAMPLE_CANDIDATES = [
    {
        "pk": "b#alice.pdf",
        "name": "Alice",
        "skill_names": ["Python", "AWS", "Terraform"],
        "cert_names": ["AWS Solutions Architect"],
        "clearance_level": "TS/SCI",
        "years_of_experience": 10,
        "industry_category": "Technology",
        "job_title": "Software Engineer",
        "location_state": "VA",
        "summary": "Senior cloud engineer.",
    },
    {
        "pk": "b#bob.pdf",
        "name": "Bob",
        "skill_names": ["Java", "AWS"],
        "cert_names": [],
        "clearance_level": "Secret",
        "years_of_experience": 3,
        "industry_category": "Finance",
        "job_title": "Junior Developer",
        "location_state": "MD",
        "summary": "Java developer.",
    },
]

SAMPLE_SCORES = [
    {"pk": "b#alice.pdf", "score": 92, "rationale": "Strong match: all required skills, exceeds clearance."},
    {"pk": "b#bob.pdf", "score": 45, "rationale": "Partial match: has AWS but lacks Python, low experience."},
]

SAMPLE_SCORES_OVERRATED = [
    {"pk": "b#bob.pdf", "score": 96, "rationale": "High keyword overlap."},
]


class TestMatchCandidatesHandler:
    def setup_method(self):
        _load_lambda("modules/api/lambda_src/match_candidates")

    def test_missing_pk_returns_400(self, job_descriptions_table):
        import app

        resp = app.handler({"pathParameters": {}}, None)
        assert resp["statusCode"] == 400

    def test_jd_not_found_returns_404(self, job_descriptions_table):
        import app

        resp = app.handler({"pathParameters": {"pk": "no-exist"}}, None)
        assert resp["statusCode"] == 404

    @patch("app.bedrock")
    @patch("app._get_os_client")
    def test_returns_scored_matches(self, mock_os_client, mock_bedrock, job_descriptions_table):
        job_descriptions_table.put_item(Item=SAMPLE_JD)
        import app

        mc = MagicMock()
        mc.search.return_value = _os_response(SAMPLE_CANDIDATES)
        mock_os_client.return_value = mc

        mock_bedrock.converse.return_value = _bedrock_response(SAMPLE_SCORES)

        resp = app.handler({"pathParameters": {"pk": "jd-001"}}, None)
        assert resp["statusCode"] == 200

        body = json.loads(resp["body"])
        assert body["job_description"]["pk"] == "jd-001"
        assert body["job_description"]["title"] == "Senior Python Engineer"
        assert body["total_candidates"] == 2
        assert len(body["matches"]) == 2

        # Sorted by score descending
        assert body["matches"][0]["pk"] == "b#alice.pdf"
        assert body["matches"][0]["score"] == 92
        assert body["matches"][1]["pk"] == "b#bob.pdf"
        assert body["matches"][1]["score"] == 45

    @patch("app.bedrock")
    @patch("app._get_os_client")
    def test_limit_param_caps_results(self, mock_os_client, mock_bedrock, job_descriptions_table):
        job_descriptions_table.put_item(Item=SAMPLE_JD)
        import app

        mc = MagicMock()
        mc.search.return_value = _os_response(SAMPLE_CANDIDATES)
        mock_os_client.return_value = mc

        mock_bedrock.converse.return_value = _bedrock_response(SAMPLE_SCORES)

        resp = app.handler({"pathParameters": {"pk": "jd-001"}, "queryStringParameters": {"limit": "1"}}, None)
        body = json.loads(resp["body"])
        assert len(body["matches"]) == 1
        assert body["matches"][0]["score"] == 92

    @patch("app.bedrock")
    @patch("app._get_os_client")
    def test_empty_opensearch_results(self, mock_os_client, mock_bedrock, job_descriptions_table):
        job_descriptions_table.put_item(Item=SAMPLE_JD)
        import app

        mc = MagicMock()
        mc.search.return_value = _os_response([])
        mock_os_client.return_value = mc

        resp = app.handler({"pathParameters": {"pk": "jd-001"}}, None)
        body = json.loads(resp["body"])
        assert body["total_candidates"] == 0
        assert body["matches"] == []
        # Should NOT call Bedrock when no candidates
        mock_bedrock.converse.assert_not_called()

    @patch("app.bedrock")
    @patch("app._get_os_client")
    def test_guardrails_cap_overrated_scores(self, mock_os_client, mock_bedrock, job_descriptions_table):
        job_descriptions_table.put_item(Item=SAMPLE_JD)
        import app

        mc = MagicMock()
        mc.search.return_value = _os_response([SAMPLE_CANDIDATES[1]])
        mock_os_client.return_value = mc

        mock_bedrock.converse.return_value = _bedrock_response(SAMPLE_SCORES_OVERRATED)

        resp = app.handler({"pathParameters": {"pk": "jd-001"}}, None)
        assert resp["statusCode"] == 200

        body = json.loads(resp["body"])
        assert len(body["matches"]) == 1
        # Bob is below required experience and role-misaligned, so score should be capped.
        assert body["matches"][0]["score"] <= 72

    @patch("app.bedrock")
    @patch("app._get_os_client")
    def test_bedrock_failure_returns_null_scores(self, mock_os_client, mock_bedrock, job_descriptions_table):
        job_descriptions_table.put_item(Item=SAMPLE_JD)
        import app

        mc = MagicMock()
        mc.search.return_value = _os_response(SAMPLE_CANDIDATES)
        mock_os_client.return_value = mc

        mock_bedrock.converse.side_effect = Exception("Bedrock timeout")

        resp = app.handler({"pathParameters": {"pk": "jd-001"}}, None)
        assert resp["statusCode"] == 200

        body = json.loads(resp["body"])
        # All candidates present but with null scores
        assert body["total_candidates"] == 2
        for match in body["matches"]:
            assert match["score"] is None

    @patch("app.bedrock")
    @patch("app._get_os_client")
    def test_opensearch_error_returns_empty(self, mock_os_client, mock_bedrock, job_descriptions_table):
        job_descriptions_table.put_item(Item=SAMPLE_JD)
        import app

        mc = MagicMock()
        mc.search.side_effect = Exception("OpenSearch cluster down")
        mock_os_client.return_value = mc

        resp = app.handler({"pathParameters": {"pk": "jd-001"}}, None)
        assert resp["statusCode"] == 200

        body = json.loads(resp["body"])
        assert body["total_candidates"] == 0


class TestBuildPrefilterQuery:
    def setup_method(self):
        _load_lambda("modules/api/lambda_src/match_candidates")

    def test_includes_required_skills_with_boost(self, job_descriptions_table):
        import app

        jd = {"required_skills": ["Python"], "desired_skills": []}
        query = app._build_prefilter_query(jd)

        should = query["bool"]["should"]
        assert any(
            s.get("term", {}).get("skill_names", {}).get("value") == "Python" and s["term"]["skill_names"]["boost"] == 3
            for s in should
        )

    def test_includes_desired_skills_with_lower_boost(self, job_descriptions_table):
        import app

        jd = {"required_skills": [], "desired_skills": ["Go"]}
        query = app._build_prefilter_query(jd)

        should = query["bool"]["should"]
        assert any(
            s.get("term", {}).get("skill_names", {}).get("value") == "Go" and s["term"]["skill_names"]["boost"] == 1
            for s in should
        )

    def test_clearance_filter(self, job_descriptions_table):
        import app

        jd = {"required_skills": ["Python"], "required_clearance": "TS"}
        query = app._build_prefilter_query(jd)

        filters = query["bool"].get("filter", [])
        clearance_filter = [f for f in filters if "terms" in f and "clearance_level" in f["terms"]]
        assert len(clearance_filter) == 1
        allowed = clearance_filter[0]["terms"]["clearance_level"]
        assert "TS" in allowed
        assert "TS/SCI" in allowed
        assert "Secret" not in allowed

    def test_experience_filter(self, job_descriptions_table):
        import app

        jd = {"required_skills": ["Python"], "min_experience_years": 5}
        query = app._build_prefilter_query(jd)

        filters = query["bool"].get("filter", [])
        exp_filter = [f for f in filters if "range" in f and "years_of_experience" in f.get("range", {})]
        assert len(exp_filter) == 1
        assert exp_filter[0]["range"]["years_of_experience"]["gte"] == 5.0

    def test_no_clearance_no_filter(self, job_descriptions_table):
        import app

        jd = {"required_skills": ["Python"], "required_clearance": None}
        query = app._build_prefilter_query(jd)
        filters = query["bool"].get("filter", [])
        assert not any("terms" in f and "clearance_level" in f.get("terms", {}) for f in filters)


class TestClearanceHierarchy:
    def setup_method(self):
        _load_lambda("modules/api/lambda_src/match_candidates")

    def test_rank_ordering(self, job_descriptions_table):
        import app

        assert app._clearance_rank("Secret") < app._clearance_rank("TS")
        assert app._clearance_rank("TS") < app._clearance_rank("TS/SCI")
        assert app._clearance_rank("TS/SCI") < app._clearance_rank("Yankee White")

    def test_unknown_clearance_returns_negative(self, job_descriptions_table):
        import app

        assert app._clearance_rank("Unknown") == -1
        assert app._clearance_rank(None) == -1
