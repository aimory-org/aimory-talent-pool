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
    ├── api/                  # API Gateway + Lambda endpoints + stale checker
    │   └── lambda_src/       # Python handlers (list_talents, get_talent, stale_checker, etc.)
    ├── frontend/
    │   ├── cognito/          # User pool + Microsoft Entra ID federation
    │   └── site/             # S3 + CloudFront static hosting
    ├── pipeline/
    │   ├── lambdas/          # Resume processing Lambdas
    │   │   ├── lambda_src/   # Python handlers (9 functions)
    │   │   └── layers/       # Custom Lambda layers (pdfminer)
    │   └── step_functions/   # State machine orchestration
    └── storage/              # DynamoDB tables + S3 buckets + OpenSearch domain
        └── lambda_src/       # DynamoDB→OpenSearch sync Lambda
```

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
│                      Step Functions Pipeline                       │
│                                                                   │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐       │
│  │ classify │──▶│  start   │──▶│  check   │──▶│  fetch   │       │
│  │          │   │ textract │   │ textract │   │ textract │       │
│  └────┬─────┘   └──────────┘   └──────────┘   └────┬─────┘       │
│       │                              ▲              │             │
│       │ (skip if                     │ (wait/poll)  │             │
│       │  searchable PDF)             └──────────────┘             │
│       │                                             │             │
│       │         ┌───────────┐   ┌───────────┐   ┌───────────┐    │
│       │         │ normalize │──▶│llm_extract│──▶│  persist  │    │
│       │         │           │   │ (Bedrock) │   │           │    │
│       │         └───────────┘   └───────────┘   └───────────┘    │
│       │               ▲                                          │
│       └───────────────┴─────────────────────────────────────┘    │
│                       │                                          │
│                       └── both paths converge at normalize       │
│                                                                   │
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
raw_prefix         = "raw/onedrive"
extracted_prefix   = "extracted"
sfn_arn_param_name = "/aimory-talent-pool/dev/resume-pipeline-arn"

# Frontend (optional custom domain)
frontend_domain_aliases  = []     # e.g., ["talent.aimory.com"]
frontend_certificate_arn = null   # ACM cert ARN (must be in us-east-1)

# Cognito OAuth URLs
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
terraform output frontend_cloudfront_url
```

Update `terraform.tfvars`:
```hcl
cognito_callback_urls = [
  "http://localhost:5173",
  "https://d1234567890abc.cloudfront.net"
]
cognito_logout_urls = [
  "http://localhost:5173", 
  "https://d1234567890abc.cloudfront.net"
]
```

Run `terraform apply` again.

## Terraform Outputs

After deployment, get frontend configuration values:

```bash
# All frontend config at once
terraform output cognito_frontend_config

# Individual values
terraform output api_endpoint
terraform output frontend_cloudfront_url
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

### frontend/site

Static site hosting:
- S3 bucket (private, OAC-protected)
- CloudFront distribution with SPA routing
- Optional custom domain support

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

4. Deploy:
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

### Textract "AccessDenied"
Ensure the Lambda role has `textract:*` permissions and the S3 bucket allows Textract access.

### Bedrock "Access Denied"
Request access to Claude models in the AWS Bedrock console for your region.
