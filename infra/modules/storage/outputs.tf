output "resume_bucket_name" {
  description = "S3 bucket used to store resumes"
  value       = aws_s3_bucket.resumes.bucket
}

output "resume_bucket_arn" {
  description = "ARN of the resumes S3 bucket"
  value       = aws_s3_bucket.resumes.arn
}

output "talent_profiles_table_name" {
  description = "DynamoDB table name for talent profiles"
  value       = aws_dynamodb_table.talent_profiles.name
}

output "talent_profiles_table_arn" {
  description = "DynamoDB table ARN for talent profiles"
  value       = aws_dynamodb_table.talent_profiles.arn
}

output "audit_log_table_name" {
  description = "DynamoDB table name for audit history"
  value       = aws_dynamodb_table.audit_log.name
}

output "audit_log_table_arn" {
  description = "DynamoDB table ARN for audit history"
  value       = aws_dynamodb_table.audit_log.arn
}

# Lookup tables
output "skills_lookup_table_name" {
  description = "DynamoDB table name for skills lookup"
  value       = aws_dynamodb_table.skills_lookup.name
}

output "skills_lookup_table_arn" {
  description = "DynamoDB table ARN for skills lookup"
  value       = aws_dynamodb_table.skills_lookup.arn
}

output "certifications_lookup_table_name" {
  description = "DynamoDB table name for certifications lookup"
  value       = aws_dynamodb_table.certifications_lookup.name
}

output "certifications_lookup_table_arn" {
  description = "DynamoDB table ARN for certifications lookup"
  value       = aws_dynamodb_table.certifications_lookup.arn
}

output "cities_lookup_table_name" {
  description = "DynamoDB table name for cities lookup"
  value       = aws_dynamodb_table.cities_lookup.name
}

output "cities_lookup_table_arn" {
  description = "DynamoDB table ARN for cities lookup"
  value       = aws_dynamodb_table.cities_lookup.arn
}

output "job_titles_lookup_table_name" {
  description = "DynamoDB table name for job titles lookup"
  value       = aws_dynamodb_table.job_titles_lookup.name
}

output "job_titles_lookup_table_arn" {
  description = "DynamoDB table ARN for job titles lookup"
  value       = aws_dynamodb_table.job_titles_lookup.arn
}

output "industry_categories_lookup_table_name" {
  description = "DynamoDB table name for industry categories lookup"
  value       = aws_dynamodb_table.industry_categories_lookup.name
}

output "industry_categories_lookup_table_arn" {
  description = "DynamoDB table ARN for industry categories lookup"
  value       = aws_dynamodb_table.industry_categories_lookup.arn
}

output "tags_lookup_table_name" {
  description = "DynamoDB table name for tags lookup"
  value       = aws_dynamodb_table.tags_lookup.name
}

output "tags_lookup_table_arn" {
  description = "DynamoDB table ARN for tags lookup"
  value       = aws_dynamodb_table.tags_lookup.arn
}

# Job descriptions table
output "job_descriptions_table_name" {
  description = "DynamoDB table name for job descriptions"
  value       = aws_dynamodb_table.job_descriptions.name
}

output "job_descriptions_table_arn" {
  description = "DynamoDB table ARN for job descriptions"
  value       = aws_dynamodb_table.job_descriptions.arn
}

# Consolidated lookup tables object — pass this to modules instead of 10+ individual vars
output "lookup_tables" {
  description = "All lookup tables as a single object with name and arn per table"
  value = {
    skills              = { name = aws_dynamodb_table.skills_lookup.name, arn = aws_dynamodb_table.skills_lookup.arn }
    certifications      = { name = aws_dynamodb_table.certifications_lookup.name, arn = aws_dynamodb_table.certifications_lookup.arn }
    cities              = { name = aws_dynamodb_table.cities_lookup.name, arn = aws_dynamodb_table.cities_lookup.arn }
    job_titles          = { name = aws_dynamodb_table.job_titles_lookup.name, arn = aws_dynamodb_table.job_titles_lookup.arn }
    industry_categories = { name = aws_dynamodb_table.industry_categories_lookup.name, arn = aws_dynamodb_table.industry_categories_lookup.arn }
    tags                = { name = aws_dynamodb_table.tags_lookup.name, arn = aws_dynamodb_table.tags_lookup.arn }
  }
}

output "talent_profiles_table_stream_arn" {
  description = "DynamoDB Stream ARN for talent profiles table"
  value       = aws_dynamodb_table.talent_profiles.stream_arn
}

output "opensearch_endpoint" {
  description = "OpenSearch domain HTTPS endpoint (no scheme)"
  value       = aws_opensearch_domain.talent_search.endpoint
}

output "opensearch_domain_arn" {
  description = "OpenSearch domain ARN"
  value       = aws_opensearch_domain.talent_search.arn
}

output "opensearch_layer_arn" {
  description = "ARN of the opensearch-py Lambda layer"
  value       = aws_lambda_layer_version.opensearch.arn
}
