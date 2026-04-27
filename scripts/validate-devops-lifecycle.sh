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

require_absent_text() {
  local file="$1" pattern="$2" label="$3"
  if grep -Eq -- "$pattern" "$ROOT_DIR/$file"; then
    fail "$label"
  else
    pass "$label"
  fi
}

require_file ".github/workflows/ci.yml"
require_file ".github/workflows/cd.yml"
require_file ".github/workflows/rollback.yml"
require_file ".github/workflows/devops-lifecycle.yml"
require_file ".dockerignore"
require_file ".env.dev.example"
require_file "docker-compose.dev.yml"
require_file "scripts/vps-deploy.sh"
require_file "scripts/wait-for-ghcr-images.sh"
require_file "scripts/vps-login-ui-cutover.sh"
require_file "scripts/vps-rollback.sh"
require_file "scripts/vps-direct-build-deploy.sh"
require_file "scripts/validate-laravel-vue-lifecycle.sh"
require_file "scripts/validate-sso-frontend-vue-lifecycle.sh"
require_file "scripts/validate-zitadel-login-vue-lifecycle.sh"
require_file "services/zitadel-login-vue/Dockerfile"
require_file "services/zitadel-login-vue/src/server/zitadel-client.ts"
require_file "services/zitadel-login-vue/src/web/views/LoginView.vue"
require_file "docs/generated/zitadel-vue-login-canary-runbook-2026-04-26.md"
require_file "services/sso-frontend/src/web/styles/auth-shell-floating.css"
require_file "infra/zitadel-login/patch-login-otp-behavior.mjs"
require_file "infra/zitadel-login/patch-login-floating-toggle.mjs"
require_file "infra/zitadel-login/patch-login-signedin-redirect.mjs"
require_file "infra/zitadel-login/patch-login-url-privacy.mjs"
require_file "infra/zitadel-login/patch-login-responsive-errors.mjs"
require_file "infra/zitadel-login/patch-login-translation-fallback.mjs"
require_file "infra/zitadel-login/validate-login-floating-toggle-patch.mjs"
require_file "infra/zitadel-login/validate-login-auth-flow-patch.mjs"
require_file "infra/zitadel-login/validate-login-otp-behavior-patch.mjs"
require_file "infra/zitadel-login/login-copy-errors.mjs"
require_file "infra/nginx/snippets/id-dev-sso-login-locale-reload.conf"
require_file "infra/nginx/assets/login/parent-chrome.css"
require_file "infra/nginx/assets/login/parent-chrome.js"
require_file "infra/sre/check-coexistence-policy.sh"
require_file "infra/sre/check-zero-downtime-migration-policy.sh"
require_file "infra/sre/check-observability-assets.sh"
require_file "infra/observability/prometheus/prometheus.sso.yml"
require_file "infra/observability/alertmanager/alertmanager.sso.yml"
require_file "infra/observability/grafana/dashboards/sso-control-plane-dashboard.json"
require_file "charts/sso-prototype/Chart.yaml"
require_file "docs/security/container-image-scanning-policy.md"
require_file "docs/generated/devops-best-practice-validation-2026-04-24.md"
require_file "docs/generated/sso-frontend-vue-rebuild-runbook-2026-04-24.md"

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
require_text ".github/workflows/ci.yml" 'FORCE_JAVASCRIPT_ACTIONS_TO_NODE24' "CI opts JavaScript actions into Node 24 runtime"
require_text ".github/workflows/cd.yml" 'FORCE_JAVASCRIPT_ACTIONS_TO_NODE24' "CD opts JavaScript actions into Node 24 runtime"
require_text ".github/workflows/rollback.yml" 'FORCE_JAVASCRIPT_ACTIONS_TO_NODE24' "Rollback opts JavaScript actions into Node 24 runtime"
require_text ".github/workflows/ci.yml" 'actions/checkout@v5' "CI uses Node 24-compatible checkout action"
require_text ".github/workflows/ci.yml" 'actions/setup-node@v6' "CI uses Node 24-compatible setup-node action"
require_text ".github/workflows/ci.yml" 'actions/cache@v5' "CI uses Node 24-compatible cache action"
require_text ".github/workflows/ci.yml" 'docker/build-push-action@v7' "CI uses Docker Buildx build-push action"
require_text ".dockerignore" '\*\*/node_modules' "Docker root context excludes Node dependencies"
require_text ".dockerignore" '\.secrets' "Docker root context excludes local secrets"
require_text ".github/workflows/ci.yml" 'docker/metadata-action@v6' "CI uses Docker metadata action"
require_text ".github/workflows/ci.yml" 'storage/framework/views' "CI prepares Laravel runtime directories for ephemeral runners"
require_text ".github/workflows/ci.yml" 'cache-to: type=gha' "CI uses Docker build cache"
require_text ".github/workflows/ci.yml" 'sbom: true' "CI emits container SBOM attestations"
require_text ".github/workflows/ci.yml" 'provenance: mode=max' "CI emits max provenance attestations"
require_text ".github/workflows/ci.yml" 'anchore/scan-action@[0-9a-f]{40}' "CI runs a SHA-pinned Grype CVE scan"
require_text ".github/workflows/ci.yml" 'fail-build: true' "CI blocks high/critical fixable container vulnerabilities"
require_text ".github/workflows/ci.yml" 'Require Grype SARIF evidence' "CI fails when the vulnerability scanner does not produce evidence"
require_text ".github/workflows/ci.yml" 'only-fixed: true' "CI scopes image CVE evidence to fixable vulnerabilities"
require_text ".github/workflows/ci.yml" 'github/codeql-action/upload-sarif@v4' "CI uploads container scan SARIF evidence"
require_absent_text ".github/workflows/ci.yml" 'docker/scout-action|Docker Scout|DOCKERHUB_TOKEN|dockerhub-' "CI no longer depends on Docker Scout entitlement"
require_text ".github/workflows/ci.yml" 'sso-admin-vue' "CI builds Vue admin canary image"
require_text ".github/workflows/ci.yml" 'zitadel-login-vue' "CI builds Vue ZITADEL login canary image"

