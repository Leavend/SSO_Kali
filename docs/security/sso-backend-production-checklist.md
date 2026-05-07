# SSO Backend Production Security Checklist

## Edge / TLS

- [ ] `timeh.my.id` DNS points to `145.79.15.8`.
- [ ] Valid TLS certificate exists for `timeh.my.id`.
- [ ] HTTP redirects to HTTPS.
- [ ] HSTS enabled after HTTPS is verified.
- [ ] Nginx config validates with `nginx -t` before reload.

## Laravel / Proxy Trust

- [ ] `APP_URL=https://timeh.my.id`.
- [ ] `SSO_BASE_URL=https://timeh.my.id`.
- [ ] `SSO_ISSUER=https://timeh.my.id`.
- [ ] `OCTANE_HTTPS=true`.
- [ ] Trusted proxy settings honor `X-Forwarded-Proto` only from VPS edge.

## Session Cookies

- [ ] `SESSION_SECURE_COOKIE=true`.
- [ ] `SESSION_ENCRYPT=true`.
- [ ] `SESSION_SAME_SITE=lax` unless cross-site browser flow requires `none`.
- [ ] Prefer `__Host-` cookie prefix when no parent-domain cookie is required.

## OAuth / OIDC

- [ ] No wildcard production redirect URIs.
- [ ] No localhost redirect URIs in production clients.
- [ ] Public browser clients use PKCE.
- [ ] Confidential clients require secret.
- [ ] Refresh token rotation and revoke flow tested.
- [ ] JWKS exposes public keys only.
- [ ] Discovery issuer matches `https://timeh.my.id` exactly.

## Rate Limiting

- [ ] Login endpoint rate-limited.
- [ ] Token endpoint rate-limited.
- [ ] Authorize endpoint rate-limited.
- [ ] Failed login / suspicious OAuth attempts are auditable.

## Health / Discovery

- [ ] `/health` does not leak secrets or internal connection strings.
- [ ] `/up` remains minimal.
- [ ] Discovery and JWKS are cacheable.
- [ ] Auth-sensitive endpoints are not cacheable.

## Containers

- [ ] `sso-backend` binds only to `127.0.0.1:8200`.
- [ ] Postgres and Redis are not publicly exposed.
- [ ] `sso-worker` has no public port mapping.
- [ ] Resource limits are set for backend, worker, Postgres, Redis.
- [ ] Health checks are enabled.

## Secrets / Backups

- [ ] `.env.prod` is not committed.
- [ ] OIDC private key is not committed.
- [ ] Backups include Postgres, `.env.prod`, OIDC keys, release metadata.
- [ ] Restore drill performed at least once.
- [ ] Backups are encrypted/offloaded outside the VPS.

## Observability

- [ ] Docker log rotation configured.
- [ ] Failed jobs are monitored.
- [ ] Login/logout/token events are auditable.
- [ ] Container unhealthy alerts exist.
- [ ] Disk usage alerts exist.

## Deployment

- [ ] Production deploy uses immutable GHCR tags.
- [ ] Deploy workflow runs migrations before app/worker rollout.
- [ ] Internal smoke always runs.
- [ ] Public smoke runs once DNS/TLS are ready.
- [ ] Rollback uses previous immutable tag.
