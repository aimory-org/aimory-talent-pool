# -----------------------------------------------------------------------------
# Lambda functions for the document processing pipeline.
#
# 6 shared Lambdas (starter, classify, start_textract, check_textract,
# fetch_textract, normalize) use source from this module's lambda_src/.
#
# llm_extract uses this module's lambda_src/ PLUS pipeline-specific config
# files (schema.json, prompt.txt, hooks.py) bundled into the same zip.
#
# persist uses fully pipeline-specific source from persist_src_dir.
# -----------------------------------------------------------------------------

locals {
  # Shared Lambdas — source code lives in this module
  shared_lambdas = {
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
        OUT_BUCKET = var.document_bucket
        OUT_PREFIX = "${var.extracted_prefix}/"
      }
    }

    normalize = { timeout = 30, memory = 512, env = {} }
  }

  pdfminer_layer_ready = length(fileset(path.module, "layers/pdfminer/python/**")) > 0
}

# --- Shared Lambda zips ---------------------------------------------------

data "archive_file" "shared_zip" {
  for_each    = local.shared_lambdas
  type        = "zip"
  source_dir  = "${path.module}/lambda_src/${each.key}"
  output_path = "${path.module}/.build/${var.pipeline_name}-${each.key}.zip"
}

# --- llm_extract zip: shared code + pipeline config files ------------------

# We need to assemble llm_extract from two sources:
# 1. The shared handler: lambda_src/llm_extract/app.py
# 2. Pipeline config:    schema.json, prompt.txt, hooks.py
# Terraform archive_file can't merge dirs, so we use a local build dir.

resource "null_resource" "llm_extract_build" {
  triggers = {
    handler_hash = filesha256("${path.module}/lambda_src/llm_extract/app.py")
    schema_hash  = filesha256("${var.pipeline_config_dir}/schema.json")
    prompt_hash  = filesha256("${var.pipeline_config_dir}/prompt.txt")
    hooks_hash   = filesha256("${var.pipeline_config_dir}/hooks.py")
    build_app    = tostring(fileexists("${path.module}/.build/llm_extract_${var.pipeline_name}/app.py"))
    build_schema = tostring(fileexists("${path.module}/.build/llm_extract_${var.pipeline_name}/schema.json"))
    build_prompt = tostring(fileexists("${path.module}/.build/llm_extract_${var.pipeline_name}/prompt.txt"))
    build_hooks  = tostring(fileexists("${path.module}/.build/llm_extract_${var.pipeline_name}/hooks.py"))
  }

  provisioner "local-exec" {
    command = <<-EOT
      set -e
      BUILD_DIR="${path.module}/.build/llm_extract_${var.pipeline_name}"
      rm -rf "$BUILD_DIR"
      mkdir -p "$BUILD_DIR"
      cp "${path.module}/lambda_src/llm_extract/app.py" "$BUILD_DIR/app.py"
      cp "${var.pipeline_config_dir}/schema.json" "$BUILD_DIR/schema.json"
      cp "${var.pipeline_config_dir}/prompt.txt" "$BUILD_DIR/prompt.txt"
      cp "${var.pipeline_config_dir}/hooks.py" "$BUILD_DIR/hooks.py"
    EOT
  }
}

data "archive_file" "llm_extract_zip" {
  type        = "zip"
  source_dir  = "${path.module}/.build/llm_extract_${var.pipeline_name}"
  output_path = "${path.module}/.build/${var.pipeline_name}-llm_extract.zip"

  depends_on = [null_resource.llm_extract_build]
}

# --- persist zip: fully pipeline-specific ---------------------------------

data "archive_file" "persist_zip" {
  type        = "zip"
  source_dir  = var.persist_src_dir
  output_path = "${path.module}/.build/${var.pipeline_name}-persist.zip"
}

# --- pdfminer layer -------------------------------------------------------

data "archive_file" "pdfminer_layer" {
  type        = "zip"
  source_dir  = "${path.module}/layers/pdfminer"
  output_path = "${path.module}/.build/pdfminer_layer.zip"
}

resource "aws_lambda_layer_version" "pdfminer" {
  layer_name          = "${var.resource_prefix}-pdfminer"
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

# -----------------------------------------------------------------------------
# IAM role shared by all pipeline Lambdas
# -----------------------------------------------------------------------------

resource "aws_iam_role" "pipeline_lambda_role" {
  name = "${var.resource_prefix}-pipeline-role"

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

resource "aws_iam_role_policy" "pipeline_s3" {
  name = "${var.resource_prefix}-pipeline-s3"
  role = aws_iam_role.pipeline_lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Sid      = "ReadRawDocuments"
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:DeleteObject"]
        Resource = "arn:aws:s3:::${var.document_bucket}/${var.raw_prefix}/*"
      },
      {
        Sid      = "WriteExtractedData"
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject"]
        Resource = "arn:aws:s3:::${var.document_bucket}/${var.extracted_prefix}/*"
      }
    ]
  })
}

