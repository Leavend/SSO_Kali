# Release Evidence Pack Template

## Required attachments for Staging-to-Production promotion

- KPI snapshot JSON:
  - `test-results/kpi-verification-gate/kpi-snapshot.json`
- KPI markdown summary:
  - `test-results/kpi-verification-gate/kpi-summary.md`
- KPI canary window JSON:
  - `test-results/kpi-canary-pass-window/kpi-canary-window.json`
- KPI canary window markdown summary:
  - `test-results/kpi-canary-pass-window/kpi-canary-window-summary.md`
- Observability asset validation log:
  - `test-results/kpi-verification-gate/observability-assets.txt`
- Canary observability asset validation log:
  - `test-results/kpi-canary-pass-window/observability-assets.txt`
- Gate execution log:
  - `test-results/kpi-verification-gate/kpi-gate-run.txt`
- Canary gate execution log:
  - `test-results/kpi-canary-pass-window/kpi-canary-window-run.txt`
- Dashboard reference:
  - [sso-control-plane-dashboard.json](/Users/leavend/Desktop/Project_SSO/infra/observability/grafana/dashboards/sso-control-plane-dashboard.json)

## Decision rule

Promotion may proceed only if:

- all KPI checks are `PASS`
- all KPI canary-window checks are `PASS`
- identity reconciliation status remains `1`
- identity reconciliation mismatch total remains `0`
- no critical observability asset check fails

## Reviewer sign-off

- Release manager:
- SRE on-call:
- Security reviewer:
- Decision timestamp:
