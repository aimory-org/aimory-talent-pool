# -----------------------------------------------------------------------------
# Cognito User Pool - The "front door" for authentication
# Supports federated identity providers (Microsoft, Google, etc.)
# -----------------------------------------------------------------------------

locals {
  name_prefix = "${var.project_name}-${var.environment}"
}

resource "aws_cognito_user_pool" "main" {
  name = "${local.name_prefix}-users"

  # Allow users to sign in with email
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  # Password policy (for native Cognito users, if enabled later)
  password_policy {
    minimum_length                   = 12
    require_lowercase                = true
    require_uppercase                = true
    require_numbers                  = true
    require_symbols                  = true
    temporary_password_validity_days = 7
  }

  # MFA configuration
  mfa_configuration = "OFF" # Handled by Microsoft Entra ID

  # Account recovery
  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  # Schema for user attributes
  schema {
    name                     = "email"
    attribute_data_type      = "String"
    mutable                  = true
    required                 = true
    developer_only_attribute = false

    string_attribute_constraints {
      min_length = 1
      max_length = 256
    }
  }

  # Lambda trigger for pre-signup validation (optional domain filtering)
  # lambda_config {
  #   pre_sign_up = aws_lambda_function.pre_signup_validator.arn
  # }

  tags = {
    Project     = var.project_name
    Environment = var.environment
  }
}

# -----------------------------------------------------------------------------
# Cognito Domain - Required for hosted UI and OAuth flows
# -----------------------------------------------------------------------------

resource "aws_cognito_user_pool_domain" "main" {
  domain       = "${local.name_prefix}-auth"
  user_pool_id = aws_cognito_user_pool.main.id
}

# -----------------------------------------------------------------------------
# Microsoft Entra ID (Azure AD) as OIDC Identity Provider
# -----------------------------------------------------------------------------

resource "aws_cognito_identity_provider" "microsoft" {
  user_pool_id  = aws_cognito_user_pool.main.id
  provider_name = "Microsoft"
  provider_type = "OIDC"

  provider_details = {
    # Microsoft Entra ID OIDC endpoints
    oidc_issuer                   = "https://login.microsoftonline.com/${var.entra_tenant_id}/v2.0"
    client_id                     = var.entra_client_id
    client_secret                 = var.entra_client_secret
    attributes_request_method     = "GET"
    authorize_scopes              = "openid email profile"
    attributes_url_add_attributes = "false"
  }

  # Map Microsoft claims to Cognito attributes
  attribute_mapping = {
    email    = "email"
    username = "sub"
    name     = "name"
  }

  lifecycle {
    ignore_changes = [provider_details["client_secret"]]
  }
}

# -----------------------------------------------------------------------------
# App Client - Used by the React frontend
# -----------------------------------------------------------------------------

resource "aws_cognito_user_pool_client" "web" {
  name         = "${local.name_prefix}-web-client"
  user_pool_id = aws_cognito_user_pool.main.id

  # Disable client secret for public SPA clients
  generate_secret = false

  # Supported identity providers
  supported_identity_providers = concat(
    [aws_cognito_identity_provider.microsoft.provider_name],
    var.enable_test_user ? ["COGNITO"] : [],
  )

  # OAuth 2.0 settings
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_scopes                 = ["email", "openid", "profile", "aws.cognito.signin.user.admin"]

  # Explicit auth flows for Amplify.
  # ALLOW_USER_PASSWORD_AUTH is only added when a native test user is enabled
  # (E2E testing) - it has no effect on the Entra-federated OAuth login used
  # by real users.
  explicit_auth_flows = concat(
    ["ALLOW_REFRESH_TOKEN_AUTH", "ALLOW_USER_SRP_AUTH"],
    var.enable_test_user ? ["ALLOW_USER_PASSWORD_AUTH"] : [],
  )

  # Callback URLs (frontend app URLs)
  callback_urls = var.callback_urls
  logout_urls   = var.logout_urls

  # Token validity
  access_token_validity  = 1  # hours
  id_token_validity      = 1  # hours
  refresh_token_validity = 30 # days

  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }

  # Prevent user existence errors
  prevent_user_existence_errors = "ENABLED"

  # Enable token revocation
  enable_token_revocation = true

  depends_on = [aws_cognito_identity_provider.microsoft]
}

# -----------------------------------------------------------------------------
# Native test user - for headless E2E auth only (Entra federation can't be
# driven by CI). Not created unless enable_test_user is set (dev/test envs).
# -----------------------------------------------------------------------------

resource "aws_cognito_user" "e2e_test" {
  count        = var.enable_test_user ? 1 : 0
  user_pool_id = aws_cognito_user_pool.main.id
  username     = var.test_user_email

  attributes = {
    email          = var.test_user_email
    email_verified = "true"
  }

  # Don't send a welcome email to a test mailbox
  message_action = "SUPPRESS"

  lifecycle {
    precondition {
      condition     = var.test_user_email != "" && var.test_user_password != ""
      error_message = "test_user_email and test_user_password must be set when enable_test_user is true (missing GitHub secrets E2E_TEST_USER_EMAIL / E2E_TEST_USER_PASSWORD?)."
    }
  }
}

# aws_cognito_user can only set a temporary password (status FORCE_CHANGE_PASSWORD).
# Force it permanent so E2E sign-in doesn't have to handle a NEW_PASSWORD_REQUIRED
# challenge on every run.
resource "null_resource" "e2e_test_password" {
  count = var.enable_test_user ? 1 : 0

  triggers = {
    user_pool_id  = aws_cognito_user_pool.main.id
    username      = var.test_user_email
    password_hash = sha256(var.test_user_password)
  }

  provisioner "local-exec" {
    command = "aws cognito-idp admin-set-user-password --user-pool-id \"$USER_POOL_ID\" --username \"$TEST_USERNAME\" --password \"$TEST_PASSWORD\" --permanent"

    environment = {
      USER_POOL_ID  = aws_cognito_user_pool.main.id
      TEST_USERNAME = var.test_user_email
      TEST_PASSWORD = var.test_user_password
    }
  }

  depends_on = [aws_cognito_user.e2e_test]
}

# -----------------------------------------------------------------------------
# Resource Server (optional - for custom API scopes)
# Uncomment if you need custom OAuth scopes for API authorization
# -----------------------------------------------------------------------------

# resource "aws_cognito_resource_server" "api" {
#   identifier   = "https://api.${var.project_name}.com"
#   name         = "${local.name_prefix}-api"
#   user_pool_id = aws_cognito_user_pool.main.id
#
#   scope {
#     scope_name        = "read"
#     scope_description = "Read access to API"
#   }
#
#   scope {
#     scope_name        = "write"
#     scope_description = "Write access to API"
#   }
# }
