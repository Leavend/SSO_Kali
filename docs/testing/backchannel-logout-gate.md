# Back-Channel Logout Gate

## Scope

This release gate validates the security invariants for broker-issued back-channel logout tokens across the broker, App B, and App A.

## Assertions

- broker-issued logout tokens always contain `iss`, `aud`, `sub`, `sid`, `jti`, `iat`, `exp`, and the back-channel logout `events` marker
- broker-issued logout tokens never contain `nonce`
- App B rejects logout tokens that are expired, missing `iat`, missing `exp`, missing `events`, missing both `sub` and `sid`, or replay a previous `jti`
- App B persists replay markers with opaque string `jti` storage and prunes only expired markers
- App A rejects logout tokens that are expired, missing `exp`, missing `events`, missing both `sub` and `sid`, or contain `nonce`
- replayed `jti` values are rejected and recorded as replay alerts

## Command

```bash
bash infra/qa/run-backchannel-logout-gate.sh
```

## Evidence

- generated logout token fixture set
- broker Pest output
- App B Pest output
- App A Vitest output
