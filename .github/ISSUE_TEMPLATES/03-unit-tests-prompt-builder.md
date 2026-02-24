---
title: "Unit Tests: LLM Prompt Builder Logic"
labels: testing, backend, lambda, unit-test, llm
---

## Description

Implement unit tests for the prompt construction logic in the `llm_extract` Lambda that builds the system instructions and user prompts sent to Amazon Bedrock (Claude).

## Why It Matters

- **Prompt Quality**: The prompt directly affects extraction accuracy
- **Token Limits**: Prompts must stay within Bedrock token limits (4096 for Claude Haiku)
- **Cost Control**: Larger prompts cost more; validate size constraints
- **Schema Compliance**: Ensure schema is correctly embedded in prompts
- **Reproducibility**: Consistent prompts enable reliable testing

## Test Scenarios

### Prompt Construction
- [ ] **System instructions** are correctly formatted
- [ ] **JSON schema** is properly embedded in user prompt
- [ ] **Resume text** is correctly inserted
- [ ] **Prompt structure** follows expected format
- [ ] **No markdown artifacts** in system instructions

### Token/Size Limits
- [ ] **Short resume** (<500 chars) produces valid prompt
- [ ] **Medium resume** (~2000 chars) produces valid prompt
- [ ] **Long resume** (>5000 chars) is handled appropriately
- [ ] **Prompt size calculation** is accurate
- [ ] **Warning/truncation** for excessively long resumes

### Schema Validation
- [ ] **TALENT_SCHEMA** is valid JSON
- [ ] **All required fields** are in schema
- [ ] **Enum values** match expected values
- [ ] **Schema structure** matches DynamoDB expectations

### Edge Cases
- [ ] **Empty resume text** is handled
- [ ] **Special characters** in resume (quotes, newlines)
- [ ] **Unicode characters** are preserved
- [ ] **Very long field values** don't break schema

## Acceptance Criteria

- [ ] Test file `test_llm_prompt_builder.py` created
- [ ] Tests verify prompt format and structure
- [ ] Tests validate schema is correctly serialized
- [ ] Tests ensure token/character limits are enforced
- [ ] Tests check special character handling
- [ ] Mock Bedrock client (no real API calls)
- [ ] All tests pass with `pytest`
- [ ] Test coverage for prompt building logic is 100%

## Implementation Guidelines

```python
import pytest
import json
from llm_extract.app import TALENT_SCHEMA, SYSTEM_INSTRUCTIONS, handler, _extract_text

def test_system_instructions_format():
    assert "extract structured talent info" in SYSTEM_INSTRUCTIONS.lower()
    assert "json" in SYSTEM_INSTRUCTIONS.lower()
    assert "schema" in SYSTEM_INSTRUCTIONS.lower()

def test_talent_schema_is_valid_json():
    # Ensure schema can be serialized
    schema_str = json.dumps(TALENT_SCHEMA, indent=2)
    assert schema_str is not None
    
    # Ensure schema has required fields
    assert "properties" in TALENT_SCHEMA
    assert "required" in TALENT_SCHEMA
    
    required_fields = TALENT_SCHEMA["required"]
    assert "name" in required_fields
    assert "contact" in required_fields
    assert "skillsets" in required_fields

def test_prompt_construction_with_normal_resume():
    event = {
        "normalized": {
            "text": "John Doe\nSoftware Engineer\n5 years experience\nPython, AWS"
        }
    }
    
    # We'll need to mock the Bedrock client
    # For now, just test the text extraction
    text = _extract_text(event)
    assert text == event["normalized"]["text"]

def test_prompt_size_for_large_resume():
    # Create a large resume text
    large_text = "Lorem ipsum " * 1000  # ~12000 chars
    
    event = {"normalized": {"text": large_text}}
    schema_str = json.dumps(TALENT_SCHEMA, indent=2)
    
    # Build prompt as the handler would
    user_prompt = f"""Target JSON schema:
  {schema_str}

  Resume text:
  {large_text}
  """
    
    # Rough token estimate: 1 token ~= 4 chars
    estimated_tokens = len(user_prompt) // 4
    
    # Claude Haiku has 200k context, but we limit to reasonable size
    assert estimated_tokens < 10000, "Prompt too large for efficient processing"

def test_missing_normalized_text_raises_error():
    event = {"normalized": {}}
    
    with pytest.raises(ValueError, match="Missing normalized text"):
        _extract_text(event)

def test_special_characters_in_resume():
    event = {
        "normalized": {
            "text": 'Resume with "quotes" and \'apostrophes\' and\nnewlines'
        }
    }
    
    text = _extract_text(event)
    assert '"' in text
    assert "'" in text
    assert '\n' in text
```

## Additional Test Cases

### Schema Field Validation
```python
def test_schema_enum_values():
    # Verify talent_category enum
    talent_cat = TALENT_SCHEMA["properties"]["talent_category"]
    assert "IT Resources" in talent_cat["enum"]
    assert "Accounting and Finance Resources" in talent_cat["enum"]
    
    # Verify rates.unit enum
    rates_unit = TALENT_SCHEMA["properties"]["rates"]["properties"]["unit"]
    valid_units = {"hour", "day", "year", "project", "unknown"}
    assert set(rates_unit["enum"]) == valid_units
```

## Environment Variables to Test

- `MODEL_ID` - Test with different model IDs
- `AWS_REGION` - Ensure region is configurable

## Related Issues

- #[unit-tests-json-validation] - JSON schema validation tests
- #[contract-tests-bedrock] - Mock Bedrock responses
- #[performance-guardrails] - Prompt size limits
