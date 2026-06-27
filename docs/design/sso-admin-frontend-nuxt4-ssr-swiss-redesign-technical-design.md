# admin-sso → Nuxt 4 (SSR) + Swiss redesign — Design

- **Date:** 2026-06-27
- **Service:** `services/sso-admin-frontend` (prod: `admin-sso.timeh.my.id`)
- **Status:** Approved design — pending implementation plan
- **Standards:** must satisfy `services/sso-admin-frontend/TDD-standart-prod.md` and `services/sso-admin-frontend/standart-quality-code.md` (both updated to the Nuxt stack as a deliverable of this work — see §11)

---

## 1. Context

`sso-admin-frontend` is the **control plane** of a self-hosted SSO Identity Provider. It is a mature, security-critical production service, not a greenfield app:

- **Node BFF** (`src/server/`, ~25 files): OIDC Authorization Code + PKCE flow, Redis session store (encrypted), **Bearer access-token injection** into upstream admin API calls (`admin-proxy.ts`), widget-cookie minting, CSRF/trusted-origin backstop. The browser SPA is **token-blind** — tokens never leave the server.
- **Vue 3 SPA**: 15 governance domains, all built (dashboard, users, clients, audit/observability, roles, policy, sessions, external-idps, ip-access, ops, authentication-audit, profile, oidc-foundation, sso-error-templates), permission-aware Vue Router guards.
- **Bontang design system**: `assets/tokens.css` (OKLCH semantic tokens) + Tailwind v4, 25 UI components.
- **~115 unit tests (Vitest) + 14 e2e (Playwright)**. TDD is mandated by the service standards.
- **Hard invariant:** `SsoAccountBar.vue` + `composables/useSsoAccountBar.ts` are **byte-identical** with the portal frontend copies.

**Goal (one sentence):** replace the stack with **Nuxt 4 (full SSR)** and apply a **total visual redesign to a Swiss anchor**, without weakening the existing security boundary, in a phased, test-first, parity-gated migration.

This is two large, coupled pieces of work (a security-critical stack migration + a total redesign), executed as **one phased project** because the user has accepted the combined risk. The security-sensitive code is ported **test-first** and reviewed before any domain UI is touched.

---

## 2. Decisions (locked at brainstorming)

| Decision | Choice | Why |
|---|---|---|
| Stack | Nuxt 4.4.8 (or latest stable 4.x at build time), Vue 3.5 SFC, TS strict | User directive |
| Rendering | **Full SSR** (`ssr: true`, universal) | User directive; principal/permissions resolve server-side (no client bootstrap flash) |
| BFF | Port the entire security layer into **Nitro `server/`**, test-first | One runtime; clean Nuxt end-state |
| Visual anchor | **Swiss** | Authoritative, handles dense governance/audit tables & RBAC matrices; deliberate (not the dev-tool-default Industrial) |
| Accent | **Yves Klein Blue `#002FA7`** as the single Swiss accent; red used **only** as functional `danger` (destructive) | Keeps brand ≠ destructive semantics in an admin tool full of destructive actions |
| Migration mechanics | **In-place, phased, on a feature branch, parity-gated cutover** | Lowest risk for a prod IdP; keeps tests green each step |
| Widget | Keep `SsoAccountBar.vue` + `useSsoAccountBar.ts` **byte-identical** with portal; wrap render in `<ClientOnly>` | Preserve CLAUDE.md invariant; avoid running browser-only credentialed widget logic during SSR and keep widget data out of the SSR payload |

---

## 3. Non-negotiable security requirements

These hold for the whole project. A phase is not "done" if any is violated.

1. **Backend is the security boundary.** Frontend permission checks are UX/access minimization only; the backend still rejects unauthorized requests. (`AdminGuard`, `EnsureAdminMfaEnrolled`, `EnsureAdminMfaAssurance`, `EnsureFreshAdminAuth`, `RequireAdminPermission`, `RequireAdminSessionManagementRole` remain authoritative.)
2. **No browser token handling.** No access/refresh/ID token, client secret, or credential is created, exchanged, read, stored, or logged in the browser.
3. **SSR token-leak guard (new, mandatory).** Under universal SSR, server-fetched data is serialized into the page payload (`window.__NUXT__`). Tokens, session secrets, and raw PII must **never** enter the SSR HTML or the hydrated payload. Tokens live only in the Nitro request context (`event.context`), read per request from the encrypted session cookie and injected into upstream calls server-side. Only **safe, already-masked DTOs and safe principal fields** (display name, role, capability booleans, menus) hydrate to the client. A dedicated test gate asserts the SSR HTML + `__NUXT__` payload contain no token/secret/raw-PII patterns. This is the SSR equivalent of the existing Phase-6 "no secret in browser" rule.
4. **Same-origin session only.** Admin API calls use same-origin relative paths and the encrypted session cookie; no token headers minted in the browser.
5. **One-time secret discipline.** Client-secret plaintext displays once; never persisted in Pinia/`useState`/storage after the modal closes.

---

## 4. Target architecture

### 4.1 Project layout (Nuxt 4, srcDir `app/`)

```text
services/sso-admin-frontend/
  nuxt.config.ts            # ssr: true, modules, tailwind vite plugin, runtimeConfig
  app/
    app.vue                 # root; <NuxtLayout><NuxtPage/>
    layouts/admin.vue       # AdminShell (sidebar + topbar + account bar)
    pages/                  # file-based routes (see §5)
    middleware/
      admin-guard.global.ts # role + permission gate; bootstrap-failure routing
    components/             # Swiss UI library + domain components (auto-import)
    composables/
      useSsoAccountBar.ts   # BYTE-IDENTICAL with portal
    components/SsoAccountBar.vue  # BYTE-IDENTICAL with portal
    stores/                 # Pinia (session.store.ts, domain stores)
    lib/api/api-client.ts   # typed client over $fetch/useRequestFetch
    services/               # domain API wrappers (no direct $fetch in pages)
    types/                  # DTOs (readonly), error model
    assets/
      tokens.css            # Swiss tokens
      main.css              # Tailwind v4 + token → utility mapping
  server/                   # Nitro BFF (security crown jewels)
    middleware/session.ts   # resolve session → event.context (server-only)
    routes/auth/{login,callback,logout,refresh}.ts
    routes/api/admin/[...].ts   # proxy + Bearer injection
    routes/widget/[...].ts      # widget proxy
    utils/{session-store,session-crypto,session-resolver,cookies,config,widget-cookie,proxy-headers,user-api}.ts
  server/__tests__/         # ported BFF tests (test-first)
  e2e/                      # Playwright (updated selectors)
```

Old `src/` Vue SPA + `src/server/` Node BFF stay in place until parity is reached, then are removed at cutover (§10).

### 4.2 Rendering + data flow (SSR)

1. Request hits Nitro. `server/middleware/session.ts` reads `__Host-sso-admin-session`, resolves the encrypted session from Redis, attaches `event.context.session` (incl. `accessToken`) — **server-only, never serialized**.
2. The global route middleware ensures a **principal** (from `/api/admin/me` via the Nitro proxy) and enforces role + page `permissions`.
3. Page-level `useAsyncData`/`useFetch` call Nitro `server/routes/api/admin/*`, which inject the Bearer token from `event.context` and forward to the backend over `SSO_INTERNAL_BASE_URL`.
4. Backend returns DTOs. Only **safe/masked** DTOs and safe principal fields are returned to the page and serialized into the payload.
5. Client hydrates with safe state only. Subsequent client-side navigation re-uses `useState` and calls the same Nitro routes (cookies forwarded automatically).

### 4.3 BFF port (Nitro) — 1:1 behavioral parity

