terraform {
  backend "s3" {
    bucket         = "aimory-talent-pool-tfstate-290088417978"
    key            = "aimory-talent-pool/dev/infra.tfstate"
    region         = "us-east-1"
    dynamodb_table = "aimory-talent-pool-tflocks"
    encrypt        = true
  }
}
