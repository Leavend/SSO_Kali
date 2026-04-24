#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SSO_BACKEND_DIR="$ROOT_DIR/services/sso-backend"
APP_B_DIR="$ROOT_DIR/apps/app-b-laravel"
APP_A_DIR="$ROOT_DIR/apps/app-a-next"

run_section() {
  local label="$1"
  shift

  printf '\n==> %s\n' "$label"
  "$@"
}

run_in_dir() {
  local label="$1"
  local dir="$2"
  shift 2

  printf '\n==> %s\n' "$label"
  (
    cd "$dir"
    "$@"
  )
}

SSO_BACKEND_PINT_FILES=(
  tests/Pest.php
  tests/Support/FakeUpstreamOidc.php
  tests/Support/UnitOidcDatabase.php
  tests/Unit/Oidc/ExchangeTokenTest.php
  tests/Unit/Oidc/HandleBrokerCallbackTest.php
  tests/Unit/Oidc/ZitadelTokenVerifierTest.php
)

SSO_BACKEND_PHPSTAN_TARGETS=(
  app/Actions/Oidc/ExchangeToken.php
  app/Actions/Oidc/HandleBrokerCallback.php
  app/Services/Zitadel/ZitadelBrokerService.php
  app/Services/Zitadel/ZitadelTokenVerifier.php
  tests/Support/FakeUpstreamOidc.php
  tests/Support/UnitOidcDatabase.php
  tests/Unit/Oidc
)

APP_B_PINT_FILES=(
  tests/Pest.php
  tests/Support/FakeBrokerJwt.php
  tests/Unit/Sso/BrokerTokenVerifierTest.php
  tests/Feature/Auth/ClientFlowTest.php
  tests/Feature/Auth/CompleteLoginSecurityTest.php
)

APP_B_PHPSTAN_TARGETS=(
  app/Actions/Auth/CompleteLogin.php
  app/Services/Sso/AppSessionStore.php
  app/Services/Sso/BrokerTokenVerifier.php
  app/Services/Sso/SsoHttpClient.php
  app/Services/Sso/UserSynchronizer.php
  tests/Support/FakeBrokerJwt.php
  tests/Unit/Sso/BrokerTokenVerifierTest.php
  tests/Feature/Auth/ClientFlowTest.php
  tests/Feature/Auth/CompleteLoginSecurityTest.php
)

run_in_dir \
  "sso-backend | Pint" \
  "$SSO_BACKEND_DIR" \
  ./vendor/bin/pint --test "${SSO_BACKEND_PINT_FILES[@]}"

run_in_dir \
  "sso-backend | PHPStan" \
  "$SSO_BACKEND_DIR" \
  ./vendor/bin/phpstan analyse "${SSO_BACKEND_PHPSTAN_TARGETS[@]}" --level=5 --memory-limit=512M

run_in_dir \
  "sso-backend | Pest" \
  "$SSO_BACKEND_DIR" \
  ./vendor/bin/pest tests/Unit/Oidc

run_in_dir \
  "app-b-laravel | Pint" \
  "$APP_B_DIR" \
  ./vendor/bin/pint --test "${APP_B_PINT_FILES[@]}"

run_in_dir \
  "app-b-laravel | PHPStan" \
  "$APP_B_DIR" \
  ./vendor/bin/phpstan analyse "${APP_B_PHPSTAN_TARGETS[@]}" --level=5 --memory-limit=512M

run_in_dir \
  "app-b-laravel | Pest" \
  "$APP_B_DIR" \
  ./vendor/bin/pest tests/Unit/Sso/BrokerTokenVerifierTest.php tests/Feature/Auth/CompleteLoginSecurityTest.php tests/Feature/Auth/ClientFlowTest.php

run_in_dir \
  "app-a-next | TypeScript" \
  "$APP_A_DIR" \
  npm run typecheck

run_in_dir \
  "app-a-next | ESLint" \
  "$APP_A_DIR" \
  npm run lint

run_in_dir \
  "app-a-next | Vitest" \
  "$APP_A_DIR" \
  npm run test

run_in_dir \
  "app-a-next | Production Build" \
  "$APP_A_DIR" \
  npm run build

run_section "All QA gates passed" printf 'Phase 10 verification completed successfully.\n'
