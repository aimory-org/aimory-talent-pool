variable "project_name" { type = string }
variable "environment" { type = string }

# one bucket, different prefixes
variable "resume_bucket" { type = string }

variable "raw_prefix" {
  type    = string
  default = "raw"
}

variable "extracted_prefix" {
  type    = string
  default = "extracted"
}

# SSM parameter name that will contain the SFN state machine arn
# e.g. "/aimory-talent-pool/dev/pipeline/state_machine_arn"
variable "sfn_arn_param_name" { type = string }

# Presign (for your existing presign.tf)
variable "presign_api_key" { type = string }

variable "talent_profiles_table_name" { type = string }
variable "talent_profiles_table_arn" { type = string }

# Lookup tables
variable "skills_lookup_table_name" { type = string }
variable "skills_lookup_table_arn" { type = string }
variable "certifications_lookup_table_name" { type = string }
variable "certifications_lookup_table_arn" { type = string }
variable "cities_lookup_table_name" { type = string }
variable "cities_lookup_table_arn" { type = string }