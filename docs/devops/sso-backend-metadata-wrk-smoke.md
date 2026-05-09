# SSO Backend Metadata/JWKS WRK Smoke Evidence

This runbook captures the production WRK smoke procedure and current evidence
for OIDC metadata/JWKS endpoints.

No secrets are required. Do not include tokens, cookies, client secrets, or
production `.env` values in evidence files.

## Smoke Command

```bash
scripts/sso-backend-metadata-wrk-smoke.sh \
  --public-base-url https://api-sso.timeh.my.id \
  --threads 8 \
  --connections 500 \
  --duration 2m
```

The script writes evidence to:

```text
wrk-results/sso-backend-metadata/
```

## Endpoints

```text
GET /jwks
GET /.well-known/jwks.json
GET /.well-known/openid-configuration
```

## Current Production Evidence

Captured from operator WRK run:

| Endpoint | Threads | Connections | Duration | Requests/sec | p50 | p90 | p99 | Connect Errors | Timeouts |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `/jwks` | 8 | 500 | 2m | 2008.82 | 93.48ms | 140.97ms | 484.72ms | 253 | 34 |
| `/.well-known/jwks.json` | 8 | 500 | 2m | 2013.64 | 90.10ms | 143.97ms | 606.18ms | 253 | 37 |
| `/.well-known/openid-configuration` | 8 | 500 | 2m | 1737.55 | 93.74ms | 299.43ms | 678.02ms | 253 | 36 |

## Assessment

Target:

```text
>500 RPS stable for metadata/JWKS endpoints
```

Result:

```text
PASS with warning
```

The endpoints exceed the 500 RPS target by a wide margin. The consistent
`connect 253` and `timeout 34-37` values across all endpoints indicate a shared
connection pressure point rather than a single route issue.

## Follow-Up Tuning Candidates

Investigate only if the same errors reproduce from a stable VPS-side runner or
at lower connection counts:

```text
Nginx worker_connections
Nginx worker_rlimit_nofile
listen backlog
keepalive_timeout
keepalive_requests
proxy_http_version 1.1
proxy_buffering
TLS session reuse
sysctl net.core.somaxconn
sysctl net.ipv4.tcp_max_syn_backlog
file descriptor limits
Octane/FrankenPHP workers
metadata/JWKS throttle policy
```

## Recommended Comparison Run

Run lower concurrency to separate client/network limits from server limits:

```bash
WRK="$(command -v wrk || echo /opt/homebrew/bin/wrk)"

for c in 100 250 500
do
  echo
  echo "=== /jwks c=${c} ==="
  "$WRK" -t8 -c"$c" -d1m --latency "https://api-sso.timeh.my.id/jwks"
done
```

## Evidence Retention

Retain:

- Timestamp.
- Git commit or deployment tag.
- WRK command parameters.
- Requests/sec.
- p50/p90/p99 latency.
- Socket errors and timeouts.
- Confirmation that no secrets were used.
