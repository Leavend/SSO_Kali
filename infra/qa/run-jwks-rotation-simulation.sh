#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PORT="${MOCK_JWKS_PORT:-43181}"
BASE_URL="http://127.0.0.1:${PORT}"
REPORT_DIR="${REPORT_DIR:-$ROOT_DIR/test-results/jwks-rotation-simulation}"
SERVER_LOG="$REPORT_DIR/mock-jwks-server.log"
STATE_FILE="$REPORT_DIR/mock-jwks-state.json"
BROKER_LOG="$REPORT_DIR/sso-backend-jwks-rotation.txt"
APP_B_LOG="$REPORT_DIR/app-b-jwks-rotation.txt"

mkdir -p "$REPORT_DIR"

start_server() {
  node "$ROOT_DIR/tools/qa/mock-jwks-rotation-server.mjs" >"$SERVER_LOG" 2>&1 &
  SERVER_PID=$!
}

wait_for_server() {
  for _ in {1..30}; do
    if curl -fsS "$BASE_URL/health" >/dev/null 2>&1; then
      return
    fi

    sleep 1
  done

  printf '[run-jwks-rotation-simulation][ERROR] Mock JWKS server failed to start\n' >&2
  exit 1
}

capture_state() {
  curl -fsS "$BASE_URL/state" >"$STATE_FILE" || true
}

run_broker_tests() {
  (
    cd "$ROOT_DIR/services/sso-backend"
    JWKS_ROTATION_MOCK_BASE_URL="$BASE_URL" \
      php artisan test tests/Feature/Oidc/JwksRotationHarnessTest.php
  ) | tee "$BROKER_LOG"
}

run_app_b_tests() {
  (
    cd "$ROOT_DIR/apps/app-b-laravel"
    JWKS_ROTATION_MOCK_BASE_URL="$BASE_URL" \
      php artisan test tests/Feature/Sso/JwksRotationHarnessTest.php
  ) | tee "$APP_B_LOG"
}

cleanup() {
  capture_state

  if [[ -n "${SERVER_PID:-}" ]]; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT

start_server
wait_for_server
run_broker_tests
run_app_b_tests
