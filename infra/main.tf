# This asks AWS: "who am I authenticated as?" and returns your AWS account ID.
data "aws_caller_identity" "current" {}

# locals are computed values used to keep the config clean.
locals {
  bucket_name = "${var.project_name}-${var.environment}-resumes-${data.aws_caller_identity.current.account_id}"
}

# Create the S3 bucket itself.
resource "aws_s3_bucket" "resumes" {
  bucket        = local.bucket_name
  force_destroy = false

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# Block all public access at the bucket level.
resource "aws_s3_bucket_public_access_block" "resumes" {
  bucket = aws_s3_bucket.resumes.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Encrypt files at rest by default using S3-managed keys (AES256).
resource "aws_s3_bucket_server_side_encryption_configuration" "resumes" {
  bucket = aws_s3_bucket.resumes.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Enable versioning so overwrites become new versions (useful for resumes).
resource "aws_s3_bucket_versioning" "resumes" {
  bucket = aws_s3_bucket.resumes.id

  versioning_configuration {
    status = "Enabled"
  }
}
