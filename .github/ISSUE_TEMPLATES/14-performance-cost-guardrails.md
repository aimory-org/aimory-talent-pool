---
title: "Performance + Cost Guardrails: Limits and Thresholds"
labels: testing, performance, cost-optimization, guardrails
---

## Description

Implement automated tests and guardrails to ensure the AIMORY pipeline operates within performance and cost constraints. These tests prevent runaway costs from excessive API calls, oversized prompts, and inefficient processing.

## Why It Matters

- **Cost Control**: Prevent unexpected AWS bills (Bedrock, Textract are expensive)
- **Performance**: Ensure pipeline completes within SLA
- **Resource Limits**: Respect AWS service quotas
- **Predictability**: Make costs and performance predictable
- **Early Warning**: Catch performance regressions before production

## Test Scenarios

### Prompt Size Limits

#### Bedrock Token Limits
- [ ] **Prompt size calculation** - Estimate token count before API call
- [ ] **Claude Haiku limit** - 200k context window (but limit to ~10k for efficiency)
- [ ] **Resume text truncation** - Warn or truncate if resume >20k characters
- [ ] **Schema size** - JSON schema in prompt <2k characters
- [ ] **Total prompt** - System + user prompt <15k tokens (~60k chars)

#### Test Cases
```python
def test_prompt_stays_under_token_limit():
    """Ensure prompts don't exceed reasonable token limit"""
    # Create a large resume text
    large_resume = "Lorem ipsum " * 5000  # ~60k characters
    
    schema_str = json.dumps(TALENT_SCHEMA, indent=2)
    user_prompt = f"""Target JSON schema:
  {schema_str}

  Resume text:
  {large_resume}
  """
    
    # Rough token estimate: 1 token ≈ 4 characters
    estimated_tokens = len(user_prompt) // 4
    
    # Should be under 15k tokens for efficiency
    assert estimated_tokens < 15000, f"Prompt too large: {estimated_tokens} tokens"

def test_resume_text_length_warning():
    """Warn if resume text exceeds recommended length"""
    max_resume_chars = 20000  # 20k characters
    
    # Simulate very long resume
    long_resume = "x" * 25000
    
    if len(long_resume) > max_resume_chars:
        # Should log warning or truncate
        assert True  # In real code, verify warning is logged
```

### Bedrock Call Limits

#### Max Calls Per Resume
- [ ] **Single Bedrock call** per resume (no retries for extraction)
- [ ] **Rate limiting** - Respect Bedrock TPS limits
- [ ] **Batch processing** - If processing multiple resumes, throttle

#### Test Cases
```python
def test_single_bedrock_call_per_resume(mocker):
    """Verify only one Bedrock call per resume"""
    mock_bedrock = mocker.patch("llm_extract.app.client")
    mock_bedrock.converse.return_value = {
        "output": {
            "message": {
                "content": [{"text": '{"name": "Test"}'}]
            }
        }
    }
    
    from llm_extract.app import handler
    
    event = {"normalized": {"text": "Resume text"}}
    handler(event, None)
    
    # Should be called exactly once
    assert mock_bedrock.converse.call_count == 1

def test_no_retry_on_valid_response(mocker):
    """Ensure no retries if valid JSON returned"""
    mock_bedrock = mocker.patch("llm_extract.app.client")
    mock_bedrock.converse.return_value = {
        "output": {
            "message": {
                "content": [{"text": json.dumps(valid_profile)}]
            }
        }
    }
    
    from llm_extract.app import handler
    
    event = {"normalized": {"text": "Resume text"}}
    result = handler(event, None)
    
    # No retries
    assert mock_bedrock.converse.call_count == 1
```

### Textract Call Limits

#### Max Textract Calls
- [ ] **One start_document_text_detection** per scanned resume
- [ ] **Polling limit** - Max 20 status checks (with 10s wait = 200s total)
- [ ] **No duplicate jobs** - Don't start Textract if already running

#### Test Cases
```python
def test_textract_polling_limit():
    """Ensure Textract polling doesn't run indefinitely"""
    # Check Step Functions state machine
    with open("infra/modules/step_functions/state_machine.asl.json") as f:
        state_machine = json.load(f)
    
    # Verify WaitBeforeCheck has reasonable wait time
    wait_state = state_machine["States"]["WaitBeforeCheck"]
    assert wait_state["Seconds"] == 10
    
    # Total state machine timeout should prevent infinite loops
    assert state_machine["TimeoutSeconds"] == 600  # 10 minutes max

def test_textract_not_called_for_searchable_pdf(mocker):
    """Verify Textract skipped for searchable PDFs"""
    # This saves money - searchable PDFs don't need OCR
    
    mock_textract = mocker.patch("start_textract.app.textract")
    
    # Simulate full pipeline with searchable PDF
    # Textract should never be called
    
    # ... (run pipeline simulation)
    
    assert mock_textract.start_document_text_detection.call_count == 0
```

### Timeout Thresholds

#### Lambda Timeouts
- [ ] **classify**: 30 seconds
- [ ] **start_textract**: 10 seconds
- [ ] **check_textract**: 10 seconds
- [ ] **fetch_textract**: 30 seconds
- [ ] **normalize**: 30 seconds
- [ ] **llm_extract**: 60 seconds (Bedrock can be slow)
- [ ] **persist**: 10 seconds

#### Step Functions Timeout
- [ ] **Total workflow**: 600 seconds (10 minutes)
- [ ] **Textract polling**: Max 200 seconds (20 checks × 10s)

