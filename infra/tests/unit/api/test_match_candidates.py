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

    @patch("app.bedrock_agent")
    @patch("app.bedrock")
    @patch("app._get_os_client")
    def test_returns_scored_matches(self, mock_os_client, mock_bedrock, mock_agent, job_descriptions_table):
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

    @patch("app.bedrock_agent")
    @patch("app.bedrock")
    @patch("app._get_os_client")
    def test_limit_param_caps_results(self, mock_os_client, mock_bedrock, mock_agent, job_descriptions_table):
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

    @patch("app.bedrock_agent")
    @patch("app.bedrock")
    @patch("app._get_os_client")
    def test_empty_opensearch_results(self, mock_os_client, mock_bedrock, mock_agent, job_descriptions_table):
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

    @patch("app.bedrock_agent")
    @patch("app.bedrock")
    @patch("app._get_os_client")
    def test_guardrails_cap_overrated_scores(self, mock_os_client, mock_bedrock, mock_agent, job_descriptions_table):
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
        # Bob is 3y below the JD's 5y minimum → experience-shortfall guardrail caps at 75.
        # (The lexical job-title and missing-skills caps were intentionally removed; only
        # factual constraints — clearance rank, years — still cap.)
        assert body["matches"][0]["score"] <= 75

    @patch("app.bedrock_agent")
    @patch("app.bedrock")
    @patch("app._get_os_client")
    def test_bedrock_failure_returns_null_scores(
        self, mock_os_client, mock_bedrock, mock_agent, job_descriptions_table
    ):
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

    @patch("app.bedrock_agent")
    @patch("app.bedrock")
    @patch("app._get_os_client")
    def test_opensearch_error_returns_empty(self, mock_os_client, mock_bedrock, mock_agent, job_descriptions_table):
        job_descriptions_table.put_item(Item=SAMPLE_JD)
        import app

        mc = MagicMock()
        mc.search.side_effect = Exception("OpenSearch cluster down")
        mock_os_client.return_value = mc

        resp = app.handler({"pathParameters": {"pk": "jd-001"}}, None)
        assert resp["statusCode"] == 200

        body = json.loads(resp["body"])
        assert body["total_candidates"] == 0


class TestTitleGuardrailRemoved:
    def setup_method(self):
        _load_lambda("modules/api/lambda_src/match_candidates")

    @patch("app.bedrock_agent")
    @patch("app.bedrock")
    @patch("app._get_os_client")
    def test_title_mismatch_does_not_cap(self, mock_os_client, mock_bedrock, mock_agent, job_descriptions_table):
        """A strong candidate with a differently-worded title must NOT be capped."""
        job_descriptions_table.put_item(Item=SAMPLE_JD)
        import app

        # Alice meets clearance, exceeds experience, has all required skills — but her
        # title ("Software Engineer" vs JD "Software Engineer") could differ in wording.
        strong = dict(SAMPLE_CANDIDATES[0])
        strong["job_title"] = "Information Security Specialist"  # lexically unlike the JD title
        mc = MagicMock()
        mc.search.return_value = _os_response([strong])
        mock_os_client.return_value = mc
        mock_bedrock.converse.return_value = _bedrock_response(
            [{"pk": strong["pk"], "score": 93, "rationale": "Excellent fit."}]
        )

        resp = app.handler({"pathParameters": {"pk": "jd-001"}}, None)
        body = json.loads(resp["body"])
        # No title guardrail anymore — the 93 should survive (only real gaps cap).
        assert body["matches"][0]["score"] == 93


class TestScoringPromptUsesResume:
    def setup_method(self):
        _load_lambda("modules/api/lambda_src/match_candidates")

    def test_resume_text_sent_to_llm(self, job_descriptions_table):
        import app

        cand = dict(SAMPLE_CANDIDATES[0])
        cand["resume_text"] = "UNIQUE_RESUME_MARKER hands-on cloud security operations."
        prompt = app._build_scoring_prompt(SAMPLE_JD, [cand])
        assert "UNIQUE_RESUME_MARKER" in prompt

    def test_falls_back_to_summary_without_resume_text(self, job_descriptions_table):
        import app

        cand = dict(SAMPLE_CANDIDATES[0])
        cand.pop("resume_text", None)
        cand["summary"] = "FALLBACK_SUMMARY_MARKER"
        prompt = app._build_scoring_prompt(SAMPLE_JD, [cand])
        assert "FALLBACK_SUMMARY_MARKER" in prompt


