#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_A_DIR="$ROOT_DIR/apps/app-a-next"
APP_B_DIR="$ROOT_DIR/apps/app-b-laravel"
SSO_ADMIN_VUE_DIR="$ROOT_DIR/services/sso-admin-vue"
SSO_BACKEND_DIR="$ROOT_DIR/services/sso-backend"
SSO_FRONTEND_DIR="$ROOT_DIR/services/sso-frontend"
ZITADEL_LOGIN_VUE_DIR="$ROOT_DIR/services/zitadel-login-vue"

run_section() {
  local label="$1"
  shift

  printf '\n==> %s\n' "$label"
  "$@"
}

run_in_dir() {
  local label="$1"
  local dir="$2"
  shift 2

  printf '\n==> %s\n' "$label"
  (
    cd "$dir"
    "$@"
  )
}

run_laravel_suite() {
  local label="$1"
  local dir="$2"

  run_in_dir "$label | Pint" "$dir" ./vendor/bin/pint --test
  run_in_dir "$label | PHPStan level 5" "$dir" php vendor/bin/phpstan analyse --memory-limit=512M --no-progress
  run_in_dir "$label | Pest" "$dir" php artisan config:clear --ansi
  run_in_dir "$label | Pest" "$dir" php artisan test
}

run_node_suite() {
  local label="$1"
  local dir="$2"

  run_in_dir "$label | TypeScript" "$dir" npm run typecheck
  run_in_dir "$label | Lint and security gates" "$dir" npm run lint
  run_in_dir "$label | Unit tests" "$dir" npm run test
  run_in_dir "$label | Production build" "$dir" npm run build
}

run_laravel_suite "sso-backend" "$SSO_BACKEND_DIR"
run_laravel_suite "app-b-laravel" "$APP_B_DIR"

run_node_suite "sso-frontend" "$SSO_FRONTEND_DIR"
run_in_dir "sso-frontend | Built server smoke" "$SSO_FRONTEND_DIR" npm run smoke

run_node_suite "sso-admin-vue" "$SSO_ADMIN_VUE_DIR"
run_node_suite "zitadel-login-vue" "$ZITADEL_LOGIN_VUE_DIR"
run_in_dir "zitadel-login-vue | Built server smoke" "$ZITADEL_LOGIN_VUE_DIR" npm run smoke

run_node_suite "app-a-next" "$APP_A_DIR"

run_section "Repository hygiene policy" "$ROOT_DIR/scripts/validate-repository-hygiene.sh"

if [[ "${RUN_E2E:-0}" == "1" ]]; then
  run_in_dir "sso-admin-vue | Playwright E2E" "$SSO_ADMIN_VUE_DIR" npm run test:e2e
  run_in_dir "app-a-next | Proxy-chain E2E" "$APP_A_DIR" npm run test:e2e:proxy-chain
  run_in_dir "app-a-next | SLO fanout E2E" "$APP_A_DIR" npm run test:e2e:slo
fi

run_section "DevOps lifecycle policy" "$ROOT_DIR/scripts/validate-devops-lifecycle.sh"
run_section "Laravel Vue lifecycle policy" "$ROOT_DIR/scripts/validate-laravel-vue-lifecycle.sh"
run_section "SSO frontend Vue lifecycle policy" "$ROOT_DIR/scripts/validate-sso-frontend-vue-lifecycle.sh"
run_section "ZITADEL login Vue lifecycle policy" "$ROOT_DIR/scripts/validate-zitadel-login-vue-lifecycle.sh"
run_section "Whitespace diff guard" git -C "$ROOT_DIR" diff --check

run_section "All QA gates passed" printf 'Whole-source TDD verification completed successfully.\n'
