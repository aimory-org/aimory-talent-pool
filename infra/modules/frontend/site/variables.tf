variable "project_name" {
  description = "Project name used for tagging and naming"
  type        = string
}

variable "environment" {
  description = "Deployment environment (dev/staging/prod)"
  type        = string
}

variable "default_root_object" {
  description = "Default document CloudFront should serve"
  type        = string
  default     = "index.html"
}

variable "error_document" {
  description = "SPA fallback document for 4xx responses"
  type        = string
  default     = "index.html"
}

variable "price_class" {
  description = "CloudFront price class"
  type        = string
  default     = "PriceClass_100"
}

variable "domain_aliases" {
  description = "Optional custom domains (requires certificate)"
  type        = list(string)
  default     = []

  validation {
    condition     = length(var.domain_aliases) == 0 || var.certificate_arn != null
    error_message = "frontend_site: domain aliases require an ACM certificate ARN"
  }
}

variable "certificate_arn" {
  description = "ACM certificate ARN for the CloudFront distribution"
  type        = string
  default     = null
}
