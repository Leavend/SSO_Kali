# Phase 6 — Observability + Compliance Implementation Plan

**For agentic workers — REQUIRED SUB-SKILL:** Execute this plan with `superpowers:executing-plans`, and for **every** task below invoke `superpowers:test-driven-development` (RED → GREEN → REFACTOR). Never write implementation code before a failing test exists; never claim PASS without running the exact command and reading its output (`superpowers:verification-before-completion`).

## Goal

Port the admin **Observability + Compliance** governance domain to the Nuxt 4 (full SSR) + Swiss stack on branch `feat/admin-frontend-nuxt4-ssr-swiss-redesign`. The domain is two pages joined by named-route redirects:

- **`/observability`** (`pages/observability/index.vue`) — the read-only **operations cockpit**: the masked summary returned by `GET /admin/api/observability/summary` (service health, queue/auth/admin metrics, recent log events, trace availability), behind `admin.observability.read`.
- **`/observability/compliance`** (`pages/observability/compliance.vue`) — the **compliance / audit-evidence / DSR console**: retention status (`GET /admin/api/audit/retention`), the data-subject-request queue (`GET /admin/api/data-subject-requests` + review/fulfill lifecycle), and the two **file-download** evidence flows — the audit export (`GET /admin/api/audit/export`) and the compliance evidence-pack (`GET /admin/api/compliance/evidence-pack`) — behind `admin.observability.read`, with each write/export gated on its own backend permission.
- **`/audit` → `/observability`** and **`/audit/compliance` → `/observability/compliance`** legacy redirects (already page-based; this plan confirms them, no rebuild).

Both pages implement all six states (loading · unauthenticated · forbidden · error · empty · ready); empty distinguishes "no data" from "no permission"; the DSR queue masks subject PII; and **no token, secret, or raw PII may enter the SSR HTML or the `__NUXT__` hydration payload**.

The **defining new mechanic of this domain is the blob download**: the audit export and the compliance evidence-pack are streamed `Content-Disposition: attachment` files fetched via `apiClient.getBlob` (filename parsed from the response header), triggered as a **client-side** object-URL/anchor download, treated as a **privileged action** (confirm + impact summary + the full `401/403/419/422/428/429/5xx` + fresh-auth/step-up matrix + audit/correlation evidence), and **never** persisted to `useState`/Pinia/storage nor run during SSR.

## Architecture

Request/data flow (read paths server-side during SSR, re-used on client navigation; the blob downloads are client-only POST-confirm flows):

```
pages/observability/index.vue
  ├─ useAsyncData('admin-observability-principal', () => sessionStore.ensureSession())   // safe masked principal
  └─ useObservabilitySummary()                                                           // SSR data boundary
        └─ useAsyncData('admin-observability-summary', () => observabilityApi.getSummary())
              └─ observabilityApi.getSummary() → apiClient.get('/api/admin/observability/summary')
                    └─ Nitro server/routes/api/admin/[...].ts → handleAdminApiProxy
                       (inject Bearer from event.context, rewrite /api/admin/* → /admin/api/*)

pages/observability/compliance.vue
  ├─ useAsyncData('admin-compliance-principal', () => sessionStore.ensureSession())
  ├─ useRetentionStatus()      → useAsyncData('admin-retention-status', () => observabilityApi.getRetention())
  ├─ useDataSubjectRequests()  → useAsyncData('admin-dsr-list', () => observabilityApi.listDataSubjectRequests())
  ├─ ComplianceExportPanel  (export + evidence-pack — client-only BLOB downloads)
  │     └─ usePrivilegedAction<BlobResponse>() + PrivilegedActionDialog (Phase 4, reused as-is)
  │           → on success: triggerBlobDownload(blob, fallback)   // import.meta.client only, never SSR
  └─ DsrQueueTable + DsrReviewActions
        └─ usePrivilegedAction() + PrivilegedActionDialog (reasonRequired notes)
              → on success: useDataSubjectRequests().refresh()  (explicit, never stale)

pages/audit/index.vue        → navigateTo({ name: 'admin.observability' }, { replace: true })            // existing
pages/audit/compliance.vue   → navigateTo({ name: 'admin.observability.compliance' }, { replace: true }) // existing
```

- **Pure logic** (no Nuxt, no network) lives under `app/lib/observability/` and `app/lib/compliance/`: DTO-agnostic view-state + status-tone (`observability-view-state.ts`, `compliance-view-state.ts`), the audit-export + evidence-pack query builders and the evidence-pack `canSubmit` rule (`audit-export.ts`), and the DSR list filter/paginate helpers (`dsr-list.ts`). This mirrors the Phase-3/4 pure-resolver split so every matrix is unit-testable without a Nuxt context.
- **Blob trigger** `app/lib/api/download-blob.ts` is the **one** net-new browser-only primitive (DOES NOT EXIST today): object-URL → anchor → click → revoke, guarded `import.meta.client`, with a filename fallback.
- **Service** `app/services/observability.api.ts` is the single network seam (copy-and-adapt of `app/services/dashboard.api.ts`) and the **first** consumer of `apiClient.getBlob` for the two downloads.
- **Composables** `useObservabilitySummary.ts` (copy `useDashboardSummary.ts`), `useRetentionStatus.ts` (copy `useDashboardSummary.ts`), `useDataSubjectRequests.ts` (copy `useUsersList.ts`) wrap `useAsyncData`; `usePrivilegedAction` is **reused from Phase 4, not rebuilt**.
- **Components** under `app/components/observability/`: `ObservabilityServiceList.vue` + `ObservabilityLogList.vue` (Swiss `UiDataList`), reusing `DashboardMetricGroup.vue` (Phase 3, domain-agnostic) for the metric rows; and under `app/components/compliance/`: `ComplianceExportPanel.vue` (the two blob-download privileged forms), `DsrQueueTable.vue` (masked DSR table over `UiDataList`), `DsrReviewActions.vue` (review/fulfill via the reused `PrivilegedActionDialog`). The destructive/async-confirm dialog is the Phase-4 `app/components/users/PrivilegedActionDialog.vue`, **reused as-is**.
- **State surfaces** reuse the Swiss DS: `UiSkeleton` (loading), `UiStatusView` (forbidden / unauthenticated / error / step-up, with built-in request-ref redaction), `UiEmptyState` (no data), `UiStatusBadge` (service/DSR status, never colour-alone), `UiFolio` (record counts, timestamps, correlation/request/subject IDs as folio composition elements).
- **Backend stays the security boundary.** `admin-guard.global.ts` gates routes by role + meta permissions; each page additionally renders a safe forbidden/step-up surface if the backend rejects despite the UI.
- **Out of scope (backend does not expose / not in the Phase-6 endpoint set):** the audit-event list/detail (`/audit/events*`), the authentication-event view (`/audit/authentication-events*`), and the standalone integrity endpoint (`/audit/integrity`) are **not** in the Phase-6 backend contract (extract-backend §endpoint table) — integrity is surfaced only inside the evidence-pack payload, not as its own page (§7.4 trade-off). The legacy cockpit's decorative circular gauges, terminal-style log console, and static trace SVG are **not** carried forward (extract-legacy §4 anti-patterns); logs/metrics/traces render as Swiss `UiDataList`/`DashboardMetricGroup`/status-badge surfaces. There is **no** Pinia observability/audit store — list/summary state is `useAsyncData`-owned. Real (non-dry-run) DSR fulfillment is wired through the same action (the legacy UI only ever called `dry_run`); the dry-run vs. commit choice is an explicit confirm option.
- **Rationale / scope notes (settled decisions):** (1) the compliance page's `empty` is a **per-section** state — the retention and DSR panels each distinguish *no data* from *no permission* independently; there is **no** page-level `empty` (the page-level surface is only loading/unauthenticated/forbidden/error/ready). (2) The retention (backend `admin.audit.read`) and DSR (backend `admin.dsr.read`) **sub-permissions are gated at the single route permission** (`admin.observability.read`) per spec — the page does not re-gate reads per panel; the backend stays the authoritative boundary and re-checks every read. (3) The DSR queue **filters client-side** (status/search/paginate over the hydrated, narrowed list — consistent with the Phase-4/5 `useUsersList`/`useClientsList` pattern; the queue is small and the backend remains the permission boundary), so `listDataSubjectRequests` is a plain GET with no query string.

## Tech Stack

- **Nuxt 4** (`ssr: true`, universal), **Vue 3.5** SFC, **TypeScript strict**.
- **Pinia** (`admin-session` store — existing; consumed read-only for principal + `hasPermission`).
- **Data:** `useAsyncData` + typed `apiClient` over `$fetch`/`useRequestFetch` (`app/lib/api/api-client.ts`, `ApiError` with `status`/`code`/`requestId`/`payload`, `getLastRequestId()`, `getBlob` → `BlobResponse` + `filenameFromContentDisposition`).
- **UI:** Swiss DS components in `app/components/ui/*` + `app/components/form/*`, `lucide-vue-next` icons, Tailwind v4 + `assets/tokens.css` Swiss tokens. Reka UI keeps a11y primitives (`UiDialog`/`UiAlertDialog`).
- **i18n:** `app/composables/useI18n.ts` (`id` default, `en`), catalogs `app/locales/{id,en}.json` — a legacy `audit.*` block (~100 keys: states, export/evidence-pack/retention/DSR copy) already exists in BOTH files; **ADAPT/rename it to `observability.*`** rather than authoring fresh, keeping id↔en parity. ADD only genuinely-new keys, to BOTH files.
- **Tests:** Vitest 4 (`npm run test` = `vitest run`); `@nuxt/test-utils/runtime` (`mountSuspended`, `renderSuspended`, `mockNuxtImport`) for `*.nuxt.spec.ts` (auto-routed to the `nuxt` env by filename); `@vue/test-utils` + jsdom for plain `*.spec.ts`; `@nuxt/test-utils/e2e` for the SSR leak gate; Playwright for the e2e (`npm run test:e2e`). Every `vi.fn` carries a type parameter; service mocks use `vi.mock('@/services/observability.api', …)`; the SSR gate collects-then-`expect(value).toEqual([])` (no `expect(value, message)` — oxlint `jest/valid-expect`).

## Global Constraints

Binding values for every task. A task is **not done** if any is violated.

- **Full SSR** (`ssr: true`): principal + summary + retention + DSR list resolve **server-side** (no client bootstrap flash). `useAsyncData` settles before the payload is serialized. The blob downloads are the explicit exception — they are **client-initiated** and must **never** run during SSR.
- **SSR token-leak guard (design §3.3, mandatory — verbatim):** "Under universal SSR, server-fetched data is serialized into the page payload (`window.__NUXT__`). Tokens, session secrets, and raw PII must **never** enter the SSR HTML or the hydrated payload. Tokens live only in the Nitro request context (`event.context`), read per request from the encrypted session cookie and injected into upstream calls server-side. Only **safe, already-masked DTOs and safe principal fields** (display name, role, capability booleans, menus) hydrate to the client. A dedicated test gate asserts the SSR HTML + `__NUXT__` payload contain no token/secret/raw-PII patterns." **FORBIDDEN in SSR HTML / `__NUXT_DATA__`:** access/refresh/ID tokens (values + field names `accessToken|refreshToken|idToken|access_token|refresh_token|id_token`), session/client secrets (incl. field names `sessionEncryptionSecret|adminOidcClientSecret|client_secret|clientSecret|plaintext_secret|plaintext_once`), any credential; raw NIK(16)/NIP(18)/NISN(10) digit runs; raw backend exceptions; known secret env values; the `SSR_LEAK_CANARY`. **Allowed to hydrate:** safe already-masked DTOs (observability summary, retention status, DSR list) and safe principal fields. `test/ssr-token-leak.gate.spec.ts` is **extended** this phase (Task 6.12) to cover the **observability summary + retention + DSR DTOs** with new fixture routes and leak-assertion `it()`s mirroring the dashboard/users blocks.
- **DSR-PII masking (design §3.3 / §9 PII minimization):** the DSR list payload carries `subject_id` (opaque OIDC subject id) **only** — **no** email/NIK/NIP/NISN/name, and **no** free-text `reason`/`reviewer_notes`/`reviewer_subject_id` (the shared backend presenter emits those, but they are stripped **per row at runtime** by `observability.api.listDataSubjectRequests` — Task 6.4 — and the strip is proven by the gate canary in Task 6.12; type-narrowing alone does not remove serialized keys). The UI renders `subject_id` **masked** via `formatTechnicalPreview` (`REF-<last8>`, `@/lib/display-identifiers`), labeled as an account code; "show only the identifier needed for a safe action, not every sensitive field." Raw subject identifiers and reviewer free-text are never rendered, logged, or serialized.
- **Blob-download discipline (BINDING, the defining new mechanic — non-negotiable):**
  - The audit export and evidence-pack are fetched **only** via `observabilityApi.exportAuditTrail` / `generateEvidencePack`, which call `apiClient.getBlob(path)` returning `BlobResponse = { blob: Blob; filename: string | null }`. The filename comes from `Content-Disposition` (`filenameFromContentDisposition`); a format-derived **fallback** is used when the header is absent (`admin-audit-events.<format>`, `compliance-evidence-pack.<format>`).
  - The download is triggered **only in the browser** by `triggerBlobDownload` (`app/lib/api/download-blob.ts`, NEW): `URL.createObjectURL(blob)` → `<a download rel="noopener">` → `.click()` → `URL.revokeObjectURL(url)` immediately. It is `import.meta.client`-guarded and is a **no-op / never invoked during SSR**. DOM is kept out of the service/composable layers.
  - The blob is **NEVER** persisted to `useState`, Pinia, `localStorage`/`sessionStorage`/`IndexedDB`, a query string/hash, the console, or any long-lived store — it lives only as the transient `BlobResponse` returned by `usePrivilegedAction.run` and is consumed and discarded in the same client tick. It is therefore never part of the SSR payload.
  - A non-2xx blob response throws `ApiError` exactly like a JSON mutation (a 428 step-up on an export throws `ApiError{status:428,code:'fresh_auth_required'}`), so the export/evidence flows route through the **same** privileged-action failure matrix.
  - The Nitro admin-proxy already forwards binary responses unchanged (`Buffer.from(await response.arrayBuffer())`; `Content-Type`/`Content-Disposition` pass through `buildProxyResponseHeaders`). No proxy code change is required — Task 6.4 adds a **regression assertion** that the proxy preserves `Content-Type`/`Content-Disposition` on a binary upstream response (binary passthrough is asserted, not assumed).
- **Export-as-privileged-action rule (design §8 / standart-quality-code §8 — verbatim classes `write | destructive | export | one-time-secret | operational-evidence`):** the audit export and the evidence-pack are **export** privileged actions and MUST get the full treatment — "confirmation with impact summary; destructive primary disabled until confirmation valid; cancel calls no API; loading/disabled reset after error; fresh-auth/step-up/MFA-assurance state honored when backend requires it; audit/correlation evidence shown or stored appropriately." Integrity/evidence status is distinguished from ordinary UI success. Operational-evidence note (TDD PHASE 7): both downloads contribute to **"audit export and integrity evidence"** + the evidence-pack to "backup/restore evidence pack" — document this in the PR summary.
- **Privileged-action test matrix (TDD §4 — every export + DSR review/fulfill action; failing tests BEFORE implementation):** 4.1 allowed success · 4.2 missing permission / 403 · 4.3 unauthenticated / 401 · 4.4 CSRF or session expired / 419 (if applicable) · 4.5 rate limit / 429 · 4.6 validation error / 422 · 4.7 fresh-auth / step-up / MFA-assurance required (**428**/412/`reauth_required`/`step_up_required`, surfaces `step_up_url`) · 4.8 backend 5xx with safe error copy · 4.9 audit/correlation id shown or stored when backend sends it · 4.10 action leaves **no** stale loading/disabled state after an error. Destructive/confirm tests: impact summary visible before submit · primary button disabled until confirmation valid · cancel calls **no** API · success state shows no secret/PII excess. Per-feature permission matrix: unauthenticated → redirect/session-expired · non-admin → forbidden · admin w/o permission → forbidden/action hidden · admin w/ permission → usable · backend 403 despite UI → safe forbidden.
- **HTTP failure set (safe copy, never raw backend exception):** `401`, `403`, `419` (if applicable), `422`, `428` (step-up/Precondition-Required), `429`, `5xx`. Error surfaces show safe copy + a redacted support reference (`REF-XXXXXXXX` via `formatSupportReference`) + a request/correlation id when the backend sends it; raw request ids and raw exceptions are never rendered (design §8; quality §5.3).
- **No browser token handling:** no access/refresh/ID token, secret, or credential is created, exchanged, read, stored, or logged in the browser. The SPA is token-blind; the Admin BFF (`admin-proxy.ts`) injects the Bearer server-side. No OAuth code/token exchange in the browser.
- **Same-origin session only:** admin calls use same-origin relative paths (`/api/admin/observability/summary`, `/api/admin/audit/retention`, `/api/admin/audit/export`, `/api/admin/compliance/evidence-pack`, `/api/admin/data-subject-requests*`) and the encrypted session cookie (`credentials:'include'`, `Accept: application/json`); no token headers minted in the browser; query strings are built only by the pure query builders (Task 6.2), never from unvalidated free input.
- **No direct `fetch`/`$fetch` in pages or components** — the network is reached only through `observabilityApi` (the service) via `apiClient`.
- **Swiss design discipline:** tokens-only (no hard-coded colours), **no shadows** as structure (1px hairline `--border #E5E5E7`), radius ~0–2px, **single accent `--accent #002FA7`** (interactive/brand), red `--danger #E4002B` used **only** as functional/destructive (down/failed status, DSR reject, DSR fulfill-commit) and on critical-status badges — the **export confirm/impact/step-up stays accent/warning, never danger red** — always paired with a text label, **never colour-alone**, never brand; status **never colour-alone** (tone + label/shape via `UiStatusBadge`). `--font-sans` (`'Söhne','Helvetica Neue',Helvetica,Arial,sans-serif`) is the single family; **`--font-mono` reserved ONLY for raw IDs/correlation values**. **Folio numerals (the §7.3 differentiator, must be visible in rendered output):** record counts (`02 / 14`), timestamps, and correlation/request/SID/client/subject IDs render as condensed-sans folio composition elements anchored to a visible 1px hairline grid via `UiFolio` — table headers, log-event rows, DSR rows, and drawer margins are the load-bearing folio surfaces for this domain. Standard labels/copy only ("Audit events", "Export", "Retention", "Save", "Cancel") — no themed copy, mono-caps filler subtitles, `//` kickers, unicode-glyph icons (use Lucide), or fabricated telemetry/personas.
- **Permission-aware (route + nav + action):** page meta declares `permissions` per the route map; `admin-guard.global.ts` enforces role + permission (ensure principal, `hasAdminRole`, `hasEveryPermission`, redirect `/forbidden`; map bootstrap failures `mfa_enrollment_required → /mfa-required`, `step_up_required → /step-up-required`, unreachable → `/admin-api-unreachable`); each page also handles a backend `401/403/428` defensively. Action visibility is gated by `sessionStore.hasPermission(...)`. Permission strings follow the backend contract **verbatim** — never ad-hoc:

  | Path | Page | meta `permissions` | Write/export actions on the surface (permission · freshness window) |
  |---|---|---|---|
  | `/observability` | `pages/observability/index.vue` | `admin.observability.read` | (read-only — no write/export) |
  | `/observability/compliance` | `pages/observability/compliance.vue` | `admin.observability.read` | audit export (`admin.audit.export` · `:step_up`); evidence-pack (`admin.audit.export` · `:step_up`); DSR review (`admin.dsr.review` · `:step_up`); DSR fulfill (`admin.dsr.review` · `:step_up`) |
  | `/audit` | `pages/audit/index.vue` | — (redirect → `admin.observability`, `replace:true`) | — |
  | `/audit/compliance` | `pages/audit/compliance.vue` | — (redirect → `admin.observability.compliance`, `replace:true`) | — |

  Both content pages gate on the **same** `admin.observability.read` at the route level (access-minimization: an operator without it sees no observability/compliance data even where the backend read would allow it). Within the compliance page: the retention read (backend `admin.audit.read`) and DSR read (backend `admin.dsr.read`) are served once the page is reachable; the **export/evidence-pack buttons are additionally gated on `admin.audit.export`** and the **DSR review/fulfill buttons on `admin.dsr.review`** — hidden when absent, and the backend re-checks regardless. **Step-up window:** the four write/export routes carry `EnsureFreshAdminAuth:step_up` (scope `session_management`, freshness `ADMIN_PANEL_STEP_UP_AUTH_SECONDS` default **900s/15min**); stale auth returns a JSON error with `step_up_url` → surfaced via the privileged-action `stepUpUrl`. `EnsureAdminMfaAssurance` is on **every** endpoint (read + write). Internal navigation uses **named route refs** (`admin.observability` / `admin.observability.compliance`), never hardcoded path strings; the two `/audit*` redirect pages stay page-based (`definePageMeta({ layout: false })` + top-level `await navigateTo({ name }, { replace: true })`).
- **Degraded/stale handling:** the observability summary and retention are **resilient** — a failing section degrades to a fallback (`partial=true`, named in `degraded`); the composables keep the last good snapshot on a background-refresh failure (`isStale = error && data !== null`), shown with a stale notice rather than blanking the page. After any DSR action, **explicitly refresh** the list (never leave it stale).
- **No-traceability-markers:** new code must NOT contain `OG#`, `UC###`, `FR###`, `BE-FR###`, `ISS-*`-style identifiers in names, comments, routes, tests, or config — descriptive domain names only (the legacy `features/audit` carried `UC-65`/`ISS-C3`/`ISS-LCP1` markers; do **not** carry them forward). Traceability lives in docs/commits only.
- **REUSE Phase-3/4/5 infrastructure — do NOT duplicate it (binding):** consume the existing infra **from its existing path as-is**, never copied into an `observability/`/`compliance/` path:
  - `app/lib/users/privileged-action.ts` — `resolvePrivilegedActionFailure(error: unknown): PrivilegedActionFailure`, `PrivilegedActionStatus`, `PrivilegedActionFailure` (the pure HTTP-error→state matrix; step-up first on 428/412/`reauth_required`/`step_up_required`). Domain-agnostic despite the `users/` path — imported directly.
  - `app/composables/usePrivilegedAction.ts` — `usePrivilegedAction<T>(): { status, isSubmitting, failure, requestId, auditEventId, fieldErrors, stepUpUrl, run, reset }`. **For exports `T = BlobResponse`**: `run(() => observabilityApi.exportAuditTrail(filters))` returns the blob on success (then call `triggerBlobDownload`) or `null` on failure (dialog shows error/step-up/REF).
  - `app/components/users/PrivilegedActionDialog.vue` — the async-hold confirm dialog (parent owns `open`; confirm is NOT an `AlertDialogAction` and stays open through submit; renders only redacted `REF-…`). Used for export (reasonless confirm), evidence-pack (reasonless confirm), DSR review (reasonRequired notes), DSR fulfill (dry-run/commit confirm).
  - `app/lib/users/user-actions.ts` — `ReasonPolicy`, `isReasonValid(policy, value)` reused for the DSR review notes policy (never re-declared).
  - `app/components/dashboard/DashboardMetricGroup.vue` (+ `DashboardMetricRow`) — Phase-3, domain-agnostic; reused **directly** for the observability metric rows.
  All other reuse is **copy-and-adapt** of the named file (swap dashboard/users → observability/compliance): `useDashboardSummary.ts` → `useObservabilitySummary.ts` + `useRetentionStatus.ts`; `dashboard-view-state.ts` → `observability-view-state.ts`; `useUsersList.ts` + `users-list.ts` + `users-view-state.ts` → `useDataSubjectRequests.ts` + `dsr-list.ts` + `compliance-view-state.ts`; `dashboard.api.ts` → `observability.api.ts`; `dashboard.vue` → `observability/index.vue`; `users/index.vue` (all-states list shell) → `observability/compliance.vue`. Also reuse verbatim: DS components (`UiButton/UiInput/UiSelect/UiSwitch/UiTextarea/UiStatusBadge/UiDataList/UiDetailDrawer/UiDialog/UiAlertDialog/UiEmptyState/UiSkeleton/UiStatusView/UiFolio`, `FormPageShell/FormSection/UiFormField`), `apiClient` + `getBlob` + `getLastRequestId` + `ApiError`, `resolveStatusTone` (`@/lib/status-tone`), `display-identifiers` (`formatSupportReference`/`redactTechnicalIdentifiers`/`formatTechnicalPreview`), the session store permission helpers, and the legacy `audit.*` locale keys. The Nitro proxy allow-list (`server/utils/admin-proxy.ts`) **already contains** every Phase-6 route (summary, retention, export, evidence-pack, DSR list + review/fulfill patterns) — Task 6.4 **verifies** and adds new rows only if a new sub-route is introduced.
- **TDD:** RED → GREEN → REFACTOR per task; at least one assertion fails because the behaviour is missing (not a typo); commit only on green.
- **Definition-of-Done gate (run from `services/sso-admin-frontend`; report any blocked command explicitly, never claim PASS for a command that did not run):**
  `npm run typecheck && npm run lint && npm run format:check && npm run test && npm run build`, plus `npm run test:e2e` (the observability + compliance routes, the redirects, and the export/download flow change route/navigation/critical governance UI — they qualify). **`npm run lint` runs BOTH `lint:oxlint` (`oxlint .`) AND `lint:eslint` (`eslint "app/**/*.vue"`) — both must pass.**
- **Conventional commits**, each ending with the trailer:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`


---

### Task 6.1: Observability + Compliance DTO types + pure view-state / status-tone resolvers

Pure types and pure functions first — no Nuxt, no network. Establishes the masked DTO shapes (mirroring extract-backend §"Exact JSON shapes" verbatim: the rich observability summary, the retention status, and the DSR item — **no email/NIK/NIP/NISN/name on any DTO**; `subject_id` is the only subject identifier and is opaque) plus the view-state mapping each composable/page consumes (error-first security branch; summary/list-empty distinct from forbidden; the DSR resolver mirrors `resolveUsersViewState`). Copy-and-adapt of `app/lib/dashboard/dashboard-view-state.ts` (Task 3.1) + `app/lib/users/users-view-state.ts` (Phase 4). `resolveServiceStatusTone`/`resolveDsrStatusTone` delegate to the existing `resolveStatusTone` alias map where possible (healthy→success, degraded→warning, down→danger, unknown→neutral; submitted/on_hold→warning, approved/fulfilled→success, rejected→danger, cancelled→neutral).

**Files**
- Create: `app/types/observability.types.ts`
- Create: `app/types/compliance.types.ts`
- Create: `app/lib/observability/observability-view-state.ts`
- Create: `app/lib/compliance/compliance-view-state.ts`
- Test: `app/lib/observability/__tests__/observability-view-state.spec.ts`
- Test: `app/lib/compliance/__tests__/compliance-view-state.spec.ts`

**Interfaces**
- Produces (`app/types/observability.types.ts`):
  - `type ObservabilityServiceStatus = 'healthy' | 'degraded' | 'down' | 'unknown'`
  - `type ObservabilityQueue = { readonly pending_jobs: number; readonly failed_jobs: number; readonly oldest_pending_age_seconds: number | null }`
  - `type ObservabilityService = { readonly key: string; readonly name: string; readonly status: ObservabilityServiceStatus; readonly summary: string; readonly latency_p95_ms?: number | null; readonly freshness_seconds?: number; readonly checks?: Readonly<Record<string, boolean>>; readonly queue?: ObservabilityQueue }`
  - `type ObservabilityMetrics = { readonly window_seconds: number; readonly freshness_seconds?: number; readonly queue?: ObservabilityQueue; readonly performance?: Readonly<Record<string, unknown>>; readonly auth_funnel?: Readonly<Record<string, number>>; readonly admin_activity?: Readonly<Record<string, number>> }`
  - `type ObservabilityLogSeverity = 'info' | 'warning' | 'error' | string`
  - `type ObservabilityLogEvent = { readonly id?: string; readonly service: string; readonly severity: ObservabilityLogSeverity; readonly message: string; readonly reference?: string | null; readonly occurred_at?: string | null }`
  - `type ObservabilityTraces = { readonly status: string; readonly reason: string; readonly next_step?: string; readonly last_seen_trace_id?: string | null }`
  - `type ObservabilitySummary = { readonly generated_at: string; readonly partial: boolean; readonly degraded: readonly string[]; readonly services: readonly ObservabilityService[]; readonly metrics: ObservabilityMetrics; readonly freshness?: { readonly recent_events_seconds?: number }; readonly logs: readonly ObservabilityLogEvent[]; readonly traces: ObservabilityTraces }`
- Produces (`app/types/compliance.types.ts`):
  - `type RetentionWindow = { readonly days?: number; readonly hours?: number; readonly seconds?: number }`
  - `type RetentionItem = { readonly category: string; readonly label: string; readonly window: RetentionWindow; readonly cutoff?: string; readonly schedule?: string; readonly candidate_count?: number | null; readonly last_pruned_at?: string | null; readonly last_pruned_count?: number | null }`
  - `type RetentionStatus = { readonly generated_at: string; readonly items: readonly RetentionItem[] }`
  - `type RetentionResponse = { readonly retention: RetentionStatus }`
  - `type DsrType = 'export' | 'delete' | 'anonymize'`
  - `type DsrStatus = 'submitted' | 'approved' | 'rejected' | 'fulfilled' | 'cancelled' | 'on_hold'`
  - `type DataSubjectRequest = { readonly request_id: string; readonly subject_id: string; readonly type: DsrType; readonly status: DsrStatus; readonly submitted_at: string; readonly reviewed_at?: string | null; readonly fulfilled_at?: string | null; readonly sla_due_at?: string | null }` — **NARROWED list-item projection**: only the fields the queue table + drawer render. The free-text `reason`/`reviewer_notes`/`reviewer_subject_id` the shared backend presenter emits are deliberately dropped here (real-name/email leak vector into `__NUXT_DATA__`) and stripped per row at runtime in Task 6.4; the review/fulfill responses reuse this same narrowed shape.
  - `type DsrListResponse = { readonly requests: readonly DataSubjectRequest[] }`
  - `type DsrReviewPayload = { readonly decision: 'approved' | 'rejected'; readonly notes?: string }`
  - `type DsrReviewResponse = { readonly request: DataSubjectRequest }`
  - `type DsrFulfillPayload = { readonly dry_run?: boolean }`
  - `type DsrFulfillResponse = { readonly request: DataSubjectRequest; readonly artifact?: unknown; readonly artifact_id?: number | null; readonly dry_run: boolean; readonly legal_hold_status: string }`
  - `type AuditExportFormat = 'csv' | 'jsonl'`
  - `type AuditExportFilters = { readonly format: AuditExportFormat; readonly from?: string; readonly to?: string; readonly action?: string; readonly outcome?: 'succeeded' | 'denied' | 'failed'; readonly taxonomy?: string; readonly admin_subject_id?: string; readonly request_id?: string; readonly support_reference?: string }`
  - `type EvidencePackFormat = 'zip' | 'json'`
  - `type ComplianceEvidencePackFilters = { readonly format?: EvidencePackFormat; readonly from?: string; readonly to?: string; readonly correlation_id?: string }`
- Produces (`app/lib/observability/observability-view-state.ts`):
  - `type ObservabilityViewState = 'loading' | 'unauthenticated' | 'forbidden' | 'error' | 'empty' | 'ready'`
  - `resolveServiceStatusTone(status: ObservabilityServiceStatus): StatusTone`
  - `isObservabilitySummaryEmpty(summary: ObservabilitySummary): boolean`
  - `resolveObservabilityViewState(args: { error: unknown; summary: ObservabilitySummary | null }): ObservabilityViewState`
  - `isObservabilityStale(error: unknown, summary: ObservabilitySummary | null): boolean`
- Produces (`app/lib/compliance/compliance-view-state.ts`):
  - `type ComplianceViewState = 'loading' | 'unauthenticated' | 'forbidden' | 'error' | 'empty' | 'ready'`
  - `resolveRetentionViewState(args: { error: unknown; retention: RetentionStatus | null }): ComplianceViewState`
  - `resolveDsrListViewState(args: { error: unknown; requests: readonly DataSubjectRequest[] | null }): ComplianceViewState`
  - `resolveDsrStatusTone(status: DsrStatus): StatusTone`
  - `isComplianceStale(error: unknown, data: unknown | null): boolean`
- Consumes: `ApiError` (`@/lib/api/api-client`); `StatusTone` + `resolveStatusTone` (`@/lib/status-tone`). Mirrors `dashboard-view-state.ts` (Task 3.1) + `users-view-state.ts` (Phase 4).

**Steps**

1. [ ] Write the failing test `app/lib/observability/__tests__/observability-view-state.spec.ts` (FULL code, asserts real behaviour — every branch of every exported function):

```ts
import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api/api-client'
import {
  isObservabilitySummaryEmpty,
  isObservabilityStale,
  resolveObservabilityViewState,
  resolveServiceStatusTone,
} from '../observability-view-state'
import type { ObservabilitySummary } from '@/types/observability.types'

const ready: ObservabilitySummary = {
  generated_at: '2026-06-28T14:32:15Z',
  partial: false,
  degraded: [],
  services: [
    {
      key: 'sso-backend',
      name: 'SSO-Backend',
      status: 'healthy',
      summary: 'All checks passing',
      latency_p95_ms: 42,
      freshness_seconds: 5,
      checks: { database: true, redis: true },
      queue: { pending_jobs: 0, failed_jobs: 0, oldest_pending_age_seconds: null },
    },
  ],
  metrics: {
    window_seconds: 900,
    freshness_seconds: 30,
    queue: { pending_jobs: 0, failed_jobs: 0, oldest_pending_age_seconds: null },
    auth_funnel: { total_15m: 0, succeeded_15m: 0, failed_15m: 0 },
    admin_activity: { total_15m: 0, denied_15m: 0 },
  },
  freshness: { recent_events_seconds: 5 },
  logs: [
    {
      id: 'log-1',
      service: 'admin-sso',
      severity: 'info',
      message: 'admin.session.login',
      reference: 'REF-ABCD1234',
      occurred_at: '2026-06-28T14:30:00Z',
    },
  ],
  traces: { status: 'unavailable', reason: 'no collector', next_step: 'configure OTLP', last_seen_trace_id: null },
}

// "Empty" = the backend answered but there is nothing to show: no services and
// no log events. Distinct from forbidden (403 → no permission).
const empty: ObservabilitySummary = { ...ready, services: [], logs: [] }

describe('resolveServiceStatusTone', () => {
  it('maps every service status to its Swiss tone (never colour-alone upstream)', () => {
    expect(resolveServiceStatusTone('healthy')).toBe('success')
    expect(resolveServiceStatusTone('degraded')).toBe('warning')
    expect(resolveServiceStatusTone('down')).toBe('danger')
    expect(resolveServiceStatusTone('unknown')).toBe('neutral')
  })
})

describe('isObservabilitySummaryEmpty', () => {
  it('is true only when there are no services and no log events', () => {
    expect(isObservabilitySummaryEmpty(empty)).toBe(true)
    expect(isObservabilitySummaryEmpty(ready)).toBe(false)
    expect(isObservabilitySummaryEmpty({ ...ready, services: [] })).toBe(false)
    expect(isObservabilitySummaryEmpty({ ...ready, logs: [] })).toBe(false)
  })
})

describe('resolveObservabilityViewState', () => {
  it('loading when no summary and no error', () => {
    expect(resolveObservabilityViewState({ error: null, summary: null })).toBe('loading')
  })
  it('maps a first-load 401 to unauthenticated', () => {
    expect(resolveObservabilityViewState({ error: new ApiError(401, 'no session'), summary: null })).toBe(
      'unauthenticated',
    )
  })
  it('maps a first-load 403 to forbidden (distinct from empty)', () => {
    expect(resolveObservabilityViewState({ error: new ApiError(403, 'forbidden'), summary: null })).toBe('forbidden')
  })
  it('maps other first-load errors to error (incl. H3-shaped statusCode)', () => {
    expect(resolveObservabilityViewState({ error: new ApiError(500, 'boom'), summary: null })).toBe('error')
    expect(resolveObservabilityViewState({ error: { statusCode: 502 }, summary: null })).toBe('error')
  })
  it('ready / empty when a summary is present, keeping data on screen through a background error', () => {
    expect(resolveObservabilityViewState({ error: null, summary: ready })).toBe('ready')
    expect(resolveObservabilityViewState({ error: null, summary: empty })).toBe('empty')
    expect(resolveObservabilityViewState({ error: new ApiError(500, 'boom'), summary: ready })).toBe('ready')
  })
})

describe('isObservabilityStale', () => {
  it('is true only when an error coexists with a prior summary', () => {
    expect(isObservabilityStale(new ApiError(500, 'x'), ready)).toBe(true)
    expect(isObservabilityStale(null, ready)).toBe(false)
    expect(isObservabilityStale(new ApiError(500, 'x'), null)).toBe(false)
  })
})
```

2. [ ] Write the failing test `app/lib/compliance/__tests__/compliance-view-state.spec.ts` (FULL code):

```ts
import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api/api-client'
import {
  isComplianceStale,
  resolveDsrListViewState,
  resolveDsrStatusTone,
  resolveRetentionViewState,
} from '../compliance-view-state'
import type { DataSubjectRequest, RetentionStatus } from '@/types/compliance.types'

const retention: RetentionStatus = {
  generated_at: '2026-06-28T14:32:15Z',
  items: [{ category: 'admin_audit_events', label: 'Admin audit events', window: { days: 730 }, candidate_count: 12 }],
}
const emptyRetention: RetentionStatus = { generated_at: '2026-06-28T14:32:15Z', items: [] }

const dsr: DataSubjectRequest = {
  request_id: '01HXYZABCDEFGHJKMNPQRSTV',
  subject_id: 'sub_opaque_0001',
  type: 'export',
  status: 'submitted',
  submitted_at: '2026-06-28T10:00:00Z',
}

describe('resolveDsrStatusTone', () => {
  it('maps every DSR status to its Swiss tone', () => {
    expect(resolveDsrStatusTone('submitted')).toBe('warning')
    expect(resolveDsrStatusTone('on_hold')).toBe('warning')
    expect(resolveDsrStatusTone('approved')).toBe('success')
    expect(resolveDsrStatusTone('fulfilled')).toBe('success')
    expect(resolveDsrStatusTone('rejected')).toBe('danger')
    expect(resolveDsrStatusTone('cancelled')).toBe('neutral')
  })
})

describe('resolveRetentionViewState', () => {
  it('loading when no retention and no error', () => {
    expect(resolveRetentionViewState({ error: null, retention: null })).toBe('loading')
  })
  it('maps first-load 401/403/other to unauthenticated/forbidden/error', () => {
    expect(resolveRetentionViewState({ error: new ApiError(401, 'no session'), retention: null })).toBe(
      'unauthenticated',
    )
    expect(resolveRetentionViewState({ error: new ApiError(403, 'forbidden'), retention: null })).toBe('forbidden')
    expect(resolveRetentionViewState({ error: new ApiError(500, 'boom'), retention: null })).toBe('error')
    expect(resolveRetentionViewState({ error: { statusCode: 502 }, retention: null })).toBe('error')
  })
  it('ready / empty when retention is present and keeps data on background error', () => {
    expect(resolveRetentionViewState({ error: null, retention })).toBe('ready')
    expect(resolveRetentionViewState({ error: null, retention: emptyRetention })).toBe('empty')
    expect(resolveRetentionViewState({ error: new ApiError(500, 'boom'), retention })).toBe('ready')
  })
})

