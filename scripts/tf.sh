#!/usr/bin/env bash
set -euo pipefail
CMD=${1:-plan}
terraform -chdir=infra/terraform init
terraform -chdir=infra/terraform "$CMD" -var-file=terraform.tfvars
