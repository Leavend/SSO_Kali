# KPI Canary Pass Window

## Scope

This release gate blocks Production promotion unless the SSO control-plane KPIs stay within target for the full canary pass window.

## Default window

- window: `72 hours`
- query step: `300 seconds`

## Metrics enforced across the full window

| KPI | Query | Threshold |
|---|---|---|
| Proxy uptime ratio | `sso_proxy_uptime_ratio` | `>= 0.99` at every sampled point |
| Token validation p95 | `sso_token_validation_p95_seconds` | `<= 0.75` at every sampled point |
| Broker JWKS cache hit ratio | `sso_jwks_cache_hit_ratio{component="broker"}` | `>= 0.90` at every sampled point |
| Logout success ratio | `sso_logout_success_ratio` | `>= 0.99` at every sampled point |
| Identity reconciliation status | `sso_identity_reconciliation_status{scope="canonical_identity"}` | `= 1` at every sampled point |
| Identity reconciliation mismatch total | `sso_identity_reconciliation_mismatch_total` | `= 0` at every sampled point |

## Command

```bash
bash infra/qa/run-kpi-canary-pass-window.sh
```

## Inputs

- required in release/staging CI: `PROMETHEUS_BASE_URL`
- optional protected auth: `PROMETHEUS_BEARER_TOKEN`
- optional overrides:
  - `CANARY_WINDOW_HOURS`
  - `PROMETHEUS_STEP_SECONDS`
- local validation only: `KPI_WINDOW_FIXTURE`

## Evidence

- observability asset validation log
- unit-test output for the canary validator
- `kpi-canary-window.json`
- `kpi-canary-window-summary.md`

## Decision rule

Promotion may proceed only if:

- every KPI passes at every sampled point in the canary window
- no reconciliation mismatch appears during the window
- no critical observability asset check fails
