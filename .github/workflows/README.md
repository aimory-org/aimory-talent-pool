# CI/CD Workflows

Every pull request targeting `main` must pass all PR workflows before merge.
Merging to `main` triggers the deploy workflow automatically (subject to environment approval gates).

---

## Pull Request Workflows

### `pr-lambda-tests.yml` — Lambda Tests
**Triggers:** any PR touching Python source files.

| Step | Tool | Purpose |
|------|------|---------|
| Auto-fix style | `ruff --fix`, `black` | Automatically commits style fixes back to the PR branch so the author doesn't have to |
| Lint | `ruff` | Enforces import order, unused variables, whitespace — fails if anything remains after auto-fix |
| Format check | `black` | Enforces consistent Python formatting |
| Type checking | `mypy` | Static type analysis across all Lambda source directories; catches type errors before runtime |
| SAST | `bandit` | Security linter — flags medium+ severity issues (e.g. hardcoded secrets, shell injection, insecure deserialization). Findings uploaded to GitHub **Security → Code Scanning** as SARIF |
| Dependency CVEs | `pip-audit` | Scans `requirements-dev.txt` and layer `requirements.txt` files against the PyPI advisory database |
| Unit tests | `pytest` + `moto` | Runs all tests in `infra/tests/unit/`. All AWS calls are mocked with moto — no real AWS credentials needed. Coverage report posted as a PR comment |

**Python source directories scanned:**
- `infra/modules/api/lambda_src/`
- `infra/modules/document_pipeline/lambda_src/`
- `infra/modules/jobs/lambda_src/`
- `infra/modules/storage/lambda_src/`
- `infra/pipeline_configs/`

---

### `pr-frontend-tests.yml` — Frontend Tests
**Triggers:** any PR touching `frontend/web/**`.

| Step | Tool | Purpose |
|------|------|---------|
| Dependency CVEs | `npm audit --audit-level=high` | Fails the PR if any high or critical CVEs are found in `package-lock.json` |
| Auto-fix style | `eslint --fix` | Automatically commits lint fixes back to the PR branch |
| Lint | `eslint` | Enforces code style, React hooks rules, unused imports, etc. |
| Type check (app) | `tsc --noEmit` | TypeScript compilation check for the production bundle |
| Type check (tests) | `tsc --noEmit -p tsconfig.test.json` | TypeScript compilation check for test files |
| Tests + coverage | `vitest` + `@vitest/coverage-v8` | Runs all component and utility tests; coverage report uploaded as a PR artifact |

---

### `pr-terraform-plan.yml` — Terraform Plan
**Triggers:** any PR touching `infra/**`.

| Step | Tool | Purpose |
|------|------|---------|
| Auto-fix formatting | `terraform fmt` | Automatically commits format fixes back to the PR branch |
| Format check | `terraform fmt -check` | Fails if any `.tf` files are not canonically formatted |
| Init | `terraform init` | Initialises providers and modules |
| Validate | `terraform validate` | Checks configuration syntax and internal consistency |
| IaC lint | `tflint` + AWS ruleset | Checks for deprecated syntax, unused declarations, naming conventions, missing type annotations, and AWS-specific best practices. Configured via `.tflint.hcl` |
| IaC security scan | `checkov` | Scans Terraform resources against 1000+ security and compliance checks. Findings uploaded to GitHub **Security → Code Scanning** as SARIF. Accepted-risk suppressions documented in `.checkov.yaml` |
| Plan | `terraform plan` | Produces a full execution plan; output posted as a PR comment |

---

### `pr-security.yml` — Secret Scanning
**Triggers:** every PR targeting `main`.

| Step | Tool | Purpose |
|------|------|---------|
| Secret scanning | `gitleaks` | Scans the full commit history of the PR for hardcoded secrets, API keys, tokens, and credentials. Findings posted as PR annotations and to GitHub **Security → Code Scanning** |

To suppress a false positive, add a `# gitleaks:allow` inline comment or add a rule to `.gitleaks.toml` at the repo root.

---

## Deploy Workflow

### `merge-deploy.yml` — Deploy to Dev
**Triggers:** push to `main` (i.e. after PR merge).

Runs against the `dev` GitHub Environment. If **Required reviewers** are configured on that environment (Settings → Environments → dev → Protection rules), a manual approval is required before the deploy proceeds.

| Step | What it does |
|------|-------------|
| Terraform apply | Plans and applies all infrastructure changes to AWS |
| Frontend build | Builds the Vite app with production environment variables |
| S3 sync | Uploads the built frontend to the CloudFront origin S3 bucket |
| CloudFront invalidation | Clears the CDN cache so users see the new version immediately |

---

## Dependency Updates

Dependabot (`.github/dependabot.yml`) opens weekly PRs to bump outdated dependencies:

| Ecosystem | Scope |
|-----------|-------|
| `pip` | `requirements-dev.txt` |
| `npm` | `frontend/web/package.json` |
| `github-actions` | All workflow `uses:` references |

Minor and patch bumps are grouped into a single PR per ecosystem to reduce noise. Major version bumps get individual PRs.

---

## Security Findings

SARIF results from `bandit` (Python SAST) and `checkov` (IaC security) are uploaded to GitHub's **Security → Code Scanning** tab. Findings:
- Appear as inline annotations on the exact file and line in the PR diff
- Persist until dismissed with a reason
- Are tracked across PRs so regressions are visible

Gitleaks findings appear in **Security → Code Scanning** and as PR check annotations.
