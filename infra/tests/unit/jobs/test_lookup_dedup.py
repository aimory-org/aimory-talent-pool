"""Tests for lookup_dedup Lambda."""

import json
from unittest.mock import MagicMock, patch

import pytest
from _lambda_loader import load as _load_lambda
from boto3.dynamodb.conditions import Key


def _reload_app():
    return _load_lambda("modules/jobs/lambda_src/lookup_dedup")


def _make_bedrock_response(data):
    """Create a mock Bedrock converse response.

    Accepts either:
    - A dict with 'rename' and/or 'remove' keys (new format)
    - A plain dict (old format, treated as rename-only)
    """
    if isinstance(data, dict) and ("rename" in data or "remove" in data):
        payload = data
    else:
        payload = {"rename": data, "remove": []}
    return {"output": {"message": {"content": [{"text": json.dumps(payload)}]}}}


class TestScanLookupTable:
    def test_scans_all_skills(self, skills_lookup_table):
        skills_lookup_table.put_item(Item={"skill": "Python", "updated_at": "t"})
        skills_lookup_table.put_item(Item={"skill": "AWS", "updated_at": "t"})
        skills_lookup_table.put_item(Item={"skill": "Java", "updated_at": "t"})
        app = _reload_app()
        result = app._scan_lookup_table("skills-lookup", "skill")
        assert sorted(result) == ["AWS", "Java", "Python"]

    def test_deduplicates_and_strips(self, skills_lookup_table):
        skills_lookup_table.put_item(Item={"skill": " Python ", "updated_at": "t"})
        skills_lookup_table.put_item(Item={"skill": "Python", "updated_at": "t"})
        app = _reload_app()
        result = app._scan_lookup_table("skills-lookup", "skill")
        assert "Python" in result

    def test_empty_table(self, skills_lookup_table):
        app = _reload_app()
        result = app._scan_lookup_table("skills-lookup", "skill")
        assert result == []


class TestExtractJson:
    def test_plain_json(self, aws_mocks):
        app = _reload_app()
        assert app._extract_json('{"a": "b"}') == {"a": "b"}

    def test_code_block(self, aws_mocks):
        app = _reload_app()
        text = '```json\n{"a": "b"}\n```'
        assert app._extract_json(text) == {"a": "b"}

    def test_surrounding_text(self, aws_mocks):
        app = _reload_app()
        text = 'Here is the result:\n{"a": "b"}\nDone.'
        assert app._extract_json(text) == {"a": "b"}

    def test_invalid_returns_empty(self, aws_mocks):
        app = _reload_app()
        assert app._extract_json("not json at all") == {}


