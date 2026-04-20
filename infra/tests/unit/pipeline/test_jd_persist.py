"""Tests for JD persist Lambda — validation, normalization, DynamoDB writes, lookup tables."""

import boto3
import pytest
from _lambda_loader import load as _load_lambda


def _reload_app():
    return _load_lambda("pipeline_configs/job_description/persist")


def _make_event(jd, bucket="test-resume-bucket", key="job-descriptions/raw/analyst.pdf"):
    return {"extracted": jd, "bucket": bucket, "key": key}


# ── Validation tests ──────────────────────────────────────────────────────


class TestJDPersistValidation:
    def test_missing_extracted_raises(self, all_jd_tables):
        app = _reload_app()
        with pytest.raises(ValueError, match="Missing extracted"):
            app.handler({"bucket": "b", "key": "k"}, None)

    def test_missing_bucket_raises(self, all_jd_tables, sample_jd):
        app = _reload_app()
        with pytest.raises(ValueError, match="Missing bucket"):
            app.handler({"extracted": sample_jd, "key": "k"}, None)

    def test_missing_key_raises(self, all_jd_tables, sample_jd):
        app = _reload_app()
        with pytest.raises(ValueError, match="Missing bucket"):
            app.handler({"extracted": sample_jd, "bucket": "b"}, None)

    def test_missing_required_field_raises(self, all_jd_tables, sample_jd):
        app = _reload_app()
        del sample_jd["title"]
        with pytest.raises(ValueError, match="Missing required keys"):
            app.handler(_make_event(sample_jd), None)

    def test_extra_field_raises(self, all_jd_tables, sample_jd):
        app = _reload_app()
        sample_jd["unexpected_field"] = "x"
        with pytest.raises(ValueError, match="Unexpected keys"):
            app.handler(_make_event(sample_jd), None)

    def test_is_valid_field_allowed(self, all_jd_tables, sample_jd):
        """is_valid passes through from llm_extract without error."""
        app = _reload_app()
        sample_jd["is_valid"] = True
        result = app.handler(_make_event(sample_jd), None)
        assert result["status"] == "ok"


# ── DynamoDB write tests ──────────────────────────────────────────────────


class TestJDPersistWrite:
    def test_creates_item_with_uuid_pk(self, all_jd_tables, sample_jd):
        app = _reload_app()
        result = app.handler(_make_event(sample_jd), None)
        assert result["status"] == "ok"
        pk = result["pk"]
        # UUID format: 8-4-4-4-12 hex chars
        assert len(pk.split("-")) == 5

    def test_item_fields_persisted(self, all_jd_tables, sample_jd):
        app = _reload_app()
        result = app.handler(_make_event(sample_jd), None)

        ddb = boto3.resource("dynamodb", region_name="us-east-1")
        table = ddb.Table("job-descriptions")
        item = table.get_item(Key={"pk": result["pk"]})["Item"]

        assert item["title"] == "Data & Excel Analyst"
        assert item["job_title"] == "Data Analyst"
        assert item["required_clearance"] == "TS/SCI/FSP"
        assert item["industry_category"] == "Federal Government"
        assert item["bucket"] == "test-resume-bucket"
        assert item["key"] == "job-descriptions/raw/analyst.pdf"

    def test_skills_denormalized(self, all_jd_tables, sample_jd):
        app = _reload_app()
        result = app.handler(_make_event(sample_jd), None)

        ddb = boto3.resource("dynamodb", region_name="us-east-1")
        item = ddb.Table("job-descriptions").get_item(Key={"pk": result["pk"]})["Item"]

        assert "Microsoft Excel" in item["skill_names"]
        assert "Power BI" in item["skill_names"]

    def test_location_state_normalized(self, all_jd_tables, sample_jd):
        app = _reload_app()
        result = app.handler(_make_event(sample_jd), None)

        ddb = boto3.resource("dynamodb", region_name="us-east-1")
        item = ddb.Table("job-descriptions").get_item(Key={"pk": result["pk"]})["Item"]

        assert item["location"]["state"] == "VA"
        assert item["location_state"] == "VA"

    def test_salary_range_persisted(self, all_jd_tables, sample_jd):
        app = _reload_app()
        result = app.handler(_make_event(sample_jd), None)

        ddb = boto3.resource("dynamodb", region_name="us-east-1")
        item = ddb.Table("job-descriptions").get_item(Key={"pk": result["pk"]})["Item"]

        from decimal import Decimal

        assert item["salary_range"]["min"] == Decimal("90000")
        assert item["salary_range"]["max"] == Decimal("120000")

    def test_null_clearance_persisted(self, all_jd_tables, sample_jd):
        app = _reload_app()
        sample_jd["required_clearance"] = None
        result = app.handler(_make_event(sample_jd), None)

        ddb = boto3.resource("dynamodb", region_name="us-east-1")
        item = ddb.Table("job-descriptions").get_item(Key={"pk": result["pk"]})["Item"]
        assert item.get("required_clearance") is None


# ── Lookup table population tests ─────────────────────────────────────────


class TestJDPersistLookupTables:
    def test_skills_populated(self, all_jd_tables, sample_jd):
        app = _reload_app()
        app.handler(_make_event(sample_jd), None)

        ddb = boto3.resource("dynamodb", region_name="us-east-1")
        items = ddb.Table("skills-lookup").scan()["Items"]
        skill_names = {i["skill"] for i in items}
        # Both required and desired skills should be populated
        assert "Microsoft Excel" in skill_names
        assert "Power BI" in skill_names

    def test_certifications_populated(self, all_jd_tables, sample_jd):
        app = _reload_app()
        app.handler(_make_event(sample_jd), None)

        ddb = boto3.resource("dynamodb", region_name="us-east-1")
        items = ddb.Table("certifications-lookup").scan()["Items"]
        cert_names = {i["certification"] for i in items}
        assert "CompTIA Security+" in cert_names

    def test_job_title_populated(self, all_jd_tables, sample_jd):
        app = _reload_app()
        app.handler(_make_event(sample_jd), None)

        ddb = boto3.resource("dynamodb", region_name="us-east-1")
        items = ddb.Table("job-titles-lookup").scan()["Items"]
        assert any(i["job_title"] == "Data Analyst" for i in items)

    def test_city_populated(self, all_jd_tables, sample_jd):
        app = _reload_app()
        app.handler(_make_event(sample_jd), None)

        ddb = boto3.resource("dynamodb", region_name="us-east-1")
        items = ddb.Table("cities-lookup").scan()["Items"]
        assert any(i["city"] == "Herndon" and i["state"] == "VA" for i in items)


# ── Audit log tests ───────────────────────────────────────────────────────


class TestJDPersistAuditLog:
    def test_audit_entry_created(self, all_jd_tables, sample_jd):
        app = _reload_app()
        result = app.handler(_make_event(sample_jd), None)

        ddb = boto3.resource("dynamodb", region_name="us-east-1")
        items = ddb.Table("audit-log").scan()["Items"]
        assert len(items) == 1
        assert items[0]["pk"] == result["pk"]
        assert items[0]["action"] == "CREATE"
        assert items[0]["document_type"] == "job_description"
