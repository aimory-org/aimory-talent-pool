"""Tests for update_talent Lambda."""

import json
from decimal import Decimal

from _lambda_loader import load as _load_lambda
from boto3.dynamodb.conditions import Key


def _reload_app(fixture=None):
    return _load_lambda("modules/api/lambda_src/update_talent")


def _make_event(pk, body):
    return {
        "queryStringParameters": {"pk": pk},
        "body": json.dumps(body),
    }


class TestUpdateTalentValidation:
    def test_missing_pk_returns_400(self, talent_profiles_table):
        app = _reload_app()
        resp = app.handler({"queryStringParameters": {}, "body": json.dumps({"status": "Active Candidate"})}, None)
        assert resp["statusCode"] == 400
        assert "Missing pk" in json.loads(resp["body"])["error"]

    def test_empty_body_returns_400(self, talent_profiles_table):
        talent_profiles_table.put_item(Item={"pk": "b#k"})
        app = _reload_app()
        resp = app.handler(_make_event("b#k", {}), None)
        assert resp["statusCode"] == 400
        assert "No valid fields" in json.loads(resp["body"])["error"]

    def test_invalid_status_returns_400(self, talent_profiles_table):
        talent_profiles_table.put_item(Item={"pk": "b#k"})
        app = _reload_app()
        resp = app.handler(_make_event("b#k", {"status": "BadStatus"}), None)
        assert resp["statusCode"] == 400

    def test_invalid_service_category_returns_400(self, talent_profiles_table):
        talent_profiles_table.put_item(Item={"pk": "b#k"})
        app = _reload_app()
        resp = app.handler(_make_event("b#k", {"service_category": "Nope"}), None)
        assert resp["statusCode"] == 400

    def test_invalid_clearance_returns_400(self, talent_profiles_table):
        talent_profiles_table.put_item(Item={"pk": "b#k"})
        app = _reload_app()
        resp = app.handler(_make_event("b#k", {"clearance_level": "Nope"}), None)
        assert resp["statusCode"] == 400

    def test_negative_requested_salary_returns_400(self, talent_profiles_table):
        talent_profiles_table.put_item(Item={"pk": "b#k"})
        app = _reload_app()
        resp = app.handler(_make_event("b#k", {"requested_salary": -50}), None)
        assert resp["statusCode"] == 400

    def test_negative_years_returns_400(self, talent_profiles_table):
        talent_profiles_table.put_item(Item={"pk": "b#k"})
        app = _reload_app()
        resp = app.handler(_make_event("b#k", {"years_of_experience": -1}), None)
        assert resp["statusCode"] == 400

    def test_nonexistent_pk_returns_404(self, talent_profiles_table):
        app = _reload_app()
        resp = app.handler(_make_event("no-exist", {"status": "Active Candidate"}), None)
        assert resp["statusCode"] == 404


class TestUpdateTalentSuccess:
    def test_update_status(self, talent_profiles_table):
        talent_profiles_table.put_item(Item={"pk": "b#k", "status": "Potential Candidate"})
        app = _reload_app()
        resp = app.handler(_make_event("b#k", {"status": "Active Candidate"}), None)
        assert resp["statusCode"] == 200
        body = json.loads(resp["body"])
        assert body["profile"]["status"] == "Active Candidate"

    def test_update_requested_salary_decimal(self, talent_profiles_table):
        talent_profiles_table.put_item(Item={"pk": "b#k"})
        app = _reload_app()
        resp = app.handler(_make_event("b#k", {"requested_salary": 125000}), None)
        assert resp["statusCode"] == 200

    def test_requested_salary_null_allowed(self, talent_profiles_table):
        talent_profiles_table.put_item(Item={"pk": "b#k", "requested_salary": Decimal("100000")})
        app = _reload_app()
        resp = app.handler(_make_event("b#k", {"requested_salary": None}), None)
        assert resp["statusCode"] == 200

    def test_years_null_allowed(self, talent_profiles_table):
        talent_profiles_table.put_item(Item={"pk": "b#k"})
        app = _reload_app()
        resp = app.handler(_make_event("b#k", {"years_of_experience": None}), None)
        assert resp["statusCode"] == 200


class TestUpdateTalentNormalization:
    def test_name_title_cased(self, talent_profiles_table):
        talent_profiles_table.put_item(Item={"pk": "b#k"})
        app = _reload_app()
        resp = app.handler(_make_event("b#k", {"name": "jAnE dOe"}), None)
        body = json.loads(resp["body"])
        assert body["profile"]["name"] == "Jane Doe"

    def test_email_lowercased(self, talent_profiles_table):
        talent_profiles_table.put_item(Item={"pk": "b#k"})
        app = _reload_app()
        resp = app.handler(_make_event("b#k", {"contact": {"email": "JANE@EXAMPLE.COM"}}), None)
        body = json.loads(resp["body"])
        assert body["profile"]["contact"]["email"] == "jane@example.com"

    def test_phone_formatted(self, talent_profiles_table):
        talent_profiles_table.put_item(Item={"pk": "b#k"})
        app = _reload_app()
        resp = app.handler(_make_event("b#k", {"contact": {"phone": "15551234567"}}), None)
        body = json.loads(resp["body"])
        assert body["profile"]["contact"]["phone"] == "(555) 123-4567"

    def test_state_abbreviation(self, talent_profiles_table):
        talent_profiles_table.put_item(Item={"pk": "b#k"})
        app = _reload_app()
        resp = app.handler(_make_event("b#k", {"location": {"state": "virginia", "city": "herndon"}}), None)
        body = json.loads(resp["body"])
        assert body["profile"]["location"]["state"] == "VA"
        assert body["profile"]["location"]["city"] == "Herndon"

    def test_skill_acronym_preserved(self, talent_profiles_table):
        talent_profiles_table.put_item(Item={"pk": "b#k"})
        app = _reload_app()
        resp = app.handler(_make_event("b#k", {"skillsets": [{"name": "aws"}, {"name": "ci/cd"}]}), None)
        body = json.loads(resp["body"])
        names = [s["name"] for s in body["profile"]["skillsets"]]
        assert "AWS" in names
        assert "CI/CD" in names

    def test_company_title_cased(self, talent_profiles_table):
        talent_profiles_table.put_item(Item={"pk": "b#k"})
        app = _reload_app()
        resp = app.handler(_make_event("b#k", {"companies": [{"name": "acme corp"}]}), None)
        body = json.loads(resp["body"])
        assert body["profile"]["companies"][0]["name"] == "Acme Corp"


