#!/usr/bin/env bash

set -Eeuo pipefail

PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-https://api-sso.timeh.my.id}"
FRONTEND_BASE_URL="${FRONTEND_BASE_URL:-https://sso.timeh.my.id}"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-20}"
REQUIRE_FRONTEND="${REQUIRE_FRONTEND:-false}"

log() {
  printf '[sso-backend-public-smoke] %s\n' "$*"
}

fail() {
  printf '[sso-backend-public-smoke][FAIL] %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'USAGE'
Usage:
  scripts/sso-backend-public-smoke.sh [options]

Options:
  --public-base-url URL    Public backend URL. Default: https://api-sso.timeh.my.id
  --frontend-base-url URL  Public frontend URL. Default: https://sso.timeh.my.id
  --timeout SECONDS        Curl max time per request. Default: 20
  --require-frontend       Also require frontend URL to return 2xx/3xx
  -h, --help               Show help
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --public-base-url) PUBLIC_BASE_URL="${2:-}"; shift 2 ;;
    --frontend-base-url) FRONTEND_BASE_URL="${2:-}"; shift 2 ;;
    --timeout) TIMEOUT_SECONDS="${2:-20}"; shift 2 ;;
    --require-frontend) REQUIRE_FRONTEND="true"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) fail "Unknown argument: $1" ;;
  esac
done

PUBLIC_BASE_URL="${PUBLIC_BASE_URL%/}"
FRONTEND_BASE_URL="${FRONTEND_BASE_URL%/}"

[[ "$PUBLIC_BASE_URL" == https://* ]] || fail 'public backend URL must use HTTPS'
[[ "$FRONTEND_BASE_URL" == https://* ]] || fail 'frontend URL must use HTTPS'

fetch_body() {
  local path="$1"
  curl -fsS --max-time "$TIMEOUT_SECONDS" "$PUBLIC_BASE_URL$path"
}

status_code() {
  local url="$1"
  curl -ksS -o /dev/null -w '%{http_code}' --max-time "$TIMEOUT_SECONDS" "$url" || true
}

require_status() {
  local label="$1" url="$2" expected="$3" code
  code="$(status_code "$url")"
  [[ "$code" =~ $expected ]] || fail "$label returned ${code:-000} for $url"
  log "$label OK ($code): $url"
}

require_header() {
  local label="$1" path="$2" header_pattern="$3" headers
  headers="$(curl -ksSI --max-time "$TIMEOUT_SECONDS" "$PUBLIC_BASE_URL$path" || true)"
  grep -Eiq "$header_pattern" <<<"$headers" || fail "$label missing expected header pattern: $header_pattern"
  log "$label header OK: $header_pattern"
}

require_json_field() {
  local label="$1" json="$2" pattern="$3"
  grep -Eq "$pattern" <<<"$json" || fail "$label missing pattern: $pattern"
  log "$label JSON contract OK: $pattern"
}

require_status 'public /up' "$PUBLIC_BASE_URL/up" '^(200)$'
require_status 'public /health' "$PUBLIC_BASE_URL/health" '^(200)$'
require_status 'public /ready' "$PUBLIC_BASE_URL/ready" '^(200)$'
require_status 'public discovery' "$PUBLIC_BASE_URL/.well-known/openid-configuration" '^(200)$'
require_status 'public jwks' "$PUBLIC_BASE_URL/.well-known/jwks.json" '^(200)$'
require_status 'public /jwks alias' "$PUBLIC_BASE_URL/jwks" '^(200)$'

require_header 'discovery cache' '/.well-known/openid-configuration' 'cache-control:.*(public|max-age)'
require_header 'jwks cache' '/.well-known/jwks.json' 'cache-control:.*(public|max-age)'

discovery_json="$(fetch_body '/.well-known/openid-configuration')"
jwks_json="$(fetch_body '/.well-known/jwks.json')"

require_json_field 'discovery issuer' "$discovery_json" '"issuer"[[:space:]]*:[[:space:]]*"https:[\\/]+api-sso[.]timeh[.]my[.]id"'
require_json_field 'discovery jwks_uri' "$discovery_json" '"jwks_uri"[[:space:]]*:[[:space:]]*"https:[\\/]+api-sso[.]timeh[.]my[.]id[\\/]+.well-known[\\/]+jwks[.]json"'
require_json_field 'discovery authorization endpoint' "$discovery_json" '"authorization_endpoint"'
require_json_field 'discovery token endpoint' "$discovery_json" '"token_endpoint"'
require_json_field 'jwks keys' "$jwks_json" '"keys"[[:space:]]*:[[:space:]]*\['

if [[ "$REQUIRE_FRONTEND" == "true" ]]; then
  require_status 'frontend root' "$FRONTEND_BASE_URL/" '^(2|3)[0-9]{2}$'
else
  log "frontend root optional; skipping hard requirement for $FRONTEND_BASE_URL"
fi

log 'Public-domain SSO backend smoke completed successfully'
