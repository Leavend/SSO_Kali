# Admin Auth Observability Rollback Plan

## Trigger
Rollback observability additions if any of the following happen after rollout:
- `sso-frontend` startup regression caused by Redis telemetry dependency
- Prometheus rule reload failure from `admin-auth-funnel.yml`
- dashboard import or Grafana provisioning failure
- synthetic probe fails only after telemetry rollout, while auth flow was healthy before

## One-Step Mitigation
1. Remove `SSO_FRONTEND_REDIS_URL` from the `sso-frontend` runtime environment.
2. Rebuild only `sso-frontend`.
3. Remove `admin-auth-funnel.yml` from Prometheus `rule_files`.
4. Remove `admin-auth-funnel-dashboard.json` from Grafana provisioning/import.

## Safe Rollback Sequence
```bash
docker compose --env-file .env.dev -f docker-compose.dev.yml up -d --no-deps --build sso-frontend
```

Then revert:
- `/Users/leavend/Desktop/Project_SSO/infra/observability/prometheus/prometheus.sso.yml`
- `/Users/leavend/Desktop/Project_SSO/infra/observability/prometheus/rules/admin-auth-funnel.yml`
- `/Users/leavend/Desktop/Project_SSO/infra/observability/grafana/dashboards/admin-auth-funnel-dashboard.json`

## Verification After Rollback
- admin sign-in flow still reaches hosted login
- `npm run build` for `sso-frontend` is green
- Prometheus reload succeeds without the extra rule file
- existing dashboard `sso-control-plane-dashboard.json` remains available
