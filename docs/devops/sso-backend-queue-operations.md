# SSO Backend Queue Operations Runbook

This runbook covers Issue 6D/6E/6F operational observability for the
production SSO backend worker and failed job handling.

## Scope

Production stack:

```text
sso-backend-prod-sso-backend-1
sso-backend-prod-sso-backend-worker-1
sso-backend-prod-redis-1
sso-backend-prod-postgres-1
```

The queue worker is critical for FR-002 back-channel logout delivery.

## 1. Verify Worker Runtime

```bash
docker ps --filter 'name=sso-backend-prod-sso-backend-worker-1' \
  --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}'
```

Expected:

```text
sso-backend-prod-sso-backend-worker-1   Up ...
```

## 2. Verify Worker Boot Marker

```bash
docker logs --tail 200 sso-backend-prod-sso-backend-worker-1 \
  | grep 'sso.worker_boot'
```

Expected marker:

```text
sso.worker_boot service=sso-backend-worker command='php artisan queue:work' queue=redis pid=...
```

## 3. Verify Request Lifecycle Logs

Request correlation header:

```bash
curl -isS https://api-sso.timeh.my.id/health \
  -H 'X-Request-Id: ops-manual-check-001' \
  | grep -i 'x-request-id'
```

Expected:

```text
X-Request-Id: ops-manual-check-001
```

If request timing logging is enabled, container logs should include:

```text
sso.request_timing
request_id=ops-manual-check-001
```

Use:

```bash
docker logs --tail 300 sso-backend-prod-sso-backend-1 \
  | grep -E 'sso.request_timing|ops-manual-check-001'
```

## 4. Verify Queue Counters in `/ready`

```bash
curl -fsS https://api-sso.timeh.my.id/ready | jq '.checks.queue'
```

Expected shape:

```json
{
  "pending_jobs": 0,
  "failed_jobs": 0,
  "oldest_pending_age_seconds": null
}
```

> [!IMPORTANT]
> `/ready` exposes only counts and ages. It must not expose job payloads,
> tokens, secrets, logout tokens, or exceptions.

## 5. Internal Queue Metrics Endpoint

The endpoint is disabled by default:

```text
/_internal/queue-metrics
```

It is controlled by:

```env
SSO_INTERNAL_QUEUE_METRICS_ENABLED=false
```

Only enable it temporarily for local/staging diagnostics or through a
strictly internal reverse-proxy path. Do not expose it publicly in production.

## 6. Inspect Failed Jobs Safely

Count failed jobs:

```bash
docker exec -i sso-backend-prod-postgres-1 psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c "select count(*) as failed_jobs from failed_jobs;"
```

Inspect metadata only:

```bash
docker exec -i sso-backend-prod-postgres-1 psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c "select id, uuid, connection, queue, failed_at from failed_jobs order by failed_at desc limit 20;"
```

> [!WARNING]
> Avoid selecting `payload` or full `exception` in shared terminals because
> failed job rows may contain sensitive operational context.

## 7. Retry Failed Jobs

Prefer targeted retry:

```bash
docker exec -it sso-backend-prod-sso-backend-1 php artisan queue:retry <failed-job-uuid-or-id>
```

Avoid blanket retry unless the root cause is known:

```bash
docker exec -it sso-backend-prod-sso-backend-1 php artisan queue:retry all
```

After retry:

```bash
curl -fsS https://api-sso.timeh.my.id/ready | jq '.checks.queue'
docker logs --tail 200 sso-backend-prod-sso-backend-worker-1
```

## 8. Clear Failed Jobs

Only clear after audit/export and after confirming retries are not required:

```bash
docker exec -it sso-backend-prod-sso-backend-1 php artisan queue:flush
```

> [!CAUTION]
> `queue:flush` destroys failed-job evidence. Do not run it during incident
> analysis without approval.

## 9. FR-002 Back-Channel Failure Triage

1. Check `/ready` queue counters.
2. Check worker boot marker and worker logs.
3. Inspect failed job metadata.
4. Identify affected client/logout operation from audit logs.
5. Fix network/client endpoint issue.
6. Retry targeted failed jobs.
7. Confirm queue counters return to baseline.

## 10. Do Not Do

```text
Do not run docker system prune.
Do not delete queue/DB volumes during queue incidents.
Do not expose internal metrics publicly.
Do not paste job payloads or token-like values into tickets/chat.
```
