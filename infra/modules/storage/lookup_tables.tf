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
  range_key    = "state"

  attribute {
    name = "city"
    type = "S"
  }

  attribute {
    name = "state"
    type = "S"
  }

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "aws_dynamodb_table" "job_titles_lookup" {
  name         = "${var.project_name}-${var.environment}-job-titles-lookup"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "job_title"

  attribute {
    name = "job_title"
    type = "S"
  }

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "aws_dynamodb_table" "industry_categories_lookup" {
  name         = "${var.project_name}-${var.environment}-industry-categories-lookup"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "industry_category"

  attribute {
    name = "industry_category"
    type = "S"
  }

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "aws_dynamodb_table" "tags_lookup" {
  name         = "${var.project_name}-${var.environment}-tags-lookup"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "tag"

  attribute {
    name = "tag"
    type = "S"
  }

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}
