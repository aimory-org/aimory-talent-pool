output "resume_bucket_name" {
  description = "S3 bucket used to store resumes"
  value       = module.storage.resume_bucket_name
}

output "project_name" {
  description = "Project name used for resource naming"
  value       = var.project_name
}

output "environment" {
  description = "Deployment environment name"
  value       = var.environment
}

output "pipeline_state_machine_arn" {
  description = "Step Functions state machine ARN for resume pipeline"
  value       = module.pipeline.state_machine_arn
}

output "talent_profiles_table_name" {
  description = "DynamoDB table name for talent profiles"
  value       = module.storage.talent_profiles_table_name
}

output "audit_log_table_name" {
  description = "DynamoDB table name for audit history"
  value       = module.storage.audit_log_table_name
}

output "skills_lookup_table_name" {
  description = "DynamoDB table name for skills lookup"
  value       = module.storage.skills_lookup_table_name
}

output "certifications_lookup_table_name" {
  description = "DynamoDB table name for certifications lookup"
  value       = module.storage.certifications_lookup_table_name
}

output "cities_lookup_table_name" {
  description = "DynamoDB table name for cities lookup"
  value       = module.storage.cities_lookup_table_name
}

output "job_titles_lookup_table_name" {
  description = "DynamoDB table name for job titles lookup"
  value       = module.storage.job_titles_lookup_table_name
}

output "industry_categories_lookup_table_name" {
  description = "DynamoDB table name for industry categories lookup"
  value       = module.storage.industry_categories_lookup_table_name
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

output "opensearch_endpoint" {
  description = "OpenSearch domain endpoint for backfill script"
  value       = module.storage.opensearch_endpoint
}
