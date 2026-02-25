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
}
