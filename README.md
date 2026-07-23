# AIMORY Talent Pool

An AI-powered talent management platform. Resumes uploaded to OneDrive are automatically processed through a serverless AI pipeline — extracting structured candidate data — and made searchable through a React dashboard. This repository is public as a showcase of our technical approach to AI-assisted recruiting infrastructure.

## Repository Structure


| Directory | Description |
|-----------|-------------|
| [frontend/web/](frontend/web/) | React + TypeScript SPA (dashboard, search, candidate management) |
| [infra/](infra/) | Terraform infrastructure-as-code (all AWS resources) |
| [scripts/](scripts/) | Operational scripts (backfill, reprocess, dedup) |

## How It Works

```
OneDrive Folder
      │  Power Automate
      ▼
  S3 Bucket (raw PDF)
      │  S3 Event
      ▼
  starter Lambda
      │
      ▼
  Step Functions Pipeline (two parallel branches)
  ┌─────────────────────────────────────────────────────┐
  │  AI:   llm_extract — Claude reads the raw document   │
  │        (visual for PDFs) → structured JSON           │
  │  text: extract text (+ Textract OCR if scanned)      │
  │        → plain text for search / dedup               │
  │                    ↓ merge                           │
  │            persist → DynamoDB                        │
  └─────────────────────────────────────────────────────┘
      │  DynamoDB Streams
      ▼
  OpenSearch (talent-profiles index)
      │
      ▼
  API Gateway (JWT-authenticated REST API)
      │
      ▼
  React SPA (CloudFront + S3)
```

**Search:** `GET /talents` queries OpenSearch with prefix matching on name, fuzzy matching on summary/resume text, and exact-term filters on skills, certifications, clearance, and location. Results include highlighted excerpt fragments.

**Matching:** `POST /job-descriptions/{pk}/match` ranks candidates against a job description through a hybrid retrieve→rerank→score pipeline (hard filters, lexical + semantic vector recall, a cross-encoder reranker, then LLM scoring with evidence-based rationale on a small final shortlist). See [docs/match.md](docs/match.md) for the full design, the experiments behind each decision, and cost/latency tradeoffs.

**Auth:** Microsoft Entra ID federated through AWS Cognito. JWT tokens validated by API Gateway on every request.

## Quick Start

### Dev Container (Recommended)

1. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) and [VS Code](https://code.visualstudio.com/)
2. Install the [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)
3. Clone this repo, open in VS Code, and press `F1` → **Dev Containers: Reopen in Container**

All dependencies install automatically.

### Manual Setup

**Prerequisites:** Node.js 22+, Python 3.12+, Terraform 1.9+, AWS CLI v2, Docker

```bash
# Frontend
cd frontend/web && npm install

# Python (Lambda dev/testing)
pip install -r requirements-dev.txt
```

## Development Workflow

```bash
# Start the frontend dev server
cd frontend/web
npm run dev          # http://localhost:5173

# Run tests
pytest               # Python unit tests
npm test             # Frontend tests (from frontend/web/)

# Deploy infrastructure changes
cd infra/envs/dev
terraform plan
terraform apply

# Deploy frontend
cd frontend/web
npm run build
aws s3 sync dist/ s3://<frontend-bucket> --delete
aws cloudfront create-invalidation --distribution-id <id> --paths "/*"
```

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS v4, AWS Amplify v6 |
| **Auth** | AWS Cognito + Microsoft Entra ID federation |
| **API** | API Gateway (HTTP API) + Lambda (Python 3.12) |
| **Pipeline** | Step Functions, Bedrock / Claude Sonnet 4.6 (document extraction), Textract (OCR for scanned docs) |
| **Storage** | S3, DynamoDB (profiles + 7 lookup tables), SSM |
| **Search** | OpenSearch 2.11 (synced via DynamoDB Streams) |
| **Infra** | Terraform, CloudFront, IAM |

## Documentation

| Topic | Location |
|-------|----------|
| Frontend setup & components | [frontend/web/README.md](frontend/web/README.md) |
| Infrastructure & deployment | [infra/README.md](infra/README.md) |
| Operational scripts | [scripts/README.md](scripts/README.md) |
| Candidate matching system (design + experiments) | [docs/match.md](docs/match.md) |

## Contributing

1. Branch from `main` (`git checkout -b feature/your-feature`)
2. Make changes and test locally
3. Run `terraform plan` before any infrastructure changes
4. Open a pull request

## License

Source available for reference and portfolio purposes. Not licensed for reuse or redistribution without permission from Aimory Consulting.
