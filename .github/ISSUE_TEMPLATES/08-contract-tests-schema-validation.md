---
title: "Contract Tests: Enforce Strict Schema Validation"
labels: testing, contract-test, schema, validation, backend
---

## Description

Implement contract tests to enforce strict schema validation for the `TalentProfile` schema. These tests ensure that the schema definition in `llm_extract/app.py` is correctly validated by the `persist` Lambda and that no invalid data can enter the database.

## Why It Matters

- **Data Quality**: Prevent malformed or invalid profiles in DynamoDB
- **Type Safety**: Ensure all fields have correct types at runtime
- **Schema Evolution**: Detect breaking changes when schema is updated
- **Documentation**: Schema serves as contract between LLM and database
- **Debugging**: Clear validation errors help identify issues quickly

## Test Scenarios

### Schema Definition Validation
- [ ] **JSON Schema is valid** - Schema itself is well-formed JSON Schema Draft 2020-12
- [ ] **Required fields** match between `llm_extract` and `persist`
- [ ] **Enum values** match across both Lambdas
- [ ] **Type definitions** are consistent
- [ ] **Nested object schemas** are correctly defined

### Field Type Enforcement
- [ ] **String fields** reject numbers, booleans, objects
- [ ] **Number fields** reject strings, booleans, objects
- [ ] **Object fields** reject strings, arrays, null (when required)
- [ ] **Array fields** reject objects, strings
- [ ] **Null values** only allowed where specified

### String Constraints
- [ ] **minLength** enforced (e.g., `name` min 1, `contact.email` min 3)
- [ ] **maxLength** enforced (e.g., `summary` max 300)
- [ ] **Empty strings** rejected where minLength > 0
- [ ] **Whitespace-only strings** handled appropriately

### Array Constraints
- [ ] **minItems** enforced (e.g., `skillsets[].evidence` min 1)
- [ ] **Item type** validated for array elements
- [ ] **Empty arrays** allowed where minItems = 0
- [ ] **Nested array validation** (arrays within objects)

### Object Constraints
- [ ] **Required keys** present in nested objects
- [ ] **No extra keys** (additionalProperties: false)
- [ ] **Nested object validation** (objects within arrays)

### Enum Validation
- [ ] **talent_category** only accepts:
  - "IT Resources"
  - "Accounting and Finance Resources"
- [ ] **rates.unit** only accepts:
  - "hour", "day", "year", "project", "unknown"
- [ ] **rates.currency** only accepts:
  - "USD", "unknown"
- [ ] **Invalid enum values** are rejected

### Edge Cases
- [ ] **Null vs undefined** - Distinguish between missing and null
- [ ] **Empty objects** - `{}` where object is required
- [ ] **Boolean as number** - `true` should not be accepted as number
- [ ] **String numbers** - `"5"` should not be accepted as number
- [ ] **Extra whitespace** - ` " John " ` trimming behavior

## Acceptance Criteria

- [ ] Test file `test_schema_validation_contract.py` created
- [ ] Tests use JSON Schema validator library (e.g., `jsonschema`)
- [ ] Tests validate `TALENT_SCHEMA` from `llm_extract.app`
- [ ] Tests verify all validation functions in `persist.app`:
  - `_validate_profile()`
  - `_validate_contact()`
  - `_validate_skillset()`
  - `_validate_company()`
  - `_validate_location()`
  - `_validate_rates()`
  - `_validate_string()`
  - `_require_keys()`
- [ ] Tests ensure schema and validation logic are in sync
- [ ] All tests pass with `pytest`
- [ ] Test coverage for validation logic is 100%
- [ ] Documentation updated with schema contract

## Implementation Guidelines

