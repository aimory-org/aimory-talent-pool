---
title: "Unit Tests: Idempotency Logic"
labels: testing, backend, lambda, unit-test, idempotency
---

## Description

Implement unit tests to ensure the AIMORY pipeline handles duplicate resume processing idempotently. When the same resume is processed multiple times (e.g., due to Step Functions retries or manual re-runs), the system should produce consistent results without duplicate database entries.

## Why It Matters

- **Data Integrity**: Prevent duplicate profiles in DynamoDB
- **Retry Safety**: Step Functions may retry failed tasks
- **Cost Efficiency**: Avoid re-processing already completed work
- **Consistency**: Same input should always produce same output
- **Debugging**: Make pipeline behavior predictable

## Test Scenarios

### Database Persistence (persist Lambda)
- [ ] **First insertion** creates new profile with timestamp
- [ ] **Second insertion** (same bucket/key) updates existing profile
- [ ] **PK (partition key)** is deterministic: `{bucket}#{key}`
- [ ] **updated_at** timestamp changes on re-processing
- [ ] **Profile data** is completely replaced (not merged)

### S3 Event Handling
- [ ] **Same S3 object** triggers same Step Functions execution
- [ ] **Execution ID** generation is deterministic or handled by Step Functions
- [ ] **Multiple events** for same object don't cause race conditions

### Textract Job Handling
- [ ] **Textract job** for same document can be called multiple times
- [ ] **Results caching** (if implemented) works correctly
- [ ] **Job status polling** handles already-completed jobs

### LLM Extraction
- [ ] **Same resume text** produces deterministic prompts
- [ ] **LLM responses** may vary (non-deterministic), but should be valid
- [ ] **Re-extraction** overwrites previous results

## Acceptance Criteria

- [ ] Test file `test_idempotency.py` created
- [ ] Tests verify DynamoDB updates (not duplicates) on re-processing
- [ ] Tests verify PK generation is deterministic
- [ ] Tests verify `put_item` overwrites existing items
- [ ] Tests simulate Step Functions retries
- [ ] Mock DynamoDB with `moto` to verify behavior
- [ ] All tests pass with `pytest`
- [ ] Document idempotency guarantees in README

## Implementation Guidelines

```python
import pytest
from moto import mock_dynamodb
import boto3
from datetime import datetime, timezone
from persist.app import handler

@pytest.fixture
def dynamodb_table():
    with mock_dynamodb():
        dynamodb = boto3.resource("dynamodb", region_name="us-east-1")
        
        table = dynamodb.create_table(
            TableName="test-talent-profiles",
            KeySchema=[{"AttributeName": "pk", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "pk", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST"
        )
        
        yield table

def test_first_insertion_creates_item(dynamodb_table, monkeypatch):
    monkeypatch.setenv("TALENT_PROFILES_TABLE", "test-talent-profiles")
    
    event = {
        "bucket": "resumes-bucket",
        "key": "john-doe-resume.pdf",
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
            "skillsets": [],
            "years_of_experience": 5,
            "companies": [],
            "location": {"city": "Seattle", "state": "WA"},
            "rates": {
                "amount": 100,
                "unit": "hour",
                "currency": "USD",
                "evidence": []
            }
        }
    }
    
    result = handler(event, None)
    
    assert result["status"] == "ok"
    assert result["pk"] == "resumes-bucket#john-doe-resume.pdf"
    
    # Verify item was created
    response = dynamodb_table.get_item(Key={"pk": result["pk"]})
    assert "Item" in response
    assert response["Item"]["name"] == "John Doe"

def test_second_insertion_updates_item(dynamodb_table, monkeypatch):
    monkeypatch.setenv("TALENT_PROFILES_TABLE", "test-talent-profiles")
    
    base_event = {
        "bucket": "resumes-bucket",
        "key": "john-doe-resume.pdf",
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
            "skillsets": [],
            "years_of_experience": 5,
            "companies": [],
            "location": {"city": "Seattle", "state": "WA"},
            "rates": {
                "amount": 100,
                "unit": "hour",
                "currency": "USD",
                "evidence": []
            }
        }
    }
    
    # First insertion
    result1 = handler(base_event, None)
    timestamp1 = result1["updated_at"]
    
    # Wait a moment (in real test, use time.sleep or mock time)
    import time
    time.sleep(0.1)
    
    # Second insertion with updated data
    updated_event = base_event.copy()
    updated_event["extracted"]["summary"] = "Senior Software Engineer"
    updated_event["extracted"]["years_of_experience"] = 7
    
    result2 = handler(updated_event, None)
    timestamp2 = result2["updated_at"]
    
    # Verify PK is the same
    assert result1["pk"] == result2["pk"]
    
    # Verify timestamp updated
    assert timestamp2 > timestamp1
    
    # Verify only one item exists in table
    response = dynamodb_table.scan()
    assert response["Count"] == 1
    
    # Verify data was updated
    item = response["Items"][0]
    assert item["summary"] == "Senior Software Engineer"
    assert item["years_of_experience"] == 7

def test_pk_generation_is_deterministic():
    from persist.app import handler
    
    # Same bucket/key should always generate same PK
    event1 = {
        "bucket": "my-bucket",
        "key": "resume.pdf",
        "extracted": {...}  # minimal valid profile
    }
    
    pk = f"{event1['bucket']}#{event1['key']}"
    assert pk == "my-bucket#resume.pdf"

def test_concurrent_updates_last_write_wins(dynamodb_table, monkeypatch):
    # Simulate two concurrent Step Functions executions
    # Both should complete, last write wins
    # This is DynamoDB's default behavior with put_item
    
    monkeypatch.setenv("TALENT_PROFILES_TABLE", "test-talent-profiles")
    
    base_event = {...}  # minimal valid event
    
    # Execution 1
    event1 = base_event.copy()
    event1["extracted"]["summary"] = "Version 1"
    handler(event1, None)
    
    # Execution 2 (concurrent/overlapping)
    event2 = base_event.copy()
    event2["extracted"]["summary"] = "Version 2"
    handler(event2, None)
    
    # Verify only one item exists
    response = dynamodb_table.scan()
    assert response["Count"] == 1
    
    # Last write should be Version 2
    assert response["Items"][0]["summary"] == "Version 2"
```

## Additional Considerations

### Conditional Writes (Optional Enhancement)
If true idempotency is needed (prevent overwrites), consider:
```python
# Add version or condition check
table.put_item(
    Item=item,
    ConditionExpression="attribute_not_exists(pk) OR version = :v",
    ExpressionAttributeValues={":v": current_version}
)
```

### Deduplication in Step Functions
- Use Step Functions execution names based on S3 object version
- Prevent duplicate executions for same object

## Related Issues

- #[integration-tests] - End-to-end idempotency testing
- #[unit-tests-input-validation] - Validation before persistence
