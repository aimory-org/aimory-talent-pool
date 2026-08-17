# Infrastructure

Terraform-managed AWS infrastructure for the AIMORY Talent Pool platform. This directory contains all the infrastructure-as-code for deploying the resume processing pipeline, API, frontend hosting, and authentication.

## Folder Structure

```
infra/
├── bootstrap-state/          # One-time setup for Terraform state backend
│   └── main.tf               # Creates S3 bucket + DynamoDB table for state
├── envs/
│   └── dev/                  # Development environment
│       ├── backend.tf        # S3 backend configuration
│       ├── modules.tf        # Module composition
│       ├── variables.tf      # Input variable definitions
│       ├── terraform.tfvars  # Your values (not in git)
│       └── terraform.tfvars.example
└── modules/
    ├── api/                  # API Gateway + Lambda endpoints
    │   └── lambda_src/       # Python handlers (list_talents, get_talent, etc.)
    ├── auth/                 # Cognito User Pool + Microsoft Entra ID federation
    ├── certificate/          # ACM cert for the custom domain (DNS stays at Namecheap)
    ├── document_pipeline/    # Reusable document processing pipeline (see its README)
    │   ├── lambda_src/       # Shared Lambdas (starter, classify, textract, gather_text, llm_extract)
    │   └── layers/           # Custom Lambda layers (pdfminer)
    ├── frontend/             # S3 + CloudFront static hosting
    ├── jobs/                 # Scheduled background jobs (stale checker, lookup dedup)
    │   └── lambda_src/
    ├── pipeline/             # [Legacy] Original resume pipeline — migrating to document_pipeline
    └── storage/              # DynamoDB tables + S3 buckets + OpenSearch domain
        └── lambda_src/       # DynamoDB→OpenSearch sync Lambda

pipeline_configs/             # Per-pipeline config (schema, prompt, hooks, persist)
├── resume/                   # Resume pipeline config
│   ├── schema.json
│   ├── prompt.txt
│   ├── hooks.py
│   └── persist/app.py
└── <future>/                 # Add new pipeline types here
```

## Before First Deploy

Two things are gitignored and must be built locally before `terraform apply` can run:

| What | Why gitignored |
|------|---------------|
| `modules/document_pipeline/layers/pdfminer/python/` | Large compiled packages |
| `modules/storage/layers/opensearch/python/` | Large compiled packages |

Run the build script once after every fresh clone, and again whenever a `requirements.txt` changes:

**Linux / macOS / CI (Docker — recommended):**
```bash
cd infra
./build.sh
```

**Linux / macOS without Docker:**
```bash
cd infra
./build.sh --no-docker   # requires python3.12 on PATH
```

**Windows (PowerShell, Docker):**
```powershell
cd infra
.\build.ps1
```

**Windows without Docker:**
```powershell
.\build.ps1 -NoDocker   # requires python 3.12 on PATH
```

After the build, continue with the normal Terraform workflow:
```bash
cd infra/envs/dev
cp terraform.tfvars.example terraform.tfvars  # fill in your values
terraform init
terraform plan
terraform apply
```

### CI/CD

Add the build script as a step before `terraform init` in your pipeline, e.g. GitHub Actions:
```yaml
- name: Build Lambda layers and artefacts
  run: ./infra/build.sh
```

Docker is available in all standard GitHub Actions runners, so no extra setup is needed.

## Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                Users                                     │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                   ┌─────────────────▼─────────────────┐
                   │           CloudFront              │
                   │      (CDN + SPA Hosting)          │
                   └─────────────────┬─────────────────┘
                                     │
                   ┌─────────────────▼─────────────────┐
                   │         S3 Static Site            │
                   │        (React Frontend)           │
                   └─────────────────┬─────────────────┘
                                     │
         ┌───────────────────────────┼───────────────────────────┐
         │                           │                           │
         ▼                           ▼                           ▼
┌─────────────────┐      ┌──────────────────┐      ┌──────────────────┐
│  Microsoft      │      │   API Gateway    │      │   S3 Resumes     │
│  Entra ID       │      │   (REST API)     │      │   Bucket         │
│  (Login)        │      └────────┬─────────┘      └────────┬─────────┘
└────────┬────────┘               │                         │
         │                        │                         │ S3 Event
         ▼              ┌─────────▼─────────┐               │
┌─────────────────┐     │  JWT Authorizer   │               ▼
│  AWS Cognito    │◀───▶│  (validates token │      ┌──────────────────┐
│  (Token Issuer) │     │   against Cognito)│      │  Step Functions  │
└─────────────────┘     └─────────┬─────────┘      │  (Pipeline)      │
                                  │                └────────┬─────────┘
                                  ▼                         │
                        ┌──────────────────┐                │
                        │   Lambda APIs    │                │
                        │  (CRUD + Search) │                │
                        └───┬──────────┬───┘                │
                            │          │                    │
                   read/write│          │ search query       │ persist
                            │          │                    │
                            ▼          ▼                    ▼
                   ┌─────────────┐  ┌─────────────┐
                   │  DynamoDB   │  │ OpenSearch   │
                   │  (Talent    │  │ (Search      │
                   │  Profiles)  │  │  Index)      │
                   └──────┬──────┘  └──────▲──────┘
                          │                │
                          │  DynamoDB      │
                          └──Streams───────┘
                            (real-time sync)
```

### Authentication Flow

```
┌──────────┐     ┌─────────────┐     ┌─────────────┐     ┌────────┐
│ Frontend │────▶│ API Gateway │────▶│  Authorizer │────▶│ Lambda │
│  (React) │     │             │     │  (Cognito)  │     │        │
└──────────┘     └─────────────┘     └─────────────┘     └────────┘
     │                                      │
     │ 1. User clicks "Sign in"             │
     │    → Redirects to Microsoft          │
     │                                      │
     │ 2. Microsoft authenticates user      │
     │    → Sends back to Cognito           │
     │                                      │
     │ 3. Cognito issues JWT token          │
     │    → Frontend stores it              │
     │                                      │
     │ 4. API calls include token:          │
     │    Authorization: Bearer <jwt>       │
     │                                      │
     └──────────────────────────────────────┘
                        │
                        ▼
              5. API Gateway validates JWT
                 using Cognito's public keys
                        │
                        ▼
              6. Valid   → Lambda executes
                 Invalid → 401 Unauthorized
```

**How the JWT Authorizer works:**

API Gateway is configured with a "JWT Authorizer" that knows the Cognito User Pool. On every request:

1. Extracts the `Authorization: Bearer <token>` header
2. Fetches Cognito's public keys (JWKS) from `https://cognito-idp.{region}.amazonaws.com/{userPoolId}/.well-known/jwks.json`
3. Validates the token:
   - **Signature** — Cryptographically signed by Cognito
   - **Issuer (`iss`)** — Matches the User Pool URL
   - **Audience (`aud`)** — Matches the app client ID
   - **Expiration (`exp`)** — Token hasn't expired
4. If all checks pass → request continues to Lambda with user claims
5. If any check fails → returns `401 Unauthorized` immediately

**Key benefit:** Lambda code doesn't handle auth — if it runs, the user is authenticated.

### Resume Processing Pipeline

