---
title: "CI/CD Pipeline: Comprehensive Testing and Quality Checks"
labels: ci-cd, testing, github-actions, automation, devops
---

## Description

Implement a comprehensive CI/CD pipeline using GitHub Actions that automatically runs linting, formatting, type checking, tests, security scans, and coverage analysis on every pull request and commit to main branch.

## Why It Matters

- **Quality Assurance**: Catch bugs before they reach production
- **Consistency**: Enforce code style and standards
- **Security**: Detect vulnerabilities early
- **Automation**: Reduce manual review burden
- **Confidence**: Deploy with confidence knowing tests pass
- **Documentation**: CI status shows project health

## Pipeline Components

### 1. Linting and Formatting

#### Python Code Linting
- [ ] **flake8** - PEP 8 compliance, code smells
- [ ] **pylint** - Advanced linting, code quality
- [ ] **black** - Code formatting (check mode in CI)
- [ ] **isort** - Import sorting

#### Configuration Files
```ini
# .flake8
[flake8]
max-line-length = 100
exclude = .git,__pycache__,venv,.terraform
ignore = E203, W503  # black compatibility

# pyproject.toml
[tool.black]
line-length = 100
target-version = ['py312']

[tool.isort]
profile = "black"
line_length = 100
```

#### GitHub Actions Workflow
```yaml
name: Lint and Format

on:
  pull_request:
  push:
    branches: [main]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      
      - name: Install dependencies
        run: |
          pip install flake8 pylint black isort
          pip install -r infra/modules/lambdas/requirements.txt
      
      - name: Run flake8
        run: flake8 infra/modules/lambdas/lambda_src/
      
      - name: Run pylint
        run: pylint infra/modules/lambdas/lambda_src/ --fail-under=8.0
      
      - name: Check black formatting
        run: black --check infra/modules/lambdas/lambda_src/
      
      - name: Check isort
        run: isort --check-only infra/modules/lambdas/lambda_src/
```

### 2. Type Checking

#### mypy - Static Type Checking
- [ ] **mypy** for Python type checking
- [ ] **Type hints** in Lambda functions
- [ ] **Strict mode** (optional, gradual adoption)

#### Configuration
```ini
# mypy.ini
[mypy]
python_version = 3.12
warn_return_any = True
warn_unused_configs = True
disallow_untyped_defs = False  # Start lenient, then tighten
ignore_missing_imports = True

[mypy-tests.*]
ignore_errors = True
```

#### GitHub Actions
```yaml
- name: Run mypy
  run: mypy infra/modules/lambdas/lambda_src/ --config-file mypy.ini
```

### 3. Test Execution

#### Test Stages
- [ ] **Unit tests** - Fast, isolated tests
- [ ] **Contract tests** - Mock external services
- [ ] **Integration tests** - With mocked AWS services
- [ ] **Regression tests** - Golden dataset

#### GitHub Actions Workflow
```yaml
name: Tests

on:
  pull_request:
  push:
    branches: [main]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      
      - name: Install dependencies
        run: |
          pip install pytest pytest-cov pytest-mock pytest-timeout
          pip install -r requirements-test.txt
      
      - name: Run unit tests
        run: pytest tests/unit/ -v --cov=infra/modules/lambdas/lambda_src --cov-report=xml
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          file: ./coverage.xml
          flags: unittests
  
  integration-tests:
    runs-on: ubuntu-latest
    services:
      dynamodb-local:
        image: amazon/dynamodb-local
        ports:
          - 8000:8000
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      
      - name: Install dependencies
        run: |
          pip install pytest moto boto3
          pip install -r requirements-test.txt
      
      - name: Run integration tests
        run: pytest tests/integration/ -v
        env:
          DYNAMODB_ENDPOINT: http://localhost:8000
  
  golden-dataset:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      
      - name: Install dependencies
        run: pip install -r requirements-test.txt
      
      - name: Run golden dataset tests
        run: pytest tests/test_golden_dataset.py -v --tb=short
```

### 4. Test Coverage Threshold

#### Coverage Requirements
- [ ] **Overall coverage**: >80%
- [ ] **Critical paths**: >90% (validation, extraction)
- [ ] **Report generation**: HTML and XML
- [ ] **PR comments**: Coverage diff on PRs

#### Configuration
```ini
# .coveragerc
[run]
source = infra/modules/lambdas/lambda_src
omit = 
    */tests/*
    */venv/*
    */__pycache__/*

[report]
precision = 2
show_missing = True
skip_covered = False

[html]
directory = htmlcov
```

#### GitHub Actions
```yaml
- name: Check coverage threshold
  run: |
    coverage report --fail-under=80
    coverage html
  
- name: Upload coverage report
  uses: actions/upload-artifact@v3
  with:
    name: coverage-report
    path: htmlcov/
```

### 5. Security Scanning

#### Dependency Vulnerability Scanning
- [ ] **pip-audit** - Check for known vulnerabilities in dependencies
- [ ] **safety** - Alternative security scanner
- [ ] **Dependabot** - Automated dependency updates