describe('resolveDsrListViewState', () => {
  it('loading when no list and no error', () => {
    expect(resolveDsrListViewState({ error: null, requests: null })).toBe('loading')
  })
  it('maps first-load 401/403/other to unauthenticated/forbidden/error', () => {
    expect(resolveDsrListViewState({ error: new ApiError(401, 'no session'), requests: null })).toBe('unauthenticated')
    expect(resolveDsrListViewState({ error: new ApiError(403, 'forbidden'), requests: null })).toBe('forbidden')
    expect(resolveDsrListViewState({ error: new ApiError(500, 'boom'), requests: null })).toBe('error')
  })
  it('empty distinct from forbidden; ready when populated; data kept on background error', () => {
    expect(resolveDsrListViewState({ error: null, requests: [] })).toBe('empty')
    expect(resolveDsrListViewState({ error: null, requests: [dsr] })).toBe('ready')
    expect(resolveDsrListViewState({ error: new ApiError(500, 'boom'), requests: [dsr] })).toBe('ready')
  })
})

describe('isComplianceStale', () => {
  it('is true only when an error coexists with prior data (any non-null snapshot)', () => {
    expect(isComplianceStale(new ApiError(500, 'x'), retention)).toBe(true)
    expect(isComplianceStale(new ApiError(500, 'x'), [dsr])).toBe(true)
    expect(isComplianceStale(null, retention)).toBe(false)
    expect(isComplianceStale(new ApiError(500, 'x'), null)).toBe(false)
  })
})
```

3. [ ] Run both — expect **FAIL** (the `../observability-view-state` / `../compliance-view-state` modules and the `@/types/*` modules do not exist yet → import/resolution error):
   `npm run test -- app/lib/observability/__tests__/observability-view-state.spec.ts app/lib/compliance/__tests__/compliance-view-state.spec.ts`

4. [ ] Implement `app/types/observability.types.ts` (FULL code — verbatim the extract-backend §"Exact JSON shapes" #1 observability summary; safe/masked DTO only):

```ts
// Safe, masked observability-summary DTO for GET /admin/api/observability/summary.
// Every field is an aggregate metric, a service-health flag, a timestamp, or a
// masked log reference — NO token, secret, identifier, or raw PII (verified
// against the backend contract). Resilient: the backend degrades a failing
// section to a fallback, sets `partial=true`, and names it in `degraded`.
export type ObservabilityServiceStatus = 'healthy' | 'degraded' | 'down' | 'unknown'

export type ObservabilityQueue = {
  readonly pending_jobs: number
  readonly failed_jobs: number
  readonly oldest_pending_age_seconds: number | null
}

export type ObservabilityService = {
  readonly key: string
  readonly name: string
  readonly status: ObservabilityServiceStatus
  readonly summary: string
  readonly latency_p95_ms?: number | null
  readonly freshness_seconds?: number
  readonly checks?: Readonly<Record<string, boolean>>
  readonly queue?: ObservabilityQueue
}

export type ObservabilityMetrics = {
  readonly window_seconds: number
  readonly freshness_seconds?: number
  readonly queue?: ObservabilityQueue
  readonly performance?: Readonly<Record<string, unknown>>
  readonly auth_funnel?: Readonly<Record<string, number>>
  readonly admin_activity?: Readonly<Record<string, number>>
}

export type ObservabilityLogSeverity = 'info' | 'warning' | 'error' | string

export type ObservabilityLogEvent = {
  readonly id?: string
  readonly service: string
  readonly severity: ObservabilityLogSeverity
  readonly message: string
  readonly reference?: string | null
  readonly occurred_at?: string | null
}

export type ObservabilityTraces = {
  readonly status: string
  readonly reason: string
  readonly next_step?: string
  readonly last_seen_trace_id?: string | null
}

export type ObservabilitySummary = {
  readonly generated_at: string
  readonly partial: boolean
  readonly degraded: readonly string[]
  readonly services: readonly ObservabilityService[]
  readonly metrics: ObservabilityMetrics
  readonly freshness?: { readonly recent_events_seconds?: number }
  readonly logs: readonly ObservabilityLogEvent[]
  readonly traces: ObservabilityTraces
}
```

5. [ ] Implement `app/types/compliance.types.ts` (FULL code — verbatim the extract-backend §"Exact JSON shapes" #2/#5/#6/#7 + the export/evidence-pack filter contracts #3/#4; **no email/NIK/NIP/NISN/name on any DTO**; `subject_id`/`reviewer_subject_id` are opaque OIDC subject ids):

```ts
// Safe, masked compliance DTOs for the audit/retention/DSR endpoints.
// PII minimization (design §3.3/§9): the DSR list projection carries ONLY the
// opaque OIDC `subject_id` — NO email, NIK/NIP/NISN, or name, AND no free-text
// `reason`/`reviewer_notes`/`reviewer_subject_id`. The backend presenter emits
// those (it is shared with the review response), but they are a real-name/email
// leak vector into `__NUXT_DATA__`, so the list-item type below drops them and
// observability.api.listDataSubjectRequests strips them at runtime per row
// (Task 6.4) — type-narrowing alone does NOT remove serialized keys. The UI
// masks `request_id`/`subject_id` for display. The two export/evidence filter
// types build the blob-download query strings only (pure query builders, Task 6.2).
export type RetentionWindow = {
  readonly days?: number
  readonly hours?: number
  readonly seconds?: number
}

export type RetentionItem = {
  readonly category: string
  readonly label: string
  readonly window: RetentionWindow
  readonly cutoff?: string
  readonly schedule?: string
  readonly candidate_count?: number | null
  readonly last_pruned_at?: string | null
  readonly last_pruned_count?: number | null
}

export type RetentionStatus = {
  readonly generated_at: string
  readonly items: readonly RetentionItem[]
}

export type RetentionResponse = {
  readonly retention: RetentionStatus
}

export type DsrType = 'export' | 'delete' | 'anonymize'

export type DsrStatus = 'submitted' | 'approved' | 'rejected' | 'fulfilled' | 'cancelled' | 'on_hold'

// NARROWED list-item projection: ONLY the fields the queue table + drawer render.
// `reason`/`reviewer_notes`/`reviewer_subject_id` are deliberately absent — they
// carry free-text PII (a subject's real name/email) and are stripped per row in
// observability.api.listDataSubjectRequests (Task 6.4), proven by the gate canary
// (Task 6.12). The review/fulfill responses reuse this same narrowed shape.
export type DataSubjectRequest = {
  readonly request_id: string
  readonly subject_id: string
  readonly type: DsrType
  readonly status: DsrStatus
  readonly submitted_at: string
  readonly reviewed_at?: string | null
  readonly fulfilled_at?: string | null
  readonly sla_due_at?: string | null
}

export type DsrListResponse = {
  readonly requests: readonly DataSubjectRequest[]
}

export type DsrReviewPayload = {
  readonly decision: 'approved' | 'rejected'
  readonly notes?: string
}

export type DsrReviewResponse = {
  readonly request: DataSubjectRequest
}

export type DsrFulfillPayload = {
  readonly dry_run?: boolean
}

export type DsrFulfillResponse = {
  readonly request: DataSubjectRequest
  readonly artifact?: unknown
  readonly artifact_id?: number | null
  readonly dry_run: boolean
  readonly legal_hold_status: string
}

export type AuditExportFormat = 'csv' | 'jsonl'

export type AuditExportFilters = {
  readonly format: AuditExportFormat
  readonly from?: string
  readonly to?: string
  readonly action?: string
  readonly outcome?: 'succeeded' | 'denied' | 'failed'
  readonly taxonomy?: string
  readonly admin_subject_id?: string
  readonly request_id?: string
  readonly support_reference?: string
}

export type EvidencePackFormat = 'zip' | 'json'

export type ComplianceEvidencePackFilters = {
  readonly format?: EvidencePackFormat
  readonly from?: string
  readonly to?: string
  readonly correlation_id?: string
}
```

6. [ ] Implement `app/lib/observability/observability-view-state.ts` (FULL code — copy-and-adapt of `dashboard-view-state.ts`):

```ts
import { ApiError } from '@/lib/api/api-client'
import { resolveStatusTone, type StatusTone } from '@/lib/status-tone'
import type { ObservabilityServiceStatus, ObservabilitySummary } from '@/types/observability.types'

export type ObservabilityViewState =
  | 'loading'
  | 'unauthenticated'
  | 'forbidden'
  | 'error'
  | 'empty'
  | 'ready'

// Explicit service-status → tone map. The shared `resolveStatusTone` alias map
// does not carry `healthy`/`degraded`/`down`, so the map below is authoritative;
// `resolveStatusTone` is the defensive fallback for any unexpected backend value
// (delegating where possible per the contract). Never colour-alone downstream:
// the tone always pairs with a label via UiStatusBadge.
const SERVICE_TONE: Readonly<Record<ObservabilityServiceStatus, StatusTone>> = {
  healthy: 'success',
  degraded: 'warning',
  down: 'danger',
  unknown: 'neutral',
}

export function resolveServiceStatusTone(status: ObservabilityServiceStatus): StatusTone {
  return SERVICE_TONE[status] ?? resolveStatusTone(status)
}

// "Empty" = the backend answered but there is nothing to render: no services and
// no log events. Deliberately distinct from `forbidden` (a 403 → no permission)
// so the page shows "no data yet" copy rather than an access-denied surface.
export function isObservabilitySummaryEmpty(summary: ObservabilitySummary): boolean {
  return summary.services.length === 0 && summary.logs.length === 0
}

export function resolveObservabilityViewState({
  error,
  summary,
}: {
  readonly error: unknown
  readonly summary: ObservabilitySummary | null
}): ObservabilityViewState {
  // Security boundary: an error with NO prior snapshot must surface the real
  // auth/permission state, never be hidden. A background-refresh error that
  // still has a good snapshot is handled by `isObservabilityStale` (data stays
  // on screen) — symmetric with the dashboard gate.
  if (error && !summary) {
    const status = errorStatus(error)
    if (status === 401) return 'unauthenticated'
    if (status === 403) return 'forbidden'
    return 'error'
  }
  if (summary) return isObservabilitySummaryEmpty(summary) ? 'empty' : 'ready'
  return 'loading'
}

// A background refresh failed but we still hold a good snapshot — show the data
// with a degraded/stale banner instead of blanking the cockpit.
export function isObservabilityStale(error: unknown, summary: ObservabilitySummary | null): boolean {
  return Boolean(error) && summary !== null
}

function errorStatus(error: unknown): number | null {
  if (error instanceof ApiError) return error.status
  if (typeof error === 'object' && error !== null) {
    const candidate = error as { statusCode?: unknown; status?: unknown }
    if (typeof candidate.statusCode === 'number') return candidate.statusCode
    if (typeof candidate.status === 'number') return candidate.status
  }
  return null
}
```

7. [ ] Implement `app/lib/compliance/compliance-view-state.ts` (FULL code — copy-and-adapt of `users-view-state.ts`):

```ts
import { ApiError } from '@/lib/api/api-client'
import { resolveStatusTone, type StatusTone } from '@/lib/status-tone'
import type { DataSubjectRequest, DsrStatus, RetentionStatus } from '@/types/compliance.types'

export type ComplianceViewState =
  | 'loading'
  | 'unauthenticated'
  | 'forbidden'
  | 'error'
  | 'empty'
  | 'ready'

// Explicit DSR-status → tone map. The shared `resolveStatusTone` alias map does
// not carry these lifecycle states, so the map is authoritative; `resolveStatusTone`
// is the defensive fallback (delegating where possible). Swiss reserves red for
// the genuinely terminal `rejected` decision; routine `cancelled` is neutral.
const DSR_TONE: Readonly<Record<DsrStatus, StatusTone>> = {
  submitted: 'warning',
  on_hold: 'warning',
  approved: 'success',
  fulfilled: 'success',
  rejected: 'danger',
  cancelled: 'neutral',
}

export function resolveDsrStatusTone(status: DsrStatus): StatusTone {
  return DSR_TONE[status] ?? resolveStatusTone(status)
}

export function resolveRetentionViewState({
  error,
  retention,
}: {
  readonly error: unknown
  readonly retention: RetentionStatus | null
}): ComplianceViewState {
  // Security boundary: an error with NO prior snapshot surfaces the real
  // auth/permission state; once a snapshot exists it stays on screen even if a
  // background refresh fails (handled by `isComplianceStale`).
  if (error && !retention) {
    const status = errorStatus(error)
    if (status === 401) return 'unauthenticated'
    if (status === 403) return 'forbidden'
    return 'error'
  }
  // "Empty" (no retention items) is distinct from `forbidden` (a 403).
  if (retention) return retention.items.length === 0 ? 'empty' : 'ready'
  return 'loading'
}

export function resolveDsrListViewState({
  error,
  requests,
}: {
  readonly error: unknown
  readonly requests: readonly DataSubjectRequest[] | null
}): ComplianceViewState {
  if (error && !requests) {
    const status = errorStatus(error)
    if (status === 401) return 'unauthenticated'
    if (status === 403) return 'forbidden'
    return 'error'
  }
  // `null` (no answer yet) → loading; `[]` (the backend answered empty) → empty,
  // deliberately distinct from `forbidden`.
  if (requests) return requests.length === 0 ? 'empty' : 'ready'
  return 'loading'
}

// A background refresh failed but we still hold a good snapshot (retention OR the
// DSR list) — show it with a stale notice instead of blanking the console.
export function isComplianceStale(error: unknown, data: unknown | null): boolean {
  return Boolean(error) && data !== null
}

function errorStatus(error: unknown): number | null {
  if (error instanceof ApiError) return error.status
  if (typeof error === 'object' && error !== null) {
    const candidate = error as { statusCode?: unknown; status?: unknown }
    if (typeof candidate.statusCode === 'number') return candidate.statusCode
    if (typeof candidate.status === 'number') return candidate.status
  }
  return null
}
```

8. [ ] Run both — expect **PASS**:
   `npm run test -- app/lib/observability/__tests__/observability-view-state.spec.ts app/lib/compliance/__tests__/compliance-view-state.spec.ts`

9. [ ] Refactor if needed (DRY the duplicated `errorStatus` helper only if a shared `@/lib/api/error-status` already exists; otherwise leave both copies — they mirror the existing dashboard/users files exactly and a one-helper extraction is out of scope for this task). Re-run step 8 — still **PASS**.

10. [ ] Commit:
   `git add app/types/observability.types.ts app/types/compliance.types.ts app/lib/observability/ app/lib/compliance/ && git commit -m "$(printf 'feat(sso-admin-frontend): observability/compliance DTOs + pure view-state/tone resolvers\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"`

**Deliverable:** the masked observability/compliance DTO type surface + pure, unit-tested view-state/tone resolvers, with zero Nuxt/network dependency.

**Task-scoped DoD** (run from `services/sso-admin-frontend`; all must pass — `npm run lint` runs BOTH `lint:oxlint` and `lint:eslint`):
`npm run typecheck && npm run lint && npm run format:check && npm run test -- app/lib/observability app/lib/compliance`


---

### Task 6.2: Pure query builders + evidence-pack validation + DSR list helpers

Pure functions for the two blob-download query strings, the evidence-pack client-side submit rule, the format-derived download fallback filenames, and the DSR list filter/paginate. No Nuxt, no network — every export here is unit-testable without a Nuxt context (mirrors the dashboard/users pure-resolver split). The query builders skip `undefined`/`null`/`''` and `String()`-coerce the rest (carry forward the legacy `withQuery` contract); `canSubmitEvidencePack` reproduces the legacy rule **(both `from` AND `to`) OR a non-empty trimmed `correlation_id`** so the panel never POSTs a window the backend will 422. `dsr-list.ts` is a copy-and-adapt of `app/lib/users/users-list.ts`: the case-insensitive substring search runs over the **opaque** identifiers only (`request_id`/`subject_id`) — raw PII (email/NIK/NIP/NISN/name) is not on the DTO and is deliberately never searchable, and `reason`/`reviewer_notes` are neither surfaced nor matched.

**Files**
- Create: `app/lib/compliance/audit-export.ts`
- Create: `app/lib/compliance/dsr-list.ts`
- Test: `app/lib/compliance/__tests__/audit-export.spec.ts`
- Test: `app/lib/compliance/__tests__/dsr-list.spec.ts`

**Interfaces**
- Produces (`app/lib/compliance/audit-export.ts`):
  - `function buildAuditExportQuery(filters: AuditExportFilters): string` — leading `?`, always includes `format`, skips empty optionals
  - `function buildEvidencePackQuery(filters: ComplianceEvidencePackFilters): string` — leading `?` (or `''` when fully empty), skips empty optionals
  - `function canSubmitEvidencePack(filters: ComplianceEvidencePackFilters): boolean` — `Boolean((from && to) || correlation_id?.trim())`
  - `function auditExportFallbackName(format: AuditExportFormat): string` → `admin-audit-events.${format}`
  - `function evidencePackFallbackName(format: EvidencePackFormat | undefined): string` → `compliance-evidence-pack.${format ?? 'zip'}`
- Produces (`app/lib/compliance/dsr-list.ts`):
  - `const DSR_PAGE_SIZE = 25`
  - `function filterDsr(list: readonly DataSubjectRequest[], opts: { query: string; status: DsrStatus | 'all' }): readonly DataSubjectRequest[]` — case-insensitive substring over `request_id`/`subject_id` (opaque ids only; no raw PII fields searchable) + status filter
  - `function paginateDsr(list: readonly DataSubjectRequest[], page: number, size?: number): readonly DataSubjectRequest[]` — 1-based, clamped ≥1
  - `function dsrPageCount(total: number, size?: number): number` → `Math.max(1, Math.ceil(total / size))`
- Consumes: `AuditExportFilters`, `ComplianceEvidencePackFilters`, `AuditExportFormat`, `EvidencePackFormat`, `DataSubjectRequest`, `DsrStatus` (all from `@/types/compliance.types`, Task 6.1). Mirrors `app/lib/users/users-list.ts` (Phase 4).

**Steps**

1. [ ] Write the failing query-builder test `app/lib/compliance/__tests__/audit-export.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  auditExportFallbackName,
  buildAuditExportQuery,
  buildEvidencePackQuery,
  canSubmitEvidencePack,
  evidencePackFallbackName,
} from '../audit-export'
import type {
  AuditExportFilters,
  ComplianceEvidencePackFilters,
} from '@/types/compliance.types'

describe('buildAuditExportQuery', () => {
  it('always emits the required format with a leading "?" when no optionals are set', () => {
    expect(buildAuditExportQuery({ format: 'csv' })).toBe('?format=csv')
    expect(buildAuditExportQuery({ format: 'jsonl' })).toBe('?format=jsonl')
  })

  it('appends only the optionals that are present, in declaration order', () => {
    const filters: AuditExportFilters = {
      format: 'csv',
      from: '2026-01-01',
      to: '2026-01-31',
      action: 'user.locked',
      outcome: 'denied',
    }
    expect(buildAuditExportQuery(filters)).toBe(
      '?format=csv&from=2026-01-01&to=2026-01-31&action=user.locked&outcome=denied',
    )
  })

  it('skips undefined, null and empty-string optionals (the legacy withQuery contract)', () => {
    const filters = {
      format: 'csv',
      from: '2026-01-01',
      to: '',
      action: undefined,
      // null is reachable from upstream nullable fields even if the type narrows it
      taxonomy: null as unknown as string,
      admin_subject_id: '   ', // whitespace is NOT empty -> kept (and url-encoded)
      request_id: 'req_123',
    } as AuditExportFilters
    expect(buildAuditExportQuery(filters)).toBe(
      '?format=csv&from=2026-01-01&admin_subject_id=+++&request_id=req_123',
    )
  })
})

describe('buildEvidencePackQuery', () => {
  it('returns "" when every field is empty (bare endpoint, backend defaults apply)', () => {
    expect(buildEvidencePackQuery({})).toBe('')
    expect(buildEvidencePackQuery({ format: undefined, from: '', to: '', correlation_id: '' })).toBe('')
  })

  it('emits a leading "?" and skips empty optionals', () => {
    const filters: ComplianceEvidencePackFilters = {
      format: 'zip',
      from: '2026-01-01',
      to: '2026-01-31',
    }
    expect(buildEvidencePackQuery(filters)).toBe('?format=zip&from=2026-01-01&to=2026-01-31')
    expect(buildEvidencePackQuery({ correlation_id: 'corr_abc' })).toBe('?correlation_id=corr_abc')
  })
})

describe('canSubmitEvidencePack', () => {
  // The OR truth table: (from AND to) OR a non-empty trimmed correlation_id.
  it.each<[ComplianceEvidencePackFilters, boolean]>([
    [{}, false],
    [{ from: '2026-01-01' }, false],
    [{ to: '2026-01-31' }, false],
    [{ from: '2026-01-01', to: '2026-01-31' }, true],
    [{ correlation_id: 'corr_abc' }, true],
    [{ correlation_id: '   ' }, false],
    [{ from: '2026-01-01', correlation_id: 'corr_abc' }, true],
    [{ format: 'json' }, false],
  ])('canSubmitEvidencePack(%o) === %s', (filters, expected) => {
    expect(canSubmitEvidencePack(filters)).toBe(expected)
  })
})

describe('fallback filenames', () => {
  it('derives the audit-export fallback from the format', () => {
    expect(auditExportFallbackName('csv')).toBe('admin-audit-events.csv')
    expect(auditExportFallbackName('jsonl')).toBe('admin-audit-events.jsonl')
  })

  it('derives the evidence-pack fallback, defaulting an absent format to zip', () => {
    expect(evidencePackFallbackName('zip')).toBe('compliance-evidence-pack.zip')
    expect(evidencePackFallbackName('json')).toBe('compliance-evidence-pack.json')
    expect(evidencePackFallbackName(undefined)).toBe('compliance-evidence-pack.zip')
  })
})
```

2. [ ] Run it — expect **FAIL** (`../audit-export` does not exist → import/resolution error):
   `npm run test -- app/lib/compliance/__tests__/audit-export.spec.ts`

3. [ ] Implement `app/lib/compliance/audit-export.ts` (FULL code):

```ts
import type {
  AuditExportFilters,
  AuditExportFormat,
  ComplianceEvidencePackFilters,
  EvidencePackFormat,
} from '@/types/compliance.types'

// Carry-forward of the legacy `withQuery` contract: a value is included only
// when it is not undefined, null, or the empty string; everything else is
// String()-coerced. URLSearchParams does the encoding + "&" joining; we add the
// leading "?" ourselves so the service can concatenate it straight onto a path.
// Whitespace-only is intentionally NOT empty — it round-trips encoded.
function buildQuery(filters: Record<string, unknown>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue
    params.set(key, String(value))
  }
  const query = params.toString()
  return query === '' ? '' : `?${query}`
}

export function buildAuditExportQuery(filters: AuditExportFilters): string {
  // `format` is required on the type and never empty, so the result always
  // carries at least `?format=…`.
  return buildQuery({
    format: filters.format,
    from: filters.from,
    to: filters.to,
    action: filters.action,
    outcome: filters.outcome,
    taxonomy: filters.taxonomy,
    admin_subject_id: filters.admin_subject_id,
    request_id: filters.request_id,
    support_reference: filters.support_reference,
  })
}

export function buildEvidencePackQuery(filters: ComplianceEvidencePackFilters): string {
  // Every field is optional, so a fully-empty filter yields "" (the service hits
  // the bare endpoint and the backend applies its own defaults).
  return buildQuery({
    format: filters.format,
    from: filters.from,
    to: filters.to,
    correlation_id: filters.correlation_id,
  })
}

// The evidence-pack backend requires a bounded scope: an explicit from+to window
// OR a correlation id. Reproduces the legacy client gate so the panel never POSTs
// a request the backend would 422.
export function canSubmitEvidencePack(filters: ComplianceEvidencePackFilters): boolean {
  return Boolean((filters.from && filters.to) || filters.correlation_id?.trim())
}

// Used only when the upstream `Content-Disposition` is absent; the format drives
// the extension so the downloaded file is still self-describing.
export function auditExportFallbackName(format: AuditExportFormat): string {
  return `admin-audit-events.${format}`
}

export function evidencePackFallbackName(format: EvidencePackFormat | undefined): string {
  return `compliance-evidence-pack.${format ?? 'zip'}`
}
```

4. [ ] Run it — expect **PASS**:
   `npm run test -- app/lib/compliance/__tests__/audit-export.spec.ts`

5. [ ] Write the failing DSR-list test `app/lib/compliance/__tests__/dsr-list.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { DSR_PAGE_SIZE, dsrPageCount, filterDsr, paginateDsr } from '../dsr-list'
import type { DataSubjectRequest } from '@/types/compliance.types'

// A single fully-typed sample row; overrides keep each case readable. The DTO is
// the NARROWED, masked list form — `subject_id` is the opaque OIDC subject id and
// there is NO email/NIK/NIP/NISN/name and NO free-text reason/notes field at all
// (those are stripped in Task 6.4). The "leak-through" case below casts a stray
// free-text key in to prove the filter still never searches it (PII minimization).
const base: DataSubjectRequest = {
  request_id: '01HZ0000000000000000000001',
  subject_id: 'sub_budi',
  type: 'export',
  status: 'submitted',
  submitted_at: '2026-06-01T00:00:00Z',
  reviewed_at: null,
  fulfilled_at: null,
  sla_due_at: '2026-06-30T00:00:00Z',
}

function makeDsr(overrides: Partial<DataSubjectRequest>): DataSubjectRequest {
  return { ...base, ...overrides }
}

const sample: readonly DataSubjectRequest[] = [
  makeDsr({ request_id: 'req_budi', subject_id: 'sub_budi', status: 'submitted' }),
  makeDsr({ request_id: 'req_citra', subject_id: 'sub_citra', status: 'approved' }),
  makeDsr({ request_id: 'req_dewi', subject_id: 'sub_dewi', status: 'rejected' }),
  makeDsr({ request_id: 'req_eko', subject_id: 'sub_eko', status: 'fulfilled' }),
]

describe('filterDsr', () => {
  it('returns the full list when query is empty and status is "all"', () => {
    expect(filterDsr(sample, { query: '', status: 'all' })).toHaveLength(4)
    // whitespace-only query is treated as empty
    expect(filterDsr(sample, { query: '   ', status: 'all' })).toHaveLength(4)
  })

  it('matches case-insensitively across request_id and subject_id only', () => {
    expect(filterDsr(sample, { query: 'CITRA', status: 'all' }).map((r) => r.request_id)).toEqual(['req_citra'])
    expect(filterDsr(sample, { query: 'sub_dewi', status: 'all' }).map((r) => r.request_id)).toEqual(['req_dewi'])
    expect(filterDsr(sample, { query: 'req_eko', status: 'all' }).map((r) => r.request_id)).toEqual(['req_eko'])
  })

  it('never matches free-text even if a raw row leaks one through (PII minimization)', () => {
    // The narrowed DTO has no reason/notes, but a raw backend row (pre-strip) could;
    // the filter must still search only the opaque ids. Cast a stray field in.
    const withFreeText = [
      { ...base, reason: 'ALPHA-secret' },
    ] as unknown as readonly DataSubjectRequest[]
    expect(filterDsr(withFreeText, { query: 'alpha-secret', status: 'all' })).toEqual([])
  })

  it('filters by status', () => {
    expect(filterDsr(sample, { query: '', status: 'rejected' }).map((r) => r.request_id)).toEqual(['req_dewi'])
    expect(filterDsr(sample, { query: '', status: 'fulfilled' }).map((r) => r.request_id)).toEqual(['req_eko'])
  })

  it('combines query and status (AND)', () => {
    expect(filterDsr(sample, { query: 'citra', status: 'submitted' })).toHaveLength(0)
    expect(filterDsr(sample, { query: 'citra', status: 'approved' })).toHaveLength(1)
  })
})

describe('paginateDsr', () => {
  const many: readonly DataSubjectRequest[] = Array.from({ length: 30 }, (_, i) =>
    makeDsr({ request_id: `req_${i}`, subject_id: `sub_${i}` }),
  )

  it('returns the first page-size slice for page 1 and the remainder for page 2', () => {
    expect(paginateDsr(many, 1)).toHaveLength(DSR_PAGE_SIZE)
    expect(paginateDsr(many, 2)).toHaveLength(30 - DSR_PAGE_SIZE)
    expect(paginateDsr(many, 1)[0]?.request_id).toBe('req_0')
    expect(paginateDsr(many, 2)[0]?.request_id).toBe(`req_${DSR_PAGE_SIZE}`)
  })

  it('honours an explicit page size and clamps page < 1 to the first page', () => {
    expect(paginateDsr(many, 1, 10)).toHaveLength(10)
    expect(paginateDsr(many, 0, 10)[0]?.request_id).toBe('req_0')
  })

  it('returns an empty slice for a page beyond the data', () => {
    expect(paginateDsr(many, 99)).toEqual([])
  })
})

describe('dsrPageCount', () => {
  it('ceils total/size and is never below 1', () => {
    expect(dsrPageCount(0)).toBe(1)
    expect(dsrPageCount(25)).toBe(1)
    expect(dsrPageCount(26)).toBe(2)
    expect(dsrPageCount(50)).toBe(2)
    expect(dsrPageCount(51)).toBe(3)
    expect(dsrPageCount(10, 10)).toBe(1)
    expect(dsrPageCount(11, 10)).toBe(2)
  })
})
```

6. [ ] Run it — expect **FAIL** (`../dsr-list` does not exist → import/resolution error):
   `npm run test -- app/lib/compliance/__tests__/dsr-list.spec.ts`

7. [ ] Implement `app/lib/compliance/dsr-list.ts` (FULL code):

```ts
import type { DataSubjectRequest, DsrStatus } from '@/types/compliance.types'

// The backend `GET /admin/api/data-subject-requests` returns a flat `{ requests }`
// with no query params, so search / status-filter / pagination are derived
// client-side over the hydrated list. 25 mirrors the legacy DSR queue page size.
export const DSR_PAGE_SIZE = 25

// Case-insensitive substring match over the OPAQUE identifiers only — the request
// id and the OIDC subject id. The narrowed DTO carries no raw PII and no free-text
// `reason`/`reviewer_notes` at all; even if a raw row leaked one through, the
// search never reads it (PII minimization): we only search what the masked queue
// actually renders.
export function filterDsr(
  list: readonly DataSubjectRequest[],
  args: { query: string; status: DsrStatus | 'all' },
): readonly DataSubjectRequest[] {
  const q = args.query.trim().toLowerCase()
  return list.filter((request) => {
    if (args.status !== 'all' && request.status !== args.status) return false
    if (q === '') return true
    return (
      request.request_id.toLowerCase().includes(q) ||
      request.subject_id.toLowerCase().includes(q)
    )
  })
}

// 1-based page; page < 1 is clamped to the first page so a stale page ref can
// never index before the start of the list.
export function paginateDsr(
  list: readonly DataSubjectRequest[],
  page: number,
  size: number = DSR_PAGE_SIZE,
): readonly DataSubjectRequest[] {
  const start = (Math.max(1, page) - 1) * size
  return list.slice(start, start + size)
}

// Always at least one page so the folio renders "01 / 01" for an empty result.
export function dsrPageCount(total: number, size: number = DSR_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / size))
}
```

8. [ ] Run it — expect **PASS**:
   `npm run test -- app/lib/compliance/__tests__/dsr-list.spec.ts`

9. [ ] Refactor if needed — both modules are leaf-pure with no shared state; confirm no duplication crept in (the two `buildQuery` callers share the one private helper; the DSR helpers stay byte-aligned with `users-list.ts` except for the searched fields). No behavioral change; re-run both files to confirm still green.

10. [ ] Commit (only on green):

```
git add app/lib/compliance/audit-export.ts app/lib/compliance/dsr-list.ts app/lib/compliance/__tests__/audit-export.spec.ts app/lib/compliance/__tests__/dsr-list.spec.ts
git commit -m "feat(sso-admin-frontend): pure audit-export query builders + DSR list helpers

Add app/lib/compliance/audit-export.ts (buildAuditExportQuery,
buildEvidencePackQuery, canSubmitEvidencePack, audit/evidence fallback
filenames) and app/lib/compliance/dsr-list.ts (filterDsr/paginateDsr/
dsrPageCount). Query builders skip undefined/null/'' and String()-coerce the
rest; canSubmitEvidencePack reproduces the legacy (from AND to) OR trimmed
correlation_id rule; DSR search covers opaque request_id/subject_id only.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

**Task-scoped DoD** (run from `services/sso-admin-frontend`; report any blocked command explicitly, never claim PASS for a command that did not run):
`npm run typecheck && npm run lint && npm run format:check && npm run test -- app/lib/compliance/__tests__/audit-export.spec.ts app/lib/compliance/__tests__/dsr-list.spec.ts` — where `npm run lint` runs BOTH `lint:oxlint` (`oxlint .`) AND `lint:eslint` (`eslint "app/**/*.vue"`), both must pass.


---

### Task 6.3: Client-side blob download trigger (download-blob.ts)

The **one** net-new browser-only primitive in this domain (it DOES NOT exist today — grep over `app/` + `server/` for `createObjectURL`/anchor-click/`.download` has zero hits beyond `getBlob` itself). `triggerBlobDownload` consumes the transient `BlobResponse` returned by `apiClient.getBlob`, creates an object URL, clicks a transient `<a download rel="noopener">`, and revokes the URL **immediately** so the blob is never retained. It is `import.meta.client`-guarded so it is a safe no-op during SSR and never serializes a blob into the `__NUXT__` payload, and it is the **only** DOM-touching piece of the download path — DOM is kept out of the service (`observability.api`, Task 6.4) and composable (`usePrivilegedAction`) layers. This is the seam the export + evidence-pack privileged flows (Task 6.9) call on success: `usePrivilegedAction<BlobResponse>.run(() => observabilityApi.exportAuditTrail(filters))` → on a non-null result → `triggerBlobDownload(blob, fallback)`. The blob lives only as a local in the same client tick; it is **never** persisted to `useState`/Pinia/`localStorage`/`sessionStorage`/`IndexedDB`/a query string/the console.

**Files**
- Create: `app/lib/api/download-blob.ts`
- Test: `app/lib/api/__tests__/download-blob.spec.ts` (plain `*.spec.ts` — pure browser primitive, runs in the default jsdom project, no Nuxt runtime needed)

**Interfaces**
- Produces (`app/lib/api/download-blob.ts`):
  - `triggerBlobDownload(response: BlobResponse, fallback: string): void` — sets the anchor `download` to `response.filename ?? fallback`; no-op when not in the browser (SSR-safe)
- Consumes: `BlobResponse` (`@/lib/api/api-client` — `{ readonly blob: Blob; readonly filename: string | null }`).

**Notes on the guard (binding design choice):** the spec mandates an `import.meta.client` guard. In the vitest jsdom project, `@nuxt/test-utils` compiles `import.meta.client` to a constant `true` (verified: `{ client: true, server: false }`) and it cannot be flipped at runtime, so the "server-side no-op" behaviour is made unit-observable with a second runtime guard, `typeof document === 'undefined'`. Both are kept: `import.meta.client` is the SSR-build strip; the `typeof document` check is the runtime no-op the test exercises (and a genuine belt-and-suspenders for any non-Nuxt server context). Also note jsdom does **not** implement `URL.createObjectURL`/`revokeObjectURL`, so the test stubs them via `vi.stubGlobal('URL', …)` rather than `vi.spyOn` (spying a missing property throws).

**Steps**

1. [ ] Write the failing test `app/lib/api/__tests__/download-blob.spec.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { triggerBlobDownload } from '../download-blob'
import type { BlobResponse } from '@/lib/api/api-client'

// jsdom does not implement URL.createObjectURL/revokeObjectURL, so we stub the
// whole URL global with just the two static methods the helper uses.
const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:mock-url')
const revokeObjectURL = vi.fn<(url: string) => void>()

// Capture every <a> the helper creates and replace its click() with a spy so a
// click never triggers a real navigation in jsdom.
const clickedAnchors: HTMLAnchorElement[] = []
const clickSpy = vi.fn<(this: HTMLAnchorElement) => void>()

function makeResponse(filename: string | null): BlobResponse {
  return { blob: new Blob(['id,action\n1,login'], { type: 'text/csv' }), filename }
}

beforeEach(() => {
  clickedAnchors.length = 0
  vi.stubGlobal('URL', { createObjectURL, revokeObjectURL } as unknown as typeof URL)
  const realCreateElement = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
    const element = realCreateElement(tag)
    if (tag === 'a') {
      const anchor = element as HTMLAnchorElement
      anchor.click = clickSpy
      clickedAnchors.push(anchor)
    }
    return element
  }) as typeof document.createElement)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  createObjectURL.mockClear()
  revokeObjectURL.mockClear()
  clickSpy.mockClear()
})

describe('triggerBlobDownload', () => {
  it('uses the response filename when the Content-Disposition header supplied one', () => {
    triggerBlobDownload(makeResponse('admin-audit-events.csv'), 'fallback.csv')

    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(createObjectURL.mock.calls[0]?.[0]).toBeInstanceOf(Blob)
    expect(clickedAnchors).toHaveLength(1)
    expect(clickedAnchors[0]?.download).toBe('admin-audit-events.csv')
    expect(clickedAnchors[0]?.rel).toBe('noopener')
    expect(clickSpy).toHaveBeenCalledTimes(1)
  })

  it('falls back to the provided name when filename is null', () => {
    triggerBlobDownload(makeResponse(null), 'compliance-evidence-pack.zip')

    expect(clickedAnchors[0]?.download).toBe('compliance-evidence-pack.zip')
    expect(clickSpy).toHaveBeenCalledTimes(1)
  })

  it('revokes the object URL immediately after the click (no retained blob URL)', () => {
    triggerBlobDownload(makeResponse('admin-audit-events.jsonl'), 'fallback.jsonl')

    expect(revokeObjectURL).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
  })

  it('is a safe no-op server-side (no DOM): nothing runs and nothing throws', () => {
    vi.stubGlobal('document', undefined)

    expect(() => triggerBlobDownload(makeResponse('admin-audit-events.csv'), 'fallback.csv')).not.toThrow()
    expect(createObjectURL).not.toHaveBeenCalled()
    expect(clickSpy).not.toHaveBeenCalled()
  })
})
```

2. [ ] Run it — expect **FAIL** (module `../download-blob` does not exist → import/resolution error before any assertion):
   `npm run test -- app/lib/api/__tests__/download-blob.spec.ts`

3. [ ] Implement `app/lib/api/download-blob.ts` (FULL code):

```ts
import type { BlobResponse } from '@/lib/api/api-client'

// The ONLY DOM-touching piece of the blob-download path: turns the transient
// BlobResponse from apiClient.getBlob into a file download via an object URL +
// a one-shot anchor, then revokes the URL immediately so the blob is never
// retained (and therefore never reaches useState/Pinia/storage or the SSR
// payload). The service and composable layers stay DOM-free.
export function triggerBlobDownload(response: BlobResponse, fallback: string): void {
  // ponytail: dual guard. import.meta.client strips this from the SSR build;
  // typeof document is the runtime no-op the unit test can exercise (vitest
  // compiles import.meta.client to a constant true).
  if (!import.meta.client || typeof document === 'undefined') return

  const url = URL.createObjectURL(response.blob)
  try {
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = response.filename ?? fallback
    anchor.rel = 'noopener'
    anchor.click()
  } finally {
    // Revoke even if click() throws, so a failed download never leaks the URL.
    URL.revokeObjectURL(url)
  }
}
```