resource "aws_iam_role_policy" "pipeline_textract" {
  name = "${var.resource_prefix}-pipeline-textract"
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

resource "aws_iam_role_policy" "pipeline_ssm" {
  name = "${var.resource_prefix}-pipeline-ssm"
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

resource "aws_iam_role_policy" "pipeline_bedrock" {
  name = "${var.resource_prefix}-pipeline-bedrock"
  role = aws_iam_role.pipeline_lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Effect   = "Allow"
      Action   = ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream", "bedrock:Converse"]
      Resource = "*"
    }]
  })
}

resource "aws_iam_role_policy" "pipeline_dynamodb" {
  name = "${var.resource_prefix}-pipeline-dynamodb"
  role = aws_iam_role.pipeline_lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Sid      = "TargetTable"
        Effect   = "Allow"
        Action   = ["dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:Scan", "dynamodb:GetItem"]
        Resource = var.target_table_arn
      },
      {
        Sid    = "LookupTables"
        Effect = "Allow"
        Action = ["dynamodb:PutItem", "dynamodb:Scan"]
        Resource = [
          var.lookup_tables.skills.arn,
          var.lookup_tables.certifications.arn,
          var.lookup_tables.cities.arn,
          var.lookup_tables.job_titles.arn,
          var.lookup_tables.industry_categories.arn
        ]
      },
      {
        Sid      = "AuditLog"
        Effect   = "Allow"
        Action   = ["dynamodb:PutItem"]
        Resource = var.audit_log_table_arn
      }
    ]
  })
}

# -----------------------------------------------------------------------------
# Shared Lambda functions
# -----------------------------------------------------------------------------

resource "aws_lambda_function" "shared" {
  for_each = local.shared_lambdas

  function_name = "${var.resource_prefix}-${each.key}"
  role          = aws_iam_role.pipeline_lambda_role.arn
  runtime       = "python3.12"
  handler       = "app.handler"

  filename         = data.archive_file.shared_zip[each.key].output_path
  source_code_hash = data.archive_file.shared_zip[each.key].output_base64sha256

  timeout     = each.value.timeout
  memory_size = each.value.memory
  layers      = each.key == "classify" ? [aws_lambda_layer_version.pdfminer.arn] : []

  environment {
    variables = each.value.env
  }
}

# -----------------------------------------------------------------------------
# llm_extract Lambda (shared handler + pipeline-specific config)
# -----------------------------------------------------------------------------

resource "aws_lambda_function" "llm_extract" {
  function_name = "${var.resource_prefix}-llm_extract"
  role          = aws_iam_role.pipeline_lambda_role.arn
  runtime       = "python3.12"
  handler       = "app.handler"

  filename         = data.archive_file.llm_extract_zip.output_path
  source_code_hash = data.archive_file.llm_extract_zip.output_base64sha256

  timeout     = 300
  memory_size = 1024

  environment {
    variables = {
      MODEL_ID                         = var.bedrock_model_id
      SKILLS_LOOKUP_TABLE              = var.lookup_tables.skills.name
      CERTIFICATIONS_LOOKUP_TABLE      = var.lookup_tables.certifications.name
      JOB_TITLES_LOOKUP_TABLE          = var.lookup_tables.job_titles.name
      INDUSTRY_CATEGORIES_LOOKUP_TABLE = var.lookup_tables.industry_categories.name
    }
  }
}

# -----------------------------------------------------------------------------
# persist Lambda (fully pipeline-specific)
# -----------------------------------------------------------------------------

resource "aws_lambda_function" "persist" {
  function_name = "${var.resource_prefix}-persist"
  role          = aws_iam_role.pipeline_lambda_role.arn
  runtime       = "python3.12"
  handler       = "app.handler"

  filename         = data.archive_file.persist_zip.output_path
  source_code_hash = data.archive_file.persist_zip.output_base64sha256

  timeout     = 30
  memory_size = 512

  environment {
    variables = merge(
      {
        AUDIT_LOG_TABLE                  = var.audit_log_table_name
        SKILLS_LOOKUP_TABLE              = var.lookup_tables.skills.name
        CERTIFICATIONS_LOOKUP_TABLE      = var.lookup_tables.certifications.name
        CITIES_LOOKUP_TABLE              = var.lookup_tables.cities.name
        JOB_TITLES_LOOKUP_TABLE          = var.lookup_tables.job_titles.name
        INDUSTRY_CATEGORIES_LOOKUP_TABLE = var.lookup_tables.industry_categories.name
      },
      var.persist_env
    )
  }
}

# -----------------------------------------------------------------------------
# S3 trigger — allow S3 to invoke the starter Lambda.
# The actual aws_s3_bucket_notification must be defined ONCE per bucket in the
# environment root (envs/dev/) so multiple pipelines can share a single bucket.
# -----------------------------------------------------------------------------

resource "aws_lambda_permission" "allow_s3_invoke_starter" {
  statement_id  = "AllowS3InvokeStarter"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.shared["starter"].function_name
  principal     = "s3.amazonaws.com"
  source_arn    = var.document_bucket_arn
}
