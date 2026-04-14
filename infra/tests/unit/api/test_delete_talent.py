"""Tests for delete_talent Lambda."""

import json

import boto3
from boto3.dynamodb.conditions import Key
from _lambda_loader import load as _load_lambda


def _reload_app():
    return _load_lambda("modules/api/lambda_src/delete_talent")


class TestDeleteTalentHandler:
    def test_missing_pk_returns_400(self, talent_profiles_table):
        app = _reload_app()
        resp = app.handler({"queryStringParameters": {}}, None)
        assert resp["statusCode"] == 400

    def test_not_found_returns_404(self, talent_profiles_table):
        app = _reload_app()
        resp = app.handler({"queryStringParameters": {"pk": "no-exist"}}, None)
        assert resp["statusCode"] == 404

    def test_deletes_from_dynamodb(self, talent_profiles_table):
        talent_profiles_table.put_item(Item={"pk": "b#k", "name": "Jane"})
        app = _reload_app()

        resp = app.handler({"queryStringParameters": {"pk": "b#k"}}, None)
        assert resp["statusCode"] == 200
        assert json.loads(resp["body"])["pk"] == "b#k"

        # Verify item is gone
        result = talent_profiles_table.get_item(Key={"pk": "b#k"})
        assert "Item" not in result

    def test_deletes_s3_resume_when_bucket_configured(self, talent_profiles_table):
        s3 = boto3.client("s3", region_name="us-east-1")
        s3.create_bucket(Bucket="test-resume-bucket")
        s3.put_object(Bucket="test-resume-bucket", Key="raw/file.pdf", Body=b"pdf")

        talent_profiles_table.put_item(Item={"pk": "b#k", "key": "raw/file.pdf"})
        app = _reload_app()

        resp = app.handler({"queryStringParameters": {"pk": "b#k"}}, None)
        assert resp["statusCode"] == 200

        # S3 object should be deleted
        objs = s3.list_objects_v2(Bucket="test-resume-bucket", Prefix="raw/file.pdf")
        assert objs.get("KeyCount", 0) == 0

    def test_s3_failure_does_not_block_delete(self, talent_profiles_table):
        # Item has an s3 key but the bucket doesn't have the object — shouldn't fail
        talent_profiles_table.put_item(Item={"pk": "b#k", "key": "raw/missing.pdf"})
        app = _reload_app()

        resp = app.handler({"queryStringParameters": {"pk": "b#k"}}, None)
        assert resp["statusCode"] == 200

    def test_no_s3_delete_when_no_key(self, talent_profiles_table):
        talent_profiles_table.put_item(Item={"pk": "b#k", "name": "Jane"})
        app = _reload_app()
        resp = app.handler({"queryStringParameters": {"pk": "b#k"}}, None)
        assert resp["statusCode"] == 200

    def test_writes_delete_audit_entry_with_snapshot(self, all_tables):
        all_tables["talent_profiles"].put_item(Item={"pk": "b#k", "name": "Jane", "status": "Active Candidate"})
        app = _reload_app()

        resp = app.handler(
            {
                "queryStringParameters": {"pk": "b#k"},
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
        assert items[0]["action"] == "DELETE"
        assert items[0]["user_email"] == "recruiter@aimory.com"
        assert items[0]["snapshot"]["name"] == "Jane"
