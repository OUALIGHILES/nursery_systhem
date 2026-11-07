# Terraform — Little Steps Nursery

Provider-neutral skeleton only. Nothing is provisioned.

## Current state

- `versions.tf`, `variables.tf`, `outputs.tf`, `providers.tf` at the root.
- `modules/app/` — reusable, currently contains no cloud resources.
- `environments/dev`, `environments/staging`, `environments/production` — per-environment `terraform.tfvars` with `TODO` placeholders.

## Decisions still required (do not invent)

| Decision | Placeholder variables | Needed from owner |
|---|---|---|
| Cloud provider | `cloud_provider`, `providers.tf` | aws / gcp / azure / hetzner |
| Region | `region` | e.g. `eu-west-1` |
| VPC / subnets | `vpc_cidr` | CIDR + zones |
| Compute | `instance_type`, `ssh_key_name` | size, key name, OS |
| Domain + DNS | `domain` | domain, DNS provider |
| Container registry | `container_registry` | e.g. `ghcr.io` |
| Remote state | `terraform_state_bucket/key/lock_table` | S3-compatible bucket + DynamoDB lock table |

## Remote state (once AWS is selected)

S3 bucket with versioning + object lock, DynamoDB table for state locking.
See the commented `backend "s3"` in `versions.tf`. Secrets are passed via
variables marked `sensitive = true` and must never be written to state files
or git.

## Commands (provider choice required first)

```powershell
terraform init
terraform fmt -check -recursive
terraform validate
terraform plan -var-file=environments/dev/terraform.tfvars
terraform apply   # only after explicit approval
```

## Environments

See `environments/*/terraform.tfvars.example` — copy to `terraform.tfvars`
(git-ignored) and fill placeholders. Never commit real `.tfvars` with secrets.
