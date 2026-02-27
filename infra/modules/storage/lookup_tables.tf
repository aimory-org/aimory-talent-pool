# Lookup tables for dropdown population in the frontend
# These tables are auto-populated by the persist Lambda when resumes are processed

resource "aws_dynamodb_table" "skills_lookup" {
  name         = "${var.project_name}-${var.environment}-skills-lookup"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "skill"

  attribute {
    name = "skill"
    type = "S"
  }

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "aws_dynamodb_table" "certifications_lookup" {
  name         = "${var.project_name}-${var.environment}-certifications-lookup"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "certification"

  attribute {
    name = "certification"
    type = "S"
  }

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "aws_dynamodb_table" "cities_lookup" {
  name         = "${var.project_name}-${var.environment}-cities-lookup"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "city"

  attribute {
    name = "city"
    type = "S"
  }

  # GSI for filtering cities by state
  attribute {
    name = "state"
    type = "S"
  }

  global_secondary_index {
    name            = "state-index"
    hash_key        = "state"
    projection_type = "ALL"
  }

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}
