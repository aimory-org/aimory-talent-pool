---
title: "Unit Tests: Lambda Handler Input Validation"
labels: testing, backend, lambda, unit-test
---

## Description

Implement comprehensive unit tests for input validation logic across all Lambda handlers in the AIMORY resume ingestion pipeline. Each Lambda function should validate its inputs and handle malformed or missing data gracefully.

## Why It Matters

- **Fail Fast**: Catch invalid inputs early before expensive operations (Textract, Bedrock calls)
- **Clear Error Messages**: Help debugging by identifying exactly what went wrong
- **Cost Savings**: Prevent wasted AWS service calls on invalid data
- **Reliability**: Ensure the pipeline handles edge cases and malformed Step Functions payloads

## Lambda Handlers to Test

1. **classify** (`infra/modules/lambdas/lambda_src/classify/app.py`)
   - Missing `bucket` or `key` fields
   - Unsupported file extensions
   - Empty/null values

2. **start_textract** (`infra/modules/lambdas/lambda_src/start_textract/app.py`)
   - Missing bucket/key
   - Invalid S3 paths

3. **check_textract** (`infra/modules/lambdas/lambda_src/check_textract/app.py`)
   - Missing job_id
   - Invalid job_id format

4. **fetch_textract** (`infra/modules/lambdas/lambda_src/fetch_textract/app.py`)
   - Missing textract results
   - Empty blocks

5. **normalize** (`infra/modules/lambdas/lambda_src/normalize/app.py`)
   - Missing `prep.direct_text` when `skip_textract=True`
   - Missing `textractBlocks` when Textract path is used

6. **llm_extract** (`infra/modules/lambdas/lambda_src/llm_extract/app.py`)
   - Missing `normalized.text`
   - Empty text input

7. **persist** (`infra/modules/lambdas/lambda_src/persist/app.py`)
   - Missing `extracted` profile
   - Missing `bucket` or `key`
   - Invalid profile structure

## Acceptance Criteria

- [ ] Each Lambda handler has a dedicated test file (e.g., `test_classify.py`)
- [ ] Tests validate required fields are present
- [ ] Tests validate field types (string, dict, list, etc.)
- [ ] Tests verify appropriate error messages for each validation failure
- [ ] Tests ensure handlers raise `ValueError` or appropriate exceptions
- [ ] All tests pass locally with `pytest`
- [ ] Test coverage for validation logic is >90%

## Implementation Guidelines

```python
# Example test structure
import pytest
from classify.app import handler

def test_missing_bucket_raises_error():
    event = {"key": "resume.pdf"}
    with pytest.raises(KeyError):
        handler(event, None)

def test_missing_key_raises_error():
    event = {"bucket": "my-bucket"}
    with pytest.raises(KeyError):
        handler(event, None)

def test_unsupported_extension_raises_error():
    event = {"bucket": "my-bucket", "key": "file.txt"}
    with pytest.raises(ValueError, match="Unsupported file type"):
        handler(event, None)
```

## Dependencies

- `pytest` for test framework
- `pytest-mock` for mocking AWS services
- `moto` for mocking boto3 (S3, DynamoDB, Textract)

## Related Issues

- #[contract-tests] - Mock Bedrock and Textract responses
- #[integration-tests] - End-to-end Lambda testing
