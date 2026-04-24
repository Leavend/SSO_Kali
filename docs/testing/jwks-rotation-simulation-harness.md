# JWKS Rotation Simulation Harness

## Scope

This harness simulates `kid` rotation with a local mock JWKS server and validates that both the broker and App B refresh the key set and recover.

## Assertions

- broker accepts the original upstream signing key
- broker refreshes JWKS after `kid` rotation and validates the rotated token
- broker records refresh failure when the requested `kid` never appears
- App B accepts the original broker signing key
- App B refreshes JWKS after `kid` rotation and validates the rotated token
- App B records refresh failure when the requested `kid` never appears

## Commands

```bash
bash infra/qa/run-jwks-rotation-simulation.sh
```

## Evidence

- mock JWKS server log
- mock JWKS server final state
- broker Pest output
- App B Pest output
