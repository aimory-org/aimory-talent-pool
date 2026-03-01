# Stale Candidate Checker Lambda
# Runs daily to mark candidates as "Stale Candidate" after 90 days

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

  timeout     = 300  # 5 minutes for scanning large tables
  memory_size = 256

  environment {
    variables = {
      TALENT_PROFILES_TABLE = var.talent_profiles_table_name
      STALE_DAYS            = "90"
    }
  }
}

# Dedicated IAM role for stale checker
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
    Statement = [
      {
        Effect = "Allow",
        Action = [
          "dynamodb:Scan",
          "dynamodb:UpdateItem"
        ],
        Resource = var.talent_profiles_table_arn
      }
    ]
  })
}

# EventBridge rule to trigger daily at 2 AM UTC
resource "aws_cloudwatch_event_rule" "stale_checker_schedule" {
  name                = "${var.project_name}-${var.environment}-stale-checker-schedule"
  description         = "Triggers stale candidate checker daily"
  schedule_expression = "cron(0 2 * * ? *)"  # Daily at 2:00 AM UTC
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
