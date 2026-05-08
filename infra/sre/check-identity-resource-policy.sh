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

require_service_resource() {
  local file="$1" service="$2" pattern="$3" label="$4"
  if awk -v service="  ${service}:" -v pattern="$pattern" '
    $0 == service { in_service = 1; next }
    in_service && /^  [[:alnum:]_-]+:/ { in_service = 0 }
    in_service && $0 ~ pattern { found = 1 }
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

require_text "docker-compose.dev.yml" '^x-redis-limits:' "Dev Compose declares Redis identity support budget"
require_identity_priority "docker-compose.dev.yml" "x-postgres-limits" "2048" "Dev Compose prioritizes PostgreSQL CPU under contention"
require_identity_priority "docker-compose.dev.yml" "x-redis-limits" "1536" "Dev Compose prioritizes Redis CPU under contention"
require_service_budget "docker-compose.dev.yml" "redis" "redis-limits" "Dev Compose applies Redis identity support budget"

require_text "docker-compose.main.yml" '^name: .*sso-backend-prod.*$' "Production backend compose uses isolated project name"
require_service_resource "docker-compose.main.yml" "sso-backend" 'mem_limit: 768m' "Production backend constrains API memory"
require_service_resource "docker-compose.main.yml" "sso-backend" 'cpus: "0\\.75"' "Production backend constrains API CPU"
require_service_resource "docker-compose.main.yml" "postgres" 'mem_limit: 1024m' "Production backend constrains PostgreSQL memory"
require_service_resource "docker-compose.main.yml" "postgres" 'cpus: "1\\.00"' "Production backend prioritizes PostgreSQL CPU"
require_service_resource "docker-compose.main.yml" "redis" 'mem_limit: 256m' "Production backend constrains Redis memory"
require_service_resource "docker-compose.main.yml" "redis" 'cpus: "0\\.25"' "Production backend constrains Redis CPU"

printf '[identity-resource-policy] Completed with %d failure(s)\n' "$FAILURES"

if (( FAILURES > 0 )); then
  exit 1
fi
