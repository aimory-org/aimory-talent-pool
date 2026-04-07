module "storage" {
  source       = "../../modules/storage"
  project_name = var.project_name
  environment  = var.environment
}

module "frontend_site" {
  source          = "../../modules/frontend"
  project_name    = var.project_name
  environment     = var.environment
  domain_aliases  = var.frontend_domain_aliases
  certificate_arn = var.frontend_certificate_arn
}

module "cognito" {
  source       = "../../modules/auth"
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

module "pipeline" {
  source       = "../../modules/pipeline"
  project_name = var.project_name
  environment  = var.environment

  resume_bucket     = module.storage.resume_bucket_name
  resume_bucket_arn = module.storage.resume_bucket_arn
  raw_prefix        = var.raw_prefix
  extracted_prefix  = var.extracted_prefix

  presign_api_key    = var.presign_api_key
  sfn_arn_param_name = var.sfn_arn_param_name

  talent_profiles_table_name = module.storage.talent_profiles_table_name
  talent_profiles_table_arn  = module.storage.talent_profiles_table_arn

  skills_lookup_table_name              = module.storage.skills_lookup_table_name
  skills_lookup_table_arn               = module.storage.skills_lookup_table_arn
  certifications_lookup_table_name      = module.storage.certifications_lookup_table_name
  certifications_lookup_table_arn       = module.storage.certifications_lookup_table_arn
  cities_lookup_table_name              = module.storage.cities_lookup_table_name
  cities_lookup_table_arn               = module.storage.cities_lookup_table_arn
  job_titles_lookup_table_name          = module.storage.job_titles_lookup_table_name
  job_titles_lookup_table_arn           = module.storage.job_titles_lookup_table_arn
  industry_categories_lookup_table_name = module.storage.industry_categories_lookup_table_name
  industry_categories_lookup_table_arn  = module.storage.industry_categories_lookup_table_arn

  bedrock_model_id = var.bedrock_model_id
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

  opensearch_endpoint   = module.storage.opensearch_endpoint
  opensearch_domain_arn = module.storage.opensearch_domain_arn
  opensearch_layer_arn  = module.storage.opensearch_layer_arn

  skills_lookup_table_name              = module.storage.skills_lookup_table_name
  skills_lookup_table_arn               = module.storage.skills_lookup_table_arn
  certifications_lookup_table_name      = module.storage.certifications_lookup_table_name
  certifications_lookup_table_arn       = module.storage.certifications_lookup_table_arn
  cities_lookup_table_name              = module.storage.cities_lookup_table_name
  cities_lookup_table_arn               = module.storage.cities_lookup_table_arn
  job_titles_lookup_table_name          = module.storage.job_titles_lookup_table_name
  job_titles_lookup_table_arn           = module.storage.job_titles_lookup_table_arn
  industry_categories_lookup_table_name = module.storage.industry_categories_lookup_table_name
  industry_categories_lookup_table_arn  = module.storage.industry_categories_lookup_table_arn

  resume_bucket_name = module.storage.resume_bucket_name
  resume_bucket_arn  = module.storage.resume_bucket_arn

  cors_allowed_origins = concat(
    ["http://localhost:5173"],
    [for url in var.cognito_callback_urls : url if url != "http://localhost:5173"],
    ["https://${module.frontend_site.distribution_domain_name}"]
  )
}

# -----------------------------------------------------------------------------
# Scheduled background jobs (stale candidate checker, etc.)
# -----------------------------------------------------------------------------

module "jobs" {
  source       = "../../modules/jobs"
  project_name = var.project_name
  environment  = var.environment

  talent_profiles_table_name = module.storage.talent_profiles_table_name
  talent_profiles_table_arn  = module.storage.talent_profiles_table_arn

  skills_lookup_table_name              = module.storage.skills_lookup_table_name
  skills_lookup_table_arn               = module.storage.skills_lookup_table_arn
  certifications_lookup_table_name      = module.storage.certifications_lookup_table_name
  certifications_lookup_table_arn       = module.storage.certifications_lookup_table_arn
  job_titles_lookup_table_name          = module.storage.job_titles_lookup_table_name
  job_titles_lookup_table_arn           = module.storage.job_titles_lookup_table_arn
  industry_categories_lookup_table_name = module.storage.industry_categories_lookup_table_name
  industry_categories_lookup_table_arn  = module.storage.industry_categories_lookup_table_arn

  bedrock_model_id = var.bedrock_model_id
}

