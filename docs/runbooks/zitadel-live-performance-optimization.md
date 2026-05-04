# ZITADEL Live Performance Optimization Runbook

Date: 2026-05-04
Scope: dev-sso live identity path (`id.dev-sso.timeh.my.id`) and Project SSO control-plane deploy.

## Problem Statement

Users reported that accessing the ZITADEL-backed login flow felt heavy. Live probes showed small HTML and asset payloads, but identity endpoints had intermittent TTFB spikes above 2 seconds. That points to runtime path pressure around ZITADEL, PostgreSQL, and reverse proxy reconciliation rather than a frontend bundle-size issue.

## Findings

- The active Vue login HTML is small and static assets are already immutable.
- ZITADEL instance and organization lookups were not cached in the live Compose control plane.
- ZITADEL and PostgreSQL runtime limits in `docker-compose.dev.yml` were lower than the production budget overlay.
- The registry deploy script copied the new Compose file to the VPS, but did not reconcile `zitadel-api`; therefore config-only ZITADEL changes could be shipped without taking effect.
- The old ZITADEL Docker health command could remain `starting` or `unhealthy` while the identity API was serving requests, causing a false deployment failure.
- Public blackbox monitoring covered generic uptime, but not the active Vue login URL or canonical SSO discovery latency.
- The Hostinger VPS is a small KVM 2 node (`145.79.15.8`) with reported CPU around 61%, memory around 42%, and disk around 41%; login changes must reduce per-request work and protect ZITADEL instead of simply adding more background load.
- Follow-up live probes showed the page shell and assets were fast enough, while POST `/ui/v2/auth/api/session/user` could take roughly 1-4 seconds because it synchronously calls ZITADEL Session API and PostgreSQL-backed identity lookup.
- A later mobile-browser report showed `POST /ui/v2/auth/api/session/password` returning 503. In this code path, the Vue login backend has already accepted the browser request and is waiting on the ZITADEL Session API `PATCH /v2/sessions/{sessionId}`. The response is mapped to 503 only when ZITADEL returns a 5xx class error or the upstream call hits the configured timeout cap.
- Password and TOTP verification calls must not be retried automatically. A credential replay can double-count failed attempts, interfere with lockout policy, and create ambiguous audit trails. The safe failure mode is a bounded timeout, no-store response, retry-after signal, and operator-side diagnosis of ZITADEL/PostgreSQL pressure.

## Optimization Applied

- Enable ZITADEL local memory cache for instance and organization objects on the single-node deployment.
- Keep Redis cache disabled until connector compatibility is validated, avoiding an unsafe cache backend change during a live performance fix.
- Increase the live ZITADEL and PostgreSQL resource ceilings to match the documented runtime budget.
- Add a dedicated identity web resource budget for hosted login and Vue login services.
- Add deploy-time reconciliation for `zitadel-api` with health-gated rollback.
- Use the documented `/debug/ready` readiness endpoint with an OIDC discovery fallback for ZITADEL health checks.
- Add Compose control-plane snapshot restoration before rollback.
- Add public blackbox probes and alerts for Vue login and OIDC discovery latency.
- Cap Vue login to ZITADEL API calls with `ZITADEL_LOGIN_API_TIMEOUT_MS` so slow upstream calls free Node workers instead of hanging indefinitely.
- Reject oversized login JSON bodies before any upstream ZITADEL call.
- Emit `Server-Timing` on Vue login API responses to distinguish login-BFF latency from browser rendering latency during live troubleshooting.
- Emit `Retry-After` and `Cache-Control: no-store` for transient upstream identity outages so 503 responses are explicit, non-cacheable, and safe for clients/proxies without replaying password submissions.
- Apply Nginx edge config through CI/CD, including immutable caching for Vue login assets and rate limiting for expensive `/ui/v2/auth/api/` calls.
- Extend VPS maintenance diagnostics with ZITADEL container inspect, restart state, redacted recent warnings/errors, `/debug/metrics` sampling, PostgreSQL wait events, and PostgreSQL lock summaries.

## ZITADEL Official Guidance Mapped to This Stack

- Use `/debug/ready` for readiness and `/debug/healthz` for liveness checks. The Compose healthcheck and maintenance probe should keep using `/debug/ready` for rollout gating.
- Use `/debug/metrics` for operational metrics. The endpoint must remain internal-only and should feed Prometheus or an OpenTelemetry collector rather than being exposed publicly.
- ZITADEL Compose semi-production supports Redis or memory cache for frequently used objects. This single-node VPS uses memory cache for instance and organization objects because it avoids an additional Redis failure mode on the password path.
- For production-grade scale, split `zitadel init`, `zitadel setup`, and `zitadel start`, then run multiple API replicas behind a load balancer. The current single `zitadel-api` container is rollback-safe, but not strict high availability.
- PostgreSQL is the critical data dependency for identity sessions and event reads. Monitor open connections, wait events, locks, and slow queries alongside ZITADEL CPU and request latency.

## Current 503 Investigation Checklist

Run the read-only maintenance diagnostic before changing live runtime:

```bash
gh workflow run "VPS Maintenance" -f action=diagnose-sso-performance
```

Review:

- Host load average relative to the KVM 2 CPU count.
- Non-SSO containers consuming CPU on the same VPS.
- `zitadel-api` restart count, health status, and recent redacted warnings/errors.
- ZITADEL `/debug/ready` latency versus public `/ui/v2/auth/api/*` latency.
- ZITADEL `/debug/metrics` process/runtime and HTTP/gRPC counters.
- PostgreSQL `pg_stat_activity`, wait events, and `pg_locks`.

Do not reproduce password errors by submitting a real user's password or a dummy password for a real account. Use logs, metrics, and synthetic non-credential probes to avoid account lockout and audit contamination.

## Rollback

The CD pipeline already backs up the previous Compose file before installing the new one. On health or smoke failure, `scripts/vps-deploy.sh` restores that Compose snapshot, restores any environment migration snapshot, and then invokes image rollback through `scripts/vps-rollback.sh` when a previous release tag is available.

The edge config apply step backs up the active Nginx site file, enabled-site links, and snippets. It disables stale or renamed enabled SSO configs before validation, avoids creating a duplicate enabled-site link when the VPS Nginx already includes `sites-available`, then restores the previous edge config if `nginx -t` fails before reload.

Manual rollback path:

```bash
sudo cp /opt/sso-prototype-dev/docker-compose.dev.yml.pre-<sha> /opt/sso-prototype-dev/docker-compose.dev.yml
sudo bash /opt/sso-prototype-dev/scripts/vps-rollback.sh \
  --tag <previous-tag> \
  --registry ghcr.io/leavend/sso-prototype \
  --project-dir /opt/sso-prototype-dev
```

## Zero-Downtime Note

The current live ZITADEL runtime is a single `zitadel-api` container. This change is health-gated and rollback-safe, but strict zero downtime for identity runtime replacement requires at least two ZITADEL application replicas and a shared cache strategy. For single-node memory cache, scale-out should not be enabled permanently without revisiting cache consistency.

## SLO Guardrails

- Vue login probe latency: alert above 2 seconds for 5 minutes.
- ZITADEL OIDC discovery latency: alert above 2 seconds for 5 minutes.
- Existing public blackbox uptime remains the hard availability signal.
- Manual flow probe: POST `/ui/v2/auth/api/session/user` with a non-existing `@example.invalid` user should stay below the timeout cap and return without hanging the browser.
