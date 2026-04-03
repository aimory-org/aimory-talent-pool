"""Tests for update_talent Lambda."""

import json
from decimal import Decimal

from _lambda_loader import load as _load_lambda


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

    def test_invalid_talent_bucket_returns_400(self, talent_profiles_table):
        talent_profiles_table.put_item(Item={"pk": "b#k"})
        app = _reload_app()
        resp = app.handler(_make_event("b#k", {"talent_bucket": "Nope"}), None)
        assert resp["statusCode"] == 400

    def test_invalid_talent_category_returns_400(self, talent_profiles_table):
        talent_profiles_table.put_item(Item={"pk": "b#k"})
        app = _reload_app()
        resp = app.handler(_make_event("b#k", {"talent_category": "Nope"}), None)
        assert resp["statusCode"] == 400

    def test_invalid_clearance_returns_400(self, talent_profiles_table):
        talent_profiles_table.put_item(Item={"pk": "b#k"})
        app = _reload_app()
        resp = app.handler(_make_event("b#k", {"clearance_level": "Nope"}), None)
        assert resp["statusCode"] == 400

    def test_negative_bill_rate_returns_400(self, talent_profiles_table):
        talent_profiles_table.put_item(Item={"pk": "b#k"})
        app = _reload_app()
        resp = app.handler(_make_event("b#k", {"bill_rate": -50}), None)
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

    def test_update_bill_rate_decimal(self, talent_profiles_table):
        talent_profiles_table.put_item(Item={"pk": "b#k"})
        app = _reload_app()
        resp = app.handler(_make_event("b#k", {"bill_rate": 125.50}), None)
        assert resp["statusCode"] == 200

    def test_bill_rate_null_allowed(self, talent_profiles_table):
        talent_profiles_table.put_item(Item={"pk": "b#k", "bill_rate": Decimal("100")})
        app = _reload_app()
        resp = app.handler(_make_event("b#k", {"bill_rate": None}), None)
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
