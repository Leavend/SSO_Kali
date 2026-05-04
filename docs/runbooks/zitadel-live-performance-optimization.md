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
- After the `v1.1.56` edge keepalive release, all public probes returned HTTP 200, but user-facing latency still spiked. One login page sample reached 11.28 seconds with most delay in TCP/TLS/TTFB, and one safe non-credential identity API probe reached 48.84 seconds while the application `Server-Timing` value was only about 3 seconds. This indicates host scheduling or edge/network contention outside the Vue login handler.
- The post-release VPS diagnostic reported load averages of `22.30, 18.81, 14.26` on the small KVM 2 host while ZITADEL readiness stayed fast (`/debug/ready` around 0.0007s and direct discovery around 0.10s). ZITADEL was healthy with zero restarts. PostgreSQL did not show a lock pileup, but non-critical demo workloads and the proxy/data plane were competing for CPU on the same node.

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
- Point the hosted-login rollback container healthcheck at `/ui/v2/login/healthy` instead of the full login page. This keeps rollback health coverage while avoiding periodic Next.js page rendering on the constrained VPS.
- Keep Nginx-to-Traefik upstream connections warm through the canonical `sso_traefik_web` upstream. This removes unnecessary TCP churn on the edge hop and keeps auth-sensitive routes behind the same validated proxy contract.
- Add explicit resource isolation: ZITADEL, PostgreSQL, Redis, and login web services receive higher CPU shares under contention, while App A and App B demo workloads use constrained budgets. This does not create new capacity, but it prevents non-critical demo traffic from being scheduled equally with the identity path on the current single VPS.

## ZITADEL Official Guidance Mapped to This Stack

- Use `/debug/ready` for readiness and `/debug/healthz` for liveness checks. The Compose healthcheck and maintenance probe should keep using `/debug/ready` for rollout gating.
- Use `/debug/metrics` for operational metrics. The endpoint must remain internal-only and should feed Prometheus or an OpenTelemetry collector rather than being exposed publicly.
- Direct container probes for tenant-scoped endpoints must send the canonical `Host`, `x-zitadel-instance-host`, and `x-zitadel-public-host` headers. Probing with `127.0.0.1` can create false `unable to set instance` noise in ZITADEL logs.
- ZITADEL Compose semi-production supports Redis or memory cache for frequently used objects. This single-node VPS uses memory cache for instance and organization objects because it avoids an additional Redis failure mode on the password path.
- For production-grade scale, split `zitadel init`, `zitadel setup`, and `zitadel start`, then run multiple API replicas behind a load balancer. The current single `zitadel-api` container is rollback-safe, but not strict high availability.
- PostgreSQL is the critical data dependency for identity sessions and event reads. Monitor open connections, wait events, locks, and slow queries alongside ZITADEL CPU and request latency.
- ZITADEL's memory cache is the right default for the current single-server setup. Redis cache should be introduced only as part of a multi-replica identity plane because it adds operational overhead and a new dependency on the password path.

## Next-Practice Resource Isolation

The current VPS is still a shared compute plane. Until ZITADEL and PostgreSQL are moved to a dedicated identity node or the current node is upgraded to at least 4 vCPU, protect the identity path with resource policy:

- `zitadel-api` and `postgres` keep the highest CPU shares because they gate password/session verification.
- `redis`, hosted login, and Vue login keep elevated CPU shares because they sit on the interactive auth path.
- `app-a-next` and `app-b-laravel` are demo workloads and must use constrained budgets. They must not be allowed to consume the same scheduler priority as ZITADEL or PostgreSQL.
- The deploy and rollback scripts remain health-gated. Resource policy changes are rolled out by normal CD and can be reverted by tagging/deploying the previous release.

This is a containment step, not a substitute for capacity. If public latency still spikes while internal ZITADEL probes remain fast, the next action is infrastructure separation or a larger VPS, not more application retries.

## PostgreSQL Hot Query Observability

The next diagnostic gate is `pg_stat_statements`. CPU pressure can come from host oversubscription, but ZITADEL and the SSO services also need query-level evidence before changing database indexes, cache policy, or application code. Ranking SQL by `total_exec_time`, `mean_exec_time`, and `calls` prevents blind optimization and keeps fixes tied to measured user impact.

Run the read-only audit first:

```bash
gh workflow run "VPS Maintenance" -f action=audit-pg-stat-statements
```

The audit checks:

- Whether PostgreSQL is already started with `shared_preload_libraries=pg_stat_statements`.
- Whether the extension exists in the ZITADEL, SSO backend, App B, and maintenance databases.
- Hot query samples when the extension is already active.

The Compose control plane now carries the preload configuration for the next planned PostgreSQL start. Do not restart the current single PostgreSQL container just to apply it during business traffic; on this one-node VPS that is not zero downtime for identity.

After a backup-backed maintenance window or after moving PostgreSQL to a dedicated identity plane, enable the extension objects idempotently:

```bash
gh workflow run "VPS Maintenance" -f action=enable-pg-stat-statements-extension
```

The enable action refuses to mutate databases unless PostgreSQL is already running with the preload library. That keeps the workflow rollback-safe: it can verify readiness and create extension metadata, but it cannot hide an unsafe live restart inside an observability task.

Use the query report to decide the next fix:

- High ZITADEL read time: prioritize identity-plane CPU/database separation before adding application retries.
- High SSO backend query time: add targeted indexes or eager loading in the owning Laravel action/service, then cover with Pest/PHPStan.
- High App B query time: keep demo workload constrained or move it away from the identity node.
- High calls with low mean time: consider short TTL caching for non-sensitive hot reads.

## Identity Plane Migration Path

Use this sequence for a production-grade split without auth downtime:

1. Provision a dedicated identity plane or upgrade the current node to at least 4 vCPU.
2. Take a verified PostgreSQL backup and run a restore drill before moving identity data.
3. Move PostgreSQL first, using TLS/DSN settings and the ZITADEL schema bootstrap guidance when a managed database has no superuser access.
4. Keep a single `zitadel-api` replica until database latency and backups are proven stable.
5. Introduce Redis cache only when running multiple ZITADEL application replicas, then switch cache connectors away from long-lived local memory semantics.
6. Scale ZITADEL to at least two app replicas behind the proxy and verify `/debug/ready`, OIDC discovery, session user, and password/TOTP flows before making it the rollback baseline.
7. Keep the previous tag and Compose snapshot available for rollback until the identity plane has passed a full login and admin-session smoke window.

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
- Runtime resource policy from the VPS diagnostic. The identity/data plane must show higher CPU shares than demo workloads.

If the diagnostic still says `pg_stat_statements unavailable`, run the dedicated audit workflow before changing code or adding indexes:

```bash
gh workflow run "VPS Maintenance" -f action=audit-pg-stat-statements
```

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
