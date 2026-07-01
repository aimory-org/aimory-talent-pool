# -----------------------------------------------------------------------------
# API Lambda Functions
# -----------------------------------------------------------------------------

locals {
  api_lambdas = {
    list_talents = {
      route   = "GET /talents"
      timeout = 15
      memory  = 256
      layers  = [var.opensearch_layer_arn]
      env = {
        OPENSEARCH_ENDPOINT = var.opensearch_endpoint
      }
    }
    get_talent = {
      route   = "GET /talent"
      timeout = 10
      memory  = 256
      layers  = []
      env = {
        TALENT_PROFILES_TABLE = var.talent_profiles_table_name
      }
    }
    get_lookups = {
      route   = "GET /lookups"
      timeout = 10
      memory  = 256
      layers  = []
      env = {
        SKILLS_LOOKUP_TABLE              = var.lookup_tables.skills.name
        CERTIFICATIONS_LOOKUP_TABLE      = var.lookup_tables.certifications.name
        CITIES_LOOKUP_TABLE              = var.lookup_tables.cities.name
        JOB_TITLES_LOOKUP_TABLE          = var.lookup_tables.job_titles.name
        INDUSTRY_CATEGORIES_LOOKUP_TABLE = var.lookup_tables.industry_categories.name
        TAGS_LOOKUP_TABLE                = var.lookup_tables.tags.name
      }
    }
    get_resume_url = {
      route   = "GET /resume-url"
      timeout = 10
      memory  = 256
      layers  = []
      env = {
        RESUME_BUCKET = var.resume_bucket_name
      }
    }
    get_audit_history = {
      route   = "GET /audit-history"
      timeout = 10
      memory  = 256
      layers  = []
      env = {
        AUDIT_LOG_TABLE = var.audit_log_table_name
      }
    }
    get_deployments = {
      route   = "GET /deployments"
      timeout = 15
      memory  = 256
      layers  = []
      env = {
        GITHUB_PAT_PARAM     = var.github_pat_param
        GITHUB_REPO          = var.github_repo
        GITHUB_WORKFLOW_FILE = var.github_workflow_file
      }
    }
    update_talent = {
      route   = "PATCH /talents"
      timeout = 10
      memory  = 256
      layers  = []
      env = {
        TALENT_PROFILES_TABLE            = var.talent_profiles_table_name
        AUDIT_LOG_TABLE                  = var.audit_log_table_name
        SKILLS_LOOKUP_TABLE              = var.lookup_tables.skills.name
        CERTIFICATIONS_LOOKUP_TABLE      = var.lookup_tables.certifications.name
        CITIES_LOOKUP_TABLE              = var.lookup_tables.cities.name
        JOB_TITLES_LOOKUP_TABLE          = var.lookup_tables.job_titles.name
        INDUSTRY_CATEGORIES_LOOKUP_TABLE = var.lookup_tables.industry_categories.name
        TAGS_LOOKUP_TABLE                = var.lookup_tables.tags.name
      }
    }
    delete_talent = {
      route   = "DELETE /talents"
      timeout = 10
      memory  = 256
      layers  = []
      env = {
        TALENT_PROFILES_TABLE = var.talent_profiles_table_name
        AUDIT_LOG_TABLE       = var.audit_log_table_name
        RESUME_BUCKET         = var.resume_bucket_name
      }
    }
    delete_tag = {
      route   = "DELETE /tags"
      timeout = 30
      memory  = 256
      layers  = []
      env = {
        AUDIT_LOG_TABLE       = var.audit_log_table_name
        TAGS_LOOKUP_TABLE     = var.lookup_tables.tags.name
        TALENT_PROFILES_TABLE = var.talent_profiles_table_name
      }
    }
    list_job_descriptions = {
      route   = "GET /job-descriptions"
      timeout = 15
      memory  = 256
      layers  = []
      env = {
        JOB_DESCRIPTIONS_TABLE = var.job_descriptions_table_name
      }
    }
    get_job_description = {
      route   = "GET /job-descriptions/{pk}"
      timeout = 10
      memory  = 256
      layers  = []
      env = {
        JOB_DESCRIPTIONS_TABLE = var.job_descriptions_table_name
      }
    }
    update_job_description = {
      route   = "PATCH /job-descriptions"
      timeout = 10
      memory  = 256
      layers  = []
      env = {
        JOB_DESCRIPTIONS_TABLE = var.job_descriptions_table_name
        AUDIT_LOG_TABLE        = var.audit_log_table_name
      }
    }
    delete_job_description = {
      route   = "DELETE /job-descriptions"
      timeout = 10
      memory  = 256
      layers  = []
      env = {
        JOB_DESCRIPTIONS_TABLE = var.job_descriptions_table_name
        AUDIT_LOG_TABLE        = var.audit_log_table_name
      }
    }
    match_candidates = {
      route   = "POST /job-descriptions/{pk}/match"
      timeout = 60
      memory  = 512
      layers  = [var.opensearch_layer_arn]
      env = {
        JOB_DESCRIPTIONS_TABLE  = var.job_descriptions_table_name
        OPENSEARCH_ENDPOINT     = var.opensearch_endpoint
        BEDROCK_MODEL_ID        = var.match_model_id
        SKILLS_LOOKUP_TABLE     = var.lookup_tables.skills.name
        JOB_TITLES_LOOKUP_TABLE = var.lookup_tables.job_titles.name
      }
    }
    get_jd_upload_url = {
      route   = "GET /jd-upload-url"
      timeout = 10
      memory  = 256
      layers  = []
      env = {
        RESUME_BUCKET = var.resume_bucket_name
        JD_RAW_PREFIX = "job-descriptions/raw"
      }
    }
    get_resume_upload_url = {
      route   = "GET /resume-upload-url"
      timeout = 10
      memory  = 256
      layers  = []
      env = {
        RESUME_BUCKET     = var.resume_bucket_name
        RESUME_RAW_PREFIX = "resumes/raw"
      }
    }
    bulk_update_talents = {
      route   = "PATCH /talents/bulk"
      timeout = 30
      memory  = 256
      layers  = []
      env = {
        TALENT_PROFILES_TABLE = var.talent_profiles_table_name
        AUDIT_LOG_TABLE       = var.audit_log_table_name
      }
    }
    bulk_delete_talents = {
      route   = "DELETE /talents/bulk"
      timeout = 30
      memory  = 256
      layers  = []
      env = {
        TALENT_PROFILES_TABLE = var.talent_profiles_table_name
        AUDIT_LOG_TABLE       = var.audit_log_table_name
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

  layers = each.value.layers

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