class TestApplySkillRenames:
    def test_renames_skills(self, aws_mocks):
        app = _reload_app()
        skillsets = [
            {"name": "Agile Methodologies", "evidence": ["used agile"]},
            {"name": "Python", "evidence": ["wrote scripts"]},
        ]
        rename_map = {"Agile Methodologies": "Agile"}
        result, changed = app._apply_skill_renames(skillsets, rename_map)
        assert changed is True
        assert result[0]["name"] == "Agile"
        assert result[1]["name"] == "Python"

    def test_removes_useless_skills(self, aws_mocks):
        app = _reload_app()
        skillsets = [
            {"name": "Python", "evidence": ["wrote scripts"]},
            {"name": "Briefing", "evidence": ["gave briefings"]},
            {"name": "Meetings", "evidence": ["attended meetings"]},
        ]
        result, changed = app._apply_skill_renames(skillsets, {}, ["Briefing", "Meetings"])
        assert changed is True
        assert len(result) == 1
        assert result[0]["name"] == "Python"

    def test_renames_and_removes_together(self, aws_mocks):
        app = _reload_app()
        skillsets = [
            {"name": "Agile Methodologies", "evidence": ["used agile"]},
            {"name": "Briefing", "evidence": ["gave briefings"]},
            {"name": "Python", "evidence": ["wrote scripts"]},
        ]
        result, changed = app._apply_skill_renames(skillsets, {"Agile Methodologies": "Agile"}, ["Briefing"])
        assert changed is True
        assert len(result) == 2
        names = [s["name"] for s in result]
        assert "Agile" in names
        assert "Python" in names
        assert "Briefing" not in names

    def test_merges_evidence_on_dedup(self, aws_mocks):
        app = _reload_app()
        skillsets = [
            {"name": "Agile Methodologies", "evidence": ["used agile"]},
            {"name": "Agile", "evidence": ["ran sprints"]},
        ]
        rename_map = {"Agile Methodologies": "Agile"}
        result, changed = app._apply_skill_renames(skillsets, rename_map)
        assert changed is True
        assert len(result) == 1
        assert result[0]["name"] == "Agile"
        assert "used agile" in result[0]["evidence"]
        assert "ran sprints" in result[0]["evidence"]

    def test_no_change_returns_false(self, aws_mocks):
        app = _reload_app()
        skillsets = [{"name": "Python", "evidence": ["wrote scripts"]}]
        rename_map = {"Agile Methodologies": "Agile"}
        result, changed = app._apply_skill_renames(skillsets, rename_map)
        assert changed is False
        assert result[0]["name"] == "Python"

    def test_empty_skillsets(self, aws_mocks):
        app = _reload_app()
        result, changed = app._apply_skill_renames([], {"a": "b"})
        assert result == []
        assert changed is False

    def test_none_skillsets(self, aws_mocks):
        app = _reload_app()
        result, changed = app._apply_skill_renames(None, {"a": "b"})
        assert result is None
        assert changed is False


class TestApplyCertRenames:
    def test_renames_and_deduplicates(self, aws_mocks):
        app = _reload_app()
        certs = ["AWS Solutions Architect", "AWS SA", "PMP"]
        rename_map = {"AWS SA": "AWS Solutions Architect"}
        result, changed = app._apply_cert_renames(certs, rename_map)
        assert changed is True
        assert "AWS Solutions Architect" in result
        assert "PMP" in result
        assert len(result) == 2

    def test_no_change(self, aws_mocks):
        app = _reload_app()
        certs = ["PMP", "CISSP"]
        rename_map = {"AWS SA": "AWS Solutions Architect"}
        result, changed = app._apply_cert_renames(certs, rename_map)
        assert changed is False
        assert result == ["PMP", "CISSP"]


