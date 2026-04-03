"""
Shared test fixtures for Lambda function tests.
Provides mocked AWS services via moto: DynamoDB tables, S3 buckets, env vars.

Key design note: Many Lambda modules create boto3 clients/resources at module
level (e.g. ``dynamodb = boto3.resource("dynamodb")``).  To ensure those
module-level objects talk to moto's fake backend, the ``mock_aws`` context
manager must be started *before* the Lambda module is first imported.  Each
test file that exercises a Lambda therefore does:

    1. Use the ``aws_mocks`` fixture (starts ``mock_aws``).
    2. Import / reload the Lambda ``app`` module inside the test (or inside a
       fixture) so that module-level boto3 calls hit the moto backend.

The fixtures here focus on creating the mocked DynamoDB tables, S3 buckets,
and convenience data.  ``aws_mocks`` is the entry-point fixture every test
should depend on.
"""

import json
import os
import sys
import importlib
import pytest
import boto3
from moto import mock_aws
from decimal import Decimal

# ---------------------------------------------------------------------------
# Add Lambda source directories to sys.path so ``import app`` works.
# ---------------------------------------------------------------------------
_INFRA_ROOT = os.path.join(os.path.dirname(__file__), "../..")

_LAMBDA_DIRS = [
    "modules/api/lambda_src/get_talent",
    "modules/api/lambda_src/list_talents",
    "modules/api/lambda_src/update_talent",
    "modules/api/lambda_src/delete_talent",
    "modules/api/lambda_src/get_lookups",
    "modules/api/lambda_src/get_resume_url",
    "modules/pipeline/lambda_src/starter",
    "modules/pipeline/lambda_src/classify",
    "modules/pipeline/lambda_src/start_textract",
    "modules/pipeline/lambda_src/check_textract",
    "modules/pipeline/lambda_src/fetch_textract",
    "modules/pipeline/lambda_src/normalize",
    "modules/pipeline/lambda_src/llm_extract",
    "modules/pipeline/lambda_src/persist",
    "modules/pipeline/lambda_src/presign",
    "modules/storage/lambda_src/sync_to_opensearch",
    "modules/jobs/lambda_src/stale_checker",
]

# Add the unit tests directory itself so _lambda_loader is importable from subfolders.
_UNIT_DIR = os.path.dirname(__file__)
if _UNIT_DIR not in sys.path:
    sys.path.insert(0, _UNIT_DIR)

for d in _LAMBDA_DIRS:
    full = os.path.join(_INFRA_ROOT, d)
    if full not in sys.path:
        sys.path.insert(0, full)


# ---------------------------------------------------------------------------
# Environment variables — set BEFORE any Lambda module is imported
# ---------------------------------------------------------------------------
@pytest.fixture(autouse=True)
def _aws_env(monkeypatch):
    """Set environment variables expected by all Lambdas."""
    env = {
        "AWS_DEFAULT_REGION": "us-east-1",
        "AWS_REGION": "us-east-1",
        "AWS_ACCESS_KEY_ID": "testing",
        "AWS_SECRET_ACCESS_KEY": "testing",
        "AWS_SECURITY_TOKEN": "testing",
        "AWS_SESSION_TOKEN": "testing",
        "TALENT_PROFILES_TABLE": "talent-profiles",
        "SKILLS_LOOKUP_TABLE": "skills-lookup",
        "CERTIFICATIONS_LOOKUP_TABLE": "certifications-lookup",
        "CITIES_LOOKUP_TABLE": "cities-lookup",
        "RESUME_BUCKET": "test-resume-bucket",
        "OPENSEARCH_ENDPOINT": "search-test.us-east-1.es.amazonaws.com",
        "SFN_ARN_PARAM": "/test/sfn-arn",
        "RAW_PREFIX": "raw/",
        "OUT_BUCKET": "test-output-bucket",
        "OUT_PREFIX": "extracted/",
        "MODEL_ID": "anthropic.claude-3-sonnet-20240229-v1:0",
        "PRESIGN_API_KEY": "test-api-key-1234567890abcdef",
        "RESUME_PREFIX": "raw/onedrive",
        "MIN_PDF_TEXT_CHARS": "1000",
        "STALE_DAYS": "90",
    }
    for k, v in env.items():
        monkeypatch.setenv(k, v)