4. [ ] Run it — expect **PASS** (4 tests green):
   `npm run test -- app/lib/api/__tests__/download-blob.spec.ts`

5. [ ] Refactor if needed (keep it ~12 lines; no abstraction, no options object — YAGNI). Re-run the command in step 4 and confirm it stays green.

6. [ ] Commit:
   `git add app/lib/api/download-blob.ts app/lib/api/__tests__/download-blob.spec.ts && git commit -m "$(printf 'feat(sso-admin-frontend): SSR-safe client-only blob download trigger\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"`

**Deliverable:** an SSR-safe, unit-tested client-only blob-download trigger with a filename fallback — the only DOM-touching piece of the download path, consumed by the export + evidence-pack privileged flows (Task 6.9); the blob is consumed and discarded in the same client tick, never persisted.

**Task DoD (run from `services/sso-admin-frontend`; report any blocked command explicitly, never claim PASS for a command that did not run):** `npm run typecheck && npm run lint && npm run format:check && npm run test -- app/lib/api/__tests__/download-blob.spec.ts && npm run build` — where `npm run lint` runs **BOTH** `lint:oxlint` (`oxlint .`) **AND** `lint:eslint` (`eslint "app/**/*.vue"`), both must pass.


---

### Task 6.4: observability.api service over api-client + Nitro proxy allow-list/binary-passthrough verification

The single network seam for the whole domain. A typed service over `apiClient` (copy-and-adapt of `app/services/dashboard.api.ts`, Task 3.2) that covers all six Phase-6 endpoints — the masked summary read, the retention read, the DSR list/review/fulfill lifecycle, and the **two file downloads** — making `observability.api.ts` the **first** consumer anywhere in the app of `apiClient.getBlob`. Every call is a same-origin `/api/admin/*` path; the Nitro admin-proxy injects the Bearer and rewrites `/api/admin/* → /admin/api/*` server-side, so the service stays token-blind. The two `getBlob` methods **compose** the pure query builders from Task 6.2 (`buildAuditExportQuery` / `buildEvidencePackQuery`) — the service never hand-rolls a query string — and they return the raw `BlobResponse` untouched (a non-2xx blob throws `ApiError` exactly like a JSON mutation, so the export/evidence flows route through the same privileged-action matrix in Task 6.9). The DSR list is a **plain GET with no query string** — the queue filters **client-side** in `useDataSubjectRequests` (Task 6.6), mirroring the Phase-4/5 `useUsersList`/`useClientsList` pattern (the queue is small and the backend stays the permission boundary). Crucially, `listDataSubjectRequests` **maps each backend row to the narrowed `DataSubjectRequest` at runtime**, dropping the shared presenter's free-text `reason`/`reviewer_notes`/`reviewer_subject_id` so they never reach `__NUXT_DATA__` (type-narrowing alone does not strip serialized keys; proven by the Task-6.12 canary).

The second half is a **proxy regression assertion**, not new proxy code. The Nitro admin-proxy already binary-forwards (`Buffer.from(await response.arrayBuffer())`) and `buildProxyResponseHeaders` already passes every non-hop-by-hop header through (extract-foundation §1c), and `ALLOWED_ADMIN_ROUTES` **already contains** `GET /api/admin/audit/export` and `GET /api/admin/compliance/evidence-pack` (admin-proxy.ts lines 29, 31). So binary passthrough is **asserted, not assumed**: extend `server/__tests__/admin-proxy.spec.ts` to prove (a) both download GETs are allow-listed and mapped to the backend with the server Bearer (and search preserved), and (b) `buildProxyResponseHeaders` forwards `Content-Type` + `Content-Disposition` for a binary upstream while still stripping `Content-Length` (the framing header). **Do not touch `server/utils/admin-proxy.ts`** — no new sub-route is introduced by this task (the DSR list is a plain GET on an already-allow-listed path; the proxy matches on pathname only).

**Files**
- Create: `app/services/observability.api.ts`
- Test: `app/services/__tests__/observability.api.spec.ts`
- Modify (extend): `server/__tests__/admin-proxy.spec.ts` (add the two download-GET allow-list `it()`s + the `buildProxyResponseHeaders` binary-passthrough `it()`; add the `buildProxyResponseHeaders` import)
- Modify only if a new sub-route is discovered (NOT expected here): `server/utils/admin-proxy.ts` (`ALLOWED_ADMIN_ROUTES` / `ALLOWED_ADMIN_ROUTE_PATTERNS`)

**Interfaces**
- Produces (`app/services/observability.api.ts`):
  - `observabilityApi.getSummary(): Promise<ObservabilitySummary>` → `apiClient.get('/api/admin/observability/summary')`
  - `observabilityApi.getRetention(): Promise<RetentionResponse>` → `apiClient.get('/api/admin/audit/retention')`
  - `observabilityApi.listDataSubjectRequests(): Promise<DsrListResponse>` → `apiClient.get('/api/admin/data-subject-requests')` (plain GET, **no query string** — the queue filters client-side in Task 6.6), then **maps each row to the narrowed `DataSubjectRequest` at runtime**, stripping free-text `reason`/`reviewer_notes`/`reviewer_subject_id`
  - `observabilityApi.reviewDsr(requestId: string, payload: DsrReviewPayload): Promise<DsrReviewResponse>` → `apiClient.post(`/api/admin/data-subject-requests/${requestId}/review`, payload)`
  - `observabilityApi.fulfillDsr(requestId: string, payload: DsrFulfillPayload): Promise<DsrFulfillResponse>` → `apiClient.post(`/api/admin/data-subject-requests/${requestId}/fulfill`, payload)`
  - `observabilityApi.exportAuditTrail(filters: AuditExportFilters): Promise<BlobResponse>` → `apiClient.getBlob('/api/admin/audit/export' + buildAuditExportQuery(filters))`
  - `observabilityApi.generateEvidencePack(filters: ComplianceEvidencePackFilters): Promise<BlobResponse>` → `apiClient.getBlob('/api/admin/compliance/evidence-pack' + buildEvidencePackQuery(filters))`
- Produces (`server/__tests__/admin-proxy.spec.ts`): the download-GET allow-list + `buildProxyResponseHeaders` binary-passthrough regression assertions.
- Consumes: `apiClient` (`get`/`post`/`getBlob`) + `BlobResponse` (`@/lib/api/api-client`); `buildAuditExportQuery`/`buildEvidencePackQuery` (Task 6.2, `@/lib/compliance/audit-export`); `ObservabilitySummary` (Task 6.1, `@/types/observability.types`); `RetentionResponse`/`DsrListResponse`/`DataSubjectRequest`/`DsrReviewPayload`/`DsrReviewResponse`/`DsrFulfillPayload`/`DsrFulfillResponse`/`AuditExportFilters`/`ComplianceEvidencePackFilters` (Task 6.1, `@/types/compliance.types`); proxy helpers `buildAdminApiRequest` (`server/utils/admin-proxy`) + `buildProxyResponseHeaders` (`server/utils/proxy-headers`), both existing. Mirrors `dashboard.api.ts` (Task 3.2); the proxy already binary-forwards (extract-foundation §1c).

**Steps**

1. [ ] Write the failing service test `app/services/__tests__/observability.api.spec.ts`. Mock `apiClient` (`get`/`post`/`getBlob`) but use the **real** Task-6.2 query builders so the two `getBlob` calls are asserted to *compose* them (real behaviour, not mock-only); assert each method's path; prove the blob methods are a transparent passthrough (a 428 step-up `ApiError` propagates unchanged):

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type BlobResponse } from '@/lib/api/api-client'
import { buildAuditExportQuery, buildEvidencePackQuery } from '@/lib/compliance/audit-export'
import type { AuditExportFilters, ComplianceEvidencePackFilters } from '@/types/compliance.types'

const get = vi.fn<(path: string) => Promise<unknown>>()
const post = vi.fn<(path: string, body?: unknown) => Promise<unknown>>()
const getBlob = vi.fn<(path: string) => Promise<BlobResponse>>()
vi.mock('@/lib/api/api-client', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/api/api-client')>()),
  apiClient: { get, post, getBlob },
}))

const { observabilityApi } = await import('../observability.api')

const blob: BlobResponse = { blob: new Blob(['x'], { type: 'text/csv' }), filename: 'admin-audit-events.csv' }

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  getBlob.mockReset()
})

describe('observabilityApi — read seams', () => {
  it('getSummary() GETs the same-origin observability summary path and passes the DTO through', async () => {
    const payload = { generated_at: '2026-06-28T14:32:15Z' }
    get.mockResolvedValue(payload)
    await expect(observabilityApi.getSummary()).resolves.toBe(payload)
    expect(get).toHaveBeenCalledWith('/api/admin/observability/summary')
  })

  it('getRetention() GETs the same-origin retention path', async () => {
    const payload = { retention: { generated_at: '2026-06-28T14:32:15Z', items: [] } }
    get.mockResolvedValue(payload)
    await expect(observabilityApi.getRetention()).resolves.toBe(payload)
    expect(get).toHaveBeenCalledWith('/api/admin/audit/retention')
  })

  it('listDataSubjectRequests() GETs the bare path (no query string — the queue filters client-side)', async () => {
    get.mockResolvedValue({ requests: [] })
    await observabilityApi.listDataSubjectRequests()
    expect(get).toHaveBeenCalledWith('/api/admin/data-subject-requests')
  })

  it('listDataSubjectRequests() strips free-text PII from every row at runtime (keys ABSENT, not just typed away)', async () => {
    // The shared backend presenter emits reason/reviewer_notes/reviewer_subject_id
    // on each list row — a real-name/email leak vector into __NUXT_DATA__. The
    // mock returns a raw row carrying them; the service must drop them per row.
    get.mockResolvedValue({
      requests: [
        {
          request_id: 'req-1',
          subject_id: 'sub-1',
          type: 'export',
          status: 'submitted',
          submitted_at: '2026-06-01T00:00:00Z',
          reviewed_at: null,
          fulfilled_at: null,
          sla_due_at: null,
          reason: 'SSR_PII_CANARY Budi Santoso budi@example.gov',
          reviewer_notes: 'SSR_PII_CANARY internal note',
          reviewer_subject_id: 'sub-reviewer-canary',
        },
      ],
    })
    const { requests } = await observabilityApi.listDataSubjectRequests()
    const item = requests[0]!
    expect('reason' in item).toBe(false)
    expect('reviewer_notes' in item).toBe(false)
    expect('reviewer_subject_id' in item).toBe(false)
    expect(item).toEqual({
      request_id: 'req-1',
      subject_id: 'sub-1',
      type: 'export',
      status: 'submitted',
      submitted_at: '2026-06-01T00:00:00Z',
      reviewed_at: null,
      fulfilled_at: null,
      sla_due_at: null,
    })
  })
})

describe('observabilityApi — DSR lifecycle (POST)', () => {
  it('reviewDsr() POSTs the decision payload to the per-request review path', async () => {
    post.mockResolvedValue({ request: {} })
    await observabilityApi.reviewDsr('01J0DSR0000000000000000001', { decision: 'approved', notes: 'verified' })
    expect(post).toHaveBeenCalledWith('/api/admin/data-subject-requests/01J0DSR0000000000000000001/review', {
      decision: 'approved',
      notes: 'verified',
    })
  })

  it('fulfillDsr() POSTs the dry-run flag to the per-request fulfill path', async () => {
    post.mockResolvedValue({ request: {}, dry_run: true, legal_hold_status: 'none' })
    await observabilityApi.fulfillDsr('01J0DSR0000000000000000001', { dry_run: true })
    expect(post).toHaveBeenCalledWith('/api/admin/data-subject-requests/01J0DSR0000000000000000001/fulfill', {
      dry_run: true,
    })
  })
})

describe('observabilityApi — blob downloads (first getBlob consumer)', () => {
  it('exportAuditTrail() getBlobs the export path composed with buildAuditExportQuery and returns the BlobResponse', async () => {
    const filters: AuditExportFilters = { format: 'csv', from: '2026-01-01', to: '2026-01-31' }
    getBlob.mockResolvedValue(blob)
    await expect(observabilityApi.exportAuditTrail(filters)).resolves.toBe(blob)
    expect(getBlob).toHaveBeenCalledWith('/api/admin/audit/export' + buildAuditExportQuery(filters))
    // composition is real, not asserted against a hand-written string:
    expect(getBlob.mock.calls[0]?.[0]).toContain('format=csv')
  })

  it('generateEvidencePack() getBlobs the evidence-pack path composed with buildEvidencePackQuery', async () => {
    const filters: ComplianceEvidencePackFilters = { format: 'zip', correlation_id: 'corr-1' }
    getBlob.mockResolvedValue({ ...blob, filename: 'compliance-evidence-pack.zip' })
    await observabilityApi.generateEvidencePack(filters)
    expect(getBlob).toHaveBeenCalledWith('/api/admin/compliance/evidence-pack' + buildEvidencePackQuery(filters))
    expect(getBlob.mock.calls[0]?.[0]).toContain('correlation_id=corr-1')
  })

  it('exportAuditTrail() lets a 428 step-up ApiError propagate unchanged (same matrix as a JSON mutation)', async () => {
    getBlob.mockRejectedValue(new ApiError(428, 'fresh auth required', 'fresh_auth_required'))
    await expect(observabilityApi.exportAuditTrail({ format: 'csv' })).rejects.toMatchObject({
      status: 428,
      code: 'fresh_auth_required',
    })
  })
})
```

2. [ ] Run it and confirm it FAILS because the module does not exist yet:
   `npm run test:unit -- app/services/__tests__/observability.api.spec.ts`
   Expected: FAIL — `Failed to resolve import "../observability.api"` (or `observabilityApi is undefined`). Not a typo failure: the seam is genuinely missing.

3. [ ] Write the minimal real implementation `app/services/observability.api.ts`:

```ts
import { apiClient, type BlobResponse } from '@/lib/api/api-client'
import { buildAuditExportQuery, buildEvidencePackQuery } from '@/lib/compliance/audit-export'
import type { ObservabilitySummary } from '@/types/observability.types'
import type {
  AuditExportFilters,
  ComplianceEvidencePackFilters,
  DataSubjectRequest,
  DsrFulfillPayload,
  DsrFulfillResponse,
  DsrListResponse,
  DsrReviewPayload,
  DsrReviewResponse,
  RetentionResponse,
} from '@/types/compliance.types'

// Same-origin BFF paths. The Nitro proxy (server/utils/admin-proxy.ts) injects
// the Bearer access token from event.context and rewrites /api/admin/* →
// /admin/api/* before forwarding to the backend. The SPA is token-blind.
//
// This is the FIRST consumer of apiClient.getBlob: the audit export and the
// compliance evidence-pack are streamed Content-Disposition attachments. A
// non-2xx blob throws ApiError exactly like a JSON call, so the download flows
// route through the same privileged-action failure matrix. The blob is returned
// untouched and is never persisted here.

// The backend DSR presenter is SHARED with the review response, so each list row
// carries free-text reason/reviewer_notes/reviewer_subject_id — a real-name/email
// leak vector into __NUXT_DATA__. Map each row to the narrowed DataSubjectRequest
// at RUNTIME so the stripped keys are physically ABSENT from the serialized object
// (type-narrowing alone does NOT remove serialized keys). Proven by the Task-6.12
// gate canary. The DSR queue filters client-side (Task 6.6), so there is no query.
function toDsrListItem(row: DataSubjectRequest): DataSubjectRequest {
  return {
    request_id: row.request_id,
    subject_id: row.subject_id,
    type: row.type,
    status: row.status,
    submitted_at: row.submitted_at,
    reviewed_at: row.reviewed_at ?? null,
    fulfilled_at: row.fulfilled_at ?? null,
    sla_due_at: row.sla_due_at ?? null,
  }
}

export const observabilityApi = {
  getSummary(): Promise<ObservabilitySummary> {
    return apiClient.get<ObservabilitySummary>('/api/admin/observability/summary')
  },

  getRetention(): Promise<RetentionResponse> {
    return apiClient.get<RetentionResponse>('/api/admin/audit/retention')
  },

  async listDataSubjectRequests(): Promise<DsrListResponse> {
    // Plain GET, no query string — the queue filters client-side (Task 6.6).
    // Strip the free-text PII off every row before it can hydrate to the client.
    const response = await apiClient.get<DsrListResponse>('/api/admin/data-subject-requests')
    return { requests: response.requests.map(toDsrListItem) }
  },

  reviewDsr(requestId: string, payload: DsrReviewPayload): Promise<DsrReviewResponse> {
    return apiClient.post<DsrReviewResponse>(
      `/api/admin/data-subject-requests/${requestId}/review`,
      payload,
    )
  },

  fulfillDsr(requestId: string, payload: DsrFulfillPayload): Promise<DsrFulfillResponse> {
    return apiClient.post<DsrFulfillResponse>(
      `/api/admin/data-subject-requests/${requestId}/fulfill`,
      payload,
    )
  },

  exportAuditTrail(filters: AuditExportFilters): Promise<BlobResponse> {
    return apiClient.getBlob('/api/admin/audit/export' + buildAuditExportQuery(filters))
  },

  generateEvidencePack(filters: ComplianceEvidencePackFilters): Promise<BlobResponse> {
    return apiClient.getBlob('/api/admin/compliance/evidence-pack' + buildEvidencePackQuery(filters))
  },
}
```

4. [ ] Run it and confirm it PASSES:
   `npm run test:unit -- app/services/__tests__/observability.api.spec.ts`
   Expected: PASS — all `observabilityApi` cases green (9 tests).

5. [ ] Extend `server/__tests__/admin-proxy.spec.ts` with the proxy regression assertions. Add the import (next to the existing `buildAdminApiRequest` import), and ensure `vi` is in the `vitest` import (`import { describe, expect, it, vi } from 'vitest'`) for the console-spy assertion below:

```ts
import { buildProxyResponseHeaders } from '../utils/proxy-headers'
```

   Then add these `it()`s inside the existing `describe('admin BFF API proxy', …)` block (e.g. just after the `'allows observability summary…'` case at line ~99):

```ts
  it('allows GET /api/admin/audit/export through the proxy and preserves the export query', () => {
    const request = buildAdminApiRequest({
      internalBaseUrl: 'https://backend.internal',
      pathname: '/api/admin/audit/export',
      search: '?format=csv&from=2026-01-01&to=2026-01-31',
      method: 'GET',
      headers: { 'x-request-id': 'req-export' },
      session,
    })

    expect(request.url).toBe(
      'https://backend.internal/admin/api/audit/export?format=csv&from=2026-01-01&to=2026-01-31',
    )
    expect(headers(request).get('Authorization')).toBe('Bearer access-token-admin')
  })

  it('allows GET /api/admin/compliance/evidence-pack through the proxy', () => {
    const request = buildAdminApiRequest({
      internalBaseUrl: 'https://backend.internal',
      pathname: '/api/admin/compliance/evidence-pack',
      search: '?format=zip&correlation_id=corr-1',
      method: 'GET',
      headers: { 'x-request-id': 'req-evidence' },
      session,
    })

    expect(request.url).toBe(
      'https://backend.internal/admin/api/compliance/evidence-pack?format=zip&correlation_id=corr-1',
    )
    expect(headers(request).get('Authorization')).toBe('Bearer access-token-admin')
  })

  it('passes Content-Type/Content-Disposition through for a binary upstream and never logs the body (binary passthrough + no-body-logging, asserted not assumed)', () => {
    // ponytail: the proxy fully buffers the download (Buffer.from(await
    // response.arrayBuffer())) before returning it untouched — known ceiling;
    // stream if export size grows. The header forwarder below is the ONLY proxy
    // seam that processes a binary response, and it takes headers, never the body
    // — so the binary bytes are structurally unreachable to any logger.
    const consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    )
    const upstream = new Headers()
    upstream.set('Content-Type', 'application/zip')
    upstream.set('Content-Disposition', 'attachment; filename="compliance-evidence-pack.zip"')
    upstream.set('Content-Length', '40961') // framing header — must be stripped, not forwarded

    const forwarded = buildProxyResponseHeaders(upstream)

    expect(forwarded['content-type']).toBe('application/zip')
    expect(forwarded['content-disposition']).toBe('attachment; filename="compliance-evidence-pack.zip"')
    expect(forwarded['content-length']).toBeUndefined()
    // No body (and no header forwarding) is ever written to a logger/console.
    for (const spy of consoleSpies) {
      expect(spy).not.toHaveBeenCalled()
      spy.mockRestore()
    }
  })
```

6. [ ] Run the proxy spec and confirm it PASSES (the routes are already allow-listed and the header forwarder is already generic — these are regression guards, expected GREEN immediately):
   `npm run test:unit -- server/__tests__/admin-proxy.spec.ts`
   Expected: PASS — existing cases plus the three new `it()`s. If any FAILS, a Phase-6 download route is genuinely missing from `ALLOWED_ADMIN_ROUTES` — only then add the exact `GET /api/admin/audit/export` / `GET /api/admin/compliance/evidence-pack` row to `server/utils/admin-proxy.ts` and re-run.

7. [ ] Refactor pass (lazy — likely nothing): confirm no `fetch`/`$fetch` leaked into the service, types are imported `import type`, and no hardcoded query string duplicates the Task-6.2 builders. Re-run both files:
   `npm run test:unit -- app/services/__tests__/observability.api.spec.ts server/__tests__/admin-proxy.spec.ts` → PASS.

8. [ ] Commit:
   `git add app/services/observability.api.ts app/services/__tests__/observability.api.spec.ts server/__tests__/admin-proxy.spec.ts`
   ```
   git commit -m "feat(sso-admin-frontend): observability.api service over api-client (first getBlob consumer)

   Add the single network seam for the observability + compliance domain: a
   typed service over apiClient covering the summary/retention reads, the DSR
   list/review/fulfill lifecycle, and the two getBlob downloads (audit export
   + compliance evidence-pack) composing the pure query builders. Add proxy
   regression specs asserting the two download GETs are allow-listed and that
   buildProxyResponseHeaders passes binary Content-Type/Content-Disposition
   through while stripping Content-Length.

   Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
   ```

**Definition of Done (run from `services/sso-admin-frontend`):**
`npm run typecheck && npm run lint && npm run format:check && npm run test && npm run build` — where `npm run lint` runs BOTH `lint:oxlint` (`oxlint .`) AND `lint:eslint` (`eslint "app/**/*.vue"`), both must pass. Report any blocked command explicitly; never claim PASS for a command that did not run.


---

### Task 6.5: useObservabilitySummary composable (SSR summary boundary)

The Nuxt glue for the cockpit summary: wrap the service in `useAsyncData` (runs during SSR so the masked DTO resolves server-side and hydrates with no client flash) and expose the mapped view state, the redacted request id, the degraded group list, the stale flag, and a `refresh`. Pure mapping is delegated to Task 6.1's resolvers — this composable adds no branching of its own beyond wiring `useAsyncData` to them. Copy-and-adapt of `app/composables/useDashboardSummary.ts` (Task 3.3): **same key+shape convention**, swapping dashboard → observability. The only structural difference vs. the dashboard copy is that `resolveObservabilityViewState` takes `{ error, summary }` (no `pending` — Task 6.1's signature drops the vestigial flag), so `pending` is not destructured here. Tested in a `*.nuxt.spec.ts` where `useAsyncData` is mocked at the boundary (controllable `data`/`error` refs) and the service is mocked, so state mapping is deterministic without a network or a real Nuxt fetch.

**Files**
- Create: `app/composables/useObservabilitySummary.ts`
- Test: `app/composables/__tests__/useObservabilitySummary.nuxt.spec.ts`

**Interfaces**
- Produces:
  - `type UseObservabilitySummaryReturn = { readonly summary: ComputedRef<ObservabilitySummary | null>; readonly viewState: ComputedRef<ObservabilityViewState>; readonly requestId: ComputedRef<string | null>; readonly degraded: ComputedRef<readonly string[]>; readonly isStale: ComputedRef<boolean>; readonly refresh: () => Promise<void> }`
  - `function useObservabilitySummary(): UseObservabilitySummaryReturn`
- Consumes: `useAsyncData<ObservabilitySummary>('admin-observability-summary', () => observabilityApi.getSummary())`; `resolveObservabilityViewState`/`isObservabilityStale` + `ObservabilitySummary`/`ObservabilityViewState` (Task 6.1); `observabilityApi.getSummary` (Task 6.4); `ApiError`/`getLastRequestId` (`@/lib/api/api-client`). Mirrors `useDashboardSummary.ts` (Task 3.3) exactly (key + shape).

**Steps**

1. [ ] Write the failing test `app/composables/__tests__/useObservabilitySummary.nuxt.spec.ts`:

```ts
// *.nuxt.spec.ts → routed to the 'nuxt' env where mockNuxtImport is available.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { ApiError } from '@/lib/api/api-client'
import { observabilityApi } from '@/services/observability.api'
import { useObservabilitySummary } from '../useObservabilitySummary'
import type { ObservabilitySummary } from '@/types/observability.types'

vi.mock('@/services/observability.api', () => ({
  observabilityApi: { getSummary: vi.fn<() => Promise<ObservabilitySummary>>() },
}))

// Controllable useAsyncData stand-in: the test mutates data/error and asserts the
// composable's derived state. Captures the key + handler so we can prove the
// composable wires the service correctly. `pending` is returned for shape parity
// with real useAsyncData even though this composable does not destructure it
// (the observability resolver derives loading from "no error, no summary").
const data = ref<ObservabilitySummary | null>(null)
const pending = ref(false)
const error = ref<unknown>(null)
const refreshMock = vi.fn<() => Promise<void>>(async () => {})
let capturedKey: string | null = null
let capturedHandler: (() => unknown) | null = null

mockNuxtImport('useAsyncData', () => {
  return (key: string, handler: () => unknown) => {
    capturedKey = key
    capturedHandler = handler
    return { data, pending, error, refresh: refreshMock }
  }
})

const ready: ObservabilitySummary = {
  generated_at: '2026-06-28T14:32:15Z',
  partial: false,
  degraded: [],
  services: [
    {
      key: 'backend',
      name: 'Identity Provider',
      status: 'healthy',
      summary: 'All checks passing',
      latency_p95_ms: 84,
      freshness_seconds: 12,
    },
    {
      key: 'queue',
      name: 'Queue Worker',
      status: 'degraded',
      summary: 'Backlog growing',
      queue: { pending_jobs: 42, failed_jobs: 3, oldest_pending_age_seconds: 180 },
    },
  ],
  metrics: {
    window_seconds: 3600,
    auth_funnel: { authorize: 1200, token: 1150, denied: 12 },
    admin_activity: { actions: 340, denied: 4 },
  },
  freshness: { recent_events_seconds: 8 },
  logs: [
    {
      id: 'evt-1',
      service: 'backend',
      severity: 'warning',
      message: 'Token refresh retried',
      reference: 'corr-ABCD1234',
      occurred_at: '2026-06-28T14:31:00Z',
    },
  ],
  traces: { status: 'available', reason: 'Sampling active', last_seen_trace_id: 'trace-9f8e' },
}

beforeEach(() => {
  data.value = null
  pending.value = false
  error.value = null
  capturedKey = null
  capturedHandler = null
  vi.clearAllMocks()
})

afterEach(() => vi.clearAllMocks())

describe('useObservabilitySummary', () => {
  it('wires the service under a stable asyncData key', () => {
    useObservabilitySummary()
    expect(capturedKey).toBe('admin-observability-summary')
    capturedHandler?.()
    expect(observabilityApi.getSummary).toHaveBeenCalledTimes(1)
  })

  it('derives loading then ready from the summary, exposing the raw masked DTO', () => {
    const obs = useObservabilitySummary()
    expect(obs.viewState.value).toBe('loading')
    data.value = ready
    expect(obs.viewState.value).toBe('ready')
    expect(obs.summary.value).toEqual(ready)
  })

  it('maps a first-load 403 to forbidden and exposes the redacted request id', () => {
    error.value = new ApiError(403, 'forbidden', 'forbidden', null, 'admin-req-DENIED42')
    const obs = useObservabilitySummary()
    expect(obs.viewState.value).toBe('forbidden')
    expect(obs.requestId.value).toBe('admin-req-DENIED42')
  })

  it('maps a first-load 401 to unauthenticated', () => {
    error.value = new ApiError(401, 'no session')
    expect(useObservabilitySummary().viewState.value).toBe('unauthenticated')
  })

  it('keeps the last good snapshot on a background refresh failure (stale)', () => {
    data.value = ready
    error.value = new ApiError(500, 'boom')
    const obs = useObservabilitySummary()
    expect(obs.viewState.value).toBe('ready')
    expect(obs.isStale.value).toBe(true)
  })

  it('surfaces the degraded section list only when the summary is partial', () => {
    data.value = { ...ready, partial: true, degraded: ['queue', 'traces'] }
    const obs = useObservabilitySummary()
    expect(obs.degraded.value).toEqual(['queue', 'traces'])
    data.value = ready
    expect(useObservabilitySummary().degraded.value).toEqual([])
  })

  it('refresh() delegates to the underlying asyncData refresh', async () => {
    await useObservabilitySummary().refresh()
    expect(refreshMock).toHaveBeenCalledTimes(1)
  })
})
```

2. [ ] Run it — expect **FAIL** (`../useObservabilitySummary` does not exist → import/resolution error):
   `npm run test -- app/composables/__tests__/useObservabilitySummary.nuxt.spec.ts`

3. [ ] Implement `app/composables/useObservabilitySummary.ts` (FULL code):

```ts
import { computed, toRaw, type ComputedRef } from 'vue'
import { ApiError, getLastRequestId } from '@/lib/api/api-client'
import { observabilityApi } from '@/services/observability.api'
import {
  isObservabilityStale,
  resolveObservabilityViewState,
  type ObservabilityViewState,
} from '@/lib/observability/observability-view-state'
import type { ObservabilitySummary } from '@/types/observability.types'

export type UseObservabilitySummaryReturn = {
  readonly summary: ComputedRef<ObservabilitySummary | null>
  readonly viewState: ComputedRef<ObservabilityViewState>
  readonly requestId: ComputedRef<string | null>
  readonly degraded: ComputedRef<readonly string[]>
  readonly isStale: ComputedRef<boolean>
  readonly refresh: () => Promise<void>
}

export function useObservabilitySummary(): UseObservabilitySummaryReturn {
  // Runs during SSR so the masked summary resolves server-side and hydrates into
  // the payload (safe DTO only — service health, aggregate metrics, masked log
  // references + timestamps). The access token stays in the Nitro event.context
  // and never reaches the page or window.__NUXT__.
  const { data, error, refresh } = useAsyncData<ObservabilitySummary>(
    'admin-observability-summary',
    () => observabilityApi.getSummary(),
  )

  // toRaw: the masked DTO is display-only; callers receive the plain object so
  // identity comparisons (and toRaw-based deep picks) work as expected.
  const summary = computed<ObservabilitySummary | null>(() =>
    data.value != null ? toRaw(data.value) : null,
  )

  const viewState = computed<ObservabilityViewState>(() =>
    resolveObservabilityViewState({ error: error.value, summary: summary.value }),
  )

  const isStale = computed<boolean>(() => isObservabilityStale(error.value, summary.value))

  const requestId = computed<string | null>(() =>
    error.value instanceof ApiError
      ? (error.value.requestId ?? getLastRequestId())
      : getLastRequestId(),
  )

  const degraded = computed<readonly string[]>(() =>
    summary.value?.partial ? summary.value.degraded : [],
  )

  return {
    summary,
    viewState,
    requestId,
    degraded,
    isStale,
    refresh: async () => {
      await refresh()
    },
  }
}
```

4. [ ] Run it — expect **PASS**:
   `npm run test -- app/composables/__tests__/useObservabilitySummary.nuxt.spec.ts`

5. [ ] Refactor if needed (none expected — this is a faithful copy-adapt of Task 3.3; keep the body identical to `useDashboardSummary.ts` apart from the dropped `pending` and the observability symbols), then re-run step 4 to confirm still green.

6. [ ] Commit:
   `git add app/composables/useObservabilitySummary.ts app/composables/__tests__/useObservabilitySummary.nuxt.spec.ts && git commit -m "$(printf 'feat(sso-admin-frontend): useObservabilitySummary SSR data composable\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"`

**Deliverable:** the SSR data composable for the observability summary, returning a mapped view-state/stale/degraded/requestId surface keyed `'admin-observability-summary'`.

**Task-scoped Definition-of-Done gate** (run from `services/sso-admin-frontend`; `npm run lint` runs BOTH `lint:oxlint` AND `lint:eslint` — both must pass; report any blocked command explicitly, never claim PASS for a command that did not run):
`npm run typecheck && npm run lint && npm run format:check && npm run test && npm run build`


---

### Task 6.6: useRetentionStatus + useDataSubjectRequests composables (SSR compliance boundaries)

The two SSR data boundaries the compliance page binds to. `useRetentionStatus` mirrors `useObservabilitySummary`/`useDashboardSummary` (a single read-only DTO under key `'admin-retention-status'`, `toRaw`'d for display, mapped to a view-state + redacted request id + stale flag). `useDataSubjectRequests` mirrors `useUsersList` (key `'admin-dsr-list'`): it SSR-resolves the queue, keeps `requests` `null` (no answer yet) **distinct** from `[]` (an answered, empty queue) so the resolver tells loading/error apart from empty, and derives client-side **search** + **status filter** + **pagination** over the Task-6.2 pure helpers (the backend list has no query params). `query`/`statusFilter` are refs; a `watch([query, statusFilter])` resets `page` to `1` so a narrowing filter never strands the operator on an out-of-range page. Both keep the last good snapshot on a background-refresh failure (`isStale = error && data !== null`) rather than blanking the page. Pure mapping is delegated to Task 6.1 (view-state) and Task 6.2 (filter/paginate); these composables are only the Nuxt glue, tested in `*.nuxt.spec.ts` with `useAsyncData` mocked at the boundary so state mapping is deterministic.

Note on resolver signatures: the Phase-6 `resolveRetentionViewState`/`resolveDsrListViewState` (Task 6.1) take `{ error, retention }` / `{ error, requests }` — they derive `loading` from a `null` snapshot with no error, so these composables do **not** pass `pending` (a divergence from the Phase-4 `resolveUsersViewState` shape, intentional per the skeleton contract).

**Files**
- Create: `app/composables/useRetentionStatus.ts`
- Create: `app/composables/useDataSubjectRequests.ts`
- Test: `app/composables/__tests__/useRetentionStatus.nuxt.spec.ts`
- Test: `app/composables/__tests__/useDataSubjectRequests.nuxt.spec.ts`

**Interfaces**
- Produces (`app/composables/useRetentionStatus.ts`):
  - `type UseRetentionStatusReturn = { readonly retention: ComputedRef<RetentionStatus | null>; readonly viewState: ComputedRef<ComplianceViewState>; readonly requestId: ComputedRef<string | null>; readonly isStale: ComputedRef<boolean>; readonly refresh: () => Promise<void> }`
  - `function useRetentionStatus(): UseRetentionStatusReturn`
- Produces (`app/composables/useDataSubjectRequests.ts`):
  - `type UseDataSubjectRequestsReturn = { readonly requests: ComputedRef<readonly DataSubjectRequest[] | null>; readonly filtered: ComputedRef<readonly DataSubjectRequest[]>; readonly paged: ComputedRef<readonly DataSubjectRequest[]>; readonly viewState: ComputedRef<ComplianceViewState>; readonly total: ComputedRef<number>; readonly filteredTotal: ComputedRef<number>; readonly page: Ref<number>; readonly pageCount: ComputedRef<number>; readonly query: Ref<string>; readonly statusFilter: Ref<DsrStatus | 'all'>; readonly requestId: ComputedRef<string | null>; readonly isStale: ComputedRef<boolean>; readonly refresh: () => Promise<void> }`
  - `function useDataSubjectRequests(): UseDataSubjectRequestsReturn`
- Consumes: `useAsyncData` keys `'admin-retention-status'` + `'admin-dsr-list'`; `observabilityApi.getRetention`/`listDataSubjectRequests` (Task 6.4); `resolveRetentionViewState`/`resolveDsrListViewState`/`isComplianceStale` + `ComplianceViewState` (Task 6.1); `RetentionStatus`/`RetentionResponse`/`DataSubjectRequest`/`DsrListResponse`/`DsrStatus` (Task 6.1); `DSR_PAGE_SIZE`/`filterDsr`/`paginateDsr`/`dsrPageCount` (Task 6.2); `ApiError`/`getLastRequestId` (`@/lib/api/api-client`). Mirrors `useDashboardSummary.ts` (Task 3.3) + `useUsersList.ts` (Phase 4).

**Steps**

1. [ ] Write the failing retention composable test `app/composables/__tests__/useRetentionStatus.nuxt.spec.ts`:

```ts
// *.nuxt.spec.ts → routed to the 'nuxt' env where mockNuxtImport is available.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { ApiError } from '@/lib/api/api-client'
import { observabilityApi } from '@/services/observability.api'
import { useRetentionStatus } from '../useRetentionStatus'
import type { RetentionResponse } from '@/types/compliance.types'

vi.mock('@/services/observability.api', () => ({
  observabilityApi: { getRetention: vi.fn<() => Promise<RetentionResponse>>() },
}))

// Controllable useAsyncData stand-in: the test mutates data/error and asserts the
// composable's derived state, and captures the key + handler so we can prove the
// composable wires the service correctly. `pending` is supplied but unused by the
// Phase-6 resolver (loading is derived from a null snapshot).
const data = ref<RetentionResponse | null>(null)
const pending = ref(false)
const error = ref<unknown>(null)
const refreshMock = vi.fn<() => Promise<void>>(async () => {})
let capturedKey: string | null = null
let capturedHandler: (() => unknown) | null = null

mockNuxtImport('useAsyncData', () => {
  return (key: string, handler: () => unknown) => {
    capturedKey = key
    capturedHandler = handler
    return { data, pending, error, refresh: refreshMock }
  }
})

const ready: RetentionResponse = {
  retention: {
    generated_at: '2026-06-28T14:32:15Z',
    items: [
      {
        category: 'audit_events',
        label: 'Audit events',
        window: { days: 365 },
        schedule: 'daily',
        candidate_count: 12,
        last_pruned_at: '2026-06-27T02:00:00Z',
        last_pruned_count: 40,
      },
    ],
  },
}
const empty: RetentionResponse = {
  retention: { generated_at: '2026-06-28T14:32:15Z', items: [] },
}

beforeEach(() => {
  data.value = null
  pending.value = false
  error.value = null
  capturedKey = null
  capturedHandler = null
  vi.clearAllMocks()
})
afterEach(() => vi.clearAllMocks())

