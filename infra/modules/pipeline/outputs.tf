output "presign_function_url" {
  description = "Public function URL for Power Automate to upload resumes"
  value       = aws_lambda_function_url.presign.function_url
}

output "state_machine_arn" {
  description = "Step Functions state machine ARN"
  value       = aws_sfn_state_machine.pipeline.arn
}
