# -----------------------------------------------------------------------------
# OpenSearch Domain — public endpoint, IAM-based access control
# t3.small.search, single node, gp3 10 GB — minimal cost for dev/prod
# -----------------------------------------------------------------------------

data "aws_region" "current" {}

resource "aws_opensearch_domain" "talent_search" {
  domain_name    = "${var.project_name}-${var.environment}"
  engine_version = "OpenSearch_2.11"

  cluster_config {
    instance_type  = "t3.small.search"
    instance_count = 1
  }

  ebs_options {
    ebs_enabled = true
    volume_type = "gp3"
    volume_size = 10
  }

  encrypt_at_rest {
    enabled = true
  }

  node_to_node_encryption {
    enabled = true
  }

  domain_endpoint_options {
    enforce_https       = true
    tls_security_policy = "Policy-Min-TLS-1-2-2019-07"
  }

  # Fine-grained access control disabled — domain-level IAM policy used instead
  advanced_security_options {
    enabled                        = false
    internal_user_database_enabled = false
  }

  # Allow any IAM identity in this account — individual roles get es:ESHttp*
  # via their own IAM policies (see opensearch_sync.tf and api/main.tf)
  access_policies = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root" }
      Action    = "es:*"
      Resource  = "arn:aws:es:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:domain/${var.project_name}-${var.environment}/*"
    }]
  })

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}
