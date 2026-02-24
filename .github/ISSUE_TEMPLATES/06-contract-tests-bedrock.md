---
title: "Contract Tests: Mock Bedrock Responses"
labels: testing, contract-test, bedrock, llm, backend
---

## Description

Implement contract tests for Amazon Bedrock (Claude) integration by mocking various LLM response scenarios. These tests ensure the `llm_extract` Lambda handles all possible Bedrock responses correctly, including edge cases and failures.

## Why It Matters

- **LLM Reliability**: LLMs are non-deterministic and can fail in unexpected ways
- **Cost Avoidance**: Testing with real Bedrock calls is expensive
- **Speed**: Mock tests run instantly vs real API calls (1-5 seconds)
- **Edge Cases**: Can test rare failure modes (malformed JSON, hallucinations)
- **CI/CD**: Tests can run in CI without AWS credentials
- **Contract Verification**: Ensure we correctly consume Bedrock API

## Test Scenarios

### Valid Responses
- [ ] **Perfect JSON** - Well-formed profile matching schema exactly
- [ ] **Minimal profile** - Only required fields populated
- [ ] **Complete profile** - All fields populated with valid data
- [ ] **Profile with null fields** - Optional fields set to `null`
- [ ] **Multiple skillsets/companies** - Arrays with multiple items

### Malformed JSON Responses
- [ ] **JSON with markdown fences** - ` ```json {...} ``` `
- [ ] **JSON with code block language tag** - ` ```json\n{...}\n``` `
- [ ] **Trailing commas** - `{"name": "John",}` (invalid JSON)
- [ ] **Single quotes** - `{'name': 'John'}` (invalid JSON)
- [ ] **Missing closing brace** - `{"name": "John"`
- [ ] **Empty response** - LLM returns empty string
- [ ] **Non-JSON text** - LLM returns prose instead of JSON

### Hallucinated/Invalid Fields
- [ ] **Extra fields** - LLM adds fields not in schema (e.g., `age`, `hobbies`)
- [ ] **Wrong enum values** - `talent_category: "Engineering"` (not in enum)
- [ ] **Wrong types** - `years_of_experience: "five"` (string instead of number)
- [ ] **Missing required fields** - LLM omits `contact` or `name`
- [ ] **Invalid nested structure** - `contact` as string instead of object

### Edge Case Content
- [ ] **Very long text** - Resume with >10,000 characters
- [ ] **Special characters** - Unicode, emojis, accented characters
- [ ] **HTML/XML in resume** - Extracted text contains markup
- [ ] **Multiple languages** - Resume in English + another language

### Bedrock API Errors
- [ ] **ThrottlingException** - Rate limit exceeded
- [ ] **ModelNotReadyException** - Model is loading
- [ ] **ValidationException** - Invalid request parameters
- [ ] **ServiceUnavailableException** - Bedrock service down
- [ ] **AccessDeniedException** - IAM permission issues
- [ ] **Empty content blocks** - Response has no text blocks

## Acceptance Criteria

- [ ] Test file `test_bedrock_contract.py` created
- [ ] Tests mock `boto3.client("bedrock-runtime")`
- [ ] Tests use `pytest-mock` or `unittest.mock`
- [ ] All response scenarios listed above have tests
- [ ] Tests verify error handling and appropriate exceptions
- [ ] Tests verify JSON parsing logic handles malformed responses
- [ ] Tests verify field stripping (removing markdown fences)
- [ ] Mock responses use realistic Bedrock API structure
- [ ] All tests pass with `pytest`
- [ ] Test coverage for LLM response handling is >95%

## Implementation Guidelines

