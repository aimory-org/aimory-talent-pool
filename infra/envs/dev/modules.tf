module "storage" {
  source       = "../../modules/storage"
  project_name = var.project_name
  environment  = var.environment
}

module "lambdas" {
  source       = "../../modules/lambdas"
  project_name = var.project_name
  environment  = var.environment

  resume_bucket      = module.storage.resume_bucket_name
  raw_prefix         = var.raw_prefix
  extracted_prefix   = var.extracted_prefix
  presign_api_key    = var.presign_api_key
  sfn_arn_param_name = var.sfn_arn_param_name
}

module "step_functions" {
  source       = "../../modules/step_functions"
  project_name = var.project_name
  environment  = var.environment

  lambda_arns = {
    classify       = module.lambdas.pipeline_lambda_arns["classify"]
    start_textract = module.lambdas.pipeline_lambda_arns["start_textract"]
    check_textract = module.lambdas.pipeline_lambda_arns["check_textract"]
    fetch_textract = module.lambdas.pipeline_lambda_arns["fetch_textract"]
    normalize      = module.lambdas.pipeline_lambda_arns["normalize"]
    llm_extract    = module.lambdas.pipeline_lambda_arns["llm_extract"]
    persist        = module.lambdas.pipeline_lambda_arns["persist"]
  }
}

# Store SFN ARN in SSM so starter can read it without terraform cycles
resource "aws_ssm_parameter" "pipeline_sfn_arn" {
  name  = var.sfn_arn_param_name
  type  = "String"
  value = module.step_functions.state_machine_arn
}

# Allow pipeline role to start executions
resource "aws_iam_role_policy" "pipeline_can_start_sfn" {
  name = "${var.project_name}-${var.environment}-pipeline-start-sfn"
  role = module.lambdas.pipeline_lambda_role_name

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Effect   = "Allow",
      Action   = ["states:StartExecution"],
      Resource = module.step_functions.state_machine_arn
    }]
  })
}

# Allow S3 to invoke starter
resource "aws_lambda_permission" "allow_s3_invoke_starter" {
  statement_id  = "AllowS3InvokeStarter"
  action        = "lambda:InvokeFunction"
  function_name = module.lambdas.pipeline_lambda_names["starter"]
  principal     = "s3.amazonaws.com"
  source_arn    = module.storage.resume_bucket_arn
}

resource "aws_s3_bucket_notification" "raw_uploads" {
  bucket = module.storage.resume_bucket_name

  lambda_function {
    lambda_function_arn = module.lambdas.pipeline_lambda_arns["starter"]
    events              = ["s3:ObjectCreated:*"]
    filter_prefix       = "${var.raw_prefix}/"
  }

  depends_on = [aws_lambda_permission.allow_s3_invoke_starter]
}