# ---------------------------------------------------------------------------
# Core mock — every test that touches AWS should use this.
# ---------------------------------------------------------------------------
@pytest.fixture
def aws_mocks():
    """Start moto mock_aws and yield.  All boto3 clients created while this
    fixture is active will talk to the fake backend."""
    with mock_aws():
        yield


# ---------------------------------------------------------------------------
# Helper: (re-)import a Lambda module inside the moto context.
# ---------------------------------------------------------------------------
def _reload_lambda(module_name: str):
    """Import or reload a Lambda ``app`` module so its module-level boto3
    resources point to the moto backend.  Returns the module object."""
    if module_name in sys.modules:
        return importlib.reload(sys.modules[module_name])
    return importlib.import_module(module_name)


# ---------------------------------------------------------------------------
# DynamoDB tables
# ---------------------------------------------------------------------------
def _create_talent_profiles_table():
    ddb = boto3.resource("dynamodb", region_name="us-east-1")
    table = ddb.create_table(
        TableName="talent-profiles",
        KeySchema=[{"AttributeName": "pk", "KeyType": "HASH"}],
        AttributeDefinitions=[
            {"AttributeName": "pk", "AttributeType": "S"},
            {"AttributeName": "status", "AttributeType": "S"},
            {"AttributeName": "date_received", "AttributeType": "S"},
            {"AttributeName": "talent_bucket", "AttributeType": "S"},
            {"AttributeName": "talent_category", "AttributeType": "S"},
            {"AttributeName": "clearance_level", "AttributeType": "S"},
            {"AttributeName": "location_state", "AttributeType": "S"},
            {"AttributeName": "name_lower", "AttributeType": "S"},
        ],
        GlobalSecondaryIndexes=[
            {
                "IndexName": "status-date-index",
                "KeySchema": [
                    {"AttributeName": "status", "KeyType": "HASH"},
                    {"AttributeName": "date_received", "KeyType": "RANGE"},
                ],
                "Projection": {"ProjectionType": "ALL"},
            },
            {
                "IndexName": "bucket-index",
                "KeySchema": [{"AttributeName": "talent_bucket", "KeyType": "HASH"}],
                "Projection": {"ProjectionType": "ALL"},
            },
            {
                "IndexName": "category-index",
                "KeySchema": [{"AttributeName": "talent_category", "KeyType": "HASH"}],
                "Projection": {"ProjectionType": "ALL"},
            },
            {
                "IndexName": "clearance-index",
                "KeySchema": [{"AttributeName": "clearance_level", "KeyType": "HASH"}],
                "Projection": {"ProjectionType": "ALL"},
            },
            {
                "IndexName": "state-index",
                "KeySchema": [{"AttributeName": "location_state", "KeyType": "HASH"}],
                "Projection": {"ProjectionType": "ALL"},
            },
            {
                "IndexName": "name-index",
                "KeySchema": [{"AttributeName": "name_lower", "KeyType": "HASH"}],
                "Projection": {"ProjectionType": "ALL"},
            },
        ],
        BillingMode="PAY_PER_REQUEST",
    )
    table.meta.client.get_waiter("table_exists").wait(TableName="talent-profiles")
    return table


def _create_skills_lookup_table():
    ddb = boto3.resource("dynamodb", region_name="us-east-1")
    table = ddb.create_table(
        TableName="skills-lookup",
        KeySchema=[{"AttributeName": "skill", "KeyType": "HASH"}],
        AttributeDefinitions=[{"AttributeName": "skill", "AttributeType": "S"}],
        BillingMode="PAY_PER_REQUEST",
    )
    table.meta.client.get_waiter("table_exists").wait(TableName="skills-lookup")
    return table


def _create_certifications_lookup_table():
    ddb = boto3.resource("dynamodb", region_name="us-east-1")
    table = ddb.create_table(
        TableName="certifications-lookup",
        KeySchema=[{"AttributeName": "certification", "KeyType": "HASH"}],
        AttributeDefinitions=[{"AttributeName": "certification", "AttributeType": "S"}],
        BillingMode="PAY_PER_REQUEST",
    )
    table.meta.client.get_waiter("table_exists").wait(TableName="certifications-lookup")
    return table


