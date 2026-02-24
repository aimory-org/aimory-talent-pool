---
title: "Integration Tests: Failure Path Simulation"
labels: testing, integration-test, error-handling, step-functions, backend
---

## Description

Implement integration tests that validate error handling and failure recovery mechanisms across the AIMORY pipeline. These tests ensure the system gracefully handles errors, provides meaningful error messages, and follows correct failure paths in the Step Functions state machine.

## Why It Matters

- **Resilience**: Ensure system handles failures gracefully
- **Error Messages**: Provide clear, actionable error information
- **Cost Control**: Prevent runaway costs from retries
- **Debugging**: Failure modes are predictable and well-understood
- **Production Readiness**: Confidence in error scenarios

## Test Scenarios

### Lambda Failure Scenarios

#### classify Lambda Failures
- [ ] **Invalid file extension** - Upload .txt, .jpg, unsupported format
- [ ] **Corrupted PDF** - Malformed PDF that can't be parsed
- [ ] **Empty file** - 0-byte resume upload
- [ ] **S3 access denied** - IAM permissions issue
- [ ] **S3 object not found** - Key doesn't exist
- [ ] **Out of memory** - Extremely large file (>500MB)

#### start_textract Lambda Failures
- [ ] **Textract throttling** - Rate limit exceeded
- [ ] **Invalid S3 path** - Bucket/key doesn't exist
- [ ] **Unsupported format** - File type Textract can't process
- [ ] **S3 bucket in wrong region** - Cross-region access issue

#### check_textract Lambda Failures
- [ ] **Invalid job ID** - Non-existent Textract job
- [ ] **Job expired** - Job ID older than 7 days
- [ ] **Textract job failed** - Document failed OCR
- [ ] **Throttling on status check** - Too many API calls

#### fetch_textract Lambda Failures
- [ ] **No blocks returned** - Empty Textract result
- [ ] **Malformed blocks JSON** - Corrupted response
- [ ] **S3 write failure** - Can't store blocks to temp bucket

#### normalize Lambda Failures
- [ ] **Missing textractBlocks** when Textract path used
- [ ] **Missing direct_text** when skip_textract=True
- [ ] **Empty text** - No extractable text from resume
- [ ] **S3 read failure** - Can't retrieve Textract blocks

#### llm_extract Lambda Failures
- [ ] **Missing MODEL_ID** - Environment variable not set
- [ ] **Bedrock throttling** - Rate limit exceeded
- [ ] **Model not available** - Model loading or unavailable
- [ ] **Invalid prompt** - Prompt exceeds token limit
- [ ] **Malformed JSON response** - LLM returns invalid JSON
- [ ] **Empty response** - LLM returns no content
- [ ] **Hallucinated fields** - LLM adds fields not in schema
- [ ] **Access denied** - IAM permissions for Bedrock

#### persist Lambda Failures
- [ ] **Missing extracted profile** - LLM didn't return data
- [ ] **Invalid profile structure** - Schema validation fails
- [ ] **Missing required fields** - Incomplete profile
- [ ] **DynamoDB write failure** - Capacity exceeded
- [ ] **DynamoDB access denied** - IAM permissions issue
- [ ] **Invalid data types** - Type conversion errors

### Step Functions Failure Paths

#### Textract Polling Timeout
- [ ] **Job stuck IN_PROGRESS** - Exceeds max retries
- [ ] **Never reaches SUCCEEDED** - Infinite loop detection
- [ ] **Step Functions timeout** - 600 second limit

#### State Transition Failures
- [ ] **Lambda timeout** - Function exceeds configured timeout
- [ ] **Lambda out of memory** - Function OOM error
- [ ] **Lambda exception** - Unhandled runtime error
- [ ] **ResultPath issues** - Incorrect data merging

#### FailWorkflow State
- [ ] **Textract FAILED status** - Routes to FailWorkflow
- [ ] **Error message captured** - Cause/Error fields populated
- [ ] **Execution marked failed** - Step Functions execution fails

## Acceptance Criteria

- [ ] Test file `test_failure_paths.py` created
- [ ] Tests cover all Lambda failure scenarios
- [ ] Tests verify appropriate error types raised
- [ ] Tests verify error messages are meaningful
- [ ] Tests verify Step Functions routes to failure states
- [ ] Tests verify retries where configured (CheckTextract polling)
- [ ] Tests verify timeouts are enforced
- [ ] Tests verify no resource leaks on failures
- [ ] All tests pass with `pytest`
- [ ] Documentation of failure modes created

## Implementation Guidelines

