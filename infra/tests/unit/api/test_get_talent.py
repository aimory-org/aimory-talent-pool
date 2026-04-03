"""Tests for get_talent Lambda."""

import json
from decimal import Decimal

import pytest

from _lambda_loader import load as _load_lambda


class TestGetTalentHandler:
    def _reload(self, _fixture):
        return _load_lambda("modules/api/lambda_src/get_talent")

    def test_returns_talent_by_pk(self, talent_profiles_table, sample_dynamodb_item):
        talent_profiles_table.put_item(Item=sample_dynamodb_item)
        app = self._reload(talent_profiles_table)

        resp = app.handler({"pathParameters": {"pk": sample_dynamodb_item["pk"]}}, None)
        assert resp["statusCode"] == 200
        body = json.loads(resp["body"])
        assert body["name"] == "Jane Doe"

    def test_decimal_serialization(self, talent_profiles_table):
        talent_profiles_table.put_item(
            Item={
                "pk": "b#k",
                "name": "X",
                "years_of_experience": Decimal("10"),
                "bill_rate": Decimal("99.5"),
            }
        )
        app = self._reload(talent_profiles_table)

        resp = app.handler({"pathParameters": {"pk": "b#k"}}, None)
        body = json.loads(resp["body"])
        assert body["years_of_experience"] == 10
        assert body["bill_rate"] == 99.5

    def test_url_decodes_pk(self, talent_profiles_table):
        talent_profiles_table.put_item(Item={"pk": "bucket#raw/file.pdf", "name": "Y"})
        app = self._reload(talent_profiles_table)

        resp = app.handler({"pathParameters": {"pk": "bucket%23raw%2Ffile.pdf"}}, None)
        assert resp["statusCode"] == 200

    def test_missing_pk_returns_400(self, talent_profiles_table):
        app = self._reload(talent_profiles_table)
        resp = app.handler({"pathParameters": {}}, None)
        assert resp["statusCode"] == 400

    def test_not_found_returns_404(self, talent_profiles_table):
        app = self._reload(talent_profiles_table)
        resp = app.handler({"pathParameters": {"pk": "no-exist"}}, None)
        assert resp["statusCode"] == 404
