#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REPORT_DIR="${REPORT_DIR:-$ROOT_DIR/test-results/subject-id-contract-gate}"
BROKER_LOG="$REPORT_DIR/sso-backend-subject-id.txt"
APP_B_LOG="$REPORT_DIR/app-b-subject-id.txt"
STATIC_LOG="$REPORT_DIR/static-scan.txt"

mkdir -p "$REPORT_DIR"

run_static_scan() {
  if rg -n "subjectUuid|\\{subjectUuid\\}" \
    "$ROOT_DIR/services/sso-backend/routes" \
    "$ROOT_DIR/services/sso-backend/app/Http/Controllers/Admin" \
    "$ROOT_DIR/apps/app-b-laravel/routes" \
    "$ROOT_DIR/apps/app-b-laravel/app" \
    --glob '!vendor' >"$STATIC_LOG"; then
    printf '[subject-id-gate][ERROR] legacy subjectUuid naming detected\n' >&2
    cat "$STATIC_LOG" >&2
    exit 1
  fi

  printf '[subject-id-gate] static scan OK\n' | tee "$STATIC_LOG"
}

run_broker_tests() {
  (
    cd "$ROOT_DIR/services/sso-backend"
    php artisan test \
      tests/Feature/Architecture/AdminSubjectIdRouteContractTest.php \
      tests/Unit/Architecture/IdentityContractMigrationTest.php
  ) | tee "$BROKER_LOG"
}

run_app_b_tests() {
  (
    cd "$ROOT_DIR/apps/app-b-laravel"
    php artisan test \
      tests/Feature/Architecture/SubjectIdSchemaContractTest.php \
      tests/Unit/Architecture/SubjectIdMigrationTest.php
  ) | tee "$APP_B_LOG"
}

run_static_scan
run_broker_tests
run_app_b_tests
