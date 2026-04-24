# SSO Frontend Vue Rebuild Runbook - 2026-04-24

## Decision

`services/sso-frontend` is rebuilt from Next.js to Vue 3 + Vite while keeping a same-service Node BFF. The BFF keeps OIDC/PKCE, token exchange, refresh-token handling, logout revocation, encrypted httpOnly cookies, and admin API proxying outside browser code.

## Target Stack

- Vue 3.5.33
- Vite 8.0.10
- Vue Router 5.0.6
- Pinia 3.0.4
- Node 22 runtime

## Invariants

- Browser code calls only same-origin `/auth/*` and `/api/*`.
- Access tokens, ID tokens, and refresh tokens stay server-side.
- Session cookies keep the `__Secure-` prefix, `HttpOnly`, `Secure`, and `SameSite=Strict`.
- `/healthz` stays available for Compose, Traefik, and deploy smoke gates.
- Backend API/OIDC Traefik priority remains higher than frontend catch-all routing.

## Zero-Downtime Lifecycle

1. Build immutable image tag for `sso-frontend`.
2. Retag the currently running image to `rollback-${TAG}` before runtime change.
3. Update only the touched frontend service.
4. Wait until the container healthcheck passes.
5. Smoke HTTPS through local Traefik using `--resolve`.
6. Keep the prior image tag until the post-deploy window closes.

On the current single-container Compose deployment, this is health-gated low-downtime deployment. Strict zero downtime requires either parallel blue/green services behind Traefik or two replicas during promotion.

## Rollback

Use the existing rollback paths:

```sh
scripts/vps-direct-build-deploy.sh
scripts/vps-rollback.sh <target-tag>
```

The direct deploy script now passes `VITE_SSO_BASE_URL`, `VITE_ADMIN_BASE_URL`, and `VITE_CLIENT_ID` for the rebuilt Vue frontend image.

## Validation Evidence

- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run build`
- `npm run smoke`
- `./scripts/validate-devops-lifecycle.sh`
- `./scripts/validate-laravel-vue-lifecycle.sh`
- `docker compose --env-file .env.dev.example -f docker-compose.dev.yml config --services`
- `docker buildx build --load -t sso-dev-sso-frontend:buildx-validate ... services/sso-frontend`
- Runtime container smoke for `sso-dev-sso-frontend:buildx-validate`: `/healthz` and `/dashboard` returned HTTP 200.
