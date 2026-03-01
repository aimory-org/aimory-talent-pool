variable "project_name" { type = string }
variable "environment" { type = string }

variable "lambda_arns" {
  type = object({
    classify       = string
    start_textract = string
    check_textract = string
    fetch_textract = string
    normalize      = string
    llm_extract    = string
    persist        = string
  })
}

# SSM parameter name to store the SFN ARN
variable "sfn_arn_param_name" { type = string }

# Role name of pipeline lambdas (to grant states:StartExecution)
variable "pipeline_lambda_role_name" { type = string }
