#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FAILURES=0

pass() {
  printf '[identity-resource-policy][PASS] %s\n' "$*"
}

fail() {
  FAILURES=$((FAILURES + 1))
  printf '[identity-resource-policy][FAIL] %s\n' "$*" >&2
}

require_text() {
  local file="$1" pattern="$2" label="$3"
  if grep -Eq -- "$pattern" "$ROOT_DIR/$file"; then
    pass "$label"
  else
    fail "$label"
  fi
}

require_service_budget() {
  local file="$1" service="$2" budget="$3" label="$4"
  if awk -v service="  ${service}:" -v budget="<<: *${budget}" '
    $0 == service { in_service = 1; next }
    in_service && /^  [[:alnum:]_-]+:/ { in_service = 0 }
    in_service && index($0, budget) { found = 1 }
    END { exit(found ? 0 : 1) }
  ' "$ROOT_DIR/$file"; then
    pass "$label"
  else
    fail "$label"
  fi
}

require_identity_priority() {
  local file="$1" anchor="$2" shares="$3" label="$4"
  if awk -v anchor="^${anchor}:" -v shares="cpu_shares: ${shares}$" '
    $0 ~ anchor { in_anchor = 1; next }
    in_anchor && /^x-[[:alnum:]_-]+:/ { in_anchor = 0 }
    in_anchor && $0 ~ shares { found = 1 }
    END { exit(found ? 0 : 1) }
  ' "$ROOT_DIR/$file"; then
    pass "$label"
  else
    fail "$label"
  fi
}

require_text "docker-compose.dev.yml" '^x-demo-web-limits:' "Dev Compose declares demo web resource budget"
require_text "docker-compose.dev.yml" '^x-demo-php-limits:' "Dev Compose declares demo PHP resource budget"
require_text "docker-compose.dev.yml" '^x-redis-limits:' "Dev Compose declares Redis identity support budget"
require_identity_priority "docker-compose.dev.yml" "x-zitadel-limits" "2048" "Dev Compose prioritizes ZITADEL CPU under contention"
require_identity_priority "docker-compose.dev.yml" "x-postgres-limits" "2048" "Dev Compose prioritizes PostgreSQL CPU under contention"
require_identity_priority "docker-compose.dev.yml" "x-redis-limits" "1536" "Dev Compose prioritizes Redis CPU under contention"
require_identity_priority "docker-compose.dev.yml" "x-auth-web-limits" "1536" "Dev Compose prioritizes identity login web CPU under contention"
require_service_budget "docker-compose.dev.yml" "redis" "redis-limits" "Dev Compose applies Redis identity support budget"
require_service_budget "docker-compose.dev.yml" "zitadel-api" "zitadel-limits" "Dev Compose applies ZITADEL budget"
require_service_budget "docker-compose.dev.yml" "zitadel-login" "auth-web-limits" "Dev Compose applies hosted login budget"
require_service_budget "docker-compose.dev.yml" "zitadel-login-vue" "auth-web-limits" "Dev Compose applies Vue login budget"
require_service_budget "docker-compose.dev.yml" "app-a-next" "demo-web-limits" "Dev Compose constrains App A demo workload"
require_service_budget "docker-compose.dev.yml" "app-b-laravel" "demo-php-limits" "Dev Compose constrains App B demo workload"

require_text "docker-compose.prod.yml" '^x-runtime-demo-web-budget:' "Prod overlay declares demo web resource budget"
require_text "docker-compose.prod.yml" '^x-runtime-demo-php-budget:' "Prod overlay declares demo PHP resource budget"
require_identity_priority "docker-compose.prod.yml" "x-runtime-zitadel-budget" "2048" "Prod overlay prioritizes ZITADEL CPU under contention"
require_identity_priority "docker-compose.prod.yml" "x-runtime-postgres-budget" "2048" "Prod overlay prioritizes PostgreSQL CPU under contention"
require_identity_priority "docker-compose.prod.yml" "x-runtime-redis-budget" "1536" "Prod overlay prioritizes Redis CPU under contention"
require_identity_priority "docker-compose.prod.yml" "x-runtime-login-budget" "1536" "Prod overlay prioritizes identity login CPU under contention"
require_service_budget "docker-compose.prod.yml" "app-a-next" "runtime-demo-web-budget" "Prod overlay constrains App A demo workload"
require_service_budget "docker-compose.prod.yml" "app-b-laravel" "runtime-demo-php-budget" "Prod overlay constrains App B demo workload"

printf '[identity-resource-policy] Completed with %d failure(s)\n' "$FAILURES"

if (( FAILURES > 0 )); then
  exit 1
fi