```python
import pytest
from unittest.mock import MagicMock
from botocore.exceptions import ClientError
from llm_extract.app import handler

@pytest.fixture
def mock_bedrock_client(mocker):
    """Mock the Bedrock client"""
    mock_client = mocker.patch("llm_extract.app.client")
    return mock_client

def test_valid_json_response(mock_bedrock_client):
    """Test handling of perfect JSON response"""
    valid_profile = {
        "name": "Jane Doe",
        "contact": {
            "email": "jane@example.com",
            "phone": "5551234567",
            "linkedin": "linkedin.com/in/janedoe",
            "github": None
        },
        "summary": "Python developer with 3 years experience",
        "talent_category": "IT Resources",
        "skillsets": [
            {"name": "Python", "evidence": ["3 years Python"]}
        ],
        "years_of_experience": 3,
        "companies": [
            {"name": "Tech Corp", "evidence": ["Worked at Tech Corp"]}
        ],
        "location": {"city": "Austin", "state": "TX"},
        "rates": {
            "amount": 120,
            "unit": "hour",
            "currency": "USD",
            "evidence": ["$120/hr"]
        }
    }
    
    import json
    mock_bedrock_client.converse.return_value = {
        "output": {
            "message": {
                "content": [
                    {"text": json.dumps(valid_profile)}
                ]
            }
        }
    }
    
    event = {"normalized": {"text": "Resume text here"}}
    result = handler(event, None)
    
    assert result["name"] == "Jane Doe"
    assert result["contact"]["email"] == "jane@example.com"
    assert len(result["skillsets"]) == 1

def test_json_with_markdown_fences(mock_bedrock_client):
    """Test LLM response with markdown code fences"""
    json_content = '{"name": "John Smith", "contact": {...}}'
    markdown_response = f'```json\n{json_content}\n```'
    
    mock_bedrock_client.converse.return_value = {
        "output": {
            "message": {
                "content": [{"text": markdown_response}]
            }
        }
    }
    
    event = {"normalized": {"text": "Resume"}}
    result = handler(event, None)
    
    # Should successfully parse despite markdown fences
    assert "name" in result

def test_malformed_json_raises_error(mock_bedrock_client):
    """Test that malformed JSON raises appropriate error"""
    mock_bedrock_client.converse.return_value = {
        "output": {
            "message": {
                "content": [
                    {"text": "{invalid json without closing brace"}
                ]
            }
        }
    }
    
    event = {"normalized": {"text": "Resume"}}
    
    with pytest.raises(RuntimeError, match="not valid JSON"):
        handler(event, None)

def test_empty_response_raises_error(mock_bedrock_client):
    """Test that empty LLM response raises error"""
    mock_bedrock_client.converse.return_value = {
        "output": {
            "message": {
                "content": [{"text": ""}]
            }
        }
    }
    
    event = {"normalized": {"text": "Resume"}}
    
    with pytest.raises(RuntimeError):
        handler(event, None)

def test_no_text_content_raises_error(mock_bedrock_client):
    """Test response with no text blocks"""
    mock_bedrock_client.converse.return_value = {
        "output": {
            "message": {
                "content": []  # No content blocks
            }
        }
    }
    
    event = {"normalized": {"text": "Resume"}}
    
    with pytest.raises(RuntimeError, match="No text content"):
        handler(event, None)

def test_bedrock_throttling_exception(mock_bedrock_client):
    """Test handling of Bedrock throttling"""
    mock_bedrock_client.converse.side_effect = ClientError(
        {"Error": {"Code": "ThrottlingException", "Message": "Rate exceeded"}},
        "converse"
    )
    
    event = {"normalized": {"text": "Resume"}}
    
    with pytest.raises(RuntimeError, match="Bedrock converse failed"):
        handler(event, None)

def test_bedrock_model_not_ready(mock_bedrock_client):
    """Test handling of model not ready error"""
    mock_bedrock_client.converse.side_effect = ClientError(
        {"Error": {"Code": "ModelNotReadyException", "Message": "Model loading"}},
        "converse"
    )
    
    event = {"normalized": {"text": "Resume"}}
    
    with pytest.raises(RuntimeError):
        handler(event, None)

def test_unicode_in_resume(mock_bedrock_client):
    """Test resume with Unicode characters"""
    profile_with_unicode = {
        "name": "José García",
        "contact": {...},
        # ... rest of valid profile
    }
    
    import json
    mock_bedrock_client.converse.return_value = {
        "output": {
            "message": {
                "content": [{"text": json.dumps(profile_with_unicode)}]
            }
        }
    }
    
    event = {"normalized": {"text": "Résumé with ñ and ü"}}
    result = handler(event, None)
    
    assert result["name"] == "José García"
```

## Mock Response Examples

Store realistic mock responses in `tests/fixtures/bedrock_responses.json`:

```json
{
  "valid_complete": {...},
  "valid_minimal": {...},
  "with_markdown_fences": "```json\n{...}\n```",
  "malformed_json": "{incomplete",
  "wrong_enum": {"talent_category": "Engineering"},
  "missing_required": {"name": "John"}
}
```

## Dependencies

- `pytest`
- `pytest-mock`
- `botocore` (for `ClientError`)

## Related Issues

- #[unit-tests-json-validation] - Schema validation tests
- #[unit-tests-prompt-builder] - Prompt construction tests
- #[integration-tests] - End-to-end Bedrock testing