```python
import pytest
import json
from jsonschema import validate, ValidationError, Draft202012Validator
from llm_extract.app import TALENT_SCHEMA
from persist.app import _validate_profile

# --- Schema Definition Tests ---

def test_talent_schema_is_valid_json_schema():
    """Verify TALENT_SCHEMA is valid JSON Schema"""
    # This will raise exception if schema is invalid
    Draft202012Validator.check_schema(TALENT_SCHEMA)

def test_schema_has_required_fields():
    """Verify all required fields are defined"""
    required = TALENT_SCHEMA["required"]
    expected = {
        "name", "contact", "summary", "talent_category",
        "skillsets", "years_of_experience", "companies",
        "location", "rates"
    }
    assert set(required) == expected

def test_schema_properties_defined():
    """Verify all required fields have property definitions"""
    properties = TALENT_SCHEMA["properties"]
    for field in TALENT_SCHEMA["required"]:
        assert field in properties, f"Missing property definition for {field}"

# --- Type Validation Tests ---

def test_name_must_be_string_or_null(valid_profile):
    """Test name field type validation"""
    # Valid: string
    profile = valid_profile.copy()
    profile["name"] = "John Doe"
    _validate_profile(profile)
    
    # Valid: null
    profile["name"] = None
    _validate_profile(profile)
    
    # Invalid: number
    profile["name"] = 123
    with pytest.raises(ValueError, match="must be a string"):
        _validate_profile(profile)
    
    # Invalid: object
    profile["name"] = {"first": "John"}
    with pytest.raises(ValueError):
        _validate_profile(profile)

def test_years_of_experience_must_be_number_or_null(valid_profile):
    """Test years_of_experience type validation"""
    profile = valid_profile.copy()
    
    # Valid: number
    profile["years_of_experience"] = 5
    _validate_profile(profile)
    
    # Valid: float
    profile["years_of_experience"] = 5.5
    _validate_profile(profile)
    
    # Valid: null
    profile["years_of_experience"] = None
    _validate_profile(profile)
    
    # Invalid: string
    profile["years_of_experience"] = "five"
    with pytest.raises(ValueError, match="must be a number"):
        _validate_profile(profile)
    
    # Invalid: boolean should not be accepted as number
    profile["years_of_experience"] = True
    with pytest.raises(ValueError):
        _validate_profile(profile)

# --- String Constraint Tests ---

def test_name_min_length_enforced(valid_profile):
    """Test name minimum length of 1"""
    profile = valid_profile.copy()
    
    # Valid: 1 character
    profile["name"] = "J"
    _validate_profile(profile)
    
    # Invalid: empty string
    profile["name"] = ""
    with pytest.raises(ValueError, match="at least 1 char"):
        _validate_profile(profile)

def test_summary_max_length_enforced(valid_profile):
    """Test summary maximum length of 300"""
    profile = valid_profile.copy()
    
    # Valid: exactly 300 characters
    profile["summary"] = "a" * 300
    _validate_profile(profile)
    
    # Invalid: 301 characters
    profile["summary"] = "a" * 301
    with pytest.raises(ValueError, match="at most 300 char"):
        _validate_profile(profile)

def test_contact_email_min_length(valid_profile):
    """Test contact.email minimum length of 3"""
    profile = valid_profile.copy()
    
    # Valid: 3 characters
    profile["contact"]["email"] = "a@b"
    _validate_profile(profile)
    
    # Invalid: 2 characters
    profile["contact"]["email"] = "ab"
    with pytest.raises(ValueError, match="contact.email.*at least 3"):
        _validate_profile(profile)

# --- Array Constraint Tests ---

def test_skillsets_evidence_min_items(valid_profile):
    """Test skillsets[].evidence requires at least 1 item"""
    profile = valid_profile.copy()
    
    # Valid: 1 item
    profile["skillsets"] = [
        {"name": "Python", "evidence": ["Used Python"]}
    ]
    _validate_profile(profile)
    
    # Invalid: empty array
    profile["skillsets"] = [
        {"name": "Python", "evidence": []}
    ]
    with pytest.raises(ValueError, match="evidence must be list of 1\\+ strings"):
        _validate_profile(profile)

# --- Enum Validation Tests ---

def test_talent_category_enum(valid_profile):
    """Test talent_category enum values"""
    profile = valid_profile.copy()
    
    # Valid values
    for category in ["IT Resources", "Accounting and Finance Resources"]:
        profile["talent_category"] = category
        _validate_profile(profile)
    
    # Invalid value
    profile["talent_category"] = "Engineering"
    with pytest.raises(ValueError, match="talent_category invalid"):
        _validate_profile(profile)

def test_rates_unit_enum(valid_profile):
    """Test rates.unit enum values"""
    profile = valid_profile.copy()
    
    valid_units = ["hour", "day", "year", "project", "unknown"]
    for unit in valid_units:
        profile["rates"]["unit"] = unit
        _validate_profile(profile)
    
    # Invalid value
    profile["rates"]["unit"] = "month"
    with pytest.raises(ValueError, match="rates.unit invalid"):
        _validate_profile(profile)

def test_rates_currency_enum(valid_profile):
    """Test rates.currency enum values"""
    profile = valid_profile.copy()
    
    valid_currencies = ["USD", "unknown"]
    for currency in valid_currencies:
        profile["rates"]["currency"] = currency
        _validate_profile(profile)
    
    # Invalid value
    profile["rates"]["currency"] = "EUR"
    with pytest.raises(ValueError, match="rates.currency invalid"):
        _validate_profile(profile)

# --- Extra Fields Tests ---

def test_no_extra_top_level_fields(valid_profile):
    """Test additionalProperties: false enforcement"""
    profile = valid_profile.copy()
    
    # Add unexpected field
    profile["age"] = 30
    
    with pytest.raises(ValueError, match="unexpected keys.*age"):
        _validate_profile(profile)

def test_no_extra_contact_fields(valid_profile):
    """Test no extra fields in contact object"""
    profile = valid_profile.copy()
    
    # Add unexpected field
    profile["contact"]["twitter"] = "@johndoe"
    
    with pytest.raises(ValueError, match="unexpected keys.*twitter"):
        _validate_profile(profile)

# --- Schema Consistency Tests ---

def test_schema_matches_validation_logic():
    """Verify schema definition matches persist validation"""
    # Compare TALENT_SCHEMA required fields with persist validation
    schema_required = set(TALENT_SCHEMA["required"])
    
    # These are checked in _validate_profile
    persist_required = {
        "name", "contact", "summary", "talent_category",
        "skillsets", "years_of_experience", "companies",
        "location", "rates"
    }
    
    assert schema_required == persist_required

def test_enum_values_consistent():
    """Verify enum values match between schema and validation"""
    # From schema
    schema_categories = set(
        TALENT_SCHEMA["properties"]["talent_category"]["enum"]
    )
    
    # From persist.app
    from persist.app import _TALENT_CATEGORIES
    
    assert schema_categories == _TALENT_CATEGORIES
```

## Fixtures

```python
@pytest.fixture
def valid_profile():
    """Minimal valid profile for testing"""
    return {
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
```

## Dependencies

- `pytest`
- `jsonschema` - For JSON Schema validation

## Related Issues

- #[unit-tests-json-validation] - JSON validation logic tests
- #[contract-tests-bedrock] - Mock Bedrock responses
- #[integration-tests] - End-to-end schema enforcement