require_text ".github/workflows/cd.yml" 'environment: production' "CD requires production environment gate"
require_text ".github/workflows/cd.yml" 'cancel-in-progress: false' "CD does not cancel in-flight deployments"
require_text ".github/workflows/cd.yml" 'docker-compose\.dev\.yml' "CD syncs Compose control-plane file"
require_text ".github/workflows/cd.yml" 'scripts/vps-deploy\.sh' "CD syncs VPS deploy script"
require_text ".github/workflows/cd.yml" 'scripts/vps-login-ui-cutover\.sh' "CD syncs VPS login UI cutover script"
require_text ".github/workflows/cd.yml" 'scripts/vps-rollback\.sh' "CD syncs VPS rollback script"
require_text ".github/workflows/cd.yml" 'sudo install -m 0644 /tmp/_deploy_bundle/docker-compose\.dev\.yml' "CD installs Compose control plane atomically"
require_text ".github/workflows/cd.yml" 'docker/login-action@v4' "CD authenticates to GHCR before artifact preflight"
require_text ".github/workflows/cd.yml" 'scripts/wait-for-ghcr-images\.sh' "CD waits for release image manifests before VPS deploy"

require_text ".github/workflows/rollback.yml" 'workflow_dispatch' "Rollback is manually dispatchable"
require_text ".github/workflows/rollback.yml" 'target_tag' "Rollback requires an explicit target tag"
require_text ".github/workflows/rollback.yml" 'scripts/vps-rollback\.sh' "Rollback workflow executes rollback script"
require_text ".github/workflows/rollback.yml" 'login_ui' "Rollback workflow can choose hosted or Vue login UI"
require_text ".github/workflows/rollback.yml" 'vps-login-ui-cutover\.sh' "Rollback workflow applies login UI rollback policy"

