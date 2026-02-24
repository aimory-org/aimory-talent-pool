# AIMORY Testing Strategy - GitHub Issues

This directory contains comprehensive GitHub Issues for implementing a complete test strategy for the AIMORY AI-powered resume ingestion pipeline.

## Overview

These issues provide detailed specifications for implementing:
- Unit tests for all Lambda handlers
- Contract tests for external services (Bedrock, Textract)
- Integration tests with mocked AWS services
- Golden dataset regression testing
- Performance and cost guardrails
- CI/CD pipeline with quality gates

## Issue Categories

### Unit Tests (Issues #01-05)

**#01 - Unit Tests: Lambda Handler Input Validation**
- Validate inputs for all Lambda functions
- Handle missing/malformed data gracefully
- Test all 8 Lambda handlers

**#02 - Unit Tests: PDF Routing Logic**
- Test classification logic (searchable vs scanned PDF)
- Verify skip_textract decision making
- Handle edge cases (empty files, boundary conditions)

**#03 - Unit Tests: LLM Prompt Builder Logic**
- Test prompt construction for Bedrock
- Validate token/size limits
- Ensure schema is correctly embedded

**#04 - Unit Tests: JSON Schema Validation**
- Test LLM output parsing
- Validate profile structure against schema
- Enforce enum values, types, constraints

**#05 - Unit Tests: Idempotency Logic**
- Test duplicate resume processing
- Verify DynamoDB updates (not duplicates)
- Test retry scenarios

### Contract Tests (Issues #06-08)

**#06 - Contract Tests: Mock Bedrock Responses**
- Mock valid/invalid LLM responses
- Handle malformed JSON, hallucinations
- Test Bedrock API errors

**#07 - Contract Tests: Mock Textract Output**
- Mock Textract responses and status codes
- Test block structure parsing
- Handle Textract failures

**#08 - Contract Tests: Schema Validation Enforcement**
- Verify schema definition is valid
- Test all validation functions
- Ensure schema consistency across Lambdas

### Integration Tests (Issues #09-12)

**#09 - Integration Tests: Lambda + DynamoDB Local**
- Test persistence with local DynamoDB
- Verify data transformations (Decimal conversion)
- Test concurrent updates

**#10 - Integration Tests: Lambda + S3 Mock**
- Test S3 operations with moto
- Validate file uploads/downloads
- Handle S3 errors

**#11 - Integration Tests: Step Functions Orchestration**
- Test happy path (searchable PDF, scanned PDF, DOCX)
- Verify state transitions
- Validate data flow between states

**#12 - Integration Tests: Failure Path Simulation**
- Test all error scenarios
- Verify error handling
- Test Step Functions failure routing

### Regression & Performance (Issues #13-14)

**#13 - Golden Dataset: Regression Test Suite**
- Create 5+ diverse sample resumes
- Test extraction quality
- Prevent regressions with baseline

**#14 - Performance + Cost Guardrails**
- Test prompt size limits
- Limit Bedrock/Textract calls
- Monitor timeout thresholds
- Estimate costs per resume

### CI/CD (Issue #15)

**#15 - CI/CD Pipeline: Comprehensive Quality Checks**
- Linting and formatting (flake8, black, pylint)
- Type checking (mypy)
- Test execution (pytest)
- Coverage enforcement (>80%)
- Security scanning (pip-audit, bandit, gitleaks)
- Infrastructure validation (terraform, tflint, checkov)

## Implementation Order

Recommended implementation order for maximum value:

### Phase 1: Foundation (Weeks 1-2)
1. Issue #01 - Input validation tests
2. Issue #04 - JSON schema validation tests
3. Issue #15 - Basic CI/CD pipeline (linting, formatting)

### Phase 2: Core Functionality (Weeks 3-4)
4. Issue #02 - PDF routing logic tests
5. Issue #03 - Prompt builder tests
6. Issue #05 - Idempotency tests
7. Issue #06 - Mock Bedrock responses

### Phase 3: External Services (Weeks 5-6)
8. Issue #07 - Mock Textract responses
9. Issue #08 - Schema validation enforcement
10. Issue #09 - DynamoDB integration tests
11. Issue #10 - S3 integration tests

### Phase 4: End-to-End (Weeks 7-8)
12. Issue #11 - Step Functions orchestration
13. Issue #12 - Failure path simulation
14. Issue #13 - Golden dataset regression

### Phase 5: Production Readiness (Week 9)
15. Issue #14 - Performance & cost guardrails
16. Issue #15 - Complete CI/CD pipeline (security, coverage)

## Quick Start

### For Developers

1. **Pick an issue** from the list above
2. **Read the full issue** in the corresponding `.md` file
3. **Follow the implementation guidelines** provided
4. **Run tests locally** before submitting PR
5. **Ensure CI passes** before merging

### For Project Managers

Each issue includes:
- Clear description and rationale
- Detailed acceptance criteria
- Implementation guidelines with code examples
- Related issues and dependencies
- Estimated effort indicators

### Running Tests Locally

```bash
# Install test dependencies
pip install -r requirements-test.txt

# Run unit tests
pytest tests/unit/ -v

# Run integration tests
pytest tests/integration/ -v

# Run with coverage
pytest tests/ --cov=infra/modules/lambdas/lambda_src --cov-report=html

# Run specific test category
pytest -m unit
pytest -m integration
pytest -m contract
```

## File Structure

After implementation, the test structure should look like:

```
tests/
├── unit/
│   ├── test_classify.py
│   ├── test_llm_extract.py
│   ├── test_normalize.py
│   ├── test_persist.py
│   └── ...
├── contract/
│   ├── test_bedrock_contract.py
│   ├── test_textract_contract.py
│   └── test_schema_validation_contract.py
├── integration/
│   ├── test_dynamodb_integration.py
│   ├── test_s3_integration.py
│   ├── test_step_functions_integration.py
│   └── test_failure_paths.py
├── fixtures/
│   ├── golden_dataset/
│   │   ├── 01_standard_searchable.pdf
│   │   ├── 02_scanned_resume.pdf
│   │   └── ...
│   └── bedrock_responses.json
├── test_golden_dataset.py
└── test_performance_guardrails.py
```

## Success Metrics

Track progress using these metrics:

- [ ] **Test Coverage**: >80% overall, >90% for critical paths
- [ ] **CI Success Rate**: >95% of PR checks pass
- [ ] **Bug Detection**: Tests catch regressions before production
- [ ] **Cost Predictability**: Costs stay within projected ranges
- [ ] **Deployment Confidence**: Zero-downtime deployments with test coverage

## Contributing

When implementing these issues:

1. ✅ Follow the acceptance criteria exactly
2. ✅ Use the provided code examples as templates
3. ✅ Add tests for edge cases not covered in the issue
4. ✅ Update documentation as needed
5. ✅ Ensure all tests pass locally before PR
6. ✅ Request review from at least one team member

## Questions?

For questions about specific issues, refer to:
- The detailed issue file (`.md` in this directory)
- Related issues listed at the bottom of each issue
- The main repository README

---

**Total Issues**: 15
**Estimated Effort**: 9-10 weeks for full implementation
**Priority**: High - Critical for production readiness
