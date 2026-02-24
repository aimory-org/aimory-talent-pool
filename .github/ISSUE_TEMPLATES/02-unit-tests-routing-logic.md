---
title: "Unit Tests: PDF Routing Logic (Searchable vs Textract)"
labels: testing, backend, lambda, unit-test, classify
---

## Description

Implement unit tests for the classification logic in the `classify` Lambda that determines whether a PDF/DOCX file is searchable (can skip Textract) or requires OCR processing through Textract.

## Why It Matters

- **Cost Optimization**: Textract is expensive; searchable PDFs should bypass it
- **Performance**: Direct text extraction is faster than Textract
- **Accuracy**: Ensures correct routing decisions based on document quality
- **Business Logic**: This is a critical decision point in the pipeline

## Test Scenarios

### Searchable PDFs (skip_textract=True)
- [ ] **High-quality PDF** with >1000 readable characters
- [ ] **Resume with standard fonts** (Arial, Times New Roman)
- [ ] **Multi-page searchable PDF** with sufficient text
- [ ] **DOCX files** should always skip Textract

### Non-Searchable PDFs (skip_textract=False)
- [ ] **Scanned PDF** (image-based) with <1000 readable chars
- [ ] **PDF with mostly images/graphics**
- [ ] **PDF with corrupted text layer**
- [ ] **PDF with unusual/unreadable characters** (low printable ratio)

### Edge Cases
- [ ] **Empty PDF** (0 pages or 0 text)
- [ ] **PDF with exactly 1000 characters** (boundary condition)
- [ ] **PDF with high special characters ratio** (< 35% alphanumeric)
- [ ] **Mixed content PDF** (some searchable, some scanned pages)

## Acceptance Criteria

- [ ] Test file `test_classify_routing.py` created
- [ ] Tests cover all scenarios listed above
- [ ] Tests use real sample PDFs (fixtures) representing each category
- [ ] Tests verify `skip_textract` boolean is set correctly
- [ ] Tests verify `readable_chars` count is accurate
- [ ] Tests verify `direct_text` is populated only when `skip_textract=True`
- [ ] Mock S3 client to avoid real AWS calls
- [ ] All tests pass with `pytest`
- [ ] Test coverage for `_is_text_readable()` and `_count_readable_chars()` is 100%

## Implementation Guidelines

```python
import pytest
from moto import mock_s3
import boto3
from classify.app import handler, _is_text_readable, _count_readable_chars

@pytest.fixture
def s3_client():
    with mock_s3():
        s3 = boto3.client("s3", region_name="us-east-1")
        s3.create_bucket(Bucket="test-bucket")
        yield s3

def test_searchable_pdf_skips_textract(s3_client):
    # Upload a searchable PDF with >1000 chars
    with open("fixtures/searchable_resume.pdf", "rb") as f:
        s3_client.put_object(Bucket="test-bucket", Key="resume.pdf", Body=f.read())
    
    event = {"bucket": "test-bucket", "key": "resume.pdf"}
    result = handler(event, None)
    
    assert result["skip_textract"] is True
    assert result["readable_chars"] > 1000
    assert result["direct_text"] is not None

def test_scanned_pdf_requires_textract(s3_client):
    # Upload a scanned (image-based) PDF
    with open("fixtures/scanned_resume.pdf", "rb") as f:
        s3_client.put_object(Bucket="test-bucket", Key="scanned.pdf", Body=f.read())
    
    event = {"bucket": "test-bucket", "key": "scanned.pdf"}
    result = handler(event, None)
    
    assert result["skip_textract"] is False
    assert result["readable_chars"] < 1000
    assert result["direct_text"] is None

def test_is_text_readable_with_clean_text():
    text = "John Doe\nSoftware Engineer\nSkills: Python, AWS"
    assert _is_text_readable(text) is True

def test_is_text_readable_with_garbage():
    text = "�����∆∑∏√∫"
    assert _is_text_readable(text) is False
```

## Test Fixtures Needed

Create sample files in `tests/fixtures/`:
- `searchable_resume.pdf` - Clean, text-based PDF
- `scanned_resume.pdf` - Image-based scanned PDF
- `low_quality_text.pdf` - PDF with barely readable text
- `resume.docx` - Word document

## Environment Variables to Test

- `MIN_PDF_TEXT_CHARS` - Test with different threshold values (500, 1000, 2000)

## Related Issues

- #[unit-tests-input-validation] - Input validation tests
- #[golden-dataset] - Sample resume collection
