# SSO Frontend — Deploy & DevOps Guide

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Docker Container                          │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Nginx (alpine)                          │   │
│  │                                                     │   │
│  │  /usr/share/nginx/html/  ← Vite SPA bundle (dist)  │   │
│  │  /etc/nginx/conf.d/      ← envsubst rendered conf   │   │
│  │                                                     │   │
│  │  Routes:                                            │   │
│  │    /api/*        → proxy_pass SSO_BACKEND_UPSTREAM  │   │
│  │    /oauth2/*     → proxy_pass SSO_BACKEND_UPSTREAM  │   │
│  │    /connect/*    → proxy_pass SSO_BACKEND_UPSTREAM  │   │
│  │    /*            → try_files SPA fallback           │   │
│  │    /healthz      → 200 OK (healthcheck)            │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Entrypoint: docker-entrypoint.sh                          │
│    1. envsubst renders nginx.conf.template                 │
│    2. nginx -t (validate config)                           │
│    3. exec nginx -g "daemon off;"                          │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

### Local Development (no Docker)

```bash
cd services/sso-frontend
cp .env.example .env
npm ci
npm run dev          # http://localhost:5173
```

### Local Docker

```bash
cd services/sso-frontend
make docker-run      # http://localhost:3000
```

### Docker Compose

```bash
cd services/sso-frontend
docker compose up -d
docker compose logs -f sso-frontend
```

## Environment Variables

### Build-time (baked into SPA bundle)

| Variable | Required | Default | Description |
|---|---|---|---|
| `VITE_SSO_API_URL` | No | `""` (relative) | Backend API base URL |
| `VITE_APP_NAME` | No | `Dev-SSO Portal` | App title in browser tab |
| `VITE_OIDC_ISSUER` | Yes | — | OIDC issuer URL |
| `VITE_OIDC_CLIENT_ID` | Yes | — | OIDC client ID |
| `VITE_OIDC_SCOPE` | No | `openid profile email offline_access` | OAuth scopes |
| `VITE_OIDC_REDIRECT_URI` | No | `{origin}/auth/callback` | Callback URL |
| `VITE_OIDC_AUTHORIZE_ENDPOINT` | No | `{issuer}/oauth2/authorize` | Authorize URL |
| `VITE_OIDC_TOKEN_ENDPOINT` | No | `{issuer}/oauth2/token` | Token URL |
| `VITE_OIDC_END_SESSION_ENDPOINT` | No | `{issuer}/oauth2/logout` | End session URL |
| `VITE_OIDC_POST_LOGOUT_REDIRECT_URI` | No | `{origin}/` | Post-logout redirect |
| `VITE_CHANGE_PASSWORD_URL` | No | — | External IdP change password URL |

### Runtime (Docker container start)

| Variable | Required | Default | Description |
|---|---|---|---|
| `SSO_BACKEND_UPSTREAM` | Yes | — | Backend host:port (e.g. `sso-backend:8200`) |
| `SSO_FRONTEND_SERVER_NAME` | No | `_` | Nginx server_name |
| `SSO_CSP_CONNECT_SRC` | No | `""` | Extra CSP connect-src origins (e.g. Sentry) |

## CI/CD Pipeline

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ Quality  │───▶│  Build   │───▶│  Docker  │───▶│  Deploy  │
│   Gate   │    │  Bundle  │    │  Push    │    │ Staging  │
└──────────┘    └──────────┘    └──────────┘    └──────────┘
     │                                                │
     ├─ typecheck                                     ├─ docker compose pull
     ├─ lint                                          ├─ docker compose up -d
     └─ test (159 tests)                              └─ nginx -t verify
```

### Trigger

- **Push to `main`**: Full pipeline (gate → build → docker → deploy staging)
- **Push to `develop`**: Quality gate + build only
- **Pull request**: Quality gate only

### Workflow file

`.github/workflows/sso-frontend.yml`

## Makefile Commands

```bash
make help            # Show all commands
make dev             # Start Vite dev server
make lint            # TypeScript + ESLint
make test            # Unit tests
make build           # Production build
make gate            # Full quality gate (lint + test + build)
make docker          # Build Docker image
make docker-run      # Build + run locally (port 3000)
make deploy          # Deploy to staging
make deploy-prod     # Deploy to production (with confirmation)
make clean           # Remove dist + caches
```

## Security Headers (Nginx)

| Header | Value |
|---|---|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' {CSP_CONNECT_SRC}; frame-ancestors 'none'` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `X-XSS-Protection` | `0` (CSP replaces this) |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |

## Rate Limiting (Nginx)

| Zone | Rate | Burst |
|---|---|---|
| Login (`/api/auth/login`) | 10 req/min per IP | 5 |
| API (`/api/*`) | 120 req/min per IP | 30 |

## Health Check

```bash
curl http://localhost:3000/healthz
# → 200 OK
```

Docker HEALTHCHECK runs every 30s with 5s timeout, 3 retries.

## Zero-Downtime Deploy

1. `docker compose pull sso-frontend` — pull new image
2. `docker compose up -d sso-frontend --no-deps` — recreate container
3. Nginx starts, renders config via envsubst
4. `nginx -t` validates config
5. Container healthy after `/healthz` passes

Old container stops only after new one is healthy (Docker restart policy).

## Rollback

```bash
# Rollback to previous image tag
docker compose pull sso-frontend:previous-sha
docker compose up -d sso-frontend --no-deps
```

## Monitoring

- **Health**: `/healthz` endpoint (Nginx 200)
- **Logs**: `docker compose logs -f sso-frontend`
- **Errors**: Sentry integration via `window.__SENTRY__` (runtime inject)
- **Metrics**: Nginx access/error logs → log aggregator
