############################################
# Presign Lambda (Power Automate -> S3)
############################################

# Build zip automatically from source file
data "archive_file" "presign_zip" {
  type        = "zip"
  source_file = "${path.module}/lambda_src/presign/app.py"
  output_path = "${path.module}/presign.zip"
}

resource "aws_iam_role" "presign_lambda_role" {
  name = "${var.project_name}-${var.environment}-presign-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Effect = "Allow",
      Principal = { Service = "lambda.amazonaws.com" },
      Action = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "presign_basic_logs" {
  role      = aws_iam_role.presign_lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_lambda_function" "presign" {
  function_name = "${var.project_name}-${var.environment}-presign"
  role          = aws_iam_role.presign_lambda_role.arn
  runtime       = "python3.12"
  handler       = "app.handler"

  filename         = data.archive_file.presign_zip.output_path
  source_code_hash = data.archive_file.presign_zip.output_base64sha256

  environment {
    variables = {
      RESUME_BUCKET   = var.resume_bucket
      RESUME_PREFIX   = var.resume_prefix
      PRESIGN_API_KEY = var.presign_api_key
    }
  }
}

# Public URL, protected by x-api-key in code
resource "aws_lambda_function_url" "presign" {
  function_name      = aws_lambda_function.presign.arn
  authorization_type = "NONE"
}