#### Test Cases
```python
def test_lambda_timeout_configuration():
    """Verify Lambda timeout configurations are reasonable"""
    # This would check Terraform configs
    # For now, document expected timeouts
    
    expected_timeouts = {
        "classify": 30,
        "start_textract": 10,
        "check_textract": 10,
        "fetch_textract": 30,
        "normalize": 30,
        "llm_extract": 60,
        "persist": 10
    }
    
    # In real implementation, parse Terraform and verify
    assert True

def test_step_functions_timeout():
    """Verify Step Functions has reasonable timeout"""
    with open("infra/modules/step_functions/state_machine.asl.json") as f:
        state_machine = json.load(f)
    
    assert state_machine["TimeoutSeconds"] == 600

@pytest.mark.timeout(60)
def test_llm_extract_completes_within_timeout():
    """Ensure LLM extraction completes within 60 seconds"""
    # This test itself has 60s timeout
    # If it takes longer, pytest will fail it
    
    # ... (run LLM extraction with mocked Bedrock)
    pass
```

### Cost Estimation Tests

#### Per-Resume Cost Calculation
- [ ] **Textract cost**: $1.50 per 1000 pages (estimate $0.0015 per page)
- [ ] **Bedrock cost**: $0.00025 per 1k input tokens + $0.00125 per 1k output tokens
- [ ] **DynamoDB cost**: Minimal with on-demand pricing
- [ ] **S3 cost**: Negligible for small files

#### Test Cases
```python
def test_estimate_cost_per_resume():
    """Estimate cost per resume processing"""
    
    # Textract (for scanned resume)
    textract_cost_per_page = 0.0015
    avg_pages = 2
    textract_cost = textract_cost_per_page * avg_pages  # $0.003
    
    # Bedrock (Claude Haiku)
    input_cost_per_1k_tokens = 0.00025
    output_cost_per_1k_tokens = 0.00125
    
    avg_input_tokens = 3000  # ~12k characters
    avg_output_tokens = 500  # ~2k characters
    
    bedrock_cost = (
        (avg_input_tokens / 1000) * input_cost_per_1k_tokens +
        (avg_output_tokens / 1000) * output_cost_per_1k_tokens
    )  # ~$0.0013
    
    # Total cost per resume
    total_cost = textract_cost + bedrock_cost  # ~$0.0043
    
    # Ensure cost is under threshold
    assert total_cost < 0.01, f"Cost per resume too high: ${total_cost:.4f}"
    
    print(f"Estimated cost per resume: ${total_cost:.4f}")

def test_batch_cost_projection():
    """Project cost for processing 1000 resumes"""
    cost_per_resume = 0.0043
    batch_size = 1000
    
    total_cost = cost_per_resume * batch_size  # $4.30
    
    # Should be under $10 for 1000 resumes
    assert total_cost < 10, f"Batch cost too high: ${total_cost:.2f}"
    
    print(f"Estimated cost for {batch_size} resumes: ${total_cost:.2f}")
```

### Memory and Resource Limits

#### Lambda Memory
- [ ] **classify**: 512 MB (PDF parsing can be memory-intensive)
- [ ] **normalize**: 256 MB
- [ ] **llm_extract**: 256 MB
- [ ] **persist**: 256 MB

#### Test Cases
```python
def test_memory_usage_classification():
    """Ensure classify Lambda doesn't exceed memory limit"""
    import tracemalloc
    
    tracemalloc.start()
    
    # Process a large PDF
    with open("tests/fixtures/large_resume.pdf", "rb") as f:
        pdf_bytes = f.read()
    
    # Simulate PDF text extraction
    from classify.app import _extract_pdf_text
    text = _extract_pdf_text(pdf_bytes)
    
    current, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    
    # Should be under 512 MB
    assert peak < 512 * 1024 * 1024, f"Peak memory: {peak / 1024 / 1024:.2f} MB"

def test_s3_object_size_limit():
    """Verify resume size limits"""
    max_resume_size = 10 * 1024 * 1024  # 10 MB
    
    # Test with a large file
    large_file_size = 15 * 1024 * 1024  # 15 MB
    
    if large_file_size > max_resume_size:
        # Should reject or warn
        assert True  # In real code, verify rejection
```

## Acceptance Criteria

- [ ] Test file `test_performance_guardrails.py` created
- [ ] Tests verify prompt size limits
- [ ] Tests verify Bedrock call limits (1 per resume)
- [ ] Tests verify Textract call limits
- [ ] Tests verify timeout configurations
- [ ] Tests estimate cost per resume
- [ ] Tests project batch processing costs
- [ ] Tests verify memory usage stays within limits
- [ ] All tests pass with `pytest`
- [ ] Performance baseline documented
- [ ] Cost projections documented

## Monitoring and Alerts

Add CloudWatch alarms (separate issue):
- [ ] Lambda duration exceeds threshold
- [ ] Lambda memory usage >80%
- [ ] Step Functions execution time >8 minutes
- [ ] Bedrock throttling errors
- [ ] Textract throttling errors
- [ ] Daily cost exceeds budget

## Documentation

Create `docs/performance_guardrails.md`:
```markdown
# Performance and Cost Guardrails

## Limits
- Max prompt size: 15k tokens (~60k chars)
- Max resume text: 20k characters
- Bedrock calls: 1 per resume
- Textract polling: Max 20 checks (200s)
- Total workflow: 600s timeout

## Cost Estimates
- Scanned resume: ~$0.0043
- Searchable PDF: ~$0.0013
- 1000 resumes: ~$4.30

## Thresholds
- Lambda timeouts: 10-60 seconds
- Memory: 256-512 MB
```

## Dependencies

- `pytest`
- `pytest-timeout`
- `tracemalloc` (Python stdlib)

## Related Issues

- #[integration-tests-step-functions] - Workflow testing
- #[golden-dataset] - Real-world performance testing
- #[ci-cd-pipeline] - CI performance checks
