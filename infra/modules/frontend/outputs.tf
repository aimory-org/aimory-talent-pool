output "bucket_name" {
  description = "S3 bucket that stores the static site"
  value       = aws_s3_bucket.site.bucket
}

output "distribution_domain_name" {
  description = "CloudFront domain for the frontend"
  value       = aws_cloudfront_distribution.site.domain_name
}

output "distribution_id" {
  description = "CloudFront distribution ID"
  value       = aws_cloudfront_distribution.site.id
}
