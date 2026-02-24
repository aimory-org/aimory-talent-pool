---
title: "Contract Tests: Mock Textract Output Structure"
labels: testing, contract-test, textract, backend
---

## Description

Implement contract tests for AWS Textract integration by mocking various Textract API response scenarios. These tests ensure that Lambda functions (`start_textract`, `check_textract`, `fetch_textract`) correctly handle Textract responses and extract text from scanned documents.

## Why It Matters

- **Textract Reliability**: Textract can fail or return unexpected structures
- **Cost Avoidance**: Real Textract calls are expensive ($1.50 per 1000 pages)
- **Speed**: Mock tests run instantly vs Textract (5-30 seconds per document)
- **Edge Cases**: Test rare scenarios (empty documents, malformed blocks)
- **CI/CD**: Tests can run without AWS credentials
- **Contract Verification**: Ensure we correctly consume Textract API

## Textract API Flow

1. **StartDocumentTextDetection** → Returns `JobId`
2. **GetDocumentTextDetection** (polling) → Returns `JobStatus`
3. **GetDocumentTextDetection** (when SUCCEEDED) → Returns `Blocks`

## Test Scenarios

### start_textract Lambda
- [ ] **Valid S3 location** returns job ID
- [ ] **Missing bucket/key** raises error
- [ ] **Invalid S3 path** raises Textract error
- [ ] **Textract throttling** error is handled
- [ ] **Response structure** matches expected format

### check_textract Lambda
- [ ] **IN_PROGRESS status** - Job still running
- [ ] **SUCCEEDED status** - Job completed successfully
- [ ] **FAILED status** - Job failed (unsupported format, corrupt file)
- [ ] **Invalid job ID** - Textract error
- [ ] **Job not found** - Expired or invalid job ID

### fetch_textract Lambda
- [ ] **Valid blocks** - Extract LINE blocks with text
- [ ] **Empty document** - No text detected
- [ ] **Single page** - Simple resume structure
- [ ] **Multi-page** - 2+ page resume
- [ ] **Multi-column layout** - Complex formatting
- [ ] **Tables and forms** - Ignore non-LINE blocks
- [ ] **Blocks without text** - Filter out empty blocks
- [ ] **Large response** - Pagination (NextToken)

### Block Structure Edge Cases
- [ ] **Missing Text field** in block
- [ ] **Missing BlockType** field
- [ ] **Unexpected block types** (TABLE, CELL, WORD)
- [ ] **Blocks in wrong order**
- [ ] **Special characters** in text
- [ ] **Empty Blocks array**

### Textract API Errors
- [ ] **ThrottlingException** - Rate limit exceeded
- [ ] **InvalidJobIdException** - Job doesn't exist
- [ ] **InvalidS3ObjectException** - File not found
- [ ] **UnsupportedDocumentException** - Invalid file type
- [ ] **ProvisionedThroughputExceededException** - Capacity exceeded
- [ ] **AccessDeniedException** - IAM permission issues

## Acceptance Criteria

- [ ] Test files created:
  - `test_start_textract_contract.py`
  - `test_check_textract_contract.py`
  - `test_fetch_textract_contract.py`
- [ ] Tests mock `boto3.client("textract")`
- [ ] All scenarios listed above have tests
- [ ] Mock responses use realistic Textract API structure
- [ ] Tests verify error handling for all error types
- [ ] Tests verify text extraction from blocks
- [ ] Tests verify pagination handling (NextToken)
- [ ] All tests pass with `pytest`
- [ ] Test coverage for Textract handling is >90%

## Implementation Guidelines

