---
title: "Integration Tests: Step Functions Orchestration (Happy Path)"
labels: testing, integration-test, step-functions, orchestration, backend
---

## Description

Implement integration tests for the complete Step Functions workflow, validating the happy path where a resume successfully flows through all Lambda functions from S3 upload to DynamoDB persistence.

## Why It Matters

- **End-to-End Validation**: Ensure all Lambdas work together correctly
- **State Machine Logic**: Test routing decisions (skip Textract vs Textract path)
- **Data Flow**: Verify data passes correctly between states
- **Catch Regressions**: Detect breaking changes in pipeline
- **Production Confidence**: Validate complete workflow before deployment

## Test Scenarios

### Happy Path: Searchable PDF (Skip Textract)
1. **ClassifyAndPrep** → Determines PDF is searchable
2. **ChooseTextPath** → Routes to Normalize (skips Textract)
3. **Normalize** → Extracts text from PDF directly
4. **LLMExtract** → Sends to Bedrock, gets structured profile
5. **Persist** → Saves to DynamoDB
6. **Done** → Workflow succeeds

### Happy Path: Scanned PDF (Textract Path)
1. **ClassifyAndPrep** → Determines PDF needs OCR
2. **ChooseTextPath** → Routes to StartTextract
3. **StartTextract** → Initiates Textract job
4. **WaitBeforeCheck** → Waits 10 seconds
5. **CheckTextract** → Polls job status
6. **TextractStatusChoice** → Routes based on status
   - If IN_PROGRESS → Loop back to WaitBeforeCheck
   - If SUCCEEDED → Continue to FetchTextractBlocks
   - If FAILED → Go to FailWorkflow
7. **FetchTextractBlocks** → Retrieves OCR results
8. **Normalize** → Processes Textract blocks
9. **LLMExtract** → Sends to Bedrock
10. **Persist** → Saves to DynamoDB
11. **Done** → Workflow succeeds

### Happy Path: DOCX File
1. **ClassifyAndPrep** → Extracts text from DOCX
2. **ChooseTextPath** → Routes to Normalize (skips Textract)
3. **Normalize** → Uses direct text
4. **LLMExtract** → Sends to Bedrock
5. **Persist** → Saves to DynamoDB
6. **Done** → Workflow succeeds

## Acceptance Criteria

- [ ] Test file `test_step_functions_integration.py` created
- [ ] Tests use AWS Step Functions Local or mocked execution
- [ ] Tests cover both routing paths (skip Textract + Textract)
- [ ] Tests verify data structure at each state transition
- [ ] Tests verify correct state transitions
- [ ] Tests mock external services (S3, Textract, Bedrock, DynamoDB)
- [ ] Tests validate final DynamoDB item matches expected schema
- [ ] All tests pass with `pytest`
- [ ] Documentation for running Step Functions Local

## Implementation Guidelines

