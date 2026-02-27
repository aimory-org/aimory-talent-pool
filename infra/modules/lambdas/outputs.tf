output "pipeline_lambda_role_name" {
  value = aws_iam_role.pipeline_lambda_role.name
}

output "pipeline_lambda_arns" {
  value = { for k, v in aws_lambda_function.pipeline : k => v.arn }
}

output "pipeline_lambda_names" {
  value = { for k, v in aws_lambda_function.pipeline : k => v.function_name }
}

output "presign_function_url" {
  value = aws_lambda_function_url.presign.function_url
}

output "stale_checker_function_name" {
  value = aws_lambda_function.stale_checker.function_name
}

output "stale_checker_function_arn" {
  value = aws_lambda_function.stale_checker.arn
}
