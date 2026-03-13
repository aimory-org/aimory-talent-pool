module "storage" {
  source       = "../../modules/storage"
  project_name = var.project_name
  environment  = var.environment
}

module "frontend_site" {
  source          = "../../modules/frontend/site"
  project_name    = var.project_name
  environment     = var.environment
  domain_aliases  = var.frontend_domain_aliases
  certificate_arn = var.frontend_certificate_arn
}

module "cognito" {
  source       = "../../modules/frontend/cognito"
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

module "stale_checker" {
  source       = "../../modules/frontend/lambdas/stale_checker"
  project_name = var.project_name
  environment  = var.environment

  talent_profiles_table_name = module.storage.talent_profiles_table_name
  talent_profiles_table_arn  = module.storage.talent_profiles_table_arn
}

module "pipeline_lambdas" {
  source       = "../../modules/pipeline/lambdas"
  project_name = var.project_name
  environment  = var.environment

  resume_bucket              = module.storage.resume_bucket_name
  resume_bucket_arn          = module.storage.resume_bucket_arn
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
  source       = "../../modules/pipeline/step_functions"
  project_name = var.project_name
  environment  = var.environment

  lambda_arns = {
    classify       = module.pipeline_lambdas.pipeline_lambda_arns["classify"]
    start_textract = module.pipeline_lambdas.pipeline_lambda_arns["start_textract"]
    check_textract = module.pipeline_lambdas.pipeline_lambda_arns["check_textract"]
    fetch_textract = module.pipeline_lambdas.pipeline_lambda_arns["fetch_textract"]
    normalize      = module.pipeline_lambdas.pipeline_lambda_arns["normalize"]
    llm_extract    = module.pipeline_lambdas.pipeline_lambda_arns["llm_extract"]
    persist        = module.pipeline_lambdas.pipeline_lambda_arns["persist"]
  }

  sfn_arn_param_name        = var.sfn_arn_param_name
  pipeline_lambda_role_name = module.pipeline_lambdas.pipeline_lambda_role_name
}

# -----------------------------------------------------------------------------
# API Gateway for frontend to query DynamoDB
# -----------------------------------------------------------------------------

module "api" {
  source       = "../../modules/api"
  project_name = var.project_name
  environment  = var.environment

  cognito_user_pool_arn       = module.cognito.user_pool_arn
  cognito_user_pool_client_id = module.cognito.web_client_id

  talent_profiles_table_name = module.storage.talent_profiles_table_name
  talent_profiles_table_arn  = module.storage.talent_profiles_table_arn

  skills_lookup_table_name         = module.storage.skills_lookup_table_name
  skills_lookup_table_arn          = module.storage.skills_lookup_table_arn
  certifications_lookup_table_name = module.storage.certifications_lookup_table_name
  certifications_lookup_table_arn  = module.storage.certifications_lookup_table_arn
  cities_lookup_table_name         = module.storage.cities_lookup_table_name
  cities_lookup_table_arn          = module.storage.cities_lookup_table_arn

  resume_bucket_name = module.storage.resume_bucket_name
  resume_bucket_arn  = module.storage.resume_bucket_arn

  cors_allowed_origins = concat(
    ["http://localhost:5173"],
    [for url in var.cognito_callback_urls : url if url != "http://localhost:5173"],
    ["https://${module.frontend_site.distribution_domain_name}"]
  )
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
    filesha256("${local.frontend_src_dir}/src/lib/auth.ts"),
    filesha256("${local.frontend_src_dir}/.env"),
  ]))
}

resource "terraform_data" "frontend_deploy" {
  triggers_replace = {
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
