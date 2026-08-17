# ACM certificate for a hostname whose DNS is managed outside AWS.
#
# DNS for aimoryconsulting.com lives at Namecheap and stays there — the apex
# carries the Microsoft 365 records (MX/SPF/DKIM/DMARC/autodiscover), so nothing
# about this setup touches AWS nameservers.
#
# That means validation is manual: this module requests the certificate and
# publishes the CNAME you have to paste at the registrar. Nothing here creates
# DNS records.
#
# CloudFront only accepts certificates from us-east-1, so this module must be
# instantiated with a us-east-1 provider.

locals {
  labels = split(".", var.hostname)
  # Registrar panels take the host relative to the zone apex, not the FQDN.
  apex = join(".", slice(local.labels, length(local.labels) - 2, length(local.labels)))
}

resource "aws_acm_certificate" "app" {
  domain_name       = var.hostname
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
    Component   = "certificate"
  }
}

# No validation_record_fqdns: the record lives at the registrar, not in AWS, so
# there is nothing for Terraform to depend on. This just polls until ACM reports
# ISSUED, which is what makes the certificate safe to attach to CloudFront.
#
# It can only time out until the CNAME is actually in place — hence the
# two-step apply described in infra/README.md.
resource "aws_acm_certificate_validation" "app" {
  certificate_arn = aws_acm_certificate.app.arn

  timeouts {
    create = "20m"
  }
}
