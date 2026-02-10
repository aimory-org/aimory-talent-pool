variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project name used as a prefix for resources"
  type        = string
  default     = "aimory-talent-pool"
}

variable "environment" {
  description = "Environment name (dev/staging/prod)"
  type        = string
  default     = "dev"
}

variable "presign_api_key" {
  description = "Shared secret for the presign Lambda (x-api-key)"
  type        = string
  sensitive   = true
}

variable "raw_prefix" {
  description = "S3 key prefix for resume uploads"
  type        = string
  default     = "raw/onedrive"
}

variable "extracted_prefix" {
  description = "S3 key prefix for textract json"
  type        = string
  default     = "extracted"
}

variable "sfn_arn_param_name" {
  description = "SSM Parameter name containing Step Functions state machine ARN"
  type        = string
}

variable "db_name" {
  description = "Aurora database name"
  type        = string
  default     = "talent_profiles"
}
