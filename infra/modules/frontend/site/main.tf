data "aws_caller_identity" "current" {}

locals {
  bucket_name = "${var.project_name}-${var.environment}-frontend-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket" "site" {
  bucket        = local.bucket_name
  force_destroy = false

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
    Component   = "frontend"
  }
}

resource "aws_s3_bucket_ownership_controls" "site" {
  bucket = aws_s3_bucket.site.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_public_access_block" "site" {
  bucket = aws_s3_bucket.site.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "site" {
  bucket = aws_s3_bucket.site.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "site" {
  bucket = aws_s3_bucket.site.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_cloudfront_origin_access_control" "site" {
  name                              = "${var.project_name}-${var.environment}-frontend-oac"
  description                       = "Origin access control for ${var.project_name} frontend"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_response_headers_policy" "site" {
  name = "${var.project_name}-${var.environment}-security"

  security_headers_config {
    content_security_policy {
      override                = true
      content_security_policy = "default-src 'self'; connect-src 'self' https://cognito-idp.us-east-1.amazonaws.com https://*.auth.us-east-1.amazoncognito.com https://*.execute-api.us-east-1.amazonaws.com https://*.s3.us-east-1.amazonaws.com https://*.s3.amazonaws.com; img-src 'self' data: blob:; font-src 'self' https://fonts.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; script-src 'self' 'unsafe-inline'; frame-src 'self' https://*.auth.us-east-1.amazoncognito.com https://login.microsoftonline.com https://docs.google.com https://*.s3.amazonaws.com https://*.s3.us-east-1.amazonaws.com;"
    }

    strict_transport_security {
      override                   = true
      access_control_max_age_sec = 63072000
      include_subdomains         = true
      preload                    = true
    }

    xss_protection {
      override   = true
      protection = true
      mode_block = true
    }

    frame_options {
      override     = true
      frame_option = "DENY"
    }

    referrer_policy {
      override        = true
      referrer_policy = "same-origin"
    }

    content_type_options {
      override = true
    }
  }
}

resource "aws_cloudfront_distribution" "site" {
  enabled             = true
  comment             = "${var.project_name}-${var.environment} frontend"
  default_root_object = var.default_root_object
  http_version        = "http2and3"
  price_class         = var.price_class
  aliases             = var.domain_aliases

  origin {
    domain_name              = aws_s3_bucket.site.bucket_regional_domain_name
    origin_id                = "frontend-site"
    origin_access_control_id = aws_cloudfront_origin_access_control.site.id
  }

  default_cache_behavior {
    target_origin_id           = "frontend-site"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = "658327ea-f89d-4fab-a63d-7e88639e58f6" # Managed-CachingOptimized
    origin_request_policy_id   = "88a5eaf4-2fd4-4709-b370-b4c650ea3fcf" # Managed-AllViewer
    response_headers_policy_id = aws_cloudfront_response_headers_policy.site.id
  }

  custom_error_response {
    error_code         = 403
    response_page_path = "/${var.error_document}"
    response_code      = 200
  }

  custom_error_response {
    error_code         = 404
    response_page_path = "/${var.error_document}"
    response_code      = 200
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = var.certificate_arn == null
    acm_certificate_arn            = var.certificate_arn
    ssl_support_method             = var.certificate_arn == null ? null : "sni-only"
    # Default CloudFront cert only supports TLSv1; custom certs get TLSv1.2_2021
    minimum_protocol_version = var.certificate_arn == null ? "TLSv1" : "TLSv1.2_2021"
  }

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
    Component   = "frontend"
  }
}

resource "aws_s3_bucket_policy" "site" {
  bucket = aws_s3_bucket.site.id

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Sid    = "AllowCloudFront"
        Effect = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action   = ["s3:GetObject"]
        Resource = "${aws_s3_bucket.site.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.site.arn
          }
        }
      }
    ]
  })

  depends_on = [aws_cloudfront_distribution.site]
}
