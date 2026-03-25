# -----------------------------------------------------------------------------
# Step Functions state machine — orchestrates the resume processing pipeline
# -----------------------------------------------------------------------------

resource "aws_iam_role" "sfn_role" {
  name = "${var.project_name}-${var.environment}-sfn-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Effect    = "Allow",
      Principal = { Service = "states.amazonaws.com" },
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "sfn_invoke_lambdas" {
  name = "${var.project_name}-${var.environment}-sfn-invoke-lambdas"
  role = aws_iam_role.sfn_role.id

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Effect = "Allow",
      Action = ["lambda:InvokeFunction"],
      Resource = [
        aws_lambda_function.pipeline["classify"].arn,
        aws_lambda_function.pipeline["start_textract"].arn,
        aws_lambda_function.pipeline["check_textract"].arn,
        aws_lambda_function.pipeline["fetch_textract"].arn,
        aws_lambda_function.pipeline["normalize"].arn,
        aws_lambda_function.pipeline["llm_extract"].arn,
        aws_lambda_function.pipeline["persist"].arn,
      ]
    }]
  })
}

resource "aws_sfn_state_machine" "pipeline" {
  name     = "${var.project_name}-${var.environment}-pipeline"
  role_arn = aws_iam_role.sfn_role.arn
  type     = "STANDARD"

  definition = templatefile("${path.module}/state_machine.asl.json", {
    lambda_classify_arn       = aws_lambda_function.pipeline["classify"].arn
    lambda_start_textract_arn = aws_lambda_function.pipeline["start_textract"].arn
    lambda_check_textract_arn = aws_lambda_function.pipeline["check_textract"].arn
    lambda_fetch_textract_arn = aws_lambda_function.pipeline["fetch_textract"].arn
    lambda_normalize_arn      = aws_lambda_function.pipeline["normalize"].arn
    lambda_llm_extract_arn    = aws_lambda_function.pipeline["llm_extract"].arn
    lambda_persist_arn        = aws_lambda_function.pipeline["persist"].arn
  })
}

# Store SFN ARN in SSM so the starter Lambda can read it without a Terraform cycle
resource "aws_ssm_parameter" "pipeline_sfn_arn" {
  name  = var.sfn_arn_param_name
  type  = "String"
  value = aws_sfn_state_machine.pipeline.arn
}

# Allow pipeline Lambdas to start executions
resource "aws_iam_role_policy" "pipeline_can_start_sfn" {
  name = "${var.project_name}-${var.environment}-pipeline-start-sfn"
  role = aws_iam_role.pipeline_lambda_role.name

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Effect   = "Allow",
      Action   = ["states:StartExecution"],
      Resource = aws_sfn_state_machine.pipeline.arn
    }]
  })
}
