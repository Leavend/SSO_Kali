# Runbook: SSO Observability and On-Call Routing

## Goal

Provide a versioned observability package for the SSO control plane covering:

- proxy uptime
- token validation latency
- JWKS cache hit ratio
- logout success rate
- identity reconciliation status

## Versioned assets

- Prometheus scrape config:
  - [prometheus.sso.yml](/Users/leavend/Desktop/Project_SSO/infra/observability/prometheus/prometheus.sso.yml)
- Prometheus alert rules:
  - [sso-kpis.yml](/Users/leavend/Desktop/Project_SSO/infra/observability/prometheus/rules/sso-kpis.yml)
- Traefik metrics config:
  - [traefik.metrics.yml](/Users/leavend/Desktop/Project_SSO/infra/observability/traefik.metrics.yml)
- Blackbox config:
  - [blackbox.yml](/Users/leavend/Desktop/Project_SSO/infra/observability/blackbox/blackbox.yml)
- Alertmanager routing:
  - [alertmanager.sso.yml](/Users/leavend/Desktop/Project_SSO/infra/observability/alertmanager/alertmanager.sso.yml)
- Grafana dashboard:
  - [sso-control-plane-dashboard.json](/Users/leavend/Desktop/Project_SSO/infra/observability/grafana/dashboards/sso-control-plane-dashboard.json)
- KPI exporter:
  - [sso_kpi_exporter.py](/Users/leavend/Desktop/Project_SSO/infra/observability/exporters/sso_kpi_exporter.py)

## KPI mapping

| KPI | Source |
|---|---|
| Proxy uptime | blackbox exporter probing public HTTPS endpoints |
| Token validation latency | Traefik Prometheus request-duration histogram for `sso-backend` |
| JWKS cache hit ratio | Redis-backed counters exported by `sso_kpi_exporter.py` |
| Logout success rate | broker logout outcome counters exported by `sso_kpi_exporter.py` |
| Migration reconciliation status | PostgreSQL reconciliation query exported by `sso_kpi_exporter.py` |

## CI validation

Run:

```bash
./infra/sre/check-observability-assets.sh
```

This validates:

- alert rule presence
- scrape job presence
- dashboard panel presence
- Alertmanager receiver presence
- exporter Python syntax

## On-call routing validation

Before deployment:

```bash
export ALERTMANAGER_SLACK_WEBHOOK_URL='https://hooks.slack.com/services/...'
export ALERTMANAGER_PAGERDUTY_ROUTING_KEY='your-routing-key'
./infra/sre/validate-oncall-routing.sh
```

## Alert handling guidance

- `SsoProxyBlackboxDown`
  - treat as ingress outage until proven otherwise
- `SsoTokenValidationLatencyHigh`
  - inspect Traefik duration, broker logs, and upstream ZITADEL health
- `SsoJwksCacheHitRatioLow`
  - inspect JWKS cache churn and key rotation behavior
- `SsoJwksRefreshFailures`
  - inspect upstream JWKS endpoint and cache refresh path
- `SsoLogoutSuccessRateLow`
  - inspect broker `/connect/logout`, back-channel fanout, and app callback health
- `SsoIdentityReconciliationMismatch`
  - block production promotion until mismatch count returns to zero
