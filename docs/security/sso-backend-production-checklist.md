# SSO Backend Production Security Hardening Checklist

This is the Issue 9 penetration-style checklist for the backend-only SSO
production topology.

## Scope

Production public surfaces:

```text
https://api-sso.timeh.my.id
https://sso.timeh.my.id
```

Production backend containers:

```text
sso-backend-prod-sso-backend-1
sso-backend-prod-sso-backend-worker-1
sso-backend-prod-redis-1
sso-backend-prod-postgres-1
```

## Pass/Fail Evidence

For audit readiness, each item must be recorded with:

```text
status: pass | fail | waived
operator:
timestamp_utc:
evidence_command:
evidence_summary:
follow_up_issue:
```

> [!IMPORTANT]
> Do not paste secrets, tokens, `.env.prod`, private keys, database dumps, or
> OAuth client secrets into issue comments or shared chat.

## Edge / TLS

- [ ] `api-sso.timeh.my.id` DNS points to the VPS edge.
- [ ] `sso.timeh.my.id` DNS points to the Frontend UI host.
- [ ] TLS certificate is valid for `api-sso.timeh.my.id`.
- [ ] HTTP redirects to HTTPS.
- [ ] HSTS is enabled after HTTPS is confirmed stable.
- [ ] Nginx config validates before reload.
- [ ] Edge forwards `X-Forwarded-Proto` and `X-Request-Id`.

Evidence commands:

```bash
curl -I http://api-sso.timeh.my.id/up
curl -I https://api-sso.timeh.my.id/up
curl -isS https://api-sso.timeh.my.id/health -H 'X-Request-Id: security-check-001' | grep -i 'x-request-id'
sudo nginx -t
```

## Laravel / Runtime Configuration

- [ ] `APP_ENV=production`.
- [ ] `APP_DEBUG=false`.
- [ ] `APP_URL=https://api-sso.timeh.my.id`.
- [ ] `SSO_BASE_URL=https://api-sso.timeh.my.id`.
- [ ] `SSO_ISSUER=https://api-sso.timeh.my.id`.
- [ ] `OCTANE_HTTPS=true`.
- [ ] `SSO_INTERNAL_QUEUE_METRICS_ENABLED=false` by default.
- [ ] Request timing logs do not include request bodies or token values.

Evidence commands:

```bash
docker exec -it sso-backend-prod-sso-backend-1 php artisan about --only=environment
curl -fsS https://api-sso.timeh.my.id/.well-known/openid-configuration | jq '.issuer'
curl -fsS https://api-sso.timeh.my.id/ready | jq
curl -isS https://api-sso.timeh.my.id/_internal/queue-metrics | head
```

Expected internal queue metrics response in production default state:

```text
HTTP/2 403
```

## Session Cookies

- [ ] `SESSION_SECURE_COOKIE=true`.
- [ ] `SESSION_ENCRYPT=true`.
- [ ] `SESSION_SAME_SITE=lax` unless explicit cross-site flow requires `none`.
- [ ] Broker session cookie uses secure attributes.
- [ ] Sensitive responses have `Cache-Control: no-store`.

Evidence commands:

```bash
curl -isS https://api-sso.timeh.my.id/health | grep -i 'cache-control'
curl -isS https://api-sso.timeh.my.id/login | grep -i 'set-cookie\|cache-control'
```

## OAuth / OIDC Client Registry

- [ ] No wildcard production redirect URIs.
- [ ] No localhost redirect URIs in production clients.
- [ ] Public browser clients use PKCE.
- [ ] Confidential clients require a secret.
- [ ] Refresh token rotation and revocation flow are tested.
- [ ] JWKS exposes public keys only.
- [ ] Discovery issuer exactly matches `https://api-sso.timeh.my.id`.
- [ ] Logout and post-logout redirect URIs are exact allow-list matches.

Evidence commands:

```bash
curl -fsS https://api-sso.timeh.my.id/.well-known/openid-configuration | jq
curl -fsS https://api-sso.timeh.my.id/.well-known/jwks.json | jq
```

## Penetration-Style Checklist

Run these from a controlled operator machine. A pass means the request is denied
or sanitized without leaking stack traces, secrets, or internal topology.

### Metadata and Health Probing

- [ ] `/up` is minimal and does not expose config.
- [ ] `/health` is shallow and does not expose DB/Redis secrets.
- [ ] `/ready` exposes only safe readiness and queue counters.

```bash
curl -fsS https://api-sso.timeh.my.id/up
curl -fsS https://api-sso.timeh.my.id/health
curl -fsS https://api-sso.timeh.my.id/ready | jq
```

