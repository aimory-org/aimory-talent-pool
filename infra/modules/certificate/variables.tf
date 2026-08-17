variable "project_name" {
  description = "Project name used in tags"
  type        = string
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
}

variable "hostname" {
  description = "Fully-qualified hostname the certificate covers, e.g. arrow.aimoryconsulting.com"
  type        = string

  validation {
    condition     = length(split(".", var.hostname)) >= 3
    error_message = "certificate: hostname must be a subdomain (e.g. arrow.example.com). An apex domain can't be served by CloudFront via CNAME, and the registrar host calculation assumes a subdomain."
  }
}
