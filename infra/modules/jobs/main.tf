# -----------------------------------------------------------------------------
# Scheduled Background Jobs
# Currently contains the stale candidate checker.
# Add future scheduled jobs here.
# -----------------------------------------------------------------------------

locals {
  stale_checker_name = "${var.project_name}-${var.environment}-stale-checker"
}

data "archive_file" "stale_checker_zip" {
  type        = "zip"
  source_dir  = "${path.module}/lambda_src/stale_checker"
  output_path = "${path.module}/stale_checker.zip"
}

resource "aws_lambda_function" "stale_checker" {
  function_name = local.stale_checker_name
  role          = aws_iam_role.stale_checker_role.arn
  runtime       = "python3.12"
  handler       = "app.handler"

  filename         = data.archive_file.stale_checker_zip.output_path
  source_code_hash = data.archive_file.stale_checker_zip.output_base64sha256

  timeout     = 300 # 5 minutes for scanning large tables
  memory_size = 256

  environment {
    variables = {
      TALENT_PROFILES_TABLE = var.talent_profiles_table_name
      STALE_DAYS            = "90"
    }
  }

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# Dedicated IAM role — needs scan + write, separate from read-only API role
resource "aws_iam_role" "stale_checker_role" {
  name = "${var.project_name}-${var.environment}-stale-checker-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Effect    = "Allow",
      Principal = { Service = "lambda.amazonaws.com" },
      Action    = "sts:AssumeRole"
    }]
  })

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "aws_iam_role_policy_attachment" "stale_checker_logs" {
  role       = aws_iam_role.stale_checker_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "stale_checker_dynamodb" {
  name = "${var.project_name}-${var.environment}-stale-checker-policy"
  role = aws_iam_role.stale_checker_role.id

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Effect   = "Allow",
      Action   = ["dynamodb:Scan", "dynamodb:UpdateItem"],
      Resource = var.talent_profiles_table_arn
    }]
  })
}

# EventBridge rule — triggers daily at 2 AM UTC
resource "aws_cloudwatch_event_rule" "stale_checker_schedule" {
  name                = "${var.project_name}-${var.environment}-stale-checker-schedule"
  description         = "Triggers stale candidate checker daily"
  schedule_expression = "cron(0 2 * * ? *)"

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "aws_cloudwatch_event_target" "stale_checker_target" {
  rule      = aws_cloudwatch_event_rule.stale_checker_schedule.name
  target_id = "StaleCheckerLambda"
  arn       = aws_lambda_function.stale_checker.arn
}

resource "aws_lambda_permission" "stale_checker_eventbridge" {
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.stale_checker.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.stale_checker_schedule.arn
}

# -----------------------------------------------------------------------------
# Lookup Dedup Job — AI-powered deduplication of lookup tables
# Runs weekly on Sundays at 3 AM UTC, or invoke manually.
# -----------------------------------------------------------------------------

locals {
  lookup_dedup_name = "${var.project_name}-${var.environment}-lookup-dedup"
}

data "archive_file" "lookup_dedup_zip" {
  type        = "zip"
  source_dir  = "${path.module}/lambda_src/lookup_dedup"
  output_path = "${path.module}/lookup_dedup.zip"
}

resource "aws_lambda_function" "lookup_dedup" {
  function_name = local.lookup_dedup_name
  role          = aws_iam_role.lookup_dedup_role.arn
  runtime       = "python3.12"
  handler       = "app.handler"

  filename         = data.archive_file.lookup_dedup_zip.output_path
  source_code_hash = data.archive_file.lookup_dedup_zip.output_base64sha256

  timeout     = 600 # 10 minutes — scans all profiles + calls Bedrock
  memory_size = 256

  environment {
    variables = {
      TALENT_PROFILES_TABLE            = var.talent_profiles_table_name
      AUDIT_LOG_TABLE                  = var.audit_log_table_name
      SKILLS_LOOKUP_TABLE              = var.lookup_tables.skills.name
      CERTIFICATIONS_LOOKUP_TABLE      = var.lookup_tables.certifications.name
      JOB_TITLES_LOOKUP_TABLE          = var.lookup_tables.job_titles.name
      INDUSTRY_CATEGORIES_LOOKUP_TABLE = var.lookup_tables.industry_categories.name
      CITIES_LOOKUP_TABLE              = var.lookup_tables.cities.name
      BEDROCK_MODEL_ID                 = var.bedrock_model_id
    }
  }

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "aws_iam_role" "lookup_dedup_role" {
  name = "${var.project_name}-${var.environment}-lookup-dedup-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Effect    = "Allow",
      Principal = { Service = "lambda.amazonaws.com" },
      Action    = "sts:AssumeRole"
    }]
  })

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "aws_iam_role_policy_attachment" "lookup_dedup_logs" {
  role       = aws_iam_role.lookup_dedup_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "lookup_dedup_dynamodb" {
  name = "${var.project_name}-${var.environment}-lookup-dedup-dynamodb"
  role = aws_iam_role.lookup_dedup_role.id

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect   = "Allow",
        Action   = ["dynamodb:Scan", "dynamodb:UpdateItem", "dynamodb:GetItem"],
        Resource = var.talent_profiles_table_arn
      },
      {
        Effect = "Allow",
        Action = ["dynamodb:Scan", "dynamodb:PutItem", "dynamodb:DeleteItem"],
        Resource = [
          var.lookup_tables.skills.arn,
          var.lookup_tables.certifications.arn,
          var.lookup_tables.job_titles.arn,
          var.lookup_tables.industry_categories.arn,
          var.lookup_tables.cities.arn,
        ]
      },
      {
        Effect   = "Allow",
        Action   = ["dynamodb:PutItem"],
        Resource = var.audit_log_table_arn
      }
    ]
  })
}

resource "aws_iam_role_policy" "lookup_dedup_bedrock" {
  name = "${var.project_name}-${var.environment}-lookup-dedup-bedrock"
  role = aws_iam_role.lookup_dedup_role.id

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Effect   = "Allow",
      Action   = ["bedrock:InvokeModel", "bedrock:Converse"],
      Resource = "*"
    }]
  })
}

# EventBridge rule — triggers weekly on Sundays at 3 AM UTC
resource "aws_cloudwatch_event_rule" "lookup_dedup_schedule" {
  name                = "${var.project_name}-${var.environment}-lookup-dedup-schedule"
  description         = "Triggers lookup table deduplication weekly"
  schedule_expression = "cron(0 3 ? * SUN *)"

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "aws_cloudwatch_event_target" "lookup_dedup_target" {
  rule      = aws_cloudwatch_event_rule.lookup_dedup_schedule.name
  target_id = "LookupDedupLambda"
  arn       = aws_lambda_function.lookup_dedup.arn
}

resource "aws_lambda_permission" "lookup_dedup_eventbridge" {
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.lookup_dedup.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.lookup_dedup_schedule.arn
}
