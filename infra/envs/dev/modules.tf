locals {
  # try() covers null; the trimspace guards an empty TF_VAR_frontend_hostname,
  # which would otherwise read as "enabled" with a blank hostname.
  custom_domain_enabled = try(trimspace(var.frontend_hostname) != "", false)
  app_origin            = local.custom_domain_enabled ? "https://${var.frontend_hostname}" : null

  # Namecheap's form takes the host relative to the apex ("arrow"), not the FQDN.
  hostname_labels = local.custom_domain_enabled ? split(".", var.frontend_hostname) : []
  apex_domain     = local.custom_domain_enabled ? join(".", slice(local.hostname_labels, length(local.hostname_labels) - 2, length(local.hostname_labels))) : null
  app_host        = local.custom_domain_enabled ? trimsuffix(var.frontend_hostname, ".${local.apex_domain}") : null

  # The custom origin has to reach Cognito's callback/logout allow-lists and the
  # API + S3 CORS allow-lists. Miss either and the site loads on the new host but
  # login bounces and every API call is CORS-rejected. Derived here rather than
  # hand-maintained in tfvars so the hostname is only written down once.
  cognito_callback_urls = distinct(compact(concat(var.cognito_callback_urls, [local.app_origin])))
  cognito_logout_urls   = distinct(compact(concat(var.cognito_logout_urls, [local.app_origin])))
}

module "storage" {
  source       = "../../modules/storage"
  project_name = var.project_name
  environment  = var.environment

  cors_allowed_origins = concat(
    ["http://localhost:5173"],
    [for url in local.cognito_callback_urls : url if url != "http://localhost:5173"],
    ["https://${module.frontend_site.distribution_domain_name}"],
  )
}

# Shared lookup tables — passed to every module that needs them.
# Defined once here so adding a new pipeline or module is just one line.
locals {
  lookup_tables = module.storage.lookup_tables
}

# Certificate only. DNS for aimoryconsulting.com stays at Namecheap, so both the
# ownership-validation CNAME and the record pointing at CloudFront are created
# by hand there — see "Custom Domain" in infra/README.md.
module "certificate" {
  count        = local.custom_domain_enabled ? 1 : 0
  source       = "../../modules/certificate"
  project_name = var.project_name
  environment  = var.environment
  hostname     = var.frontend_hostname
}

module "frontend_site" {
  source          = "../../modules/frontend"
  project_name    = var.project_name
  environment     = var.environment
  domain_aliases  = local.custom_domain_enabled ? [var.frontend_hostname] : var.frontend_domain_aliases
  certificate_arn = local.custom_domain_enabled ? module.certificate[0].certificate_arn : var.frontend_certificate_arn
}

module "cognito" {
  source       = "../../modules/auth"
  project_name = var.project_name
  environment  = var.environment

  # OAuth callback URLs - include both localhost and production
  callback_urls = local.cognito_callback_urls
  logout_urls   = local.cognito_logout_urls

  # Microsoft Entra ID federation
  entra_client_id     = var.entra_client_id
  entra_client_secret = var.entra_client_secret
  entra_tenant_id     = var.entra_tenant_id

  # Native test user for headless E2E auth (dev only)
  enable_test_user   = var.enable_e2e_test_user
  test_user_email    = var.e2e_test_user_email
  test_user_password = var.e2e_test_user_password
}

module "resume_pipeline" {
  source = "../../modules/document_pipeline"

  pipeline_name   = "resume"
  resource_prefix = "${var.project_name}-${var.environment}"

  document_bucket     = module.storage.resume_bucket_name
  document_bucket_arn = module.storage.resume_bucket_arn
  raw_prefix          = var.raw_prefix
  extracted_prefix    = var.extracted_prefix

  sfn_arn_param_name = var.sfn_arn_param_name

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
  source = "../../modules/document_pipeline"

  pipeline_name   = "jd"
  resource_prefix = "${var.project_name}-${var.environment}-jd"

  document_bucket     = module.storage.resume_bucket_name
  document_bucket_arn = module.storage.resume_bucket_arn
  raw_prefix          = "job-descriptions/raw"
  extracted_prefix    = "job-descriptions/extracted"

  sfn_arn_param_name = "/${var.project_name}/${var.environment}/jd-pipeline-arn"

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

  cors_allowed_origins = concat(
    ["http://localhost:5173"],
    [for url in local.cognito_callback_urls : url if url != "http://localhost:5173"],
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

  job_descriptions_table_name = module.storage.job_descriptions_table_name
  job_descriptions_table_arn  = module.storage.job_descriptions_table_arn

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
