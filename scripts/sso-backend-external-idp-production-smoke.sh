#!/usr/bin/env bash

set -Eeuo pipefail

PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-https://api-sso.timeh.my.id}"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-20}"
REQUIRE_CONFIGURED_PROVIDER="${REQUIRE_CONFIGURED_PROVIDER:-false}"

log() {
  printf '[sso-backend-external-idp-production-smoke] %s\n' "$*"
}

fail() {
  printf '[sso-backend-external-idp-production-smoke][FAIL] %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'USAGE'
Usage:
  scripts/sso-backend-external-idp-production-smoke.sh [options]

Options:
  --public-base-url URL          Public backend URL. Default: https://api-sso.timeh.my.id
  --require-configured-provider  Fail when /ready reports no enabled external IdP provider.
  --timeout SECONDS              Curl max time per request. Default: 20
  -h, --help                     Show help

This smoke is secret-free. It validates FR-005 External IdP production readiness
surfaces only and must not print bearer tokens, refresh tokens, cookies, or client
secrets.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --public-base-url) PUBLIC_BASE_URL="${2:-}"; shift 2 ;;
    --require-configured-provider) REQUIRE_CONFIGURED_PROVIDER="true"; shift ;;
    --timeout) TIMEOUT_SECONDS="${2:-20}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) fail "Unknown argument: $1" ;;
  esac
done

PUBLIC_BASE_URL="${PUBLIC_BASE_URL%/}"

[[ "$PUBLIC_BASE_URL" == https://* ]] || fail 'public backend URL must use HTTPS'

fetch_body() {
  local path="$1"
  curl -fsS --max-time "$TIMEOUT_SECONDS" "$PUBLIC_BASE_URL$path"
}

status_code() {
  local method="$1" path="$2"
  curl -ksS -X "$method" -o /dev/null -w '%{http_code}' --max-time "$TIMEOUT_SECONDS" "$PUBLIC_BASE_URL$path" || true
}

require_json_field() {
  local label="$1" json="$2" pattern="$3"
  grep -Eq "$pattern" <<<"$json" || fail "$label missing pattern: $pattern"
  log "$label contract OK: $pattern"
}

require_status() {
  local label="$1" method="$2" path="$3" expected="$4" code
  code="$(status_code "$method" "$path")"
  [[ "$code" =~ $expected ]] || fail "$label returned ${code:-000}; expected $expected"
  log "$label OK ($code)"
}

root_json="$(fetch_body '/')"
ready_json="$(fetch_body '/ready')"
discovery_json="$(fetch_body '/.well-known/openid-configuration')"
jwks_json="$(fetch_body '/.well-known/jwks.json')"
legacy_jwks_json="$(fetch_body '/jwks')"

require_json_field 'root service' "$root_json" '"service"[[:space:]]*:[[:space:]]*"sso-backend"'
require_json_field 'root issuer' "$root_json" '"issuer"[[:space:]]*:[[:space:]]*"https:[\\/]+api-sso[.]timeh[.]my[.]id"'
if grep -Eq '"external_idps"[[:space:]]*:' <<<"$ready_json"; then
  require_json_field 'ready external idps section' "$ready_json" '"external_idps"[[:space:]]*:'
  require_json_field 'ready external idps required flag' "$ready_json" '"required_ready"[[:space:]]*:[[:space:]]*(true|false)'
  require_json_field 'ready external idps provider list' "$ready_json" '"providers"[[:space:]]*:[[:space:]]*\['
else
  [[ "$REQUIRE_CONFIGURED_PROVIDER" == "false" ]] || fail 'ready external_idps section is required when --require-configured-provider is set'
  log 'ready external_idps section absent; production readiness snapshot is disabled and optional for this smoke'
fi
require_json_field 'discovery issuer' "$discovery_json" '"issuer"[[:space:]]*:[[:space:]]*"https:[\\/]+api-sso[.]timeh[.]my[.]id"'
require_json_field 'discovery jwks uri' "$discovery_json" '"jwks_uri"[[:space:]]*:[[:space:]]*"https:[\\/]+api-sso[.]timeh[.]my[.]id[\\/]+.well-known[\\/]+jwks[.]json"'
require_json_field 'jwks keys' "$jwks_json" '"keys"[[:space:]]*:[[:space:]]*\['
require_json_field 'legacy jwks keys' "$legacy_jwks_json" '"keys"[[:space:]]*:[[:space:]]*\['

require_status 'admin external idp registry is not anonymously public' GET '/admin/external-idps' '^(302|401|403|404)$'
require_status 'token endpoint rejects GET' GET '/token' '^(405|404)$'

if [[ "$REQUIRE_CONFIGURED_PROVIDER" == "true" ]]; then
  require_json_field 'ready has at least one external idp provider' "$ready_json" '"total_enabled"[[:space:]]*:[[:space:]]*[1-9][0-9]*'
  require_json_field 'ready has any external idp ready' "$ready_json" '"any_ready"[[:space:]]*:[[:space:]]*true'
else
  log 'configured external IdP provider is optional for this smoke; readiness schema was validated'
fi

case "$root_json$ready_json$jwks_json$legacy_jwks_json" in
  *client_secret*|*access_token*|*refresh_token*|*code_verifier*)
    fail 'production smoke response leaked secret or token material'
    ;;
esac

grep -Eq '"id_token"[[:space:]]*:[[:space:]]*"[^"[:space:]]+' <<<"$root_json$ready_json$jwks_json$legacy_jwks_json" \
  && fail 'production smoke response leaked id_token material'

log 'External IdP production smoke completed successfully without secrets or tokens'
