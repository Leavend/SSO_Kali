#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP_DIR="$ROOT_DIR/apps/app-a-next"

require_env() {
  local name="$1"

  if [[ -z "${!name:-}" ]]; then
    printf '[run-oidc-proxy-chain-e2e][ERROR] Missing required env: %s\n' "$name" >&2
    exit 1
  fi
}

require_env "PLAYWRIGHT_PROXY_APP_A_BASE_URL"
require_env "PLAYWRIGHT_PROXY_BROKER_BASE_URL"
require_env "PLAYWRIGHT_PROXY_IDP_BASE_URL"
require_env "PLAYWRIGHT_SSO_USERNAME"
require_env "PLAYWRIGHT_SSO_PASSWORD"

BASE_URL="$PLAYWRIGHT_PROXY_BROKER_BASE_URL" \
IDP_URL="$PLAYWRIGHT_PROXY_IDP_BASE_URL" \
CALLBACK_URL="$PLAYWRIGHT_PROXY_APP_A_BASE_URL/auth/callback" \
CLIENT_ID="${PLAYWRIGHT_PROXY_CLIENT_ID:-prototype-app-a}" \
  bash "$ROOT_DIR/infra/sre/probe-forwarded-auth-chain.sh"

(
  cd "$APP_DIR"
  npm run test:e2e:proxy-chain
)
