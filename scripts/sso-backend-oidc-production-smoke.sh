#!/usr/bin/env bash

set -Eeuo pipefail

PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-https://api-sso.timeh.my.id}"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-20}"
OIDC_CLIENT_ID="${OIDC_CLIENT_ID:-app-a}"
OIDC_REDIRECT_URI="${OIDC_REDIRECT_URI:-https://sso.timeh.my.id/app-a/auth/callback}"
STATE="${STATE:-oidcBackend-production-smoke-state}"
NONCE="${NONCE:-oidcBackend-production-smoke-nonce}"

log() {
  printf '[sso-backend-oidc-production-smoke] %s\n' "$*"
}

fail() {
  printf '[sso-backend-oidc-production-smoke][FAIL] %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'USAGE'
Usage:
  scripts/sso-backend-oidc-production-smoke.sh [options]

Options:
  --public-base-url URL  Public backend URL. Default: https://api-sso.timeh.my.id
  --client-id ID         Public OIDC client ID. Default: app-a
  --redirect-uri URI     Registered redirect URI. Default: https://sso.timeh.my.id/app-a/auth/callback
  --timeout SECONDS      Curl max time per request. Default: 20
  -h, --help             Show help

This smoke is secret-free. It validates OIDC Backend public OIDC protocol surfaces only.
It must not print bearer tokens, refresh tokens, cookies, or client secrets.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --public-base-url) PUBLIC_BASE_URL="${2:-}"; shift 2 ;;
    --client-id) OIDC_CLIENT_ID="${2:-}"; shift 2 ;;
    --redirect-uri) OIDC_REDIRECT_URI="${2:-}"; shift 2 ;;
    --timeout) TIMEOUT_SECONDS="${2:-20}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) fail "Unknown argument: $1" ;;
  esac
done

PUBLIC_BASE_URL="${PUBLIC_BASE_URL%/}"

[[ "$PUBLIC_BASE_URL" == https://* ]] || fail 'public backend URL must use HTTPS'
[[ "$OIDC_REDIRECT_URI" == https://* ]] || fail 'redirect URI must use HTTPS'
[[ -n "$OIDC_CLIENT_ID" ]] || fail 'client ID is required'

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

require_redirect_parameter() {
  local label="$1" url="$2" parameter="$3"
  local headers location
  headers="$(curl -ksSI --max-time "$TIMEOUT_SECONDS" "$url" || true)"
  location="$(awk 'BEGIN{IGNORECASE=1} /^location:/ {sub(/^[Ll]ocation:[[:space:]]*/, ""); print; exit}' <<<"$headers" | tr -d '\r')"

  [[ -n "$location" ]] || fail "$label did not return a redirect Location"
  grep -Eq "[?&]${parameter}=" <<<"$location" || fail "$label redirect missing ${parameter}"
  log "$label redirect includes ${parameter}"
}

discovery_json="$(fetch_body '/.well-known/openid-configuration')"
jwks_json="$(fetch_body '/.well-known/jwks.json')"

require_json_field 'discovery issuer' "$discovery_json" '"issuer"[[:space:]]*:[[:space:]]*"https:[\\/]+api-sso[.]timeh[.]my[.]id"'
require_json_field 'discovery authorization endpoint' "$discovery_json" '"authorization_endpoint"'
require_json_field 'discovery token endpoint' "$discovery_json" '"token_endpoint"'
require_json_field 'discovery revocation endpoint' "$discovery_json" '"revocation_endpoint"'
require_json_field 'discovery userinfo endpoint' "$discovery_json" '"userinfo_endpoint"'
require_json_field 'discovery jwks uri' "$discovery_json" '"jwks_uri"[[:space:]]*:[[:space:]]*"https:[\\/]+api-sso[.]timeh[.]my[.]id[\\/]+.well-known[\\/]+jwks[.]json"'
require_json_field 'jwks keys' "$jwks_json" '"keys"[[:space:]]*:[[:space:]]*\['

require_status 'token endpoint rejects GET' GET "$PUBLIC_BASE_URL/token" '^(405|404)$'
require_status 'revocation endpoint rejects GET' GET "$PUBLIC_BASE_URL/revocation" '^(405|404)$'
require_status 'userinfo without bearer is protected' GET "$PUBLIC_BASE_URL/userinfo" '^(401)$'

prompt_none_url="$PUBLIC_BASE_URL/authorize?response_type=code&client_id=$OIDC_CLIENT_ID&redirect_uri=$OIDC_REDIRECT_URI&scope=openid%20profile&state=$STATE&nonce=$NONCE&prompt=none"
invalid_prompt_url="$PUBLIC_BASE_URL/authorize?response_type=code&client_id=$OIDC_CLIENT_ID&redirect_uri=$OIDC_REDIRECT_URI&scope=openid&state=$STATE&nonce=$NONCE&prompt=unsupported"

require_redirect_parameter 'authorize prompt=none' "$prompt_none_url" 'error=login_required'
require_redirect_parameter 'authorize invalid prompt' "$invalid_prompt_url" 'error=invalid_request'

log 'OIDC Backend production smoke completed successfully without secrets or tokens'