require_text "docker-compose.dev.yml" 'sso-admin-vue:' "Compose defines Vue canary service"
require_text "docker-compose.dev.yml" 'zitadel-login-vue:' "Compose defines Vue ZITADEL login canary service"
require_text "docker-compose.dev.yml" 'http://127\.0\.0\.1:3000/healthz' "App A healthcheck prefers dedicated health endpoint"
require_text "docker-compose.dev.yml" 'http://127\.0\.0\.1:3000 >/dev/null' "App A healthcheck preserves one-release rollback fallback"
require_absent_text "docker-compose.dev.yml" 'npm run start -- --hostname 0\.0\.0\.0 --port 3000' "App A production container uses standalone Node runtime without npm"
require_text "docker-compose.dev.yml" 'http://127\.0\.0\.1:8000/health' "App B healthcheck avoids SSO redirect code paths"
require_absent_text "apps/app-b-laravel/Dockerfile" 'key:generate --force' "App B container does not rotate APP_KEY during deploy or prewarm"
require_text "docker-compose.dev.yml" 'ZITADEL_LOGIN_ACTIVE_BASE_PATH:-/ui/v2/login' "Compose can roll back active login UI to hosted login"
require_text "docker-compose.dev.yml" 'SSO_IDENTITY_UI_BASE_URL: \$\{ZITADEL_ISSUER\}\$\{ZITADEL_LOGIN_ACTIVE_BASE_PATH:-/ui/v2/login\}' "SSO frontend follows active login UI path"
require_text "docker-compose.dev.yml" 'image: sso-dev-sso-admin-vue:\$\{APP_IMAGE_TAG:-local\}' "Vue canary image is tag-addressable"
require_text "docker-compose.dev.yml" 'image: sso-dev-zitadel-login-vue:\$\{APP_IMAGE_TAG:-local\}' "Vue ZITADEL login canary image is tag-addressable"
require_text "docker-compose.dev.yml" 'PathPrefix\(`\$\{SSO_ADMIN_VUE_BASE_PATH:-/__vue-preview\}`\)' "Vue canary route is path-isolated"
require_text "docker-compose.dev.yml" 'PathPrefix\(`\$\{ZITADEL_LOGIN_VUE_BASE_PATH:-/ui/v2/login-vue\}`\)' "Vue ZITADEL login canary route is path-isolated"
require_text "docker-compose.dev.yml" 'traefik.http.routers.sso-backend.priority=200' "Backend API/OIDC keeps highest router priority"
require_text "docker-compose.dev.yml" 'traefik.http.routers.sso-admin-vue.priority=175' "Vue canary priority stays below backend"
require_text "docker-compose.dev.yml" 'traefik.http.routers.sso-frontend.priority=50' "Current frontend root catch-all stays lower priority"
require_text ".env.dev.example" '^SSO_ADMIN_VUE_BASE_PATH=/__vue-preview$' "Development env example exposes Vue canary base path"
require_text ".env.dev.example" '^APP_A_SESSION_COOKIE_NAME=__Host-app-a-session$' "App A env example uses hardened __Host cookie prefix"
require_text ".env.dev.example" '^ZITADEL_LOGIN_ACTIVE_BASE_PATH=/ui/v2/login$' "Development env example keeps hosted login as rollback default"
require_text ".env.dev.example" '^ZITADEL_LOGIN_VUE_BASE_PATH=/ui/v2/login-vue$' "Development env example exposes Vue ZITADEL login canary base path"
require_text ".env.dev.example" '^ZITADEL_LOGIN_REQUIRE_TOTP_AFTER_PASSWORD=true$' "Development env keeps Vue login password-to-TOTP flow enabled"
require_text "docker-compose.dev.yml" 'LOGIN_REQUIRE_TOTP_AFTER_PASSWORD: \$\{ZITADEL_LOGIN_REQUIRE_TOTP_AFTER_PASSWORD:-true\}' "Compose enables password-to-TOTP flow for Vue login"
require_text "services/zitadel-login-vue/src/server/api-handlers.ts" "nextStep: 'otp'" "Vue login password step routes to authenticator code input"
require_text "services/zitadel-login-vue/src/server/zitadel-client.ts" 'getAuthRequestLoginHint' "Vue login reads OIDC auth request login hint from ZITADEL"
require_text "services/zitadel-login-vue/src/server/api-handlers.ts" '/session/auth-request' "Vue login starts OIDC requests without a duplicate email step"
require_text "services/zitadel-login-vue/src/web/views/LoginView.vue" 'submitAuthRequest' "Vue login consumes OIDC auth request before showing email form"

