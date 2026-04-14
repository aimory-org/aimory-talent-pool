"""Tests for delete_tag Lambda."""

import json

from _lambda_loader import load as _load_lambda
from boto3.dynamodb.conditions import Key


def _reload_app():
    return _load_lambda("modules/api/lambda_src/delete_tag")


class TestDeleteTagValidation:
    def test_missing_tag_returns_400(self, all_tables):
        app = _reload_app()
        resp = app.handler({"queryStringParameters": {}}, None)
        assert resp["statusCode"] == 400
        assert "tag" in json.loads(resp["body"])["error"].lower()


class TestDeleteTagBehavior:
    def test_removes_tag_from_lookup_and_profiles(self, all_tables):
        all_tables["tags_lookup"].put_item(Item={"tag": "legacy", "updated_at": "2026-04-14T00:00:00Z"})

        all_tables["talent_profiles"].put_item(
            Item={
                "pk": "bucket#one.pdf",
                "name": "Alice One",
                "tags": ["legacy", "python"],
            }
        )
        all_tables["talent_profiles"].put_item(
            Item={
                "pk": "bucket#two.pdf",
                "name": "Bob Two",
                "tags": ["legacy"],
            }
        )
        all_tables["talent_profiles"].put_item(
            Item={
                "pk": "bucket#three.pdf",
                "name": "Cara Three",
                "tags": ["cloud"],
            }
        )

        app = _reload_app()
        resp = app.handler({"queryStringParameters": {"tag": "legacy"}}, None)

        assert resp["statusCode"] == 200
        body = json.loads(resp["body"])
        assert body["profiles_updated"] == 2

        assert "Item" not in all_tables["tags_lookup"].get_item(Key={"tag": "legacy"})

        p1 = all_tables["talent_profiles"].get_item(Key={"pk": "bucket#one.pdf"})["Item"]
        p2 = all_tables["talent_profiles"].get_item(Key={"pk": "bucket#two.pdf"})["Item"]
        p3 = all_tables["talent_profiles"].get_item(Key={"pk": "bucket#three.pdf"})["Item"]

        assert p1["tags"] == ["python"]
        assert p2["tags"] == []
        assert p3["tags"] == ["cloud"]

    def test_writes_audit_entries_for_tag_removal(self, all_tables):
        all_tables["tags_lookup"].put_item(Item={"tag": "legacy", "updated_at": "2026-04-14T00:00:00Z"})
        all_tables["talent_profiles"].put_item(
            Item={
                "pk": "bucket#one.pdf",
                "name": "Alice One",
                "tags": ["legacy", "python"],
            }
        )
        all_tables["talent_profiles"].put_item(
            Item={
                "pk": "bucket#two.pdf",
                "name": "Bob Two",
                "tags": ["legacy"],
            }
        )

        app = _reload_app()
        event = {
            "queryStringParameters": {"tag": "legacy"},
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
        }
        resp = app.handler(event, None)

        assert resp["statusCode"] == 200

        one_entries = all_tables["audit_log"].query(KeyConditionExpression=Key("pk").eq("bucket#one.pdf"))["Items"]
        two_entries = all_tables["audit_log"].query(KeyConditionExpression=Key("pk").eq("bucket#two.pdf"))["Items"]

        assert len(one_entries) == 1
        assert len(two_entries) == 1

        one = one_entries[0]
        two = two_entries[0]

        assert one["action"] == "UPDATE"
        assert two["action"] == "UPDATE"
        assert one["sk"].endswith("#UPDATE")
        assert two["sk"].endswith("#UPDATE")

        assert one["user_email"] == "recruiter@aimory.com"
        assert one["user_name"] == "Sarah Chen"
        assert one["candidate_name"] == "Alice One"

        assert one["changes"]["tags"]["old"] == ["legacy", "python"]
        assert one["changes"]["tags"]["new"] == ["python"]
        assert two["changes"]["tags"]["old"] == ["legacy"]
        assert two["changes"]["tags"]["new"] == []

    def test_no_matching_profiles_does_not_write_audit_entries(self, all_tables):
        all_tables["tags_lookup"].put_item(Item={"tag": "legacy", "updated_at": "2026-04-14T00:00:00Z"})
        all_tables["talent_profiles"].put_item(
            Item={
                "pk": "bucket#three.pdf",
                "name": "Cara Three",
                "tags": ["cloud"],
            }
        )

        app = _reload_app()
        resp = app.handler({"queryStringParameters": {"tag": "legacy"}}, None)

        assert resp["statusCode"] == 200
        body = json.loads(resp["body"])
        assert body["profiles_updated"] == 0

        entries = all_tables["audit_log"].scan().get("Items", [])
        assert entries == []