```
┌──────────────┐
│  OneDrive /  │     S3 Event
│  Manual      │────────────────┐
│  Upload      │                │
└──────────────┘                ▼
                        ┌───────────────┐
                        │    starter    │ Triggers Step Functions
                        └───────┬───────┘
                                │
                                ▼
┌───────────────────────────────────────────────────────────────────┐
│                Step Functions Pipeline (Parallel)                  │
│                                                                   │
│  Branch A (AI)                                                     │
│  ┌───────────────────────────────────────────┐                   │
│  │ llm_extract — Claude reads the raw         │                   │
│  │ document (visual for PDFs) → JSON+is_valid │──┐                │
│  └───────────────────────────────────────────┘  │                │
│                                                  ▼                │
│  Branch B (text, for search + dedup)         ┌───────┐  ┌───────┐ │
│  ┌──────────┐  ┌──────────────────┐  ┌──────┐│ Check │─▶│persist│ │
│  │ classify │─▶│ start/check/fetch │─▶│gather││ Valid │  └───────┘ │
│  │ (extract │  │ textract (scanned)│  │ text ││       │            │
│  │  text)   │  └──────────────────┘  └──────┘└───────┘            │
│  └────┬─────┘         ▲                  ▲                        │
│       │ (skip if      │ (wait/poll)      │                        │
│       │  born-digital)└──────────────────┘                        │
│       └───────────────────────────────────┘                       │
│                                                                   │
│  Branches run concurrently; both feed the Merge → Check → persist  │
└───────────────────────────────────────────────────────────────────┘
                                │
                                ▼
                ┌───────────────────────────────┐
                │  S3: extracted/               │
                │  DynamoDB: talent_profiles    │
                └───────────────────────────────┘
```

## Prerequisites

| Requirement | Version | Purpose |
|-------------|---------|---------|
| Terraform | 1.9+ | Infrastructure deployment |
| AWS CLI | v2 | AWS authentication |
| Docker | Latest | Building Lambda layers |
| Python | 3.12 | Lambda runtime compatibility |

## Conventions

### Lookup Tables

All lookup tables (skills, certifications, cities, job_titles, industry_categories, tags)
are exported as a single `lookup_tables` object from the storage module. In `modules.tf`:

```hcl
locals {
  lookup_tables = module.storage.lookup_tables
}
```

Every module that needs lookup tables accepts a single `lookup_tables` variable
instead of 10+ individual name/arn pairs:

```hcl
module "some_module" {
  lookup_tables = local.lookup_tables
  # ...
}
```

### Adding a Document Pipeline

See [modules/document_pipeline/README.md](modules/document_pipeline/README.md)
for the step-by-step guide.

### Naming

- Resource names: `${project_name}-${environment}-<descriptor>`
- Lambda functions: `${prefix}-<function_name>` (e.g. `aimory-talent-pool-dev-starter`)
- DynamoDB tables: `${project_name}-${environment}-<table>` (e.g. `aimory-talent-pool-dev-talent-profiles`)

### AWS Permissions Required

Your IAM user/role needs permissions to manage:
- S3 (buckets, objects, notifications)
- DynamoDB (tables)
- Lambda (functions, layers, event source mappings)
- Step Functions (state machines)
- API Gateway (HTTP APIs)
- Cognito (user pools, identity providers)
- CloudFront (distributions)
- IAM (roles, policies)
- SSM Parameter Store
- Textract
- Bedrock (Claude model access)

## Deployments API Token (Reproducible Secret Setup)

The System Events deployments feed reads a GitHub token from SSM Parameter Store.

- SSM parameter name: `/aimory/github-pat`
- Lambda consumer: `aimory-talent-pool-dev-api-get-deployments`
- CI source of truth: GitHub secret `DEPLOYMENTS_PAT`

On every deploy, the GitHub Actions workflow syncs `DEPLOYMENTS_PAT` into SSM (`SecureString`) before Terraform apply. This keeps the secret out of git and out of Terraform state while remaining reproducible.

## Initial Setup (First Time Only)

### 1. Bootstrap Terraform State Backend

The state backend (S3 bucket + DynamoDB lock table) must exist before deploying the main infrastructure.

```bash
cd infra/bootstrap-state
terraform init
terraform apply
```

This creates:
- `aimory-talent-pool-tfstate-{account_id}` — S3 bucket for state files
- `aimory-talent-pool-tflocks` — DynamoDB table for state locking

