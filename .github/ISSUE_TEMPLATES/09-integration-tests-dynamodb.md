---
title: "Integration Tests: Lambda + DynamoDB Local"
labels: testing, integration-test, dynamodb, backend, lambda
---

## Description

Implement integration tests that run Lambda functions against DynamoDB Local, validating end-to-end data persistence and retrieval workflows without requiring actual AWS infrastructure.

## Why It Matters

- **Local Development**: Test database interactions without AWS account
- **Fast Feedback**: DynamoDB Local runs in milliseconds vs seconds for real DynamoDB
- **Cost Savings**: No AWS charges for integration testing
- **CI/CD**: Tests run in GitHub Actions without AWS credentials
- **Realistic Testing**: Tests actual boto3 interactions, not just mocks

## Test Scenarios

### persist Lambda Integration
- [ ] **Create new profile** - First insertion creates DynamoDB item
- [ ] **Update existing profile** - Re-processing updates item
- [ ] **Verify PK structure** - `bucket#key` format is correct
- [ ] **Verify timestamp** - `updated_at` is set correctly
- [ ] **Verify data transformation** - Float to Decimal conversion
- [ ] **Query by PK** - Retrieve profile by partition key
- [ ] **Verify all fields persisted** - No data loss

### DynamoDB Table Schema
- [ ] **Table creation** - Create table with correct schema
- [ ] **Partition key** - `pk` (String) is configured
- [ ] **GSI (if any)** - Global secondary indexes work
- [ ] **Billing mode** - On-demand or provisioned throughput

### Data Type Handling
- [ ] **Decimal conversion** - Floats converted to Decimal for DynamoDB
- [ ] **Null values** - Null fields are stored correctly
- [ ] **Empty arrays** - Empty arrays are persisted
- [ ] **Nested objects** - Complex nested structures work
- [ ] **Unicode data** - International characters persist correctly

### Edge Cases
- [ ] **Large profile** - Profile with many skillsets/companies
- [ ] **Concurrent updates** - Multiple simultaneous writes
- [ ] **Invalid data** - Validation catches errors before write
- [ ] **Missing fields** - Required fields enforced

## Acceptance Criteria

- [ ] Test file `test_dynamodb_integration.py` created
- [ ] Tests use DynamoDB Local (via Docker or Java JAR)
- [ ] Test setup creates temporary table
- [ ] Test teardown cleans up resources
- [ ] Tests verify actual DynamoDB operations (not mocked)
- [ ] Tests cover all persist Lambda scenarios
- [ ] All tests pass with `pytest`
- [ ] Documentation added for running DynamoDB Local
- [ ] CI/CD pipeline configured to run DynamoDB Local

## Implementation Guidelines