require_text "scripts/vps-deploy.sh" 'export APP_IMAGE_TAG="\$TAG"' "Deploy exports deterministic APP_IMAGE_TAG"
require_text "scripts/wait-for-ghcr-images.sh" 'docker manifest inspect' "CD artifact gate verifies GHCR manifests deterministically"
require_text "scripts/wait-for-ghcr-images.sh" 'zitadel-login-vue' "CD artifact gate covers Vue ZITADEL login image"
require_text "scripts/wait-for-ghcr-images.sh" 'app-b-laravel' "CD artifact gate covers downstream Laravel app image"
require_text "scripts/vps-deploy.sh" 'compose config --services' "Deploy preflights Compose services"
require_text "scripts/vps-deploy.sh" 'sso-admin-vue' "Deploy includes Vue admin canary"
require_text "scripts/vps-deploy.sh" 'zitadel-login-vue' "Deploy includes Vue ZITADEL login canary"
require_text "scripts/vps-deploy.sh" 'ZITADEL_LOGIN_VUE_COOKIE_SECRET must be set' "Deploy preflights Vue ZITADEL login canary secret"
require_text "scripts/vps-deploy.sh" 'ZITADEL Vue Login Canary' "Registry deploy smokes Vue ZITADEL login canary"
require_text "scripts/vps-deploy.sh" 'SMOKE_FAILED=0' "Deploy treats smoke failures as rollback triggers"
require_text "scripts/vps-deploy.sh" 'vps-rollback\.sh' "Deploy can call rollback script"
require_text "scripts/vps-login-ui-cutover.sh" '--mode must be vue or hosted' "Login UI cutover validates the requested mode"
require_text "scripts/vps-login-ui-cutover.sh" 'ZITADEL_LOGIN_ACTIVE_BASE_PATH' "Login UI cutover updates only the active login base path"
require_text "scripts/vps-login-ui-cutover.sh" 'Hosted login rollback' "Login UI cutover smokes hosted rollback path"
require_text "scripts/vps-login-ui-cutover.sh" 'Vue login canary' "Login UI cutover smokes Vue login canary path"
require_text "scripts/vps-rollback.sh" 'export APP_IMAGE_TAG="\$TAG"' "Rollback exports deterministic APP_IMAGE_TAG"
require_text "scripts/vps-rollback.sh" 'compose config --services' "Rollback preflights Compose services"
require_text "scripts/vps-direct-build-deploy.sh" 'docker build --pull' "Direct VPS deploy builds immutable local images without Compose dependency rebuilds"
require_text "scripts/vps-direct-build-deploy.sh" 'app-a-next\)' "Direct VPS deploy can rebuild App A"
require_text "scripts/vps-direct-build-deploy.sh" 'app-b-laravel\)' "Direct VPS deploy can rebuild App B"
require_text "scripts/vps-direct-build-deploy.sh" 'App A Health' "Direct VPS deploy smokes App A health"
require_text "scripts/vps-direct-build-deploy.sh" 'App B Health' "Direct VPS deploy smokes App B health"
require_text "scripts/vps-direct-build-deploy.sh" 'VITE_SSO_BASE_URL' "Direct VPS deploy passes frontend build args explicitly"
require_text "scripts/vps-direct-build-deploy.sh" 'ROLLBACK_TAG="rollback-\$\{TAG\}"' "Direct VPS deploy creates rollback image tag"
require_text "scripts/vps-direct-build-deploy.sh" 'rollback_once "Deploy failed unexpectedly"' "Direct VPS deploy runs rollback once on failure"
require_text "scripts/vps-direct-build-deploy.sh" 'TOUCHED_SERVICES\+=\("\$svc"\)' "Direct VPS deploy rolls back only services touched at runtime"
require_text "scripts/vps-direct-build-deploy.sh" 'wait_healthy "\$svc" 180' "Direct VPS deploy health-gates rolling updates"
require_text "scripts/vps-direct-build-deploy.sh" 'app-a-next\|app-b-laravel\|sso-frontend' "Direct VPS deploy prewarms downstream apps before recreate"
require_text "scripts/vps-direct-build-deploy.sh" '--resolve "\$host:443:127\.0\.0\.1"' "Direct VPS deploy smokes HTTPS through the local reverse proxy"
require_text "scripts/vps-direct-build-deploy.sh" 'SMOKE_RETRIES' "Direct VPS deploy retries transient reverse-proxy smoke checks"
require_text "scripts/vps-direct-build-deploy.sh" 'Vue Admin Canary' "Direct VPS deploy smokes Vue canary"
require_text "scripts/vps-direct-build-deploy.sh" 'Zitadel Vue Login Canary' "Direct VPS deploy smokes Vue ZITADEL login canary"
require_text "scripts/vps-direct-build-deploy.sh" 'ZITADEL_LOGIN_VUE_COOKIE_SECRET must be set' "Direct VPS deploy preflights Vue ZITADEL login canary secret"
require_text "scripts/vps-direct-build-deploy.sh" 'ZITADEL_VERSION' "Direct VPS deploy can rebuild the hosted ZITADEL login image"
require_text "scripts/vps-direct-build-deploy.sh" 'Zitadel Login Health' "Direct VPS deploy smokes hosted ZITADEL login health"
require_text "scripts/vps-direct-build-deploy.sh" 'prewarm_green_replicas' "Direct VPS deploy prewarms green replicas before Compose recreate"
require_text "scripts/vps-direct-build-deploy.sh" 'cleanup_green_for_service' "Direct VPS deploy removes temporary green replicas after health gate"
require_text "scripts/vps-direct-build-deploy.sh" 'GREEN_DRAIN_SECONDS' "Direct VPS deploy drains temporary green replicas before cleanup"
require_text "infra/zitadel-login/Dockerfile" 'patch-login-otp-behavior\.mjs' "Hosted login image applies OTP auto-submit and Indonesian validation patch"
require_text "infra/zitadel-login/Dockerfile" 'patch-login-floating-toggle\.mjs' "Hosted login image applies floating toggle layout patch"
require_text "infra/zitadel-login/Dockerfile" 'patch-login-url-privacy\.mjs' "Hosted login image redacts sensitive login query parameters after hydration"
require_text "infra/zitadel-login/Dockerfile" 'patch-login-responsive-errors\.mjs' "Hosted login image applies responsive error-state hardening"
require_text "infra/zitadel-login/Dockerfile" 'patch-login-translation-fallback\.mjs' "Hosted login image skips missing Indonesian custom translation lookups"
require_text "infra/zitadel-login/Dockerfile" 'install-runtime-aliases\.mjs' "Hosted login image installs hashed external runtime aliases"
require_text "infra/zitadel-login/install-runtime-aliases.mjs" 'winston-cd8887eea177c285' "Hosted login runtime aliases hashed external logger dependency"
require_text "infra/zitadel-login/install-runtime-aliases.mjs" '@opentelemetry/sdk-node-65f68d2bba539441' "Hosted login runtime aliases hashed OpenTelemetry dependencies"
require_text "infra/zitadel-login/patch-login-otp-behavior.mjs" 'Could not verify OTP code' "Hosted login OTP errors are localized to Indonesian"
require_text "infra/zitadel-login/patch-login-otp-behavior.mjs" 'button\.click\(\)' "Hosted login OTP full-code input auto-submits"
require_text "services/sso-frontend/src/web/styles/auth-shell-floating.css" 'position: fixed' "Vue auth shell toggle uses viewport edge floating host"
require_text "services/sso-frontend/src/web/styles/auth-shell-floating.css" '--theme-toggle-edge-right' "Vue auth shell toggle pins to the right safe area"
require_text "services/sso-frontend/src/web/styles/auth-shell-floating.css" 'justify-content: flex-end' "Vue auth shell toggle remains right-aligned when the host grows"
require_text "services/sso-frontend/src/web/styles/auth-shell-floating.css" '--theme-toggle-edge-bottom' "Vue auth shell toggle pins above the footer safe area"
require_text "infra/zitadel-login/patch-login-floating-toggle.mjs" 'position: fixed' "Hosted login toggle uses viewport edge floating host"
require_text "infra/zitadel-login/patch-login-toggle.mjs" '__devssoToggleVersion' "Hosted login toggle cache-busts old injected scripts"
require_text "infra/nginx/snippets/id-dev-sso-login-locale-reload.conf" 'parent-chrome\.js' "Nginx injects parent chrome fallback for direct ZITADEL login routes"
require_text "infra/nginx/assets/login/parent-chrome.css" 'bottom: max\(72px' "Nginx parent chrome fallback pins toggle to the bottom safe area"
require_text "infra/nginx/assets/login/parent-chrome.js" '__devssoToggleVersion' "Nginx parent chrome fallback exposes cache-bust version"
require_text "infra/nginx/assets/login/parent-chrome.js" '__devssoUrlPrivacyVersion' "Nginx parent chrome fallback redacts sensitive login query parameters"
require_text "infra/nginx/assets/login/parent-chrome.js" 'devssoLoginContext' "Nginx parent chrome fallback preserves auth flow context for submit"
require_text "infra/nginx/assets/login/parent-chrome.js" 'restoreCurrentUrlForSubmit' "Nginx parent chrome fallback restores hosted login flow context before submit"
require_text "infra/zitadel-login/patch-login-url-privacy.mjs" 'wrap\("pushState"\)' "Hosted login URL privacy patch tracks SPA history updates"
require_text "infra/zitadel-login/patch-login-url-privacy.mjs" 'restoreForSubmit' "Hosted login URL privacy patch restores flow context before form submit"
require_text "infra/zitadel-login/patch-login-url-privacy.mjs" '1800' "Hosted login URL privacy patch waits for hydration before full opaque state redaction"
require_text "infra/zitadel-login/patch-login-otp-behavior.mjs" 'data-devsso-error-message' "Hosted login OTP errors localize without mutating React text nodes"
require_text "infra/nginx/dev-sso.timeh.my.id.chained.conf" 'id_dev_sso_redact_login_name' "Nginx redacts loginName only after a flow request id exists"
require_text "infra/nginx/dev-sso.timeh.my.id.chained.conf" 'id_dev_sso_context_route' "Nginx preserves loginName on hosted login context routes"
require_text "infra/nginx/dev-sso.timeh.my.id.chained.conf" 'ui/v2/login/password' "Nginx keeps password-step login context intact"
require_text "infra/nginx/dev-sso.timeh.my.id.chained.conf" 'ui/v2/login/otp/' "Nginx keeps OTP-step login context intact"
require_text "infra/nginx/dev-sso.timeh.my.id.chained.conf" '"1:1:0"' "Nginx keeps login hints intact until ZITADEL consumes them"
require_text "infra/nginx/dev-sso.timeh.my.id.chained.conf" 'return 302 \$uri\?requestId=\$arg_requestId&organization=\$arg_organization' "Nginx redirects hosted login PII while preserving hydration-safe flow state"
require_text "infra/nginx/dev-sso.timeh.my.id.chained.conf" 'proxy_hide_header Link' "Nginx suppresses unused Next preload headers on hosted login HTML"
require_text "infra/nginx/dev-sso.timeh.my.id.chained.conf" 'max-age=0, must-revalidate' "Nginx revalidates patched ZITADEL login assets without clearing cache"
require_text "infra/nginx/dev-sso.timeh.my.id.chained.conf" '/_devsso/login/parent-chrome\.js' "Nginx serves parent chrome fallback assets with explicit no-store route"
require_text "infra/nginx/dev-sso.timeh.my.id.chained.conf" 'Referrer-Policy "no-referrer"' "Nginx suppresses Referer leakage from hosted login pages"
require_text "infra/zitadel-login/patch-login-signedin-redirect.mjs" 'completeFlowOrGetUrl' "Hosted login auth-flow patch strips noisy client debug logs"
require_text "infra/zitadel-login/patch-login-signedin-redirect.mjs" 'loginRouteSuffix' "Hosted login V2 auth patch is scoped to the server login route"
node infra/zitadel-login/validate-login-floating-toggle-patch.mjs
node infra/zitadel-login/validate-login-auth-flow-patch.mjs