```python
import pytest
from botocore.exceptions import ClientError
from unittest.mock import MagicMock

# --- classify Failures ---

def test_classify_invalid_file_extension():
    """Test handling of unsupported file type"""
    from classify.app import handler
    
    event = {
        "bucket": "test-bucket",
        "key": "resume.txt"
    }
    
    with pytest.raises(ValueError, match="Unsupported file type"):
        handler(event, None)

def test_classify_s3_object_not_found(mocker):
    """Test handling of missing S3 object"""
    mock_s3 = mocker.patch("classify.app.s3")
    mock_s3.get_object.side_effect = ClientError(
        {"Error": {"Code": "NoSuchKey", "Message": "Key not found"}},
        "GetObject"
    )
    
    from classify.app import handler
    
    event = {
        "bucket": "test-bucket",
        "key": "nonexistent.pdf"
    }
    
    with pytest.raises(ClientError, match="NoSuchKey"):
        handler(event, None)

def test_classify_corrupted_pdf(mocker):
    """Test handling of corrupted PDF"""
    mock_s3 = mocker.patch("classify.app.s3")
    mock_s3.get_object.return_value = {
        "Body": mocker.MagicMock(read=lambda: b"not a valid PDF")
    }
    
    from classify.app import handler
    
    event = {
        "bucket": "test-bucket",
        "key": "corrupted.pdf"
    }
    
    # Should raise error when trying to extract text
    with pytest.raises(Exception):
        handler(event, None)

# --- Textract Failures ---

def test_start_textract_throttling(mocker):
    """Test Textract throttling error"""
    mock_textract = mocker.patch("start_textract.app.textract")
    mock_textract.start_document_text_detection.side_effect = ClientError(
        {"Error": {"Code": "ThrottlingException", "Message": "Rate exceeded"}},
        "start_document_text_detection"
    )
    
    from start_textract.app import handler
    
    event = {
        "bucket": "test-bucket",
        "key": "resume.pdf"
    }
    
    with pytest.raises(ClientError, match="ThrottlingException"):
        handler(event, None)

def test_check_textract_failed_job(mocker):
    """Test handling of failed Textract job"""
    mock_textract = mocker.patch("check_textract.app.textract")
    mock_textract.get_document_text_detection.return_value = {
        "JobStatus": "FAILED",
        "StatusMessage": "Unsupported document format"
    }
    
    from check_textract.app import handler
    
    event = {
        "textract": {"job_id": "failed-job-123"}
    }
    
    result = handler(event, None)
    
    assert result["status"] == "FAILED"
    # Step Functions should route to FailWorkflow state

def test_check_textract_invalid_job_id(mocker):
    """Test handling of invalid Textract job ID"""
    mock_textract = mocker.patch("check_textract.app.textract")
    mock_textract.get_document_text_detection.side_effect = ClientError(
        {"Error": {"Code": "InvalidJobIdException", "Message": "Job not found"}},
        "get_document_text_detection"
    )
    
    from check_textract.app import handler
    
    event = {
        "textract": {"job_id": "invalid-job-id"}
    }
    
    with pytest.raises(ClientError, match="InvalidJobIdException"):
        handler(event, None)

# --- LLM Extract Failures ---

def test_llm_extract_missing_model_id(monkeypatch):
    """Test handling of missing MODEL_ID env var"""
    monkeypatch.delenv("MODEL_ID", raising=False)
    
    from llm_extract.app import handler
    
    event = {
        "normalized": {"text": "Resume text"}
    }
    
    with pytest.raises(ValueError, match="MODEL_ID env var is required"):
        handler(event, None)

def test_llm_extract_bedrock_throttling(mocker, monkeypatch):
    """Test Bedrock throttling error"""
    monkeypatch.setenv("MODEL_ID", "test-model")
    
    mock_bedrock = mocker.patch("llm_extract.app.client")
    mock_bedrock.converse.side_effect = ClientError(
        {"Error": {"Code": "ThrottlingException", "Message": "Rate exceeded"}},
        "converse"
    )
    
    from llm_extract.app import handler
    
    event = {
        "normalized": {"text": "Resume text"}
    }
    
    with pytest.raises(RuntimeError, match="Bedrock converse failed"):
        handler(event, None)

def test_llm_extract_malformed_json(mocker, monkeypatch):
    """Test handling of malformed JSON from LLM"""
    monkeypatch.setenv("MODEL_ID", "test-model")
    
    mock_bedrock = mocker.patch("llm_extract.app.client")
    mock_bedrock.converse.return_value = {
        "output": {
            "message": {
                "content": [
                    {"text": "{invalid json without closing"}
                ]
            }
        }
    }
    
    from llm_extract.app import handler
    
    event = {
        "normalized": {"text": "Resume text"}
    }
    
    with pytest.raises(RuntimeError, match="not valid JSON"):
        handler(event, None)

def test_llm_extract_empty_response(mocker, monkeypatch):
    """Test handling of empty LLM response"""
    monkeypatch.setenv("MODEL_ID", "test-model")
    
    mock_bedrock = mocker.patch("llm_extract.app.client")
    mock_bedrock.converse.return_value = {
        "output": {
            "message": {
                "content": []  # No content blocks
            }
        }
    }
    
    from llm_extract.app import handler
    
    event = {
        "normalized": {"text": "Resume text"}
    }
    
    with pytest.raises(RuntimeError, match="No text content"):
        handler(event, None)

# --- persist Failures ---

def test_persist_missing_extracted_profile():
    """Test handling of missing extracted profile"""
    from persist.app import handler
    
    event = {
        "bucket": "test-bucket",
        "key": "resume.pdf"
        # Missing "extracted" field
    }
    
    with pytest.raises(ValueError, match="Missing extracted profile"):
        handler(event, None)

def test_persist_invalid_profile_structure():
    """Test validation of invalid profile"""
    from persist.app import handler
    
    event = {
        "bucket": "test-bucket",
        "key": "resume.pdf",
        "extracted": {
            "name": "John Doe"
            # Missing required fields
        }
    }
    
    with pytest.raises(ValueError, match="missing required keys"):
        handler(event, None)

def test_persist_invalid_talent_category():
    """Test rejection of invalid enum value"""
    from persist.app import handler
    
    event = {
        "bucket": "test-bucket",
        "key": "resume.pdf",
        "extracted": {
            "name": "John Doe",
            "contact": {
                "email": "john@example.com",
                "phone": "1234567890",
                "linkedin": None,
                "github": None
            },
            "summary": "Engineer",
            "talent_category": "Engineering",  # Invalid enum
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
    
    with pytest.raises(ValueError, match="talent_category invalid"):
        handler(event, None)

def test_persist_dynamodb_access_denied(mocker, monkeypatch):
    """Test DynamoDB access denied error"""
    monkeypatch.setenv("TALENT_PROFILES_TABLE", "test-table")
    
    mock_table = mocker.MagicMock()
    mock_table.put_item.side_effect = ClientError(
        {"Error": {"Code": "AccessDeniedException", "Message": "Not authorized"}},
        "PutItem"
    )
    
    mocker.patch("persist.app.table", mock_table)
    
    from persist.app import handler
    
    event = {
        "bucket": "test-bucket",
        "key": "resume.pdf",
        "extracted": {
            # Valid profile
            "name": "John Doe",
            "contact": {
                "email": "john@example.com",
                "phone": "1234567890",
                "linkedin": None,
                "github": None
            },
            "summary": "Engineer",
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
    
    with pytest.raises(ClientError, match="AccessDeniedException"):
        handler(event, None)

# --- Step Functions Failure Path Tests ---

def test_step_functions_textract_failure_route():
    """Test that FAILED Textract job routes to FailWorkflow"""
    import json
    
    with open("infra/modules/step_functions/state_machine.asl.json") as f:
        state_machine = json.load(f)
    
    # Check TextractStatusChoice state
    status_choice = state_machine["States"]["TextractStatusChoice"]
    
    # Find FAILED choice
    failed_choice = next(
        c for c in status_choice["Choices"]
        if c.get("StringEquals") == "FAILED"
    )
    
    assert failed_choice["Next"] == "FailWorkflow"

def test_step_functions_fail_workflow_state():
    """Test FailWorkflow state configuration"""
    import json
    
    with open("infra/modules/step_functions/state_machine.asl.json") as f:
        state_machine = json.load(f)
    
    fail_state = state_machine["States"]["FailWorkflow"]
    
    assert fail_state["Type"] == "Fail"
    assert "Error" in fail_state
    assert "Cause" in fail_state

def test_step_functions_timeout():
    """Test state machine has timeout configured"""
    import json
    
    with open("infra/modules/step_functions/state_machine.asl.json") as f:
        state_machine = json.load(f)
    
    assert "TimeoutSeconds" in state_machine
    assert state_machine["TimeoutSeconds"] == 600  # 10 minutes
```

## Error Logging and Monitoring

Add tests for:
- [ ] CloudWatch Logs capture errors
- [ ] Error messages include context (bucket, key, job_id)
- [ ] Stack traces available for debugging
- [ ] Metrics emitted for failures (optional)

## Dependencies

- `pytest`
- `pytest-mock`
- `botocore` (for ClientError)

## Related Issues

- #[integration-tests-step-functions] - Happy path tests
- #[unit-tests-input-validation] - Input validation
- #[unit-tests-json-validation] - Schema validation
