"""Tests for persist Lambda — validation, normalization, DynamoDB writes, lookup tables."""


from decimal import Decimal

import pytest
from _lambda_loader import load as _load_lambda


def _reload_app():
    return _load_lambda("modules/pipeline/lambda_src/persist")


def _make_event(profile, bucket="test-bucket", key="raw/onedrive/resume.pdf"):
    return {"extracted": profile, "bucket": bucket, "key": key}


# ── Validation tests ──────────────────────────────────────────────────────


class TestPersistValidation:
    def test_missing_extracted_raises(self, all_tables):
        app = _reload_app()
        with pytest.raises(ValueError, match="Missing extracted"):
            app.handler({"bucket": "b", "key": "k"}, None)

    def test_missing_bucket_raises(self, all_tables, sample_profile):
        app = _reload_app()
        with pytest.raises(ValueError, match="Missing bucket"):
            app.handler({"extracted": sample_profile, "key": "k"}, None)

    def test_missing_key_raises(self, all_tables, sample_profile):
        app = _reload_app()
        with pytest.raises(ValueError, match="Missing bucket"):
            app.handler({"extracted": sample_profile, "bucket": "b"}, None)

    def test_missing_required_field_raises(self, all_tables, sample_profile):
        app = _reload_app()
        del sample_profile["name"]
        with pytest.raises(ValueError, match="missing required keys"):
            app.handler(_make_event(sample_profile), None)

    def test_extra_field_raises(self, all_tables, sample_profile):
        app = _reload_app()
        sample_profile["unexpected_field"] = "x"
        with pytest.raises(ValueError, match="unexpected keys"):
            app.handler(_make_event(sample_profile), None)

    def test_is_resume_field_allowed(self, all_tables, sample_profile):
        """is_resume passes through from llm_extract without error."""
        app = _reload_app()
        sample_profile["is_resume"] = True
        result = app.handler(_make_event(sample_profile), None)
        assert result["status"] == "ok"

    def test_invalid_talent_bucket_raises(self, all_tables, sample_profile):
        app = _reload_app()
        sample_profile["talent_bucket"] = "Bad Bucket"
        with pytest.raises(ValueError, match="talent_bucket invalid"):
            app.handler(_make_event(sample_profile), None)

    def test_null_talent_bucket_allowed(self, all_tables, sample_profile):
        app = _reload_app()
        sample_profile["talent_bucket"] = None
        result = app.handler(_make_event(sample_profile), None)
        assert result["status"] == "ok"

    def test_invalid_talent_category_raises(self, all_tables, sample_profile):
        app = _reload_app()
        sample_profile["talent_category"] = "Juggler"
        with pytest.raises(ValueError, match="talent_category invalid"):
            app.handler(_make_event(sample_profile), None)

    def test_contact_missing_key_raises(self, all_tables, sample_profile):
        app = _reload_app()
        del sample_profile["contact"]["github"]
        with pytest.raises(ValueError, match="contact missing required"):
            app.handler(_make_event(sample_profile), None)

    def test_skillset_missing_evidence_raises(self, all_tables, sample_profile):
        app = _reload_app()
        sample_profile["skillsets"] = [{"name": "Python"}]
        with pytest.raises(ValueError, match="missing required"):
            app.handler(_make_event(sample_profile), None)

    def test_skillset_empty_evidence_raises(self, all_tables, sample_profile):
        app = _reload_app()
        sample_profile["skillsets"] = [{"name": "Python", "evidence": []}]
        with pytest.raises(ValueError, match="evidence must be list of 1"):
            app.handler(_make_event(sample_profile), None)

    def test_company_missing_evidence_raises(self, all_tables, sample_profile):
        app = _reload_app()
        sample_profile["companies"] = [{"name": "Acme"}]
        with pytest.raises(ValueError):
            app.handler(_make_event(sample_profile), None)

    def test_location_missing_key_raises(self, all_tables, sample_profile):
        app = _reload_app()
        sample_profile["location"] = {"city": "X"}
        with pytest.raises(ValueError, match="location missing required"):
            app.handler(_make_event(sample_profile), None)

    def test_years_boolean_rejects(self, all_tables, sample_profile):
        app = _reload_app()
        sample_profile["years_of_experience"] = True
        with pytest.raises(ValueError, match="years_of_experience must be a number"):
            app.handler(_make_event(sample_profile), None)

    def test_bill_rate_boolean_rejects(self, all_tables, sample_profile):
        app = _reload_app()
        sample_profile["bill_rate"] = False
        with pytest.raises(ValueError, match="bill_rate must be a number"):
            app.handler(_make_event(sample_profile), None)

    def test_certifications_not_list_raises(self, all_tables, sample_profile):
        app = _reload_app()
        sample_profile["certifications"] = "PMP"
        with pytest.raises(ValueError, match="certifications must be a list"):
            app.handler(_make_event(sample_profile), None)


