"""Post-deployment infrastructure health checks (DynamoDB/S3)."""

import os

import boto3
import pytest

pytestmark = pytest.mark.integration

REGION = os.environ.get("AWS_REGION", "us-east-1")
RESUME_BUCKET = os.environ.get("RESUME_BUCKET", "")
TALENT_TABLE = os.environ.get("TALENT_PROFILES_TABLE", "")


class TestDynamoDBHealth:
    def _ddb(self):
        return boto3.resource("dynamodb", region_name=REGION)

    def test_talent_profiles_table_accessible(self):
        if not TALENT_TABLE:
            pytest.skip("TALENT_PROFILES_TABLE not set")
        ddb = self._ddb()
        table = ddb.Table(TALENT_TABLE)
        resp = table.scan(Limit=1)
        assert "Items" in resp

    def test_skills_lookup_accessible(self):
        table_name = os.environ.get("SKILLS_LOOKUP_TABLE", "")
        if not table_name:
            pytest.skip("SKILLS_LOOKUP_TABLE not set")
        ddb = self._ddb()
        table = ddb.Table(table_name)
        resp = table.scan(Limit=1)
        assert "Items" in resp


class TestS3Health:
    def test_resume_bucket_accessible(self):
        if not RESUME_BUCKET:
            pytest.skip("RESUME_BUCKET not set")
        s3 = boto3.client("s3", region_name=REGION)
        resp = s3.list_objects_v2(Bucket=RESUME_BUCKET, MaxKeys=1)
        assert "ResponseMetadata" in resp
