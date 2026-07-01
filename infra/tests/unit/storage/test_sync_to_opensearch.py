"""Tests for sync_to_opensearch Lambda (DynamoDB Streams → OpenSearch)."""

from decimal import Decimal
from unittest.mock import MagicMock, patch

from _lambda_loader import load as _load_lambda


def _reload_app():
    return _load_lambda("modules/storage/lambda_src/sync_to_opensearch")


def _dynamo_string(val):
    return {"S": val}


def _dynamo_number(val):
    return {"N": str(val)}


def _make_insert_record(pk, name="Jane Doe", status="Potential Candidate"):
    return {
        "eventName": "INSERT",
        "dynamodb": {
            "NewImage": {
                "pk": _dynamo_string(pk),
                "name": _dynamo_string(name),
                "status": _dynamo_string(status),
                "skill_names": _dynamo_string("Python,AWS"),
                "cert_names": _dynamo_string("PMP"),
                "years_of_experience": _dynamo_number(10),
                "bill_rate": _dynamo_number(125),
            }
        },
    }


def _make_remove_record(pk):
    return {
        "eventName": "REMOVE",
        "dynamodb": {
            "OldImage": {
                "pk": _dynamo_string(pk),
                "name": _dynamo_string("Jane"),
            }
        },
    }


class TestSyncToOpenSearch:
    def setup_method(self):
        _load_lambda("modules/storage/lambda_src/sync_to_opensearch")

    @patch("app._get_client")
    def test_insert_indexes_document(self, mock_get_client):
        import app

        mc = MagicMock()
        mc.indices.exists.return_value = True
        mock_get_client.return_value = mc

        event = {"Records": [_make_insert_record("b#k1")]}
        result = app.handler(event, None)

        assert result["processed"] == 1
        mc.index.assert_called_once()
        call_args = mc.index.call_args[1]
        assert call_args["id"] == "b#k1"

    @patch("app._get_client")
    def test_modify_upserts_document(self, mock_get_client):
        import app

        mc = MagicMock()
        mc.indices.exists.return_value = True
        mock_get_client.return_value = mc

        record = _make_insert_record("b#k2")
        record["eventName"] = "MODIFY"
        event = {"Records": [record]}
        result = app.handler(event, None)

        assert result["processed"] == 1
        mc.index.assert_called_once()

    @patch("app._get_client")
    def test_remove_deletes_document(self, mock_get_client):
        import app

        mc = MagicMock()
        mc.indices.exists.return_value = True
        mock_get_client.return_value = mc

        event = {"Records": [_make_remove_record("b#k3")]}
        result = app.handler(event, None)

        assert result["processed"] == 1
        mc.delete.assert_called_once_with(index="talent-profiles", id="b#k3")

    @patch("app._get_client")
    def test_skill_names_split_to_list(self, mock_get_client):
        import app

        mc = MagicMock()
        mc.indices.exists.return_value = True
        mock_get_client.return_value = mc

        event = {"Records": [_make_insert_record("b#k4")]}
        app.handler(event, None)

        indexed_body = mc.index.call_args[1]["body"]
        assert isinstance(indexed_body["skill_names"], list)
        assert "Python" in indexed_body["skill_names"]
        assert "AWS" in indexed_body["skill_names"]

    @patch("app._get_client")
    def test_cert_names_split_to_list(self, mock_get_client):
        import app

        mc = MagicMock()
        mc.indices.exists.return_value = True
        mock_get_client.return_value = mc

        event = {"Records": [_make_insert_record("b#k5")]}
        app.handler(event, None)

        indexed_body = mc.index.call_args[1]["body"]
        assert isinstance(indexed_body["cert_names"], list)
        assert "PMP" in indexed_body["cert_names"]

    @patch("app._get_client")
    def test_decimal_converted_to_number(self, mock_get_client):
        import app

        mc = MagicMock()
        mc.indices.exists.return_value = True
        mock_get_client.return_value = mc

        event = {"Records": [_make_insert_record("b#k6")]}
        app.handler(event, None)

        indexed_body = mc.index.call_args[1]["body"]
        assert isinstance(indexed_body["years_of_experience"], (int, float))

    @patch("app._get_client")
    def test_creates_index_if_not_exists(self, mock_get_client):
        import app

        mc = MagicMock()
        mc.indices.exists.return_value = False
        mock_get_client.return_value = mc

        event = {"Records": [_make_insert_record("b#k7")]}
        app.handler(event, None)

        # Both the profile index and the sibling chunk index are created when missing.
        created = {c.kwargs["index"] for c in mc.indices.create.call_args_list}
        assert "talent-profiles" in created
        assert "talent-chunks" in created

    @patch("app._get_client")
    def test_no_records_ok(self, mock_get_client):
        import app

        mc = MagicMock()
        mc.indices.exists.return_value = True
        mock_get_client.return_value = mc

        result = app.handler({"Records": []}, None)
        assert result["processed"] == 0

    @patch("app._get_client")
    def test_remove_delete_failure_silent(self, mock_get_client):
        """Delete errors should not crash the handler."""
        import app

        mc = MagicMock()
        mc.indices.exists.return_value = True
        mc.delete.side_effect = Exception("not found")
        mock_get_client.return_value = mc

        event = {"Records": [_make_remove_record("b#k-missing")]}
        result = app.handler(event, None)
        assert result["processed"] == 1