def _create_cities_lookup_table():
    ddb = boto3.resource("dynamodb", region_name="us-east-1")
    table = ddb.create_table(
        TableName="cities-lookup",
        KeySchema=[
            {"AttributeName": "city", "KeyType": "HASH"},
            {"AttributeName": "state", "KeyType": "RANGE"},
        ],
        AttributeDefinitions=[
            {"AttributeName": "city", "AttributeType": "S"},
            {"AttributeName": "state", "AttributeType": "S"},
        ],
        BillingMode="PAY_PER_REQUEST",
    )
    table.meta.client.get_waiter("table_exists").wait(TableName="cities-lookup")
    return table


@pytest.fixture
def talent_profiles_table(aws_mocks):
    return _create_talent_profiles_table()


@pytest.fixture
def skills_lookup_table(aws_mocks):
    return _create_skills_lookup_table()


@pytest.fixture
def certifications_lookup_table(aws_mocks):
    return _create_certifications_lookup_table()


@pytest.fixture
def cities_lookup_table(aws_mocks):
    return _create_cities_lookup_table()


@pytest.fixture
def all_tables(aws_mocks):
    """Create all four DynamoDB tables inside one moto context."""
    return {
        "talent_profiles": _create_talent_profiles_table(),
        "skills_lookup": _create_skills_lookup_table(),
        "certifications_lookup": _create_certifications_lookup_table(),
        "cities_lookup": _create_cities_lookup_table(),
    }


# ---------------------------------------------------------------------------
# S3
# ---------------------------------------------------------------------------
@pytest.fixture
def s3_buckets(aws_mocks):
    """Create the test S3 buckets.  Returns the s3 client."""
    client = boto3.client("s3", region_name="us-east-1")
    client.create_bucket(Bucket="test-resume-bucket")
    client.create_bucket(Bucket="test-output-bucket")
    return client


# ---------------------------------------------------------------------------
# Sample talent profile data
# ---------------------------------------------------------------------------
@pytest.fixture
def sample_profile():
    """A complete, valid talent profile as LLM extract would produce."""
    return {
        "is_resume": True,
        "name": "Jane Doe",
        "contact": {
            "email": "jane.doe@example.com",
            "phone": "5551234567",
            "linkedin": "linkedin.com/in/janedoe",
            "github": "github.com/janedoe",
        },
        "summary": "Senior software engineer with 10 years of experience in cloud architecture.",
        "talent_bucket": "IT Resources",
        "talent_category": "Developer",
        "skillsets": [
            {"name": "Python", "evidence": ["Built ETL pipelines"]},
            {"name": "AWS", "evidence": ["Managed EC2 fleet"]},
        ],
        "years_of_experience": 10,
        "clearance_level": "Secret",
        "certifications": ["AWS Solutions Architect", "PMP"],
        "companies": [
            {"name": "Acme Corp", "evidence": ["Senior Developer"]},
            {"name": "Tech Inc", "evidence": ["Lead Architect"]},
        ],
        "location": {"city": "Herndon", "state": "Virginia"},
        "bill_rate": 125.0,
    }


@pytest.fixture
def sample_dynamodb_item():
    """A talent profile as stored in DynamoDB (with pk, Decimal values, etc.)."""
    return {
        "pk": "test-resume-bucket#raw/onedrive/jane_doe.pdf",
        "bucket": "test-resume-bucket",
        "key": "raw/onedrive/jane_doe.pdf",
        "name": "Jane Doe",
        "name_lower": "jane doe",
        "contact": {
            "email": "jane.doe@example.com",
            "phone": "(555) 123-4567",
            "linkedin": "linkedin.com/in/janedoe",
            "github": "github.com/janedoe",
        },
        "summary": "Senior software engineer with 10 years of experience.",
        "talent_bucket": "IT Resources",
        "talent_category": "Developer",
        "skillsets": [
            {"name": "Python", "evidence": ["Built ETL pipelines"]},
            {"name": "AWS", "evidence": ["Managed EC2 fleet"]},
        ],
        "skill_names": "Python,AWS",
        "years_of_experience": Decimal("10"),
        "clearance_level": "Secret",
        "certifications": ["AWS Solutions Architect", "PMP"],
        "cert_names": "AWS Solutions Architect,PMP",
        "companies": [
            {"name": "Acme Corp", "evidence": ["Senior Developer"]},
        ],
        "location": {"city": "Herndon", "state": "VA"},
        "location_state": "VA",
        "bill_rate": Decimal("125"),
        "status": "Potential Candidate",
        "date_received": "2025-01-15",
        "updated_at": "2025-01-15T12:00:00+00:00",
    }