describe('useRetentionStatus', () => {
  it('wires the service under a stable asyncData key', () => {
    useRetentionStatus()
    expect(capturedKey).toBe('admin-retention-status')
    capturedHandler?.()
    expect(observabilityApi.getRetention).toHaveBeenCalledTimes(1)
  })

  it('derives loading / ready / empty from the retention snapshot', () => {
    const status = useRetentionStatus()
    expect(status.viewState.value).toBe('loading')
    expect(status.retention.value).toBeNull()
    data.value = ready
    expect(status.viewState.value).toBe('ready')
    expect(status.retention.value?.items).toHaveLength(1)
    data.value = empty
    expect(status.viewState.value).toBe('empty')
  })

  it('maps a first-load 403 to forbidden and exposes the redacted request id', () => {
    error.value = new ApiError(403, 'forbidden', 'forbidden', null, 'admin-req-DENIED42')
    const status = useRetentionStatus()
    expect(status.viewState.value).toBe('forbidden')
    expect(status.requestId.value).toBe('admin-req-DENIED42')
  })

  it('maps a first-load 401 to unauthenticated', () => {
    error.value = new ApiError(401, 'no session')
    expect(useRetentionStatus().viewState.value).toBe('unauthenticated')
  })

  it('keeps the last good snapshot on a background refresh failure (stale)', () => {
    data.value = ready
    error.value = new ApiError(500, 'boom')
    const status = useRetentionStatus()
    expect(status.viewState.value).toBe('ready')
    expect(status.isStale.value).toBe(true)
  })

  it('refresh() delegates to the underlying asyncData refresh', async () => {
    await useRetentionStatus().refresh()
    expect(refreshMock).toHaveBeenCalledTimes(1)
  })

  it('hydrates only the masked retention DTO — no token/secret field leaks', () => {
    data.value = ready
    const status = useRetentionStatus()
    const serialized = JSON.stringify(status.retention.value)
    expect(serialized).not.toMatch(/access_token|refresh_token|id_token|Bearer|client_secret/i)
    expect(serialized).not.toMatch(/\b\d{16}\b|\b\d{18}\b|\b\d{10}\b/)
  })
})
```

2. [ ] Run it — expect **FAIL** (`../useRetentionStatus` does not exist → import/resolution error):
   `npm run test -- app/composables/__tests__/useRetentionStatus.nuxt.spec.ts`

3. [ ] Implement `app/composables/useRetentionStatus.ts` (FULL code):

```ts
import { computed, toRaw, type ComputedRef } from 'vue'
import { ApiError, getLastRequestId } from '@/lib/api/api-client'
import { observabilityApi } from '@/services/observability.api'
import {
  isComplianceStale,
  resolveRetentionViewState,
  type ComplianceViewState,
} from '@/lib/compliance/compliance-view-state'
import type { RetentionResponse, RetentionStatus } from '@/types/compliance.types'

export type UseRetentionStatusReturn = {
  readonly retention: ComputedRef<RetentionStatus | null>
  readonly viewState: ComputedRef<ComplianceViewState>
  readonly requestId: ComputedRef<string | null>
  readonly isStale: ComputedRef<boolean>
  readonly refresh: () => Promise<void>
}

export function useRetentionStatus(): UseRetentionStatusReturn {
  // Runs during SSR so the masked retention status resolves server-side and
  // hydrates into the payload (safe DTO only — categories, windows, prune
  // timestamps). The access token stays in the Nitro event.context and never
  // reaches the page or window.__NUXT__.
  const { data, error, refresh } = useAsyncData<RetentionResponse>('admin-retention-status', () =>
    observabilityApi.getRetention(),
  )

  // toRaw: the masked DTO is display-only; callers receive the plain object so
  // identity comparisons work as expected. `null` (no response yet) is kept
  // distinct from an answered status so the resolver tells loading from empty.
  const retention = computed<RetentionStatus | null>(() =>
    data.value != null ? toRaw(data.value.retention) : null,
  )

  const viewState = computed<ComplianceViewState>(() =>
    resolveRetentionViewState({ error: error.value, retention: retention.value }),
  )

  // A background refresh failed but we still hold a good snapshot — keep it on
  // screen with a stale notice rather than blanking the panel.
  const isStale = computed<boolean>(() => isComplianceStale(error.value, retention.value))

  const requestId = computed<string | null>(() =>
    error.value instanceof ApiError
      ? (error.value.requestId ?? getLastRequestId())
      : getLastRequestId(),
  )

  return {
    retention,
    viewState,
    requestId,
    isStale,
    refresh: async () => {
      await refresh()
    },
  }
}
```

4. [ ] Run it — expect **PASS**:
   `npm run test -- app/composables/__tests__/useRetentionStatus.nuxt.spec.ts`

5. [ ] Write the failing DSR composable test `app/composables/__tests__/useDataSubjectRequests.nuxt.spec.ts`:

```ts
// *.nuxt.spec.ts → routed to the 'nuxt' env where mockNuxtImport is available.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { ApiError } from '@/lib/api/api-client'
import { observabilityApi } from '@/services/observability.api'
import { useDataSubjectRequests } from '../useDataSubjectRequests'
import type { DataSubjectRequest, DsrListResponse } from '@/types/compliance.types'

vi.mock('@/services/observability.api', () => ({
  observabilityApi: {
    listDataSubjectRequests: vi.fn<() => Promise<DsrListResponse>>(),
  },
}))

// Controllable useAsyncData stand-in: the test mutates data/error and asserts the
// composable's derived state, and captures the key + handler to prove wiring.
const data = ref<DsrListResponse | null>(null)
const pending = ref(false)
const error = ref<unknown>(null)
const refreshMock = vi.fn<() => Promise<void>>(async () => {})
let capturedKey: string | null = null
let capturedHandler: (() => unknown) | null = null

mockNuxtImport('useAsyncData', () => {
  return (key: string, handler: () => unknown) => {
    capturedKey = key
    capturedHandler = handler
    return { data, pending, error, refresh: refreshMock }
  }
})

// A fully-typed sample request; overrides keep each case readable. The DTO carries
// only OPAQUE ids (request_id, subject_id) — never an email/NIK/NIP/NISN/name —
// matching the masked backend contract (design §3.3 PII minimization).
const base: DataSubjectRequest = {
  request_id: '01J0DSR0000000000000000001',
  subject_id: 'sub_budi',
  type: 'export',
  status: 'submitted',
  submitted_at: '2026-06-20T08:00:00Z',
  reviewed_at: null,
  fulfilled_at: null,
  sla_due_at: '2026-07-20T08:00:00Z',
}
const makeDsr = (o: Partial<DataSubjectRequest>): DataSubjectRequest => ({ ...base, ...o })

const ready: DsrListResponse = {
  requests: [
    makeDsr({ request_id: 'dsr_budi', subject_id: 'sub_budi', status: 'submitted' }),
    makeDsr({ request_id: 'dsr_citra', subject_id: 'sub_citra', status: 'fulfilled', type: 'delete' }),
  ],
}
const many: DsrListResponse = {
  requests: Array.from({ length: 30 }, (_, i) =>
    makeDsr({ request_id: `dsr_${i}`, subject_id: `sub_${i}` }),
  ),
}

beforeEach(() => {
  data.value = null
  pending.value = false
  error.value = null
  capturedKey = null
  capturedHandler = null
  vi.clearAllMocks()
})
afterEach(() => vi.clearAllMocks())

describe('useDataSubjectRequests', () => {
  it('wires the service under a stable asyncData key', () => {
    useDataSubjectRequests()
    expect(capturedKey).toBe('admin-dsr-list')
    capturedHandler?.()
    expect(observabilityApi.listDataSubjectRequests).toHaveBeenCalledTimes(1)
  })

  it('keeps requests null before an answer, distinct from an empty []', () => {
    const dsr = useDataSubjectRequests()
    expect(dsr.requests.value).toBeNull()
    expect(dsr.viewState.value).toBe('loading')
    data.value = { requests: [] }
    expect(dsr.requests.value).toEqual([])
    expect(dsr.viewState.value).toBe('empty')
  })

  it('derives ready state and exposes the queue', () => {
    data.value = ready
    const dsr = useDataSubjectRequests()
    expect(dsr.viewState.value).toBe('ready')
    expect(dsr.requests.value).toHaveLength(2)
    expect(dsr.total.value).toBe(2)
  })

  it('applies the search query and status filter to derived rows', () => {
    data.value = ready
    const dsr = useDataSubjectRequests()
    dsr.query.value = 'citra'
    expect(dsr.filtered.value.map((r) => r.request_id)).toEqual(['dsr_citra'])
    expect(dsr.filteredTotal.value).toBe(1)
    dsr.query.value = ''
    dsr.statusFilter.value = 'fulfilled'
    expect(dsr.filtered.value.map((r) => r.request_id)).toEqual(['dsr_citra'])
    expect(dsr.total.value).toBe(2)
  })

  it('paginates the filtered queue and reports the page count', () => {
    data.value = many
    const dsr = useDataSubjectRequests()
    expect(dsr.paged.value).toHaveLength(25)
    expect(dsr.pageCount.value).toBe(2)
    dsr.page.value = 2
    expect(dsr.paged.value).toHaveLength(5)
  })

  it('resets to page 1 when the query or status filter changes', async () => {
    data.value = many
    const dsr = useDataSubjectRequests()
    dsr.page.value = 2
    dsr.query.value = 'dsr_1'
    await nextTick()
    expect(dsr.page.value).toBe(1)
  })

  it('maps a first-load 403 to forbidden and exposes the redacted request id', () => {
    error.value = new ApiError(403, 'forbidden', 'forbidden', null, 'admin-req-DENIED42')
    const dsr = useDataSubjectRequests()
    expect(dsr.viewState.value).toBe('forbidden')
    expect(dsr.requestId.value).toBe('admin-req-DENIED42')
  })

  it('maps a first-load 401 to unauthenticated', () => {
    error.value = new ApiError(401, 'no session')
    expect(useDataSubjectRequests().viewState.value).toBe('unauthenticated')
  })

  it('keeps the last good queue on a background refresh failure (stale)', () => {
    data.value = ready
    error.value = new ApiError(500, 'boom')
    const dsr = useDataSubjectRequests()
    expect(dsr.viewState.value).toBe('ready')
    expect(dsr.isStale.value).toBe(true)
  })

  it('refresh() delegates to the underlying asyncData refresh', async () => {
    await useDataSubjectRequests().refresh()
    expect(refreshMock).toHaveBeenCalledTimes(1)
  })

  it('hydrates only the masked DSR DTO — no token and no raw PII digit-run leaks', () => {
    // The composable passes the masked backend DTO through verbatim; it must never
    // introduce a token field or a raw identifier. (The full SSR payload leak gate
    // over the DSR DTO is Task 6.12; this guards the data boundary.)
    data.value = many
    const dsr = useDataSubjectRequests()
    const serialized = JSON.stringify({ requests: dsr.requests.value, paged: dsr.paged.value })
    expect(serialized).not.toMatch(/access_token|refresh_token|id_token|Bearer|client_secret/i)
    expect(serialized).not.toMatch(/\b\d{16}\b|\b\d{18}\b|\b\d{10}\b/)
  })
})
```

6. [ ] Run it — expect **FAIL** (`../useDataSubjectRequests` does not exist → import/resolution error):
   `npm run test -- app/composables/__tests__/useDataSubjectRequests.nuxt.spec.ts`

7. [ ] Implement `app/composables/useDataSubjectRequests.ts` (FULL code):

```ts
import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'
import { ApiError, getLastRequestId } from '@/lib/api/api-client'
import { observabilityApi } from '@/services/observability.api'
import {
  isComplianceStale,
  resolveDsrListViewState,
  type ComplianceViewState,
} from '@/lib/compliance/compliance-view-state'
import { DSR_PAGE_SIZE, dsrPageCount, filterDsr, paginateDsr } from '@/lib/compliance/dsr-list'
import type { DataSubjectRequest, DsrListResponse, DsrStatus } from '@/types/compliance.types'

export type UseDataSubjectRequestsReturn = {
  readonly requests: ComputedRef<readonly DataSubjectRequest[] | null>
  readonly filtered: ComputedRef<readonly DataSubjectRequest[]>
  readonly paged: ComputedRef<readonly DataSubjectRequest[]>
  readonly viewState: ComputedRef<ComplianceViewState>
  readonly total: ComputedRef<number>
  readonly filteredTotal: ComputedRef<number>
  readonly page: Ref<number>
  readonly pageCount: ComputedRef<number>
  readonly query: Ref<string>
  readonly statusFilter: Ref<DsrStatus | 'all'>
  readonly requestId: ComputedRef<string | null>
  readonly isStale: ComputedRef<boolean>
  readonly refresh: () => Promise<void>
}

export function useDataSubjectRequests(): UseDataSubjectRequestsReturn {
  // Runs during SSR so the masked DSR queue resolves server-side and hydrates into
  // the payload (safe DTO only — opaque request_id/subject_id + lifecycle dates).
  // The access token stays in the Nitro event.context and never reaches the
  // page/__NUXT__.
  const { data, error, refresh } = useAsyncData<DsrListResponse>('admin-dsr-list', () =>
    observabilityApi.listDataSubjectRequests(),
  )

  // `null` (no response yet) is kept distinct from `[]` (an answered, empty queue)
  // so the view-state resolver tells "loading/error" apart from "empty". `rows` is
  // the non-null projection used for the derived filter/paginate pipeline.
  const requests = computed<readonly DataSubjectRequest[] | null>(() => data.value?.requests ?? null)
  const rows = computed<readonly DataSubjectRequest[]>(() => requests.value ?? [])

  const query = ref('')
  const statusFilter = ref<DsrStatus | 'all'>('all')
  const page = ref(1)

  // The backend DSR list has no query params, so search / status-filter /
  // pagination are derived client-side over the hydrated, already-masked queue.
  const filtered = computed<readonly DataSubjectRequest[]>(() =>
    filterDsr(rows.value, { query: query.value, status: statusFilter.value }),
  )
  const total = computed<number>(() => rows.value.length)
  const filteredTotal = computed<number>(() => filtered.value.length)
  const pageCount = computed<number>(() => dsrPageCount(filteredTotal.value, DSR_PAGE_SIZE))
  const paged = computed<readonly DataSubjectRequest[]>(() =>
    paginateDsr(filtered.value, page.value, DSR_PAGE_SIZE),
  )

  const viewState = computed<ComplianceViewState>(() =>
    resolveDsrListViewState({ error: error.value, requests: requests.value }),
  )

  // A background refresh failed but we still hold a good queue — keep it on screen
  // with a stale notice rather than blanking the table.
  const isStale = computed<boolean>(() => isComplianceStale(error.value, requests.value))

  const requestId = computed<string | null>(() =>
    error.value instanceof ApiError
      ? (error.value.requestId ?? getLastRequestId())
      : getLastRequestId(),
  )

  // Reset to the first page whenever the result set changes, so a narrowing
  // search/filter never strands the operator on an out-of-range page.
  watch([query, statusFilter], () => {
    page.value = 1
  })

  return {
    requests,
    filtered,
    paged,
    viewState,
    total,
    filteredTotal,
    page,
    pageCount,
    query,
    statusFilter,
    requestId,
    isStale,
    refresh: async () => {
      await refresh()
    },
  }
}
```

8. [ ] Run it — expect **PASS**:
   `npm run test -- app/composables/__tests__/useDataSubjectRequests.nuxt.spec.ts`

9. [ ] Refactor pass (only if needed): confirm both composables are byte-for-byte the read-only/list templates with the dashboard→retention / users→DSR swaps and no leftover `pending` argument; run both specs once more — expect **PASS**:
   `npm run test -- app/composables/__tests__/useRetentionStatus.nuxt.spec.ts app/composables/__tests__/useDataSubjectRequests.nuxt.spec.ts`

10. [ ] Commit:
    `git add app/composables/useRetentionStatus.ts app/composables/useDataSubjectRequests.ts app/composables/__tests__/useRetentionStatus.nuxt.spec.ts app/composables/__tests__/useDataSubjectRequests.nuxt.spec.ts && git commit -m "$(printf 'feat(sso-admin-frontend): useRetentionStatus + useDataSubjectRequests SSR compliance composables\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"`

**Definition of Done (run from `services/sso-admin-frontend`):** `npm run typecheck && npm run lint && npm run format:check && npm run test && npm run build` all green — and `npm run lint` runs BOTH `lint:oxlint` (`oxlint .`) AND `lint:eslint` (`eslint "app/**/*.vue"`), both must pass.


---

### Task 6.7: Observability summary components (service list, log list; reuse DashboardMetricGroup)

The Swiss content components for the cockpit. `ObservabilityServiceList.vue` renders per-service health over `UiDataList` (service name + summary, a `UiStatusBadge` whose tone comes from `resolveServiceStatusTone` and whose label is the status text — never colour-alone — and a `UiFolio` carrying latency p95 / freshness / queue counts). `ObservabilityLogList.vue` renders recent log events over `UiDataList` (timestamp folio + service + severity `UiStatusBadge` + message + a masked `reference`/`id` via `formatTechnicalPreview`, so no raw correlation id ever reaches the DOM). The metric block is **not** built here — `DashboardMetricGroup.vue` (Phase 3, domain-agnostic) is reused **directly** at the page level (Task 6.8), fed `DashboardMetricRow[]` derived from `metrics.auth_funnel` / `metrics.admin_activity` / `metrics.queue`. Both components are dumb/presentational: they receive the masked DTO slices + pre-localized captions/labels and own only the row-shaping. DS deps are imported **explicitly** (matching `DashboardMetricGroup.vue`'s `import UiDataList from '@/components/ui/UiDataList.vue'` style) so a plain `@vue/test-utils` mount resolves them without Nuxt auto-import. **No legacy circular gauges, terminal-style console, or static trace SVG are carried forward** (extract-legacy §4 anti-patterns); logs/metrics/services render as Swiss `UiDataList` / `DashboardMetricGroup` / status-badge surfaces only. Mirrors the construction style of `DashboardMetricGroup.vue` (Task 3.4).

**Files**
- Create: `app/components/observability/ObservabilityServiceList.vue`
- Create: `app/components/observability/ObservabilityLogList.vue`
- Test: `app/components/observability/__tests__/ObservabilityServiceList.spec.ts`
- Test: `app/components/observability/__tests__/ObservabilityLogList.spec.ts`

**Interfaces**
- Produces:
  - `ObservabilityServiceList.vue` — Props: `{ caption: string; nameLabel: string; statusLabel: string; services: readonly ObservabilityService[] }`; no emits
  - `ObservabilityLogList.vue` — Props: `{ caption: string; timeLabel: string; messageLabel: string; logs: readonly ObservabilityLogEvent[] }`; no emits
- Consumes: `UiDataList` (+ `UiDataListColumn`/`UiDataListRow`), `UiStatusBadge`, `UiFolio` (`@/components/ui/*`); `resolveServiceStatusTone` + `ObservabilityService`/`ObservabilityLogEvent` (Task 6.1); `formatTechnicalPreview` (`@/lib/display-identifiers`); `StatusTone` (`@/lib/status-tone`). Reuses `DashboardMetricGroup` + `DashboardMetricRow` (`@/components/dashboard/DashboardMetricGroup.vue`, Phase 3) at the page level (Task 6.8), not here. Mirrors `DashboardMetricGroup.vue` (Task 3.4) construction style.

**Steps**

1. [ ] Write the failing test `app/components/observability/__tests__/ObservabilityServiceList.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ObservabilityServiceList from '../ObservabilityServiceList.vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import type { ObservabilityService } from '@/types/observability.types'

const services: readonly ObservabilityService[] = [
  {
    key: 'backend',
    name: 'Identity Provider',
    status: 'healthy',
    summary: 'All checks passing',
    latency_p95_ms: 142,
    freshness_seconds: 30,
    queue: { pending_jobs: 4, failed_jobs: 0, oldest_pending_age_seconds: 12 },
  },
  {
    key: 'portal',
    name: 'Portal BFF',
    status: 'degraded',
    summary: 'Elevated latency',
    latency_p95_ms: 980,
    freshness_seconds: 60,
  },
  {
    key: 'mailer',
    name: 'Mailer',
    status: 'down',
    summary: 'No heartbeat',
  },
  {
    key: 'docs',
    name: 'Docs',
    status: 'unknown',
    summary: 'No probe configured',
  },
]

function mountList() {
  return mount(ObservabilityServiceList, {
    props: {
      caption: 'Layanan',
      nameLabel: 'Layanan',
      statusLabel: 'Status',
      services,
    },
  })
}

describe('ObservabilityServiceList', () => {
  it('renders the caption, every service name, and its summary', () => {
    const wrapper = mountList()
    expect(wrapper.text()).toContain('Layanan')
    expect(wrapper.text()).toContain('Identity Provider')
    expect(wrapper.text()).toContain('Portal BFF')
    expect(wrapper.text()).toContain('Mailer')
    expect(wrapper.text()).toContain('All checks passing')
    expect(wrapper.text()).toContain('No heartbeat')
  })

  it('maps each service status to a tone via resolveServiceStatusTone (tone + label, never colour-alone)', () => {
    const wrapper = mountList()
    const badges = wrapper.findAllComponents(UiStatusBadge)
    const tones = badges.map((b) => b.props('tone'))
    expect(tones).toContain('success') // healthy
    expect(tones).toContain('warning') // degraded
    expect(tones).toContain('danger') // down
    expect(tones).toContain('neutral') // unknown
    // every badge pairs the tone with a real text label
    expect(badges.every((b) => Boolean(b.props('label')))).toBe(true)
    expect(wrapper.text()).toContain('down')
  })

  it('renders latency / freshness / queue as folio numerals when present', () => {
    const wrapper = mountList()
    expect(wrapper.text()).toContain('142')
    expect(wrapper.text()).toContain('980')
    expect(wrapper.text()).toContain('4/0') // queue pending/failed
  })
})
```

2. [ ] Run it — expect **FAIL** (`../ObservabilityServiceList.vue` does not exist):
   `npm run test -- app/components/observability/__tests__/ObservabilityServiceList.spec.ts`

3. [ ] Implement `app/components/observability/ObservabilityServiceList.vue` (FULL code):

```vue
<script setup lang="ts">
import { computed } from 'vue'
import UiDataList, {
  type UiDataListColumn,
  type UiDataListRow,
} from '@/components/ui/UiDataList.vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import UiFolio from '@/components/ui/UiFolio.vue'
import type { StatusTone } from '@/lib/status-tone'
import { resolveServiceStatusTone } from '@/lib/observability/observability-view-state'
import type { ObservabilityService } from '@/types/observability.types'

const props = defineProps<{
  readonly caption: string
  readonly nameLabel: string
  readonly statusLabel: string
  readonly services: readonly ObservabilityService[]
}>()

type ServiceRow = UiDataListRow & {
  readonly name: string
  readonly summary: string
  readonly status: string
  readonly tone: StatusTone
  readonly metrics: string
}

const columns = computed<readonly UiDataListColumn[]>(() => [
  { key: 'name', label: props.nameLabel, align: 'left' },
  { key: 'status', label: props.statusLabel, align: 'right' },
])

function formatMetrics(service: ObservabilityService): string {
  const parts: string[] = []
  if (service.latency_p95_ms != null) parts.push(`p95 ${service.latency_p95_ms}ms`)
  if (service.freshness_seconds != null) parts.push(`${service.freshness_seconds}s`)
  if (service.queue) parts.push(`q ${service.queue.pending_jobs}/${service.queue.failed_jobs}`)
  return parts.join(' / ')
}

const rows = computed<readonly ServiceRow[]>(() =>
  props.services.map((service) => ({
    id: service.key,
    name: service.name,
    summary: service.summary,
    status: service.status,
    tone: resolveServiceStatusTone(service.status),
    metrics: formatMetrics(service),
  })),
)

function rowTone(value: unknown): StatusTone {
  return (typeof value === 'string' ? value : 'neutral') as StatusTone
}
</script>

<template>
  <UiDataList
    class="observability-service-list"
    :caption="caption"
    :columns="columns"
    :rows="rows"
    :total="rows.length"
  >
    <template #cell(name)="{ row }">
      <span class="observability-service-list__name">{{ row.name }}</span>
      <span v-if="row.summary" class="observability-service-list__summary">{{ row.summary }}</span>
    </template>
    <template #cell(status)="{ row }">
      <UiStatusBadge :tone="rowTone(row.tone)" :label="String(row.status)" />
      <UiFolio v-if="row.metrics" :value="String(row.metrics)" variant="count" />
    </template>
  </UiDataList>
</template>

<style scoped>
.observability-service-list__name {
  display: block;
  font: 600 0.8125rem/1.3 var(--font-sans);
  color: var(--fg);
}
.observability-service-list__summary {
  display: block;
  margin-top: 2px;
  font: 400 0.75rem/1.4 var(--font-sans);
  color: var(--fg-2);
}
</style>
```

4. [ ] Run it — expect **PASS**:
   `npm run test -- app/components/observability/__tests__/ObservabilityServiceList.spec.ts`

5. [ ] Write the failing test `app/components/observability/__tests__/ObservabilityLogList.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ObservabilityLogList from '../ObservabilityLogList.vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import type { ObservabilityLogEvent } from '@/types/observability.types'

const logs: readonly ObservabilityLogEvent[] = [
  {
    id: 'evt-1',
    service: 'backend',
    severity: 'info',
    message: 'Token issued',
    reference: 'corr-0123456789abcdef',
    occurred_at: '2026-06-28T14:32:15Z',
  },
  {
    id: 'evt-2',
    service: 'portal',
    severity: 'warning',
    message: 'Slow upstream',
    occurred_at: '2026-06-28T14:31:00Z',
  },
  {
    id: 'evt-3',
    service: 'mailer',
    severity: 'error',
    message: 'Delivery failed',
    reference: null,
    occurred_at: '2026-06-28T14:30:00Z',
  },
]

function mountList() {
  return mount(ObservabilityLogList, {
    props: {
      caption: 'Peristiwa Terbaru',
      timeLabel: 'Waktu',
      messageLabel: 'Pesan',
      logs,
    },
  })
}

describe('ObservabilityLogList', () => {
  it('renders the caption, each service, message, and timestamp', () => {
    const wrapper = mountList()
    expect(wrapper.text()).toContain('Peristiwa Terbaru')
    expect(wrapper.text()).toContain('backend')
    expect(wrapper.text()).toContain('Token issued')
    expect(wrapper.text()).toContain('Delivery failed')
    expect(wrapper.text()).toContain('2026-06-28T14:32:15Z')
  })

  it('renders severity as a status badge (label + tone, never colour-alone)', () => {
    const wrapper = mountList()
    const statuses = wrapper.findAllComponents(UiStatusBadge).map((b) => b.props('status'))
    expect(statuses).toContain('info')
    expect(statuses).toContain('warning')
    expect(statuses).toContain('error')
  })

  it('masks the correlation reference to REF- and never renders the raw id', () => {
    const wrapper = mountList()
    expect(wrapper.text()).toContain('REF-')
    expect(wrapper.text()).not.toContain('corr-0123456789abcdef')
  })
})
```

6. [ ] Run it — expect **FAIL** (`../ObservabilityLogList.vue` does not exist):
   `npm run test -- app/components/observability/__tests__/ObservabilityLogList.spec.ts`

7. [ ] Implement `app/components/observability/ObservabilityLogList.vue` (FULL code):

```vue
<script setup lang="ts">
import { computed } from 'vue'
import UiDataList, {
  type UiDataListColumn,
  type UiDataListRow,
} from '@/components/ui/UiDataList.vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import UiFolio from '@/components/ui/UiFolio.vue'
import { formatTechnicalPreview } from '@/lib/display-identifiers'
import type { ObservabilityLogEvent } from '@/types/observability.types'

const props = defineProps<{
  readonly caption: string
  readonly timeLabel: string
  readonly messageLabel: string
  readonly logs: readonly ObservabilityLogEvent[]
}>()

type LogRow = UiDataListRow & {
  readonly time: string
  readonly service: string
  readonly severity: string
  readonly message: string
  readonly reference: string
}

const columns = computed<readonly UiDataListColumn[]>(() => [
  { key: 'time', label: props.timeLabel, align: 'left' },
  { key: 'message', label: props.messageLabel, align: 'left' },
])

const rows = computed<readonly LogRow[]>(() =>
  props.logs.map((log, index) => ({
    id: log.id ?? `log-${index}`,
    time: log.occurred_at ?? '—',
    service: log.service,
    severity: log.severity,
    message: log.message,
    reference: formatTechnicalPreview(log.reference ?? log.id ?? null),
  })),
)
</script>

<template>
  <UiDataList
    class="observability-log-list"
    :caption="caption"
    :columns="columns"
    :rows="rows"
    :total="rows.length"
  >
    <template #cell(time)="{ row }">
      <UiFolio :value="String(row.time)" variant="timestamp" />
      <span class="observability-log-list__service">{{ row.service }}</span>
      <UiStatusBadge :status="String(row.severity)" />
    </template>
    <template #cell(message)="{ row }">
      <span class="observability-log-list__message">{{ row.message }}</span>
      <UiFolio :value="String(row.reference)" variant="id" />
    </template>
  </UiDataList>
</template>

<style scoped>
.observability-log-list__service {
  display: block;
  margin-top: 4px;
  font: 500 0.75rem/1.3 var(--font-sans);
  color: var(--fg-2);
}
.observability-log-list__message {
  display: block;
  font: 400 0.8125rem/1.4 var(--font-sans);
  color: var(--fg);
}
</style>
```

8. [ ] Run it — expect **PASS**:
   `npm run test -- app/components/observability/__tests__/ObservabilityLogList.spec.ts`

9. [ ] Refactor pass (only if needed): confirm both SFCs import every DS dep explicitly (no reliance on Nuxt auto-import — a plain `@vue/test-utils` mount must resolve them), that the severity badge in the log list resolves its tone from the `status` prop (`info`→info, `warning`→warning, `error`→danger via `resolveStatusTone` inside `UiStatusBadge`, so no extra import is needed), and that the reference is **only** ever rendered through `formatTechnicalPreview` (no raw id path). Run both specs together:
   `npm run test -- app/components/observability/__tests__/`

10. [ ] Commit:
    `git add app/components/observability/ && git commit -m "$(printf 'feat(sso-admin-frontend): Swiss observability summary components (service list + log list)\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"`

**Deliverable:** presentational, unit-tested Swiss components for service-health and log-event rendering (folio numerals + status badges, never colour-alone; log references masked to `REF-`), with the metric block left to the reused `DashboardMetricGroup.vue` at the page level.

**Definition of Done (run from `services/sso-admin-frontend`; report any blocked command, never claim PASS for a command that did not run):** `npm run typecheck && npm run lint && npm run format:check && npm run test && npm run build` — where `npm run lint` runs **BOTH** `lint:oxlint` (`oxlint .`) AND `lint:eslint` (`eslint "app/**/*.vue"`), both must pass.


---

### Task 6.8: Observability summary page (observability/index.vue) + redirect confirmation

Compose the cockpit into the existing stub: keep `definePageMeta({ name: 'admin.observability', layout: 'admin', requiresAdmin: true, permissions: ['admin.observability.read'] })`, add safe principal hydration (`useAsyncData('admin-observability-principal', () => store.ensureSession())`) + `useObservabilitySummary()`, and render all six states with the Swiss DS — `UiSkeleton` (loading), `UiStatusView` (forbidden / unauthenticated / error, each redacting the request id to `REF-`), `UiEmptyState` (no data — distinct from forbidden), and a ready workspace (`ObservabilityServiceList` + three `DashboardMetricGroup` metric blocks built from `metrics.auth_funnel`/`admin_activity`/`queue` + `ObservabilityLogList` + a traces `UiStatusBadge`/reason). A degraded/stale banner sits above the workspace. The only in-UI cross-nav is a named-route `NuxtLink` to `admin.observability.compliance`. The legacy `audit.*` cockpit i18n keys are **renamed** to `observability.*` in BOTH locales (with cockpit copy overrides + the new cockpit keys, id↔en parity). The `/audit` redirect is **confirmed** (route-map assertion), not rebuilt.

This task copies the page shell of `app/pages/dashboard.vue` (Task 3.5) and its test `app/pages/__tests__/dashboard.page.nuxt.spec.ts` verbatim in structure, swapping dashboard → observability. No write/export action lives on this page — it is read-only (mirror the Phase-3 dashboard mechanic, not the Phase-4/5 lifecycle one).

**Files**
- Modify: `app/pages/observability/index.vue` (build the all-states page into the current `<h1>Observability</h1>` stub)
- Modify: `app/locales/id.json`, `app/locales/en.json` (rename the legacy `audit` block → `observability`; override cockpit copy; ADD the new cockpit keys — BOTH files, id↔en parity)
- Test: `app/pages/__tests__/observability.page.nuxt.spec.ts` (NEW — nuxt-runtime page test, all six states + cross-link + no-leak)
- Modify (extend): `app/pages/__tests__/route-map.spec.ts` (the `admin.observability` meta/permission row already exists and is asserted; the `/audit → admin.observability` redirect assertion already exists — ADD one assertion that the cockpit page cross-links the named compliance route)

**Interfaces**
- Consumes (verbatim from skeleton): `useSessionStore` (`principal.display_name`, `ensureSession`, `hasPermission`) (`@/stores/session.store`); `useObservabilitySummary` (Task 6.5); `resolveServiceStatusTone`/`ObservabilitySummary` (Task 6.1 — service tone is consumed transitively through `ObservabilityServiceList`; the page imports the `ObservabilitySummary`/`ObservabilityQueue` types and `StatusTone`); `ObservabilityServiceList`/`ObservabilityLogList` (Task 6.7); `DashboardMetricGroup` + `DashboardMetricRow` (Phase 3, `@/components/dashboard/DashboardMetricGroup.vue`); `useI18n`; `UiSkeleton`/`UiStatusView`/`UiEmptyState`/`UiButton`/`UiFolio`/`UiStatusBadge`.
- Produces: the rendered `/observability` route (no exported API); `observability.*` i18n cockpit keys (id + en); route-map confirmation of `admin.observability` meta/permission + the `/audit` redirect target.

This task renders/hydrates observability summary data, so its test asserts no token (value/name), secret, or raw PII enters the rendered HTML — and the masked log `reference` surfaces only as `REF-…`, never raw.

---

#### Step 1 — RED: write the failing page test

Create `app/pages/__tests__/observability.page.nuxt.spec.ts` (mirrors `dashboard.page.nuxt.spec.ts`):

```ts
// *.nuxt.spec.ts → 'nuxt' env: mountSuspended handles the page's async setup
// (useAsyncData + useI18n auto-imports). Data boundary + session store are mocked.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import DashboardMetricGroup from '@/components/dashboard/DashboardMetricGroup.vue'
import ObservabilityServiceList from '@/components/observability/ObservabilityServiceList.vue'
import ObservabilityLogList from '@/components/observability/ObservabilityLogList.vue'
import type { ObservabilitySummary } from '@/types/observability.types'
import type { ObservabilityViewState } from '@/lib/observability/observability-view-state'

const summary = ref<ObservabilitySummary | null>(null)
const viewState = ref<ObservabilityViewState>('loading')
const requestId = ref<string | null>(null)
const degraded = ref<readonly string[]>([])
const isStale = ref(false)
const refreshMock = vi.fn<() => Promise<void>>(async () => {})

vi.mock('@/composables/useObservabilitySummary', () => ({
  useObservabilitySummary: () => ({
    summary,
    viewState,
    requestId,
    degraded,
    isStale,
    refresh: refreshMock,
  }),
}))

vi.mock('@/stores/session.store', () => ({
  useSessionStore: () => ({
    principal: { display_name: 'Admin Sentinel' },
    ensureSession: vi.fn<() => Promise<string>>(async () => 'authenticated'),
    hasPermission: (permission: string) => permission === 'admin.observability.read',
  }),
}))

const READY: ObservabilitySummary = {
  generated_at: '2026-06-28T14:32:15Z',
  partial: false,
  degraded: [],
  services: [
    {
      key: 'idp',
      name: 'Identity Provider',
      status: 'healthy',
      summary: 'All checks passing',
      latency_p95_ms: 42,
      freshness_seconds: 5,
    },
    {
      key: 'queue',
      name: 'Queue Worker',
      status: 'degraded',
      summary: 'Backlog growing',
      queue: { pending_jobs: 12, failed_jobs: 1, oldest_pending_age_seconds: 90 },
    },
  ],
  metrics: {
    window_seconds: 86400,
    auth_funnel: { attempts: 1800, succeeded: 1700, denied: 100 },
    admin_activity: { actions: 240, denied: 3 },
    queue: { pending_jobs: 12, failed_jobs: 1, oldest_pending_age_seconds: 90 },
  },
  logs: [
    {
      id: 'evt_01',
      service: 'idp',
      severity: 'warning',
      message: 'Slow token issuance',
      reference: 'corr-LOGREF123',
      occurred_at: '2026-06-28T14:30:00Z',
    },
  ],
  traces: {
    status: 'unavailable',
    reason: 'OTLP collector not configured',
    next_step: 'Enable the collector',
  },
}
const EMPTY: ObservabilitySummary = {
  ...READY,
  services: [],
  metrics: { window_seconds: 86400 },
  logs: [],
  traces: { status: 'unavailable', reason: 'No traces recorded' },
}

const Observability = (await import('../observability/index.vue')).default

beforeEach(() => {
  summary.value = null
  viewState.value = 'loading'
  requestId.value = null
  degraded.value = []
  isStale.value = false
  vi.clearAllMocks()
})
afterEach(() => vi.clearAllMocks())

describe('observability cockpit page', () => {
  it('always renders the masked principal in the hero with no token/PII', async () => {
    const wrapper = await mountSuspended(Observability)
    const principal = wrapper.find('[data-principal-name]')
    expect(principal.exists()).toBe(true)
    expect(principal.text()).toContain('Admin Sentinel')
    expect(wrapper.find('[data-page="observability"]').exists()).toBe(true)
    expect(wrapper.html()).not.toMatch(/access_token|refresh_token|id_token|Bearer/u)
  })

  it('always exposes a named-route cross-link to the compliance console', async () => {
    const wrapper = await mountSuspended(Observability)
    const link = wrapper.find('[data-compliance-link]')
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toBe('/observability/compliance')
  })

  it('loading → skeleton, no service list / metric groups / log list', async () => {
    viewState.value = 'loading'
    const wrapper = await mountSuspended(Observability)
    expect(wrapper.findComponent(UiSkeleton).exists()).toBe(true)
    expect(wrapper.findComponent(ObservabilityServiceList).exists()).toBe(false)
    expect(wrapper.findAllComponents(DashboardMetricGroup).length).toBe(0)
    expect(wrapper.findComponent(ObservabilityLogList).exists()).toBe(false)
  })

  it('forbidden → forbidden status view (no-permission), distinct from empty', async () => {
    viewState.value = 'forbidden'
    requestId.value = 'admin-req-DENIED42'
    const wrapper = await mountSuspended(Observability)
    expect(wrapper.findComponent(UiStatusView).props('tone')).toBe('forbidden')
    expect(wrapper.findComponent(UiEmptyState).exists()).toBe(false)
    expect(wrapper.text()).not.toMatch(/SQLSTATE|stack trace|Bearer/iu)
  })

  it('unauthenticated → step_up status view', async () => {
    viewState.value = 'unauthenticated'
    const wrapper = await mountSuspended(Observability)
    expect(wrapper.findComponent(UiStatusView).props('tone')).toBe('step_up')
  })

  it('error → error status view; raw request id is redacted to REF-XXXXXXXX', async () => {
    viewState.value = 'error'
    requestId.value = 'admin-req-FAILED99'
    const wrapper = await mountSuspended(Observability)
    expect(wrapper.findComponent(UiStatusView).props('tone')).toBe('error')
    expect(wrapper.text()).toContain('REF-')
    expect(wrapper.text()).not.toContain('admin-req-FAILED99')
  })

  it('empty → empty state, not a status view', async () => {
    viewState.value = 'empty'
    summary.value = EMPTY
    const wrapper = await mountSuspended(Observability)
    expect(wrapper.findComponent(UiEmptyState).exists()).toBe(true)
    expect(wrapper.findComponent(UiStatusView).exists()).toBe(false)
  })

  it('ready → service list + three metric groups + log list + traces badge, no leaks', async () => {
    viewState.value = 'ready'
    summary.value = READY
    const wrapper = await mountSuspended(Observability)
    expect(wrapper.findComponent(ObservabilityServiceList).exists()).toBe(true)
    expect(wrapper.findAllComponents(DashboardMetricGroup).length).toBe(3)
    expect(wrapper.findComponent(ObservabilityLogList).exists()).toBe(true)
    expect(wrapper.findComponent(UiStatusBadge).exists()).toBe(true)
    expect(wrapper.text()).toContain('Kesehatan layanan') // id-default localized cockpit copy
    expect(wrapper.html()).toContain('2026-06-28T14:32:15Z') // generated_at folio
    expect(wrapper.html()).not.toMatch(/access_token|refresh_token|id_token|Bearer/u)
    expect(wrapper.html()).not.toContain('corr-LOGREF123') // log reference is masked, never raw
  })

  it('partial → degraded banner naming the sections, workspace still visible', async () => {
    viewState.value = 'ready'
    summary.value = { ...READY, partial: true, degraded: ['queue'] }
    degraded.value = ['queue']
    const wrapper = await mountSuspended(Observability)
    expect(wrapper.find('[role="status"]').exists()).toBe(true)
    expect(wrapper.findComponent(ObservabilityServiceList).exists()).toBe(true)
  })

  it('stale → stale banner above a still-rendered workspace', async () => {
    viewState.value = 'ready'
    summary.value = READY
    isStale.value = true
    const wrapper = await mountSuspended(Observability)
    expect(wrapper.find('[role="status"]').exists()).toBe(true)
    expect(wrapper.findComponent(ObservabilityServiceList).exists()).toBe(true)
  })
})
```