class TestHandler:
    @pytest.fixture
    def all_lookup_tables(self, all_tables):
        """Set up lookup tables with some duplicates."""
        all_tables["skills_lookup"].put_item(Item={"skill": "Agile", "updated_at": "t"})
        all_tables["skills_lookup"].put_item(Item={"skill": "Agile Methodologies", "updated_at": "t"})
        all_tables["skills_lookup"].put_item(Item={"skill": "Python", "updated_at": "t"})
        all_tables["certifications_lookup"].put_item(Item={"certification": "PMP", "updated_at": "t"})
        all_tables["job_titles_lookup"].put_item(Item={"job_title": "Software Eng", "updated_at": "t"})
        all_tables["industry_categories_lookup"].put_item(Item={"industry_category": "Tech", "updated_at": "t"})
        return all_tables

    def _add_profile(self, table, pk, skills, certs=None, job_title=None, industry=None):
        table.put_item(
            Item={
                "pk": pk,
                "name": "Test",
                "skillsets": [{"name": s, "evidence": ["ev"]} for s in skills],
                "skill_names": ",".join(skills),
                "certifications": certs or [],
                "cert_names": ",".join(certs or []),
                "job_title": job_title or "Dev",
                "industry_category": industry or "Tech",
                "status": "Potential Candidate",
            }
        )

    @patch("app.bedrock")
    def test_dry_run_no_changes(self, mock_bedrock, all_lookup_tables):
        mock_bedrock.converse.return_value = _make_bedrock_response({"Agile Methodologies": "Agile"})
        profiles_table = all_lookup_tables["talent_profiles"]
        self._add_profile(profiles_table, "b#1", ["Agile Methodologies", "Python"])

        app = _reload_app()
        app.bedrock = mock_bedrock
        result = app.handler({"dry_run": True}, None)

        assert result["dry_run"] is True
        assert result["profiles_updated"] == 1

        # Profile should NOT be actually changed
        item = profiles_table.get_item(Key={"pk": "b#1"})["Item"]
        assert item["skillsets"][0]["name"] == "Agile Methodologies"

        # Lookup table should NOT be changed
        resp = all_lookup_tables["skills_lookup"].get_item(Key={"skill": "Agile Methodologies"})
        assert "Item" in resp

    @patch("app.bedrock")
    def test_live_renames_profiles_and_cleans_lookups(self, mock_bedrock, all_lookup_tables):
        mock_bedrock.converse.return_value = _make_bedrock_response({"Agile Methodologies": "Agile"})
        profiles_table = all_lookup_tables["talent_profiles"]
        self._add_profile(profiles_table, "b#1", ["Agile Methodologies", "Python"])
        self._add_profile(profiles_table, "b#2", ["Agile", "Java"])

        app = _reload_app()
        app.bedrock = mock_bedrock
        result = app.handler({}, None)

        assert result["dry_run"] is False
        assert result["profiles_updated"] == 1  # only b#1 had the old name

        # Profile b#1 should have renamed skill
        item = profiles_table.get_item(Key={"pk": "b#1"})["Item"]
        skill_names = [s["name"] for s in item["skillsets"]]
        assert "Agile" in skill_names
        assert "Agile Methodologies" not in skill_names

        # Lookup: "Agile" should exist, "Agile Methodologies" should be deleted
        skills_table = all_lookup_tables["skills_lookup"]
        resp = skills_table.get_item(Key={"skill": "Agile"})
        assert "Item" in resp
        resp = skills_table.get_item(Key={"skill": "Agile Methodologies"})
        assert "Item" not in resp

    @patch("app.bedrock")
    def test_no_duplicates_found(self, mock_bedrock, all_lookup_tables):
        mock_bedrock.converse.return_value = _make_bedrock_response({"rename": {}, "remove": []})

        app = _reload_app()
        app.bedrock = mock_bedrock
        result = app.handler({}, None)

        assert result["message"] == "No duplicates or useless entries found"
        assert result["profiles_updated"] == 0

        run_items = all_lookup_tables["audit_log"].query(
            KeyConditionExpression=Key("pk").eq("SYSTEM#LOOKUP_DEDUP_RUN")
        )["Items"]
        assert len(run_items) == 1
        assert run_items[0]["action"] == "UPDATE"
        assert run_items[0]["user_email"] == "dedup@system"
        assert "no duplicates or removals" in run_items[0]["details"].lower()
        assert run_items[0]["snapshot"]["trigger"] == "manual"
        assert run_items[0]["snapshot"]["rename_details"] == {}
        assert run_items[0]["snapshot"]["removal_details"] == {}

    @patch("app.bedrock")
    def test_job_title_rename(self, mock_bedrock, all_lookup_tables):
        # Add a second job title to trigger dedup
        all_lookup_tables["job_titles_lookup"].put_item(Item={"job_title": "Software Engineer", "updated_at": "t"})

        def side_effect(**kwargs):
            prompt_text = kwargs["messages"][0]["content"][0]["text"]
            if "Current skills list" in prompt_text:
                return _make_bedrock_response({"rename": {}, "remove": []})
            if "Current certifications list" in prompt_text:
                return _make_bedrock_response({"rename": {}, "remove": []})
            if "Current job titles list" in prompt_text:
                return _make_bedrock_response({"rename": {"Software Eng": "Software Engineer"}})
            if "industry_categories" in prompt_text:
                return _make_bedrock_response({"rename": {}})
            return _make_bedrock_response({"rename": {}})

        mock_bedrock.converse.side_effect = side_effect

        profiles_table = all_lookup_tables["talent_profiles"]
        self._add_profile(profiles_table, "b#1", ["Python"], job_title="Software Eng")

        app = _reload_app()
        app.bedrock = mock_bedrock
        result = app.handler({}, None)

        assert result["profiles_updated"] == 1
        item = profiles_table.get_item(Key={"pk": "b#1"})["Item"]
        assert item["job_title"] == "Software Engineer"

    @patch("app.bedrock")
    def test_industry_category_rename(self, mock_bedrock, all_lookup_tables):
        all_lookup_tables["industry_categories_lookup"].put_item(
            Item={"industry_category": "Technology", "updated_at": "t"}
        )

        def side_effect(**kwargs):
            prompt_text = kwargs["messages"][0]["content"][0]["text"]
            if "Current industry_categories list" in prompt_text:
                return _make_bedrock_response({"rename": {"Tech": "Technology"}})
            return _make_bedrock_response({"rename": {}, "remove": []})

        mock_bedrock.converse.side_effect = side_effect

        profiles_table = all_lookup_tables["talent_profiles"]
        self._add_profile(profiles_table, "b#1", ["Python"], industry="Tech")

        app = _reload_app()
        app.bedrock = mock_bedrock
        result = app.handler({}, None)

        assert result["profiles_updated"] == 1
        item = profiles_table.get_item(Key={"pk": "b#1"})["Item"]
        assert item["industry_category"] == "Technology"

    @patch("app.bedrock")
    def test_cert_rename_updates_profile(self, mock_bedrock, all_lookup_tables):
        all_lookup_tables["certifications_lookup"].put_item(Item={"certification": "AWS SA", "updated_at": "t"})
        all_lookup_tables["certifications_lookup"].put_item(
            Item={"certification": "AWS Solutions Architect", "updated_at": "t"}
        )

        def side_effect(**kwargs):
            prompt_text = kwargs["messages"][0]["content"][0]["text"]
            if "Current certifications list" in prompt_text:
                return _make_bedrock_response({"rename": {"AWS SA": "AWS Solutions Architect"}, "remove": []})
            return _make_bedrock_response({"rename": {}, "remove": []})

        mock_bedrock.converse.side_effect = side_effect

        profiles_table = all_lookup_tables["talent_profiles"]
        self._add_profile(profiles_table, "b#1", ["Python"], certs=["AWS SA", "PMP"])

        app = _reload_app()
        app.bedrock = mock_bedrock
        result = app.handler({}, None)

        assert result["profiles_updated"] == 1
        item = profiles_table.get_item(Key={"pk": "b#1"})["Item"]
        assert "AWS Solutions Architect" in item["certifications"]
        assert "AWS SA" not in item["certifications"]

    @patch("app.bedrock")
    def test_bedrock_throttle_retries(self, mock_bedrock, all_lookup_tables):
        exc_class = type("ThrottlingException", (Exception,), {})
        mock_bedrock.exceptions = MagicMock()
        mock_bedrock.exceptions.ThrottlingException = exc_class

        call_count = 0

        def side_effect(**kwargs):
            nonlocal call_count
            call_count += 1
            if call_count <= 2:
                raise exc_class("Rate exceeded")
            return _make_bedrock_response({"Agile Methodologies": "Agile"})

        mock_bedrock.converse.side_effect = side_effect

        app = _reload_app()
        app.bedrock = mock_bedrock
        # Patch sleep to avoid waiting in tests
        with patch("app.time.sleep"):
            rename_map, removals = app._get_rename_map("skills", ["Agile", "Agile Methodologies", "Python"])
        assert rename_map == {"Agile Methodologies": "Agile"}
        assert call_count == 3

    @patch("app.bedrock")
    def test_skill_names_field_updated(self, mock_bedrock, all_lookup_tables):
        """skill_names denormalized field should also be updated after renames."""
        mock_bedrock.converse.return_value = _make_bedrock_response({"Agile Methodologies": "Agile"})
        profiles_table = all_lookup_tables["talent_profiles"]
        self._add_profile(profiles_table, "b#1", ["Agile Methodologies", "Python"])

        app = _reload_app()
        app.bedrock = mock_bedrock
        app.handler({}, None)

        item = profiles_table.get_item(Key={"pk": "b#1"})["Item"]
        assert "Agile" in item["skill_names"]
        assert "Agile Methodologies" not in item["skill_names"]

    @patch("app.bedrock")
    def test_removes_useless_skills_from_profiles_and_lookups(self, mock_bedrock, all_lookup_tables):
        """Useless skills should be removed from profiles and lookup table."""
        all_lookup_tables["skills_lookup"].put_item(Item={"skill": "Briefing", "updated_at": "t"})

        mock_bedrock.converse.return_value = _make_bedrock_response(
            {"rename": {"Agile Methodologies": "Agile"}, "remove": ["Briefing"]}
        )
        profiles_table = all_lookup_tables["talent_profiles"]
        self._add_profile(profiles_table, "b#1", ["Agile Methodologies", "Briefing", "Python"])

        app = _reload_app()
        app.bedrock = mock_bedrock
        result = app.handler({}, None)

        assert result["profiles_updated"] == 1
        assert result["removals"]["skills"] == 1

        # Profile should have Briefing removed and Agile Methodologies renamed
        item = profiles_table.get_item(Key={"pk": "b#1"})["Item"]
        skill_names = [s["name"] for s in item["skillsets"]]
        assert "Briefing" not in skill_names
        assert "Agile Methodologies" not in skill_names
        assert "Agile" in skill_names
        assert "Python" in skill_names

        # Lookup table should have Briefing deleted
        resp = all_lookup_tables["skills_lookup"].get_item(Key={"skill": "Briefing"})
        assert "Item" not in resp

    @patch("app.bedrock")
    def test_removes_bogus_certs_from_profiles_and_lookups(self, mock_bedrock, all_lookup_tables):
        """Bogus certifications should be removed from profiles and lookup table."""
        all_lookup_tables["certifications_lookup"].put_item(
            Item={"certification": "CCNA Preparation", "updated_at": "t"}
        )
        all_lookup_tables["certifications_lookup"].put_item(Item={"certification": "PMP", "updated_at": "t"})

        def side_effect(**kwargs):
            prompt_text = kwargs["messages"][0]["content"][0]["text"]
            if "Current certifications list" in prompt_text:
                return _make_bedrock_response({"rename": {}, "remove": ["CCNA Preparation"]})
            return _make_bedrock_response({"rename": {}, "remove": []})

        mock_bedrock.converse.side_effect = side_effect

        profiles_table = all_lookup_tables["talent_profiles"]
        self._add_profile(profiles_table, "b#1", ["Python"], certs=["CCNA Preparation", "PMP"])

        app = _reload_app()
        app.bedrock = mock_bedrock
        result = app.handler({}, None)

        assert result["profiles_updated"] == 1
        assert result["removals"]["certifications"] == 1

        # Profile should have CCNA Preparation removed
        item = profiles_table.get_item(Key={"pk": "b#1"})["Item"]
        assert "CCNA Preparation" not in item["certifications"]
        assert "PMP" in item["certifications"]

        # Lookup table should have CCNA Preparation deleted
        resp = all_lookup_tables["certifications_lookup"].get_item(Key={"certification": "CCNA Preparation"})
        assert "Item" not in resp

    @patch("app.bedrock")
    def test_profile_updates_write_audit_entry(self, mock_bedrock, all_lookup_tables):
        mock_bedrock.converse.return_value = _make_bedrock_response({"Agile Methodologies": "Agile"})
        profiles_table = all_lookup_tables["talent_profiles"]
        self._add_profile(profiles_table, "b#1", ["Agile Methodologies", "Python"])

        app = _reload_app()
        app.bedrock = mock_bedrock
        result = app.handler({}, None)

        assert result["profiles_updated"] == 1

        items = all_lookup_tables["audit_log"].query(KeyConditionExpression=Key("pk").eq("b#1"))["Items"]
        assert len(items) == 1
        assert items[0]["action"] == "UPDATE"
        assert items[0]["user_email"] == "dedup@system"
        assert items[0]["changes"]["skillsets"]["old"][0]["name"] == "Agile Methodologies"
        assert items[0]["changes"]["skillsets"]["new"][0]["name"] == "Agile"

        run_items = all_lookup_tables["audit_log"].query(
            KeyConditionExpression=Key("pk").eq("SYSTEM#LOOKUP_DEDUP_RUN")
        )["Items"]
        assert len(run_items) == 1
        assert "profiles updated" in run_items[0]["details"].lower()
        assert "agile methodologies -> agile" in run_items[0]["details"].lower()
        assert run_items[0]["snapshot"]["trigger"] == "manual"
        assert run_items[0]["snapshot"]["rename_details"]["skills"] == {"Agile Methodologies": "Agile"}
        assert run_items[0]["snapshot"]["removal_details"] == {}

    @patch("app.bedrock")
    def test_scheduled_event_writes_scheduled_trigger(self, mock_bedrock, all_lookup_tables):
        mock_bedrock.converse.return_value = _make_bedrock_response({"rename": {}, "remove": []})

        app = _reload_app()
        app.bedrock = mock_bedrock
        app.handler({"source": "aws.events", "detail-type": "Scheduled Event"}, None)

        run_items = all_lookup_tables["audit_log"].query(
            KeyConditionExpression=Key("pk").eq("SYSTEM#LOOKUP_DEDUP_RUN")
        )["Items"]
        assert len(run_items) == 1
        assert run_items[0]["snapshot"]["trigger"] == "scheduled"


