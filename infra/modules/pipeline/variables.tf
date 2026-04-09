variable "project_name" {
  type        = string
  description = "Project name for resource naming"
}

variable "environment" {
  type        = string
  description = "Environment (dev/staging/prod)"
}

variable "resume_bucket" {
  type        = string
  description = "S3 bucket name for resumes"
}

variable "resume_bucket_arn" {
  type        = string
  description = "S3 bucket ARN for resumes"
}

variable "raw_prefix" {
  type        = string
  default     = "raw"
  description = "S3 prefix for raw uploaded resumes"
}

variable "extracted_prefix" {
  type        = string
  default     = "extracted"
  description = "S3 prefix for Textract-extracted text"
}

variable "presign_api_key" {
  type        = string
  description = "API key for the presign upload endpoint (Power Automate)"
  sensitive   = true
}

variable "sfn_arn_param_name" {
  type        = string
  description = "SSM parameter name that stores the Step Functions state machine ARN"
}

variable "talent_profiles_table_name" {
  type        = string
  description = "DynamoDB table name for talent profiles"
}

variable "talent_profiles_table_arn" {
  type        = string
  description = "DynamoDB table ARN for talent profiles"
}

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

variable "cities_lookup_table_name" {
  type        = string
  description = "DynamoDB table name for cities lookup"
}

variable "cities_lookup_table_arn" {
  type        = string
  description = "DynamoDB table ARN for cities lookup"
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

variable "bedrock_model_id" {
  type        = string
  description = "Bedrock model ID used by the llm_extract Lambda for resume parsing"
  default     = "us.anthropic.claude-sonnet-4-20250514-v1:0"
}
