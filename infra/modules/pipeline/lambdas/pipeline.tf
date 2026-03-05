locals {
  # One place to add lambdas or adjust timeouts/memory/env
  pipeline_lambdas = {
    starter = {
      timeout = 30
      memory  = 256
      env = {
        SFN_ARN_PARAM = var.sfn_arn_param_name
        RAW_PREFIX    = "${var.raw_prefix}/"
      }
    }

    classify = { timeout = 15, memory = 256, env = {} }

    start_textract = { timeout = 30, memory = 256, env = {} }
    check_textract = { timeout = 30, memory = 256, env = {} }

    fetch_textract = {
      timeout = 60
      memory  = 512
      env = {
        OUT_BUCKET = var.resume_bucket
        OUT_PREFIX = "${var.extracted_prefix}/"
      }
    }

    normalize = { timeout = 30, memory = 512, env = {} }

    llm_extract = {
      timeout = 120
      memory  = 1024
      env = {
        MODEL_ID = var.bedrock_model_id
      }
    }

    persist = {
      timeout = 30
      memory  = 512
      env = {
        TALENT_PROFILES_TABLE       = var.talent_profiles_table_name
        SKILLS_LOOKUP_TABLE         = var.skills_lookup_table_name
        CERTIFICATIONS_LOOKUP_TABLE = var.certifications_lookup_table_name
        CITIES_LOOKUP_TABLE         = var.cities_lookup_table_name
      }
    }
  }
  pdfminer_layer_ready = length(fileset(path.module, "layers/pdfminer/python/**")) > 0
}

# Package each lambda from lambda_src/<name>/app.py 
data "archive_file" "pipeline_zip" {
  for_each    = local.pipeline_lambdas
  type        = "zip"
  source_dir  = "${path.module}/lambda_src/${each.key}"
  output_path = "${path.module}/${each.key}.zip"
}

data "archive_file" "pdfminer_layer" {
  type        = "zip"
  source_dir  = "${path.module}/layers/pdfminer"
  output_path = "${path.module}/pdfminer_layer.zip"
}

resource "aws_lambda_layer_version" "pdfminer" {
  layer_name          = "${var.project_name}-${var.environment}-pdfminer"
  filename            = data.archive_file.pdfminer_layer.output_path
  source_code_hash    = data.archive_file.pdfminer_layer.output_base64sha256
  compatible_runtimes = ["python3.12"]
  description         = "pdfminer.six for PDF text extraction"

  lifecycle {
    precondition {
      condition     = local.pdfminer_layer_ready
      error_message = "pdfminer layer is missing. Run the build script to create layers/pdfminer/python before terraform apply."
    }
  }
}

# Shared role for all pipeline lambdas
resource "aws_iam_role" "pipeline_lambda_role" {
  name = "${var.project_name}-${var.environment}-pipeline-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Effect    = "Allow",
      Principal = { Service = "lambda.amazonaws.com" },
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "pipeline_basic_logs" {
  role       = aws_iam_role.pipeline_lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Permissions for the pipeline - split into logical policies for clarity

# S3 access for raw and extracted prefixes
resource "aws_iam_role_policy" "pipeline_s3" {
  name = "${var.project_name}-${var.environment}-pipeline-s3"
  role = aws_iam_role.pipeline_lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Sid      = "ReadRawResumes"
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:DeleteObject"]
        Resource = "arn:aws:s3:::${var.resume_bucket}/${var.raw_prefix}/*"
      },
      {
        Sid      = "WriteExtractedData"
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject"]
        Resource = "arn:aws:s3:::${var.resume_bucket}/${var.extracted_prefix}/*"
      }
    ]
  })
}

# Textract for document processing
resource "aws_iam_role_policy" "pipeline_textract" {
  name = "${var.project_name}-${var.environment}-pipeline-textract"
  role = aws_iam_role.pipeline_lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Effect   = "Allow"
      Action   = ["textract:StartDocumentTextDetection", "textract:GetDocumentTextDetection"]
      Resource = "*"
    }]
  })
}

# SSM for reading Step Functions ARN
resource "aws_iam_role_policy" "pipeline_ssm" {
  name = "${var.project_name}-${var.environment}-pipeline-ssm"
  role = aws_iam_role.pipeline_lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Effect   = "Allow"
      Action   = ["ssm:GetParameter"]
      Resource = "arn:aws:ssm:*:*:parameter${var.sfn_arn_param_name}"
    }]
  })
}

# Bedrock for LLM extraction
resource "aws_iam_role_policy" "pipeline_bedrock" {
  name = "${var.project_name}-${var.environment}-pipeline-bedrock"
  role = aws_iam_role.pipeline_lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Effect   = "Allow"
      Action   = ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"]
      Resource = "*"
    }]
  })
}

# DynamoDB for persisting talent profiles and lookups
resource "aws_iam_role_policy" "pipeline_dynamodb" {
  name = "${var.project_name}-${var.environment}-pipeline-dynamodb"
  role = aws_iam_role.pipeline_lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Sid      = "TalentProfiles"
        Effect   = "Allow"
        Action   = ["dynamodb:PutItem", "dynamodb:UpdateItem"]
        Resource = var.talent_profiles_table_arn
      },
      {
        Sid      = "LookupTables"
        Effect   = "Allow"
        Action   = ["dynamodb:PutItem"]
        Resource = [
          var.skills_lookup_table_arn,
          var.certifications_lookup_table_arn,
          var.cities_lookup_table_arn
        ]
      }
    ]
  })
}

resource "aws_lambda_function" "pipeline" {
  for_each = local.pipeline_lambdas

  function_name = "${var.project_name}-${var.environment}-${each.key}"
  role          = aws_iam_role.pipeline_lambda_role.arn
  runtime       = "python3.12"
  handler       = "app.handler"

  filename         = data.archive_file.pipeline_zip[each.key].output_path
  source_code_hash = data.archive_file.pipeline_zip[each.key].output_base64sha256

  timeout     = each.value.timeout
  memory_size = each.value.memory
  layers      = each.key == "classify" ? [aws_lambda_layer_version.pdfminer.arn] : []

  environment {
    variables = each.value.env
  }
}

# -----------------------------------------------------------------------------
# S3 Trigger - invoke starter lambda on raw uploads
# -----------------------------------------------------------------------------

resource "aws_lambda_permission" "allow_s3_invoke_starter" {
  statement_id  = "AllowS3InvokeStarter"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.pipeline["starter"].function_name
  principal     = "s3.amazonaws.com"
  source_arn    = var.resume_bucket_arn
}

resource "aws_s3_bucket_notification" "raw_uploads" {
  bucket = var.resume_bucket

  lambda_function {
    lambda_function_arn = aws_lambda_function.pipeline["starter"].arn
    events              = ["s3:ObjectCreated:*"]
    filter_prefix       = "${var.raw_prefix}/"
  }

  depends_on = [aws_lambda_permission.allow_s3_invoke_starter]
}
