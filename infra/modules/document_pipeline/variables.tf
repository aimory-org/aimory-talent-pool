# -----------------------------------------------------------------------------
# Reusable document processing pipeline module.
#
# HOW TO ADD A NEW PIPELINE:
# 1. Create a directory under infra/pipeline_configs/<name>/ with:
#    - schema.json   — JSON Schema for LLM extraction output
#    - prompt.txt    — System instructions for the LLM
#    - hooks.py      — post_process(result, event) function
#    - persist/app.py — Lambda handler to write to DynamoDB
# 2. Add a DynamoDB table in the storage module for your document type.
# 3. Call this module from envs/dev/modules.tf with pipeline-specific vars.
# -----------------------------------------------------------------------------

variable "project_name" {
  type        = string
  description = "Project name for resource naming"
}

variable "environment" {
  type        = string
  description = "Environment (dev/staging/prod)"
}

variable "pipeline_name" {
  type        = string
  description = "Short name for this pipeline (e.g. 'resume', 'jd'). Used in resource names."
}

variable "resource_prefix" {
  type        = string
  description = "Prefix for Lambda/SFN resource names. Set to project-env for legacy pipelines, or project-env-pipeline for new ones."
}

variable "document_bucket" {
  type        = string
  description = "S3 bucket name for documents"
}

variable "document_bucket_arn" {
  type        = string
  description = "S3 bucket ARN for documents"
}

variable "raw_prefix" {
  type        = string
  description = "S3 prefix for raw uploaded documents (e.g. 'raw/onedrive' or 'job-descriptions/raw')"
}

variable "extracted_prefix" {
  type        = string
  description = "S3 prefix for Textract-extracted text"
}

variable "sfn_arn_param_name" {
  type        = string
  description = "SSM parameter name to store the Step Functions state machine ARN"
}

variable "target_table_name" {
  type        = string
  description = "DynamoDB table name for the pipeline's output documents"
}

variable "target_table_arn" {
  type        = string
  description = "DynamoDB table ARN for the pipeline's output documents"
}

variable "audit_log_table_name" {
  type        = string
  description = "DynamoDB table name for audit history"
}

variable "audit_log_table_arn" {
  type        = string
  description = "DynamoDB table ARN for audit history"
}

variable "lookup_tables" {
  description = "Shared lookup tables used by llm_extract and persist Lambdas"
  type = object({
    skills              = object({ name = string, arn = string })
    certifications      = object({ name = string, arn = string })
    cities              = object({ name = string, arn = string })
    job_titles          = object({ name = string, arn = string })
    industry_categories = object({ name = string, arn = string })
  })
}

variable "bedrock_model_id" {
  type        = string
  description = "Bedrock model ID for LLM extraction"
  default     = "us.anthropic.claude-sonnet-4-20250514-v1:0"
}

variable "pipeline_config_dir" {
  type        = string
  description = "Absolute path to the pipeline config directory containing schema.json, prompt.txt, hooks.py"
}

variable "persist_src_dir" {
  type        = string
  description = "Absolute path to the persist Lambda source directory containing app.py"
}

variable "persist_env" {
  type        = map(string)
  description = "Additional environment variables for the persist Lambda (e.g. target table name)"
  default     = {}
}

variable "enable_presign_url" {
  type        = bool
  description = "Whether to create a public presign Lambda function URL (for Power Automate etc.)"
  default     = false
}

variable "presign_api_key" {
  type        = string
  description = "API key for the presign endpoint (only used if enable_presign_url is true)"
  default     = ""
  sensitive   = true
}
