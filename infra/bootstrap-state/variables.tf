variable "aws_region" {
  description = "AWS region to deploy the backend into"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Prefix used for backend resource names"
  type        = string
  default     = "aimory-talent-pool"
}
