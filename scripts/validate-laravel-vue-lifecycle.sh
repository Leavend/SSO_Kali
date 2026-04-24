#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STRICT_TARGET=0
FAILURES=0
WARNINGS=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --strict-target) STRICT_TARGET=1 ;;
    -h|--help)
      cat <<'EOF'
Usage: ./scripts/validate-laravel-vue-lifecycle.sh [--strict-target]

Validates Laravel/Vue migration lifecycle gates:
- production-safe Vue canary baseline
- CI script compatibility
- zero-downtime proxy isolation
- deploy and rollback image determinism
- Laravel latest target readiness

By default, target gaps are warnings. With --strict-target they fail the gate.
EOF
      exit 0
      ;;
    *) printf '[lifecycle][FAIL] Unknown option: %s\n' "$1" >&2; exit 1 ;;
  esac
  shift
done

pass() {
  printf '[lifecycle][PASS] %s\n' "$*"
}

warn() {
  WARNINGS=$((WARNINGS + 1))
  printf '[lifecycle][WARN] %s\n' "$*" >&2
}

fail() {
  FAILURES=$((FAILURES + 1))
  printf '[lifecycle][FAIL] %s\n' "$*" >&2
}

target_gap() {
  if (( STRICT_TARGET )); then
    fail "$*"
  else
    warn "$*"
  fi
}

require_file() {
  local path="$1"
  if [[ -f "$ROOT_DIR/$path" ]]; then
    pass "Found $path"
  else
    fail "Missing $path"
  fi
}

json_field() {
  local file="$1" expr="$2"
  node -e '
    const fs = require("fs");
    const data = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const expr = process.argv[2];
    const value = Function("data", `"use strict"; return (${expr});`)(data);
    if (value === undefined || value === null) process.exit(2);
    process.stdout.write(String(value));
  ' "$ROOT_DIR/$file" "$expr"
}

has_npm_script() {
  local package_file="$1" script="$2"
  if json_field "$package_file" "data.scripts && data.scripts['$script']" >/dev/null 2>&1; then
    pass "$package_file exposes npm script '$script'"
  else
    fail "$package_file is missing npm script '$script'"
  fi
}

has_text() {
  local file="$1" needle="$2" label="$3"
  if grep -Fq "$needle" "$ROOT_DIR/$file"; then
    pass "$label"
  else
    fail "$label"
  fi
}

composer_constraint() {
  local file="$1" package="$2"
  json_field "$file" "data.require && data.require['$package']" 2>/dev/null || true
}

lock_package_version() {
  local file="$1" package="$2"
  json_field "$file" "data.packages && data.packages['node_modules/$package'] && data.packages['node_modules/$package'].version" 2>/dev/null || true
}

check_laravel_target() {
  local file="$1"
  local framework php minimum prefer

  framework="$(composer_constraint "$file" "laravel/framework")"
  php="$(composer_constraint "$file" "php")"
  minimum="$(json_field "$file" "data['minimum-stability']" 2>/dev/null || true)"
  prefer="$(json_field "$file" "data['prefer-stable']" 2>/dev/null || true)"

  [[ "$php" == "^8.4" || "$php" == *"8.4"* ]] \
    && pass "$file targets PHP 8.4-compatible runtime" \
    || fail "$file does not target PHP 8.4-compatible runtime"

  [[ "$minimum" == "stable" && "$prefer" == "true" ]] \
    && pass "$file keeps stable Composer dependency policy" \
    || fail "$file should keep minimum-stability=stable and prefer-stable=true"

  if [[ "$framework" == *"^13"* ]]; then
    pass "$file targets Laravel 13"
  else
    target_gap "$file still targets Laravel framework '$framework'; Laravel 13 migration remains a planned compatibility track"
  fi
}

