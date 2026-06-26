"""Tests for bulk_delete_talents Lambda."""

import json

import boto3
from _lambda_loader import load as _load_lambda
from boto3.dynamodb.conditions import Key


def _reload_app():
    return _load_lambda("modules/api/lambda_src/bulk_delete_talents")


def _event(body, claims=None):
    ev = {"body": json.dumps(body)}
    if claims:
        ev["requestContext"] = {"authorizer": {"jwt": {"claims": claims}}}
    return ev


class TestBulkDeleteTalentsHandler:
    def test_missing_pks_returns_400(self, talent_profiles_table):
        app = _reload_app()
        resp = app.handler(_event({}), None)
        assert resp["statusCode"] == 400

    def test_deletes_all_pks(self, talent_profiles_table):
        talent_profiles_table.put_item(Item={"pk": "b#k1", "name": "Alice"})
        talent_profiles_table.put_item(Item={"pk": "b#k2", "name": "Bob"})
        app = _reload_app()

        resp = app.handler(_event({"pks": ["b#k1", "b#k2"]}), None)
        assert resp["statusCode"] == 200
        body = json.loads(resp["body"])
        assert body["deleted_count"] == 2
        assert body["failed_pks"] == []

        assert "Item" not in talent_profiles_table.get_item(Key={"pk": "b#k1"})
        assert "Item" not in talent_profiles_table.get_item(Key={"pk": "b#k2"})

    def test_nonexistent_pk_goes_to_failed(self, talent_profiles_table):
        app = _reload_app()
        resp = app.handler(_event({"pks": ["no-exist"]}), None)
        assert resp["statusCode"] == 200
        body = json.loads(resp["body"])
        assert body["deleted_count"] == 0
        assert "no-exist" in body["failed_pks"]

    def test_deletes_s3_resume(self, talent_profiles_table):
        s3 = boto3.client("s3", region_name="us-east-1")
        s3.create_bucket(Bucket="test-resume-bucket")
        s3.put_object(Bucket="test-resume-bucket", Key="raw/file.pdf", Body=b"pdf")

        talent_profiles_table.put_item(Item={"pk": "b#k1", "key": "raw/file.pdf"})
        app = _reload_app()

        resp = app.handler(_event({"pks": ["b#k1"]}), None)
        assert resp["statusCode"] == 200

        objs = s3.list_objects_v2(Bucket="test-resume-bucket", Prefix="raw/file.pdf")
        assert objs.get("KeyCount", 0) == 0

    def test_too_many_pks_returns_400(self, talent_profiles_table):
        app = _reload_app()
        pks = [f"pk{i}" for i in range(101)]
        resp = app.handler(_event({"pks": pks}), None)
        assert resp["statusCode"] == 400

    def test_writes_audit_entries(self, all_tables):
        all_tables["talent_profiles"].put_item(Item={"pk": "b#k1", "name": "Alice", "status": "Active Candidate"})
        app = _reload_app()

        claims = {"email": "recruiter@aimory.com", "name": "Sarah Chen"}
        resp = app.handler(_event({"pks": ["b#k1"]}, claims=claims), None)
        assert resp["statusCode"] == 200

        items = all_tables["audit_log"].query(KeyConditionExpression=Key("pk").eq("b#k1"))["Items"]
        assert len(items) == 1
        assert items[0]["action"] == "DELETE"
        assert items[0]["user_email"] == "recruiter@aimory.com"

    def test_partial_success(self, talent_profiles_table):
        talent_profiles_table.put_item(Item={"pk": "b#k1", "name": "Alice"})
        app = _reload_app()

        resp = app.handler(_event({"pks": ["b#k1", "no-exist"]}), None)
        assert resp["statusCode"] == 200
        body = json.loads(resp["body"])
        assert body["deleted_count"] == 1
        assert "no-exist" in body["failed_pks"]
