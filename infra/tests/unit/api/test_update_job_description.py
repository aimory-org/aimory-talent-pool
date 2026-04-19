"""Tests for update_job_description Lambda."""

import json

import boto3
from _lambda_loader import load as _load_lambda
from boto3.dynamodb.conditions import Key


def _reload_app():
    return _load_lambda("modules/api/lambda_src/update_job_description")


def _make_event(body, actor_email=None, actor_name=None):
    event = {"body": json.dumps(body)}
    if actor_email:
        claims = {"email": actor_email}
        if actor_name:
            claims["name"] = actor_name
        event["requestContext"] = {"authorizer": {"jwt": {"claims": claims}}}
    return event


def _seed_jd(table, pk="jd-123", **kwargs):
    item = {
        "pk": pk,
        "title": "Original Title",
        "required_skills": ["Python"],
        "desired_skills": ["Go"],
        "required_certifications": ["PMP"],
        "desired_certifications": [],
        "required_clearance": "Secret",
        "location": {"city": "Herndon", "state": "VA"},
        "created_at": "2025-01-01T00:00:00Z",
        **kwargs,
    }
    table.put_item(Item=item)
    return item


class TestUpdateJobDescriptionHandler:
    def test_missing_pk_returns_400(self, job_descriptions_table):
        app = _reload_app()
        resp = app.handler(_make_event({"title": "New"}), None)
        assert resp["statusCode"] == 400

    def test_no_editable_fields_returns_400(self, job_descriptions_table):
        _seed_jd(job_descriptions_table)
        app = _reload_app()
        resp = app.handler(_make_event({"pk": "jd-123"}), None)
        assert resp["statusCode"] == 400

    def test_not_found_returns_404(self, job_descriptions_table):
        app = _reload_app()
        resp = app.handler(_make_event({"pk": "no-exist", "title": "New"}), None)
        assert resp["statusCode"] == 404

    def test_invalid_clearance_returns_400(self, job_descriptions_table):
        _seed_jd(job_descriptions_table)
        app = _reload_app()
        resp = app.handler(_make_event({"pk": "jd-123", "required_clearance": "InvalidLevel"}), None)
        assert resp["statusCode"] == 400

    def test_updates_title(self, job_descriptions_table):
        _seed_jd(job_descriptions_table)
        app = _reload_app()

        resp = app.handler(_make_event({"pk": "jd-123", "title": "Updated Title"}), None)
        assert resp["statusCode"] == 200

        item = job_descriptions_table.get_item(Key={"pk": "jd-123"})["Item"]
        assert item["title"] == "Updated Title"
        assert "updated_at" in item

    def test_updates_salary_range(self, job_descriptions_table):
        _seed_jd(job_descriptions_table)
        app = _reload_app()

        resp = app.handler(_make_event({"pk": "jd-123", "salary_range": {"min": 100000, "max": 150000}}), None)
        assert resp["statusCode"] == 200

        item = job_descriptions_table.get_item(Key={"pk": "jd-123"})["Item"]
        assert item["salary_range"]["min"] == 100000

    def test_recomputes_skill_names(self, job_descriptions_table):
        _seed_jd(job_descriptions_table)
        app = _reload_app()

        resp = app.handler(
            _make_event({"pk": "jd-123", "required_skills": ["AWS", "Python"], "desired_skills": ["Go"]}), None
        )
        assert resp["statusCode"] == 200

        item = job_descriptions_table.get_item(Key={"pk": "jd-123"})["Item"]
        assert item["skill_names"] == "AWS,Python,Go"

    def test_recomputes_cert_names(self, job_descriptions_table):
        _seed_jd(job_descriptions_table)
        app = _reload_app()

        resp = app.handler(
            _make_event({"pk": "jd-123", "required_certifications": ["PMP"], "desired_certifications": ["CISSP"]}),
            None,
        )
        assert resp["statusCode"] == 200

        item = job_descriptions_table.get_item(Key={"pk": "jd-123"})["Item"]
        assert item["cert_names"] == "PMP,CISSP"

    def test_recomputes_location_state(self, job_descriptions_table):
        _seed_jd(job_descriptions_table)
        app = _reload_app()

        resp = app.handler(_make_event({"pk": "jd-123", "location": {"city": "Baltimore", "state": "MD"}}), None)
        assert resp["statusCode"] == 200

        item = job_descriptions_table.get_item(Key={"pk": "jd-123"})["Item"]
        assert item["location_state"] == "MD"

    def test_ignores_non_editable_fields(self, job_descriptions_table):
        _seed_jd(job_descriptions_table)
        app = _reload_app()

        resp = app.handler(_make_event({"pk": "jd-123", "title": "New", "created_at": "hacked"}), None)
        assert resp["statusCode"] == 200

        item = job_descriptions_table.get_item(Key={"pk": "jd-123"})["Item"]
        assert item["created_at"] == "2025-01-01T00:00:00Z"  # unchanged

    def test_writes_audit_entry(self, all_jd_tables):
        _seed_jd(all_jd_tables["job_descriptions"])
        app = _reload_app()

        resp = app.handler(
            _make_event({"pk": "jd-123", "title": "Audited Update"}, "user@aimory.com", "Test User"), None
        )
        assert resp["statusCode"] == 200

        items = all_jd_tables["audit_log"].query(KeyConditionExpression=Key("pk").eq("jd-123"))["Items"]
        assert len(items) == 1
        assert items[0]["action"] == "UPDATE"
        assert items[0]["document_type"] == "job_description"
        assert items[0]["user_email"] == "user@aimory.com"
        assert "title" in items[0]["changes"]

    def test_null_clearance_valid(self, job_descriptions_table):
        _seed_jd(job_descriptions_table)
        app = _reload_app()

        resp = app.handler(_make_event({"pk": "jd-123", "required_clearance": None}), None)
        assert resp["statusCode"] == 200