Port from `src/server/` with identical semantics (env var names, cookie names/prefixes, TTLs, PKCE/nonce/code-verifier validation, JWKS verification, token rotation, revocation on logout, widget-cookie minting from the ID token `sid` claim). Env vars unchanged: `ADMIN_OIDC_ISSUER`, `ADMIN_OIDC_PUBLIC_ISSUER`, `SSO_INTERNAL_BASE_URL`, `SSO_INTERNAL_TOKEN_URL`, `SSO_INTERNAL_JWKS_URL`, `ADMIN_OIDC_CLIENT_ID`, `ADMIN_OIDC_CLIENT_SECRET`, `SSO_ADMIN_SESSION_REDIS_URL`, `SSO_SESSION_IDLE_TTL_SECONDS`, `SSO_SESSION_ABSOLUTE_TTL_SECONDS`, `SSO_FRESH_AUTH_TTL_SECONDS`, `SESSION_ENCRYPTION_SECRET`, `ADMIN_APP_BASE_URL`. Surfaced via Nuxt `runtimeConfig` (private = server-only; public = safe only).

---

## 5. Routing + permission model

File-based pages mirror the current route table; permission strings are the **existing backend contract**, unchanged.

| Path | Page file | `permissions` meta |
|---|---|---|
| `/` → `/dashboard` | redirect | — |
| `/dashboard` | `pages/dashboard.vue` | `admin.dashboard.view` |
| `/oidc-foundation` | `pages/oidc-foundation.vue` | `admin.dashboard.view` |
| `/clients` | `pages/clients/index.vue` | `admin.clients.read` |
| `/clients/new` | `pages/clients/new.vue` | `admin.clients.write` |
| `/users` | `pages/users/index.vue` | `admin.users.read` |
| `/users/new` | `pages/users/new.vue` | `admin.users.write` |
| `/observability` | `pages/observability/index.vue` | `admin.observability.read` |
| `/observability/compliance` | `pages/observability/compliance.vue` | `admin.observability.read` |
| `/sessions` | `pages/sessions.vue` | `admin.sessions.terminate` |
| `/policy` | `pages/policy.vue` | `admin.security-policy.read` |
| `/sso-error-templates` | `pages/sso-error-templates.vue` | `admin.security-policy.read` |
| `/external-idps` | `pages/external-idps.vue` | `admin.external-idps.read` |
| `/ip-access` | `pages/ip-access.vue` | `admin.ip-access.read` |
| `/ops` | `pages/ops.vue` | `admin.dashboard.view` |
| `/roles` | `pages/roles.vue` | `admin.roles.read` |
| `/authentication-audit` | `pages/authentication-audit.vue` | `admin.authentication-audit.read` |
| `/profile` | `pages/profile.vue` | `profile.read` |
| `/forbidden`, `/mfa-required`, `/step-up-required`, `/admin-error`, `/admin-api-unreachable` | error/auth pages | — |
| `/audit`, `/audit/compliance` | redirects → `/observability*` | — |

`definePageMeta({ requiresAdmin: true, permissions: [...] })`. `admin-guard.global.ts` ports `guards.ts`: ensure principal, `hasAdminRole`, `hasEveryPermission`, redirect `/forbidden`, and map bootstrap failures (`mfa_enrollment_required → /mfa-required`, `step_up_required → /step-up-required`, unreachable → `/admin-api-unreachable`).

---

## 6. State + API

- **Pinia** `session.store.ts` ported (`admin-session`): `user`, `principal`, `status`, `lastEnsureResult`; computed `isAuthenticated`, `roles`, `permissions`; `ensureSession`, `hasPermission`, `hasEveryPermission`. Principal hydrated from SSR via `useState` (safe fields only).
- **`api-client.ts`** keeps the typed `get/post/patch/put/delete/getBlob` surface, `ApiError` (status/code/payload/requestId), auto `X-Request-Id` and `Accept-Language`, `credentials: 'include'`. Internally uses `$fetch`/`useRequestFetch` so SSR forwards cookies. **No direct `$fetch` in pages/components** — services only.
- DTOs `readonly`; `unknown` at boundary then normalize; masked vs one-time-plaintext distinguished; no raw secrets in long-lived state.

