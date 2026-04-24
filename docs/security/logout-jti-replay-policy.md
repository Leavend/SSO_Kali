# Logout `jti` Replay Policy

## Scope
- Applies to App B back-channel logout processing.
- Covers replay detection for OIDC logout tokens issued by the broker.

## Policy
- Every accepted logout token `jti` MUST be persisted in `logout_token_replays`.
- The `jti` marker TTL is derived from the token `exp` claim.
- A repeated `jti` MUST be rejected until the stored marker has expired.
- Expired markers MAY be removed by the scheduled pruning job.

## Storage Contract
- Table: `logout_token_replays`
- Key field: `jti` as opaque string
- Expiration field: `expires_at`
- Uniqueness: enforced by a unique index on `jti`

## Runtime Behavior
1. Verifier validates signature and claims.
2. Replay store removes any expired marker for the same `jti`.
3. Replay store attempts to insert a new marker.
4. If a non-expired marker already exists, the request is rejected as replay.
5. The counter `app-b:metrics:logout_replay_alert_total` is incremented on every replay reject.

## Cleanup
- Command: `php artisan sso:prune-logout-token-replays`
- Schedule: hourly
- Dry run: `php artisan sso:prune-logout-token-replays --dry-run`

## Operational Guidance
- Alert on abnormal growth of `app-b:metrics:logout_replay_alert_total`.
- Investigate bursts for proxy retries, broker bugs, or active abuse.
