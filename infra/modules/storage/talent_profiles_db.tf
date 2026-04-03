resource "aws_dynamodb_table" "talent_profiles" {
  name             = "${var.project_name}-${var.environment}-talent-profiles"
  billing_mode     = "PAY_PER_REQUEST"
  hash_key         = "pk"
  stream_enabled   = true
  stream_view_type = "NEW_AND_OLD_IMAGES"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "status"
    type = "S"
  }

  attribute {
    name = "date_received"
    type = "S"
  }

  # GSI for querying by status and date_received (e.g., find stale candidates)
  global_secondary_index {
    name            = "status-date-index"
    hash_key        = "status"
    range_key       = "date_received"
    projection_type = "ALL"
  }

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}
