---
title: "Unit Tests: JSON Schema Validation for LLM Output"
labels: testing, backend, lambda, unit-test, validation
---

## Description

Implement comprehensive unit tests for JSON schema validation logic that ensures LLM output from Bedrock conforms to the expected `TalentProfile` schema. This includes testing both the `llm_extract` Lambda (which parses LLM output) and the `persist` Lambda (which validates before database insertion).

## Why It Matters

- **Data Quality**: Prevent malformed profiles from entering the database
- **LLM Reliability**: LLMs can hallucinate fields or return invalid JSON
- **Type Safety**: Ensure all fields have correct types (string, number, array, etc.)
- **Business Rules**: Validate enums, min/max lengths, required fields
- **Error Handling**: Gracefully handle and report validation failures

## Test Scenarios

### Valid Profiles
- [ ] **Complete profile** with all required fields
- [ ] **Profile with null optional fields** (e.g., `name: null`)
- [ ] **Profile with empty arrays** (e.g., `skillsets: []`)
- [ ] **Minimal valid profile** (only required fields)

### Invalid Profiles - Missing Fields
- [ ] Missing `name`
- [ ] Missing `contact`
- [ ] Missing `contact.email`
- [ ] Missing `skillsets`
- [ ] Missing `talent_category`

### Invalid Profiles - Wrong Types
- [ ] `name` as number instead of string
- [ ] `contact` as string instead of object
- [ ] `skillsets` as object instead of array
- [ ] `years_of_experience` as string instead of number
- [ ] `rates.amount` as string instead of number

### Invalid Profiles - Constraint Violations
- [ ] `name` with empty string (min length = 1)
- [ ] `summary` exceeds 300 characters (max length = 300)
- [ ] `contact.email` too short (min length = 3)
- [ ] `contact.phone` too short (min length = 7)
- [ ] `skillsets[].evidence` empty array (min items = 1)
- [ ] `companies[].evidence` empty array (min items = 1)

### Invalid Profiles - Enum Violations
- [ ] `talent_category` not in allowed values
- [ ] `rates.unit` not in allowed values ("hour", "day", "year", "project", "unknown")
- [ ] `rates.currency` not in allowed values ("USD", "unknown")

### Invalid Profiles - Unexpected Fields
- [ ] Extra top-level field (e.g., `age`)
- [ ] Extra field in `contact` (e.g., `contact.twitter`)
- [ ] Extra field in `skillsets[]` item
- [ ] Extra field in `location`

### LLM Output Parsing
- [ ] **Valid JSON** is parsed correctly
- [ ] **JSON with markdown fences** (```json ... ```) is handled
- [ ] **JSON with extra whitespace** is trimmed
- [ ] **Malformed JSON** raises appropriate error
- [ ] **Empty response** from LLM raises error
- [ ] **Non-JSON text response** raises error

## Acceptance Criteria

- [ ] Test file `test_json_schema_validation.py` created
- [ ] Tests for `llm_extract` Lambda JSON parsing
- [ ] Tests for `persist` Lambda validation functions
- [ ] Tests for all validation helper functions:
  - `_validate_profile()`
  - `_validate_contact()`
  - `_validate_skillset()`
  - `_validate_company()`
  - `_validate_location()`
  - `_validate_rates()`
  - `_validate_string()`
  - `_require_keys()`
- [ ] Each test verifies correct exception type and error message
- [ ] All tests pass with `pytest`
- [ ] Test coverage for validation logic is >95%

## Implementation Guidelines

```python
import pytest
from persist.app import (
    _validate_profile,
    _validate_contact,
    _validate_skillset,
    _validate_string,
    _require_keys,
    handler
)

# Valid profile fixture
@pytest.fixture
def valid_profile():
    return {
        "name": "John Doe",
        "contact": {
            "email": "john@example.com",
            "phone": "+1234567890",
            "linkedin": "linkedin.com/in/johndoe",
            "github": "github.com/johndoe"
        },
        "summary": "Experienced software engineer",
        "talent_category": "IT Resources",
        "skillsets": [
            {
                "name": "Python",
                "evidence": ["5 years Python development"]
            }
        ],
        "years_of_experience": 5,
        "companies": [
            {
                "name": "Tech Corp",
                "evidence": ["Worked at Tech Corp 2019-2024"]
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
            "evidence": ["$150/hr on resume"]
        }
    }

def test_valid_profile_passes(valid_profile):
    # Should not raise any exception
    _validate_profile(valid_profile)

def test_missing_name_raises_error():
    profile = {"contact": {}, "summary": "test"}
    with pytest.raises(ValueError, match="missing required keys.*name"):
        _validate_profile(profile)

def test_invalid_talent_category_raises_error(valid_profile):
    valid_profile["talent_category"] = "Invalid Category"
    with pytest.raises(ValueError, match="talent_category invalid"):
        _validate_profile(valid_profile)

def test_contact_email_too_short():
    contact = {
        "email": "a@",  # Only 2 chars
        "phone": "1234567",
        "linkedin": None,
        "github": None
    }
    with pytest.raises(ValueError, match="contact.email.*at least 3"):
        _validate_contact(contact)

def test_skillset_empty_evidence_raises_error():
    skill = {
        "name": "Python",
        "evidence": []  # Must have at least 1 item
    }
    with pytest.raises(ValueError, match="evidence must be list of 1\\+ strings"):
        _validate_skillset(skill, 0)

def test_extra_fields_raise_error(valid_profile):
    valid_profile["age"] = 30  # Unexpected field
    with pytest.raises(ValueError, match="unexpected keys.*age"):
        _validate_profile(valid_profile)

# LLM Output Parsing Tests
import json
from llm_extract.app import handler as llm_handler

def test_parse_clean_json_response(mocker):
    # Mock Bedrock client
    mock_bedrock = mocker.patch("llm_extract.app.client")
    mock_bedrock.converse.return_value = {
        "output": {
            "message": {
                "content": [
                    {"text": '{"name": "John Doe", "contact": {...}}'}
                ]
            }
        }
    }
    
    event = {"normalized": {"text": "Resume text here"}}
    result = llm_handler(event, None)
    
    assert isinstance(result, dict)
    assert "name" in result

def test_parse_json_with_markdown_fences(mocker):
    mock_bedrock = mocker.patch("llm_extract.app.client")
    json_with_fences = '```json\n{"name": "Jane Doe"}\n```'
    mock_bedrock.converse.return_value = {
        "output": {
            "message": {
                "content": [{"text": json_with_fences}]
            }
        }
    }
    
    event = {"normalized": {"text": "Resume text"}}
    result = llm_handler(event, None)
    
    assert result["name"] == "Jane Doe"

def test_malformed_json_raises_error(mocker):
    mock_bedrock = mocker.patch("llm_extract.app.client")
    mock_bedrock.converse.return_value = {
        "output": {
            "message": {
                "content": [{"text": "{invalid json"}]
            }
        }
    }
    
    event = {"normalized": {"text": "Resume text"}}
    
    with pytest.raises(RuntimeError, match="not valid JSON"):
        llm_handler(event, None)
```

## Dependencies

- `pytest` for testing
- `pytest-mock` for mocking Bedrock client
- `jsonschema` (optional) for additional schema validation

## Related Issues

- #[unit-tests-prompt-builder] - Prompt construction tests
- #[contract-tests-bedrock] - Mock Bedrock responses
- #[integration-tests] - End-to-end validation
