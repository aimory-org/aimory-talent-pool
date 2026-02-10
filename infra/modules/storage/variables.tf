variable "project_name" {
  description = "Project name used as a prefix for resources"
  type        = string
}

variable "environment" {
  description = "Environment name (dev/staging/prod)"
  type        = string
}

variable "db_name" {
  description = "Aurora database name"
  type        = string
  default     = "talent_profiles"
}

variable "db_username" {
  description = "Aurora database admin username"
  type        = string
  default     = "talent_admin"
}

variable "vpc_cidr" {
  description = "CIDR block for the database VPC"
  type        = string
  default     = "10.40.0.0/16"
}
