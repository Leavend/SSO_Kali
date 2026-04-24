#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FAILURES=0
WARNINGS=0

pass() {
  printf '[devops-lifecycle][PASS] %s\n' "$*"
}

warn() {
  WARNINGS=$((WARNINGS + 1))
  printf '[devops-lifecycle][WARN] %s\n' "$*" >&2
}

fail() {
  FAILURES=$((FAILURES + 1))
  printf '[devops-lifecycle][FAIL] %s\n' "$*" >&2
}

require_file() {
  local path="$1"
  if [[ -f "$ROOT_DIR/$path" ]]; then
    pass "Found $path"
  else
    fail "Missing $path"
  fi
}

require_dir() {
  local path="$1"
  if [[ -d "$ROOT_DIR/$path" ]]; then
    pass "Found $path"
  else
    fail "Missing $path"
  fi
}

require_text() {
  local file="$1" pattern="$2" label="$3"
  if grep -Eq -- "$pattern" "$ROOT_DIR/$file"; then
    pass "$label"
  else
    fail "$label"
  fi
}

warn_unless_text() {
  local file="$1" pattern="$2" label="$3"
  if grep -Eq -- "$pattern" "$ROOT_DIR/$file"; then
    pass "$label"
  else
    warn "$label"
  fi
}

require_file ".github/workflows/ci.yml"
require_file ".github/workflows/cd.yml"
require_file ".github/workflows/rollback.yml"
require_file ".github/workflows/devops-lifecycle.yml"
require_file ".env.dev.example"
require_file "docker-compose.dev.yml"
require_file "scripts/vps-deploy.sh"
require_file "scripts/vps-rollback.sh"
require_file "scripts/vps-direct-build-deploy.sh"
require_file "scripts/validate-laravel-vue-lifecycle.sh"
require_file "infra/sre/check-coexistence-policy.sh"
require_file "infra/sre/check-zero-downtime-migration-policy.sh"
require_file "infra/sre/check-observability-assets.sh"
require_file "infra/observability/prometheus/prometheus.sso.yml"
require_file "infra/observability/alertmanager/alertmanager.sso.yml"
require_file "infra/observability/grafana/dashboards/sso-control-plane-dashboard.json"
require_file "charts/sso-prototype/Chart.yaml"
require_file "docs/security/container-image-scanning-policy.md"

require_dir "infra/terraform/environments/dev-sso"
require_file "infra/terraform/environments/dev-sso/versions.tf"
require_file "infra/terraform/environments/dev-sso/main.tf"
require_file "infra/terraform/environments/dev-sso/variables.tf"
require_file "infra/terraform/environments/dev-sso/outputs.tf"

require_dir "infra/ansible"
require_file "infra/ansible/ansible.cfg"
require_file "infra/ansible/inventory/dev-sso.ini.example"
require_file "infra/ansible/group_vars/sso_vps.yml"
require_file "infra/ansible/playbooks/devops-preflight.yml"

require_text ".github/workflows/ci.yml" 'permissions:[[:space:]]*$' "CI declares explicit permissions"
require_text ".github/workflows/ci.yml" 'packages: write' "CI image build has package write permission only where needed"
require_text ".github/workflows/ci.yml" 'id-token: write' "CI image build can publish signed provenance"
require_text ".github/workflows/ci.yml" 'attestations: write' "CI image build can publish attestations"
require_text ".github/workflows/ci.yml" 'security-events: write' "CI can upload security scanning evidence"
require_text ".github/workflows/ci.yml" 'docker/build-push-action@v6' "CI uses Docker Buildx build-push action"
require_text ".github/workflows/ci.yml" 'docker/metadata-action@v5' "CI uses Docker metadata action"
require_text ".github/workflows/ci.yml" 'storage/framework/views' "CI prepares Laravel runtime directories for ephemeral runners"
require_text ".github/workflows/ci.yml" 'cache-to: type=gha' "CI uses Docker build cache"
require_text ".github/workflows/ci.yml" 'sbom: true' "CI emits container SBOM attestations"
require_text ".github/workflows/ci.yml" 'provenance: mode=max' "CI emits max provenance attestations"
require_text ".github/workflows/ci.yml" 'docker/scout-action@v[0-9]+\.[0-9]+\.[0-9]+' "CI runs a pinned Docker Scout CVE scan"
require_text ".github/workflows/ci.yml" 'DOCKERHUB_TOKEN' "CI supports Docker Scout authentication through GitHub secrets"
require_text ".github/workflows/ci.yml" 'github/codeql-action/upload-sarif@v4' "CI uploads container scan SARIF evidence"
require_text ".github/workflows/ci.yml" 'sso-admin-vue' "CI builds Vue admin canary image"

require_text ".github/workflows/cd.yml" 'environment: production' "CD requires production environment gate"
require_text ".github/workflows/cd.yml" 'cancel-in-progress: false' "CD does not cancel in-flight deployments"
require_text ".github/workflows/cd.yml" 'docker-compose\.dev\.yml' "CD syncs Compose control-plane file"
require_text ".github/workflows/cd.yml" 'scripts/vps-deploy\.sh' "CD syncs VPS deploy script"
require_text ".github/workflows/cd.yml" 'scripts/vps-rollback\.sh' "CD syncs VPS rollback script"
require_text ".github/workflows/cd.yml" 'sudo install -m 0644 /tmp/_deploy_bundle/docker-compose\.dev\.yml' "CD installs Compose control plane atomically"

require_text ".github/workflows/rollback.yml" 'workflow_dispatch' "Rollback is manually dispatchable"
require_text ".github/workflows/rollback.yml" 'target_tag' "Rollback requires an explicit target tag"
require_text ".github/workflows/rollback.yml" 'scripts/vps-rollback\.sh' "Rollback workflow executes rollback script"

