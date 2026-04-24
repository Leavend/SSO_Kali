# Vue Frontend and VPS Live Validation - 2026-04-24

## Scope

Issue yang divalidasi:

1. Frontend SSO sudah menggunakan Vue JS advanced latest sesuai ekspektasi.
2. Service SSO live pada VPS BTH diuji secara non-intrusive.
3. Hasil dinilai memakai prinsip software lifecycle: zero downtime, rollback mechanism, dan update zero downtime.

Semua pengujian VPS dilakukan read-only. Tidak ada deploy, restart, migrasi, atau perubahan service live.

## Official Version Research

Primary sources:

- Vue release policy: https://vuejs.org/about/releases
- Vue core release `v3.5.33`: https://github.com/vuejs/core/releases/tag/v3.5.33
- npm registry via `npm view vue version` and `npm view vue dist-tags --json`

Findings per 2026-04-24:

- `npm view vue version` returns `3.5.33`.
- npm dist-tags:
  - `latest`: `3.5.33`
  - `beta`: `3.6.0-beta.10`
  - `alpha`: `3.6.0-alpha.7`
- Vue official release guidance states pre-releases are unstable and should not be used in production.

Conclusion: production-safe latest Vue target is `3.5.33`, not `3.6.0-beta.10`.

## Local Frontend Stack Validation

Workspace path: `/Users/leavend/Desktop/Project_SSO/services/sso-admin-vue`

Locked package versions:

| Package | Locked version |
| --- | --- |
| `vue` | `3.5.33` |
| `vue-router` | `5.0.6` |
| `pinia` | `3.0.4` |
| `vite` | `8.0.10` |
| `@vitejs/plugin-vue` | `6.0.6` |
| `typescript` | `6.0.3` |
| `vitest` | `4.1.5` |
| `@playwright/test` | `1.59.1` |

Relevant local evidence:

- `services/sso-admin-vue/package.json` exposes `typecheck`, `test`, `lint`, `build`, `test:e2e`, and modern Vue/Vite/TS tooling.
- `docker-compose.dev.yml` defines `sso-admin-vue` as an isolated canary service.
- The Vue canary image is tag-addressable through `APP_IMAGE_TAG`.
- The canary route is isolated under `${SSO_ADMIN_VUE_BASE_PATH:-/__vue-preview}`.
- Traefik priority model:
  - backend API/OIDC: priority `200`
  - Vue canary: priority `175`
  - existing Next.js frontend root catch-all: priority `50`

Local QA commands:

| Command | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run test` | PASS, 2 files and 2 tests |
| `npm run lint` | PASS |
| `npm run format:check` | PASS |
| `npm run build` | PASS, Vite production build generated |
| `./scripts/validate-laravel-vue-lifecycle.sh --strict-target` | PASS, 0 failures and 0 warnings |

Conclusion: local workspace meets the production-safe Vue advanced latest target.

## VPS Live Investigation

VPS host: `145.79.15.8`

Live project working directory detected from Docker Compose labels:

- `/opt/sso-prototype-dev`
- Compose config: `/opt/sso-prototype-dev/docker-compose.dev.yml`
- Compose env file label: `/opt/sso-prototype-dev/.env.dev`

Live routing/domain detected from Traefik labels:

- `dev-sso.timeh.my.id`
- backend router priority: `200`
- current frontend root router priority: `50`

Running live SSO containers:

- `sso-prototype-dev-sso-backend-1`: healthy
- `sso-prototype-dev-sso-backend-worker-1`: healthy
- `sso-prototype-dev-sso-frontend-1`: healthy
- `sso-prototype-dev-proxy-1`: healthy
- `sso-prototype-dev-postgres-1`: healthy
- `sso-prototype-dev-redis-1`: healthy
- `sso-prototype-dev-zitadel-api-1`: healthy
- `sso-prototype-dev-zitadel-login-1`: healthy

Live smoke test via Traefik localhost port `18080` with `Host: dev-sso.timeh.my.id`:

| Endpoint | Result |
| --- | --- |
| `/` | `200` |
| `/health` | `200` |
| `/up` | `200` |
| `/.well-known/openid-configuration` | `200` |
| `/__vue-preview/` | `308`, then `404` after redirect |

Public HTTPS smoke from VPS:

| Endpoint | Result |
| --- | --- |
| `https://dev-sso.timeh.my.id/health` | `200` |
| `https://dev-sso.timeh.my.id/.well-known/openid-configuration` | `200` |
| `https://dev-sso.timeh.my.id/__vue-preview/` | `404` |

