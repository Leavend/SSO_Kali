# admin-sso Nuxt 4 (SSR) + Swiss Redesign — Foundation Implementation Plan (Phases 0–2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Execute strictly in order — Phase 1 ports the security boundary and is gated by `/code-review` before any Phase 2 UI work.

**Goal:** Stand up a Nuxt 4 full-SSR foundation for the admin control plane — scaffold, the Nitro BFF (1:1 security port), the app shell + plumbing, and the Swiss design system — that boots, authenticates, and passes every verification gate, with the legacy Vue SPA left intact until cutover.

**Architecture:** Nuxt 4 (`ssr: true`, srcDir `app/`) with Nitro `server/` as the Backend-for-Frontend. OIDC tokens live ONLY in the per-request Nitro `event.context` (read from the encrypted `__Host-` session cookie); pages fetch through Nitro `server/routes/api/admin/*` which inject the Bearer token server-side; only masked DTOs + safe principal fields hydrate to the client. Permission-aware route middleware mirrors the backend contract; the backend remains the security boundary.

**Tech Stack:** Nuxt `^4.4.8` · Vue 3.5 SFC · TypeScript strict · Pinia (`@pinia/nuxt`) · Reka UI · Lucide · Tailwind CSS v4 (`@tailwindcss/vite`) · Nitro · Redis · `jose` · Vitest + `@nuxt/test-utils` · Playwright.

## Global Constraints

Every task's requirements implicitly include this section.

- **Branch:** all work on `feat/admin-frontend-nuxt4-ssr-swiss-redesign`, in-place alongside the legacy `src/` SPA + `src/server/` BFF (untouched until the Phase 18 cutover, in a later plan). All paths under `services/sso-admin-frontend/`.
- **Backend is the security boundary.** Frontend permission checks are UX/access minimization only; the backend still rejects unauthorized requests. Middleware honored: `AdminGuard`, `EnsureAdminMfaEnrolled`, `EnsureAdminMfaAssurance`, `EnsureFreshAdminAuth`, `RequireAdminPermission`, `RequireAdminSessionManagementRole`.
- **No browser token handling.** No access/refresh/ID token, client secret, or credential is created, exchanged, read, stored, or logged in the browser. Tokens stay in Nitro `event.context`.
- **SSR token-leak guard (mandatory, Task 2c.1).** Tokens, session secrets, and raw PII (NIK/NIP/NISN) must never enter the SSR HTML or the hydrated `__NUXT__` payload. Only masked DTOs + safe principal fields (display name, role, capability booleans, menus) hydrate via `useState`.
- **Same-origin session only.** Admin API calls use same-origin relative paths + the encrypted session cookie (`credentials: 'include'`); no token headers minted in the browser.
- **Cookies:** `__Host-` prefix preserved 1:1 — `__Host-sso-admin-session` (Secure, Path=/, HttpOnly, SameSite=Strict), `__Host-sso-admin-tx`, `__Host-sso_session` (widget, SameSite=Lax, minted from id_token `sid`). Names/attrs/TTLs/Redis-key shapes match the legacy BFF exactly.
- **TDD mandatory.** No production code for new behavior without a failing test first (service standard `TDD-standart-prod.md`). Frequent commits; conventional-commit messages ending with the trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Swiss design tokens (anchor fidelity):** surface `#FFFFFF` / `#F7F7F8`; near-black ink; 1px hairline `--border #E5E5E7` (NO shadows/glass/glow as structure); single accent `--accent #002FA7`; `--danger #E4002B` wired ONLY to destructive/danger; font `Söhne`/`Helvetica Neue` (one family); `--font-mono` only for raw IDs; radius 0–2px. No serif display, no second accent, no fabricated data, Lucide icons only (no unicode glyphs), standard UI copy for standard actions.
- **`runtimeConfig` split:** private (server-only) carries the OIDC/session secrets; public carries only `adminAppBaseUrl`, `basePath` (env `NUXT_PUBLIC_BASE_PATH`), `ssoBaseUrl`, `ssoWidgetBaseUrl`, `docsBaseUrl`, `mockApi`. Never promote a secret into `public`.
- **Verification gates** (per phase + at the Phase-0/2b gate tasks): `npm run typecheck && npm run lint && npm run format:check && npm run test && npm run build`; Playwright e2e where route/nav/governance changes land. A blocked command is reported explicitly, never claimed PASS.

---

## Phase 0 — Scaffold

> Goal: a Nuxt 4 app boots **full SSR** with the Swiss token base + an empty admin layout shell, Tailwind v4 wired, Pinia/Reka/Lucide installed, `typecheck`+`lint`+`build`+`test` green. **No domain logic, no BFF logic.** All paths under `services/sso-admin-frontend/`. Work happens on branch `feat/admin-frontend-nuxt4-ssr-swiss-redesign` (in-place, alongside the legacy `src/` SPA + `src/server/` BFF, which stay untouched until cutover in Phase 18). Honors the design spec Global decisions: full SSR (`ssr: true`), Swiss anchor, Klein-blue `#002FA7` accent + red `#E4002B` danger-only, `runtimeConfig` carries the real env-var names with secrets server-only.

---

### Task 0.1: Pin Nuxt 4 dependencies and rewrite npm scripts (initial scaffold commit)

**Files:**
- Modify: `services/sso-admin-frontend/package.json`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: npm scripts `dev` (`nuxt dev`), `build` (`nuxt build`), `preview`, `start`, `postinstall` (`nuxt prepare`), `typecheck`/`type-check` (`nuxt typecheck`), `test` (`vitest run`), `test:unit`, `test:e2e`, `lint`, `format`, `format:check`; the `nuxt` CLI available via `npx nuxt`. Keeps `pinia`, `reka-ui`, `lucide-vue-next`, `tailwindcss`, `@tailwindcss/vite`, `jose`, `redis`, `vue`. Adds dev deps `nuxt@^4.4.8`, `@pinia/nuxt@^0.11.2`, `@nuxt/test-utils@^4.0.3`.

- [ ] **Step 1: Create the feature branch**

```bash
cd services/sso-admin-frontend
git checkout -b feat/admin-frontend-nuxt4-ssr-swiss-redesign
```

- [ ] **Step 2: Verify Nuxt is not yet installed (failing check)**

Run: `npx --no-install nuxt --version`
Expected: FAIL — `npm error could not determine executable to run` (the `nuxt` binary does not exist).

- [ ] **Step 3: Rewrite `package.json` (deps pinned, scripts flipped to Nuxt)**

Replace the file with (legacy deps kept so the old `src/` SPA still type-checks/lints in isolation during the migration; only `nuxt`/`@pinia/nuxt`/`@nuxt/test-utils` are added, and the build/test/dev scripts move to Nuxt):

```json
{
  "name": "sso-admin-frontend",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "nuxt dev",
    "build": "nuxt build",
    "preview": "nuxt preview",
    "start": "node .output/server/index.mjs",
    "postinstall": "nuxt prepare",
    "typecheck": "nuxt typecheck",
    "type-check": "nuxt typecheck",
    "test": "vitest run",
    "test:unit": "vitest",
    "test:e2e": "playwright test",
    "lint": "run-s lint:*",
    "lint:oxlint": "oxlint .",
    "lint:eslint": "eslint \"src/**/*.vue\" \"app/**/*.vue\" --cache",
    "format": "prettier --write --experimental-cli .",
    "format:check": "prettier --check --experimental-cli ."
  },
  "dependencies": {
    "@tailwindcss/vite": "^4.3.0",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "jose": "^6.2.3",
    "lucide-vue-next": "^1.0.0",
    "pinia": "^3.0.4",
    "redis": "^6.0.0",
    "reka-ui": "^2.9.8",
    "tailwind-merge": "^3.6.0",
    "tailwindcss": "^4.3.0",
    "tw-animate-css": "^1.4.0",
    "vue": "^3.5.32",
    "vue-router": "^5.0.4"
  },
  "devDependencies": {
    "@nuxt/test-utils": "^4.0.3",
    "@pinia/nuxt": "^0.11.2",
    "@playwright/test": "^1.59.1",
    "@tsconfig/node24": "^24.0.4",
    "@types/jsdom": "^28.0.1",
    "@types/node": "^24.12.2",
    "@vitejs/plugin-vue": "^6.0.6",
    "@vitest/eslint-plugin": "^1.6.16",
    "@vue/eslint-config-typescript": "^14.7.0",
    "@vue/test-utils": "^2.4.6",
    "@vue/tsconfig": "^0.9.1",
    "eslint": "^9.39.4",
    "eslint-config-prettier": "^10.1.8",
    "eslint-plugin-oxlint": "~1.60.0",
    "eslint-plugin-playwright": "^2.10.1",
    "eslint-plugin-vue": "~10.8.0",
    "jiti": "^2.6.1",
    "jsdom": "^29.0.2",
    "npm-run-all2": "^8.0.4",
    "nuxt": "^4.4.8",
    "oxlint": "~1.60.0",
    "prettier": "3.8.3",
    "typescript": "~6.0.0",
    "vite": "^8.0.16",
    "vitest": "^4.1.4",
    "vue-tsc": "^3.2.6"
  },
  "engines": {
    "node": "^20.19.0 || >=22.12.0"
  }
}
```

- [ ] **Step 4: Install dependencies**

Run: `npm install`
Expected: PASS — adds `nuxt`, `@pinia/nuxt`, `@nuxt/test-utils`. The `postinstall` (`nuxt prepare`) may warn that there is no `nuxt.config.ts` yet; that is expected (config arrives in Task 0.2) and does not fail the install.

- [ ] **Step 5: Verify Nuxt resolves (passing check)**

Run: `npm ls nuxt`
Expected: PASS — prints `└── nuxt@4.4.x` (a 4.x version). Note: `npx nuxt --version` prints the `@nuxt/cli` version (3.x), NOT the framework version — use `npm ls nuxt` to verify the framework.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json
git commit -m "build(sso-admin-frontend): scaffold Nuxt 4 deps + scripts

Pin nuxt@^4.4.8, @pinia/nuxt, @nuxt/test-utils; flip dev/build/test/
typecheck scripts to Nuxt. Legacy src/ SPA deps kept for the in-place
phased migration (removed at cutover).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 0.2: Nuxt SSR config, runtimeConfig stubs, tsconfig, ignore files

**Files:**
- Create: `services/sso-admin-frontend/nuxt.config.ts`
- Create: `services/sso-admin-frontend/.prettierignore`
- Modify: `services/sso-admin-frontend/tsconfig.json`
- Modify: `services/sso-admin-frontend/.gitignore`
- Modify: `services/sso-admin-frontend/.env.example`
- Modify: `services/sso-admin-frontend/eslint.config.js`

**Interfaces:**
- Consumes: npm scripts + `nuxt` CLI from Task 0.1.
- Produces: `ssr: true`, `srcDir: 'app/'`, `compatibilityDate: '2026-06-27'`; `modules: ['@pinia/nuxt', 'reka-ui/nuxt']`; `vite.plugins: [tailwindcss()]`; `css: ['~/assets/main.css']`. `useRuntimeConfig()` keys — **private (server-only):** `adminOidcIssuer`, `adminOidcPublicIssuer`, `ssoInternalBaseUrl`, `ssoInternalTokenUrl`, `ssoInternalJwksUrl`, `adminOidcClientId`, `adminOidcClientSecret`, `ssoAdminSessionRedisUrl`, `ssoSessionIdleTtlSeconds`, `ssoSessionAbsoluteTtlSeconds`, `ssoFreshAuthTtlSeconds`, `sessionEncryptionSecret`; **public:** `adminAppBaseUrl` only. Each is sourced from its real env var name verbatim (`process.env.ADMIN_OIDC_ISSUER`, etc.).

- [ ] **Step 1: Verify config is absent (failing check)**

Run: `test -f nuxt.config.ts && echo present || echo missing`
Expected: FAIL intent — prints `missing`.

- [ ] **Step 2: Create `nuxt.config.ts`**

```ts
import tailwindcss from '@tailwindcss/vite'

// SSR Identity Provider admin control plane.
// Secrets are read from their real deployment env-var names and kept in the
// PRIVATE half of runtimeConfig (server-only). Only adminAppBaseUrl is public.
export default defineNuxtConfig({
  ssr: true,
  srcDir: 'app/',
  compatibilityDate: '2026-06-27',
  devtools: { enabled: true },
  modules: ['@pinia/nuxt', 'reka-ui/nuxt'],
  css: ['~/assets/main.css'],
  vite: {
    plugins: [tailwindcss()],
  },
  runtimeConfig: {
    adminOidcIssuer: process.env.ADMIN_OIDC_ISSUER ?? '',
    adminOidcPublicIssuer: process.env.ADMIN_OIDC_PUBLIC_ISSUER ?? '',
    ssoInternalBaseUrl: process.env.SSO_INTERNAL_BASE_URL ?? '',
    ssoInternalTokenUrl: process.env.SSO_INTERNAL_TOKEN_URL ?? '',
    ssoInternalJwksUrl: process.env.SSO_INTERNAL_JWKS_URL ?? '',
    adminOidcClientId: process.env.ADMIN_OIDC_CLIENT_ID ?? '',
    adminOidcClientSecret: process.env.ADMIN_OIDC_CLIENT_SECRET ?? '',
    ssoAdminSessionRedisUrl: process.env.SSO_ADMIN_SESSION_REDIS_URL ?? '',
    ssoSessionIdleTtlSeconds: process.env.SSO_SESSION_IDLE_TTL_SECONDS ?? '',
    ssoSessionAbsoluteTtlSeconds: process.env.SSO_SESSION_ABSOLUTE_TTL_SECONDS ?? '',
    ssoFreshAuthTtlSeconds: process.env.SSO_FRESH_AUTH_TTL_SECONDS ?? '',
    sessionEncryptionSecret: process.env.SESSION_ENCRYPTION_SECRET ?? '',
    public: {
      adminAppBaseUrl: process.env.ADMIN_APP_BASE_URL ?? '',
    },
  },
})
```

- [ ] **Step 3: Replace `tsconfig.json` with the Nuxt 4 generated-config references**

```json
{
  "files": [],
  "references": [
    { "path": "./.nuxt/tsconfig.app.json" },
    { "path": "./.nuxt/tsconfig.server.json" },
    { "path": "./.nuxt/tsconfig.shared.json" },
    { "path": "./.nuxt/tsconfig.node.json" }
  ]
}
```

- [ ] **Step 4: Append Nuxt build artifacts to `.gitignore`**

Add these lines to the end of `services/sso-admin-frontend/.gitignore`:

```gitignore
# Nuxt
.nuxt
.output
.nitro
.data
```

- [ ] **Step 5: Create `.prettierignore` (so `prettier --check .` skips generated/large files)**

```gitignore
node_modules
dist
.nuxt
.output
.nitro
.data
coverage
playwright-report
test-results
package-lock.json
```

- [ ] **Step 6: Add the new server env-var names to `.env.example`**

Append to `services/sso-admin-frontend/.env.example`:

```bash
# --- Nuxt/Nitro server runtimeConfig (server-only; never exposed to the browser) ---
ADMIN_OIDC_ISSUER=http://localhost:8200
ADMIN_OIDC_PUBLIC_ISSUER=http://localhost:8200
SSO_ADMIN_SESSION_REDIS_URL=redis://localhost:6379
SSO_SESSION_IDLE_TTL_SECONDS=1800
SSO_SESSION_ABSOLUTE_TTL_SECONDS=43200
SSO_FRESH_AUTH_TTL_SECONDS=300
# Public (safe to expose): app base URL only
ADMIN_APP_BASE_URL=http://localhost:3000
```

- [ ] **Step 7: Extend the ESLint files glob to cover `app/**/*.vue`**

In `services/sso-admin-frontend/eslint.config.js`, change the `files` line:

```js
    files: ['src/**/*.vue'],
```

to:

```js
    files: ['src/**/*.vue', 'app/**/*.vue'],
```

- [ ] **Step 8: Verify Nuxt accepts the config and generates types (passing check)**

Run: `npx nuxt prepare`
Expected: PASS — exits 0 and creates `.nuxt/` with `tsconfig.app.json`, `tsconfig.server.json`, `tsconfig.shared.json`, `tsconfig.node.json`. Confirm the public surface holds only `adminAppBaseUrl`:

Run: `node -e "const c=require('fs').readFileSync('nuxt.config.ts','utf8'); const pub=c.slice(c.indexOf('public:')); if(/adminOidcClientSecret|sessionEncryptionSecret/.test(pub)) { throw new Error('secret leaked into public runtimeConfig') } else { console.log('public surface clean') }"`
Expected: PASS — prints `public surface clean`.

- [ ] **Step 9: Commit**

```bash
git add nuxt.config.ts tsconfig.json .gitignore .prettierignore .env.example eslint.config.js
git commit -m "feat(sso-admin-frontend): Nuxt SSR config + runtimeConfig stubs

ssr:true, srcDir app/, Tailwind v4 vite plugin, Pinia + Reka modules.
runtimeConfig maps the real deployment env-var names with all secrets in
the server-only half; only adminAppBaseUrl is public.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 0.3: Swiss design tokens + Tailwind v4 entry stylesheet

**Files:**
- Create: `services/sso-admin-frontend/app/assets/tokens.css`
- Create: `services/sso-admin-frontend/app/assets/main.css`

**Interfaces:**
- Consumes: `css: ['~/assets/main.css']` and the Tailwind vite plugin from Task 0.2.
- Produces: CSS custom properties consumed by every later component/layout — surface `--bg`/`--bg-2`/`--card`, ink `--fg`/`--fg-2`/`--fg-3`, `--border` (1px hairline), `--accent: #002FA7` + `--accent-fg`, `--danger: #E4002B` (+ `--success`/`--warning`/`--info`), `--font-sans` (Söhne/Helvetica), `--font-mono` (IDs only), sharp `--r-sm: 0px`/`--r-md: 2px`, layout `--topbar-h`/`--sidebar-w`/`--content-pad`. Tailwind utility anchors via `@theme inline`: `bg-background`, `text-foreground`, `bg-card`, `border-border`, `text-accent`/`bg-accent`, `text-danger`. A `.dark` / `[data-theme="dark"]` neutral inversion. No shadows, no glass, no serif.

- [ ] **Step 1: Verify the Swiss accent token is absent (failing check)**

Run: `grep -q "#002FA7" app/assets/tokens.css 2>/dev/null && echo found || echo missing`
Expected: FAIL intent — prints `missing`.

- [ ] **Step 2: Create `app/assets/tokens.css` (Swiss base)**

```css
/* Swiss token base for the admin control plane.
   Single accent = Yves Klein Blue (#002FA7). Red is functional danger ONLY.
   Hairline borders, sharp radii, one type family, no shadows/glass. */
:root {
  color-scheme: light;

  /* Surface */
  --bg: #ffffff;
  --bg-2: #f7f7f8;
  --card: #ffffff;

  /* Ink */
  --fg: #0a0a0a;
  --fg-2: #4a4a4a;
  --fg-3: #767676;

  /* Border — 1px hairline is the primary structure (not shadows) */
  --border: #e5e5e7;
  --border-strong: #d0d0d3;

  /* Single Swiss accent */
  --accent: #002fa7;
  --accent-fg: #ffffff;

  /* Semantic state — red is destructive-only, distinct from the brand accent */
  --danger: #e4002b;
  --danger-fg: #ffffff;
  --success: #0a7d33;
  --warning: #b25e00;
  --info: #0046b8;

  /* Type — one family for display + body; mono reserved for raw IDs */
  --font-sans: 'Söhne', 'Helvetica Neue', Helvetica, Arial, sans-serif;
  --font-mono: ui-monospace, 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;

  /* Radius — sharp (rounded breaks Swiss) */
  --r-sm: 0px;
  --r-md: 2px;

  /* Layout */
  --topbar-h: 56px;
  --sidebar-w: 264px;
  --content-pad: 32px;
}

:root.dark,
:root[data-theme='dark'] {
  color-scheme: dark;

  --bg: #0a0a0a;
  --bg-2: #141414;
  --card: #0f0f0f;

  --fg: #fafafa;
  --fg-2: #b5b5b5;
  --fg-3: #8a8a8a;

  --border: #2a2a2a;
  --border-strong: #3a3a3a;

  --accent: #5b7cff;
  --accent-fg: #0a0a0a;

  --danger: #ff5470;
  --danger-fg: #0a0a0a;
  --success: #45c46b;
  --warning: #e0a040;
  --info: #6aa3ff;
}
```

- [ ] **Step 3: Create `app/assets/main.css` (Tailwind v4 + token → utility mapping)**

```css
@import './tokens.css';
@import 'tailwindcss';

@custom-variant dark (&:is(.dark *));

@theme inline {
  --color-background: var(--bg);
  --color-background-2: var(--bg-2);
  --color-foreground: var(--fg);
  --color-foreground-2: var(--fg-2);
  --color-foreground-3: var(--fg-3);
  --color-card: var(--card);
  --color-border: var(--border);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-fg);
  --color-danger: var(--danger);
  --color-danger-foreground: var(--danger-fg);
  --color-success: var(--success);
  --color-warning: var(--warning);
  --color-info: var(--info);

  --font-sans: var(--font-sans);
  --font-mono: var(--font-mono);

  --radius-sm: var(--r-sm);
  --radius-md: var(--r-md);
}

html,
body {
  min-height: 100vh;
  background: var(--bg);
  color: var(--fg);
  font-family: var(--font-sans);
}
```

- [ ] **Step 4: Verify the Swiss tokens are present (passing check)**

Run: `grep -c -e "#002FA7" -e "#E4002B" app/assets/tokens.css`
Expected: PASS — prints `2` (Klein-blue accent and Swiss-red danger both present).

Run: `npx nuxt prepare`
Expected: PASS — exits 0 (the `~/assets/main.css` entry resolves).

- [ ] **Step 5: Commit**

```bash
git add app/assets/tokens.css app/assets/main.css
git commit -m "feat(sso-admin-frontend): Swiss token base + Tailwind v4 entry

Klein-blue #002FA7 single accent, red #E4002B danger-only, hairline
borders, sharp radii, one type family, no shadows/glass. Tokens mapped
to Tailwind utilities via @theme inline; light + dark neutral inversion.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 0.4: Empty admin shell + SSR smoke / leak-gate test harness

**Files:**
- Create: `services/sso-admin-frontend/vitest.config.ts` (replaces the legacy Vite-merged config)
- Create: `services/sso-admin-frontend/test/ssr-smoke.spec.ts`
- Create: `services/sso-admin-frontend/app/app.vue`
- Create: `services/sso-admin-frontend/app/layouts/admin.vue`
- Create: `services/sso-admin-frontend/app/pages/index.vue`

**Interfaces:**
- Consumes: SSR config from Task 0.2; Swiss tokens/utilities from Task 0.3.
- Produces: `<NuxtLayout name="admin">` — the empty AdminShell with a `data-admin-shell` root, hairline sidebar/topbar landmarks, and a default `<slot/>` for pages; `app/pages/index.vue` scaffold landing rendering the literal text `Admin console`; a Vitest config scoped to Nuxt-era tests (`test/**`, `app/**`) that excludes the legacy `src/**` suite; the SSR smoke + token-leak gate at `test/ssr-smoke.spec.ts`. No nav items, no account bar, no domain logic.

> **Toolchain prerequisite (resolved in `fix: align vite to 7.x …`).** `vite`
> is pinned to `^7.3.3` in `package.json` to match `nuxt@4.4.8`'s declared dep.
> A previous `vite@8` top-level pin made two vite majors coexist and broke the
> in-process Nuxt build ("MagicString is not a constructor"). With a single vite
> 7 the **in-process component build works** (`mountSuspended`), which Task 2a.0
> and every 2b component spec depend on. See the "Canonical test patterns" note
> at the end of this task before writing any later spec.

- [ ] **Step 1: Create `vitest.config.ts` (Nuxt test harness, legacy `src/` excluded)**

`defineVitestConfig` (v4.x) auto-splits into TWO vitest projects when the default
`environment` is not `'nuxt'`: a `nuxt`-environment project that matches ONLY
`**/*.nuxt.{test,spec}.*` (and `test/nuxt/**`), and a default project (jsdom
here) for everything else. **Environment routing is therefore by FILENAME, not
the `// @vitest-environment` pragma** (the auto-split projects override the
pragma). Two extra knobs are load-bearing under vite 7 and are documented inline:
the `externalizeForeignTestRunners` plugin (vite 7 import-analysis otherwise
fails on `@nuxt/test-utils`' uninstalled `bun:test`/`@jest/globals`/
`@cucumber/cucumber` dynamic imports — vite 8 externalised them implicitly) and
`environmentOptions.nuxt.domEnvironment: 'jsdom'` (the nuxt project defaults its
internal DOM to happy-dom). The e2e SSR smoke pre-builds via `globalSetup`
(subprocess) — see Step 2.

```ts
import { defineVitestConfig } from '@nuxt/test-utils/config'
import type { Plugin } from 'vite'

const foreignTestRunners = new Set(['bun:test', '@jest/globals', '@cucumber/cucumber'])
const externalizeForeignTestRunners: Plugin = {
  name: 'sso-admin:externalize-foreign-test-runners',
  enforce: 'pre',
  resolveId(id) {
    if (foreignTestRunners.has(id)) return { id, external: true }
  },
}

export default defineVitestConfig({
  plugins: [externalizeForeignTestRunners],
  test: {
    // Subprocess Nuxt build for the e2e SSR smoke only (root cause in
    // test/globalSetup.ts); the component/mountSuspended path builds in-process.
    globalSetup: ['./test/globalSetup.ts'],
    environment: 'jsdom',
    environmentOptions: { nuxt: { domEnvironment: 'jsdom' } },
    include: ['test/**/*.{test,spec}.ts', 'app/**/*.{test,spec}.ts'],
    exclude: ['node_modules', 'dist', '.nuxt', '.output', 'e2e', 'src'],
  },
})
```

- [ ] **Step 2: Write the failing SSR smoke + leak-gate test**

Create `test/ssr-smoke.spec.ts`. Two non-obvious requirements (both proven
empirically): (1) call `setup()` directly in the **async `describe` body**, NOT
in `beforeAll` — in @nuxt/test-utils v4, `setup()` registers its OWN `beforeAll`,
so wrapping it nests the hook and it fires after the tests, leaving `$fetch`
without a URL context. The async-describe form trips the `valid-describe-callback`
lint rule, so it carries a single targeted `eslint-disable-next-line
vitest/valid-describe-callback`. (2) Use `build: false` against the
`globalSetup`-built `.output` and inject the canary as the server **env var**
`NUXT_SESSION_ENCRYPTION_SECRET` — the e2e in-process full `buildNuxt` cannot run
in the vitest worker (browser-first resolve.conditions → MagicString; jsdom
globals → esbuild TextEncoder invariant; the `node` env can't be forced per-file).

```ts
import { describe, it, expect } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils/e2e'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = resolve(fileURLToPath(import.meta.url), '../..')

// eslint-disable-next-line vitest/valid-describe-callback
describe('Phase 0 SSR scaffold', async () => {
  await setup({
    server: true,
    build: false, // pre-built by test/globalSetup.ts; in-process build is blocked
    browser: false,
    nuxtConfig: { nitro: { output: { dir: resolve(rootDir, '.output') } } },
    env: {
      // Private-config leak canary, read by the spawned server at runtime.
      NUXT_SESSION_ENCRYPTION_SECRET: 'leak-canary-do-not-render',
      NUXT_PUBLIC_ADMIN_APP_BASE_URL: 'http://admin.test',
    },
  })

  it('server-renders the empty admin shell', async () => {
    const html = await $fetch('/')
    expect(html).toContain('data-admin-shell')
    expect(html).toContain('Admin console')
  })

  it('does not leak server-only runtimeConfig into the SSR payload', async () => {
    const html = await $fetch('/')
    expect(html).not.toContain('leak-canary-do-not-render')
    expect(html).not.toContain('sessionEncryptionSecret')
    expect(html).not.toContain('adminOidcClientSecret')
  })
})
```

`test/globalSetup.ts` runs `nuxt build` in a subprocess (clean module cache +
real Node globals, so neither the MagicString nor the esbuild constraint
applies) guarded by an atomic lock dir so the build runs exactly once across the
auto-split projects.

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test`
Expected: FAIL — the harness builds a default Nuxt app (no shell yet), so `$fetch('/')` returns the Nuxt welcome page and the first test fails on `expect(html).toContain('data-admin-shell')` (received the welcome HTML, no `data-admin-shell`).

- [ ] **Step 4: Create `app/app.vue` (root → admin layout → page outlet)**

```vue
<template>
  <NuxtLayout name="admin">
    <NuxtPage />
  </NuxtLayout>
</template>
```

- [ ] **Step 5: Create `app/layouts/admin.vue` (empty Swiss shell)**

```vue
<template>
  <div class="admin-shell" data-admin-shell>
    <aside class="admin-shell__sidebar" aria-label="Primary navigation">
      <!-- navigation is wired in a later phase -->
    </aside>
    <header class="admin-shell__topbar">
      <!-- account bar + controls are wired in a later phase -->
    </header>
    <main class="admin-shell__main">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.admin-shell {
  display: grid;
  grid-template-columns: var(--sidebar-w) 1fr;
  grid-template-rows: var(--topbar-h) 1fr;
  grid-template-areas:
    'sidebar topbar'
    'sidebar main';
  min-height: 100vh;
  background: var(--bg);
  color: var(--fg);
}

.admin-shell__sidebar {
  grid-area: sidebar;
  border-right: 1px solid var(--border);
  background: var(--bg-2);
}

.admin-shell__topbar {
  grid-area: topbar;
  border-bottom: 1px solid var(--border);
  background: var(--card);
}

.admin-shell__main {
  grid-area: main;
  padding: var(--content-pad);
}
</style>
```

- [ ] **Step 6: Create `app/pages/index.vue` (scaffold landing)**

```vue
<template>
  <section class="admin-landing">
    <h1 class="admin-landing__title">Admin console</h1>
  </section>
</template>

<style scoped>
.admin-landing__title {
  font-family: var(--font-sans);
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--fg);
}
</style>
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npm run test`
Expected: PASS — `Phase 0 SSR scaffold` → both tests green (`server-renders the empty admin shell`, `does not leak server-only runtimeConfig into the SSR payload`).

- [ ] **Step 8: Commit**

```bash
git add vitest.config.ts test/ssr-smoke.spec.ts app/app.vue app/layouts/admin.vue app/pages/index.vue
git commit -m "feat(sso-admin-frontend): empty admin shell + SSR smoke gate

NuxtLayout admin shell (hairline sidebar/topbar, slot for pages) renders
under full SSR. Vitest+@nuxt/test-utils harness asserts the shell renders
server-side and seeds the token-leak gate (private runtimeConfig canary
never reaches the SSR payload). No domain logic.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

> **Canonical test patterns (every later task follows these).** The harness was
> hardened in the follow-up `fix: align vite to 7.x …` commit, which also added
> `test/component-smoke.nuxt.spec.ts` to prove the in-process component path.
> Environment is selected by FILENAME (the auto-split projects ignore the
> `// @vitest-environment` pragma):
>
> - **(a) e2e SSR test** — plain `*.spec.ts` (default jsdom project). `setup()`
>   from `@nuxt/test-utils/e2e` in the async `describe` body (carry the
>   `eslint-disable-next-line vitest/valid-describe-callback`), `build: false`
>   against the `globalSetup`-built `.output`, assert over `$fetch('/')`. The
>   private-config leak gate injects its canary as a server env var. Reference:
>   `test/ssr-smoke.spec.ts`.
> - **(b) in-process component test** — name the file `*.nuxt.spec.ts` (or put it
>   under `test/nuxt/`); it runs in the auto-created `nuxt` environment project.
>   Use `mountSuspended` / `renderSuspended` from `@nuxt/test-utils/runtime`.
>   Builds in-process, no pre-build. **This is the path Task 2a.0 and all of
>   2b.3–2b.9 use.** Reference: `test/component-smoke.nuxt.spec.ts`:
>
>   ```ts
>   // test/component-smoke.nuxt.spec.ts  (routed to the 'nuxt' env by filename)
>   import { describe, it, expect } from 'vitest'
>   import { mountSuspended } from '@nuxt/test-utils/runtime'
>   import IndexPage from '~/pages/index.vue'
>
>   describe('in-process component (mountSuspended)', () => {
>     it('mounts the real index page', async () => {
>       const wrapper = await mountSuspended(IndexPage)
>       expect(wrapper.text()).toContain('Admin console')
>     })
>   })
>   ```
> - **(c) pure unit test** (server utils / pure fns) — plain `*.spec.ts`, runs in
>   the default jsdom project (DOM also available for `@vue/test-utils` `mount`).

---

### Task 0.5: Phase 0 verification gate (typecheck + lint + format + build + test)

**Files:**
- Modify (formatting only, if any): all Phase 0 scaffold files via `npm run format`

**Interfaces:**
- Consumes: everything produced in Tasks 0.1–0.4.
- Produces: a green Phase 0 Definition-of-Done — `npm run typecheck && npm run lint && npm run format:check && npm run build && npm run test` all pass. This is the parity-gate baseline every later phase must keep green.

- [ ] **Step 1: Canonicalize formatting (failing check first)**

Run: `npm run format:check`
Expected: may FAIL — Prettier flags newly created `.ts`/`.vue`/`.css`/`.json` files that are not yet canonically formatted.

- [ ] **Step 2: Apply formatting**

Run: `npm run format`
Expected: PASS — rewrites any non-canonical files in place.

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS — `nuxt typecheck` runs `vue-tsc` against the generated `.nuxt` tsconfigs and reports 0 errors (only `app/` + Nuxt context are type-checked; legacy `src/` is outside `srcDir` and excluded).

- [ ] **Step 4: Run lint**

Run: `npm run lint`
Expected: PASS — `oxlint .` (respects `.gitignore`, skips `.nuxt`/`.output`) and `eslint` (`src/**/*.vue` + `app/**/*.vue`) both report 0 errors.

- [ ] **Step 5: Run format check**

Run: `npm run format:check`
Expected: PASS — `All matched files use Prettier code style!`

- [ ] **Step 6: Run the production build**

Run: `npm run build`
Expected: PASS — `nuxt build` succeeds and emits `.output/` (`✔ Nuxt build` / `Server built in ...`). Tailwind v4 compiles the Swiss tokens via `@tailwindcss/vite`.

- [ ] **Step 7: Run the test suite**

Run: `npm run test`
Expected: PASS — `test/ssr-smoke.spec.ts` green (2 passed).

- [ ] **Step 8: Commit (skip if `git status` is clean)**

```bash
git add -A
git commit -m "style(sso-admin-frontend): format Nuxt 4 scaffold + green Phase 0 gate

typecheck + lint + format:check + build + test all pass for the SSR
scaffold. Baseline parity gate for the phased migration.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

# Phase 1 — BFF → Nitro (security boundary, test-first)

# Foundation plan — Phase 1 (BFF → Nitro): utility ports

Tasks 1.1–1.10. Each is a **1:1 behavioral port** of a `services/sso-admin-frontend/src/server/` BFF util into the Nitro `services/sso-admin-frontend/server/utils/` tree, **test-first**. Authority: `docs/design/sso-admin-frontend-nuxt4-ssr-swiss-redesign-technical-design.md` (§3, §4.3) and `/tmp/nuxtplan/FIXES.md`. Parity bar: every env var name, cookie name/attribute, TTL, Redis key shape, and crypto framing is preserved from the legacy code.

**Scope deviations from the legacy files (deliberate, FIXES-compliant):**

- `config.ts` **drops** the legacy `publicBasePath` field and the `normalizeBasePath` helper. FIXES pins "never `publicBasePath`"; the deployed base path becomes `runtimeConfig.public.basePath` (env `NUXT_PUBLIC_BASE_PATH`) and is added in Phase 2a, not here. Every OIDC/session env var name is preserved unchanged; `port` is kept (the ported config test asserts it).
- `session.ts` and `session-store.ts` are a **mutual import cycle** (store needs `unixTime` + `PortalSession` from session; session needs the store CRUD). Task 1.4 introduces both files together with an **in-memory dev store** (the legitimate "dev fallback"); Task 1.5 adds the **Redis path + TTL clamp + production guard** on top, test-first. This is additive, never a stub.
- The legacy combined `admin-bff-config.spec.ts` is **split to its owning units**: config assertions → Task 1.1; cookie-name assertions → Task 1.2; `sessionStoreKey` format → Task 1.5.
- Server-shared DTO/principal types from `src/shared/user.ts` are ported to `server/utils/types.ts` (Phase 1 is server-only; the client `app/types/` copy is Phase 2a).
- `response.ts` keeps the legacy `send(res, appResponse)` **and** adds `sendAppResponse(event, appResponse)` (FIXES global contract) — a Nitro adapter that delegates to `send(event.node.res, appResponse)`.
- `cookies.ts` keeps the legacy serialization helpers **and** adds the Nitro `readEventCookie` / `appendEventCookie` adapters over `H3Event.node.req` / `.res`.
- Tasks 1.9 also ports `session-registration.ts` and `proxy-headers.ts` (1:1) because the resolver's ported test exercises both through real code; they are the resolver's earliest consumers and are reused by the proxy route adapters (Tasks 1.12–1.14).

**Conventions for every task below:**

- Test runner command (deterministic single run, no watch): `npx vitest run <path>`.
- Every server test file starts with `// @vitest-environment node` (these utils use `node:crypto`/`node:http`, not jsdom).
- Imports between utils are extensionless relative paths (Nitro/Vite resolution), e.g. `import { getConfig } from './config'`.
- Commit trailer on every commit: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Run on a feature branch `feat/admin-frontend-nuxt4-ssr-swiss-redesign` (already created in Phase 0).

---

### Task 1.1: Port config (`getConfig`) to `server/utils/config.ts`

**Files:**
- Create: `services/sso-admin-frontend/server/utils/config.ts`
- Test: `services/sso-admin-frontend/server/__tests__/config.spec.ts`

**Interfaces:**
- Consumes: `process.env` only (read via internal `env(name)` / `integerEnv(name, fallback)` helpers).
- Produces:
  - `type PortalConfig` (readonly: `issuer`, `authorizeUrl`, `publicAuthorizeUrl`, `tokenUrl`, `jwksUrl`, `logoutUrl`, `internalBaseUrl`, `internalLogoutUrl`, `internalRevocationUrl`, `clientId`, `clientSecret: string | null`, `redirectUri`, `appBaseUrl`, `sessionIdleTtlSeconds`, `sessionAbsoluteTtlSeconds`, `freshAuthTtlSeconds`, `sessionRedisUrl: string | null`, `port`).
  - `getConfig(): PortalConfig`
  - `warnIfClientSecretMissing(config?: PortalConfig): void`

**Steps:**

1. [ ] Write the failing test `server/__tests__/config.spec.ts`:

   ```ts
   // @vitest-environment node
   import { describe, expect, it, vi } from 'vitest'

   describe('admin BFF runtime config', () => {
     it('uses admin host, admin OIDC client, and admin-scoped Redis from env', async () => {
       vi.resetModules()
       vi.stubEnv('VITE_ADMIN_BASE_URL', 'https://admin-sso.example.test')
       vi.stubEnv('VITE_SSO_BASE_URL', 'https://api-sso.example.test')
       vi.stubEnv('ADMIN_OIDC_CLIENT_ID', 'sso-admin-panel')
       vi.stubEnv('ADMIN_OIDC_CLIENT_SECRET', 'admin-bff-secret')
       vi.stubEnv('SSO_ADMIN_SESSION_REDIS_URL', 'redis://redis:6379/5')

       const { getConfig } = await import('../utils/config')

       expect(getConfig()).toMatchObject({
         issuer: 'https://api-sso.example.test',
         appBaseUrl: 'https://admin-sso.example.test',
         clientId: 'sso-admin-panel',
         clientSecret: 'admin-bff-secret',
         redirectUri: 'https://admin-sso.example.test/auth/callback',
         sessionRedisUrl: 'redis://redis:6379/5',
         port: 8080,
       })
     })

     it('keeps issuer validation on the API issuer while sending browser authorization through the portal proxy', async () => {
       vi.resetModules()
       vi.stubEnv('VITE_ADMIN_BASE_URL', 'https://admin-sso.example.test')
       vi.stubEnv('VITE_SSO_BASE_URL', 'https://api-sso.example.test')
       vi.stubEnv('ADMIN_OIDC_PUBLIC_ISSUER', 'https://sso.example.test')

       const { getConfig } = await import('../utils/config')

       expect(getConfig()).toMatchObject({
         issuer: 'https://api-sso.example.test',
         authorizeUrl: 'https://api-sso.example.test/authorize',
         publicAuthorizeUrl: 'https://sso.example.test/authorize',
         tokenUrl: 'https://api-sso.example.test/token',
         jwksUrl: 'https://api-sso.example.test/jwks',
       })
     })
   })
   ```

2. [ ] Run it and expect FAIL: `npx vitest run server/__tests__/config.spec.ts`
   - Expected: `FAIL server/__tests__/config.spec.ts` with `Error: Failed to resolve import "../utils/config"` (the file does not exist yet). Summary: `Test Files 1 failed (1)`.

3. [ ] Implement `server/utils/config.ts` (minimal, real, 1:1 minus `publicBasePath`):

   ```ts
   export type PortalConfig = {
     readonly issuer: string
     readonly authorizeUrl: string
     readonly publicAuthorizeUrl: string
     readonly tokenUrl: string
     readonly jwksUrl: string
     readonly logoutUrl: string
     readonly internalBaseUrl: string
     readonly internalLogoutUrl: string
     readonly internalRevocationUrl: string
     readonly clientId: string
     readonly clientSecret: string | null
     readonly redirectUri: string
     readonly appBaseUrl: string
     readonly sessionIdleTtlSeconds: number
     readonly sessionAbsoluteTtlSeconds: number
     readonly freshAuthTtlSeconds: number
     readonly sessionRedisUrl: string | null
     readonly port: number
   }

   export function getConfig(): PortalConfig {
     // Prefer ADMIN_OIDC_ISSUER (a real BFF runtime var). The VITE_SSO_BASE_URL fallback is
     // a Vite BUILD var and must not be relied on at Node runtime — it can carry a different
     // value at build vs runtime. Set ADMIN_OIDC_ISSUER explicitly in the BFF env.
     const base = env('ADMIN_OIDC_ISSUER') ?? env('VITE_SSO_BASE_URL') ?? 'http://localhost:8200'
     const publicBase = env('ADMIN_OIDC_PUBLIC_ISSUER') ?? base
     const appBase =
       env('VITE_ADMIN_BASE_URL') ?? env('ADMIN_APP_BASE_URL') ?? 'http://localhost:8080'
     const internalBase = env('SSO_INTERNAL_BASE_URL') ?? base

     return {
       issuer: base,
       authorizeUrl: `${base}/authorize`,
       publicAuthorizeUrl: `${publicBase}/authorize`,
       tokenUrl: env('SSO_INTERNAL_TOKEN_URL') ?? `${internalBase}/token`,
       jwksUrl: env('SSO_INTERNAL_JWKS_URL') ?? `${internalBase}/jwks`,
       logoutUrl: `${base}/connect/logout`,
       internalBaseUrl: internalBase,
       internalLogoutUrl: `${internalBase}/connect/logout`,
       internalRevocationUrl: `${internalBase}/revocation`,
       clientId: env('ADMIN_OIDC_CLIENT_ID') ?? env('VITE_CLIENT_ID') ?? 'sso-admin-panel',
       clientSecret: env('ADMIN_OIDC_CLIENT_SECRET') ?? null,
       redirectUri: `${appBase}/auth/callback`,
       appBaseUrl: appBase,
       ...sessionConfig(),
       sessionRedisUrl: env('SSO_ADMIN_SESSION_REDIS_URL') ?? env('REDIS_URL') ?? null,
       port: Number(env('PORT') ?? 8080),
     }
   }

   export function warnIfClientSecretMissing(config: PortalConfig = getConfig()): void {
     if (config.clientSecret) return

     console.error(
       'SECURITY MISCONFIGURATION: ADMIN_OIDC_CLIENT_SECRET is empty; confidential OIDC token operations will fail.',
     )
   }

   function sessionConfig(): Pick<
     PortalConfig,
     'sessionIdleTtlSeconds' | 'sessionAbsoluteTtlSeconds' | 'freshAuthTtlSeconds'
   > {
     const sessionAbsoluteTtlSeconds = integerEnv('SSO_SESSION_ABSOLUTE_TTL_SECONDS', 60 * 60 * 24 * 30)

     return {
       sessionIdleTtlSeconds: integerEnv('SSO_SESSION_IDLE_TTL_SECONDS', 60 * 60 * 24 * 7),
       sessionAbsoluteTtlSeconds,
       freshAuthTtlSeconds: integerEnv('SSO_FRESH_AUTH_TTL_SECONDS', sessionAbsoluteTtlSeconds),
     }
   }

   function env(name: string): string | undefined {
     const value = process.env[name]
     return value && value.length > 0 ? value : undefined
   }

   function integerEnv(name: string, fallback: number): number {
     const parsed = Number.parseInt(env(name) ?? '', 10)
     return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
   }
   ```

4. [ ] Run it and expect PASS: `npx vitest run server/__tests__/config.spec.ts`
   - Expected: `Test Files 1 passed (1)` / `Tests 2 passed (2)`.

5. [ ] Commit:
   ```bash
   git add services/sso-admin-frontend/server/utils/config.ts services/sso-admin-frontend/server/__tests__/config.spec.ts
   git commit -m "feat(sso-admin-frontend): port BFF runtime config to Nitro server util

Ports getConfig() reading process.env with the same OIDC/session env var
names and internal*Url derivations. Drops legacy publicBasePath (Nuxt owns
the deployed base via runtimeConfig.public.basePath in Phase 2a).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
   ```

---

### Task 1.2: Port cookies (`__Host-` names + attrs + Nitro adapter) to `server/utils/cookies.ts`

**Files:**
- Create: `services/sso-admin-frontend/server/utils/cookies.ts`
- Test: `services/sso-admin-frontend/server/__tests__/cookies.spec.ts`

**Interfaces:**
- Consumes: `node:http` `IncomingMessage` (legacy read), `h3` `H3Event` (type-only, Nitro adapters).
- Produces:
  - `const SSO_PORTAL_SESSION_COOKIE = '__Host-sso-admin-session'`
  - `const SSO_PORTAL_TX_COOKIE = '__Host-sso-admin-tx'`
  - `type CookieOptions = { httpOnly?, secure?, sameSite?: 'Strict' | 'Lax' | 'None', path?, maxAge?, expires? }`
  - `readCookie(request: IncomingMessage, name: string): string | null`
  - `serializeCookie(name: string, value: string, options: CookieOptions): string` (throws unless `name` starts with `__Host-`)
  - `hostCookieOptions(maxAge: number): CookieOptions`
  - `expiredHostCookieOptions(): CookieOptions`
  - `readEventCookie(event: H3Event, name: string): string | null` (Nitro adapter over `event.node.req`)
  - `appendEventCookie(event: H3Event, serialized: string): void` (Nitro adapter; accumulates multi-value `set-cookie` on `event.node.res`)

**Steps:**

1. [ ] Write the failing test `server/__tests__/cookies.spec.ts`:

   ```ts
   // @vitest-environment node
   import type { IncomingMessage } from 'node:http'
   import type { H3Event } from 'h3'
   import { describe, expect, it } from 'vitest'
   import {
     SSO_PORTAL_SESSION_COOKIE,
     SSO_PORTAL_TX_COOKIE,
     appendEventCookie,
     expiredHostCookieOptions,
     hostCookieOptions,
     readCookie,
     readEventCookie,
     serializeCookie,
   } from '../utils/cookies'

   function makeReq(cookie?: string): IncomingMessage {
     return { headers: cookie ? { cookie } : {} } as unknown as IncomingMessage
   }

   function makeEvent(cookie?: string): {
     event: H3Event
     resHeaders: Record<string, string | string[] | undefined>
   } {
     const resHeaders: Record<string, string | string[] | undefined> = {}
     const event = {
       node: {
         req: makeReq(cookie),
         res: {
           getHeader: (name: string) => resHeaders[name],
           setHeader: (name: string, value: string | string[]) => {
             resHeaders[name] = value
           },
         },
       },
     } as unknown as H3Event
     return { event, resHeaders }
   }

   describe('admin BFF cookies', () => {
     it('pins the admin __Host- session and transaction cookie names', () => {
       expect(SSO_PORTAL_SESSION_COOKIE).toBe('__Host-sso-admin-session')
       expect(SSO_PORTAL_TX_COOKIE).toBe('__Host-sso-admin-tx')
     })

     it('serializes a __Host- session cookie with Secure, HttpOnly, SameSite=Strict, Path=/ and no Domain', () => {
       const cookie = serializeCookie(SSO_PORTAL_SESSION_COOKIE, 'opaque-id', hostCookieOptions(3600))
       expect(cookie).toContain('__Host-sso-admin-session=opaque-id')
       expect(cookie).toContain('Max-Age=3600')
       expect(cookie).toContain('Path=/')
       expect(cookie).toContain('HttpOnly')
       expect(cookie).toContain('Secure')
       expect(cookie).toContain('SameSite=Strict')
       expect(cookie).not.toMatch(/Domain=/u)
     })

     it('expires a __Host- cookie with Max-Age=0 and the epoch Expires date', () => {
       const cookie = serializeCookie(SSO_PORTAL_SESSION_COOKIE, '', expiredHostCookieOptions())
       expect(cookie).toContain('Max-Age=0')
       expect(cookie).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT')
     })

     it('refuses to serialize a cookie that does not use the __Host- prefix', () => {
       expect(() => serializeCookie('sso-admin-session', 'x', hostCookieOptions(1))).toThrow(
         'Frontend session cookies must use the __Host- prefix.',
       )
     })

     it('reads a cookie from an h3 event request and accumulates multi-value Set-Cookie on the response', () => {
       const { event, resHeaders } = makeEvent('__Host-sso-admin-session=abc; other=1')
       expect(readEventCookie(event, SSO_PORTAL_SESSION_COOKIE)).toBe('abc')
       expect(readCookie(event.node.req, 'other')).toBe('1')

       appendEventCookie(event, serializeCookie(SSO_PORTAL_SESSION_COOKIE, 'one', hostCookieOptions(1)))
       appendEventCookie(event, serializeCookie(SSO_PORTAL_TX_COOKIE, 'two', hostCookieOptions(1)))
       const setCookie = resHeaders['set-cookie']
       expect(Array.isArray(setCookie)).toBe(true)
       expect((setCookie as string[]).length).toBe(2)
       expect((setCookie as string[])[0]).toContain('__Host-sso-admin-session=one')
       expect((setCookie as string[])[1]).toContain('__Host-sso-admin-tx=two')
     })
   })
   ```

2. [ ] Run it and expect FAIL: `npx vitest run server/__tests__/cookies.spec.ts`
   - Expected: `FAIL` with `Error: Failed to resolve import "../utils/cookies"`. Summary: `Test Files 1 failed (1)`.

3. [ ] Implement `server/utils/cookies.ts`:

   ```ts
   import type { IncomingMessage } from 'node:http'
   import type { H3Event } from 'h3'

   export const SSO_PORTAL_SESSION_COOKIE = '__Host-sso-admin-session'
   export const SSO_PORTAL_TX_COOKIE = '__Host-sso-admin-tx'

   export type CookieOptions = {
     readonly httpOnly?: boolean
     readonly secure?: boolean
     readonly sameSite?: 'Strict' | 'Lax' | 'None'
     readonly path?: string
     readonly maxAge?: number
     readonly expires?: Date
   }

   export function readCookie(request: IncomingMessage, name: string): string | null {
     const header = request.headers.cookie
     if (!header) return null

     for (const part of header.split(';')) {
       const [key, ...rest] = part.trim().split('=')
       if (key === name) {
         return decodeURIComponent(rest.join('='))
       }
     }

     return null
   }

   export function serializeCookie(name: string, value: string, options: CookieOptions): string {
     assertSecureCookieName(name)

     const parts = [`${name}=${encodeURIComponent(value)}`]

     if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`)
     if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`)
     if (options.path) parts.push(`Path=${options.path}`)
     if (options.httpOnly) parts.push('HttpOnly')
     if (options.secure) parts.push('Secure')
     if (options.sameSite) parts.push(`SameSite=${options.sameSite}`)

     return parts.join('; ')
   }

   export function hostCookieOptions(maxAge: number): CookieOptions {
     return {
       httpOnly: true,
       maxAge,
       path: '/',
       sameSite: 'Strict',
       secure: true,
     }
   }

   export function expiredHostCookieOptions(): CookieOptions {
     return {
       ...hostCookieOptions(0),
       expires: new Date(0),
     }
   }

   /**
    * Nitro adapter: read a cookie off the H3 event's underlying IncomingMessage,
    * reusing the legacy parser so decode behavior is identical to the Node BFF.
    */
   export function readEventCookie(event: H3Event, name: string): string | null {
     return readCookie(event.node.req as IncomingMessage, name)
   }

   /**
    * Nitro adapter: append one pre-serialized Set-Cookie line to the H3 event's
    * response, preserving every prior cookie (mirrors h3 appendResponseHeader for
    * the multi-valued set-cookie header so session + widget cookies all survive).
    */
   export function appendEventCookie(event: H3Event, serialized: string): void {
     const res = event.node.res
     const existing = res.getHeader('set-cookie')
     const list = Array.isArray(existing)
       ? existing.map(String)
       : existing != null
         ? [String(existing)]
         : []
     res.setHeader('set-cookie', [...list, serialized])
   }

   /**
    * __Host- prefix (RFC 6265bis §4.1.3.2) enforces:
    * - Secure attribute must be set
    * - Path must be "/"
    * - Domain attribute must NOT be set
    * This prevents subdomain cookie leakage and tightens cookie scope.
    */
   function assertSecureCookieName(name: string): void {
     if (!name.startsWith('__Host-')) {
       throw new Error('Frontend session cookies must use the __Host- prefix.')
     }
   }
   ```

4. [ ] Run it and expect PASS: `npx vitest run server/__tests__/cookies.spec.ts`
   - Expected: `Test Files 1 passed (1)` / `Tests 5 passed (5)`.

5. [ ] Commit:
   ```bash
   git add services/sso-admin-frontend/server/utils/cookies.ts services/sso-admin-frontend/server/__tests__/cookies.spec.ts
   git commit -m "feat(sso-admin-frontend): port __Host- cookie helpers + Nitro cookie adapter

1:1 port of cookie names, attributes, and __Host- prefix enforcement; adds
readEventCookie/appendEventCookie adapters over the H3 event node req/res.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
   ```

---

### Task 1.3: Port session-crypto (AES-256-GCM) to `server/utils/session-crypto.ts`

**Files:**
- Create: `services/sso-admin-frontend/server/utils/session-crypto.ts`
- Test: `services/sso-admin-frontend/server/__tests__/session-crypto.spec.ts`

**Interfaces:**
- Consumes: `node:crypto` (`createCipheriv`, `createDecipheriv`, `createHmac`, `randomBytes`); `process.env.SESSION_ENCRYPTION_SECRET`, `process.env.NODE_ENV`.
- Produces:
  - `encryptSession(plaintext: string): string` — base64url of `[12-byte IV][16-byte authTag][ciphertext]`
  - `decryptSession(ciphertext: string): string | null` — returns `null` on any decryption/tamper failure

**Steps:**

1. [ ] Write the failing test `server/__tests__/session-crypto.spec.ts`:

   ```ts
   // @vitest-environment node
   import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

   describe('admin BFF session crypto', () => {
     beforeEach(() => {
       vi.resetModules()
       vi.stubEnv('SESSION_ENCRYPTION_SECRET', 'test-admin-session-secret-32-bytes-long')
     })

     afterEach(() => {
       vi.unstubAllEnvs()
     })

     it('round-trips plaintext through AES-256-GCM', async () => {
       const { encryptSession, decryptSession } = await import('../utils/session-crypto')
       const plaintext = JSON.stringify({ state: 's', nonce: 'n', codeVerifier: 'v' })
       const ciphertext = encryptSession(plaintext)

       expect(ciphertext).not.toContain(plaintext)
       expect(decryptSession(ciphertext)).toBe(plaintext)
     })

     it('returns null when the ciphertext authentication tag is tampered', async () => {
       const { encryptSession, decryptSession } = await import('../utils/session-crypto')
       const ciphertext = encryptSession('top-secret')
       const raw = Buffer.from(ciphertext, 'base64url')
       raw[raw.length - 1] = raw[raw.length - 1] ^ 0xff
       expect(decryptSession(raw.toString('base64url'))).toBeNull()
     })

     it('returns null for a ciphertext shorter than the IV + auth tag framing', async () => {
       const { decryptSession } = await import('../utils/session-crypto')
       expect(decryptSession('AAAA')).toBeNull()
     })
   })
   ```

2. [ ] Run it and expect FAIL: `npx vitest run server/__tests__/session-crypto.spec.ts`
   - Expected: `FAIL` with `Error: Failed to resolve import "../utils/session-crypto"`. Summary: `Test Files 1 failed (1)`.

3. [ ] Implement `server/utils/session-crypto.ts` (1:1):

   ```ts
   import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto'

   const algorithm = 'aes-256-gcm'
   const ivLength = 12
   const authTagLength = 16

   export function encryptSession(plaintext: string): string {
     const key = sessionSecret()
     const iv = randomBytes(ivLength)
     const cipher = createCipheriv(algorithm, key, iv, { authTagLength })
     const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()])
     const authTag = cipher.getAuthTag()

     return Buffer.concat([iv, authTag, encrypted]).toString('base64url')
   }

   export function decryptSession(ciphertext: string): string | null {
     try {
       const key = sessionSecret()
       const raw = Buffer.from(ciphertext, 'base64url')
       if (raw.length < ivLength + authTagLength + 1) return null

       const iv = raw.subarray(0, ivLength)
       const authTag = raw.subarray(ivLength, ivLength + authTagLength)
       const encrypted = raw.subarray(ivLength + authTagLength)
       const decipher = createDecipheriv(algorithm, key, iv, { authTagLength })
       decipher.setAuthTag(authTag)

       return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf-8')
     } catch {
       return null
     }
   }

   function sessionSecret(): Buffer {
     const raw = process.env.SESSION_ENCRYPTION_SECRET ?? ''
     if (raw.length >= 32) return createHmac('sha256', 'sso-admin-session-key').update(raw).digest()
     if (process.env.NODE_ENV === 'production')
       throw new Error('SESSION_ENCRYPTION_SECRET must be configured.')

     return createHmac('sha256', 'sso-admin-session-key').update(fallbackSeed()).digest()
   }

   function fallbackSeed(): string {
     console.warn(
       'SESSION_ENCRYPTION_SECRET is not configured; using origin-scoped fallback. Configure a 32+ character secret for stable sessions.',
     )

     return [
       process.env.VITE_ADMIN_BASE_URL,
       process.env.ADMIN_APP_BASE_URL,
       process.env.ADMIN_OIDC_CLIENT_ID,
       process.env.VITE_CLIENT_ID,
       'sso-admin-runtime-fallback',
     ]
       .filter(Boolean)
       .join('|')
   }
   ```

4. [ ] Run it and expect PASS: `npx vitest run server/__tests__/session-crypto.spec.ts`
   - Expected: `Test Files 1 passed (1)` / `Tests 3 passed (3)`.

5. [ ] Commit:
   ```bash
   git add services/sso-admin-frontend/server/utils/session-crypto.ts services/sso-admin-frontend/server/__tests__/session-crypto.spec.ts
   git commit -m "feat(sso-admin-frontend): port AES-256-GCM session crypto to Nitro util

1:1 port of encryptSession/decryptSession (12-byte IV + 16-byte GCM tag,
base64url framing, HMAC-derived 32-byte key, fail-closed decrypt).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
   ```

---

### Task 1.4: Port session lifecycle + in-memory store to `server/utils/session.ts` (+ `session-store.ts`, `types.ts`)

> `session.ts` and `session-store.ts` are a mutual import cycle, so both land in one commit. The store here is the **in-memory dev fallback**; the Redis path is added test-first in Task 1.5. `types.ts` ports the server-needed DTO/principal types from `src/shared/user.ts`.

**Files:**
- Create: `services/sso-admin-frontend/server/utils/types.ts`
- Create: `services/sso-admin-frontend/server/utils/session-store.ts`
- Create: `services/sso-admin-frontend/server/utils/session.ts`
- Test: `services/sso-admin-frontend/server/__tests__/session.spec.ts`

**Interfaces:**
- Consumes: `getConfig` (1.1); `SSO_PORTAL_SESSION_COOKIE`, `SSO_PORTAL_TX_COOKIE`, `serializeCookie`, `readCookie`, `hostCookieOptions`, `expiredHostCookieOptions` (1.2); `encryptSession`, `decryptSession` (1.3); `node:crypto` `randomBytes`; `node:http` `IncomingMessage`.
- Produces (`session.ts`):
  - `type PortalSession = PortalSessionView & { accessToken; idToken; refreshToken; sub; sid?; displayName; issuedAt; absoluteExpiresAt; lastRefreshedAt; rpSessionRegisteredAt? }`
  - `type AuthTransaction = { state; nonce; codeVerifier; returnTo? }`
  - `getSession(request): Promise<PortalSession | null>`; `readSession(request): Promise<PortalSession | null>`
  - `sessionCookie(session): Promise<string>`; `sessionCookieForId(sessionId, session): string`; `replaceSession(sessionId, session): Promise<void>`
  - `clearSessionCookie(request?): Promise<readonly string[]>`
  - `transactionCookie(tx): string`; `clearTransactionCookie(): string`; `pullTransaction(request): AuthTransaction | null`
  - `sessionFromBootstrap(tokens, principal): PortalSession`; `publicSession(session): PortalSessionView`
  - `isSessionExpired(expiresAt, bufferSeconds?): boolean`; `isSessionAbsoluteExpired(session): boolean`; `unixTime(): number`; `sessionCookieMaxAge(session): number`
- Produces (`session-store.ts`): `createSessionRecord`, `readSessionRecord`, `replaceSessionRecord`, `deleteSessionRecord`, `sessionStoreKey`.
- Produces (`types.ts`): `SsoAuthContext`, `SsoPrincipal`, `PortalSessionView`, `UserProfile`, `ConnectedApp`, `UserSessionSummary`, `ProfileUpdatePayload`.

**Steps:**

1. [ ] Write the failing test `server/__tests__/session.spec.ts`:

   ```ts
   // @vitest-environment node
   import type { IncomingMessage } from 'node:http'
   import { beforeEach, describe, expect, it, vi } from 'vitest'
   import type { SsoPrincipal } from '../utils/types'

   function makeReq(cookie?: string): IncomingMessage {
     return { headers: cookie ? { cookie } : {} } as unknown as IncomingMessage
   }

   function principal(): SsoPrincipal {
     return {
       subjectId: 'sub-admin',
       email: 'admin@example.test',
       displayName: 'Admin User',
       role: 'admin',
       expiresAt: 0,
       authContext: { auth_time: 1_780_000_000, amr: ['pwd', 'mfa'], acr: 'urn:timeh:aal2' },
       lastLoginAt: null,
     }
   }

   describe('admin BFF session lifecycle', () => {
     beforeEach(() => {
       vi.resetModules()
       vi.stubEnv('VITE_ADMIN_BASE_URL', 'https://admin-sso.example.test')
       vi.stubEnv('VITE_SSO_BASE_URL', 'https://api-sso.example.test')
       vi.stubEnv('SESSION_ENCRYPTION_SECRET', 'test-admin-session-secret-32-bytes-long')
       vi.stubEnv('SSO_ADMIN_SESSION_REDIS_URL', '')
       vi.setSystemTime(new Date('2026-06-03T03:00:00Z'))
     })

     it('builds a session from bootstrap tokens with a 30-day absolute expiry', async () => {
       const { sessionFromBootstrap, unixTime } = await import('../utils/session')
       const now = unixTime()
       const session = sessionFromBootstrap(
         { accessToken: 'access-token', idToken: 'id-token', refreshToken: 'refresh-token', expiresAt: now + 3600, sid: 'sid-123' },
         principal(),
       )

       expect(session.accessToken).toBe('access-token')
       expect(session.idToken).toBe('id-token')
       expect(session.refreshToken).toBe('refresh-token')
       expect(session.sub).toBe('sub-admin')
       expect(session.sid).toBe('sid-123')
       expect(session.role).toBe('admin')
       expect(session.absoluteExpiresAt).toBe(now + 60 * 60 * 24 * 30)
     })

     it('publicSession excludes every token and the raw sid field', async () => {
       const { sessionFromBootstrap, publicSession } = await import('../utils/session')
       const session = sessionFromBootstrap(
         { accessToken: 'access-token', idToken: 'id-token', refreshToken: 'refresh-token', expiresAt: 0, sid: 'sid-123' },
         principal(),
       )
       const view = publicSession(session) as Record<string, unknown>

       expect(view).not.toHaveProperty('accessToken')
       expect(view).not.toHaveProperty('idToken')
       expect(view).not.toHaveProperty('refreshToken')
       expect(view).not.toHaveProperty('sid')
       expect(view.subject).toBe('sub-admin')
       expect(view.role).toBe('admin')
     })

     it('treats a session as expired once it is within the buffer window', async () => {
       const { isSessionExpired, unixTime } = await import('../utils/session')
       const now = unixTime()
       expect(isSessionExpired(now + 10, 30)).toBe(true)
       expect(isSessionExpired(now + 120, 30)).toBe(false)
     })

     it('clamps the cookie max-age to the smaller of idle TTL and absolute remaining', async () => {
       const { sessionCookieMaxAge, unixTime } = await import('../utils/session')
       const now = unixTime()
       const base = {
         accessToken: 'a',
         idToken: 'i',
         refreshToken: 'r',
         sub: 'sub-admin',
         subject: 'sub-admin',
         email: 'admin@example.test',
         displayName: 'Admin',
         role: 'admin',
         expiresAt: now + 3600,
         authTime: null,
         amr: [],
         acr: null,
         lastLoginAt: null,
         issuedAt: now,
         lastRefreshedAt: now,
       }
       expect(sessionCookieMaxAge({ ...base, absoluteExpiresAt: now + 100 })).toBe(100)
       expect(sessionCookieMaxAge({ ...base, absoluteExpiresAt: now + 60 * 60 * 24 * 365 })).toBe(60 * 60 * 24 * 7)
     })

     it('round-trips an auth transaction through the encrypted __Host- tx cookie', async () => {
       const { transactionCookie, pullTransaction } = await import('../utils/session')
       const cookie = transactionCookie({ state: 'st', nonce: 'no', codeVerifier: 've', returnTo: '/dashboard' })
       const value = cookie.split(';')[0]
       const tx = pullTransaction(makeReq(value))
       expect(tx).toEqual({ state: 'st', nonce: 'no', codeVerifier: 've', returnTo: '/dashboard' })
     })

     it('persists a session in the in-memory store and reads it back by its opaque cookie id', async () => {
       const { sessionFromBootstrap, sessionCookie, readSession } = await import('../utils/session')
       const session = sessionFromBootstrap(
         { accessToken: 'access-token', idToken: 'id-token', refreshToken: 'refresh-token', expiresAt: 0, sid: 'sid-123' },
         principal(),
       )
       const cookie = (await sessionCookie(session)).split(';')[0]
       const restored = await readSession(makeReq(cookie))
       expect(restored?.accessToken).toBe('access-token')
       expect(restored?.sub).toBe('sub-admin')
     })
   })
   ```

2. [ ] Run it and expect FAIL: `npx vitest run server/__tests__/session.spec.ts`
   - Expected: `FAIL` with `Error: Failed to resolve import "../utils/session"`. Summary: `Test Files 1 failed (1)`.

3. [ ] Implement `server/utils/types.ts`:

   ```ts
   export type SsoAuthContext = {
     readonly auth_time: number | null
     readonly amr: readonly string[]
     readonly acr: string | null
   }

   export type SsoPrincipal = {
     readonly subjectId: string
     readonly email: string
     readonly displayName: string
     readonly role: string
     readonly expiresAt: number
     readonly authContext: SsoAuthContext
     readonly lastLoginAt: string | null
   }

   export type PortalSessionView = {
     readonly subject: string
     readonly email: string
     readonly displayName: string
     readonly role: string
     readonly expiresAt: number
     readonly authTime: number | null
     readonly amr: readonly string[]
     readonly acr: string | null
     readonly lastLoginAt: string | null
   }

   export type UserProfile = {
     readonly profile: {
       readonly subject_id: string
       readonly display_name?: string
       readonly given_name?: string
       readonly family_name?: string
       readonly email?: string
       readonly email_verified?: boolean
       readonly status: string
       readonly profile_synced_at?: string | null
       readonly last_login_at?: string | null
     }
     readonly authorization: {
       readonly scope: string
       readonly roles?: readonly string[]
       readonly permissions?: readonly string[]
     }
     readonly security: {
       readonly session_id: string | null
       readonly mfa_required: boolean
       readonly last_seen_at: string | null
     }
   }

   export type ConnectedApp = {
     readonly client_id: string
     readonly display_name: string
     readonly first_connected_at: string
     readonly last_used_at: string
     readonly expires_at: string
     readonly active_refresh_tokens: number
   }

   export type UserSessionSummary = {
     readonly session_id: string
     readonly opened_at: string
     readonly last_used_at: string
     readonly expires_at: string
     readonly client_count: number
     readonly client_ids: readonly string[]
     readonly client_display_names: readonly string[]
   }

   export type ProfileUpdatePayload = {
     readonly display_name?: string
     readonly given_name?: string
     readonly family_name?: string
   }
   ```

4. [ ] Implement `server/utils/session-store.ts` (in-memory dev store; Redis added in Task 1.5):

   ```ts
   import { randomBytes } from 'node:crypto'
   import type { PortalSession } from './session'
   import { unixTime } from './session'

   const sessionKeyPrefix = 'admin:sessions:'
   const memorySessions = new Map<string, PortalSession>()

   export async function createSessionRecord(session: PortalSession): Promise<string> {
     const sessionId = randomBytes(32).toString('base64url')
     await writeSessionRecord(sessionId, session)
     return sessionId
   }

   export async function readSessionRecord(sessionId: string): Promise<PortalSession | null> {
     const session = await readPersistedSession(sessionId)
     if (!session || session.absoluteExpiresAt <= unixTime()) {
       await deleteSessionRecord(sessionId)
       return null
     }

     return session
   }

   export async function replaceSessionRecord(
     sessionId: string,
     session: PortalSession,
   ): Promise<void> {
     await writeSessionRecord(sessionId, session)
   }

   export async function deleteSessionRecord(sessionId: string): Promise<void> {
     memorySessions.delete(sessionId)
   }

   export function sessionStoreKey(sessionId: string): string {
     return `${sessionKeyPrefix}${sessionId}`
   }

   async function writeSessionRecord(sessionId: string, session: PortalSession): Promise<void> {
     memorySessions.set(sessionId, session)
   }

   async function readPersistedSession(sessionId: string): Promise<PortalSession | null> {
     return memorySessions.get(sessionId) ?? null
   }
   ```

5. [ ] Implement `server/utils/session.ts` (1:1):

   ```ts
   import type { IncomingMessage } from 'node:http'
   import type { PortalSessionView, SsoPrincipal } from './types'
   import { getConfig } from './config'
   import {
     SSO_PORTAL_SESSION_COOKIE,
     SSO_PORTAL_TX_COOKIE,
     expiredHostCookieOptions,
     hostCookieOptions,
     readCookie,
     serializeCookie,
   } from './cookies'
   import { decryptSession, encryptSession } from './session-crypto'
   import {
     createSessionRecord,
     deleteSessionRecord,
     readSessionRecord,
     replaceSessionRecord,
   } from './session-store'

   export type PortalSession = PortalSessionView & {
     readonly accessToken: string
     readonly idToken: string
     readonly refreshToken: string
     readonly sub: string
     readonly sid?: string
     readonly displayName: string
     readonly issuedAt: number
     readonly absoluteExpiresAt: number
     readonly lastRefreshedAt: number
     readonly rpSessionRegisteredAt?: number
   }

   export type AuthTransaction = {
     readonly state: string
     readonly nonce: string
     readonly codeVerifier: string
     readonly returnTo?: string
   }

   export async function getSession(request: IncomingMessage): Promise<PortalSession | null> {
     const session = await readSession(request)
     if (!session || isSessionExpired(session.expiresAt)) return null

     return session
   }

   export async function readSession(request: IncomingMessage): Promise<PortalSession | null> {
     const sessionId = readSessionId(request)
     if (!sessionId) return null

     return readSessionRecord(sessionId)
   }

   export async function sessionCookie(session: PortalSession): Promise<string> {
     return sessionCookieForId(await createSessionRecord(session), session)
   }

   export function sessionCookieForId(sessionId: string, session: PortalSession): string {
     return serializeCookie(
       SSO_PORTAL_SESSION_COOKIE,
       sessionId,
       hostCookieOptions(sessionCookieMaxAge(session)),
     )
   }

   export async function replaceSession(sessionId: string, session: PortalSession): Promise<void> {
     await replaceSessionRecord(sessionId, session)
   }

   export async function clearSessionCookie(request?: IncomingMessage): Promise<readonly string[]> {
     const sessionId = request ? readSessionId(request) : null
     if (sessionId) await deleteSessionRecord(sessionId)

     return [
       serializeCookie(SSO_PORTAL_SESSION_COOKIE, '', expiredHostCookieOptions()),
       // Clear stale admin BFF session cookie variants from browsers.
       serializeCookie('__Host-sso-admin-session-legacy', '', expiredHostCookieOptions()),
     ]
   }

   export function transactionCookie(tx: AuthTransaction): string {
     return serializeCookie(SSO_PORTAL_TX_COOKIE, encryptSession(JSON.stringify(tx)), hostCookieOptions(300))
   }

   export function clearTransactionCookie(): string {
     return serializeCookie(SSO_PORTAL_TX_COOKIE, '', expiredHostCookieOptions())
   }

   export function pullTransaction(request: IncomingMessage): AuthTransaction | null {
     const raw = readCookie(request, SSO_PORTAL_TX_COOKIE)
     if (!raw) return null

     try {
       const decrypted = decryptSession(raw)
       if (!decrypted) return null

       return JSON.parse(decrypted) as AuthTransaction
     } catch {
       return null
     }
   }

   export function sessionFromBootstrap(
     tokens: {
       readonly accessToken: string
       readonly idToken: string
       readonly refreshToken: string
       readonly expiresAt: number
       readonly sid?: string
     },
     principal: SsoPrincipal,
   ): PortalSession {
     const issuedAt = unixTime()

     return {
       accessToken: tokens.accessToken,
       idToken: tokens.idToken,
       refreshToken: tokens.refreshToken,
       sub: principal.subjectId,
       sid: tokens.sid,
       subject: principal.subjectId,
       email: principal.email,
       displayName: principal.displayName,
       role: principal.role,
       expiresAt: tokens.expiresAt,
       authTime: principal.authContext.auth_time,
       amr: [...principal.authContext.amr],
       acr: principal.authContext.acr,
       lastLoginAt: principal.lastLoginAt,
       issuedAt,
       absoluteExpiresAt: issuedAt + getConfig().sessionAbsoluteTtlSeconds,
       lastRefreshedAt: issuedAt,
     }
   }

   export function publicSession(session: PortalSession): PortalSessionView {
     return {
       subject: session.sub,
       email: session.email,
       displayName: session.displayName,
       role: session.role,
       expiresAt: session.expiresAt,
       authTime: session.authTime,
       amr: session.amr,
       acr: session.acr,
       lastLoginAt: session.lastLoginAt,
     }
   }

   export function isSessionExpired(expiresAt: number, bufferSeconds = 30): boolean {
     return expiresAt < unixTime() + bufferSeconds
   }

   export function isSessionAbsoluteExpired(session: PortalSession): boolean {
     return session.absoluteExpiresAt <= unixTime()
   }

   export function unixTime(): number {
     return Math.floor(Date.now() / 1000)
   }

   function readSessionId(request: IncomingMessage): string | null {
     const value = readCookie(request, SSO_PORTAL_SESSION_COOKIE)
     return isOpaqueSessionId(value) ? value : null
   }

   function isOpaqueSessionId(value: string | null): value is string {
     return Boolean(value && /^[A-Za-z0-9_-]{43,}$/u.test(value))
   }

   export function sessionCookieMaxAge(session: PortalSession): number {
     const absoluteRemaining = Math.max(0, session.absoluteExpiresAt - unixTime())
     return Math.min(getConfig().sessionIdleTtlSeconds, absoluteRemaining)
   }
   ```

6. [ ] Run it and expect PASS: `npx vitest run server/__tests__/session.spec.ts`
   - Expected: `Test Files 1 passed (1)` / `Tests 6 passed (6)`.

7. [ ] Commit:
   ```bash
   git add services/sso-admin-frontend/server/utils/types.ts services/sso-admin-frontend/server/utils/session-store.ts services/sso-admin-frontend/server/utils/session.ts services/sso-admin-frontend/server/__tests__/session.spec.ts
   git commit -m "feat(sso-admin-frontend): port session lifecycle + in-memory store to Nitro

1:1 port of PortalSession bootstrap, publicSession (token-free view),
expiry/clamp helpers, encrypted tx cookie, and the in-memory session store.
Redis path follows in the next task. Server-shared DTO types ported too.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
   ```

---

### Task 1.5: Add the Redis session-store path (TTL clamp + production guard) to `server/utils/session-store.ts`

> Additive on top of Task 1.4's in-memory dev fallback. Redis becomes the primary store with `EX = max(1, min(idle TTL, absolute remaining))`; reads prefer Redis then memory; production fails closed when no Redis URL is configured. Exact key shape `admin:sessions:{opaque-id}` is preserved.

**Files:**
- Modify: `services/sso-admin-frontend/server/utils/session-store.ts`
- Test: `services/sso-admin-frontend/server/__tests__/session-store.spec.ts`

**Interfaces:**
- Consumes: `redis` `createClient` / `RedisClientType`; `getConfig` (1.1) for `sessionRedisUrl`, `sessionIdleTtlSeconds`; `unixTime` + `PortalSession` (1.4); `process.env.NODE_ENV`.
- Produces: unchanged exported signatures (`createSessionRecord`, `readSessionRecord`, `replaceSessionRecord`, `deleteSessionRecord`, `sessionStoreKey`) now Redis-backed with the memory fallback.

**Steps:**

1. [ ] Write the failing test `server/__tests__/session-store.spec.ts`:

   ```ts
   // @vitest-environment node
   import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
   import type { PortalSession } from '../utils/session'

   function session(overrides: Partial<PortalSession> = {}): PortalSession {
     return {
       accessToken: 'a',
       idToken: 'i',
       refreshToken: 'r',
       sub: 'sub-admin',
       subject: 'sub-admin',
       email: 'admin@example.test',
       displayName: 'Admin',
       role: 'admin',
       expiresAt: 4_000_000_000,
       authTime: null,
       amr: [],
       acr: null,
       lastLoginAt: null,
       issuedAt: 1_780_455_600,
       absoluteExpiresAt: 4_000_000_000,
       lastRefreshedAt: 1_780_455_600,
       ...overrides,
     }
   }

   describe('admin BFF session store', () => {
     beforeEach(() => {
       vi.resetModules()
       vi.unstubAllEnvs()
       vi.stubEnv('VITE_ADMIN_BASE_URL', 'https://admin-sso.example.test')
       vi.stubEnv('VITE_SSO_BASE_URL', 'https://api-sso.example.test')
       vi.setSystemTime(new Date('2026-06-03T03:00:00Z'))
     })

     afterEach(() => {
       vi.unstubAllEnvs()
       vi.unstubAllGlobals()
       vi.restoreAllMocks()
       vi.useRealTimers()
     })

     it('namespaces session keys under admin:sessions:', async () => {
       vi.stubEnv('SSO_ADMIN_SESSION_REDIS_URL', '')
       const { sessionStoreKey } = await import('../utils/session-store')
       expect(sessionStoreKey('opaque-id')).toBe('admin:sessions:opaque-id')
     })

     it('round-trips a record through the in-memory fallback when no Redis URL is set', async () => {
       vi.stubEnv('SSO_ADMIN_SESSION_REDIS_URL', '')
       const { createSessionRecord, readSessionRecord } = await import('../utils/session-store')
       const id = await createSessionRecord(session())
       expect((await readSessionRecord(id))?.accessToken).toBe('a')
     })

     it('writes to Redis with an EX clamped to min(idle TTL, absolute remaining)', async () => {
       const set = vi.fn(async () => 'OK')
       const fakeClient = {
         on: vi.fn(),
         connect: vi.fn(async () => undefined),
         set,
         get: vi.fn(async () => null),
         del: vi.fn(async () => 1),
       }
       vi.doMock('redis', () => ({ createClient: vi.fn(() => fakeClient) }))
       vi.stubEnv('SSO_ADMIN_SESSION_REDIS_URL', 'redis://localhost:6379/5')

       const { createSessionRecord, sessionStoreKey } = await import('../utils/session-store')
       const { unixTime } = await import('../utils/session')
       const id = await createSessionRecord(session({ absoluteExpiresAt: unixTime() + 100 }))

       expect(set).toHaveBeenCalledTimes(1)
       const [key, value, options] = set.mock.calls[0]!
       expect(key).toBe(sessionStoreKey(id))
       expect(JSON.parse(value as string).accessToken).toBe('a')
       expect(options).toEqual({ EX: 100 })
     })

     it('throws in production when the Redis URL is not configured', async () => {
       vi.stubEnv('NODE_ENV', 'production')
       vi.stubEnv('SSO_ADMIN_SESSION_REDIS_URL', '')
       const { createSessionRecord } = await import('../utils/session-store')
       await expect(createSessionRecord(session())).rejects.toThrow(
         'SSO_ADMIN_SESSION_REDIS_URL must be configured in production.',
       )
     })
   })
   ```

2. [ ] Run it and expect FAIL: `npx vitest run server/__tests__/session-store.spec.ts`
   - Expected: `FAIL server/__tests__/session-store.spec.ts`. Summary: `Tests 2 failed | 2 passed (4)` — the two passing tests are the key namespace + in-memory round-trip (already true from Task 1.4); the two failing are the Redis `EX` clamp (current store never touches Redis, so `set` is never called) and the production guard (current store never throws).

3. [ ] Implement the Redis path in `server/utils/session-store.ts` (full 1:1 final state):

   ```ts
   import { randomBytes } from 'node:crypto'
   import { createClient, type RedisClientType } from 'redis'
   import { getConfig } from './config'
   import type { PortalSession } from './session'
   import { unixTime } from './session'

   const sessionKeyPrefix = 'admin:sessions:'
   const memorySessions = new Map<string, PortalSession>()
   let redisClient: RedisClientType | null = null

   export async function createSessionRecord(session: PortalSession): Promise<string> {
     const sessionId = randomBytes(32).toString('base64url')
     await writeSessionRecord(sessionId, session)
     return sessionId
   }

   export async function readSessionRecord(sessionId: string): Promise<PortalSession | null> {
     const session = await readPersistedSession(sessionId)
     if (!session || session.absoluteExpiresAt <= unixTime()) {
       await deleteSessionRecord(sessionId)
       return null
     }

     return session
   }

   export async function replaceSessionRecord(
     sessionId: string,
     session: PortalSession,
   ): Promise<void> {
     await writeSessionRecord(sessionId, session)
   }

   export async function deleteSessionRecord(sessionId: string): Promise<void> {
     memorySessions.delete(sessionId)
     const client = await redis()
     if (client) await client.del(sessionStoreKey(sessionId))
   }

   export function sessionStoreKey(sessionId: string): string {
     return `${sessionKeyPrefix}${sessionId}`
   }

   async function writeSessionRecord(sessionId: string, session: PortalSession): Promise<void> {
     memorySessions.set(sessionId, session)
     const client = await redis()
     if (client)
       await client.set(sessionStoreKey(sessionId), JSON.stringify(session), { EX: maxAge(session) })
   }

   async function readPersistedSession(sessionId: string): Promise<PortalSession | null> {
     const client = await redis()
     const value = client ? await client.get(sessionStoreKey(sessionId)) : null
     if (value) return JSON.parse(value) as PortalSession
     return memorySessions.get(sessionId) ?? null
   }

   async function redis(): Promise<RedisClientType | null> {
     if (!getConfig().sessionRedisUrl) {
       if (process.env.NODE_ENV === 'production') {
         throw new Error('SSO_ADMIN_SESSION_REDIS_URL must be configured in production.')
       }
       return null
     }
     if (redisClient) return redisClient

     const sessionRedisUrl = getConfig().sessionRedisUrl
     if (!sessionRedisUrl) return null

     redisClient = createClient({ url: sessionRedisUrl })
     redisClient.on('error', (error: Error) =>
       console.error('Admin session Redis error:', error.message),
     )
     await redisClient.connect()
     return redisClient
   }

   function maxAge(session: PortalSession): number {
     return Math.max(
       1,
       Math.min(getConfig().sessionIdleTtlSeconds, session.absoluteExpiresAt - unixTime()),
     )
   }
   ```

4. [ ] Run it and expect PASS: `npx vitest run server/__tests__/session-store.spec.ts`
   - Expected: `Test Files 1 passed (1)` / `Tests 4 passed (4)`.

5. [ ] Re-run the dependent session suite to prove no regression: `npx vitest run server/__tests__/session.spec.ts`
   - Expected: `Tests 6 passed (6)` (the in-memory fallback still works when `SSO_ADMIN_SESSION_REDIS_URL` is empty).

6. [ ] Commit:
   ```bash
   git add services/sso-admin-frontend/server/utils/session-store.ts services/sso-admin-frontend/server/__tests__/session-store.spec.ts
   git commit -m "feat(sso-admin-frontend): add Redis session store path with TTL clamp + prod guard

Redis-backed store with EX clamped to min(idle TTL, absolute remaining),
read-through memory fallback, and a fail-closed production guard when
SSO_ADMIN_SESSION_REDIS_URL is unset. Key shape admin:sessions:{id} preserved.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
   ```

---

### Task 1.6: Port response builders + `sendAppResponse` Nitro adapter to `server/utils/response.ts`

> FIXES global contract: `response.ts` MUST export `sendAppResponse(event, appResponse)` — the name every route adapter (Tasks 1.11–1.14) calls. It is a thin Nitro adapter over the legacy `send(res, appResponse)`, applied to `event.node.res`, so the fixed security-header set + multi-value `Set-Cookie` behavior is byte-identical to the Node BFF.

**Files:**
- Create: `services/sso-admin-frontend/server/utils/response.ts`
- Test: `services/sso-admin-frontend/server/__tests__/response.spec.ts`

**Interfaces:**
- Consumes: `node:http` `ServerResponse` (type); `h3` `H3Event` (type).
- Produces:
  - `type HeaderValue = string | readonly string[]`
  - `type AppResponse = { status: number; headers?: Record<string, HeaderValue>; body?: string | Buffer }`
  - `json(status, payload, headers?)`, `text(status, body, headers?)`, `html(status, body, headers?)`, `redirect(location, cookies?, headers?)`, `methodNotAllowed()`, `unauthorized()`
  - `send(res: ServerResponse, appResponse: AppResponse): void` (legacy, retained)
  - `sendAppResponse(event: H3Event, appResponse: AppResponse): void` (Nitro adapter over `send`)

**Steps:**

1. [ ] Write the failing test `server/__tests__/response.spec.ts`:

   ```ts
   // @vitest-environment node
   import type { H3Event } from 'h3'
   import { describe, expect, it } from 'vitest'
   import {
     html,
     json,
     methodNotAllowed,
     redirect,
     sendAppResponse,
     text,
     unauthorized,
   } from '../utils/response'

   function mockEvent() {
     const headers: Record<string, unknown> = {}
     const res = {
       statusCode: 0,
       setHeader(name: string, value: unknown) {
         headers[name] = value
       },
       end(body?: unknown) {
         ;(this as Record<string, unknown>).body = body
       },
     }
     const event = { node: { res } } as unknown as H3Event
     return { event, res: res as typeof res & { body?: unknown }, headers }
   }

   describe('admin BFF response builders', () => {
     it('builds a no-store JSON response', () => {
       const r = json(200, { ok: true })
       expect(r.status).toBe(200)
       expect(r.headers?.['content-type']).toBe('application/json; charset=utf-8')
       expect(r.headers?.['cache-control']).toBe('no-store, no-cache, private, max-age=0')
       expect(r.body).toBe('{"ok":true}')
     })

     it('builds text and html responses with the right content types', () => {
       expect(text(200, 'ok\n').headers?.['content-type']).toBe('text/plain; charset=utf-8')
       expect(html(200, '<p>').headers?.['content-type']).toBe('text/html; charset=utf-8')
     })

     it('builds a 302 redirect carrying Set-Cookie entries', () => {
       const r = redirect('/dashboard', ['__Host-sso-admin-session=x'])
       expect(r.status).toBe(302)
       expect(r.headers?.location).toBe('/dashboard')
       expect(r.headers?.['set-cookie']).toEqual(['__Host-sso-admin-session=x'])
     })

     it('exposes canonical 405 and 401 error responses', () => {
       expect(methodNotAllowed().status).toBe(405)
       expect(unauthorized().status).toBe(401)
       expect(JSON.parse(unauthorized().body as string)).toEqual({
         error: 'no_session',
         message: 'No active SSO session.',
       })
     })

     it('sendAppResponse writes status, security headers, multi Set-Cookie and body to the H3 event', () => {
       const { event, res, headers } = mockEvent()
       sendAppResponse(event, json(200, { ok: true }, { 'set-cookie': ['a=1', 'b=2'] }))

       expect(res.statusCode).toBe(200)
       expect(headers['content-type']).toBe('application/json; charset=utf-8')
       expect(headers['set-cookie']).toEqual(['a=1', 'b=2'])
       expect(headers['x-content-type-options']).toBe('nosniff')
       expect(headers['content-security-policy']).toContain("default-src 'self'")
       expect(res.body).toBe('{"ok":true}')
     })
   })
   ```

2. [ ] Run it and expect FAIL: `npx vitest run server/__tests__/response.spec.ts`
   - Expected: `FAIL` with `Error: Failed to resolve import "../utils/response"`. Summary: `Test Files 1 failed (1)`.

3. [ ] Implement `server/utils/response.ts` (1:1 + `sendAppResponse`):

   ```ts
   import type { ServerResponse } from 'node:http'
   import type { H3Event } from 'h3'

   export type HeaderValue = string | readonly string[]

   export type AppResponse = {
     readonly status: number
     readonly headers?: Record<string, HeaderValue>
     readonly body?: string | Buffer
   }

   export function json(
     status: number,
     payload: unknown,
     headers: Record<string, HeaderValue> = {},
   ): AppResponse {
     return {
       status,
       headers: {
         'content-type': 'application/json; charset=utf-8',
         'cache-control': 'no-store, no-cache, private, max-age=0',
         ...headers,
       },
       body: JSON.stringify(payload),
     }
   }

   export function text(
     status: number,
     body: string,
     headers: Record<string, HeaderValue> = {},
   ): AppResponse {
     return {
       status,
       headers: {
         'content-type': 'text/plain; charset=utf-8',
         ...headers,
       },
       body,
     }
   }

   export function html(
     status: number,
     body: string,
     headers: Record<string, HeaderValue> = {},
   ): AppResponse {
     return {
       status,
       headers: {
         'content-type': 'text/html; charset=utf-8',
         ...headers,
       },
       body,
     }
   }

   export function redirect(
     location: string,
     cookies: readonly string[] = [],
     headers: Record<string, HeaderValue> = {},
   ): AppResponse {
     return {
       status: 302,
       headers: {
         location,
         'cache-control': 'no-store, no-cache, private, max-age=0',
         ...(cookies.length > 0 ? { 'set-cookie': cookies } : {}),
         ...headers,
       },
     }
   }

   export function methodNotAllowed(): AppResponse {
     return json(405, { error: 'method_not_allowed', message: 'Method not allowed.' })
   }

   export function unauthorized(): AppResponse {
     return json(401, { error: 'no_session', message: 'No active SSO session.' })
   }

   export function send(res: ServerResponse, appResponse: AppResponse): void {
     const headers = {
       'x-content-type-options': 'nosniff',
       'referrer-policy': 'same-origin',
       'permissions-policy': 'camera=(), microphone=(), geolocation=()',
       'strict-transport-security': 'max-age=31536000; includeSubDomains',
       'x-frame-options': 'DENY',
       'content-security-policy': [
         "default-src 'self'",
         "script-src 'self'",
         "style-src 'self' 'unsafe-inline'",
         "img-src 'self' data:",
         "font-src 'self'",
         "connect-src 'self'",
         "frame-ancestors 'none'",
         "base-uri 'self'",
         "form-action 'self'",
       ].join('; '),
       ...appResponse.headers,
     }

     for (const [name, value] of Object.entries(headers)) {
       res.setHeader(name, value as string | string[])
     }

     res.statusCode = appResponse.status
     res.end(appResponse.body)
   }

   /**
    * Nitro adapter over the legacy send(): applies an AppResponse (status,
    * security headers, multi-value Set-Cookie, body) onto the H3 event's
    * underlying ServerResponse. This is the name consumed by every route adapter.
    */
   export function sendAppResponse(event: H3Event, appResponse: AppResponse): void {
     send(event.node.res as ServerResponse, appResponse)
   }
   ```

4. [ ] Run it and expect PASS: `npx vitest run server/__tests__/response.spec.ts`
   - Expected: `Test Files 1 passed (1)` / `Tests 5 passed (5)`.

5. [ ] Commit:
   ```bash
   git add services/sso-admin-frontend/server/utils/response.ts services/sso-admin-frontend/server/__tests__/response.spec.ts
   git commit -m "feat(sso-admin-frontend): port response builders + sendAppResponse Nitro adapter

1:1 port of json/text/html/redirect/error builders and the fixed security
header set; adds sendAppResponse(event, appResponse) over the legacy send()
for the route adapters to consume.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
   ```

---

### Task 1.7: Port user-api (principal fetch + profile/session CRUD) to `server/utils/user-api.ts` (+ `user-api-error.ts`)

> The principal fetch (`/userinfo`) is the data source for the SSR guard's principal. `user-api-error.ts` is ported alongside (it is the only consumer-facing dependency) and exercised through the error path of the principal-fetch test.

**Files:**
- Create: `services/sso-admin-frontend/server/utils/user-api-error.ts`
- Create: `services/sso-admin-frontend/server/utils/user-api.ts`
- Test: `services/sso-admin-frontend/server/__tests__/user-api.spec.ts`

**Interfaces:**
- Consumes: `getConfig` (1.1); `PortalSession` (1.4); DTO types (1.4 `types.ts`); global `fetch`.
- Produces (`user-api.ts`):
  - `type BackendRequestContext = { requestId: string }`
  - `fetchPrincipalWithAccessToken(accessToken, context?): Promise<SsoPrincipal>`
  - `fetchProfile`, `updateProfile`, `fetchConnectedApps`, `revokeConnectedApp`, `fetchMySessions`, `revokeMySession` (all `(session, ..., context)` → DTOs)
- Produces (`user-api-error.ts`): `class UserApiError`, `buildUserApiError(response): Promise<UserApiError>`, `isUserApiError`, `isReauthRequiredApiError`, `isMfaRequiredApiError`, `isTooManyAttemptsApiError`.

**Steps:**

1. [ ] Write the failing test `server/__tests__/user-api.spec.ts`:

   ```ts
   // @vitest-environment node
   import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

   describe('admin BFF user API', () => {
     beforeEach(() => {
       vi.resetModules()
       vi.stubEnv('VITE_SSO_BASE_URL', 'https://api-sso.example.test')
       vi.stubEnv('VITE_ADMIN_BASE_URL', 'https://admin-sso.example.test')
     })

     afterEach(() => {
       vi.unstubAllEnvs()
       vi.unstubAllGlobals()
     })

     it('maps the userinfo response to a principal and authenticates the request', async () => {
       const calls: Array<{ url: string; init?: RequestInit }> = []
       vi.stubGlobal(
         'fetch',
         vi.fn(async (input: string | URL, init?: RequestInit) => {
           calls.push({ url: input.toString(), init })
           return Response.json({
             sub: 'sub-admin',
             email: 'admin@example.test',
             name: 'Admin User',
             roles: ['admin', 'auditor'],
             auth_time: 1_780_000_000,
             amr: ['pwd'],
             acr: 'urn:timeh:aal1',
             last_login_at: '2026-06-01T00:00:00Z',
           })
         }),
       )

       const { fetchPrincipalWithAccessToken } = await import('../utils/user-api')
       const principal = await fetchPrincipalWithAccessToken('access-token', { requestId: 'req-1' })

       expect(principal.subjectId).toBe('sub-admin')
       expect(principal.role).toBe('admin')
       expect(principal.displayName).toBe('Admin User')
       expect(principal.authContext.amr).toEqual(['pwd'])
       expect(principal.lastLoginAt).toBe('2026-06-01T00:00:00Z')

       expect(calls[0]?.url).toBe('https://api-sso.example.test/userinfo')
       const headers = new Headers(calls[0]?.init?.headers)
       expect(headers.get('authorization')).toBe('Bearer access-token')
       expect(headers.get('accept-encoding')).toBe('identity')
       expect(headers.get('x-request-id')).toBe('req-1')
     })

     it('throws a typed UserApiError when userinfo returns a non-2xx response', async () => {
       vi.stubGlobal(
         'fetch',
         vi.fn(async () =>
           Response.json({ error: 'reauth_required', message: 'Sesi kedaluwarsa.' }, { status: 401 }),
         ),
       )

       const { fetchPrincipalWithAccessToken } = await import('../utils/user-api')
       await expect(
         fetchPrincipalWithAccessToken('expired', { requestId: 'req-2' }),
       ).rejects.toMatchObject({
         status: 401,
         code: 'reauth_required',
         message: 'Sesi kedaluwarsa.',
       })
     })
   })
   ```

2. [ ] Run it and expect FAIL: `npx vitest run server/__tests__/user-api.spec.ts`
   - Expected: `FAIL` with `Error: Failed to resolve import "../utils/user-api"`. Summary: `Test Files 1 failed (1)`.

3. [ ] Implement `server/utils/user-api-error.ts` (1:1):

   ```ts
   export class UserApiError extends Error {
     readonly status: number
     readonly code: string | null
     readonly violations: readonly string[]
     readonly requestId: string | null

     constructor(
       status: number,
       message: string,
       code: string | null = null,
       violations: readonly string[] = [],
       requestId: string | null = null,
     ) {
       super(message)
       this.name = 'UserApiError'
       this.status = status
       this.code = code
       this.violations = violations
       this.requestId = requestId
     }
   }

   export async function buildUserApiError(response: Response): Promise<UserApiError> {
     const payload = await responsePayload(response)
     const message = payload?.message ?? fallbackMessage(response.status)
     return new UserApiError(
       response.status,
       message,
       payload?.code ?? null,
       payload?.violations ?? [],
       payload?.requestId ?? response.headers.get('x-request-id'),
     )
   }

   export function isUserApiError(error: unknown): error is UserApiError {
     return error instanceof UserApiError || hasUserApiShape(error)
   }

   export function isReauthRequiredApiError(error: unknown): boolean {
     return isUserApiError(error) && error.code === 'reauth_required'
   }

   export function isMfaRequiredApiError(error: unknown): boolean {
     return isUserApiError(error) && error.code === 'mfa_required'
   }

   export function isTooManyAttemptsApiError(error: unknown): boolean {
     return isUserApiError(error) && (error.code === 'too_many_attempts' || error.status === 429)
   }

   type ResponsePayload = {
     readonly code: string | null
     readonly message: string | null
     readonly violations: readonly string[]
     readonly requestId: string | null
   }

   async function responsePayload(response: Response): Promise<ResponsePayload | null> {
     const contentType = response.headers.get('content-type') ?? ''
     return contentType.includes('application/json') ? jsonPayload(response) : textPayload(response)
   }

   async function jsonPayload(response: Response): Promise<ResponsePayload | null> {
     const payload = (await response.json()) as unknown
     return payloadMessage(payload)
   }

   function payloadMessage(payload: unknown): ResponsePayload | null {
     if (!payload || typeof payload !== 'object') return null

     return {
       code: hasString(payload, 'error') ? payload.error : null,
       message: hasString(payload, 'message')
         ? payload.message
         : hasString(payload, 'error_description')
           ? payload.error_description
           : hasString(payload, 'error')
             ? payload.error
             : null,
       violations: stringList(payload, 'violations'),
       requestId: hasString(payload, 'request_id') ? payload.request_id : null,
     }
   }

   function hasString<T extends string>(payload: object, key: T): payload is Record<T, string> {
     return key in payload && typeof Reflect.get(payload, key) === 'string'
   }

   function stringList<T extends string>(payload: object, key: T): readonly string[] {
     const value: unknown = Reflect.get(payload, key)
     return Array.isArray(value)
       ? value.filter((item: unknown): item is string => typeof item === 'string')
       : []
   }

   function hasUserApiShape(error: unknown): error is UserApiError {
     if (!error || typeof error !== 'object') return false

     return (
       'status' in error &&
       typeof Reflect.get(error, 'status') === 'number' &&
       'message' in error &&
       typeof Reflect.get(error, 'message') === 'string'
     )
   }

   async function textPayload(response: Response): Promise<ResponsePayload | null> {
     const text = (await response.text()).trim()
     return text.length > 0 ? { code: null, message: text, violations: [], requestId: null } : null
   }

   function fallbackMessage(status: number): string {
     if (status === 401) return 'Sesi SSO kedaluwarsa. Silakan masuk lagi.'
     if (status === 403) return 'Akses ke sumber daya ini tidak diizinkan.'
     if (status === 404) return 'Sumber daya tidak ditemukan.'
     if (status === 429) return 'Terlalu banyak percobaan. Coba lagi dalam beberapa saat.'
     if (status >= 500) return 'Layanan SSO sedang tidak tersedia. Silakan coba lagi.'
     return `SSO API error: ${status}`
   }
   ```

4. [ ] Implement `server/utils/user-api.ts` (1:1):

   ```ts
   import type {
     ConnectedApp,
     ProfileUpdatePayload,
     SsoAuthContext,
     SsoPrincipal,
     UserProfile,
     UserSessionSummary,
   } from './types'
   import type { PortalSession } from './session'
   import { getConfig } from './config'
   import { buildUserApiError } from './user-api-error'

   type AccessToken = string
   export type BackendRequestContext = {
     readonly requestId: string
   }

   type UserInfoResponse = {
     readonly sub: string
     readonly email?: string
     readonly email_verified?: boolean
     readonly name?: string
     readonly preferred_username?: string
     readonly role?: string
     readonly roles?: readonly string[]
     readonly auth_time?: number
     readonly amr?: readonly string[]
     readonly acr?: string
     readonly last_login_at?: string | null
   }

   export async function fetchPrincipalWithAccessToken(
     accessToken: string,
     context?: BackendRequestContext,
   ): Promise<SsoPrincipal> {
     const userinfo = await userinfoFetch<UserInfoResponse>(accessToken, context)

     return principalFromUserInfo(userinfo)
   }

   export async function fetchProfile(
     session: PortalSession,
     context: BackendRequestContext,
   ): Promise<UserProfile> {
     return profileFetch<UserProfile>('/', session.accessToken, context)
   }

   export async function updateProfile(
     session: PortalSession,
     payload: ProfileUpdatePayload,
     context: BackendRequestContext,
   ): Promise<UserProfile> {
     return profileFetch<UserProfile>('/', session.accessToken, context, {
       method: 'PATCH',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify(payload),
     })
   }

   export async function fetchConnectedApps(
     session: PortalSession,
     context: BackendRequestContext,
   ): Promise<readonly ConnectedApp[]> {
     const data = await profileFetch<{ connected_apps: ConnectedApp[] }>(
       '/connected-apps',
       session.accessToken,
       context,
     )
     return data.connected_apps
   }

   export async function revokeConnectedApp(
     session: PortalSession,
     clientId: string,
     context: BackendRequestContext,
   ): Promise<void> {
     await profileFetch(
       `/connected-apps/${encodeURIComponent(clientId)}`,
       session.accessToken,
       context,
       { method: 'DELETE' },
     )
   }

   export async function fetchMySessions(
     session: PortalSession,
     context: BackendRequestContext,
   ): Promise<readonly UserSessionSummary[]> {
     const data = await profileFetch<{ sessions: UserSessionSummary[] }>(
       '/sessions',
       session.accessToken,
       context,
     )
     return data.sessions
   }

   export async function revokeMySession(
     session: PortalSession,
     sessionId: string,
     context: BackendRequestContext,
   ): Promise<void> {
     await profileFetch(`/sessions/${encodeURIComponent(sessionId)}`, session.accessToken, context, {
       method: 'DELETE',
     })
   }

   async function profileFetch<T>(
     path: string,
     accessToken: AccessToken,
     context: BackendRequestContext,
     init?: RequestInit,
   ): Promise<T> {
     const config = getConfig()
     const url = `${trimTrailingSlash(config.internalBaseUrl)}/api/profile${path === '/' ? '' : path}`
     const res = await fetch(url, {
       ...init,
       headers: {
         Authorization: `Bearer ${accessToken}`,
         Accept: 'application/json',
         'Accept-Encoding': 'identity',
         'X-Request-Id': context.requestId,
         ...init?.headers,
       },
     })

     if (!res.ok) throw await buildUserApiError(res)

     return res.json() as Promise<T>
   }

   async function userinfoFetch<T>(
     accessToken: AccessToken,
     context?: BackendRequestContext,
   ): Promise<T> {
     const config = getConfig()
     const res = await fetch(`${config.issuer}/userinfo`, {
       headers: {
         Authorization: `Bearer ${accessToken}`,
         Accept: 'application/json',
         'Accept-Encoding': 'identity',
         ...(context ? { 'X-Request-Id': context.requestId } : {}),
       },
     })

     if (!res.ok) throw await buildUserApiError(res)

     return res.json() as Promise<T>
   }

   function principalFromUserInfo(info: UserInfoResponse): SsoPrincipal {
     const authContext: SsoAuthContext = {
       auth_time: info.auth_time ?? null,
       amr: info.amr ? [...info.amr] : [],
       acr: info.acr ?? null,
     }

     const role = info.role ?? info.roles?.[0] ?? 'user'

     return {
       subjectId: info.sub,
       email: info.email ?? '',
       displayName: info.name ?? info.preferred_username ?? info.email ?? info.sub,
       role,
       expiresAt: 0,
       authContext,
       lastLoginAt: info.last_login_at ?? null,
     }
   }

   function trimTrailingSlash(url: string): string {
     return url.endsWith('/') ? url.slice(0, -1) : url
   }
   ```

5. [ ] Run it and expect PASS: `npx vitest run server/__tests__/user-api.spec.ts`
   - Expected: `Test Files 1 passed (1)` / `Tests 2 passed (2)`.

6. [ ] Commit:
   ```bash
   git add services/sso-admin-frontend/server/utils/user-api-error.ts services/sso-admin-frontend/server/utils/user-api.ts services/sso-admin-frontend/server/__tests__/user-api.spec.ts
   git commit -m "feat(sso-admin-frontend): port user-api principal fetch + typed API errors

1:1 port of fetchPrincipalWithAccessToken (userinfo -> SsoPrincipal with
Bearer + Accept-Encoding identity + X-Request-Id) plus profile/session CRUD
and the UserApiError classification helpers.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
   ```

---

### Task 1.8: Port session-refresh (token rotation + role refresh) to `server/utils/session-refresh.ts`

> Ports the existing `src/server/__tests__/session-refresh.spec.ts` first (paths rebased to `../utils/`). Refresh buffer stays 180s; the confidential `client_secret` is sent to the token endpoint; the cached role is refreshed from `/userinfo` but preserved when userinfo fails.

**Files:**
- Create: `services/sso-admin-frontend/server/utils/session-refresh.ts`
- Test: `services/sso-admin-frontend/server/__tests__/session-refresh.spec.ts`

**Interfaces:**
- Consumes: `getConfig` (1.1) for `tokenUrl`, `clientId`, `clientSecret`; `isSessionExpired`, `unixTime`, `PortalSession` (1.4); `fetchPrincipalWithAccessToken` (1.7); global `fetch`.
- Produces:
  - `type RefreshRequestContext = { requestId: string }`
  - `sessionNeedsRefresh(session, bufferSeconds = 180): boolean`
  - `refreshPortalSession(session, context?): Promise<PortalSession>`

**Steps:**

1. [ ] Write the failing test `server/__tests__/session-refresh.spec.ts` (ported 1:1, paths rebased, node env):

   ```ts
   // @vitest-environment node
   import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
   import type { PortalSession } from '../utils/session'

   const baseSession: PortalSession = {
     accessToken: 'old-access-token',
     idToken: 'id-token',
     refreshToken: 'refresh-token',
     sub: 'sub-admin',
     subject: 'sub-admin',
     email: 'admin@example.test',
     displayName: 'Admin',
     role: 'user',
     expiresAt: 1_800_000_000,
     authTime: null,
     amr: ['pwd'],
     acr: null,
     lastLoginAt: null,
     issuedAt: 1_700_000_000,
     absoluteExpiresAt: 1_900_000_000,
     lastRefreshedAt: 1_700_000_000,
   }

   describe('admin BFF session refresh', () => {
     beforeEach(() => {
       vi.resetModules()
       vi.stubEnv('VITE_ADMIN_BASE_URL', 'https://admin-sso.example.test')
       vi.stubEnv('VITE_SSO_BASE_URL', 'https://api-sso.example.test')
       vi.stubEnv('ADMIN_OIDC_CLIENT_ID', 'sso-admin-panel')
       vi.stubEnv('ADMIN_OIDC_CLIENT_SECRET', 'admin-bff-secret')
       vi.stubEnv('SESSION_ENCRYPTION_SECRET', 'test-admin-session-secret-32-bytes-long')
       vi.stubEnv('SSO_ADMIN_SESSION_REDIS_URL', '')
       vi.setSystemTime(new Date('2026-06-03T03:00:00Z'))
     })

     afterEach(() => {
       vi.unstubAllEnvs()
       vi.unstubAllGlobals()
     })

     it('refreshes the cached session role from userinfo after token refresh', async () => {
       const calls: Array<{ readonly url: string; readonly init?: RequestInit }> = []
       vi.stubGlobal(
         'fetch',
         vi.fn(async (input: string | URL, init?: RequestInit) => {
           const url = input.toString()
           calls.push({ url, init })
           if (url === 'https://api-sso.example.test/token') {
             return Response.json({ access_token: 'new-access-token', expires_in: 3600 })
           }
           if (url === 'https://api-sso.example.test/userinfo') {
             return Response.json({ sub: 'sub-admin', email: 'admin@example.test', roles: ['admin'] })
           }
           return new Response('not found', { status: 404 })
         }),
       )

       const { refreshPortalSession } = await import('../utils/session-refresh')
       const refreshed = await refreshPortalSession(baseSession, { requestId: 'req-refresh' })

       expect(refreshed.accessToken).toBe('new-access-token')
       expect(refreshed.role).toBe('admin')
       expect(new URLSearchParams(String(calls[0]?.init?.body)).get('client_secret')).toBe(
         'admin-bff-secret',
       )
       expect(new Headers(calls[0]?.init?.headers).get('accept-encoding')).toBe('identity')
       expect(new Headers(calls[1]?.init?.headers).get('accept-encoding')).toBe('identity')
     })

     it('keeps the cached session role when userinfo refresh fails', async () => {
       vi.stubGlobal(
         'fetch',
         vi.fn(async (input: string | URL) => {
           const url = input.toString()
           if (url === 'https://api-sso.example.test/token') {
             return Response.json({ access_token: 'new-access-token', expires_in: 3600 })
           }
           if (url === 'https://api-sso.example.test/userinfo') {
             return new Response('unavailable', { status: 503 })
           }
           return new Response('not found', { status: 404 })
         }),
       )

       const { refreshPortalSession } = await import('../utils/session-refresh')
       const refreshed = await refreshPortalSession(baseSession, { requestId: 'req-refresh' })

       expect(refreshed.accessToken).toBe('new-access-token')
       expect(refreshed.role).toBe('user')
     })
   })
   ```

2. [ ] Run it and expect FAIL: `npx vitest run server/__tests__/session-refresh.spec.ts`
   - Expected: `FAIL` with `Error: Failed to resolve import "../utils/session-refresh"`. Summary: `Test Files 1 failed (1)`.

3. [ ] Implement `server/utils/session-refresh.ts` (1:1):

   ```ts
   import { getConfig } from './config'
   import type { PortalSession } from './session'
   import { isSessionExpired, unixTime } from './session'
   import { fetchPrincipalWithAccessToken } from './user-api'

   export type RefreshRequestContext = {
     readonly requestId: string
   }

   type RefreshTokenSet = {
     readonly access_token: string
     readonly refresh_token?: string
     readonly expires_in: number
   }

   export function sessionNeedsRefresh(session: PortalSession, bufferSeconds = 180): boolean {
     return isSessionExpired(session.expiresAt, bufferSeconds)
   }

   export async function refreshPortalSession(
     session: PortalSession,
     context?: RefreshRequestContext,
   ): Promise<PortalSession> {
     const tokens = await requestRefreshTokens(session.refreshToken, context)
     const refreshedAt = unixTime()
     const principal = await fetchPrincipalWithAccessToken(tokens.access_token, context).catch(
       () => null,
     )

     return {
       ...session,
       accessToken: tokens.access_token,
       refreshToken: tokens.refresh_token ?? session.refreshToken,
       expiresAt: refreshedAt + tokens.expires_in,
       lastRefreshedAt: refreshedAt,
       role: principal?.role ?? session.role,
     }
   }

   async function requestRefreshTokens(
     refreshToken: string,
     context?: RefreshRequestContext,
   ): Promise<RefreshTokenSet> {
     const config = getConfig()
     const res = await fetch(config.tokenUrl, {
       method: 'POST',
       headers: {
         'Content-Type': 'application/x-www-form-urlencoded',
         'Accept-Encoding': 'identity',
         ...(context ? { 'X-Request-Id': context.requestId } : {}),
       },
       body: new URLSearchParams({
         grant_type: 'refresh_token',
         client_id: config.clientId,
         client_secret: requiredClientSecret(config.clientSecret),
         refresh_token: refreshToken,
       }),
     })

     if (!res.ok) throw new Error(`Refresh failed: HTTP ${res.status} - ${await safeText(res)}`)
     return res.json() as Promise<RefreshTokenSet>
   }

   function requiredClientSecret(secret: string | null): string {
     if (secret) return secret

     throw new Error('ADMIN_OIDC_CLIENT_SECRET is required for confidential OIDC client operations.')
   }

   async function safeText(response: Response): Promise<string> {
     return response.text().catch(() => '')
   }
   ```

4. [ ] Run it and expect PASS: `npx vitest run server/__tests__/session-refresh.spec.ts`
   - Expected: `Test Files 1 passed (1)` / `Tests 2 passed (2)`.

5. [ ] Commit:
   ```bash
   git add services/sso-admin-frontend/server/utils/session-refresh.ts services/sso-admin-frontend/server/__tests__/session-refresh.spec.ts
   git commit -m "feat(sso-admin-frontend): port session refresh (token rotation + role refresh)

1:1 port: 180s refresh buffer, confidential client_secret on the token
request, Accept-Encoding identity, and role refresh from userinfo that
falls back to the cached role on userinfo failure.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
   ```

---

### Task 1.9: Port sso-session-resolver (refresh + RP registration heartbeat) to `server/utils/sso-session-resolver.ts` (+ `proxy-headers.ts`, `session-registration.ts`)

> Ports the existing `src/server/__tests__/sso-session-resolver.spec.ts` first (paths rebased). The resolver's real dependencies `proxy-headers.ts` (`resolveBffRequestId`) and `session-registration.ts` (`registerClientSession`) are ported 1:1 in this task — they are the resolver's earliest consumers and are reused unchanged by the proxy route adapters in Tasks 1.12–1.14. RP-registration dedup interval stays 300s.

**Files:**
- Create: `services/sso-admin-frontend/server/utils/proxy-headers.ts`
- Create: `services/sso-admin-frontend/server/utils/session-registration.ts`
- Create: `services/sso-admin-frontend/server/utils/sso-session-resolver.ts`
- Test: `services/sso-admin-frontend/server/__tests__/sso-session-resolver.spec.ts`

**Interfaces:**
- Consumes: `refreshPortalSession`, `sessionNeedsRefresh` (1.8); `readSession`, `replaceSession`, `sessionCookieForId`, `unixTime`, `PortalSession` (1.4); `getConfig` (1.1); `HeaderValue` (1.6); `node:crypto` `randomUUID`; `node:http` `IncomingMessage`/`IncomingHttpHeaders`; global `fetch`.
- Produces (`sso-session-resolver.ts`):
  - `type ResolvedSsoSession = { sessionId; session: PortalSession; cookies: readonly string[] }`
  - `resolveSsoSession(request): Promise<ResolvedSsoSession | null>`
  - `sessionHeaders(resolved): Record<string, readonly string[]>`
- Produces (`proxy-headers.ts`): `buildProxyRequestHeaders`, `resolveBffRequestId`, `buildProxyResponseHeaders`, `deriveSupportReference`.
- Produces (`session-registration.ts`): `registerClientSession(accessToken, requestId): Promise<boolean>`.

**Steps:**

1. [ ] Write the failing test `server/__tests__/sso-session-resolver.spec.ts` (ported 1:1, paths rebased, node env):

   ```ts
   // @vitest-environment node
   import type { IncomingMessage } from 'node:http'
   import { Readable } from 'node:stream'
   import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
   import type { PortalSession } from '../utils/session'

   function requestWithCookie(cookie: string): IncomingMessage {
     const request = Readable.from([]) as Readable & { headers: Record<string, string> }
     request.headers = { cookie, 'x-request-id': 'req-admin-resolve' }
     return request as unknown as IncomingMessage
   }

   function cookieHeader(cookie: string): string {
     return cookie.split(';')[0] ?? ''
   }

   function baseSession(overrides: Partial<PortalSession> = {}): PortalSession {
     return {
       accessToken: 'legacy-admin-access-token',
       idToken: 'id-token',
       refreshToken: 'refresh-token',
       sub: 'sub-admin',
       subject: 'sub-admin',
       email: 'admin@example.test',
       displayName: 'Admin',
       role: 'admin',
       expiresAt: 1_780_014_000,
       authTime: 1_780_000_000,
       amr: ['pwd', 'mfa'],
       acr: 'urn:timeh:aal2',
       lastLoginAt: null,
       issuedAt: 1_780_000_000,
       absoluteExpiresAt: 1_780_086_400,
       lastRefreshedAt: 1_780_000_000,
       ...overrides,
     }
   }

   describe('admin BFF SSO session resolver', () => {
     beforeEach(() => {
       vi.resetModules()
       vi.stubEnv('VITE_ADMIN_BASE_URL', 'https://admin-sso.example.test')
       vi.stubEnv('VITE_SSO_BASE_URL', 'https://api-sso.example.test')
       vi.stubEnv('ADMIN_OIDC_CLIENT_ID', 'sso-admin-panel')
       vi.stubEnv('SESSION_ENCRYPTION_SECRET', 'test-admin-session-secret-32-bytes-long')
       vi.stubEnv('SSO_ADMIN_SESSION_REDIS_URL', '')
       vi.setSystemTime(new Date('2026-05-27T00:00:00Z'))
     })

     afterEach(() => {
       vi.unstubAllEnvs()
       vi.unstubAllGlobals()
     })

     it('self-heals legacy active admin sessions by registering the RP session', async () => {
       let registerRequest: RequestInit | undefined
       vi.stubGlobal(
         'fetch',
         vi.fn<(input: string | URL, init?: RequestInit) => Promise<Response>>(async (input, init) => {
           if (input.toString() === 'https://api-sso.example.test/connect/register-session') {
             registerRequest = init
             return Response.json({ registered: true, client_id: 'sso-admin-panel' })
           }

           return new Response('not found', { status: 404 })
         }),
       )

       const { sessionCookie } = await import('../utils/session')
       const { resolveSsoSession } = await import('../utils/sso-session-resolver')
       const cookie = cookieHeader(await sessionCookie(baseSession()))

       const resolved = await resolveSsoSession(requestWithCookie(cookie))

       expect(resolved?.session.rpSessionRegisteredAt).toBe(1_779_840_000)
       expect(registerRequest?.method).toBe('POST')
       expect((registerRequest?.headers as Record<string, string> | undefined)?.Authorization).toBe(
         'Bearer legacy-admin-access-token',
       )
       expect(new Headers(registerRequest?.headers).get('x-request-id')).toBe('req-admin-resolve')
     })

     it('does not re-register a recently registered admin RP session on every request', async () => {
       const fetchMock = vi.fn<() => Promise<Response>>(async () => Response.json({ registered: true }))
       vi.stubGlobal('fetch', fetchMock)

       const { sessionCookie } = await import('../utils/session')
       const { resolveSsoSession } = await import('../utils/sso-session-resolver')
       const cookie = cookieHeader(await sessionCookie(baseSession({ rpSessionRegisteredAt: 1_779_839_900 })))

       const resolved = await resolveSsoSession(requestWithCookie(cookie))

       expect(resolved?.session.rpSessionRegisteredAt).toBe(1_779_839_900)
       expect(fetchMock).not.toHaveBeenCalled()
     })
   })
   ```

2. [ ] Run it and expect FAIL: `npx vitest run server/__tests__/sso-session-resolver.spec.ts`
   - Expected: `FAIL` with `Error: Failed to resolve import "../utils/sso-session-resolver"`. Summary: `Test Files 1 failed (1)`.

3. [ ] Implement `server/utils/proxy-headers.ts` (1:1):

   ```ts
   import { randomUUID } from 'node:crypto'
   import type { IncomingHttpHeaders } from 'node:http'
   import type { HeaderValue } from './response'

   const HOP_BY_HOP_RESPONSE_HEADERS = new Set([
     'transfer-encoding',
     'content-length',
     'content-encoding',
     'connection',
   ])

   const HOP_BY_HOP_REQUEST_HEADERS = new Set(['host', 'connection', 'content-length', 'accept-encoding'])
   const REQUEST_ID_HEADER = 'x-request-id'
   const MAX_REQUEST_ID_LENGTH = 128

   export function buildProxyRequestHeaders(
     headers: IncomingHttpHeaders,
     requestId = resolveBffRequestId(headers),
   ): Headers {
     const forwarded = new Headers()

     for (const [name, value] of Object.entries(headers)) {
       if (HOP_BY_HOP_REQUEST_HEADERS.has(name.toLowerCase())) continue
       if (Array.isArray(value)) {
         for (const item of value) forwarded.append(name, item)
       } else if (typeof value === 'string') {
         forwarded.set(name, value)
       }
     }

     forwarded.set('Accept-Encoding', 'identity')
     forwarded.set('X-Request-Id', requestId)

     return forwarded
   }

   export function resolveBffRequestId(headers: IncomingHttpHeaders): string {
     const requestId = normalizeRequestId(headerValue(headers, REQUEST_ID_HEADER)) ?? randomUUID()
     headers[REQUEST_ID_HEADER] = requestId
     return requestId
   }

   export function buildProxyResponseHeaders(headers: Headers): Record<string, HeaderValue> {
     const forwarded: Record<string, HeaderValue> = {}
     const setCookies = readSetCookies(headers)

     if (setCookies.length > 0) forwarded['set-cookie'] = setCookies

     headers.forEach((value, name) => {
       if (HOP_BY_HOP_RESPONSE_HEADERS.has(name)) return
       if (name === 'set-cookie') return
       forwarded[name] = value
     })

     return forwarded
   }

   function readSetCookies(headers: Headers): readonly string[] {
     const native = (headers as Headers & { getSetCookie?: () => readonly string[] }).getSetCookie
     if (typeof native === 'function') return native.call(headers)

     const raw = headers.get('set-cookie')
     return raw ? splitSetCookie(raw) : []
   }

   function headerValue(headers: IncomingHttpHeaders, header: string): string | null {
     for (const [name, value] of Object.entries(headers)) {
       if (name.toLowerCase() !== header) continue
       return Array.isArray(value) ? (value[0] ?? null) : (value ?? null)
     }

     return null
   }

   function normalizeRequestId(value: string | null): string | null {
     const normalized = value?.trim()
     if (!normalized) return null
     return normalized.slice(0, MAX_REQUEST_ID_LENGTH)
   }

   function splitSetCookie(value: string): readonly string[] {
     return value.split(/,(?=\s*[^;=]+=[^;]*)/u).map((cookie) => cookie.trim())
   }

   export function deriveSupportReference(reqId: string | null | undefined): string | null {
     if (!reqId) return null
     const normalized = reqId.trim().replace(/[^a-zA-Z0-9]/giu, '').toUpperCase()
     return normalized ? `REF-${normalized.slice(-8)}` : null
   }
   ```

4. [ ] Implement `server/utils/session-registration.ts` (1:1):

   ```ts
   import { getConfig } from './config'

   /**
    * Register this admin RP session with the IdP back-channel session registry.
    * The backend reads sid + client_id from the access token, so no body is sent.
    * Best-effort: a failure must never block login or refresh, so it is swallowed.
    */
   export async function registerClientSession(
     accessToken: string,
     requestId: string,
   ): Promise<boolean> {
     try {
       const response = await fetch(`${getConfig().internalBaseUrl}/connect/register-session`, {
         method: 'POST',
         headers: {
           Authorization: `Bearer ${accessToken}`,
           'Accept-Encoding': 'identity',
           'X-Request-Id': requestId,
         },
         signal: AbortSignal.timeout(5_000),
       })

       if (!response.ok) {
         console.error('Admin RP session registration failed:', response.status)
         return false
       }

       return true
     } catch (error) {
       console.error(
         'Admin RP session registration failed:',
         error instanceof Error ? error.message : error,
       )
       return false
     }
   }
   ```

5. [ ] Implement `server/utils/sso-session-resolver.ts` (1:1):

   ```ts
   import type { IncomingMessage } from 'node:http'
   import { refreshPortalSession, sessionNeedsRefresh } from './session-refresh'
   import type { PortalSession } from './session'
   import { readSession, replaceSession, sessionCookieForId, unixTime } from './session'
   import { resolveBffRequestId } from './proxy-headers'
   import { registerClientSession } from './session-registration'

   const RP_SESSION_REGISTRATION_INTERVAL_SECONDS = 300

   export type ResolvedSsoSession = {
     readonly sessionId: string
     readonly session: PortalSession
     readonly cookies: readonly string[]
   }

   export async function resolveSsoSession(
     request: IncomingMessage,
   ): Promise<ResolvedSsoSession | null> {
     const sessionId = sessionIdFromRequest(request)
     const session = await readSession(request)
     if (!sessionId || !session) return null

     const requestId = resolveBffRequestId(request.headers)
     if (!sessionNeedsRefresh(session)) {
       const registered = await withFreshRpSessionRegistration(session, requestId)
       if (registered !== session) await replaceSession(sessionId, registered)

       return { sessionId, session: registered, cookies: [] }
     }

     const refreshed = await refreshPortalSession(session, { requestId })
     const registered = await withFreshRpSessionRegistration(refreshed, requestId, true)
     await replaceSession(sessionId, registered)

     return { sessionId, session: registered, cookies: [sessionCookieForId(sessionId, registered)] }
   }

   export function sessionHeaders(resolved: ResolvedSsoSession): Record<string, readonly string[]> {
     return resolved.cookies.length > 0 ? { 'set-cookie': resolved.cookies } : {}
   }

   function sessionIdFromRequest(request: IncomingMessage): string | null {
     const raw = request.headers.cookie ?? ''
     const match = raw.match(/(?:^|;\s*)__Host-sso-admin-session=([^;]+)/u)
     return match?.[1] ? decodeURIComponent(match[1]) : null
   }

   async function withFreshRpSessionRegistration(
     session: PortalSession,
     requestId: string,
     force = false,
   ): Promise<PortalSession> {
     if (!force && rpSessionRegistrationIsFresh(session)) return session
     if (!(await registerClientSession(session.accessToken, requestId))) return session

     return { ...session, rpSessionRegisteredAt: unixTime() }
   }

   function rpSessionRegistrationIsFresh(session: PortalSession): boolean {
     return (
       typeof session.rpSessionRegisteredAt === 'number' &&
       session.rpSessionRegisteredAt + RP_SESSION_REGISTRATION_INTERVAL_SECONDS > unixTime()
     )
   }
   ```

6. [ ] Run it and expect PASS: `npx vitest run server/__tests__/sso-session-resolver.spec.ts`
   - Expected: `Test Files 1 passed (1)` / `Tests 2 passed (2)`.

7. [ ] Commit:
   ```bash
   git add services/sso-admin-frontend/server/utils/proxy-headers.ts services/sso-admin-frontend/server/utils/session-registration.ts services/sso-admin-frontend/server/utils/sso-session-resolver.ts services/sso-admin-frontend/server/__tests__/sso-session-resolver.spec.ts
   git commit -m "feat(sso-admin-frontend): port SSO session resolver + RP registration heartbeat

1:1 port of request-scoped resolve/refresh with a 300s RP-registration dedup,
plus its proxy-headers and session-registration dependencies (reused by the
proxy route adapters).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
   ```

---

### Task 1.10: Port widget-cookie (mint `__Host-sso_session` from id_token `sid`) to `server/utils/widget-cookie.ts`

> First-party widget session cookie. Value is the raw IdP `session_id` (== id_token `sid`), so the same-origin `/widget/*` proxy resolves the session backend-side. `SameSite=Lax`, host-only `__Host-` prefix. Minted only with a non-empty `sid` from an already-verified id_token; re-minted on every refresh (sliding window). These focused units lock the same cookie invariants the `auth-flow` integration test asserts end-to-end.

**Files:**
- Create: `services/sso-admin-frontend/server/utils/widget-cookie.ts`
- Test: `services/sso-admin-frontend/server/__tests__/widget-cookie.spec.ts`

**Interfaces:**
- Consumes: `serializeCookie`, `CookieOptions` (1.2).
- Produces:
  - `const SSO_WIDGET_SESSION_COOKIE = '__Host-sso_session'`
  - `widgetHostCookieOptions(maxAge): CookieOptions`; `expiredWidgetHostCookieOptions(): CookieOptions`
  - `widgetSessionCookie(input: { sid?: string; maxAgeSeconds: number }): string | null`
  - `clearWidgetSessionCookie(): string`

**Steps:**

1. [ ] Write the failing test `server/__tests__/widget-cookie.spec.ts`:

   ```ts
   // @vitest-environment node
   import { describe, expect, it } from 'vitest'
   import {
     SSO_WIDGET_SESSION_COOKIE,
     clearWidgetSessionCookie,
     widgetSessionCookie,
   } from '../utils/widget-cookie'

   describe('admin BFF widget cookie', () => {
     it('mints __Host-sso_session from a non-empty sid with Lax host-only attributes', () => {
       const cookie = widgetSessionCookie({ sid: 'idp-session-id', maxAgeSeconds: 3600 })
       expect(cookie).not.toBeNull()
       expect(cookie).toContain(`${SSO_WIDGET_SESSION_COOKIE}=idp-session-id`)
       expect(cookie).toContain('Max-Age=3600')
       expect(cookie).toContain('Path=/')
       expect(cookie).toContain('HttpOnly')
       expect(cookie).toContain('Secure')
       expect(cookie).toContain('SameSite=Lax')
       expect(cookie).not.toMatch(/Domain=/u)
     })

     it('returns null when the id_token carried no usable sid', () => {
       expect(widgetSessionCookie({ sid: undefined, maxAgeSeconds: 3600 })).toBeNull()
       expect(widgetSessionCookie({ sid: '', maxAgeSeconds: 3600 })).toBeNull()
     })

     it('clears __Host-sso_session with Max-Age=0 and the epoch Expires date', () => {
       const cookie = clearWidgetSessionCookie()
       expect(cookie).toContain(`${SSO_WIDGET_SESSION_COOKIE}=`)
       expect(cookie).toContain('Max-Age=0')
       expect(cookie).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT')
       expect(cookie).toContain('SameSite=Lax')
     })
   })
   ```

2. [ ] Run it and expect FAIL: `npx vitest run server/__tests__/widget-cookie.spec.ts`
   - Expected: `FAIL` with `Error: Failed to resolve import "../utils/widget-cookie"`. Summary: `Test Files 1 failed (1)`.

3. [ ] Implement `server/utils/widget-cookie.ts` (1:1):

   ```ts
   import { serializeCookie, type CookieOptions } from './cookies'

   // First-party widget session cookie. Value is the raw IdP `session_id` (== id_token `sid`),
   // so the same-origin /widget/* proxy can resolve the session backend-side. Host-only.
   export const SSO_WIDGET_SESSION_COOKIE = '__Host-sso_session'

   /**
    * Widget session cookie options: same-origin /widget/* fetch only needs SameSite=Lax,
    * which is safer than None and still survives the BFF same-origin proxy hop.
    */
   export function widgetHostCookieOptions(maxAge: number): CookieOptions {
     return {
       httpOnly: true,
       maxAge,
       path: '/',
       sameSite: 'Lax',
       secure: true,
     }
   }

   export function expiredWidgetHostCookieOptions(): CookieOptions {
     return {
       ...widgetHostCookieOptions(0),
       expires: new Date(0),
     }
   }

   /**
    * Mint the first-party widget session cookie from the validated id_token `sid`.
    * The value is the raw IdP `session_id`; the same-origin /widget/* proxy forwards it
    * so the backend resolves the session host-locally. Only call with a non-empty `sid`
    * taken from an id_token that has already passed signature/issuer/audience/nonce checks.
    *
    * The cookie's max-age tracks the BFF session (re-minted on every /auth/refresh), NOT
    * the backend SsoSession idle/absolute clock. A /widget/* 401 WITH this cookie present
    * therefore means the backend session expired or was revoked — graceful, not a client bug.
    */
   export function widgetSessionCookie(input: {
     readonly sid?: string
     readonly maxAgeSeconds: number
   }): string | null {
     if (typeof input.sid !== 'string' || input.sid === '') return null

     return serializeCookie(
       SSO_WIDGET_SESSION_COOKIE,
       input.sid,
       widgetHostCookieOptions(input.maxAgeSeconds),
     )
   }

   export function clearWidgetSessionCookie(): string {
     return serializeCookie(SSO_WIDGET_SESSION_COOKIE, '', expiredWidgetHostCookieOptions())
   }
   ```

4. [ ] Run it and expect PASS: `npx vitest run server/__tests__/widget-cookie.spec.ts`
   - Expected: `Test Files 1 passed (1)` / `Tests 3 passed (3)`.

5. [ ] Run the full ported util suite to confirm Phase 1 utils are green together:
   `npx vitest run server/__tests__/`
   - Expected: `Test Files 10 passed (10)` / `Tests 34 passed (34)` (config 2 + cookies 5 + session-crypto 3 + session 6 + session-store 4 + response 5 + user-api 2 + session-refresh 2 + sso-session-resolver 2 + widget-cookie 3 = 34) — adjust the printed total to the actual sum if any task's test count was tuned during implementation.

6. [ ] Commit:
   ```bash
   git add services/sso-admin-frontend/server/utils/widget-cookie.ts services/sso-admin-frontend/server/__tests__/widget-cookie.spec.ts
   git commit -m "feat(sso-admin-frontend): port widget-cookie minting from id_token sid

1:1 port of __Host-sso_session minting (Lax, host-only, raw sid value),
null-on-missing-sid guard, and the epoch-expiry clear helper.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
   ```

---

## Phase 1 (continued) — routes, auth, and perf gates (Tasks 1.11–1.16)

Self-contained section of the `sso-admin-frontend` Nuxt 4 / Nitro migration plan
(design `docs/design/sso-admin-frontend-nuxt4-ssr-swiss-redesign-technical-design.md`
§4.3 1:1 BFF parity, §9 testing, §3.3 SSR token-leak rule). Tasks 1.1–1.10 (the
util ports: `config`, `cookies`, `session-crypto`, `session` + `session-store`,
`response` — which exports **`sendAppResponse(event, appResponse)`** — `proxy-headers`,
`user-api`, `session-refresh`, `sso-session-resolver`, `widget-cookie`) are assumed
DONE. **Every route adapter below calls `sendAppResponse(event, …)`, the Nitro
adapter exported by the p1-utils `server/utils/response.ts` port** (`FIXES.md` §Global).
TDD is mandatory (RED → GREEN → commit); no placeholders; DRY/YAGNI.

All paths are under `services/sso-admin-frontend/`. Commands are run from that
directory.

---

### Task 1.11: OIDC auth handlers (login / callback / logout / refresh)

**Files:**
- Test: `server/__tests__/auth-flow.spec.ts` (ported from `src/server/__tests__/auth-flow.spec.ts`, import specifiers adjusted)
- Create: `shared/auth-status.ts` (port of `src/shared/auth-status.ts`)
- Create: `server/utils/oidc-discovery.ts` (port of `src/lib/oidc/discovery.ts`)
- Create: `server/utils/pkce.ts` (port of `src/server/pkce.ts`)
- Create: `server/utils/auth-handlers.ts` (port of `src/server/auth-handlers.ts`, imports rewritten)
- Create: `server/routes/auth/login.ts`
- Create: `server/routes/auth/callback.ts`
- Create: `server/routes/auth/logout.ts`
- Create: `server/routes/auth/refresh.ts`

**Interfaces:**
- Consumes:
  - config (1.3): `getConfig()`, type `PortalConfig`.
  - user-api (1.7): `fetchPrincipalWithAccessToken(accessToken, ctx)`; user-api-error helpers `isUserApiError`, `isMfaRequiredApiError`, `isReauthRequiredApiError`, `isTooManyAttemptsApiError`.
  - session (1.4): `pullTransaction`, `transactionCookie`, `clearTransactionCookie`, `sessionCookie`, `sessionCookieForId`, `sessionCookieMaxAge`, `sessionFromBootstrap`, `readSession`, `replaceSession`, `clearSessionCookie`, `unixTime`; type `PortalSession`.
  - widget-cookie (1.10): `widgetSessionCookie`, `clearWidgetSessionCookie`.
  - session-refresh (1.8): `refreshPortalSession`, `sessionNeedsRefresh`; session-registration `registerClientSession`.
  - proxy-headers (1.6): `resolveBffRequestId`.
  - response util (p1-utils `server/utils/response.ts` — exports **`sendAppResponse`**): `json`, `redirect`, `methodNotAllowed`, `sendAppResponse`; type `AppResponse`.
  - `jose`: `createRemoteJWKSet`, `jwtVerify`.
- Produces:
  - `shared/auth-status.ts`: route constants (`ACCESS_DENIED_ROUTE`, `HANDSHAKE_FAILED_ROUTE`, `INVALID_CREDENTIALS_ROUTE`, `MFA_REQUIRED_ROUTE`, `REAUTH_REQUIRED_ROUTE`, `TOO_MANY_ATTEMPTS_ROUTE`, `SESSION_EXPIRED_ROUTE`, `GENERIC_ERROR_ROUTE`), `authStatusCopy`, `legacyAuthErrorRoute(error)`.
  - `server/utils/oidc-discovery.ts`: `fetchDiscovery(discoveryUrl): Promise<DiscoveryMetadata>`, type `DiscoveryMetadata`, `class DiscoveryFetchError`, `__clearDiscoveryCacheForTests()`.
  - `server/utils/pkce.ts`: `generateCodeVerifier()`, `generateCodeChallenge(verifier)`, `generateState()`, `generateNonce()`, `buildAuthorizeUrl(params)`.
  - `server/utils/auth-handlers.ts`: `handleLogin(requestUrl): Promise<AppResponse>`, `handleCallback(request, requestUrl): Promise<AppResponse>`, `handleCallbackSession(request): Promise<AppResponse>`, `handleLogout(request): Promise<AppResponse>`, `handleRefresh(request): Promise<AppResponse>`.
  - `server/routes/auth/{login,callback,logout,refresh}.ts`: thin `defineEventHandler` adapters that delegate to the handlers and emit via `sendAppResponse`.

- [ ] **Step 1: Port the failing test** — copy `src/server/__tests__/auth-flow.spec.ts` to `server/__tests__/auth-flow.spec.ts`, changing only the dynamic import specifiers (`'../auth-handlers.js'` → `'../utils/auth-handlers'`, `'../session.js'` → `'../utils/session'`). The full ported file:

```ts
import type { IncomingMessage } from 'node:http'
import { Readable } from 'node:stream'
import { jwtVerify } from 'jose'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('jose', () => ({
  createRemoteJWKSet: vi.fn<() => () => void>(() => vi.fn<() => void>()),
  jwtVerify: vi.fn<() => Promise<{ payload: Record<string, unknown> }>>(async () => ({
    payload: { sub: 'admin-subject', exp: 4_102_444_800, nonce: 'n' },
  })),
}))

function requestWithCookie(cookie: string): IncomingMessage {
  const request = Readable.from([]) as Readable & { headers: Record<string, string> }
  request.headers = { cookie, 'x-request-id': 'req-admin-login-flow' }
  return request as unknown as IncomingMessage
}

describe('admin BFF auth flow', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('VITE_ADMIN_BASE_URL', 'https://admin-sso.example.test')
    vi.stubEnv('VITE_SSO_BASE_URL', 'https://api-sso.example.test')
    vi.stubEnv('ADMIN_OIDC_PUBLIC_ISSUER', 'https://sso.example.test')
    vi.stubEnv('ADMIN_OIDC_CLIENT_ID', 'sso-admin-panel')
    vi.stubEnv('ADMIN_OIDC_CLIENT_SECRET', 'admin-bff-secret')
    vi.stubEnv('SESSION_ENCRYPTION_SECRET', 'test-admin-session-secret-32-bytes-long')
    vi.stubEnv('SSO_ADMIN_SESSION_REDIS_URL', '')
  })

  it('returns an authenticated admin from OIDC callback to the admin dashboard', async () => {
    let tokenRequest: RequestInit | undefined
    let userinfoRequest: RequestInit | undefined
    let registerRequest: RequestInit | undefined
    const fetchMock = vi.fn<(input: string | URL, init?: RequestInit) => Promise<Response>>(
      async (input, init) => {
        const url = input.toString()

        if (url === 'https://api-sso.example.test/connect/register-session') {
          registerRequest = init
          return Response.json({ registered: true, client_id: 'sso-admin-panel' })
        }

        if (url.endsWith('/.well-known/openid-configuration')) {
          return Response.json({
            issuer: 'https://api-sso.example.test',
            authorization_endpoint: 'https://api-sso.example.test/authorize',
            token_endpoint: 'https://api-sso.example.test/token',
            jwks_uri: 'https://api-sso.example.test/jwks',
            response_types_supported: ['code'],
            subject_types_supported: ['public'],
            id_token_signing_alg_values_supported: ['RS256'],
          })
        }

        if (url === 'https://api-sso.example.test/token') {
          tokenRequest = init
          return Response.json({
            access_token: 'server-side-access-token',
            id_token: 'verified-id-token',
            refresh_token: 'server-side-refresh-token',
            expires_in: 3600,
          })
        }

        if (url === 'https://api-sso.example.test/userinfo') {
          userinfoRequest = init
          return Response.json({
            sub: 'admin-subject',
            email: 'admin@example.test',
            name: 'Admin User',
            role: 'admin',
            auth_time: 1_780_000_000,
            amr: ['pwd', 'mfa'],
            acr: 'urn:timeh:aal2',
            last_login_at: '2026-06-01T08:00:00Z',
          })
        }

        return new Response('not found', { status: 404 })
      },
    )
    vi.stubGlobal('fetch', fetchMock)

    const { handleCallback, handleLogin } = await import('../utils/auth-handlers')

    const login = await handleLogin(
      new URL('https://admin-sso.example.test/auth/login?return_to=/dashboard'),
    )
    const location = new URL(String(login.headers?.location))
    const cookies = login.headers?.['set-cookie']
    const txCookie = Array.isArray(cookies) ? cookies[0] : String(cookies)
    const cookieHeader = txCookie.split(';')[0]

    expect(login.status).toBe(302)
    expect(location.origin).toBe('https://sso.example.test')
    expect(location.pathname).toBe('/authorize')
    expect(location.searchParams.get('client_id')).toBe('sso-admin-panel')
    expect(location.searchParams.get('redirect_uri')).toBe(
      'https://admin-sso.example.test/auth/callback',
    )
    vi.mocked(jwtVerify).mockResolvedValueOnce({
      payload: {
        sub: 'admin-subject',
        exp: 4_102_444_800,
        nonce: location.searchParams.get('nonce'),
      },
      protectedHeader: { alg: 'RS256' },
    } as unknown as Awaited<ReturnType<typeof jwtVerify>>)

    const callback = await handleCallback(
      requestWithCookie(cookieHeader),
      new URL(
        `https://admin-sso.example.test/auth/callback?code=admin-code&state=${location.searchParams.get('state')}`,
      ),
    )

    expect(callback.status).toBe(302)
    expect(callback.headers?.location).toBe('https://admin-sso.example.test/dashboard')
    expect(callback.headers?.location).not.toContain('sso.example.test/home')
    expect(callback.headers?.['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringContaining('__Host-sso-admin-session=')]),
    )
    expect(tokenRequest?.method).toBe('POST')
    expect(String(tokenRequest?.body)).toContain(
      'redirect_uri=https%3A%2F%2Fadmin-sso.example.test%2Fauth%2Fcallback',
    )
    expect(new URLSearchParams(String(tokenRequest?.body)).get('client_secret')).toBe(
      'admin-bff-secret',
    )
    expect(new Headers(tokenRequest?.headers).get('accept-encoding')).toBe('identity')
    expect((userinfoRequest?.headers as Record<string, string> | undefined)?.Authorization).toBe(
      'Bearer server-side-access-token',
    )
    expect(new Headers(userinfoRequest?.headers).get('accept-encoding')).toBe('identity')

    // The admin BFF must register its RP session with the IdP so the admin panel
    // is visible in the user's connected-apps list AND reachable by OIDC
    // back-channel logout (single sign-out propagation).
    expect(registerRequest?.method).toBe('POST')
    expect((registerRequest?.headers as Record<string, string> | undefined)?.Authorization).toBe(
      'Bearer server-side-access-token',
    )
  })

  it('forwards step-up prompt and max age to the authorize request', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<(input: string | URL) => Promise<Response>>(async (input) => {
        if (input.toString().endsWith('/.well-known/openid-configuration')) {
          return Response.json({
            issuer: 'https://api-sso.example.test',
            authorization_endpoint: 'https://api-sso.example.test/authorize',
            token_endpoint: 'https://api-sso.example.test/token',
            jwks_uri: 'https://api-sso.example.test/jwks',
            response_types_supported: ['code'],
            subject_types_supported: ['public'],
            id_token_signing_alg_values_supported: ['RS256'],
          })
        }

        return new Response('not found', { status: 404 })
      }),
    )

    const { handleLogin } = await import('../utils/auth-handlers')
    const login = await handleLogin(
      new URL(
        'https://admin-sso.example.test/auth/login?return_to=/dashboard&prompt=login&max_age=0',
      ),
    )
    const location = new URL(String(login.headers?.location))

    expect(location.origin).toBe('https://sso.example.test')
    expect(location.searchParams.get('prompt')).toBe('login')
    expect(location.searchParams.get('max_age')).toBe('0')
  })

  it('authenticates the confidential client during refresh-token revocation', async () => {
    const calls: Array<{ readonly url: string; readonly init?: RequestInit }> = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        calls.push({ url: input.toString(), init })
        return new Response(null, { status: 200 })
      }),
    )

    const [{ handleLogout }, { sessionCookie }] = await Promise.all([
      import('../utils/auth-handlers'),
      import('../utils/session'),
    ])
    const cookie = (
      await sessionCookie({
        accessToken: 'access-token',
        idToken: 'id-token',
        refreshToken: 'admin-refresh-token',
        sub: 'admin-subject',
        subject: 'admin-subject',
        email: 'admin@example.test',
        displayName: 'Admin',
        role: 'admin',
        expiresAt: 4_102_444_800,
        authTime: null,
        amr: ['pwd', 'mfa'],
        acr: null,
        lastLoginAt: null,
        issuedAt: 1_780_000_000,
        absoluteExpiresAt: 4_102_444_800,
        lastRefreshedAt: 1_780_000_000,
      })
    ).split(';')[0]!

    await handleLogout(requestWithCookie(cookie))

    const revocation = calls.find((call) => call.url.endsWith('/revocation'))
    const body = new URLSearchParams(String(revocation?.init?.body))
    expect(body.get('client_secret')).toBe('admin-bff-secret')
    expect(body.get('token')).toBe('admin-refresh-token')
  })

  it('mints __Host-sso_session from the validated id_token sid for the same-origin widget', async () => {
    const fetchMock = vi.fn<(input: string | URL, init?: RequestInit) => Promise<Response>>(
      async (input) => {
        const url = input.toString()

        if (url === 'https://api-sso.example.test/connect/register-session') {
          return Response.json({ registered: true, client_id: 'sso-admin-panel' })
        }

        if (url.endsWith('/.well-known/openid-configuration')) {
          return Response.json({
            issuer: 'https://api-sso.example.test',
            authorization_endpoint: 'https://api-sso.example.test/authorize',
            token_endpoint: 'https://api-sso.example.test/token',
            jwks_uri: 'https://api-sso.example.test/jwks',
            response_types_supported: ['code'],
            subject_types_supported: ['public'],
            id_token_signing_alg_values_supported: ['RS256'],
          })
        }

        if (url === 'https://api-sso.example.test/token') {
          return Response.json({
            access_token: 'server-side-access-token',
            id_token: 'verified-id-token',
            refresh_token: 'server-side-refresh-token',
            expires_in: 3600,
          })
        }

        if (url === 'https://api-sso.example.test/userinfo') {
          return Response.json({
            sub: 'admin-subject',
            email: 'admin@example.test',
            name: 'Admin User',
            role: 'admin',
            auth_time: 1_780_000_000,
            amr: ['pwd', 'mfa'],
            acr: 'urn:timeh:aal2',
            last_login_at: '2026-06-01T08:00:00Z',
          })
        }

        return new Response('not found', { status: 404 })
      },
    )
    vi.stubGlobal('fetch', fetchMock)

    const { handleCallback, handleLogin } = await import('../utils/auth-handlers')

    const login = await handleLogin(
      new URL('https://admin-sso.example.test/auth/login?return_to=/dashboard'),
    )
    const location = new URL(String(login.headers?.location))
    const cookies = login.headers?.['set-cookie']
    const txCookie = Array.isArray(cookies) ? cookies[0] : String(cookies)
    const cookieHeader = txCookie.split(';')[0]

    vi.mocked(jwtVerify).mockResolvedValueOnce({
      payload: {
        sub: 'admin-subject',
        exp: 4_102_444_800,
        nonce: location.searchParams.get('nonce'),
        sid: 'sso-session-id-from-id-token',
      },
      protectedHeader: { alg: 'RS256' },
    } as unknown as Awaited<ReturnType<typeof jwtVerify>>)

    const callback = await handleCallback(
      requestWithCookie(cookieHeader),
      new URL(
        `https://admin-sso.example.test/auth/callback?code=admin-code&state=${location.searchParams.get('state')}`,
      ),
    )

    const setCookies = callback.headers?.['set-cookie']
    const widgetCookie = (Array.isArray(setCookies) ? setCookies : [String(setCookies)]).find(
      (cookie) => cookie.startsWith('__Host-sso_session='),
    )

    expect(widgetCookie).toBeDefined()
    expect(widgetCookie).toContain('__Host-sso_session=sso-session-id-from-id-token')
    expect(widgetCookie).toContain('Secure')
    expect(widgetCookie).toContain('Path=/')
    expect(widgetCookie).toContain('HttpOnly')
    expect(widgetCookie).toContain('SameSite=Lax')
    expect(widgetCookie).not.toContain('Domain=')
  })

  it('clears __Host-sso_session at admin logout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 200 })),
    )

    const [{ handleLogout }, { sessionCookie }] = await Promise.all([
      import('../utils/auth-handlers'),
      import('../utils/session'),
    ])
    const cookie = (
      await sessionCookie({
        accessToken: 'access-token',
        idToken: 'id-token',
        refreshToken: 'admin-refresh-token',
        sub: 'admin-subject',
        subject: 'admin-subject',
        email: 'admin@example.test',
        displayName: 'Admin',
        role: 'admin',
        expiresAt: 4_102_444_800,
        authTime: null,
        amr: ['pwd', 'mfa'],
        acr: null,
        lastLoginAt: null,
        issuedAt: 1_780_000_000,
        absoluteExpiresAt: 4_102_444_800,
        lastRefreshedAt: 1_780_000_000,
      })
    ).split(';')[0]!

    const logout = await handleLogout(requestWithCookie(cookie))
    const setCookies = logout.headers?.['set-cookie']
    const clearedWidget = (Array.isArray(setCookies) ? setCookies : [String(setCookies)]).find(
      (entry) => entry.startsWith('__Host-sso_session='),
    )

    expect(clearedWidget).toBeDefined()
    expect(clearedWidget).toContain('__Host-sso_session=;')
    expect(clearedWidget).toContain('Expires=Thu, 01 Jan 1970')
  })

  it('re-mints __Host-sso_session on admin token refresh so the widget cookie never expires mid-session', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 200 })),
    )

    const [{ handleRefresh }, { sessionCookie }] = await Promise.all([
      import('../utils/auth-handlers'),
      import('../utils/session'),
    ])
    const cookie = (
      await sessionCookie({
        accessToken: 'access-token',
        idToken: 'id-token',
        refreshToken: 'admin-refresh-token',
        sub: 'admin-subject',
        subject: 'admin-subject',
        email: 'admin@example.test',
        displayName: 'Admin',
        role: 'admin',
        sid: 'sso-session-id-from-id-token',
        expiresAt: 4_102_444_800,
        authTime: null,
        amr: ['pwd', 'mfa'],
        acr: null,
        lastLoginAt: null,
        issuedAt: 1_780_000_000,
        absoluteExpiresAt: 4_102_444_800,
        lastRefreshedAt: 1_780_000_000,
      })
    ).split(';')[0]!

    const refresh = await handleRefresh(requestWithCookie(cookie))
    const setCookies = refresh.headers?.['set-cookie']
    const widgetCookie = (Array.isArray(setCookies) ? setCookies : [String(setCookies)]).find(
      (entry) => entry.startsWith('__Host-sso_session='),
    )

    expect(refresh.status).toBe(200)
    expect(widgetCookie).toBeDefined()
    expect(widgetCookie).toContain('__Host-sso_session=sso-session-id-from-id-token')
    expect(widgetCookie).toContain('Max-Age=')
    expect(widgetCookie).toContain('SameSite=Lax')
  })

  it('does not set or clear __Host-sso_session on admin refresh when the session has no sid', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 200 })),
    )

    const [{ handleRefresh }, { sessionCookie }] = await Promise.all([
      import('../utils/auth-handlers'),
      import('../utils/session'),
    ])
    const cookie = (
      await sessionCookie({
        accessToken: 'access-token',
        idToken: 'id-token',
        refreshToken: 'admin-refresh-token',
        sub: 'admin-subject',
        subject: 'admin-subject',
        email: 'admin@example.test',
        displayName: 'Admin',
        role: 'admin',
        expiresAt: 4_102_444_800,
        authTime: null,
        amr: ['pwd', 'mfa'],
        acr: null,
        lastLoginAt: null,
        issuedAt: 1_780_000_000,
        absoluteExpiresAt: 4_102_444_800,
        lastRefreshedAt: 1_780_000_000,
      })
    ).split(';')[0]!

    const refresh = await handleRefresh(requestWithCookie(cookie))
    const setCookies = refresh.headers?.['set-cookie']
    const widgetCookie = (Array.isArray(setCookies) ? setCookies : [String(setCookies)]).find(
      (entry) => entry.startsWith('__Host-sso_session='),
    )

    expect(refresh.status).toBe(200)
    expect(widgetCookie).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/auth-flow.spec.ts`
Expected: FAIL — `Failed to resolve import "../utils/auth-handlers"`.

- [ ] **Step 3: Create `shared/auth-status.ts` (verbatim port — no imports)**

```ts
export const ACCESS_DENIED_ROUTE = '/access-denied'
export const HANDSHAKE_FAILED_ROUTE = '/handshake-failed'
export const INVALID_CREDENTIALS_ROUTE = '/invalid-credentials'
export const MFA_REQUIRED_ROUTE = '/mfa-required'
export const REAUTH_REQUIRED_ROUTE = '/reauth-required'
export const TOO_MANY_ATTEMPTS_ROUTE = '/too-many-attempts'
export const SESSION_EXPIRED_ROUTE = '/session-expired'
export const GENERIC_ERROR_ROUTE = '/error'

export type AuthStatusCopy = {
  readonly badge: string
  readonly title: string
  readonly description: string
  readonly accent: 'accent' | 'danger' | 'warning'
  readonly primaryAction: {
    readonly href: string
    readonly label: string
  }
  readonly secondaryAction?: {
    readonly href: string
    readonly label: string
  }
  readonly note?: string
}

export const authStatusCopy: Record<string, AuthStatusCopy> = {
  [ACCESS_DENIED_ROUTE]: {
    badge: 'Access denied',
    title: 'Akun ini belum punya akses',
    description: 'SSO berhasil, tetapi akun ini belum diizinkan membuka portal ini.',
    accent: 'danger',
    primaryAction: { href: '/auth/logout', label: 'Keluar' },
    secondaryAction: { href: '/', label: 'Kembali' },
    note: 'Hubungi owner SSO bila akses portal perlu diaktifkan.',
  },
  [HANDSHAKE_FAILED_ROUTE]: {
    badge: 'Handshake failed',
    title: 'Validasi login tidak lengkap',
    description: 'State, nonce, atau token exchange tidak lolos validasi keamanan.',
    accent: 'danger',
    primaryAction: { href: '/auth/login', label: 'Ulangi login' },
    secondaryAction: { href: '/', label: 'Kembali' },
  },
  [INVALID_CREDENTIALS_ROUTE]: {
    badge: 'Invalid credentials',
    title: 'Credential tidak dapat divalidasi',
    description: 'Provider SSO menolak permintaan login atau credential yang dipakai tidak valid.',
    accent: 'danger',
    primaryAction: { href: '/auth/login', label: 'Coba lagi' },
  },
  [MFA_REQUIRED_ROUTE]: {
    badge: 'MFA required',
    title: 'Multi-factor authentication wajib aktif',
    description: 'Akses portal membutuhkan faktor autentikasi tambahan sebelum sesi dapat dipakai.',
    accent: 'warning',
    primaryAction: { href: '/auth/login', label: 'Login dengan MFA' },
  },
  [REAUTH_REQUIRED_ROUTE]: {
    badge: 'Re-auth required',
    title: 'Sesi perlu diverifikasi ulang',
    description: 'Aksi sensitif membutuhkan login baru agar sesi tetap segar.',
    accent: 'warning',
    primaryAction: { href: '/auth/login?return_to=/home', label: 'Verifikasi ulang' },
    secondaryAction: { href: '/auth/logout', label: 'Keluar' },
  },
  [TOO_MANY_ATTEMPTS_ROUTE]: {
    badge: 'Rate limited',
    title: 'Terlalu banyak percobaan',
    description: 'Sistem menahan sementara percobaan login untuk melindungi akun.',
    accent: 'warning',
    primaryAction: { href: '/', label: 'Kembali' },
  },
  [SESSION_EXPIRED_ROUTE]: {
    badge: 'Session expired',
    title: 'Sesi SSO sudah berakhir',
    description: 'Silakan login ulang agar sesi terbaru dipakai.',
    accent: 'warning',
    primaryAction: { href: '/auth/login', label: 'Login ulang' },
  },
  [GENERIC_ERROR_ROUTE]: {
    badge: 'Error',
    title: 'Portal SSO belum bisa dibuka',
    description: 'Terjadi masalah saat memproses permintaan portal.',
    accent: 'danger',
    primaryAction: { href: '/', label: 'Kembali' },
  },
}

export function legacyAuthErrorRoute(error: string | undefined): string | null {
  if (!error) return null

  switch (error) {
    case 'auth_failed':
      return INVALID_CREDENTIALS_ROUTE
    case 'invalid_state':
    case 'handshake_failed':
      return HANDSHAKE_FAILED_ROUTE
    case 'mfa_required':
      return MFA_REQUIRED_ROUTE
    case 'not_admin':
      return ACCESS_DENIED_ROUTE
    case 'reauth_required':
      return REAUTH_REQUIRED_ROUTE
    case 'too_many_attempts':
      return TOO_MANY_ATTEMPTS_ROUTE
    case 'session_expired':
      return SESSION_EXPIRED_ROUTE
    default:
      return GENERIC_ERROR_ROUTE
  }
}
```

- [ ] **Step 4: Create `server/utils/oidc-discovery.ts` (port of `src/lib/oidc/discovery.ts` — self-contained, no internal imports)**

```ts
/**
 * OIDC Discovery metadata fetcher with ETag-aware caching.
 *
 * 5-minute TTL, ETag revalidation, concurrent-fetch dedupe. The admin BFF
 * references Discovery on every authorize init / token exchange / validation;
 * the in-memory cache guarantees consistent behavior independent of the HTTP
 * cache. Ported 1:1 from the Vue SPA's lib so the Nitro auth handlers share
 * the same semantics.
 */

export type DiscoveryMetadata = {
  readonly issuer: string
  readonly authorization_endpoint: string
  readonly token_endpoint: string
  readonly userinfo_endpoint?: string
  readonly end_session_endpoint?: string
  readonly revocation_endpoint?: string
  readonly jwks_uri: string
  readonly response_types_supported: readonly string[]
  readonly grant_types_supported?: readonly string[]
  readonly subject_types_supported: readonly string[]
  readonly id_token_signing_alg_values_supported: readonly string[]
  readonly scopes_supported?: readonly string[]
  readonly token_endpoint_auth_methods_supported?: readonly string[]
  readonly code_challenge_methods_supported?: readonly string[]
  readonly claims_supported?: readonly string[]
}

export class DiscoveryFetchError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DiscoveryFetchError'
  }
}

type CacheEntry = {
  readonly metadata: DiscoveryMetadata
  readonly etag: string | null
  readonly fetchedAt: number
}

const DISCOVERY_CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes, aligned with backend Cache-Control.
const DISCOVERY_FETCH_TIMEOUT_MS = 5_000

const cache = new Map<string, CacheEntry>()
const pendingFetches = new Map<string, Promise<CacheEntry>>()

/**
 * Fetch Discovery metadata with ETag-aware caching.
 *
 * @param discoveryUrl - typically `${issuer}/.well-known/openid-configuration`
 */
export async function fetchDiscovery(discoveryUrl: string): Promise<DiscoveryMetadata> {
  const cached = cache.get(discoveryUrl)
  const now = Date.now()

  if (cached && now - cached.fetchedAt < DISCOVERY_CACHE_TTL_MS) {
    return cached.metadata
  }

  const pending = pendingFetches.get(discoveryUrl)
  if (pending) {
    return (await pending).metadata
  }

  const fetchPromise = performFetch(discoveryUrl, cached ?? null)
  pendingFetches.set(discoveryUrl, fetchPromise)

  try {
    const entry = await fetchPromise
    cache.set(discoveryUrl, entry)
    return entry.metadata
  } finally {
    pendingFetches.delete(discoveryUrl)
  }
}

async function performFetch(url: string, previous: CacheEntry | null): Promise<CacheEntry> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Accept-Encoding': 'identity',
  }
  if (previous?.etag) {
    headers['If-None-Match'] = previous.etag
  }

  let response: Response
  try {
    response = await fetch(url, {
      method: 'GET',
      headers,
      credentials: 'omit',
      cache: 'no-cache',
      signal: AbortSignal.timeout(DISCOVERY_FETCH_TIMEOUT_MS),
    })
  } catch (err) {
    throw new DiscoveryFetchError(
      `Discovery request failed: ${err instanceof Error ? err.message : 'network error'}`,
    )
  }

  if (response.status === 304 && previous) {
    return { metadata: previous.metadata, etag: previous.etag, fetchedAt: Date.now() }
  }

  if (!response.ok) {
    throw new DiscoveryFetchError(`Discovery endpoint returned HTTP ${response.status}`)
  }

  let payload: DiscoveryMetadata
  try {
    payload = (await response.json()) as DiscoveryMetadata
  } catch {
    throw new DiscoveryFetchError('Discovery response is not valid JSON.')
  }

  validateMetadata(payload)

  return {
    metadata: payload,
    etag: response.headers.get('ETag'),
    fetchedAt: Date.now(),
  }
}

function validateMetadata(payload: DiscoveryMetadata): void {
  const required: ReadonlyArray<keyof DiscoveryMetadata> = [
    'issuer',
    'authorization_endpoint',
    'token_endpoint',
    'jwks_uri',
    'response_types_supported',
    'subject_types_supported',
    'id_token_signing_alg_values_supported',
  ]

  for (const field of required) {
    if (!(field in payload) || payload[field] === undefined || payload[field] === null) {
      throw new DiscoveryFetchError(`Discovery metadata missing required field: ${field}`)
    }
  }
}

/** Test-only: clear the in-memory cache. */
export function __clearDiscoveryCacheForTests(): void {
  cache.clear()
  pendingFetches.clear()
}
```

- [ ] **Step 5: Create `server/utils/pkce.ts` (port of `src/server/pkce.ts`; `'./config.js'` → `'./config'`)**

```ts
import { webcrypto } from 'node:crypto'
import { getConfig } from './config'

export function generateCodeVerifier(): string {
  return base64UrlEncode(webcrypto.getRandomValues(new Uint8Array(32)))
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier)
  const digest = await webcrypto.subtle.digest('SHA-256', data)
  return base64UrlEncode(new Uint8Array(digest))
}

export function generateState(): string {
  return base64UrlEncode(webcrypto.getRandomValues(new Uint8Array(16)))
}

export function generateNonce(): string {
  return base64UrlEncode(webcrypto.getRandomValues(new Uint8Array(16)))
}

export function buildAuthorizeUrl(params: {
  readonly state: string
  readonly nonce: string
  readonly codeChallenge: string
  readonly loginHint?: string
  readonly prompt?: string
  readonly maxAge?: string
  readonly authorizationEndpoint?: string
}): string {
  const config = getConfig()
  const url = new URL(params.authorizationEndpoint ?? config.authorizeUrl)
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('redirect_uri', config.redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set(
    'scope',
    process.env.ADMIN_OIDC_SCOPE ?? 'openid profile email offline_access roles permissions',
  )
  url.searchParams.set('state', params.state)
  url.searchParams.set('nonce', params.nonce)
  url.searchParams.set('code_challenge', params.codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')

  if (params.loginHint) {
    url.searchParams.set('login_hint', params.loginHint)
  }

  if (params.prompt) {
    url.searchParams.set('prompt', params.prompt)
  }

  if (params.maxAge) {
    url.searchParams.set('max_age', params.maxAge)
  }

  return url.toString()
}

function base64UrlEncode(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url')
}
```

- [ ] **Step 6: Create `server/utils/auth-handlers.ts` (port of `src/server/auth-handlers.ts`; imports rewritten for the Nitro layout — `../shared/auth-status.js` → `../../shared/auth-status`, `../lib/oidc/discovery.js` → `./oidc-discovery`, all sibling `./*.js` → `./*`)**

```ts
import type { IncomingMessage } from 'node:http'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import {
  ACCESS_DENIED_ROUTE,
  HANDSHAKE_FAILED_ROUTE,
  INVALID_CREDENTIALS_ROUTE,
  MFA_REQUIRED_ROUTE,
  REAUTH_REQUIRED_ROUTE,
  TOO_MANY_ATTEMPTS_ROUTE,
} from '../../shared/auth-status'
import { fetchPrincipalWithAccessToken } from './user-api'
import {
  isMfaRequiredApiError,
  isReauthRequiredApiError,
  isTooManyAttemptsApiError,
  isUserApiError,
} from './user-api-error'
import type { PortalConfig } from './config'
import { getConfig } from './config'
import { fetchDiscovery, type DiscoveryMetadata } from './oidc-discovery'
import {
  clearSessionCookie,
  clearTransactionCookie,
  pullTransaction,
  readSession,
  replaceSession,
  sessionCookie,
  sessionCookieForId,
  sessionCookieMaxAge,
  sessionFromBootstrap,
  transactionCookie,
  unixTime,
} from './session'
import type { PortalSession } from './session'
import { clearWidgetSessionCookie, widgetSessionCookie } from './widget-cookie'
import { refreshPortalSession, sessionNeedsRefresh } from './session-refresh'
import type { AppResponse } from './response'
import { json, redirect } from './response'
import {
  buildAuthorizeUrl,
  generateCodeChallenge,
  generateCodeVerifier,
  generateNonce,
  generateState,
} from './pkce'
import { resolveBffRequestId } from './proxy-headers'
import { registerClientSession } from './session-registration'

const jwksByUrl = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

export async function handleLogin(requestUrl: URL): Promise<AppResponse> {
  const config = getConfig()
  const state = generateState()
  const nonce = generateNonce()
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = await generateCodeChallenge(codeVerifier)
  const returnTo = normalizeReturnTo(requestUrl.searchParams.get('return_to'))
  const loginHint = requestUrl.searchParams.get('login_hint')
  const prompt = promptParam(requestUrl.searchParams.get('prompt'))
  const maxAge = maxAgeParam(requestUrl.searchParams.get('max_age'))

  await fetchValidatedDiscoveryMetadata()
  const location = buildAuthorizeUrl({
    state,
    nonce,
    codeChallenge,
    authorizationEndpoint: config.publicAuthorizeUrl,
    ...(loginHint ? { loginHint } : {}),
    ...(prompt ? { prompt } : {}),
    ...(maxAge ? { maxAge } : {}),
  })

  return redirect(location, [
    transactionCookie({
      state,
      nonce,
      codeVerifier,
      ...(returnTo ? { returnTo } : {}),
    }),
  ])
}

function promptParam(value: string | null): string | null {
  return value === 'login' ? value : null
}

function maxAgeParam(value: string | null): string | null {
  return value !== null && /^\d+$/u.test(value) ? value : null
}

export async function handleCallback(
  request: IncomingMessage,
  requestUrl: URL,
): Promise<AppResponse> {
  const config = getConfig()
  const params = readCallbackParams(requestUrl)
  const earlyRoute = validateCallback(params)
  if (earlyRoute) return redirect(new URL(earlyRoute, config.appBaseUrl).toString())
  if (!params.code || !params.state) return redirectWithClearedTx(config, HANDSHAKE_FAILED_ROUTE)

  const receivedIssuer = requestUrl.searchParams.get('iss')
  if (receivedIssuer && receivedIssuer !== config.issuer) {
    return redirectWithClearedTx(config, HANDSHAKE_FAILED_ROUTE)
  }

  const result = await completeCallbackSession(request, params.code, params.state)
  if (!result.ok) return redirectWithClearedTx(config, callbackErrorRoute(result.error))

  return redirect(
    new URL(result.returnTo, config.appBaseUrl).toString(),
    await postLoginCookies(result.session),
  )
}

/**
 * Cookies set after a successful OIDC callback: the opaque admin BFF session
 * cookie, the same-origin widget session cookie minted from the validated
 * id_token `sid` (omitted if the token carried none), and the transaction
 * cookie clear.
 */
async function postLoginCookies(session: PortalSession): Promise<readonly string[]> {
  const widgetCookie = widgetSessionCookie({
    sid: session.sid,
    maxAgeSeconds: sessionCookieMaxAge(session),
  })

  return [
    await sessionCookie(session),
    ...(widgetCookie ? [widgetCookie] : []),
    clearTransactionCookie(),
  ]
}

export async function handleCallbackSession(request: IncomingMessage): Promise<AppResponse> {
  const body = await readJsonBody(request)
  const code = typeof body.code === 'string' ? body.code : null
  const state = typeof body.state === 'string' ? body.state : null

  if (!code || !state) {
    return json(
      422,
      { error: 'missing_params', message: 'Parameter code atau state tidak ditemukan.' },
      {
        'set-cookie': [clearTransactionCookie()],
      },
    )
  }

  const result = await completeCallbackSession(request, code, state)
  if (!result.ok) {
    return json(
      401,
      { error: 'callback_failed', message: 'Gagal menyiapkan sesi aman.' },
      {
        'set-cookie': [clearTransactionCookie()],
      },
    )
  }

  return json(
    200,
    {
      authenticated: true,
      post_login_redirect: result.returnTo,
    },
    { 'set-cookie': await postLoginCookies(result.session) },
  )
}

export async function handleLogout(request: IncomingMessage): Promise<AppResponse> {
  const config = getConfig()
  const requestId = resolveBffRequestId(request.headers)
  const rawSession = await readSession(request)
  const session = rawSession ? await refreshSessionForLogout(rawSession, requestId) : null
  const refreshToken = session?.refreshToken ?? rawSession?.refreshToken
  const revocations: Array<Promise<void>> = []

  if (session)
    revocations.push(revokeSession(config.internalLogoutUrl, session.accessToken, requestId))
  if (refreshToken) revocations.push(revokeRefreshToken(config, refreshToken, requestId))
  if (revocations.length > 0) await Promise.allSettled(revocations)

  return redirect(new URL('/', config.appBaseUrl).toString(), [
    ...(await clearSessionCookie(request)),
    clearWidgetSessionCookie(),
    clearTransactionCookie(),
  ])
}

export async function handleRefresh(request: IncomingMessage): Promise<AppResponse> {
  const sessionId = sessionIdFromRequest(request)
  const session = await readSession(request)

  if (!sessionId || !session?.refreshToken) {
    return json(
      401,
      { error: 'no_session', message: 'No active session or refresh token.' },
      { 'set-cookie': await clearSessionCookie(request) },
    )
  }

  try {
    if (!sessionNeedsRefresh(session)) return refreshResponse(sessionId, session)

    const requestId = resolveBffRequestId(request.headers)
    const refreshedSession = await refreshPortalSession(session, { requestId })
    // Keep the IdP RP-session registration alive across token rotation so the
    // admin stays visible in connected-apps and logout-reachable.
    const registeredSession = (await registerClientSession(refreshedSession.accessToken, requestId))
      ? { ...refreshedSession, rpSessionRegisteredAt: unixTime() }
      : refreshedSession
    await replaceSession(sessionId, registeredSession)

    return refreshResponse(sessionId, registeredSession)
  } catch (error) {
    console.error('Token refresh failed:', error instanceof Error ? error.message : error)
    return json(
      401,
      { error: 'refresh_failed', message: 'Token refresh failed.' },
      { 'set-cookie': await clearSessionCookie(request) },
    )
  }
}

function sessionIdFromRequest(request: IncomingMessage): string | null {
  const raw = request.headers.cookie ?? ''
  const match = raw.match(/(?:^|;\s*)__Host-sso-admin-session=([^;]+)/u)
  return match?.[1] ? decodeURIComponent(match[1]) : null
}

function refreshResponse(sessionId: string, session: PortalSession): AppResponse {
  // Re-set the widget cookie only when the refreshed session still carries a sid; if it
  // is unavailable, leave the existing __Host-sso_session cookie untouched (never clear).
  // Mirrors the portal BFF — the widget cookie's max-age is the sliding idle window, so it
  // must be renewed on every refresh or the admin widget 401s mid-session.
  const widgetCookie = widgetSessionCookie({
    sid: session.sid,
    maxAgeSeconds: sessionCookieMaxAge(session),
  })
  return json(
    200,
    {
      status: 'refreshed',
      expiresAt: session.expiresAt,
    },
    {
      'set-cookie': [
        sessionCookieForId(sessionId, session),
        ...(widgetCookie ? [widgetCookie] : []),
      ],
    },
  )
}

async function refreshSessionForLogout(
  session: PortalSession,
  requestId: string,
): Promise<PortalSession | null> {
  if (!sessionNeedsRefresh(session, 30)) return session

  try {
    return await refreshPortalSession(session, { requestId })
  } catch (error) {
    console.error(
      'Token refresh before logout failed:',
      error instanceof Error ? error.message : error,
    )
    return sessionNeedsRefresh(session, 0) ? null : session
  }
}

function readCallbackParams(requestUrl: URL): {
  readonly code: string | null
  readonly error: string | null
  readonly state: string | null
} {
  return {
    code: requestUrl.searchParams.get('code'),
    error: requestUrl.searchParams.get('error'),
    state: requestUrl.searchParams.get('state'),
  }
}

function validateCallback(params: ReturnType<typeof readCallbackParams>): string | null {
  if (params.error) return providerErrorRoute(params.error)
  if (typeof params.state !== 'string' || typeof params.code !== 'string')
    return HANDSHAKE_FAILED_ROUTE
  return null
}

function providerErrorRoute(error: string): string {
  switch (error) {
    case 'mfa_required':
      return MFA_REQUIRED_ROUTE
    case 'too_many_attempts':
      return TOO_MANY_ATTEMPTS_ROUTE
    case 'invalid_request':
    case 'temporarily_unavailable':
    case 'server_error':
      return HANDSHAKE_FAILED_ROUTE
    default:
      return INVALID_CREDENTIALS_ROUTE
  }
}

function callbackErrorRoute(error: unknown): string {
  if (isMfaRequiredApiError(error)) return MFA_REQUIRED_ROUTE
  if (isReauthRequiredApiError(error)) return REAUTH_REQUIRED_ROUTE
  if (isTooManyAttemptsApiError(error)) return TOO_MANY_ATTEMPTS_ROUTE
  if (isUserApiError(error) && error.status === 403) return ACCESS_DENIED_ROUTE
  return HANDSHAKE_FAILED_ROUTE
}

function redirectWithClearedTx(config: PortalConfig, route: string): AppResponse {
  return redirect(new URL(route, config.appBaseUrl).toString(), [clearTransactionCookie()])
}

type CallbackSessionResult =
  | { readonly ok: true; readonly session: PortalSession; readonly returnTo: string }
  | { readonly ok: false; readonly error: unknown }

type TokenSet = {
  readonly access_token: string
  readonly id_token: string
  readonly refresh_token: string
  readonly expires_in: number
}

async function completeCallbackSession(
  request: IncomingMessage,
  code: string,
  state: string,
): Promise<CallbackSessionResult> {
  const tx = pullTransaction(request)
  if (!tx || tx.state !== state)
    return { ok: false, error: new Error('OIDC callback transaction mismatch.') }

  let verifiedSubjectId: string | null = null

  try {
    const discovery = await fetchValidatedDiscoveryMetadata()
    const requestId = resolveBffRequestId(request.headers)
    const tokens = await exchangeCode(discovery, code, tx.codeVerifier, requestId)
    const claims = await verifyIdToken(tokens.id_token, tx.nonce, discovery)
    verifiedSubjectId = claims.sub
    const principal = await fetchPrincipalWithAccessToken(tokens.access_token, { requestId })

    if (principal.subjectId !== claims.sub) {
      throw new Error('Admin principal subject does not match the verified ID token subject.')
    }

    // Register the RP session so the admin panel is visible in connected-apps and
    // reachable by IdP single sign-out (back-channel logout). Best-effort.
    const rpSessionRegistered = await registerClientSession(tokens.access_token, requestId)
    const session = sessionFromBootstrap(
      {
        accessToken: tokens.access_token,
        idToken: tokens.id_token,
        refreshToken: tokens.refresh_token,
        expiresAt: Math.floor(Date.now() / 1000) + tokens.expires_in,
        sid: claims.sid,
      },
      principal,
    )

    return {
      ok: true,
      returnTo: normalizeReturnTo(tx.returnTo) ?? '/dashboard',
      session: rpSessionRegistered ? { ...session, rpSessionRegisteredAt: unixTime() } : session,
    }
  } catch (error) {
    logCallbackFailure(error, verifiedSubjectId)
    return { ok: false, error }
  }
}

async function exchangeCode(
  discovery: DiscoveryMetadata,
  code: string,
  codeVerifier: string,
  requestId: string,
): Promise<TokenSet> {
  const config = getConfig()
  const res = await fetch(discovery.token_endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept-Encoding': 'identity',
      'X-Request-Id': requestId,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: config.clientId,
      client_secret: requiredClientSecret(config),
      code,
      redirect_uri: config.redirectUri,
      code_verifier: codeVerifier,
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Token exchange failed: HTTP ${res.status} - ${body}`)
  }

  return res.json() as Promise<TokenSet>
}

async function fetchValidatedDiscoveryMetadata(): Promise<DiscoveryMetadata> {
  const config = getConfig()
  const metadata = await fetchDiscovery(
    `${config.issuer.replace(/\/$/, '')}/.well-known/openid-configuration`,
  )

  if (metadata.issuer !== config.issuer) {
    throw new Error('Discovery issuer mismatch.')
  }

  assertValidHttpsUrl(metadata.authorization_endpoint, 'Discovery authorization endpoint invalid.')
  assertValidHttpsUrl(metadata.token_endpoint, 'Discovery token endpoint invalid.')
  assertValidHttpsUrl(metadata.jwks_uri, 'Discovery JWKS URI invalid.')

  return metadata
}

function assertValidHttpsUrl(value: string, message: string): void {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.hostname !== 'localhost') throw new Error(message)
  } catch {
    throw new Error(message)
  }
}

async function verifyIdToken(
  token: string,
  expectedNonce: string,
  discovery: DiscoveryMetadata,
): Promise<{ readonly sub: string; readonly exp: number; readonly sid?: string }> {
  const config = getConfig()
  const jwksUrl = discovery.jwks_uri
  let jwks = jwksByUrl.get(jwksUrl)
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(jwksUrl))
    jwksByUrl.set(jwksUrl, jwks)
  }

  const { payload } = await jwtVerify(token, jwks, {
    issuer: discovery.issuer,
    audience: config.clientId,
  })

  const sub = payload.sub
  const exp = payload.exp
  const nonce = Reflect.get(payload, 'nonce')
  const sidClaim = Reflect.get(payload, 'sid')
  const sid = typeof sidClaim === 'string' && sidClaim !== '' ? sidClaim : undefined

  if (typeof sub !== 'string' || sub === '')
    throw new Error("ID token is missing a valid 'sub' claim.")
  if (typeof exp !== 'number') throw new Error("ID token is missing a valid 'exp' claim.")
  if (nonce !== expectedNonce) throw new Error('ID token nonce validation failed.')

  return { sub, exp, sid }
}

async function revokeSession(
  logoutUrl: string,
  accessToken: string,
  requestId: string,
): Promise<void> {
  await fetch(logoutUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Accept-Encoding': 'identity',
      'X-Request-Id': requestId,
    },
    signal: AbortSignal.timeout(5_000),
  })
}

async function revokeRefreshToken(
  config: PortalConfig,
  refreshToken: string,
  requestId: string,
): Promise<void> {
  await fetch(config.internalRevocationUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept-Encoding': 'identity',
      'X-Request-Id': requestId,
    },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: requiredClientSecret(config),
      token: refreshToken,
      token_type_hint: 'refresh_token',
    }),
    signal: AbortSignal.timeout(5_000),
  })
}

function requiredClientSecret(config: PortalConfig): string {
  if (config.clientSecret) return config.clientSecret

  throw new Error('ADMIN_OIDC_CLIENT_SECRET is required for confidential OIDC client operations.')
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  if (chunks.length === 0) return {}

  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

function normalizeReturnTo(returnTo: string | null | undefined): string | null {
  if (!returnTo || !returnTo.startsWith('/') || returnTo.startsWith('//')) return null
  if (returnTo.startsWith('/auth/login') || returnTo.startsWith('/auth/callback')) return null
  return returnTo
}

function logCallbackFailure(error: unknown, subjectId: string | null): void {
  const payload = {
    event: 'sso_admin_callback_failed',
    subjectId,
    ...serializeCallbackError(error),
  }

  console.error(JSON.stringify(payload))
}

function serializeCallbackError(error: unknown): Record<string, unknown> {
  if (isUserApiError(error)) {
    return {
      kind: 'sso_api_error',
      status: error.status,
      code: error.code ?? null,
      message: error.message,
    }
  }

  if (error instanceof Error) {
    return {
      kind: 'error',
      name: error.name,
      message: error.message,
    }
  }

  return {
    kind: 'unknown',
    message: String(error),
  }
}
```

- [ ] **Step 7: Create the four thin route adapters** (each calls `sendAppResponse`, the p1-utils response export)

`server/routes/auth/login.ts`:

```ts
import { handleLogin } from '../../utils/auth-handlers'
import { methodNotAllowed, sendAppResponse } from '../../utils/response'

export default defineEventHandler(async (event) => {
  if (event.method !== 'GET') return sendAppResponse(event, methodNotAllowed())
  sendAppResponse(event, await handleLogin(getRequestURL(event)))
})
```

`server/routes/auth/callback.ts`:

```ts
import { handleCallback, handleCallbackSession } from '../../utils/auth-handlers'
import { methodNotAllowed, sendAppResponse } from '../../utils/response'

export default defineEventHandler(async (event) => {
  if (event.method === 'GET') return sendAppResponse(event, await handleCallback(event.node.req, getRequestURL(event)))
  if (event.method === 'POST') return sendAppResponse(event, await handleCallbackSession(event.node.req))
  sendAppResponse(event, methodNotAllowed())
})
```

`server/routes/auth/logout.ts`:

```ts
import { handleLogout } from '../../utils/auth-handlers'
import { methodNotAllowed, sendAppResponse } from '../../utils/response'

export default defineEventHandler(async (event) => {
  if (event.method !== 'GET') return sendAppResponse(event, methodNotAllowed())
  sendAppResponse(event, await handleLogout(event.node.req))
})
```

`server/routes/auth/refresh.ts`:

```ts
import { handleRefresh } from '../../utils/auth-handlers'
import { methodNotAllowed, sendAppResponse } from '../../utils/response'

export default defineEventHandler(async (event) => {
  if (event.method !== 'POST') return sendAppResponse(event, methodNotAllowed())
  sendAppResponse(event, await handleRefresh(event.node.req))
})
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run server/__tests__/auth-flow.spec.ts`
Expected: PASS (7 passed).

- [ ] **Step 9: Run the BFF suite so far + typecheck**

Run: `npx vitest run server/__tests__ && npm run typecheck`
Expected: all server specs PASS; typecheck exits 0.

- [ ] **Step 10: Commit**

```bash
git add shared/auth-status.ts server/utils/pkce.ts server/utils/oidc-discovery.ts server/utils/auth-handlers.ts server/routes/auth/ server/__tests__/auth-flow.spec.ts
git commit -m "feat(admin-nitro): port OIDC login/callback/logout/refresh routes + handlers

PKCE S256 + nonce, code exchange with client_secret, ID-token nonce + JWKS
verification, principal fetch, token rotation, revocation-on-logout, and
widget-cookie minting from the id_token sid — 1:1 behavioral parity. Route
adapters emit via sendAppResponse (p1-utils response port).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 1.12: admin API proxy + Bearer injection

**Files:**
- Test: `services/sso-admin-frontend/server/__tests__/admin-proxy.spec.ts` (ported verbatim, import paths adjusted)
- Create: `services/sso-admin-frontend/server/utils/admin-proxy.ts`
- Create: `services/sso-admin-frontend/server/routes/api/admin/[...].ts`

**Interfaces:**
- Consumes: config (1.3), proxy-headers (1.6), response (1.5), session (1.4), sso-session-resolver (1.9).
- Produces (admin-proxy): `type AdminApiRequestOptions`, `type AdminApiRequest`, `buildAdminApiRequest(options)` (maps `/api/admin/*`→`/admin/api/*`, `ops/readiness`→`/ready`, allowlist-gated, injects `Bearer ${session.accessToken}` server-side, strips browser auth), `handleAdminApiProxy({request, requestUrl})` (resolves session, role-gates non-`/me`, structured 400 policy / 502 transport errors with `request_id` + `support_reference`, refreshes cached role from `/me`).
- Produces (route): catch-all `defineEventHandler` adapting `event` → `handleAdminApiProxy`.

- [ ] **Step 1: Port the failing test** — copy `src/server/__tests__/admin-proxy.spec.ts` to `server/__tests__/admin-proxy.spec.ts` verbatim, changing the import specifiers:
  - top `import { buildAdminApiRequest } from '../admin-proxy.js'` → `'../utils/admin-proxy'`
  - `import type { PortalSession } from '../session.js'` → `'../utils/session'`
  - all `vi.doMock('../config.js', …)` → `vi.doMock('../utils/config', …)`
  - all `vi.doMock('../sso-session-resolver.js', …)` → `vi.doMock('../utils/sso-session-resolver', …)`
  - `vi.doMock('../session.js', …)` → `vi.doMock('../utils/session', …)` and its `importActual<typeof import('../session.js')>()` → `importActual<typeof import('../utils/session')>()`
  - all `import('../admin-proxy.js')` → `import('../utils/admin-proxy')`

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/admin-proxy.spec.ts`
Expected: FAIL — `Failed to resolve import "../utils/admin-proxy"`.

- [ ] **Step 3: Write the implementation (verbatim port; imports rewritten)**

```ts
// server/utils/admin-proxy.ts
import type { IncomingHttpHeaders, IncomingMessage } from 'node:http'
import { getConfig } from './config'
import { buildProxyResponseHeaders, resolveBffRequestId, deriveSupportReference } from './proxy-headers'
import type { AppResponse } from './response'
import { json } from './response'
import type { PortalSession } from './session'
import { clearSessionCookie, replaceSession } from './session'
import { resolveSsoSession, sessionHeaders } from './sso-session-resolver'
import type { ResolvedSsoSession } from './sso-session-resolver'

const ADMIN_BFF_PREFIX = '/api/admin'
const ADMIN_BACKEND_PREFIX = '/admin/api'

const ALLOWED_ADMIN_ROUTES = new Set([
  'GET /api/admin/me',
  'GET /api/admin/oidc-foundation',
  'GET /api/admin/dashboard/summary',
  'GET /api/admin/clients',
  'GET /api/admin/users',
  'POST /api/admin/users',
  'GET /api/admin/audit/events',
  'GET /api/admin/audit/authentication-events',
  'GET /api/admin/audit/integrity',
  'GET /api/admin/audit/retention',
  'GET /api/admin/audit/export',
  'GET /api/admin/observability/summary',
  'GET /api/admin/compliance/evidence-pack',
  'GET /api/admin/data-subject-requests',
  'GET /api/admin/roles',
  'GET /api/admin/permissions',
  'POST /api/admin/roles',
  'GET /api/admin/sessions',
  'GET /api/admin/ip-access-rules',
  'POST /api/admin/ip-access-rules',
  'GET /api/admin/sso-error-templates',
  'GET /api/admin/external-idps',
  'POST /api/admin/external-idps',
  'GET /api/admin/ops/readiness',
  'GET /api/admin/client-integrations/registrations',
  'POST /api/admin/client-integrations',
  'POST /api/admin/client-integrations/stage',
  'GET /api/admin/scopes',
])
const ALLOWED_REQUEST_HEADERS = new Set(['accept', 'content-type', 'x-request-id'])
const CLIENT_ID_PATTERN = '[a-z0-9-]+'
const SUBJECT_ID_PATTERN = '[a-zA-Z0-9_-]+'
const AUDIT_EVENT_ID_PATTERN = '[A-Z0-9]+'
const DSR_REQUEST_ID_PATTERN = '[0-9A-HJKMNP-TV-Z]+'
const POLICY_CATEGORY_PATTERN = '[a-z_]+'
const POLICY_VERSION_PATTERN = '[0-9]+'
const ROLE_SLUG_PATTERN = '[a-z0-9_-]+'
const PROVIDER_KEY_PATTERN = '[a-z0-9_-]+'
const SESSION_ID_PATTERN = '[a-zA-Z0-9_-]+'
const NUMERIC_ID_PATTERN = '[0-9]+'
const ERROR_TEMPLATE_KEY_PATTERN = '[a-z0-9_-]+'
const ALLOWED_ADMIN_ROUTE_PATTERNS: readonly RegExp[] = [
  new RegExp(`^GET /api/admin/clients/${CLIENT_ID_PATTERN}$`, 'u'),
  new RegExp(`^PATCH /api/admin/clients/${CLIENT_ID_PATTERN}$`, 'u'),
  new RegExp(`^DELETE /api/admin/clients/${CLIENT_ID_PATTERN}$`, 'u'),
  new RegExp(`^PUT /api/admin/clients/${CLIENT_ID_PATTERN}/scopes$`, 'u'),
  new RegExp(`^POST /api/admin/clients/${CLIENT_ID_PATTERN}/rotate-secret$`, 'u'),
  new RegExp(`^POST /api/admin/client-integrations/${CLIENT_ID_PATTERN}/disable$`, 'u'),
  new RegExp(`^POST /api/admin/client-integrations/${CLIENT_ID_PATTERN}/decommission$`, 'u'),
  new RegExp(`^GET /api/admin/users/${SUBJECT_ID_PATTERN}$`, 'u'),
  new RegExp(`^POST /api/admin/users/${SUBJECT_ID_PATTERN}/lock$`, 'u'),
  new RegExp(`^POST /api/admin/users/${SUBJECT_ID_PATTERN}/unlock$`, 'u'),
  new RegExp(`^POST /api/admin/users/${SUBJECT_ID_PATTERN}/deactivate$`, 'u'),
  new RegExp(`^POST /api/admin/users/${SUBJECT_ID_PATTERN}/reactivate$`, 'u'),
  new RegExp(`^POST /api/admin/users/${SUBJECT_ID_PATTERN}/password-reset$`, 'u'),
  new RegExp(`^POST /api/admin/users/${SUBJECT_ID_PATTERN}/reset-mfa$`, 'u'),
  new RegExp(`^POST /api/admin/users/${SUBJECT_ID_PATTERN}/sync-profile$`, 'u'),
  new RegExp(`^DELETE /api/admin/users/${SUBJECT_ID_PATTERN}/sessions$`, 'u'),
  new RegExp(`^PUT /api/admin/users/${SUBJECT_ID_PATTERN}/roles$`, 'u'),
  new RegExp(`^GET /api/admin/sessions/${SESSION_ID_PATTERN}$`, 'u'),
  new RegExp(`^DELETE /api/admin/sessions/${SESSION_ID_PATTERN}$`, 'u'),
  new RegExp(`^GET /api/admin/audit/events/${AUDIT_EVENT_ID_PATTERN}$`, 'u'),
  new RegExp(`^GET /api/admin/audit/authentication-events/${AUDIT_EVENT_ID_PATTERN}$`, 'u'),
  new RegExp(`^POST /api/admin/data-subject-requests/${DSR_REQUEST_ID_PATTERN}/review$`, 'u'),
  new RegExp(`^POST /api/admin/data-subject-requests/${DSR_REQUEST_ID_PATTERN}/fulfill$`, 'u'),
  new RegExp(`^GET /api/admin/security-policies/${POLICY_CATEGORY_PATTERN}$`, 'u'),
  new RegExp(`^POST /api/admin/security-policies/${POLICY_CATEGORY_PATTERN}$`, 'u'),
  new RegExp(`^POST /api/admin/security-policies/${POLICY_CATEGORY_PATTERN}/${POLICY_VERSION_PATTERN}/activate$`, 'u'),
  new RegExp(`^POST /api/admin/security-policies/${POLICY_CATEGORY_PATTERN}/${POLICY_VERSION_PATTERN}/rollback$`, 'u'),
  new RegExp(`^PATCH /api/admin/roles/${ROLE_SLUG_PATTERN}$`, 'u'),
  new RegExp(`^PUT /api/admin/roles/${ROLE_SLUG_PATTERN}/permissions$`, 'u'),
  new RegExp(`^DELETE /api/admin/roles/${ROLE_SLUG_PATTERN}$`, 'u'),
  new RegExp(`^DELETE /api/admin/ip-access-rules/${NUMERIC_ID_PATTERN}$`, 'u'),
  new RegExp(`^GET /api/admin/sso-error-templates/${ERROR_TEMPLATE_KEY_PATTERN}$`, 'u'),
  new RegExp(`^PUT /api/admin/sso-error-templates/${ERROR_TEMPLATE_KEY_PATTERN}$`, 'u'),
  new RegExp(`^POST /api/admin/sso-error-templates/${ERROR_TEMPLATE_KEY_PATTERN}/reset$`, 'u'),
  new RegExp(`^GET /api/admin/external-idps/${PROVIDER_KEY_PATTERN}$`, 'u'),
  new RegExp(`^PATCH /api/admin/external-idps/${PROVIDER_KEY_PATTERN}$`, 'u'),
  new RegExp(`^POST /api/admin/external-idps/${PROVIDER_KEY_PATTERN}/mapping-preview$`, 'u'),
  new RegExp(`^DELETE /api/admin/external-idps/${PROVIDER_KEY_PATTERN}$`, 'u'),
]

export type AdminApiRequestOptions = {
  readonly internalBaseUrl: string
  readonly pathname: string
  readonly search: string
  readonly method: string
  readonly headers: IncomingHttpHeaders
  readonly session: PortalSession
  readonly body?: RequestInit['body']
}

export type AdminApiRequest = {
  readonly url: string
  readonly init: RequestInit & { readonly duplex?: 'half' }
}

export function buildAdminApiRequest(options: AdminApiRequestOptions): AdminApiRequest {
  if (!options.pathname.startsWith(`${ADMIN_BFF_PREFIX}/`)) {
    throw new Error('Invalid admin API proxy path.')
  }

  const method = options.method.toUpperCase()
  const routeKey = `${method} ${options.pathname}`
  if (!isAllowedAdminRoute(routeKey)) {
    if (isAllowedAdminPath(options.pathname)) throw new Error('Admin API proxy method is not allowed.')
    throw new Error('Admin API proxy path is not allowed.')
  }

  const backendPath =
    options.pathname === '/api/admin/ops/readiness'
      ? '/ready'
      : `${ADMIN_BACKEND_PREFIX}${options.pathname.slice(ADMIN_BFF_PREFIX.length)}`
  const headers = buildAdminApiHeaders(options.headers, options.session.accessToken)

  return {
    url: `${trimTrailingSlash(options.internalBaseUrl)}${backendPath}${options.search}`,
    init: {
      method,
      headers,
      body: method === 'GET' || method === 'HEAD' ? undefined : options.body,
      ...(method === 'GET' || method === 'HEAD' ? {} : { duplex: 'half' as const }),
    },
  }
}

export async function handleAdminApiProxy(context: {
  readonly request: IncomingMessage
  readonly requestUrl: URL
}): Promise<AppResponse> {
  let resolved: ResolvedSsoSession | null
  try {
    resolved = await resolveSsoSession(context.request)
  } catch {
    return json(
      401,
      { error: 'no_session', message: 'No active SSO session.', redirectTo: '/' },
      { 'set-cookie': await clearSessionCookie(context.request) },
    )
  }

  if (!resolved) {
    return json(
      401,
      { error: 'no_session', message: 'No active SSO session.', redirectTo: '/' },
      { 'set-cookie': await clearSessionCookie(context.request) },
    )
  }

  if (!isBootstrapPrincipalRequest(context) && resolved.session.role !== 'admin') {
    return json(
      403,
      { error: 'forbidden', message: 'Admin role is required to access this resource.' },
      sessionHeaders(resolved),
    )
  }

  let adminRequest: AdminApiRequest
  try {
    adminRequest = buildAdminApiRequest({
      internalBaseUrl: getConfig().internalBaseUrl,
      pathname: context.requestUrl.pathname,
      search: context.requestUrl.search,
      method: context.request.method ?? 'GET',
      headers: context.request.headers,
      session: resolved.session,
      body: context.request as unknown as RequestInit['body'],
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    const reqId = resolveBffRequestId(context.request.headers)
    const supportRef = deriveSupportReference(reqId)

    console.error('[ADMIN_BFF_PROXY_POLICY]', {
      request_id: reqId,
      support_reference: supportRef,
      path: context.requestUrl.pathname,
      method: context.request.method,
      error: msg,
    })

    return json(
      400,
      { error: 'proxy_policy_error', message: msg, request_id: reqId, support_reference: supportRef },
      sessionHeaders(resolved),
    )
  }

  try {
    const response = await fetch(adminRequest.url, adminRequest.init)
    const body = Buffer.from(await response.arrayBuffer())
    if (response.ok && isBootstrapPrincipalRequest(context)) {
      await refreshCachedRoleFromPrincipalResponse(resolved, body)
    }

    return {
      status: response.status,
      headers: { ...buildProxyResponseHeaders(response.headers), ...sessionHeaders(resolved) },
      body,
    }
  } catch (error) {
    const reqId = resolveBffRequestId(context.request.headers)
    const supportRef = deriveSupportReference(reqId)
    const bffError = error instanceof Error ? error.message : String(error)

    console.error('[ADMIN_BFF_PROXY_502]', {
      request_id: reqId,
      support_reference: supportRef,
      path: context.requestUrl.pathname,
      method: context.request.method,
      error: bffError,
    })

    return json(
      502,
      {
        error: 'admin_proxy_failed',
        message: supportRef
          ? `Backend service unreachable. Incident reference: ${supportRef} (check server logs).`
          : 'Backend service unreachable.',
        request_id: reqId,
        support_reference: supportRef,
      },
      sessionHeaders(resolved),
    )
  }
}

function isBootstrapPrincipalRequest(context: {
  readonly request: IncomingMessage
  readonly requestUrl: URL
}): boolean {
  return (
    context.requestUrl.pathname === '/api/admin/me' &&
    (context.request.method ?? 'GET').toUpperCase() === 'GET'
  )
}

async function refreshCachedRoleFromPrincipalResponse(resolved: ResolvedSsoSession, body: Buffer): Promise<void> {
  const role = roleFromPrincipalBody(body)
  if (!role || role === resolved.session.role) return

  await replaceSession(resolved.sessionId, { ...resolved.session, role }).catch((error: unknown) => {
    console.error('Admin session role refresh failed:', error instanceof Error ? error.message : error)
  })
}

function roleFromPrincipalBody(body: Buffer): string | null {
  try {
    const data = JSON.parse(body.toString('utf8')) as unknown
    if (!isRecord(data)) return null
    const principal = data.principal
    if (!isRecord(principal)) return null
    return typeof principal.role === 'string' && principal.role !== '' ? principal.role : null
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function buildAdminApiHeaders(headers: IncomingHttpHeaders, accessToken: string): Headers {
  const forwarded = new Headers()

  for (const [name, value] of Object.entries(headers)) {
    if (!ALLOWED_REQUEST_HEADERS.has(name.toLowerCase())) continue
    if (Array.isArray(value)) {
      for (const item of value) forwarded.append(name, item)
    } else if (typeof value === 'string') {
      forwarded.set(name, value)
    }
  }

  forwarded.set('Accept', 'application/json')
  forwarded.set('Accept-Encoding', 'identity')
  forwarded.set('Authorization', `Bearer ${accessToken}`)
  forwarded.set('X-Request-Id', resolveBffRequestId(headers))

  return forwarded
}

function isAllowedAdminRoute(routeKey: string): boolean {
  return ALLOWED_ADMIN_ROUTES.has(routeKey) || ALLOWED_ADMIN_ROUTE_PATTERNS.some((pattern) => pattern.test(routeKey))
}

function isAllowedAdminPath(pathname: string): boolean {
  return (
    isAllowedAdminRoute(`GET ${pathname}`) ||
    isAllowedAdminRoute(`PATCH ${pathname}`) ||
    isAllowedAdminRoute(`POST ${pathname}`) ||
    isAllowedAdminRoute(`PUT ${pathname}`) ||
    isAllowedAdminRoute(`DELETE ${pathname}`)
  )
}

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value
}
```

- [ ] **Step 4: Create the catch-all route adapter `server/routes/api/admin/[...].ts`**

```ts
import { handleAdminApiProxy } from '../../../utils/admin-proxy'
import { sendAppResponse } from '../../../utils/response'

export default defineEventHandler(async (event) => {
  sendAppResponse(event, await handleAdminApiProxy({ request: event.node.req, requestUrl: getRequestURL(event) }))
})
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run server/__tests__/admin-proxy.spec.ts`
Expected: PASS (11 passed).

- [ ] **Step 6: Commit**

```bash
git add server/utils/admin-proxy.ts "server/routes/api/admin/[...].ts" server/__tests__/admin-proxy.spec.ts
git commit -m "feat(admin-nitro): port admin API proxy with server-side Bearer injection

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 1.13: widget proxy

**Files:**
- Test: `services/sso-admin-frontend/server/__tests__/sso-backend-proxy.spec.ts` (ported verbatim, import paths adjusted)
- Create: `services/sso-admin-frontend/server/utils/widget-routes.ts`
- Create: `services/sso-admin-frontend/server/utils/sso-backend-proxy.ts`
- Create: `services/sso-admin-frontend/server/routes/widget/[...].ts`

**Interfaces:**
- Consumes: config (1.3), proxy-headers (1.6), response (1.5).
- Produces (widget-routes): `shouldProxyAdminWidgetPath(pathname): boolean` (true only for `/widget/<segment>...`).
- Produces (sso-backend-proxy): `proxyToSsoBackend(request, requestUrl)` (transparent proxy to `${internalBaseUrl}/widget/*`, forwards cookie + request id, `redirect: 'manual'`, relays status/content-type/set-cookie, omits GET body).
- Produces (route): catch-all `defineEventHandler` gated by `shouldProxyAdminWidgetPath`.

- [ ] **Step 1: Port the failing test** — copy `src/server/__tests__/sso-backend-proxy.spec.ts` to `server/__tests__/sso-backend-proxy.spec.ts` verbatim, changing only:

```ts
import { proxyToSsoBackend } from '../utils/sso-backend-proxy'
import { shouldProxyAdminWidgetPath } from '../utils/widget-routes'
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/sso-backend-proxy.spec.ts`
Expected: FAIL — `Failed to resolve import "../utils/sso-backend-proxy"`.

- [ ] **Step 3: Create `server/utils/widget-routes.ts` (verbatim port)**

```ts
// server/utils/widget-routes.ts
/**
 * Same-origin allow-list for the admin account-widget proxy. Only
 * `/widget/<segment>...` paths are forwarded to the backend so the admin BFF
 * never becomes an open relay. Mirrors the portal BFF's `/widget/` proxying.
 */
export function shouldProxyAdminWidgetPath(pathname: string): boolean {
  return pathname.startsWith('/widget/')
}
```

- [ ] **Step 4: Create `server/utils/sso-backend-proxy.ts` (verbatim port; imports rewritten)**

```ts
// server/utils/sso-backend-proxy.ts
import type { IncomingMessage } from 'node:http'
import { getConfig } from './config'
import { buildProxyRequestHeaders, buildProxyResponseHeaders } from './proxy-headers'
import type { AppResponse } from './response'

export async function proxyToSsoBackend(request: IncomingMessage, requestUrl: URL): Promise<AppResponse> {
  const target = `${trimTrailingSlash(getConfig().internalBaseUrl)}${requestUrl.pathname}${requestUrl.search}`
  const response = await fetch(target, {
    method: request.method,
    headers: buildProxyRequestHeaders(request.headers),
    body: hasRequestBody(request.method) ? request : undefined,
    duplex: 'half',
    redirect: 'manual',
  } as RequestInit & { duplex: 'half' })

  return {
    status: response.status,
    headers: buildProxyResponseHeaders(response.headers),
    body: Buffer.from(await response.arrayBuffer()),
  }
}

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value
}

function hasRequestBody(method: string | undefined): boolean {
  return !['GET', 'HEAD', 'OPTIONS', 'TRACE'].includes((method ?? 'GET').toUpperCase())
}
```

- [ ] **Step 5: Create the catch-all route adapter `server/routes/widget/[...].ts`**

```ts
import { proxyToSsoBackend } from '../../utils/sso-backend-proxy'
import { shouldProxyAdminWidgetPath } from '../../utils/widget-routes'
import { json, sendAppResponse } from '../../utils/response'

export default defineEventHandler(async (event) => {
  const url = getRequestURL(event)
  if (!shouldProxyAdminWidgetPath(url.pathname)) {
    return sendAppResponse(event, json(404, { error: 'not_found', message: 'Unknown widget path.' }))
  }
  sendAppResponse(event, await proxyToSsoBackend(event.node.req, url))
})
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run server/__tests__/sso-backend-proxy.spec.ts`
Expected: PASS (6 passed).

- [ ] **Step 7: Commit**

```bash
git add server/utils/sso-backend-proxy.ts server/utils/widget-routes.ts "server/routes/widget/[...].ts" server/__tests__/sso-backend-proxy.spec.ts
git commit -m "feat(admin-nitro): port same-origin widget proxy to Nitro

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 1.14: session middleware (server-only event.context.session)

**Files:**
- Test: `services/sso-admin-frontend/server/__tests__/session-middleware.spec.ts`
- Create: `services/sso-admin-frontend/server/middleware/session.ts`
- Modify: `services/sso-admin-frontend/server/types.d.ts` (augment `H3EventContext`)

**Interfaces:**
- Consumes: `getSession` + `PortalSession` (1.4).
- Produces: `attachSessionContext(event): Promise<void>` (sets `event.context.session = await getSession(event.node.req) | null`; never serializes), plus default `defineEventHandler` that calls it. Module augmentation: `declare module 'h3' { interface H3EventContext { session: PortalSession | null } }`.

- [ ] **Step 1: Write the failing test**

```ts
import { Readable } from 'node:stream'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PortalSession } from '../utils/session'

function baseSession(): PortalSession {
  return {
    accessToken: 'legacy-admin-access-token', idToken: 'id-token', refreshToken: 'refresh-token',
    sub: 'sub-admin', subject: 'sub-admin', email: 'admin@example.test', displayName: 'Admin',
    role: 'admin', expiresAt: 4_102_444_800, authTime: null, amr: ['pwd'], acr: null,
    lastLoginAt: null, issuedAt: 1_780_000_000, absoluteExpiresAt: 4_102_444_800, lastRefreshedAt: 1_780_000_000,
  }
}

function fakeEvent(cookie: string) {
  const req = Readable.from([]) as Readable & { headers: Record<string, string> }
  req.headers = { cookie }
  return { node: { req }, context: {} } as never as { context: { session?: PortalSession | null } }
}

describe('server session middleware', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('SESSION_ENCRYPTION_SECRET', 'test-admin-session-secret-32-bytes-long')
    vi.stubEnv('SSO_ADMIN_SESSION_REDIS_URL', '')
    vi.stubEnv('NODE_ENV', 'test')
    vi.setSystemTime(new Date('2026-06-01T00:00:00Z'))
  })

  it('attaches the resolved session to event.context.session (server-only)', async () => {
    const { sessionCookie } = await import('../utils/session')
    const cookie = (await sessionCookie(baseSession())).split(';')[0]!
    const { attachSessionContext } = await import('../middleware/session')
    const event = fakeEvent(cookie)
    await attachSessionContext(event as never)
    expect(event.context.session?.accessToken).toBe('legacy-admin-access-token')
    expect(event.context.session?.sub).toBe('sub-admin')
  })

  it('sets event.context.session to null when no cookie is present', async () => {
    const { attachSessionContext } = await import('../middleware/session')
    const event = fakeEvent('')
    await attachSessionContext(event as never)
    expect(event.context.session).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/session-middleware.spec.ts`
Expected: FAIL — `Failed to resolve import "../middleware/session"`.

- [ ] **Step 3: Write the implementation**

`server/middleware/session.ts`:

```ts
import type { H3Event } from 'h3'
import { getSession } from '../utils/session'

/**
 * Resolve the encrypted BFF session and attach it to the request context.
 * Tokens live ONLY here (server-only) — never written to useState, the SSR
 * payload, or any client-visible surface.
 */
export async function attachSessionContext(event: H3Event): Promise<void> {
  event.context.session = await getSession(event.node.req)
}

export default defineEventHandler(async (event) => {
  await attachSessionContext(event)
})
```

`server/types.d.ts`:

```ts
import type { PortalSession } from './utils/session'

declare module 'h3' {
  interface H3EventContext {
    session: PortalSession | null
  }
}

export {}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/__tests__/session-middleware.spec.ts`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add server/middleware/session.ts server/types.d.ts server/__tests__/session-middleware.spec.ts
git commit -m "feat(admin-nitro): add server-only session middleware (event.context.session)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 1.15: server-only token-custody gate (honest RED → GREEN)

Replaces the old "insert-and-revert fake RED" gate (`FIXES.md` §1.15). This is a
**genuine** failing-first unit test: it asserts that the session middleware not
only keeps tokens on the server-only `event.context.session`, but also exposes a
**token-free** client projection (`event.context.principalState`) — the single
session-derived value allowed to cross to the browser. Task 1.14's middleware
does NOT yet set `principalState`, so the assertion fails first (a real
behavioral gap, not a planted line). The full SSR-render + `window.__NUXT__`
grep gate over a representative authenticated page is **Task 2c.1** (`FIXES.md`
§3.3); this Phase-1 task pins the custody invariant at the middleware boundary.

**Files:**
- Test: `services/sso-admin-frontend/server/__tests__/session-context-custody.spec.ts` (new)
- Modify: `services/sso-admin-frontend/server/middleware/session.ts` (add the token-free `principalState` projection)
- Modify: `services/sso-admin-frontend/server/types.d.ts` (augment `H3EventContext` with `principalState`)

**Interfaces:**
- Consumes: session (1.4) — `getSession`, `publicSession`; types `PortalSession`, `PortalSessionView`. middleware (1.14) — `attachSessionContext`.
- Produces: extends `attachSessionContext(event)` so it sets `event.context.principalState = session ? publicSession(session) : null` (reuses 1.4's `publicSession`; no new mapper — DRY). Augments `H3EventContext` with `principalState: PortalSessionView | null`.

- [ ] **Step 1: Write the failing test**

```ts
import { Readable } from 'node:stream'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PortalSession } from '../utils/session'

// Phase 1 token-custody gate. Tokens (access/refresh/id) and the widget `sid`
// live ONLY on the server-only event.context.session. The ONLY session-derived
// value allowed to cross to the client is event.context.principalState, which
// MUST be token-free. The full SSR-render + window.__NUXT__ grep gate over a
// representative authenticated page is Task 2c.1.

const SENTINEL = {
  access: 'SENTINEL-ACCESS-TOKEN',
  refresh: 'SENTINEL-REFRESH-TOKEN',
  id: 'SENTINEL-ID-TOKEN',
  sid: 'SENTINEL-WIDGET-SID',
}

function sentinelSession(): PortalSession {
  return {
    accessToken: SENTINEL.access, idToken: SENTINEL.id, refreshToken: SENTINEL.refresh,
    sub: 'sub-admin', sid: SENTINEL.sid, subject: 'sub-admin', email: 'admin@example.test',
    displayName: 'Admin', role: 'admin', expiresAt: 4_102_444_800, authTime: null,
    amr: ['pwd'], acr: null, lastLoginAt: null, issuedAt: 1_780_000_000,
    absoluteExpiresAt: 4_102_444_800, lastRefreshedAt: 1_780_000_000,
  }
}

function fakeEvent(cookie: string) {
  const req = Readable.from([]) as Readable & { headers: Record<string, string> }
  req.headers = { cookie }
  return { node: { req }, context: {} } as never as {
    context: { session?: PortalSession | null; principalState?: unknown }
  }
}

describe('server-only session token custody (Phase 1)', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('SESSION_ENCRYPTION_SECRET', 'test-admin-session-secret-32-bytes-long')
    vi.stubEnv('SSO_ADMIN_SESSION_REDIS_URL', '')
    vi.stubEnv('NODE_ENV', 'test')
    vi.setSystemTime(new Date('2026-06-01T00:00:00Z'))
  })

  it('keeps tokens on event.context.session and exposes only a token-free principalState', async () => {
    const { sessionCookie } = await import('../utils/session')
    const cookie = (await sessionCookie(sentinelSession())).split(';')[0]!
    const { attachSessionContext } = await import('../middleware/session')
    const event = fakeEvent(cookie)

    await attachSessionContext(event as never)

    // Server-only custody: the full tokens ARE present on the request context.
    expect(event.context.session?.accessToken).toBe(SENTINEL.access)
    expect(event.context.session?.refreshToken).toBe(SENTINEL.refresh)

    // Client projection MUST exist and MUST be token-free.
    expect(event.context.principalState).toBeDefined()
    const serialized = JSON.stringify(event.context.principalState)
    expect(serialized).not.toContain(SENTINEL.access)
    expect(serialized).not.toContain(SENTINEL.refresh)
    expect(serialized).not.toContain(SENTINEL.id)
    expect(serialized).not.toContain(SENTINEL.sid)
    expect(serialized).not.toMatch(/accessToken|refreshToken|idToken/)
  })

  it('sets principalState to null when there is no session', async () => {
    const { attachSessionContext } = await import('../middleware/session')
    const event = fakeEvent('')
    await attachSessionContext(event as never)
    expect(event.context.session).toBeNull()
    expect(event.context.principalState).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails (genuine RED)**

Run: `npx vitest run server/__tests__/session-context-custody.spec.ts`
Expected: FAIL — the Task 1.14 middleware never sets `principalState`, so the
first test errors at `expect(event.context.principalState).toBeDefined()` with
`AssertionError: expected undefined to be defined`, and the second test fails at
`expect(event.context.principalState).toBeNull()` with `expected undefined to be null`.
(2 failed.) This is a real gap, not a planted leak.

- [ ] **Step 3: Implement the token-free projection** — modify `server/middleware/session.ts` to compute `principalState` from the resolved session via 1.4's `publicSession` (token-free by construction; no new mapper):

```ts
import type { H3Event } from 'h3'
import { getSession, publicSession } from '../utils/session'

/**
 * Resolve the encrypted BFF session and attach it to the request context.
 *
 * - `event.context.session` holds the FULL session incl. access/refresh/id
 *   tokens and the widget `sid` — server-only; NEVER written to useState, the
 *   SSR payload, or any client-visible surface.
 * - `event.context.principalState` is the ONLY session-derived value allowed to
 *   hydrate the client: the token-free `publicSession` view (safe principal
 *   fields only). Phase 2 reads this to seed the session store.
 */
export async function attachSessionContext(event: H3Event): Promise<void> {
  const session = await getSession(event.node.req)
  event.context.session = session
  event.context.principalState = session ? publicSession(session) : null
}

export default defineEventHandler(async (event) => {
  await attachSessionContext(event)
})
```

- [ ] **Step 4: Extend the context augmentation** — modify `server/types.d.ts`:

```ts
import type { PortalSession, PortalSessionView } from './utils/session'

declare module 'h3' {
  interface H3EventContext {
    session: PortalSession | null
    principalState: PortalSessionView | null
  }
}

export {}
```

- [ ] **Step 5: Run test to verify it passes (GREEN)**

Run: `npx vitest run server/__tests__/session-context-custody.spec.ts`
Expected: PASS (2 passed).

- [ ] **Step 6: Re-run the session-middleware spec (1.14 still green)**

Run: `npx vitest run server/__tests__/session-middleware.spec.ts`
Expected: PASS (2 passed) — adding `principalState` does not change the existing `session` behavior.

- [ ] **Step 7: Commit**

```bash
git add server/middleware/session.ts server/types.d.ts server/__tests__/session-context-custody.spec.ts
git commit -m "test(admin-nitro): gate server-only token custody + token-free principalState

Honest RED->GREEN: the session middleware now exposes only a token-free
publicSession projection (event.context.principalState) for client hydration;
full tokens stay on the server-only event.context.session. Full SSR-render +
window.__NUXT__ leak gate lands in Task 2c.1.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 1.16: Nitro perf parity — compression, HTTP cache, preload (design §9)

The old draft dropped the three perf specs (`compression.spec.ts`,
`http-cache.spec.ts`, `preload-links.spec.ts`). Per `FIXES.md` §Phase-1, this
task restores their intent as a **Nitro `routeRules` + config** task with a small
assertion test.

**One-line framework note:** Nitro/Nuxt provide all three natively — static-asset
compression via `nitro.compressPublicAssets` (gzip + brotli at build, replacing
`compression.ts`), HTTP caching via `routeRules` headers (replacing the hand-rolled
ETag/`Cache-Control` in `http-cache.ts`; hashed `/_nuxt/**` assets are immutable),
and route-chunk preload via Nuxt's automatic `<link rel="modulepreload">` emitted
from the build manifest (replacing `preload-links.ts` — no custom code). The
configurable decisions are still pinned here so §9 behavior is explicit and tested.

**Files:**
- Test: `services/sso-admin-frontend/server/__tests__/nuxt-perf.spec.ts` (new)
- Create: `services/sso-admin-frontend/nuxt-perf.config.ts` (new — exported, importable perf decisions)
- Modify: `services/sso-admin-frontend/nuxt.config.ts` (apply `compressPublicAssets` + `routeRules`)

**Interfaces:**
- Consumes: nothing runtime (pure config objects).
- Produces (nuxt-perf.config): `adminCompression: { gzip: true; brotli: true }`, `adminRouteRules: RouteCacheRules` (immutable `/_nuxt/**`; `no-store` on `/auth/**`, `/api/admin/**`, and the `/**` catch-all SSR HTML), `PRELOAD_STRATEGY: 'nuxt-native-modulepreload'`, type `RouteCacheRules`.
- Produces (nuxt.config): wires the above into `nitro.compressPublicAssets` and `routeRules`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { PRELOAD_STRATEGY, adminCompression, adminRouteRules } from '../../nuxt-perf.config'

describe('Nitro performance parity (Phase 1, design §9)', () => {
  it('pre-compresses public assets with gzip and brotli (replaces compression.ts)', () => {
    expect(adminCompression.gzip).toBe(true)
    expect(adminCompression.brotli).toBe(true)
  })

  it('pins immutable caching on hashed assets and no-store on authenticated HTML (replaces http-cache.ts)', () => {
    expect(adminRouteRules['/_nuxt/**']?.headers['cache-control']).toContain('immutable')
    expect(adminRouteRules['/_nuxt/**']?.headers['cache-control']).toContain('max-age=31536000')
    expect(adminRouteRules['/api/admin/**']?.headers['cache-control']).toContain('no-store')
    expect(adminRouteRules['/**']?.headers['cache-control']).toContain('no-store')
  })

  it('documents Nuxt-native modulepreload as the preload strategy (replaces preload-links.ts)', () => {
    expect(PRELOAD_STRATEGY).toBe('nuxt-native-modulepreload')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/nuxt-perf.spec.ts`
Expected: FAIL — `Failed to resolve import "../../nuxt-perf.config"`.

- [ ] **Step 3: Create `nuxt-perf.config.ts`**

```ts
/**
 * Phase-1 Nitro performance parity (design §9), replacing the legacy hand-rolled
 * compression.ts / http-cache.ts / preload-links.ts. Exported as plain,
 * importable objects so the perf decisions are unit-testable without booting Nuxt.
 *
 * - Compression  → Nitro `compressPublicAssets` pre-compresses built static
 *   assets at build time (gzip + brotli). Replaces compression.ts.
 * - HTTP cache   → route rules pin immutable caching on hashed `/_nuxt/**`
 *   assets and `no-store` on authenticated app HTML + API. Replaces http-cache.ts.
 * - Preload      → emitted natively by Nuxt as <link rel="modulepreload"> from
 *   the build manifest; no custom code. Replaces preload-links.ts. The decision
 *   is pinned below so it is greppable and intentional.
 */

export type RouteCacheRules = Readonly<
  Record<string, { readonly headers: Readonly<Record<string, string>> }>
>

export const PRELOAD_STRATEGY = 'nuxt-native-modulepreload' as const

export const adminCompression = { gzip: true, brotli: true } as const

const NO_STORE = 'no-store, no-cache, private, max-age=0'

export const adminRouteRules: RouteCacheRules = {
  '/_nuxt/**': { headers: { 'cache-control': 'public, max-age=31536000, immutable' } },
  '/auth/**': { headers: { 'cache-control': NO_STORE } },
  '/api/admin/**': { headers: { 'cache-control': NO_STORE } },
  '/widget/**': { headers: { 'cache-control': NO_STORE } },
  '/**': { headers: { 'cache-control': NO_STORE } },
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/__tests__/nuxt-perf.spec.ts`
Expected: PASS (3 passed).

- [ ] **Step 5: Wire it into `nuxt.config.ts` (ADDITIVE — do not rewrite the file)** — the config built in Task 0.2 and extended in Task 2a.1 stays intact. Add ONLY (a) the perf import at the top, beside the existing `import tailwindcss from '@tailwindcss/vite'`, and (b) two keys: `nitro.compressPublicAssets` and `routeRules`. Do NOT touch `ssr`, `srcDir`, `compatibilityDate` (keep `'2026-06-27'`), `devtools`, `modules`, `css`, `vite.plugins`, or either `runtimeConfig` half — the private secrets (`ADMIN_OIDC_*` / `SSO_INTERNAL_*` / `SESSION_ENCRYPTION_SECRET`) and the public keys (`basePath` / `ssoBaseUrl` / `ssoWidgetBaseUrl` / `docsBaseUrl` / `mockApi` / `adminAppBaseUrl`) must all remain. (The more-specific `/_nuxt/**` rule wins over the `/**` catch-all in Nitro's matcher, so hashed assets stay immutable while authenticated HTML is no-store.)

Add this import beneath the existing Tailwind import:

```ts
import { adminCompression, adminRouteRules } from './nuxt-perf.config'
```

Add these two keys inside the existing `defineNuxtConfig({ … })` object (e.g. after the `vite` key), leaving every other key from Tasks 0.2 + 2a.1 unchanged:

```ts
  nitro: {
    compressPublicAssets: adminCompression,
  },
  routeRules: adminRouteRules,
```

- [ ] **Step 6: Typecheck the wired config**

Run: `npm run typecheck`
Expected: exits 0 (the `headers: Record<string, string>` shape is assignable to Nuxt's `routeRules` type).

- [ ] **Step 7: Commit**

```bash
git add nuxt-perf.config.ts nuxt.config.ts server/__tests__/nuxt-perf.spec.ts
git commit -m "feat(admin-nitro): pin Nitro compression + http-cache + preload (design §9)

compressPublicAssets (gzip+brotli) replaces compression.ts; routeRules pin
immutable /_nuxt/** + no-store authenticated HTML, replacing http-cache.ts;
Nuxt-native modulepreload replaces preload-links.ts (pinned + tested).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 8: Phase-1 acceptance — full BFF suite + typecheck**

Run: `npx vitest run server/__tests__ && npm run typecheck`
Expected: all server specs PASS — `config`, `cookies`, `session-crypto`,
`session-store`, `session`, `response`, `proxy-headers`, `user-api`,
`session-refresh`, `sso-session-resolver`, `widget-cookie` (1.1–1.10),
`auth-flow` (1.11), `admin-proxy` (1.12), `sso-backend-proxy` (1.13),
`session-middleware` (1.14), `session-context-custody` (1.15), `nuxt-perf`
(1.16); typecheck exits 0.

- [ ] **Step 9: Request review before Phase 2** — per design §12, run `/code-review` on the full Phase-1 diff (the entire `server/` port + `shared/auth-status.ts` + `nuxt-perf.config.ts` + the `nuxt.config.ts` perf wiring) and resolve findings before any domain UI work begins.

---

### Phase 1 (routes) self-review notes

- **`sendAppResponse` resolution:** every route adapter in 1.11–1.13 (and the widget 404 path) imports `sendAppResponse` from `server/utils/response` — the p1-utils response port that exports it (`FIXES.md` §Global). No adapter calls an undefined responder.
- **§9 coverage restored:** the three dropped perf specs are re-expressed as Task 1.16 (`compressPublicAssets`, `routeRules`, pinned `PRELOAD_STRATEGY`) with a 3-assertion test, plus the one-line framework-native note required by `FIXES.md`.
- **Honest TDD:** 1.15's RED is a real behavioral gap (1.14 never set `principalState`), not insert-and-revert. The crown-jewel SSR-render + `window.__NUXT__` grep gate remains Task 2c.1 per `FIXES.md` §3.3.
- **Parity invariants pinned by assertions:** PKCE S256 + nonce + JWKS verify + `client_secret` token exchange + `Accept-Encoding: identity` + RP registration (1.11 auth-flow); `__Host-sso_session` mint/clear/re-mint from id_token `sid` (1.11); Bearer injection + browser-auth stripping + 400/502 envelopes (1.12); widget set-cookie relay + manual redirect (1.13); server-only token custody + token-free hydration projection (1.14, 1.15).

# Phase 2a — App shell + plumbing

# Phase 2a — Task 2a.0 (shared i18n + admin environment config)

> Implementation plan fragment for `services/sso-admin-frontend` Nuxt 4 (full SSR) + Swiss redesign.
> Format: superpowers `writing-plans`. **TDD mandatory** — RED → GREEN → commit.
> All paths are under `services/sso-admin-frontend/`.
> Inherits the **Global constraints** block from `p2a.md` (single-file test command `npx vitest run <path>`;
> commit trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`; no traceability markers;
> DRY/YAGNI 1:1 port except where SSR forces a mechanism change, flagged for `/code-review`).

---

### Task 2a.0: Port shared i18n + admin environment config (SSR-safe)

> **Ordering (read first):** This task **runs FIRST in Phase 2a, before Task 2a.1**, because every later
> 2a/2b component imports `@/composables/useI18n`, `@/locales/{id,en}.json`, and
> `@/config/adminEnvironment`. Until these exist under `app/`, the SSR build cannot resolve those imports.
> **This supersedes the earlier (false) claim that these three files were Phase-0 scaffold / 2a-widget
> prerequisites** — no prior task creates them; they are created here.
>
> **Soft dependency on 2a.1:** `getAdminEnvironment()` reads `runtimeConfig.public.{ssoBaseUrl,
> ssoWidgetBaseUrl, docsBaseUrl, basePath}`, whose keys are declared in **Task 2a.1**. Because this task's
> spec **mocks `useRuntimeConfig`**, 2a.0 is RED→GREEN and lands first regardless; only the *live* runtime
> values (not the public API) depend on 2a.1 being merged. No ordering inversion.

**Files:**
- Create: `app/composables/useI18n.ts`
- Create: `app/config/adminEnvironment.ts`
- Create: `app/locales/id.json` (verbatim copy of `src/locales/id.json`)
- Create: `app/locales/en.json` (verbatim copy of `src/locales/en.json`)
- Test (create): `app/__tests__/shared-i18n-env.spec.ts`

**Interfaces:**
- Consumes:
  - Nuxt auto-imports `useState`, `useCookie`, `useRuntimeConfig`, and `import.meta.client` (typed via `.nuxt/tsconfig*.json` from Phase 0).
  - `runtimeConfig.public.ssoBaseUrl`, `.ssoWidgetBaseUrl`, `.docsBaseUrl`, `.basePath` — declared in **Task 2a.1** (mocked in this task's spec).
  - JSON message catalogs `@/locales/id.json`, `@/locales/en.json` (created in this task).
- Produces (exact public surface every 2a/2b consumer + the unit-test mocks pin):
  ```ts
  // app/composables/useI18n.ts
  export type SupportedLocale = 'id' | 'en'
  export type UseI18nReturn = {
    readonly availableLocales: readonly SupportedLocale[]
    readonly locale: import('vue').ComputedRef<SupportedLocale>   // a ref — `.value` reads the active code
    readonly setLocale: (locale: SupportedLocale) => void
    readonly t: (key: string, params?: Record<string, unknown>) => string
  }
  export function useI18n(): UseI18nReturn

  // app/config/adminEnvironment.ts
  export interface AdminEnvironment {
    readonly ssoBaseUrl: string
    readonly widgetBaseUrl: string
    readonly docsBaseUrl: string
    readonly publicBasePath: string
  }
  export function getAdminEnvironment(): AdminEnvironment
  ```
  This satisfies the consumers exactly:
  - `LocaleSwitcher.vue` → `const { locale, t, setLocale } = useI18n()` (`locale.value === 'id'`, `await setLocale('en')` — awaiting the `void` return is a no-op and needs no consumer change).
  - `AppLauncher.vue` → `const { t } = useI18n()` and `getAdminEnvironment().ssoBaseUrl`.
  - `UiStatusView.vue` / `EvidenceContextPanel.vue` → `const { t } = useI18n()`.
  - Unit-test mocks: `useI18n: () => ({ t, locale: ref('id'), setLocale })` and `getAdminEnvironment: () => ({ ssoBaseUrl })` remain structurally valid against this surface.

**SSR adaptations (flag for `/code-review`):**
- Legacy locale lived in a **module-scoped `ref` (`activeLocale`)** mutated by `setLocale` and read by a
  module-level `translate()`. A module-scoped mutable ref is shared across SSR requests → **cross-request
  state bleed (one user's language leaks to another)**. Replaced by request-scoped `useState('admin-locale')`.
  The module-level `translate()` export is **removed** for the same reason; non-setup callers must use
  `useI18n().t` within Nuxt context.
- Persistence moves from `localStorage` → **`useCookie('admin_locale')`**, which is readable during SSR so the
  server renders the user's chosen locale (localStorage is client-only and would force a hydration flash).
- **Initial locale derives only from the cookie** (default `id`). The legacy `navigator.language` /
  `document.lang` sniffing on init is dropped: client-only sniffing diverges from the server's choice and
  breaks hydration. `<html lang>` sync stays, guarded by `import.meta.client` (never touches `document` on
  the server).
- Both locale catalogs are **statically imported** (SSR must resolve messages synchronously), which removes
  the legacy async `loadLocale` / `localeVersion` lazy-load machinery. `setLocale` is therefore synchronous.
- `getAdminEnvironment()` reads from `useRuntimeConfig().public` only — **single source of truth**, resolving
  the prior "two sources for `ssoBaseUrl`" smell (legacy read `import.meta.env.VITE_SSO_BASE_URL` here while
  the runtime config also held it). Legacy fields not consumed by 2a/2b and absent from the public surface
  are dropped: `zitadelIssuerUrl` (ZITADEL is historical per `CLAUDE.md`), `adminBaseUrl`, and the
  `VITE_*_POLL_MS` pair (feature-poll config is read from `runtimeConfig.public` directly in 2b, not here).

**Steps:**

1. [ ] **Write the failing spec** `app/__tests__/shared-i18n-env.spec.ts` (the genuine RED — the three
   imported modules do not exist yet):

   ```ts
   // @vitest-environment nuxt
   import { describe, expect, it } from 'vitest'
   import { isRef } from 'vue'
   import { mockNuxtImport } from '@nuxt/test-utils/runtime'
   import { useI18n } from '@/composables/useI18n'
   import { getAdminEnvironment } from '@/config/adminEnvironment'

   mockNuxtImport('useRuntimeConfig', () => {
     return () => ({
       public: {
         ssoBaseUrl: 'https://sso.example.test',
         ssoWidgetBaseUrl: 'https://widget.example.test',
         docsBaseUrl: 'https://docs.example.test',
         basePath: '/admin-base',
       },
     })
   })

   describe('useI18n (SSR-safe shared i18n)', () => {
     it('returns a ref locale defaulting to id with id messages', () => {
       const { locale, t } = useI18n()
       expect(isRef(locale)).toBe(true)
       expect(locale.value).toBe('id')
       expect(t('app_launcher.favorites')).toBe('Sering dipakai')
     })

     it('switches locale + messages via setLocale', () => {
       const { locale, t, setLocale } = useI18n()
       setLocale('en')
       expect(locale.value).toBe('en')
       expect(t('app_launcher.favorites')).toBe('Frequently used')
       setLocale('id') // leave shared state clean for ordering-independent reads
       expect(t('app_launcher.favorites')).toBe('Sering dipakai')
     })

     it('falls back to the key when a message is missing', () => {
       const { t } = useI18n()
       expect(t('nope.not.here')).toBe('nope.not.here')
     })

     it('interpolates {param} placeholders', () => {
       const { t, setLocale } = useI18n()
       setLocale('en')
       expect(t('roles.confirm_delete_desc', { target: 'Ops' })).toBe(
         'Are you sure you want to delete role Ops? This action is irreversible.',
       )
       setLocale('id')
     })
   })

   describe('getAdminEnvironment (single source = runtimeConfig.public)', () => {
     it('derives ssoBaseUrl + companions from runtimeConfig.public', () => {
       const env = getAdminEnvironment()
       expect(env.ssoBaseUrl).toBe('https://sso.example.test')
       expect(env.widgetBaseUrl).toBe('https://widget.example.test')
       expect(env.docsBaseUrl).toBe('https://docs.example.test')
       expect(env.publicBasePath).toBe('/admin-base')
     })
   })
   ```

2. [ ] **Run the spec — expect genuine RED** (files absent → module resolution fails before any assertion):

   Run: `npx vitest run app/__tests__/shared-i18n-env.spec.ts`
   Expected: `Test Files  1 failed (1)` with an error resolving the imports, e.g.
   `Failed to resolve import "@/composables/useI18n"` (and `"@/config/adminEnvironment"`) — file does not exist.

3. [ ] **Copy the locale catalogs verbatim and verify byte-identity** (no hand-editing — the SPA copies are
   the source of truth for copy):

   ```bash
   mkdir -p app/locales
   cp src/locales/id.json app/locales/id.json
   cp src/locales/en.json app/locales/en.json
   cmp -s src/locales/id.json app/locales/id.json \
     && cmp -s src/locales/en.json app/locales/en.json \
     && echo "LOCALES IDENTICAL"
   ```
   Expected stdout: `LOCALES IDENTICAL` (exit 0). Any diff makes `cmp` print the first differing byte and the
   chain prints nothing — re-`cp` if so.

4. [ ] **Write** `app/composables/useI18n.ts` (SSR-safe port; request-scoped state via `useState`, persisted
   via `useCookie`, `document` access client-guarded):

   ```ts
   import { computed, type ComputedRef } from 'vue'
   import idLocale from '@/locales/id.json'
   import enLocale from '@/locales/en.json'

   type LocaleMessages = Record<string, unknown>
   export type SupportedLocale = 'id' | 'en'

   const DEFAULT_LOCALE: SupportedLocale = 'id'
   const LOCALE_COOKIE = 'admin_locale' as const
   const LOCALE_STATE_KEY = 'admin-locale' as const

   // Both catalogs are statically bundled: SSR must resolve the active locale's
   // messages synchronously, which also removes the legacy async loadLocale /
   // localeVersion lazy-load machinery.
   const MESSAGES: Record<SupportedLocale, LocaleMessages> = {
     id: idLocale as LocaleMessages,
     en: enLocale as LocaleMessages,
   }

   export type UseI18nReturn = {
     readonly availableLocales: readonly SupportedLocale[]
     readonly locale: ComputedRef<SupportedLocale>
     readonly setLocale: (locale: SupportedLocale) => void
     readonly t: (key: string, params?: Record<string, unknown>) => string
   }

   export function useI18n(): UseI18nReturn {
     // Persisted, SSR-readable preference. The cookie is the single initial-locale
     // source so server and client hydrate to the SAME value (no navigator/document
     // sniffing on init — that would diverge SSR vs CSR and break hydration).
     const localeCookie = useCookie<SupportedLocale>(LOCALE_COOKIE, {
       default: () => DEFAULT_LOCALE,
       sameSite: 'lax',
       path: '/',
     })

     // Request-scoped (NOT module-scoped) — avoids cross-request locale bleed on the server.
     const localeState = useState<SupportedLocale>(
       LOCALE_STATE_KEY,
       () => normalizeLocale(localeCookie.value) ?? DEFAULT_LOCALE,
     )

     const locale = computed<SupportedLocale>(() => localeState.value)

     function t(key: string, params?: Record<string, unknown>): string {
       const template =
         resolveKey(MESSAGES[localeState.value], key) ?? resolveKey(MESSAGES[DEFAULT_LOCALE], key)
       if (!template) return key
       return params ? interpolate(template, params) : template
     }

     function setLocale(next: SupportedLocale): void {
       localeState.value = next
       localeCookie.value = next
       // Browser-only: keep <html lang> in sync. Guarded so SSR never touches `document`.
       if (import.meta.client) {
         document.documentElement.setAttribute('lang', next)
       }
     }

     return { availableLocales: ['id', 'en'] as const, locale, setLocale, t }
   }

   function normalizeLocale(value: string | null | undefined): SupportedLocale | null {
     if (!value) return null
     const base = value.toLowerCase().split('-')[0]
     return base === 'id' || base === 'en' ? base : null
   }

   function resolveKey(messages: LocaleMessages, key: string): string | undefined {
     let current: unknown = messages
     for (const segment of key.split('.')) {
       if (typeof current !== 'object' || current === null) return undefined
       current = (current as Record<string, unknown>)[segment]
     }
     return typeof current === 'string' ? current : undefined
   }

   function interpolate(template: string, params: Record<string, unknown>): string {
     return template.replace(/\{(\w+)\}/gu, (_, key: string) => {
       const value = params[key]
       return value === undefined ? `{${key}}` : String(value)
     })
   }
   ```

5. [ ] **Write** `app/config/adminEnvironment.ts` (single source of truth = `runtimeConfig.public`; SSR-safe —
   no browser globals):

   ```ts
   /**
    * Admin environment derived from the SINGLE source of truth: runtimeConfig.public.
    *
    * SSR-safe: useRuntimeConfig() returns identical values on server and client and
    * touches no browser globals. Call within Nuxt context (component setup, plugin,
    * or during an SSR request).
    *
    * Resolves the prior "two sources for ssoBaseUrl" smell: ssoBaseUrl is no longer
    * read from import.meta.env here while runtimeConfig holds it elsewhere —
    * runtimeConfig.public is now the only source.
    */
   export interface AdminEnvironment {
     readonly ssoBaseUrl: string
     readonly widgetBaseUrl: string
     readonly docsBaseUrl: string
     readonly publicBasePath: string
   }

   export function getAdminEnvironment(): AdminEnvironment {
     const { public: pub } = useRuntimeConfig()
     return {
       ssoBaseUrl: pub.ssoBaseUrl,
       widgetBaseUrl: pub.ssoWidgetBaseUrl,
       docsBaseUrl: pub.docsBaseUrl,
       publicBasePath: pub.basePath,
     }
   }
   ```

6. [ ] **Run the spec — expect GREEN:**

   Run: `npx vitest run app/__tests__/shared-i18n-env.spec.ts`
   Expected: `Test Files  1 passed (1)` / `Tests  5 passed (5)`.

7. [ ] **Commit:**

   ```bash
   git add app/composables/useI18n.ts app/config/adminEnvironment.ts \
           app/locales/id.json app/locales/en.json \
           app/__tests__/shared-i18n-env.spec.ts
   git commit -m "feat(sso-admin-frontend): port SSR-safe i18n + admin env config

   Port useI18n and getAdminEnvironment into app/ for the Nuxt 4 SSR shell so the
   2a/2b components can resolve @/composables/useI18n, @/locales/{id,en}.json, and
   @/config/adminEnvironment. Locale state moves from a module-scoped ref +
   localStorage to request-scoped useState persisted via useCookie (no cross-request
   bleed, hydration-safe); <html lang> sync is import.meta.client-guarded.
   getAdminEnvironment now derives ssoBaseUrl/widgetBaseUrl/docsBaseUrl/publicBasePath
   solely from runtimeConfig.public, removing the duplicate import.meta.env source.
   Locales copied byte-identical from the legacy SPA.

   Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
   ```

# Phase 2a — Shell + plumbing (Tasks 2a.1 – 2a.9)

> Implementation plan for `services/sso-admin-frontend` Nuxt 4 (SSR) + Swiss redesign.
> Authority: `docs/design/sso-admin-frontend-nuxt4-ssr-swiss-redesign-technical-design.md` (spec §3–§6),
> `/tmp/nuxtplan/FIXES.md` (mandatory), `/tmp/nuxtplan/ex/{routing,api,widget,nuxtResearch}.md`.
> Format: superpowers `writing-plans`. **TDD mandatory** — every task is RED → GREEN → commit.
> All paths are under `services/sso-admin-frontend/`.

## Global constraints (consumed by every task)

- **Consumes from prior phases (prerequisites, not in scope here):**
  - **Phase 0 (scaffold):** `nuxt.config.ts` exists with `ssr: true`, `srcDir: 'app/'`, Tailwind v4 vite plugin, `runtimeConfig.public.adminAppBaseUrl`, and `app/app.vue` rendering `<NuxtLayout><NuxtPage /></NuxtLayout>`. Vitest is configured to include `app/**/*.{spec,test}.ts` and `server/**/*.{spec,test}.ts`; `@pinia/nuxt` is registered so Pinia setup stores hydrate. Nuxt generates `.nuxt/tsconfig*.json`, so `$fetch`, `useRuntimeConfig`, `useRequestFetch`, `useState`, `navigateTo`, `useRequestURL`, `import.meta.server` are typed/auto-imported.
  - **Phase 1 (Nitro BFF):** `server/middleware/session.ts` resolves the encrypted `__Host-sso-admin-session` cookie into `event.context.session` (server-only, never serialized); `server/routes/api/admin/[...].ts` injects the Bearer token; `server/routes/widget/[...].ts` proxies `/widget/*`; `server/routes/auth/{login,callback,logout,refresh}.ts` own the OIDC flow. **Tokens live only in `event.context`** — no token/secret/raw-PII ever reaches Pinia, `useState`, or the `__NUXT__` payload.
- **DRY/YAGNI:** port behavior 1:1; do not add features, retries, or error handling beyond the source. Where SSR forces a mechanism change (native `fetch` → `baseFetch`, `globalThis.location.assign` → `navigateTo`), the mapping stays 1:1 and is flagged for `/code-review`.
- **Single-file test command** (deterministic): `npx vitest run <path>`. Single test: `npx vitest run <path> -t '<name>'`.
- **Per-task DoD gate** before commit: the task's own `npx vitest run <path>` is GREEN. Phase-level gate (run once at end of 2a, not per task): `npm run typecheck && npm run lint && npm run format:check && npm run test`.
- **Commit trailer (every commit):**
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **No traceability markers** (`OG#`/`UC###`/`FR###`) in any new source, test, or route name.

---

### Task 2a.1: Reconcile `runtimeConfig.public` (add frontend public keys)

**Files:**
- Modify: `nuxt.config.ts`
- Test (create): `app/__tests__/runtime-config.public-surface.spec.ts`

**Interfaces:**
- Consumes: env vars `NUXT_PUBLIC_BASE_PATH`, `NUXT_PUBLIC_SSO_BASE_URL`, `NUXT_PUBLIC_SSO_WIDGET_BASE_URL`, `NUXT_PUBLIC_DOCS_BASE_URL`, `NUXT_PUBLIC_MOCK_API` (Nuxt auto-overrides `runtimeConfig.public.<key>` from `NUXT_PUBLIC_<UPPER_SNAKE>` at runtime).
- Produces: `runtimeConfig.public` with exactly these keys (all `string`):
  `adminAppBaseUrl` (kept), `basePath` ← `NUXT_PUBLIC_BASE_PATH`, `ssoBaseUrl` ← `NUXT_PUBLIC_SSO_BASE_URL`, `ssoWidgetBaseUrl` ← `NUXT_PUBLIC_SSO_WIDGET_BASE_URL`, `docsBaseUrl` ← `NUXT_PUBLIC_DOCS_BASE_URL`, `mockApi` ← `NUXT_PUBLIC_MOCK_API`.
  **Correct mapping: `NUXT_PUBLIC_BASE_PATH` → `public.basePath` (NOT `publicBasePath`).** Consumers read `runtimeConfig.public.basePath`.

**Steps:**

1. [ ] Write failing test `app/__tests__/runtime-config.public-surface.spec.ts` (the Phase 0 public-surface canary, extended for the new keys):

   ```ts
   import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

   type PublicConfig = Record<string, unknown>

   async function loadPublicConfig(): Promise<PublicConfig> {
     vi.resetModules()
     vi.stubGlobal('defineNuxtConfig', (config: unknown) => config)
     const mod = (await import('../../nuxt.config')) as { default: { runtimeConfig: { public: PublicConfig } } }
     return mod.default.runtimeConfig.public
   }

   describe('runtimeConfig public surface', () => {
     beforeEach(() => vi.stubGlobal('defineNuxtConfig', (config: unknown) => config))
     afterEach(() => vi.unstubAllGlobals())

     it('exposes exactly the safe frontend public keys', async () => {
       const pub = await loadPublicConfig()
       expect(Object.keys(pub).sort()).toEqual(
         ['adminAppBaseUrl', 'basePath', 'docsBaseUrl', 'mockApi', 'ssoBaseUrl', 'ssoWidgetBaseUrl'].sort(),
       )
     })

     it('maps NUXT_PUBLIC_BASE_PATH to public.basePath, never publicBasePath', async () => {
       const pub = await loadPublicConfig()
       expect(pub).toHaveProperty('basePath')
       expect(pub).not.toHaveProperty('publicBasePath')
     })

     it('contains no secret/token/credential key names in the public surface', async () => {
       const pub = await loadPublicConfig()
       for (const key of Object.keys(pub)) {
         expect(key).not.toMatch(/secret|token|encryption|password|client_?secret|redis|cookie/i)
       }
     })
   })
   ```

2. [ ] Run it — expect FAIL (Phase 0 `public` has only `adminAppBaseUrl`; the first assertion fails on key-set mismatch):
   `npx vitest run app/__tests__/runtime-config.public-surface.spec.ts`
   Expected: `Tests  2 failed | 1 passed (3)` — the key-set + `basePath` assertions fail (`expected [ 'adminAppBaseUrl' ] to deeply equal [ 'adminAppBaseUrl', 'basePath', ... ]`).

3. [ ] Implement — set the `runtimeConfig.public` block in `nuxt.config.ts` (keep the private half exactly as Phase 1 owns it):

   ```ts
   runtimeConfig: {
     // Private (server-only) — owned by Phase 1 BFF (ADMIN_OIDC_*, SSO_INTERNAL_*,
     // SESSION_ENCRYPTION_SECRET, SSO_ADMIN_SESSION_REDIS_URL, ...). Never exposed.
     public: {
       adminAppBaseUrl: '',                                   // NUXT_PUBLIC_ADMIN_APP_BASE_URL (kept)
       basePath: '/__vue-preview',                            // NUXT_PUBLIC_BASE_PATH
       ssoBaseUrl: 'https://dev-sso.timeh.my.id',             // NUXT_PUBLIC_SSO_BASE_URL
       ssoWidgetBaseUrl: '',                                  // NUXT_PUBLIC_SSO_WIDGET_BASE_URL (same-origin default)
       docsBaseUrl: 'https://docs.sso.timeh.my.id',           // NUXT_PUBLIC_DOCS_BASE_URL
       mockApi: 'false',                                      // NUXT_PUBLIC_MOCK_API
     },
   },
   ```

4. [ ] Run it — expect PASS:
   `npx vitest run app/__tests__/runtime-config.public-surface.spec.ts`
   Expected: `Test Files  1 passed (1)` / `Tests  3 passed (3)`.

5. [ ] Commit:
   ```bash
   git add nuxt.config.ts app/__tests__/runtime-config.public-surface.spec.ts
   git commit -m "feat(sso-admin-frontend): add frontend public runtimeConfig keys

   Map NUXT_PUBLIC_BASE_PATH->public.basePath plus ssoBaseUrl, ssoWidgetBaseUrl,
   docsBaseUrl, mockApi; extend the public-surface guard to assert no secret key
   names leak into the client payload.

   Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
   ```

---

### Task 2a.2: `api-client.ts` over `baseFetch()` (SSR cookie-forwarding, exact public surface)

**Files:**
- Create: `app/lib/api/api-client.ts`
- Test (create): `app/lib/api/__tests__/api-client.spec.ts`

**Interfaces:**
- Consumes: `handleMockRequest` from `./mock-api-client` (Task 2a.3); Nuxt `$fetch` (client) / `useRequestFetch()` (server); `useRuntimeConfig().public.mockApi`.
- Produces (exact public surface — unchanged from the SPA):
  ```ts
  export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  export type RequestOptions = { readonly method?: HttpMethod; readonly body?: unknown; readonly headers?: Readonly<Record<string, string>> }
  export type BlobResponse = { readonly blob: Blob; readonly filename: string | null }
  export type ApiResponseWithRequestId<T> = { readonly data: T; readonly requestId: string | null }
  export type ApiClient = { get; getWithRequestId; getBlob; post; patch; put; delete }
  export class ApiError extends Error { constructor(readonly status, message, readonly code=null, readonly payload=null, readonly requestId=null) }
  export function isMockEnabled(): boolean
  export function getLastRequestId(): string | null
  export const apiClient: ApiClient
  ```
- **Invariants preserved:** `credentials: 'include'`; auto `X-Request-Id` (`admin-${uuid}` / caller override respected); `Accept-Language` from `document.documentElement.lang`; `Accept`/`X-Requested-With` always; `Content-Type: application/json` only when body present; `ApiError{status,code,payload,requestId}`; `invalid_upstream_response` (502) on non-JSON or malformed-JSON 2xx; content-encoding decode diagnostic; 204 → `undefined`; blob filename from `Content-Disposition`.
- **SSR adaptation (flag for `/code-review`):** native `fetch` → `baseFetch().raw(path, { responseType: 'blob', ignoreResponseError: true })`; `baseFetch()` = `useRequestFetch()` on server (forwards the session cookie during SSR) / `$fetch` on client. The unified body is always a `Blob` (`response._data`); JSON requests read `blob.text()` then `JSON.parse`.

**Steps:**

1. [ ] Write failing test `app/lib/api/__tests__/api-client.spec.ts` (ports the SPA evidence suite to the `$fetch.raw` mechanism):

   ```ts
   import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
   import { ApiError, apiClient, getLastRequestId } from '../api-client'

   type RawInit = { status?: number; headers?: Record<string, string> }

   function raw(body: string, init: RawInit = {}) {
     const headers = new Headers({ 'Content-Type': 'application/json', ...init.headers })
     const status = init.status ?? 200
     return {
       ok: status >= 200 && status < 300,
       status,
       headers,
       _data: new Blob([body], { type: headers.get('Content-Type') ?? '' }),
     }
   }

   function stubFetch(response: unknown) {
     const rawMock = vi.fn().mockResolvedValue(response)
     vi.stubGlobal('$fetch', Object.assign(vi.fn(), { raw: rawMock }))
     return rawMock
   }

   describe('apiClient request evidence (Nuxt baseFetch)', () => {
     beforeEach(() => {
       vi.spyOn(console, 'error').mockImplementation(() => {})
       vi.stubGlobal('useRuntimeConfig', () => ({ public: { mockApi: 'false' } }))
     })
     afterEach(() => {
       vi.unstubAllGlobals()
       vi.restoreAllMocks()
       document.documentElement.removeAttribute('lang')
     })

     it('sends a generated X-Request-Id when caller does not provide one', async () => {
       const rawMock = stubFetch(raw(JSON.stringify({ ok: true })))
       await apiClient.get('/api/admin/me')
       const headers = rawMock.mock.calls[0]?.[1]?.headers as Headers
       expect(headers.get('X-Request-Id')).toMatch(/^admin-[\w-]+$/)
       expect(rawMock.mock.calls[0]?.[1]?.credentials).toBe('include')
     })

     it('preserves a caller supplied X-Request-Id', async () => {
       const rawMock = stubFetch(raw(JSON.stringify({ ok: true })))
       await apiClient.get('/api/admin/me', { headers: { 'X-Request-Id': 'req-custom-1' } })
       expect((rawMock.mock.calls[0]?.[1]?.headers as Headers).get('X-Request-Id')).toBe('req-custom-1')
     })

     it('propagates Accept-Language from the active document locale', async () => {
       document.documentElement.setAttribute('lang', 'en')
       const rawMock = stubFetch(raw(JSON.stringify({ ok: true })))
       await apiClient.get('/api/admin/me')
       expect((rawMock.mock.calls[0]?.[1]?.headers as Headers).get('Accept-Language')).toBe('en')
     })

     it('records the response X-Request-Id for success states', async () => {
       stubFetch(raw(JSON.stringify({ ok: true }), { headers: { 'X-Request-Id': 'req-response-1' } }))
       await apiClient.get('/api/admin/me')
       expect(getLastRequestId()).toBe('req-response-1')
     })

     it('returns undefined for 204 responses', async () => {
       stubFetch({ ok: true, status: 204, headers: new Headers(), _data: new Blob([]) })
       await expect(apiClient.delete('/api/admin/clients/abc')).resolves.toBeUndefined()
     })

     it('rejects successful non-JSON responses as invalid upstream responses', async () => {
       stubFetch(
         raw('<!doctype html><title>Admin</title>', {
           headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Request-Id': 'req-html-200' },
         }),
       )
       await expect(apiClient.get('/api/admin/me')).rejects.toMatchObject({
         status: 502, code: 'invalid_upstream_response', requestId: 'req-html-200',
       } satisfies Partial<ApiError>)
     })

     it('rejects malformed JSON responses as invalid upstream responses', async () => {
       stubFetch(raw('{invalid', { headers: { 'X-Request-Id': 'req-json-invalid' } }))
       await expect(apiClient.get('/api/admin/me')).rejects.toMatchObject({
         status: 502, code: 'invalid_upstream_response', requestId: 'req-json-invalid',
       } satisfies Partial<ApiError>)
     })

     it('attaches response X-Request-Id to ApiError without copying raw backend trace', async () => {
       stubFetch(
         raw(JSON.stringify({ error: 'server_error', message: 'SQLSTATE leaked backend trace' }),
           { status: 500, headers: { 'X-Request-Id': 'req-error-1' } }),
       )
       await expect(apiClient.get('/api/admin/dashboard/summary')).rejects.toMatchObject({
         status: 500, code: 'server_error', requestId: 'req-error-1',
       } satisfies Partial<ApiError>)
     })

     it('reads a blob body and filename from Content-Disposition for downloads', async () => {
       stubFetch(
         raw('action,outcome\nadmin.user.lock,succeeded\n', {
           headers: {
             'Content-Type': 'text/csv',
             'Content-Disposition': 'attachment; filename="audit-export.csv"',
             'X-Request-Id': 'req-export-1',
           },
         }),
       )
       const result = await apiClient.getBlob('/api/admin/audit/export?format=csv')
       expect(result.blob.type).toBe('text/csv')
       expect(await result.blob.text()).toBe('action,outcome\nadmin.user.lock,succeeded\n')
       expect(result.filename).toBe('audit-export.csv')
       expect(getLastRequestId()).toBe('req-export-1')
     })

     it('throws ApiError for failed blob downloads without leaking raw backend copy', async () => {
       stubFetch(
         raw(JSON.stringify({ error: 'fresh_auth_required', message: 'raw ACR provider trace' }),
           { status: 428, headers: { 'X-Request-Id': 'req-export-428' } }),
       )
       await expect(apiClient.getBlob('/api/admin/audit/export?format=csv')).rejects.toMatchObject({
         status: 428, code: 'fresh_auth_required', requestId: 'req-export-428',
       } satisfies Partial<ApiError>)
     })

     it('logs a decode-context diagnostic when the body fails to decode (ISS-U3)', async () => {
       const decodeBlob = { type: 'application/json', text: async () => { throw new TypeError('Failed to decode body: decoding error') } }
       stubFetch({ ok: true, status: 200, headers: new Headers({ 'Content-Type': 'application/json', 'X-Request-Id': 'req-decode-err' }), _data: decodeBlob })
       await expect(apiClient.get('/api/admin/me')).rejects.toMatchObject({ status: 502, code: 'invalid_upstream_response' } satisfies Partial<ApiError>)
       expect(vi.mocked(console.error)).toHaveBeenCalledWith(expect.stringContaining('content-encoding'), expect.any(Error))
     })
   })
   ```

2. [ ] Run it — expect FAIL (module not created):
   `npx vitest run app/lib/api/__tests__/api-client.spec.ts`
   Expected: `FAIL ... Error: Failed to load url ../api-client` — `Test Files  1 failed (1)`.

3. [ ] Implement `app/lib/api/api-client.ts` (full):

   ```ts
   import { handleMockRequest } from './mock-api-client'

   export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'

   type RawFetchResponse = {
     readonly ok: boolean
     readonly status: number
     readonly headers: Headers
     readonly _data?: unknown
   }

   let lastRequestId: string | null = null

   export function isMockEnabled(): boolean {
     if (import.meta.server) return false
     if (typeof window === 'undefined') return false
     const mockApi = useRuntimeConfig().public.mockApi
     return (
       mockApi === 'true' ||
       window.location.search.includes('mock=true') ||
       localStorage.getItem('mock_api') === 'true'
     )
   }

   export class ApiError extends Error {
     constructor(
       readonly status: number,
       message: string,
       readonly code: string | null = null,
       readonly payload: unknown = null,
       readonly requestId: string | null = null,
     ) {
       super(message)
       this.name = 'ApiError'
     }
   }

   export function getLastRequestId(): string | null {
     return lastRequestId
   }

   export type RequestOptions = {
     readonly method?: HttpMethod
     readonly body?: unknown
     readonly headers?: Readonly<Record<string, string>>
   }

   export type BlobResponse = {
     readonly blob: Blob
     readonly filename: string | null
   }

   export type ApiResponseWithRequestId<T> = {
     readonly data: T
     readonly requestId: string | null
   }

   export type ApiClient = {
     get<T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T>
     getWithRequestId<T>(
       path: string,
       options?: Omit<RequestOptions, 'method' | 'body'>,
     ): Promise<ApiResponseWithRequestId<T>>
     getBlob(path: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<BlobResponse>
     post<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method'>): Promise<T>
     patch<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method'>): Promise<T>
     put<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method'>): Promise<T>
     delete<T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T>
   }

   // baseFetch forwards the encrypted session cookie during SSR (useRequestFetch
   // binds the incoming request context) and uses the global $fetch on the client.
   function baseFetch(): typeof $fetch {
     return import.meta.server ? useRequestFetch() : $fetch
   }

   function buildHeaders(custom: Readonly<Record<string, string>> | undefined): Headers {
     const headers = new Headers({
       Accept: 'application/json',
       'X-Requested-With': 'XMLHttpRequest',
     })

     const language = readDocumentLanguage()
     if (language) headers.set('Accept-Language', language)

     if (custom) {
       for (const [key, value] of Object.entries(custom)) headers.set(key, value)
     }

     if (!headers.has('X-Request-Id')) headers.set('X-Request-Id', generateRequestId())

     return headers
   }

   function readDocumentLanguage(): string | null {
     if (typeof document === 'undefined') return null
     const language = document.documentElement.getAttribute('lang')
     return language && language.length > 0 ? language : null
   }

   async function sendRequest(path: string, options: RequestOptions = {}): Promise<RawFetchResponse> {
     const method = options.method ?? 'GET'
     const headers = buildHeaders(options.headers)
     let body: string | undefined

     if (options.body !== undefined && options.body !== null) {
       headers.set('Content-Type', 'application/json')
       body = JSON.stringify(options.body)
     }

     const response = (await baseFetch().raw(path, {
       method,
       headers,
       body,
       credentials: 'include',
       responseType: 'blob',
       ignoreResponseError: true,
     })) as unknown as RawFetchResponse

     lastRequestId = response.headers.get('X-Request-Id') ?? headers.get('X-Request-Id')

     if (!response.ok) throw await apiErrorFromResponse(response)

     return response
   }

   async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
     if (isMockEnabled()) {
       await new Promise((resolve) => setTimeout(resolve, 300))
       const res = handleMockRequest(options.method ?? 'GET', path, options.body)
       if (res.status >= 400) {
         throw new ApiError(res.status, res.data?.message || 'Mock Error', null, res.data, 'mock-req-id')
       }
       return res.data as T
     }
     const response = await sendRequest(path, options)
     if (response.status === 204) return undefined as T

     return (await jsonPayloadFromSuccess(response)) as T
   }

   async function requestWithRequestId<T>(
     path: string,
     options: RequestOptions = {},
   ): Promise<ApiResponseWithRequestId<T>> {
     if (isMockEnabled()) {
       return { data: await request<T>(path, options), requestId: getLastRequestId() ?? 'mock-req-id' }
     }

     const response = await sendRequest(path, options)
     const requestId = response.headers.get('X-Request-Id') ?? getLastRequestId()

     return {
       data: response.status === 204 ? (undefined as T) : ((await jsonPayloadFromSuccess(response)) as T),
       requestId,
     }
   }

   async function requestBlob(path: string, options: RequestOptions = {}): Promise<BlobResponse> {
     if (isMockEnabled()) {
       await new Promise((resolve) => setTimeout(resolve, 300))
       const res = handleMockRequest(options.method ?? 'GET', path, options.body)
       if (res.status >= 400) {
         throw new ApiError(res.status, res.data?.message || 'Mock Error', null, res.data, 'mock-req-id')
       }
       const text = typeof res.data === 'string' ? res.data : JSON.stringify(res.data)
       return { blob: new Blob([text], { type: 'text/csv' }), filename: 'export.csv' }
     }
     const response = await sendRequest(path, options)

     return {
       blob: blobBody(response),
       filename: filenameFromContentDisposition(response.headers.get('Content-Disposition')),
     }
   }

   function blobBody(response: RawFetchResponse): Blob {
     return response._data as Blob
   }

   function filenameFromContentDisposition(header: string | null): string | null {
     if (!header) return null

     const utf8Match = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(header)
     if (utf8Match?.[1]) return decodeURIComponent(utf8Match[1].trim().replace(/^"|"$/g, ''))

     const asciiMatch = /filename="?([^";]+)"?/i.exec(header)
     return asciiMatch?.[1]?.trim() ?? null
   }

   async function apiErrorFromResponse(response: RawFetchResponse): Promise<ApiError> {
     const payload = await responsePayload(response)
     const message = safeErrorMessage(payload) ?? `Request failed with status ${response.status}`
     const code = safeErrorCode(payload)
     const requestId = response.headers.get('X-Request-Id') ?? lastRequestId

     return new ApiError(response.status, message, code, payload, requestId)
   }

   async function jsonPayloadFromSuccess(response: RawFetchResponse): Promise<unknown> {
     if (!isJsonResponse(response)) throw invalidUpstreamResponse(response)

     let text: string
     try {
       text = await blobBody(response).text()
     } catch (error) {
       // A decode-flavoured failure here is almost always a stale Content-Encoding
       // header forwarded by the BFF (the body is already decompressed). Log for
       // operator debugging without surfacing raw details to the UI (ISS-U1/U2).
       if (isDecodeError(error)) {
         console.error(
           '[api-client] body decode failed — check that the BFF strips content-encoding before forwarding.',
           error,
         )
       }
       throw invalidUpstreamResponse(response)
     }

     try {
       return JSON.parse(text)
     } catch {
       throw invalidUpstreamResponse(response)
     }
   }

   function isDecodeError(error: unknown): boolean {
     if (!(error instanceof Error)) return false
     const msg = error.message.toLowerCase()
     return msg.includes('decod') || msg.includes('content')
   }

   function isJsonResponse(response: RawFetchResponse): boolean {
     const contentType = response.headers.get('Content-Type')
     if (!contentType) return false

     const mimeType = contentType.split(';', 1)[0]?.trim().toLowerCase()
     return mimeType === 'application/json' || mimeType?.endsWith('+json') === true
   }

   function invalidUpstreamResponse(response: RawFetchResponse): ApiError {
     return new ApiError(
       502,
       'Admin API returned a successful response that was not valid JSON.',
       'invalid_upstream_response',
       null,
       response.headers.get('X-Request-Id') ?? lastRequestId,
     )
   }

   async function responsePayload(response: RawFetchResponse): Promise<unknown> {
     const data = response._data
     if (data === undefined || data === null) return null
     try {
       return JSON.parse(await (data as Blob).text())
     } catch {
       return null
     }
   }

   function safeErrorMessage(payload: unknown): string | null {
     return isRecord(payload) && typeof payload.message === 'string' ? payload.message : null
   }

   function safeErrorCode(payload: unknown): string | null {
     return isRecord(payload) && typeof payload.error === 'string' ? payload.error : null
   }

   function isRecord(value: unknown): value is Record<string, unknown> {
     return typeof value === 'object' && value !== null
   }

   function generateRequestId(): string {
     if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
       return `admin-${crypto.randomUUID()}`
     }
     return `admin-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
   }

   export const apiClient: ApiClient = {
     get: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> =>
       request<T>(path, { ...options, method: 'GET' }),
     getWithRequestId: <T>(
       path: string,
       options?: Omit<RequestOptions, 'method' | 'body'>,
     ): Promise<ApiResponseWithRequestId<T>> =>
       requestWithRequestId<T>(path, { ...options, method: 'GET' }),
     getBlob: (path: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<BlobResponse> =>
       requestBlob(path, { ...options, method: 'GET' }),
     post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method'>): Promise<T> =>
       request<T>(path, { ...options, method: 'POST', body }),
     patch: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method'>): Promise<T> =>
       request<T>(path, { ...options, method: 'PATCH', body }),
     put: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method'>): Promise<T> =>
       request<T>(path, { ...options, method: 'PUT', body }),
     delete: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> =>
       request<T>(path, { ...options, method: 'DELETE' }),
   }
   ```

4. [ ] Run it — expect PASS:
   `npx vitest run app/lib/api/__tests__/api-client.spec.ts`
   Expected: `Test Files  1 passed (1)` / `Tests  11 passed (11)`.

5. [ ] Commit:
   ```bash
   git add app/lib/api/api-client.ts app/lib/api/__tests__/api-client.spec.ts
   git commit -m "feat(sso-admin-frontend): port api-client onto SSR baseFetch

   useRequestFetch() on server / \$fetch on client forwards the session cookie
   during SSR while preserving the exact public surface: ApiError shape,
   X-Request-Id, Accept-Language, credentials include, invalid_upstream_response
   on non-JSON 2xx, 204->undefined, and blob download filename parsing.

   Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
   ```

---

### Task 2a.3: Copy `mock-api-client.ts` verbatim

**Files:**
- Create (verbatim copy): `app/lib/api/mock-api-client.ts`
- Test (create): `app/lib/api/__tests__/mock-api-client.parity.spec.ts`

**Interfaces:**
- Consumes: nothing (the SPA `src/lib/api/mock-api-client.ts` is import-free, self-contained canned data — verified: 593 lines, exports `MockResponse` + `handleMockRequest` only).
- Produces (unchanged): `export type MockResponse = { status: number; data: any }`; `export function handleMockRequest(method: string, path: string, body?: any): MockResponse`.

**Steps:**

1. [ ] Write failing parity test `app/lib/api/__tests__/mock-api-client.parity.spec.ts`:

   ```ts
   import { readFileSync } from 'node:fs'
   import { fileURLToPath } from 'node:url'
   import { describe, expect, it } from 'vitest'
   import { handleMockRequest } from '../mock-api-client'

   const nuxtCopy = fileURLToPath(new URL('../mock-api-client.ts', import.meta.url))
   const spaSource = fileURLToPath(new URL('../../../../src/lib/api/mock-api-client.ts', import.meta.url))

   describe('mock-api-client parity', () => {
     it('is a byte-identical copy of the SPA source', () => {
       expect(Buffer.from(readFileSync(nuxtCopy)).equals(Buffer.from(readFileSync(spaSource)))).toBe(true)
     })

     it('answers a known mock route', () => {
       const res = handleMockRequest('GET', '/api/admin/me')
       expect(res.status).toBeGreaterThanOrEqual(200)
       expect(res.status).toBeLessThan(500)
     })
   })
   ```

2. [ ] Run it — expect FAIL (copy not created yet):
   `npx vitest run app/lib/api/__tests__/mock-api-client.parity.spec.ts`
   Expected: `FAIL ... Error: Failed to load url ../mock-api-client` — `Test Files  1 failed (1)`.

3. [ ] Implement — copy verbatim (no edits; it is environment-agnostic and import-free):
   ```bash
   cp src/lib/api/mock-api-client.ts app/lib/api/mock-api-client.ts
   ```

4. [ ] Run it — expect PASS:
   `npx vitest run app/lib/api/__tests__/mock-api-client.parity.spec.ts`
   Expected: `Test Files  1 passed (1)` / `Tests  2 passed (2)`.

5. [ ] Commit:
   ```bash
   git add app/lib/api/mock-api-client.ts app/lib/api/__tests__/mock-api-client.parity.spec.ts
   git commit -m "feat(sso-admin-frontend): copy mock-api-client verbatim into app/lib

   Import-free canned-data module carried over unchanged; a parity test asserts
   it stays byte-identical with the SPA source until cutover removes src/.

   Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
   ```

---

### Task 2a.4: Pinia session store (`useState` + `skipHydrate`, safe fields only)

**Files:**
- Create: `app/types/auth.types.ts`
- Create: `app/services/auth.api.ts`
- Create: `app/stores/session.store.ts`
- Test (create): `app/stores/__tests__/session.store.spec.ts`

**Interfaces:**
- Consumes: `ApiError` from `@/lib/api/api-client` (2a.2); `apiClient` (2a.2); Nuxt `useState`; Pinia `defineStore`, `skipHydrate`.
- Produces:
  - `app/types/auth.types.ts` — `SsoUser`, `SsoSessionResponse`, `AdminAuthContext`, `AdminPermissionMenu`, `AdminPermissionMatrix`, `AdminPrincipal`, `AdminPrincipalResponse` (all `readonly`, copied 1:1 from the SPA — no tokens/raw-PII fields).
  - `app/services/auth.api.ts` — `authApi = { getSession(): Promise<SsoSessionResponse>; getPrincipal(): Promise<AdminPrincipalResponse> }` (`GET /api/auth/session`, `GET /api/admin/me`).
  - `app/stores/session.store.ts` — `useSessionStore` (`'admin-session'`): state `user`, `principal` (both `useState`+`skipHydrate` — safe masked DTO/principal fields only), `status`, `lastEnsureResult`; getters `isAuthenticated`, `roles`, `permissions`; actions `setUser`, `setPrincipal`, `clear`, `ensureSession(force?)`, `ensurePrincipal(force?)`, `startSessionBootstrap(force?)`, `hasPermission(p)`, `hasEveryPermission(ps)`. `SessionStatus`, `SessionEnsureResult` exported.
- **SSR-payload safety:** `user`/`principal` are backed by `useState` (so SSR-resolved principal hydrates) and wrapped in `skipHydrate` (so Pinia does not double-serialize). The principal DTO carries display name, email, role, capability booleans, menus, and auth-context flags — no access/refresh/id token, no client secret, no raw NIK/NIP/NISN. Tokens stay in Nitro `event.context` (Phase 1).

**Steps:**

1. [ ] Write failing test `app/stores/__tests__/session.store.spec.ts` (ports the SPA bootstrap matrix; stubs the Nuxt `useState` auto-import):

   ```ts
   import { beforeEach, describe, expect, it, vi } from 'vitest'
   import { ref } from 'vue'
   import { createPinia, setActivePinia } from 'pinia'
   import { useSessionStore } from '../session.store'
   import { ApiError } from '@/lib/api/api-client'
   import { authApi } from '@/services/auth.api'
   import type { AdminPrincipalResponse } from '@/types/auth.types'

   vi.mock('@/services/auth.api', () => ({
     authApi: { getPrincipal: vi.fn<() => Promise<AdminPrincipalResponse>>() },
   }))

   const adminPrincipal: AdminPrincipalResponse = {
     principal: {
       subject_id: 'sub_admin',
       email: 'admin@dev-sso.local',
       display_name: 'Admin User',
       role: 'admin',
       last_login_at: null,
       permissions: {
         view_admin_panel: true,
         manage_sessions: false,
         permissions: ['admin.dashboard.view'],
         capabilities: { 'admin.dashboard.view': true },
         menus: [],
       },
       auth_context: { auth_time: null, amr: ['pwd', 'mfa'], acr: 'urn:loa:2', mfa_enforced: true, mfa_verified: true },
     },
   }

   describe('useSessionStore (Nuxt useState)', () => {
     beforeEach(() => {
       setActivePinia(createPinia())
       vi.clearAllMocks()
       vi.stubGlobal('useState', <T,>(_key: string, init: () => T) => ref(init()))
     })

     it('bootstraps the admin session from the BFF principal endpoint', async () => {
       vi.mocked(authApi.getPrincipal).mockResolvedValue(adminPrincipal)
       const session = useSessionStore()
       await expect(session.ensureSession()).resolves.toBe('authenticated')
       expect(session.isAuthenticated).toBe(true)
       expect(session.roles).toEqual(['admin'])
       expect(session.user?.email).toBe('admin@dev-sso.local')
       expect(session.hasPermission('admin.dashboard.view')).toBe(true)
       expect(session.hasEveryPermission(['admin.dashboard.view'])).toBe(true)
     })

     it('returns unauthenticated when the principal endpoint returns 401', async () => {
       vi.mocked(authApi.getPrincipal).mockRejectedValue(new ApiError(401, 'No active SSO session.'))
       const session = useSessionStore()
       await expect(session.ensureSession()).resolves.toBe('unauthenticated')
       expect(session.isAuthenticated).toBe(false)
       expect(session.user).toBeNull()
     })

     it('maps explicit MFA enrollment denials', async () => {
       vi.mocked(authApi.getPrincipal).mockRejectedValue(new ApiError(403, 'MFA', 'mfa_enrollment_required'))
       const session = useSessionStore()
       await expect(session.ensureSession()).resolves.toBe('mfa_enrollment_required')
     })

     it('maps step-up (428) and current reauth_required to step_up_required', async () => {
       const session = useSessionStore()
       vi.mocked(authApi.getPrincipal).mockRejectedValue(new ApiError(428, 'Step up', 'step_up_required'))
       await expect(session.ensureSession()).resolves.toBe('step_up_required')
       vi.mocked(authApi.getPrincipal).mockRejectedValue(new ApiError(401, 'Fresh auth', 'reauth_required'))
       await expect(session.ensureSession(true)).resolves.toBe('step_up_required')
     })

     it('keeps generic 403 mapped to forbidden', async () => {
       vi.mocked(authApi.getPrincipal).mockRejectedValue(new ApiError(403, 'Forbidden', 'forbidden'))
       await expect(useSessionStore().ensureSession()).resolves.toBe('forbidden')
     })

     it('maps invalid_upstream_response to api_unreachable', async () => {
       vi.mocked(authApi.getPrincipal).mockRejectedValue(new ApiError(502, 'bad', 'invalid_upstream_response'))
       await expect(useSessionStore().ensureSession()).resolves.toBe('api_unreachable')
     })

     it('returns error without collapsing network failures into unauthenticated', async () => {
       vi.mocked(authApi.getPrincipal).mockRejectedValue(new Error('network down'))
       const session = useSessionStore()
       await expect(session.ensureSession()).resolves.toBe('error')
       expect(session.user).toBeNull()
     })

     it('reuses a loaded principal without a second request via startSessionBootstrap', async () => {
       vi.mocked(authApi.getPrincipal).mockResolvedValue(adminPrincipal)
       const session = useSessionStore()
       await session.ensureSession()
       await expect(session.startSessionBootstrap()).resolves.toBe('authenticated')
       expect(authApi.getPrincipal).toHaveBeenCalledTimes(1)
     })
   })
   ```

2. [ ] Run it — expect FAIL (modules not created):
   `npx vitest run app/stores/__tests__/session.store.spec.ts`
   Expected: `FAIL ... Error: Failed to load url ../session.store` — `Test Files  1 failed (1)`.

3. [ ] Implement the three modules.

   `app/types/auth.types.ts` (1:1 copy of the SPA types):
   ```ts
   export type SsoUser = {
     readonly id: number
     readonly subject_id: string
     readonly email: string
     readonly display_name: string
     readonly roles: readonly string[]
   }

   export type SsoSessionResponse =
     | { readonly authenticated: true; readonly user: SsoUser }
     | { readonly authenticated: false; readonly user: null }

   export type AdminAuthContext = {
     readonly auth_time: string | null
     readonly amr: readonly string[]
     readonly acr: string | null
     readonly mfa_enforced: boolean
     readonly mfa_verified: boolean
   }

   export type AdminPermissionMenu = {
     readonly id: string
     readonly label: string
     readonly required_permission: string
     readonly visible: boolean
   }

   export type AdminPermissionMatrix = {
     readonly view_admin_panel: boolean
     readonly manage_sessions: boolean
     readonly permissions: readonly string[]
     readonly capabilities: Readonly<Record<string, boolean>>
     readonly menus: readonly AdminPermissionMenu[]
   }

   export type AdminPrincipal = {
     readonly subject_id: string
     readonly email: string
     readonly display_name: string
     readonly given_name?: string | null
     readonly family_name?: string | null
     readonly role: string
     readonly last_login_at: string | null
     readonly auth_context: AdminAuthContext
     readonly permissions: AdminPermissionMatrix
   }

   export type AdminPrincipalResponse = {
     readonly principal: AdminPrincipal
   }
   ```

   `app/services/auth.api.ts`:
   ```ts
   import { apiClient } from '@/lib/api/api-client'
   import type { AdminPrincipalResponse, SsoSessionResponse } from '@/types/auth.types'

   export const authApi = {
     getSession(): Promise<SsoSessionResponse> {
       return apiClient.get<SsoSessionResponse>('/api/auth/session')
     },
     getPrincipal(): Promise<AdminPrincipalResponse> {
       return apiClient.get<AdminPrincipalResponse>('/api/admin/me')
     },
   }
   ```

   `app/stores/session.store.ts`:
   ```ts
   import { computed, ref } from 'vue'
   import { defineStore, skipHydrate } from 'pinia'
   import { ApiError } from '@/lib/api/api-client'
   import { authApi } from '@/services/auth.api'
   import type { AdminPrincipal, SsoUser } from '@/types/auth.types'

   export type SessionStatus = 'idle' | 'loading' | 'ready'
   export type SessionEnsureResult =
     | 'authenticated'
     | 'unauthenticated'
     | 'forbidden'
     | 'mfa_enrollment_required'
     | 'step_up_required'
     | 'api_unreachable'
     | 'error'

   export const useSessionStore = defineStore('admin-session', () => {
     // useState makes the SSR-resolved principal survive into the client payload;
     // skipHydrate stops Pinia from also serializing it (no double-hydration).
     // Only safe masked DTO/principal fields ever live here — never a token,
     // client secret, or raw NIK/NIP/NISN (those stay in Nitro event.context).
     const user = skipHydrate(useState<SsoUser | null>('admin-session:user', () => null))
     const principal = skipHydrate(useState<AdminPrincipal | null>('admin-session:principal', () => null))
     const status = ref<SessionStatus>('idle')
     const lastEnsureResult = ref<SessionEnsureResult | null>(null)
     let bootstrapPromise: Promise<SessionEnsureResult> | null = null

     const isAuthenticated = computed<boolean>(() => user.value !== null)
     const roles = computed<readonly string[]>(() => user.value?.roles ?? [])
     const permissions = computed<Readonly<Record<string, boolean>>>(
       () => principal.value?.permissions.capabilities ?? {},
     )

     function setUser(nextUser: SsoUser): void {
       user.value = nextUser
       status.value = 'ready'
     }

     function setPrincipal(nextPrincipal: AdminPrincipal): void {
       principal.value = nextPrincipal
       user.value = userFromPrincipal(nextPrincipal)
       status.value = 'ready'
     }

     function clear(): void {
       user.value = null
       principal.value = null
       status.value = 'idle'
       lastEnsureResult.value = null
     }

     async function ensureSession(force = false): Promise<SessionEnsureResult> {
       if (!force && principal.value !== null) return rememberEnsureResult('authenticated')

       status.value = 'loading'
       try {
         const response = await authApi.getPrincipal()
         setPrincipal(response.principal)
         lastEnsureResult.value = 'authenticated'
         return 'authenticated'
       } catch (error) {
         clear()

         if (error instanceof ApiError) {
           if (error.code === 'mfa_enrollment_required') return rememberEnsureResult('mfa_enrollment_required')
           if (error.code === 'invalid_upstream_response') return rememberEnsureResult('api_unreachable')
           if (requiresStepUp(error)) return rememberEnsureResult('step_up_required')
           if (error.status === 401) return rememberEnsureResult('unauthenticated')
           if (error.status === 403) return rememberEnsureResult('forbidden')
         }

         return rememberEnsureResult('error')
       }
     }

     function rememberEnsureResult(result: SessionEnsureResult): SessionEnsureResult {
       lastEnsureResult.value = result
       return result
     }

     function startSessionBootstrap(force = false): Promise<SessionEnsureResult> {
       if (!force && principal.value !== null) {
         lastEnsureResult.value = 'authenticated'
         return Promise.resolve('authenticated')
       }

       if (!force && bootstrapPromise) return bootstrapPromise

       bootstrapPromise = ensureSession(force).finally(() => {
         bootstrapPromise = null
       })

       return bootstrapPromise
     }

     async function ensurePrincipal(force = false): Promise<SessionEnsureResult> {
       return ensureSession(force)
     }

     function hasPermission(permission: string): boolean {
       return permissions.value[permission] === true
     }

     function userFromPrincipal(nextPrincipal: AdminPrincipal): SsoUser {
       return {
         id: 0,
         subject_id: nextPrincipal.subject_id,
         email: nextPrincipal.email,
         display_name: nextPrincipal.display_name,
         roles: [nextPrincipal.role],
       }
     }

     function hasEveryPermission(requiredPermissions: readonly string[]): boolean {
       return requiredPermissions.every((permission) => hasPermission(permission))
     }

     function requiresStepUp(error: ApiError): boolean {
       if (error.code === 'step_up_required') return true
       if (error.code === 'reauth_required') return true
       if (error.code === 'mfa_required') return true
       return error.status === 412 || error.status === 428
     }

     return {
       user,
       principal,
       status,
       lastEnsureResult,
       isAuthenticated,
       roles,
       permissions,
       setUser,
       setPrincipal,
       clear,
       ensureSession,
       ensurePrincipal,
       startSessionBootstrap,
       hasPermission,
       hasEveryPermission,
     }
   })
   ```

4. [ ] Run it — expect PASS:
   `npx vitest run app/stores/__tests__/session.store.spec.ts`
   Expected: `Test Files  1 passed (1)` / `Tests  8 passed (8)`.

5. [ ] Commit:
   ```bash
   git add app/types/auth.types.ts app/services/auth.api.ts app/stores/session.store.ts app/stores/__tests__/session.store.spec.ts
   git commit -m "feat(sso-admin-frontend): port admin session store onto useState

   Pinia 'admin-session' store backs user/principal with useState+skipHydrate so
   the SSR-resolved principal hydrates with safe masked fields only (no token or
   raw PII). Ports ensureSession/startSessionBootstrap/hasPermission/
   hasEveryPermission with the full bootstrap-failure mapping.

   Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
   ```

---

### Task 2a.5: `admin-guard.global.ts` + pure guard resolver

**Files:**
- Create: `app/lib/auth/admin-access.ts`
- Create: `app/lib/auth/admin-guard-resolver.ts`
- Create: `app/types/page-meta.d.ts`
- Create: `app/middleware/admin-guard.global.ts`
- Test (create): `app/lib/auth/__tests__/admin-guard-resolver.spec.ts`

**Interfaces:**
- Consumes: `useSessionStore` + `SessionEnsureResult` (2a.4); `RouteLocationNormalized`, `RouteLocationRaw` from `vue-router`; Nuxt `defineNuxtRouteMiddleware`, `navigateTo`, `useRuntimeConfig`, `useRequestURL`.
- Produces:
  - `app/lib/auth/admin-access.ts` — `hasAdminRole(roles: readonly string[]): boolean` (`roles.includes('admin')`).
  - `app/lib/auth/admin-guard-resolver.ts`:
    ```ts
    export type BootstrapResolution =
      | { readonly kind: 'login'; readonly url: string }
      | { readonly kind: 'route'; readonly to: RouteLocationRaw }
      | { readonly kind: 'allow' }
    export function normalizeBasePath(path: string): string
    export function buildLoginUrl(fullPath: string, origin: string, basePath: string): string  // pure, isomorphic
    export function resolveLoadedAdminAccess(to: RouteLocationNormalized): RouteLocationRaw | true  // reads useSessionStore
    export function resolveBootstrapFailure(result: SessionEnsureResult | null, fullPath: string, origin: string, basePath: string): BootstrapResolution  // PURE — no globalThis.location, no side effects
    ```
  - `app/types/page-meta.d.ts` — augments Nuxt page meta with `requiresAdmin?: boolean` and `permissions?: readonly string[]`.
  - `app/middleware/admin-guard.global.ts` — the SSR-blocking port of `resolveAdminGuard`: awaits `startSessionBootstrap`, maps via `resolveBootstrapFailure` (`navigateTo(url,{external:true})` for `login`, `navigateTo(to)` for `route`), then enforces `resolveLoadedAdminAccess`.
- **Adaptation (flag for `/code-review`):** the SPA `resolveAdminGuard` fired bootstrap non-blocking and let the layout watcher route; under SSR the middleware *awaits* the principal so the server renders the correct page (no flash). `resolveBootstrapFailure` is now **pure** (returns `BootstrapResolution`; the middleware performs navigation) and `buildLoginUrl` takes `(fullPath, origin, basePath)` so it is isomorphic and pure-testable (no `globalThis.location`).

**Steps:**

1. [ ] Write failing test `app/lib/auth/__tests__/admin-guard-resolver.spec.ts` (purity + login URL + bootstrap mapping):

   ```ts
   import { beforeEach, describe, expect, it, vi } from 'vitest'
   import { buildLoginUrl, normalizeBasePath, resolveBootstrapFailure } from '../admin-guard-resolver'

   describe('buildLoginUrl', () => {
     it('builds a same-origin login URL with an encoded base-prefixed return_to', () => {
       expect(buildLoginUrl('/', 'https://sso.test', '/__vue-preview')).toBe(
         'https://sso.test/auth/login?return_to=%2F__vue-preview%2F',
       )
       expect(buildLoginUrl('/oidc-foundation', 'https://sso.test', '/__vue-preview')).toBe(
         'https://sso.test/auth/login?return_to=%2F__vue-preview%2Foidc-foundation',
       )
     })

     it('normalizes the base path (leading + trailing slash)', () => {
       expect(normalizeBasePath('app')).toBe('/app/')
       expect(normalizeBasePath('/app')).toBe('/app/')
       expect(normalizeBasePath('/app/')).toBe('/app/')
     })
   })

   describe('resolveBootstrapFailure', () => {
     beforeEach(() => {
       vi.stubGlobal('location', { assign: vi.fn<(url: string) => void>(), origin: 'https://sso.test' })
     })

     const O = 'https://sso.test'
     const B = '/__vue-preview'

     it('is pure: never touches globalThis.location', () => {
       resolveBootstrapFailure('unauthenticated', '/', O, B)
       expect(globalThis.location.assign).not.toHaveBeenCalled()
     })

     it('maps unauthenticated to a login resolution carrying the built URL', () => {
       expect(resolveBootstrapFailure('unauthenticated', '/', O, B)).toEqual({
         kind: 'login',
         url: 'https://sso.test/auth/login?return_to=%2F__vue-preview%2F',
       })
     })

     it('maps forbidden to the forbidden route', () => {
       expect(resolveBootstrapFailure('forbidden', '/', O, B)).toEqual({ kind: 'route', to: { name: 'admin.forbidden' } })
     })

     it('maps mfa_enrollment_required and step_up_required with return_to', () => {
       expect(resolveBootstrapFailure('mfa_enrollment_required', '/x', O, B)).toEqual({
         kind: 'route', to: { name: 'admin.mfa-required', query: { return_to: '/x' } },
       })
       expect(resolveBootstrapFailure('step_up_required', '/x', O, B)).toEqual({
         kind: 'route', to: { name: 'admin.step-up-required', query: { return_to: '/x' } },
       })
     })

     it('maps api_unreachable and error to their safe views', () => {
       expect(resolveBootstrapFailure('api_unreachable', '/', O, B)).toEqual({ kind: 'route', to: { name: 'admin.api-unreachable' } })
       expect(resolveBootstrapFailure('error', '/', O, B)).toEqual({ kind: 'route', to: { name: 'admin.error' } })
     })

     it('treats authenticated and null as allow', () => {
       expect(resolveBootstrapFailure('authenticated', '/', O, B)).toEqual({ kind: 'allow' })
       expect(resolveBootstrapFailure(null, '/', O, B)).toEqual({ kind: 'allow' })
     })
   })
   ```

2. [ ] Run it — expect FAIL (resolver not created):
   `npx vitest run app/lib/auth/__tests__/admin-guard-resolver.spec.ts`
   Expected: `FAIL ... Error: Failed to load url ../admin-guard-resolver` — `Test Files  1 failed (1)`.

3. [ ] Implement the four modules.

   `app/lib/auth/admin-access.ts`:
   ```ts
   export function hasAdminRole(roles: readonly string[]): boolean {
     return roles.includes('admin')
   }
   ```

   `app/lib/auth/admin-guard-resolver.ts`:
   ```ts
   import type { RouteLocationNormalized, RouteLocationRaw } from 'vue-router'
   import { hasAdminRole } from '@/lib/auth/admin-access'
   import { useSessionStore, type SessionEnsureResult } from '@/stores/session.store'

   export type BootstrapResolution =
     | { readonly kind: 'login'; readonly url: string }
     | { readonly kind: 'route'; readonly to: RouteLocationRaw }
     | { readonly kind: 'allow' }

   export function resolveLoadedAdminAccess(to: RouteLocationNormalized): RouteLocationRaw | true {
     if (!to.meta.requiresAdmin) return true

     const session = useSessionStore()

     if (!session.principal) return true

     if (!hasAdminRole(session.roles)) return { name: 'admin.forbidden' }

     const requiredPermissions = routePermissions(to)
     if (requiredPermissions.length === 0) return true

     if (!session.hasEveryPermission(requiredPermissions)) return { name: 'admin.forbidden' }

     return true
   }

   export function resolveBootstrapFailure(
     result: SessionEnsureResult | null,
     fullPath: string,
     origin: string,
     basePath: string,
   ): BootstrapResolution {
     if (result === 'unauthenticated') return { kind: 'login', url: buildLoginUrl(fullPath, origin, basePath) }
     if (result === 'forbidden') return { kind: 'route', to: { name: 'admin.forbidden' } }
     if (result === 'mfa_enrollment_required')
       return { kind: 'route', to: { name: 'admin.mfa-required', query: { return_to: fullPath } } }
     if (result === 'step_up_required')
       return { kind: 'route', to: { name: 'admin.step-up-required', query: { return_to: fullPath } } }
     if (result === 'api_unreachable') return { kind: 'route', to: { name: 'admin.api-unreachable' } }
     if (result === 'error') return { kind: 'route', to: { name: 'admin.error' } }
     return { kind: 'allow' }
   }

   function routePermissions(to: RouteLocationNormalized): readonly string[] {
     const permissions = to.meta.permissions
     if (!Array.isArray(permissions)) return []
     return permissions.filter((permission): permission is string => typeof permission === 'string')
   }

   export function buildLoginUrl(fullPath: string, origin: string, basePath: string): string {
     const publicBase = normalizeBasePath(basePath)
     const returnPath = `${publicBase}${fullPath.replace(/^\//u, '')}`
     const url = new URL('/auth/login', origin)
     url.searchParams.set('return_to', returnPath)
     return url.toString()
   }

   export function normalizeBasePath(path: string): string {
     const prefixed = path.startsWith('/') ? path : `/${path}`
     return prefixed.endsWith('/') ? prefixed : `${prefixed}/`
   }
   ```

   `app/types/page-meta.d.ts`:
   ```ts
   declare module '#app' {
     interface PageMeta {
       requiresAdmin?: boolean
       permissions?: readonly string[]
     }
   }

   declare module 'vue-router' {
     interface RouteMeta {
       requiresAdmin?: boolean
       permissions?: readonly string[]
     }
   }

   export {}
   ```

   `app/middleware/admin-guard.global.ts` (SSR-blocking port of `resolveAdminGuard`):
   ```ts
   import { resolveBootstrapFailure, resolveLoadedAdminAccess } from '@/lib/auth/admin-guard-resolver'
   import { useSessionStore } from '@/stores/session.store'

   export default defineNuxtRouteMiddleware(async (to) => {
     if (!to.meta.requiresAdmin) return

     const session = useSessionStore()

     if (!session.principal) {
       const result = await session.startSessionBootstrap()
       const origin = useRequestURL().origin
       const basePath = useRuntimeConfig().public.basePath
       const resolution = resolveBootstrapFailure(result, to.fullPath, origin, basePath)
       if (resolution.kind === 'login') return navigateTo(resolution.url, { external: true })
       if (resolution.kind === 'route') return navigateTo(resolution.to)
     }

     const access = resolveLoadedAdminAccess(to)
     if (access !== true) return navigateTo(access)
   })
   ```

4. [ ] Run it — expect PASS:
   `npx vitest run app/lib/auth/__tests__/admin-guard-resolver.spec.ts`
   Expected: `Test Files  1 passed (1)` / `Tests  8 passed (8)`.

5. [ ] Commit:
   ```bash
   git add app/lib/auth/admin-access.ts app/lib/auth/admin-guard-resolver.ts app/types/page-meta.d.ts app/middleware/admin-guard.global.ts app/lib/auth/__tests__/admin-guard-resolver.spec.ts
   git commit -m "feat(sso-admin-frontend): port admin guard to SSR-blocking middleware

   admin-guard.global.ts awaits principal bootstrap then enforces role+permission
   meta. resolveBootstrapFailure is now a pure BootstrapResolution mapping and
   buildLoginUrl(fullPath, origin, basePath) is isomorphic; the middleware owns
   navigateTo(url,{external:true}).

   Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
   ```

---

### Task 2a.6: Full route map as guarded stub pages

Create every route so the guard can never redirect to a non-existent page. 17 domain pages (guarded, `layout: 'admin'`), 5 redirect-target pages (unguarded, `layout: false`), 3 redirects. Stubs render a heading only — real UI lands in later domain phases.

**Files:**
- Create (17 domain pages):
  `app/pages/dashboard.vue`, `app/pages/oidc-foundation.vue`, `app/pages/clients/index.vue`, `app/pages/clients/new.vue`, `app/pages/users/index.vue`, `app/pages/users/new.vue`, `app/pages/observability/index.vue`, `app/pages/observability/compliance.vue`, `app/pages/sessions.vue`, `app/pages/policy.vue`, `app/pages/sso-error-templates.vue`, `app/pages/external-idps.vue`, `app/pages/ip-access.vue`, `app/pages/ops.vue`, `app/pages/roles.vue`, `app/pages/authentication-audit.vue`, `app/pages/profile.vue`
- Create (5 redirect-target pages):
  `app/pages/forbidden.vue`, `app/pages/mfa-required.vue`, `app/pages/step-up-required.vue`, `app/pages/admin-error.vue`, `app/pages/admin-api-unreachable.vue`
- Create (3 redirect pages):
  `app/pages/index.vue`, `app/pages/audit/index.vue`, `app/pages/audit/compliance.vue`
- Test (create): `app/pages/__tests__/route-map.spec.ts`

**Interfaces:**
- Consumes: `definePageMeta` (Nuxt macro), page-meta augmentation (2a.5), guard middleware (2a.5), named routes `admin.observability` / `admin.observability.compliance` (targets of `/audit*`).
- Produces: the route table from spec §5 / `routing.md` — each domain page sets `definePageMeta({ name, layout: 'admin', requiresAdmin: true, permissions: [...] })`; each redirect-target page sets `definePageMeta({ name, layout: false })` (no `requiresAdmin`, so the guard allows it and recursion is impossible); redirect pages `navigateTo` their target in setup.

**Domain page meta (one stub each — identical body, differing meta):**

| Page file | `name` | `permissions` |
|---|---|---|
| `pages/dashboard.vue` | `admin.dashboard` | `['admin.dashboard.view']` |
| `pages/oidc-foundation.vue` | `admin.oidc-foundation` | `['admin.dashboard.view']` |
| `pages/clients/index.vue` | `admin.clients` | `['admin.clients.read']` |
| `pages/clients/new.vue` | `admin.clients.create` | `['admin.clients.write']` |
| `pages/users/index.vue` | `admin.users` | `['admin.users.read']` |
| `pages/users/new.vue` | `admin.users.create` | `['admin.users.write']` |
| `pages/observability/index.vue` | `admin.observability` | `['admin.observability.read']` |
| `pages/observability/compliance.vue` | `admin.observability.compliance` | `['admin.observability.read']` |
| `pages/sessions.vue` | `admin.sessions` | `['admin.sessions.terminate']` |
| `pages/policy.vue` | `admin.policy` | `['admin.security-policy.read']` |
| `pages/sso-error-templates.vue` | `admin.sso-error-templates` | `['admin.security-policy.read']` |
| `pages/external-idps.vue` | `admin.external-idps` | `['admin.external-idps.read']` |
| `pages/ip-access.vue` | `admin.ip-access` | `['admin.ip-access.read']` |
| `pages/ops.vue` | `admin.ops` | `['admin.dashboard.view']` |
| `pages/roles.vue` | `admin.roles` | `['admin.roles.read']` |
| `pages/authentication-audit.vue` | `admin.authentication-audit` | `['admin.authentication-audit.read']` |
| `pages/profile.vue` | `admin.profile` | `['profile.read']` |

**Redirect-target page meta (unguarded):**

| Page file | `name` | heading |
|---|---|---|
| `pages/forbidden.vue` | `admin.forbidden` | `Access denied` |
| `pages/mfa-required.vue` | `admin.mfa-required` | `Multi-factor enrollment required` |
| `pages/step-up-required.vue` | `admin.step-up-required` | `Step-up authentication required` |
| `pages/admin-error.vue` | `admin.error` | `Something went wrong` |
| `pages/admin-api-unreachable.vue` | `admin.api-unreachable` | `Admin API unreachable` |

**Steps:**

1. [ ] Write failing test `app/pages/__tests__/route-map.spec.ts` (data-driven; validates every file exists with the exact meta — no Nuxt runtime needed):

   ```ts
   import { existsSync, readFileSync } from 'node:fs'
   import { fileURLToPath } from 'node:url'
   import { describe, expect, it } from 'vitest'

   const pagesDir = fileURLToPath(new URL('../', import.meta.url))
   const read = (rel: string): string => readFileSync(`${pagesDir}${rel}`, 'utf8')

   const domainPages: ReadonlyArray<{ file: string; name: string; permissions: readonly string[] }> = [
     { file: 'dashboard.vue', name: 'admin.dashboard', permissions: ['admin.dashboard.view'] },
     { file: 'oidc-foundation.vue', name: 'admin.oidc-foundation', permissions: ['admin.dashboard.view'] },
     { file: 'clients/index.vue', name: 'admin.clients', permissions: ['admin.clients.read'] },
     { file: 'clients/new.vue', name: 'admin.clients.create', permissions: ['admin.clients.write'] },
     { file: 'users/index.vue', name: 'admin.users', permissions: ['admin.users.read'] },
     { file: 'users/new.vue', name: 'admin.users.create', permissions: ['admin.users.write'] },
     { file: 'observability/index.vue', name: 'admin.observability', permissions: ['admin.observability.read'] },
     { file: 'observability/compliance.vue', name: 'admin.observability.compliance', permissions: ['admin.observability.read'] },
     { file: 'sessions.vue', name: 'admin.sessions', permissions: ['admin.sessions.terminate'] },
     { file: 'policy.vue', name: 'admin.policy', permissions: ['admin.security-policy.read'] },
     { file: 'sso-error-templates.vue', name: 'admin.sso-error-templates', permissions: ['admin.security-policy.read'] },
     { file: 'external-idps.vue', name: 'admin.external-idps', permissions: ['admin.external-idps.read'] },
     { file: 'ip-access.vue', name: 'admin.ip-access', permissions: ['admin.ip-access.read'] },
     { file: 'ops.vue', name: 'admin.ops', permissions: ['admin.dashboard.view'] },
     { file: 'roles.vue', name: 'admin.roles', permissions: ['admin.roles.read'] },
     { file: 'authentication-audit.vue', name: 'admin.authentication-audit', permissions: ['admin.authentication-audit.read'] },
     { file: 'profile.vue', name: 'admin.profile', permissions: ['profile.read'] },
   ]

   const redirectTargets: ReadonlyArray<{ file: string; name: string }> = [
     { file: 'forbidden.vue', name: 'admin.forbidden' },
     { file: 'mfa-required.vue', name: 'admin.mfa-required' },
     { file: 'step-up-required.vue', name: 'admin.step-up-required' },
     { file: 'admin-error.vue', name: 'admin.error' },
     { file: 'admin-api-unreachable.vue', name: 'admin.api-unreachable' },
   ]

   describe('admin route map', () => {
     it.each(domainPages)('guards $name with admin role and its permissions', ({ file, name, permissions }) => {
       expect(existsSync(`${pagesDir}${file}`)).toBe(true)
       const src = read(file)
       expect(src).toContain('definePageMeta(')
       expect(src).toContain(`name: '${name}'`)
       expect(src).toContain('requiresAdmin: true')
       expect(src).toContain(`layout: 'admin'`)
       for (const permission of permissions) expect(src).toContain(`'${permission}'`)
     })

     it.each(redirectTargets)('exposes redirect target $name without admin gating', ({ file, name }) => {
       expect(existsSync(`${pagesDir}${file}`)).toBe(true)
       const src = read(file)
       expect(src).toContain(`name: '${name}'`)
       expect(src).toContain('layout: false')
       expect(src).not.toContain('requiresAdmin: true')
     })

     it('redirects /, /audit and /audit/compliance to their canonical routes', () => {
       expect(read('index.vue')).toContain(`navigateTo('/dashboard'`)
       expect(read('audit/index.vue')).toContain(`name: 'admin.observability'`)
       expect(read('audit/compliance.vue')).toContain(`name: 'admin.observability.compliance'`)
     })
   })
   ```

2. [ ] Run it — expect FAIL (no pages yet):
   `npx vitest run app/pages/__tests__/route-map.spec.ts`
   Expected: `Test Files  1 failed (1)` — every `existsSync(...) === true` assertion fails (`ENOENT`/`false`).

3. [ ] Implement the pages.

   **Domain page stub** — for each row in the domain table, create the file with this body, substituting `name` and `permissions` (example shown for `dashboard.vue`; repeat per table, e.g. nested files use the same pattern with their own meta):
   ```vue
   <script setup lang="ts">
   definePageMeta({
     name: 'admin.dashboard',
     layout: 'admin',
     requiresAdmin: true,
     permissions: ['admin.dashboard.view'],
   })
   </script>

   <template>
     <h1>Dashboard</h1>
   </template>
   ```
   Apply 1:1 to all 17 files. Headings (plain labels, no themed copy): Dashboard, OIDC foundation, Clients, New client, Users, New user, Observability, Compliance, Sessions, Security policy, SSO error templates, External IdPs, IP access, Operations, Roles, Authentication audit, Profile.

   **Redirect-target stub** — for each row in the redirect-target table (example `forbidden.vue`):
   ```vue
   <script setup lang="ts">
   definePageMeta({
     name: 'admin.forbidden',
     layout: false,
   })
   </script>

   <template>
     <h1>Access denied</h1>
   </template>
   ```
   Apply to all 5 with their `name` + heading from the redirect-target table.

   **Redirect pages:**

   `app/pages/index.vue`:
   ```vue
   <script setup lang="ts">
   definePageMeta({ name: 'admin.home', layout: false })
   await navigateTo('/dashboard', { replace: true })
   </script>

   <template>
     <div />
   </template>
   ```

   `app/pages/audit/index.vue`:
   ```vue
   <script setup lang="ts">
   definePageMeta({ name: 'admin.audit.redirect', layout: false })
   await navigateTo({ name: 'admin.observability' }, { replace: true })
   </script>

   <template>
     <div />
   </template>
   ```

   `app/pages/audit/compliance.vue`:
   ```vue
   <script setup lang="ts">
   definePageMeta({ name: 'admin.audit.compliance.redirect', layout: false })
   await navigateTo({ name: 'admin.observability.compliance' }, { replace: true })
   </script>

   <template>
     <div />
   </template>
   ```

4. [ ] Run it — expect PASS:
   `npx vitest run app/pages/__tests__/route-map.spec.ts`
   Expected: `Test Files  1 passed (1)` / `Tests  23 passed (23)` (17 domain + 5 redirect-target + 1 redirects).

5. [ ] Commit:
   ```bash
   git add app/pages app/pages/__tests__/route-map.spec.ts
   git commit -m "feat(sso-admin-frontend): create guarded stub pages for the full route map

   17 domain pages carry definePageMeta name+requiresAdmin+permissions per spec
   section 5; 5 redirect targets (forbidden/mfa-required/step-up-required/
   admin-error/admin-api-unreachable) stay unguarded; /, /audit and
   /audit/compliance redirect to their canonical routes. Stubs render a heading
   only so the guard can never route to a missing page.

   Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
   ```

---

### Task 2a.7: `layouts/admin.vue` (sidebar nav from principal menus + topbar)

**Files:**
- Create: `app/layouts/admin.vue`
- Modify: `app/app.vue` (ensure it renders `<NuxtLayout><NuxtPage /></NuxtLayout>` so named layouts apply — Phase 0 scaffold; add if missing)
- Test (create): `app/layouts/__tests__/admin-layout.spec.ts`

**Interfaces:**
- Consumes: `useSessionStore` (2a.4); `AdminPermissionMenu` (2a.4); Nuxt `NuxtLink`, `ClientOnly` (auto); `SsoAccountBar` (2a.8, auto-imported component); `<slot />` (Nuxt layout content).
- Produces: the admin shell — a sidebar that renders one `NuxtLink` per **visible** principal menu (`session.principal.permissions.menus` filtered by `visible`), a sign-out link to the same-origin BFF (`/auth/logout`), and a topbar whose account region mounts `<ClientOnly><SsoAccountBar /></ClientOnly>` (browser-only credentialed widget — see 2a.8). Menu→path mapping ports the SPA: `dashboard → /dashboard`, `oidc-foundation → /oidc-foundation`, `audit → /observability`, else `/${id}`.
- **Scope:** plumbing only — structure + nav binding. Swiss tokens/styling, pill animation, search, locale/theme controls land in Phase 2b. No fabricated nav data; menus come from the backend principal.

**Steps:**

1. [ ] Write failing test `app/layouts/__tests__/admin-layout.spec.ts`:

   ```ts
   import { beforeEach, describe, expect, it, vi } from 'vitest'
   import { ref } from 'vue'
   import { mount } from '@vue/test-utils'
   import { createPinia, setActivePinia } from 'pinia'
   import AdminLayout from '../admin.vue'
   import { useSessionStore } from '@/stores/session.store'
   import type { AdminPrincipal } from '@/types/auth.types'

   function principal(): AdminPrincipal {
     return {
       subject_id: 'sub_admin',
       email: 'admin@dev-sso.local',
       display_name: 'Admin User',
       role: 'admin',
       last_login_at: null,
       auth_context: { auth_time: null, amr: [], acr: null, mfa_enforced: true, mfa_verified: true },
       permissions: {
         view_admin_panel: true,
         manage_sessions: true,
         permissions: [],
         capabilities: {},
         menus: [
           { id: 'dashboard', label: 'Dashboard', required_permission: 'admin.dashboard.view', visible: true },
           { id: 'audit', label: 'Audit', required_permission: 'admin.observability.read', visible: true },
           { id: 'roles', label: 'Roles', required_permission: 'admin.roles.read', visible: false },
         ],
       },
     }
   }

   const stubs = {
     NuxtLink: { props: ['to'], template: '<a :href="String(to)" :data-to="String(to)"><slot /></a>' },
     ClientOnly: { template: '<div><slot /></div>' },
     SsoAccountBar: { template: '<div data-testid="sso-account-bar" />' },
   }

   describe('admin layout', () => {
     beforeEach(() => {
       setActivePinia(createPinia())
       vi.stubGlobal('useState', <T,>(_key: string, init: () => T) => ref(init()))
     })

     it('renders a nav link per visible principal menu and maps audit to /observability', () => {
       useSessionStore().setPrincipal(principal())
       const wrapper = mount(AdminLayout, { global: { stubs }, slots: { default: 'PAGE' } })

       const links = wrapper.findAll('[data-menu-id]')
       expect(links).toHaveLength(2) // hidden 'roles' menu excluded
       expect(wrapper.get('[data-menu-id="dashboard"]').attributes('data-to')).toBe('/dashboard')
       expect(wrapper.get('[data-menu-id="audit"]').attributes('data-to')).toBe('/observability')
     })

     it('renders the topbar, the page slot, and a same-origin sign-out link', () => {
       useSessionStore().setPrincipal(principal())
       const wrapper = mount(AdminLayout, { global: { stubs }, slots: { default: 'PAGE' } })

       expect(wrapper.get('[data-testid="admin-topbar"]').exists()).toBe(true)
       expect(wrapper.text()).toContain('PAGE')
       expect(wrapper.get('a.admin-logout').attributes('href')).toBe('/auth/logout')
       expect(wrapper.find('[data-testid="sso-account-bar"]').exists()).toBe(true)
     })

     it('renders no nav links when there is no principal yet', () => {
       const wrapper = mount(AdminLayout, { global: { stubs }, slots: { default: 'PAGE' } })
       expect(wrapper.findAll('[data-menu-id]')).toHaveLength(0)
     })
   })
   ```

2. [ ] Run it — expect FAIL (layout not created):
   `npx vitest run app/layouts/__tests__/admin-layout.spec.ts`
   Expected: `FAIL ... Error: Failed to load url ../admin.vue` — `Test Files  1 failed (1)`.

3. [ ] Implement.

   `app/layouts/admin.vue`:
   ```vue
   <script setup lang="ts">
   import { computed } from 'vue'
   import { useSessionStore } from '@/stores/session.store'
   import type { AdminPermissionMenu } from '@/types/auth.types'

   const session = useSessionStore()

   const visibleMenus = computed<readonly AdminPermissionMenu[]>(() =>
     (session.principal?.permissions.menus ?? []).filter((menu) => menu.visible),
   )

   function menuPath(menu: AdminPermissionMenu): string {
     if (menu.id === 'dashboard') return '/dashboard'
     if (menu.id === 'oidc-foundation') return '/oidc-foundation'
     if (menu.id === 'audit') return '/observability'
     return `/${menu.id}`
   }
   </script>

   <template>
     <div class="admin-shell">
       <aside class="admin-sidebar" aria-label="Admin navigation">
         <p class="admin-brand">SSO Control Plane</p>
         <nav class="admin-nav" aria-label="Admin modules">
           <NuxtLink
             v-for="menu in visibleMenus"
             :key="menu.id"
             class="admin-nav__link"
             :data-menu-id="menu.id"
             :to="menuPath(menu)"
           >
             {{ menu.label }}
           </NuxtLink>
         </nav>
         <!-- Same-origin BFF logout: revokes tokens + clears the session cookie.
              Must stay same-origin — pointing elsewhere leaves this session intact. -->
         <a class="admin-logout" href="/auth/logout">Sign out</a>
       </aside>

       <div class="admin-main-column">
         <header class="admin-topbar" data-testid="admin-topbar">
           <p class="admin-topbar__brand">Admin</p>
           <div class="admin-topbar__actions">
             <!-- The credentialed account widget is browser-only (see Task 2a.8). -->
             <ClientOnly>
               <SsoAccountBar v-if="session.principal" />
             </ClientOnly>
           </div>
         </header>

         <main id="admin-main" class="admin-content" tabindex="-1">
           <slot />
         </main>
       </div>
     </div>
   </template>

   <style scoped>
   .admin-shell {
     display: grid;
     grid-template-columns: 264px 1fr;
     min-height: 100vh;
   }
   .admin-sidebar {
     display: flex;
     flex-direction: column;
     gap: 8px;
     padding: 16px;
     border-right: 1px solid var(--border, #e5e5e7);
   }
   .admin-nav {
     display: flex;
     flex-direction: column;
     gap: 2px;
     flex: 1;
   }
   .admin-nav__link {
     padding: 8px 10px;
     color: inherit;
     text-decoration: none;
   }
   .admin-logout {
     margin-top: auto;
     padding: 8px 10px;
     color: inherit;
   }
   .admin-topbar {
     display: flex;
     align-items: center;
     justify-content: space-between;
     height: 64px;
     padding: 0 24px;
     border-bottom: 1px solid var(--border, #e5e5e7);
   }
   .admin-content {
     padding: 24px;
   }
   </style>
   ```

   `app/app.vue` (confirm/ensure Phase 0 scaffold renders named layouts):
   ```vue
   <template>
     <NuxtLayout>
       <NuxtPage />
     </NuxtLayout>
   </template>
   ```

4. [ ] Run it — expect PASS:
   `npx vitest run app/layouts/__tests__/admin-layout.spec.ts`
   Expected: `Test Files  1 passed (1)` / `Tests  3 passed (3)`.

5. [ ] Commit:
   ```bash
   git add app/layouts/admin.vue app/app.vue app/layouts/__tests__/admin-layout.spec.ts
   git commit -m "feat(sso-admin-frontend): add admin layout shell

   Sidebar renders one link per visible principal menu (audit->/observability),
   a same-origin BFF sign-out link, and a topbar whose account region mounts the
   credentialed widget under ClientOnly. Plumbing only; Swiss styling lands in 2b.

   Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
   ```

---

### Task 2a.8: Account widget — byte-identical composable, ported API, `<ClientOnly>` SSR safety

The credentialed account widget must never execute during SSR and its data must never enter the SSR payload. `useSsoAccountBar.ts` stays **byte-identical** with the portal copy; `SsoAccountBar.vue` is admin-owned (no portal byte-compare); `sso-account-widget.api.ts` is ported off `getAdminEnvironment()` onto `useRuntimeConfig().public.ssoWidgetBaseUrl`.

**Files:**
- Create (verbatim copy): `app/composables/useSsoAccountBar.ts`
- Create (verbatim copy): `app/components/SsoAccountBar.vue`
- Create (ported): `app/services/sso-account-widget.api.ts`
- Test (create): `app/composables/__tests__/useSsoAccountBar.invariant.spec.ts`
- Test (create): `app/services/__tests__/sso-account-widget.api.spec.ts`
- Test (create): `app/components/__tests__/sso-account-bar.ssr.spec.ts`

**Interfaces:**
- Consumes: `ssoAccountWidgetApi`, `safeWidgetAppUrl`, `SsoWidgetApp`, `SsoWidgetAccount` from `@/services/sso-account-widget.api`; `useSessionStore` (2a.4); Nuxt `useRuntimeConfig`, `ClientOnly`; `vue/server-renderer` `renderToString`.
- Produces:
  - `app/composables/useSsoAccountBar.ts` — **byte-identical** with `services/sso-frontend/src/composables/useSsoAccountBar.ts` (asserted via `Buffer.equals`). Its only import is `@/services/sso-account-widget.api`, whose public surface is preserved by the port, so the composable copies over unchanged.
  - `app/components/SsoAccountBar.vue` — verbatim copy of the SPA component (admin-only; it already targets `{ name: 'admin.profile' }`, which Task 2a.6 defines; `import { RouterLink } from 'vue-router'` works under Nuxt).
  - `app/services/sso-account-widget.api.ts` — SPA widget API with `resolveWidgetBaseUrl()` rewired to `useRuntimeConfig().public.ssoWidgetBaseUrl` (drops the `getAdminEnvironment` import). All other exports (`ssoAccountWidgetApi`, `safeWidgetAppUrl`, types, `widgetFetch`) unchanged — same-origin `/widget/*` credentialed fetch, `credentials: 'include'`.
- **SSR invariant:** all data-fetching (`apps`/`accounts`/`switchAccount`/`logout`) is `fetch(..., { credentials: 'include' })` triggered only by user events; rendering, DOM listeners (`onMounted`), and `window.*` navigation are browser-only. Wrapping the component in `<ClientOnly>` keeps it out of the server render; the composable's state is plain `ref` (not `useState`), so widget data is structurally absent from the `__NUXT__` payload.

**Steps:**

1. [ ] Write the three failing tests.

   `app/composables/__tests__/useSsoAccountBar.invariant.spec.ts`:
   ```ts
   import { readFileSync } from 'node:fs'
   import { fileURLToPath } from 'node:url'
   import { describe, expect, it } from 'vitest'

   const adminPath = fileURLToPath(new URL('../useSsoAccountBar.ts', import.meta.url))
   const portalPath = fileURLToPath(
     new URL('../../../../sso-frontend/src/composables/useSsoAccountBar.ts', import.meta.url),
   )

   describe('account widget composable invariant', () => {
     it('keeps the admin composable byte-identical with the portal copy', () => {
       const admin = Buffer.from(readFileSync(adminPath))
       const portal = Buffer.from(readFileSync(portalPath))
       expect(admin.equals(portal)).toBe(true)
     })
   })
   ```

   `app/services/__tests__/sso-account-widget.api.spec.ts`:
   ```ts
   import { afterEach, describe, expect, it, vi } from 'vitest'
   import { resolveWidgetBaseUrl, safeWidgetAppUrl } from '../sso-account-widget.api'

   afterEach(() => vi.unstubAllGlobals())

   describe('sso-account-widget.api base URL', () => {
     it('reads the same-origin default and trims a trailing slash', () => {
       vi.stubGlobal('useRuntimeConfig', () => ({ public: { ssoWidgetBaseUrl: '' } }))
       expect(resolveWidgetBaseUrl()).toBe('')
       vi.stubGlobal('useRuntimeConfig', () => ({ public: { ssoWidgetBaseUrl: 'https://sso.test/' } }))
       expect(resolveWidgetBaseUrl()).toBe('https://sso.test')
     })

     it('rejects non-http(s) app URLs', () => {
       expect(safeWidgetAppUrl('https://app.test/x')).toBe('https://app.test/x')
       expect(safeWidgetAppUrl('javascript:alert(1)')).toBeNull()
     })
   })
   ```

   `app/components/__tests__/sso-account-bar.ssr.spec.ts`:
   ```ts
   import { describe, expect, it, vi } from 'vitest'
   import { createApp, defineComponent, h, ref } from 'vue'
   import { renderToString } from 'vue/server-renderer'
   import { createPinia, mount } from '@vue/test-utils'

   const widgetApi = { apps: vi.fn(), accounts: vi.fn(), switchAccount: vi.fn(), logout: vi.fn() }
   vi.mock('@/services/sso-account-widget.api', () => ({
     ssoAccountWidgetApi: widgetApi,
     safeWidgetAppUrl: (value: string) => value,
     resolveWidgetBaseUrl: () => '',
   }))
   vi.stubGlobal('useState', <T,>(_key: string, init: () => T) => ref(init()))

   const { useSessionStore } = await import('@/stores/session.store')
   const SsoAccountBar = (await import('../SsoAccountBar.vue')).default

   const PRINCIPAL = {
     subject_id: 'sub_admin', email: 'admin@dev-sso.local', display_name: 'Admin User', role: 'admin',
     last_login_at: null,
     auth_context: { auth_time: null, amr: [], acr: null, mfa_enforced: true, mfa_verified: true },
     permissions: { view_admin_panel: true, manage_sessions: true, permissions: [], capabilities: {}, menus: [] },
   } as const

   // ClientOnly behaving as the server does: it never renders its slot.
   const ClientOnlyServer = defineComponent({ setup: (_p, { slots }) => () => null })

   describe('SsoAccountBar SSR safety', () => {
     it('does not execute the credentialed widget or emit its data during SSR', async () => {
       const pinia = createPinia()
       const app = createApp(
         defineComponent({
           setup() {
             useSessionStore().setPrincipal({ ...PRINCIPAL })
             return () => h(ClientOnlyServer, () => h(SsoAccountBar))
           },
         }),
       )
       app.use(pinia)
       const html = await renderToString(app)

       expect(widgetApi.apps).not.toHaveBeenCalled()
       expect(widgetApi.accounts).not.toHaveBeenCalled()
       expect(html).not.toContain('sso-account-bar')
       expect(html).not.toContain('admin@dev-sso.local')
     })

     it('renders on the client without auto-fetching (fetch is event-driven only)', () => {
       const wrapper = mount(SsoAccountBar, {
         global: { plugins: [createPinia()], stubs: { RouterLink: true } },
       })
       expect(wrapper.find('[data-testid="sso-account-bar"]').exists()).toBe(true)
       expect(widgetApi.apps).not.toHaveBeenCalled()
       expect(widgetApi.accounts).not.toHaveBeenCalled()
     })
   })
   ```
   > Note: `createPinia` and `mount` are imported from `@vue/test-utils` (which re-exports the Pinia testing helpers used elsewhere in this repo); if Phase 0's setup pins a different import, use `import { createPinia } from 'pinia'` and `import { mount } from '@vue/test-utils'`.

2. [ ] Run them — expect FAIL (files not created):
   - `npx vitest run app/composables/__tests__/useSsoAccountBar.invariant.spec.ts` → `FAIL ... ENOENT ... app/composables/useSsoAccountBar.ts`
   - `npx vitest run app/services/__tests__/sso-account-widget.api.spec.ts` → `FAIL ... Failed to load url ../sso-account-widget.api`
   - `npx vitest run app/components/__tests__/sso-account-bar.ssr.spec.ts` → `FAIL ... Failed to load url ../SsoAccountBar.vue`

3. [ ] Implement.

   Copy the two byte-identical files verbatim:
   ```bash
   cp src/composables/useSsoAccountBar.ts app/composables/useSsoAccountBar.ts
   cp src/components/SsoAccountBar.vue app/components/SsoAccountBar.vue
   ```

   Create `app/services/sso-account-widget.api.ts` — SPA source with the base-URL resolver rewired (drop `import { getAdminEnvironment } ...`):
   ```ts
   export type SsoWidgetApp = {
     readonly client_id: string
     readonly display_name: string
     readonly app_base_url: string
     readonly category: string
   }

   export type SsoWidgetAccount = {
     readonly account_id: string | null
     readonly subject_id: string
     readonly display_name: string
     readonly email: string
     readonly status: 'active' | 'session_expired'
     readonly is_current: boolean
   }

   type AppsResponse = { readonly apps: readonly SsoWidgetApp[] }
   type AccountsResponse = { readonly accounts: readonly SsoWidgetAccount[] }
   type SwitchResponse = { readonly success: boolean; readonly error?: string; readonly login_url?: string }
   type LogoutResponse = { readonly success: boolean; readonly error?: string }

   export const ssoAccountWidgetApi = {
     async apps(): Promise<readonly SsoWidgetApp[]> {
       const response = await widgetFetch<AppsResponse>('/widget/apps')
       return response.apps
     },

     async accounts(): Promise<readonly SsoWidgetAccount[]> {
       const response = await widgetFetch<AccountsResponse>('/widget/accounts')
       return response.accounts
     },

     async switchAccount(accountId: string): Promise<SwitchResponse> {
       return widgetFetch<SwitchResponse>(
         '/widget/switch',
         {
           method: 'POST',
           headers: { 'Content-Type': 'application/json', 'X-SSO-Widget-Action': 'switch' },
           body: JSON.stringify({ account_id: accountId }),
         },
         true,
       )
     },

     async logout(): Promise<LogoutResponse> {
       return widgetFetch<LogoutResponse>(
         '/widget/logout',
         { method: 'POST', headers: { 'X-SSO-Widget-Action': 'logout' } },
         true,
       )
     },
   }

   export function safeWidgetAppUrl(value: string): string | null {
     try {
       const url = new URL(value)
       return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
     } catch {
       return null
     }
   }

   async function widgetFetch<T>(path: string, init: RequestInit = {}, acceptErrorPayload = false): Promise<T> {
     const response = await fetch(`${resolveWidgetBaseUrl()}${path}`, {
       ...init,
       credentials: 'include',
       headers: { Accept: 'application/json', ...init.headers },
     })

     const payload = (await response.json().catch(() => ({}))) as T
     if (!response.ok && acceptErrorPayload) return payload
     if (!response.ok) {
       const requestId = response.headers.get('x-request-id')
       throw new Error(requestId ? `sso_widget_request_failed:${requestId}` : 'sso_widget_request_failed')
     }
     return payload
   }

   /**
    * Resolve the base the credentialed account-widget endpoints live on.
    *
    * Default is SAME-ORIGIN: an empty base resolves `/widget/*` relative to the
    * admin origin. The admin BFF proxies those paths to the backend and holds the
    * host-only `__Host-sso_session` cookie minted first-party at the OIDC callback,
    * so the credentialed fetch is first-party and the cookie is always sent — no
    * cross-host `__Host-` problem, no CORS, no third-party-cookie dependency.
    *
    * `NUXT_PUBLIC_SSO_WIDGET_BASE_URL` remains a documented override for a
    * cross-origin front-door host; leave it unset for the same-origin default.
    */
   export function resolveWidgetBaseUrl(): string {
     return useRuntimeConfig().public.ssoWidgetBaseUrl.replace(/\/$/u, '')
   }
   ```

4. [ ] Run them — expect PASS:
   - `npx vitest run app/composables/__tests__/useSsoAccountBar.invariant.spec.ts` → `Tests  1 passed (1)`
   - `npx vitest run app/services/__tests__/sso-account-widget.api.spec.ts` → `Tests  2 passed (2)`
   - `npx vitest run app/components/__tests__/sso-account-bar.ssr.spec.ts` → `Tests  2 passed (2)`

5. [ ] Commit:
   ```bash
   git add app/composables/useSsoAccountBar.ts app/components/SsoAccountBar.vue app/services/sso-account-widget.api.ts app/composables/__tests__/useSsoAccountBar.invariant.spec.ts app/services/__tests__/sso-account-widget.api.spec.ts app/components/__tests__/sso-account-bar.ssr.spec.ts
   git commit -m "feat(sso-admin-frontend): mount account widget under ClientOnly

   Copy useSsoAccountBar.ts + SsoAccountBar.vue verbatim (composable stays
   byte-identical with the portal, asserted via Buffer.equals); rewire the widget
   API base URL onto runtimeConfig.public.ssoWidgetBaseUrl. An SSR test proves the
   credentialed widget never executes server-side and its data is absent from the
   rendered payload, while client mount renders without auto-fetching.

   Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
   ```

---

### Task 2a.9: Guard/permission matrix tests

Lock the access matrix end-to-end against the resolver: unauthenticated → login; non-admin → forbidden; admin-without-permission → forbidden; admin-with-permission → ok; backend-403-despite-UI → safe forbidden. This is the §9 "guard/permission matrix (per feature)" gate for the shell, mirroring the SPA `adminGuard.spec.ts` baseline against the new signatures.

**Files:**
- Test (create): `app/lib/auth/__tests__/guard-permission-matrix.spec.ts`

**Interfaces:**
- Consumes: `resolveLoadedAdminAccess`, `resolveBootstrapFailure`, `buildLoginUrl`, `BootstrapResolution` (2a.5); `useSessionStore` (2a.4); `RouteLocationNormalized` from `vue-router`; stubbed `useState`.
- Produces: no new source — a parity gate over the 2a.5 resolver + 2a.4 store. (Distinct from 2a.5's unit test, which checks pure-mapping + login-URL formatting; this asserts the role/permission **access** matrix using a loaded principal.)

**Steps:**

1. [ ] Write failing test `app/lib/auth/__tests__/guard-permission-matrix.spec.ts`:

   ```ts
   import { beforeEach, describe, expect, it, vi } from 'vitest'
   import { ref } from 'vue'
   import type { RouteLocationNormalized } from 'vue-router'
   import { createPinia, setActivePinia } from 'pinia'
   import { resolveBootstrapFailure, resolveLoadedAdminAccess } from '../admin-guard-resolver'
   import { useSessionStore } from '@/stores/session.store'
   import type { AdminPrincipal } from '@/types/auth.types'

   const ORIGIN = 'https://sso.test'
   const BASE = '/__vue-preview'

   function principal(overrides: Partial<AdminPrincipal> = {}): AdminPrincipal {
     return {
       subject_id: 'sub_admin',
       email: 'admin@dev-sso.local',
       display_name: 'Admin User',
       role: 'admin',
       last_login_at: null,
       auth_context: { auth_time: null, amr: [], acr: null, mfa_enforced: true, mfa_verified: true },
       permissions: {
         view_admin_panel: true,
         manage_sessions: false,
         permissions: ['admin.dashboard.view'],
         capabilities: { 'admin.dashboard.view': true },
         menus: [],
       },
       ...overrides,
     }
   }

   function route(meta: Record<string, unknown> = { requiresAdmin: true }): RouteLocationNormalized {
     return {
       fullPath: '/dashboard', path: '/dashboard', query: {}, hash: '', name: 'admin.dashboard',
       params: {}, matched: [], redirectedFrom: undefined, meta,
     } as unknown as RouteLocationNormalized
   }

   describe('admin guard/permission matrix', () => {
     beforeEach(() => {
       setActivePinia(createPinia())
       vi.stubGlobal('useState', <T,>(_key: string, init: () => T) => ref(init()))
     })

     it('unauthenticated -> same-origin login redirect', () => {
       expect(resolveBootstrapFailure('unauthenticated', '/dashboard', ORIGIN, BASE)).toEqual({
         kind: 'login',
         url: 'https://sso.test/auth/login?return_to=%2F__vue-preview%2Fdashboard',
       })
     })

     it('non-admin authenticated user -> forbidden', () => {
       useSessionStore().setPrincipal(
         principal({ role: 'user', permissions: { view_admin_panel: false, manage_sessions: false, permissions: [], capabilities: {}, menus: [] } }),
       )
       expect(
         resolveLoadedAdminAccess(route({ requiresAdmin: true, permissions: ['admin.dashboard.view'] })),
       ).toEqual({ name: 'admin.forbidden' })
     })

     it('admin without the required permission -> forbidden', () => {
       useSessionStore().setPrincipal(
         principal({ permissions: { view_admin_panel: true, manage_sessions: false, permissions: [], capabilities: { 'admin.dashboard.view': false }, menus: [] } }),
       )
       expect(
         resolveLoadedAdminAccess(route({ requiresAdmin: true, permissions: ['admin.dashboard.view'] })),
       ).toEqual({ name: 'admin.forbidden' })
     })

     it('admin with the required permission -> allow', () => {
       useSessionStore().setPrincipal(principal())
       expect(
         resolveLoadedAdminAccess(route({ requiresAdmin: true, permissions: ['admin.dashboard.view'] })),
       ).toBe(true)
     })

     it('backend 403 despite a permissive UI -> safe forbidden route', () => {
       // The frontend may have allowed render, but a bootstrap that came back 403
       // must still resolve to the safe forbidden view (backend stays authoritative).
       expect(resolveBootstrapFailure('forbidden', '/dashboard', ORIGIN, BASE)).toEqual({
         kind: 'route',
         to: { name: 'admin.forbidden' },
       })
     })

     it('non-admin routes are always allowed without a principal', () => {
       expect(resolveLoadedAdminAccess(route({}))).toBe(true)
     })
   })
   ```

2. [ ] Run it — expect FAIL (test newly added; assertions exercise resolver behavior — confirm honest RED by temporarily running against an empty file or before the import resolves). Concretely, run before writing the assertions' fixtures is unnecessary; the genuine RED here is the missing test file producing no run:
   `npx vitest run app/lib/auth/__tests__/guard-permission-matrix.spec.ts`
   Expected (first run, file present but resolver behavior verified): all six cases must pass against the 2a.5 implementation. To honor honest test-first, author the spec FIRST and run it against a deliberately-broken resolver stub (e.g. temporarily make `resolveBootstrapFailure` return `{ kind: 'allow' }` for `'unauthenticated'`); confirm `1 failed` ("expected { kind: 'allow' } to deeply equal { kind: 'login', ... }"), then restore the real resolver.
   Expected RED: `Tests  1 failed | 5 passed (6)`.

3. [ ] Restore the real resolver (revert the deliberate break from step 2) — no production code changes are needed beyond 2a.5; this task adds the matrix gate only.

4. [ ] Run it — expect PASS:
   `npx vitest run app/lib/auth/__tests__/guard-permission-matrix.spec.ts`
   Expected: `Test Files  1 passed (1)` / `Tests  6 passed (6)`.

5. [ ] Commit:
   ```bash
   git add app/lib/auth/__tests__/guard-permission-matrix.spec.ts
   git commit -m "test(sso-admin-frontend): lock the admin guard permission matrix

   End-to-end matrix over the SSR guard resolver: unauthenticated->login,
   non-admin->forbidden, admin-without-permission->forbidden,
   admin-with-permission->allow, backend-403->safe forbidden.

   Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
   ```

---

## Phase 2a exit gate

After 2a.9, run the full verification suite once (report blocked commands explicitly; never claim PASS without output):

```bash
npm run typecheck && npm run lint && npm run format:check && npm run test
```

Then request `/code-review` on the diff, calling out the two flagged adaptations: (1) `api-client` on `baseFetch().raw(...)` and (2) the SSR-blocking guard middleware with a pure `resolveBootstrapFailure`. Domain UI, Swiss tokens/components, and the SSR token-leak crown-jewel gate (Task 2c.1) are out of scope for Phase 2a.

# Phase 2b — Swiss design system

# PHASE 2b — Swiss design system (Tasks 2b.1–2b.10)

Re-drafted to the Swiss anchor of `docs/design/sso-admin-frontend-nuxt4-ssr-swiss-redesign-technical-design.md` §7, obeying every applicable item in `/tmp/nuxtplan/FIXES.md` (§"Phase 2b"). Ports the ~25 UI components into the Nuxt `app/` srcDir, test-first, single accent `#002FA7`, red `#E4002B` wired only to danger/destructive, hairline borders (no soft shadows), sharp radii, one type family, FOLIO-GRID differentiator concentrated in Task 2b.6, and a widened verification gate in Task 2b.10.

## Conventions (apply to every task)

- **Target srcDir:** all paths are under `services/sso-admin-frontend/app/` (Nuxt 4 srcDir per design §4.1). The `@/` alias resolves to `app/` in the Nuxt-aware Vitest project configured in Phase 0. The legacy `src/` SPA copies stay untouched until the Phase 18 cutover.
- **Test runner:** Vitest 4 + `@vue/test-utils` 2 in `jsdom`. Every RED/GREEN step uses `npm run test:unit -- --run <path>` for a deterministic single pass (no watch). Expected PASS summary lines read `Test Files  1 passed (1)` / `Tests  N passed (N)`; expected RED lines are quoted verbatim per step.
- **Self-contained Swiss components:** every ported component carries its own `<style scoped>` referencing the tokens defined in Task 2b.1 — no dependency on the legacy 6567-line `src/assets/main.css`. No Tailwind utility classes inside Swiss component markup; class lists use Vue array/object binding (no `cn`/`@/lib/utils` dependency).
- **Content discipline:** standard labels + standard UI copy, Lucide icons only (`lucide-vue-next`), no unicode-glyph icons, no fabricated telemetry. Status is never colour-alone — every status surface pairs colour with a text label and a shape (dot/icon).
- **a11y bar (every component task):** a Vitest render test plus an a11y assertion — keyboard focus reachability/focus-visible affordance, and (for status surfaces) the colour-plus-label-plus-shape contract.
- **Prerequisites already delivered by earlier phases (consumed here, mocked in unit tests):** `app/composables/useI18n.ts` + `app/locales/{id,en}.json` (Phase 0), `app/services/sso-account-widget.api.ts` (`safeWidgetAppUrl`) and `app/config/adminEnvironment.ts` (`getAdminEnvironment`) (Phase 2a widget/config plumbing). Design-system-owned helpers (`app/lib/status-tone.ts`, `app/lib/display-identifiers.ts`, `app/components/ui/button.ts`) are CREATED inside the 2b task that first consumes them, with full code.
- **TDD mandatory, DRY/YAGNI:** write the failing test, run it (RED), write the minimal full implementation, run it (GREEN), commit. Conventional-commit subjects, each ending with the `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer.

---

### Task 2b.1: Swiss tokens — `app/assets/tokens.css`

**Files:**
- Create: `app/assets/tokens.css`
- Test: `app/assets/__tests__/tokens-contract.spec.ts`

**Interfaces:**
- Consumes: nothing (leaf stylesheet).
- Produces: the complete CSS custom-property contract every Swiss component references — surfaces (`--bg`/`--bg-2`/`--card`), ink (`--fg`/`--fg-2`/`--fg-3`), hairline (`--border`/`--border-strong`), single accent (`--accent`/`--accent-fg`/`--accent-600`/`--accent-soft`/`--accent-soft-fg`/`--accent-ring`), functional semantics (`--danger*`/`--success*`/`--warning*`/`--info*`), neutral hover surface (`--muted`/`--muted-2`), one type family (`--font-sans`) + `--font-mono` (raw IDs only), sharp radii (`--r-xs`..`--r-lg` + `--r-full` for circles), control height + layout dims, and a restrained dark inversion. Defines NO `--shadow-lg`/`--shadow-glass`/`--shadow-glow`/glow/`--brand-grad`.

Steps:

1. [ ] Write the failing contract test `app/assets/__tests__/tokens-contract.spec.ts`:
```ts
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const tokens = (): string =>
  readFileSync(fileURLToPath(new URL('../tokens.css', import.meta.url)), 'utf8')

describe('Swiss tokens.css contract', () => {
  it('anchors the single Swiss palette', () => {
    const css = tokens()
    expect(css).toMatch(/--accent:\s*#002FA7/i)
    expect(css).toMatch(/--danger:\s*#E4002B/i)
    expect(css).toMatch(/--bg:\s*#FFFFFF/i)
    expect(css).toMatch(/--bg-2:\s*#F7F7F8/i)
    expect(css).toMatch(/--card:\s*#FFFFFF/i)
    expect(css).toMatch(/--fg:\s*#0A0A0A/i)
    expect(css).toMatch(/--border:\s*#E5E5E7/i)
  })

  it('defines every neutral/accent-tint token components reference', () => {
    const css = tokens()
    for (const token of [
      '--fg-2',
      '--fg-3',
      '--border-strong',
      '--muted',
      '--muted-2',
      '--accent-fg',
      '--accent-600',
      '--accent-soft',
      '--accent-soft-fg',
      '--accent-ring',
      '--danger-fg',
      '--danger-soft',
      '--danger-soft-fg',
      '--success',
      '--success-soft',
      '--success-soft-fg',
      '--warning',
      '--warning-soft',
      '--warning-soft-fg',
      '--info',
      '--info-soft',
      '--info-soft-fg',
      '--r-sm',
      '--r-md',
      '--r-full',
      '--ctl-h',
      '--font-sans',
      '--font-mono',
    ]) {
      expect(css, `tokens.css must define ${token}`).toContain(`${token}:`)
    }
  })

  it('uses one type family (Söhne/Helvetica Neue), no serif display', () => {
    const css = tokens()
    expect(css).toMatch(/--font-sans:[^;]*Söhne/)
    expect(css).toMatch(/--font-sans:[^;]*Helvetica Neue/)
    expect(css).not.toMatch(/Plus Jakarta/i)
    expect(css).not.toMatch(/Instrument Serif/i)
    expect(css).not.toMatch(/--font-serif/)
    expect(css).not.toMatch(/serif\b/)
    expect(css).not.toMatch(/fonts\.googleapis\.com/)
  })

  it('bans soft-shadow, glass, glow and gradient brand tokens', () => {
    const css = tokens()
    for (const banned of [
      '--shadow-lg',
      '--shadow-glass',
      '--shadow-glow',
      '--brand-grad',
      '--glass-bg',
      'glow',
    ]) {
      expect(css, `tokens.css must not define ${banned}`).not.toContain(banned)
    }
  })

  it('keeps a single accent (no second brand colour token)', () => {
    const css = tokens()
    expect(css).not.toMatch(/--primary:/)
    expect(css).not.toMatch(/data-accent=/)
    expect(css).not.toMatch(/--avatar-/)
  })
})
```
2. [ ] Run it and confirm RED:
   - `cd services/sso-admin-frontend && npm run test:unit -- --run app/assets/__tests__/tokens-contract.spec.ts`
   - Expected: `FAIL` with `ENOENT: no such file or directory, open '.../app/assets/tokens.css'`.
3. [ ] Create `app/assets/tokens.css`:
```css
/* ============================================================================
   sso-admin-frontend · Swiss design tokens
   Single accent (Yves Klein Blue #002FA7). Red (#E4002B) is functional/
   destructive only. 1px hairline borders carry structure — no shadows.
   One type family; --font-mono reserved for raw IDs. Sharp radii (0–2px).
   ============================================================================ */

:root {
  /* ---- Type (one family; mono only for raw IDs/correlation values) ---- */
  --font-sans: 'Söhne', 'Helvetica Neue', Helvetica, Arial, sans-serif;
  --font-mono: 'Söhne Mono', ui-monospace, 'SF Mono', 'JetBrains Mono', monospace;

  /* ---- Radius (sharp) ---- */
  --r-xs: 0;
  --r-sm: 2px;
  --r-md: 2px;
  --r-lg: 2px;
  --r-full: 9999px; /* circular indicators only: status dots, avatars */

  /* ---- Surfaces ---- */
  --bg: #FFFFFF;
  --bg-2: #F7F7F8;
  --card: #FFFFFF;
  --muted: #F2F2F3;   /* hover surface */
  --muted-2: #EBEBED; /* pressed / nested surface */

  /* ---- Ink ---- */
  --fg: #0A0A0A;
  --fg-2: #4A4A4A;
  --fg-3: #767676;

  /* ---- Hairline borders ---- */
  --border: #E5E5E7;
  --border-strong: #D4D4D8;

  /* ---- Accent (single Swiss accent: interactive/brand) ---- */
  --accent: #002FA7;
  --accent-600: #00248C;     /* hover / active */
  --accent-fg: #FFFFFF;      /* text/icon on solid accent */
  --accent-soft: #EAEEF8;    /* accent tint surface (chip/selected row) */
  --accent-soft-fg: #002FA7; /* text/links on tint or plain */
  --accent-ring: #002FA7;    /* focus outline colour */

  /* ---- Functional semantics (state, never decoration) ---- */
  --danger: #E4002B;
  --danger-fg: #FFFFFF;
  --danger-soft: #FCE8EC;
  --danger-soft-fg: #B00020;
  --success: #1E7A46;
  --success-soft: #E7F2EC;
  --success-soft-fg: #156238;
  --warning: #9A6B00;
  --warning-soft: #FBF1DD;
  --warning-soft-fg: #7A5500;
  --info: #0B5FB0;
  --info-soft: #E6EFF8;
  --info-soft-fg: #0B4E8F;

  /* ---- Control + layout dimensions ---- */
  --ctl-h: 36px;
  --topbar-h: 56px;
  --sidebar-w: 256px;
  --sidebar-w-rail: 64px;
  --content-pad: 24px;
  --gap: 16px;
}

/* ============================================================================
   Restrained dark inversion — same hairline/grid language, status preserved.
   Active via <html class="dark"> or <html data-theme="dark">.
   ============================================================================ */
:root.dark,
:root[data-theme='dark'] {
  --bg: #0A0A0A;
  --bg-2: #141414;
  --card: #101010;
  --muted: #1A1A1A;
  --muted-2: #242424;

  --fg: #FAFAFA;
  --fg-2: #B4B4B4;
  --fg-3: #8A8A8A;

  --border: #262628;
  --border-strong: #3A3A3D;

  --accent: #5B82E0;
  --accent-600: #7196E8;
  --accent-fg: #0A0A0A;
  --accent-soft: #16213D;
  --accent-soft-fg: #9DB4F0;
  --accent-ring: #5B82E0;

  --danger: #FF5470;
  --danger-fg: #0A0A0A;
  --danger-soft: #3A1620;
  --danger-soft-fg: #FF8FA3;
  --success: #4FB07A;
  --success-soft: #122A1D;
  --success-soft-fg: #7FD3A1;
  --warning: #D9A53A;
  --warning-soft: #2E2410;
  --warning-soft-fg: #E6C173;
  --info: #5B9BE0;
  --info-soft: #11213A;
  --info-soft-fg: #9CC2EF;
}
```
4. [ ] Run the test and confirm GREEN:
   - `cd services/sso-admin-frontend && npm run test:unit -- --run app/assets/__tests__/tokens-contract.spec.ts`
   - Expected: `Test Files  1 passed (1)` / `Tests  5 passed (5)`.
5. [ ] Commit:
   - `git add app/assets/tokens.css app/assets/__tests__/tokens-contract.spec.ts`
   - `git commit -m "feat(sso-admin-frontend): rewrite tokens.css to the Swiss anchor" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"`

---

### Task 2b.2: Tailwind v4 mapping — `app/assets/main.css`

**Files:**
- Create: `app/assets/main.css`
- Test: `app/assets/__tests__/main-theme-mapping.spec.ts`

**Interfaces:**
- Consumes: every token from Task 2b.1.
- Produces: the Tailwind v4 `@theme inline` mapping (Swiss tokens → utility anchors: `--color-background`/`--color-foreground`/`--color-card`/`--color-primary`(=accent)/`--color-accent`(=accent)/`--color-destructive`(=danger)/`--color-border`/`--color-ring`/`--font-sans`/`--font-mono`/`--radius`), the `:root` bridge vars, base body/`.sr-only`/focus-visible defaults. Defines NO `--shadow-*` utility anchors and maps both `--color-primary` and `--color-accent` to the one `--accent` (single accent).

Steps:

1. [ ] Write the failing test `app/assets/__tests__/main-theme-mapping.spec.ts`:
```ts
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const main = (): string =>
  readFileSync(fileURLToPath(new URL('../main.css', import.meta.url)), 'utf8')

describe('Swiss main.css Tailwind mapping', () => {
  it('imports Tailwind v4 and the Swiss tokens', () => {
    const css = main()
    expect(css).toMatch(/@import\s+['"]tailwindcss['"]/)
    expect(css).toMatch(/@import\s+['"]\.\/tokens\.css['"]/)
    expect(css).toMatch(/@theme inline\s*\{/)
  })

  it('maps the single accent onto both primary and accent utility anchors', () => {
    const css = main()
    expect(css).toMatch(/--color-primary:\s*var\(--accent\)/)
    expect(css).toMatch(/--color-accent:\s*var\(--accent\)/)
    expect(css).toMatch(/--color-destructive:\s*var\(--danger\)/)
    expect(css).toMatch(/--color-border:\s*var\(--border\)/)
    expect(css).toMatch(/--color-ring:\s*var\(--accent-ring\)/)
    expect(css).toMatch(/--font-sans:\s*var\(--font-sans\)/)
  })

  it('declares no shadow utility anchors and no second accent', () => {
    const css = main()
    expect(css).not.toMatch(/--shadow-/)
    expect(css).not.toMatch(/--color-brand-/)
    expect(css).not.toMatch(/backdrop-filter/)
  })
})
```
2. [ ] Run it and confirm RED:
   - `cd services/sso-admin-frontend && npm run test:unit -- --run app/assets/__tests__/main-theme-mapping.spec.ts`
   - Expected: `FAIL` with `ENOENT: no such file or directory, open '.../app/assets/main.css'`.
3. [ ] Create `app/assets/main.css`:
```css
@import 'tailwindcss';
@import './tokens.css';

@custom-variant dark (&:is(.dark *));

/* Map Tailwind v4 utility anchors onto the Swiss tokens (tokens.css).
   Single accent: --color-primary and --color-accent both resolve to --accent.
   Red is wired only to --color-destructive. No shadow/brand-gradient anchors. */
@theme inline {
  --color-background: var(--bg);
  --color-foreground: var(--fg);
  --color-card: var(--card);
  --color-card-foreground: var(--fg);
  --color-popover: var(--card);
  --color-popover-foreground: var(--fg);
  --color-primary: var(--accent);
  --color-primary-foreground: var(--accent-fg);
  --color-secondary: var(--bg-2);
  --color-secondary-foreground: var(--fg);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--fg-2);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-fg);
  --color-destructive: var(--danger);
  --color-destructive-foreground: var(--danger-fg);
  --color-border: var(--border);
  --color-input: var(--border);
  --color-ring: var(--accent-ring);

  --color-success: var(--success);
  --color-warning: var(--warning);
  --color-info: var(--info);

  --radius-sm: var(--r-sm);
  --radius-md: var(--r-md);
  --radius-lg: var(--r-lg);

  --font-sans: var(--font-sans);
  --font-mono: var(--font-mono);

  --container-form: 48rem;
  --container-page: 80rem;
}

/* Bridge vars consumed by Reka UI primitives that read shadcn-style names. */
:root {
  --background: var(--bg);
  --foreground: var(--fg);
  --radius: var(--r-md);
  font-family: var(--font-sans);
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

* {
  box-sizing: border-box;
}

body {
  min-width: 320px;
  min-height: 100vh;
  margin: 0;
  color: var(--fg);
  background: var(--bg);
}

a {
  color: inherit;
}

button,
input,
textarea,
select {
  font: inherit;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  white-space: nowrap;
  border: 0;
  clip: rect(0, 0, 0, 0);
}

:where(a, button, input, select, textarea, [tabindex]):focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
```
4. [ ] Run the test and confirm GREEN:
   - `cd services/sso-admin-frontend && npm run test:unit -- --run app/assets/__tests__/main-theme-mapping.spec.ts`
   - Expected: `Test Files  1 passed (1)` / `Tests  3 passed (3)`.
5. [ ] Commit:
   - `git add app/assets/main.css app/assets/__tests__/main-theme-mapping.spec.ts`
   - `git commit -m "feat(sso-admin-frontend): map Swiss tokens onto Tailwind v4 theme" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"`

---

### Task 2b.3: Swiss form controls — button / input / select / switch / textarea

**Files:**
- Create: `app/components/ui/button.ts`
- Create: `app/components/ui/UiButton.vue`
- Create: `app/components/ui/UiInput.vue`
- Create: `app/components/ui/UiSelect.vue`
- Create: `app/components/ui/UiSwitch.vue`
- Create: `app/components/ui/UiTextarea.vue`
- Test: `app/components/ui/__tests__/swiss-controls.spec.ts`

**Interfaces:**
- Consumes: tokens from 2b.1; `class-variance-authority` (existing dep).
- Produces:
  - `buttonVariants(opts?: { variant?: 'primary'|'secondary'|'danger'|'ghost'; size?: 'sm'|'md'|'lg'|'icon' }): string`; `type ButtonVariants = VariantProps<typeof buttonVariants>`.
  - `UiButton` props `{ type?: 'button'|'submit'|'reset'; variant?: ButtonVariants['variant']; size?: ButtonVariants['size']; disabled?: boolean; class?: string }`, default slot.
  - `UiInput` props `{ modelValue: string; type?: string; disabled?: boolean; invalid?: boolean; class?: string }`, emits `update:modelValue(value: string)`.
  - `UiSelect` exports `type UiSelectOption = { value: string; label: string }`; props `{ modelValue: string; options: readonly UiSelectOption[]; disabled?: boolean; invalid?: boolean; class?: string }`, emits `update:modelValue(value: string)`.
  - `UiSwitch` props `{ modelValue: boolean; label: string; disabled?: boolean }`, emits `update:modelValue(value: boolean)`.
  - `UiTextarea` props `{ modelValue: string; rows?: number; disabled?: boolean; invalid?: boolean; class?: string }`, emits `update:modelValue(value: string)`.

Steps:

1. [ ] Write the failing test `app/components/ui/__tests__/swiss-controls.spec.ts`:
```ts
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import UiButton from '@/components/ui/UiButton.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import UiTextarea from '@/components/ui/UiTextarea.vue'

describe('Swiss form controls', () => {
  it('UiButton renders the Swiss variant class and stays keyboard focusable', () => {
    const wrapper = mount(UiButton, {
      props: { variant: 'danger', size: 'sm' },
      slots: { default: 'Delete' },
    })
    const btn = wrapper.get('button')
    expect(btn.classes()).toContain('ui-btn')
    expect(btn.classes()).toContain('ui-btn--danger')
    expect(btn.classes()).toContain('ui-btn--sm')
    expect(btn.attributes('type')).toBe('button')
    expect(btn.attributes('disabled')).toBeUndefined()
    expect(btn.text()).toBe('Delete')
  })

  it('UiInput emits the typed value and exposes aria-invalid only when invalid', async () => {
    const wrapper = mount(UiInput, { props: { modelValue: '', invalid: true } })
    const input = wrapper.get('input')
    expect(input.classes()).toContain('ui-input')
    expect(input.attributes('aria-invalid')).toBe('true')
    await input.setValue('admin@example.com')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['admin@example.com'])
  })

  it('UiSelect renders its options and emits the chosen value', async () => {
    const wrapper = mount(UiSelect, {
      props: {
        modelValue: 'id',
        options: [
          { value: 'id', label: 'Indonesia' },
          { value: 'en', label: 'English' },
        ],
      },
    })
    expect(wrapper.findAll('option')).toHaveLength(2)
    await wrapper.get('select').setValue('en')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['en'])
  })

  it('UiSwitch exposes switch semantics and toggles on click (a11y: role+aria-checked)', async () => {
    const wrapper = mount(UiSwitch, { props: { modelValue: false, label: 'Local account enabled' } })
    const sw = wrapper.get('[role="switch"]')
    expect(sw.attributes('aria-checked')).toBe('false')
    expect(sw.attributes('aria-label')).toBe('Local account enabled')
    expect(wrapper.find('.ui-switch__track').exists()).toBe(true)
    await sw.trigger('click')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([true])
  })

  it('UiTextarea forwards rows and emits the edited value', async () => {
    const wrapper = mount(UiTextarea, { props: { modelValue: '', rows: 6 } })
    const ta = wrapper.get('textarea')
    expect(ta.attributes('rows')).toBe('6')
    await ta.setValue('rotation reason')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['rotation reason'])
  })
})
```
2. [ ] Run it and confirm RED:
   - `cd services/sso-admin-frontend && npm run test:unit -- --run app/components/ui/__tests__/swiss-controls.spec.ts`
   - Expected: `FAIL` with `Failed to resolve import "@/components/ui/UiButton.vue"`.
3. [ ] Create `app/components/ui/button.ts`:
```ts
import { cva, type VariantProps } from 'class-variance-authority'

/** Swiss button variants — flat fills + 1px hairline borders, no shadows.
 *  Class names map to the scoped styles in UiButton.vue. */
export const buttonVariants = cva('ui-btn', {
  variants: {
    variant: {
      primary: 'ui-btn--primary',
      secondary: 'ui-btn--secondary',
      danger: 'ui-btn--danger',
      ghost: 'ui-btn--ghost',
    },
    size: {
      sm: 'ui-btn--sm',
      md: 'ui-btn--md',
      lg: 'ui-btn--lg',
      icon: 'ui-btn--icon',
    },
  },
  defaultVariants: { variant: 'primary', size: 'md' },
})

export type ButtonVariants = VariantProps<typeof buttonVariants>
```
4. [ ] Create `app/components/ui/UiButton.vue`:
```vue
<script setup lang="ts">
import { buttonVariants, type ButtonVariants } from './button'

interface Props {
  readonly type?: 'button' | 'submit' | 'reset'
  readonly variant?: ButtonVariants['variant']
  readonly size?: ButtonVariants['size']
  readonly disabled?: boolean
  readonly class?: string
}

const props = withDefaults(defineProps<Props>(), {
  type: 'button',
  variant: 'primary',
  size: 'md',
  disabled: false,
  class: undefined,
})
</script>

<template>
  <button
    :class="[buttonVariants({ variant: props.variant, size: props.size }), props.class]"
    :type="type"
    :disabled="disabled"
  >
    <slot />
  </button>
</template>

<style scoped>
.ui-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: var(--ctl-h);
  padding: 0 14px;
  font: 500 0.8125rem/1 var(--font-sans);
  color: var(--fg);
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  cursor: pointer;
  transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
}
.ui-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
.ui-btn:disabled {
  opacity: 0.5;
  pointer-events: none;
}
.ui-btn--primary {
  color: var(--accent-fg);
  background: var(--accent);
  border-color: var(--accent);
}
.ui-btn--primary:hover {
  background: var(--accent-600);
  border-color: var(--accent-600);
}
.ui-btn--secondary {
  color: var(--fg);
  background: var(--card);
  border-color: var(--border-strong);
}
.ui-btn--secondary:hover {
  background: var(--muted);
}
.ui-btn--danger {
  color: var(--danger-fg);
  background: var(--danger);
  border-color: var(--danger);
}
.ui-btn--danger:hover {
  background: var(--danger-soft-fg);
  border-color: var(--danger-soft-fg);
}
.ui-btn--ghost {
  color: var(--fg);
  background: transparent;
  border-color: transparent;
}
.ui-btn--ghost:hover {
  background: var(--muted);
}
.ui-btn--sm {
  min-height: 30px;
  padding: 0 10px;
  font-size: 0.75rem;
}
.ui-btn--md {
  min-height: var(--ctl-h);
}
.ui-btn--lg {
  min-height: 42px;
  padding: 0 18px;
}
.ui-btn--icon {
  width: var(--ctl-h);
  height: var(--ctl-h);
  padding: 0;
}
@media (prefers-reduced-motion: reduce) {
  .ui-btn {
    transition: none;
  }
}
</style>
```
5. [ ] Create `app/components/ui/UiInput.vue`:
```vue
<script setup lang="ts">
interface Props {
  readonly modelValue: string
  readonly type?: string
  readonly disabled?: boolean
  readonly invalid?: boolean
  readonly class?: string
}

const props = withDefaults(defineProps<Props>(), {
  type: 'text',
  disabled: false,
  invalid: false,
  class: undefined,
})

const emit = defineEmits<{ (event: 'update:modelValue', value: string): void }>()
</script>

<template>
  <input
    :class="['ui-input', { 'ui-input--invalid': invalid }, props.class]"
    :type="type"
    :value="modelValue"
    :disabled="disabled"
    :aria-invalid="invalid ? 'true' : undefined"
    @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
  />
</template>

<style scoped>
.ui-input {
  width: 100%;
  min-height: var(--ctl-h);
  padding: 0 10px;
  color: var(--fg);
  background: var(--card);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-sm);
  outline: none;
  transition: border-color 0.12s ease;
}
.ui-input::placeholder {
  color: var(--fg-3);
}
.ui-input:focus-visible {
  border-color: var(--accent);
  outline: 2px solid var(--accent);
  outline-offset: -1px;
}
.ui-input:disabled {
  opacity: 0.55;
}
.ui-input--invalid {
  border-color: var(--danger);
}
</style>
```
6. [ ] Create `app/components/ui/UiSelect.vue`:
```vue
<script setup lang="ts">
export type UiSelectOption = {
  readonly value: string
  readonly label: string
}

interface Props {
  readonly modelValue: string
  readonly options: readonly UiSelectOption[]
  readonly disabled?: boolean
  readonly invalid?: boolean
  readonly class?: string
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
  invalid: false,
  class: undefined,
})

const emit = defineEmits<{ (event: 'update:modelValue', value: string): void }>()
</script>

<template>
  <select
    :class="['ui-input', 'ui-select', { 'ui-input--invalid': invalid }, props.class]"
    :value="modelValue"
    :disabled="disabled"
    :aria-invalid="invalid ? 'true' : undefined"
    @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
  >
    <option v-for="option in options" :key="option.value" :value="option.value">
      {{ option.label }}
    </option>
  </select>
</template>

<style scoped>
.ui-input {
  width: 100%;
  min-height: var(--ctl-h);
  padding: 0 10px;
  color: var(--fg);
  background: var(--card);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-sm);
  outline: none;
  transition: border-color 0.12s ease;
}
.ui-input:focus-visible {
  border-color: var(--accent);
  outline: 2px solid var(--accent);
  outline-offset: -1px;
}
.ui-input:disabled {
  opacity: 0.55;
}
.ui-input--invalid {
  border-color: var(--danger);
}
.ui-select {
  appearance: none;
  padding-right: 32px;
  cursor: pointer;
  background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%234A4A4A' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e");
  background-repeat: no-repeat;
  background-position: right 10px center;
  background-size: 14px;
}
</style>
```
7. [ ] Create `app/components/ui/UiSwitch.vue`:
```vue
<script setup lang="ts">
interface Props {
  readonly modelValue: boolean
  readonly label: string
  readonly disabled?: boolean
}

withDefaults(defineProps<Props>(), {
  disabled: false,
})

const emit = defineEmits<{ (event: 'update:modelValue', value: boolean): void }>()
</script>

<template>
  <div class="ui-switch-wrapper" :class="{ 'ui-switch-wrapper--disabled': disabled }">
    <button
      class="ui-switch"
      :class="{ 'ui-switch--checked': modelValue }"
      type="button"
      role="switch"
      :aria-checked="modelValue"
      :aria-label="label"
      :disabled="disabled"
      @click="emit('update:modelValue', !modelValue)"
    >
      <span class="ui-switch__track" aria-hidden="true">
        <span class="ui-switch__thumb" />
      </span>
    </button>
    <span class="ui-switch__label" @click="!disabled && emit('update:modelValue', !modelValue)">
      {{ label }}
    </span>
  </div>
</template>

<style scoped>
.ui-switch-wrapper {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
}
.ui-switch-wrapper--disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.ui-switch {
  display: inline-flex;
  padding: 0;
  background: transparent;
  border: 0;
  cursor: pointer;
  flex-shrink: 0;
}
.ui-switch:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.ui-switch__track {
  display: flex;
  align-items: center;
  width: 34px;
  height: 18px;
  padding: 2px;
  background: var(--muted-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-full);
  transition: background 0.14s ease, border-color 0.14s ease;
}
.ui-switch__thumb {
  width: 12px;
  height: 12px;
  background: var(--card);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-full);
  transition: transform 0.14s ease;
}
.ui-switch--checked .ui-switch__track {
  background: var(--accent);
  border-color: var(--accent);
}
.ui-switch--checked .ui-switch__thumb {
  border-color: var(--accent);
  transform: translateX(16px);
}
.ui-switch__label {
  font: 500 0.8125rem/1.2 var(--font-sans);
  color: var(--fg);
  user-select: none;
}
@media (prefers-reduced-motion: reduce) {
  .ui-switch__track,
  .ui-switch__thumb {
    transition: none;
  }
}
</style>
```
8. [ ] Create `app/components/ui/UiTextarea.vue`:
```vue
<script setup lang="ts">
interface Props {
  readonly modelValue: string
  readonly rows?: number
  readonly disabled?: boolean
  readonly invalid?: boolean
  readonly class?: string
}

const props = withDefaults(defineProps<Props>(), {
  rows: 4,
  disabled: false,
  invalid: false,
  class: undefined,
})

const emit = defineEmits<{ (event: 'update:modelValue', value: string): void }>()
</script>

<template>
  <textarea
    :class="['ui-input', 'ui-textarea', { 'ui-input--invalid': invalid }, props.class]"
    :value="modelValue"
    :rows="rows"
    :disabled="disabled"
    :aria-invalid="invalid ? 'true' : undefined"
    @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
  />
</template>

<style scoped>
.ui-input {
  width: 100%;
  padding: 8px 10px;
  color: var(--fg);
  background: var(--card);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-sm);
  outline: none;
  transition: border-color 0.12s ease;
}
.ui-input:focus-visible {
  border-color: var(--accent);
  outline: 2px solid var(--accent);
  outline-offset: -1px;
}
.ui-input:disabled {
  opacity: 0.55;
}
.ui-input--invalid {
  border-color: var(--danger);
}
.ui-textarea {
  min-height: 88px;
  resize: vertical;
  line-height: 1.5;
}
</style>
```
9. [ ] Run the test and confirm GREEN:
   - `cd services/sso-admin-frontend && npm run test:unit -- --run app/components/ui/__tests__/swiss-controls.spec.ts`
   - Expected: `Test Files  1 passed (1)` / `Tests  5 passed (5)`.
10. [ ] Commit:
   - `git add app/components/ui/button.ts app/components/ui/UiButton.vue app/components/ui/UiInput.vue app/components/ui/UiSelect.vue app/components/ui/UiSwitch.vue app/components/ui/UiTextarea.vue app/components/ui/__tests__/swiss-controls.spec.ts`
   - `git commit -m "feat(sso-admin-frontend): port form controls to Swiss" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"`

---

### Task 2b.4: Swiss overlays — dialog / alert-dialog / confirm

**Files:**
- Create: `app/components/ui/UiDialog.vue`
- Create: `app/components/ui/UiAlertDialog.vue`
- Create: `app/components/ConfirmDialog.vue`
- Test: `app/components/__tests__/swiss-overlays.spec.ts`

**Interfaces:**
- Consumes: tokens from 2b.1; `reka-ui` (`Dialog*`, `AlertDialog*`, existing dep); `UiButton` from 2b.3; `lucide-vue-next` (`X`).
- Produces:
  - `UiDialog` props `{ open: boolean; titleId: string; title: string; description: string; closeLabel: string; overlayClass?: string; wide?: boolean }`, emits `close()`, default slot.
  - `UiAlertDialog` props `{ open: boolean; title: string; description: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean }`, emits `confirm()`, `cancel()`.
  - `ConfirmDialog` props `{ open: boolean; title: string; description: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean }`, emits `confirm()`, `cancel()` (self-managed focus trap, Escape + backdrop close, focus restore).
- Note: both Reka dialogs render their portal **inline** (`disabled`) — matching the existing `UiDialog` pattern — so the detail content stays queryable from the mounted wrapper and overlay stacking is controlled by Swiss `z-index`.

Steps:

1. [ ] Write the failing test `app/components/__tests__/swiss-overlays.spec.ts`:
```ts
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import UiDialog from '@/components/ui/UiDialog.vue'
import UiAlertDialog from '@/components/ui/UiAlertDialog.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('Swiss overlays', () => {
  it('UiDialog renders title + labelled close and emits close', async () => {
    const wrapper = mount(UiDialog, {
      props: {
        open: true,
        titleId: 'rotate',
        title: 'Rotate client secret',
        description: 'One-time secret display.',
        closeLabel: 'Close',
      },
      slots: { default: '<p>Body</p>' },
    })
    expect(wrapper.text()).toContain('Rotate client secret')
    const close = wrapper.get('[aria-label="Close"]')
    expect(close.find('svg').exists()).toBe(true)
    await close.trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('UiAlertDialog confirm/cancel buttons emit and danger sets the danger button', async () => {
    const wrapper = mount(UiAlertDialog, {
      props: {
        open: true,
        title: 'Delete user',
        description: 'This cannot be undone.',
        confirmLabel: 'Delete',
        danger: true,
      },
    })
    const confirm = wrapper.get('[data-testid="ui-alert-dialog-confirm"]')
    expect(confirm.classes()).toContain('ui-btn--danger')
    await wrapper.get('[data-testid="ui-alert-dialog-cancel"]').trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
    await confirm.trigger('click')
    expect(wrapper.emitted('confirm')).toHaveLength(1)
  })

  it('ConfirmDialog traps focus, closes on Escape and backdrop (a11y: role=dialog + focus)', async () => {
    const wrapper = mount(ConfirmDialog, {
      attachTo: document.body,
      props: { open: false, title: 'Revoke session', description: 'Force sign-out.' },
    })
    await wrapper.setProps({ open: true })
    await nextTick()
    const dialog = wrapper.get('[role="dialog"]')
    expect(dialog.attributes('aria-modal')).toBe('true')
    expect(document.activeElement).toBe(dialog.element)

    await dialog.trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('cancel')).toHaveLength(1)

    await wrapper.get('[data-testid="confirm-dialog-confirm"]').trigger('click')
    expect(wrapper.emitted('confirm')).toHaveLength(1)
  })
})
```
2. [ ] Run it and confirm RED:
   - `cd services/sso-admin-frontend && npm run test:unit -- --run app/components/__tests__/swiss-overlays.spec.ts`
   - Expected: `FAIL` with `Failed to resolve import "@/components/ui/UiDialog.vue"`.
3. [ ] Create `app/components/ui/UiDialog.vue`:
```vue
<script setup lang="ts">
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui'
import { X } from 'lucide-vue-next'

interface Props {
  readonly open: boolean
  readonly titleId: string
  readonly title: string
  readonly description: string
  readonly closeLabel: string
  readonly overlayClass?: string
  readonly wide?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  overlayClass: undefined,
  wide: false,
})
const emit = defineEmits<{ (event: 'close'): void }>()

function handleOpenChange(open: boolean): void {
  if (!open) emit('close')
}
</script>

<template>
  <DialogRoot :open="open" @update:open="handleOpenChange">
    <DialogPortal disabled>
      <DialogOverlay :class="['ui-modal-overlay', props.overlayClass]" />
      <DialogContent
        :class="['ui-modal', { 'ui-modal--wide': props.wide }]"
        :data-dialog-id="titleId"
      >
        <div class="ui-modal__header">
          <DialogTitle class="ui-modal__title">{{ title }}</DialogTitle>
          <DialogClose class="ui-modal__close" :aria-label="closeLabel">
            <X :size="18" aria-hidden="true" />
          </DialogClose>
        </div>
        <DialogDescription class="sr-only">{{ description }}</DialogDescription>
        <div class="ui-modal__body">
          <slot />
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped>
.ui-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1100;
  background: rgb(10 10 10 / 0.4);
}
.ui-modal {
  position: fixed;
  top: 50%;
  left: 50%;
  z-index: 1101;
  transform: translate(-50%, -50%);
  width: min(92vw, 32rem);
  max-height: 90vh;
  overflow: auto;
  padding: 20px;
  background: var(--card);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-md);
}
.ui-modal--wide {
  width: min(94vw, 48rem);
}
.ui-modal__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
}
.ui-modal__title {
  font: 600 1rem/1.2 var(--font-sans);
  letter-spacing: -0.01em;
  color: var(--fg);
}
.ui-modal__close {
  display: inline-grid;
  place-items: center;
  width: 30px;
  height: 30px;
  color: var(--fg-2);
  background: transparent;
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  cursor: pointer;
}
.ui-modal__close:hover {
  background: var(--muted);
  color: var(--fg);
}
.ui-modal__close:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
.ui-modal__body {
  padding-top: 16px;
}
</style>
```
4. [ ] Create `app/components/ui/UiAlertDialog.vue`:
```vue
<script setup lang="ts">
import {
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogRoot,
  AlertDialogTitle,
} from 'reka-ui'
import UiButton from './UiButton.vue'

interface Props {
  readonly open: boolean
  readonly title: string
  readonly description: string
  readonly confirmLabel?: string
  readonly cancelLabel?: string
  readonly danger?: boolean
}

withDefaults(defineProps<Props>(), {
  confirmLabel: 'Confirm',
  cancelLabel: 'Cancel',
  danger: true,
})

const emit = defineEmits<{ (event: 'confirm'): void; (event: 'cancel'): void }>()
</script>

<template>
  <AlertDialogRoot :open="open" @update:open="(value) => !value && emit('cancel')">
    <AlertDialogPortal disabled>
      <AlertDialogOverlay class="ui-alert-overlay" />
      <AlertDialogContent class="ui-alert">
        <AlertDialogTitle class="ui-alert__title">{{ title }}</AlertDialogTitle>
        <AlertDialogDescription class="ui-alert__desc">{{ description }}</AlertDialogDescription>
        <div class="ui-alert__actions">
          <AlertDialogCancel as-child>
            <UiButton data-testid="ui-alert-dialog-cancel" variant="secondary">
              {{ cancelLabel }}
            </UiButton>
          </AlertDialogCancel>
          <AlertDialogAction as-child @click="emit('confirm')">
            <UiButton
              data-testid="ui-alert-dialog-confirm"
              :variant="danger ? 'danger' : 'primary'"
            >
              {{ confirmLabel }}
            </UiButton>
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialogPortal>
  </AlertDialogRoot>
</template>

<style scoped>
.ui-alert-overlay {
  position: fixed;
  inset: 0;
  z-index: 1100;
  background: rgb(10 10 10 / 0.4);
}
.ui-alert {
  position: fixed;
  top: 50%;
  left: 50%;
  z-index: 1101;
  transform: translate(-50%, -50%);
  display: grid;
  gap: 14px;
  width: min(92vw, 32rem);
  padding: 20px;
  background: var(--card);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-md);
}
.ui-alert__title {
  font: 600 1rem/1.2 var(--font-sans);
  letter-spacing: -0.01em;
  color: var(--fg);
}
.ui-alert__desc {
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--fg-2);
}
.ui-alert__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 4px;
}
</style>
```
5. [ ] Create `app/components/ConfirmDialog.vue` (port the focus-trap/inert logic verbatim; restyle to Swiss; drop the themed eyebrow per content discipline):
```vue
<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

interface Props {
  readonly open: boolean
  readonly title: string
  readonly description: string
  readonly confirmLabel?: string
  readonly cancelLabel?: string
  readonly danger?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  confirmLabel: 'Confirm',
  cancelLabel: 'Cancel',
  danger: true,
})
const emit = defineEmits<{ (event: 'confirm'): void; (event: 'cancel'): void }>()

const backdropRef = ref<HTMLElement | null>(null)
const dialogRef = ref<HTMLElement | null>(null)
let triggerElement: HTMLElement | null = null
const inertElements: Array<{ element: HTMLElement; ariaHidden: string | null; inert: boolean }> = []

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

watch(
  () => props.open,
  async (open): Promise<void> => {
    if (!open) {
      restoreBackground()
      restoreTriggerFocus()
      return
    }
    triggerElement = document.activeElement instanceof HTMLElement ? document.activeElement : null
    await nextTick()
    inertBackground()
    dialogRef.value?.focus()
  },
)

onBeforeUnmount(() => {
  restoreBackground()
  restoreTriggerFocus()
})

function getFocusableElements(): HTMLElement[] {
  return Array.from(dialogRef.value?.querySelectorAll<HTMLElement>(focusableSelector) ?? []).filter(
    (element) => !element.hasAttribute('disabled') && element.tabIndex >= 0,
  )
}

function trapFocus(event: KeyboardEvent): void {
  if (event.key !== 'Tab') return
  const focusableElements = getFocusableElements()
  if (focusableElements.length === 0) {
    event.preventDefault()
    dialogRef.value?.focus()
    return
  }
  const firstElement = focusableElements[0]!
  const lastElement = focusableElements[focusableElements.length - 1]!
  const activeElement = document.activeElement
  if (event.shiftKey && activeElement === firstElement) {
    event.preventDefault()
    lastElement.focus()
    return
  }
  if (!event.shiftKey && activeElement === lastElement) {
    event.preventDefault()
    firstElement.focus()
    return
  }
  if (!dialogRef.value?.contains(activeElement)) {
    event.preventDefault()
    firstElement.focus()
  }
}

function inertBackground(): void {
  restoreBackground()
  const backdrop = backdropRef.value
  const parent = backdrop?.parentElement
  if (!backdrop || !parent) return
  Array.from(parent.children).forEach((child) => {
    if (child === backdrop || !(child instanceof HTMLElement)) return
    inertElements.push({
      element: child,
      ariaHidden: child.getAttribute('aria-hidden'),
      inert: child.inert === true,
    })
    child.inert = true
    child.setAttribute('aria-hidden', 'true')
  })
}

function restoreBackground(): void {
  while (inertElements.length > 0) {
    const previous = inertElements.pop()
    if (!previous) continue
    previous.element.inert = previous.inert
    if (previous.ariaHidden === null) {
      previous.element.removeAttribute('aria-hidden')
    } else {
      previous.element.setAttribute('aria-hidden', previous.ariaHidden)
    }
  }
}

function restoreTriggerFocus(): void {
  if (!triggerElement?.isConnected) {
    triggerElement = null
    return
  }
  triggerElement.focus()
  triggerElement = null
}

function confirm(): void {
  emit('confirm')
}

function cancel(): void {
  emit('cancel')
}
</script>

<template>
  <div v-if="open" ref="backdropRef" class="confirm-backdrop" @click.self="cancel">
    <section
      ref="dialogRef"
      class="confirm-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-description"
      tabindex="-1"
      @keydown.esc="cancel"
      @keydown.tab="trapFocus"
    >
      <h2 id="confirm-dialog-title" class="confirm-dialog__title">{{ title }}</h2>
      <p id="confirm-dialog-description" class="confirm-dialog__desc">{{ description }}</p>
      <div class="confirm-dialog__actions">
        <button
          data-testid="confirm-dialog-cancel"
          class="ui-btn ui-btn--secondary"
          type="button"
          @click="cancel"
        >
          {{ cancelLabel }}
        </button>
        <button
          data-testid="confirm-dialog-confirm"
          class="ui-btn"
          :class="danger ? 'ui-btn--danger' : 'ui-btn--primary'"
          type="button"
          @click="confirm"
        >
          {{ confirmLabel }}
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.confirm-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgb(10 10 10 / 0.4);
}
.confirm-dialog {
  width: min(460px, 100%);
  padding: 20px;
  background: var(--card);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-md);
}
.confirm-dialog:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.confirm-dialog__title {
  margin: 0 0 8px;
  font: 600 1rem/1.2 var(--font-sans);
  letter-spacing: -0.01em;
  color: var(--fg);
}
.confirm-dialog__desc {
  margin: 0;
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--fg-2);
}
.confirm-dialog__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 16px;
}
.ui-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: var(--ctl-h);
  padding: 0 14px;
  font: 500 0.8125rem/1 var(--font-sans);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  cursor: pointer;
}
.ui-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
.ui-btn--secondary {
  color: var(--fg);
  background: var(--card);
  border-color: var(--border-strong);
}
.ui-btn--secondary:hover {
  background: var(--muted);
}
.ui-btn--primary {
  color: var(--accent-fg);
  background: var(--accent);
  border-color: var(--accent);
}
.ui-btn--danger {
  color: var(--danger-fg);
  background: var(--danger);
  border-color: var(--danger);
}
</style>
```
6. [ ] Run the test and confirm GREEN:
   - `cd services/sso-admin-frontend && npm run test:unit -- --run app/components/__tests__/swiss-overlays.spec.ts`
   - Expected: `Test Files  1 passed (1)` / `Tests  3 passed (3)`.
7. [ ] Commit:
   - `git add app/components/ui/UiDialog.vue app/components/ui/UiAlertDialog.vue app/components/ConfirmDialog.vue app/components/__tests__/swiss-overlays.spec.ts`
   - `git commit -m "feat(sso-admin-frontend): port dialogs to Swiss" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"`

---

### Task 2b.5: Swiss status surfaces — status-badge / status-pill / status-view / empty-state / skeleton

**Files:**
- Create: `app/lib/status-tone.ts`
- Create: `app/lib/display-identifiers.ts`
- Create: `app/components/ui/UiStatusBadge.vue`
- Create: `app/components/StatusPill.vue`
- Create: `app/components/ui/UiStatusView.vue`
- Create: `app/components/ui/UiEmptyState.vue`
- Create: `app/components/ui/UiSkeleton.vue`
- Test: `app/components/__tests__/swiss-status.spec.ts`

**Interfaces:**
- Consumes: tokens from 2b.1; `lucide-vue-next`; `@/composables/useI18n` (mocked in test).
- Produces:
  - `resolveStatusTone(value: string|null|undefined): 'success'|'warning'|'danger'|'info'|'brand'|'neutral'`; `type StatusTone`.
  - Pure identifier helpers: `formatSupportReference`, `formatTechnicalPreview`, `formatFriendlyClientName`, `redactTechnicalIdentifiers` (slim port — no api-client/i18n coupling; transport-error helpers deferred to a domain phase).
  - `UiStatusBadge` props `{ status?: string|null; tone?: StatusTone; label?: string }` (dot + text label, never colour-alone).
  - `StatusPill` exports `type ReadinessState = 'ready'|'guarded'|'pending'`; props `{ state: ReadinessState }`.
  - `UiStatusView` props `{ tone: 'error'|'forbidden'|'step_up'|'api'; eyebrow: string; title: string; description: string; requestId?: string; standalone?: boolean }`, slot `actions`.
  - `UiEmptyState` props `{ title: string; description: string }`, slots `icon`, `action`.
  - `UiSkeleton` props `{ rows?: number; label?: string }`.

Steps:

1. [ ] Write the failing test `app/components/__tests__/swiss-status.spec.ts`:
```ts
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import StatusPill from '@/components/StatusPill.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'

vi.mock('@/composables/useI18n', () => ({
  useI18n: () => ({ t: (k: string) => k }),
}))

describe('Swiss status surfaces', () => {
  it('UiStatusBadge pairs colour with a dot and a text label (never colour-alone)', () => {
    const wrapper = mount(UiStatusBadge, { props: { status: 'active' } })
    expect(wrapper.get('.status').attributes('data-tone')).toBe('success')
    expect(wrapper.find('.status__dot').exists()).toBe(true)
    expect(wrapper.get('.status__label').text()).toBe('active')
  })

  it('StatusPill maps a readiness state to its standard label + tone', () => {
    const wrapper = mount(StatusPill, { props: { state: 'ready' } })
    expect(wrapper.text()).toBe('Ready')
    expect(wrapper.get('.status').attributes('data-tone')).toBe('brand')
  })

  it('UiStatusView renders the tone icon, redacts raw IDs and shows the support ref', () => {
    const wrapper = mount(UiStatusView, {
      props: {
        tone: 'forbidden',
        eyebrow: 'Forbidden',
        title: 'You do not have access',
        description: 'Trace 11111111-2222-4333-8444-555555555555 was rejected.',
        requestId: 'abcdef0123456789',
      },
    })
    expect(wrapper.get('[role="alert"]').exists()).toBe(true)
    expect(wrapper.find('svg').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('11111111-2222-4333-8444-555555555555')
    expect(wrapper.text()).toContain('REF-')
  })

  it('UiEmptyState shows title, description and an action slot', () => {
    const wrapper = mount(UiEmptyState, {
      props: { title: 'No audit events', description: 'Adjust filters and retry.' },
      slots: { action: '<button type="button">Refresh</button>' },
    })
    expect(wrapper.text()).toContain('No audit events')
    expect(wrapper.text()).toContain('Refresh')
  })

  it('UiSkeleton exposes a stable loading status region with N rows', () => {
    const wrapper = mount(UiSkeleton, { props: { rows: 3, label: 'Loading users' } })
    expect(wrapper.attributes('role')).toBe('status')
    expect(wrapper.attributes('aria-label')).toBe('Loading users')
    expect(wrapper.findAll('[data-testid="ui-skeleton-row"]')).toHaveLength(3)
  })
})
```
2. [ ] Run it and confirm RED:
   - `cd services/sso-admin-frontend && npm run test:unit -- --run app/components/__tests__/swiss-status.spec.ts`
   - Expected: `FAIL` with `Failed to resolve import "@/components/ui/UiStatusBadge.vue"`.
3. [ ] Create `app/lib/status-tone.ts` (verbatim port of the existing tone map):
```ts
export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'brand' | 'neutral'

const TONE_VALUES: ReadonlySet<string> = new Set([
  'success',
  'warning',
  'danger',
  'info',
  'brand',
  'neutral',
])

const ALIAS_TONE: Readonly<Record<string, StatusTone>> = {
  active: 'success',
  enabled: 'success',
  succeeded: 'success',
  success: 'success',
  allow: 'success',
  allowed: 'success',
  online: 'success',
  verified: 'success',
  pending: 'warning',
  staged: 'warning',
  warning: 'warning',
  expiring: 'warning',
  idle: 'warning',
  locked: 'danger',
  failed: 'danger',
  deny: 'danger',
  denied: 'danger',
  revoked: 'danger',
  error: 'danger',
  danger: 'danger',
  info: 'info',
  guarded: 'info',
  brand: 'brand',
  ready: 'brand',
  inactive: 'neutral',
  disabled: 'neutral',
  deactivated: 'neutral',
  unknown: 'neutral',
  neutral: 'neutral',
}

export function resolveStatusTone(value: string | null | undefined): StatusTone {
  if (!value) return 'neutral'
  const key = value.trim().toLowerCase()
  if (TONE_VALUES.has(key)) return key as StatusTone
  return ALIAS_TONE[key] ?? 'neutral'
}
```
4. [ ] Create `app/lib/display-identifiers.ts` (slim pure-function port — only the formatters the design system consumes):
```ts
const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/iu
const UUID_REDACTION_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/giu
const REQUEST_ID_PATTERN = /\b(?:request|correlation)\s+ID\s+([a-z0-9][a-z0-9_:.@/-]{5,127})/giu
const ACRONYM_LABELS: Readonly<Record<string, string>> = {
  api: 'API',
  mfa: 'MFA',
  oauth: 'OAuth',
  oidc: 'OIDC',
  rp: 'RP',
  sso: 'SSO',
}

export function formatSupportReference(value: string | null | undefined): string | null {
  const normalized = normalizeReference(value)
  if (!normalized) return null
  return `REF-${normalized.slice(-8)}`
}

export function formatTechnicalPreview(value: string | null | undefined): string {
  return formatSupportReference(value) ?? '-'
}

export function formatFriendlyClientName(value: string | null | undefined): string {
  const trimmed = value?.trim()
  if (!trimmed) return '-'
  if (UUID_PATTERN.test(trimmed)) return formatTechnicalPreview(trimmed)
  return trimmed
    .split(/[-_\s]+/u)
    .filter(Boolean)
    .map(humanizeIdentifierPart)
    .join(' ')
}

export function redactTechnicalIdentifiers(message: string): string {
  return message
    .replace(REQUEST_ID_PATTERN, (_match, id: string) => {
      const ref = formatSupportReference(id)
      return ref ? `support reference ${ref}` : 'support reference'
    })
    .replace(UUID_REDACTION_PATTERN, (id) => formatSupportReference(id) ?? 'REF-AVAILABLE')
}

function normalizeReference(value: string | null | undefined): string | null {
  const chars =
    value
      ?.trim()
      .match(/[a-z0-9]/giu)
      ?.join('')
      .toUpperCase() ?? ''
  return chars.length > 0 ? chars : null
}

function humanizeIdentifierPart(part: string): string {
  const acronym = ACRONYM_LABELS[part.toLowerCase()]
  if (acronym) return acronym
  return part.charAt(0).toUpperCase() + part.slice(1)
}
```
5. [ ] Create `app/components/ui/UiStatusBadge.vue`:
```vue
<script setup lang="ts">
import { computed } from 'vue'
import { resolveStatusTone, type StatusTone } from '@/lib/status-tone'

/** Swiss status badge: a sharp hairline rectangle pairing a tone dot (shape)
 *  with a real text label (never colour-alone). */
const props = defineProps<{
  readonly status?: string | null
  readonly tone?: StatusTone
  readonly label?: string
}>()

const resolvedTone = computed<StatusTone>(() => props.tone ?? resolveStatusTone(props.status))
const text = computed<string>(() => props.label ?? props.status ?? '—')
</script>

<template>
  <span class="status" :data-tone="resolvedTone">
    <span class="status__dot" aria-hidden="true"></span>
    <span class="status__label">{{ text }}</span>
  </span>
</template>

<style scoped>
.status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  font: 600 0.6875rem/1.4 var(--font-sans);
  letter-spacing: 0.02em;
  white-space: nowrap;
  color: var(--fg-2);
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
}
.status__dot {
  flex: 0 0 auto;
  width: 7px;
  height: 7px;
  background: currentColor;
  border-radius: var(--r-full);
}
.status[data-tone='success'] {
  color: var(--success-soft-fg);
  background: var(--success-soft);
  border-color: var(--success-soft-fg);
}
.status[data-tone='warning'] {
  color: var(--warning-soft-fg);
  background: var(--warning-soft);
  border-color: var(--warning-soft-fg);
}
.status[data-tone='danger'] {
  color: var(--danger-soft-fg);
  background: var(--danger-soft);
  border-color: var(--danger-soft-fg);
}
.status[data-tone='info'] {
  color: var(--info-soft-fg);
  background: var(--info-soft);
  border-color: var(--info-soft-fg);
}
.status[data-tone='brand'] {
  color: var(--accent-soft-fg);
  background: var(--accent-soft);
  border-color: var(--accent-soft-fg);
}
</style>
```
6. [ ] Create `app/components/StatusPill.vue`:
```vue
<script setup lang="ts">
import { computed } from 'vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import type { StatusTone } from '@/lib/status-tone'

/** Release-readiness states are owned here (design-system source of truth);
 *  the dashboard store imports this type rather than the reverse. */
export type ReadinessState = 'ready' | 'guarded' | 'pending'

const props = defineProps<{ state: ReadinessState }>()

const config = computed<{ label: string; tone: StatusTone }>(() => {
  switch (props.state) {
    case 'ready':
      return { label: 'Ready', tone: 'brand' }
    case 'guarded':
      return { label: 'Guarded', tone: 'warning' }
    case 'pending':
      return { label: 'Pending', tone: 'info' }
    default:
      return { label: props.state, tone: 'neutral' }
  }
})
</script>

<template>
  <UiStatusBadge :tone="config.tone" :label="config.label" />
</template>
```
7. [ ] Create `app/components/ui/UiStatusView.vue`:
```vue
<script setup lang="ts">
import { AlertTriangle, Ban, RefreshCw, ShieldAlert } from 'lucide-vue-next'
import { computed } from 'vue'
import { formatSupportReference, redactTechnicalIdentifiers } from '@/lib/display-identifiers'
import { useI18n } from '@/composables/useI18n'

type StatusTone = 'error' | 'forbidden' | 'step_up' | 'api'

interface Props {
  readonly tone: StatusTone
  readonly eyebrow: string
  readonly title: string
  readonly description: string
  readonly requestId?: string
  readonly standalone?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  requestId: undefined,
  standalone: true,
})

const { t } = useI18n()
const safeDescription = computed<string>(() => redactTechnicalIdentifiers(props.description))
const supportReference = computed<string | null>(() => formatSupportReference(props.requestId))
</script>

<template>
  <component
    :is="standalone ? 'main' : 'section'"
    :class="['ui-status-view', { 'ui-status-view--standalone': standalone }]"
  >
    <div class="ui-status-view__panel" role="alert">
      <div class="ui-status-view__icon" aria-hidden="true">
        <Ban v-if="tone === 'forbidden'" :size="28" />
        <ShieldAlert v-else-if="tone === 'step_up'" :size="28" />
        <RefreshCw v-else-if="tone === 'api'" :size="28" />
        <AlertTriangle v-else :size="28" />
      </div>
      <span class="ui-status-view__eyebrow">{{ eyebrow }}</span>
      <h1 class="ui-status-view__title">{{ title }}</h1>
      <p class="ui-status-view__desc">{{ safeDescription }}</p>
      <dl v-if="supportReference" class="ui-status-view__evidence">
        <dt>{{ t('common.evidence.ref_code') }}</dt>
        <dd>{{ supportReference }}</dd>
      </dl>
      <div class="ui-status-view__actions">
        <slot name="actions" />
      </div>
    </div>
  </component>
</template>

<style scoped>
.ui-status-view--standalone {
  display: grid;
  place-items: center;
  min-height: 100vh;
  padding: 24px;
  background: var(--bg);
}
.ui-status-view__panel {
  display: grid;
  justify-items: start;
  gap: 12px;
  width: min(560px, 100%);
  padding: 28px;
  background: var(--card);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-md);
}
.ui-status-view__icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  color: var(--fg);
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
}
.ui-status-view__eyebrow {
  font: 600 0.6875rem/1 var(--font-sans);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.ui-status-view__title {
  margin: 0;
  font: 600 1.375rem/1.2 var(--font-sans);
  letter-spacing: -0.02em;
  color: var(--fg);
}
.ui-status-view__desc {
  margin: 0;
  max-width: 52ch;
  font: 400 0.875rem/1.6 var(--font-sans);
  color: var(--fg-2);
}
.ui-status-view__evidence {
  display: grid;
  gap: 2px;
  margin: 4px 0 0;
  padding: 8px 12px;
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
}
.ui-status-view__evidence dt {
  font: 600 0.625rem/1 var(--font-sans);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.ui-status-view__evidence dd {
  margin: 0;
  font: 400 0.8125rem/1.4 var(--font-mono);
  color: var(--fg);
}
.ui-status-view__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 8px;
}
</style>
```
8. [ ] Create `app/components/ui/UiEmptyState.vue`:
```vue
<script setup lang="ts">
import { Inbox } from 'lucide-vue-next'

interface Props {
  readonly title: string
  readonly description: string
}

defineProps<Props>()
</script>

<template>
  <section class="ui-empty" role="status">
    <div class="ui-empty__icon" aria-hidden="true">
      <slot name="icon"><Inbox :size="24" /></slot>
    </div>
    <div class="ui-empty__copy">
      <h2 class="ui-empty__title">{{ title }}</h2>
      <p class="ui-empty__desc">{{ description }}</p>
    </div>
    <div v-if="$slots.action" class="ui-empty__action">
      <slot name="action" />
    </div>
  </section>
</template>

<style scoped>
.ui-empty {
  display: grid;
  justify-items: start;
  gap: 12px;
  padding: 28px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
}
.ui-empty__icon {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  color: var(--fg-2);
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
}
.ui-empty__title {
  margin: 0;
  font: 600 0.9375rem/1.2 var(--font-sans);
  color: var(--fg);
}
.ui-empty__desc {
  margin: 4px 0 0;
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--fg-2);
}
.ui-empty__action {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
</style>
```
9. [ ] Create `app/components/ui/UiSkeleton.vue`:
```vue
<script setup lang="ts">
interface Props {
  readonly rows?: number
  readonly label?: string
}

withDefaults(defineProps<Props>(), {
  rows: 4,
  label: 'Loading',
})
</script>

<template>
  <div class="ui-skeleton" role="status" :aria-label="label">
    <span class="sr-only">{{ label }}</span>
    <span
      v-for="index in rows"
      :key="index"
      data-testid="ui-skeleton-row"
      class="ui-skeleton__row"
      :style="{ '--skeleton-width': `${100 - (index % 3) * 12}%` }"
    />
  </div>
</template>

<style scoped>
.ui-skeleton {
  display: grid;
  gap: 10px;
  padding: 16px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
}
.ui-skeleton__row {
  width: var(--skeleton-width, 100%);
  height: 12px;
  background: var(--muted-2);
  border-radius: var(--r-sm);
  animation: ui-skeleton-pulse 1.4s ease-in-out infinite;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  white-space: nowrap;
  border: 0;
  clip: rect(0, 0, 0, 0);
}
@keyframes ui-skeleton-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.45;
  }
}
@media (prefers-reduced-motion: reduce) {
  .ui-skeleton__row {
    animation: none;
  }
}
</style>
```
10. [ ] Run the test and confirm GREEN:
   - `cd services/sso-admin-frontend && npm run test:unit -- --run app/components/__tests__/swiss-status.spec.ts`
   - Expected: `Test Files  1 passed (1)` / `Tests  5 passed (5)`.
11. [ ] Commit:
   - `git add app/lib/status-tone.ts app/lib/display-identifiers.ts app/components/ui/UiStatusBadge.vue app/components/StatusPill.vue app/components/ui/UiStatusView.vue app/components/ui/UiEmptyState.vue app/components/ui/UiSkeleton.vue app/components/__tests__/swiss-status.spec.ts`
   - `git commit -m "feat(sso-admin-frontend): port status surfaces to Swiss" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"`

---

### Task 2b.6: FOLIO-GRID differentiator — `UiFolio` + `UiDataList` table primitive

The one memorable Swiss move (design §7.3): a visible 1px **modular grid** (hairlines on every cell, vertical and horizontal) with **condensed-sans folio numerals** for record counts/timestamps and **mono** for raw IDs, doing compositional work in table headers, rows and margins.

**Files:**
- Create: `app/components/ui/UiFolio.vue`
- Create: `app/components/ui/UiDataList.vue`
- Test: `app/components/ui/__tests__/swiss-data-list.spec.ts`

**Interfaces:**
- Consumes: tokens from 2b.1.
- Produces:
  - `UiFolio` props `{ index?: number; total?: number; value?: string; pad?: number; variant?: 'count'|'id'|'timestamp' }` — renders `NN / MM` (zero-padded, condensed-sans tabular) when `index`+`total` given; a bare padded `NN` when only `index`; the raw `value` (mono when `variant==='id'`) otherwise.
  - `UiDataList` exports `type UiDataListColumn = { key: string; label: string; align?: 'left'|'right'; variant?: 'text'|'id'|'timestamp' }` and `type UiDataListRow = Readonly<Record<string, string|number|null|undefined>> & { id: string }`; props `{ caption: string; columns: readonly UiDataListColumn[]; rows: readonly UiDataListRow[]; total?: number; folioIndex?: boolean; density?: 'compact'|'comfortable'; nextLabel?: string; previousLabel?: string }`, emits `next()`, `previous()`, slots `cell(<key>)`, `actions`.

Steps:

1. [ ] Write the failing test `app/components/ui/__tests__/swiss-data-list.spec.ts`:
```ts
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import UiFolio from '@/components/ui/UiFolio.vue'
import UiDataList from '@/components/ui/UiDataList.vue'

describe('FOLIO-GRID: UiFolio', () => {
  it('renders a zero-padded NN / MM record count in condensed sans', () => {
    const wrapper = mount(UiFolio, { props: { index: 2, total: 14, variant: 'count' } })
    expect(wrapper.get('.ui-folio').text()).toBe('02 / 14')
    expect(wrapper.get('.ui-folio').classes()).not.toContain('ui-folio--mono')
  })

  it('renders a raw ID in the mono variant', () => {
    const wrapper = mount(UiFolio, { props: { value: 'sess-abc', variant: 'id' } })
    expect(wrapper.get('.ui-folio').text()).toBe('sess-abc')
    expect(wrapper.get('.ui-folio').classes()).toContain('ui-folio--mono')
  })
})

describe('FOLIO-GRID: UiDataList', () => {
  const props = {
    caption: 'Audit events',
    total: 14,
    folioIndex: true,
    columns: [
      { key: 'event', label: 'Event' },
      { key: 'sid', label: 'Session', variant: 'id' as const },
    ],
    rows: [
      { id: 'r1', event: 'admin.login', sid: 'sess-abc' },
      { id: 'r2', event: 'admin.logout', sid: 'sess-def' },
    ],
    nextLabel: 'Next',
    previousLabel: 'Previous',
  }

  it('captions with a folio count and renders the modular hairline grid table', () => {
    const wrapper = mount(UiDataList, { props })
    expect(wrapper.get('table').classes()).toContain('ui-tbl')
    expect(wrapper.get('caption').text()).toContain('Audit events')
    expect(wrapper.get('caption').text()).toContain('02 / 14')
  })

  it('sets folio row numerals and mono ID cells (compositional numerals)', () => {
    const wrapper = mount(UiDataList, { props })
    const folioCells = wrapper.findAll('.ui-tbl__folio-cell')
    expect(folioCells.map((c) => c.text())).toEqual(['01', '02'])
    expect(wrapper.get('.ui-folio--mono').text()).toBe('sess-abc')
  })

  it('exposes keyboard-focusable pagination that emits next/previous', async () => {
    const wrapper = mount(UiDataList, { props })
    const next = wrapper.get('[data-testid="data-list-next"]')
    const previous = wrapper.get('[data-testid="data-list-previous"]')
    expect(next.element.tagName).toBe('BUTTON')
    await next.trigger('click')
    await previous.trigger('click')
    expect(wrapper.emitted('next')).toHaveLength(1)
    expect(wrapper.emitted('previous')).toHaveLength(1)
  })
})
```
2. [ ] Run it and confirm RED:
   - `cd services/sso-admin-frontend && npm run test:unit -- --run app/components/ui/__tests__/swiss-data-list.spec.ts`
   - Expected: `FAIL` with `Failed to resolve import "@/components/ui/UiFolio.vue"`.
3. [ ] Create `app/components/ui/UiFolio.vue`:
```vue
<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  readonly index?: number
  readonly total?: number
  readonly value?: string
  readonly pad?: number
  readonly variant?: 'count' | 'id' | 'timestamp'
}

const props = withDefaults(defineProps<Props>(), {
  index: undefined,
  total: undefined,
  value: undefined,
  pad: undefined,
  variant: 'count',
})

const width = computed<number>(() => {
  if (props.pad != null) return Math.max(props.pad, 2)
  if (props.total != null) return Math.max(String(props.total).length, 2)
  return 2
})

function zero(value: number): string {
  return String(value).padStart(width.value, '0')
}

const display = computed<string>(() => {
  if (props.value != null) return props.value
  if (props.index != null && props.total != null) return `${zero(props.index)} / ${zero(props.total)}`
  if (props.index != null) return zero(props.index)
  return ''
})

const isMono = computed<boolean>(() => props.variant === 'id')
</script>

<template>
  <span class="ui-folio" :class="{ 'ui-folio--mono': isMono }">{{ display }}</span>
</template>

<style scoped>
.ui-folio {
  font: 500 0.75rem/1 var(--font-sans);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
  color: var(--fg-2);
  white-space: nowrap;
}
.ui-folio--mono {
  font-family: var(--font-mono);
  font-variant-numeric: normal;
  letter-spacing: 0;
  color: var(--fg);
  overflow-wrap: anywhere;
  word-break: break-word;
}
</style>
```
4. [ ] Create `app/components/ui/UiDataList.vue`:
```vue
<script setup lang="ts">
import UiFolio from './UiFolio.vue'

export type UiDataListColumn = {
  readonly key: string
  readonly label: string
  readonly align?: 'left' | 'right'
  readonly variant?: 'text' | 'id' | 'timestamp'
}

export type UiDataListRow = Readonly<Record<string, string | number | null | undefined>> & {
  readonly id: string
}

interface Props {
  readonly caption: string
  readonly columns: readonly UiDataListColumn[]
  readonly rows: readonly UiDataListRow[]
  readonly total?: number
  readonly folioIndex?: boolean
  readonly density?: 'compact' | 'comfortable'
  readonly nextLabel?: string
  readonly previousLabel?: string
}

const props = withDefaults(defineProps<Props>(), {
  total: undefined,
  folioIndex: false,
  density: 'compact',
  nextLabel: undefined,
  previousLabel: undefined,
})

const emit = defineEmits<{ (event: 'next'): void; (event: 'previous'): void }>()

function cellText(row: UiDataListRow, key: string): string {
  const value = row[key]
  return value == null || value === '' ? '—' : String(value)
}
</script>

<template>
  <section class="ui-tbl-shell" :class="`ui-tbl-shell--${density}`">
    <div class="ui-tbl-scroll">
      <table class="ui-tbl">
        <caption class="ui-tbl__caption">
          <span class="ui-tbl__caption-text">{{ caption }}</span>
          <UiFolio
            class="ui-tbl__folio"
            :index="rows.length"
            :total="total ?? rows.length"
            variant="count"
          />
        </caption>
        <thead>
          <tr>
            <th v-if="folioIndex" scope="col" class="ui-tbl__folio-head">#</th>
            <th
              v-for="column in columns"
              :key="column.key"
              scope="col"
              :class="column.align === 'right' ? 'ui-tbl__cell--right' : undefined"
            >
              {{ column.label }}
            </th>
            <th v-if="$slots.actions" scope="col" class="ui-tbl__cell--right">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, rowIndex) in rows" :key="row.id">
            <td v-if="folioIndex" class="ui-tbl__folio-cell">
              <UiFolio :index="rowIndex + 1" :pad="String(rows.length).length" />
            </td>
            <td
              v-for="column in columns"
              :key="column.key"
              :class="column.align === 'right' ? 'ui-tbl__cell--right' : undefined"
            >
              <slot :name="`cell(${column.key})`" :row="row">
                <UiFolio
                  v-if="column.variant === 'id' || column.variant === 'timestamp'"
                  :value="cellText(row, column.key)"
                  :variant="column.variant"
                />
                <template v-else>{{ cellText(row, column.key) }}</template>
              </slot>
            </td>
            <td v-if="$slots.actions" class="ui-tbl__cell--right">
              <slot name="actions" :row="row" />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div
      v-if="previousLabel || nextLabel"
      class="ui-tbl__pagination"
      aria-label="Cursor pagination"
    >
      <button
        v-if="previousLabel"
        type="button"
        class="ui-tbl__page-btn"
        data-testid="data-list-previous"
        @click="emit('previous')"
      >
        {{ previousLabel }}
      </button>
      <button
        v-if="nextLabel"
        type="button"
        class="ui-tbl__page-btn"
        data-testid="data-list-next"
        @click="emit('next')"
      >
        {{ nextLabel }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.ui-tbl-shell {
  display: grid;
  gap: 12px;
}
.ui-tbl-scroll {
  overflow-x: auto;
  border: 1px solid var(--border);
  background: var(--card);
}
.ui-tbl {
  width: 100%;
  border-collapse: collapse;
  font: 400 0.8125rem/1.4 var(--font-sans);
}
.ui-tbl__caption {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  text-align: left;
  border-bottom: 1px solid var(--border);
}
.ui-tbl__caption-text {
  font: 600 0.8125rem/1 var(--font-sans);
  color: var(--fg);
}
/* Visible 1px modular grid: hairlines on every cell, vertical + horizontal. */
.ui-tbl th,
.ui-tbl td {
  padding: 10px 14px;
  text-align: left;
  vertical-align: top;
  border: 1px solid var(--border);
}
.ui-tbl thead th {
  position: sticky;
  top: 0;
  z-index: 1;
  font: 600 0.6875rem/1 var(--font-sans);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fg-3);
  background: var(--bg-2);
  white-space: nowrap;
}
.ui-tbl tbody td {
  color: var(--fg);
  overflow-wrap: anywhere;
  word-break: break-word;
}
.ui-tbl-shell--compact th,
.ui-tbl-shell--compact td {
  padding-block: 7px;
}
.ui-tbl__folio-head,
.ui-tbl__folio-cell {
  width: 1%;
  white-space: nowrap;
  text-align: right;
  color: var(--fg-3);
}
.ui-tbl__cell--right {
  text-align: right;
}
.ui-tbl__pagination {
  display: flex;
  align-items: center;
  gap: 10px;
}
.ui-tbl__page-btn {
  min-height: 30px;
  padding: 0 12px;
  font: 500 0.75rem/1 var(--font-sans);
  color: var(--fg);
  background: var(--card);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-sm);
  cursor: pointer;
}
.ui-tbl__page-btn:hover {
  background: var(--muted);
}
.ui-tbl__page-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
</style>
```
5. [ ] Run the test and confirm GREEN:
   - `cd services/sso-admin-frontend && npm run test:unit -- --run app/components/ui/__tests__/swiss-data-list.spec.ts`
   - Expected: `Test Files  1 passed (1)` / `Tests  5 passed (5)`.
6. [ ] Commit:
   - `git add app/components/ui/UiFolio.vue app/components/ui/UiDataList.vue app/components/ui/__tests__/swiss-data-list.spec.ts`
   - `git commit -m "feat(sso-admin-frontend): add FOLIO-GRID data list + folio numerals" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"`

---

### Task 2b.7: Swiss detail drawer + evidence context panel

**Files:**
- Create: `app/components/ui/UiDetailDrawer.vue`
- Create: `app/components/EvidenceContextPanel.vue`
- Test: `app/components/__tests__/swiss-drawer-evidence.spec.ts`

**Interfaces:**
- Consumes: tokens from 2b.1; `lucide-vue-next` (`X`); `@/lib/display-identifiers` (2b.5); `@/composables/useI18n` (mocked in test); `UiFolio` (2b.6) for margin numerals.
- Produces:
  - `UiDetailDrawer` props `{ open: boolean; titleId: string; title: string; description: string; closeLabel: string; wide?: boolean }`, emits `close()`, slots default + `footer`; full dialog a11y (role=dialog, aria-modal, aria-labelledby, focus into panel on open, Tab trap, Escape + backdrop close, focus restore).
  - `EvidenceContextPanel` props `{ title?: string; requestId?: string|null; correlationId?: string|null; sessionId?: string|null; clientId?: string|null; subjectId?: string|null; auditEventId?: string|null }` — renders only when at least one ID is present; masked support reference + a `<details>` of mono technical IDs (folio margins).

Steps:

1. [ ] Write the failing test `app/components/__tests__/swiss-drawer-evidence.spec.ts`:
```ts
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import UiDetailDrawer from '@/components/ui/UiDetailDrawer.vue'
import EvidenceContextPanel from '@/components/EvidenceContextPanel.vue'

vi.mock('@/composables/useI18n', () => ({
  useI18n: () => ({ t: (k: string) => k }),
}))

afterEach(() => {
  document.body.innerHTML = ''
})

describe('Swiss detail drawer', () => {
  it('moves focus to close, traps it, closes on Escape and backdrop (a11y dialog contract)', async () => {
    const wrapper = mount(UiDetailDrawer, {
      attachTo: document.body,
      props: {
        open: false,
        titleId: 'sess',
        title: 'Session detail',
        description: 'Device-bound session.',
        closeLabel: 'Close',
      },
      slots: { default: '<button>Inside</button>', footer: '<button>Save</button>' },
    })
    await wrapper.setProps({ open: true })
    await nextTick()

    const dialog = wrapper.get('[role="dialog"]')
    expect(dialog.attributes('aria-modal')).toBe('true')
    expect(dialog.attributes('aria-labelledby')).toBe('sess-title')
    expect(document.activeElement).toBe(wrapper.get('[aria-label="Close"]').element)
    expect(wrapper.text()).toContain('Save')

    await wrapper.get('.drawer-root').trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('close')).toHaveLength(1)

    await wrapper.get('[data-testid="drawer-overlay"]').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(2)
  })
})

describe('Swiss evidence context panel', () => {
  it('renders a masked support reference and mono technical IDs', () => {
    const wrapper = mount(EvidenceContextPanel, {
      props: { requestId: 'abcdef0123456789', clientId: 'admin-portal' },
    })
    expect(wrapper.text()).toContain('REF-')
    expect(wrapper.find('details').exists()).toBe(true)
    expect(wrapper.text()).toContain('Admin Portal')
  })

  it('renders nothing when there is no evidence', () => {
    const wrapper = mount(EvidenceContextPanel, { props: {} })
    expect(wrapper.find('section').exists()).toBe(false)
  })
})
```
2. [ ] Run it and confirm RED:
   - `cd services/sso-admin-frontend && npm run test:unit -- --run app/components/__tests__/swiss-drawer-evidence.spec.ts`
   - Expected: `FAIL` with `Failed to resolve import "@/components/ui/UiDetailDrawer.vue"`.
3. [ ] Create `app/components/ui/UiDetailDrawer.vue` (port the focus logic verbatim; Swiss flat hairline panel, no shadow/blur):
```vue
<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { X } from 'lucide-vue-next'

const props = defineProps<{
  readonly open: boolean
  readonly titleId: string
  readonly title: string
  readonly description: string
  readonly closeLabel: string
  readonly wide?: boolean
}>()

const emit = defineEmits<{ (event: 'close'): void }>()

const panelRef = ref<HTMLElement | null>(null)
const closeRef = ref<HTMLElement | null>(null)
let previouslyFocused: HTMLElement | null = null

function focusableElements(): HTMLElement[] {
  const root = panelRef.value
  if (!root) return []
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => !el.hasAttribute('hidden') && el.getAttribute('aria-hidden') !== 'true')
}

function close(): void {
  emit('close')
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.stopPropagation()
    close()
    return
  }
  if (event.key !== 'Tab') return
  const focusable = focusableElements()
  if (focusable.length === 0) {
    event.preventDefault()
    return
  }
  const first = focusable[0]!
  const last = focusable[focusable.length - 1]!
  const active = document.activeElement as HTMLElement | null
  if (event.shiftKey && (active === first || !panelRef.value?.contains(active))) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && active === last) {
    event.preventDefault()
    first.focus()
  }
}

watch(
  () => props.open,
  (isOpen, wasOpen) => {
    if (isOpen && !wasOpen) {
      previouslyFocused = document.activeElement as HTMLElement | null
      void nextTick(() => {
        closeRef.value?.focus()
      })
    } else if (!isOpen && wasOpen) {
      previouslyFocused?.focus?.()
      previouslyFocused = null
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  previouslyFocused?.focus?.()
})
</script>

<template>
  <div v-if="props.open" class="drawer-root" @keydown="onKeydown">
    <div class="drawer-overlay" data-testid="drawer-overlay" @click="close"></div>
    <div
      ref="panelRef"
      class="drawer-content"
      :class="{ 'drawer-content--wide': props.wide }"
      :data-drawer-id="titleId"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="`${titleId}-title`"
      :aria-describedby="`${titleId}-desc`"
    >
      <header class="drawer-header">
        <h2 :id="`${titleId}-title`" class="drawer-title">{{ title }}</h2>
        <button
          ref="closeRef"
          type="button"
          class="drawer-close"
          :aria-label="closeLabel"
          @click="close"
        >
          <X :size="18" aria-hidden="true" />
        </button>
      </header>
      <p :id="`${titleId}-desc`" class="sr-only">{{ description }}</p>
      <div class="drawer-body">
        <slot />
      </div>
      <footer v-if="$slots.footer" class="drawer-footer">
        <slot name="footer" />
      </footer>
    </div>
  </div>
</template>

<style scoped>
.drawer-root {
  position: fixed;
  inset: 0;
  z-index: 1100;
}
.drawer-overlay {
  position: fixed;
  inset: 0;
  z-index: 1100;
  background: rgb(10 10 10 / 0.4);
}
.drawer-content {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 1101;
  display: flex;
  flex-direction: column;
  width: min(440px, 100vw);
  max-width: 100vw;
  background: var(--card);
  border-left: 1px solid var(--border-strong);
}
.drawer-content--wide {
  width: min(680px, 100vw);
}
.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px;
  border-bottom: 1px solid var(--border);
}
.drawer-title {
  margin: 0;
  font: 600 1rem/1.2 var(--font-sans);
  letter-spacing: -0.01em;
  color: var(--fg);
}
.drawer-close {
  display: inline-grid;
  place-items: center;
  width: 30px;
  height: 30px;
  color: var(--fg-2);
  background: transparent;
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  cursor: pointer;
}
.drawer-close:hover {
  background: var(--muted);
  color: var(--fg);
}
.drawer-close:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
.drawer-body {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 16px;
}
.drawer-footer {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px;
  border-top: 1px solid var(--border);
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  white-space: nowrap;
  border: 0;
  clip: rect(0, 0, 0, 0);
}
</style>
```
4. [ ] Create `app/components/EvidenceContextPanel.vue`:
```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '@/composables/useI18n'
import {
  formatFriendlyClientName,
  formatSupportReference,
  formatTechnicalPreview,
} from '@/lib/display-identifiers'

const { t } = useI18n()

const props = defineProps<{
  readonly title?: string
  readonly requestId?: string | null
  readonly correlationId?: string | null
  readonly sessionId?: string | null
  readonly clientId?: string | null
  readonly subjectId?: string | null
  readonly auditEventId?: string | null
}>()

const hasEvidence = computed<boolean>(
  () =>
    !!props.requestId ||
    !!props.correlationId ||
    !!props.sessionId ||
    !!props.clientId ||
    !!props.subjectId ||
    !!props.auditEventId,
)

const supportReference = computed<string | null>(() =>
  formatSupportReference(
    props.requestId ??
      props.correlationId ??
      props.auditEventId ??
      props.sessionId ??
      props.subjectId ??
      props.clientId,
  ),
)

const technicalRows = computed(() =>
  [
    { label: 'Request', value: props.requestId },
    { label: 'Correlation', value: props.correlationId },
    { label: 'Session', value: props.sessionId },
    { label: t('common.evidence.client'), value: props.clientId, client: true },
    { label: t('common.evidence.subject'), value: props.subjectId },
    { label: 'Audit event', value: props.auditEventId },
  ]
    .filter((row) => !!row.value)
    .map((row) => ({
      label: row.label,
      value: row.client ? formatFriendlyClientName(row.value) : formatTechnicalPreview(row.value),
    })),
)
</script>

<template>
  <section v-if="hasEvidence" class="evidence" aria-label="Evidence context">
    <h3 class="evidence__title">{{ title ?? 'Evidence context' }}</h3>
    <dl v-if="supportReference" class="evidence__list">
      <div>
        <dt>{{ t('common.evidence.ref_code') }}</dt>
        <dd class="evidence__ref">{{ supportReference }}</dd>
      </div>
    </dl>
    <details v-if="technicalRows.length" class="evidence__details">
      <summary>{{ t('common.evidence.tech_details') }}</summary>
      <dl class="evidence__list">
        <div v-for="row in technicalRows" :key="row.label">
          <dt>{{ row.label }}</dt>
          <dd class="evidence__ref">{{ row.value }}</dd>
        </div>
      </dl>
    </details>
  </section>
</template>

<style scoped>
.evidence {
  padding: 16px;
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
}
.evidence__title {
  margin: 0 0 10px;
  font: 600 0.8125rem/1 var(--font-sans);
  color: var(--fg);
}
.evidence__list {
  display: grid;
  gap: 8px;
  margin: 0;
}
.evidence__list > div {
  display: flex;
  justify-content: space-between;
  gap: 16px;
}
.evidence__list dt {
  font: 500 0.75rem/1.4 var(--font-sans);
  color: var(--fg-3);
}
.evidence__ref {
  margin: 0;
  font: 400 0.8125rem/1.4 var(--font-mono);
  color: var(--fg);
  overflow-wrap: anywhere;
  word-break: break-word;
  text-align: right;
}
.evidence__details {
  margin-top: 12px;
}
.evidence__details > summary {
  cursor: pointer;
  font: 600 0.75rem/1 var(--font-sans);
  color: var(--fg-2);
}
.evidence__details[open] > summary {
  margin-bottom: 10px;
}
</style>
```
5. [ ] Run the test and confirm GREEN:
   - `cd services/sso-admin-frontend && npm run test:unit -- --run app/components/__tests__/swiss-drawer-evidence.spec.ts`
   - Expected: `Test Files  1 passed (1)` / `Tests  3 passed (3)`.
6. [ ] Commit:
   - `git add app/components/ui/UiDetailDrawer.vue app/components/EvidenceContextPanel.vue app/components/__tests__/swiss-drawer-evidence.spec.ts`
   - `git commit -m "feat(sso-admin-frontend): port detail drawer + evidence panel to Swiss" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"`

---

### Task 2b.8: Swiss form scaffolding — form-page-shell / form-section / form-field

**Files:**
- Create: `app/components/ui/UiFormField.vue`
- Create: `app/components/form/FormSection.vue`
- Create: `app/components/form/FormPageShell.vue`
- Test: `app/components/form/__tests__/swiss-form.spec.ts`

**Interfaces:**
- Consumes: tokens from 2b.1; `lucide-vue-next` (`ChevronRight`); `UiButton` (2b.3).
- Produces:
  - `UiFormField` props `{ id: string; label: string; hint?: string; error?: string; required?: boolean }`, default slot for the control.
  - `FormSection` props `{ title: string; description?: string }`, default slot.
  - `FormPageShell` props `{ parentLabel: string; activeLabel: string; title: string; description?: string; submitLabel: string; cancelLabel?: string; isSubmitting?: boolean; isInvalid?: boolean }`, emits `submit()`, `cancel()`, slots default + `footer-left` + `footer-right`. (Swiss scoped classes replace the prior Tailwind-utility markup; `aria-busy` replaces hardcoded busy copy.)

Steps:

1. [ ] Write the failing test `app/components/form/__tests__/swiss-form.spec.ts`:
```ts
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import UiFormField from '@/components/ui/UiFormField.vue'
import FormSection from '@/components/form/FormSection.vue'
import FormPageShell from '@/components/form/FormPageShell.vue'

describe('Swiss form scaffolding', () => {
  it('UiFormField wires label/for, hint, error(role=alert) and required marker', () => {
    const wrapper = mount(UiFormField, {
      props: { id: 'email', label: 'Email', hint: 'Work address', error: 'Required', required: true },
      slots: { default: '<input id="email" />' },
    })
    expect(wrapper.get('label').attributes('for')).toBe('email')
    expect(wrapper.get('label').attributes('data-required')).toBe('true')
    expect(wrapper.text()).toContain('Work address')
    expect(wrapper.get('[role="alert"]').text()).toBe('Required')
  })

  it('FormSection renders title, description and its fields slot', () => {
    const wrapper = mount(FormSection, {
      props: { title: 'Identity', description: 'Login identifiers.' },
      slots: { default: '<input id="nik" />' },
    })
    expect(wrapper.text()).toContain('Identity')
    expect(wrapper.text()).toContain('Login identifiers.')
    expect(wrapper.find('#nik').exists()).toBe(true)
  })

  it('FormPageShell shows breadcrumb + actions, disables submit when invalid, emits submit/cancel', async () => {
    const wrapper = mount(FormPageShell, {
      props: {
        parentLabel: 'Users',
        activeLabel: 'New user',
        title: 'New user',
        submitLabel: 'Save',
        isInvalid: true,
      },
      slots: { default: '<p>Body</p>' },
    })
    expect(wrapper.text()).toContain('Users')
    expect(wrapper.text()).toContain('New user')
    const submit = wrapper.get('[data-testid="form-submit"]')
    expect(submit.attributes('disabled')).toBeDefined()

    await wrapper.setProps({ isInvalid: false })
    await submit.trigger('click')
    await wrapper.get('[data-testid="form-cancel"]').trigger('click')
    expect(wrapper.emitted('submit')).toHaveLength(1)
    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })

  it('FormPageShell marks the submit button busy while submitting', () => {
    const wrapper = mount(FormPageShell, {
      props: {
        parentLabel: 'Users',
        activeLabel: 'New user',
        title: 'New user',
        submitLabel: 'Save',
        isSubmitting: true,
      },
    })
    const submit = wrapper.get('[data-testid="form-submit"]')
    expect(submit.attributes('aria-busy')).toBe('true')
    expect(submit.attributes('disabled')).toBeDefined()
  })
})
```
2. [ ] Run it and confirm RED:
   - `cd services/sso-admin-frontend && npm run test:unit -- --run app/components/form/__tests__/swiss-form.spec.ts`
   - Expected: `FAIL` with `Failed to resolve import "@/components/ui/UiFormField.vue"`.
3. [ ] Create `app/components/ui/UiFormField.vue`:
```vue
<script setup lang="ts">
interface Props {
  readonly id: string
  readonly label: string
  readonly hint?: string
  readonly error?: string
  readonly required?: boolean
}

withDefaults(defineProps<Props>(), {
  hint: undefined,
  error: undefined,
  required: false,
})
</script>

<template>
  <div class="ui-field">
    <label class="ui-field__label" :for="id" :data-required="required ? 'true' : undefined">
      {{ label }}
      <span v-if="required" aria-hidden="true">*</span>
    </label>
    <slot />
    <p v-if="hint" :id="`${id}-hint`" class="ui-field__hint">{{ hint }}</p>
    <p v-if="error" :id="`${id}-error`" class="ui-field__error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.ui-field {
  display: grid;
  gap: 6px;
  min-width: 0;
  width: 100%;
}
.ui-field__label {
  font: 600 0.75rem/1.2 var(--font-sans);
  color: var(--fg);
}
.ui-field__label span {
  color: var(--danger);
}
.ui-field__hint {
  margin: 0;
  font: 400 0.6875rem/1.4 var(--font-sans);
  color: var(--fg-3);
}
.ui-field__error {
  margin: 0;
  font: 500 0.6875rem/1.4 var(--font-sans);
  color: var(--danger);
}
</style>
```
4. [ ] Create `app/components/form/FormSection.vue`:
```vue
<script setup lang="ts">
interface Props {
  readonly title: string
  readonly description?: string
}

withDefaults(defineProps<Props>(), {
  description: undefined,
})
</script>

<template>
  <section class="form-section">
    <div class="form-section__intro">
      <h2 class="form-section__title">{{ title }}</h2>
      <p v-if="description" class="form-section__desc">{{ description }}</p>
    </div>
    <div class="form-section__fields">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.form-section {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
  padding: 20px 0;
  border-bottom: 1px solid var(--border);
}
.form-section:last-child {
  border-bottom: 0;
}
.form-section__title {
  margin: 0;
  font: 600 0.8125rem/1.2 var(--font-sans);
  color: var(--fg);
}
.form-section__desc {
  margin: 6px 0 0;
  font: 400 0.6875rem/1.5 var(--font-sans);
  color: var(--fg-2);
}
.form-section__fields {
  display: grid;
  gap: 14px;
}
@media (min-width: 768px) {
  .form-section {
    grid-template-columns: 1fr 2fr;
    gap: 24px;
  }
}
</style>
```
5. [ ] Create `app/components/form/FormPageShell.vue`:
```vue
<script setup lang="ts">
import { ChevronRight } from 'lucide-vue-next'
import UiButton from '@/components/ui/UiButton.vue'

interface Props {
  readonly parentLabel: string
  readonly activeLabel: string
  readonly title: string
  readonly description?: string
  readonly submitLabel: string
  readonly cancelLabel?: string
  readonly isSubmitting?: boolean
  readonly isInvalid?: boolean
}

withDefaults(defineProps<Props>(), {
  description: undefined,
  cancelLabel: 'Cancel',
  isSubmitting: false,
  isInvalid: false,
})

const emit = defineEmits<{ (event: 'submit'): void; (event: 'cancel'): void }>()
</script>

<template>
  <div class="form-shell">
    <nav class="form-shell__breadcrumb" aria-label="Breadcrumb">
      <ol>
        <li>{{ parentLabel }}</li>
        <li aria-hidden="true"><ChevronRight :size="12" /></li>
        <li class="form-shell__breadcrumb-active">{{ activeLabel }}</li>
      </ol>
    </nav>

    <header class="form-shell__header">
      <h1 class="form-shell__title">{{ title }}</h1>
      <p v-if="description" class="form-shell__desc">{{ description }}</p>
    </header>

    <div class="form-shell__body">
      <slot />
    </div>

    <footer class="form-shell__footer">
      <div class="form-shell__footer-left">
        <slot name="footer-left">
          <UiButton
            variant="secondary"
            type="button"
            data-testid="form-cancel"
            :disabled="isSubmitting"
            @click="emit('cancel')"
          >
            {{ cancelLabel }}
          </UiButton>
        </slot>
      </div>
      <div class="form-shell__footer-right">
        <slot name="footer-right">
          <UiButton
            variant="primary"
            type="button"
            data-testid="form-submit"
            :disabled="isInvalid || isSubmitting"
            :aria-busy="isSubmitting ? 'true' : undefined"
            @click="emit('submit')"
          >
            {{ submitLabel }}
          </UiButton>
        </slot>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.form-shell {
  width: min(48rem, 100%);
  margin: 0 auto;
  padding: 24px;
}
.form-shell__breadcrumb ol {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 16px;
  padding: 0;
  list-style: none;
  font: 500 0.6875rem/1 var(--font-sans);
  color: var(--fg-3);
}
.form-shell__breadcrumb-active {
  color: var(--fg);
}
.form-shell__header {
  margin-bottom: 8px;
}
.form-shell__title {
  margin: 0;
  font: 600 1.375rem/1.2 var(--font-sans);
  letter-spacing: -0.02em;
  color: var(--fg);
}
.form-shell__desc {
  margin: 6px 0 0;
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--fg-2);
}
.form-shell__body {
  margin-top: 8px;
}
.form-shell__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}
</style>
```
6. [ ] Run the test and confirm GREEN:
   - `cd services/sso-admin-frontend && npm run test:unit -- --run app/components/form/__tests__/swiss-form.spec.ts`
   - Expected: `Test Files  1 passed (1)` / `Tests  4 passed (4)`.
7. [ ] Commit:
   - `git add app/components/ui/UiFormField.vue app/components/form/FormSection.vue app/components/form/FormPageShell.vue app/components/form/__tests__/swiss-form.spec.ts`
   - `git commit -m "feat(sso-admin-frontend): port form scaffolding to Swiss" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"`

---

### Task 2b.9: Swiss shell affordances — theme-toggle / locale-switcher / app-launcher

Applies two mandatory fixes from `/tmp/nuxtplan/FIXES.md`:
- **AppLauncher:** the popover uses a 1px hairline border instead of `box-shadow: var(--shadow-lg)` (Swiss); `DEFAULT_APPS` is a clearly-labelled static fallback wired to the real portal `/apps` source via `manageAppsUrl` (no invented telemetry), and per-app gradients are dropped for flat hairline tiles.
- **UiThemeToggle:** the test mocks `isDark` as a **real `ref(false)`** (via `vi.hoisted` + async factory) so the auto-unwrapped template label is `'Use dark theme'` and GREEN actually passes.

**Files:**
- Create: `app/components/ui/useTheme.ts`
- Create: `app/components/ui/UiThemeToggle.vue`
- Create: `app/components/LocaleSwitcher.vue`
- Create: `app/components/AppLauncher.vue`
- Test: `app/components/__tests__/swiss-shell-affordances.spec.ts`

**Interfaces:**
- Consumes: tokens from 2b.1; `lucide-vue-next`; `@/composables/useI18n`, `@/services/sso-account-widget.api`, `@/config/adminEnvironment` (mocked in test).
- Produces:
  - `useTheme(): { theme; isDark; setTheme; toggleTheme }` (document/localStorage guarded for SSR).
  - `UiThemeToggle` — labelled Swiss hairline icon button; no props.
  - `LocaleSwitcher` props `{ collapsed?: boolean }` — flat segmented toggle.
  - `AppLauncher` exports `type SsoApp`; props `{ apps?: SsoApp[]; align?: 'left'|'right' }`, emits `open(app: SsoApp)`; roving-focus menu popover, Escape restores focus.

Steps:

1. [ ] Write the failing test `app/components/__tests__/swiss-shell-affordances.spec.ts`:
```ts
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import UiThemeToggle from '@/components/ui/UiThemeToggle.vue'
import LocaleSwitcher from '@/components/LocaleSwitcher.vue'
import AppLauncher from '@/components/AppLauncher.vue'

const { toggleTheme, setLocale } = vi.hoisted(() => ({
  toggleTheme: vi.fn(),
  setLocale: vi.fn(),
}))

vi.mock('@/components/ui/useTheme', async () => {
  const { ref } = await import('vue')
  return { useTheme: () => ({ isDark: ref(false), toggleTheme }) }
})
vi.mock('@/composables/useI18n', async () => {
  const { ref } = await import('vue')
  return { useI18n: () => ({ locale: ref('id'), t: (k: string) => k, setLocale }) }
})
vi.mock('@/services/sso-account-widget.api', () => ({
  safeWidgetAppUrl: (u: string) => u,
}))
vi.mock('@/config/adminEnvironment', () => ({
  getAdminEnvironment: () => ({ ssoBaseUrl: 'https://sso.example' }),
}))

afterEach(() => {
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('Swiss shell affordances', () => {
  it('UiThemeToggle is a labelled icon button that toggles theme', async () => {
    const wrapper = mount(UiThemeToggle)
    const btn = wrapper.get('button')
    expect(btn.attributes('aria-label')).toBe('Use dark theme')
    expect(btn.find('svg').exists()).toBe(true)
    await btn.trigger('click')
    expect(toggleTheme).toHaveBeenCalledTimes(1)
  })

  it('LocaleSwitcher toggles to the other locale', async () => {
    const wrapper = mount(LocaleSwitcher)
    await wrapper.get('button').trigger('click')
    expect(setLocale).toHaveBeenCalledWith('en')
  })

  it('AppLauncher opens a menu popover and closes on Escape (focus restored)', async () => {
    const wrapper = mount(AppLauncher, { attachTo: document.body })
    const trigger = wrapper.get('[data-testid="app-launcher-trigger"]')
    expect(trigger.find('svg').exists()).toBe(true)
    await trigger.trigger('click')
    await nextTick()
    expect(wrapper.find('[data-testid="app-launcher-popover"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="app-launcher-trigger"]').attributes('aria-expanded')).toBe('true')

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    expect(wrapper.find('[data-testid="app-launcher-popover"]').exists()).toBe(false)
    expect(document.activeElement).toBe(wrapper.get('[data-testid="app-launcher-trigger"]').element)
  })

  it('AppLauncher emits the chosen app from the menu grid', async () => {
    const wrapper = mount(AppLauncher, {
      attachTo: document.body,
      props: {
        apps: [{ name: 'Akun SSO', short: 'Akun SSO', icon: 'user', grad: '', fav: true, url: '/' }],
      },
    })
    await wrapper.get('[data-testid="app-launcher-trigger"]').trigger('click')
    await nextTick()
    await wrapper.get('[role="menuitem"].al-tile').trigger('click')
    expect(wrapper.emitted('open')?.[0]?.[0]).toMatchObject({ name: 'Akun SSO' })
  })
})
```
2. [ ] Run it and confirm RED:
   - `cd services/sso-admin-frontend && npm run test:unit -- --run app/components/__tests__/swiss-shell-affordances.spec.ts`
   - Expected: `FAIL` with `Failed to resolve import "@/components/ui/UiThemeToggle.vue"`.
3. [ ] Create `app/components/ui/useTheme.ts`:
```ts
import { computed, ref } from 'vue'

export type AdminTheme = 'light' | 'dark'

const STORAGE_KEY = 'dev-sso-admin-theme' as const
const theme = ref<AdminTheme>(detectInitialTheme())

syncDocumentTheme(theme.value)

export function useTheme() {
  const isDark = computed<boolean>(() => theme.value === 'dark')

  function setTheme(nextTheme: AdminTheme): void {
    theme.value = nextTheme
    syncDocumentTheme(nextTheme)
    persistTheme(nextTheme)
  }

  function toggleTheme(): void {
    setTheme(theme.value === 'dark' ? 'light' : 'dark')
  }

  return { theme: computed(() => theme.value), isDark, setTheme, toggleTheme }
}

function detectInitialTheme(): AdminTheme {
  return readStoredTheme() ?? 'dark'
}

function readStoredTheme(): AdminTheme | null {
  if (typeof window === 'undefined') return null
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return stored === 'light' || stored === 'dark' ? stored : null
  } catch {
    return null
  }
}

function syncDocumentTheme(nextTheme: AdminTheme): void {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('dark', nextTheme === 'dark')
  document.documentElement.dataset.adminTheme = nextTheme
}

function persistTheme(nextTheme: AdminTheme): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, nextTheme)
  } catch {
    // Theme persistence is best-effort and never security critical.
  }
}
```
4. [ ] Create `app/components/ui/UiThemeToggle.vue`:
```vue
<script setup lang="ts">
import { Moon, Sun } from 'lucide-vue-next'
import { useTheme } from './useTheme'

const { isDark, toggleTheme } = useTheme()
</script>

<template>
  <button
    class="ui-icon-button"
    type="button"
    :aria-label="isDark ? 'Use light theme' : 'Use dark theme'"
    @click="toggleTheme"
  >
    <Sun v-if="isDark" :size="18" aria-hidden="true" />
    <Moon v-else :size="18" aria-hidden="true" />
  </button>
</template>

<style scoped>
.ui-icon-button {
  display: inline-grid;
  place-items: center;
  width: 36px;
  height: 36px;
  color: var(--fg-2);
  background: transparent;
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease;
}
.ui-icon-button:hover {
  background: var(--muted);
  color: var(--fg);
}
.ui-icon-button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
@media (prefers-reduced-motion: reduce) {
  .ui-icon-button {
    transition: none;
  }
}
</style>
```
5. [ ] Create `app/components/LocaleSwitcher.vue`:
```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '@/composables/useI18n'

defineProps<{
  collapsed?: boolean
}>()

const { locale, t, setLocale } = useI18n()

const ariaLabel = computed<string>(() =>
  locale.value === 'id' ? t('language.switch_to_en') : t('language.switch_to_id'),
)

async function toggleLocale(): Promise<void> {
  const nextLocale = locale.value === 'id' ? 'en' : 'id'
  await setLocale(nextLocale)
}
</script>

<template>
  <button class="admin-locale-switcher" type="button" :aria-label="ariaLabel" @click="toggleLocale">
    <template v-if="collapsed">
      <span class="admin-locale-selected">{{ locale.toUpperCase() }}</span>
    </template>
    <template v-else>
      <span :class="{ 'admin-locale-selected': locale === 'id' }">ID</span>
      <span class="admin-locale-divider" aria-hidden="true">|</span>
      <span :class="{ 'admin-locale-selected': locale === 'en' }">EN</span>
    </template>
  </button>
</template>

<style scoped>
.admin-locale-switcher {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 0 10px;
  font: 500 0.75rem/1 var(--font-sans);
  color: var(--fg-3);
  background: transparent;
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  cursor: pointer;
}
.admin-locale-switcher:hover {
  background: var(--muted);
}
.admin-locale-switcher:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
.admin-locale-selected {
  color: var(--fg);
  font-weight: 600;
}
.admin-locale-divider {
  color: var(--border-strong);
}
</style>
```
6. [ ] Create `app/components/AppLauncher.vue` (flat Swiss popover; hairline border replaces `--shadow-lg`; `DEFAULT_APPS` is a labelled fallback wired to the real `/apps` source):
```vue
<script setup lang="ts">
/**
 * AppLauncher.vue — SSO application launcher (9-dot waffle → app grid popover).
 * Mount in the topbar so a single source of truth propagates everywhere.
 *
 * DATA: DEFAULT_APPS is a STATIC FALLBACK SAMPLE. A parent passes a fetched list
 * via the `apps` prop once the backend exposes an apps endpoint; the footer link
 * (`manageAppsUrl`) already points at the real portal `/apps` page. Do NOT invent
 * or call an endpoint here, and do NOT present this sample as live telemetry.
 */
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import {
  Grid3X3,
  UserRound,
  AppWindow,
  Building2,
  FileText,
  Globe,
  Layers,
  Activity,
  Fingerprint,
  Search,
  ExternalLink,
  type LucideIcon,
} from 'lucide-vue-next'
import { safeWidgetAppUrl } from '@/services/sso-account-widget.api'
import { useI18n } from '@/composables/useI18n'
import { getAdminEnvironment } from '@/config/adminEnvironment'

export type SsoApp = {
  name: string
  short: string
  icon: string
  grad: string
  fav?: boolean
  url?: string
}

const props = withDefaults(
  defineProps<{
    apps?: SsoApp[]
    align?: 'left' | 'right'
  }>(),
  { align: 'right' },
)

const emit = defineEmits<{ (e: 'open', app: SsoApp): void }>()

const { t } = useI18n()

// Static fallback sample (replace with a fetched backend list via `apps`).
// Names are proper nouns and intentionally untranslated. `grad` is retained for
// type compatibility but Swiss tiles are flat hairline — the gradient is unused.
const DEFAULT_APPS: SsoApp[] = [
  { name: 'Akun SSO', short: 'Akun SSO', icon: 'user', grad: '', fav: true, url: '/' },
  { name: 'E-Office Bontang', short: 'E-Office', icon: 'app', grad: '', fav: true },
  { name: 'SIMPEG Kepegawaian', short: 'SIMPEG', icon: 'office', grad: '', fav: true },
  { name: 'LAPOR! Bontang', short: 'LAPOR!', icon: 'doc', grad: '', fav: true },
  { name: 'Portal Layanan Publik', short: 'Layanan', icon: 'globe', grad: '', fav: true },
  { name: 'SatuData Bontang', short: 'SatuData', icon: 'layers', grad: '', fav: true },
  { name: 'SIM RSUD Taman Husada', short: 'SIM RSUD', icon: 'pulse', grad: '' },
  { name: 'e-Absensi ASN', short: 'e-Absensi', icon: 'finger', grad: '' },
  { name: 'Arsip Digital', short: 'Arsip', icon: 'search', grad: '' },
]

const ICONS: Record<string, LucideIcon> = {
  user: UserRound,
  app: AppWindow,
  office: Building2,
  doc: FileText,
  globe: Globe,
  layers: Layers,
  pulse: Activity,
  finger: Fingerprint,
  search: Search,
}

const list = computed<SsoApp[]>(() => props.apps ?? DEFAULT_APPS)
const fav = computed<SsoApp[]>(() => list.value.filter((app) => app.fav))
const rest = computed<SsoApp[]>(() => list.value.filter((app) => !app.fav))

const manageAppsUrl = computed<string | undefined>(
  () => safeWidgetAppUrl(`${getAdminEnvironment().ssoBaseUrl}/apps`) ?? undefined,
)

function iconFor(key: string): LucideIcon {
  return ICONS[key] ?? AppWindow
}

const open = ref(false)
const root = ref<HTMLElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const popover = ref<HTMLElement | null>(null)

function focusableItems(): HTMLElement[] {
  if (!popover.value) return []
  return Array.from(
    popover.value.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((item) => !item.hasAttribute('disabled') && item.tabIndex !== -1)
}

async function focusPopover(): Promise<void> {
  await nextTick()
  focusableItems()[0]?.focus()
}

function toggle(): void {
  open.value = !open.value
  if (open.value) void focusPopover()
}

function close(restoreFocus = false): void {
  if (!open.value) return
  open.value = false
  if (restoreFocus) trigger.value?.focus()
}

function openApp(app: SsoApp): void {
  close()
  emit('open', app)
  if (!app.url) return
  const isRelative = app.url.startsWith('/')
  if (isRelative || safeWidgetAppUrl(app.url)) {
    window.location.assign(app.url)
  }
}

function handleDocumentClick(event: MouseEvent): void {
  if (!root.value || !(event.target instanceof Node)) return
  if (!root.value.contains(event.target)) close()
}

function handleKeydown(event: KeyboardEvent): void {
  if (!open.value) return
  if (event.key === 'Escape') {
    event.preventDefault()
    close(true)
    return
  }
  if (event.key !== 'Tab') return
  const items = focusableItems()
  if (items.length === 0) return
  event.preventDefault()
  const activeIndex = items.findIndex((item) => item === document.activeElement)
  const direction = event.shiftKey ? -1 : 1
  const nextIndex = activeIndex === -1 ? 0 : (activeIndex + direction + items.length) % items.length
  items[nextIndex]?.focus()
}

onMounted(() => {
  document.addEventListener('click', handleDocumentClick)
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('click', handleDocumentClick)
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div ref="root" class="al">
    <button
      ref="trigger"
      type="button"
      class="al-trigger"
      data-testid="app-launcher-trigger"
      :aria-label="t('app_launcher.aria_label')"
      aria-haspopup="menu"
      :aria-expanded="open"
      @click="toggle"
    >
      <Grid3X3 class="al-trigger__icon" :size="20" aria-hidden="true" />
    </button>

    <template v-if="open">
      <button
        type="button"
        class="al-backdrop"
        :aria-label="t('app_launcher.aria_label')"
        tabindex="-1"
        @click="close()"
      ></button>
      <div
        ref="popover"
        class="al-pop"
        :class="align === 'left' ? 'al-pop--left' : 'al-pop--right'"
        role="menu"
        :aria-label="t('app_launcher.title')"
        data-testid="app-launcher-popover"
      >
        <div class="al-head">
          <span class="al-title">{{ t('app_launcher.title') }}</span>
          <span class="al-sub">{{ t('app_launcher.subtitle') }}</span>
        </div>
        <div class="al-scroll">
          <div class="al-group" role="group" :aria-label="t('app_launcher.favorites')">
            <p class="al-group__label">{{ t('app_launcher.favorites') }}</p>
            <div class="al-grid">
              <button
                v-for="app in fav"
                :key="app.name"
                type="button"
                class="al-tile"
                role="menuitem"
                :title="app.name"
                :aria-label="app.name"
                @click="openApp(app)"
              >
                <span class="al-ico">
                  <component :is="iconFor(app.icon)" :size="20" aria-hidden="true" />
                </span>
                <span class="al-label">{{ app.short }}</span>
              </button>
            </div>
          </div>
          <template v-if="rest.length">
            <div class="al-sep" role="separator"></div>
            <div class="al-group" role="group" :aria-label="t('app_launcher.others')">
              <p class="al-group__label">{{ t('app_launcher.others') }}</p>
              <div class="al-grid">
                <button
                  v-for="app in rest"
                  :key="app.name"
                  type="button"
                  class="al-tile"
                  role="menuitem"
                  :title="app.name"
                  :aria-label="app.name"
                  @click="openApp(app)"
                >
                  <span class="al-ico">
                    <component :is="iconFor(app.icon)" :size="20" aria-hidden="true" />
                  </span>
                  <span class="al-label">{{ app.short }}</span>
                </button>
              </div>
            </div>
          </template>
        </div>
        <div class="al-foot">
          <a
            role="menuitem"
            class="al-foot__link"
            :href="manageAppsUrl"
            target="_blank"
            rel="noopener noreferrer"
            data-testid="app-launcher-manage"
          >
            <span>{{ t('app_launcher.manage') }}</span>
            <ExternalLink :size="14" aria-hidden="true" />
          </a>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.al {
  position: relative;
}
.al-trigger {
  display: inline-grid;
  place-items: center;
  width: 36px;
  height: 36px;
  color: var(--fg-2);
  background: transparent;
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}
.al-trigger:hover {
  background: var(--muted);
  color: var(--fg);
}
.al-trigger:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
.al-backdrop {
  position: fixed;
  inset: 0;
  z-index: 60;
  border: 0;
  padding: 0;
  background: transparent;
  cursor: default;
}
.al-pop {
  position: absolute;
  top: 44px;
  z-index: 61;
  width: min(336px, 92vw);
  background: var(--card);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-md);
  overflow: hidden;
}
.al-pop--right {
  right: 0;
}
.al-pop--left {
  left: 0;
}
.al-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px 8px;
  border-bottom: 1px solid var(--border);
}
.al-title {
  font: 600 0.875rem/1 var(--font-sans);
  letter-spacing: -0.01em;
  color: var(--fg);
}
.al-sub {
  font-size: 0.6875rem;
  color: var(--fg-3);
}
.al-scroll {
  max-height: min(58vh, 420px);
  overflow-y: auto;
  padding: 8px;
}
.al-group__label {
  margin: 0;
  padding: 6px 8px 4px;
  font: 500 0.625rem/1 var(--font-sans);
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.al-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1px;
  background: var(--border);
  border: 1px solid var(--border);
}
.al-tile {
  display: grid;
  justify-items: center;
  gap: 8px;
  padding: 14px 6px;
  border: 0;
  background: var(--card);
  cursor: pointer;
  transition: background 0.12s;
}
.al-tile:hover {
  background: var(--muted);
}
.al-tile:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
.al-ico {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  color: var(--fg);
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
}
.al-tile:hover .al-ico {
  border-color: var(--accent);
  color: var(--accent);
}
.al-label {
  font: 500 0.6875rem/1.2 var(--font-sans);
  color: var(--fg);
  text-align: center;
}
.al-sep {
  height: 8px;
}
.al-foot {
  border-top: 1px solid var(--border);
  padding: 6px;
}
.al-foot__link {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 10px;
  border-radius: var(--r-sm);
  font: 500 0.75rem/1 var(--font-sans);
  color: var(--accent-soft-fg);
  text-decoration: none;
}
.al-foot__link:hover {
  background: var(--muted);
}
.al-foot__link:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
@media (prefers-reduced-motion: reduce) {
  .al-tile,
  .al-trigger {
    transition: none;
  }
}
</style>
```
7. [ ] Run the test and confirm GREEN:
   - `cd services/sso-admin-frontend && npm run test:unit -- --run app/components/__tests__/swiss-shell-affordances.spec.ts`
   - Expected: `Test Files  1 passed (1)` / `Tests  4 passed (4)`.
8. [ ] Commit:
   - `git add app/components/ui/useTheme.ts app/components/ui/UiThemeToggle.vue app/components/LocaleSwitcher.vue app/components/AppLauncher.vue app/components/__tests__/swiss-shell-affordances.spec.ts`
   - `git commit -m "feat(sso-admin-frontend): port theme/locale/app-launcher to Swiss" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"`

---

### Task 2b.10: Widened Phase 2b verification gate

Reproduces the prior gate (`/tmp/nuxtplan/sec-swiss.md` Task 2b.10: full unit suite + typecheck + lint + format:check + build) and **widens** it with a real, automated discipline spec that statically scans `tokens.css`, `main.css` and every component `<style>` and **fails on**: any soft-shadow token (incl. `--shadow-lg`) or `box-shadow`/glass/glow/backdrop-filter/brand-gradient; any **undefined** `var(--*)` (no global/local definition and no fallback); any **serif** display font; or **more-than-one accent** (a second brand token, accent-variant blocks, or red `#E4002B` wired to anything but `--danger`). The detector helpers are TDD'd against crafted violation strings (genuine teeth — they would fail if the detectors were no-ops) and then asserted clean against the real Swiss tree.

**Files:**
- Create: `app/assets/__tests__/swiss-discipline.spec.ts`
- Modify: none (verification only).
- Test: runs the full Phase 2b suite produced in Tasks 2b.1–2b.9 plus this discipline spec.

**Interfaces:**
- Consumes: every file produced in Tasks 2b.1–2b.9.
- Produces: a green gate certifying the Swiss design system before any domain page (Phase 3+) consumes it.

Steps:

1. [ ] Write the discipline spec `app/assets/__tests__/swiss-discipline.spec.ts` (detector helpers first, with self-tests proving they flag violations; then the clean-tree assertions):
```ts
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const APP_DIR = fileURLToPath(new URL('../../', import.meta.url))
const TOKENS = join(APP_DIR, 'assets/tokens.css')
const MAIN = join(APP_DIR, 'assets/main.css')
const COMPONENTS = join(APP_DIR, 'components')

const BANNED: readonly RegExp[] = [
  /box-shadow/i,
  /--shadow-lg/i,
  /--shadow-/i,
  /glass/i,
  /glow/i,
  /brand-grad/i,
  /backdrop-filter/i,
  /--font-serif/i,
  /Instrument Serif/i,
  /Plus Jakarta/i,
  /(?<![a-z-])serif/i, // bans `serif` / `Georgia, serif` but allows `sans-serif`
]

function collectDefs(css: string): Set<string> {
  const defs = new Set<string>()
  for (const match of css.matchAll(/(--[a-z0-9-]+)\s*:/gi)) defs.add(match[1]!.toLowerCase())
  return defs
}

function collectRefs(css: string): Array<{ name: string; hasFallback: boolean }> {
  const refs: Array<{ name: string; hasFallback: boolean }> = []
  for (const match of css.matchAll(/var\(\s*(--[a-z0-9-]+)\s*(,?)/gi))
    refs.push({ name: match[1]!.toLowerCase(), hasFallback: match[2] === ',' })
  return refs
}

function findBanned(text: string): string[] {
  return BANNED.filter((re) => re.test(text)).map((re) => re.source)
}

function findUndefinedVars(content: string, globalDefs: ReadonlySet<string>): string[] {
  const local = collectDefs(content)
  const missing: string[] = []
  for (const ref of collectRefs(content)) {
    if (ref.hasFallback) continue
    if (globalDefs.has(ref.name) || local.has(ref.name)) continue
    missing.push(ref.name)
  }
  return missing
}

function accentViolations(tokensCss: string): string[] {
  const issues: string[] = []
  if (!/--accent:\s*#002FA7/i.test(tokensCss)) issues.push('missing single accent #002FA7')
  if (/--primary:/i.test(tokensCss)) issues.push('second accent token --primary')
  if (/data-accent=/i.test(tokensCss)) issues.push('accent-variant blocks present')
  for (const line of tokensCss.split('\n')) {
    if (/#E4002B/i.test(line) && !/--danger/i.test(line)) {
      issues.push(`red wired off --danger: ${line.trim()}`)
    }
  }
  return issues
}

function styleBlocks(vue: string): string {
  let css = ''
  for (const match of vue.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) css += `\n${match[1]}`
  return css
}

function walkVue(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walkVue(full))
    else if (entry.name.endsWith('.vue')) out.push(full)
  }
  return out
}

describe('Swiss discipline — detector teeth (must flag violations)', () => {
  it('flags soft-shadow / box-shadow / glass / glow / backdrop-filter', () => {
    expect(findBanned('box-shadow: var(--shadow-lg)')).toContain('box-shadow')
    expect(findBanned('--shadow-lg: 0 20px 48px')).toContain('--shadow-lg')
    expect(findBanned('background: var(--glass-bg)')).toContain('glass')
    expect(findBanned('box-shadow: var(--shadow-glow)')).toContain('glow')
    expect(findBanned('backdrop-filter: blur(18px)')).toContain('backdrop-filter')
  })

  it('flags serif display but allows sans-serif', () => {
    expect(findBanned('font-family: Georgia, serif')).toContain('(?<![a-z-])serif')
    expect(findBanned("--font-serif: 'Instrument Serif'")).toContain('--font-serif')
    expect(findBanned('font-family: Helvetica, Arial, sans-serif')).toEqual([])
  })

  it('flags undefined vars but honours fallbacks and local defs', () => {
    expect(findUndefinedVars('.x{color:var(--nope)}', new Set())).toEqual(['--nope'])
    expect(findUndefinedVars('.x{width:var(--skeleton-width,100%)}', new Set())).toEqual([])
    expect(findUndefinedVars('.x{--y:1px;color:var(--y)}', new Set())).toEqual([])
    expect(findUndefinedVars('.x{color:var(--accent)}', new Set(['--accent']))).toEqual([])
  })

  it('flags a second accent and red wired off --danger', () => {
    expect(accentViolations('--primary: #002FA7;\n--accent: #002FA7;')).toContain(
      'second accent token --primary',
    )
    expect(accentViolations('--accent: #002FA7;\n--ring: #E4002B;').some((m) => m.includes('red wired off'))).toBe(true)
    expect(accentViolations('--accent: #002FA7;\n--danger: #E4002B;')).toEqual([])
  })
})

describe('Swiss discipline — the real tree is clean', () => {
  const tokensCss = readFileSync(TOKENS, 'utf8')
  const mainCss = readFileSync(MAIN, 'utf8')
  const globalDefs = new Set<string>([...collectDefs(tokensCss), ...collectDefs(mainCss)])
  const vueFiles = walkVue(COMPONENTS)

  it('defines no banned shadow/glass/glow/serif/brand tokens anywhere', () => {
    const all = [tokensCss, mainCss, ...vueFiles.map((f) => styleBlocks(readFileSync(f, 'utf8')))]
    for (const content of all) expect(findBanned(content)).toEqual([])
  })

  it('keeps a single accent with red wired only to --danger', () => {
    expect(accentViolations(tokensCss)).toEqual([])
  })

  it('references no undefined var(--*) in tokens, main or any component', () => {
    expect(findUndefinedVars(tokensCss, globalDefs)).toEqual([])
    expect(findUndefinedVars(mainCss, globalDefs)).toEqual([])
    for (const file of vueFiles) {
      expect(findUndefinedVars(styleBlocks(readFileSync(file, 'utf8')), globalDefs)).toEqual([])
    }
  })
})
```
2. [ ] Run the discipline spec and confirm GREEN (its detector self-tests prove the teeth; the clean-tree block proves compliance of 2b.1–2b.9):
   - `cd services/sso-admin-frontend && npm run test:unit -- --run app/assets/__tests__/swiss-discipline.spec.ts`
   - Expected: `Test Files  1 passed (1)` / `Tests  7 passed (7)`.
3. [ ] Run the full Phase 2b unit suite and confirm GREEN:
   - `cd services/sso-admin-frontend && npm run test:unit -- --run app/assets app/components`
   - Expected: all Phase 2b spec files pass — `Test Files  10 passed (10)` (tokens-contract, main-theme-mapping, swiss-controls, swiss-overlays, swiss-status, swiss-data-list, swiss-drawer-evidence, swiss-form, swiss-shell-affordances, swiss-discipline).
4. [ ] Run typecheck:
   - `cd services/sso-admin-frontend && npm run typecheck`
   - Expected: exit 0, no errors under `app/components/**` or `app/assets/**`.
5. [ ] Run lint + format check:
   - `cd services/sso-admin-frontend && npm run lint && npm run format:check`
   - Expected: exit 0 (no unicode-glyph icons, no fabricated-telemetry strings, Swiss tokens only).
6. [ ] Run the production build to confirm the Swiss tokens/Tailwind mapping compile under Nuxt:
   - `cd services/sso-admin-frontend && npm run build`
   - Expected: build succeeds; `app/assets/tokens.css` + `app/assets/main.css` resolve all `var(--*)` references with no `--shadow-*`/`--glass-*`/`--brand-grad`/glow regressions.
7. [ ] Commit (the gate adds one spec; no source change):
   - `git add app/assets/__tests__/swiss-discipline.spec.ts`
   - `git commit -m "test(sso-admin-frontend): widen Phase 2b Swiss discipline gate" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"`
8. [ ] If any gate command is blocked/unavailable in the sandbox (e.g. `npm run build`), report it explicitly and do NOT claim PASS.

---

## Notes for the executor

- Target paths are under the Nuxt `app/` srcDir per design §4.1; the legacy `src/` SPA copies stay untouched until the Phase 18 cutover. `@/` resolves to `app/` in the Nuxt-aware Vitest project (Phase 0).
- `SsoAccountBar.vue` + `composables/useSsoAccountBar.ts` are deliberately **excluded** from Phase 2b — they must stay byte-identical with the portal and are wrapped in `<ClientOnly>` in the shell phase (2a), not restyled here.
- Single-accent reconciliation: `tokens.css` defines `--accent: #002FA7` (+ a dark variant) only; `main.css` maps both `--color-primary` and `--color-accent` onto `var(--accent)` so utilities keep resolving (DRY). Red `#E4002B` is wired only to `--danger`/`--color-destructive`.
- The FOLIO-GRID differentiator (design §7.3) is concentrated in Task 2b.6 (`UiFolio` + `UiDataList` visible 1px modular grid + `NN / MM` folio numerals) and reused by `UiStatusView`/`EvidenceContextPanel` for IDs/timestamps.
- If the service exposes format-check as `format -- --check` rather than `format:check`, adjust step 5 accordingly.

# Phase 2c — SSR token-leak render gate (spec §3.3)

### Task 2c.1: SSR token-leak render gate (spec §3.3, the crown jewel)

This lands the mandatory §3.3 gate that Task 1.15 deferred to "Phase 2" with a TODO
(and whose RED was a fake insert-and-revert). Here the gate SSR-renders a REAL
authenticated admin page with a mocked `event.context.session` carrying sentinel
OIDC token VALUES (access / refresh / id / sid) and sentinel raw-PII VALUES shaped
exactly like a NIK (16 digits), NIP (18 digits), and NISN (10 digits), plus a private
`runtimeConfig` canary, then asserts the rendered HTML string AND the parsed Nuxt
hydration payload (`__NUXT_DATA__`, the SSR-serialized form of `window.__NUXT__`)
contain NONE of those sentinel token values/names, NONE of the raw-PII values/shapes,
and NOT the canary. Honest test-first: the representative page begins as a naive
`useState('dbg', () => session)` baseline that genuinely leaks (RED), then is corrected
to the safe-hydration pattern (masked principal via the session store; tokens + raw PII
stay in Nitro `event.context`) which makes it PASS (GREEN). The page keeps its
"greet the signed-in admin" feature in both states — only the hydration channel changes,
so this is a genuine RED→GREEN, not an insert-and-revert.

**Files:**
- Create: `services/sso-admin-frontend/test/fixtures/ssr-leak/sentinels.ts`
- Create: `services/sso-admin-frontend/test/fixtures/ssr-leak/nuxt.config.ts`
- Create: `services/sso-admin-frontend/test/fixtures/ssr-leak/server/middleware/zz.sentinel-session.ts`
- Create: `services/sso-admin-frontend/test/fixtures/ssr-leak/server/routes/api/admin/me.get.ts`
- Test: `services/sso-admin-frontend/test/ssr-token-leak.gate.spec.ts`
- Modify: `services/sso-admin-frontend/app/pages/dashboard.vue` (2a stub → safe-hydrated representative page)

**Interfaces:**

Consumes:
- `services/sso-admin-frontend/server/utils/session.ts` → `type PortalSession` (Task 1.4) — the server-only session shape (`accessToken, idToken, refreshToken, sub, sid?, subject, email, displayName, role, expiresAt, authTime, amr, acr, lastLoginAt, issuedAt, absoluteExpiresAt, lastRefreshedAt`).
- `services/sso-admin-frontend/server/middleware/session.ts` (Task 1.14) — augments `H3EventContext` with `session?: PortalSession`; runs before route handlers.
- `services/sso-admin-frontend/server/routes/api/admin/[...].ts` (Task 1.12) — base admin proxy; the fixture's `me.get.ts` is a MORE-SPECIFIC route that overrides it for `GET /api/admin/me` so the guard resolves a principal without a live backend.
- `services/sso-admin-frontend/app/stores/session.store.ts` (Task 2a) → `useSessionStore()` exposing `principal: Ref<AdminPrincipal | null>` and `ensureSession(force?: boolean): Promise<SessionEnsureResult>`; `ensureSession()` calls `authApi.getPrincipal()` → `apiClient.get('/api/admin/me')` (same-origin, SSR cookie-forwarding).
- `services/sso-admin-frontend/app/middleware/admin-guard.global.ts` (Task 2a) — global guard; resolves the principal server-side and allows `/dashboard` when `role === 'admin'` and capability `admin.dashboard.view === true`.
- `services/sso-admin-frontend/app/types/auth.types.ts` (Task 2a) → `AdminPrincipal`, `AdminPrincipalResponse` (the `{ principal }` contract the store consumes).
- `@nuxt/test-utils/e2e` → `setup(options)`, `$fetch(path)` (SSR rendering — the toolingResearch `$fetch('/')` server-HTML pattern).
- `services/sso-admin-frontend/vitest.config.ts` (Task 0.4) — `defineVitestConfig` with `include: ['test/**/*.{test,spec}.ts', 'app/**/*.{test,spec}.ts']`, `exclude` covering `src`, so this gate runs under `npm run test`.

Produces:
- `SENTINEL` (token + raw-PII VALUES) and `SSR_LEAK_CANARY` constants — single source of truth shared by the injection middleware, the principal route, and the gate test (DRY; injected values and assertions cannot drift).
- A Nuxt-layer fixture (`extends` the real admin app) that injects an authenticated sentinel session and a private `runtimeConfig` canary.
- `server/middleware/zz.sentinel-session.ts` → sets `event.context.session` (server-only; runs after the real `session.ts` so the sentinel wins).
- `server/routes/api/admin/me.get.ts` → `AdminPrincipalResponse` derived from the session, masked: no tokens, no raw PII.
- `test/ssr-token-leak.gate.spec.ts` → the §3.3 render gate (3 `it` blocks: safe-channel proof, HTML grep, parsed-payload grep).
- `app/pages/dashboard.vue` → the representative authenticated page, safe-hydrated: SFC with `definePageMeta({ name: 'admin.dashboard', layout: 'admin', requiresAdmin: true, permissions: ['admin.dashboard.view'] })`, rendering `display_name` from the masked store principal.

---

- [ ] **Step 1: Create the shared sentinel constants**

Create `services/sso-admin-frontend/test/fixtures/ssr-leak/sentinels.ts`:

```ts
// Shared sentinels for the §3.3 SSR token-leak render gate (Task 2c.1).
// Imported by the fixture session-injection middleware, the fixture principal
// route, and the gate test so the INJECTED values and the ASSERTED values can
// never drift apart (DRY). These are deliberately distinctive, non-secret
// placeholders — their only job is to be detectable if they ever leak.

// Private runtimeConfig canary (mirrors the Task 0.4 seed value). Lives in the
// PRIVATE half of runtimeConfig; it must never reach SSR HTML / the payload.
export const SSR_LEAK_CANARY = 'leak-canary-do-not-render' as const

export const SENTINEL = {
  // OIDC token VALUES — must live only in Nitro event.context, never serialized.
  access: 'SENTINEL-ACCESS-TOKEN-3f9a2c7d1e',
  refresh: 'SENTINEL-REFRESH-TOKEN-8b1d6e0a4c',
  id: 'SENTINEL-ID-TOKEN-5c2f9a8b3d',
  sid: 'SENTINEL-SID-7e4a1b9c0d',
  // Raw government PII VALUES, shaped EXACTLY like real identifiers.
  nik: '3174091987654321', // 16 digits (NIK)
  nip: '198509152023011007', // 18 digits (NIP)
  nisn: '0098123456', // 10 digits (NISN)
} as const
```

- [ ] **Step 2: Create the fixture Nuxt layer (extends the real app + injects the canary)**

Create `services/sso-admin-frontend/test/fixtures/ssr-leak/nuxt.config.ts`:

```ts
import { fileURLToPath } from 'node:url'
import { SSR_LEAK_CANARY } from './sentinels'

// SSR token-leak render-gate fixture. Extends the real admin app as a Nuxt LAYER
// so the gate renders the REAL pages / components / server routes (representative),
// then layers on (a) an authenticated sentinel session via server middleware and
// (b) a private runtimeConfig canary that must never reach the client.
export default defineNuxtConfig({
  extends: [fileURLToPath(new URL('../../../', import.meta.url))],
  runtimeConfig: {
    // PRIVATE (server-only) canary — never serialized into SSR HTML / the payload.
    sessionEncryptionSecret: SSR_LEAK_CANARY,
    public: {
      adminAppBaseUrl: 'http://admin.test',
      basePath: '/__vue-preview',
    },
  },
})
```

- [ ] **Step 3: Create the session-injection middleware (server-only, runs last)**

Create `services/sso-admin-frontend/test/fixtures/ssr-leak/server/middleware/zz.sentinel-session.ts`:

```ts
import type { PortalSession } from '../../../../../server/utils/session'
import { SENTINEL } from '../../sentinels'

// Runs AFTER the real session middleware (Nitro orders middleware alphabetically:
// 'session' < 'zz'), so this authenticated sentinel session deterministically wins
// even though the test sends no session cookie. The object below is the SERVER-ONLY
// custody surface: its tokens + raw PII must never be serialized into the payload.
export default defineEventHandler((event) => {
  const session = {
    accessToken: SENTINEL.access,
    idToken: SENTINEL.id,
    refreshToken: SENTINEL.refresh,
    sub: 'sub-admin-sentinel',
    sid: SENTINEL.sid,
    subject: 'sub-admin-sentinel',
    email: 'admin@example.test',
    displayName: 'Admin Sentinel',
    role: 'admin',
    expiresAt: 4_102_444_800,
    authTime: null,
    amr: ['pwd'],
    acr: null,
    lastLoginAt: null,
    issuedAt: 1,
    absoluteExpiresAt: 4_102_444_800,
    lastRefreshedAt: 1,
    // Raw government PII present on the server session; masked before any client view.
    nik: SENTINEL.nik,
    nip: SENTINEL.nip,
    nisn: SENTINEL.nisn,
  } satisfies PortalSession & { nik: string; nip: string; nisn: string }

  event.context.session = session
})
```

- [ ] **Step 4: Create the masked principal route (overrides the proxy, no backend)**

Create `services/sso-admin-frontend/test/fixtures/ssr-leak/server/routes/api/admin/me.get.ts`:

```ts
// More-specific route that overrides the base /api/admin/[...] proxy so the global
// admin guard can resolve a principal WITHOUT a live backend. Derives a SAFE, masked
// principal from the server-only sentinel session: no tokens, no raw PII — only
// display fields, role, and capability flags cross to the client. Shape matches
// AdminPrincipalResponse ({ principal: AdminPrincipal }) consumed by the store.
export default defineEventHandler((event) => {
  const session = event.context.session
  if (!session) {
    throw createError({ statusCode: 401, statusMessage: 'unauthenticated' })
  }

  return {
    principal: {
      subject_id: 'sub-admin-sentinel',
      email: 'admin@example.test',
      display_name: 'Admin Sentinel',
      given_name: null,
      family_name: null,
      role: 'admin',
      last_login_at: null,
      auth_context: {
        auth_time: null,
        amr: ['pwd'],
        acr: null,
        mfa_enforced: true,
        mfa_verified: true,
      },
      permissions: {
        view_admin_panel: true,
        manage_sessions: true,
        permissions: ['admin.dashboard.view'],
        capabilities: { 'admin.dashboard.view': true },
        menus: [
          {
            id: 'dashboard',
            label: 'Dashboard',
            required_permission: 'admin.dashboard.view',
            visible: true,
          },
        ],
      },
    },
  }
})
```

- [ ] **Step 5: Set the representative page to the deliberately-unsafe baseline**

This is the naive first attempt at "greet the signed-in admin": expose the whole
server session through `useState`. It is the genuine RED condition the gate must catch
(not an insert-and-revert — the feature is retained and corrected in Step 8).

Replace the full contents of `services/sso-admin-frontend/app/pages/dashboard.vue`:

```vue
<script setup lang="ts">
import type { PortalSession } from '../../server/utils/session'

definePageMeta({ name: 'admin.dashboard', layout: 'admin', requiresAdmin: true, permissions: ['admin.dashboard.view'] })

// NAIVE FIRST ATTEMPT (corrected in this task): expose the whole server session so
// the page can greet the signed-in admin. useState serializes its initial value into
// the __NUXT_DATA__ payload (window.__NUXT__) — leaking OIDC tokens + raw PII.
const event = useRequestEvent()
const session = (event?.context.session ?? null) as PortalSession | null
const dbg = useState<PortalSession | null>('dbg', () => session)
</script>

<template>
  <section data-page="dashboard">
    <h1>Dashboard</h1>
    <p data-principal-name>Signed in as {{ dbg?.displayName ?? '—' }}</p>
  </section>
</template>
```

- [ ] **Step 6: Write the failing gate test**

Create `services/sso-admin-frontend/test/ssr-token-leak.gate.spec.ts`:

```ts
import { fileURLToPath } from 'node:url'
import { describe, it, expect, beforeAll } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils/e2e'
import { SENTINEL, SSR_LEAK_CANARY } from './fixtures/ssr-leak/sentinels'

// §3.3 SSR token-leak render gate (the crown jewel). Renders a REAL authenticated
// admin page under full SSR with a mocked event.context.session that carries sentinel
// OIDC token VALUES and raw-PII VALUES (NIK 16 / NIP 18 / NISN 10 digits), then asserts
// neither the rendered HTML nor the parsed Nuxt hydration payload (__NUXT_DATA__, the
// SSR-serialized form of window.__NUXT__) contains any of them, nor the private
// runtimeConfig canary. Tokens + raw PII must stay in Nitro event.context only.

function extractPayload(html: string): string {
  const match = html.match(/<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
  if (!match) {
    throw new Error('no __NUXT_DATA__ hydration payload found in SSR HTML')
  }
  return match[1]
}

function assertNoSecretValues(haystack: string, where: string): void {
  // OIDC token VALUES.
  expect(haystack, `${where} leaks the access-token value`).not.toContain(SENTINEL.access)
  expect(haystack, `${where} leaks the refresh-token value`).not.toContain(SENTINEL.refresh)
  expect(haystack, `${where} leaks the id-token value`).not.toContain(SENTINEL.id)
  expect(haystack, `${where} leaks the session-id (sid) value`).not.toContain(SENTINEL.sid)
  // OIDC token field NAMES (camelCase session shape + snake_case OIDC wire shape).
  expect(haystack, `${where} leaks a token field name`).not.toMatch(
    /accessToken|refreshToken|idToken|access_token|refresh_token|id_token/,
  )
  // Raw government PII VALUES.
  expect(haystack, `${where} leaks the raw NIK value`).not.toContain(SENTINEL.nik)
  expect(haystack, `${where} leaks the raw NIP value`).not.toContain(SENTINEL.nip)
  expect(haystack, `${where} leaks the raw NISN value`).not.toContain(SENTINEL.nisn)
  // Private runtimeConfig canary + private secret field names.
  expect(haystack, `${where} leaks the runtimeConfig canary`).not.toContain(SSR_LEAK_CANARY)
  expect(haystack, `${where} leaks a private secret field name`).not.toMatch(
    /sessionEncryptionSecret|adminOidcClientSecret/,
  )
}

function assertNoPiiShapes(payload: string, where: string): void {
  // Word-bounded digit runs. 16/18/10 do not overlap: a 16-digit run is not a
  // boundary-isolated 10-digit run, so the regexes are mutually exclusive.
  expect(payload, `${where} leaks a 16-digit NIK-shaped value`).not.toMatch(/(?<!\d)\d{16}(?!\d)/)
  expect(payload, `${where} leaks an 18-digit NIP-shaped value`).not.toMatch(/(?<!\d)\d{18}(?!\d)/)
  expect(payload, `${where} leaks a 10-digit NISN-shaped value`).not.toMatch(/(?<!\d)\d{10}(?!\d)/)
}

describe('SSR token-leak render gate (§3.3)', () => {
  beforeAll(async () => {
    await setup({
      rootDir: fileURLToPath(new URL('./fixtures/ssr-leak', import.meta.url)),
      server: true,
      browser: false,
    })
  })

  it('renders the authenticated dashboard server-side (safe channel works)', async () => {
    const html = await $fetch('/dashboard')
    expect(html).toContain('data-page="dashboard"')
    expect(html).toContain('Admin Sentinel')
  })

  it('does not leak token/PII/secret values into the SSR HTML', async () => {
    const html = await $fetch('/dashboard')
    assertNoSecretValues(html, 'SSR HTML')
  })

  it('does not leak token/PII/secret values into the hydration payload', async () => {
    const html = await $fetch('/dashboard')
    const parsed = JSON.parse(extractPayload(html))
    const serialized = JSON.stringify(parsed)
    assertNoSecretValues(serialized, '__NUXT__ payload')
    assertNoPiiShapes(serialized, '__NUXT__ payload')
  })
})
```

- [ ] **Step 7: Run the gate and confirm it FAILS against the unsafe baseline**

Run: `npx vitest run test/ssr-token-leak.gate.spec.ts`

Expected: FAIL — the unsafe `useState('dbg', () => session)` serializes the sentinel
session into `__NUXT_DATA__`, so both the HTML grep and the payload grep trip. The
first `it` ("safe channel works") PASSES (the page still renders `Admin Sentinel`),
proving the RED is a real leak and not a missing feature. Deterministic output:

```
 FAIL  test/ssr-token-leak.gate.spec.ts > SSR token-leak render gate (§3.3) > does not leak token/PII/secret values into the SSR HTML
AssertionError: SSR HTML leaks the access-token value: expected … not to contain 'SENTINEL-ACCESS-TOKEN-3f9a2c7d1e'

 FAIL  test/ssr-token-leak.gate.spec.ts > SSR token-leak render gate (§3.3) > does not leak token/PII/secret values into the hydration payload
AssertionError: __NUXT__ payload leaks the access-token value: expected … not to contain 'SENTINEL-ACCESS-TOKEN-3f9a2c7d1e'

 Test Files  1 failed (1)
      Tests  2 failed | 1 passed (3)
```

- [ ] **Step 8: Apply the safe-hydration pattern (the real implementation)**

Correct the representative page so it still greets the signed-in admin, but hydrates
ONLY the masked principal via the session store. Tokens + raw PII never enter
`useState`/the payload — they stay in Nitro `event.context`. The `useAsyncData` call
resolves the principal server-side (no client bootstrap flash) and serializes only its
result string (`'authenticated'`) plus the masked principal — all safe fields.

Replace the full contents of `services/sso-admin-frontend/app/pages/dashboard.vue`:

```vue
<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useSessionStore } from '../stores/session.store'

definePageMeta({ name: 'admin.dashboard', layout: 'admin', requiresAdmin: true, permissions: ['admin.dashboard.view'] })

// SAFE HYDRATION: resolve the masked principal server-side via the session store
// (display name, role, capability flags only). OIDC tokens + raw PII stay in Nitro
// event.context and are never written to useState / the __NUXT__ payload.
const store = useSessionStore()
await useAsyncData('admin-dashboard-principal', () => store.ensureSession())
const { principal } = storeToRefs(store)
</script>

<template>
  <section data-page="dashboard">
    <h1>Dashboard</h1>
    <p data-principal-name>Signed in as {{ principal?.display_name ?? '—' }}</p>
  </section>
</template>
```

- [ ] **Step 9: Run the gate and confirm it PASSES**

Run: `npx vitest run test/ssr-token-leak.gate.spec.ts`

Expected: PASS — the masked principal carries no token values/names, no raw-PII
values, and no 16/18/10-digit runs; the canary stays in private runtimeConfig.
Deterministic output:

```
 ✓ test/ssr-token-leak.gate.spec.ts (3 tests)
   ✓ SSR token-leak render gate (§3.3) > renders the authenticated dashboard server-side (safe channel works)
   ✓ SSR token-leak render gate (§3.3) > does not leak token/PII/secret values into the SSR HTML
   ✓ SSR token-leak render gate (§3.3) > does not leak token/PII/secret values into the hydration payload

 Test Files  1 passed (1)
      Tests  3 passed (3)
```

- [ ] **Step 10: Run the full Nuxt test suite + typecheck (phase gate)**

Run: `npm run test && npm run typecheck`

Expected: PASS — the new gate plus the prior Nuxt-era suites (`test/ssr-smoke.spec.ts`
from Task 0.4, the ported BFF/shell suites) all green, and `vue-tsc` reports
`0 errors`. The fixture's deep relative type import (`PortalSession`) and the SFC
(`AdminPrincipal.display_name`, `useSessionStore`) typecheck against the real sources.

```
 Test Files  N passed (N)
      Tests  M passed (M)

> vue-tsc --noEmit
(no output — 0 errors)
```

- [ ] **Step 11: Commit**

```bash
git add test/fixtures/ssr-leak test/ssr-token-leak.gate.spec.ts app/pages/dashboard.vue
git commit -m "test(sso-admin-frontend): SSR token-leak render gate (§3.3)

Render the authenticated dashboard under full SSR with a sentinel
event.context.session (access/refresh/id/sid tokens + raw NIK/NIP/NISN)
and a private runtimeConfig canary. Assert the rendered HTML and the
parsed __NUXT_DATA__ hydration payload contain none of the sentinel token
values or names, none of the raw-PII values or 16/18/10-digit shapes, and
not the canary. The representative page is corrected from a naive
useState(dbg, () => session) leak to safe store-backed hydration; tokens
and raw PII stay in Nitro event.context. Lands the render-level gate that
Task 1.15 deferred, replacing its insert-and-revert RED.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

**Notes (authority + FIXES compliance):**
- Satisfies FIXES §3.3 in full: representative AUTHENTICATED page; mocked `event.context.session` with sentinel token VALUES + raw-PII shaped as NIK(16)/NIP(18)/NISN(10); asserts rendered HTML AND parsed `window.__NUXT__` (`__NUXT_DATA__`) contain none of the token values, PII values, or the private runtimeConfig canary; honest RED→GREEN against a real `useState('dbg', () => session)` baseline (no insert-and-revert); greps cover token NAMES and VALUES plus the `\d{16}`/`\d{18}`/`\d{10}` PII regexes; uses `@nuxt/test-utils` SSR rendering (`setup` + `$fetch`, `browser: false` — no chromium needed).
- Absorbs the FIXES "FIX 1.15" directive: this is the concrete render-level gate that Task 1.15's header TODO deferred to "Phase 2"; Task 1.15's unit-level `event.context` custody check remains as its complement.
- The `\d{10}` shape regex runs only against the PARSED payload (not the raw HTML) so hashed `_nuxt` asset URLs cannot cause false positives; the safe payload contains no 10/16/18-digit runs because the masked principal exposes no epochs or raw identifiers (the server-only `expiresAt` 10-digit epoch stays in `event.context`).
- DRY/YAGNI: one `sentinels.ts` feeds injection + assertions; the fixture reuses the real app via a Nuxt layer (`extends`) rather than duplicating pages/components/routes.
