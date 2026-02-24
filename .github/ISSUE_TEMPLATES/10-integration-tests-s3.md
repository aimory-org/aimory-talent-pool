---
title: "Integration Tests: Lambda + S3 Mock"
labels: testing, integration-test, s3, backend, lambda
---

## Description

Implement integration tests that validate Lambda functions' interactions with Amazon S3, using `moto` to mock S3 operations. These tests ensure correct file uploads, downloads, and metadata handling without requiring actual S3 buckets.

## Why It Matters

- **Local Development**: Test S3 interactions without AWS infrastructure
- **Fast Execution**: Mocked S3 operations run in milliseconds
- **Cost Savings**: No S3 storage or request charges
- **CI/CD**: Tests run in GitHub Actions without AWS credentials
- **Reliable Testing**: Consistent behavior vs eventual consistency in real S3

## Test Scenarios

### classify Lambda + S3
- [ ] **Download PDF from S3** - Retrieve resume file
- [ ] **Download DOCX from S3** - Retrieve Word document
- [ ] **Extract text from PDF** - Process searchable PDF
- [ ] **Extract text from DOCX** - Process Word document
- [ ] **Handle missing S3 object** - NoSuchKey error
- [ ] **Handle invalid S3 path** - Bucket or key doesn't exist
- [ ] **Large file handling** - Resume >5MB
- [ ] **Verify S3 GetObject call** - Correct bucket/key used

### Textract Flow + S3
- [ ] **Start Textract with S3 location** - Pass correct S3 reference
- [ ] **Store Textract results to S3** - Save blocks JSON to temp bucket
- [ ] **Retrieve Textract results from S3** - Read blocks for normalization
- [ ] **Clean up temp S3 objects** - Delete intermediate files

### normalize Lambda + S3
- [ ] **Read Textract blocks from S3** - Fetch JSON from temp storage
- [ ] **Handle malformed JSON** - Invalid Textract results
- [ ] **Handle missing S3 object** - Textract results not found

### presign Lambda + S3 (if applicable)
- [ ] **Generate presigned URL** - Upload URL for resume submission
- [ ] **Verify URL format** - Contains correct bucket/key/signature
- [ ] **URL expiration** - Respect configured TTL
- [ ] **Upload via presigned URL** - Actually works (optional)

## Acceptance Criteria

- [ ] Test file `test_s3_integration.py` created
- [ ] Tests use `moto` to mock S3 (`@mock_s3` decorator)
- [ ] Tests create temporary S3 buckets for each test
- [ ] Tests upload sample PDF/DOCX files to mock S3
- [ ] Tests verify S3 operations (get_object, put_object)
- [ ] Tests handle S3 errors (NoSuchKey, NoSuchBucket)
- [ ] All tests pass with `pytest`
- [ ] Test coverage for S3 interactions is >85%

## Implementation Guidelines