# ── Normalization tests ───────────────────────────────────────────────────


class TestPersistNormalization:
    def test_name_title_cased(self, all_tables, sample_profile):
        app = _reload_app()
        sample_profile["name"] = "jAnE dOe"
        result = app.handler(_make_event(sample_profile), None)
        # Read back from DynamoDB
        import boto3

        table = boto3.resource("dynamodb", region_name="us-east-1").Table("talent-profiles")
        item = table.get_item(Key={"pk": result["pk"]})["Item"]
        assert item["name"] == "Jane Doe"
        assert item["name_lower"] == "jane doe"

    def test_email_lowercased(self, all_tables, sample_profile):
        app = _reload_app()
        sample_profile["contact"]["email"] = "JANE@EXAMPLE.COM"
        result = app.handler(_make_event(sample_profile), None)
        import boto3

        table = boto3.resource("dynamodb", region_name="us-east-1").Table("talent-profiles")
        item = table.get_item(Key={"pk": result["pk"]})["Item"]
        assert item["contact"]["email"] == "jane@example.com"

    def test_phone_us_format(self, all_tables, sample_profile):
        app = _reload_app()
        sample_profile["contact"]["phone"] = "15551234567"
        result = app.handler(_make_event(sample_profile), None)
        import boto3

        table = boto3.resource("dynamodb", region_name="us-east-1").Table("talent-profiles")
        item = table.get_item(Key={"pk": result["pk"]})["Item"]
        assert item["contact"]["phone"] == "(555) 123-4567"

    def test_phone_10_digits(self, all_tables, sample_profile):
        app = _reload_app()
        sample_profile["contact"]["phone"] = "555-123-4567"
        result = app.handler(_make_event(sample_profile), None)
        import boto3

        table = boto3.resource("dynamodb", region_name="us-east-1").Table("talent-profiles")
        item = table.get_item(Key={"pk": result["pk"]})["Item"]
        assert item["contact"]["phone"] == "(555) 123-4567"

    def test_state_full_name_to_abbrev(self, all_tables, sample_profile):
        app = _reload_app()
        sample_profile["location"]["state"] = "Virginia"
        result = app.handler(_make_event(sample_profile), None)
        import boto3

        table = boto3.resource("dynamodb", region_name="us-east-1").Table("talent-profiles")
        item = table.get_item(Key={"pk": result["pk"]})["Item"]
        assert item["location"]["state"] == "VA"
        assert item["location_state"] == "VA"

    def test_state_already_abbrev(self, all_tables, sample_profile):
        app = _reload_app()
        sample_profile["location"]["state"] = "va"
        result = app.handler(_make_event(sample_profile), None)
        import boto3

        table = boto3.resource("dynamodb", region_name="us-east-1").Table("talent-profiles")
        item = table.get_item(Key={"pk": result["pk"]})["Item"]
        assert item["location"]["state"] == "VA"

    def test_city_title_cased(self, all_tables, sample_profile):
        app = _reload_app()
        sample_profile["location"]["city"] = "HERNDON"
        result = app.handler(_make_event(sample_profile), None)
        import boto3

        table = boto3.resource("dynamodb", region_name="us-east-1").Table("talent-profiles")
        item = table.get_item(Key={"pk": result["pk"]})["Item"]
        assert item["location"]["city"] == "Herndon"

    def test_skill_acronym_preserved(self, all_tables, sample_profile):
        app = _reload_app()
        sample_profile["skillsets"] = [
            {"name": "aws", "evidence": ["used it"]},
            {"name": "ci/cd", "evidence": ["pipelines"]},
            {"name": "python", "evidence": ["scripts"]},
        ]
        result = app.handler(_make_event(sample_profile), None)
        import boto3

        table = boto3.resource("dynamodb", region_name="us-east-1").Table("talent-profiles")
        item = table.get_item(Key={"pk": result["pk"]})["Item"]
        names = [s["name"] for s in item["skillsets"]]
        assert "AWS" in names
        assert "CI/CD" in names
        assert "Python" in names

    def test_company_title_cased(self, all_tables, sample_profile):
        app = _reload_app()
        sample_profile["companies"] = [{"name": "acme corp", "evidence": ["dev"]}]
        result = app.handler(_make_event(sample_profile), None)
        import boto3

        table = boto3.resource("dynamodb", region_name="us-east-1").Table("talent-profiles")
        item = table.get_item(Key={"pk": result["pk"]})["Item"]
        assert item["companies"][0]["name"] == "Acme Corp"


