output "presign_function_url" {
  description = "Public function URL for uploading documents (only set when enable_presign_url = true)"
  value       = var.enable_presign_url ? aws_lambda_function_url.presign[0].function_url : null
}

output "state_machine_arn" {
  description = "Step Functions state machine ARN"
  value       = aws_sfn_state_machine.pipeline.arn
}

output "starter_lambda_arn" {
  description = "ARN of the starter Lambda (needed for S3 bucket notification wiring)"
  value       = aws_lambda_function.shared["starter"].arn
}