```python
import pytest
import json
from moto import mock_stepfunctions, mock_s3, mock_dynamodb, mock_iam
import boto3

@pytest.fixture
def aws_resources():
    """Setup all required AWS resources"""
    with mock_stepfunctions(), mock_s3(), mock_dynamodb(), mock_iam():
        # Create S3 bucket
        s3 = boto3.client("s3", region_name="us-east-1")
        s3.create_bucket(Bucket="test-resumes")
        
        # Create DynamoDB table
        dynamodb = boto3.client("dynamodb", region_name="us-east-1")
        dynamodb.create_table(
            TableName="test-talent-profiles",
            KeySchema=[{"AttributeName": "pk", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "pk", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST"
        )
        
        # Create IAM role for Step Functions
        iam = boto3.client("iam", region_name="us-east-1")
        iam.create_role(
            RoleName="StepFunctionsRole",
            AssumeRolePolicyDocument=json.dumps({
                "Version": "2012-10-17",
                "Statement": [{
                    "Effect": "Allow",
                    "Principal": {"Service": "states.amazonaws.com"},
                    "Action": "sts:AssumeRole"
                }]
            })
        )
        
        yield {
            "s3": s3,
            "dynamodb": dynamodb,
            "iam": iam
        }

def test_happy_path_searchable_pdf(aws_resources, monkeypatch):
    """Test complete workflow for searchable PDF"""
    
    # Upload test PDF to S3
    s3 = aws_resources["s3"]
    with open("tests/fixtures/searchable_resume.pdf", "rb") as f:
        s3.put_object(
            Bucket="test-resumes",
            Key="john-doe-resume.pdf",
            Body=f.read()
        )
    
    # Mock Lambda executions
    # In real test, you'd use Step Functions Local or mock the execution
    
    # Step 1: ClassifyAndPrep
    classify_event = {
        "bucket": "test-resumes",
        "key": "john-doe-resume.pdf"
    }
    
    from classify.app import handler as classify_handler
    monkeypatch.setattr("classify.app.s3", s3)
    
    classify_result = classify_handler(classify_event, None)
    
    assert classify_result["skip_textract"] is True
    assert classify_result["doc_type"] == "pdf"
    assert classify_result["direct_text"] is not None
    
    # Step 2: ChooseTextPath (routing logic)
    # This is Step Functions logic, not Lambda
    assert classify_result["skip_textract"] is True  # Should route to Normalize
    
    # Step 3: Normalize
    normalize_event = {
        "prep": classify_result
    }
    
    from normalize.app import handler as normalize_handler
    normalize_result = normalize_handler(normalize_event, None)
    
    assert normalize_result["text"] is not None
    assert normalize_result["line_count"] > 0
    
    # Step 4: LLMExtract (mocked)
    llm_event = {
        "bucket": "test-resumes",
        "key": "john-doe-resume.pdf",
        "normalized": normalize_result
    }
    
    # Mock Bedrock response
    from unittest.mock import MagicMock
    mock_bedrock = MagicMock()
    mock_bedrock.converse.return_value = {
        "output": {
            "message": {
                "content": [{
                    "text": json.dumps({
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
                            "amount": 150,
                            "unit": "hour",
                            "currency": "USD",
                            "evidence": []
                        }
                    })
                }]
            }
        }
    }
    
    monkeypatch.setattr("llm_extract.app.client", mock_bedrock)
    monkeypatch.setenv("MODEL_ID", "anthropic.claude-haiku-v1")
    
    from llm_extract.app import handler as llm_handler
    llm_result = llm_handler(llm_event, None)
    
    assert llm_result["name"] == "John Doe"
    assert llm_result["talent_category"] == "IT Resources"
    
    # Step 5: Persist
    persist_event = {
        "bucket": "test-resumes",
        "key": "john-doe-resume.pdf",
        "extracted": llm_result
    }
    
    # Setup DynamoDB
    from persist.app import handler as persist_handler
    dynamodb_resource = boto3.resource("dynamodb", region_name="us-east-1")
    table = dynamodb_resource.Table("test-talent-profiles")
    
    monkeypatch.setenv("TALENT_PROFILES_TABLE", "test-talent-profiles")
    monkeypatch.setattr("persist.app.table", table)
    
    persist_result = persist_handler(persist_event, None)
    
    assert persist_result["status"] == "ok"
    assert persist_result["pk"] == "test-resumes#john-doe-resume.pdf"
    
    # Step 6: Verify final state in DynamoDB
    response = table.get_item(Key={"pk": persist_result["pk"]})
    assert "Item" in response
    
    item = response["Item"]
    assert item["name"] == "John Doe"
    assert item["contact"]["email"] == "john@example.com"

def test_happy_path_textract_flow(aws_resources, monkeypatch):
    """Test complete workflow for scanned PDF requiring Textract"""
    
    # Upload scanned PDF
    s3 = aws_resources["s3"]
    with open("tests/fixtures/scanned_resume.pdf", "rb") as f:
        s3.put_object(
            Bucket="test-resumes",
            Key="scanned.pdf",
            Body=f.read()
        )
    
    # Step 1: ClassifyAndPrep
    classify_event = {
        "bucket": "test-resumes",
        "key": "scanned.pdf"
    }
    
    from classify.app import handler as classify_handler
    monkeypatch.setattr("classify.app.s3", s3)
    
    classify_result = classify_handler(classify_event, None)
    
    assert classify_result["skip_textract"] is False  # Should use Textract
    
    # Step 2: StartTextract (mocked)
    from unittest.mock import MagicMock
    mock_textract = MagicMock()
    mock_textract.start_document_text_detection.return_value = {
        "JobId": "test-job-123"
    }
    
    start_event = {
        "bucket": "test-resumes",
        "key": "scanned.pdf"
    }
    
    monkeypatch.setattr("start_textract.app.textract", mock_textract)
    from start_textract.app import handler as start_textract_handler
    
    textract_result = start_textract_handler(start_event, None)
    assert textract_result["job_id"] == "test-job-123"
    
    # Step 3: CheckTextract (simulate SUCCEEDED)
    mock_textract.get_document_text_detection.return_value = {
        "JobStatus": "SUCCEEDED"
    }
    
    check_event = {
        "textract": textract_result
    }
    
    monkeypatch.setattr("check_textract.app.textract", mock_textract)
    from check_textract.app import handler as check_textract_handler
    
    check_result = check_textract_handler(check_event, None)
    assert check_result["status"] == "SUCCEEDED"
    
    # Continue with FetchTextract, Normalize, LLMExtract, Persist...
    # (Similar to searchable PDF path)

def test_state_machine_definition_valid():
    """Test that state machine ASL is valid JSON"""
    with open("infra/modules/step_functions/state_machine.asl.json") as f:
        state_machine = json.load(f)
    
    # Verify structure
    assert "StartAt" in state_machine
    assert "States" in state_machine
    assert state_machine["StartAt"] == "ClassifyAndPrep"
    
    # Verify key states exist
    states = state_machine["States"]
    assert "ClassifyAndPrep" in states
    assert "ChooseTextPath" in states
    assert "StartTextract" in states
    assert "CheckTextract" in states
    assert "Normalize" in states
    assert "LLMExtract" in states
    assert "Persist" in states
    assert "Done" in states

def test_state_transitions():
    """Test state machine routing logic"""
    with open("infra/modules/step_functions/state_machine.asl.json") as f:
        state_machine = json.load(f)
    
    # Test ChooseTextPath routing
    choose_state = state_machine["States"]["ChooseTextPath"]
    assert choose_state["Type"] == "Choice"
    
    # Should route to Normalize if skip_textract=True
    choice = choose_state["Choices"][0]
    assert choice["Variable"] == "$.prep.skip_textract"
    assert choice["BooleanEquals"] is True
    assert choice["Next"] == "Normalize"
    
    # Should route to StartTextract by default
    assert choose_state["Default"] == "StartTextract"

def test_data_flow_between_states():
    """Test that data structure is preserved between states"""
    
    # Simulate Step Functions context passing
    initial_input = {
        "bucket": "test-resumes",
        "key": "resume.pdf"
    }
    
    # After ClassifyAndPrep
    after_classify = {
        **initial_input,
        "prep": {
            "bucket": "test-resumes",
            "key": "resume.pdf",
            "skip_textract": True,
            "direct_text": "Resume text...",
            "readable_chars": 2000
        }
    }
    
    # After Normalize
    after_normalize = {
        **after_classify,
        "normalized": {
            "text": "Normalized resume text...",
            "line_count": 50
        }
    }
    
    # After LLMExtract
    after_llm = {
        **after_normalize,
        "extracted": {
            "name": "John Doe",
            # ... full profile
        }
    }
    
    # Verify persist Lambda gets all required fields
    assert "bucket" in after_llm
    assert "key" in after_llm
    assert "extracted" in after_llm
```

## Running Step Functions Local

### Option 1: Docker
```bash
docker run -p 8083:8083 amazon/aws-stepfunctions-local
```

### Option 2: Manual Testing
Create a test script that executes Lambda functions in sequence:

```python
# tests/integration/run_pipeline.py
def run_full_pipeline(bucket, key):
    """Manually execute pipeline steps in order"""
    # Execute each Lambda in sequence
    # Validate output at each step
    pass
```

## Dependencies

- `pytest`
- `moto[stepfunctions,s3,dynamodb]`
- `boto3`
- AWS Step Functions Local (optional)

## Related Issues

- #[integration-tests-dynamodb] - DynamoDB integration
- #[integration-tests-s3] - S3 integration
- #[integration-tests-failure-paths] - Failure scenarios
- #[golden-dataset] - End-to-end validation with real data
