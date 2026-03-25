output "resume_bucket_name" {
  description = "S3 bucket used to store resumes"
  value       = module.storage.resume_bucket_name
}

output "presign_function_url" {
  description = "Public function URL for the presign Lambda"
  value       = module.pipeline.presign_function_url
}

output "frontend_site_bucket_name" {
  description = "S3 bucket hosting the frontend"
  value       = module.frontend_site.bucket_name
}

output "frontend_distribution_domain" {
  description = "CloudFront domain name for the frontend"
  value       = module.frontend_site.distribution_domain_name
}

output "frontend_distribution_id" {
  description = "CloudFront distribution ID"
  value       = module.frontend_site.distribution_id
}

# Cognito outputs for frontend configuration
output "cognito_user_pool_id" {
  description = "Cognito User Pool ID"
  value       = module.cognito.user_pool_id
}

output "cognito_web_client_id" {
  description = "Cognito App Client ID for frontend"
  value       = module.cognito.web_client_id
}

output "cognito_domain_url" {
  description = "Cognito hosted UI domain URL"
  value       = module.cognito.domain_url
}

output "cognito_frontend_config" {
  description = "Full configuration object for frontend auth setup"
  value       = module.cognito.frontend_config
}

# API Gateway
output "api_endpoint" {
  description = "API Gateway endpoint URL for frontend"
  value       = module.api.api_endpoint
}
