# AIMORY Talent Pool

**Contributors:** Ben and Kyle

A modern resume ingestion and talent management platform for AIMORY. The system automatically processes uploaded resumes through AWS Textract and LLM enrichment, storing structured candidate profiles for search and management via a React-based dashboard.

## What This Repository Contains

| Directory | Description | Documentation |
|-----------|-------------|---------------|
| [frontend/](frontend/) | React + TypeScript web application for talent management | [Frontend README](frontend/web/README.md) |
| [infra/](infra/) | Terraform infrastructure-as-code for AWS deployment | [Infrastructure README](infra/README.md) |
| [.devcontainer/](.devcontainer/) | VS Code dev container for consistent development environments | [Dev Container README](.devcontainer/README.md) |
| [.github/](.github/) | GitHub Actions workflows for CI/CD | — |

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              AIMORY Talent Pool                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────────────────────┐ │
│  │   Frontend   │────▶│  API Gateway │────▶│        DynamoDB Tables       │ │
│  │  React SPA   │     │  + Cognito   │     │  (talent_profiles, lookups)  │ │
│  └──────────────┘     └──────────────┘     └──────────────────────────────┘ │
│         │                                              ▲                    │
│         │                                              │                    │
│         ▼                                              │                    │
│  ┌──────────────┐     ┌──────────────────────────────────────────────────┐ │
│  │  CloudFront  │     │              Resume Processing Pipeline           │ │
│  │   + S3 Site  │     │  S3 Upload → Starter → Step Functions → Persist  │ │
│  └──────────────┘     │      (Textract + Bedrock LLM Enrichment)         │ │
│                       └──────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Resume Flow:** Upload PDF to S3 `raw/` → triggers Starter Lambda → Step Functions orchestration → Textract OCR → LLM extraction (Claude via Bedrock) → normalized profile persisted to DynamoDB

**User Flow:** Sign in via Microsoft Entra ID (federated through Cognito) → browse/search/filter talent → view details → download original resumes

## Quick Start

### Option 1: Dev Container (Recommended)

1. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) and [VS Code](https://code.visualstudio.com/)
2. Install the [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)
3. Clone this repo and open in VS Code
4. Press `F1` → **Dev Containers: Reopen in Container**
5. Wait for setup to complete — all dependencies install automatically

See [.devcontainer/README.md](.devcontainer/README.md) for details.

### Option 2: Manual Setup

**Prerequisites:**
- Node.js 22+
- Python 3.12+
- Terraform 1.9+
- AWS CLI v2 with configured credentials
- Docker (for building Lambda layers)

**Install dependencies:**
```bash
# Frontend
cd frontend/web && npm install

# Python (for Lambda development/testing)
pip install -r requirements-dev.txt
```

## Development Workflow

```bash
# Start the frontend dev server
cd frontend/web
npm run dev                    # http://localhost:5173

# Run Python tests
pytest

# Deploy infrastructure changes
cd infra/envs/dev
terraform init                 # first time only
terraform plan
terraform apply
```

## Documentation Index

| Topic | Location |
|-------|----------|
| Development environment setup | [.devcontainer/README.md](.devcontainer/README.md) |
| Frontend architecture & components | [frontend/web/README.md](frontend/web/README.md) |
| Infrastructure modules & deployment | [infra/README.md](infra/README.md) |
| Environment variables | Each README contains relevant env vars |

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS, Radix UI, AWS Amplify |
| **Authentication** | AWS Cognito + Microsoft Entra ID (Azure AD) federation |
| **API** | API Gateway (HTTP API) + Lambda |
| **Processing** | Step Functions, Lambda (Python 3.12), Textract, Bedrock (Claude) |
| **Storage** | S3 (resumes), DynamoDB (profiles + lookups), SSM Parameter Store |
| **Infrastructure** | Terraform, CloudFront, IAM |

## Contributing

1. Create a feature branch from `main`
2. Make changes and test locally
3. Run `terraform plan` to preview infrastructure changes
4. Submit a pull request

## License

Proprietary — AIMORY internal use only.