# -----------------------------------------------------------------------------
# API Lambda Functions
# -----------------------------------------------------------------------------

locals {
  api_lambdas = {
    list_talents = {
      route   = "GET /talents"
      timeout = 15
      memory  = 256
      env = {
        TALENT_PROFILES_TABLE = var.talent_profiles_table_name
      }
    }
    get_talent = {
      route   = "GET /talents/{pk}"
      timeout = 10
      memory  = 256
      env = {
        TALENT_PROFILES_TABLE = var.talent_profiles_table_name
      }
    }
    update_talent_status = {
      route   = "PATCH /talents/{pk}/status"
      timeout = 10
      memory  = 256
      env = {
        TALENT_PROFILES_TABLE = var.talent_profiles_table_name
      }
    }
    get_lookups = {
      route   = "GET /lookups"
      timeout = 10
      memory  = 256
      env = {
        SKILLS_LOOKUP_TABLE         = var.skills_lookup_table_name
        CERTIFICATIONS_LOOKUP_TABLE = var.certifications_lookup_table_name
        CITIES_LOOKUP_TABLE         = var.cities_lookup_table_name
      }
    }
    get_resume_url = {
      route   = "GET /resume-url"
      timeout = 10
      memory  = 256
      env = {
        RESUME_BUCKET = var.resume_bucket_name
      }
    }
    update_talent = {
      route   = "PATCH /talents"
      timeout = 10
      memory  = 256
      env = {
        TALENT_PROFILES_TABLE = var.talent_profiles_table_name
      }
    }
    delete_talent = {
      route   = "DELETE /talents"
      timeout = 10
      memory  = 256
      env = {
        TALENT_PROFILES_TABLE = var.talent_profiles_table_name
        RESUME_BUCKET         = var.resume_bucket_name
      }
    }
  }
}

data "archive_file" "api_lambda_zip" {
  for_each    = local.api_lambdas
  type        = "zip"
  source_dir  = "${path.module}/lambda_src/${each.key}"
  output_path = "${path.module}/${each.key}.zip"
}

resource "aws_lambda_function" "api" {
  for_each = local.api_lambdas

  function_name = "${var.project_name}-${var.environment}-api-${replace(each.key, "_", "-")}"
  role          = aws_iam_role.api_lambda_role.arn
  runtime       = "python3.12"
  handler       = "app.handler"

  filename         = data.archive_file.api_lambda_zip[each.key].output_path
  source_code_hash = data.archive_file.api_lambda_zip[each.key].output_base64sha256

  timeout     = each.value.timeout
  memory_size = each.value.memory

  environment {
    variables = each.value.env
  }

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# Lambda permissions for API Gateway
resource "aws_lambda_permission" "api_invoke" {
  for_each = local.api_lambdas

  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api[each.key].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.talent_api.execution_arn}/*/*"
}

# API Gateway integrations
resource "aws_apigatewayv2_integration" "api" {
  for_each = local.api_lambdas

  api_id                 = aws_apigatewayv2_api.talent_api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api[each.key].invoke_arn
  payload_format_version = "2.0"
}

# API Gateway routes
resource "aws_apigatewayv2_route" "api" {
  for_each = local.api_lambdas

  api_id             = aws_apigatewayv2_api.talent_api.id
  route_key          = each.value.route
  target             = "integrations/${aws_apigatewayv2_integration.api[each.key].id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}