---

## 7. Swiss design system

### 7.1 Tokens (rewrite `assets/tokens.css`)
- **Surface:** `--bg: #FFFFFF`, `--bg-2: #F7F7F8`, `--card: #FFFFFF`.
- **Ink:** `--fg: #0A0A0A`, `--fg-2: #4A4A4A`, `--fg-3: #767676`.
- **Border:** `--border: #E5E5E7` (1px hairline; **no shadows** as primary structure).
- **Accent:** `--accent: #002FA7` (single Swiss accent, interactive/brand).
- **Semantic:** `--danger: #E4002B` (Swiss red, functional/destructive only — distinct from the blue brand accent), `--success`, `--warning`, `--info` — used for state, never decoration; status always pairs color with label/shape (a11y, "never color alone").
- **Type:** `--font-sans: 'Söhne','Helvetica Neue',Helvetica,Arial,sans-serif` (one family, display + body). `--font-mono` reserved **only** for raw IDs/correlation values (data, not display). No serif display, no Plus Jakarta, no Instrument Serif.
- **Radius:** ~0–2px (sharp; rounded breaks Swiss). **Remove** `--shadow-glass`, `--shadow-glow`, soft shadows.
- Dark mode: a restrained neutral inversion using the same hairline/grid language (kept, since admins work long sessions); status semantics preserved.

### 7.2 Components (port the 25 to Swiss)
UiButton, UiInput, UiSelect, UiSwitch, UiTextarea, UiDialog, UiAlertDialog, UiStatusBadge, UiDetailDrawer, UiEmptyState, UiDataList, UiSkeleton, UiStatusView, UiThemeToggle, FormPageShell, FormSection, UiFormField, AdminShell(Layout), AppLauncher, LocaleSwitcher, ReadinessCard, StatusPill, ConfirmDialog, EvidenceContextPanel, SsoAccountBar. Reka UI keeps a11y primitives; restyle to hairline/grid/flat.

### 7.3 Differentiator (the one memorable Swiss move)
**A literal hairline modular grid with folio numerals.** Record counts (`02 / 14`), timestamps, and correlation/request/session/client IDs are set in condensed sans as composition elements anchored to the grid — in table headers, audit-event rows, and drawer margins. The grid lines are visible 1px hairlines; numerals do compositional work rather than hiding in body text. Visible in the rendered output (not just described).

### 7.4 Content discipline
Standard labels ("Users", "Clients", "Audit events", "Roles", "Security policy") and standard UI copy for standard actions ("New user", "Save", "Cancel", "Export", "Next"). Forbidden: themed copy ("Authenticate session"), mono-caps filler subtitles, `//` kickers, unicode-glyph icons (use Lucide), fabricated telemetry/personas. Mock rows in dev/stories read clearly as sample; real data comes from backend DTOs.

---

## 8. Per-page UX contract (every governance page)

Each page implements all states: **loading · empty · error · forbidden · success**, plus:
- Empty distinguishes "no data" vs "no permission".
- Error shows safe copy + request/correlation ID (never raw backend exception).
- Privileged actions (write/destructive/export/one-time-secret/operational-evidence): confirmation with impact summary; destructive primary disabled until confirmation valid; cancel calls no API; loading/disabled reset after error; fresh-auth/step-up/MFA-assurance state honored when backend requires it; audit/correlation evidence shown or stored appropriately.

---

## 9. Testing strategy (test-first throughout)

