output "resume_bucket_name" {
  description = "S3 bucket used to store resumes"
  value       = aws_s3_bucket.resumes.bucket
}