class TestChunkEmbedding:
    def setup_method(self):
        _load_lambda("modules/storage/lambda_src/sync_to_opensearch")

    def test_chunk_text_overlapping_windows(self):
        app = _reload_app()
        chunks = app._chunk_text("a" * 3000, size=1400, overlap=200)
        assert len(chunks) >= 2
        assert all(len(c) <= 1400 for c in chunks)

    def test_chunk_text_empty(self):
        app = _reload_app()
        assert app._chunk_text("") == []
        assert app._chunk_text(None) == []

    @patch("app._embed", return_value=[0.1] * 512)
    @patch("app._get_client")
    def test_insert_with_resume_embeds_chunks(self, mock_get_client, mock_embed):
        import app

        mc = MagicMock()
        mc.indices.exists.return_value = True
        mock_get_client.return_value = mc

        rec = _make_insert_record("b#rt1")
        rec["dynamodb"]["NewImage"]["resume_text"] = _dynamo_string("x " * 1500)
        app.handler({"Records": [rec]}, None)

        assert mock_embed.called
        assert mc.bulk.called  # chunks bulk-indexed

    @patch("app._embed", return_value=[0.1] * 512)
    @patch("app._get_client")
    def test_modify_without_resume_change_skips_embed(self, mock_get_client, mock_embed):
        import app

        mc = MagicMock()
        mc.indices.exists.return_value = True
        mock_get_client.return_value = mc

        rec = _make_insert_record("b#rt2")
        rec["eventName"] = "MODIFY"
        rec["dynamodb"]["NewImage"]["resume_text"] = _dynamo_string("unchanged text")
        rec["dynamodb"]["OldImage"] = {
            "pk": _dynamo_string("b#rt2"),
            "resume_text": _dynamo_string("unchanged text"),
        }
        app.handler({"Records": [rec]}, None)

        assert not mock_embed.called  # no re-embed when resume_text is unchanged

    @patch("app._get_client")
    def test_remove_deletes_chunks(self, mock_get_client):
        import app

        mc = MagicMock()
        mc.indices.exists.return_value = True
        mock_get_client.return_value = mc

        app.handler({"Records": [_make_remove_record("b#rt3")]}, None)
        assert mc.delete_by_query.called


class TestSyncHelpers:
    def test_deserialize(self):
        app = _reload_app()
        item = app._deserialize({"pk": {"S": "b#k"}, "years": {"N": "10"}})
        assert item["pk"] == "b#k"
        assert item["years"] == Decimal("10")

    def test_convert_decimals_integer(self):
        app = _reload_app()
        result = app._convert_decimals({"val": Decimal("10")})
        assert result["val"] == 10
        assert isinstance(result["val"], int)

    def test_convert_decimals_float(self):
        app = _reload_app()
        result = app._convert_decimals({"val": Decimal("10.5")})
        assert result["val"] == 10.5
        assert isinstance(result["val"], float)

    def test_prepare_document_splits_strings(self):
        app = _reload_app()
        item = {"skill_names": "A,B,C", "cert_names": "X,Y"}
        result = app._prepare_document(item)
        assert result["skill_names"] == ["A", "B", "C"]
        assert result["cert_names"] == ["X", "Y"]

    def test_prepare_document_already_list(self):
        app = _reload_app()
        item = {"skill_names": ["A", "B"]}
        result = app._prepare_document(item)
        assert result["skill_names"] == ["A", "B"]

    def test_prepare_document_splits_industry_to_list(self):
        app = _reload_app()
        item = {"industry_category": "Finance, Healthcare"}
        result = app._prepare_document(item)
        # Display string is preserved; a separate list field powers AND-term filtering.
        assert result["industry_category"] == "Finance, Healthcare"
        assert result["industry_category_list"] == ["Finance", "Healthcare"]

    def test_prepare_document_single_industry_to_list(self):
        app = _reload_app()
        item = {"industry_category": "Finance"}
        result = app._prepare_document(item)
        assert result["industry_category_list"] == ["Finance"]
