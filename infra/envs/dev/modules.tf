module "storage" {
  source = "../../modules/storage"

  project_name = var.project_name
  environment  = var.environment
}

module "lambdas" {
  source = "../../modules/lambdas"

  project_name       = var.project_name
  environment        = var.environment
  resume_bucket      = module.storage.resume_bucket_name
  presign_api_key    = var.presign_api_key
  raw_prefix         = var.raw_prefix
  sfn_arn_param_name = var.sfn_arn_param_name
}