```python
import pytest
import boto3
from moto import mock_s3
import io

@pytest.fixture
def s3_client():
    """Create mock S3 client"""
    with mock_s3():
        s3 = boto3.client("s3", region_name="us-east-1")
        yield s3

@pytest.fixture
def s3_bucket(s3_client):
    """Create a test S3 bucket with sample files"""
    bucket_name = "test-resumes-bucket"
    s3_client.create_bucket(Bucket=bucket_name)
    
    # Upload sample PDF (you'll need real test files)
    with open("tests/fixtures/searchable_resume.pdf", "rb") as f:
        s3_client.put_object(
            Bucket=bucket_name,
            Key="resumes/john-doe.pdf",
            Body=f.read()
        )
    
    # Upload sample DOCX
    with open("tests/fixtures/resume.docx", "rb") as f:
        s3_client.put_object(
            Bucket=bucket_name,
            Key="resumes/jane-doe.docx",
            Body=f.read()
        )
    
    yield bucket_name

# --- classify Lambda Tests ---

def test_classify_downloads_pdf_from_s3(s3_bucket, monkeypatch):
    """Test classify Lambda retrieves PDF from S3"""
    # Patch boto3 to use mocked S3
    from classify import app
    monkeypatch.setattr(app, "s3", boto3.client("s3", region_name="us-east-1"))
    
    event = {
        "bucket": s3_bucket,
        "key": "resumes/john-doe.pdf"
    }
    
    result = app.handler(event, None)
    
    assert result["doc_type"] == "pdf"
    assert result["bucket"] == s3_bucket
    assert result["key"] == "resumes/john-doe.pdf"
    # Verify it extracted text
    assert result["skip_textract"] in [True, False]

def test_classify_downloads_docx_from_s3(s3_bucket, monkeypatch):
    """Test classify Lambda retrieves DOCX from S3"""
    from classify import app
    monkeypatch.setattr(app, "s3", boto3.client("s3", region_name="us-east-1"))
    
    event = {
        "bucket": s3_bucket,
        "key": "resumes/jane-doe.docx"
    }
    
    result = app.handler(event, None)
    
    assert result["doc_type"] == "word"
    assert result["extension"] == "docx"
    assert result["skip_textract"] is True
    assert result["direct_text"] is not None

def test_classify_handles_missing_s3_object(s3_client, monkeypatch):
    """Test handling of missing S3 object"""
    s3_client.create_bucket(Bucket="empty-bucket")
    
    from classify import app
    monkeypatch.setattr(app, "s3", s3_client)
    
    event = {
        "bucket": "empty-bucket",
        "key": "nonexistent.pdf"
    }
    
    # Should raise S3 error
    with pytest.raises(Exception):  # ClientError from boto3
        app.handler(event, None)

# --- Textract + S3 Integration Tests ---

def test_store_textract_results_to_s3(s3_client):
    """Test storing Textract results to S3"""
    s3_client.create_bucket(Bucket="temp-textract-bucket")
    
    # Simulate Textract blocks
    blocks = [
        {"BlockType": "LINE", "Id": "1", "Text": "John Doe"},
        {"BlockType": "LINE", "Id": "2", "Text": "Software Engineer"}
    ]
    
    import json
    s3_client.put_object(
        Bucket="temp-textract-bucket",
        Key="textract/job-123.json",
        Body=json.dumps({"blocks": blocks})
    )
    
    # Verify stored
    response = s3_client.get_object(
        Bucket="temp-textract-bucket",
        Key="textract/job-123.json"
    )
    
    stored_data = json.loads(response["Body"].read())
    assert len(stored_data["blocks"]) == 2
    assert stored_data["blocks"][0]["Text"] == "John Doe"

def test_normalize_reads_textract_from_s3(s3_client, monkeypatch):
    """Test normalize Lambda reads Textract results from S3"""
    bucket = "temp-textract-bucket"
    s3_client.create_bucket(Bucket=bucket)
    
    # Store mock Textract results
    blocks = [
        {"BlockType": "LINE", "Id": "1", "Text": "John Doe"},
        {"BlockType": "LINE", "Id": "2", "Text": "Python Developer"}
    ]
    
    import json
    s3_client.put_object(
        Bucket=bucket,
        Key="textract/job-456.json",
        Body=json.dumps({"blocks": blocks})
    )
    
    # Test normalize Lambda
    from normalize import app
    monkeypatch.setattr(app, "s3", s3_client)
    
    event = {
        "prep": {"skip_textract": False},
        "textractBlocks": {
            "s3_bucket": bucket,
            "s3_key": "textract/job-456.json"
        }
    }
    
    result = app.handler(event, None)
    
    assert "John Doe" in result["text"]
    assert "Python Developer" in result["text"]
    assert result["line_count"] == 2

# --- presign Lambda Tests ---

def test_presign_generates_valid_url(s3_client):
    """Test presigned URL generation"""
    bucket = "upload-bucket"
    s3_client.create_bucket(Bucket=bucket)
    
    # Generate presigned URL
    url = s3_client.generate_presigned_url(
        "put_object",
        Params={
            "Bucket": bucket,
            "Key": "uploads/new-resume.pdf"
        },
        ExpiresIn=3600
    )
    
    assert bucket in url
    assert "uploads/new-resume.pdf" in url
    assert "Signature" in url or "X-Amz-Signature" in url

# --- S3 Error Handling Tests ---

def test_s3_no_such_bucket_error(s3_client, monkeypatch):
    """Test handling of nonexistent bucket"""
    from classify import app
    monkeypatch.setattr(app, "s3", s3_client)
    
    event = {
        "bucket": "nonexistent-bucket",
        "key": "resume.pdf"
    }
    
    with pytest.raises(Exception):
        app.handler(event, None)

def test_s3_large_file_handling(s3_client, monkeypatch):
    """Test handling of large resume files"""
    bucket = "large-files-bucket"
    s3_client.create_bucket(Bucket=bucket)
    
    # Create a large fake PDF (5MB)
    large_content = b"PDF content " * (5 * 1024 * 1024 // 12)
    
    s3_client.put_object(
        Bucket=bucket,
        Key="large-resume.pdf",
        Body=large_content
    )
    
    # Verify we can retrieve it
    response = s3_client.get_object(Bucket=bucket, Key="large-resume.pdf")
    retrieved_content = response["Body"].read()
    
    assert len(retrieved_content) >= 5 * 1024 * 1024

# --- S3 Metadata Tests ---

def test_s3_object_metadata(s3_client):
    """Test storing and retrieving S3 object metadata"""
    bucket = "metadata-bucket"
    s3_client.create_bucket(Bucket=bucket)
    
    # Upload with metadata
    s3_client.put_object(
        Bucket=bucket,
        Key="resume-with-metadata.pdf",
        Body=b"PDF content",
        Metadata={
            "uploaded-by": "test-user",
            "document-type": "resume"
        }
    )
    
    # Retrieve and verify metadata
    response = s3_client.get_object(Bucket=bucket, Key="resume-with-metadata.pdf")
    
    assert response["Metadata"]["uploaded-by"] == "test-user"
    assert response["Metadata"]["document-type"] == "resume"

# --- Multipart Upload Tests (if needed) ---

def test_s3_multipart_upload(s3_client):
    """Test multipart upload for very large files"""
    bucket = "multipart-bucket"
    s3_client.create_bucket(Bucket=bucket)
    
    key = "very-large-resume.pdf"
    
    # Initiate multipart upload
    response = s3_client.create_multipart_upload(Bucket=bucket, Key=key)
    upload_id = response["UploadId"]
    
    # Upload parts
    part1 = b"Part 1 content " * 1024
    response1 = s3_client.upload_part(
        Bucket=bucket,
        Key=key,
        PartNumber=1,
        UploadId=upload_id,
        Body=part1
    )
    
    part2 = b"Part 2 content " * 1024
    response2 = s3_client.upload_part(
        Bucket=bucket,
        Key=key,
        PartNumber=2,
        UploadId=upload_id,
        Body=part2
    )
    
    # Complete upload
    s3_client.complete_multipart_upload(
        Bucket=bucket,
        Key=key,
        UploadId=upload_id,
        MultipartUpload={
            "Parts": [
                {"ETag": response1["ETag"], "PartNumber": 1},
                {"ETag": response2["ETag"], "PartNumber": 2}
            ]
        }
    )
    
    # Verify file exists
    response = s3_client.head_object(Bucket=bucket, Key=key)
    assert response["ContentLength"] > 0
```

## Test Fixtures

Store sample files in `tests/fixtures/`:
- `searchable_resume.pdf` - Real PDF with searchable text
- `scanned_resume.pdf` - Image-based PDF
- `resume.docx` - Word document
- `large_resume.pdf` - File >5MB for large file testing

## pytest Configuration

```ini
[pytest]
markers =
    integration: integration tests requiring mocked AWS services
    s3: tests that interact with S3
```

## Dependencies

- `pytest`
- `moto[s3]` - Mock AWS S3
- `boto3`

## Related Issues

- #[unit-tests-input-validation] - Input validation tests
- #[unit-tests-routing-logic] - PDF classification tests
- #[integration-tests-dynamodb] - DynamoDB integration tests
- #[integration-tests-step-functions] - Full pipeline tests
