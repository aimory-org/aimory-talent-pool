"""Tests for get_audit_history Lambda."""

import json

from _lambda_loader import load as _load_lambda


def _reload_app():
    return _load_lambda("modules/api/lambda_src/get_audit_history")


def _make_event(pk=None):
    params = {"pk": pk} if pk else {}
    return {"queryStringParameters": params}


def _put_entry(table, pk, sk, action, user_email, **kwargs):
    item = {
        "pk": pk,
        "sk": sk,
        "action": action,
        "timestamp": sk.split("#")[0],
        "user_email": user_email,
        **kwargs,
    }
    table.put_item(Item=item)
    return item


class TestGetAuditHistoryValidation:
    def test_missing_pk_returns_400(self, audit_log_table):
        app = _reload_app()
        resp = app.handler({"queryStringParameters": {}}, None)
        assert resp["statusCode"] == 400
        assert "pk" in json.loads(resp["body"])["error"].lower()

    def test_empty_pk_returns_400(self, audit_log_table):
        app = _reload_app()
        resp = app.handler({"queryStringParameters": {"pk": ""}}, None)
        assert resp["statusCode"] == 400

    def test_no_query_params_returns_400(self, audit_log_table):
        app = _reload_app()
        resp = app.handler({"queryStringParameters": None}, None)
        assert resp["statusCode"] == 400

    def test_invalid_limit_returns_400(self, audit_log_table):
        app = _reload_app()
        resp = app.handler(
            {"queryStringParameters": {"scope": "global", "limit": "0"}},
            None,
        )
        assert resp["statusCode"] == 400
        assert "limit" in json.loads(resp["body"])["error"].lower()


class TestGetAuditHistorySuccess:
    def test_returns_empty_list_for_unknown_pk(self, audit_log_table):
        app = _reload_app()
        resp = app.handler(_make_event("bucket#unknown.pdf"), None)
        assert resp["statusCode"] == 200
        body = json.loads(resp["body"])
        assert body["items"] == []

    def test_returns_entries_for_known_pk(self, audit_log_table):
        pk = "bucket1#resume1.pdf"
        _put_entry(
            audit_log_table,
            pk,
            "2026-04-14T12:00:00Z#STATUS_CHANGE",
            "STATUS_CHANGE",
            "recruiter@aimory.com",
            user_name="Sarah Chen",
            changes={"status": {"old": "Potential Candidate", "new": "Active Candidate"}},
        )
        _put_entry(
            audit_log_table,
            pk,
            "2026-04-13T09:00:00Z#CREATE",
            "CREATE",
            "pipeline@system",
        )

        app = _reload_app()
        resp = app.handler(_make_event(pk), None)
        assert resp["statusCode"] == 200

        body = json.loads(resp["body"])
        assert len(body["items"]) == 2

    def test_entries_sorted_newest_first(self, audit_log_table):
        pk = "bucket1#resume1.pdf"
        _put_entry(audit_log_table, pk, "2026-04-13T09:00:00Z#CREATE", "CREATE", "pipeline@system")
        _put_entry(audit_log_table, pk, "2026-04-14T12:00:00Z#UPDATE", "UPDATE", "r@a.com")
        _put_entry(audit_log_table, pk, "2026-04-12T08:00:00Z#CREATE", "CREATE", "pipeline@system")

        app = _reload_app()
        resp = app.handler(_make_event(pk), None)
        body = json.loads(resp["body"])

        timestamps = [item["timestamp"] for item in body["items"]]
        assert timestamps == sorted(timestamps, reverse=True)

    def test_does_not_return_entries_for_other_pk(self, audit_log_table):
        _put_entry(audit_log_table, "bucket1#a.pdf", "2026-04-14T10:00:00Z#UPDATE", "UPDATE", "r@a.com")
        _put_entry(audit_log_table, "bucket2#b.pdf", "2026-04-14T11:00:00Z#UPDATE", "UPDATE", "r@a.com")

        app = _reload_app()
        resp = app.handler(_make_event("bucket1#a.pdf"), None)
        body = json.loads(resp["body"])

        assert len(body["items"]) == 1
        assert body["items"][0]["pk"] == "bucket1#a.pdf"

    def test_response_contains_all_fields(self, audit_log_table):
        pk = "bucket1#resume1.pdf"
        _put_entry(
            audit_log_table,
            pk,
            "2026-04-14T12:00:00Z#UPDATE",
            "UPDATE",
            "r@aimory.com",
            user_name="James",
            changes={"job_title": {"old": "Developer", "new": "Senior Developer"}},
        )

        app = _reload_app()
        resp = app.handler(_make_event(pk), None)
        body = json.loads(resp["body"])

        entry = body["items"][0]
        assert entry["pk"] == pk
        assert "sk" in entry
        assert entry["action"] == "UPDATE"
        assert entry["user_email"] == "r@aimory.com"
        assert entry["user_name"] == "James"
        assert "changes" in entry
        assert entry["changes"]["job_title"]["new"] == "Senior Developer"

    def test_returns_correct_content_type(self, audit_log_table):
        app = _reload_app()
        resp = app.handler(_make_event("bucket#file.pdf"), None)
        assert resp["headers"]["Content-Type"] == "application/json"

    def test_pk_with_special_chars(self, audit_log_table):
        """pk contains # and slashes — must be handled correctly."""
        pk = "raw/onedrive#resume with spaces.pdf"
        _put_entry(audit_log_table, pk, "2026-04-14T10:00:00Z#CREATE", "CREATE", "pipeline@system")

        app = _reload_app()
        resp = app.handler(_make_event(pk), None)
        body = json.loads(resp["body"])
        assert len(body["items"]) == 1


class TestGetAuditHistoryGlobalScope:
    def test_global_scope_returns_items_across_multiple_profiles(self, audit_log_table):
        _put_entry(
            audit_log_table,
            "bucket1#a.pdf",
            "2026-04-14T10:00:00Z#CREATE",
            "CREATE",
            "pipeline@system",
        )
        _put_entry(
            audit_log_table,
            "bucket2#b.pdf",
            "2026-04-14T11:00:00Z#UPDATE",
            "UPDATE",
            "recruiter@aimory.com",
        )

        app = _reload_app()
        resp = app.handler(
            {"queryStringParameters": {"scope": "global"}},
            None,
        )
        assert resp["statusCode"] == 200

        items = json.loads(resp["body"])["items"]
        assert len(items) == 2
        assert items[0]["pk"] == "bucket2#b.pdf"
        assert items[1]["pk"] == "bucket1#a.pdf"

    def test_global_scope_limit_is_applied(self, audit_log_table):
        _put_entry(
            audit_log_table,
            "bucket1#a.pdf",
            "2026-04-14T10:00:00Z#CREATE",
            "CREATE",
            "pipeline@system",
        )
        _put_entry(
            audit_log_table,
            "bucket2#b.pdf",
            "2026-04-14T11:00:00Z#UPDATE",
            "UPDATE",
            "recruiter@aimory.com",
        )

        app = _reload_app()
        resp = app.handler(
            {"queryStringParameters": {"scope": "global", "limit": "1"}},
            None,
        )
        assert resp["statusCode"] == 200

        items = json.loads(resp["body"])["items"]
        assert len(items) == 1
        assert items[0]["pk"] == "bucket2#b.pdf"
