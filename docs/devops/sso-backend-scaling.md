# SSO Backend Scaling Strategy

## Current Baseline

Current production runtime:

```text
VPS: 2 vCPU / 8GB RAM
sso-backend: 1.50 CPU / 1024MB / 2 Octane workers
sso-worker: 0.25 CPU / 384MB
```

Recent `/health` benchmark after tuning:

```text
internal c50: 296.85 req/s, P50 161.89ms
public c50:   217.11 req/s, P50 182.27ms
public c100:  263.47 req/s, P50 340.51ms
```

## Target: Stable >500 RPS

Do not use `/ready` for throughput targets. Use:

```text
/up     = edge liveness
/health = shallow app health
/ready  = dependency readiness
```

## Option A — Scale Up First

Recommended first step:

```text
4 vCPU / 8-16GB RAM
SSO_BACKEND_CPUS=3.0
SSO_BACKEND_OCTANE_WORKERS=4
SSO_BACKEND_MEM_LIMIT=1536m
```

This keeps deployment simple and avoids replica routing complexity.

## Option B — Scale Out Backend Replicas

Future topology:

```text
Nginx edge
  -> sso-backend-1:8000
  -> sso-backend-2:8000
  -> sso-backend-N:8000
```

Requirements:

- Remove fixed host port binding per replica.
- Put Nginx in the Docker network or expose distinct localhost ports.
- Keep `sso-worker` as a separate service.
- Store sessions/cache/queues in Redis.
- Keep OIDC keys mounted read-only and identical across replicas.

## Guardrails

- Use immutable GHCR tags.
- Run migrations once before rolling replicas.
- Use `/ready` before adding a replica to upstream.
- Keep `/up` at edge for Nginx liveness only.
- Monitor p95/p99 latency and error rate, not only RPS.

## Benchmark Contract

```bash
wrk -t2 -c50 -d30s --latency https://api-sso.timeh.my.id/up
wrk -t2 -c50 -d30s --latency https://api-sso.timeh.my.id/health
wrk -t4 -c100 -d30s --latency https://api-sso.timeh.my.id/health
wrk -t8 -c200 -d30s --latency https://api-sso.timeh.my.id/health
```

Success target:

```text
/health > 500 req/s
P95 < 500ms
P99 < 1s
0 timeouts
```
