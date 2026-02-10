output "resume_bucket_name" {
  description = "S3 bucket used to store resumes"
  value       = aws_s3_bucket.resumes.bucket
}

output "resume_bucket_arn" {
  description = "ARN of the resumes S3 bucket"
  value       = aws_s3_bucket.resumes.arn
}

output "db_cluster_arn" {
  description = "Aurora cluster ARN"
  value       = aws_rds_cluster.talent.arn
}

output "db_secret_arn" {
  description = "Secrets Manager ARN for DB credentials"
  value       = aws_secretsmanager_secret.db.arn
}

output "db_name" {
  description = "Database name"
  value       = var.db_name
}
