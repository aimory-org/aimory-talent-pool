variable "project_name" {
  description = "Project name used for tagging and naming"
  type        = string
}

variable "environment" {
  description = "Deployment environment (dev/staging/prod)"
  type        = string
}

variable "callback_urls" {
  description = "Allowed callback URLs for the app client"
  type        = list(string)
  default     = ["http://localhost:5173"]
}

variable "logout_urls" {
  description = "Allowed logout redirect URLs"
  type        = list(string)
  default     = ["http://localhost:5173"]
}

# Microsoft Entra ID (Azure AD) OIDC Configuration
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

