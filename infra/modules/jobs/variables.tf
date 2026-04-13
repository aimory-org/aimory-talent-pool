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

# Lookup table names and ARNs for the dedup job
variable "skills_lookup_table_name" {
  type        = string
  description = "DynamoDB table name for skills lookup"
}

variable "skills_lookup_table_arn" {
  type        = string
  description = "DynamoDB table ARN for skills lookup"
}

variable "certifications_lookup_table_name" {
  type        = string
  description = "DynamoDB table name for certifications lookup"
}

variable "certifications_lookup_table_arn" {
  type        = string
  description = "DynamoDB table ARN for certifications lookup"
}

variable "job_titles_lookup_table_name" {
  type        = string
  description = "DynamoDB table name for job titles lookup"
}

variable "job_titles_lookup_table_arn" {
  type        = string
  description = "DynamoDB table ARN for job titles lookup"
}

variable "industry_categories_lookup_table_name" {
  type        = string
  description = "DynamoDB table name for industry categories lookup"
}

variable "industry_categories_lookup_table_arn" {
  type        = string
  description = "DynamoDB table ARN for industry categories lookup"
}

variable "cities_lookup_table_name" {
  type        = string
  description = "DynamoDB table name for cities lookup"
}

variable "cities_lookup_table_arn" {
  type        = string
  description = "DynamoDB table ARN for cities lookup"
}

variable "bedrock_model_id" {
  type        = string
  description = "Bedrock model ID for AI deduplication"
  default     = "us.anthropic.claude-sonnet-4-20250514-v1:0"
}
