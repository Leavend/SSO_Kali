# JWKS Rotation Scenario Scripts

## Mock server

- [mock-jwks-rotation-server.mjs](/Users/leavend/Desktop/Project_SSO/tools/qa/mock-jwks-rotation-server.mjs)

## Scenario runner

- [run-jwks-rotation-simulation.sh](/Users/leavend/Desktop/Project_SSO/infra/qa/run-jwks-rotation-simulation.sh)

## Test entrypoints

- [JwksRotationHarnessTest.php](/Users/leavend/Desktop/Project_SSO/services/sso-backend/tests/Feature/Oidc/JwksRotationHarnessTest.php)
- [JwksRotationHarnessTest.php](/Users/leavend/Desktop/Project_SSO/apps/app-b-laravel/tests/Feature/Sso/JwksRotationHarnessTest.php)

## CI workflow

- [jwks-rotation-simulation.yml](/Users/leavend/Desktop/Project_SSO/.github/workflows/jwks-rotation-simulation.yml)
