# -----------------------------------------------------------------------------
# Presign Lambda — public upload endpoint (e.g. for Power Automate)
# Only created when enable_presign_url = true.
# -----------------------------------------------------------------------------

data "archive_file" "presign_zip" {
  count       = var.enable_presign_url ? 1 : 0
  type        = "zip"
  source_file = "${path.module}/lambda_src/presign/app.py"
  output_path = "${path.module}/${var.pipeline_name}-presign.zip"
}

resource "aws_iam_role" "presign_lambda_role" {
  count = var.enable_presign_url ? 1 : 0
  name  = "${var.resource_prefix}-presign-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Effect    = "Allow",
      Principal = { Service = "lambda.amazonaws.com" },
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "presign_basic_logs" {
  count      = var.enable_presign_url ? 1 : 0
  role       = aws_iam_role.presign_lambda_role[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "presign_s3_put" {
  count = var.enable_presign_url ? 1 : 0
  name  = "${var.resource_prefix}-presign-s3-put"
  role  = aws_iam_role.presign_lambda_role[0].id

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Effect   = "Allow",
      Action   = ["s3:PutObject"],
      Resource = "arn:aws:s3:::${var.document_bucket}/${var.raw_prefix}/*"
    }]
  })
}

resource "aws_lambda_function" "presign" {
  count         = var.enable_presign_url ? 1 : 0
  function_name = "${var.resource_prefix}-presign"
  role          = aws_iam_role.presign_lambda_role[0].arn
  runtime       = "python3.12"
  handler       = "app.handler"

  filename         = data.archive_file.presign_zip[0].output_path
  source_code_hash = data.archive_file.presign_zip[0].output_base64sha256

  environment {
    variables = {
      DOCUMENT_BUCKET = var.document_bucket
      DOCUMENT_PREFIX = var.raw_prefix
      PRESIGN_API_KEY = var.presign_api_key
    }
  }
}

resource "aws_lambda_function_url" "presign" {
  count              = var.enable_presign_url ? 1 : 0
  function_name      = aws_lambda_function.presign[0].arn
  authorization_type = "NONE"
}

resource "aws_lambda_permission" "presign_allow_url" {
  count                  = var.enable_presign_url ? 1 : 0
  statement_id           = "AllowPublicInvokeFunctionUrl"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.presign[0].function_name
  principal              = "*"
  function_url_auth_type = "NONE"
}

resource "aws_lambda_permission" "presign_allow_invoke" {
  count         = var.enable_presign_url ? 1 : 0
  statement_id  = "AllowPublicInvokeFunction"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.presign[0].function_name
  principal     = "*"
}
