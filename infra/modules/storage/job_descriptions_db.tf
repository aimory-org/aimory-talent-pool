# -----------------------------------------------------------------------------
# Job Descriptions DynamoDB Table
# Stores structured job descriptions extracted by the JD pipeline.
# -----------------------------------------------------------------------------

resource "aws_dynamodb_table" "job_descriptions" {
  name         = "${var.project_name}-${var.environment}-job-descriptions"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"

  attribute {
    name = "pk"
    type = "S"
  }

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}