Run it (expected FAIL — the stub only renders `<h1>Observability</h1>`):

```bash
npm run test -- app/pages/__tests__/observability.page.nuxt.spec.ts
```

Expected: FAIL — e.g. `expected false to be true` on `[data-page="observability"]` / `[data-compliance-link]` and the missing child components.

- [ ] Page test written and failing for the right reason (missing page content, not an import typo).

---

#### Step 2 — RED: extend the route-map confirmation

The `admin.observability` meta/permission row and the `/audit → admin.observability` redirect assertion already exist in `app/pages/__tests__/route-map.spec.ts` (the redirect is **confirmed, not rebuilt**). Add one assertion that the cockpit page cross-links the named compliance route. Edit the final `it(...)` block:

```ts
  it('redirects /, /audit and /audit/compliance to their canonical routes', () => {
    expect(read('index.vue')).toContain(`navigateTo('/dashboard'`)
    expect(read('audit/index.vue')).toContain(`name: 'admin.observability'`)
    expect(read('audit/compliance.vue')).toContain(`name: 'admin.observability.compliance'`)
  })

  it('cross-links the observability cockpit to the compliance console by named route', () => {
    expect(read('observability/index.vue')).toContain(`name: 'admin.observability.compliance'`)
  })
```

Run it (expected FAIL — the stub has no cross-link):

```bash
npm run test -- app/pages/__tests__/route-map.spec.ts
```

Expected: FAIL on the new `cross-links the observability cockpit...` assertion (`Expected substring ... name: 'admin.observability.compliance'`).

- [ ] Route-map assertion added and failing.

---

#### Step 3 — GREEN: rename the locale block + add cockpit keys

Rename the legacy `audit` block to `observability` in BOTH locales, override the cockpit copy, and add the new cockpit keys — order-preserving, id↔en parity. No app code references the `audit.*` keys (verified: zero `t('audit.…')` usages in `app/`), so the rename is safe. Run from `services/sso-admin-frontend`:

```bash
python3 - <<'PY'
import json

COCKPIT = {
  'en': {
    'eyebrow': 'Operations',
    'title': 'Observability',
    'summary': 'Service health, queue and authentication metrics, recent events, and trace availability.',
    'loading': 'Loading observability',
    'forbidden_title': 'Observability access denied',
    'error_title': 'Observability could not be loaded',
    'empty_title': 'No observability data yet',
    'empty_desc': 'No service health or events to display yet.',
    'signed_in_as': 'Signed in as {name}',
    'generated_at': 'Generated at',
    'degraded_banner': 'Some sections are degraded: {sections}.',
    'stale_banner': 'Showing the last known snapshot; the latest refresh failed.',
    'services_title': 'Service health',
    'service_name': 'Service',
    'service_status': 'Status',
    'logs_title': 'Recent events',
    'log_time': 'Time',
    'log_message': 'Message',
    'traces_title': 'Trace availability',
    'metric_label': 'Metric',
    'count_label': 'Count',
    'metrics_auth': 'Authentication funnel',
    'metrics_admin': 'Admin activity',
    'metrics_queue': 'Queue',
    'compliance_link': 'Open compliance console',
  },
  'id': {
    'eyebrow': 'Operasi',
    'title': 'Observabilitas',
    'summary': 'Kesehatan layanan, metrik antrean dan autentikasi, peristiwa terbaru, dan ketersediaan trace.',
    'loading': 'Memuat observabilitas',
    'forbidden_title': 'Akses observabilitas ditolak',
    'error_title': 'Observabilitas tidak dapat dimuat',
    'empty_title': 'Belum ada data observabilitas',
    'empty_desc': 'Belum ada kesehatan layanan atau peristiwa untuk ditampilkan.',
    'signed_in_as': 'Masuk sebagai {name}',
    'generated_at': 'Dibuat pada',
    'degraded_banner': 'Sebagian bagian terdegradasi: {sections}.',
    'stale_banner': 'Menampilkan snapshot terakhir; penyegaran terbaru gagal.',
    'services_title': 'Kesehatan layanan',
    'service_name': 'Layanan',
    'service_status': 'Status',
    'logs_title': 'Peristiwa terbaru',
    'log_time': 'Waktu',
    'log_message': 'Pesan',
    'traces_title': 'Ketersediaan trace',
    'metric_label': 'Metrik',
    'count_label': 'Jumlah',
    'metrics_auth': 'Corong autentikasi',
    'metrics_admin': 'Aktivitas admin',
    'metrics_queue': 'Antrean',
    'compliance_link': 'Buka konsol kepatuhan',
  },
}

for loc in ('en', 'id'):
    path = f'app/locales/{loc}.json'
    with open(path, encoding='utf-8') as fh:
        data = json.load(fh)
    out = {}
    for key, value in data.items():
        if key == 'audit':
            out['observability'] = {**value, **COCKPIT[loc]}
        elif key == 'observability':  # idempotent re-run
            out['observability'] = {**value, **COCKPIT[loc]}
        else:
            out[key] = value
    out.setdefault('observability', dict(COCKPIT[loc]))
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump(out, fh, ensure_ascii=False, indent=2)
        fh.write('\n')
print('locales updated')
PY
npx prettier --write app/locales/en.json app/locales/id.json
```

Expected: `locales updated` then prettier reports both files formatted.

- [ ] `audit` block renamed → `observability` in both files; cockpit copy + new keys present, id↔en parity; prettier-clean.

---

#### Step 4 — GREEN: build the page into the stub

Overwrite `app/pages/observability/index.vue` (copy of `dashboard.vue` shell, observability content):

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { AlertTriangle } from 'lucide-vue-next'
import { useSessionStore } from '@/stores/session.store'
import { useI18n } from '@/composables/useI18n'
import { useObservabilitySummary } from '@/composables/useObservabilitySummary'
import type { StatusTone } from '@/lib/status-tone'
import type { ObservabilityQueue } from '@/types/observability.types'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiFolio from '@/components/ui/UiFolio.vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import ObservabilityServiceList from '@/components/observability/ObservabilityServiceList.vue'
import ObservabilityLogList from '@/components/observability/ObservabilityLogList.vue'
import DashboardMetricGroup, {
  type DashboardMetricRow,
} from '@/components/dashboard/DashboardMetricGroup.vue'

definePageMeta({
  name: 'admin.observability',
  layout: 'admin',
  requiresAdmin: true,
  permissions: ['admin.observability.read'],
})

const { t } = useI18n()

// SAFE HYDRATION: resolve the masked principal server-side via the session store
// (display name, role, capability flags only). OIDC tokens + raw government PII
// stay in Nitro event.context and are never written to useState / __NUXT__.
const store = useSessionStore()
await useAsyncData('admin-observability-principal', () => store.ensureSession())

// SAFE DATA: the summary is fetched through observabilityApi (no direct fetch in
// the page). The DTO is masked aggregates + timestamps only — no secret, token,
// or raw PII — so it is safe to serialize into the SSR payload.
const { summary, viewState, requestId, degraded, isStale, refresh } = useObservabilitySummary()

const humanize = (key: string): string => key.replace(/_/gu, ' ')

function metricTone(key: string, value: number | null): StatusTone {
  if (value === null || value === 0) return 'neutral'
  if (/failed|denied|error/u.test(key)) return 'danger'
  if (/pending|on_hold|stale/u.test(key)) return 'warning'
  return 'neutral'
}

function rowsFromRecord(record: Readonly<Record<string, number>> | undefined): DashboardMetricRow[] {
  if (!record) return []
  return Object.entries(record).map(
    ([key, value]): DashboardMetricRow => ({
      id: key,
      label: humanize(key),
      value,
      tone: metricTone(key, value),
    }),
  )
}

function rowsFromQueue(queue: ObservabilityQueue | undefined): DashboardMetricRow[] {
  if (!queue) return []
  return [
    {
      id: 'pending_jobs',
      label: humanize('pending_jobs'),
      value: queue.pending_jobs,
      tone: metricTone('pending_jobs', queue.pending_jobs),
    },
    {
      id: 'failed_jobs',
      label: humanize('failed_jobs'),
      value: queue.failed_jobs,
      tone: metricTone('failed_jobs', queue.failed_jobs),
    },
    {
      id: 'oldest_pending_age_seconds',
      label: humanize('oldest_pending_age_seconds'),
      value: queue.oldest_pending_age_seconds,
      tone: 'neutral',
    },
  ]
}

const metricGroups = computed(() => {
  const metrics = summary.value?.metrics
  if (!metrics) return []
  const groups: ReadonlyArray<{ key: string; caption: string; rows: DashboardMetricRow[] }> = [
    { key: 'auth', caption: t('observability.metrics_auth'), rows: rowsFromRecord(metrics.auth_funnel) },
    { key: 'admin', caption: t('observability.metrics_admin'), rows: rowsFromRecord(metrics.admin_activity) },
    { key: 'queue', caption: t('observability.metrics_queue'), rows: rowsFromQueue(metrics.queue) },
  ]
  return groups.filter((group) => group.rows.length > 0)
})

const degradedLabel = computed<string>(() => degraded.value.map(humanize).join(', '))

async function onRefresh(): Promise<void> {
  await refresh()
}
</script>

<template>
  <section class="observability" data-page="observability">
    <header class="observability__hero">
      <span class="observability__eyebrow">{{ t('observability.eyebrow') }}</span>
      <h1 class="observability__title">{{ t('observability.title') }}</h1>
      <p class="observability__summary">{{ t('observability.summary') }}</p>
      <p class="observability__principal" data-principal-name>
        {{ t('observability.signed_in_as', { name: store.principal?.display_name ?? '—' }) }}
      </p>
      <NuxtLink
        v-if="store.hasPermission('admin.observability.read')"
        :to="{ name: 'admin.observability.compliance' }"
        class="observability__crosslink"
        data-compliance-link
      >
        {{ t('observability.compliance_link') }}
      </NuxtLink>
      <dl v-if="summary" class="observability__evidence">
        <dt>{{ t('observability.generated_at') }}</dt>
        <dd><UiFolio :value="summary.generated_at" variant="timestamp" /></dd>
      </dl>
    </header>

    <UiSkeleton v-if="viewState === 'loading'" :rows="6" :label="t('observability.loading')" />

    <UiStatusView
      v-else-if="viewState === 'forbidden'"
      tone="forbidden"
      :eyebrow="t('observability.eyebrow')"
      :title="t('observability.forbidden_title')"
      :description="t('common.forbidden_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="viewState === 'unauthenticated'"
      tone="step_up"
      :eyebrow="t('observability.eyebrow')"
      :title="t('common.session_expired_title')"
      :description="t('common.session_expired_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="viewState === 'error'"
      tone="error"
      :eyebrow="t('observability.eyebrow')"
      :title="t('observability.error_title')"
      :description="t('common.error_loading_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    >
      <template #actions>
        <UiButton variant="secondary" size="sm" @click="onRefresh">
          {{ t('common.btn_refresh') }}
        </UiButton>
      </template>
    </UiStatusView>

    <UiEmptyState
      v-else-if="viewState === 'empty'"
      :title="t('observability.empty_title')"
      :description="t('observability.empty_desc')"
    >
      <template #action>
        <UiButton variant="secondary" size="sm" @click="onRefresh">
          {{ t('common.btn_refresh') }}
        </UiButton>
      </template>
    </UiEmptyState>

    <template v-else-if="summary">
      <div
        v-if="summary.partial || isStale"
        class="observability__banner"
        role="status"
      >
        <AlertTriangle :size="16" aria-hidden="true" />
        <span v-if="summary.partial">
          {{ t('observability.degraded_banner', { sections: degradedLabel }) }}
        </span>
        <span v-else>{{ t('observability.stale_banner') }}</span>
      </div>

      <ObservabilityServiceList
        :caption="t('observability.services_title')"
        :name-label="t('observability.service_name')"
        :status-label="t('observability.service_status')"
        :services="summary.services"
      />

      <div class="observability__grid">
        <DashboardMetricGroup
          v-for="group in metricGroups"
          :key="group.key"
          :caption="group.caption"
          :metric-label="t('observability.metric_label')"
          :count-label="t('observability.count_label')"
          :rows="group.rows"
        />
      </div>

      <ObservabilityLogList
        :caption="t('observability.logs_title')"
        :time-label="t('observability.log_time')"
        :message-label="t('observability.log_message')"
        :logs="summary.logs"
      />

      <section class="observability__traces" aria-labelledby="observability-traces">
        <h2 id="observability-traces" class="observability__section-title">
          {{ t('observability.traces_title') }}
        </h2>
        <UiStatusBadge :status="summary.traces.status" :label="summary.traces.status" />
        <p class="observability__traces-reason">{{ summary.traces.reason }}</p>
        <p v-if="summary.traces.next_step" class="observability__traces-next">
          {{ summary.traces.next_step }}
        </p>
      </section>
    </template>
  </section>
</template>

<style scoped>
.observability {
  display: grid;
  gap: 24px;
  padding: 24px;
}
.observability__hero {
  display: grid;
  gap: 6px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border);
}
.observability__eyebrow {
  font: 600 0.6875rem/1 var(--font-sans);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.observability__title {
  margin: 0;
  font: 600 1.5rem/1.2 var(--font-sans);
  letter-spacing: -0.02em;
  color: var(--fg);
}
.observability__summary {
  margin: 0;
  max-width: 64ch;
  font: 400 0.875rem/1.6 var(--font-sans);
  color: var(--fg-2);
}
.observability__principal {
  margin: 0;
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--fg-2);
}
.observability__crosslink {
  justify-self: start;
  font: 500 0.8125rem/1.4 var(--font-sans);
  color: var(--accent);
  text-decoration: none;
}
.observability__crosslink:hover {
  text-decoration: underline;
}
.observability__evidence {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 4px 0 0;
}
.observability__evidence dt {
  font: 600 0.625rem/1 var(--font-sans);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.observability__evidence dd {
  margin: 0;
}
.observability__banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  font: 500 0.8125rem/1.4 var(--font-sans);
  color: var(--warning-soft-fg);
  background: var(--warning-soft);
  border: 1px solid var(--warning-soft-fg);
  border-radius: var(--r-sm);
}
.observability__grid {
  display: grid;
  gap: 20px;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
}
.observability__traces {
  display: grid;
  gap: 8px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}
.observability__section-title {
  margin: 0;
  font: 600 1rem/1.3 var(--font-sans);
  color: var(--fg);
}
.observability__traces-reason {
  margin: 0;
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--fg-2);
}
.observability__traces-next {
  margin: 0;
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--fg-3);
}
</style>
```

Run both tests (expected PASS):

```bash
npm run test -- app/pages/__tests__/observability.page.nuxt.spec.ts app/pages/__tests__/route-map.spec.ts
```

Expected: PASS — all `observability cockpit page` specs green; `admin route map` green including the new cross-link assertion.

- [ ] Page test green (all six states + cross-link + masked-reference + no-leak).
- [ ] Route-map green (meta/permission + `/audit` redirect confirmed + cross-link).

---

#### Step 5 — REFACTOR

Re-read the diff against the Phase-3 dashboard page: confirm the page imports nothing it does not use (oxlint `no-unused-vars` — service status tone is owned by `ObservabilityServiceList`, so `resolveServiceStatusTone` is **not** imported here), the metric-tone helper stays a pure function, and the `<style>` uses tokens only (no hard-coded colours, no shadow-as-structure). No structural change expected; tidy only.

- [ ] Diff matches the dashboard precedent; tokens-only styling; no unused imports.

---

#### Step 6 — COMMIT

```bash
git add app/pages/observability/index.vue app/locales/en.json app/locales/id.json app/pages/__tests__/observability.page.nuxt.spec.ts app/pages/__tests__/route-map.spec.ts
git commit -m "feat(sso-admin-frontend): compose Swiss observability cockpit page (all states, compliance cross-link)

Build the all-states, permission-aware observability summary page into the
stub over useObservabilitySummary: skeleton/forbidden/unauthenticated/error/
empty/ready with redacted REF- support codes, service list + metric groups +
log list + traces badge, degraded/stale banner, and a named-route cross-link
to the compliance console. Rename the legacy audit.* cockpit i18n block to
observability.* in both locales. Confirm the /audit redirect via route-map.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] Committed on green; conventional message; no traceability markers.

---

**Task-scoped DoD** (run from `services/sso-admin-frontend`; `npm run lint` runs BOTH `lint:oxlint` and `lint:eslint` — both must pass):

```bash
npm run typecheck && npm run lint && npm run format:check && npm run test && npm run build
```

Plus, since this task adds a rendered route + cross-navigation, run the e2e once the compliance page (Task 6.9/6.10) lands: `npm run test:e2e`.


---

### Task 6.9: Compliance export + evidence-pack panel (THE blob-download privileged flow)

The defining new mechanic, end to end. `ComplianceExportPanel.vue` holds the two **export** privileged forms — audit export (format `csv|jsonl` + optional `from`/`to`/`action`/`outcome`) and evidence-pack (format `zip|json` + `from`/`to`/`correlation_id`, gated by `canSubmitEvidencePack`). Each owns a `usePrivilegedAction<BlobResponse>` (reused as-is), opens the reused `PrivilegedActionDialog` with an impact summary (what the file contains + the step-up notice), runs `observabilityApi.exportAuditTrail` / `generateEvidencePack` through `run`, and on a **non-null** result calls `triggerBlobDownload(blob, fallback)` (client-only) — then leaves the `BlobResponse` to be garbage-collected (never written to `useState`/Pinia/storage/console). Both trigger buttons are gated on `props.canExport` (the parent passes `session.hasPermission('admin.audit.export')`; hidden otherwise); the evidence-pack trigger is additionally disabled until `canSubmitEvidencePack`. The full `401/403/419/422/428/429/5xx` + step-up matrix is exercised at the component boundary (a 428 surfaces `step_up_url`; cancel calls no API and triggers no download; no stale loading after error; success closes the dialog and renders no secret/PII; the redacted `REF-`/audit id renders via the dialog when the backend sends it). This mirrors the action-wiring half of `app/components/clients/ClientLifecycleActions.vue` (Phase 5): one shared dialog switched by an `activeFlow` ref, two `usePrivilegedAction` runners, `done` emitted on success.

**Files**
- Create: `app/components/compliance/ComplianceExportPanel.vue`
- Create (test): `app/components/compliance/__tests__/ComplianceExportPanel.spec.ts` (plain `*.spec.ts` — `@vue/test-utils` `mount` + jsdom, NOT a Nuxt-runtime test; mirrors `ClientLifecycleActions.spec.ts`) — includes the full export privileged-action matrix
- Modify: `app/locales/id.json`, `app/locales/en.json` (REUSE the `observability.*` export/evidence-pack keys adapted in Task 6.8; ADD only the genuinely-new keys below to BOTH files, id↔en parity)

**Interfaces**
- Produces (`app/components/compliance/ComplianceExportPanel.vue`):
  - Props: `{ canExport: boolean }`; no required emits (downloads are self-contained; may emit `done()` for an optional toast hook)
- Consumes: `usePrivilegedAction` (`@/composables/usePrivilegedAction`, **reused as-is**, `T = BlobResponse`) + `PrivilegedActionDialog` (`@/components/users/PrivilegedActionDialog.vue`, **reused as-is**); `triggerBlobDownload` (Task 6.3, `@/lib/api/download-blob`); `observabilityApi.exportAuditTrail`/`generateEvidencePack` (Task 6.4, `@/services/observability.api`); `canSubmitEvidencePack`/`auditExportFallbackName`/`evidencePackFallbackName` (Task 6.2, `@/lib/compliance/audit-export`); `AuditExportFilters`/`ComplianceEvidencePackFilters`/`AuditExportFormat`/`EvidencePackFormat` (Task 6.1, `@/types/compliance.types`); `BlobResponse` (`@/lib/api/api-client`); `UiFormField`/`UiInput`/`UiSelect`/`UiButton` (`@/components/ui/*`); `useI18n` (`@/composables/useI18n`). Mirrors the action-wiring half of `ClientLifecycleActions.vue` (Phase 5).

**New locale keys (ADD to BOTH `app/locales/en.json` and `app/locales/id.json`, inside the `observability` block adapted in Task 6.8 — these have no `audit.*` ancestor to rename):**

| key | en | id |
|---|---|---|
| `observability.btn_step_up` | `Re-authenticate` | `Autentikasi ulang` |
| `observability.outcome_any` | `Any outcome` | `Semua hasil` |
| `observability.outcome_succeeded` | `Succeeded` | `Berhasil` |
| `observability.outcome_denied` | `Denied` | `Ditolak` |
| `observability.outcome_failed` | `Failed` | `Gagal` |

(`observability.export_title`/`export_desc`/`evidence_pack_title`/`evidence_pack_desc`/`format`/`pack_format`/`from`/`to`/`action`/`outcome`/`correlation_id_label`/`evidence_pack_hint`/`btn_export`/`btn_generate_pack` and `common.btn_confirm`/`btn_cancel`/`error_generic` already exist — the first group via the Task 6.8 `audit.*`→`observability.*` rename, the `common.*` group already present. Do NOT re-add them.)

---

#### Steps (RED → GREEN → REFACTOR — invoke `superpowers:test-driven-development`)

- [ ] **Write the FAILING test.** Create `app/components/compliance/__tests__/ComplianceExportPanel.spec.ts` with the complete contents below. It mocks the network seam (`observability.api`), the client-only download trigger (`download-blob`), `useI18n`, and the privileged-action runner (controllable double with shared module-level refs — exactly the Task-4.11/Phase-5 pattern), stubs `PrivilegedActionDialog`, and uses the **real** pure helpers from Task 6.2 (`canSubmitEvidencePack`/`auditExportFallbackName`/`evidencePackFallbackName`). It asserts real behaviour: permission gating, the evidence-pack disable rule, both happy-path downloads (right filters + right fallback filename), cancel calls no API/no download, and the full failure matrix (no download, dialog stays open with REF + safe copy, no stale submitting, 428 surfaces `step_up_url`).

  ```ts
  import { beforeEach, describe, expect, it, vi } from 'vitest'
  import { mount } from '@vue/test-utils'
  import { computed, ref } from 'vue'
  import type { PrivilegedActionFailure } from '@/lib/users/privileged-action'
  import type { BlobResponse } from '@/lib/api/api-client'
  import type {
    AuditExportFilters,
    ComplianceEvidencePackFilters,
  } from '@/types/compliance.types'

  // --- network seam (Task 6.4) ---
  const observabilityApi = {
    exportAuditTrail: vi.fn<(filters: AuditExportFilters) => Promise<BlobResponse>>(),
    generateEvidencePack:
      vi.fn<(filters: ComplianceEvidencePackFilters) => Promise<BlobResponse>>(),
  }
  vi.mock('@/services/observability.api', () => ({ observabilityApi }))

  // --- client-only download trigger (Task 6.3) ---
  const triggerBlobDownload = vi.fn<(response: BlobResponse, fallback: string) => void>()
  vi.mock('@/lib/api/download-blob', () => ({ triggerBlobDownload }))

  vi.mock('@/composables/useI18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

  // --- controllable privileged-action runner double (shared module refs) ---
  const isSubmitting = ref(false)
  const failure = ref<PrivilegedActionFailure | null>(null)
  const runImpl = vi.fn<(fn: () => Promise<unknown>) => Promise<unknown>>(async (fn) => fn())
  vi.mock('@/composables/usePrivilegedAction', () => ({
    usePrivilegedAction: () => ({
      status: ref('idle'),
      isSubmitting,
      failure,
      // Reactive computeds: a static ref read at setup (failure null) would never
      // update after runImpl sets failure.value mid-flight.
      requestId: computed(() => failure.value?.requestId ?? null),
      auditEventId: computed(() => failure.value?.auditEventId ?? null),
      fieldErrors: computed(() => failure.value?.fieldErrors ?? {}),
      stepUpUrl: computed(() => failure.value?.stepUpUrl ?? null),
      run: runImpl,
      reset: () => {
        failure.value = null
        isSubmitting.value = false
      },
    }),
  }))

  // Dynamic import AFTER the vi.mock registrations + top-level doubles (TDZ-safe).
  const ComplianceExportPanel = (await import('../ComplianceExportPanel.vue')).default

  const DialogStub = {
    name: 'PrivilegedActionDialog',
    props: [
      'open',
      'title',
      'description',
      'danger',
      'reasonLabel',
      'reasonRequired',
      'reasonMin',
      'reasonMax',
      'reason',
      'submitting',
      'stepUpUrl',
      'stepUpLabel',
      'errorMessage',
      'requestId',
    ],
    emits: ['confirm', 'cancel', 'update:reason'],
    template: `<div v-if="open" data-testid="dialog" :data-danger="danger">
      <p data-testid="dialog-title">{{ title }}</p>
      <p data-testid="dialog-desc">{{ description }}</p>
      <p data-testid="dialog-error">{{ errorMessage }}</p>
      <p data-testid="dialog-ref">{{ requestId }}</p>
      <p data-testid="dialog-stepup">{{ stepUpUrl }}</p>
      <button data-testid="dialog-confirm" @click="$emit('confirm')">confirm</button>
      <button data-testid="dialog-cancel" @click="$emit('cancel')">cancel</button>
    </div>`,
  }

  function mountPanel(canExport = true) {
    return mount(ComplianceExportPanel, {
      props: { canExport },
      global: { stubs: { PrivilegedActionDialog: DialogStub }, renderStubDefaultSlot: true },
    })
  }

  const csvBlob: BlobResponse = {
    blob: new Blob(['event_id,action'], { type: 'text/csv' }),
    filename: 'admin-audit-events-2026-06-28.csv',
  }
  const zipBlob: BlobResponse = {
    blob: new Blob(['PK'], { type: 'application/zip' }),
    filename: null, // forces the fallback name at the component boundary
  }

  beforeEach(() => {
    vi.clearAllMocks()
    isSubmitting.value = false
    failure.value = null
    runImpl.mockImplementation(async (fn: () => Promise<unknown>) => fn())
    observabilityApi.exportAuditTrail.mockResolvedValue(csvBlob)
    observabilityApi.generateEvidencePack.mockResolvedValue(zipBlob)
  })

  describe('ComplianceExportPanel — permission gating', () => {
    it('hides both export triggers when canExport is false', () => {
      const w = mountPanel(false)
      expect(w.find('[data-testid="export-submit"]').exists()).toBe(false)
      expect(w.find('[data-testid="evidence-submit"]').exists()).toBe(false)
    })
    it('shows both export triggers when canExport is true', () => {
      const w = mountPanel(true)
      expect(w.find('[data-testid="export-submit"]').exists()).toBe(true)
      expect(w.find('[data-testid="evidence-submit"]').exists()).toBe(true)
    })
  })

  describe('ComplianceExportPanel — evidence-pack submit gating (canSubmitEvidencePack)', () => {
    it('disables the evidence trigger until a date range OR correlation id is set', async () => {
      const w = mountPanel()
      expect(w.find('[data-testid="evidence-submit"]').attributes('disabled')).toBeDefined()
      await w.find('[data-testid="evidence-correlation"]').setValue('INC-42')
      expect(w.find('[data-testid="evidence-submit"]').attributes('disabled')).toBeUndefined()
    })
    it('keeps the audit export trigger enabled with no filters (bare-format export allowed)', () => {
      const w = mountPanel()
      expect(w.find('[data-testid="export-submit"]').attributes('disabled')).toBeUndefined()
    })
  })

  describe('ComplianceExportPanel — confirm vs cancel', () => {
    it('opens the impact dialog without calling the API', async () => {
      const w = mountPanel()
      await w.find('[data-testid="export-submit"]').trigger('click')
      expect(w.find('[data-testid="dialog"]').exists()).toBe(true)
      expect(w.find('[data-testid="dialog-title"]').text()).toBe('observability.export_title')
      expect(w.find('[data-testid="dialog-desc"]').text()).toBe('observability.export_desc')
      expect(observabilityApi.exportAuditTrail).not.toHaveBeenCalled()
    })
    it('cancel closes the dialog, calls NO api, and triggers NO download', async () => {
      const w = mountPanel()
      await w.find('[data-testid="export-submit"]').trigger('click')
      await w.find('[data-testid="dialog-cancel"]').trigger('click')
      expect(w.find('[data-testid="dialog"]').exists()).toBe(false)
      expect(observabilityApi.exportAuditTrail).not.toHaveBeenCalled()
      expect(triggerBlobDownload).not.toHaveBeenCalled()
    })
  })

  describe('ComplianceExportPanel — audit export success (4.1)', () => {
    it('exports with the chosen format and triggers a client-only download with the header filename', async () => {
      const w = mountPanel()
      await w.find('[data-testid="export-submit"]').trigger('click')
      await w.find('[data-testid="dialog-confirm"]').trigger('click')
      await w.vm.$nextTick()
      expect(observabilityApi.exportAuditTrail).toHaveBeenCalledWith({ format: 'csv' })
      expect(triggerBlobDownload).toHaveBeenCalledTimes(1)
      expect(triggerBlobDownload).toHaveBeenCalledWith(csvBlob, 'admin-audit-events.csv')
      expect(w.emitted('done')).toHaveLength(1)
      expect(w.find('[data-testid="dialog"]').exists()).toBe(false) // closes on success
      // No blob/secret/PII text leaks into the rendered surface on success.
      expect(w.text()).not.toMatch(/blob:|data:|eyJ|PK|\d{16}/u)
    })
  })

  describe('ComplianceExportPanel — evidence pack success (4.1)', () => {
    it('generates with the filters and falls back to the format-derived filename when the header is absent', async () => {
      const w = mountPanel()
      await w.find('[data-testid="evidence-correlation"]').setValue('INC-42')
      await w.find('[data-testid="evidence-submit"]').trigger('click')
      await w.find('[data-testid="dialog-confirm"]').trigger('click')
      await w.vm.$nextTick()
      expect(observabilityApi.generateEvidencePack).toHaveBeenCalledWith({
        format: 'zip',
        correlation_id: 'INC-42',
      })
      // filename === null on the response → component supplies the fallback name.
      expect(triggerBlobDownload).toHaveBeenCalledWith(zipBlob, 'compliance-evidence-pack.zip')
      expect(w.emitted('done')).toHaveLength(1)
    })
  })

  describe('ComplianceExportPanel — export failure matrix (401/403/419/422/428/429/5xx)', () => {
    const cases: { status: PrivilegedActionFailure['status']; stepUpUrl: string | null }[] = [
      { status: 'forbidden', stepUpUrl: null }, // 403
      { status: 'unauthenticated', stepUpUrl: null }, // 401 + 419
      { status: 'rate_limited', stepUpUrl: null }, // 429
      { status: 'invalid', stepUpUrl: null }, // 422
      { status: 'step_up_required', stepUpUrl: '/auth/login?prompt=login&max_age=0' }, // 428
      { status: 'error', stepUpUrl: null }, // 5xx
    ]
    for (const c of cases) {
      it(`surfaces ${c.status} safely with a redacted REF, no download, and no stale loading`, async () => {
        runImpl.mockImplementation(async () => {
          failure.value = {
            status: c.status,
            requestId: 'req-export-9911',
            auditEventId: 'aud-1',
            fieldErrors: {},
            stepUpUrl: c.stepUpUrl,
          }
          isSubmitting.value = false // never left submitting after error
          return null
        })
        const w = mountPanel()
        await w.find('[data-testid="export-submit"]').trigger('click')
        await w.find('[data-testid="dialog-confirm"]').trigger('click')
        await w.vm.$nextTick()
        expect(w.find('[data-testid="dialog"]').exists()).toBe(true) // stays open to show the failure
        expect(w.find('[data-testid="dialog-ref"]').text()).toBe('req-export-9911')
        expect(w.find('[data-testid="dialog-error"]').text()).toBe('common.error_generic')
        expect(triggerBlobDownload).not.toHaveBeenCalled() // no download on failure
        expect(w.emitted('done')).toBeUndefined()
        expect(isSubmitting.value).toBe(false)
        expect(w.text()).not.toMatch(/stack|trace|eyJ/iu) // no raw exception leak
      })
    }

    it('passes the re-auth URL to the dialog step-up affordance on 428', async () => {
      runImpl.mockImplementation(async () => {
        failure.value = {
          status: 'step_up_required',
          requestId: 'req-export-stepup',
          auditEventId: null,
          fieldErrors: {},
          stepUpUrl: '/auth/login?prompt=login&max_age=0',
        }
        isSubmitting.value = false
        return null
      })
      const w = mountPanel()
      await w.find('[data-testid="export-submit"]').trigger('click')
      await w.find('[data-testid="dialog-confirm"]').trigger('click')
      await w.vm.$nextTick()
      const dialog = w.findComponent({ name: 'PrivilegedActionDialog' })
      expect(dialog.props('stepUpUrl')).toBe('/auth/login?prompt=login&max_age=0')
    })
  })

  describe('ComplianceExportPanel — evidence-pack failure matrix (the separate evidenceAction runner)', () => {
    // The evidence-pack uses its OWN usePrivilegedAction instance (evidenceAction),
    // so its failure path is exercised independently from the audit export above:
    // 428 step-up surfaced, 422 validation, 5xx — never a download, never stale.
    const cases: { status: PrivilegedActionFailure['status']; stepUpUrl: string | null }[] = [
      { status: 'invalid', stepUpUrl: null }, // 422
      { status: 'step_up_required', stepUpUrl: '/auth/login?prompt=login&max_age=0' }, // 428
      { status: 'error', stepUpUrl: null }, // 5xx
    ]
    for (const c of cases) {
      it(`surfaces ${c.status} on the evidence pack safely (step-up on 428, no download, no stale loading)`, async () => {
        runImpl.mockImplementation(async () => {
          failure.value = {
            status: c.status,
            requestId: 'req-evidence-7722',
            auditEventId: 'aud-2',
            fieldErrors: {},
            stepUpUrl: c.stepUpUrl,
          }
          isSubmitting.value = false
          return null
        })
        const w = mountPanel()
        await w.find('[data-testid="evidence-correlation"]').setValue('INC-99') // enable the trigger
        await w.find('[data-testid="evidence-submit"]').trigger('click')
        await w.find('[data-testid="dialog-confirm"]').trigger('click')
        await w.vm.$nextTick()
        const dialog = w.find('[data-testid="dialog"]')
        expect(dialog.exists()).toBe(true) // stays open to show the failure
        // 428 surfaces step_up_url (props(), not a null-droppable attribute).
        expect(w.findComponent({ name: 'PrivilegedActionDialog' }).props('stepUpUrl')).toBe(c.stepUpUrl)
        expect(w.find('[data-testid="dialog-ref"]').text()).toBe('req-evidence-7722')
        expect(w.find('[data-testid="dialog-error"]').text()).toBe('common.error_generic')
        expect(triggerBlobDownload).not.toHaveBeenCalled() // no download on failure
        expect(w.emitted('done')).toBeUndefined()
        expect(isSubmitting.value).toBe(false) // no stale loading
        expect(w.text()).not.toMatch(/stack|trace|eyJ/iu) // no raw token/trace leak
      })
    }
  })
  ```

- [ ] **Run it — expect RED** (the component does not exist yet, so the dynamic import resolves nothing and every case fails on a missing module / undefined component):

  ```
  npm run test -- app/components/compliance/__tests__/ComplianceExportPanel.spec.ts
  ```
  Expected: `FAIL app/components/compliance/__tests__/ComplianceExportPanel.spec.ts` — `Failed to resolve import "../ComplianceExportPanel.vue"` (or `default` is `undefined`). 0 passing.

