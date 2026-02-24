---
title: "Golden Dataset: Regression Test Suite with Sample Resumes"
labels: testing, regression-test, golden-dataset, qa
---

## Description

Create a golden dataset of diverse sample resumes that represent real-world scenarios. Use this dataset for regression testing to ensure the AIMORY pipeline consistently extracts required fields and maintains quality over time.

## Why It Matters

- **Regression Prevention**: Detect when changes break extraction quality
- **Quality Baseline**: Establish expected extraction accuracy
- **Real-World Testing**: Test against actual resume formats
- **Edge Case Coverage**: Include difficult cases (multi-column, scanned, etc.)
- **Continuous Validation**: Run on every deployment to catch regressions

## Sample Resume Categories

### 1. Searchable PDF - Standard Format
**File**: `tests/fixtures/golden_dataset/01_standard_searchable.pdf`

**Characteristics**:
- Single column layout
- Standard fonts (Arial, Times New Roman)
- Clear sections (Experience, Education, Skills)
- 1-2 pages
- Searchable text layer

**Required Extractions**:
- [ ] Name: Present and correct
- [ ] Email: Valid email address
- [ ] Phone: Valid phone number
- [ ] LinkedIn: If present on resume
- [ ] Skills: At least 3 technical skills extracted
- [ ] Companies: At least 1 company name
- [ ] Years of experience: Numeric value or null
- [ ] Location: City and state
- [ ] Rates: If mentioned, extracted correctly

### 2. Scanned PDF - Image-based
**File**: `tests/fixtures/golden_dataset/02_scanned_resume.pdf`

**Characteristics**:
- Image-based PDF (requires OCR)
- No text layer
- Standard resume layout
- Clean scan quality

**Required Extractions**:
- [ ] All fields from Category 1
- [ ] OCR accuracy >90%
- [ ] No garbled text

### 3. Multi-Column Layout
**File**: `tests/fixtures/golden_dataset/03_multi_column.pdf`

**Characteristics**:
- 2-3 column layout
- Skills in sidebar
- Experience in main column
- May confuse text extraction order

**Required Extractions**:
- [ ] All fields from Category 1
- [ ] Text order makes sense (not jumbled)
- [ ] Skills from sidebar extracted

### 4. Creative/Designer Resume
**File**: `tests/fixtures/golden_dataset/04_creative_design.pdf`

**Characteristics**:
- Non-standard layout
- Graphics, images, colors
- Unusual fonts
- May have text in unusual positions

**Required Extractions**:
- [ ] Name, email, phone at minimum
- [ ] At least some skills extracted
- [ ] Companies mentioned extracted

### 5. Word Document (DOCX)
**File**: `tests/fixtures/golden_dataset/05_word_resume.docx`

**Characteristics**:
- Standard Word document
- Tables, bullet points
- Formatted text

**Required Extractions**:
- [ ] All fields from Category 1
- [ ] Table content extracted correctly

### 6. Long Resume (3+ pages)
**File**: `tests/fixtures/golden_dataset/06_long_resume.pdf`

**Characteristics**:
- 3-5 pages
- Extensive work history
- Many skills and companies

**Required Extractions**:
- [ ] All relevant experience captured
- [ ] Skills list comprehensive
- [ ] All companies extracted
- [ ] No truncation issues

### 7. International Resume
**File**: `tests/fixtures/golden_dataset/07_international.pdf`

**Characteristics**:
- Non-US format
- International characters (accents, ñ, ü, etc.)
- May have different section names

**Required Extractions**:
- [ ] Unicode characters preserved
- [ ] International phone format handled
- [ ] Location outside US handled

### 8. Entry-Level Resume
**File**: `tests/fixtures/golden_dataset/08_entry_level.pdf`

**Characteristics**:
- Limited work experience (0-2 years)
- Emphasis on education, coursework
- May list rates or "seeking" information

**Required Extractions**:
- [ ] Years of experience: 0-2
- [ ] Education details extracted
- [ ] Skills from coursework/projects

## Acceptance Criteria