- **BFF (Nitro):** port the 10 existing server tests first (RED→GREEN) — auth flow (PKCE/nonce), proxy + Bearer injection, session resolve/refresh/expiry, widget cookie, compression/cache. Behavioral parity is the acceptance bar.
- **SSR leak gate:** a test renders representative pages SSR and asserts HTML + `__NUXT__` contain no token/secret/raw-PII (greps for `accessToken`/`refresh`/known secret env values/NIK-NIP-NISN patterns).
- **Guard/permission matrix (per feature):** unauthenticated → login/expired; non-admin → forbidden; admin w/o permission → forbidden/hidden; admin w/ permission → usable; backend 403 despite UI → safe forbidden.
- **Privileged action (per action):** success; 401; 403; 419; 422; 429; 5xx safe copy; fresh-auth/step-up/MFA; audit/correlation evidence; no stale loading/disabled after error.
- **Component:** Vitest + `@vue/test-utils` (+ Nuxt test utils where SSR context needed).
- **E2E:** Playwright — critical nav, forbidden flow, shell bootstrap, privileged governance flow, one-time secret display, audit/export, role/permission matrix.
- **Verification gates** (per phase + at cutover): `npm run typecheck && npm run lint && npm run format:check && npm run test && npm run build`, plus `npm run test:e2e` for route/nav/governance changes. Blocked commands reported explicitly, never claimed PASS.

---

## 10. Migration mechanics — in-place, phased, parity-gated

- Work on branch `feat/admin-frontend-nuxt4-ssr-swiss-redesign`.
- Scaffold Nuxt+Nitro **alongside** existing `src/`; share nothing that forces a half-broken state.
- Port shared layers first, then BFF (test-first), then shell, then domains one-by-one — keep typecheck/tests green at each commit.
- **Cutover only when** all 15 domains + e2e reach behavioral + visual parity and all gates pass. Then remove old `src/` SPA + `src/server/` BFF, update `package.json` scripts, `Dockerfile`, `vite.config.ts`→`nuxt.config.ts`, and deploy config.
- Rollback path: branch isn't merged until cutover passes; prod stays on the current Vue SPA until then.

---

## 11. Standards docs (deliverable)

Update `TDD-standart-prod.md` and `standart-quality-code.md` to the Nuxt 4 / Nitro / SSR stack **while preserving every principle**: backend = boundary, no browser token, same-origin, permission-aware, test-first, every-feature-audit-sensitive. **Add** the SSR-payload-safety rule (§3.3) as a first-class standard. Replace Vue-Router-5/Vite-specific mechanics with their Nuxt equivalents (file routing, route middleware, `useAsyncData`, Nitro server routes). Dependency-honesty section updated to the real Nuxt dependency set.

---

## 12. Phase breakdown (feeds the implementation plan)

0. **Scaffold:** Nuxt 4 + Nitro + Tailwind v4 + Swiss tokens + `layouts/admin.vue` shell (no domain logic). SSR-leak gate scaffolded. Gates green.
1. **BFF → Nitro** (security crown jewels): port utils + auth routes + admin proxy + widget proxy + session middleware, **test-first**, reviewed via `/code-review` before proceeding.
2. **Shell + plumbing:** layout, `admin-guard.global.ts`, session store, `api-client`, principal hydration (safe-only), Swiss component library, widget (identical + `<ClientOnly>`).
3–17. **Domains, one per phase, test-first:** dashboard, users, clients, observability(+compliance), roles, policy, sessions, external-idps, ip-access, ops, authentication-audit, profile, oidc-foundation, sso-error-templates.
18. **Cutover:** e2e update, full gates, standards-docs update, remove old SPA/BFF, Docker/deploy update, merge.

---

## 13. Open risks

- **SSR token leak** → mitigated by §3.3 gate + server-only `event.context`.
- **OIDC/session regression** → test-first 1:1 port + parity gate + `/code-review` on Phase 1.
- **Widget invariant drift** (portal stays Vue SPA) → keep `.vue` + `.ts` byte-identical; CI/byte-compare check if available.
- **Scope (15 domains)** → strictly phased, parity-gated, no big-bang.
- **Standards drift** → docs updated as a deliverable, not an afterthought.
