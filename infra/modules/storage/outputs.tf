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
