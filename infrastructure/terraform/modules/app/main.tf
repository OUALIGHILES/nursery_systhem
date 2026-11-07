# Provider-neutral application module — resources go here after provider selection.
#
# Planned resources (provider-dependent):
#   - VPC / network (var.vpc_cidr, var.environment)
#   - Compute host(s) for the Compose stack (var.instance_type placeholder)
#   - Firewall: 80/443 public, 22 via bastion/SSM only, 5432/6379/9092 private
#   - Container registry pull secrets (var.container_registry — TODO)
#   - DNS records for var.domain (TODO)
#
# No resource blocks are committed until the target cloud is approved.
