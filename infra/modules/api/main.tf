# -----------------------------------------------------------------------------
# API Gateway HTTP API with Cognito JWT Authorization
# -----------------------------------------------------------------------------

resource "aws_apigatewayv2_api" "talent_api" {
  name          = "${var.project_name}-${var.environment}-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins     = var.cors_allowed_origins
    allow_methods     = ["GET", "POST", "PATCH", "DELETE", "OPTIONS"]
    allow_headers     = ["Authorization", "Content-Type"]
    expose_headers    = ["X-Pagination-Cursor"]
    max_age           = 3600
    allow_credentials = true
  }

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "aws_apigatewayv2_authorizer" "cognito" {
  api_id           = aws_apigatewayv2_api.talent_api.id
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  name             = "cognito-jwt"

  jwt_configuration {
    audience = [var.cognito_user_pool_client_id]
    issuer   = "https://cognito-idp.us-east-1.amazonaws.com/${regex("us-east-1_[A-Za-z0-9]+", var.cognito_user_pool_arn)}"
  }
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.talent_api.id
  name        = "$default"
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_logs.arn
    format = jsonencode({
      requestId        = "$context.requestId"
      ip               = "$context.identity.sourceIp"
      requestTime      = "$context.requestTime"
      httpMethod       = "$context.httpMethod"
      path             = "$context.path"
      status           = "$context.status"
      responseLength   = "$context.responseLength"
      integrationError = "$context.integrationErrorMessage"
    })
  }
}

resource "aws_cloudwatch_log_group" "api_logs" {
  name              = "/aws/apigateway/${var.project_name}-${var.environment}-api"
  retention_in_days = 14

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# -----------------------------------------------------------------------------
# IAM Role for API Lambdas
# -----------------------------------------------------------------------------

resource "aws_iam_role" "api_lambda_role" {
  name = "${var.project_name}-${var.environment}-api-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "api_lambda_logs" {
  role       = aws_iam_role.api_lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# DynamoDB read access for talent profiles (including GSIs)
resource "aws_iam_role_policy" "api_dynamodb_read" {
  name = "${var.project_name}-${var.environment}-api-dynamodb-read"
  role = aws_iam_role.api_lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ReadTalentProfiles"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:Query",
          "dynamodb:Scan"
        ]
        Resource = [
          var.talent_profiles_table_arn,
          "${var.talent_profiles_table_arn}/index/*"
        ]
      },
      {
        Sid    = "ReadJobDescriptions"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:Scan"
        ]
        Resource = var.job_descriptions_table_arn
      },
      {
        Sid    = "ReadLookupTables"
        Effect = "Allow"
        Action = [
          "dynamodb:Scan"
        ]
        Resource = [
          var.lookup_tables.skills.arn,
          var.lookup_tables.certifications.arn,
          var.lookup_tables.cities.arn,
          var.lookup_tables.job_titles.arn,
          var.lookup_tables.industry_categories.arn,
          var.lookup_tables.tags.arn
        ]
      },
      {
        Sid    = "ReadAuditLog"
        Effect = "Allow"
        Action = [
          "dynamodb:Scan",
          "dynamodb:Query"
        ]
        Resource = [
          var.audit_log_table_arn,
          "${var.audit_log_table_arn}/index/*"
        ]
      }
    ]
  })
}

# DynamoDB write access for updating and deleting talents
resource "aws_iam_role_policy" "api_dynamodb_write" {
  name = "${var.project_name}-${var.environment}-api-dynamodb-write"
  role = aws_iam_role.api_lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid    = "WriteTalentProfiles"
      Effect = "Allow"
      Action = [
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem"
      ]
      Resource = var.talent_profiles_table_arn
      },
      {
        Sid    = "WriteJobDescriptions"
        Effect = "Allow"
        Action = [
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem"
        ]
        Resource = var.job_descriptions_table_arn
      },
      {
        Sid    = "WriteLookupTables"
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem",
          "dynamodb:DeleteItem"
        ]
        Resource = [
          var.lookup_tables.skills.arn,
          var.lookup_tables.certifications.arn,
          var.lookup_tables.cities.arn,
          var.lookup_tables.job_titles.arn,
          var.lookup_tables.industry_categories.arn,
          var.lookup_tables.tags.arn
        ]
      },
      {
        Sid    = "WriteAuditLog"
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem"
        ]
        Resource = var.audit_log_table_arn
    }]
  })
}

# S3 read and delete access for resumes
resource "aws_iam_role_policy" "api_s3_read" {
  name = "${var.project_name}-${var.environment}-api-s3-read"
  role = aws_iam_role.api_lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ManageResumes"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:HeadObject",
          "s3:DeleteObject"
        ]
        Resource = "${var.resume_bucket_arn}/*"
      },
      {
        Sid    = "UploadJobDescriptions"
        Effect = "Allow"
        Action = [
          "s3:PutObject"
        ]
        Resource = "${var.resume_bucket_arn}/job-descriptions/raw/*"
      }
    ]
  })
}

# OpenSearch HTTP access for list_talents
resource "aws_iam_role_policy" "api_opensearch" {
  name = "${var.project_name}-${var.environment}-api-opensearch"
  role = aws_iam_role.api_lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid    = "OpenSearchQuery"
      Effect = "Allow"
      Action = [
        "es:ESHttpGet",
        "es:ESHttpPost",
        "es:ESHttpPut",
        "es:ESHttpHead"
      ]
      Resource = "${var.opensearch_domain_arn}/*"
    }]
  })
}

resource "aws_iam_role_policy" "api_ssm" {
  name = "${var.project_name}-${var.environment}-api-ssm"
  role = aws_iam_role.api_lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid      = "ReadGitHubToken"
      Effect   = "Allow"
      Action   = ["ssm:GetParameter"]
      Resource = "arn:aws:ssm:*:*:parameter${var.github_pat_param}"
    }]
  })
}

# Bedrock access for match_candidates scoring
resource "aws_iam_role_policy" "api_bedrock" {
  name = "${var.project_name}-${var.environment}-api-bedrock"
  role = aws_iam_role.api_lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid    = "InvokeBedrockModel"
      Effect = "Allow"
      Action = ["bedrock:InvokeModel", "bedrock:Converse"]
      Resource = [
        "arn:aws:bedrock:*::foundation-model/*",
        "arn:aws:bedrock:*:*:inference-profile/*",
      ]
    }]
  })
}
