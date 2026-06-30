# Phase 18 — Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (or executing-plans) to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Flip `services/sso-admin-frontend` from the legacy Vue-SPA build/deploy wiring to the shipped Nuxt 4 SSR app, run the deferred e2e suites green against real SSR, remove the legacy `src/`, and merge the branch to `main`.

**Architecture:** Four sequenced parts. **A — Deploy infra:** rewire Dockerfile (`dist`→`.output`, drop dead `VITE_*`/ZITADEL build-args, self-contained Nitro runner), CI artifact + build env, `deploy-main.yml` admin build-args, `docker-compose.main.yml` runtime env (`VITE_*`→`ADMIN_APP_BASE_URL`/`NUXT_PUBLIC_*` + session TTLs), `package.json` lint glob. **B — Legacy removal:** delete `src/` + the one `app/` test that hard-references it. **C — SSR e2e harness:** a Nitro mock layer (`test/fixtures/e2e/`) that serves `/api/admin/*` reads server-side (so real SSR renders ready pages, principal/permissions driven by an `e2e_perms` cookie), playwright rewired for Nuxt (port 3000, system Chrome, build+preview the layer), and every `e2e/*.spec.ts` migrated (`admin_locale` cookie not `localStorage`; drop initial-load `page.route` — now SSR-served; keep `page.route` only for mutations + their post-refresh GET; PUT→PATCH). **D — Verify + merge:** full green gate (unit + §3.3 + e2e + `docker build` + image boot), whole-cutover review, merge to `main`.

**Tech Stack:** Nuxt 4.4.8 SSR, Nitro node-server, Playwright 1.59 (system Chrome `channel: 'chrome'`), Docker 29, GitHub Actions, Traefik compose.

## Global Constraints

- **Branch:** `feat/admin-frontend-nuxt4-ssr-swiss-redesign`. Part D merges it to `main`. **No `git push`, no deploy-trigger** — merge only (the user drives the actual deploy).
- **Commit trailer (every commit):** `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **No traceability markers** (`OG#`/`UC###`/`FR###`/`BE-FR###`) anywhere.
- **Nuxt runtime config is read at container START, not build.** Public vars are `NUXT_PUBLIC_*`; private (server-only) vars use their real deployment names (`ADMIN_OIDC_*`, `SSO_INTERNAL_*`, `SESSION_ENCRYPTION_SECRET`, …). The Nuxt build needs NONE of them — drop all `VITE_*` build-args.
- **Nitro node-server `.output` is self-contained** (deps bundled). The runner copies only `.output` and runs `node .output/server/index.mjs`; no separate `node_modules` stage.
- **Container listens on `PORT` (8080)** — Traefik routes to 8080 (`docker-compose.main.yml:359`). Keep `ENV PORT=8080`.
- **e2e locale is the `admin_locale` cookie** (`app/composables/useI18n.ts:9`), NOT `localStorage['dev-sso-admin-locale']`.
- **Backend update verb is PATCH** for sso-error-templates (proxy already fixed Phase 16) — the e2e spec must intercept PATCH, not PUT.
- **Keep the legacy `src/` removal reversible** until the merge: it lives in git history; the delete is one commit.
- **Do NOT weaken the §3.3 leak gate or any unit test** to make the cutover pass.

## Authoritative current state (verified)

- `package.json`: `build: nuxt build`, `start: node .output/server/index.mjs` (already Nuxt); `lint:eslint` still globs `"src/**/*.vue" "app/**/*.vue"`; no `build:web`/`preview:web`.
- `nuxt.config.ts` runtimeConfig — **private:** `adminOidcIssuer`(ADMIN_OIDC_ISSUER), `adminOidcPublicIssuer`(ADMIN_OIDC_PUBLIC_ISSUER), `ssoInternalBaseUrl`(SSO_INTERNAL_BASE_URL), `ssoInternalTokenUrl`(SSO_INTERNAL_TOKEN_URL), `ssoInternalJwksUrl`(SSO_INTERNAL_JWKS_URL), `adminOidcClientId`(ADMIN_OIDC_CLIENT_ID), `adminOidcClientSecret`(ADMIN_OIDC_CLIENT_SECRET), `ssoAdminSessionRedisUrl`(SSO_ADMIN_SESSION_REDIS_URL), `ssoSessionIdleTtlSeconds`(SSO_SESSION_IDLE_TTL_SECONDS), `ssoSessionAbsoluteTtlSeconds`(SSO_SESSION_ABSOLUTE_TTL_SECONDS), `ssoFreshAuthTtlSeconds`(SSO_FRESH_AUTH_TTL_SECONDS), `sessionEncryptionSecret`(SESSION_ENCRYPTION_SECRET). **public:** `adminAppBaseUrl`(ADMIN_APP_BASE_URL), `basePath`(NUXT_PUBLIC_BASE_PATH), `ssoBaseUrl`(NUXT_PUBLIC_SSO_BASE_URL), `ssoWidgetBaseUrl`(NUXT_PUBLIC_SSO_WIDGET_BASE_URL), `docsBaseUrl`(NUXT_PUBLIC_DOCS_BASE_URL), `mockApi`(NUXT_PUBLIC_MOCK_API).
- `Dockerfile`: builder `npm run build`; runner `COPY --from=builder /app/dist ./dist` + `CMD ["node", "dist/server/server/index.js"]` (BOTH wrong for Nuxt) + dead `VITE_*`/`VITE_ZITADEL_ISSUER_URL` ARGs.
- `.github/workflows/sso-admin-frontend.yml`: build job injects `VITE_*` env + uploads `name: dist path: .../dist`.
- `.github/workflows/deploy-main.yml:72-83`: admin matrix entry passes `VITE_*` `build_args`.
- `docker-compose.main.yml:103-122` `x-sso-admin-frontend-env`: has `PORT:8080` + the private vars + dead public `VITE_ADMIN_BASE_URL`/`VITE_PUBLIC_BASE_PATH`/`VITE_SSO_BASE_URL`/`VITE_DOCS_BASE_URL`; missing `ADMIN_APP_BASE_URL`, `NUXT_PUBLIC_*`, session TTLs.
- `vitest.config.ts` already `exclude: [..., 'e2e', 'src']`.
- `app/lib/api/__tests__/mock-api-client.parity.spec.ts` reads `../../../../src/lib/api/mock-api-client.ts` (dies with `src/`). `app/composables/__tests__/useSsoAccountBar.invariant.spec.ts` reads `../sso-frontend/src/...` (PORTAL repo — KEEP).
- `e2e/` specs: 17 `*.spec.ts`. All use `localStorage.setItem('dev-sso-admin-locale','en')` + `page.route('**/api/admin/*')`. `sso-error-templates.spec.ts` intercepts `PUT`. `vue.spec.ts` tests `/forbidden` + `/admin-error`.
- Docker 29 + system Chrome BOTH available locally → image build + e2e verifiable here.

