terraform {
  required_version = ">= 1.6.0"

  # No cloud provider selected yet. Uncomment and configure one exactly once
  # the target provider is approved. Remote state via S3-compatible backend
  # with object locking enabled for staging/production:
  #
  # backend "s3" {
  #   bucket       = var.terraform_state_bucket
  #   key          = var.terraform_state_key
  #   region       = var.aws_region
  #   dynamodb_table = var.terraform_state_lock_table
  #   encrypt      = true
  # }
}
