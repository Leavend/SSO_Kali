#!/usr/bin/env bash

set -Eeuo pipefail

PUBLIC_BASE_URL="${SSO_PUBLIC_BASE_URL:-https://api-sso.timeh.my.id}"
CLIENT_ID="${SSO_LOAD_TEST_CLIENT_ID:-sso-load-test-client}"
CLIENT_SECRET="${SSO_LOAD_TEST_CLIENT_SECRET:-}"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-20}"
RUN_INVALID_SECRET_CHECK="${RUN_INVALID_SECRET_CHECK:-true}"

log() {
  printf '[sso-backend-oauth-token-smoke] %s\n' "$*"
}

fail() {
  printf '[sso-backend-oauth-token-smoke][FAIL] %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'USAGE'
Usage:
  SSO_LOAD_TEST_CLIENT_SECRET='runtime-secret' scripts/sso-backend-oauth-token-smoke.sh [options]

Options:
  --public-base-url URL       Public backend URL. Default: https://api-sso.timeh.my.id
  --client-id CLIENT_ID       Client ID. Default: sso-load-test-client
  --timeout SECONDS           Curl max time per request. Default: 20
  --skip-invalid-secret-check Skip negative invalid-secret smoke
  -h, --help                  Show help

Required environment:
  SSO_LOAD_TEST_CLIENT_SECRET Runtime-only plaintext secret. Never commit it.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --public-base-url) PUBLIC_BASE_URL="${2:-}"; shift 2 ;;
    --client-id) CLIENT_ID="${2:-}"; shift 2 ;;
    --timeout) TIMEOUT_SECONDS="${2:-20}"; shift 2 ;;
    --skip-invalid-secret-check) RUN_INVALID_SECRET_CHECK="false"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) fail "Unknown argument: $1" ;;
  esac
done

PUBLIC_BASE_URL="${PUBLIC_BASE_URL%/}"
TOKEN_ENDPOINT="$PUBLIC_BASE_URL/oauth/token"

[[ "$PUBLIC_BASE_URL" == https://* ]] || fail 'public backend URL must use HTTPS'
[[ -n "$CLIENT_ID" ]] || fail 'client ID is required'
[[ -n "$CLIENT_SECRET" ]] || fail 'SSO_LOAD_TEST_CLIENT_SECRET is required as runtime-only env'
command -v python3 >/dev/null 2>&1 || fail 'python3 is required for JSON validation'

response_file="$(mktemp)"
invalid_response_file="$(mktemp)"
trap 'rm -f "$response_file" "$invalid_response_file"' EXIT

request_token() {
  local secret="$1" output_file="$2"
  curl -ksS \
    --max-time "$TIMEOUT_SECONDS" \
    -o "$output_file" \
    -w '%{http_code}' \
    -X POST "$TOKEN_ENDPOINT" \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    --data-urlencode 'grant_type=client_credentials' \
    --data-urlencode "client_id=${CLIENT_ID}" \
    --data-urlencode "client_secret=${secret}" || true
}

validate_success_response() {
  python3 - "$response_file" <<'PY'
import json
import sys

with open(sys.argv[1], 'r', encoding='utf-8') as handle:
    payload = json.load(handle)

assert isinstance(payload.get('access_token'), str) and payload['access_token'], 'access_token missing'
assert payload.get('token_type') == 'Bearer', 'token_type must be Bearer'
assert isinstance(payload.get('expires_in'), int) and payload['expires_in'] > 0, 'expires_in missing'
assert 'refresh_token' not in payload, 'client_credentials must not issue refresh_token'
PY
}

validate_invalid_secret_response() {
  python3 - "$invalid_response_file" <<'PY'
import json
import sys

with open(sys.argv[1], 'r', encoding='utf-8') as handle:
    payload = json.load(handle)

error = payload.get('error')
assert error in {'invalid_client', 'invalid_grant', 'invalid_request'}, f'unexpected error: {error}'
PY
}

log "Requesting client_credentials token from $TOKEN_ENDPOINT for client ${CLIENT_ID}"
status_code="$(request_token "$CLIENT_SECRET" "$response_file")"
[[ "$status_code" == '200' ]] || fail "token endpoint returned ${status_code:-000} for valid client_credentials request"
validate_success_response
log 'valid client_credentials token response OK: access_token present, Bearer token_type, expires_in present, no refresh_token'

if [[ "$RUN_INVALID_SECRET_CHECK" == 'true' ]]; then
  invalid_status_code="$(request_token '__intentionally-invalid-secret__' "$invalid_response_file")"
  [[ "$invalid_status_code" =~ ^(400|401)$ ]] || fail "invalid secret returned ${invalid_status_code:-000}; expected 400 or 401"
  validate_invalid_secret_response
  log 'invalid client secret rejected as expected'
fi

log 'OAuth token-flow smoke completed successfully without printing secrets or tokens'
