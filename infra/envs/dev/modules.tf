module "storage" {
  source       = "../../modules/storage"
  project_name = var.project_name
  environment  = var.environment

  cors_allowed_origins = concat(
    ["http://localhost:5173"],
    [for url in var.cognito_callback_urls : url if url != "http://localhost:5173"],
    ["https://${module.frontend_site.distribution_domain_name}"],
  )
}

# Shared lookup tables — passed to every module that needs them.
# Defined once here so adding a new pipeline or module is just one line.
locals {
  lookup_tables = module.storage.lookup_tables
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

module "resume_pipeline" {
  source       = "../../modules/document_pipeline"
  project_name = var.project_name
  environment  = var.environment

  pipeline_name   = "resume"
  resource_prefix = "${var.project_name}-${var.environment}"

  document_bucket     = module.storage.resume_bucket_name
  document_bucket_arn = module.storage.resume_bucket_arn
  raw_prefix          = var.raw_prefix
  extracted_prefix    = var.extracted_prefix

  sfn_arn_param_name = var.sfn_arn_param_name

  target_table_name    = module.storage.talent_profiles_table_name
  target_table_arn     = module.storage.talent_profiles_table_arn
  audit_log_table_name = module.storage.audit_log_table_name
  audit_log_table_arn  = module.storage.audit_log_table_arn

  lookup_tables = local.lookup_tables

  pipeline_config_dir = "${path.module}/../../pipeline_configs/resume"
  persist_src_dir     = "${path.module}/../../pipeline_configs/resume/persist"
  persist_env = {
    TALENT_PROFILES_TABLE = module.storage.talent_profiles_table_name
  }

  enable_presign_url = true
  presign_api_key    = var.presign_api_key
  bedrock_model_id   = var.bedrock_model_id
}

# -----------------------------------------------------------------------------
# Job Description Processing Pipeline
# -----------------------------------------------------------------------------

module "jd_pipeline" {
  source       = "../../modules/document_pipeline"
  project_name = var.project_name
  environment  = var.environment

  pipeline_name   = "jd"
  resource_prefix = "${var.project_name}-${var.environment}-jd"

  document_bucket     = module.storage.resume_bucket_name
  document_bucket_arn = module.storage.resume_bucket_arn
  raw_prefix          = "job-descriptions/raw"
  extracted_prefix    = "job-descriptions/extracted"

  sfn_arn_param_name = "/${var.project_name}/${var.environment}/jd-pipeline-arn"

  target_table_name    = module.storage.job_descriptions_table_name
  target_table_arn     = module.storage.job_descriptions_table_arn
  audit_log_table_name = module.storage.audit_log_table_name
  audit_log_table_arn  = module.storage.audit_log_table_arn

  lookup_tables = local.lookup_tables

  pipeline_config_dir = "${path.module}/../../pipeline_configs/job_description"
  persist_src_dir     = "${path.module}/../../pipeline_configs/job_description/persist"
  persist_env = {
    JOB_DESCRIPTIONS_TABLE = module.storage.job_descriptions_table_name
  }

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
  audit_log_table_name       = module.storage.audit_log_table_name
  audit_log_table_arn        = module.storage.audit_log_table_arn

  job_descriptions_table_name = module.storage.job_descriptions_table_name
  job_descriptions_table_arn  = module.storage.job_descriptions_table_arn

  opensearch_endpoint   = module.storage.opensearch_endpoint
  opensearch_domain_arn = module.storage.opensearch_domain_arn
  opensearch_layer_arn  = module.storage.opensearch_layer_arn

  lookup_tables = local.lookup_tables

  resume_bucket_name = module.storage.resume_bucket_name
  resume_bucket_arn  = module.storage.resume_bucket_arn

  github_pat_param     = var.github_pat_param
  github_repo          = var.github_repo
  github_workflow_file = var.github_workflow_file

  bedrock_model_id = var.bedrock_model_id

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
  audit_log_table_name       = module.storage.audit_log_table_name
  audit_log_table_arn        = module.storage.audit_log_table_arn

  lookup_tables = local.lookup_tables

  bedrock_model_id = var.bedrock_model_id
}

# -----------------------------------------------------------------------------
# S3 bucket notification — ONE resource per bucket, aggregating all pipelines.
# Each pipeline module outputs its starter_lambda_arn; we combine them here.
# -----------------------------------------------------------------------------

resource "aws_s3_bucket_notification" "pipeline_triggers" {
  bucket = module.storage.resume_bucket_name

  lambda_function {
    lambda_function_arn = module.resume_pipeline.starter_lambda_arn
    events              = ["s3:ObjectCreated:*"]
    filter_prefix       = "${var.raw_prefix}/"
  }

  lambda_function {
    lambda_function_arn = module.jd_pipeline.starter_lambda_arn
    events              = ["s3:ObjectCreated:*"]
    filter_prefix       = "job-descriptions/raw/"
  }

  depends_on = [
    module.resume_pipeline,
    module.jd_pipeline,
  ]
}
