output "certificate_arn" {
  description = "Validated ACM certificate ARN. Reading this blocks until ACM reports ISSUED."
  value       = aws_acm_certificate_validation.app.certificate_arn
}

output "certificate_arn_unvalidated" {
  description = "Certificate ARN without waiting for validation. For diagnostics only — do not attach to CloudFront."
  value       = aws_acm_certificate.app.arn
}

# Pre-formatted for the registrar's form: Host is relative to the apex and the
# trailing dot is stripped, because pasting the raw FQDN from ACM into Namecheap
# produces _abc.arrow.aimoryconsulting.com.aimoryconsulting.com.
output "validation_record" {
  description = "CNAME to create at the registrar to prove domain ownership"
  value = one([
    for o in aws_acm_certificate.app.domain_validation_options : {
      type  = o.resource_record_type
      host  = trimsuffix(trimsuffix(o.resource_record_name, "."), ".${local.apex}")
      value = trimsuffix(o.resource_record_value, ".")
    }
  ])
}