check_vue_target() {
  local lock="services/sso-admin-vue/package-lock.json"
  local vue router pinia

  vue="$(lock_package_version "$lock" "vue")"
  router="$(lock_package_version "$lock" "vue-router")"
  pinia="$(lock_package_version "$lock" "pinia")"

  if [[ "$vue" =~ ^3\.5\.[0-9]+$ ]]; then
    pass "Vue canary is pinned by lockfile to production-safe Vue $vue"
  else
    fail "Vue canary lockfile uses '$vue'; expected stable Vue 3.5.x for current production path"
  fi

  if [[ "$router" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    pass "Vue Router lockfile uses stable $router"
  else
    fail "Vue Router lockfile uses unstable or missing version '$router'"
  fi

  if [[ "$pinia" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    pass "Pinia lockfile uses stable $pinia"
  else
    fail "Pinia lockfile uses unstable or missing version '$pinia'"
  fi
}

require_file "services/sso-backend/composer.json"
require_file "apps/app-b-laravel/composer.json"
require_file "services/sso-admin-vue/package.json"
require_file "services/sso-admin-vue/package-lock.json"
require_file "docker-compose.dev.yml"
require_file "scripts/deploy.sh"
require_file "deploy-remote.sh"
require_file "scripts/vps-deploy.sh"
require_file "scripts/vps-rollback.sh"

check_laravel_target "services/sso-backend/composer.json"
check_laravel_target "apps/app-b-laravel/composer.json"
check_vue_target

has_npm_script "services/sso-admin-vue/package.json" "typecheck"
has_npm_script "services/sso-admin-vue/package.json" "test"
has_npm_script "services/sso-admin-vue/package.json" "build"
has_npm_script "services/sso-admin-vue/package.json" "lint"

has_text "docker-compose.dev.yml" 'image: sso-dev-sso-admin-vue:${APP_IMAGE_TAG:-local}' "Vue canary image is tag-addressable by APP_IMAGE_TAG"
has_text "docker-compose.dev.yml" 'traefik.http.middlewares.sso-admin-vue-strip.stripprefix.prefixes=${SSO_ADMIN_VUE_BASE_PATH:-/__vue-preview}' "Vue canary strips preview prefix before static serving"
has_text "docker-compose.dev.yml" 'traefik.http.routers.sso-admin-vue.priority=175' "Vue canary priority stays below backend API routes"
has_text "docker-compose.dev.yml" 'traefik.http.routers.sso-backend.priority=200' "Backend API/OIDC router remains highest priority"
has_text "docker-compose.dev.yml" 'traefik.http.routers.sso-frontend.priority=50' "Primary SSO frontend remains root catch-all during canary"

has_text "scripts/deploy.sh" 'admin-vue-only' "Top-level deploy supports admin-vue-only mode"
has_text "deploy-remote.sh" 'admin-vue-only) bring_up_admin_vue' "Remote deploy can update Vue canary only"
has_text "deploy-remote.sh" 'full) smoke_full; smoke_admin_vue' "Full remote deploy smokes Vue canary"
has_text "scripts/vps-deploy.sh" 'export APP_IMAGE_TAG="$TAG"' "VPS deploy exports APP_IMAGE_TAG for deterministic compose image selection"
has_text "scripts/vps-deploy.sh" 'LOCAL_IMAGE_MAP' "VPS deploy retags GHCR images to compose image names"
has_text "scripts/vps-deploy.sh" 'SMOKE_FAILED=0' "VPS deploy treats smoke failures as rollback triggers"
has_text "scripts/vps-rollback.sh" 'export APP_IMAGE_TAG="$TAG"' "VPS rollback exports APP_IMAGE_TAG for deterministic compose image selection"
has_text "scripts/vps-rollback.sh" 'LOCAL_IMAGE_MAP' "VPS rollback retags GHCR images to compose image names"

printf '[lifecycle] Completed with %d failure(s), %d warning(s)\n' "$FAILURES" "$WARNINGS"

if (( FAILURES > 0 )); then
  exit 1
fi