- [ ] **Minimal implementation.** Create `app/components/compliance/ComplianceExportPanel.vue` with the complete contents below. One shared `PrivilegedActionDialog` switched by `activeFlow`; two `usePrivilegedAction<BlobResponse>` runners; filters built with conditional spread (so the `outcome`/optional fields never carry an invalid `''` into the typed filter — the Task 6.2 query builders also skip empties); `triggerBlobDownload` called only on a non-null result and never stored.

  ```vue
  <script setup lang="ts">
  import { computed, ref } from 'vue'
  import type {
    AuditExportFilters,
    AuditExportFormat,
    ComplianceEvidencePackFilters,
    EvidencePackFormat,
  } from '@/types/compliance.types'
  import type { BlobResponse } from '@/lib/api/api-client'
  import { usePrivilegedAction } from '@/composables/usePrivilegedAction'
  import PrivilegedActionDialog from '@/components/users/PrivilegedActionDialog.vue'
  import { observabilityApi } from '@/services/observability.api'
  import { triggerBlobDownload } from '@/lib/api/download-blob'
  import {
    auditExportFallbackName,
    canSubmitEvidencePack,
    evidencePackFallbackName,
  } from '@/lib/compliance/audit-export'
  import { useI18n } from '@/composables/useI18n'
  import UiButton from '@/components/ui/UiButton.vue'
  import UiFormField from '@/components/ui/UiFormField.vue'
  import UiInput from '@/components/ui/UiInput.vue'
  import UiSelect from '@/components/ui/UiSelect.vue'

  defineProps<{ canExport: boolean }>()
  const emit = defineEmits<{ done: [] }>()

  const { t } = useI18n()

  // Each export is its own privileged action (exports never share a runner — a
  // failed export must not poison the evidence-pack dialog state, and vice versa).
  const exportAction = usePrivilegedAction<BlobResponse>()
  const evidenceAction = usePrivilegedAction<BlobResponse>()

  type Flow = 'export' | 'evidence'
  const activeFlow = ref<Flow | null>(null)

  // Audit export form state.
  const exportFormat = ref<AuditExportFormat>('csv')
  const exportFrom = ref('')
  const exportTo = ref('')
  const exportActionFilter = ref('')
  const exportOutcome = ref<'' | 'succeeded' | 'denied' | 'failed'>('')

  // Evidence-pack form state.
  const packFormat = ref<EvidencePackFormat>('zip')
  const packFrom = ref('')
  const packTo = ref('')
  const packCorrelationId = ref('')

  const formatOptions: AuditExportFormat[] = ['csv', 'jsonl']
  const packFormatOptions: EvidencePackFormat[] = ['zip', 'json']
  const outcomeOptions = computed(() => [
    { value: '', label: t('observability.outcome_any') },
    { value: 'succeeded', label: t('observability.outcome_succeeded') },
    { value: 'denied', label: t('observability.outcome_denied') },
    { value: 'failed', label: t('observability.outcome_failed') },
  ])

  function exportFilters(): AuditExportFilters {
    return {
      format: exportFormat.value,
      ...(exportFrom.value && { from: exportFrom.value }),
      ...(exportTo.value && { to: exportTo.value }),
      ...(exportActionFilter.value.trim() && { action: exportActionFilter.value.trim() }),
      ...(exportOutcome.value && { outcome: exportOutcome.value }),
    }
  }

  const packFilters = computed<ComplianceEvidencePackFilters>(() => ({
    format: packFormat.value,
    ...(packFrom.value && { from: packFrom.value }),
    ...(packTo.value && { to: packTo.value }),
    ...(packCorrelationId.value.trim() && { correlation_id: packCorrelationId.value.trim() }),
  }))

  const canSubmitEvidence = computed(() => canSubmitEvidencePack(packFilters.value))

  const activeAction = computed(() =>
    activeFlow.value === 'evidence' ? evidenceAction : exportAction,
  )
  const dialogOpen = computed(() => activeFlow.value !== null)
  const dialogTitle = computed(() =>
    activeFlow.value === 'evidence'
      ? t('observability.evidence_pack_title')
      : t('observability.export_title'),
  )
  // Impact summary + step-up notice live in the adapted observability.*_desc copy.
  const dialogDescription = computed(() =>
    activeFlow.value === 'evidence'
      ? t('observability.evidence_pack_desc')
      : t('observability.export_desc'),
  )
  const dialogError = computed(() =>
    activeAction.value.failure.value ? t('common.error_generic') : null,
  )

  function onTriggerExport(): void {
    exportAction.reset()
    activeFlow.value = 'export'
  }
  function onTriggerEvidence(): void {
    evidenceAction.reset()
    activeFlow.value = 'evidence'
  }

  async function onConfirm(): Promise<void> {
    if (activeFlow.value === 'export') {
      const result = await exportAction.run(() =>
        observabilityApi.exportAuditTrail(exportFilters()),
      )
      // Failure stays visible in the dialog (REF + safe copy + step-up); no download.
      if (result === null) return
      // Client-only download; the BlobResponse is consumed here and discarded — it
      // is never assigned to a ref/store/storage, so it cannot enter any payload.
      triggerBlobDownload(result, auditExportFallbackName(exportFormat.value))
    } else if (activeFlow.value === 'evidence') {
      const result = await evidenceAction.run(() =>
        observabilityApi.generateEvidencePack(packFilters.value),
      )
      if (result === null) return
      triggerBlobDownload(result, evidencePackFallbackName(packFormat.value))
    }
    activeFlow.value = null
    emit('done')
  }

  function onCancel(): void {
    activeFlow.value = null
    exportAction.reset()
    evidenceAction.reset()
  }
  </script>

  <template>
    <section v-if="canExport" class="export-panel" data-testid="compliance-export-panel">
      <form class="export-panel__card" @submit.prevent="onTriggerExport">
        <h3 class="export-panel__title">{{ t('observability.export_title') }}</h3>
        <p class="export-panel__impact">{{ t('observability.export_desc') }}</p>
        <UiFormField id="export-format" :label="t('observability.format')">
          <UiSelect
            v-model="exportFormat"
            data-testid="export-format"
            :options="formatOptions.map((value) => ({ value, label: value.toUpperCase() }))"
          />
        </UiFormField>
        <UiFormField id="export-from" :label="t('observability.from')">
          <UiInput v-model="exportFrom" data-testid="export-from" type="date" />
        </UiFormField>
        <UiFormField id="export-to" :label="t('observability.to')">
          <UiInput v-model="exportTo" type="date" />
        </UiFormField>
        <UiFormField id="export-action" :label="t('observability.action')">
          <UiInput v-model="exportActionFilter" />
        </UiFormField>
        <UiFormField id="export-outcome" :label="t('observability.outcome')">
          <UiSelect v-model="exportOutcome" :options="outcomeOptions" />
        </UiFormField>
        <UiButton
          type="submit"
          data-testid="export-submit"
          :disabled="exportAction.isSubmitting.value"
        >
          {{ t('observability.btn_export') }}
        </UiButton>
      </form>

      <form class="export-panel__card" @submit.prevent="onTriggerEvidence">
        <h3 class="export-panel__title">{{ t('observability.evidence_pack_title') }}</h3>
        <p class="export-panel__impact">{{ t('observability.evidence_pack_desc') }}</p>
        <UiFormField id="pack-format" :label="t('observability.pack_format')">
          <UiSelect
            v-model="packFormat"
            :options="packFormatOptions.map((value) => ({ value, label: value.toUpperCase() }))"
          />
        </UiFormField>
        <UiFormField id="pack-from" :label="t('observability.from')">
          <UiInput v-model="packFrom" type="date" />
        </UiFormField>
        <UiFormField id="pack-to" :label="t('observability.to')">
          <UiInput v-model="packTo" type="date" />
        </UiFormField>
        <UiFormField
          id="pack-correlation"
          :label="t('observability.correlation_id_label')"
          :hint="canSubmitEvidence ? undefined : t('observability.evidence_pack_hint')"
        >
          <UiInput v-model="packCorrelationId" data-testid="evidence-correlation" />
        </UiFormField>
        <UiButton
          type="submit"
          data-testid="evidence-submit"
          :disabled="!canSubmitEvidence || evidenceAction.isSubmitting.value"
        >
          {{ t('observability.btn_generate_pack') }}
        </UiButton>
      </form>

      <PrivilegedActionDialog
        :open="dialogOpen"
        :title="dialogTitle"
        :description="dialogDescription"
        :confirm-label="t('common.btn_confirm')"
        :cancel-label="t('common.btn_cancel')"
        :submitting="activeAction.isSubmitting.value"
        :step-up-url="activeAction.stepUpUrl.value"
        :step-up-label="t('observability.btn_step_up')"
        :error-message="dialogError"
        :request-id="activeAction.requestId.value"
        @confirm="onConfirm"
        @cancel="onCancel"
      />
    </section>
  </template>

  <style scoped>
  .export-panel {
    display: grid;
    gap: 16px;
  }
  @media (min-width: 48rem) {
    .export-panel {
      grid-template-columns: 1fr 1fr;
    }
  }
  .export-panel__card {
    display: grid;
    gap: 12px;
    padding: 16px;
    border: 1px solid var(--border);
  }
  .export-panel__title {
    margin: 0;
    font: 600 0.9375rem/1.2 var(--font-sans);
    color: var(--fg);
  }
  .export-panel__impact {
    margin: 0;
    font: 400 0.8125rem/1.5 var(--font-sans);
    color: var(--fg-2);
  }
  </style>
  ```

- [ ] **Add the 5 new locale keys** to BOTH `app/locales/en.json` and `app/locales/id.json` inside the `observability` block (table above). Keep the two files structurally byte-parallel (id↔en parity).

- [ ] **Run it — expect GREEN:**

  ```
  npm run test -- app/components/compliance/__tests__/ComplianceExportPanel.spec.ts
  ```
  Expected: `PASS app/components/compliance/__tests__/ComplianceExportPanel.spec.ts` — all `describe` blocks green (permission gating ×2, evidence gating ×2, confirm/cancel ×2, export success, evidence success, the 6-case export failure matrix, the export 428 step-up assertion, the 3-case evidence-pack failure matrix). 0 failing.

- [ ] **Refactor (only if needed).** Confirm no `fetch`/`$fetch` in the component (network only via `observabilityApi`); confirm the `BlobResponse` is referenced only as the local `result` const in `onConfirm` and never assigned to a ref/store/storage/console; confirm `triggerBlobDownload` is the sole download path and is reached only on a non-null result. Re-run the test to keep it green.

- [ ] **Commit (only on green):**

  ```
  git add app/components/compliance/ComplianceExportPanel.vue app/components/compliance/__tests__/ComplianceExportPanel.spec.ts app/locales/en.json app/locales/id.json
  git commit -m "feat(sso-admin-frontend): compliance export + evidence-pack blob-download panel

  Two export privileged forms (audit export csv|jsonl, evidence-pack zip|json)
  over the reused usePrivilegedAction<BlobResponse> + PrivilegedActionDialog.
  On a non-null result the client-only triggerBlobDownload runs with the
  header filename or a format-derived fallback; the blob is consumed and
  discarded, never stored. Evidence-pack submit gated by canSubmitEvidencePack;
  both triggers gated on canExport. Full 401/403/419/422/428/429/5xx + step-up
  matrix proven at the component boundary.

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

**Task-scoped Definition-of-Done gate (run from `services/sso-admin-frontend`; report any blocked command explicitly, never claim PASS for a command that did not run):**

```
npm run typecheck && npm run lint && npm run format:check && npm run test -- app/components/compliance/__tests__/ComplianceExportPanel.spec.ts
```

`npm run lint` MUST run BOTH `lint:oxlint` (`oxlint .`) AND `lint:eslint` (`eslint "app/**/*.vue"`) — both must pass. The full-suite + `npm run build` + `npm run test:e2e` run at the phase DoD gate.


---

### Task 6.10: DSR queue table + review/fulfill privileged actions

The data-subject-request queue and its lifecycle, PII-minimized. `DsrQueueTable.vue` is a dumb/presentational Swiss table over `UiDataList`: `request_id` and `subject_id` render **masked** via `formatTechnicalPreview` (`REF-<last8>`; subject labeled as an account code), `type`/`status` render as `UiStatusBadge` (`resolveDsrStatusTone`, never colour-alone), `sla_due_at` renders as a `UiFolio` timestamp. The list payload's `reason`/`reviewer_subject_id`/`reviewer_notes` are **never projected into a row** (design §3.3 PII minimization — "show only the identifier needed for a safe action, not every sensitive field"); a DOM test asserts no raw subject id and no `reason`/`reviewer_notes` text appears. The table emits `review(request)` / `fulfill(request)` (the page opens a `UiDetailDrawer` carrying `DsrReviewActions`); per-row action buttons are gated on `canReview` and disabled when the request is not in the right lifecycle state (review only when `submitted`, fulfill only when `approved`).

`DsrReviewActions.vue` owns a single `usePrivilegedAction` instance + the reused `PrivilegedActionDialog`, gated on `admin.dsr.review` via `useSessionStore().hasPermission` (renders nothing otherwise — hidden, never disabled-and-visible). It offers four affordances: **Approve**/**Reject** → `observabilityApi.reviewDsr(id, { decision, notes })` with reasonRequired notes (`ReasonPolicy { required: true, max: 1000 }` validated by `isReasonValid`, reused from `@/lib/users/user-actions`); **Fulfill (dry run)** / **Fulfill (commit)** → `observabilityApi.fulfillDsr(id, { dry_run })` as an explicit dry-run-vs-commit choice (commit is `danger`). On success it emits `done()` so the page calls `useDataSubjectRequests().refresh()` (state is never left stale). The full failure matrix runs at the component boundary through the shared privileged-action matrix (`401/403/419/422/428/429/5xx`): a 428 surfaces `step_up_url`; 422 surfaces the validation error; the backend's `500` "DSR is not in a reviewable state." / "request not in approved state" / legal-hold conflict surfaces safe copy + a redacted `REF-` (raw correlation id / raw exception never rendered); cancel calls no API; no stale loading after error. A non-error fulfill response carrying `legal_hold_status === 'active'` (the dry-run preview blocks the operation) surfaces a safe legal-hold notice. Mirrors `UsersTable.vue` + `UserLifecycleActions.vue` (Phase 4).

**Files**
- Create: `app/components/compliance/DsrQueueTable.vue`
- Create: `app/components/compliance/DsrReviewActions.vue`
- Test: `app/components/compliance/__tests__/DsrQueueTable.spec.ts`
- Test: `app/components/compliance/__tests__/DsrReviewActions.spec.ts`
- Modify: `app/locales/id.json`, `app/locales/en.json` (reuse adapted `observability.*` DSR keys; ADD only the genuinely-new keys below, to BOTH files, id↔en parity)

**Interfaces**
- Consumes:
  - `usePrivilegedAction` (`@/composables/usePrivilegedAction`, **reused as-is**) + `PrivilegedActionDialog` (`@/components/users/PrivilegedActionDialog.vue`, **reused as-is**)
  - `ReasonPolicy` / `isReasonValid` (`@/lib/users/user-actions`, **reused as-is** — never re-declared)
  - `observabilityApi.reviewDsr` / `observabilityApi.fulfillDsr` (Task 6.4)
  - `resolveDsrStatusTone` + `DataSubjectRequest` / `DsrReviewPayload` / `DsrFulfillPayload` / `DsrReviewResponse` / `DsrFulfillResponse` (Task 6.1)
  - `formatTechnicalPreview` / `formatSupportReference` (`@/lib/display-identifiers`)
  - `useSessionStore().hasPermission` (`@/stores/session.store`)
  - `UiDataList` (+ `UiDataListColumn` / `UiDataListRow`) / `UiStatusBadge` / `UiFolio` / `UiButton` / `UiDetailDrawer` (`@/components/ui/*`)
  - `useI18n` (`@/composables/useI18n`)
- Produces (`app/components/compliance/DsrQueueTable.vue`):
  - Props: `{ caption: string; rows: readonly DataSubjectRequest[]; canReview: boolean }`
  - Emits: `review(request: DataSubjectRequest)` / `fulfill(request: DataSubjectRequest)`
- Produces (`app/components/compliance/DsrReviewActions.vue`):
  - Props: `{ request: DataSubjectRequest }`
  - Emits: `done()` (after a successful review/fulfill so the page refreshes the list)

**Steps**

1. [ ] **RED — queue table (masking + emits).** Write `app/components/compliance/__tests__/DsrQueueTable.spec.ts` (plain jsdom spec; real `UiDataList`/`UiStatusBadge`/`UiButton`/`UiFolio` + real pure `resolveDsrStatusTone`/`formatTechnicalPreview`; only `useI18n` mocked). It asserts: the raw `subject_id`/`request_id` never reach the DOM (masked to `REF-`), `reason`/`reviewer_subject_id`/`reviewer_notes` are never rendered, status/type render as badges, the SLA renders as a folio, and the per-row buttons emit `review`/`fulfill` with the full request only when `canReview` and the lifecycle state allows it:

```ts
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import DsrQueueTable from '../DsrQueueTable.vue'
import type { DataSubjectRequest } from '@/types/compliance.types'

vi.mock('@/composables/useI18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

const submitted: DataSubjectRequest = {
  request_id: '01J9XQ7K8M4N2P3Q5R6S7T8U9V',
  subject_id: 'sub_0a1b2c3d4e5f6a7b8c9d',
  type: 'export',
  status: 'submitted',
  submitted_at: '2026-06-20T09:00:00Z',
  reviewed_at: null,
  fulfilled_at: null,
  sla_due_at: '2026-06-27T09:00:00Z',
}
const approved: DataSubjectRequest = { ...submitted, request_id: '01J9XQ7K8M4N2P3Q5R6S7T8U9W', status: 'approved' }

function mountTable(rows: readonly DataSubjectRequest[], canReview: boolean) {
  return mount(DsrQueueTable, { props: { caption: 'DSR queue', rows, canReview } })
}

describe('DsrQueueTable — PII minimization', () => {
  it('masks subject_id and request_id and never renders reason/reviewer fields', () => {
    // The narrowed DTO has no reason/notes, but a raw backend row (pre-strip) could;
    // the table must never project them. Cast the stray free-text in to prove it.
    const leaky = {
      ...submitted,
      reason: 'deeply private subject reason text',
      reviewer_subject_id: 'sub_reviewer_secret_99',
      reviewer_notes: 'internal reviewer note never shown',
    } as unknown as DataSubjectRequest
    const text = mountTable([leaky], true).text()
    expect(text).not.toContain('sub_0a1b2c3d4e5f6a7b8c9d')
    expect(text).not.toContain('01J9XQ7K8M4N2P3Q5R6S7T8U9V')
    expect(text).not.toContain('deeply private subject reason text')
    expect(text).not.toContain('sub_reviewer_secret_99')
    expect(text).not.toContain('internal reviewer note never shown')
    expect(text).toContain('REF-')
  })
  it('renders the status as a labelled badge (never colour-alone)', () => {
    const html = mountTable([submitted], true).html()
    expect(html).toContain('submitted')
  })
})

describe('DsrQueueTable — actions gating + emits', () => {
  it('hides the action buttons entirely when canReview is false', () => {
    const w = mountTable([submitted], false)
    expect(w.find('[data-action="review-01J9XQ7K8M4N2P3Q5R6S7T8U9V"]').exists()).toBe(false)
  })
  it('emits review with the full request and enables it only when submitted', async () => {
    const w = mountTable([submitted], true)
    const btn = w.find('[data-action="review-01J9XQ7K8M4N2P3Q5R6S7T8U9V"]')
    expect(btn.attributes('disabled')).toBeUndefined()
    await btn.trigger('click')
    expect(w.emitted('review')?.[0]).toEqual([submitted])
  })
  it('disables review on a non-submitted row and enables fulfill only when approved', async () => {
    const w = mountTable([approved], true)
    expect(w.find('[data-action="review-01J9XQ7K8M4N2P3Q5R6S7T8U9W"]').attributes('disabled')).toBeDefined()
    const fulfill = w.find('[data-action="fulfill-01J9XQ7K8M4N2P3Q5R6S7T8U9W"]')
    expect(fulfill.attributes('disabled')).toBeUndefined()
    await fulfill.trigger('click')
    expect(w.emitted('fulfill')?.[0]).toEqual([approved])
  })
})
```

2. [ ] **Run it — expect FAIL** (component missing):

```bash
npm run test -- app/components/compliance/__tests__/DsrQueueTable.spec.ts
```
Expected: `Failed to resolve import "../DsrQueueTable.vue"` — RED.

3. [ ] **GREEN — write `app/components/compliance/DsrQueueTable.vue`:**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import UiDataList, {
  type UiDataListColumn,
  type UiDataListRow,
} from '@/components/ui/UiDataList.vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { resolveDsrStatusTone } from '@/lib/compliance/compliance-view-state'
import { formatTechnicalPreview } from '@/lib/display-identifiers'
import { useI18n } from '@/composables/useI18n'
import type { DataSubjectRequest, DsrStatus } from '@/types/compliance.types'

const props = defineProps<{
  readonly caption: string
  readonly rows: readonly DataSubjectRequest[]
  readonly canReview: boolean
}>()

const emit = defineEmits<{
  (event: 'review', request: DataSubjectRequest): void
  (event: 'fulfill', request: DataSubjectRequest): void
}>()

const { t } = useI18n()

const columns = computed<readonly UiDataListColumn[]>(() => [
  { key: 'requestRef', label: t('observability.dsr_request'), align: 'left', variant: 'id' },
  { key: 'subjectRef', label: t('observability.dsr_subject'), align: 'left', variant: 'id' },
  { key: 'type', label: t('observability.dsr_type'), align: 'left' },
  { key: 'status', label: t('observability.dsr_status'), align: 'left' },
  { key: 'sla', label: t('observability.dsr_sla'), align: 'left', variant: 'timestamp' },
])

// PII minimization: only masked opaque ids + type/status/sla reach the row.
// reason / reviewer_subject_id / reviewer_notes are deliberately NOT projected.
const dataRows = computed<readonly UiDataListRow[]>(() =>
  props.rows.map((request) => ({
    id: request.request_id,
    requestRef: formatTechnicalPreview(request.request_id),
    subjectRef: formatTechnicalPreview(request.subject_id),
    type: request.type,
    status: request.status,
    sla: request.sla_due_at ?? '—',
  })),
)

const byId = computed(() => new Map(props.rows.map((request) => [request.request_id, request])))
function rowRequest(id: string): DataSubjectRequest | undefined {
  return byId.value.get(id)
}
function statusTone(id: string) {
  const status: DsrStatus = rowRequest(id)?.status ?? 'submitted'
  return resolveDsrStatusTone(status)
}
function canApprove(id: string): boolean {
  return rowRequest(id)?.status === 'submitted'
}
function canFulfill(id: string): boolean {
  return rowRequest(id)?.status === 'approved'
}
function onReview(id: string): void {
  const request = rowRequest(id)
  if (request) emit('review', request)
}
function onFulfill(id: string): void {
  const request = rowRequest(id)
  if (request) emit('fulfill', request)
}
</script>

<template>
  <UiDataList
    :caption="caption"
    :columns="columns"
    :rows="dataRows"
    :total="rows.length"
    data-component="dsr-queue-table"
  >
    <template #cell(type)="{ row }">
      <UiStatusBadge tone="neutral" :label="String(row.type)" />
    </template>
    <template #cell(status)="{ row }">
      <UiStatusBadge :tone="statusTone(String(row.id))" :label="String(row.status)" />
    </template>
    <template v-if="canReview" #actions="{ row }">
      <UiButton
        size="sm"
        variant="secondary"
        :data-action="`review-${row.id}`"
        :disabled="!canApprove(String(row.id))"
        @click="onReview(String(row.id))"
      >
        {{ t('observability.dsr_btn_review') }}
      </UiButton>
      <UiButton
        size="sm"
        variant="secondary"
        :data-action="`fulfill-${row.id}`"
        :disabled="!canFulfill(String(row.id))"
        @click="onFulfill(String(row.id))"
      >
        {{ t('observability.dsr_btn_fulfill') }}
      </UiButton>
    </template>
  </UiDataList>
</template>

<style scoped>
.dsr-queue-table {
  display: grid;
  gap: 12px;
}
</style>
```

4. [ ] **Run it — expect PASS:**

```bash
npm run test -- app/components/compliance/__tests__/DsrQueueTable.spec.ts
```
Expected: all `DsrQueueTable.spec.ts` cases green.

5. [ ] **ADD locale keys** (BOTH `app/locales/id.json` and `app/locales/en.json`, inside the `observability` object adapted from the legacy `audit.*` block — reuse `common.btn_cancel`/`common.btn_confirm`/`common.error_generic`; ADD only these net-new DSR keys, keeping id↔en parity):

  - `observability.dsr_request` — en: `"Request"`, id: `"Permintaan"`
  - `observability.dsr_subject` — en: `"Account code"`, id: `"Kode akun"`
  - `observability.dsr_type` — en: `"Type"`, id: `"Jenis"`
  - `observability.dsr_status` — en: `"Status"`, id: `"Status"`
  - `observability.dsr_sla` — en: `"SLA due"`, id: `"Batas SLA"`
  - `observability.dsr_btn_review` — en: `"Review"`, id: `"Tinjau"`
  - `observability.dsr_btn_fulfill` — en: `"Fulfill"`, id: `"Penuhi"`
  - `observability.dsr_btn_approve` — en: `"Approve"`, id: `"Setujui"`
  - `observability.dsr_btn_reject` — en: `"Reject"`, id: `"Tolak"`
  - `observability.dsr_btn_fulfill_dry` — en: `"Fulfill (dry run)"`, id: `"Penuhi (uji coba)"`
  - `observability.dsr_btn_fulfill_commit` — en: `"Fulfill (commit)"`, id: `"Penuhi (jalankan)"`
  - `observability.dsr_review_notes_label` — en: `"Reviewer notes"`, id: `"Catatan peninjau"`
  - `observability.dsr_confirm_approve_title` — en: `"Approve this request?"`, id: `"Setujui permintaan ini?"`
  - `observability.dsr_confirm_approve_desc` — en: `"Approving moves the request to the approved state so it can be fulfilled. Reviewer notes are recorded in the audit trail."`, id: `"Menyetujui memindahkan permintaan ke status disetujui agar dapat dipenuhi. Catatan peninjau dicatat di jejak audit."`
  - `observability.dsr_confirm_reject_title` — en: `"Reject this request?"`, id: `"Tolak permintaan ini?"`
  - `observability.dsr_confirm_reject_desc` — en: `"Rejecting closes the request without fulfilment. A reason is required and recorded in the audit trail."`, id: `"Menolak menutup permintaan tanpa pemenuhan. Alasan wajib diisi dan dicatat di jejak audit."`
  - `observability.dsr_confirm_fulfill_dry_title` — en: `"Preview fulfilment (dry run)?"`, id: `"Pratinjau pemenuhan (uji coba)?"`
  - `observability.dsr_confirm_fulfill_dry_desc` — en: `"A dry run computes what would be exported, anonymized, or deleted without committing any change."`, id: `"Uji coba menghitung apa yang akan diekspor, dianonimkan, atau dihapus tanpa menjalankan perubahan apa pun."`
  - `observability.dsr_confirm_fulfill_commit_title` — en: `"Commit fulfilment?"`, id: `"Jalankan pemenuhan?"`
  - `observability.dsr_confirm_fulfill_commit_desc` — en: `"This commits the data-subject request and cannot be undone. Re-authentication may be required."`, id: `"Tindakan ini menjalankan permintaan subjek data dan tidak dapat dibatalkan. Autentikasi ulang mungkin diperlukan."`
  - `observability.dsr_legal_hold_notice` — en: `"Blocked by an active legal hold — fulfilment cannot proceed."`, id: `"Diblokir oleh legal hold aktif — pemenuhan tidak dapat dilanjutkan."`
  - `observability.dsr_step_up_label` — en: `"Re-authenticate to continue"`, id: `"Autentikasi ulang untuk melanjutkan"`

   Verify parity after editing — diff the `observability` namespace of both files:

```bash
node -e "const id=require('./app/locales/id.json'),en=require('./app/locales/en.json');const diff=(a,b)=>[...Object.keys(a).filter(k=>!(k in b)),...Object.keys(b).filter(k=>!(k in a))];const d=diff(id.observability,en.observability).map(k=>'observability.'+k);if(d.length){console.error('MISMATCH',d);process.exit(1)}console.log('locale parity OK')"
```
Expected: `locale parity OK`.

6. [ ] **RED — review/fulfill actions (full privileged-action matrix).** Write `app/components/compliance/__tests__/DsrReviewActions.spec.ts` (plain jsdom spec; mocks the composable + service + store + i18n; stubs the dialog — mirror Phase 4's `UserLifecycleActions.spec.ts`). It covers permission gating (hidden without `admin.dsr.review`), lifecycle applicability, confirm-before-API, reason wiring on review, cancel-calls-no-API, success → `done` emit + list-refresh contract, the dry-run vs commit fulfill call shapes, the legal-hold notice on an active-hold response, and the **full failure matrix** surfaced at the component boundary:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { computed, ref } from 'vue'
import DsrReviewActions from '../DsrReviewActions.vue'
import type { DataSubjectRequest } from '@/types/compliance.types'
import type { PrivilegedActionFailure } from '@/lib/users/privileged-action'

const observabilityApi = {
  reviewDsr: vi.fn<(id: string, payload: unknown) => Promise<unknown>>(),
  fulfillDsr: vi.fn<(id: string, payload: unknown) => Promise<unknown>>(),
}
vi.mock('@/services/observability.api', () => ({ observabilityApi }))

let permitted: string[] = []
vi.mock('@/stores/session.store', () => ({
  useSessionStore: () => ({ hasPermission: (p: string) => permitted.includes(p) }),
}))
vi.mock('@/composables/useI18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

// Controllable privileged-action runner double (reactive computeds, mirror Task 4.11).
const isSubmitting = ref(false)
const failure = ref<PrivilegedActionFailure | null>(null)
const runImpl = vi.fn<(fn: () => Promise<unknown>) => Promise<unknown>>(async (fn) => fn())
vi.mock('@/composables/usePrivilegedAction', () => ({
  usePrivilegedAction: () => ({
    status: ref('idle'),
    isSubmitting,
    failure,
    requestId: computed(() => failure.value?.requestId ?? null),
    auditEventId: computed(() => failure.value?.auditEventId ?? null),
    fieldErrors: computed(() => failure.value?.fieldErrors ?? {}),
    stepUpUrl: computed(() => failure.value?.stepUpUrl ?? null),
    run: runImpl,
    reset: () => {
      failure.value = null
      isSubmitting.value = false
    },
  }),
}))

const submitted: DataSubjectRequest = {
  request_id: '01J9XQ7K8M4N2P3Q5R6S7T8U9V',
  subject_id: 'sub_0a1b2c3d4e5f6a7b8c9d',
  type: 'export',
  status: 'submitted',
  submitted_at: '2026-06-20T09:00:00Z',
  reviewed_at: null,
  fulfilled_at: null,
  sla_due_at: '2026-06-27T09:00:00Z',
}
const approved: DataSubjectRequest = { ...submitted, status: 'approved' }

const DialogStub = {
  name: 'PrivilegedActionDialog',
  props: ['open', 'title', 'description', 'danger', 'reasonLabel', 'reasonRequired', 'reasonMin', 'reasonMax', 'reason', 'submitting', 'stepUpUrl', 'errorMessage', 'requestId'],
  emits: ['confirm', 'cancel', 'update:reason'],
  template: `<div v-if="open" data-testid="dialog" :data-danger="danger" :data-reason-required="reasonRequired" :data-step-up="stepUpUrl">
    <p data-testid="dialog-error">{{ errorMessage }}</p>
    <p data-testid="dialog-ref">{{ requestId }}</p>
    <button data-testid="dialog-confirm" @click="$emit('confirm')">confirm</button>
    <button data-testid="dialog-cancel" @click="$emit('cancel')">cancel</button>
    <button data-testid="dialog-set-reason" @click="$emit('update:reason', 'Verified subject identity per policy')">reason</button>
  </div>`,
}

function mountActions(request: DataSubjectRequest = submitted) {
  return mount(DsrReviewActions, {
    props: { request },
    global: { stubs: { PrivilegedActionDialog: DialogStub } },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  permitted = ['admin.dsr.review']
  isSubmitting.value = false
  failure.value = null
  runImpl.mockImplementation(async (fn) => fn())
  observabilityApi.reviewDsr.mockResolvedValue({ request: approved })
  observabilityApi.fulfillDsr.mockResolvedValue({
    request: approved, dry_run: true, legal_hold_status: 'none',
  })
})

describe('DsrReviewActions — permission gating', () => {
  it('renders nothing without admin.dsr.review', () => {
    permitted = []
    expect(mountActions().find('[data-testid="dsr-review-actions"]').exists()).toBe(false)
  })
  it('renders the action group when permitted', () => {
    expect(mountActions().find('[data-testid="dsr-review-actions"]').exists()).toBe(true)
  })
})

describe('DsrReviewActions — lifecycle applicability', () => {
  it('enables approve/reject only on a submitted request and disables fulfill', () => {
    const w = mountActions(submitted)
    expect(w.find('[data-action="approve"]').attributes('disabled')).toBeUndefined()
    expect(w.find('[data-action="reject"]').attributes('disabled')).toBeUndefined()
    expect(w.find('[data-action="fulfill_dry"]').attributes('disabled')).toBeDefined()
  })
  it('enables fulfill only on an approved request and disables approve/reject', () => {
    const w = mountActions(approved)
    expect(w.find('[data-action="fulfill_dry"]').attributes('disabled')).toBeUndefined()
    expect(w.find('[data-action="fulfill_commit"]').attributes('disabled')).toBeUndefined()
    expect(w.find('[data-action="approve"]').attributes('disabled')).toBeDefined()
  })
})

describe('DsrReviewActions — confirm before API', () => {
  it('opens a reason-required dialog for approve and does NOT call the API yet', async () => {
    const w = mountActions(submitted)
    await w.find('[data-action="approve"]').trigger('click')
    expect(w.find('[data-testid="dialog"]').attributes('data-reason-required')).toBe('true')
    expect(observabilityApi.reviewDsr).not.toHaveBeenCalled()
  })
  it('marks the commit-fulfill dialog as danger', async () => {
    const w = mountActions(approved)
    await w.find('[data-action="fulfill_commit"]').trigger('click')
    expect(w.find('[data-testid="dialog"]').attributes('data-danger')).toBe('true')
  })
  it('cancel closes the dialog and calls NO api', async () => {
    const w = mountActions(submitted)
    await w.find('[data-action="reject"]').trigger('click')
    await w.find('[data-testid="dialog-cancel"]').trigger('click')
    expect(w.find('[data-testid="dialog"]').exists()).toBe(false)
    expect(observabilityApi.reviewDsr).not.toHaveBeenCalled()
  })
})

describe('DsrReviewActions — success', () => {
  it('reviews with decision + notes and emits done on success', async () => {
    const w = mountActions(submitted)
    await w.find('[data-action="approve"]').trigger('click')
    await w.find('[data-testid="dialog-set-reason"]').trigger('click')
    await w.find('[data-testid="dialog-confirm"]').trigger('click')
    await w.vm.$nextTick()
    expect(observabilityApi.reviewDsr).toHaveBeenCalledWith('01J9XQ7K8M4N2P3Q5R6S7T8U9V', {
      decision: 'approved',
      notes: 'Verified subject identity per policy',
    })
    expect(w.emitted('done')).toHaveLength(1)
  })
  it('fulfills dry-run with dry_run:true, commit with dry_run:false', async () => {
    const w = mountActions(approved)
    await w.find('[data-action="fulfill_dry"]').trigger('click')
    await w.find('[data-testid="dialog-confirm"]').trigger('click')
    await w.vm.$nextTick()
    expect(observabilityApi.fulfillDsr).toHaveBeenLastCalledWith('01J9XQ7K8M4N2P3Q5R6S7T8U9V', { dry_run: true })

    await w.find('[data-action="fulfill_commit"]').trigger('click')
    await w.find('[data-testid="dialog-confirm"]').trigger('click')
    await w.vm.$nextTick()
    expect(observabilityApi.fulfillDsr).toHaveBeenLastCalledWith('01J9XQ7K8M4N2P3Q5R6S7T8U9V', { dry_run: false })
    expect(w.emitted('done')).toHaveLength(2)
  })
  it('surfaces the legal-hold notice when the response is blocked by an active hold', async () => {
    observabilityApi.fulfillDsr.mockResolvedValue({ request: approved, dry_run: true, legal_hold_status: 'active' })
    const w = mountActions(approved)
    await w.find('[data-action="fulfill_dry"]').trigger('click')
    await w.find('[data-testid="dialog-confirm"]').trigger('click')
    await w.vm.$nextTick()
    expect(w.find('[data-testid="dsr-legal-hold"]').text()).toContain('observability.dsr_legal_hold_notice')
  })
})

describe('DsrReviewActions — failure matrix (401/403/419/422/428/429/5xx)', () => {
  const cases: { status: PrivilegedActionFailure['status']; stepUpUrl: string | null }[] = [
    { status: 'forbidden', stepUpUrl: null },        // 403
    { status: 'unauthenticated', stepUpUrl: null },  // 401 + 419
    { status: 'rate_limited', stepUpUrl: null },     // 429
    { status: 'invalid', stepUpUrl: null },          // 422 (e.g. notes too long)
    { status: 'step_up_required', stepUpUrl: '/auth/login?prompt=login&max_age=0' }, // 428
    { status: 'error', stepUpUrl: null },            // 5xx: not-reviewable / legal-hold conflict
  ]
  for (const c of cases) {
    it(`surfaces ${c.status} safely with a redacted reference and no stale loading`, async () => {
      runImpl.mockImplementation(async () => {
        failure.value = { status: c.status, requestId: 'req-dsr-77881122', auditEventId: 'aud-7', fieldErrors: {}, stepUpUrl: c.stepUpUrl }
        isSubmitting.value = false
        return null
      })
      const w = mountActions(submitted)
      await w.find('[data-action="approve"]').trigger('click')
      await w.find('[data-testid="dialog-set-reason"]').trigger('click')
      await w.find('[data-testid="dialog-confirm"]').trigger('click')
      await w.vm.$nextTick()
      const dialog = w.find('[data-testid="dialog"]')
      expect(dialog.exists()).toBe(true) // stays open to show the failure
      // props(), not attributes(): Vue drops a null-bound attr (so an attribute
      // read is `undefined`, not `''`); assert the prop directly, mirroring the
      // Task 6.9 panel spec so the two failure matrices stay consistent.
      expect(w.findComponent({ name: 'PrivilegedActionDialog' }).props('stepUpUrl')).toBe(c.stepUpUrl)
      expect(dialog.find('[data-testid="dialog-ref"]').text()).toBe('req-dsr-77881122') // dialog redacts to REF- itself
      expect(w.text()).not.toMatch(/stack|trace|eyJ|RuntimeException/i) // no raw exception leak
      expect(w.emitted('done')).toBeUndefined() // no refresh on failure
      expect(isSubmitting.value).toBe(false) // no stale loading
    })
  }

  // The destructive fulfill_commit flow must fail just as safely as review —
  // 428 step-up surfaced, 5xx "not in approved state" shown as safe copy, never a
  // `done` emit, dialog stays open with a redacted REF, no stale loading.
  const commitFailureCases: { status: PrivilegedActionFailure['status']; stepUpUrl: string | null }[] = [
    { status: 'step_up_required', stepUpUrl: '/auth/login?prompt=login&max_age=0' }, // 428
    { status: 'error', stepUpUrl: null }, // 5xx: request not in approved state
  ]
  for (const c of commitFailureCases) {
    it(`fulfill_commit surfaces ${c.status} safely (no done, dialog open, redacted REF, no stale loading)`, async () => {
      runImpl.mockImplementation(async () => {
        failure.value = { status: c.status, requestId: 'req-dsr-commit-55', auditEventId: 'aud-9', fieldErrors: {}, stepUpUrl: c.stepUpUrl }
        isSubmitting.value = false
        return null
      })
      const w = mountActions(approved)
      await w.find('[data-action="fulfill_commit"]').trigger('click')
      await w.find('[data-testid="dialog-confirm"]').trigger('click')
      await w.vm.$nextTick()
      const dialog = w.find('[data-testid="dialog"]')
      expect(dialog.exists()).toBe(true)
      expect(w.findComponent({ name: 'PrivilegedActionDialog' }).props('stepUpUrl')).toBe(c.stepUpUrl)
      expect(dialog.find('[data-testid="dialog-ref"]').text()).toBe('req-dsr-commit-55')
      expect(w.text()).not.toMatch(/stack|trace|eyJ|RuntimeException/i)
      expect(w.emitted('done')).toBeUndefined() // never refresh on a failed commit
      expect(isSubmitting.value).toBe(false)
    })
  }
})
```

7. [ ] **Run it — expect FAIL** (component missing):

```bash
npm run test -- app/components/compliance/__tests__/DsrReviewActions.spec.ts
```
Expected: `Failed to resolve import "../DsrReviewActions.vue"` — RED.

8. [ ] **GREEN — write `app/components/compliance/DsrReviewActions.vue`:**

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import PrivilegedActionDialog from '@/components/users/PrivilegedActionDialog.vue'
import { usePrivilegedAction } from '@/composables/usePrivilegedAction'
import { isReasonValid, type ReasonPolicy } from '@/lib/users/user-actions'
import { observabilityApi } from '@/services/observability.api'
import { useSessionStore } from '@/stores/session.store'
import { useI18n } from '@/composables/useI18n'
import UiButton from '@/components/ui/UiButton.vue'
import type {
  DataSubjectRequest,
  DsrFulfillResponse,
  DsrReviewResponse,
} from '@/types/compliance.types'

type ReviewActionId = 'approve' | 'reject' | 'fulfill_dry' | 'fulfill_commit'

const props = defineProps<{ readonly request: DataSubjectRequest }>()
const emit = defineEmits<{ done: [] }>()

const session = useSessionStore()
const { t } = useI18n()
const action = usePrivilegedAction<DsrReviewResponse | DsrFulfillResponse>()

// Reviewer notes policy (backend: notes ≤1000; required here so every decision is justified).
const REVIEW_NOTES: ReasonPolicy = { required: true, max: 1000 }

const activeAction = ref<ReviewActionId | null>(null)
const reason = ref('')
const legalHoldNotice = ref<string | null>(null)

const canReview = computed(() => session.hasPermission('admin.dsr.review'))
const isSubmittedState = computed(() => props.request.status === 'submitted')
const isApprovedState = computed(() => props.request.status === 'approved')

const needsReason = computed(
  () => activeAction.value === 'approve' || activeAction.value === 'reject',
)
const isDanger = computed(
  () => activeAction.value === 'reject' || activeAction.value === 'fulfill_commit',
)

const TITLE: Record<ReviewActionId, string> = {
  approve: 'observability.dsr_confirm_approve_title',
  reject: 'observability.dsr_confirm_reject_title',
  fulfill_dry: 'observability.dsr_confirm_fulfill_dry_title',
  fulfill_commit: 'observability.dsr_confirm_fulfill_commit_title',
}
const DESC: Record<ReviewActionId, string> = {
  approve: 'observability.dsr_confirm_approve_desc',
  reject: 'observability.dsr_confirm_reject_desc',
  fulfill_dry: 'observability.dsr_confirm_fulfill_dry_desc',
  fulfill_commit: 'observability.dsr_confirm_fulfill_commit_desc',
}
const dialogTitle = computed(() => (activeAction.value ? t(TITLE[activeAction.value]) : ''))
const dialogDescription = computed(() => (activeAction.value ? t(DESC[activeAction.value]) : ''))
const dialogError = computed(() => (action.failure.value ? t('common.error_generic') : null))

function open(id: ReviewActionId): void {
  action.reset()
  reason.value = ''
  legalHoldNotice.value = null
  activeAction.value = id
}

function onCancel(): void {
  activeAction.value = null
  reason.value = ''
  action.reset()
}

async function run(): Promise<void> {
  const id = activeAction.value
  if (!id) return
  const requestId = props.request.request_id

  if (id === 'approve' || id === 'reject') {
    if (!isReasonValid(REVIEW_NOTES, reason.value)) return
    const decision = id === 'approve' ? 'approved' : 'rejected'
    const result = await action.run(() =>
      observabilityApi.reviewDsr(requestId, { decision, notes: reason.value.trim() }),
    )
    if (result === null) return
  } else {
    const dryRun = id === 'fulfill_dry'
    const result = await action.run(() => observabilityApi.fulfillDsr(requestId, { dry_run: dryRun }))
    if (result === null) return
    if ('legal_hold_status' in result && result.legal_hold_status === 'active') {
      legalHoldNotice.value = t('observability.dsr_legal_hold_notice')
    }
  }

  activeAction.value = null
  reason.value = ''
  emit('done')
}

function onConfirm(): void {
  void run()
}
</script>

<template>
  <div v-if="canReview" class="dsr-review" data-testid="dsr-review-actions">
    <div class="dsr-review__buttons" role="group">
      <UiButton
        data-action="approve"
        variant="secondary"
        :disabled="!isSubmittedState || action.isSubmitting.value"
        @click="open('approve')"
      >
        {{ t('observability.dsr_btn_approve') }}
      </UiButton>
      <UiButton
        data-action="reject"
        variant="danger"
        :disabled="!isSubmittedState || action.isSubmitting.value"
        @click="open('reject')"
      >
        {{ t('observability.dsr_btn_reject') }}
      </UiButton>
      <UiButton
        data-action="fulfill_dry"
        variant="secondary"
        :disabled="!isApprovedState || action.isSubmitting.value"
        @click="open('fulfill_dry')"
      >
        {{ t('observability.dsr_btn_fulfill_dry') }}
      </UiButton>
      <UiButton
        data-action="fulfill_commit"
        variant="danger"
        :disabled="!isApprovedState || action.isSubmitting.value"
        @click="open('fulfill_commit')"
      >
        {{ t('observability.dsr_btn_fulfill_commit') }}
      </UiButton>
    </div>

    <p v-if="legalHoldNotice" data-testid="dsr-legal-hold" class="dsr-review__notice">
      {{ legalHoldNotice }}
    </p>

    <PrivilegedActionDialog
      :open="activeAction !== null"
      :title="dialogTitle"
      :description="dialogDescription"
      :danger="isDanger"
      :reason-label="needsReason ? t('observability.dsr_review_notes_label') : ''"
      :reason-required="needsReason"
      :reason-min="1"
      :reason-max="1000"
      :reason="reason"
      :submitting="action.isSubmitting.value"
      :step-up-url="action.stepUpUrl.value"
      :step-up-label="t('observability.dsr_step_up_label')"
      :error-message="dialogError"
      :request-id="action.requestId.value"
      @update:reason="reason = $event"
      @confirm="onConfirm"
      @cancel="onCancel"
    />
  </div>
</template>

<style scoped>
.dsr-review {
  display: grid;
  gap: 12px;
}
.dsr-review__buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.dsr-review__notice {
  font: 500 0.8125rem/1.4 var(--font-sans);
  color: var(--danger);
}
</style>
```

9. [ ] **Run it — expect PASS:**

```bash
npm run test -- app/components/compliance/__tests__/DsrReviewActions.spec.ts
```
Expected: all `DsrReviewActions.spec.ts` cases green (permission gating, applicability, confirm-before-API, success with the exact `reviewDsr`/`fulfillDsr` call shapes, legal-hold notice, and every failure-matrix row surfacing safe copy + redacted REF with no stale loading and no `done` emit).

10. [ ] **REFACTOR (if needed).** Keep `DsrQueueTable.vue` purely presentational (no network, no `usePrivilegedAction`) and `DsrReviewActions.vue` the sole owner of the action wiring. Confirm the masked queue still hides every raw subject id/PII field and the action call shapes match the backend contract; re-run both specs to stay green.

11. [ ] **Lint + typecheck the new files** (both lint steps are gates):

```bash
npm run typecheck && npm run lint && npm run format:check
```
Expected: clean — `lint:oxlint` (`oxlint .`) AND `lint:eslint` (`eslint "app/**/*.vue"`) both pass; every `vi.fn` is typed and no `.toThrow` is bare.

