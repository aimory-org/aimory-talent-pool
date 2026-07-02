variable "project_name" {
  type        = string
  description = "Project name for resource naming"
}

variable "environment" {
  type        = string
  description = "Environment (dev/staging/prod)"
}

variable "cognito_user_pool_arn" {
  type        = string
  description = "Cognito User Pool ARN for JWT authorization"
}

variable "cognito_user_pool_client_id" {
  type        = string
  description = "Cognito App Client ID for audience validation"
}

variable "talent_profiles_table_name" {
  type        = string
  description = "DynamoDB table name for talent profiles"
}

variable "talent_profiles_table_arn" {
  type        = string
  description = "DynamoDB table ARN for talent profiles"
}

variable "audit_log_table_name" {
  type        = string
  description = "DynamoDB table name for audit history"
}

variable "audit_log_table_arn" {
  type        = string
  description = "DynamoDB table ARN for audit history"
}

variable "job_descriptions_table_name" {
  type        = string
  description = "DynamoDB table name for job descriptions"
}

variable "job_descriptions_table_arn" {
  type        = string
  description = "DynamoDB table ARN for job descriptions"
}

variable "lookup_tables" {
  description = "Shared lookup tables (skills, certifications, cities, job_titles, industry_categories, tags)"
  type = object({
    skills              = object({ name = string, arn = string })
    certifications      = object({ name = string, arn = string })
    cities              = object({ name = string, arn = string })
    job_titles          = object({ name = string, arn = string })
    industry_categories = object({ name = string, arn = string })
    tags                = object({ name = string, arn = string })
  })
}

variable "resume_bucket_name" {
  type        = string
  description = "S3 bucket name for resumes"
}

variable "resume_bucket_arn" {
  type        = string
  description = "S3 bucket ARN for resumes"
}

variable "cors_allowed_origins" {
  type        = list(string)
  description = "Allowed origins for CORS"
  default     = ["http://localhost:5173"]
}

variable "opensearch_endpoint" {
  type        = string
  description = "OpenSearch domain endpoint (no scheme) for list_talents queries"
}

variable "opensearch_domain_arn" {
  type        = string
  description = "OpenSearch domain ARN for IAM policy"
}

variable "opensearch_layer_arn" {
  type        = string
  description = "ARN of the opensearch-py Lambda layer"
}

variable "github_pat_param" {
  type        = string
  description = "SSM parameter containing the GitHub personal access token"
  default     = "/aimory/github-pat"
}

variable "github_repo" {
  type        = string
  description = "GitHub repository in owner/repo form"
  default     = "bencas21/aimory-talent-pool"
}

variable "github_workflow_file" {
  type        = string
  description = "GitHub Actions workflow filename used for deployments"
  default     = "merge-deploy.yml"
}

variable "match_model_id" {
  type        = string
  description = "Bedrock model ID for candidate-matching LLM scoring (revamped matcher, full-résumé). Separate from extraction so the two can be upgraded independently. Sonnet 5 is not yet access-enabled for this account (Anthropic use-case form pending); using 4.6 until then."
  default     = "us.anthropic.claude-sonnet-4-6"
}