### OAuth Negative Tests

- [ ] Unknown `client_id` is rejected.
- [ ] Mismatched `redirect_uri` is rejected.
- [ ] Missing PKCE for public browser client is rejected.
- [ ] Token endpoint rejects invalid `Origin`.
- [ ] Revocation endpoint handles invalid token without stack trace.

Example probes:

```bash
curl -isS 'https://api-sso.timeh.my.id/authorize?client_id=unknown&redirect_uri=https://evil.example/cb&response_type=code&scope=openid'
curl -isS -X POST https://api-sso.timeh.my.id/oauth2/token -H 'Origin: https://evil.example'
curl -isS -X POST https://api-sso.timeh.my.id/oauth/revoke -d 'token=invalid'
```

### Header and Cache Tests

- [ ] Auth-sensitive endpoints are not cacheable.
- [ ] Request ID is reflected for traceability.
- [ ] No `X-Powered-By` or verbose server banner is exposed by the edge.

```bash
curl -isS https://api-sso.timeh.my.id/health -H 'X-Request-Id: pentest-header-001'
curl -isS https://api-sso.timeh.my.id/oauth2/token
curl -isS https://api-sso.timeh.my.id/.well-known/openid-configuration
```

### Rate Limiting

- [ ] Login endpoint is rate-limited.
- [ ] Authorize endpoint is rate-limited.
- [ ] Token endpoint is rate-limited.
- [ ] Discovery/JWKS have appropriate public metadata rate limits.

Evidence should include status codes only, not credentials.

## Containers and Network Exposure

- [ ] `sso-backend` binds only to `127.0.0.1:8200` at the host edge.
- [ ] Postgres is not publicly exposed.
- [ ] Redis is not publicly exposed.
- [ ] `sso-backend-worker` has no public port mapping.
- [ ] Resource limits exist for backend, worker, Postgres, and Redis.
- [ ] Backend-only topology has no production admin UI container.

Evidence commands:

```bash
docker ps --format 'table {{.Names}}\t{{.Ports}}'
docker compose --env-file /opt/sso-backend-prod/.env.prod -f /opt/sso-backend-prod/docker-compose.main.yml ps
ss -ltnp | grep -E ':80|:443|:8200|:5432|:6379' || true
```

## Secrets / Backups

- [ ] `.env.prod` is not committed.
- [ ] OIDC private key is not committed.
- [ ] Backups include Postgres, `.env.prod`, OIDC keys, compose file, and release metadata.
- [ ] Backups and restore rehearsal evidence captured.
- [ ] Backups are encrypted/offloaded outside the VPS.
- [ ] Restore rehearsal has passing `/up`, `/ready`, discovery, and JWKS evidence.

Evidence reference:

```text
docs/devops/sso-backend-backup-restore.md
```

## Observability and Audit

- [ ] `X-Request-Id` is present on responses.
- [ ] `sso.request_timing` logs are available when enabled.
- [ ] `sso.worker_boot` appears in worker logs.
- [ ] Failed jobs are monitored via `/ready` queue counters.
- [ ] Internal queue metrics remain disabled publicly.
- [ ] Login/logout/token events are auditable.

Evidence commands:

```bash
docker logs --tail 300 sso-backend-prod-sso-backend-1 | grep 'sso.request_timing' || true
docker logs --tail 200 sso-backend-prod-sso-backend-worker-1 | grep 'sso.worker_boot'
curl -fsS https://api-sso.timeh.my.id/ready | jq '.checks.queue'
```

## Deployment and Rollback

- [ ] Production deploy uses immutable GHCR tags.
- [ ] GitHub Actions is the default production deploy path.
- [ ] Deploy workflow runs migrations before app/worker rollout.
- [ ] Smoke tests verify `/up`, `/health`, discovery, JWKS, topology, and worker logs.
- [ ] Rollback uses previous immutable tag.
- [ ] Legacy stacks are not part of production dependency path.

Evidence commands:

```bash
gh run list --repo Leavend/SSO_Kali --branch main --limit 5
scripts/sso-backend-vps-smoke.sh --host 145.79.15.8 --user tio --public-base-url https://api-sso.timeh.my.id
```

## Explicitly Prohibited Actions

```text
Do not run docker system prune.
Do not run docker system prune -a --volumes.
Do not expose /_internal/* publicly.
Do not use wildcard redirect/logout URIs in production.
Do not use localhost redirect URIs in production clients.
Do not store production secrets in Git.
```