# ── DynamoDB write tests ──────────────────────────────────────────────────


class TestPersistDynamoDB:
    def test_creates_item_with_correct_pk(self, all_tables, sample_profile):
        app = _reload_app()
        result = app.handler(_make_event(sample_profile, "mybucket", "raw/file.pdf"), None)
        assert result["pk"] == "mybucket#raw/file.pdf"
        assert result["status"] == "ok"

    def test_default_status_potential_candidate(self, all_tables, sample_profile):
        app = _reload_app()
        result = app.handler(_make_event(sample_profile), None)
        import boto3

        table = boto3.resource("dynamodb", region_name="us-east-1").Table("talent-profiles")
        item = table.get_item(Key={"pk": result["pk"]})["Item"]
        assert item["status"] == "Potential Candidate"

    def test_decimal_conversion(self, all_tables, sample_profile):
        app = _reload_app()
        sample_profile["bill_rate"] = 125.50
        sample_profile["years_of_experience"] = 10
        result = app.handler(_make_event(sample_profile), None)
        import boto3

        table = boto3.resource("dynamodb", region_name="us-east-1").Table("talent-profiles")
        item = table.get_item(Key={"pk": result["pk"]})["Item"]
        assert isinstance(item["bill_rate"], Decimal)
        assert isinstance(item["years_of_experience"], Decimal)

    def test_denormalized_skill_names(self, all_tables, sample_profile):
        app = _reload_app()
        result = app.handler(_make_event(sample_profile), None)
        import boto3

        table = boto3.resource("dynamodb", region_name="us-east-1").Table("talent-profiles")
        item = table.get_item(Key={"pk": result["pk"]})["Item"]
        assert "Python" in item["skill_names"]
        assert "AWS" in item["skill_names"]

    def test_denormalized_cert_names(self, all_tables, sample_profile):
        app = _reload_app()
        result = app.handler(_make_event(sample_profile), None)
        import boto3

        table = boto3.resource("dynamodb", region_name="us-east-1").Table("talent-profiles")
        item = table.get_item(Key={"pk": result["pk"]})["Item"]
        assert "PMP" in item["cert_names"]

    def test_null_bucket_defaults_unclassified(self, all_tables, sample_profile):
        app = _reload_app()
        sample_profile["talent_bucket"] = None
        result = app.handler(_make_event(sample_profile), None)
        import boto3

        table = boto3.resource("dynamodb", region_name="us-east-1").Table("talent-profiles")
        item = table.get_item(Key={"pk": result["pk"]})["Item"]
        assert item["talent_bucket"] == "Unclassified"

    def test_null_clearance_defaults_none(self, all_tables, sample_profile):
        app = _reload_app()
        sample_profile["clearance_level"] = None
        result = app.handler(_make_event(sample_profile), None)
        import boto3

        table = boto3.resource("dynamodb", region_name="us-east-1").Table("talent-profiles")
        item = table.get_item(Key={"pk": result["pk"]})["Item"]
        assert item["clearance_level"] == "None"


# ── Lookup table population tests ────────────────────────────────────────


class TestPersistLookupTables:
    def test_populates_skills_lookup(self, all_tables, sample_profile):
        app = _reload_app()
        app.handler(_make_event(sample_profile), None)
        import boto3

        table = boto3.resource("dynamodb", region_name="us-east-1").Table("skills-lookup")
        items = table.scan()["Items"]
        skill_names = {i["skill"] for i in items}
        assert "Python" in skill_names
        assert "AWS" in skill_names

    def test_populates_certifications_lookup(self, all_tables, sample_profile):
        app = _reload_app()
        app.handler(_make_event(sample_profile), None)
        import boto3

        table = boto3.resource("dynamodb", region_name="us-east-1").Table("certifications-lookup")
        items = table.scan()["Items"]
        cert_names = {i["certification"] for i in items}
        assert "AWS Solutions Architect" in cert_names
        assert "PMP" in cert_names

    def test_populates_cities_lookup(self, all_tables, sample_profile):
        app = _reload_app()
        app.handler(_make_event(sample_profile), None)
        import boto3

        table = boto3.resource("dynamodb", region_name="us-east-1").Table("cities-lookup")
        items = table.scan()["Items"]
        assert len(items) == 1
        assert items[0]["city"] == "Herndon"

    def test_empty_skillsets_no_lookup_write(self, all_tables, sample_profile):
        app = _reload_app()
        sample_profile["skillsets"] = []
        app.handler(_make_event(sample_profile), None)
        import boto3

        table = boto3.resource("dynamodb", region_name="us-east-1").Table("skills-lookup")
        assert table.scan()["Items"] == []
