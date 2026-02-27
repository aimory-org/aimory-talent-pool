resource "aws_dynamodb_table" "talent_profiles" {
  name         = "${var.project_name}-${var.environment}-talent-profiles"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"

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

  attribute {
    name = "talent_bucket"
    type = "S"
  }

  attribute {
    name = "talent_category"
    type = "S"
  }

  attribute {
    name = "clearance_level"
    type = "S"
  }

  attribute {
    name = "location_state"
    type = "S"
  }

  attribute {
    name = "name_lower"
    type = "S"
  }

  # GSI for querying by status and date_received (e.g., find stale candidates)
  global_secondary_index {
    name            = "status-date-index"
    hash_key        = "status"
    range_key       = "date_received"
    projection_type = "ALL"
  }

  # GSI for querying by talent_bucket (e.g., all IT Resources)
  global_secondary_index {
    name            = "bucket-index"
    hash_key        = "talent_bucket"
    range_key       = "date_received"
    projection_type = "ALL"
  }

  # GSI for filtering by talent_category
  global_secondary_index {
    name            = "category-index"
    hash_key        = "talent_category"
    range_key       = "date_received"
    projection_type = "ALL"
  }

  # GSI for filtering by clearance_level
  global_secondary_index {
    name            = "clearance-index"
    hash_key        = "clearance_level"
    range_key       = "date_received"
    projection_type = "ALL"
  }

  # GSI for filtering by state
  global_secondary_index {
    name            = "state-index"
    hash_key        = "location_state"
    range_key       = "date_received"
    projection_type = "ALL"
  }

  # GSI for searching by name (lowercase for case-insensitive)
  global_secondary_index {
    name            = "name-index"
    hash_key        = "name_lower"
    range_key       = "date_received"
    projection_type = "ALL"
  }

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}