### 2. Create Microsoft Entra ID App Registration

Authentication uses Microsoft Entra ID (Azure AD) federated through AWS Cognito.

1. Go to [Azure Portal](https://portal.azure.com) → **Entra ID** → **App registrations** → **New registration**
2. Configure:
   - **Name:** `AIMORY Talent Pool (Dev)`
   - **Supported account types:** Single tenant (or your preference)
   - **Redirect URI:** Web → `https://<cognito-domain>.auth.<region>.amazoncognito.com/oauth2/idpresponse`
     - You'll get the exact Cognito domain after first `terraform apply`
3. After creation, note these values:
   - **Application (client) ID** → `entra_client_id`
   - **Directory (tenant) ID** → `entra_tenant_id`
4. Go to **Certificates & secrets** → **New client secret**
   - Copy the **Value** (not the ID) → `entra_client_secret`
5. Go to **Token configuration** → **Add optional claim** → **ID** → Select `email`

### 3. Configure Terraform Variables

```bash
cd infra/envs/dev
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars` with your values:

```hcl
# General
aws_region   = "us-east-1"
project_name = "aimory-talent-pool"
environment  = "dev"

# Pipeline
presign_api_key    = "your-secure-api-key-min-16-chars"  # Generate a secure key
raw_prefix         = "resumes/raw"
extracted_prefix   = "extracted"
sfn_arn_param_name = "/aimory-talent-pool/dev/resume-pipeline-arn"

# Frontend custom domain — see "Custom Domain" below.
# Do NOT set frontend_hostname here; its default in variables.tf is the source
# of truth so that CI (which only sees TF_VAR_* env) agrees with local applies.
frontend_domain_aliases  = []     # legacy manual path only
frontend_certificate_arn = null   # legacy manual path only

# Cognito OAuth URLs. The custom-domain origin is appended automatically.
cognito_callback_urls = ["http://localhost:5173"]
cognito_logout_urls   = ["http://localhost:5173"]

# Microsoft Entra ID (from step 2)
entra_client_id     = "00000000-0000-0000-0000-000000000000"
entra_client_secret = "your-client-secret-value"
entra_tenant_id     = "00000000-0000-0000-0000-000000000000"
```

> ⚠️ **Security:** Never commit `terraform.tfvars` to git. It contains secrets.

### 4. Build Lambda Layer (Required Before First Deploy)

```bash
# From repo root
./infra/modules/pipeline/lambdas/layers/pdfminer/build_layer_docker.sh
```

This builds the pdfminer layer in a Docker container for Lambda compatibility.

### 5. Deploy Infrastructure

```bash
cd infra/envs/dev
terraform init
terraform plan      # Review changes
terraform apply     # Deploy
```

### 6. Update Entra ID Redirect URI

After the first deploy, get the Cognito domain:

```bash
terraform output cognito_domain
```

Go back to Azure Portal → App registration → **Authentication** → Add the redirect URI:
```
https://<cognito-domain>.auth.<region>.amazoncognito.com/oauth2/idpresponse
```

### 7. Update Cognito Callback URLs (After CloudFront Deploy)

Get the CloudFront URL:
```bash
terraform output frontend_distribution_domain
```

Add it to `cognito_callback_urls` and `cognito_logout_urls` in `terraform.tfvars`,
then `terraform apply` again.

> The **custom-domain** origin (`https://arrow.aimoryconsulting.com`) does *not*
> need to be listed. `modules.tf` appends it to the Cognito allow-lists and the
> API/S3 CORS origins automatically from `frontend_hostname`. Only the raw
> CloudFront URL is manual.

## Custom Domain

The app is reachable at **https://arrow.aimoryconsulting.com**, in addition to
its CloudFront hostname.

### Where DNS lives

**All DNS for `aimoryconsulting.com` stays at Namecheap.** No Route 53, no
nameserver changes. Terraform requests the TLS certificate; the two DNS records
it needs are created by hand in the Namecheap panel.

This keeps the apex zone — and with it the Microsoft 365 records (MX, SPF, DKIM,
DMARC, autodiscover) — entirely untouched.

### Why a certificate is needed at all

Pointing `arrow` at the CloudFront hostname is enough to route traffic, but
CloudFront would answer holding its default `*.cloudfront.net` certificate and
every browser would block the page with `ERR_CERT_COMMON_NAME_INVALID`. Serving
a custom hostname over HTTPS requires an ACM certificate naming it, issued in
us-east-1.

### What you need

- Namecheap access to edit **Advanced DNS** on `aimoryconsulting.com`.
- AWS credentials for the account running `infra/envs/dev`.

### Step 1 — request the certificate

Validation is manual, so this is a two-step apply. The first one only requests
the certificate and prints the records to paste; an unvalidated certificate
costs nothing while it waits.

```bash
cd infra/envs/dev
terraform apply -target='module.certificate[0].aws_acm_certificate.app'
terraform output namecheap_records
```

### Step 2 — add both records at Namecheap

Namecheap → Domain List → `aimoryconsulting.com` → **Manage** → **Advanced DNS**
→ **Add New Record**, twice. `terraform output namecheap_records` prints both
rows with the host already made relative to the apex, so paste the values
verbatim:

| Type  | Host                    | Value                            | TTL       |
| ----- | ----------------------- | -------------------------------- | --------- |
| CNAME | `_<hash>.arrow`         | `<hash>.xxx.acm-validations.aws` | Automatic |
| CNAME | `arrow`                 | `d1t1fkbbxct55k.cloudfront.net`  | Automatic |

Host is relative — Namecheap appends `.aimoryconsulting.com` itself. Do not
paste the fully-qualified name or it becomes
`arrow.aimoryconsulting.com.aimoryconsulting.com`.

**Leave every existing record alone.** That panel holds the email records.

> ⚠️ The first CNAME must stay **forever**. ACM re-reads it to renew the
> certificate about every 13 months. The value never changes and there is
> nothing to do annually — but delete it and renewal fails silently, and the
> site starts blocking visitors a few months later. See
> [Cost and renewal](#cost-and-renewal).

Verify before continuing (usually a few minutes):

```bash
dig CNAME arrow.aimoryconsulting.com +short   # -> d1t1fkbbxct55k.cloudfront.net
aws acm describe-certificate --region us-east-1 \
  --certificate-arn "$(terraform output -raw certificate_arn_unvalidated)" \
  --query 'Certificate.Status'                # -> "ISSUED"
```

### Step 3 — attach it and go live

Once ACM reports `ISSUED`:

```bash
terraform apply
```

**Prefer letting CI do this apply** — merge to `main` and `merge-deploy.yml`
applies with the full secret set. A local full apply has two rough edges:

- **It destroys the Cognito e2e test user.** `merge-deploy.yml` sets
  `TF_VAR_enable_e2e_test_user=true`; `terraform.tfvars` does not, so locally
  the count drops to zero. Setting only that env var does *not* help — it trips
  a precondition, because `e2e_test_user_email` and `e2e_test_user_password`
  are also CI-only secrets. Either supply all three, or accept the destroy:
  the next merge-deploy recreates the user.
- Locally rebuilt Lambda layers (`pdfminer`, `opensearch`) show as
  `must be replaced`, which pulls source-hash updates through most Lambdas.
  That is normal layer-version churn, not data loss.

Either way, plan first and read the destroy list:

```bash
terraform plan
```

CloudFront takes roughly 5–15 minutes to redeploy after picking up the
certificate and alias.

### How it is wired

`frontend_hostname` (default in `envs/dev/variables.tf`) is the single source of
truth. Everything else derives from it in `modules.tf`:

- `module.certificate` — the ACM certificate and the records to paste
- `module.frontend_site` — CloudFront `aliases` and `viewer_certificate`
- Cognito callback + logout URLs
- API Gateway and S3 CORS allowed origins

Those last two are the easy ones to miss. Without them the site loads on the new
hostname, then login bounces and every API call is CORS-rejected.

The default deliberately lives in `variables.tf` rather than `terraform.tfvars`:
tfvars is gitignored and CI passes variables via `TF_VAR_*` env only, so a null
default would make every `merge-deploy` run tear the certificate back off the
distribution.

Set `frontend_hostname = null` to disable the custom domain entirely and fall
back to the CloudFront hostname.

### Cost and renewal

The ACM certificate is free and there is no hosted zone, so the custom domain
adds nothing to the AWS bill.

ACM renews automatically about 60 days before the 13-month expiry by re-reading
the validation CNAME at Namecheap. The value never changes, so there is no
recurring task — the only failure mode is that record being deleted. If it is,
renewal fails, AWS emails the account address, and the certificate eventually
expires and blocks all visitors.

> The Entra ID app registration needs **no** change. Its redirect URI points at
> the Cognito hosted-UI `/oauth2/idpresponse` endpoint, and the Cognito domain
> is not moving.

## Terraform Outputs

After deployment, get frontend configuration values:

```bash
# All frontend config at once
terraform output cognito_frontend_config

# Individual values
terraform output api_endpoint
terraform output frontend_distribution_domain
terraform output cognito_user_pool_id
terraform output cognito_client_id
terraform output cognito_domain
```

## Module Reference

### storage

Creates data persistence and search layer:
- **S3 Bucket:** `{project}-{env}-resumes` — raw uploads, extracted text, resumes
- **DynamoDB Tables:**
  - `talent_profiles` — candidate records (primary data store)
  - `skills_lookup` — normalized skill names
  - `certifications_lookup` — normalized cert names
  - `cities_lookup` — location normalization
- **OpenSearch Domain:** `{project}-{env}` — full-text search index (`talent-profiles`)
  - Engine: OpenSearch 2.11, `t3.small.search`, 10GB gp3
  - Real-time sync from DynamoDB via Streams + Lambda
  - Index mapping: `name` (text), `summary` (text), `skill_names` (keyword array), `cert_names` (keyword array), plus keyword filters for status, bucket, category, clearance, location
- **Sync Lambda:** Triggered by DynamoDB Streams on INSERT/MODIFY/REMOVE, upserts or deletes documents in OpenSearch

### pipeline/lambdas

Nine Python Lambda functions for resume processing:

| Function | Purpose |
|----------|---------|
| `starter` | S3 trigger, initiates Step Functions execution |
| `classify` | Determines if document needs OCR |
| `start_textract` | Kicks off async Textract job |
| `check_textract` | Polls Textract job status |
| `fetch_textract` | Downloads Textract results to S3 |
| `normalize` | Cleans extracted text |
| `llm_extract` | Uses Claude (Bedrock) to structure profile |
| `persist` | Upserts to DynamoDB |
| `presign` | Generates S3 presigned URLs for uploads |

### pipeline/step_functions

AWS Step Functions state machine orchestrating the pipeline with:
- Retry logic for transient failures
- Wait states for async Textract
- Error handling and dead-letter routing

### api

HTTP API Gateway with Cognito authorizer:
- `GET /talents` — List/search profiles (queries OpenSearch; supports full-text search, fuzzy matching, and keyword filters)
- `GET /talents/{pk}` — Get single profile
- `PATCH /talents/{pk}` — Update profile fields
- `DELETE /talents/{pk}` — Remove profile
- `GET /lookups` — Get skill/cert/city suggestions
- `GET /resume-url/{pk}` — Get presigned download URL

### frontend/cognito

Cognito User Pool with:
- Microsoft Entra ID identity provider
- OAuth 2.0 / OIDC configuration
- Web app client (public, PKCE)

### certificate

ACM certificate for the custom domain (see [Custom Domain](#custom-domain)):
- Requests a us-east-1 certificate for `arrow.aimoryconsulting.com`
- Creates **no DNS records** — DNS is managed at Namecheap, so the validation
  CNAME is pasted there by hand
- `validation_record` output pre-formats that CNAME for the registrar's form
  (host relative to the apex, trailing dots stripped)
- `certificate_arn` blocks until ACM reports ISSUED, which is what makes it safe
  to attach to CloudFront

### frontend/site

Static site hosting:
- S3 bucket (private, OAC-protected)
- CloudFront distribution with SPA routing
- Custom domain via `aliases` + `viewer_certificate` (the DNS record pointing at
  the distribution is created manually at Namecheap)

## Common Operations

### Redeploy a Single Lambda

```bash
# Force Lambda code update
terraform apply -replace="module.pipeline_lambdas.aws_lambda_function.pipeline[\"llm_extract\"]"
```

### View Step Functions Execution

```bash
aws stepfunctions list-executions \
  --state-machine-arn $(terraform output -raw step_functions_arn) \
  --max-results 10
```

### Check Pipeline Logs

```bash
aws logs tail /aws/lambda/aimory-talent-pool-dev-llm_extract --follow
```

## Adding a New Environment

1. Copy the dev folder:
   ```bash
   cp -r infra/envs/dev infra/envs/staging
   ```

2. Update `backend.tf` with a new state key:
   ```hcl
   key = "aimory-talent-pool/staging/infra.tfstate"
   ```

3. Create `terraform.tfvars` with staging-specific values

4. **Override `frontend_hostname`** in the new env's `variables.tf` — set it to a
   distinct hostname or `null`. The copied default points at
   `arrow.aimoryconsulting.com`; leaving it would request a duplicate
   certificate and try to claim a CloudFront alias that dev already owns
   (aliases are globally unique across all CloudFront distributions).

5. Deploy:
   ```bash
   cd infra/envs/staging
   terraform init
   terraform apply
   ```

## Troubleshooting

### "Error: Backend configuration changed"
Run `terraform init -reconfigure`

### Lambda deployment fails with "too large"
The pdfminer layer may not be built. Run the build script and retry.

### Cognito login redirects to error
Check that the redirect URI in Entra ID matches exactly what Cognito expects. Get the expected value from:
```bash
terraform output cognito_domain
```

### Custom domain: `terraform apply` hangs, then "timeout while waiting for state to become 'ISSUED'"

ACM can't see the validation CNAME, so it never issues. Check the record is
actually live and matches what ACM expects:

```bash
terraform output namecheap_records
dig CNAME "$(terraform output -json namecheap_records | jq -r '.[0].host').aimoryconsulting.com" +short
```

A common cause is pasting the fully-qualified host into Namecheap, producing
`_hash.arrow.aimoryconsulting.com.aimoryconsulting.com`. The host field must be
relative to the apex. Fix it and re-run `terraform apply` — nothing needs
unwinding.

### Custom domain: browser shows ERR_CERT_COMMON_NAME_INVALID

DNS is pointing at CloudFront but the certificate isn't attached yet, so
CloudFront is answering with its default `*.cloudfront.net` cert. Finish Step 3
and give CloudFront 5–15 minutes to redeploy.

### Custom domain: site loads but login bounces or API calls fail

The origin is missing from an allow-list. Both are derived from
`frontend_hostname`, so this usually means the apply that added it didn't
complete. Confirm:

```bash
aws cognito-idp describe-user-pool-client \
  --user-pool-id $(terraform output -raw cognito_user_pool_id) \
  --client-id $(terraform output -raw cognito_web_client_id) \
  --query 'UserPoolClient.CallbackURLs'
```

### Textract "AccessDenied"
Ensure the Lambda role has `textract:*` permissions and the S3 bucket allows Textract access.

### Bedrock "Access Denied"
Request access to Claude models in the AWS Bedrock console for your region.
