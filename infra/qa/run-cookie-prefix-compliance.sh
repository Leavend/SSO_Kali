#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ASSERT_SCRIPT="$ROOT_DIR/tools/qa/assert-host-cookie-header.mjs"
REPORT_DIR="${REPORT_DIR:-$ROOT_DIR/test-results/cookie-prefix-compliance}"

require_env() {
  local name="$1"

  if [[ -z "${!name:-}" ]]; then
    printf '[run-cookie-prefix-compliance][ERROR] Missing required env: %s\n' "$name" >&2
    exit 1
  fi
}

require_env "COOKIE_COMPLIANCE_BROKER_BASE_URL"
require_env "COOKIE_COMPLIANCE_APP_A_BASE_URL"
require_env "COOKIE_COMPLIANCE_ADMIN_BASE_URL"

broker_authorize_url="${COOKIE_COMPLIANCE_BROKER_BASE_URL}/authorize?client_id=${COOKIE_COMPLIANCE_CLIENT_ID:-prototype-app-a}&redirect_uri=${COOKIE_COMPLIANCE_APP_A_BASE_URL}/auth/callback&response_type=code&scope=openid%20profile%20email&state=cookie-check-state&nonce=cookie-check-nonce&code_challenge=cookie-check-challenge&code_challenge_method=S256"
app_a_probe_url="${COOKIE_COMPLIANCE_APP_A_BASE_URL}/api/e2e/cookie-policy"
admin_probe_url="${COOKIE_COMPLIANCE_ADMIN_BASE_URL}/api/e2e/cookie-policy"

node "$ASSERT_SCRIPT" \
  --url "$broker_authorize_url" \
  --cookie-name "__Host-broker_session" \
  --report-file "$REPORT_DIR/broker-session.json"

node "$ASSERT_SCRIPT" \
  --url "$app_a_probe_url" \
  --cookie-name "__Host-app-a-session" \
  --report-file "$REPORT_DIR/app-a-session.json"

node "$ASSERT_SCRIPT" \
  --url "$app_a_probe_url" \
  --method DELETE \
  --cookie-name "__Host-app-a-session" \
  --expect-expired \
  --report-file "$REPORT_DIR/app-a-session-expired.json"

node "$ASSERT_SCRIPT" \
  --url "$admin_probe_url" \
  --cookie-name "__Host-admin-session" \
  --report-file "$REPORT_DIR/admin-session.json"

node "$ASSERT_SCRIPT" \
  --url "$admin_probe_url" \
  --cookie-name "__Host-admin-tx" \
  --report-file "$REPORT_DIR/admin-transaction.json"

node "$ASSERT_SCRIPT" \
  --url "$admin_probe_url" \
  --method DELETE \
  --cookie-name "__Host-admin-session" \
  --expect-expired \
  --report-file "$REPORT_DIR/admin-session-expired.json"

node "$ASSERT_SCRIPT" \
  --url "$admin_probe_url" \
  --method DELETE \
  --cookie-name "__Host-admin-tx" \
  --expect-expired \
  --report-file "$REPORT_DIR/admin-transaction-expired.json"
