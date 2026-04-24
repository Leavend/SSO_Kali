#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REPORT_DIR="${REPORT_DIR:-$ROOT_DIR/test-results/backchannel-logout-gate}"
FIXTURE_DIR="$REPORT_DIR/logout-token-fixtures"
GENERATOR_LOG="$REPORT_DIR/logout-token-generator.txt"
BROKER_LOG="$REPORT_DIR/sso-backend-backchannel-logout.txt"
APP_B_LOG="$REPORT_DIR/app-b-backchannel-logout.txt"
APP_A_LOG="$REPORT_DIR/app-a-backchannel-logout.txt"

mkdir -p "$REPORT_DIR"

run_fixture_generator() {
  php "$ROOT_DIR/tools/qa/generate-logout-token-fixtures.php" "$FIXTURE_DIR" | tee "$GENERATOR_LOG"
}

run_broker_tests() {
  (
    cd "$ROOT_DIR/services/sso-backend"
    php artisan test \
      tests/Unit/Oidc/LogoutTokenServiceTest.php \
      tests/Feature/Oidc/BackChannelLogoutTest.php
  ) | tee "$BROKER_LOG"
}

run_app_b_tests() {
  (
    cd "$ROOT_DIR/apps/app-b-laravel"
    php artisan test \
      tests/Unit/Sso/LogoutTokenVerifierTest.php \
      tests/Unit/Sso/LogoutTokenReplayStoreTest.php \
      tests/Feature/Auth/BackChannelLogoutValidationTest.php \
      tests/Feature/Auth/PruneLogoutTokenReplaysCommandTest.php \
      tests/Feature/Architecture/LogoutTokenReplaySchemaContractTest.php
  ) | tee "$APP_B_LOG"
}

run_app_a_tests() {
  (
    cd "$ROOT_DIR/apps/app-a-next"
    npm run test -- \
      src/lib/logout-token.test.ts \
      src/lib/logout-replay-store.test.ts \
      src/app/api/backchannel/logout/route.test.ts
  ) | tee "$APP_A_LOG"
}

run_fixture_generator
run_broker_tests
run_app_b_tests
run_app_a_tests
