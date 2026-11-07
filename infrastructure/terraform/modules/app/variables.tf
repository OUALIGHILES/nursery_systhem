variable "environment" {
  type    = string
  default = "dev"
}

variable "vpc_cidr" {
  type    = string
  default = "10.0.0.0/16"
}

variable "image_tag" {
  description = "Container image tag (placeholder)."
  type        = string
  default     = "TODO"
}

variable "instance_type" {
  description = "PLACEHOLDER — compute size. Do not invent until provider selection."
  type        = string
  default     = "TODO"
}

variable "ssh_key_name" {
  description = "PLACEHOLDER — SSH key reference. Not yet decided."
  type        = string
  default     = "TODO"
}
