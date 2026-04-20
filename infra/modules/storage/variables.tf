variable "project_name" {
  description = "Project name used as a prefix for resources"
  type        = string
}

variable "environment" {
  description = "Environment name (dev/staging/prod)"
  type        = string
}

variable "cors_allowed_origins" {
  description = "Allowed origins for S3 CORS (CloudFront domain, localhost, etc.)"
  type        = list(string)
  default     = []
}