```python
import pytest
from unittest.mock import MagicMock
from botocore.exceptions import ClientError
from start_textract.app import handler as start_handler
from check_textract.app import handler as check_handler
from fetch_textract.app import handler as fetch_handler

# --- start_textract Tests ---

@pytest.fixture
def mock_textract_client(mocker):
    """Mock the Textract client"""
    mock_client = mocker.patch("start_textract.app.textract")
    return mock_client

def test_start_textract_returns_job_id(mock_textract_client):
    """Test successful job start"""
    mock_textract_client.start_document_text_detection.return_value = {
        "JobId": "test-job-123"
    }
    
    event = {
        "bucket": "resumes-bucket",
        "key": "scanned-resume.pdf"
    }
    
    result = start_handler(event, None)
    
    assert result["job_id"] == "test-job-123"
    mock_textract_client.start_document_text_detection.assert_called_once_with(
        DocumentLocation={
            "S3Object": {
                "Bucket": "resumes-bucket",
                "Name": "scanned-resume.pdf"
            }
        }
    )

def test_start_textract_invalid_s3_object(mock_textract_client):
    """Test handling of invalid S3 object"""
    mock_textract_client.start_document_text_detection.side_effect = ClientError(
        {
            "Error": {
                "Code": "InvalidS3ObjectException",
                "Message": "Unable to access S3 object"
            }
        },
        "start_document_text_detection"
    )
    
    event = {"bucket": "resumes-bucket", "key": "nonexistent.pdf"}
    
    with pytest.raises(ClientError):
        start_handler(event, None)

# --- check_textract Tests ---

@pytest.fixture
def mock_check_textract(mocker):
    mock_client = mocker.patch("check_textract.app.textract")
    return mock_client

def test_check_textract_in_progress(mock_check_textract):
    """Test job still in progress"""
    mock_check_textract.get_document_text_detection.return_value = {
        "JobStatus": "IN_PROGRESS"
    }
    
    event = {
        "textract": {"job_id": "test-job-123"}
    }
    
    result = check_handler(event, None)
    
    assert result["status"] == "IN_PROGRESS"

def test_check_textract_succeeded(mock_check_textract):
    """Test job succeeded"""
    mock_check_textract.get_document_text_detection.return_value = {
        "JobStatus": "SUCCEEDED"
    }
    
    event = {
        "textract": {"job_id": "test-job-123"}
    }
    
    result = check_handler(event, None)
    
    assert result["status"] == "SUCCEEDED"

def test_check_textract_failed(mock_check_textract):
    """Test job failed"""
    mock_check_textract.get_document_text_detection.return_value = {
        "JobStatus": "FAILED",
        "StatusMessage": "Unsupported document format"
    }
    
    event = {
        "textract": {"job_id": "test-job-123"}
    }
    
    result = check_handler(event, None)
    
    assert result["status"] == "FAILED"

# --- fetch_textract Tests ---

@pytest.fixture
def mock_fetch_textract(mocker):
    mock_s3 = mocker.patch("fetch_textract.app.s3")
    mock_textract = mocker.patch("fetch_textract.app.textract")
    return mock_s3, mock_textract

def test_fetch_textract_extracts_lines(mock_fetch_textract):
    """Test extracting LINE blocks from Textract"""
    mock_s3, mock_textract = mock_fetch_textract
    
    # Mock Textract response with LINE blocks
    textract_response = {
        "Blocks": [
            {
                "BlockType": "PAGE",
                "Id": "page-1"
            },
            {
                "BlockType": "LINE",
                "Id": "line-1",
                "Text": "John Doe"
            },
            {
                "BlockType": "LINE",
                "Id": "line-2",
                "Text": "Software Engineer"
            },
            {
                "BlockType": "WORD",
                "Id": "word-1",
                "Text": "John"
            }
        ]
    }
    
    import json
    mock_textract.get_document_text_detection.return_value = textract_response
    
    # Mock S3 storage of blocks
    mock_s3.put_object.return_value = {}
    
    # For fetch, we need to mock reading from S3
    event = {
        "textractBlocks": {
            "s3_bucket": "temp-bucket",
            "s3_key": "textract/job-123.json"
        }
    }
    
    # Mock S3 get_object to return stored blocks
    from io import BytesIO
    mock_s3.get_object.return_value = {
        "Body": BytesIO(json.dumps({"blocks": textract_response["Blocks"]}).encode())
    }
    
    # Import and test normalize (which uses fetch_textract output)
    from normalize.app import handler as normalize_handler
    
    result = normalize_handler(event, None)
    
    # Should extract only LINE blocks
    assert "John Doe" in result["text"]
    assert "Software Engineer" in result["text"]
    # WORD blocks should be ignored
    assert result["text"].count("John") == 1  # Only from LINE, not WORD

def test_fetch_textract_empty_document(mock_fetch_textract):
    """Test document with no text"""
    mock_s3, mock_textract = mock_fetch_textract
    
    textract_response = {
        "Blocks": [
            {
                "BlockType": "PAGE",
                "Id": "page-1"
            }
        ]
    }
    
    import json
    event = {
        "textractBlocks": {
            "s3_bucket": "temp-bucket",
            "s3_key": "textract/job-123.json"
        }
    }
    
    mock_s3.get_object.return_value = {
        "Body": BytesIO(json.dumps({"blocks": textract_response["Blocks"]}).encode())
    }
    
    from normalize.app import handler as normalize_handler
    result = normalize_handler(event, None)
    
    # Should handle gracefully with empty/minimal text
    assert result["line_count"] == 0

def test_fetch_textract_with_pagination(mock_fetch_textract):
    """Test handling NextToken for large documents"""
    mock_s3, mock_textract = mock_fetch_textract
    
    # First call returns partial results with NextToken
    first_response = {
        "Blocks": [
            {"BlockType": "LINE", "Id": "1", "Text": "Page 1"}
        ],
        "NextToken": "token-123"
    }
    
    # Second call returns rest of results
    second_response = {
        "Blocks": [
            {"BlockType": "LINE", "Id": "2", "Text": "Page 2"}
        ]
    }
    
    mock_textract.get_document_text_detection.side_effect = [
        first_response,
        second_response
    ]
    
    # Test would need to handle pagination in fetch_textract
    # Current implementation may not handle this - this is a gap to address
```

## Mock Response Fixtures

Create `tests/fixtures/textract_responses.json`:

```json
{
  "simple_resume": {
    "Blocks": [
      {"BlockType": "PAGE", "Id": "page-1"},
      {"BlockType": "LINE", "Id": "1", "Text": "JOHN DOE"},
      {"BlockType": "LINE", "Id": "2", "Text": "Senior Software Engineer"},
      {"BlockType": "LINE", "Id": "3", "Text": "Seattle, WA"}
    ]
  },
  "multi_page": {
    "Blocks": [...]
  },
  "empty_document": {
    "Blocks": [
      {"BlockType": "PAGE", "Id": "page-1"}
    ]
  }
}
```

## Dependencies

- `pytest`
- `pytest-mock`
- `moto` (for S3 mocking)
- `botocore` (for `ClientError`)

## Related Issues

- #[unit-tests-routing-logic] - Classification logic tests
- #[integration-tests] - End-to-end Textract flow
- #[golden-dataset] - Test with real scanned resumes