Important live gap:

- `/opt/sso-prototype-dev/services` contains only `sso-backend` and `sso-frontend`.
- `/opt/sso-prototype-dev/services/sso-admin-vue` does not exist.
- Live `docker-compose.dev.yml` does not contain `sso-admin-vue`, `__vue-preview`, or `SSO_ADMIN_VUE_BASE_PATH`.
- Live `/opt/sso-prototype-dev` is not a git working tree.
- Live `scripts` contains only `deploy-frontend-smoke.sh` and `deploy.sh`.
- Live `scripts/vps-deploy.sh` does not exist.
- Live `scripts/vps-rollback.sh` does not exist.

Conclusion: VPS live SSO is healthy for existing service paths, but it is not yet running the Vue canary frontend from the current workspace.

## Operational Risks

Two app containers are currently unhealthy:

- `sso-prototype-dev-app-a-next-1`
  - health: `unhealthy`
  - failing streak: `17651`
  - health output: `HTTP/1.1 500 Internal Server Error`
- `sso-prototype-dev-app-b-laravel-1`
  - health: `unhealthy`
  - failing streak: `14100`
  - health output: `bad address 'dev-sso.timeh.my.id'`

These do not block the observed SSO backend/frontend smoke tests, but they should block any full-stack zero-downtime release gate unless explicitly waived for an admin-Vue-only canary release.

## Software Lifecycle Decision

### Zero Downtime

The current workspace design supports zero-downtime Vue rollout because the Vue frontend is isolated behind `__vue-preview` and does not replace the root Next.js frontend. Backend OIDC/API routes keep higher Traefik priority.

Live VPS is not yet aligned, so zero-downtime update should start with a controlled bootstrap/sync of the new release artifacts and scripts before enabling `sso-admin-vue`.

### Rollback Mechanism

The local workspace contains rollback-oriented scripts and validation:

- `scripts/vps-deploy.sh`
- `scripts/vps-rollback.sh`
- deterministic `APP_IMAGE_TAG`
- GHCR-to-local Compose image retagging
- smoke failure rollback trigger

Live VPS currently does not contain these scripts. They must be shipped to VPS before declaring rollback ready on live.

### Update Zero Downtime

Recommended lifecycle path:

1. Build and tag immutable Vue canary image from the validated workspace.
2. Sync the current release bundle and lifecycle scripts to VPS in a release directory.
3. Keep existing Next.js root frontend online.
4. Bring up only `sso-admin-vue` using the new `APP_IMAGE_TAG`.
5. Smoke `https://dev-sso.timeh.my.id/__vue-preview/healthz`.
6. Smoke `https://dev-sso.timeh.my.id/__vue-preview/`.
7. If smoke fails, run rollback to previous tag or remove the canary service without touching root frontend/backend.
8. Promote from canary to broader routing only after separate approval.

## Final Conclusion

Local repository status:

- PASS: Vue advanced latest production-safe stack is present and validated.
- PASS: Local zero-downtime/rollback lifecycle gates pass.

VPS live status:

- PASS: Existing SSO service is live and responds over HTTPS.
- FAIL/GAP: Vue canary frontend is not deployed on VPS yet.
- FAIL/GAP: VPS does not yet contain the new lifecycle deploy/rollback scripts.
- WARN: `app-a-next` and `app-b-laravel` healthchecks are failing and should be addressed before full-stack rollout.