class TestBuildPrefilterQuery:
    def setup_method(self):
        _load_lambda("modules/api/lambda_src/match_candidates")

    def test_prefilter_does_not_match_against_resume_body(self, job_descriptions_table):
        """Recall is handled in Phase 2 (lookup expansion + vectors), not by noisy
        full-text matching against the résumé body."""
        import app

        jd = {"required_skills": ["Python"], "desired_skills": ["Go"]}
        query = app._build_prefilter_query(jd)
        should = query["bool"]["should"]
        assert not any("match" in s and "resume_text" in s.get("match", {}) for s in should)

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


class TestVectorRetrieval:
    def setup_method(self):
        _load_lambda("modules/api/lambda_src/match_candidates")

    def test_rrf_fuses_and_ranks(self, job_descriptions_table):
        import app

        # pk appearing in both lists should rank above pks in only one.
        order = app._rrf_order(["a", "b", "c"], ["c", "d"])
        assert order[0] == "c"  # in both lists
        assert set(order) == {"a", "b", "c", "d"}

    def test_vector_candidate_pks_aggregates_best_chunk(self, job_descriptions_table):
        import app

        mc = MagicMock()
        mc.search.return_value = {
            "hits": {
                "hits": [
                    {"_source": {"parent_pk": "p1"}, "_score": 0.9},
                    {"_source": {"parent_pk": "p2"}, "_score": 0.8},
                    {"_source": {"parent_pk": "p1"}, "_score": 0.5},  # p1's weaker chunk
                ]
            }
        }
        pks = app._vector_candidate_pks(mc, [0.1] * 512)
        assert pks == ["p1", "p2"]  # p1 first (best chunk 0.9), deduped

    def test_vector_candidate_pks_empty_without_vector(self, job_descriptions_table):
        import app

        mc = MagicMock()
        assert app._vector_candidate_pks(mc, None) == []
        mc.search.assert_not_called()

    def test_embed_jd_query_none_on_failure(self, job_descriptions_table):
        import app

        with patch("app.bedrock") as mb:
            mb.invoke_model.side_effect = Exception("no access")
            assert app._embed_jd_query({"description_summary": "x"}) is None


class TestReranker:
    def setup_method(self):
        _load_lambda("modules/api/lambda_src/match_candidates")

    def test_rerank_reorders_by_relevance(self, job_descriptions_table):
        import app

        cands = [{"pk": "a", "summary": "x"}, {"pk": "b", "summary": "y"}, {"pk": "c", "summary": "z"}]
        with patch("app.bedrock_agent") as m:
            m.rerank.return_value = {"results": [{"index": 2}, {"index": 0}, {"index": 1}]}
            out = app._rerank_candidates({"job_title": "Engineer"}, cands)
        assert [c["pk"] for c in out] == ["c", "a", "b"]

    def test_rerank_fallback_preserves_order_on_error(self, job_descriptions_table):
        import app

        cands = [{"pk": "a"}, {"pk": "b"}]
        with patch("app.bedrock_agent") as m:
            m.rerank.side_effect = Exception("no access")
            out = app._rerank_candidates({"job_title": "Engineer"}, cands)
        assert [c["pk"] for c in out] == ["a", "b"]

    def test_rerank_single_candidate_is_noop(self, job_descriptions_table):
        import app

        with patch("app.bedrock_agent") as m:
            out = app._rerank_candidates({"job_title": "Engineer"}, [{"pk": "a"}])
            m.rerank.assert_not_called()
        assert [c["pk"] for c in out] == ["a"]


