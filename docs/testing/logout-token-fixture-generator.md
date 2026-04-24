# Logout Token Fixture Generator

## Purpose

The fixture generator produces signed test tokens for the back-channel logout gate and evidence pack.

## Command

```bash
php tools/qa/generate-logout-token-fixtures.php test-results/backchannel-logout-gate/logout-token-fixtures
```

## Scenarios

- `valid`
- `expired`
- `missing-exp`
- `missing-events`
- `nonce-present`
- `replay-a`
- `replay-b`

## Outputs

- one `.jwt` file per scenario
- `manifest.json` with scenario metadata and SHA-256 digests