require_text "infra/terraform/environments/dev-sso/main.tf" 'zero_downtime_release_contract' "Terraform catalog captures zero-downtime release contract"
require_text "infra/terraform/environments/dev-sso/variables.tf" 'required_runtime_services' "Terraform catalog captures required runtime services"
require_text "infra/ansible/playbooks/devops-preflight.yml" 'Dev SSO VPS DevOps preflight' "Ansible has read-only VPS preflight playbook"
require_text "infra/ansible/playbooks/devops-preflight.yml" 'docker compose' "Ansible preflight checks Docker Compose"
require_text "infra/ansible/playbooks/devops-preflight.yml" '/\.well-known/openid-configuration' "Ansible preflight smokes OIDC discovery"
require_text "infra/ansible/playbooks/devops-preflight.yml" '/healthz' "Ansible preflight smokes Vue canary health"

require_text ".github/workflows/devops-lifecycle.yml" 'validate-devops-lifecycle\.sh' "DevOps workflow runs lifecycle validator"
require_text ".github/workflows/devops-lifecycle.yml" 'validate-sso-frontend-vue-lifecycle\.sh' "DevOps workflow validates rebuilt Vue SSO frontend"
require_text ".github/workflows/devops-lifecycle.yml" 'packages/dev-sso-parent-ui/\*\*' "DevOps workflow watches parent UI contract changes"
require_text ".github/workflows/devops-lifecycle.yml" 'hashicorp/setup-terraform@v4' "DevOps workflow validates Terraform"
require_text ".github/workflows/devops-lifecycle.yml" 'ansible-playbook --syntax-check' "DevOps workflow validates Ansible syntax"
require_text ".github/workflows/devops-lifecycle.yml" 'check-observability-assets\.sh' "DevOps workflow validates observability assets"

warn_unless_text ".github/workflows/ci.yml" 'anchore/scan-action|trivy|grype|scan' "Container vulnerability scanning is integrated"
warn_unless_text ".github/workflows/devops-lifecycle.yml" 'kubeconform|helm lint|ct lint' "Kubernetes/Helm static validation is integrated"
warn_unless_text "infra/ansible/playbooks/devops-preflight.yml" 'firewall|ufw|nftables' "Host firewall automation is codified"
warn_unless_text "infra/terraform/environments/dev-sso/main.tf" 'dns|firewall|provider' "Provider-backed DNS/firewall resources are codified"

printf '[devops-lifecycle] Completed with %d failure(s), %d warning(s)\n' "$FAILURES" "$WARNINGS"

if (( FAILURES > 0 )); then
  exit 1
fi
