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
      timeout = 60
      memory  = 1024
      env = {
        MODEL_ID = "anthropic.claude-3-5-sonnet-20240620-v1:0"
      }
    }

    persist = {
      timeout = 30
      memory  = 512
      env = {
        TALENT_PROFILES_TABLE = var.talent_profiles_table_name
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

# Permissions for the pipeline:
# - read raw/
# - write extracted/
# - textract start/get
# - read SFN arn param from SSM (starter)

#at some pont maybe we should split this into multiple policies or roles if we want different permissions for different lambdas, but for now it's all the same
resource "aws_iam_role_policy" "pipeline_policy" {
  name = "${var.project_name}-${var.environment}-pipeline-policy"
  role = aws_iam_role.pipeline_lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect   = "Allow",
        Action   = ["s3:GetObject"],
        Resource = "arn:aws:s3:::${var.resume_bucket}/${var.raw_prefix}/*"
      },
      {
        Effect   = "Allow",
        Action   = ["s3:PutObject"],
        Resource = "arn:aws:s3:::${var.resume_bucket}/${var.extracted_prefix}/*"
      },
      {
        Effect   = "Allow",
        Action   = ["s3:GetObject"],
        Resource = "arn:aws:s3:::${var.resume_bucket}/${var.extracted_prefix}/*"
      },
      {
        Effect = "Allow",
        Action = [
          "textract:StartDocumentTextDetection",
          "textract:GetDocumentTextDetection"
        ],
        Resource = "*"
      },
      {
        Effect   = "Allow",
        Action   = ["ssm:GetParameter"],
        Resource = "arn:aws:ssm:*:*:parameter${var.sfn_arn_param_name}"
      },
      {
        Effect = "Allow",
        Action = [
          "bedrock:InvokeModel",
          "bedrock:InvokeModelWithResponseStream"
        ],
        Resource = "*"
      },
      {
        Effect = "Allow",
        Action = [
          "dynamodb:PutItem",
          "dynamodb:UpdateItem"
        ],
        Resource = var.talent_profiles_table_arn
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
