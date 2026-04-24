# JWKS Rotation Staging Drill

## Goal

Run the JWKS `kid`-miss recovery harness as a staging release gate before promotion.

## Command

```bash
bash infra/qa/run-jwks-rotation-staging-drill.sh
```

## Preconditions

- PHP dependencies for `services/sso-backend` are installed
- PHP dependencies for `apps/app-b-laravel` are installed
- Node.js is available to run the mock JWKS server

## Pass criteria

- broker recovers after `kid` rotation
- App B recovers after `kid` rotation
- both components fail closed when the requested `kid` never appears
- evidence pack is written under `test-results/jwks-rotation-simulation`
