data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_region" "current" {}

locals {
  db_subnet_cidrs = [
    cidrsubnet(var.vpc_cidr, 4, 0),
    cidrsubnet(var.vpc_cidr, 4, 1),
  ]
}

resource "aws_vpc" "db" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "aws_subnet" "db_private" {
  count                   = 2
  vpc_id                  = aws_vpc.db.id
  cidr_block              = local.db_subnet_cidrs[count.index]
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = false

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "aws_route_table" "db_private" {
  vpc_id = aws_vpc.db.id

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "aws_route_table_association" "db_private" {
  count          = length(aws_subnet.db_private)
  subnet_id      = aws_subnet.db_private[count.index].id
  route_table_id = aws_route_table.db_private.id
}

resource "aws_security_group" "db" {
  name        = "${var.project_name}-${var.environment}-aurora"
  description = "Aurora PostgreSQL access"
  vpc_id      = aws_vpc.db.id

  ingress {
    description = "PostgreSQL from VPC"
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "aws_db_subnet_group" "db" {
  name       = "${var.project_name}-${var.environment}-db-subnets"
  subnet_ids = aws_subnet.db_private[*].id

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "random_password" "db" {
  length  = 20
  special = true
}

resource "aws_rds_cluster" "talent" {
  cluster_identifier = "${var.project_name}-${var.environment}-aurora"
  engine             = "aurora-postgresql"
  database_name      = var.db_name

  master_username = var.db_username
  master_password = random_password.db.result

  db_subnet_group_name   = aws_db_subnet_group.db.name
  vpc_security_group_ids = [aws_security_group.db.id]

  enable_http_endpoint = true
  skip_final_snapshot  = true

  serverlessv2_scaling_configuration {
    min_capacity = 0.5
    max_capacity = 2
  }

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "aws_rds_cluster_instance" "talent" {
  identifier          = "${var.project_name}-${var.environment}-aurora-instance"
  cluster_identifier  = aws_rds_cluster.talent.id
  instance_class      = "db.serverless"
  engine              = aws_rds_cluster.talent.engine
  engine_version      = aws_rds_cluster.talent.engine_version
  publicly_accessible = false

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "aws_secretsmanager_secret" "db" {
  name = "${var.project_name}/${var.environment}/aurora"

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "aws_secretsmanager_secret_version" "db" {
  secret_id = aws_secretsmanager_secret.db.id
  secret_string = jsonencode({
    username = var.db_username
    password = random_password.db.result
    engine   = "postgres"
    host     = aws_rds_cluster.talent.endpoint
    port     = aws_rds_cluster.talent.port
    dbname   = var.db_name
  })
}

resource "aws_security_group" "vpce" {
  name        = "${var.project_name}-${var.environment}-vpce"
  description = "VPC endpoint access"
  vpc_id      = aws_vpc.db.id

  ingress {
    description = "TLS from VPC"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "aws_vpc_endpoint" "secretsmanager" {
  vpc_id              = aws_vpc.db.id
  service_name        = "com.amazonaws.${data.aws_region.current.name}.secretsmanager"
  vpc_endpoint_type   = "Interface"
  private_dns_enabled = true
  subnet_ids          = aws_subnet.db_private[*].id
  security_group_ids  = [aws_security_group.vpce.id]

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}