12. [ ] **Commit (green only):**

```bash
git add app/components/compliance/DsrQueueTable.vue \
        app/components/compliance/DsrReviewActions.vue \
        app/components/compliance/__tests__/DsrQueueTable.spec.ts \
        app/components/compliance/__tests__/DsrReviewActions.spec.ts \
        app/locales/id.json app/locales/en.json
git commit -m "feat(sso-admin-frontend): masked DSR queue table + review/fulfill privileged actions

Add DsrQueueTable (PII-minimized masked queue over UiDataList) and
DsrReviewActions (approve/reject/fulfill via the reused
PrivilegedActionDialog), gated on admin.dsr.review, full failure matrix
incl. 428 step-up and legal-hold conflict, list refreshed on success.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

**Task-scoped DoD:** `npm run typecheck && npm run lint && npm run format:check && npm run test && npm run build` all green from `services/sso-admin-frontend` (`npm run lint` runs BOTH `lint:oxlint` and `lint:eslint`); the queue masks every raw subject id/PII field (`reason`/`reviewer_subject_id`/`reviewer_notes` never rendered), review/fulfill run through the reused `usePrivilegedAction` + `PrivilegedActionDialog` with the full `401/403/419/422/428/429/5xx` + step-up matrix surfacing safe copy + redacted `REF-`, and `done()` fires only on success so the page refreshes the list. (The Playwright `test:e2e` run lands with the page in Task 6.11/6.12.)


---

### Task 6.11: Compliance console page (`observability/compliance.vue`) — all states

Compose the compliance console into the existing stub. Keep the stub's `definePageMeta({ name: 'admin.observability.compliance', layout: 'admin', requiresAdmin: true, permissions: ['admin.observability.read'] })`, add safe principal hydration (`useAsyncData('admin-compliance-principal', () => store.ensureSession())`) + `useRetentionStatus()` + `useDataSubjectRequests()`, and render all six states. Layout = stacked Swiss panels mirroring `clients/[clientId].vue`: (1) a **retention status panel** — `UiDataList` over `RetentionItem[]` with window/schedule/last-pruned/candidate folios, empty → "no retention evidence"; (2) the `ComplianceExportPanel` (Task 6.9), `canExport` gated on `admin.audit.export` via `store.hasPermission`; (3) the **DSR queue** — `DsrQueueTable` (Task 6.10) with `query`/`statusFilter` controls + `UiFolio` paging, `canReview` gated on `admin.dsr.review`, row `review`/`fulfill` open a `UiDetailDrawer` holding `DsrReviewActions`, whose `@done` runs `useDataSubjectRequests().refresh()` (never stale). Page-level forbidden/unauthenticated/error use `UiStatusView`; per-section degraded/stale banners (`role="status"`). Author a new nested `observability.compliance.*` block in BOTH locales, sourcing the copy from the legacy **flat** `audit.*` retention/DSR strings (the legacy keys are flat; the page consumes nested keys — author the nesting, do not flat-rename) (id↔en parity). Confirm the `/audit/compliance` → `admin.observability.compliance` redirect via `route-map.spec` (already covered — verified green, not rebuilt).

**Page-level vs. section state (concrete decision).** Both reads share `admin.observability.read` at the route, so a security/transport failure on **either** composable drives the single page-level surface; otherwise each panel degrades independently (empty/stale/error) inside the ready workspace. Precedence: `loading` (either) → `unauthenticated` (either) → `forbidden` (either) → `error` (only when **both** are `error`, i.e. nothing renders) → `ready`. Page-level `requestId = retention.requestId ?? dsr.requestId`.

**Files**
- Modify: `app/pages/observability/compliance.vue` (build the all-states page into the stub)
- Modify: `app/locales/id.json`, `app/locales/en.json` (AUTHOR a new **nested** `observability.compliance.*` block, copy sourced from the legacy **flat** `audit.*` retention/DSR strings — the legacy keys are flat and the page consumes nested keys, so this is authoring a nested namespace, not a flat rename; BOTH files, id↔en parity)
- Test: `app/pages/__tests__/observability-compliance.page.nuxt.spec.ts`
- Verify (no edit expected): `app/pages/__tests__/route-map.spec.ts` (already asserts `admin.observability.compliance` meta/permission + `audit/compliance.vue` → `name: 'admin.observability.compliance'`)

**Interfaces**
- Consumes: `useSessionStore` (`principal.display_name`, `ensureSession`, `hasPermission`) (`@/stores/session.store`); `useRetentionStatus`/`useDataSubjectRequests` (Task 6.6); `ComplianceExportPanel` (Task 6.9); `DsrQueueTable`/`DsrReviewActions` (Task 6.10); `RetentionStatus`/`RetentionItem`/`DataSubjectRequest`/`DsrStatus` + `resolveDsrStatusTone` (Task 6.1); `ComplianceViewState` (Task 6.1); `useI18n`; `UiSkeleton`/`UiStatusView`/`UiEmptyState`/`UiDataList` (+ `UiDataListColumn`/`UiDataListRow`)/`UiButton`/`UiInput`/`UiSelect` (+ `UiSelectOption`)/`UiFolio`/`UiStatusBadge`/`UiDetailDrawer`.
- Produces: the rendered `/observability/compliance` route (no exported API).

---

#### Step 1 — RED: write the failing page test

Create `app/pages/__tests__/observability-compliance.page.nuxt.spec.ts`. It mocks the two composables + session store per state (mirrors `dashboard.page.nuxt.spec.ts`), stubs the two privileged-action consumers (`ComplianceExportPanel`, `DsrReviewActions`) but mounts `DsrQueueTable` **real** so the no-raw-PII masking assertion is meaningful. Write the complete file:

```ts
// *.nuxt.spec.ts → 'nuxt' env: mountSuspended handles the page's async setup
// (useAsyncData + useI18n auto-imports). Data boundaries + session store mocked.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiDataList from '@/components/ui/UiDataList.vue'
import ComplianceExportPanel from '@/components/compliance/ComplianceExportPanel.vue'
import DsrQueueTable from '@/components/compliance/DsrQueueTable.vue'
import DsrReviewActions from '@/components/compliance/DsrReviewActions.vue'
import type { ComplianceViewState } from '@/lib/compliance/compliance-view-state'
import type { DataSubjectRequest, DsrStatus, RetentionStatus } from '@/types/compliance.types'

// --- retention composable refs ---
const retention = ref<RetentionStatus | null>(null)
const retentionViewState = ref<ComplianceViewState>('loading')
const retentionRequestId = ref<string | null>(null)
const retentionStale = ref(false)
const retentionRefresh = vi.fn<() => Promise<void>>(async () => {})

// --- dsr composable refs ---
const requests = ref<readonly DataSubjectRequest[] | null>(null)
const paged = ref<readonly DataSubjectRequest[]>([])
const dsrViewState = ref<ComplianceViewState>('loading')
const dsrRequestId = ref<string | null>(null)
const dsrStale = ref(false)
const dsrQuery = ref('')
const dsrStatusFilter = ref<DsrStatus | 'all'>('all')
const dsrPage = ref(1)
const dsrPageCount = ref(1)
const dsrTotal = ref(0)
const dsrFilteredTotal = ref(0)
const dsrRefresh = vi.fn<() => Promise<void>>(async () => {})

vi.mock('@/composables/useRetentionStatus', () => ({
  useRetentionStatus: () => ({
    retention,
    viewState: retentionViewState,
    requestId: retentionRequestId,
    isStale: retentionStale,
    refresh: retentionRefresh,
  }),
}))

vi.mock('@/composables/useDataSubjectRequests', () => ({
  useDataSubjectRequests: () => ({
    requests,
    filtered: paged,
    paged,
    viewState: dsrViewState,
    total: dsrTotal,
    filteredTotal: dsrFilteredTotal,
    page: dsrPage,
    pageCount: dsrPageCount,
    query: dsrQuery,
    statusFilter: dsrStatusFilter,
    requestId: dsrRequestId,
    isStale: dsrStale,
    refresh: dsrRefresh,
  }),
}))

const hasPermission = vi.fn<(p: string) => boolean>(() => true)
vi.mock('@/stores/session.store', () => ({
  useSessionStore: () => ({
    principal: { display_name: 'Admin Sentinel' },
    ensureSession: vi.fn<() => Promise<string>>(async () => 'authenticated'),
    hasPermission,
  }),
}))

const RETENTION_READY: RetentionStatus = {
  generated_at: '2026-06-28T14:32:15Z',
  items: [
    {
      category: 'audit_events',
      label: 'Audit events',
      window: { days: 365 },
      schedule: 'daily 02:00',
      candidate_count: 1240,
      last_pruned_at: '2026-06-27T02:00:00Z',
      last_pruned_count: 980,
    },
  ],
}

const DSR_ROW: DataSubjectRequest = {
  request_id: '01HF8ZJ4QWERTYUIOPASDFGHJK',
  subject_id: 'sub-ABCDEF1234567890',
  type: 'export',
  status: 'submitted',
  submitted_at: '2026-06-28T10:00:00Z',
  sla_due_at: '2026-07-05T10:00:00Z',
}

const Compliance = (await import('../observability/compliance.vue')).default

function mountPage() {
  return mountSuspended(Compliance, {
    global: { stubs: { ComplianceExportPanel: true, DsrReviewActions: true } },
  })
}

beforeEach(() => {
  retention.value = null
  retentionViewState.value = 'loading'
  retentionRequestId.value = null
  retentionStale.value = false
  requests.value = null
  paged.value = []
  dsrViewState.value = 'loading'
  dsrRequestId.value = null
  dsrStale.value = false
  dsrQuery.value = ''
  dsrStatusFilter.value = 'all'
  dsrPage.value = 1
  dsrPageCount.value = 1
  dsrTotal.value = 0
  dsrFilteredTotal.value = 0
  hasPermission.mockReturnValue(true)
  vi.clearAllMocks()
})
afterEach(() => vi.clearAllMocks())

function ready() {
  retentionViewState.value = 'ready'
  retention.value = RETENTION_READY
  dsrViewState.value = 'ready'
  requests.value = [DSR_ROW]
  paged.value = [DSR_ROW]
  dsrTotal.value = 1
  dsrFilteredTotal.value = 1
}

describe('compliance console page', () => {
  it('renders the masked principal with no token/PII', async () => {
    const wrapper = await mountPage()
    expect(wrapper.find('[data-page="compliance"]').exists()).toBe(true)
    expect(wrapper.find('[data-principal-name]').text()).toContain('Admin Sentinel')
    expect(wrapper.html()).not.toMatch(/access_token|refresh_token|id_token|Bearer/)
  })

  it('loading (either composable) → skeleton, no panels', async () => {
    retentionViewState.value = 'loading'
    dsrViewState.value = 'ready'
    const wrapper = await mountPage()
    expect(wrapper.findComponent(UiSkeleton).exists()).toBe(true)
    expect(wrapper.findComponent(DsrQueueTable).exists()).toBe(false)
  })

  it('forbidden (retention) → forbidden status view, distinct from empty', async () => {
    retentionViewState.value = 'forbidden'
    dsrViewState.value = 'ready'
    requests.value = []
    const wrapper = await mountPage()
    expect(wrapper.findComponent(UiStatusView).props('tone')).toBe('forbidden')
    expect(wrapper.findComponent(UiEmptyState).exists()).toBe(false)
  })

  it('unauthenticated (dsr) → step_up status view', async () => {
    retentionViewState.value = 'ready'
    retention.value = RETENTION_READY
    dsrViewState.value = 'unauthenticated'
    const wrapper = await mountPage()
    expect(wrapper.findComponent(UiStatusView).props('tone')).toBe('step_up')
  })

  it('error only when BOTH fail → error view; raw request id redacted to REF-', async () => {
    retentionViewState.value = 'error'
    dsrViewState.value = 'error'
    retentionRequestId.value = 'admin-req-FAILED99'
    const wrapper = await mountPage()
    expect(wrapper.findComponent(UiStatusView).props('tone')).toBe('error')
    expect(wrapper.text()).toContain('REF-')
    expect(wrapper.text()).not.toContain('admin-req-FAILED99')
  })

  it('one section error + the other ready → workspace renders (no page-level error view)', async () => {
    retentionViewState.value = 'error'
    dsrViewState.value = 'ready'
    requests.value = [DSR_ROW]
    paged.value = [DSR_ROW]
    const wrapper = await mountPage()
    expect(wrapper.findComponent(UiStatusView).exists()).toBe(false)
    expect(wrapper.findComponent(DsrQueueTable).exists()).toBe(true)
  })

  it('ready → retention list + export panel + DSR table, no secrets', async () => {
    ready()
    const wrapper = await mountPage()
    expect(wrapper.findComponent(UiDataList).exists()).toBe(true) // retention table
    expect(wrapper.findComponent(ComplianceExportPanel).exists()).toBe(true)
    expect(wrapper.findComponent(DsrQueueTable).exists()).toBe(true)
    expect(wrapper.html()).toContain('2026-06-28T14:32:15Z') // retention generated_at folio
    expect(wrapper.html()).not.toMatch(/access_token|Bearer|client_secret/)
  })

  it('DSR queue masks the raw subject id (no raw PII in DOM)', async () => {
    ready()
    const wrapper = await mountPage()
    // DsrQueueTable is mounted real → asserts the masking it applies surfaces here.
    expect(wrapper.html()).not.toContain('sub-ABCDEF1234567890')
    expect(wrapper.html()).not.toMatch(/\b\d{16}\b|\b\d{18}\b|\b\d{10}\b/)
    expect(wrapper.html()).toContain('REF-')
  })

  it('retention empty → no-retention-evidence empty state while DSR still renders', async () => {
    retentionViewState.value = 'empty'
    retention.value = { generated_at: '2026-06-28T14:32:15Z', items: [] }
    dsrViewState.value = 'ready'
    requests.value = [DSR_ROW]
    paged.value = [DSR_ROW]
    const wrapper = await mountPage()
    expect(wrapper.findAllComponents(UiEmptyState).length).toBeGreaterThanOrEqual(1)
    expect(wrapper.findComponent(DsrQueueTable).exists()).toBe(true)
  })

  it('hides the export panel and DSR actions when permissions are absent', async () => {
    ready()
    hasPermission.mockImplementation(
      (p: string) => p !== 'admin.audit.export' && p !== 'admin.dsr.review',
    )
    const wrapper = await mountPage()
    expect(wrapper.findComponent(ComplianceExportPanel).props('canExport')).toBe(false)
    expect(wrapper.findComponent(DsrQueueTable).props('canReview')).toBe(false)
  })

  it('a DSR action @done refreshes the queue (never stale)', async () => {
    ready()
    const wrapper = await mountPage()
    // open the review drawer from the table, then the actions emit done.
    wrapper.findComponent(DsrQueueTable).vm.$emit('review', DSR_ROW)
    await nextTick()
    wrapper.findComponent(DsrReviewActions).vm.$emit('done')
    await nextTick()
    expect(dsrRefresh).toHaveBeenCalledTimes(1)
  })

  it('stale snapshot shows a per-section status banner', async () => {
    ready()
    retentionStale.value = true
    const wrapper = await mountPage()
    expect(wrapper.find('[role="status"]').exists()).toBe(true)
    expect(wrapper.findComponent(UiDataList).exists()).toBe(true) // data still visible
  })
})
```

Run it (expect FAIL — the stub page renders only `<h1>Compliance</h1>`, none of these selectors/components exist):

```
npm run test:unit -- app/pages/__tests__/observability-compliance.page.nuxt.spec.ts
```

Expected: RED, e.g. `expect(received).toContain('compliance')` / `Unable to find component DsrQueueTable` — the assertions fail because the page behaviour is missing (not a typo).

- [ ] Test file written
- [ ] Test run, confirmed FAIL with the expected reason

#### Step 2 — GREEN: build the page into the stub

Replace `app/pages/observability/compliance.vue` with the full all-states page:

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import { AlertTriangle } from 'lucide-vue-next'
import { useSessionStore } from '@/stores/session.store'
import { useI18n } from '@/composables/useI18n'
import { useRetentionStatus } from '@/composables/useRetentionStatus'
import { useDataSubjectRequests } from '@/composables/useDataSubjectRequests'
import type { ComplianceViewState } from '@/lib/compliance/compliance-view-state'
import type { DataSubjectRequest, DsrStatus, RetentionItem } from '@/types/compliance.types'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiDataList, {
  type UiDataListColumn,
  type UiDataListRow,
} from '@/components/ui/UiDataList.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiSelect, { type UiSelectOption } from '@/components/ui/UiSelect.vue'
import UiFolio from '@/components/ui/UiFolio.vue'
import UiDetailDrawer from '@/components/ui/UiDetailDrawer.vue'
import ComplianceExportPanel from '@/components/compliance/ComplianceExportPanel.vue'
import DsrQueueTable from '@/components/compliance/DsrQueueTable.vue'
import DsrReviewActions from '@/components/compliance/DsrReviewActions.vue'

definePageMeta({
  name: 'admin.observability.compliance',
  layout: 'admin',
  requiresAdmin: true,
  permissions: ['admin.observability.read'],
})

const { t } = useI18n()

// SAFE HYDRATION: resolve the masked principal server-side via the session store.
// OIDC tokens + raw government PII stay in Nitro event.context, never in __NUXT__.
const store = useSessionStore()
await useAsyncData('admin-compliance-principal', () => store.ensureSession())

// SAFE DATA: retention + DSR DTOs are masked aggregates / opaque ids only.
const retention = useRetentionStatus()
const dsr = useDataSubjectRequests()

const canExport = computed<boolean>(() => store.hasPermission('admin.audit.export'))
const canReview = computed<boolean>(() => store.hasPermission('admin.dsr.review'))

// Both reads share admin.observability.read at the route, so a security/transport
// failure on either drives the page-level surface; otherwise each panel degrades
// independently (empty / stale / error) inside the ready workspace.
// ponytail: plain precedence over two view-states — no resolver needed for 2 inputs.
const pageState = computed<ComplianceViewState>(() => {
  const states = [retention.viewState.value, dsr.viewState.value]
  if (states.includes('loading')) return 'loading'
  if (states.includes('unauthenticated')) return 'unauthenticated'
  if (states.includes('forbidden')) return 'forbidden'
  if (states.every((state) => state === 'error')) return 'error'
  return 'ready'
})
const pageRequestId = computed<string | null>(
  () => retention.requestId.value ?? dsr.requestId.value,
)

// --- retention panel ---
const retentionColumns: readonly UiDataListColumn[] = [
  { key: 'label', label: t('observability.compliance.retention.category') },
  { key: 'window', label: t('observability.compliance.retention.window') },
  { key: 'schedule', label: t('observability.compliance.retention.schedule') },
  { key: 'last_pruned', label: t('observability.compliance.retention.last_pruned'), variant: 'timestamp' },
  { key: 'candidate', label: t('observability.compliance.retention.candidate_rows'), align: 'right' },
]

function windowLabel(item: RetentionItem): string {
  const { days, hours, seconds } = item.window
  if (typeof days === 'number') return `${days}d`
  if (typeof hours === 'number') return `${hours}h`
  if (typeof seconds === 'number') return `${seconds}s`
  return '—'
}

const retentionRows = computed<readonly UiDataListRow[]>(() =>
  (retention.retention.value?.items ?? []).map((item) => ({
    id: item.category,
    label: item.label,
    window: windowLabel(item),
    schedule: item.schedule ?? '—',
    last_pruned: item.last_pruned_at ?? t('observability.compliance.retention.not_pruned'),
    candidate: item.candidate_count ?? 0,
  })),
)

// --- DSR controls ---
const dsrStatuses: readonly (DsrStatus | 'all')[] = [
  'all',
  'submitted',
  'approved',
  'rejected',
  'fulfilled',
  'cancelled',
  'on_hold',
]
const statusOptions = computed<readonly UiSelectOption[]>(() =>
  dsrStatuses.map((status) => ({
    value: status,
    label: t(`observability.compliance.dsr.status.${status}`),
  })),
)

// --- DSR review/fulfill drawer ---
const selected = ref<DataSubjectRequest | null>(null)
function onDsrSelect(request: DataSubjectRequest): void {
  selected.value = request
}
async function onDsrDone(): Promise<void> {
  selected.value = null
  await dsr.refresh()
}

async function onRefresh(): Promise<void> {
  await Promise.all([retention.refresh(), dsr.refresh()])
}
function nextPage(): void {
  if (dsr.page.value < dsr.pageCount.value) dsr.page.value += 1
}
function previousPage(): void {
  if (dsr.page.value > 1) dsr.page.value -= 1
}
</script>

<template>
  <section class="compliance" data-page="compliance">
    <header class="compliance__hero">
      <span class="compliance__eyebrow">{{ t('observability.compliance.eyebrow') }}</span>
      <h1 class="compliance__title">{{ t('observability.compliance.title') }}</h1>
      <p class="compliance__summary">{{ t('observability.compliance.summary') }}</p>
      <p class="compliance__principal" data-principal-name>
        {{ t('observability.compliance.signed_in_as', { name: store.principal?.display_name ?? '—' }) }}
      </p>
    </header>

    <UiSkeleton
      v-if="pageState === 'loading'"
      :rows="6"
      :label="t('observability.compliance.loading')"
    />

    <UiStatusView
      v-else-if="pageState === 'forbidden'"
      tone="forbidden"
      :eyebrow="t('observability.compliance.eyebrow')"
      :title="t('observability.compliance.forbidden_title')"
      :description="t('common.forbidden_desc')"
      :request-id="pageRequestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="pageState === 'unauthenticated'"
      tone="step_up"
      :eyebrow="t('observability.compliance.eyebrow')"
      :title="t('common.session_expired_title')"
      :description="t('common.session_expired_desc')"
      :request-id="pageRequestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="pageState === 'error'"
      tone="error"
      :eyebrow="t('observability.compliance.eyebrow')"
      :title="t('observability.compliance.error_title')"
      :description="t('common.error_loading_desc')"
      :request-id="pageRequestId ?? undefined"
      :standalone="false"
    >
      <template #actions>
        <UiButton variant="secondary" size="sm" @click="onRefresh">
          {{ t('common.btn_refresh') }}
        </UiButton>
      </template>
    </UiStatusView>

    <template v-else>
      <!-- Retention panel -->
      <section
        class="compliance__panel"
        data-panel="retention"
        aria-labelledby="compliance-retention-heading"
      >
        <header class="compliance__panel-head">
          <h2 id="compliance-retention-heading" class="compliance__panel-title">
            {{ t('observability.compliance.retention.title') }}
          </h2>
          <!-- Evidence folio: when the retention status was generated. Mirrors the
               cockpit's generated_at folio so the freshness of the masked snapshot
               is visible on the compliance page too. -->
          <dl class="compliance__evidence">
            <dt>{{ t('observability.compliance.retention.generated_at') }}</dt>
            <dd>
              <UiFolio :value="retention.retention.value?.generated_at" variant="timestamp" />
            </dd>
          </dl>
        </header>
        <div v-if="retention.isStale.value" class="compliance__banner" role="status">
          <AlertTriangle :size="16" aria-hidden="true" />
          <span>{{ t('observability.compliance.stale_banner') }}</span>
        </div>
        <UiEmptyState
          v-if="retention.viewState.value === 'empty'"
          :title="t('observability.compliance.retention.empty_title')"
          :description="t('observability.compliance.retention.empty_desc')"
        />
        <p
          v-else-if="retention.viewState.value === 'error'"
          class="compliance__section-error"
          role="status"
        >
          {{ t('common.error_loading_desc') }}
        </p>
        <UiDataList
          v-else
          :caption="t('observability.compliance.retention.title')"
          :columns="retentionColumns"
          :rows="retentionRows"
        />
      </section>

      <!-- Export + evidence pack -->
      <section
        class="compliance__panel"
        data-panel="export"
        aria-labelledby="compliance-export-heading"
      >
        <h2 id="compliance-export-heading" class="compliance__panel-title">
          {{ t('observability.compliance.export.title') }}
        </h2>
        <ComplianceExportPanel :can-export="canExport" />
      </section>

      <!-- DSR queue -->
      <section
        class="compliance__panel"
        data-panel="dsr"
        aria-labelledby="compliance-dsr-heading"
      >
        <header class="compliance__panel-head">
          <h2 id="compliance-dsr-heading" class="compliance__panel-title">
            {{ t('observability.compliance.dsr.title') }}
          </h2>
          <dl class="compliance__evidence">
            <dt>{{ t('observability.compliance.dsr.shown') }}</dt>
            <dd><UiFolio :index="dsr.filteredTotal.value" :total="dsr.total.value" /></dd>
          </dl>
        </header>

        <div v-if="dsr.isStale.value" class="compliance__banner" role="status">
          <AlertTriangle :size="16" aria-hidden="true" />
          <span>{{ t('observability.compliance.stale_banner') }}</span>
        </div>

        <div class="compliance__controls">
          <UiInput
            v-model="dsr.query.value"
            :placeholder="t('observability.compliance.dsr.search_placeholder')"
            :aria-label="t('observability.compliance.dsr.search_placeholder')"
          />
          <UiSelect
            v-model="dsr.statusFilter.value"
            :options="statusOptions"
            :aria-label="t('observability.compliance.dsr.status_filter')"
          />
        </div>

        <UiEmptyState
          v-if="dsr.viewState.value === 'empty'"
          :title="t('observability.compliance.dsr.empty_title')"
          :description="t('observability.compliance.dsr.empty_desc')"
        />
        <p
          v-else-if="dsr.viewState.value === 'error'"
          class="compliance__section-error"
          role="status"
        >
          {{ t('common.error_loading_desc') }}
        </p>
        <template v-else>
          <DsrQueueTable
            :caption="t('observability.compliance.dsr.title')"
            :rows="dsr.paged.value"
            :can-review="canReview"
            @review="onDsrSelect"
            @fulfill="onDsrSelect"
          />
          <div class="compliance__pager">
            <UiButton
              variant="secondary"
              size="sm"
              :disabled="dsr.page.value <= 1"
              @click="previousPage"
            >
              {{ t('observability.compliance.dsr.page_previous') }}
            </UiButton>
            <UiFolio :index="dsr.page.value" :total="dsr.pageCount.value" />
            <UiButton
              variant="secondary"
              size="sm"
              :disabled="dsr.page.value >= dsr.pageCount.value"
              @click="nextPage"
            >
              {{ t('observability.compliance.dsr.page_next') }}
            </UiButton>
          </div>
        </template>

        <UiDetailDrawer
          :open="selected !== null"
          title-id="compliance-dsr-drawer"
          :title="t('observability.compliance.dsr.review_title')"
          :description="t('observability.compliance.dsr.review_desc')"
          :close-label="t('common.btn_cancel')"
          @close="selected = null"
        >
          <DsrReviewActions v-if="selected" :request="selected" @done="onDsrDone" />
        </UiDetailDrawer>
      </section>
    </template>
  </section>
</template>

<style scoped>
.compliance {
  display: grid;
  gap: 24px;
  padding: 24px;
}
.compliance__hero {
  display: grid;
  gap: 6px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border);
}
.compliance__eyebrow {
  font: 600 0.6875rem/1 var(--font-sans);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.compliance__title {
  margin: 0;
  font: 600 1.5rem/1.2 var(--font-sans);
  letter-spacing: -0.02em;
  color: var(--fg);
}
.compliance__summary {
  margin: 0;
  max-width: 64ch;
  font: 400 0.875rem/1.6 var(--font-sans);
  color: var(--fg-2);
}
.compliance__principal {
  margin: 0;
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--fg-2);
}
.compliance__panel {
  display: grid;
  gap: 14px;
  padding: 20px;
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
}
.compliance__panel-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}
.compliance__panel-title {
  margin: 0;
  font: 600 1rem/1.3 var(--font-sans);
  color: var(--fg);
}
.compliance__evidence {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 0;
}
.compliance__evidence dt {
  font: 600 0.625rem/1 var(--font-sans);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.compliance__evidence dd {
  margin: 0;
}
.compliance__controls {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}
.compliance__pager {
  display: flex;
  align-items: center;
  gap: 12px;
}
.compliance__section-error {
  margin: 0;
  font: 500 0.8125rem/1.4 var(--font-sans);
  color: var(--danger);
}
.compliance__banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  font: 500 0.8125rem/1.4 var(--font-sans);
  color: var(--warning-soft-fg);
  background: var(--warning-soft);
  border: 1px solid var(--warning-soft-fg);
  border-radius: var(--r-sm);
}
</style>
```

> Note on `v-model="dsr.query.value"`: the composable exposes `query`/`statusFilter`/`page` as `Ref`s on the returned object, so the page binds `.value` directly (the object is not reactive-unwrapped). This matches how `useDataSubjectRequests` is consumed elsewhere; if the page-level lint flags it, destructure `const { query, statusFilter, page, paged, pageCount, total, filteredTotal, viewState, isStale, requestId, refresh } = dsr` at the top and bind the bare refs (`v-model="query"`) exactly as `users/index.vue` does — functionally identical, pick whichever the surrounding files use.

- [ ] Page written

#### Step 3 — GREEN: author the nested `observability.compliance.*` locale block (BOTH files, id↔en parity)

AUTHOR a new **nested** `observability.compliance` block in `app/locales/en.json` and `app/locales/id.json`. The legacy `audit.*` block is **flat** (`audit.retention_title`, `audit.window`, `audit.dsr_title`, …) but the page consumes **nested** keys (`observability.compliance.retention.title`, …), so this is authoring a nested namespace — **not** a flat rename. **Source the copy text from the legacy flat `audit.*` strings** (`retention_title`, `window`, `schedule`, `last_pruned`, `not_pruned`, `candidate_rows`, `dsr_title`, `approve`, `reject`, `dry_run_fulfill`, `review_notes`, `sla_due`, `no_dsr`, `export_title`, `evidence_pack_title`, …) so the wording stays consistent. The jsonc block below is the **source of truth**; mirror its nesting structurally in `id.json` (English shown):

```jsonc
"observability": {
  "compliance": {
    "eyebrow": "Compliance Evidence",
    "title": "Audit Compliance",
    "summary": "Retention windows, audit/evidence exports, and the data-subject-request queue.",
    "signed_in_as": "Signed in as {name}",
    "loading": "Loading compliance console",
    "forbidden_title": "Compliance access denied",
    "error_title": "Compliance console could not be loaded",
    "stale_banner": "Showing the last successful snapshot — a background refresh failed.",
    "retention": {
      "title": "Retention status",
      "generated_at": "Generated",
      "category": "Category",
      "window": "Window",
      "schedule": "Schedule",
      "last_pruned": "Last pruned",
      "not_pruned": "Never run",
      "candidate_rows": "Candidate rows",
      "empty_title": "No retention evidence",
      "empty_desc": "No retention windows have been recorded yet."
    },
    "export": { "title": "Export & evidence pack" },
    "dsr": {
      "title": "DSR queue",
      "shown": "Shown",
      "search_placeholder": "Search by request or account code",
      "status_filter": "Filter by status",
      "status": {
        "all": "All statuses",
        "submitted": "Submitted",
        "approved": "Approved",
        "rejected": "Rejected",
        "fulfilled": "Fulfilled",
        "cancelled": "Cancelled",
        "on_hold": "On hold"
      },
      "empty_title": "No data-subject requests",
      "empty_desc": "No DSR has been submitted for the current filter.",
      "review_title": "Review request",
      "review_desc": "Approve, reject, or fulfill this data-subject request.",
      "page_previous": "Previous",
      "page_next": "Next"
    }
  }
}
```

