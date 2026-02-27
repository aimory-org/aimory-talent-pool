module "storage" {
  source       = "../../modules/storage"
  project_name = var.project_name
  environment  = var.environment
}

module "frontend_site" {
  source          = "../../modules/frontend_site"
  project_name    = var.project_name
  environment     = var.environment
  domain_aliases  = var.frontend_domain_aliases
  certificate_arn = var.frontend_certificate_arn
}

module "cognito" {
  source       = "../../modules/cognito"
  project_name = var.project_name
  environment  = var.environment

  # OAuth callback URLs - include both localhost and production
  callback_urls = var.cognito_callback_urls
  logout_urls   = var.cognito_logout_urls

  # Microsoft Entra ID federation
  entra_client_id     = var.entra_client_id
  entra_client_secret = var.entra_client_secret
  entra_tenant_id     = var.entra_tenant_id
}

module "lambdas" {
  source       = "../../modules/lambdas"
  project_name = var.project_name
  environment  = var.environment

  resume_bucket              = module.storage.resume_bucket_name
  raw_prefix                 = var.raw_prefix
  extracted_prefix           = var.extracted_prefix
  presign_api_key            = var.presign_api_key
  sfn_arn_param_name         = var.sfn_arn_param_name
  talent_profiles_table_name = module.storage.talent_profiles_table_name
  talent_profiles_table_arn  = module.storage.talent_profiles_table_arn

  # Lookup tables
  skills_lookup_table_name         = module.storage.skills_lookup_table_name
  skills_lookup_table_arn          = module.storage.skills_lookup_table_arn
  certifications_lookup_table_name = module.storage.certifications_lookup_table_name
  certifications_lookup_table_arn  = module.storage.certifications_lookup_table_arn
  cities_lookup_table_name         = module.storage.cities_lookup_table_name
  cities_lookup_table_arn          = module.storage.cities_lookup_table_arn
}

module "step_functions" {
  source       = "../../modules/step_functions"
  project_name = var.project_name
  environment  = var.environment

  lambda_arns = {
    classify       = module.lambdas.pipeline_lambda_arns["classify"]
    start_textract = module.lambdas.pipeline_lambda_arns["start_textract"]
    check_textract = module.lambdas.pipeline_lambda_arns["check_textract"]
    fetch_textract = module.lambdas.pipeline_lambda_arns["fetch_textract"]
    normalize      = module.lambdas.pipeline_lambda_arns["normalize"]
    llm_extract    = module.lambdas.pipeline_lambda_arns["llm_extract"]
    persist        = module.lambdas.pipeline_lambda_arns["persist"]
  }
}

# Store SFN ARN in SSM so starter can read it without terraform cycles
resource "aws_ssm_parameter" "pipeline_sfn_arn" {
  name  = var.sfn_arn_param_name
  type  = "String"
  value = module.step_functions.state_machine_arn
}

# Allow pipeline role to start executions
resource "aws_iam_role_policy" "pipeline_can_start_sfn" {
  name = "${var.project_name}-${var.environment}-pipeline-start-sfn"
  role = module.lambdas.pipeline_lambda_role_name

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Effect   = "Allow",
      Action   = ["states:StartExecution"],
      Resource = module.step_functions.state_machine_arn
    }]
  })
}

# Allow S3 to invoke starter
resource "aws_lambda_permission" "allow_s3_invoke_starter" {
  statement_id  = "AllowS3InvokeStarter"
  action        = "lambda:InvokeFunction"
  function_name = module.lambdas.pipeline_lambda_names["starter"]
  principal     = "s3.amazonaws.com"
  source_arn    = module.storage.resume_bucket_arn
}

resource "aws_s3_bucket_notification" "raw_uploads" {
  bucket = module.storage.resume_bucket_name

  lambda_function {
    lambda_function_arn = module.lambdas.pipeline_lambda_arns["starter"]
    events              = ["s3:ObjectCreated:*"]
    filter_prefix       = "${var.raw_prefix}/"
  }

  depends_on = [aws_lambda_permission.allow_s3_invoke_starter]
}

# -----------------------------------------------------------------------------
# Frontend deployment - builds and uploads to S3 on terraform apply
# -----------------------------------------------------------------------------

locals {
  frontend_src_dir = "${path.module}/../../../frontend/web"
  frontend_src_hash = sha256(join("", [
    filesha256("${local.frontend_src_dir}/package.json"),
    filesha256("${local.frontend_src_dir}/src/main.tsx"),
    filesha256("${local.frontend_src_dir}/src/App.tsx"),
    filesha256("${local.frontend_src_dir}/src/authConfig.ts"),
    filesha256("${local.frontend_src_dir}/.env"),
  ]))
}

resource "null_resource" "frontend_deploy" {
  triggers = {
    src_hash        = local.frontend_src_hash
    bucket_name     = module.frontend_site.bucket_name
    distribution_id = module.frontend_site.distribution_id
  }

  provisioner "local-exec" {
    working_dir = local.frontend_src_dir
    command     = "npm install && npm run build && aws s3 sync dist s3://${module.frontend_site.bucket_name} --delete && aws cloudfront create-invalidation --distribution-id ${module.frontend_site.distribution_id} --paths /index.html"
  }

  depends_on = [module.frontend_site, module.cognito]
}