- [ ] At least 5 sample resumes collected (representing categories above)
- [ ] Golden dataset stored in `tests/fixtures/golden_dataset/`
- [ ] Each resume has a corresponding expected output JSON file
- [ ] Test file `test_golden_dataset.py` created
- [ ] Tests run full pipeline for each resume
- [ ] Tests assert required fields are extracted
- [ ] Tests compare against expected output (with tolerance for LLM variance)
- [ ] Tests fail if extraction quality degrades
- [ ] All tests pass with `pytest`
- [ ] Dataset documented in README

## Implementation Guidelines

```python
import pytest
import json
import os
from pathlib import Path

GOLDEN_DATASET_DIR = Path("tests/fixtures/golden_dataset")

# Define expected outputs for each test resume
EXPECTED_OUTPUTS = {
    "01_standard_searchable.pdf": {
        "name": "Jane Doe",
        "contact": {
            "email": "jane.doe@example.com",
            "phone": "555-123-4567",
            "linkedin": "linkedin.com/in/janedoe",
            "github": None
        },
        "talent_category": "IT Resources",
        "min_skillsets": 3,  # At least 3 skills
        "min_companies": 1,  # At least 1 company
        "years_of_experience_range": [3, 7],  # Between 3-7 years
        "location": {
            "city": "San Francisco",
            "state": "CA"
        }
    },
    "02_scanned_resume.pdf": {
        "name": "John Smith",
        "contact": {
            "email": "john.smith@example.com",
            "phone": "555-987-6543"
        },
        "min_skillsets": 2,
        "min_companies": 1
    },
    # Add more...
}

@pytest.fixture
def golden_resumes():
    """List all golden dataset resumes"""
    resumes = list(GOLDEN_DATASET_DIR.glob("*.pdf"))
    resumes.extend(GOLDEN_DATASET_DIR.glob("*.docx"))
    return sorted(resumes)

def run_full_pipeline(resume_path):
    """Execute full AIMORY pipeline on a resume"""
    # This is a simplified version
    # In reality, you'd use Step Functions or manual orchestration
    
    from moto import mock_s3, mock_dynamodb
    import boto3
    
    with mock_s3(), mock_dynamodb():
        # Setup AWS resources
        s3 = boto3.client("s3", region_name="us-east-1")
        s3.create_bucket(Bucket="test-bucket")
        
        # Upload resume
        with open(resume_path, "rb") as f:
            s3.put_object(
                Bucket="test-bucket",
                Key=resume_path.name,
                Body=f.read()
            )
        
        # Run pipeline steps
        # 1. Classify
        from classify.app import handler as classify_handler
        # ... (patch S3 client)
        
        # 2. Normalize
        # 3. LLMExtract (with mocked Bedrock)
        # 4. Persist
        
        # Return extracted profile
        return extracted_profile

@pytest.mark.parametrize("resume_file", [
    "01_standard_searchable.pdf",
    "02_scanned_resume.pdf",
    "03_multi_column.pdf",
    "05_word_resume.docx",
])
def test_golden_dataset_required_fields(resume_file):
    """Test that required fields are extracted from golden dataset"""
    resume_path = GOLDEN_DATASET_DIR / resume_file
    
    # Skip if file doesn't exist
    if not resume_path.exists():
        pytest.skip(f"Golden dataset file not found: {resume_file}")
    
    # Run pipeline
    result = run_full_pipeline(resume_path)
    
    # Assert required fields exist
    assert result["name"] is not None, "Name not extracted"
    assert result["contact"]["email"] is not None, "Email not extracted"
    
    # Get expected output
    expected = EXPECTED_OUTPUTS.get(resume_file, {})
    
    # Validate against expectations
    if "name" in expected:
        assert result["name"] == expected["name"], f"Name mismatch: {result['name']} != {expected['name']}"
    
    if "min_skillsets" in expected:
        assert len(result["skillsets"]) >= expected["min_skillsets"], \
            f"Insufficient skillsets: {len(result['skillsets'])} < {expected['min_skillsets']}"
    
    if "min_companies" in expected:
        assert len(result["companies"]) >= expected["min_companies"], \
            f"Insufficient companies: {len(result['companies'])} < {expected['min_companies']}"

def test_extraction_quality_baseline():
    """Test overall extraction quality meets baseline"""
    results = []
    
    for resume_file in EXPECTED_OUTPUTS.keys():
        resume_path = GOLDEN_DATASET_DIR / resume_file
        
        if not resume_path.exists():
            continue
        
        result = run_full_pipeline(resume_path)
        expected = EXPECTED_OUTPUTS[resume_file]
        
        # Score this extraction
        score = calculate_extraction_score(result, expected)
        results.append({
            "file": resume_file,
            "score": score
        })
    
    # Calculate average score
    avg_score = sum(r["score"] for r in results) / len(results)
    
    # Assert minimum quality
    assert avg_score >= 0.85, f"Extraction quality below baseline: {avg_score:.2%}"
    
    # Print results
    for r in results:
        print(f"{r['file']}: {r['score']:.2%}")

def calculate_extraction_score(result, expected):
    """Calculate extraction quality score (0.0 to 1.0)"""
    points = 0
    total = 0
    
    # Name match
    if "name" in expected:
        total += 1
        if result.get("name") == expected["name"]:
            points += 1
    
    # Email match
    if "contact" in expected and "email" in expected["contact"]:
        total += 1
        if result.get("contact", {}).get("email") == expected["contact"]["email"]:
            points += 1
    
    # Skillsets count
    if "min_skillsets" in expected:
        total += 1
        if len(result.get("skillsets", [])) >= expected["min_skillsets"]:
            points += 1
    
    # Companies count
    if "min_companies" in expected:
        total += 1
        if len(result.get("companies", [])) >= expected["min_companies"]:
            points += 1
    
    return points / total if total > 0 else 0.0

def test_llm_consistency():
    """Test that LLM produces consistent results for same resume"""
    resume_path = GOLDEN_DATASET_DIR / "01_standard_searchable.pdf"
    
    if not resume_path.exists():
        pytest.skip("Test file not found")
    
    # Run pipeline 3 times
    results = [run_full_pipeline(resume_path) for _ in range(3)]
    
    # Check consistency
    for field in ["name", "talent_category"]:
        values = [r.get(field) for r in results]
        # All should be the same (or all None)
        assert len(set(values)) <= 1, f"Inconsistent {field}: {values}"

def test_no_regression_from_baseline():
    """Test that extraction hasn't regressed from saved baseline"""
    baseline_file = GOLDEN_DATASET_DIR / "baseline_results.json"
    
    if not baseline_file.exists():
        pytest.skip("No baseline to compare against")
    
    with open(baseline_file) as f:
        baseline = json.load(f)
    
    for resume_file, expected_result in baseline.items():
        resume_path = GOLDEN_DATASET_DIR / resume_file
        
        if not resume_path.exists():
            continue
        
        current_result = run_full_pipeline(resume_path)
        
        # Compare key fields
        for field in ["name", "talent_category"]:
            assert current_result.get(field) == expected_result.get(field), \
                f"Regression in {resume_file}: {field}"
```

