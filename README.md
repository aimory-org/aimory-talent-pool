# AIMORY Talent Pool

Contributors: Ben and Kyle

Modern resume ingestion and enrichment pipeline for AIMORY. The project centers on an AWS-native workflow that accepts resumes in S3, pushes them through Textract + LLM enrichment, normalizes the profile, and stores structured records for downstream search. The repository currently focuses on infrastructure-as-code and Lambda handlers; a frontend will be introduced later.

## Architecture At A Glance
- **Storage** – [infra/modules/storage](infra/modules/storage) provisions the raw/extracted resume bucket and the DynamoDB `talent_profiles` table.
- **Pipeline Lambdas** – [infra/modules/lambdas](infra/modules/lambdas) packages nine Python functions (starter, classify, start_textract, check_textract, fetch_textract, normalize, llm_extract, persist, presign). A shared IAM role/layer system handles S3, Textract, Bedrock, and DynamoDB access.
- **Step Functions Orchestration** – [infra/modules/step_functions](infra/modules/step_functions) defines the state machine that calls each Lambda in sequence and exposes its ARN via SSM for the starter to read.
- **Event Flow** – S3 `raw/` uploads trigger the `starter` Lambda → Step Functions → downstream Lambdas → DynamoDB + extracted files.
- **Terraform Driven** – [infra/envs/dev](infra/envs/dev) wires the modules together, sets prefixes, stores the state machine ARN in SSM, and configures S3 event notifications.

```
raw resume upload ─▶ starter (Lambda) ─▶ Step Functions pipeline ─▶ Textract/LLM ─▶ normalized profile ─▶ DynamoDB + extracted text
```

## Repository Layout

| Path | Purpose |
| --- | --- |
| [infra/](infra) | Terraform modules, env wiring, Terraform lock/state files. |
| [infra/modules/lambdas/lambda_src](infra/modules/lambdas/lambda_src) | Source for each Lambda function (`app.py`). |
| [infra/modules/lambdas/layers/pdfminer](infra/modules/lambdas/layers/pdfminer) | Custom PDFMiner layer with build scripts for PowerShell/Bash. |
| [frontend/](frontend) | Placeholder for the future web UI (no app scaffolded yet). |
| [.github/workflows](.github/workflows) | CI helpers such as the layer build workflow. |

## Prerequisites
- Terraform 1.8+
- AWS CLI v2 with credentials that can manage the target account
- Python 3.12 (to run/build Lambda bundles)
- Docker (optional, but required if you rebuild Lambda layers inside containers)

## Bootstrapping A Dev Environment
1. Ensure the backend state bucket/table referenced in [infra/providers.tf](infra/providers.tf) exist (or update as needed).
2. Build the PDFMiner layer once (creates `layers/pdfminer/python`):
	- Windows: `./infra/modules/lambdas/layers/pdfminer/build_layer.ps1`
	- macOS/Linux: `./infra/modules/lambdas/layers/pdfminer/build_layer.sh`
3. Deploy the dev stack:
	```bash
	cd infra/envs/dev
	terraform init
	terraform plan
	terraform apply
	```
4. Upload a PDF into the raw S3 prefix (default `raw/`) to trigger the end-to-end pipeline.

## Runtime Walkthrough
1. **starter** – fired by S3 notifications, looks up the state machine ARN from SSM and kicks off an execution.
2. **classify** – checks if the document is searchable and chooses the Textract route.
3. **start/check/fetch textract** – handles asynchronous Textract text detection and writes extracted text to `extracted/` in S3.
4. **normalize** – cleans up text blocks for downstream consumption.
5. **llm_extract** – uses Bedrock (Claude Sonnet) to turn text into a structured profile payload with schema validation.
6. **persist** – upserts the final record into DynamoDB to maintain idempotency.

## Adding/Updating Lambdas
1. Create a new folder under [infra/modules/lambdas/lambda_src](infra/modules/lambdas/lambda_src) with an `app.py` exposing `handler(event, context)`.
2. Update `locals.pipeline_lambdas` inside [pipeline.tf](infra/modules/lambdas/pipeline.tf) to set memory, timeout, and environment variables.
3. Wire the Lambda into the Step Functions definition (`state_machine.asl.json`) if it participates in the pipeline.

## Testing & CI Status
- Unit/contract/integration test scaffolding is tracked in [issue #7](https://github.com/bencas21/aimory-talent-pool/issues/7).
- A GitHub Actions workflow for Lambda layer builds lives in [.github/workflows](.github/workflows); broader CI (lint, tests, Terraform plan/apply) is part of the backlog.

- Frontend search UI (fields TBD) – [issue #15](https://github.com/bencas21/aimory-talent-pool/issues/15)
- OpenSearch integration for advanced search – [issue #16](https://github.com/bencas21/aimory-talent-pool/issues/16)
- Production environment & Terraform CD – [issues #17](https://github.com/bencas21/aimory-talent-pool/issues/17) and [#12](https://github.com/bencas21/aimory-talent-pool/issues/12)
- Repository + Power Automate documentation – [issues #11](https://github.com/bencas21/aimory-talent-pool/issues/11) and [#10](https://github.com/bencas21/aimory-talent-pool/issues/10)
- LLM-driven non-resume cleanup and containerized Lambdas – [issues #8](https://github.com/bencas21/aimory-talent-pool/issues/8) and [#14](https://github.com/bencas21/aimory-talent-pool/issues/14)

See the GitHub Issues board for the up-to-date backlog and acceptance criteria for each initiative.