## File Structure

| File | Part | Responsibility |
|---|---|---|
| `services/sso-admin-frontend/Dockerfile` | A | Nuxt build → `.output` runner |
| `services/sso-admin-frontend/package.json` | A | drop `src/**/*.vue` lint glob |
| `.github/workflows/sso-admin-frontend.yml` | A | `.output` artifact, drop VITE build env |
| `.github/workflows/deploy-main.yml` | A | empty admin `build_args` |
| `docker-compose.main.yml` | A | runtime `NUXT_PUBLIC_*`/`ADMIN_APP_BASE_URL` + TTLs |
| `services/sso-admin-frontend/src/` (delete) | B | remove legacy SPA |
| `app/lib/api/__tests__/mock-api-client.parity.spec.ts` (delete) | B | obsolete legacy-parity test |
| `test/fixtures/e2e/nuxt.config.ts` | C | e2e Nuxt layer extending the app |
| `test/fixtures/e2e/server/routes/api/admin/me.get.ts` | C | principal from `e2e_perms` cookie |
| `test/fixtures/e2e/server/routes/api/admin/*.ts` | C | per-domain SSR mock reads |
| `services/sso-admin-frontend/playwright.config.ts` | C | Nuxt webServer, port 3000, Chrome |
| `services/sso-admin-frontend/e2e/_support/e2e.ts` | C | shared helpers (setLocale, setPerms) |
| `services/sso-admin-frontend/e2e/*.spec.ts` | C | migrate each (cookie, drop SSR route, PATCH) |

---

## PART A — Deploy infrastructure rewire

### Task A1: Dockerfile → Nuxt `.output` runner

**Files:** Modify `services/sso-admin-frontend/Dockerfile`

- [ ] **Step 1: Replace the whole Dockerfile**

```dockerfile
# syntax=docker/dockerfile:1
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Nuxt public config is read at RUNTIME from env (see runtimeConfig in
# nuxt.config.ts); the build needs no app env. nuxt prepare was skipped by
# --ignore-scripts in deps, so run the build directly (it prepares as needed).
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

RUN apk upgrade --no-cache \
    && rm -rf /usr/local/lib/node_modules/npm \
        /usr/local/bin/npm \
        /usr/local/bin/npx \
        /usr/local/bin/corepack

# Nitro node-server output is self-contained (deps bundled) — no node_modules.
COPY --from=builder /app/.output ./.output

EXPOSE 8080
CMD ["node", ".output/server/index.mjs"]
```

- [ ] **Step 2: Verify the build locally (produces `.output`, image boots)**

```bash
cd services/sso-admin-frontend
npm run build
test -f .output/server/index.mjs && echo "OUTPUT OK"
docker build -t sso-admin-frontend:cutover-check .
# boot smoke: the server must listen on 8080 and answer (any HTTP status is fine —
# it proves the Nitro server started; no backend/redis needed for a TCP+HTTP probe)
docker run --rm -d --name admincut -p 8089:8080 sso-admin-frontend:cutover-check
sleep 4
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8089/ || true
docker logs admincut | tail -20
docker rm -f admincut
```
Expected: `OUTPUT OK`, `docker build` succeeds, the container logs show Nitro `Listening on http://[::]:8080` (or similar) and curl returns an HTTP status code (likely a redirect/200/500 — the point is the server answered, not the body).

- [ ] **Step 3: Commit**

```bash
git add services/sso-admin-frontend/Dockerfile
git commit -m "build(sso-admin-frontend): Dockerfile → Nuxt .output runner (drop dist/VITE/ZITADEL)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

> If `docker build`/`docker run` is unavailable in the execution env, record that in the task report and rely on `npm run build` + `test -f .output/server/index.mjs` + `node .output/server/index.mjs` boot as the verification; the adversarial review must then scrutinise the Dockerfile paths by inspection.

---

### Task A2: package.json lint glob

**Files:** Modify `services/sso-admin-frontend/package.json:19`

- [ ] **Step 1: Drop the legacy `src/**/*.vue` glob** (only `app/` remains after Part B; doing it now is safe — `eslint` on a glob that matches nothing errors, and `app/**/*.vue` is the live source)

Change line 19 from:
```json
    "lint:eslint": "eslint \"src/**/*.vue\" \"app/**/*.vue\" --cache",
```
to:
```json
    "lint:eslint": "eslint \"app/**/*.vue\" --cache",
```

- [ ] **Step 2: Verify lint still runs**

```bash
cd services/sso-admin-frontend && npm run lint
```
Expected: PASS (oxlint 0 + eslint 0). (`src/` still exists at this point but oxlint `.` already ignores build output; if oxlint flags `src/`, that is handled when `src/` is deleted in Part B — note it and continue.)

- [ ] **Step 3: Commit**

```bash
git add services/sso-admin-frontend/package.json
git commit -m "chore(sso-admin-frontend): eslint lints app/ only (drop legacy src glob)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task A3: CI build job → `.output` artifact, no VITE env

**Files:** Modify `.github/workflows/sso-admin-frontend.yml:73-86`

- [ ] **Step 1: Replace the Build-bundle step + artifact upload**

Replace lines 73-86 (the `Build production bundle` step with its `env:` block and the `Upload dist artifact` step) with:

```yaml
      - name: Build production bundle
        run: npm run build

      - name: Upload .output artifact
        uses: actions/upload-artifact@v7
        with:
          name: nuxt-output
          path: services/sso-admin-frontend/.output
          retention-days: 7
```

(The Nuxt build reads no app env at build time — public config is runtime. Drop the four `VITE_*` env vars.)

- [ ] **Step 2: Validate the workflow YAML parses**

```bash
cd /Users/leavend/Project_SSO && python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/sso-admin-frontend.yml')); print('YAML OK')"
```
Expected: `YAML OK`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/sso-admin-frontend.yml
git commit -m "ci(sso-admin-frontend): build uploads .output, drops VITE build env" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task A4: deploy-main.yml admin build-args

**Files:** Modify `.github/workflows/deploy-main.yml:75-83`

- [ ] **Step 1: Empty the admin `build_args`** (Nuxt build needs none). Replace the admin matrix entry's `build_args: |` block (lines 75-83) so the entry reads:

```yaml
          - service: sso-admin-frontend
            context: ./services/sso-admin-frontend
            dockerfile: ./services/sso-admin-frontend/Dockerfile
            # Nuxt reads its public config at RUNTIME from container env
            # (docker-compose.main.yml x-sso-admin-frontend-env). The image build
            # takes no app build-args.
            build_args: ''
```

- [ ] **Step 2: Validate YAML**

```bash
cd /Users/leavend/Project_SSO && python3 -c "import yaml; yaml.safe_load(open('.github/workflows/deploy-main.yml')); print('YAML OK')"
```
Expected: `YAML OK`. (If the build action rejects an empty `build_args`, omit the key entirely instead — confirm the action's schema; the intent is "no build-args".)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy-main.yml
git commit -m "ci(deploy-main): admin image build takes no VITE build-args (Nuxt runtime config)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task A5: compose runtime env → NUXT_PUBLIC_* + TTLs

**Files:** Modify `docker-compose.main.yml:103-122` (`x-sso-admin-frontend-env` anchor)

- [ ] **Step 1: Replace the four dead public `VITE_*` keys + add the missing public + TTL vars**

In the `x-sso-admin-frontend-env: &sso-admin-frontend-env` block, replace lines 105-108:
```yaml
  VITE_ADMIN_BASE_URL: ${SSO_ADMIN_FRONTEND_URL:-https://admin-sso.timeh.my.id}
  VITE_PUBLIC_BASE_PATH: /
  VITE_SSO_BASE_URL: ${SSO_BASE_URL:-https://api-sso.timeh.my.id}
  VITE_DOCS_BASE_URL: ${SSO_DOCS_BASE_URL:-https://docs.sso.timeh.my.id}
```
with (the Nuxt names the app actually reads — public app origin + public runtime config; `ssoBaseUrl` is the browser-facing portal/front-door, mirroring the front-door issuer below):
```yaml
  # Nuxt public runtimeConfig (read at container start). adminAppBaseUrl is the
  # admin's own public origin; the *front-door* SSO base is the portal origin
  # (browser-facing), consistent with ADMIN_OIDC_PUBLIC_ISSUER below.
  ADMIN_APP_BASE_URL: ${SSO_ADMIN_FRONTEND_URL:-https://admin-sso.timeh.my.id}
  NUXT_PUBLIC_BASE_PATH: ${SSO_ADMIN_FRONTEND_BASE_PATH:-/}
  NUXT_PUBLIC_SSO_BASE_URL: ${SSO_FRONTEND_URL:-https://sso.timeh.my.id}
  NUXT_PUBLIC_DOCS_BASE_URL: ${SSO_DOCS_BASE_URL:-https://docs.sso.timeh.my.id}
  # NUXT_PUBLIC_SSO_WIDGET_BASE_URL intentionally UNSET → same-origin widget
  # (the BFF proxies /widget/* and mints __Host-sso_session at callback).
```

Then, after the existing `SESSION_ENCRYPTION_SECRET` line (122), add the session-TTL vars the Nuxt config reads (so they don't default to empty):
```yaml
  SSO_SESSION_IDLE_TTL_SECONDS: ${SSO_SESSION_IDLE_TTL_SECONDS:-1800}
  SSO_SESSION_ABSOLUTE_TTL_SECONDS: ${SSO_SESSION_ABSOLUTE_TTL_SECONDS:-28800}
  SSO_FRESH_AUTH_TTL_SECONDS: ${SSO_FRESH_AUTH_TTL_SECONDS:-300}
```

> Verify the three TTL defaults against the backend's own session policy before finalising — they must match the IdP's `SSO_SESSION_*` values so the admin BFF's idle/absolute/fresh-auth windows agree with the backend. If the repo's `.env.example` / backend config declares different defaults, use those exact numbers.

- [ ] **Step 2: Validate compose**

```bash
cd /Users/leavend/Project_SSO && docker compose -f docker-compose.main.yml config >/dev/null && echo "COMPOSE OK"
```
Expected: `COMPOSE OK` (compose interpolates + validates; required `:?` vars may need dummy env — if it errors ONLY on `ADMIN_PANEL_CLIENT_SECRET`/`SESSION_ENCRYPTION_SECRET` required-guards, re-run with `ADMIN_PANEL_CLIENT_SECRET=x SESSION_ENCRYPTION_SECRET=x REDIS_PASSWORD=x docker compose ... config`).

- [ ] **Step 3: Commit**

```bash
git add docker-compose.main.yml
git commit -m "deploy(compose): admin runtime env → ADMIN_APP_BASE_URL + NUXT_PUBLIC_* + session TTLs" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## PART B — Remove legacy `src/`

### Task B1: Delete the obsolete legacy-parity test

**Files:** Delete `app/lib/api/__tests__/mock-api-client.parity.spec.ts`

This test asserts the Nuxt `app/` mock-api-client matches the legacy `src/lib/api/mock-api-client.ts` byte-for-byte. Once `src/` is gone the reference is dangling; the migration is complete so the parity guarantee is obsolete.

- [ ] **Step 1: Confirm it is the only `app/` test referencing admin `src/`**

```bash
cd services/sso-admin-frontend && grep -rln "\.\./\.\./\.\./\.\./src/\|'src/\|\"src/" app/ | grep -v sso-frontend
```
Expected: only `app/lib/api/__tests__/mock-api-client.parity.spec.ts` (the portal `useSsoAccountBar.invariant.spec.ts` references `../sso-frontend/src` and must NOT appear).

- [ ] **Step 2: Delete it + verify the suite still green**

```bash
cd services/sso-admin-frontend && git rm app/lib/api/__tests__/mock-api-client.parity.spec.ts && ./node_modules/.bin/vitest run 2>&1 | tail -5
```
Expected: full suite PASS (one fewer file; ~1428).

- [ ] **Step 3: Commit**

```bash
git commit -m "test(sso-admin-frontend): drop obsolete legacy-src mock-api parity test" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task B2: Delete `src/`

**Files:** Delete `services/sso-admin-frontend/src/` (2.2M, 265 files — the legacy Vue SPA)

- [ ] **Step 1: Confirm nothing live imports admin `src/`**

```bash
cd services/sso-admin-frontend && grep -rn "from ['\"].*\\.\\./src/\|@/.*" app/ server/ nuxt.config.ts playwright.config.ts vitest.config.ts 2>/dev/null | grep -E "\\.\\./src/|/src/" | grep -v sso-frontend
```
Expected: NO output (the `@/` alias resolves to `app/` via `srcDir`, not `src/`). If anything prints, STOP and resolve it before deleting.

- [ ] **Step 2: Delete + verify suite + typecheck + lint + build all green**

```bash
cd services/sso-admin-frontend && git rm -r src
./node_modules/.bin/vitest run 2>&1 | tail -5
npm run typecheck 2>&1 | tail -3
npm run lint 2>&1 | tail -3
npm run build 2>&1 | tail -3 && test -f .output/server/index.mjs && echo "BUILD OK"
```
Expected: suite PASS (unchanged count from B1), typecheck exit 0, lint 0/0, `BUILD OK`.

- [ ] **Step 3: Commit**

```bash
git commit -m "chore(sso-admin-frontend): remove legacy Vue SPA src/ (Nuxt app/ is the source)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## PART C — SSR e2e harness

The e2e mock LAYER serves the **SSR-time** `/api/admin/*` GET reads server-side (so a real SSR render shows ready pages); the per-test **principal/permissions** come from an `e2e_perms` cookie the spec sets; **mutations + their post-mutation refresh GET** stay `page.route`-intercepted in the spec (client-side). Read-only domains need no `page.route` at all.

### Task C1: e2e Nitro mock layer — config + principal

**Files:**
- Create `test/fixtures/e2e/nuxt.config.ts`
- Create `test/fixtures/e2e/server/routes/api/admin/me.get.ts`

**Interfaces:**
- Produces: a Nuxt layer extending the app; `GET /api/admin/me` returns `{ principal }` with role `admin` and a permission set parsed from the `e2e_perms` request cookie (comma-separated slugs; when the cookie is absent it grants the FULL admin set so a spec that does not scope permissions still renders).

- [ ] **Step 1: Create the layer config**

```ts
// test/fixtures/e2e/nuxt.config.ts
// e2e Nuxt layer: extends the real admin app and overrides /api/admin/* with
// in-process mock handlers so Playwright drives REAL SSR with no backend/redis.
// More-specific server routes here win over the app's /api/admin/[...] proxy.
export default defineNuxtConfig({
  extends: ['../../..'],
})
```

- [ ] **Step 2: Create the principal route (permissions from `e2e_perms` cookie)**

```ts
// test/fixtures/e2e/server/routes/api/admin/me.get.ts
import { defineEventHandler, getCookie } from 'h3'

const ALL_PERMISSIONS = [
  'admin.dashboard.view',
  'admin.users.read',
  'admin.users.write',
  'admin.users.lock',
  'admin.roles.read',
  'admin.roles.write',
  'admin.clients.read',
  'admin.clients.write',
  'admin.external-idps.read',
  'admin.external-idps.write',
  'admin.ip-access.read',
  'admin.ip-access.write',
  'admin.sessions.terminate',
  'admin.observability.read',
  'admin.security-policy.read',
  'admin.security-policy.write',
  'admin.security-policy.activate',
  'admin.authentication-audit.read',
  'admin.sso-error-templates.write',
  'profile.read',
] as const

export default defineEventHandler((event) => {
  const cookie = getCookie(event, 'e2e_perms')
  const permissions =
    cookie && cookie.length > 0
      ? cookie.split(',').map((p) => p.trim()).filter(Boolean)
      : [...ALL_PERMISSIONS]
  const capabilities = Object.fromEntries(permissions.map((p) => [p, true]))

  return {
    principal: {
      subject_id: 'sub-e2e-admin',
      email: 'admin@dev-sso.local',
      display_name: 'Admin User',
      given_name: 'Admin',
      family_name: 'User',
      role: 'admin',
      last_login_at: null,
      auth_context: {
        auth_time: null,
        amr: ['pwd', 'mfa'],
        acr: 'urn:example:loa:2',
        mfa_enforced: true,
        mfa_verified: true,
      },
      permissions: {
        view_admin_panel: true,
        manage_sessions: permissions.includes('admin.sessions.terminate'),
        permissions,
        capabilities,
        menus: [],
      },
    },
  }
})
```

- [ ] **Step 3: Commit** (the layer is exercised once C2 + C3 land; no standalone test)

```bash
cd /Users/leavend/Project_SSO/services/sso-admin-frontend
git add test/fixtures/e2e/nuxt.config.ts test/fixtures/e2e/server/routes/api/admin/me.get.ts
git commit -m "test(sso-admin-frontend): e2e Nitro mock layer scaffold + principal route" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task C2: e2e layer — per-domain SSR read fixtures

**Files:** Create `test/fixtures/e2e/server/routes/api/admin/<domain>.ts` for each domain a spec renders.

**Interfaces:** Each handler returns the SAME ready-state shape the page's `useAsyncData` consumes (mirror the corresponding `test/fixtures/ssr-leak/server/routes/api/admin/*` fixture where one exists — they are already correct DTOs). One handler per SSR GET a spec needs: `dashboard/summary`, `users`, `clients`, `oidc-foundation`, `observability/summary`, `roles`, `permissions`, `sessions`, `ip-access-rules`, `sso-error-templates`, `external-idps`, `ops/readiness`, `audit/authentication-events`, plus `[id]` detail handlers where a spec opens a detail page via navigation (users/clients).

- [ ] **Step 1: Reuse the ssr-leak fixtures as the data source**

The `test/fixtures/ssr-leak/server/routes/api/admin/` tree already contains correct ready-state handlers for every domain (they are what the §3.3 gate renders). Copy each into the e2e layer, adjusting only where a spec asserts specific copy. For domains the ssr-leak fixture covers, the handler body is identical.

```bash
cd /Users/leavend/Project_SSO/services/sso-admin-frontend
mkdir -p test/fixtures/e2e/server/routes/api/admin
# Copy every domain read handler EXCEPT me.get.ts (C1 owns the configurable principal)
rsync -a --exclude 'me.get.ts' test/fixtures/ssr-leak/server/routes/api/admin/ test/fixtures/e2e/server/routes/api/admin/
ls -R test/fixtures/e2e/server/routes/api/admin
```

- [ ] **Step 2: Reconcile each handler's data against its spec's assertions**

For each `e2e/<domain>.spec.ts`, open the spec, note the exact strings/testids it asserts in the ready state, and make the matching e2e-layer handler return data that satisfies them (the ssr-leak fixtures were tuned for leak-absence, not for a spec's display assertions, so some values differ). Where a spec asserts a value the ssr-leak fixture lacks, edit the e2e-layer copy only. **Do this per-domain in Task C4 as each spec is migrated** — C2 establishes the handlers; C4 tunes data alongside the spec.

- [ ] **Step 3: Commit the scaffolded handlers**

```bash
git add test/fixtures/e2e/server/routes/api/admin
git commit -m "test(sso-admin-frontend): e2e layer per-domain SSR read fixtures" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task C3: Rewire playwright.config + shared e2e support

**Files:**
- Modify `services/sso-admin-frontend/playwright.config.ts`
- Create `services/sso-admin-frontend/e2e/_support/e2e.ts`

**Interfaces:**
- Produces: `e2e/_support/e2e.ts` exporting `useEnglish(page)` (adds `admin_locale=en` cookie) and `usePermissions(page, perms: string[])` (adds `e2e_perms` cookie) — both add cookies for `127.0.0.1` so they ride the SSR document request.

- [ ] **Step 1: Rewrite playwright.config.ts for Nuxt**

```ts
import process from 'node:process'
import { defineConfig, devices } from '@playwright/test'

// The e2e Nuxt LAYER (test/fixtures/e2e) extends the app and serves /api/admin/*
// mock reads server-side, so real SSR renders ready pages with no backend.
const PORT = 3000
const BASE_URL = `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: './e2e',
  timeout: 30 * 1000,
  expect: { timeout: 5000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: BASE_URL,
    actionTimeout: 0,
    trace: 'on-first-retry',
    headless: true,
    locale: 'en-US',
  },
  // Local dev uses the system Chrome channel (chromium binaries do not download
  // on the maintainer machine); CI uses the bundled chromium.
  projects: process.env.CI
    ? [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }]
    : [{ name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
  webServer: {
    // Build + run the e2e LAYER (not the bare app) so the mock /api/admin/*
    // routes are present under real SSR. nuxt build with --dotenv off; the layer
    // inherits the app via `extends`.
    command:
      'npx nuxt build test/fixtures/e2e && node test/fixtures/e2e/.output/server/index.mjs',
    url: BASE_URL,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 180 * 1000,
    env: { NUXT_PUBLIC_MOCK_API: 'false', PORT: String(PORT) },
  },
})
```

> Confirm the `nuxt build <layerDir>` invocation produces `test/fixtures/e2e/.output` (Nuxt builds the rootDir passed as the positional arg). If the installed nuxt CLI does not accept a positional rootDir, use `nuxi build --cwd test/fixtures/e2e` or set `rootDir` via an env/`--rootDir` flag — verify with the actual CLI in C5 Step 1 and pin the exact command.

- [ ] **Step 2: Create the shared support helpers**

```ts
// e2e/_support/e2e.ts
import type { Page } from '@playwright/test'

// Cookies must be set for the server host so they ride the SSR document request
// (the principal + locale are resolved during SSR, before any client JS).
async function addCookie(page: Page, name: string, value: string): Promise<void> {
  await page.context().addCookies([
    { name, value, domain: '127.0.0.1', path: '/' },
  ])
}

export async function useEnglish(page: Page): Promise<void> {
  await addCookie(page, 'admin_locale', 'en')
}

export async function usePermissions(page: Page, permissions: readonly string[]): Promise<void> {
  await addCookie(page, 'e2e_perms', permissions.join(','))
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/leavend/Project_SSO/services/sso-admin-frontend
git add playwright.config.ts e2e/_support/e2e.ts
git commit -m "test(sso-admin-frontend): playwright → Nuxt SSR layer (port 3000, system Chrome) + cookie helpers" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task C4: Migrate ONE spec end-to-end as the proven template (ops — read-only)

**Files:** Modify `services/sso-admin-frontend/e2e/ops.spec.ts` (smallest read-only domain)

**Interfaces:** Establishes the migration recipe every other spec follows: (1) replace `localStorage` locale with `useEnglish(page)`; (2) `usePermissions(page, [...])` when the domain gates on a permission; (3) DELETE the initial-load `page.route('**/api/admin/<domain>')` (now SSR-served by the layer); (4) keep `page.route` ONLY for mutations + their post-mutation refresh GET; (5) navigate + assert the SSR-rendered ready state.

- [ ] **Step 1: Read the current `e2e/ops.spec.ts`, then rewrite it to the recipe**

Replace its `beforeEach` localStorage block + any initial-load `page.route` with:
```ts
import { expect, test } from '@playwright/test'
import { useEnglish } from './_support/e2e'

test('renders the ops readiness page server-side', async ({ page }) => {
  await useEnglish(page)
  await page.goto('/ops')
  await expect(page.locator('[data-page="ops"]')).toBeVisible()
  // Values come from the e2e layer's ops/readiness handler (SSR).
  await expect(page.getByText('sso-backend')).toBeVisible()
  await expect(page.getByText('Database')).toBeVisible()
})
```
(Adjust the asserted strings to whatever the layer's `ops/readiness.get.ts` returns — keep them in sync.)

- [ ] **Step 2: Run JUST this spec against the layer (proves the whole harness)**

```bash
cd /Users/leavend/Project_SSO/services/sso-admin-frontend && npx playwright test ops.spec.ts 2>&1 | tail -25
```
Expected: PASS. This is the gate that proves: the layer builds, SSR serves `/api/admin/ops/readiness` + `/api/admin/me`, the `admin_locale` cookie renders English, and Chrome drives it. **If it fails, fix the harness here before touching any other spec** — every later spec depends on this working.

- [ ] **Step 3: Commit**

```bash
git add test/fixtures/e2e e2e/ops.spec.ts
git commit -m "test(sso-admin-frontend): migrate ops e2e to SSR layer (proven harness template)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task C5: Migrate the remaining 16 specs to the template

**Files:** Modify each of `e2e/{dashboard,users,clients,oidc-foundation,observability,roles,sessions,ip-access,policy,authentication-audit,profile,external-idps,sso-error-templates,production-smoke,vue}.spec.ts` (+ any not listed). One spec per sub-task; each is independently runnable + committable.

**Recipe (apply per spec; the spec's own assertions dictate the data the layer must return):**
1. Replace the `localStorage.setItem('dev-sso-admin-locale','en')` `beforeEach` with `await useEnglish(page)` at the top of each test (import from `./_support/e2e`).
2. If the domain hides affordances by permission, set `await usePermissions(page, [...])` to the exact slugs the test needs (default-all otherwise).
3. DELETE `page.route` handlers for the **initial GET reads** — the e2e layer serves them under SSR. Tune the layer's matching `<domain>.get.ts` to satisfy the spec's ready-state assertions.
4. KEEP `page.route` for **mutations** (PATCH/POST/DELETE) and for the **post-mutation refresh GET** (so the refreshed list shows the updated row). For `sso-error-templates.spec.ts` change the intercepted method `PUT` → `PATCH`.
5. For `vue.spec.ts` (`/forbidden`, `/admin-error`): these are `layout: false` redirect targets with no `/api/admin/*` read — just swap `localStorage` for `useEnglish` (or drop the locale setup; assert the English copy the page renders by default) and confirm the headings/links still match the shipped pages.
6. `production-smoke.spec.ts`: align to whatever real surface it probes; if it assumes the legacy dev server, point it at the SSR layer and the shipped DOM.

- [ ] **Step 1 (per spec): read it, apply the recipe, run it green**

```bash
cd /Users/leavend/Project_SSO/services/sso-admin-frontend && npx playwright test <spec>.spec.ts 2>&1 | tail -25
```
Expected: PASS. Iterate spec ↔ layer data until green. Do NOT loosen an assertion to pass — fix the layer data or the selector to match the shipped page.

- [ ] **Step 2 (per spec): commit**

```bash
git add e2e/<spec>.spec.ts test/fixtures/e2e
git commit -m "test(sso-admin-frontend): migrate <spec> e2e to SSR layer" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 3: Full e2e suite green**

```bash
cd /Users/leavend/Project_SSO/services/sso-admin-frontend && npx playwright test 2>&1 | tail -30
```
Expected: ALL specs PASS. Record the pass count.

> Subagent parallelisation note: after C4 proves the harness, C5 specs CAN be split across fresh implementers — but they all edit the shared `test/fixtures/e2e/` layer, so either serialise the layer-data edits or give each a dedicated `<domain>.get.ts` (no shared file) and have the controller run the full suite at the end. Prefer serial per-spec on one machine (the webServer is a singleton on port 3000).

---

## PART D — Verify + merge

### Task D1: Whole-cutover green gate (controller-verified DIRECT)

- [ ] **Step 1: Run every gate**

```bash
cd /Users/leavend/Project_SSO/services/sso-admin-frontend
./node_modules/.bin/vitest run 2>&1 | tail -6          # full unit + §3.3 leak gate
npm run typecheck 2>&1 | tail -3
npm run lint 2>&1 | tail -3
npm run build 2>&1 | tail -3 && test -f .output/server/index.mjs && echo "BUILD OK"
npx playwright test 2>&1 | tail -8                      # full e2e
docker build -t sso-admin-frontend:cutover-final . && echo "IMAGE OK"
```
Expected: unit suite PASS (incl. §3.3 gate 44), typecheck 0, lint 0/0, `BUILD OK`, e2e ALL PASS, `IMAGE OK`.

- [ ] **Step 2: Confirm no dangling legacy references**

```bash
cd /Users/leavend/Project_SSO/services/sso-admin-frontend
grep -rn "dist/server\|build:web\|VITE_ZITADEL\|dev-sso-admin-locale" Dockerfile package.json playwright.config.ts e2e/ ../../.github/workflows/sso-admin-frontend.yml 2>/dev/null || echo "NO DANGLING REFS"
test -d src && echo "SRC STILL PRESENT — STOP" || echo "SRC REMOVED"
```
Expected: `NO DANGLING REFS`, `SRC REMOVED`.

### Task D2: Whole-cutover adversarial review

- [ ] **Step 1:** Dispatch a 3-lens review (deploy-correctness / e2e-fidelity / regression-safety) over the full Phase-18 diff range. Apply any blocker fixes, re-run D1.

### Task D3: Merge to `main`

> Outward-facing + irreversible-ish. Only after D1 + D2 are fully green.

- [ ] **Step 1: Confirm branch + clean tree**

```bash
cd /Users/leavend/Project_SSO && git status --short && git rev-parse --abbrev-ref HEAD
```
Expected: clean tree, on `feat/admin-frontend-nuxt4-ssr-swiss-redesign`.

- [ ] **Step 2: Merge (no push, no deploy)**

```bash
cd /Users/leavend/Project_SSO
git checkout main
git merge --no-ff feat/admin-frontend-nuxt4-ssr-swiss-redesign -m "feat(sso-admin-frontend): cut over to Nuxt 4 SSR + Swiss redesign

Replaces the legacy Vue SPA admin console with the full Nuxt 4 SSR app
(16 domain phases + foundation), token-blind Nitro BFF, Swiss design system,
§3.3 SSR token-leak gate, and SSR e2e harness. Deploy wiring flipped to
.output/runtime NUXT_PUBLIC_* config; legacy src/ removed.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
git log --oneline -1
```

- [ ] **Step 3: STOP.** Do NOT `git push` and do NOT trigger a deploy. Report the merge commit + the full green gate to the user; the user drives the production deploy.

---

## Self-Review

**Spec coverage (cutover backlog → task):** Dockerfile `dist`→`.output` (A1); CI artifact path (A3); `NUXT_PUBLIC_*` compose env (A5); deploy build-args (A4); lint glob (A2); remove legacy `src/` (B1/B2); playwright.config rewire + run deferred e2e (C1-C5); merge to main (D3). ✓

**Placeholder scan:** no TBD/"add validation"; the per-spec C5 migrations carry a concrete recipe + run-green gate (their exact diffs depend on each spec's current assertions — read-and-fix is legitimate TDD, not a placeholder). The handful of `>` notes flag real verify-before-finalise points (Docker availability, `nuxt build <dir>` CLI form, compose `:?` guards, TTL defaults), not deferred work. ✓

**Type/contract consistency:** the e2e layer `me.get.ts` principal shape matches `AdminPrincipalResponse` (mirrors `test/fixtures/ssr-leak/.../me.get.ts`); `e2e_perms`/`admin_locale` cookie names match `usePermissions`/`useEnglish` + `useI18n.ts:9`; PATCH (not PUT) matches the Phase-16 proxy + service. ✓

**Risk callouts:** Docker/Chrome confirmed available locally; if a CI/exec env lacks them, A1/D1 degrade to `npm run build` + boot smoke and the review must inspect Dockerfile paths by eye. The merge (D3) is the only irreversible step and is gated behind a full green D1 + D2.

---

## BLOCKER FIXES from 3-lens verify (Workflow w2trrhbeb)

The verify caught a deploy surface the original Part A under-scoped. Deploy lens + migration lens = **fix-blockers** (4 real blockers); e2e lens = **ship** (harness sound, proven by the green §3.3 gate — it uses the identical layer + me.get + route-precedence mechanism), with 3 nits folded. These tasks are LOAD-BEARING — without them the first production deploy bricks the whole Traefik stack (the proxy `depends_on` the admin being `healthy`, and Traefik fronts the backend too).

### Task A1b: Nuxt `/healthz` route (fixes 4 deploy gates)

**Files:** Create `services/sso-admin-frontend/server/routes/healthz.get.ts`

The legacy SPA answered `GET /healthz → 200 'ok'` (`src/server/index.ts:75`); the Nuxt port dropped it. Four gates probe it: `docker-compose.main.yml:346` + `docker-compose.dev.yml:666` healthchecks, `deploy-main.yml` admin smoke, and `scripts/vps-deploy-main.sh:291` + `:369 wait_for_service`. Without it the container never reports healthy.

- [ ] **Step 1: Create the route** (mirror the legacy `no-store` 200)

```ts
// services/sso-admin-frontend/server/routes/healthz.get.ts
import { defineEventHandler, setResponseHeader } from 'h3'

// Liveness probe — restores parity with the legacy Node server (src/server/
// index.ts served GET /healthz → 200 'ok'). Nitro server routes take precedence
// over the Vue catch-all, so this answers 200 with no auth/SSR. Consumed by the
// compose healthchecks, the deploy-main smoke, and vps-deploy-main.sh.
export default defineEventHandler((event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  return 'ok\n'
})
```

- [ ] **Step 2: Verify against the booted app**

```bash
cd services/sso-admin-frontend && npm run build && (node .output/server/index.mjs & SRV=$!; sleep 4; \
  echo "healthz: $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/healthz)"; kill $SRV)
```
Expected: `healthz: 200`.

- [ ] **Step 3: Commit**

```bash
git add services/sso-admin-frontend/server/routes/healthz.get.ts
git commit -m "feat(sso-admin-frontend): restore /healthz liveness route for deploy probes" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task A4b: Rewrite the deploy-main.yml admin production smoke for Nuxt SSR

**Files:** Modify `.github/workflows/deploy-main.yml` — the `Run admin frontend production smoke` step (≈ lines 631-715: the `/` root checks + the entire `/home` block + the `/oidc-foundation` curl).

The shipped Nuxt app diverges from every legacy-SPA assertion: `/` → **302** to `/dashboard` (`app/pages/index.vue` `navigateTo`), cache-control is **`no-store`** (not `private, no-cache`), SSR no-store HTML carries **no etag**, there is **no `/home`** page, and the SSR shell root is **`id="__nuxt"`** (not `id="app"`). KEEP the `/healthz`==200 loop (now satisfied by A1b), the `/auth/login` 302 + Location asserts, and the `/api/admin/me` 401 JSON block — those still match the Nuxt BFF.

- [ ] **Step 1:** Replace everything from `root_headers_file="$(mktemp)"` (the `/` root verification) through the end of the `/home` block + the `curl -fsS .../oidc-foundation` line with the SSR-aware probe below (it asserts an SSR-rendered, anonymous-safe 200 HTML page — `/forbidden` is a `layout:false` public page that renders 200 without a session, the same page `e2e/vue.spec.ts` exercises):

```bash
          # Nuxt SSR serves a real anonymous 200 HTML page at /forbidden (a
          # layout:false public redirect target). / itself 302s to /dashboard and
          # /dashboard requires an admin session, so probe /forbidden for the
          # "SSR shell renders" signal.
          shell_headers_file="$(mktemp)"
          shell_body_file="$(mktemp)"
          shell_status="$(curl -sS --max-time 20 -o "$shell_body_file" -D "$shell_headers_file" -w '%{http_code}' \
            "${admin_url%/}/forbidden")"
          if [ "$shell_status" != "200" ]; then
            echo "expected /forbidden SSR page 200, got HTTP $shell_status" >&2
            cat "$shell_headers_file" >&2; head -c 400 "$shell_body_file" >&2 || true
            exit 1
          fi
          if ! grep -qi '^content-type: text/html' "$shell_headers_file"; then
            echo 'expected /forbidden content-type text/html, got:' >&2
            cat "$shell_headers_file" >&2; exit 1
          fi
          if ! grep -qi '^cache-control: .*no-store' "$shell_headers_file"; then
            echo 'expected /forbidden cache-control no-store (Nuxt authed-app HTML), got:' >&2
            cat "$shell_headers_file" >&2; exit 1
          fi
          if ! grep -qi 'id="__nuxt"' "$shell_body_file"; then
            echo 'expected /forbidden body to be the Nuxt SSR shell (id="__nuxt"), got:' >&2
            head -c 400 "$shell_body_file" >&2 || true; exit 1
          fi
```

- [ ] **Step 2: Validate YAML**

```bash
cd /Users/leavend/Project_SSO && python3 -c "import yaml; yaml.safe_load(open('.github/workflows/deploy-main.yml')); print('YAML OK')"
```
Expected: `YAML OK`.

- [ ] **Step 3: Commit** (fold into the A4 commit, or commit separately)

```bash
git add .github/workflows/deploy-main.yml
git commit -m "ci(deploy-main): admin production smoke for Nuxt SSR (/forbidden 200, no-store, __nuxt)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task A6: Patch `scripts/vps-deploy-main.sh` for the Nuxt admin

**Files:** Modify `scripts/vps-deploy-main.sh` (the `admin_asset` proxy-smoke at ≈ :298-300)

`frontend_asset_path()` greps `/app/dist/client/index.html` for `assets/index-*.js` — the Nuxt `.output` image has no `dist/client` and serves hashed assets under `/_nuxt/*`, so the admin call returns empty → `die 'Unable to resolve sso-admin-frontend asset path'` aborts the deploy. The admin's `/healthz` internal smoke (`:291`) + the compose healthcheck already prove it is up; drop the static-asset proxy smoke for the Nuxt admin (it is a SPA-only manifest probe).

- [ ] **Step 1:** Replace the two admin-asset lines:

```bash
  admin_asset="$(frontend_asset_path sso-admin-frontend)"
  [[ -n "$admin_asset" ]] || die 'Unable to resolve sso-admin-frontend asset path for proxy smoke'
  smoke_proxy_route 'Admin proxy asset' "$admin_host" "/${admin_asset}"
```
with:
```bash
  # sso-admin-frontend is Nuxt SSR (.output) — no dist/client static asset
  # manifest to probe. Its /healthz internal smoke above + the compose
  # service_healthy gate already prove the container + proxy route are live.
  log "Skipping Admin static-asset proxy smoke (Nuxt SSR has no dist/client manifest)."
```

> Confirm the script's log helper name (`log`/`info`/`note`) and use it; if there is none, drop the line entirely (a bare comment suffices).

- [ ] **Step 2: Lint the script**

```bash
cd /Users/leavend/Project_SSO && bash -n scripts/vps-deploy-main.sh && echo "BASH SYNTAX OK"
```
Expected: `BASH SYNTAX OK`.

- [ ] **Step 3: Commit**

```bash
git add scripts/vps-deploy-main.sh
git commit -m "deploy(vps): skip dist/client asset smoke for the Nuxt SSR admin (.output)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task A7: ci.yml + docker-compose.dev.yml + .dockerignore

**Files:** Modify `.github/workflows/ci.yml:208-215`, `docker-compose.dev.yml:651-690`, create `services/sso-admin-frontend/.dockerignore`

- [ ] **Step 1: ci.yml** — drop the four `build-args` (VITE_*/ZITADEL) from the `sso-admin-frontend` matrix entry (the Nuxt build consumes none → they are dead "build-arg not consumed" warnings). Replace the `build-args: |` block with nothing (delete those 5 lines) so the entry ends at `dockerfile:`.

- [ ] **Step 2: docker-compose.dev.yml** — in the `sso-admin-frontend` service: (a) delete the `build.args` VITE_* block (Nuxt build takes no args); (b) keep the `/healthz` healthcheck (now satisfied by A1b); (c) add a runtime `environment:` block mirroring the main anchor's Nuxt names with dev defaults (the dev service currently has NO `environment:`, so the BFF would run with empty OIDC/session config). Add after `init: true`:

```yaml
    environment:
      PORT: 8080
      ADMIN_APP_BASE_URL: ${ADMIN_PANEL_BASE_URL:-http://localhost:8080}
      NUXT_PUBLIC_BASE_PATH: ${SSO_ADMIN_FRONTEND_BASE_PATH:-/}
      NUXT_PUBLIC_SSO_BASE_URL: ${SSO_FRONTEND_URL:-http://localhost:5173}
      NUXT_PUBLIC_DOCS_BASE_URL: ${SSO_DOCS_BASE_URL:-http://localhost:8190}
      ADMIN_OIDC_ISSUER: ${SSO_BASE_URL:-http://sso-backend:8000}
      ADMIN_OIDC_PUBLIC_ISSUER: ${SSO_FRONTEND_URL:-http://localhost:5173}
      ADMIN_OIDC_CLIENT_ID: ${ADMIN_PANEL_CLIENT_ID:-sso-admin-panel}
      ADMIN_OIDC_CLIENT_SECRET: ${ADMIN_PANEL_CLIENT_SECRET:-dev-admin-secret}
      SSO_INTERNAL_BASE_URL: ${SSO_INTERNAL_BASE_URL:-http://sso-backend:8000}
      SSO_INTERNAL_TOKEN_URL: ${SSO_INTERNAL_TOKEN_URL:-http://sso-backend:8000/token}
      SSO_INTERNAL_JWKS_URL: ${SSO_INTERNAL_JWKS_URL:-http://sso-backend:8000/jwks}
      SSO_ADMIN_SESSION_REDIS_URL: ${SSO_ADMIN_SESSION_REDIS_URL:-redis://redis:6379/5}
      SESSION_ENCRYPTION_SECRET: ${SESSION_ENCRYPTION_SECRET:-dev-session-encryption-secret-change-me}
```

> Reconcile these dev defaults with the repo's existing dev `.env` / `docker-compose.dev.yml` variable names before finalising — use whatever the dev stack already defines for the backend origin + redis so the admin BFF talks to the real dev services. The point is parity with how the dev stack is wired, not these literal values.

- [ ] **Step 3: .dockerignore** — create `services/sso-admin-frontend/.dockerignore`:

```
node_modules
.output
.nuxt
.git
dist
*.log
```

- [ ] **Step 4: Validate**

```bash
cd /Users/leavend/Project_SSO
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml')); print('ci OK')"
docker compose -f docker-compose.dev.yml config >/dev/null 2>&1 && echo "dev compose OK" || echo "dev compose needs env (inspect manually)"
```

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml docker-compose.dev.yml services/sso-admin-frontend/.dockerignore
git commit -m "deploy: drop admin VITE build-args (ci+dev), add dev runtime env + .dockerignore" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Changes folded into existing tasks

- **A5 (compose env) — DROP the session-TTL additions.** The admin currently sets no `SSO_SESSION_*` TTLs, so the BFF's code-defaults apply (idle 7d / absolute 30d); adding `28800` (8h) would silently tighten the absolute window. Omit the three TTL lines entirely — keep today's behavior. (If a deliberate admin re-auth window is wanted later, set `SSO_SESSION_ABSOLUTE_TTL_SECONDS=2592000` to match the backend's 30-day session, not 8h.)
- **B2 (delete src/) — also delete the orphaned legacy SPA config** that only references `src/`: `tsconfig.app.json`, `tsconfig.server.json`, `tsconfig.vitest.json`, `vite.config.ts`, `index.html`, and remove the `src/**/*.vue` matcher from `eslint.config.js` + the `src/` line from `.prettierignore` (all inert — root `tsconfig.json` → `.nuxt/*` drives typecheck — but leaving them dangles `src/` references). Verify `npm run typecheck` + `npm run build` + `npm run test` still green after.
- **C1 (e2e me.get) — mirror the ssr-leak menus, not `[]`.** Copy the 4 `menus` entries from `test/fixtures/ssr-leak/.../me.get.ts:75-100` (or derive from capabilities) so any nav-driven spec works. Use the absolute `extends` form `extends: [fileURLToPath(new URL('../../../', import.meta.url))]` (match the proven ssr-leak `nuxt.config.ts`), not the relative `'../../..'`.
- **C3 (playwright) — set `reuseExistingServer: false`** (not `!CI`) so a stale server already on :3000 from a prior build is never silently reused; the webServer rebuilds + serves fresh each run (note the first cold build can approach the 180s budget).
- **C5 (spec migration) — per mutating domain, confirm the post-mutation refresh is a CLIENT `refresh()`/`$fetch`, NOT `navigateTo`/reload.** Our pages call the composable's `refresh()` (client `useAsyncData` refresh) after a mutation, which `page.route` intercepts; a full re-navigation would instead hit the Nitro layer's static handler (original row) and the updated-row assertion would fail. Verified true for ip-access/sso-error-templates (they `await refresh()`); confirm clients/users/roles/policy similarly before relying on `page.route` for the updated row.
- **D1 — assert `/healthz`==200** against the booted image (the original boot-smoke was health-blind).

### Merge note (D3)
The user chose **merge to main once all green**. `main` has not advanced (merge-base..main = 0 commits), so the `--no-ff` merge is conflict-free and regresses nothing. No `git push`, no deploy trigger — the user drives the production deploy via `scripts/vps-deploy-main.sh` (now Nuxt-aware). If `main` carries branch protection requiring a PR, fall back to opening a PR instead of the local merge.