#### Secrets Scanning
- [ ] **gitleaks** - Detect hardcoded secrets
- [ ] **trufflehog** - Secret detection
- [ ] **GitHub Secret Scanning** - Built-in

#### Code Security
- [ ] **bandit** - Python security linter
- [ ] **semgrep** - Advanced SAST

#### GitHub Actions
```yaml
name: Security Scan

on:
  pull_request:
  push:
    branches: [main]
  schedule:
    - cron: '0 0 * * 0'  # Weekly

jobs:
  dependency-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      
      - name: Install dependencies
        run: |
          pip install pip-audit safety
          pip install -r infra/modules/lambdas/requirements.txt
      
      - name: Run pip-audit
        run: pip-audit
      
      - name: Run safety check
        run: safety check --json
  
  secrets-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Full history for gitleaks
      
      - name: Run gitleaks
        uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  
  code-security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      
      - name: Install bandit
        run: pip install bandit
      
      - name: Run bandit
        run: bandit -r infra/modules/lambdas/lambda_src/ -f json -o bandit-report.json
      
      - name: Upload bandit report
        uses: actions/upload-artifact@v3
        with:
          name: bandit-report
          path: bandit-report.json
      
      - name: Run Semgrep
        uses: returntocorp/semgrep-action@v1
        with:
          config: auto
```

### 6. Infrastructure Validation

#### Terraform
- [ ] **terraform fmt** - Format check
- [ ] **terraform validate** - Syntax validation
- [ ] **tflint** - Terraform linting
- [ ] **checkov** - IaC security scanning

#### GitHub Actions
```yaml
name: Terraform

on:
  pull_request:
    paths:
      - 'infra/**'
  push:
    branches: [main]
    paths:
      - 'infra/**'

jobs:
  terraform:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Terraform
        uses: hashicorp/setup-terraform@v2
      
      - name: Terraform Format
        run: terraform fmt -check -recursive infra/
      
      - name: Terraform Init
        run: cd infra/envs/dev && terraform init -backend=false
      
      - name: Terraform Validate
        run: cd infra/envs/dev && terraform validate
      
      - name: Run tflint
        uses: terraform-linters/setup-tflint@v3
      
      - name: tflint
        run: tflint --init && tflint infra/
      
      - name: Run Checkov
        uses: bridgecrewio/checkov-action@master
        with:
          directory: infra/
          framework: terraform
          output_format: json
```

### 7. PR Quality Checks

#### Required Checks
- [ ] All tests pass
- [ ] Coverage threshold met
- [ ] No linting errors
- [ ] No security vulnerabilities (or acknowledged)
- [ ] Type checking passes
- [ ] Terraform validates

#### Branch Protection Rules
```yaml
# .github/settings.yml (using probot/settings)
branches:
  - name: main
    protection:
      required_pull_request_reviews:
        required_approving_review_count: 1
      required_status_checks:
        strict: true
        contexts:
          - lint
          - unit-tests
          - integration-tests
          - security-scan
          - terraform
      enforce_admins: false
      restrictions: null
```

## Acceptance Criteria

- [ ] GitHub Actions workflows created in `.github/workflows/`
  - [ ] `lint.yml` - Linting and formatting
  - [ ] `test.yml` - Unit and integration tests
  - [ ] `security.yml` - Security scans
  - [ ] `terraform.yml` - Infrastructure validation
- [ ] All workflows run on PR and main branch
- [ ] Coverage reports uploaded to Codecov or similar
- [ ] Security scan results visible in PR
- [ ] Branch protection rules configured
- [ ] README badge showing CI status
- [ ] Documentation for running checks locally
- [ ] All checks pass on current codebase

## Local Development

Create `Makefile` for local checks:

```makefile
.PHONY: lint format test coverage security

lint:
	flake8 infra/modules/lambdas/lambda_src/
	pylint infra/modules/lambdas/lambda_src/
	mypy infra/modules/lambdas/lambda_src/

format:
	black infra/modules/lambdas/lambda_src/
	isort infra/modules/lambdas/lambda_src/

test:
	pytest tests/ -v

coverage:
	pytest tests/ --cov=infra/modules/lambdas/lambda_src --cov-report=html
	open htmlcov/index.html

security:
	pip-audit
	bandit -r infra/modules/lambdas/lambda_src/
	gitleaks detect --source . --verbose

all: format lint test coverage security
```

## Dependencies

Create `requirements-dev.txt`:
```
# Testing
pytest==7.4.3
pytest-cov==4.1.0
pytest-mock==3.12.0
pytest-timeout==2.2.0
moto[all]==4.2.9

# Linting
flake8==7.0.0
pylint==3.0.3
black==23.12.1
isort==5.13.2
mypy==1.8.0

# Security
pip-audit==2.6.1
safety==3.0.1
bandit==1.7.6

# Infrastructure
terraform-compliance==1.3.44
checkov==3.1.34
```

## Related Issues

- #[unit-tests-*] - All unit test issues
- #[integration-tests-*] - All integration test issues
- #[golden-dataset] - Regression testing
- #[performance-guardrails] - Performance checks
