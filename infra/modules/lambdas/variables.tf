variable "project_name" {
  description = "Project name used as a prefix for resources"
  type        = string
}

variable "environment" {
  description = "Environment name (dev/staging/prod)"
  type        = string
}

variable "resume_bucket" {
  description = "S3 bucket name where resumes are stored"
  type        = string
}

variable "resume_prefix" {
  description = "S3 key prefix for resume uploads"
  type        = string

}

variable "presign_api_key" {
  description = "Shared secret sent by Power Automate as x-api-key"
  type        = string
  sensitive   = true
}
