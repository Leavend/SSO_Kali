#!/usr/bin/env bash

set -Eeuo pipefail

PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-https://api-sso.timeh.my.id}"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-20}"

log() {
  printf '[sso-backend-authentication-audit-production-smoke] %s\n' "$*"
}

fail() {
  printf '[sso-backend-authentication-audit-production-smoke][FAIL] %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'USAGE'
Usage:
  scripts/sso-backend-authentication-audit-production-smoke.sh [options]

Options:
  --public-base-url URL  Public backend URL. Default: https://api-sso.timeh.my.id
  --timeout SECONDS      Curl max time per request. Default: 20
  -h, --help             Show help

This FR-006 smoke is secret-free. It validates public production readiness for
Authentication Audit dependencies without admin credentials, bearer tokens,
refresh tokens, cookies, client secrets, or database access.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --public-base-url) PUBLIC_BASE_URL="${2:-}"; shift 2 ;;
    --timeout) TIMEOUT_SECONDS="${2:-20}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) fail "Unknown argument: $1" ;;
  esac
done

PUBLIC_BASE_URL="${PUBLIC_BASE_URL%/}"

[[ "$PUBLIC_BASE_URL" == https://* ]] || fail 'public backend URL must use HTTPS'

status_code() {
  local method="$1" url="$2"
  curl -ksS -X "$method" -o /dev/null -w '%{http_code}' --max-time "$TIMEOUT_SECONDS" "$url" || true
}

fetch_body() {
  local path="$1"
  curl -fsS --max-time "$TIMEOUT_SECONDS" "$PUBLIC_BASE_URL$path"
}

require_status() {
  local label="$1" method="$2" url="$3" expected="$4" code
  code="$(status_code "$method" "$url")"
  [[ "$code" =~ $expected ]] || fail "$label returned ${code:-000}; expected $expected"
  log "$label OK ($code)"
}

require_json_field() {
  local label="$1" json="$2" pattern="$3"
  grep -Eq "$pattern" <<<"$json" || fail "$label missing pattern: $pattern"
  log "$label contract OK: $pattern"
}

assert_no_secret_like_output() {
  local label="$1" payload="$2"
  if grep -Eiq '(access_token|refresh_token|id_token|client_secret|authorization: bearer|set-cookie)' <<<"$payload"; then
    fail "$label leaked token-like or secret-like material"
  fi
  log "$label secret-free output OK"
}

health_json="$(fetch_body '/ready')"
discovery_json="$(fetch_body '/.well-known/openid-configuration')"
jwks_json="$(fetch_body '/.well-known/jwks.json')"

require_status 'liveness /up' GET "$PUBLIC_BASE_URL/up" '^200$'
require_status 'health /health' GET "$PUBLIC_BASE_URL/health" '^200$'
require_status 'readiness /ready' GET "$PUBLIC_BASE_URL/ready" '^200$'

require_json_field 'discovery issuer' "$discovery_json" '"issuer"[[:space:]]*:[[:space:]]*"https:[\\/]+api-sso[.]timeh[.]my[.]id"'
require_json_field 'discovery authorization endpoint' "$discovery_json" '"authorization_endpoint"'
require_json_field 'discovery token endpoint' "$discovery_json" '"token_endpoint"'
require_json_field 'discovery jwks uri' "$discovery_json" '"jwks_uri"[[:space:]]*:[[:space:]]*"https:[\\/]+api-sso[.]timeh[.]my[.]id[\\/]+.well-known[\\/]+jwks[.]json"'
require_json_field 'jwks keys' "$jwks_json" '"keys"[[:space:]]*:[[:space:]]*\['

require_status 'admin authentication audit API requires auth' GET "$PUBLIC_BASE_URL/admin/api/audit/authentication-events" '^(302|401|403)$'
require_status 'admin authentication audit detail API requires auth' GET "$PUBLIC_BASE_URL/admin/api/audit/authentication-events/01HXAUTHSMOKE000000000000" '^(302|401|403)$'

assert_no_secret_like_output 'readiness payload' "$health_json"
assert_no_secret_like_output 'discovery payload' "$discovery_json"
assert_no_secret_like_output 'jwks payload' "$jwks_json"

log 'Authentication Audit production smoke completed successfully without secrets or tokens'
