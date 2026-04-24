#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

run_backend_suite() {
  (
    cd "${ROOT_DIR}/services/sso-backend"
    php artisan test \
      tests/Feature/Regression/BrokerOidcSecurityRegressionTest.php \
      tests/Feature/Regression/BrokerSessionCookieRegressionTest.php \
      tests/Unit/Identity/IdentifierResolverTest.php \
      tests/Feature/Oidc/JwksRotationHarnessTest.php
  )
}

run_app_b_suite() {
  (
    cd "${ROOT_DIR}/apps/app-b-laravel"
    php artisan test \
      tests/Feature/Regression/BackChannelLogoutSecurityRegressionTest.php \
      tests/Feature/Auth/BackChannelLogoutValidationTest.php \
      tests/Unit/Sso/LogoutTokenReplayStoreTest.php \
      tests/Feature/Sso/JwksRotationHarnessTest.php
  )
}

run_backend_suite
run_app_b_suite
