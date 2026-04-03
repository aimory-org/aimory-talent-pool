"""Tests for stale_checker Lambda."""

from datetime import datetime, timedelta, timezone

import pytest
from _lambda_loader import load as _load_lambda


def _reload_app():
    return _load_lambda("modules/jobs/lambda_src/stale_checker")


def _date_days_ago(days):
    return (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")


class TestStaleCheckerHandler:
    def test_missing_table_env_raises(self, aws_mocks, monkeypatch):
        monkeypatch.setenv("TALENT_PROFILES_TABLE", "")
        app = _reload_app()
        with pytest.raises(ValueError, match="TALENT_PROFILES_TABLE"):
            app.handler({}, None)

    def test_marks_old_potential_candidates_stale(self, talent_profiles_table):
        talent_profiles_table.put_item(
            Item={
                "pk": "b#old",
                "name": "Old Candidate",
                "status": "Potential Candidate",
                "date_received": _date_days_ago(100),  # 100 days ago > 90 threshold
            }
        )
        talent_profiles_table.put_item(
            Item={
                "pk": "b#recent",
                "name": "Recent Candidate",
                "status": "Potential Candidate",
                "date_received": _date_days_ago(10),  # recent
            }
        )
        app = _reload_app()
        result = app.handler({}, None)

        assert result["status"] == "ok"
        assert result["updated_count"] == 1

        old_item = talent_profiles_table.get_item(Key={"pk": "b#old"})["Item"]
        assert old_item["status"] == "Stale Candidate"

        recent_item = talent_profiles_table.get_item(Key={"pk": "b#recent"})["Item"]
        assert recent_item["status"] == "Potential Candidate"

    def test_does_not_change_active_candidate(self, talent_profiles_table):
        talent_profiles_table.put_item(
            Item={
                "pk": "b#active",
                "name": "Active",
                "status": "Active Candidate",
                "date_received": _date_days_ago(100),
            }
        )
        app = _reload_app()
        result = app.handler({}, None)

        assert result["updated_count"] == 0
        item = talent_profiles_table.get_item(Key={"pk": "b#active"})["Item"]
        assert item["status"] == "Active Candidate"

    def test_does_not_change_placed_candidate(self, talent_profiles_table):
        talent_profiles_table.put_item(
            Item={
                "pk": "b#placed",
                "name": "Placed",
                "status": "Placed Candidate",
                "date_received": _date_days_ago(200),
            }
        )
        app = _reload_app()
        result = app.handler({}, None)
        assert result["updated_count"] == 0

    def test_returns_cutoff_date(self, talent_profiles_table):
        app = _reload_app()
        result = app.handler({}, None)
        assert "cutoff_date" in result
        assert result["stale_days"] == 90

    def test_empty_table_ok(self, talent_profiles_table):
        app = _reload_app()
        result = app.handler({}, None)
        assert result["updated_count"] == 0
        assert result["stale_candidates"] == []

    def test_returns_at_most_10_candidates_in_response(self, talent_profiles_table):
        for i in range(15):
            talent_profiles_table.put_item(
                Item={
                    "pk": f"b#k{i}",
                    "name": f"Candidate {i}",
                    "status": "Potential Candidate",
                    "date_received": _date_days_ago(100),
                }
            )
        app = _reload_app()
        result = app.handler({}, None)
        assert result["updated_count"] == 15
        assert len(result["stale_candidates"]) <= 10

    def test_respects_custom_stale_days(self, talent_profiles_table, monkeypatch):
        monkeypatch.setenv("STALE_DAYS", "30")
        talent_profiles_table.put_item(
            Item={
                "pk": "b#k50",
                "name": "Cand",
                "status": "Potential Candidate",
                "date_received": _date_days_ago(45),  # > 30 days
            }
        )
        app = _reload_app()
        result = app.handler({}, None)
        assert result["updated_count"] == 1
        assert result["stale_days"] == 30