class TestQueryExpansion:
    def setup_method(self):
        _load_lambda("modules/api/lambda_src/match_candidates")

    def test_expanded_terms_added_to_prefilter(self, job_descriptions_table):
        import app

        q = app._build_prefilter_query(
            {"required_skills": ["Python"]}, extra_skills=["CPython"], extra_titles=["Software Developer"]
        )
        should = q["bool"]["should"]
        assert any(s.get("term", {}).get("skill_names", {}).get("value") == "CPython" for s in should)
        assert any(s.get("match", {}).get("job_title", {}).get("query") == "Software Developer" for s in should)

    def test_expand_filters_to_vocabulary(self, job_descriptions_table):
        import app

        with patch("app._scan_lookup") as scan, patch("app.bedrock") as mb:
            scan.side_effect = lambda t, k: ["AWS", "Kubernetes"] if k == "skill" else ["Software Developer"]
            expansion = '{"skills":["AWS","Hallucinated"],"titles":["Software Developer"]}'
            mb.converse.return_value = {"output": {"message": {"content": [{"text": expansion}]}}}
            skills, titles = app._expand_query_terms({"required_skills": ["Amazon Web Services"], "job_title": "SWE"})
        assert skills == ["AWS"]  # hallucinated term not in vocab is dropped
        assert titles == ["Software Developer"]

    def test_expand_empty_without_skills(self, job_descriptions_table):
        import app

        assert app._expand_query_terms({"required_skills": [], "desired_skills": []}) == ([], [])


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


class TestVectorLegRespectsClearanceGate:
    """The vector leg's kNN query has no filter clause (unlike the lexical prefilter), so a
    clearance-disqualified candidate could enter the scored pool via RRF fusion. Regression
    test for that gap: _meets_hard_requirements must strip such candidates post-fusion."""

    def setup_method(self):
        _load_lambda("modules/api/lambda_src/match_candidates")

    def test_disqualified_candidate_excluded_from_merged_set(self, job_descriptions_table):
        import app

        underqualified = dict(SAMPLE_CANDIDATES[0])
        underqualified["clearance_level"] = "Secret"  # JD requires "TS/SCI"
        jd = dict(SAMPLE_JD)
        jd["required_clearance"] = "TS/SCI"
        assert app._meets_hard_requirements(jd, underqualified) is False

    def test_qualified_candidate_kept(self, job_descriptions_table):
        import app

        qualified = dict(SAMPLE_CANDIDATES[0])
        qualified["clearance_level"] = "TS/SCI"
        jd = dict(SAMPLE_JD)
        jd["required_clearance"] = "TS/SCI"
        assert app._meets_hard_requirements(jd, qualified) is True

    def test_no_requirement_keeps_everyone(self, job_descriptions_table):
        import app

        jd = dict(SAMPLE_JD)
        jd.pop("required_clearance", None)
        assert app._meets_hard_requirements(jd, {"clearance_level": None}) is True

    @patch("app.bedrock_agent")
    @patch("app.bedrock")
    @patch("app._get_os_client")
    @patch("app._vector_candidate_pks")
    @patch("app._embed_jd_query")
    def test_vector_only_disqualified_candidate_never_scored(
        self, mock_embed, mock_vec_pks, mock_os_client, mock_bedrock, mock_agent, job_descriptions_table
    ):
        """End-to-end: a candidate who ONLY the vector leg surfaces (lexical leg has zero
        hits) but who fails the JD's clearance requirement must not reach LLM scoring."""
        jd = dict(SAMPLE_JD)
        jd["required_clearance"] = "TS/SCI/FSP"
        job_descriptions_table.put_item(Item=jd)
        import app

        disqualified = dict(SAMPLE_CANDIDATES[0])
        disqualified["clearance_level"] = "TS"  # below TS/SCI/FSP
        mc = MagicMock()
        mc.search.return_value = _os_response([])  # lexical leg: no hits
        mc.mget.return_value = {"docs": [{"_id": disqualified["pk"], "_source": disqualified, "found": True}]}
        mock_os_client.return_value = mc
        mock_embed.return_value = [0.1] * 512
        mock_vec_pks.return_value = [disqualified["pk"]]  # vector leg surfaces the disqualified candidate

        resp = app.handler({"pathParameters": {"pk": "jd-001"}}, None)
        assert resp["statusCode"] == 200
        body = json.loads(resp["body"])
        assert body["matches"] == []
        mock_bedrock.converse.assert_not_called()
