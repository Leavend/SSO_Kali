# Change Checklist: Zero-Downtime SSO Migration

## Before the window

- Confirm DNS and certificates are healthy for:
  - `dev-sso.timeh.my.id`
  - `id.dev-sso.timeh.my.id`
  - `app-a.timeh.my.id`
  - `app-b.timeh.my.id`
- Confirm `127.0.0.1:18080` serves the chained Traefik listener.
- Confirm [check-coexistence-policy.sh](/Users/leavend/Desktop/Project_SSO/infra/sre/check-coexistence-policy.sh) passes.
- Confirm [check-forwarded-header-policy.sh](/Users/leavend/Desktop/Project_SSO/infra/sre/check-forwarded-header-policy.sh) passes.
- Confirm [check-zero-downtime-migration-policy.sh](/Users/leavend/Desktop/Project_SSO/infra/sre/check-zero-downtime-migration-policy.sh) passes.
- Capture current Nginx site backup path.

## Phase 1

- Apply `phase1`.
- Run `PHASE=phase1 ./infra/sre/probe-zero-downtime-rollout.sh`.
- Run forwarded-header probe suite.
- Observe 10 to 15 minutes for:
  - `5xx`
  - auth redirect integrity
  - callback integrity
  - forwarded header mismatch logs

## Phase 2

- Apply `phase2`.
- Run `PHASE=phase2 ./infra/sre/probe-zero-downtime-rollout.sh`.
- Validate `app-a` and `app-b` login entrypoints.
- Evaluate SLO gate with [evaluate-canary-slo.sh](/Users/leavend/Desktop/Project_SSO/infra/sre/evaluate-canary-slo.sh).

## Cutover

- Apply `cutover`.
- Run auth-chain smoke probes.
- Confirm no regression on admin panel, App A, App B, and ZITADEL login UI.

## Abort conditions

- rollback trigger fires from SLO gate
- unexpected `5xx` spike
- callback path mismatch
- JWKS refresh failures increase
- operator cannot complete verification within the planned window
