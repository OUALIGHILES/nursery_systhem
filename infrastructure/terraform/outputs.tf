output "environment" {
  description = "Environment name."
  value       = var.environment
}

output "domain" {
  description = "Public domain (placeholder until provider selection)."
  value       = var.domain
}

output "image_tag" {
  description = "Container image tag (placeholder until registry selection)."
  value       = var.image_tag
}

# Provider-specific outputs go here after cloud selection.
# Example (do not use until provider is chosen):
# output "server_ip" { value = module.app.server_ip }