require_text "docker-compose.dev.yml" 'sso-admin-vue:' "Compose defines Vue canary service"
require_text "docker-compose.dev.yml" 'image: sso-dev-sso-admin-vue:\$\{APP_IMAGE_TAG:-local\}' "Vue canary image is tag-addressable"
require_text "docker-compose.dev.yml" 'PathPrefix\(`\$\{SSO_ADMIN_VUE_BASE_PATH:-/__vue-preview\}`\)' "Vue canary route is path-isolated"
require_text "docker-compose.dev.yml" 'traefik.http.routers.sso-backend.priority=200' "Backend API/OIDC keeps highest router priority"
require_text "docker-compose.dev.yml" 'traefik.http.routers.sso-admin-vue.priority=175' "Vue canary priority stays below backend"
require_text "docker-compose.dev.yml" 'traefik.http.routers.sso-frontend.priority=50' "Current frontend root catch-all stays lower priority"
require_text ".env.dev.example" '^SSO_ADMIN_VUE_BASE_PATH=/__vue-preview$' "Development env example exposes Vue canary base path"

require_text "scripts/vps-deploy.sh" 'export APP_IMAGE_TAG="\$TAG"' "Deploy exports deterministic APP_IMAGE_TAG"
require_text "scripts/vps-deploy.sh" 'compose config --services' "Deploy preflights Compose services"
require_text "scripts/vps-deploy.sh" 'sso-admin-vue' "Deploy includes Vue admin canary"
require_text "scripts/vps-deploy.sh" 'SMOKE_FAILED=0' "Deploy treats smoke failures as rollback triggers"
require_text "scripts/vps-deploy.sh" 'vps-rollback\.sh' "Deploy can call rollback script"
require_text "scripts/vps-rollback.sh" 'export APP_IMAGE_TAG="\$TAG"' "Rollback exports deterministic APP_IMAGE_TAG"
require_text "scripts/vps-rollback.sh" 'compose config --services' "Rollback preflights Compose services"
require_text "scripts/vps-direct-build-deploy.sh" 'docker build --pull' "Direct VPS deploy builds immutable local images without Compose dependency rebuilds"
require_text "scripts/vps-direct-build-deploy.sh" 'NEXT_PUBLIC_SSO_BASE_URL' "Direct VPS deploy passes frontend build args explicitly"
require_text "scripts/vps-direct-build-deploy.sh" 'ROLLBACK_TAG="rollback-\$\{TAG\}"' "Direct VPS deploy creates rollback image tag"
require_text "scripts/vps-direct-build-deploy.sh" 'rollback_once "Deploy failed unexpectedly"' "Direct VPS deploy runs rollback once on failure"
require_text "scripts/vps-direct-build-deploy.sh" 'TOUCHED_SERVICES\+=\("\$svc"\)' "Direct VPS deploy rolls back only services touched at runtime"
require_text "scripts/vps-direct-build-deploy.sh" 'wait_healthy "\$svc" 180' "Direct VPS deploy health-gates rolling updates"
require_text "scripts/vps-direct-build-deploy.sh" '--resolve "\$host:443:127\.0\.0\.1"' "Direct VPS deploy smokes HTTPS through the local reverse proxy"
require_text "scripts/vps-direct-build-deploy.sh" 'Vue Admin Canary' "Direct VPS deploy smokes Vue canary"

require_text "infra/terraform/environments/dev-sso/main.tf" 'zero_downtime_release_contract' "Terraform catalog captures zero-downtime release contract"
require_text "infra/terraform/environments/dev-sso/variables.tf" 'required_runtime_services' "Terraform catalog captures required runtime services"
require_text "infra/ansible/playbooks/devops-preflight.yml" 'Dev SSO VPS DevOps preflight' "Ansible has read-only VPS preflight playbook"
require_text "infra/ansible/playbooks/devops-preflight.yml" 'docker compose' "Ansible preflight checks Docker Compose"
require_text "infra/ansible/playbooks/devops-preflight.yml" '/\.well-known/openid-configuration' "Ansible preflight smokes OIDC discovery"
require_text "infra/ansible/playbooks/devops-preflight.yml" '/healthz' "Ansible preflight smokes Vue canary health"

require_text ".github/workflows/devops-lifecycle.yml" 'validate-devops-lifecycle\.sh' "DevOps workflow runs lifecycle validator"
require_text ".github/workflows/devops-lifecycle.yml" 'hashicorp/setup-terraform@v3' "DevOps workflow validates Terraform"
require_text ".github/workflows/devops-lifecycle.yml" 'ansible-playbook --syntax-check' "DevOps workflow validates Ansible syntax"
require_text ".github/workflows/devops-lifecycle.yml" 'check-observability-assets\.sh' "DevOps workflow validates observability assets"

warn_unless_text ".github/workflows/ci.yml" 'docker/scout-action|trivy|grype|scan' "Container vulnerability scanning is integrated"
warn_unless_text ".github/workflows/devops-lifecycle.yml" 'kubeconform|helm lint|ct lint' "Kubernetes/Helm static validation is integrated"
warn_unless_text "infra/ansible/playbooks/devops-preflight.yml" 'firewall|ufw|nftables' "Host firewall automation is codified"
warn_unless_text "infra/terraform/environments/dev-sso/main.tf" 'dns|firewall|provider' "Provider-backed DNS/firewall resources are codified"

printf '[devops-lifecycle] Completed with %d failure(s), %d warning(s)\n' "$FAILURES" "$WARNINGS"

if (( FAILURES > 0 )); then
  exit 1
fi