> Keep `id.json` byte-parallel in structure (Indonesian copy: `title` → "Kepatuhan Audit", `retention.title` → "Status retensi", `retention.generated_at` → "Dibuat", `dsr.title` → "Antrean DSR", etc.). If Task 6.8/6.9/6.10 already created `observability.compliance.export.*` or `observability.compliance.dsr.status.*` keys, do not duplicate — merge into the existing block and keep parity.

Run the page test (expect PASS):

```
npm run test:unit -- app/pages/__tests__/observability-compliance.page.nuxt.spec.ts
```

Expected: GREEN — `Test Files  1 passed`, all `it()`s pass.

- [ ] Locale keys added to BOTH files, id↔en parity
- [ ] Page test PASS

#### Step 4 — Confirm the redirect + route-map (no edit expected)

`route-map.spec.ts` already asserts `admin.observability.compliance` meta/permission and that `audit/compliance.vue` redirects to `name: 'admin.observability.compliance'`. Confirm it stays green:

```
npm run test:unit -- app/pages/__tests__/route-map.spec.ts
```

Expected: GREEN — includes `guards admin.observability.compliance …` and `redirects /, /audit and /audit/compliance to their canonical routes`. If (only if) a new permission/name drifted, extend the spec; otherwise no edit.

- [ ] route-map.spec confirmed GREEN

#### Step 5 — REFACTOR

Read the diff. If `dsr.*.value` template bindings tripped eslint/oxlint, switch to the destructured-refs form (see the Step 2 note) to match `users/index.vue`. Ensure no `audit.*` key the page references was left un-adapted, no hard-coded colour, no `--font-mono` misuse, no traceability markers. Re-run the page + route-map tests to confirm still green.

- [ ] Refactor pass done, tests still green

#### Step 6 — Commit

```
git add app/pages/observability/compliance.vue app/pages/__tests__/observability-compliance.page.nuxt.spec.ts app/locales/en.json app/locales/id.json
git commit -m "feat(sso-admin-frontend): compose Swiss compliance console page (all states)

Build the all-states compliance console into the observability/compliance
stub: safe principal hydration, useRetentionStatus + useDataSubjectRequests,
stacked retention / export / DSR panels, page-level forbidden/unauthenticated/
error via UiStatusView, per-section degraded/stale banners, masked DSR queue,
and list refresh on review/fulfill. Adapt the legacy audit.* retention/DSR
locale keys to observability.compliance.* (id + en).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] Committed on green

#### Task-scoped Definition of Done

Run from `services/sso-admin-frontend` (report any blocked command explicitly; never claim PASS for a command that did not run):

```
npm run typecheck && npm run lint && npm run format:check && npm run test
```

`npm run lint` runs BOTH `lint:oxlint` (`oxlint .`) AND `lint:eslint` (`eslint "app/**/*.vue"`) — both must pass. The full `build` + `test:e2e` gate runs in Task 6.12.


---

### Task 6.12: Extend the SSR token-leak gate + e2e + full DoD

Prove the **observability summary + retention + DSR DTOs** are leak-safe in the SSR payload, add the Playwright e2e for the `/audit*` redirects + the forbidden flow + the audit-export blob-download flow, and run the complete Definition-of-Done gate. The leak fixture (`test/fixtures/ssr-leak`) is a Nuxt **layer over the real app**: today its sentinel principal (`server/routes/api/admin/me.get.ts`) lacks `admin.observability.read`, so `/observability` and `/observability/compliance` would render `forbidden`; and there are no fixture data routes for the three Phase-6 read DTOs, so the pages would render `error`. Grant the sentinel principal `admin.observability.read` (+ an `observability` menu entry the nav asserts), add three masked fixture routes (small aggregates + opaque ids only — no token/secret and no 10/16/18-digit run that would trip `collectPiiShapeLeaks`), so both pages render their `ready` state during the gate; then the existing `collectSecretLeaks` + `collectPiiShapeLeaks` collectors automatically cover the new DTOs. The export/evidence-pack blob GETs are **client-only** download flows (never SSR-rendered — `triggerBlobDownload` is `import.meta.client`-guarded and the blob is never persisted to `useState`/Pinia/storage), so they need **no** SSR-leak fixture route; they are covered by the Playwright e2e (redirects + an audit-export download yielding a file with the backend `Content-Disposition` filename; an export step-up failure surfacing safe copy + `REF-`; the forbidden flow). This task runs **last** in Phase 6, so the pages from Tasks 6.8/6.11 and the panel from 6.9 already exist.

**Files**
- Create: `test/fixtures/ssr-leak/server/routes/api/admin/observability/summary.get.ts` (masked `ObservabilitySummary`)
- Create: `test/fixtures/ssr-leak/server/routes/api/admin/audit/retention.get.ts` (masked `RetentionResponse`)
- Create: `test/fixtures/ssr-leak/server/routes/api/admin/data-subject-requests/index.get.ts` (raw `DsrListResponse` from the shared backend presenter; opaque ids PLUS a **non-null free-text PII canary** in `reason`/`reviewer_notes`/`reviewer_subject_id` so the gate proves the Task-6.4 runtime strip)
- Modify: `test/fixtures/ssr-leak/server/routes/api/admin/me.get.ts` (add `'admin.observability.read'` to `permissions[]` + `capabilities{}` + an `observability` menu entry; keep every existing entry so the dashboard/users/clients gate blocks stay green)
- Modify (extend): `test/ssr-token-leak.gate.spec.ts` (render `/observability` + `/observability/compliance` SSR; assert ready render + no token/secret/raw-PII in HTML and `__NUXT_DATA__` via `collectSecretLeaks`/`collectPiiShapeLeaks`)
- Create: `e2e/observability.spec.ts` (Playwright: `/audit` → `/observability` + `/audit/compliance` → `/observability/compliance` redirects; forbidden flow; audit-export download with the backend filename; export step-up 428 + DSR-review step-up 428 → re-auth link to `step_up_url` + safe copy + `REF-`)
- Delete: `e2e/audit.spec.ts` (obsolete old Vue-SPA tabbed audit spec — `/audit` now redirects to `/observability`, and `e2e/observability.spec.ts` covers the redirects + flows)
- (Verify green) the full service DoD gate

**Interfaces**
- Produces (fixture routes): static masked `ObservabilitySummary` / `RetentionResponse` / `DsrListResponse` JSON (small aggregates + opaque ids only; no token/secret and no 10/16/18-digit run that would trip `collectPiiShapeLeaks`). No exported symbols.
- Consumes: the gate's existing `collectSecretLeaks`/`collectPiiShapeLeaks`/`extractPayload` (`test/ssr-token-leak.gate.spec.ts`); the fixture catch-all override pattern (a more-specific route wins over the layer's `server/routes/api/admin/[...].ts`, extract-foundation §10); the `observability.api` DTO shapes (Task 6.1/6.4); the `@nuxt/test-utils/e2e` + Playwright harness. Mirrors the dashboard `summary.get.ts` fixture + the users leak block (Task 3.6 / Task 4.13).

**Background (load-bearing facts verified against the codebase):**
- `formatTechnicalPreview(value)` (`app/lib/display-identifiers.ts`) = `formatSupportReference`, which normalizes to `[A-Z0-9]` uppercase then `REF-${normalized.slice(-8)}`. Verified with the real helper: DSR `subject_id` `'sub-dsr-aurora'` → **`REF-SRAURORA`** and `request_id` `'01HX0K7P9MQA2BN4TC6VD8SEFG'` → **`REF-6VD8SEFG`** — both deterministic, assertable positives, and neither contains a 10/16/18-digit run (confirmed against `collectPiiShapeLeaks`'s patterns), so the rendered DSR ids hydrate as opaque, non-PII-shaped values. (`reviewer_subject_id` is **stripped** by the Task-6.4 runtime row map and never rendered, so it has no `REF-` form on the page.)
- `collectPiiShapeLeaks` greps **word-bounded** 16/18/10-digit runs over the serialized payload. Every fixture count/timestamp/id must keep its longest digit run < 10: ISO timestamps break at separators (max run 4, the year), counts are ≤ 5 digits, and the ULID DSR id interleaves letters so its longest digit run is 2.
- `collectSecretLeaks` also greps token field NAMES (`/accessToken|refreshToken|idToken|access_token|refresh_token|id_token/`) and secret field NAMES — the masked DTO field names that DO hydrate (`last_seen_trace_id`, `subject_id`, `oldest_pending_age_seconds`, `last_pruned_count`) contain none of those substrings, so the field names are safe to hydrate. (The DSR `reason`/`reviewer_notes`/`reviewer_subject_id` are stripped at runtime by Task 6.4 and never hydrate at all.)
- `admin-guard.global.ts` enforces `hasEveryPermission(meta.permissions)`; both pages declare `permissions: ['admin.observability.read']`, so the sentinel `me.get.ts` must carry it or `/observability*` renders `/forbidden` instead of the masked pages. The within-page reads (retention/DSR) are backend-permission-gated but the fixture routes return data regardless — only `admin.observability.read` is needed for the gate's `ready` render (the export/DSR-action buttons gate on `admin.audit.export`/`admin.dsr.review` and merely hide when absent; their dialogs are closed at render so they contribute nothing to the SSR payload — keep the principal minimal, ponytail).
- The fixture is pre-built in a subprocess by `test/globalSetup.ts`; the gate runs `setup({ build: false })` against `.output`. New fixture routes are picked up by that subprocess build automatically (the lock dir is removed on teardown, so the next run rebuilds fresh).
- `triggerBlobDownload` (Task 6.3) appends an `<a download="<filename>">` over an object URL and clicks it. Playwright captures that as a `download` event whose `suggestedFilename()` is the `download` attribute — which the panel sets from the backend `Content-Disposition` (`filenameFromContentDisposition`, falling back to `auditExportFallbackName`). Playwright accepts downloads by default; no `acceptDownloads` flag is needed.
- The legacy `e2e/audit.spec.ts` is the **old Vue-SPA** spec (tabbed "Audit Compliance" page, `localStorage` locale) and asserts UI that no longer exists once the Nuxt pages ship — it would break the suite. It is **deleted** in this task (step 9b): `/audit` now redirects to `/observability` and the new `e2e/observability.spec.ts` covers the redirects + flows, so the legacy spec is obsolete. The new spec follows the Nuxt-4 locale-cookie pattern (`admin_locale=en`) proven in `e2e/users.spec.ts`.

**Steps**

1. [ ] Grant the sentinel principal `admin.observability.read`. In `test/fixtures/ssr-leak/server/routes/api/admin/me.get.ts`, leave `subject_id`/`email`/`display_name`/`role`/`auth_context` and every existing permission/capability/menu unchanged (so the dashboard/users/clients gate blocks stay green) and ADD the three observability entries — append `'admin.observability.read'` to `permissions[]`, add `'admin.observability.read': true` to `capabilities{}`, and append the menu entry:

```ts
        permissions: [
          'admin.dashboard.view',
          'admin.users.read',
          'admin.users.write',
          'admin.users.lock',
          'admin.roles.read',
          'admin.roles.write',
          'admin.clients.read',
          'admin.clients.write',
          'admin.sessions.terminate',
          'admin.observability.read',
        ],
        capabilities: {
          'admin.dashboard.view': true,
          'admin.users.read': true,
          'admin.users.write': true,
          'admin.users.lock': true,
          'admin.roles.read': true,
          'admin.roles.write': true,
          'admin.clients.read': true,
          'admin.clients.write': true,
          'admin.sessions.terminate': true,
          'admin.observability.read': true,
        },
        menus: [
          {
            id: 'dashboard',
            label: 'Dashboard',
            required_permission: 'admin.dashboard.view',
            visible: true,
          },
          {
            id: 'users',
            label: 'Users',
            required_permission: 'admin.users.read',
            visible: true,
          },
          {
            id: 'clients',
            label: 'Clients',
            required_permission: 'admin.clients.read',
            visible: true,
          },
          {
            id: 'observability',
            label: 'Observability',
            required_permission: 'admin.observability.read',
            visible: true,
          },
        ],
```

2. [ ] Create the masked observability summary fixture route `test/fixtures/ssr-leak/server/routes/api/admin/observability/summary.get.ts` (FULL code) — small aggregates only; no token/secret/PII-digit run:

```ts
// SSR token-leak fixture: a representative MASKED observability summary so the
// §3.3 gate renders /observability in its READY state and the payload collectors
// cover the ObservabilitySummary DTO. Small aggregates + opaque ids only — no
// token, secret, or 10/16/18-digit run (a more-specific route wins over the
// layer's catch-all server/routes/api/admin/[...].ts).
import { defineEventHandler } from 'h3'

export default defineEventHandler(() => ({
  generated_at: '2026-06-28T14:32:15Z',
  partial: false,
  degraded: [],
  services: [
    {
      key: 'idp_backend',
      name: 'IdP Backend',
      status: 'healthy',
      summary: 'All checks passing',
      latency_p95_ms: 84,
      freshness_seconds: 12,
      checks: { database: true, cache: true, mail: true },
    },
    {
      key: 'queue_worker',
      name: 'Queue Worker',
      status: 'healthy',
      summary: 'No backlog',
      freshness_seconds: 9,
      queue: { pending_jobs: 2, failed_jobs: 0, oldest_pending_age_seconds: 9 },
    },
  ],
  metrics: {
    window_seconds: 86400,
    freshness_seconds: 30,
    queue: { pending_jobs: 2, failed_jobs: 0, oldest_pending_age_seconds: 9 },
    auth_funnel: { attempts: 1840, succeeded: 1795, denied: 45 },
    admin_activity: { actions: 320, denied: 4 },
  },
  freshness: { recent_events_seconds: 30 },
  logs: [
    {
      id: 'log-aurora-7',
      service: 'idp_backend',
      severity: 'info',
      message: 'Authorization code issued',
      reference: 'evt-7c2a',
      occurred_at: '2026-06-28T14:31:50Z',
    },
  ],
  traces: {
    status: 'unavailable',
    reason: 'No tracing backend configured',
    next_step: 'Configure an OTLP exporter',
    last_seen_trace_id: null,
  },
}))
```

3. [ ] Create the masked retention fixture route `test/fixtures/ssr-leak/server/routes/api/admin/audit/retention.get.ts` (FULL code):

```ts
// SSR token-leak fixture: a representative MASKED retention status so the §3.3
// gate renders /observability/compliance in its READY state and the payload
// collectors cover the RetentionResponse DTO. No token/secret/PII-digit run.
import { defineEventHandler } from 'h3'

export default defineEventHandler(() => ({
  retention: {
    generated_at: '2026-06-28T14:32:15Z',
    items: [
      {
        category: 'authentication_audit_events',
        label: 'Authentication audit events',
        window: { days: 90 },
        cutoff: '2026-03-30T00:00:00Z',
        schedule: 'daily',
        candidate_count: 3,
        last_pruned_at: '2026-06-28T00:10:00Z',
        last_pruned_count: 12,
      },
      {
        category: 'admin_audit_events',
        label: 'Admin audit events',
        window: { days: 365 },
        cutoff: '2025-06-28T00:00:00Z',
        schedule: 'daily',
        candidate_count: 0,
        last_pruned_at: null,
        last_pruned_count: null,
      },
    ],
  },
}))
```

4. [ ] Create the DSR list fixture route `test/fixtures/ssr-leak/server/routes/api/admin/data-subject-requests/index.get.ts` (FULL code) — this fixture mimics the **raw shared backend presenter**: opaque ids PLUS a **non-null free-text PII canary** in `reason`/`reviewer_notes`/`reviewer_subject_id`. The gate then proves the Task-6.4 runtime strip removes them before hydration (a null fixture would still pass even if the strip regressed — the canary makes the gate honest):

```ts
// SSR token-leak fixture: the RAW data-subject-request queue exactly as the SHARED
// backend presenter emits it — opaque subject ids PLUS the free-text reason /
// reviewer_notes / reviewer_subject_id fields. The canary strings below MUST be
// stripped per row by observability.api.listDataSubjectRequests (Task 6.4) before
// the §3.3 gate serializes the page, so they appear in neither the SSR HTML nor
// __NUXT_DATA__. The request_id is a letter-interleaved ULID with no 10/16/18-digit
// run; the page masks subject_id/request_id via formatTechnicalPreview
// (REF-XXXXXXXX). No token/secret.
import { defineEventHandler } from 'h3'

export default defineEventHandler(() => ({
  requests: [
    {
      request_id: '01HX0K7P9MQA2BN4TC6VD8SEFG',
      subject_id: 'sub-dsr-aurora',
      type: 'export',
      status: 'submitted',
      // Free-text PII canary — MUST be stripped at runtime, proven absent below.
      reason: 'SSR_PII_CANARY Budi Santoso budi@example.gov',
      reviewer_subject_id: 'sub-reviewer-canary',
      reviewer_notes: 'SSR_PII_CANARY internal note',
      submitted_at: '2026-06-27T09:00:00Z',
      reviewed_at: null,
      fulfilled_at: null,
      sla_due_at: '2026-07-27T09:00:00Z',
    },
  ],
}))
```

5. [ ] Add the failing gate assertions to `test/ssr-token-leak.gate.spec.ts`. After the existing `fetchClientDetail` helper, add the two fetch helpers:

```ts
function fetchObservability(): Promise<string> {
  return $fetch('/observability')
}

function fetchCompliance(): Promise<string> {
  return $fetch('/observability/compliance')
}
```

Then add three `it` blocks inside the same `describe` (after the clients blocks, before the negative-control tripwire test). The sentinel session carries no observability ids, so these stay strict (`allowSessionId` defaults to `false`):

```ts
  it('renders the observability + compliance pages server-side in their ready (masked) state', async () => {
    const cockpit = await fetchObservability()
    expect(cockpit).toContain('data-admin-shell')
    // The summary rendered the READY state (service name + folio timestamp verbatim).
    expect(cockpit).toContain('IdP Backend')
    expect(cockpit).toContain('2026-06-28T14:32:15Z')

    const compliance = await fetchCompliance()
    expect(compliance).toContain('data-admin-shell')
    // Retention rendered READY ...
    expect(compliance).toContain('Authentication audit events')
    // ... and the DSR queue masked the opaque subject id through formatTechnicalPreview
    // (REF-SRAURORA is 'sub-dsr-aurora' normalized + sliced to its last 8 chars).
    expect(compliance).toContain('REF-SRAURORA')
  })

  it('does not leak token/PII/secret values into the observability/compliance SSR HTML', async () => {
    const cockpit = await fetchObservability()
    const compliance = await fetchCompliance()
    expect(collectSecretLeaks(cockpit, 'observability SSR HTML')).toEqual([])
    expect(collectSecretLeaks(compliance, 'compliance SSR HTML')).toEqual([])
  })

  it('does not leak token/PII/secret values into the observability/compliance hydration payload', async () => {
    for (const html of [await fetchObservability(), await fetchCompliance()]) {
      const serialized = JSON.stringify(JSON.parse(extractPayload(html)))
      expect(collectSecretLeaks(serialized, 'observability __NUXT__ payload')).toEqual([])
      expect(collectPiiShapeLeaks(serialized, 'observability __NUXT__ payload')).toEqual([])
    }
  })

  it('strips the DSR free-text PII canary from the compliance SSR HTML and hydration payload (proves the Task-6.4 runtime strip, not a null fixture)', async () => {
    // The DSR fixture row carries a NON-null reason/reviewer_notes/reviewer_subject_id
    // canary (the shared presenter emits them). The service maps each row to the
    // narrowed DTO at runtime, so the free-text reaches neither the SSR HTML nor
    // __NUXT_DATA__ — a null fixture would pass even if that strip regressed, so the
    // canary keeps the gate honest. (The token-name + digit-run collectors are
    // structurally blind to free-text PII; these literal checks close that gap.)
    const compliance = await fetchCompliance()
    const payload = JSON.stringify(JSON.parse(extractPayload(compliance)))
    for (const haystack of [compliance, payload]) {
      expect(haystack).not.toContain('SSR_PII_CANARY')
      expect(haystack).not.toContain('Budi Santoso')
      expect(haystack).not.toContain('budi@example.gov')
      expect(haystack).not.toContain('internal note')
      expect(haystack).not.toContain('sub-reviewer-canary')
    }
  })
```

6. [ ] Run the gate — expect **FAIL** at first. On a stale `.output` the new fixture routes 404 and the sentinel principal lacks `admin.observability.read`, so `/observability*` render `forbidden`/`error` → `IdP Backend`, `Authentication audit events`, and `REF-SRAURORA` are absent → the new `it` block fails on the positive `ready` assertions:
   `npm run test -- test/ssr-token-leak.gate.spec.ts`
   Expected: the new `renders the observability + compliance pages ... ready (masked) state` test FAILS (`expect(received).toContain('IdP Backend')` — received is the forbidden/error shell); the existing dashboard/users/clients tests still PASS.

7. [ ] Confirm the fixture pre-build picked up the new routes (the `me.get.ts` grant + the three new `*.get.ts` files), then re-run — expect **PASS** (both pages render `ready`; no token/secret/PII-shape in HTML or payload; the DSR subject id is masked to `REF-SRAURORA`):
   `npm run test -- test/ssr-token-leak.gate.spec.ts`
   Expected: `Test Files 1 passed`, all `it` blocks green including the negative-control tripwire.

8. [ ] Commit the gate extension:
   `git add test/fixtures/ssr-leak/server/routes/api/admin/observability/ test/fixtures/ssr-leak/server/routes/api/admin/audit/ test/fixtures/ssr-leak/server/routes/api/admin/data-subject-requests/ test/fixtures/ssr-leak/server/routes/api/admin/me.get.ts test/ssr-token-leak.gate.spec.ts && git commit -m "$(printf 'test(sso-admin-frontend): extend SSR leak gate to observability + compliance DTOs\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"`

9. [ ] Create the Nuxt-4 observability e2e at `e2e/observability.spec.ts` (FULL code). Covers the four required high-risk flows (quality §11): critical navigation via the legacy redirects, the forbidden flow, the audit-export blob download (filename from the backend `Content-Disposition`), and the export step-up failure (safe copy + redacted `REF-`, no raw trace, no download). Selectors use the standard labels shipped by Tasks 6.8/6.9/6.11 — the audit-export trigger is the `Export` button (`observability.btn_export`), the evidence-pack trigger is `Generate evidence pack` (`observability.btn_generate_pack`), and the privileged-action confirm is the `Confirm` button (`common.btn_confirm`) on the reused `PrivilegedActionDialog`; if a label drifts from the shipped component, fix the **selector** (not the page) to match the standard label:

```ts
import { expect, test } from '@playwright/test'

// useI18n resolves locale from the `admin_locale` cookie at SSR time (DEFAULT_LOCALE='id');
// set it so SSR renders English and the English-label selectors below match (mirrors e2e/users.spec.ts).
test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: 'admin_locale', value: 'en', url: baseURL! }])
})

// Admin principal WITH observability + audit-export + DSR-review capability.
const principal = {
  principal: {
    subject_id: 'sub_admin',
    email: 'admin@dev-sso.local',
    display_name: 'Admin User',
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
      manage_sessions: false,
      permissions: ['admin.dashboard.view', 'admin.observability.read', 'admin.audit.export', 'admin.dsr.review'],
      capabilities: {
        'admin.dashboard.view': true,
        'admin.observability.read': true,
        'admin.audit.export': true,
        'admin.dsr.review': true,
      },
      menus: [
        { id: 'dashboard', label: 'Dashboard', required_permission: 'admin.dashboard.view', visible: true },
        { id: 'observability', label: 'Observability', required_permission: 'admin.observability.read', visible: true },
      ],
    },
  },
}

// Admin principal WITHOUT admin.observability.read (forbidden-flow case).
const principalNoObservability = {
  principal: {
    ...principal.principal,
    permissions: {
      view_admin_panel: true,
      manage_sessions: false,
      permissions: ['admin.dashboard.view'],
      capabilities: { 'admin.dashboard.view': true },
      menus: [
        { id: 'dashboard', label: 'Dashboard', required_permission: 'admin.dashboard.view', visible: true },
      ],
    },
  },
}

const summary = {
  generated_at: '2026-06-28T14:32:15Z',
  partial: false,
  degraded: [],
  services: [
    { key: 'idp_backend', name: 'IdP Backend', status: 'healthy', summary: 'All checks passing', latency_p95_ms: 84, freshness_seconds: 12 },
  ],
  metrics: { window_seconds: 86400, queue: { pending_jobs: 2, failed_jobs: 0, oldest_pending_age_seconds: 9 }, auth_funnel: { attempts: 1840, succeeded: 1795, denied: 45 }, admin_activity: { actions: 320 } },
  freshness: { recent_events_seconds: 30 },
  logs: [{ id: 'log-aurora-7', service: 'idp_backend', severity: 'info', message: 'Authorization code issued', reference: 'evt-7c2a', occurred_at: '2026-06-28T14:31:50Z' }],
  traces: { status: 'unavailable', reason: 'No tracing backend configured', last_seen_trace_id: null },
}

const retention = {
  generated_at: '2026-06-28T14:32:15Z',
  items: [
    { category: 'authentication_audit_events', label: 'Authentication audit events', window: { days: 90 }, cutoff: '2026-03-30T00:00:00Z', schedule: 'daily', candidate_count: 3, last_pruned_at: '2026-06-28T00:10:00Z', last_pruned_count: 12 },
  ],
}

const dsr = {
  request_id: '01HX0K7P9MQA2BN4TC6VD8SEFG',
  subject_id: 'sub-dsr-aurora',
  type: 'export',
  status: 'submitted',
  reason: null,
  reviewer_subject_id: 'sub-reviewer-atlas',
  reviewer_notes: null,
  submitted_at: '2026-06-27T09:00:00Z',
  reviewed_at: null,
  fulfilled_at: null,
  sla_due_at: '2026-07-27T09:00:00Z',
}

async function mockMe(page, body) {
  await page.route('**/api/admin/me', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) })
  })
}

async function mockObservabilityData(page) {
  await page.route('**/api/admin/observability/summary', async (route) => {
    await route.fulfill({ contentType: 'application/json', headers: { 'x-request-id': 'req-obs-e2e' }, body: JSON.stringify(summary) })
  })
  await page.route('**/api/admin/audit/retention', async (route) => {
    await route.fulfill({ contentType: 'application/json', headers: { 'x-request-id': 'req-obs-e2e' }, body: JSON.stringify({ retention }) })
  })
  await page.route('**/api/admin/data-subject-requests*', async (route) => {
    await route.fulfill({ contentType: 'application/json', headers: { 'x-request-id': 'req-obs-e2e' }, body: JSON.stringify({ requests: [dsr] }) })
  })
}

test('legacy redirects: /audit → /observability and /audit/compliance → /observability/compliance', async ({ page }) => {
  await mockMe(page, principal)
  await mockObservabilityData(page)

  await page.goto('/audit')
  await expect(page).toHaveURL(/\/observability$/u)
  await expect(page.getByRole('navigation', { name: 'Admin modules' })).toContainText('Observability')
  await expect(page.getByText('IdP Backend')).toBeVisible()

  await page.goto('/audit/compliance')
  await expect(page).toHaveURL(/\/observability\/compliance$/u)
  await expect(page.getByText('Authentication audit events')).toBeVisible()
  await expect(page.getByText(/Bearer|access_token|SQLSTATE/u)).toHaveCount(0)
})

test('forbidden flow: admin without admin.observability.read sees the safe forbidden surface', async ({ page }) => {
  await mockMe(page, principalNoObservability)

  await page.goto('/observability')
  await expect(page).toHaveURL(/\/forbidden$/u)
  await expect(page.getByRole('navigation', { name: 'Admin modules' })).not.toContainText('Observability')
  await expect(page.getByText(/Bearer|access_token|SQLSTATE/u)).toHaveCount(0)
})

test('audit export: privileged blob download yields a file with the backend Content-Disposition filename', async ({ page }) => {
  await mockMe(page, principal)
  await mockObservabilityData(page)
  await page.route('**/api/admin/audit/export*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/csv',
      headers: {
        'content-disposition': 'attachment; filename="admin-audit-events-2026-06-28.csv"',
        'x-request-id': 'req-export-e2e',
      },
      body: 'event_id,action,outcome\nAUD01,admin.user.lock,succeeded\n',
    })
  })

  await page.goto('/observability/compliance')

  // Export is a privileged action: open the confirm dialog (no API), then Confirm runs getBlob.
  await page.getByRole('button', { name: 'Export' }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Confirm' }).click()
  const download = await downloadPromise
  // The download attribute is set from the backend Content-Disposition filename.
  expect(download.suggestedFilename()).toBe('admin-audit-events-2026-06-28.csv')
  await expect(page.getByText(/Bearer|access_token|SQLSTATE/u)).toHaveCount(0)
})

test('audit export: a step-up (428) failure surfaces safe copy + redacted REF and triggers no download', async ({ page }) => {
  await mockMe(page, principal)
  await mockObservabilityData(page)
  let downloadFired = false
  page.on('download', () => {
    downloadFired = true
  })
  await page.route('**/api/admin/audit/export*', async (route) => {
    await route.fulfill({
      status: 428,
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-stepup-e2e' },
      body: JSON.stringify({ error: 'step_up_required', message: 'raw ACR failure trace', step_up_url: '/step-up-required' }),
    })
  })

  await page.goto('/observability/compliance')

  await page.getByRole('button', { name: 'Export' }).click()
  await page.getByRole('button', { name: 'Confirm' }).click()
  // The shipped affordance is the "Re-authenticate" re-auth LINK (observability.btn_step_up)
  // pointing at the backend step_up_url — assert the link + its href, NOT invented
  // "step-up/MFA assurance" copy that no component renders. Plus the redacted REF;
  // never the raw backend trace, never a file.
  const reauth = page.getByRole('link', { name: 'Re-authenticate' })
  await expect(reauth).toBeVisible()
  await expect(reauth).toHaveAttribute('href', '/step-up-required')
  await expect(page.getByText('REF-TEPUPE2E').first()).toBeVisible()
  await expect(page.getByText('raw ACR')).toHaveCount(0)
  expect(downloadFired).toBe(false)
})

test('DSR review: a step-up (428) failure surfaces the re-auth link to step_up_url with no list refresh', async ({ page }) => {
  await mockMe(page, principal)
  await mockObservabilityData(page)
  let reviewCalls = 0
  await page.route('**/api/admin/data-subject-requests/*/review', async (route) => {
    reviewCalls += 1
    await route.fulfill({
      status: 428,
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-dsr-stepup' },
      body: JSON.stringify({ error: 'step_up_required', message: 'raw ACR failure trace', step_up_url: '/step-up-required' }),
    })
  })

  await page.goto('/observability/compliance')

  // Open the review drawer from the submitted DSR row, approve, add notes, confirm.
  await page.getByRole('button', { name: 'Review' }).first().click()
  await page.getByRole('button', { name: 'Approve' }).click()
  await page.getByLabel('Reviewer notes').fill('Verified subject identity per policy')
  await page.getByRole('button', { name: 'Confirm' }).click()

  // The shipped DSR step-up affordance is the "Re-authenticate to continue" LINK
  // (observability.dsr_step_up_label) to the backend step_up_url — assert the link
  // + href, plus the redacted REF; never the raw trace.
  const reauth = page.getByRole('link', { name: 'Re-authenticate to continue' })
  await expect(reauth).toBeVisible()
  await expect(reauth).toHaveAttribute('href', '/step-up-required')
  await expect(page.getByText('REF-SRSTEPUP').first()).toBeVisible()
  await expect(page.getByText('raw ACR')).toHaveCount(0)
  // The review POST was attempted once and failed; the list is NOT refreshed on failure.
  expect(reviewCalls).toBe(1)
})
```

9b. [ ] Delete the obsolete legacy e2e — `/audit` now redirects to `/observability` and the new spec covers the redirects + flows, so the old Vue-SPA tabbed-audit spec would only break the suite:
    `git rm e2e/audit.spec.ts`

10. [ ] Run the observability e2e — expect **PASS** once the pages from 6.8/6.9/6.11 are built (this task runs last in the phase, so they exist). If a selector label drifts from the built component, fix the selector (not the page) to match the shipped standard label:
    `npm run test:e2e -- e2e/observability.spec.ts`
    Expected: 5 tests passed (redirects, forbidden, export download, export step-up 428, DSR-review step-up 428).

11. [ ] Commit the e2e (the `git rm` from step 9b is already staged, so this commit also records the legacy-spec removal):
    `git add e2e/observability.spec.ts && git commit -m "$(printf 'test(sso-admin-frontend): Nuxt-4 observability e2e + remove obsolete Vue-SPA audit e2e\n\nRedirects, forbidden flow, audit-export blob download, and export +\nDSR-review step-up (428) re-auth-link flows. Delete e2e/audit.spec.ts\n(/audit now redirects to /observability; the new spec supersedes it).\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"`

12. [ ] Run the **full Definition-of-Done gate** from `services/sso-admin-frontend` (each must PASS; if any command is blocked by the environment, report exactly which command and why — never claim PASS for a command that did not run). `npm run lint` runs BOTH `lint:oxlint` (`oxlint .`) AND `lint:eslint` (`eslint "app/**/*.vue"`) — both must pass:
    - `npm run typecheck`
    - `npm run lint`
    - `npm run format:check` (run `npm run format` first if it flags the new fixture/spec files, then re-check)
    - `npm run test`
    - `npm run build`
    - `npm run test:e2e`

13. [ ] If `format` rewrote any file in step 12, commit the formatting:
    `git add -A && git commit -m "$(printf 'style(sso-admin-frontend): format observability phase test fixtures + e2e\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"`

**Task DoD (run from `services/sso-admin-frontend`):** `npm run typecheck && npm run lint && npm run format:check && npm run test && npm run build`, plus `npm run test:e2e` — all green (or any blocked command reported explicitly, never claimed PASS), with **both** `lint:oxlint` and `lint:eslint` passing, the SSR leak gate proving the observability summary + retention + DSR DTOs (small aggregates + opaque, masked ids) leak no token/secret/raw-PII into the SSR HTML or `__NUXT_DATA__`, and the Playwright e2e proving the `/audit*` redirects, the forbidden flow, the audit-export blob download (backend `Content-Disposition` filename), and the export step-up failure (safe copy + redacted `REF-`, no download).


---

## Phase 6 Definition of Done

- [ ] DTO + pure resolvers (observability/compliance view-state + status-tone) + pure query builders/evidence-pack validation/DSR list helpers + client-only blob trigger + service + proxy allow-list/binary-passthrough + composables (summary/retention/DSR) + summary components + cockpit page + export/evidence-pack panel + DSR queue/review-fulfill + compliance console page + SSR-leak/e2e gate all implemented test-first (Tasks 6.1–6.12), each committed green.
- [ ] **Full gate green** from `services/sso-admin-frontend`: `npm run typecheck` (0 errors), `npm run lint` (0 errors — **BOTH** `lint:oxlint` (`oxlint .`) AND `lint:eslint` (`eslint "app/**/*.vue"`) pass), `npm run format:check`, `npm run test`, `npm run build` — all PASS (any blocked command reported explicitly, never claimed PASS).
- [ ] **SSR token-leak gate extended** (Task 6.12) to cover the **observability summary + retention + DSR DTOs**: safe already-masked DTOs only (small aggregates + opaque, masked ids; `subject_id` opaque, no email/NIK/NIP/NISN/name; the DSR list's free-text `reason`/`reviewer_notes`/`reviewer_subject_id` stripped at runtime by `observability.api.listDataSubjectRequests` (Task 6.4) and proven absent via a **non-null free-text PII canary fixture**, since the token-name + digit-run collectors are structurally blind to free-text PII), with **no** access/refresh/ID token (value or field name), session/client secret, raw NIK(16)/NIP(18)/NISN(10) digit run, raw backend exception, or `SSR_LEAK_CANARY` in the SSR HTML or `__NUXT__`/`__NUXT_DATA__`; new fixture routes + leak-assertion `it()`s mirror the dashboard/users blocks and assert `.toEqual([])`.
- [ ] **Export/evidence-pack blob-download discipline verified**: both downloads fetched via `observabilityApi.exportAuditTrail`/`generateEvidencePack` → `apiClient.getBlob` (filename from `Content-Disposition`, format-derived fallback), triggered **client-side only** by `triggerBlobDownload` (`import.meta.client`-guarded, no-op during SSR), each treated as an **export privileged action** (confirm + impact summary + step-up notice; primary disabled until confirmation valid; cancel calls no API; loading/disabled reset after error), and the blob **never** persisted to `useState`/Pinia/`localStorage`/`sessionStorage`/`IndexedDB`/query/hash/console — consumed and discarded in the same client tick, never in the SSR payload. The Nitro proxy binary passthrough (`Content-Type`/`Content-Disposition`) is asserted, not assumed.
- [ ] **Privileged-action test matrix applied to every export + DSR review/fulfill action** (audit export, evidence-pack, DSR approve/reject, DSR fulfill dry-run/commit): allowed/403/401/419/429/422/step-up(428, surfacing `step_up_url`)/5xx + no-stale-state, with destructive-confirm (impact visible before submit, cancel calls no API, success shows no secret/PII excess) and per-feature permission tests, plus **step-up enforced** on all four write/export routes (`:step_up`, `ADMIN_PANEL_STEP_UP_AUTH_SECONDS` default 900s) and `EnsureAdminMfaAssurance` on every endpoint; export/evidence-pack gated on `admin.audit.export`, DSR review/fulfill gated on `admin.dsr.review` (hidden when absent, backend re-checks regardless). After any DSR action the list is **explicitly refreshed**, never left stale.
- [ ] **`/audit` → `/observability` and `/audit/compliance` → `/observability/compliance` redirects** confirmed (route-map test; page-based `navigateTo({ name }, { replace: true })`), using named route refs (`admin.observability`/`admin.observability.compliance`), never hardcoded path strings.
- [ ] **id ↔ en locale parity** holds for the `observability.*` catalog (adapted/renamed from the legacy `audit.*` block, ~100 keys) and any touched `common.*` — no parity drift; genuinely-new keys added to BOTH `app/locales/id.json` and `app/locales/en.json`; no legacy traceability markers (`UC-65`/`ISS-*`) carried forward.
- [ ] **Observability + compliance e2e flow green** (`npm run test:e2e`): nav, the `/audit*` redirects, the forbidden flow, the audit-export blob download (backend `Content-Disposition` filename), and the export step-up failure (safe copy + redacted `REF-`, no download).
- [ ] Swiss discipline upheld: tokens-only, hairline (no shadow as structure), single accent `#002FA7`, `danger #E4002B` reserved for **genuinely destructive surfaces only** (down/failed status, DSR reject, DSR fulfill-commit) and critical-status badges (always paired with a text label, never colour-alone) — the **export confirm/impact/step-up stays accent/warning, NEVER danger red**; status never colour-alone, `--font-mono` only for raw IDs/correlation values; **folio numerals** (record counts `02 / 14`, timestamps, correlation/request/SID/subject IDs) visible on the load-bearing folio surfaces (table headers, log-event rows, DSR rows, drawer margins) via `UiFolio`. The DSR queue masks every raw subject id/PII field (`subject_id` rendered as `REF-<last8>`; `reason`/`reviewer_notes`/`reviewer_subject_id` stripped from the list projection at runtime — Task 6.4 — never surfaced).
- [ ] The `feat/admin-frontend-nuxt4-ssr-swiss-redesign` branch **stays off `main` until the Phase 18 cutover** — Phase 6 merges into the feature branch only.
