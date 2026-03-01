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
        var.lambda_arns.classify,
        var.lambda_arns.start_textract,
        var.lambda_arns.check_textract,
        var.lambda_arns.fetch_textract,
        var.lambda_arns.normalize,
        var.lambda_arns.llm_extract,
        var.lambda_arns.persist
      ]
    }]
  })
}

data "template_file" "asl" {
  template = file("${path.module}/state_machine.asl.json")
  vars = {
    lambda_classify_arn       = var.lambda_arns.classify
    lambda_start_textract_arn = var.lambda_arns.start_textract
    lambda_check_textract_arn = var.lambda_arns.check_textract
    lambda_fetch_textract_arn = var.lambda_arns.fetch_textract
    lambda_normalize_arn      = var.lambda_arns.normalize
    lambda_llm_extract_arn    = var.lambda_arns.llm_extract
    lambda_persist_arn        = var.lambda_arns.persist
  }
}

resource "aws_sfn_state_machine" "pipeline" {
  name       = "${var.project_name}-${var.environment}-pipeline"
  role_arn   = aws_iam_role.sfn_role.arn
  definition = data.template_file.asl.rendered
  type       = "STANDARD"
}
