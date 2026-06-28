"""Tests for bulk_update_talents Lambda."""

import json

from _lambda_loader import load as _load_lambda
from boto3.dynamodb.conditions import Key


def _reload_app():
    return _load_lambda("modules/api/lambda_src/bulk_update_talents")


def _event(body, claims=None):
    ev = {"body": json.dumps(body)}
    if claims:
        ev["requestContext"] = {"authorizer": {"jwt": {"claims": claims}}}
    return ev


class TestBulkUpdateTalentsHandler:
    def test_missing_pks_returns_400(self, talent_profiles_table):
        app = _reload_app()
        resp = app.handler(_event({"status": "Active Candidate"}), None)
        assert resp["statusCode"] == 400

    def test_invalid_status_returns_400(self, talent_profiles_table):
        app = _reload_app()
        resp = app.handler(_event({"pks": ["pk1"], "status": "Bad Status"}), None)
        assert resp["statusCode"] == 400

    def test_updates_status_for_all_pks(self, talent_profiles_table):
        talent_profiles_table.put_item(Item={"pk": "b#k1", "name": "Alice", "status": "Potential Candidate"})
        talent_profiles_table.put_item(Item={"pk": "b#k2", "name": "Bob", "status": "Potential Candidate"})
        app = _reload_app()

        resp = app.handler(_event({"pks": ["b#k1", "b#k2"], "status": "Active Candidate"}), None)
        assert resp["statusCode"] == 200
        body = json.loads(resp["body"])
        assert body["updated_count"] == 2
        assert body["failed_pks"] == []

        item1 = talent_profiles_table.get_item(Key={"pk": "b#k1"})["Item"]
        assert item1["status"] == "Active Candidate"
        item2 = talent_profiles_table.get_item(Key={"pk": "b#k2"})["Item"]
        assert item2["status"] == "Active Candidate"

    def test_nonexistent_pk_goes_to_failed(self, talent_profiles_table):
        app = _reload_app()
        resp = app.handler(_event({"pks": ["no-exist"], "status": "Active Candidate"}), None)
        assert resp["statusCode"] == 200
        body = json.loads(resp["body"])
        assert body["updated_count"] == 0
        assert "no-exist" in body["failed_pks"]

    def test_partial_success(self, talent_profiles_table):
        talent_profiles_table.put_item(Item={"pk": "b#k1", "name": "Alice", "status": "Potential Candidate"})
        app = _reload_app()

        resp = app.handler(_event({"pks": ["b#k1", "no-exist"], "status": "Stale Candidate"}), None)
        assert resp["statusCode"] == 200
        body = json.loads(resp["body"])
        assert body["updated_count"] == 1
        assert "no-exist" in body["failed_pks"]

    def test_too_many_pks_returns_400(self, talent_profiles_table):
        app = _reload_app()
        pks = [f"pk{i}" for i in range(101)]
        resp = app.handler(_event({"pks": pks, "status": "Active Candidate"}), None)
        assert resp["statusCode"] == 400

    def test_writes_audit_entries(self, all_tables):
        all_tables["talent_profiles"].put_item(Item={"pk": "b#k1", "name": "Alice", "status": "Potential Candidate"})
        app = _reload_app()

        claims = {"email": "recruiter@aimory.com", "name": "Sarah Chen"}
        resp = app.handler(_event({"pks": ["b#k1"], "status": "Active Candidate"}, claims=claims), None)
        assert resp["statusCode"] == 200

        items = all_tables["audit_log"].query(KeyConditionExpression=Key("pk").eq("b#k1"))["Items"]
        assert len(items) == 1
        assert items[0]["action"] == "STATUS_CHANGE"
        assert items[0]["user_email"] == "recruiter@aimory.com"
