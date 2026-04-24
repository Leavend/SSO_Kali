# SSO Frontend

Vue 3 + Vite admin frontend with a same-service Node BFF for OIDC/PKCE, encrypted httpOnly cookies, token refresh, logout, and admin API proxying.

## Lifecycle Contract

- Browser code never receives access tokens or refresh tokens.
- `/auth/*`, `/api/*`, and `/healthz` stay on the same container surface used by Traefik.
- Docker builds use immutable image tags from the deploy scripts.
- Rollback remains image-tag based through `scripts/vps-direct-build-deploy.sh` and `scripts/vps-rollback.sh`.

## Local Commands

```sh
npm ci
npm run typecheck
npm run lint
npm run test
npm run build
npm run dev:server
```

Run `npm run dev` in a second shell for the Vite dev server.
