variable "environment" {
  description = "Environment name: dev, staging, or production."
  type        = string
  default     = "dev"
  validation {
    condition     = contains(["dev", "staging", "production"], var.environment)
    error_message = "environment must be dev, staging, or production."
  }
}

variable "cloud_provider" {
  description = "PLACEHOLDER — set to aws, gcp, azure, or hetzner once the target provider is approved."
  type        = string
  default     = "TODO"
}

variable "region" {
  description = "PLACEHOLDER — cloud region (e.g. eu-west-1). Not yet decided."
  type        = string
  default     = "TODO"
}

variable "vpc_cidr" {
  description = "PLACEHOLDER — VPC/network CIDR. Not yet decided."
  type        = string
  default     = "10.0.0.0/16"
}

variable "domain" {
  description = "PLACEHOLDER — public domain for the nursery site. Not yet decided."
  type        = string
  default     = "TODO"
}

variable "image_tag" {
  description = "Container image tag to deploy (e.g. commit SHA). No default until registry is chosen."
  type        = string
  default     = "TODO"
}

variable "container_registry" {
  description = "PLACEHOLDER — container registry host (e.g. ghcr.io). Not yet decided."
  type        = string
  default     = "TODO"
}

variable "postgres_password" {
  description = "PostgreSQL password. Sensitive; pass via CI secret, never commit."
  type        = string
  sensitive   = true
  default     = null
}

variable "jwt_access_secret" {
  description = "JWT access secret (≥32 chars). Sensitive; pass via CI secret."
  type        = string
  sensitive   = true
  default     = null
}

variable "jwt_refresh_secret" {
  description = "JWT refresh secret (≥32 chars). Sensitive; pass via CI secret."
  type        = string
  sensitive   = true
  default     = null
}

variable "smtp_password" {
  description = "SMTP app password. Sensitive; pass via CI secret."
  type        = string
  sensitive   = true
  default     = null
}

variable "terraform_state_bucket" {
  description = "PLACEHOLDER — S3-compatible bucket for remote state. Not yet decided."
  type        = string
  default     = "TODO"
}

variable "terraform_state_key" {
  description = "PLACEHOLDER — state object key (per environment)."
  type        = string
  default     = "TODO"
}

variable "terraform_state_lock_table" {
  description = "PLACEHOLDER — DynamoDB lock table for S3 state locking."
  type        = string
  default     = "TODO"
}
