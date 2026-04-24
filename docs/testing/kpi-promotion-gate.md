# KPI Promotion Gate

## Scope

This release gate blocks Staging-to-Production promotion unless the required SSO control-plane KPIs are present and within promotion thresholds.

## Promotion thresholds

| KPI | Query | Threshold |
|---|---|---|
| Proxy uptime ratio | `sso_proxy_uptime_ratio` | `>= 0.99` |
| Token validation p95 | `sso_token_validation_p95_seconds` | `<= 0.75` |
| Broker JWKS cache hit ratio | `sso_jwks_cache_hit_ratio{component="broker"}` | `>= 0.90` |
| Logout success ratio | `sso_logout_success_ratio` | `>= 0.99` |
| Identity reconciliation status | `sso_identity_reconciliation_status{scope="canonical_identity"}` | `= 1` |
| Identity reconciliation mismatch total | `sso_identity_reconciliation_mismatch_total` | `= 0` |

## Command

```bash
bash infra/qa/run-kpi-verification-gate.sh
```

## Inputs

- release pipeline: set `PROMETHEUS_BASE_URL`
- optional protected auth: set `PROMETHEUS_BEARER_TOKEN`
- local validation only: set `KPI_SNAPSHOT_FIXTURE`

## Evidence

- observability asset check output
- unit-test output for the KPI validator
- `kpi-snapshot.json`
- `kpi-summary.md`