class TestApplyStringListRenames:
    def test_renames_and_deduplicates(self, aws_mocks):
        app = _reload_app()
        result, changed = app._apply_string_list_renames(
            ["AWS", "Python", "aws"],
            {"AWS": "Amazon Web Services"},
        )
        assert changed is True
        assert "Amazon Web Services" in result
        assert "AWS" not in result
        # "aws" should also be deduped after rename doesn't match it directly
        assert result.count("Python") == 1

    def test_removes_entries(self, aws_mocks):
        app = _reload_app()
        result, changed = app._apply_string_list_renames(
            ["Python", "Briefing", "AWS"],
            {},
            removals=["Briefing"],
        )
        assert changed is True
        assert "Briefing" not in result
        assert "Python" in result

    def test_no_change(self, aws_mocks):
        app = _reload_app()
        result, changed = app._apply_string_list_renames(
            ["Python", "AWS"],
            {},
        )
        assert changed is False
        assert result == ["Python", "AWS"]

    def test_empty_list(self, aws_mocks):
        app = _reload_app()
        result, changed = app._apply_string_list_renames([], {"a": "b"})
        assert changed is False
        assert result == []


class TestUpdateJobDescriptions:
    @pytest.fixture
    def all_lookup_tables(self, all_tables):
        """Set up lookup tables with some duplicates."""
        all_tables["skills_lookup"].put_item(Item={"skill": "Agile", "updated_at": "t"})
        all_tables["skills_lookup"].put_item(Item={"skill": "Agile Methodologies", "updated_at": "t"})
        all_tables["skills_lookup"].put_item(Item={"skill": "Python", "updated_at": "t"})
        all_tables["certifications_lookup"].put_item(Item={"certification": "PMP", "updated_at": "t"})
        all_tables["job_titles_lookup"].put_item(Item={"job_title": "Software Eng", "updated_at": "t"})
        all_tables["industry_categories_lookup"].put_item(Item={"industry_category": "Tech", "updated_at": "t"})
        return all_tables

    def _add_jd(
        self, table, pk, req_skills=None, des_skills=None, req_certs=None, des_certs=None, job_title=None, industry=None
    ):
        table.put_item(
            Item={
                "pk": pk,
                "title": f"JD {pk}",
                "required_skills": req_skills or [],
                "desired_skills": des_skills or [],
                "skill_names": ",".join((req_skills or []) + (des_skills or [])),
                "required_certifications": req_certs or [],
                "desired_certifications": des_certs or [],
                "cert_names": ",".join((req_certs or []) + (des_certs or [])),
                "job_title": job_title or "Dev",
                "industry_category": industry or "Tech",
                "created_at": "t",
                "updated_at": "t",
            }
        )

    @patch("app.bedrock")
    def test_renames_jd_skills(self, mock_bedrock, all_lookup_tables):
        mock_bedrock.converse.return_value = _make_bedrock_response({"Agile Methodologies": "Agile"})
        jd_table = all_lookup_tables["job_descriptions"]
        profiles_table = all_lookup_tables["talent_profiles"]
        self._add_jd(jd_table, "jd#1", req_skills=["Agile Methodologies", "Python"], des_skills=["AWS"])

        app = _reload_app()
        app.bedrock = mock_bedrock
        result = app.handler({}, None)

        assert result["jds_updated"] == 1
        item = jd_table.get_item(Key={"pk": "jd#1"})["Item"]
        assert "Agile" in item["required_skills"]
        assert "Agile Methodologies" not in item["required_skills"]
        assert "AWS" in item["desired_skills"]  # unchanged
        assert "Agile" in item["skill_names"]

    @patch("app.bedrock")
    def test_renames_jd_certs(self, mock_bedrock, all_lookup_tables):
        all_lookup_tables["certifications_lookup"].put_item(Item={"certification": "AWS SA", "updated_at": "t"})
        all_lookup_tables["certifications_lookup"].put_item(
            Item={"certification": "AWS Solutions Architect", "updated_at": "t"}
        )

        def side_effect(**kwargs):
            prompt_text = kwargs["messages"][0]["content"][0]["text"]
            if "Current certifications list" in prompt_text:
                return _make_bedrock_response({"rename": {"AWS SA": "AWS Solutions Architect"}, "remove": []})
            return _make_bedrock_response({"rename": {}, "remove": []})

        mock_bedrock.converse.side_effect = side_effect
        jd_table = all_lookup_tables["job_descriptions"]
        self._add_jd(jd_table, "jd#1", req_certs=["AWS SA"], des_certs=["PMP"])

        app = _reload_app()
        app.bedrock = mock_bedrock
        result = app.handler({}, None)

        assert result["jds_updated"] == 1
        item = jd_table.get_item(Key={"pk": "jd#1"})["Item"]
        assert "AWS Solutions Architect" in item["required_certifications"]
        assert "AWS SA" not in item["required_certifications"]
        assert "PMP" in item["desired_certifications"]  # unchanged

    @patch("app.bedrock")
    def test_jd_job_title_rename(self, mock_bedrock, all_lookup_tables):
        all_lookup_tables["job_titles_lookup"].put_item(Item={"job_title": "Software Engineer", "updated_at": "t"})

        def side_effect(**kwargs):
            prompt_text = kwargs["messages"][0]["content"][0]["text"]
            if "Current job titles list" in prompt_text:
                return _make_bedrock_response({"rename": {"Software Eng": "Software Engineer"}})
            return _make_bedrock_response({"rename": {}, "remove": []})

        mock_bedrock.converse.side_effect = side_effect
        jd_table = all_lookup_tables["job_descriptions"]
        self._add_jd(jd_table, "jd#1", job_title="Software Eng")

        app = _reload_app()
        app.bedrock = mock_bedrock
        result = app.handler({}, None)

        assert result["jds_updated"] == 1
        item = jd_table.get_item(Key={"pk": "jd#1"})["Item"]
        assert item["job_title"] == "Software Engineer"

    @patch("app.bedrock")
    def test_dry_run_does_not_modify_jds(self, mock_bedrock, all_lookup_tables):
        mock_bedrock.converse.return_value = _make_bedrock_response({"Agile Methodologies": "Agile"})
        jd_table = all_lookup_tables["job_descriptions"]
        self._add_jd(jd_table, "jd#1", req_skills=["Agile Methodologies"])

        app = _reload_app()
        app.bedrock = mock_bedrock
        result = app.handler({"dry_run": True}, None)

        assert result["jds_updated"] == 1
        # JD should NOT be actually changed in dry-run mode
        item = jd_table.get_item(Key={"pk": "jd#1"})["Item"]
        assert "Agile Methodologies" in item["required_skills"]
