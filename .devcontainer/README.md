# Dev Container

This folder contains the VS Code dev container configuration, providing a consistent, pre-configured development environment with all required tools and dependencies.

## What's Included

| Tool | Version | Purpose |
|------|---------|---------|
| **Node.js** | 22 | Frontend development (React + Vite) |
| **Python** | 3.12 | Lambda functions and testing |
| **Terraform** | 1.9 | Infrastructure as Code |
| **AWS CLI** | Latest | AWS deployments and operations |
| **Docker** | Latest | Building Lambda layers |

### VS Code Extensions (Auto-installed)

| Extension | Purpose |
|-----------|---------|
| ESLint | JavaScript/TypeScript linting |
| Prettier | Code formatting |
| Tailwind CSS IntelliSense | CSS class autocomplete |
| Python | Python language support |
| Pylance | Python IntelliSense |
| Ruff | Python linting/formatting |
| Terraform | HCL syntax and validation |
| AWS Toolkit | AWS resource explorer |

## Getting Started

### Prerequisites

Before opening the dev container, ensure you have:

1. **Docker Desktop** — [Download](https://www.docker.com/products/docker-desktop/) and ensure it's running
2. **VS Code** — [Download](https://code.visualstudio.com/)
3. **Dev Containers Extension** — Install from [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)

> **Note:** AWS credentials are **not required** for local development. Infrastructure deployments are handled via CI/CD. If you need AWS access locally (for debugging, running Terraform, etc.), configure credentials inside the container with `aws configure`.

### Open in Container

1. Clone this repository
2. Open the folder in VS Code
3. Press `F1` → **Dev Containers: Reopen in Container**
4. Wait for the container to build (~2-3 minutes first time)

The `postCreateCommand` automatically:
- Installs frontend npm packages
- Installs Python dev dependencies (pytest, moto, boto3, etc.)

## Configuration Required

After the container starts, you'll need to configure:

### 1. Terraform Variables (for infrastructure deployment)

```bash
cd infra/envs/dev
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your values
```

Required values:
- `entra_client_id` — Microsoft Entra ID app client ID
- `entra_client_secret` — Microsoft Entra ID app secret
- `entra_tenant_id` — Your Azure AD tenant ID
- `presign_api_key` — Secure API key (generate with `openssl rand -hex 16`)

See [infra/README.md](../infra/README.md) for complete setup instructions.

### 2. Frontend Environment (for local development)

```bash
cd frontend/web
cp .env.example .env
# Edit .env with values from terraform output
```

Get values after running `terraform apply`:
```bash
cd infra/envs/dev
terraform output cognito_frontend_config
```

See [frontend/web/README.md](../frontend/web/README.md) for details.

## Daily Workflow

### Start Frontend Dev Server

```bash
cd frontend/web
npm run dev
# Opens at http://localhost:5173
```

### Run Python Tests

```bash
pytest
# Or with coverage
pytest --cov=infra/modules
```

### Deploy Infrastructure

```bash
cd infra/envs/dev
terraform init    # First time only
terraform plan    # Preview changes
terraform apply   # Deploy
```

### Build Lambda Layer (Before First Deploy)

```bash
./infra/modules/pipeline/lambdas/layers/pdfminer/build_layer_docker.sh
```

---

## Local Deployment Guide

End-to-end steps for deploying the full stack from inside the dev container.

### Step 1 — Configure AWS Credentials

Your host machine's `~/.aws` folder is mounted into the container automatically, so any profiles already configured on your host are available immediately.

**Verify credentials are working:**
```bash
aws sts get-caller-identity
```

If you need to configure credentials from scratch:

```bash
aws configure
# AWS Access Key ID:     <your key>
# AWS Secret Access Key: <your secret>
# Default region:        us-east-1
# Default output format: json
```

For SSO profiles, log in on your **host machine** first, then verify inside the container:
```bash
# On host
aws sso login --profile <profile>

# Inside container — set the profile for all subsequent commands
export AWS_PROFILE=<profile>
aws sts get-caller-identity
```

### Step 2 — Bootstrap Terraform State (One-Time)

> ⚠️ Skip this step if the state backend already exists in the AWS account.

The S3 state bucket and DynamoDB lock table must be created before anything else. This only needs to be done once per AWS account.

```bash
cd infra/bootstrap-state
terraform init
terraform apply
```

### Step 3 — Obtain Entra ID Credentials

Get the three values from the existing app registration in [Azure Portal](https://portal.azure.com) → **Entra ID** → **App registrations**:

| Variable | Where to find it |
|----------|-----------------|
| `entra_client_id` | App registration → **Overview** → Application (client) ID |
| `entra_tenant_id` | App registration → **Overview** → Directory (tenant) ID |
| `entra_client_secret` | App registration → **Certificates & secrets** → copy the secret **Value** |

### Step 4 — Configure Terraform Variables

```bash
cd infra/envs/dev
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars`:

```hcl
aws_region   = "us-east-1"
project_name = "aimory-talent-pool"
environment  = "dev"

presign_api_key    = "$(openssl rand -hex 16)"   # generate a secure key
raw_prefix         = "raw/onedrive"
extracted_prefix   = "extracted"
sfn_arn_param_name = "/aimory-talent-pool/dev/resume-pipeline-arn"

cognito_callback_urls = ["http://localhost:5173"]
cognito_logout_urls   = ["http://localhost:5173"]

entra_client_id     = "<from step 2>"
entra_client_secret = "<from step 2>"
entra_tenant_id     = "<from step 2>"
```

> ⚠️ `terraform.tfvars` is gitignored — never commit it.

### Step 5 — Build the Lambda Layer

The pdfminer layer must be built with Docker before the first Terraform apply:

```bash
# From the repo root
./infra/modules/pipeline/layers/pdfminer/build_layer_docker.sh
```

Verify Docker is running first: `docker ps`

### Step 6 — Deploy Infrastructure

```bash
cd infra/envs/dev
terraform init
terraform plan    # Review what will be created
terraform apply
```

The first apply takes ~10–15 minutes (OpenSearch domain creation is the slowest step).

### Step 7 — Configure the Frontend

```bash
cd frontend/web
cp .env.example .env
```

Populate `.env` from Terraform outputs (run these inside `infra/envs/dev`):

```bash
terraform output cognito_frontend_config
```

Your `.env` should look like:

```bash
VITE_COGNITO_USER_POOL_ID=us-east-1_xxxxxxxxx
VITE_COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
VITE_COGNITO_DOMAIN=aimory-talent-pool-dev-auth.auth.us-east-1.amazoncognito.com
VITE_AWS_REGION=us-east-1
VITE_COGNITO_REDIRECT_URI=http://localhost:5173
VITE_API_ENDPOINT=https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com
VITE_ALLOWED_EMAIL_SUFFIXES=@yourcompany.com
```

Start the dev server:

```bash
npm run dev
# Opens at http://localhost:5173
```

### Step 8 — (Optional) Deploy the Frontend to CloudFront

```bash
cd frontend/web
npm run build
```

```bash
# Get the S3 bucket name from Terraform output
cd infra/envs/dev
terraform output frontend_s3_bucket

# Sync the build
aws s3 sync ../../frontend/web/dist s3://<bucket-name> --delete
```

Then update `terraform.tfvars` with the CloudFront URL so Cognito redirects work:

```bash
terraform output frontend_cloudfront_url
```

```hcl
cognito_callback_urls = ["http://localhost:5173", "https://<cloudfront-url>"]
cognito_logout_urls   = ["http://localhost:5173", "https://<cloudfront-url>"]
```

```bash
terraform apply
```

### Deploying Lambda Code Changes

Terraform only re-deploys a Lambda when its source zip changes. To push a code-only change without a full plan:

```bash
cd infra/envs/dev
terraform apply -target=module.api.aws_lambda_function.<function_name>
# e.g. -target=module.pipeline.aws_lambda_function.persist
```

Or do a full `terraform apply` — Terraform will only update what changed.

### Useful Outputs Reference

```bash
cd infra/envs/dev

terraform output api_endpoint               # API Gateway base URL
terraform output frontend_cloudfront_url    # CloudFront distribution URL
terraform output cognito_user_pool_id       # Cognito User Pool ID
terraform output cognito_client_id          # Cognito App Client ID
terraform output cognito_domain             # Cognito hosted UI domain
terraform output cognito_frontend_config    # All frontend values at once
```

## AWS Credentials

Your host machine's `~/.aws` folder is automatically mounted into the container. This means:

- ✅ No need to run `aws configure` inside the container
- ✅ All profiles from your host are available
- ✅ SSO sessions work if configured

**Verify credentials:**
```bash
aws sts get-caller-identity
```

**List available profiles:**
```bash
aws configure list-profiles
```

**Use a specific profile:**
```bash
export AWS_PROFILE=my-profile
# Or for one command
AWS_PROFILE=my-profile terraform plan
```

## Port Forwarding

The container automatically forwards:

| Port | Service |
|------|---------|
| 5173 | Vite dev server |

VS Code will prompt to open forwarded ports in your browser.

## Common Tasks

### Update npm Dependencies

```bash
cd frontend/web
npm update
```

### Add a shadcn/ui Component

```bash
cd frontend/web
npx shadcn@latest add [component-name]
```

### Format Python Code

```bash
ruff format .
```

### Lint Python Code

```bash
ruff check . --fix
```

## Troubleshooting

### Container Won't Start

1. Ensure Docker Desktop is running
2. Try **Dev Containers: Rebuild Container** from the command palette
3. Check Docker has enough memory (4GB+ recommended)

### AWS Commands Fail with Credentials Error

1. Verify `~/.aws/credentials` exists on your host
2. Check file permissions: `ls -la ~/.aws/`
3. Test credentials: `aws sts get-caller-identity`
4. For SSO: run `aws sso login --profile <profile>` on your host first

### npm install Fails

```bash
rm -rf node_modules package-lock.json
npm install
```

### Layer Build Fails

1. Ensure Docker-in-Docker is working: `docker ps`
2. Rebuild the container if Docker isn't available
3. Check disk space: `df -h`

### Terraform State Lock Error

Someone else may have a lock, or a previous run crashed:
```bash
terraform force-unlock <lock-id>
```

### Python Import Errors

The Python path may not include the project root:
```bash
export PYTHONPATH="${PYTHONPATH}:/workspaces/aimory-talent-pool"
```

## Customizing the Container

### Add a Tool

Edit `devcontainer.json` and add to `features`:
```json
"features": {
  "ghcr.io/devcontainers/features/go:1": {}
}
```

### Add a VS Code Extension

Edit `devcontainer.json` and add to `customizations.vscode.extensions`:
```json
"extensions": [
  "existing-extensions...",
  "publisher.extension-name"
]
```

### Change Default Settings

Edit `customizations.vscode.settings` in `devcontainer.json`.

After changes, run **Dev Containers: Rebuild Container**.
