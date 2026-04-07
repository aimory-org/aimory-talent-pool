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

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be dev, staging, or prod."
  }
}

variable "presign_api_key" {
  description = "Shared secret for the presign Lambda (x-api-key)"
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.presign_api_key) >= 16
    error_message = "presign_api_key must be at least 16 characters."
  }
}

variable "bedrock_model_id" {
  description = "Bedrock model ID used by the pipeline for resume parsing"
  type        = string
  default     = "us.anthropic.claude-sonnet-4-20250514-v1:0"
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
  default     = "/aimory-talent-pool/dev/resume-pipeline-arn"

  validation {
    condition     = startswith(var.sfn_arn_param_name, "/")
    error_message = "SSM parameter name must start with /."
  }
}

variable "frontend_domain_aliases" {
  description = "Optional custom domains for the CloudFront frontend"
  type        = list(string)
  default     = []
}

variable "frontend_certificate_arn" {
  description = "ACM certificate ARN in us-east-1 for the frontend distribution"
  type        = string
  default     = null
}

# Cognito / Auth configuration
variable "cognito_callback_urls" {
  description = "Allowed callback URLs for Cognito app client"
  type        = list(string)
  default     = ["http://localhost:5173"]
}

variable "cognito_logout_urls" {
  description = "Allowed logout redirect URLs for Cognito"
  type        = list(string)
  default     = ["http://localhost:5173"]
}

variable "entra_client_id" {
  description = "Microsoft Entra ID Application (client) ID"
  type        = string
}

variable "entra_client_secret" {
  description = "Microsoft Entra ID client secret"
  type        = string
  sensitive   = true
}

variable "entra_tenant_id" {
  description = "Microsoft Entra ID tenant ID"
  type        = string

  validation {
    condition     = can(regex("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", var.entra_tenant_id))
    error_message = "entra_tenant_id must be a valid UUID."
  }
}
