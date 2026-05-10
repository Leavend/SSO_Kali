#!/usr/bin/env bash
set -euo pipefail

PUBLIC_BASE_URL="https://api-sso.timeh.my.id"
FRONTEND_LOGIN_URL="https://sso.timeh.my.id/login"
CLIENT_ID="app-a"
REDIRECT_URI="https://sso.timeh.my.id/app-a/auth/callback"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --public-base-url)
      PUBLIC_BASE_URL="${2:?missing --public-base-url value}"
      shift 2
      ;;
    --frontend-login-url)
      FRONTEND_LOGIN_URL="${2:?missing --frontend-login-url value}"
      shift 2
      ;;
    --client-id)
      CLIENT_ID="${2:?missing --client-id value}"
      shift 2
      ;;
    --redirect-uri)
      REDIRECT_URI="${2:?missing --redirect-uri value}"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 64
      ;;
  esac
done

assert_no_secret_like_output() {
  local payload="$1"

  if printf '%s' "$payload" | grep -Eiq '(client_secret|access_token|refresh_token|id_token|code_verifier|password)'; then
    echo "Secret-like output detected in FR-007 production smoke" >&2
    exit 70
  fi
}

http_status() {
  local url="$1"
  curl -sS -o /tmp/fr007-smoke-body.txt -w '%{http_code}' "$url"
}

echo "[FR-007] Smoke public liveness endpoints"
for path in /up /health /ready; do
  status="$(http_status "${PUBLIC_BASE_URL}${path}")"
  body="$(cat /tmp/fr007-smoke-body.txt)"
  assert_no_secret_like_output "$body"
  if [[ "$status" -lt 200 || "$status" -ge 500 ]]; then
    echo "Unexpected status ${status} for ${path}" >&2
    exit 65
  fi
done

echo "[FR-007] prompt=none login_required keeps OIDC client redirect while recording error_ref"
authorize_url="${PUBLIC_BASE_URL}/authorize?$(python3 - <<PY
from urllib.parse import urlencode
print(urlencode({
  'response_type': 'code',
  'client_id': '${CLIENT_ID}',
  'redirect_uri': '${REDIRECT_URI}',
  'scope': 'openid profile',
  'state': 'fr007-smoke-state',
  'nonce': 'fr007-smoke-nonce',
  'code_challenge': 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'code_challenge_method': 'S256',
  'prompt': 'none',
}))
PY
)"
headers="$(curl -sS -D - -o /tmp/fr007-smoke-body.txt -L --max-redirs 0 "$authorize_url" || true)"
location="$(printf '%s' "$headers" | awk 'tolower($1)=="location:" {sub(/\r$/, "", $2); print $2}' | tail -n 1)"
assert_no_secret_like_output "$headers$(cat /tmp/fr007-smoke-body.txt)"
if [[ "$location" != "${REDIRECT_URI}"* || "$location" != *"error=login_required"* || "$location" != *"state=fr007-smoke-state"* ]]; then
  echo "OIDC prompt=none client redirect contract failed: ${location}" >&2
  exit 66
fi

echo "[FR-007] token invalid_grant keeps OAuth JSON error contract"
token_body="$(curl -sS -X POST "${PUBLIC_BASE_URL}/token" \
  -H 'Content-Type: application/json' \
  -d "{\"grant_type\":\"authorization_code\",\"client_id\":\"${CLIENT_ID}\",\"redirect_uri\":\"${REDIRECT_URI}\",\"code\":\"fr007-expired-code\",\"code_verifier\":\"fr007-verifier\"}")"
assert_no_secret_like_output "$token_body"
if [[ "$token_body" != *'"error":"invalid_grant"'* ]]; then
  echo "Token endpoint did not return invalid_grant JSON" >&2
  echo "$token_body" >&2
  exit 67
fi

echo "[FR-007] admin SSO error templates API requires auth"
admin_status="$(http_status "${PUBLIC_BASE_URL}/admin/api/sso-error-templates")"
admin_body="$(cat /tmp/fr007-smoke-body.txt)"
assert_no_secret_like_output "$admin_body"
if [[ "$admin_status" != "401" && "$admin_status" != "403" ]]; then
  echo "Admin template endpoint should require auth, got ${admin_status}" >&2
  exit 68
fi

echo "FR-007 SSO error production smoke completed successfully without secrets or tokens"
