variable "project_name" {
  type        = string
  description = "Project name for resource naming"
}

variable "environment" {
  type        = string
  description = "Environment (dev/staging/prod)"
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

# Lookup table names and ARNs for the dedup job
variable "lookup_tables" {
  description = "Shared lookup tables (skills, certifications, cities, job_titles, industry_categories)"
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
  description = "Bedrock model ID for AI deduplication"
  default     = "us.anthropic.claude-sonnet-4-20250514-v1:0"
}
