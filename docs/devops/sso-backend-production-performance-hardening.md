# SSO Backend Production Performance Hardening

## Purpose

This runbook documents PO1-PO5 hardening after production WRK results on
`https://api-sso.timeh.my.id`.

## PO1: Internal Metrics Are Private

The following endpoints are operational diagnostics, not public load-test targets:

```text
/_internal/performance-metrics
/_internal/queue-metrics
```

Canonical Nginx edge behavior:

```nginx
allow 127.0.0.1;
allow ::1;
deny all;
```

Add private monitoring CIDRs only when needed. Do not allow public internet access.

## PO2: `/up` Is Edge Static

`/up` must stay ultra-light and should not proxy to Laravel/Octane at the edge:

```nginx
location = /up {
    access_log off;
    add_header Content-Type text/plain always;
    add_header Cache-Control "no-store" always;
    return 200 "ok\n";
}
```

Use `/up` for container healthchecks and Nginx liveness.

## PO3: `/health` vs `/ready`

Use separate semantics:

| Endpoint | Purpose | Dependency checks | High-RPS target |
|---|---|---:|---:|
| `/up` | Edge/app liveness | No | Yes |
| `/health` | Shallow app alive | No | Moderate only |
| `/ready` | DB/Redis readiness | Yes | No |

Docker healthcheck should use `/up` only to avoid dependency amplification.

## PO4: Metadata/JWKS Edge Cache

Public OIDC metadata endpoints are safe high-RPS read-only targets:

```text
/jwks
/.well-known/jwks.json
/.well-known/openid-configuration
```

Nginx edge config should keep:

```nginx
proxy_cache sso_oidc_metadata;
proxy_cache_lock on;
proxy_cache_use_stale error timeout updating http_500 http_502 http_503 http_504;
proxy_ignore_headers Set-Cookie Cache-Control Expires;
proxy_hide_header Set-Cookie;
add_header X-Edge-Cache $upstream_cache_status always;
add_header Cache-Control "public, max-age=300, stale-while-revalidate=60" always;
```

Discovery can use longer cache TTL, e.g. one hour.

## PO5: Scaling Readiness

Use horizontal scaling only for stateless backend web traffic after edge cache is in
place.

### When to scale web replicas

Scale web backend when these are true:

- `/jwks`, discovery, `/up` still see high p95/p99 after edge cache/tuning.
- `sso-backend` CPU is consistently >70%.
- Postgres CPU is not the primary bottleneck.

### Recommended command pattern

If compose topology supports scaling without fixed container name conflicts:

```bash
docker compose \
  --project-name sso-backend-prod \
  -f docker-compose.sso-backend.yml \
  up -d --scale sso-backend=2 sso-backend
```

Rollback:

```bash
docker compose \
  --project-name sso-backend-prod \
  -f docker-compose.sso-backend.yml \
  up -d --scale sso-backend=1 sso-backend
```

### When to scale DB or VPS instead

If `/ready`, `/token`, login, or audit-heavy routes show bottlenecks with high
Postgres CPU, scaling web replicas will not solve the root cause. Prefer:

- increase VPS CPU,
- move Postgres to dedicated/managed DB,
- add read/cache strategy for non-critical reads,
- avoid load testing dependency-heavy endpoints at 500 concurrent.

## WRK Target Groups

### High-RPS safe group

```bash
for path in \
  "/up" \
  "/jwks" \
  "/.well-known/jwks.json" \
  "/.well-known/openid-configuration"
do
  wrk -t8 -c500 -d2m --latency "https://api-sso.timeh.my.id${path}"
done
```

### Low-RPS dependency group

```bash
for path in \
  "/health" \
  "/ready"
do
  wrk -t4 -c50 -d1m --latency "https://api-sso.timeh.my.id${path}"
done
```

Do not public-load `/_internal/*`; verify them from localhost/private monitoring
only.
