# SSO Backend Production Performance Hardening

## Purpose

This runbook documents production hardening and advanced operational-route
optimization for `https://api-sso.timeh.my.id`.

The optimized operational routes are:

```text
/up
/health
/ready
/_internal/performance-metrics
/_internal/queue-metrics
```

## Operational Route Optimization Matrix

| Endpoint | Edge behavior | App dependency checks | Intended load profile |
|---|---|---:|---:|
| `/up` | Nginx static text | No | High RPS |
| `/health` | Nginx static JSON | No | High RPS |
| `/ready` | Laravel + 1s edge microcache | DB/Redis only by default | High burst, truthful enough |
| `/_internal/performance-metrics` | Protected + 1s microcache | Metrics registry | Approved monitoring only |
| `/_internal/queue-metrics` | Protected + 1s microcache | Queue tables | Approved monitoring only |

## `/up` Edge Static

`/up` must stay ultra-light and must not proxy to Laravel/Octane at the edge:

```nginx
location = /up {
    access_log off;
    add_header Content-Type text/plain always;
    add_header Cache-Control "no-store" always;
    return 200 "ok\n";
}
```

Use `/up` for Docker healthchecks and shallow Nginx liveness.

## `/health` Edge Static

`/health` is intentionally shallow and high-RPS:

```nginx
location = /health {
    access_log off;
    add_header Content-Type application/json always;
    add_header Cache-Control "no-store" always;
    return 200 '{"service":"sso-backend","healthy":true,"edge":"nginx"}\n';
}
```

Use `/ready` for dependency checks.

## `/ready` Microcache

`/ready` remains the dependency-readiness endpoint, but edge microcache absorbs
bursts:

```nginx
proxy_cache sso_operational_routes;
proxy_cache_valid 200 1s;
proxy_cache_valid 503 1s;
proxy_cache_lock on;
proxy_cache_use_stale error timeout updating http_500 http_502 http_503 http_504;
add_header X-Edge-Cache $upstream_cache_status always;
```

Application-level readiness is lightweight by default:

```text
DB ping: yes
Redis ping: yes
Queue snapshot: off by default
External IdP snapshot: off by default
```

Enable optional expensive readiness details only when needed:

```env
SSO_READINESS_QUEUE_SNAPSHOT_ENABLED=true
SSO_READINESS_EXTERNAL_IDP_SNAPSHOT_ENABLED=true
```

## Internal Metrics Protection and Microcache

The following endpoints are operational diagnostics:

```text
/_internal/performance-metrics
/_internal/queue-metrics
```

Default canonical edge behavior:

```nginx
allow 127.0.0.1;
allow ::1;
deny all;
```

They also use 1s microcache when accessed from approved local/private monitoring:

```nginx
proxy_cache sso_operational_routes;
proxy_cache_valid 200 1s;
proxy_cache_valid 403 1s;
proxy_cache_lock on;
add_header X-Edge-Cache $upstream_cache_status always;
```

Do not unauthenticated-public load test these endpoints. If laptop WRK is required,
temporarily add a private allowlist or token-gated Nginx rule, run the test, then
revert to private-only.

## Metadata/JWKS Edge Cache

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
```

## Active VPS Apply Command

Canonical config in the repository is not enough if the active VPS site file is not
patched. Use:

```bash
scripts/vps-apply-sso-operational-route-optimization.sh --mode audit
scripts/vps-apply-sso-operational-route-optimization.sh --mode apply
```

The script:

- backs up `/etc/nginx/sites-available/api-sso.timeh.my.id.conf`,
- creates Nginx cache directories,
- patches operational route locations,
- runs `nginx -t`,
- reloads Nginx,
- prints rollback instructions.

## Scaling Readiness

Use horizontal scaling only for stateless backend web traffic after edge cache is in
place.

Scale web backend when these are true:

- `/jwks`, discovery, `/up`, `/health`, `/ready` still see high p95/p99 after edge
  cache/tuning.
- `sso-backend` CPU is consistently >70%.
- Postgres CPU is not the primary bottleneck.

Command pattern:

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

If `/ready`, `/token`, login, or audit-heavy routes bottleneck with high Postgres CPU,
scale VPS CPU or Postgres instead of only scaling web replicas.

## WRK Target Groups

### High-RPS public operational group

```bash
for path in \
  "/up" \
  "/health" \
  "/ready"
do
  wrk -t8 -c500 -d2m --latency "https://api-sso.timeh.my.id${path}"
done
```

### High-RPS public metadata group

```bash
for path in \
  "/jwks" \
  "/.well-known/jwks.json" \
  "/.well-known/openid-configuration"
do
  wrk -t8 -c500 -d2m --latency "https://api-sso.timeh.my.id${path}"
done
```

### Internal metrics group

Run only from VPS/private monitoring or temporary allowlisted/token-gated source:

```bash
for path in \
  "/_internal/performance-metrics" \
  "/_internal/queue-metrics"
do
  wrk -t4 -c100 -d1m --latency "https://api-sso.timeh.my.id${path}"
done
```
