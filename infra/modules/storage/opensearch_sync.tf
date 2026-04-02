# -----------------------------------------------------------------------------
# OpenSearch Sync — streams DynamoDB changes into the OpenSearch index
# Triggered by DynamoDB Streams; handles INSERT, MODIFY, and REMOVE events
# -----------------------------------------------------------------------------

locals {
  opensearch_layer_ready = length(fileset(path.module, "layers/opensearch/python/**")) > 0
  sync_function_name     = "${var.project_name}-${var.environment}-opensearch-sync"
}

data "archive_file" "opensearch_sync_zip" {
  type        = "zip"
  source_dir  = "${path.module}/lambda_src/sync_to_opensearch"
  output_path = "${path.module}/sync_to_opensearch.zip"
}

data "archive_file" "opensearch_layer_zip" {
  type        = "zip"
  source_dir  = "${path.module}/layers/opensearch"
  output_path = "${path.module}/opensearch_layer.zip"
}

resource "aws_lambda_layer_version" "opensearch" {
  layer_name          = "${var.project_name}-${var.environment}-opensearch"
  filename            = data.archive_file.opensearch_layer_zip.output_path
  source_code_hash    = data.archive_file.opensearch_layer_zip.output_base64sha256
  compatible_runtimes = ["python3.12"]
  description         = "opensearch-py for OpenSearch HTTP access"

  lifecycle {
    precondition {
      condition     = local.opensearch_layer_ready
      error_message = "opensearch layer is missing. Run: pip install -r infra/modules/storage/layers/opensearch/requirements.txt -t infra/modules/storage/layers/opensearch/python"
    }
  }
}

resource "aws_lambda_function" "opensearch_sync" {
  function_name = local.sync_function_name
  role          = aws_iam_role.opensearch_sync_role.arn
  runtime       = "python3.12"
  handler       = "app.handler"

  filename         = data.archive_file.opensearch_sync_zip.output_path
  source_code_hash = data.archive_file.opensearch_sync_zip.output_base64sha256

  timeout     = 60
  memory_size = 256

  layers = [aws_lambda_layer_version.opensearch.arn]

  environment {
    variables = {
      OPENSEARCH_ENDPOINT = aws_opensearch_domain.talent_search.endpoint
    }
  }

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# DynamoDB Streams event source — batch 100 records, retry 2x before discarding
resource "aws_lambda_event_source_mapping" "dynamodb_stream" {
  event_source_arn  = aws_dynamodb_table.talent_profiles.stream_arn
  function_name     = aws_lambda_function.opensearch_sync.arn
  starting_position = "LATEST"
  batch_size        = 100

  filter_criteria {
    filter {
      # Only process talent profile items (pk format: "bucket#key")
      pattern = jsonencode({ eventName = ["INSERT", "MODIFY", "REMOVE"] })
    }
  }
}

# -----------------------------------------------------------------------------
# IAM
# -----------------------------------------------------------------------------

resource "aws_iam_role" "opensearch_sync_role" {
  name = "${var.project_name}-${var.environment}-opensearch-sync-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "aws_iam_role_policy_attachment" "opensearch_sync_logs" {
  role       = aws_iam_role.opensearch_sync_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "opensearch_sync_dynamodb_streams" {
  name = "${var.project_name}-${var.environment}-opensearch-sync-streams"
  role = aws_iam_role.opensearch_sync_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "dynamodb:GetRecords",
        "dynamodb:GetShardIterator",
        "dynamodb:DescribeStream",
        "dynamodb:ListStreams"
      ]
      Resource = aws_dynamodb_table.talent_profiles.stream_arn
    }]
  })
}

resource "aws_iam_role_policy" "opensearch_sync_es" {
  name = "${var.project_name}-${var.environment}-opensearch-sync-es"
  role = aws_iam_role.opensearch_sync_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["es:ESHttpGet", "es:ESHttpPost", "es:ESHttpPut", "es:ESHttpDelete", "es:ESHttpHead"]
      Resource = "${aws_opensearch_domain.talent_search.arn}/*"
    }]
  })
}