```python
import pytest
import boto3
from decimal import Decimal
import os

# DynamoDB Local endpoint
DYNAMODB_ENDPOINT = "http://localhost:8000"

@pytest.fixture(scope="session")
def dynamodb_local():
    """Fixture to ensure DynamoDB Local is running"""
    # Could start DynamoDB Local here via subprocess
    # For now, assume it's already running
    yield
    # Cleanup after all tests

@pytest.fixture
def dynamodb_table(dynamodb_local):
    """Create a temporary DynamoDB table for testing"""
    dynamodb = boto3.resource(
        "dynamodb",
        endpoint_url=DYNAMODB_ENDPOINT,
        region_name="us-east-1",
        aws_access_key_id="dummy",
        aws_secret_access_key="dummy"
    )
    
    table_name = "test-talent-profiles"
    
    # Create table
    table = dynamodb.create_table(
        TableName=table_name,
        KeySchema=[
            {"AttributeName": "pk", "KeyType": "HASH"}
        ],
        AttributeDefinitions=[
            {"AttributeName": "pk", "AttributeType": "S"}
        ],
        BillingMode="PAY_PER_REQUEST"
    )
    
    # Wait for table to be created
    table.wait_until_exists()
    
    yield table
    
    # Cleanup
    table.delete()

@pytest.fixture
def persist_handler(dynamodb_table, monkeypatch):
    """Setup persist Lambda handler with test environment"""
    monkeypatch.setenv("TALENT_PROFILES_TABLE", dynamodb_table.name)
    monkeypatch.setenv("AWS_ENDPOINT_URL", DYNAMODB_ENDPOINT)
    
    # Patch boto3 to use local endpoint
    import persist.app
    persist.app.dynamodb = boto3.resource(
        "dynamodb",
        endpoint_url=DYNAMODB_ENDPOINT,
        region_name="us-east-1",
        aws_access_key_id="dummy",
        aws_secret_access_key="dummy"
    )
    persist.app.table = persist.app.dynamodb.Table(dynamodb_table.name)
    
    from persist.app import handler
    return handler

def test_persist_creates_new_profile(persist_handler, dynamodb_table):
    """Test creating a new profile in DynamoDB"""
    event = {
        "bucket": "test-bucket",
        "key": "john-doe.pdf",
        "extracted": {
            "name": "John Doe",
            "contact": {
                "email": "john@example.com",
                "phone": "1234567890",
                "linkedin": None,
                "github": None
            },
            "summary": "Software Engineer",
            "talent_category": "IT Resources",
            "skillsets": [
                {
                    "name": "Python",
                    "evidence": ["5 years experience"]
                }
            ],
            "years_of_experience": 5,
            "companies": [
                {
                    "name": "Tech Corp",
                    "evidence": ["Worked 2019-2024"]
                }
            ],
            "location": {
                "city": "Seattle",
                "state": "WA"
            },
            "rates": {
                "amount": 150,
                "unit": "hour",
                "currency": "USD",
                "evidence": ["$150/hr"]
            }
        }
    }
    
    # Execute handler
    result = persist_handler(event, None)
    
    # Verify response
    assert result["status"] == "ok"
    assert result["pk"] == "test-bucket#john-doe.pdf"
    assert "updated_at" in result
    
    # Verify item in DynamoDB
    response = dynamodb_table.get_item(Key={"pk": result["pk"]})
    assert "Item" in response
    
    item = response["Item"]
    assert item["name"] == "John Doe"
    assert item["contact"]["email"] == "john@example.com"
    assert item["talent_category"] == "IT Resources"
    assert len(item["skillsets"]) == 1
    assert item["years_of_experience"] == Decimal("5")
    assert item["rates"]["amount"] == Decimal("150")

def test_persist_updates_existing_profile(persist_handler, dynamodb_table):
    """Test updating an existing profile"""
    base_event = {
        "bucket": "test-bucket",
        "key": "jane-doe.pdf",
        "extracted": {
            "name": "Jane Doe",
            "contact": {
                "email": "jane@example.com",
                "phone": "9876543210",
                "linkedin": None,
                "github": None
            },
            "summary": "Data Scientist",
            "talent_category": "IT Resources",
            "skillsets": [],
            "years_of_experience": 3,
            "companies": [],
            "location": {"city": "Austin", "state": "TX"},
            "rates": {
                "amount": 120,
                "unit": "hour",
                "currency": "USD",
                "evidence": []
            }
        }
    }
    
    # First insertion
    result1 = persist_handler(base_event, None)
    timestamp1 = result1["updated_at"]
    
    # Update with new data
    import time
    time.sleep(0.1)
    
    updated_event = base_event.copy()
    updated_event["extracted"] = updated_event["extracted"].copy()
    updated_event["extracted"]["summary"] = "Senior Data Scientist"
    updated_event["extracted"]["years_of_experience"] = 5
    
    result2 = persist_handler(updated_event, None)
    timestamp2 = result2["updated_at"]
    
    # Verify same PK
    assert result1["pk"] == result2["pk"]
    
    # Verify timestamp updated
    assert timestamp2 > timestamp1
    
    # Verify only one item in table
    response = dynamodb_table.scan()
    assert response["Count"] == 1
    
    # Verify data was updated
    item = response["Items"][0]
    assert item["summary"] == "Senior Data Scientist"
    assert item["years_of_experience"] == Decimal("5")

def test_decimal_conversion(persist_handler, dynamodb_table):
    """Test that float values are converted to Decimal for DynamoDB"""
    event = {
        "bucket": "test-bucket",
        "key": "test.pdf",
        "extracted": {
            "name": "Test User",
            "contact": {
                "email": "test@example.com",
                "phone": "1234567890",
                "linkedin": None,
                "github": None
            },
            "summary": "Test",
            "talent_category": "IT Resources",
            "skillsets": [],
            "years_of_experience": 7.5,  # Float
            "companies": [],
            "location": {"city": "NYC", "state": "NY"},
            "rates": {
                "amount": 175.50,  # Float
                "unit": "hour",
                "currency": "USD",
                "evidence": []
            }
        }
    }
    
    result = persist_handler(event, None)
    
    # Retrieve and verify Decimal conversion
    response = dynamodb_table.get_item(Key={"pk": result["pk"]})
    item = response["Item"]
    
    # DynamoDB stores numbers as Decimal
    assert isinstance(item["years_of_experience"], Decimal)
    assert item["years_of_experience"] == Decimal("7.5")
    assert isinstance(item["rates"]["amount"], Decimal)
    assert item["rates"]["amount"] == Decimal("175.50")

def test_unicode_data_persistence(persist_handler, dynamodb_table):
    """Test that Unicode characters persist correctly"""
    event = {
        "bucket": "test-bucket",
        "key": "unicode.pdf",
        "extracted": {
            "name": "José García",  # Unicode characters
            "contact": {
                "email": "josé@example.com",
                "phone": "1234567890",
                "linkedin": None,
                "github": None
            },
            "summary": "Engineer with résumé",
            "talent_category": "IT Resources",
            "skillsets": [
                {
                    "name": "Python",
                    "evidence": ["Pythonを使用"]  # Japanese
                }
            ],
            "years_of_experience": 5,
            "companies": [],
            "location": {"city": "São Paulo", "state": "SP"},
            "rates": {
                "amount": 100,
                "unit": "hour",
                "currency": "USD",
                "evidence": []
            }
        }
    }
    
    result = persist_handler(event, None)
    
    # Retrieve and verify Unicode
    response = dynamodb_table.get_item(Key={"pk": result["pk"]})
    item = response["Item"]
    
    assert item["name"] == "José García"
    assert item["summary"] == "Engineer with résumé"
    assert item["location"]["city"] == "São Paulo"
```

## Setup Instructions

### Running DynamoDB Local

**Option 1: Docker**
```bash
docker run -p 8000:8000 amazon/dynamodb-local
```

**Option 2: Java JAR**
```bash
java -Djava.library.path=./DynamoDBLocal_lib -jar DynamoDBLocal.jar -sharedDb
```

### pytest.ini Configuration
```ini
[pytest]
markers =
    integration: marks tests as integration tests (deselect with '-m "not integration"')
    
# Run integration tests
# pytest -m integration
```

## CI/CD Configuration

Add to GitHub Actions workflow:

```yaml
jobs:
  integration-tests:
    runs-on: ubuntu-latest
    services:
      dynamodb-local:
        image: amazon/dynamodb-local
        ports:
          - 8000:8000
    
    steps:
      - uses: actions/checkout@v4
      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      
      - name: Install dependencies
        run: pip install -r requirements-test.txt
      
      - name: Run integration tests
        run: pytest tests/integration/ -v
```

## Dependencies

- `pytest`
- `boto3`
- `moto` (alternative to DynamoDB Local)

## Related Issues

- #[unit-tests-idempotency] - Idempotency validation
- #[integration-tests-s3] - S3 integration tests
- #[integration-tests-step-functions] - Full pipeline tests
