# Logout JTI Storage Spec

## Objective

Prevent replay of back-channel logout tokens by storing each processed `jti` until the token expires.

## Storage Semantics

### App B

- key pattern: `app-b:logout-jti:{jti}`
- storage backend: Laravel cache
- write mode: add-if-absent
- TTL: `max(1, exp - now)`

### App A

- key pattern: `app-a:logout-jti:{jti}`
- storage backend: Redis
- write mode: `SET NX EX`
- TTL: `max(1, exp - now)`

## Replay Alert Counters

### App B

- counter key: `app-b:metrics:logout_replay_alert_total`

### App A

- counter key: `app-a:metrics:logout_replay_alert_total`

## Acceptance Rules

- first observation of a `jti` MUST succeed
- repeated observation of the same `jti` before expiry MUST fail
- counter MUST increment on replay detection

## Notes

The TTL is derived from the token expiration time rather than a fixed window, so stored replay markers do not outlive the security lifetime of the token.