class TestUpdateTalentLookupPopulation:
    def test_new_skills_added_to_lookup(self, all_tables):
        all_tables["talent_profiles"].put_item(Item={"pk": "b#k"})
        app = _reload_app()
        resp = app.handler(_make_event("b#k", {"skillsets": [{"name": "NewFramework"}]}), None)
        assert resp["statusCode"] == 200
        item = all_tables["skills_lookup"].get_item(Key={"skill": "Newframework"})
        assert "Item" in item

    def test_new_cert_added_to_lookup(self, all_tables):
        all_tables["talent_profiles"].put_item(Item={"pk": "b#k"})
        app = _reload_app()
        resp = app.handler(_make_event("b#k", {"certifications": ["New Cert Pro"]}), None)
        assert resp["statusCode"] == 200
        item = all_tables["certifications_lookup"].get_item(Key={"certification": "New Cert Pro"})
        assert "Item" in item

    def test_new_job_title_added_to_lookup(self, all_tables):
        all_tables["talent_profiles"].put_item(Item={"pk": "b#k"})
        app = _reload_app()
        resp = app.handler(_make_event("b#k", {"job_title": "Chief AI Officer"}), None)
        assert resp["statusCode"] == 200
        item = all_tables["job_titles_lookup"].get_item(Key={"job_title": "Chief AI Officer"})
        assert "Item" in item

    def test_new_location_added_to_lookup(self, all_tables):
        all_tables["talent_profiles"].put_item(Item={"pk": "b#k"})
        app = _reload_app()
        resp = app.handler(_make_event("b#k", {"location": {"city": "Austin", "state": "TX"}}), None)
        assert resp["statusCode"] == 200
        item = all_tables["cities_lookup"].get_item(Key={"city": "Austin", "state": "TX"})
        assert "Item" in item

    def test_new_industry_added_to_lookup(self, all_tables):
        all_tables["talent_profiles"].put_item(Item={"pk": "b#k"})
        app = _reload_app()
        resp = app.handler(_make_event("b#k", {"industry_category": "Aerospace"}), None)
        assert resp["statusCode"] == 200
        item = all_tables["industry_categories_lookup"].get_item(Key={"industry_category": "Aerospace"})
        assert "Item" in item


class TestUpdateTalentAuditLogging:
    def test_status_change_writes_status_change_audit_entry(self, all_tables):
        all_tables["talent_profiles"].put_item(Item={"pk": "b#k", "status": "Potential Candidate"})
        app = _reload_app()

        resp = app.handler(
            {
                "queryStringParameters": {"pk": "b#k"},
                "body": json.dumps({"status": "Active Candidate"}),
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

        items = all_tables["audit_log"].query(KeyConditionExpression=Key("pk").eq("b#k"))["Items"]
        assert len(items) == 1
        assert items[0]["action"] == "STATUS_CHANGE"
        assert items[0]["user_email"] == "recruiter@aimory.com"
        assert items[0]["changes"]["status"]["old"] == "Potential Candidate"
        assert items[0]["changes"]["status"]["new"] == "Active Candidate"

    def test_non_status_update_writes_update_audit_entry(self, all_tables):
        all_tables["talent_profiles"].put_item(Item={"pk": "b#k", "job_title": "Developer"})
        app = _reload_app()

        resp = app.handler(
            {
                "queryStringParameters": {"pk": "b#k"},
                "body": json.dumps({"job_title": "Senior Developer"}),
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

        items = all_tables["audit_log"].query(KeyConditionExpression=Key("pk").eq("b#k"))["Items"]
        assert len(items) == 1
        assert items[0]["action"] == "UPDATE"
        assert items[0]["changes"]["job_title"]["old"] == "Developer"
        assert items[0]["changes"]["job_title"]["new"] == "Senior Developer"


class TestUpdateTalentDismissDuplicate:
    def test_dismiss_duplicate_removes_flag(self, all_tables):
        all_tables["talent_profiles"].put_item(Item={"pk": "b#k", "possible_duplicate_of": "b#other.pdf"})
        app = _reload_app()
        resp = app.handler(_make_event("b#k", {"dismiss_duplicate": True}), None)
        assert resp["statusCode"] == 200

        item = all_tables["talent_profiles"].get_item(Key={"pk": "b#k"}).get("Item")
        assert "possible_duplicate_of" not in item

    def test_dismiss_duplicate_returns_updated_profile(self, all_tables):
        all_tables["talent_profiles"].put_item(Item={"pk": "b#k", "possible_duplicate_of": "b#other.pdf"})
        app = _reload_app()
        resp = app.handler(_make_event("b#k", {"dismiss_duplicate": True}), None)
        body = json.loads(resp["body"])
        assert "possible_duplicate_of" not in body["profile"]
