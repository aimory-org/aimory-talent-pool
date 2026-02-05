output "resume_bucket_name" {
  description = "S3 bucket used to store resumes"
  value       = module.storage.resume_bucket_name
}

output "presign_function_url" {
  description = "Public function URL for the presign Lambda"
  value       = module.lambdas.presign_function_url
}