## Creating the Golden Dataset

### Step 1: Collect Sample Resumes
- Create anonymized versions of real resumes
- Or use publicly available resume templates
- Ensure diversity in formats and layouts

### Step 2: Run Initial Extraction
```bash
# Run pipeline on each resume
python scripts/extract_golden_dataset.py

# Save results as baseline
python scripts/save_baseline.py
```

### Step 3: Manual Review
- Review extracted data for accuracy
- Correct any errors in expected output files
- Document edge cases

### Step 4: Add to CI/CD
```yaml
- name: Run golden dataset tests
  run: pytest tests/test_golden_dataset.py -v
```

## Baseline Results File

`tests/fixtures/golden_dataset/baseline_results.json`:
```json
{
  "01_standard_searchable.pdf": {
    "name": "Jane Doe",
    "contact": {
      "email": "jane.doe@example.com",
      "phone": "555-123-4567",
      "linkedin": "linkedin.com/in/janedoe",
      "github": null
    },
    "talent_category": "IT Resources",
    "skillsets": [...],
    "companies": [...],
    "years_of_experience": 5,
    "location": {"city": "San Francisco", "state": "CA"},
    "rates": {"amount": 150, "unit": "hour", "currency": "USD"}
  }
}
```

## Dependencies

- `pytest`
- `pytest-xdist` (for parallel execution)
- All integration test dependencies

## Related Issues

- #[integration-tests-step-functions] - Full pipeline testing
- #[unit-tests-json-validation] - Schema validation
- #[performance-guardrails] - Performance testing
