#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REPORT_DIR="${REPORT_DIR:-$ROOT_DIR/test-results/argon2id-secret-policy}"
SCAN_REPORT="$REPORT_DIR/argon2id-secret-policy-report.json"
SCAN_LOG="$REPORT_DIR/argon2id-secret-policy-scan.txt"
TEST_LOG="$REPORT_DIR/sso-backend-secret-policy-tests.txt"
COMMAND_LOG="$REPORT_DIR/sso-backend-secret-policy-command.txt"

mkdir -p "$REPORT_DIR"

run_scan() {
  php "$ROOT_DIR/tools/qa/check-argon2id-secret-policy.php" "$SCAN_REPORT" | tee "$SCAN_LOG"
}

run_tests() {
  (
    cd "$ROOT_DIR/services/sso-backend"
    php artisan test \
      tests/Unit/Security/ClientSecretHashPolicyTest.php \
      tests/Feature/Architecture/StoredClientSecretPolicyTest.php \
      tests/Feature/Architecture/StoredClientSecretPolicyCommandTest.php \
      tests/Feature/Architecture/Argon2idPolicyArtifactTest.php
  ) | tee "$TEST_LOG"
}

run_runtime_verification() {
  (
    cd "$ROOT_DIR/services/sso-backend"
    php artisan oidc:verify-client-secret-policy
  ) | tee "$COMMAND_LOG"
}

run_scan
run_tests
run_runtime_verification
