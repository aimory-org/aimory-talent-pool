# Document Pipeline Module

Reusable Terraform module that deploys an S3 → Step Functions → DynamoDB document
processing pipeline. Each instantiation creates a complete pipeline for a single
document type (resumes, job descriptions, contracts, etc.).

## Architecture

```
S3 Upload (prefix-filtered)
  └─► starter Lambda  →  Step Functions state machine
        classify → textract loop → normalize → llm_extract → persist
```

All pipelines share the same 8-step state machine. The only things that change
per document type are:

| What                   | Where                                      |
|------------------------|---------------------------------------------|
| LLM extraction schema  | `pipeline_configs/<name>/schema.json`       |
| LLM prompt             | `pipeline_configs/<name>/prompt.txt`        |
| Post-processing hooks  | `pipeline_configs/<name>/hooks.py`          |
| DynamoDB write logic   | `pipeline_configs/<name>/persist/app.py`    |
| S3 prefix + table vars | `envs/<env>/modules.tf` module block        |

## Adding a New Pipeline

### 1. Create pipeline config files

```
infra/pipeline_configs/<name>/
├── schema.json       # JSON Schema for the LLM extraction output
├── prompt.txt        # System prompt sent to Bedrock Claude
├── hooks.py          # post_process(result, event) → result
└── persist/
    └── app.py        # Lambda handler: write extracted data to DynamoDB
```

**schema.json** — Defines the JSON structure the LLM must return. Must include
an `is_valid` boolean field so the state machine can route invalid documents.

**prompt.txt** — System instructions for Claude. Reference `{schema}` (injected
at runtime) and `{lookup_values}` (populated from lookup tables).

**hooks.py** — Must export a `post_process(result: dict, event: dict) -> dict`
function. Use it to clean up S3 artifacts for invalid documents, enrich fields,
etc. Must preserve the `is_valid` key in the returned dict.

**persist/app.py** — Standard Lambda handler (`handler(event, context)`).
Receives the full Step Functions payload including `event["extracted"]`. Write
to DynamoDB, populate lookup tables, write audit log entries, etc. Environment
variables are set via the `persist_env` Terraform variable.

### 2. Create storage resources (if needed)

Add a DynamoDB table in `infra/modules/storage/` for your document type:

```hcl
# infra/modules/storage/job_descriptions_db.tf
resource "aws_dynamodb_table" "job_descriptions" {
  name         = "${var.project_name}-${var.environment}-job-descriptions"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"

  attribute { name = "pk"; type = "S" }
}
```

Export the table name and ARN in `outputs.tf`.

### 3. Add the module call

In `infra/envs/dev/modules.tf`, add a new module block:

```hcl
module "<name>_pipeline" {
  source       = "../../modules/document_pipeline"
  project_name = var.project_name
  environment  = var.environment

  pipeline_name   = "<name>"
  resource_prefix = "${var.project_name}-${var.environment}-<name>"

  document_bucket     = module.storage.resume_bucket_name   # shared bucket
  document_bucket_arn = module.storage.resume_bucket_arn
  raw_prefix          = "<name>/raw"          # unique prefix per pipeline
  extracted_prefix    = "<name>/extracted"

  sfn_arn_param_name = "/${var.project_name}/${var.environment}/<name>-sfn-arn"

  target_table_name    = module.storage.<name>_table_name
  target_table_arn     = module.storage.<name>_table_arn
  audit_log_table_name = module.storage.audit_log_table_name
  audit_log_table_arn  = module.storage.audit_log_table_arn

  # Shared lookup tables — defined once as a local in modules.tf
  lookup_tables = local.lookup_tables

  pipeline_config_dir = "${path.module}/../../pipeline_configs/<name>"
  persist_src_dir     = "${path.module}/../../pipeline_configs/<name>/persist"
  persist_env = {
    TARGET_TABLE = module.storage.<name>_table_name
  }

  # Optional: expose a presign URL for external uploaders
  enable_presign_url = false
}
```

### 4. Add S3 bucket notification

Since all pipelines share one S3 bucket, the `aws_s3_bucket_notification` must be
a single resource in `envs/dev/modules.tf` (not inside the pipeline module).
Add a `lambda_function` block to the existing `pipeline_triggers` resource:

```hcl
resource "aws_s3_bucket_notification" "pipeline_triggers" {
  bucket = module.storage.resume_bucket_name

  # Existing pipelines...

  lambda_function {
    lambda_function_arn = module.<name>_pipeline.starter_lambda_arn
    events              = ["s3:ObjectCreated:*"]
    filter_prefix       = "<name>/raw/"
  }

  depends_on = [
    # ... existing modules ...
    module.<name>_pipeline,
  ]
}
```

### 5. Wire up outputs

Add any outputs you need (e.g. presign URL, SFN ARN) in `envs/dev/outputs.tf`.

### 6. Deploy

```bash
cd infra/envs/dev
terraform init    # picks up the new module
terraform plan    # review the new resources
terraform apply
```

## Key Variables

| Variable | Purpose |
|----------|---------|
| `pipeline_name` | Short identifier (e.g. `resume`, `jd`). Used in resource naming. |
| `resource_prefix` | Full prefix for resource names. Use `project-env` for legacy or `project-env-name` for new pipelines. |
| `raw_prefix` | S3 prefix that triggers this pipeline. Must be unique per pipeline. |
| `extracted_prefix` | S3 prefix where Textract output is stored. |
| `enable_presign_url` | Set `true` to create a Lambda function URL for unauthenticated uploads (e.g. Power Automate). |
| `persist_env` | Map of extra env vars passed to the persist Lambda (table names, feature flags, etc.). |

## Testing

Unit tests live in `infra/tests/unit/pipeline/`. When adding a new pipeline's
config, add corresponding tests that load the config files:

```python
# Set PIPELINE_CONFIG_DIR so the shared llm_extract handler finds your config
os.environ["PIPELINE_CONFIG_DIR"] = str(
    Path(__file__).resolve().parents[3] / "pipeline_configs" / "<name>"
)
```

Run all pipeline tests:

```bash
python -m pytest infra/tests/unit/pipeline/ -x -v
```
