# -----------------------------------------------------------------------------
# Outputs for frontend configuration and other modules
# -----------------------------------------------------------------------------

output "user_pool_id" {
  description = "Cognito User Pool ID"
  value       = aws_cognito_user_pool.main.id
}

output "user_pool_arn" {
  description = "Cognito User Pool ARN"
  value       = aws_cognito_user_pool.main.arn
}

output "user_pool_endpoint" {
  description = "Cognito User Pool endpoint"
  value       = aws_cognito_user_pool.main.endpoint
}

output "web_client_id" {
  description = "Cognito App Client ID for the web frontend"
  value       = aws_cognito_user_pool_client.web.id
}

output "domain" {
  description = "Cognito hosted UI domain prefix"
  value       = aws_cognito_user_pool_domain.main.domain
}

output "domain_url" {
  description = "Full Cognito hosted UI domain URL"
  value       = "https://${aws_cognito_user_pool_domain.main.domain}.auth.${data.aws_region.current.name}.amazoncognito.com"
}

output "oauth_authorize_url" {
  description = "OAuth authorization endpoint"
  value       = "https://${aws_cognito_user_pool_domain.main.domain}.auth.${data.aws_region.current.name}.amazoncognito.com/oauth2/authorize"
}

output "oauth_token_url" {
  description = "OAuth token endpoint"
  value       = "https://${aws_cognito_user_pool_domain.main.domain}.auth.${data.aws_region.current.name}.amazoncognito.com/oauth2/token"
}

# Frontend configuration object (for easy export)
output "frontend_config" {
  description = "Configuration object for frontend Amplify setup"
  value = {
    region        = data.aws_region.current.name
    user_pool_id  = aws_cognito_user_pool.main.id
    client_id     = aws_cognito_user_pool_client.web.id
    domain        = "${aws_cognito_user_pool_domain.main.domain}.auth.${data.aws_region.current.name}.amazoncognito.com"
    redirect_uri  = var.callback_urls[0]
    logout_uri    = var.logout_urls[0]
    oauth_scopes  = ["email", "openid", "profile"]
    idp_microsoft = aws_cognito_identity_provider.microsoft.provider_name
  }
}

# Data source for current region
data "aws_region" "current" {}
