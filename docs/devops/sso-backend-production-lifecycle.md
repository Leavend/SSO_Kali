# SSO Backend Production Lifecycle

This document defines the active production lifecycle boundary for the SSO
Backend deployment.

## Active Production Scope

The production compose project is:

```text
sso-backend-prod
```

The active runtime services are backend-only:

```text
postgres
redis
sso-backend
sso-backend-worker
```

## Legacy Boundary

The legacy services intentionally excluded from the active production lifecycle
are:

The following legacy services are intentionally excluded from the active
production lifecycle:

```text
zitadel-login
zitadel-login-vue
app-a-next
app-b-laravel
```

These names may still appear in development-only compose files, historical
walkthroughs, or migration notes. They must not be required by the active
`deploy-main.yml`, `vps-deploy-main.sh`, or backend production smoke path.

## Image Namespace Compatibility

The image namespace remains:

```text
ghcr.io/leavend/sso-kali
```

This is a package compatibility namespace, not the active compose project name.
Do not rename it without a separate GHCR migration plan.

## Deploy Control Path

GitHub Actions stages control files under:

```text
/tmp/sso-backend-deploy
```

The VPS project directory defaults to:

```text
/opt/sso-backend-prod
```

## Operator Verification

On the VPS, verify the active project and service set:

```bash
docker compose \
  --env-file /opt/sso-backend-prod/.env.prod \
  -f /opt/sso-backend-prod/docker-compose.main.yml \
  ps
```

Expected services:

```text
postgres
redis
sso-backend
sso-backend-worker
```

Smoke checks should validate:

```text
/up
/health
/.well-known/openid-configuration
/.well-known/jwks.json
```

## Drift Rules

- Do not add removed frontend/login services to production deploy workflow.
- Do not change `COMPOSE_PROJECT_NAME` away from `sso-backend-prod`.
- Do not restore retired legacy project directories or compose project names in
  active production deploy paths.
- Keep `ghcr.io/leavend/sso-kali` unless a dedicated image namespace migration
  is planned and tested separately.
