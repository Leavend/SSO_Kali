# Phase 5 — Clients (OIDC relying-party registrations) Implementation Plan

**For agentic workers — REQUIRED SUB-SKILL:** Execute this plan with `superpowers:executing-plans`, and for **every** task below invoke `superpowers:test-driven-development` (RED → GREEN → REFACTOR). Never write implementation code before a failing test exists; never claim PASS without running the exact command and reading its output (`superpowers:verification-before-completion`).

## Goal

Port the admin **Clients** governance domain — registration and lifecycle of every OIDC/OAuth2 relying party — to the Nuxt 4 (full SSR) + Swiss stack on branch `feat/admin-frontend-nuxt4-ssr-swiss-redesign`. Clients is the operator console for the IdP's relying-party population: list / search / detail of every registered client merged with staged integrations, create (with multi-rule redirect/scope/category validation), per-client metadata + redirect-URI-policy + scope-policy edit, **secret rotation**, and the full integration lifecycle (stage → activate → disable → decommission → delete). The acceptance bar is **behavioral + visual parity** with the existing Vue-SPA Clients feature plus the backend's complete endpoint surface, implemented test-first.

The defining hazard of this domain is the **one-time client secret**: `POST /client-integrations` (create, confidential only) and `POST /clients/{id}/rotate-secret` return a **plaintext** `client_secret`. It is displayed **once** in a modal, **never** persisted to Pinia / `useState` / storage / `localStorage`, **never** logged, cleared on modal close, and — because it is a secret — **never** allowed into the SSR HTML or `__NUXT__` payload. These plaintext values arrive **only** as the body of a client-initiated POST (button click), never via SSR hydration; the list and detail DTOs carry only a `has_secret_hash` boolean, never the secret.

Every page implements the six states (loading · unauthenticated · forbidden · error · empty · ready); empty distinguishes "no data" from "no permission"; every write/destructive action runs through the **one** shared privileged-action infrastructure delivered in Phase 4 (`app/lib/users/privileged-action.ts`, `usePrivilegedAction`, `PrivilegedActionDialog`) that handles confirmation + impact summary + the full `401/403/419/422/428/429/5xx` + fresh-auth/step-up matrix.

## Architecture

Request/data flow (server-side during SSR, re-used on client navigation):

```
pages/clients/index.vue
  ├─ useAsyncData('admin-clients-principal', () => sessionStore.ensureSession())   // safe masked principal
  └─ useClientsList()                                                              // SSR data boundary (list)
        └─ useAsyncData('admin-clients-list', async () => {
              const [list, regs] = await Promise.all([clientsApi.list(), clientsApi.registrations()])
              return { clients: mergeClients(list.clients, regs.registrations), requestId: getLastRequestId() }
           })
              └─ clientsApi → apiClient.get('/api/admin/clients')                  // same-origin, credentials:'include'
                    └─ Nitro server/routes/api/admin/[...].ts → handleAdminApiProxy
                       (inject Bearer from event.context, rewrite /api/admin/* → /admin/api/*)

pages/clients/[clientId].vue
  └─ useClientDetail(clientId) → useAsyncData('admin-client-detail:'+id, () => clientsApi.show(id))
        ├─ ClientMetadataForm / ClientUriPolicyForm / ClientScopePolicyForm  → clientsApi.update / syncScopes
        ├─ ClientSecretRotation → clientsApi.rotateSecret → ClientSecretReveal (one-time, client-only ref)
        └─ ClientLifecycleActions → clientsApi.activate / disable / decommission / delete
              └─ usePrivilegedAction() + PrivilegedActionDialog (Phase 4, reused as-is)
                    → on success: useClientDetail.refresh()  (explicit, never stale)

pages/clients/new.vue
  └─ FormPageShell + FormSection + UiFormField  → usePrivilegedAction() → clientsApi.create()
        └─ on success (confidential): ClientSecretReveal (one-time, client-only ref) → navigateTo(detail) on close
```

- **Pure logic** (no Nuxt, no network) lives under `app/lib/clients/`: DTO-agnostic view-state + status-tone (`clients-view-state.ts`), the registry/registration merge + client search/filter/pagination (`clients-list.ts`), create-form + URI-policy + scope-catalog validation (`client-create-form.ts`), the action descriptor table (`client-actions.ts`), and the plaintext-secret extraction fallback (`client-secret.ts`). This mirrors the Phase-4 users pure-resolver split so every matrix is unit-testable without a Nuxt context.
- **Service** `app/services/clients.api.ts` is the single network seam (copy-and-adapt of `app/services/users.api.ts`).
- **Composables** `app/composables/useClientsList.ts`, `app/composables/useClientDetail.ts`, `app/composables/useScopeCatalog.ts` wrap `useAsyncData`; the privileged-action mutation runner `usePrivilegedAction` is **reused from Phase 4, not rebuilt**.
- **Components** under `app/components/clients/`: `ClientsTable.vue` (domain table over `UiDataList`), `ClientSecretReveal.vue` (the one-time-secret modal), `ClientMetadataForm.vue`, `ClientUriPolicyForm.vue`, `ClientScopePolicyForm.vue`, `ClientSecretRotation.vue`, `ClientLifecycleActions.vue`. The destructive-confirm dialog is the Phase-4 `app/components/users/PrivilegedActionDialog.vue`, **reused as-is**.
- **State surfaces** reuse the Swiss DS: `UiSkeleton` (loading), `UiStatusView` (forbidden / unauthenticated / error / step-up, with built-in request-ref redaction), `UiEmptyState` (no data), `UiStatusBadge` (client status + category, never colour-alone), `UiFolio` (record counts, timestamps, the client id as a folio composition element).
- **Backend stays the security boundary.** `admin-guard.global.ts` gates routes by role + meta permissions; every page additionally renders a safe forbidden/step-up surface if the backend rejects despite the UI.
- **Net-new deep-link, deliberate (mirrors Phase 4 users):** the legacy SPA had **no** detail route — detail was a master/detail drawer with no URL (extract-legacy §6, §11 anti-pattern). This phase adds a real, deep-linkable `app/pages/clients/[clientId].vue` (`admin.clients.read`), exactly as Phase 4 added `users/[subjectId]`. The spec route table (§5) lists only `/clients` + `/clients/new`; the detail route is the same UX-minimization-preserving improvement Phase 4 shipped.
- **Out of scope (backend does not expose on Clients routes):** per-user entitlement grant/revoke (`OidcClientEntitlement` rows have **no** admin endpoint in `admin.php` — extract-backend §"CATEGORY & ENTITLEMENT"); only the per-client `category` field is editable. The consent-trail link to the observability/compliance domain is a `RouterLink`, not a Clients endpoint. There is **no** Pinia clients store — list/detail state is `useAsyncData`-owned (the legacy `clients.store.ts` `rotationSecret`/`createdClientIntent` persistence is an anti-pattern the rewrite drops: the plaintext secret lives only in a client-only component `ref`).
- **Live integration contract / preview is deferred this phase:** the live contract/integration-preview (`authorizeUrl`/`tokenUrl`/`userinfoUrl`/`issuer` + provisioning/rollout steps + findings) is **not** built here — no page, composable, or component consumes it. The create/rotate one-time reveal instead shows a **locally-built** env snippet (`buildClientEnvSnippet`, Task 5.9), so `clientsApi.contract` (`POST /api/admin/client-integrations/contract`) is intentionally **NOT** implemented. Revisit if a guided integration-preview surface is scoped in a later phase.

## Tech Stack

- **Nuxt 4** (`ssr: true`, universal), **Vue 3.5** SFC, **TypeScript strict**.
- **Pinia** (`admin-session` store — existing; consumed read-only for principal + `hasPermission`/`hasEveryPermission`).
- **Data:** `useAsyncData` + typed `apiClient` over `$fetch`/`useRequestFetch` (`app/lib/api/api-client.ts`, `ApiError` with `status`/`code`/`requestId`/`payload`, `getLastRequestId()`).
- **UI:** Swiss DS components in `app/components/ui/*` + `app/components/form/*`, `lucide-vue-next` icons, Tailwind v4 + `assets/tokens.css` Swiss tokens. Reka UI keeps a11y primitives (`UiDialog`/`UiAlertDialog`).
- **i18n:** `app/composables/useI18n.ts` (`id` default, `en`), catalogs `app/locales/{id,en}.json` — `clients.*` already has a full 141-key namespace in both files (leftover from the SPA); **REUSE `clients.*`, do not add the empty `client.*` singular namespace**; ADD only genuinely-new keys, to BOTH files, keeping id↔en parity.
- **Tests:** Vitest 4 (`npm run test` = `vitest run`); `@nuxt/test-utils/runtime` (`mountSuspended`, `renderSuspended`, `mockNuxtImport`) for `*.nuxt.spec.ts` (auto-routed to the `nuxt` env by filename); `@vue/test-utils` + jsdom for plain `*.spec.ts`; `@nuxt/test-utils/e2e` for the SSR leak gate; Playwright for the Clients e2e (`npm run test:e2e`). Every `vi.fn` carries a type parameter; service mocks use `vi.mock('@/services/clients.api', …)`; the SSR gate uses single-arg `expect(value).toEqual([])`.

## Global Constraints

Binding values for every task. A task is **not done** if any is violated.

- **Full SSR** (`ssr: true`): principal + list + detail resolve **server-side** (no client bootstrap flash). `useAsyncData` settles before the payload is serialized.
- **SSR token-leak guard (design §3.3, mandatory):** under universal SSR, server-fetched data is serialized into `window.__NUXT__` / `__NUXT_DATA__`. Tokens, session secrets, **the client secret**, and raw PII must **never** enter the SSR HTML or the hydrated payload. Tokens live only in Nitro `event.context`, read per request from the encrypted session cookie and injected into upstream calls server-side. Only **safe, already-masked DTOs and safe principal fields** (display name, role, capability booleans, menus) hydrate to the client. **FORBIDDEN in SSR HTML / `__NUXT_DATA__`:** access/refresh/ID tokens (values + field names `accessToken|refreshToken|idToken|access_token|refresh_token|id_token`), session/client secrets (incl. the field names `client_secret`/`clientSecret`), any credential; raw NIK(16)/NIP(18)/NISN(10) digit runs; raw backend exceptions; known secret env values. **Allowed to hydrate:** safe already-masked DTOs (the list/detail DTOs expose only `has_secret_hash`, never a secret); safe principal fields (display name, role, capability booleans, menus). `test/ssr-token-leak.gate.spec.ts` is **extended** this phase to cover the client list + detail DTOs and to add a `client_secret` sentinel value + `client_secret`/`clientSecret` field-name check to `collectSecretLeaks`.
- **One-time-secret discipline (BINDING, design §3 items 2 & 5 — non-negotiable):**
  - The plaintext `client_secret` (from create-confidential + rotate-secret) displays **once**, in the browser, for that single modal only.
  - It is held only in a **client-only component `ref`** (never `useState`, never Pinia, never `localStorage`/`sessionStorage`/`IndexedDB`, never a query string/hash) — so it is never part of the SSR payload.
  - It is **cleared on modal close** (the ref is nulled); a dedicated test asserts the secret is absent from the DOM after close.
  - It is **never logged** (no `console.log`/`console.error` of the secret), never re-fetchable, and the create/rotate responses carry `Cache-Control: no-store`.
  - The reveal modal shows an **explicit warning** before reveal/copy; the **copy action is tested**.
  - If the backend exposes a **masked** value, only the masked value is retained; the list/detail DTOs carry only `has_secret_hash` ("stored"/"not available"), never the secret.
  - Forbidden (quality §14): `one-time secret kept in Pinia after modal/page closes`. The legacy `clients.store.ts` `rotationSecret`/`createdClientIntent` persistence is **not** carried forward.
- **No browser token handling:** no access/refresh/ID token, **client secret**, or credential is created, exchanged, read, stored, or logged in the browser beyond the single one-time reveal above. The SPA is token-blind; the Admin BFF (`admin-proxy.ts`) injects the Bearer server-side. No OAuth code/token exchange in the browser.
- **Same-origin session only:** admin calls use same-origin relative paths (`/api/admin/clients…`, `/api/admin/client-integrations…`, `/api/admin/scopes`) and the encrypted session cookie (`credentials:'include'`, `Accept: application/json`); no token headers minted in the browser; URLs are not built from free input without boundary validation.
- **Split path scheme (load-bearing, asserted in the proxy + service specs):** read/update/scope-sync/delete/rotate use `/api/admin/clients*`; create/stage/activate/disable/decommission/registrations use `/api/admin/client-integrations*`. New clients are created via `POST /api/admin/client-integrations` — there is **no** `POST /api/admin/clients`.
- **No direct `fetch`/`$fetch` in pages or components** — the network is reached only through `clientsApi` (the service) via `apiClient`.
- **Swiss design discipline:** tokens-only (no hard-coded colours), **no shadows** as structure (1px hairline `--border #E5E5E7`), radius ~0–2px, **single accent `--accent #002FA7`** (interactive/brand), red `--danger #E4002B` used **only** as functional/destructive (disable, decommission, delete, rotate-secret warning) and on critical-security status badges — always paired with a text label, **never colour-alone**, never brand; status **never colour-alone** (tone + label/shape via `UiStatusBadge`). `--font-sans` (`'Söhne','Helvetica Neue',Helvetica,Arial,sans-serif`) is the single family; **`--font-mono` reserved ONLY for raw IDs/correlation values** (the `client_id`, request/correlation ids). **Folio numerals (the §7.3 differentiator, must be visible in rendered output):** record counts (`02 / 14`), timestamps, and the client id render as condensed-sans folio composition elements anchored to a visible 1px hairline grid via `UiFolio`. Standard labels/copy only ("Clients", "Save", "Cancel", "Export", "Next") — no themed copy, mono-caps filler subtitles, `//` kickers, unicode-glyph icons (use Lucide), or fabricated telemetry/personas; mock rows in tests read clearly as samples.
- **Permission-aware (route + nav + action):** page meta declares `permissions` per the route map; `admin-guard.global.ts` enforces role + permission (ensure principal, `hasAdminRole`, `hasEveryPermission`, redirect `/forbidden`; map bootstrap failures `mfa_enrollment_required → /mfa-required`, `step_up_required → /step-up-required`, unreachable → `/admin-api-unreachable`); each page also handles a backend `401/403/428` defensively. Action visibility is gated by `sessionStore.hasPermission(...)`. Permission strings follow the backend contract **verbatim** — never ad-hoc:

  | Path | Page | meta `permissions` | Write/destructive actions on the surface (permission · freshness window) |
  |---|---|---|---|
  | `/clients` | `pages/clients/index.vue` | `admin.clients.read` | (link to create — gated `admin.clients.write`) |
  | `/clients/[clientId]` | `pages/clients/[clientId].vue` | `admin.clients.read` | metadata edit, URI-policy edit (`admin.clients.write` · `:write`); scope sync (`admin.clients.write` · `:write`); rotate-secret (`admin.clients.write` · `:step_up`); activate/disable/decommission (`admin.clients.write` + `admin.sessions.terminate` · `:step_up`); delete (`admin.clients.write` + `admin.sessions.terminate` · `:step_up`) |
  | `/clients/new` | `pages/clients/new.vue` | `admin.clients.write` | create + stage (`admin.clients.write` · `:step_up`) |

  Backend reads (`GET /clients`, `/clients/{id}`, `/scopes`, `/client-integrations/registrations`) are gated by AdminGuard membership only — the frontend nonetheless gates client reads on the stricter `admin.clients.read` (access-minimization, fail-closed: the SPA renders no client data to an operator the principal does not grant it, even though the backend would allow the read). The `/api/admin/me` principal grants `admin.clients.read` to operators who should see clients — the SSR-leak fixture `me.get.ts` does exactly this. `EnsureAdminMfaAssurance` is on **every** client route (read + write) — it is the MFA-assurance check, distinct from the `EnsureFreshAdminAuth:<window>` step-up. Lifecycle actions match the backend: `destroy`/`activate`/`disable`/`decommission`/`stage` additionally require `RequireAdminSessionManagementRole` + `SESSIONS_TERMINATE`, so their UI gate is `admin.clients.write` **and** `admin.sessions.terminate` (legacy `canManageClientLifecycle`). Internal navigation uses **named route refs** (`admin.clients` / `admin.clients.detail` / `admin.clients.create`), never hardcoded path strings.
- **Privileged-action test matrix (TDD §4 — every write/destructive action; failing tests BEFORE implementation):** 4.1 allowed success · 4.2 missing permission / 403 · 4.3 unauthenticated / 401 · 4.4 CSRF or session expired / 419 (if applicable) · 4.5 rate limit / 429 · 4.6 validation error / 422 · 4.7 fresh-auth / step-up / MFA-assurance required (428/412/`reauth_required`/`step_up_required`, surfaces `step_up_url`) · 4.8 backend 5xx with safe error copy · 4.9 audit/correlation id shown or stored when backend sends it · 4.10 action leaves **no** stale loading/disabled state after an error. Destructive-confirm tests: impact summary (token/session/client-impact warning) visible before submit · primary destructive button disabled until confirmation valid · cancel calls **no** API · success state shows no secret/PII excess. Per-feature permission matrix: unauthenticated → redirect/session-expired · non-admin → forbidden · admin w/o permission → forbidden/action hidden · admin w/ permission → usable · backend 403 despite UI → safe forbidden.
- **HTTP failure set (safe copy, never raw backend exception):** `401`, `403`, `419` (if applicable), `422` (field errors; backend codes `client_integration_invalid` / `client_secret_rotation_invalid`), `429`, `5xx`. Error surfaces show safe copy + a redacted support reference (`REF-XXXXXXXX` via `formatSupportReference`); raw request ids are never rendered.
- **Degraded/stale handling:** after any action, **explicitly refresh** detail/list state (never leave it stale); if a refresh fails but a good snapshot exists, keep it on screen with a stale notice (`isStale = error && list !== null`).
- **Category & entitlement:** `category` is `publik` | `kepegawaian`, **required at the creation boundary** (mirrors backend `ClientIntegrationContractBuilder` so a staff app can never be silently published as public), validated against those two values everywhere writable. The category badge uses `tone='brand'` for `kepegawaian`, neutral otherwise. Per-user entitlement is **backend-enforced and out of scope** — no entitlement-grant UI.
- **No-traceability-markers:** new code must NOT contain `OG#`, `UC###`, `FR###`, `BE-FR###`-style identifiers in names, comments, routes, tests, or config — descriptive domain names only. The FR/UC references in this header are for planning, never source.
- **REUSE Phase-4 infrastructure — do NOT duplicate it (binding):** the privileged-action stack is **domain-agnostic** and is consumed **from its Phase-4 path as-is**, never copied into a `clients/` path:
  - `app/lib/users/privileged-action.ts` — `resolvePrivilegedActionFailure(error: unknown): PrivilegedActionFailure`, `PrivilegedActionStatus`, `PrivilegedActionFailure` (the pure HTTP-error→state matrix). Despite the `users/` path it is domain-agnostic; clients imports it directly.
  - `app/composables/usePrivilegedAction.ts` — `usePrivilegedAction<T>(): { status, isSubmitting, failure, requestId, auditEventId, fieldErrors, stepUpUrl, run, reset }`.
  - `app/components/users/PrivilegedActionDialog.vue` — the async-hold destructive-confirm dialog (parent owns `open`; confirm is NOT an `AlertDialogAction` and stays open through submit; renders only redacted `REF-…`). Used for every clients destructive/async-confirm action.
  - `app/lib/users/user-actions.ts` — `ReasonPolicy`, `isReasonValid(policy, value)` are generic reason helpers imported by `client-actions.ts` (not re-declared).
  All other reuse is **copy-and-adapt** of the named Phase-4 file (swap `users`→`clients`, `subjectId`→`clientId`, `usersApi`→`clientsApi`): `users-view-state.ts`, `users-list.ts`, `users.api.ts`, `useUsersList.ts`, `useUserDetail.ts`, `UsersTable.vue`, `users/index.vue`, `users/[subjectId].vue`, `users/new.vue`. Also reuse verbatim: DS components (`UiButton/UiInput/UiSelect/UiSwitch/UiTextarea/UiStatusBadge/UiDataList/UiDetailDrawer/UiDialog/UiAlertDialog/UiEmptyState/UiSkeleton/UiStatusView/UiFolio`, `FormPageShell/FormSection/UiFormField`), `apiClient` + `getLastRequestId` + `ApiError`, `resolveStatusTone` (`@/lib/status-tone`), `display-identifiers` (`formatSupportReference`/`redactTechnicalIdentifiers`/`formatTechnicalPreview`), the session store permission helpers, and the existing `clients.*` locale keys. The Nitro proxy allow-list (`server/utils/admin-proxy.ts`) **already contains** most client routes — verify, add only the missing entries (see Task 5.4).
- **TDD:** RED → GREEN → REFACTOR per task; at least one assertion fails because the behaviour is missing (not a typo); commit only on green.
- **Definition-of-Done gate (run from `services/sso-admin-frontend`; report any blocked command explicitly, never claim PASS for a command that did not run):**
  `npm run typecheck && npm run lint && npm run format:check && npm run test && npm run build`, plus `npm run test:e2e` (Clients changes route/navigation/critical governance UI incl. the one-time-secret display — it qualifies).
- **Conventional commits**, each ending with the trailer:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

### Task 5.1: Clients DTO types + pure view-state / status-tone resolver

Pure types and pure functions first — no Nuxt, no network. Establishes the masked DTO shapes (every field `readonly`; **no `client_secret` field on any list/detail DTO** — only `has_secret_hash`; the plaintext secret exists only on the create + rotate response shapes) and the view-state mapping (error-first security branch; list-empty distinct from forbidden; detail `404 → not_found`) that the composables and pages consume. Copy-and-adapt of `app/types/users.types.ts` + `app/lib/users/users-view-state.ts` — same pure-resolver split so every matrix is unit-testable without a Nuxt context. `resolveClientStatusTone` delegates to the existing `resolveStatusTone` alias map (active→success, staged→warning, disabled→neutral, decommissioned→neutral) rather than re-tabulating tones. Mirror the backend shapes from `extract-backend.md` §EXACT JSON SHAPES verbatim.

**Files**
- Create: `app/types/clients.types.ts`
- Create: `app/lib/clients/clients-view-state.ts`
- Test: `app/lib/clients/__tests__/clients-view-state.spec.ts`

**Interfaces**
- Produces (`app/types/clients.types.ts`):
  - `type ClientStatus = 'active' | 'staged' | 'disabled' | 'decommissioned'`
  - `type ClientType = 'public' | 'confidential'`
  - `type ClientCategory = 'publik' | 'kepegawaian'`
  - `type ClientEnvironment = 'live' | 'development'`
  - `type ClientProvisioning = 'jit' | 'scim' | 'seeded'`
  - `type ScopeCatalogEntry = { readonly name: string; readonly description: string; readonly claims: readonly string[]; readonly default_allowed: boolean }`
  - `type AdminClientListItem` — the merged list shape: `readonly client_id: string; display_name?: string|null; type?: ClientType|string|null; environment?: string|null; app_base_url?: string|null; redirect_uris: readonly string[]; post_logout_redirect_uris?: readonly string[]; allowed_scopes?: readonly string[]; backchannel_logout_uri?: string|null; backchannel_logout_internal?: boolean; owner_email?: string|null; provisioning?: string|null; status?: ClientStatus|string|null; category?: ClientCategory; has_secret_hash?: boolean` (all `readonly`)
  - `type AdminClientDetail` — registration shape: `AdminClientListItem` + `readonly activated_at?: string|null; disabled_at?: string|null; secret_rotated_at?: string|null; secret_expires_at?: string|null`
  - `type ClientRegistration` — the `client-integrations` payload subset (no secret timestamps/category): `readonly client_id; display_name?; type?; environment?; app_base_url?; redirect_uris; post_logout_redirect_uris?; backchannel_logout_uri?; allowed_scopes?; owner_email?; provisioning?; status?; activated_at?; disabled_at?; has_secret_hash?`
  - `type ClientSecretRotation = { readonly client_id: string; plaintext_once?: string; plaintext_secret?: string; client_secret?: string; secret?: string; rotated_at?: string; expires_at?: string; secret_rotated_at?: string; secret_expires_at?: string }`
  - Responses: `ClientListResponse = { readonly clients: readonly AdminClientListItem[] }`; `ClientRegistrationsResponse = { readonly registrations: readonly ClientRegistration[] }`; `ClientDetailResponse = { readonly client: AdminClientDetail }`; `ClientMutationResponse = { readonly client: AdminClientDetail }`; `ClientIntegrationResponse = { readonly registration: ClientRegistration }`; `CreateClientResponse = { readonly registration: ClientRegistration; readonly plaintext_secret?: string }`; `RotateSecretResponse = { readonly rotation: ClientSecretRotation }`; `ScopeCatalogResponse = { readonly scopes: readonly ScopeCatalogEntry[] }`; `DeleteClientResponse = { readonly message: string }`
  - Payloads: `ClientCreatePayload = { app_name: string; client_id: string; environment: ClientEnvironment; client_type: ClientType; app_base_url: string; callback_path: string; logout_path: string; owner_email: string; provisioning: ClientProvisioning; allowed_scopes: readonly string[]; category: ClientCategory }`; `ClientUpdatePayload = Partial<{ display_name: string; owner_email: string; redirect_uris: readonly string[]; post_logout_redirect_uris: readonly string[]; backchannel_logout_uri: string|null; category: ClientCategory }>`; `SyncScopesPayload = { scopes: readonly string[] }`; `DisablePayload = { reason?: string }`; `DecommissionPayload = { reason?: string }`; `ActivatePayload = { secret_hash?: string }`
  - `const CLIENT_STATUSES = ['active','staged','disabled','decommissioned'] as const`
  - Header comment pinning the invariant: "No `client_secret` crosses into a list/detail DTO — only `has_secret_hash`; the plaintext secret exists only on `CreateClientResponse.plaintext_secret` and `ClientSecretRotation`, and is never persisted."
- Produces (`app/lib/clients/clients-view-state.ts`):
  - `type ClientsViewState = 'loading' | 'unauthenticated' | 'forbidden' | 'error' | 'empty' | 'ready'`
  - `type ClientDetailViewState = 'loading' | 'unauthenticated' | 'forbidden' | 'not_found' | 'error' | 'ready'`
  - `function isClientsListEmpty(list: readonly AdminClientListItem[]): boolean`
  - `function resolveClientsViewState(args: { pending: boolean; error: unknown; list: readonly AdminClientListItem[] | null }): ClientsViewState`
  - `function resolveClientDetailViewState(args: { pending: boolean; error: unknown; client: AdminClientDetail | null }): ClientDetailViewState` (404 → `not_found`)
  - `function resolveClientStatusTone(status: ClientStatus | string | null | undefined): StatusTone` (delegates to `resolveStatusTone`: active→success, staged→warning, disabled→neutral, decommissioned→neutral per the shared alias map)
- Consumes: `ApiError` from `@/lib/api/api-client` (signature `new ApiError(status, message, code?, payload?, requestId?)`); `StatusTone` + `resolveStatusTone` from `@/lib/status-tone`. Copy-and-adapt template: `app/types/users.types.ts`, `app/lib/users/users-view-state.ts`.

**Steps**

1. [ ] Write the failing test `app/lib/clients/__tests__/clients-view-state.spec.ts` (real behaviour, not mocks; also pins the no-secret invariant at the DTO boundary). The sample rows read clearly as fixtures and carry **only** `has_secret_hash`, never a secret:

```ts
import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api/api-client'
import {
  isClientsListEmpty,
  resolveClientDetailViewState,
  resolveClientStatusTone,
  resolveClientsViewState,
} from '../clients-view-state'
import type { AdminClientDetail, AdminClientListItem } from '@/types/clients.types'

// Sample row — reads clearly as a fixture. Carries ONLY `has_secret_hash`; the
// plaintext client_secret never lives on a list/detail DTO.
const sample: AdminClientListItem = {
  client_id: 'sample-portal',
  display_name: 'Sample Portal',
  type: 'confidential',
  environment: 'live',
  app_base_url: 'https://sample.example.test',
  redirect_uris: ['https://sample.example.test/callback'],
  post_logout_redirect_uris: ['https://sample.example.test'],
  allowed_scopes: ['openid', 'profile'],
  backchannel_logout_uri: 'https://sample.example.test/bclogout',
  backchannel_logout_internal: false,
  owner_email: 'owner.sample@example.test',
  provisioning: 'jit',
  status: 'active',
  category: 'publik',
  has_secret_hash: true,
}

const detail: AdminClientDetail = {
  ...sample,
  activated_at: '2026-01-01T00:00:00Z',
  disabled_at: null,
  secret_rotated_at: '2026-06-01T00:00:00Z',
  secret_expires_at: '2026-12-01T00:00:00Z',
}

describe('isClientsListEmpty', () => {
  it('is true only for a zero-length list (no-data, distinct from forbidden)', () => {
    expect(isClientsListEmpty([])).toBe(true)
    expect(isClientsListEmpty([sample])).toBe(false)
  })
})

describe('resolveClientsViewState', () => {
  it('loading when no list and no error', () => {
    expect(resolveClientsViewState({ pending: true, error: null, list: null })).toBe('loading')
  })
  it('maps a first-load 401 to unauthenticated', () => {
    expect(
      resolveClientsViewState({ pending: false, error: new ApiError(401, 'no session'), list: null }),
    ).toBe('unauthenticated')
  })
  it('maps a first-load 403 to forbidden (distinct from empty)', () => {
    expect(
      resolveClientsViewState({ pending: false, error: new ApiError(403, 'forbidden'), list: null }),
    ).toBe('forbidden')
  })
  it('maps other first-load errors to error (incl. H3-shaped statusCode)', () => {
    expect(
      resolveClientsViewState({ pending: false, error: new ApiError(500, 'boom'), list: null }),
    ).toBe('error')
    expect(resolveClientsViewState({ pending: false, error: { statusCode: 502 }, list: null })).toBe(
      'error',
    )
  })
  it('empty vs ready once a list is present (a stale-refresh error keeps the snapshot)', () => {
    expect(resolveClientsViewState({ pending: false, error: null, list: [] })).toBe('empty')
    expect(resolveClientsViewState({ pending: false, error: null, list: [sample] })).toBe('ready')
    expect(
      resolveClientsViewState({ pending: false, error: new ApiError(500, 'boom'), list: [sample] }),
    ).toBe('ready')
    // an empty list with a background error is still "empty", never blanked to error
    expect(
      resolveClientsViewState({ pending: false, error: new ApiError(500, 'boom'), list: [] }),
    ).toBe('empty')
  })
})

describe('resolveClientDetailViewState', () => {
  it('loading when no client and no error', () => {
    expect(resolveClientDetailViewState({ pending: true, error: null, client: null })).toBe('loading')
  })
  it('maps a first-load 404 to not_found (distinct from error)', () => {
    expect(
      resolveClientDetailViewState({
        pending: false,
        error: new ApiError(404, 'missing'),
        client: null,
      }),
    ).toBe('not_found')
    expect(
      resolveClientDetailViewState({ pending: false, error: { statusCode: 404 }, client: null }),
    ).toBe('not_found')
  })
  it('maps 401/403/other first-load errors', () => {
    expect(
      resolveClientDetailViewState({ pending: false, error: new ApiError(401, 'x'), client: null }),
    ).toBe('unauthenticated')
    expect(
      resolveClientDetailViewState({ pending: false, error: new ApiError(403, 'x'), client: null }),
    ).toBe('forbidden')
    expect(
      resolveClientDetailViewState({ pending: false, error: new ApiError(500, 'x'), client: null }),
    ).toBe('error')
  })
  it('ready once the client is present, even on a background-refresh error', () => {
    expect(resolveClientDetailViewState({ pending: false, error: null, client: detail })).toBe(
      'ready',
    )
    expect(
      resolveClientDetailViewState({ pending: false, error: new ApiError(500, 'x'), client: detail }),
    ).toBe('ready')
  })
})

describe('resolveClientStatusTone', () => {
  it('maps client lifecycle statuses to Swiss tones (red reserved for genuinely critical)', () => {
    expect(resolveClientStatusTone('active')).toBe('success')
    expect(resolveClientStatusTone('staged')).toBe('warning')
    expect(resolveClientStatusTone('disabled')).toBe('neutral')
    expect(resolveClientStatusTone('decommissioned')).toBe('neutral')
    expect(resolveClientStatusTone(null)).toBe('neutral')
    expect(resolveClientStatusTone(undefined)).toBe('neutral')
    expect(resolveClientStatusTone('something-unknown')).toBe('neutral')
  })
})

describe('no-secret invariant (DTO boundary)', () => {
  it('the sample DTOs carry has_secret_hash only — never a client_secret field/value', () => {
    const blob = JSON.stringify({ sample, detail })
    expect(blob).not.toMatch(/client_secret/u)
    expect(blob).not.toMatch(/clientSecret/u)
    expect(blob).not.toMatch(/plaintext/u)
    expect(blob).toMatch(/has_secret_hash/u)
  })
})
```

2. [ ] Run it and confirm RED (modules do not exist yet):

```bash
npm run test -- app/lib/clients/__tests__/clients-view-state.spec.ts
```
Expected: FAIL — `Failed to resolve import "../clients-view-state"` / `"@/types/clients.types"` (the files are not created yet). Not a typo; the behaviour is genuinely missing.

3. [ ] Minimal implementation — create `app/types/clients.types.ts` (mirror `extract-backend.md` §EXACT JSON SHAPES; every field `readonly`; **no secret field on list/detail**):

```ts
// Safe, masked admin Clients DTOs for the BFF endpoints under /api/admin/clients
// and /api/admin/client-integrations. Every field is readonly.
//
// INVARIANT: No `client_secret` crosses into a list/detail DTO — only
// `has_secret_hash`; the plaintext secret exists only on
// `CreateClientResponse.plaintext_secret` and `ClientSecretRotation`, and is
// never persisted (one-time reveal, client-only ref). `client_id` is a public
// identifier and is allowed to hydrate.
export type ClientStatus = 'active' | 'staged' | 'disabled' | 'decommissioned'
export type ClientType = 'public' | 'confidential'
export type ClientCategory = 'publik' | 'kepegawaian'
export type ClientEnvironment = 'live' | 'development'
export type ClientProvisioning = 'jit' | 'scim' | 'seeded'

export const CLIENT_STATUSES = ['active', 'staged', 'disabled', 'decommissioned'] as const

export type ScopeCatalogEntry = {
  readonly name: string
  readonly description: string
  readonly claims: readonly string[]
  readonly default_allowed: boolean
}

// Merged list shape: the lean downstream registry overlaid with the registration
// row (see Task 5.2 mergeClients). Optional because list vs detail vs merged
// sources expose different subsets.
export type AdminClientListItem = {
  readonly client_id: string
  readonly display_name?: string | null
  readonly type?: ClientType | string | null
  readonly environment?: string | null
  readonly app_base_url?: string | null
  readonly redirect_uris: readonly string[]
  readonly post_logout_redirect_uris?: readonly string[]
  readonly allowed_scopes?: readonly string[]
  readonly backchannel_logout_uri?: string | null
  readonly backchannel_logout_internal?: boolean
  readonly owner_email?: string | null
  readonly provisioning?: string | null
  readonly status?: ClientStatus | string | null
  readonly category?: ClientCategory
  readonly has_secret_hash?: boolean
}

// Registration row (GET /clients/{id}) — list item + secret/lifecycle timestamps.
// Still carries only `has_secret_hash`, never the secret.
export type AdminClientDetail = AdminClientListItem & {
  readonly activated_at?: string | null
  readonly disabled_at?: string | null
  readonly secret_rotated_at?: string | null
  readonly secret_expires_at?: string | null
}

// client-integrations payload subset (no secret timestamps / no category).
export type ClientRegistration = {
  readonly client_id: string
  readonly display_name?: string | null
  readonly type?: ClientType | string | null
  readonly environment?: string | null
  readonly app_base_url?: string | null
  readonly redirect_uris: readonly string[]
  readonly post_logout_redirect_uris?: readonly string[]
  readonly backchannel_logout_uri?: string | null
  readonly allowed_scopes?: readonly string[]
  readonly owner_email?: string | null
  readonly provisioning?: string | null
  readonly status?: ClientStatus | string | null
  readonly activated_at?: string | null
  readonly disabled_at?: string | null
  readonly has_secret_hash?: boolean
}

// One-time plaintext secret carrier (rotate-secret). The backend returns
// `plaintext_once` AND `plaintext_secret` (same value); the others are accepted
// for fallback resolution (Task 5.9 extractRevealedSecret). NEVER persisted.
export type ClientSecretRotation = {
  readonly client_id: string
  plaintext_once?: string
  plaintext_secret?: string
  client_secret?: string
  secret?: string
  rotated_at?: string
  expires_at?: string
  secret_rotated_at?: string
  secret_expires_at?: string
}

export type ClientListResponse = { readonly clients: readonly AdminClientListItem[] }
export type ClientRegistrationsResponse = { readonly registrations: readonly ClientRegistration[] }
export type ClientDetailResponse = { readonly client: AdminClientDetail }
export type ClientMutationResponse = { readonly client: AdminClientDetail }
export type ClientIntegrationResponse = { readonly registration: ClientRegistration }
// plaintext_secret present ONLY for confidential clients; ABSENT for public.
export type CreateClientResponse = {
  readonly registration: ClientRegistration
  readonly plaintext_secret?: string
}
export type RotateSecretResponse = { readonly rotation: ClientSecretRotation }
export type ScopeCatalogResponse = { readonly scopes: readonly ScopeCatalogEntry[] }
export type DeleteClientResponse = { readonly message: string }

export type ClientCreatePayload = {
  app_name: string
  client_id: string
  environment: ClientEnvironment
  client_type: ClientType
  app_base_url: string
  callback_path: string
  logout_path: string
  owner_email: string
  provisioning: ClientProvisioning
  allowed_scopes: readonly string[]
  category: ClientCategory
}

export type ClientUpdatePayload = Partial<{
  display_name: string
  owner_email: string
  redirect_uris: readonly string[]
  post_logout_redirect_uris: readonly string[]
  backchannel_logout_uri: string | null
  category: ClientCategory
}>

export type SyncScopesPayload = { scopes: readonly string[] }
export type DisablePayload = { reason?: string }
export type DecommissionPayload = { reason?: string }
export type ActivatePayload = { secret_hash?: string }
```

4. [ ] Minimal implementation — create `app/lib/clients/clients-view-state.ts` (error-first security branch; copy-and-adapt of `users-view-state.ts`):

```ts
import { ApiError } from '@/lib/api/api-client'
import { resolveStatusTone, type StatusTone } from '@/lib/status-tone'
import type { AdminClientDetail, AdminClientListItem, ClientStatus } from '@/types/clients.types'

export type ClientsViewState =
  | 'loading'
  | 'unauthenticated'
  | 'forbidden'
  | 'error'
  | 'empty'
  | 'ready'

export type ClientDetailViewState =
  | 'loading'
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'error'
  | 'ready'

// "Empty" = the backend answered with an empty population. Deliberately distinct
// from `forbidden` (a 403 → no permission) so the page shows "no clients yet"
// copy rather than an access-denied surface.
export function isClientsListEmpty(list: readonly AdminClientListItem[]): boolean {
  return list.length === 0
}

export function resolveClientsViewState({
  error,
  list,
}: {
  readonly pending: boolean
  readonly error: unknown
  readonly list: readonly AdminClientListItem[] | null
}): ClientsViewState {
  // Security boundary: an error with NO prior snapshot surfaces the real
  // auth/permission state. Once a list exists it stays on screen even if a
  // background refresh fails (handled by the composable's stale flag).
  if (error && !list) {
    const status = errorStatus(error)
    if (status === 401) return 'unauthenticated'
    if (status === 403) return 'forbidden'
    return 'error'
  }
  if (list) return isClientsListEmpty(list) ? 'empty' : 'ready'
  return 'loading'
}

export function resolveClientDetailViewState({
  error,
  client,
}: {
  readonly pending: boolean
  readonly error: unknown
  readonly client: AdminClientDetail | null
}): ClientDetailViewState {
  if (error && !client) {
    const status = errorStatus(error)
    if (status === 401) return 'unauthenticated'
    if (status === 403) return 'forbidden'
    if (status === 404) return 'not_found'
    return 'error'
  }
  if (client) return 'ready'
  return 'loading'
}

// Reuse the shared alias map (active→success, staged→warning,
// disabled→neutral, decommissioned→neutral) — Swiss reserves red for genuinely
// critical states, never routine lifecycle.
export function resolveClientStatusTone(
  status: ClientStatus | string | null | undefined,
): StatusTone {
  return resolveStatusTone(status ?? null)
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

5. [ ] Run it and confirm GREEN:

```bash
npm run test -- app/lib/clients/__tests__/clients-view-state.spec.ts
```
Expected: PASS — all `describe` blocks green (`isClientsListEmpty`, `resolveClientsViewState`, `resolveClientDetailViewState`, `resolveClientStatusTone`, no-secret invariant). No test skipped.

6. [ ] Refactor if needed — keep it a verbatim shape match with the users template (the only divergences are `client`↔`user`, the no-secret DTO fields, and the status tone assertions). Confirm typecheck + lint are clean for the two new modules:

```bash
npm run typecheck && npm run lint -- app/types/clients.types.ts app/lib/clients/clients-view-state.ts app/lib/clients/__tests__/clients-view-state.spec.ts
```
Expected: no type errors, no lint errors (note every test file uses real values, so no `vi.fn` type-parameter rule applies here).

7. [ ] Commit (only on green):

```bash
git add app/types/clients.types.ts app/lib/clients/clients-view-state.ts app/lib/clients/__tests__/clients-view-state.spec.ts
git commit -m "feat(sso-admin-frontend): clients DTO types + pure view-state/status-tone resolver

Masked clients DTO module (no client_secret on any list/detail DTO — only
has_secret_hash; plaintext secret lives solely on CreateClientResponse and
ClientSecretRotation) plus the unit-tested pure view-state and status-tone
resolvers (list-empty distinct from forbidden; detail 404 -> not_found).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

**Deliverable:** typed, masked clients DTO module + unit-tested pure view-state/tone resolver — no secret field anywhere in the list/detail types; the no-secret invariant is asserted at the DTO boundary.

**Task-scoped DoD** (run from `services/sso-admin-frontend`; report any blocked command explicitly, never claim PASS for a command that did not run): `npm run typecheck && npm run lint && npm run format:check && npm run test -- app/lib/clients/__tests__/clients-view-state.spec.ts`. (This task is pure types + resolvers — no Nuxt runtime, no page/route/secret-reveal surface — so the `npm run build` / `npm run test:e2e` gates are exercised by the later rendering tasks, not here.)

---

### Task 5.2: Pure clients-list — registry/registration merge + search/filter/pagination

The parity-critical pure module. `mergeClients` seeds a `Map` from `registrations` (so registration-only `staged` integrations still appear in the list) then overlays the runtime `clients` **per-field** (`runtime[k] ?? registration[k]`) so a registration's `display_name` / `type` / `owner_email` / `backchannel_logout_uri` survives a runtime row whose field is `null`. This replaces the legacy `mergeClientMetadata` `Record<string, unknown>` cast (extract-legacy §11) with a typed, explicit per-field overlay (extract-legacy §5 "Merge logic (parity-critical)"). Plus client-side `filterClients` / `paginateClients` / `clientsPageCount` — there are **no** backend query params (the backend `GET /clients` returns a flat `{ clients }`; extract-legacy §6 "client-side only … NO server search, NO sort, NO pagination" — pagination is the deliberate Swiss-folio addition mirroring Phase-4 Users). No Nuxt, no network. Copy-and-adapt of `app/lib/users/users-list.ts`.

This is a **pure logic** module: no privileged/destructive action, no client-secret handling, and it renders/hydrates nothing — so the privileged-action matrix, the one-time-secret discipline, and the SSR-payload assertion do not apply here (they are exercised in Tasks 5.5/5.8/5.9–5.13). The one secret-adjacent guarantee this module owns is negative and cheap to prove: the merged output carries **no** `client_secret`/`clientSecret` key (`AdminClientListItem` has none — only `has_secret_hash`), and a test asserts it.

**Files**
- Create: `app/lib/clients/clients-list.ts`
- Test: `app/lib/clients/__tests__/clients-list.spec.ts`

**Interfaces**
- Produces (`app/lib/clients/clients-list.ts`):
  - `const CLIENTS_PAGE_SIZE = 25`
  - `type ClientsStatusFilter = 'all' | ClientStatus`
  - `function mergeClients(runtime: readonly AdminClientListItem[], registrations: readonly ClientRegistration[]): readonly AdminClientListItem[]` (Map keyed by `client_id`; registrations seed first so registration-only rows are retained; typed per-field overlay `runtime[k] ?? registration[k]`)
  - `function filterClients(list: readonly AdminClientListItem[], opts: { query: string; status: ClientsStatusFilter }): readonly AdminClientListItem[]` (case-insensitive substring over `display_name` + `client_id`; status filters on `status`)
  - `function paginateClients(list: readonly AdminClientListItem[], page: number, size?: number): readonly AdminClientListItem[]` (1-based; clamps `page < 1` to 1)
  - `function clientsPageCount(total: number, size?: number): number` (`Math.max(1, Math.ceil(total / size))`)
- Consumes: `AdminClientListItem`, `ClientRegistration`, `ClientStatus` from `@/types/clients.types` (Task 5.1). Copy-and-adapt template: `app/lib/users/users-list.ts`.

**Steps**

1. [ ] Write the failing pure-logic test `app/lib/clients/__tests__/clients-list.spec.ts` (FULL code — real behaviour, no mocks):

```ts
import { describe, expect, it } from 'vitest'
import {
  CLIENTS_PAGE_SIZE,
  clientsPageCount,
  filterClients,
  mergeClients,
  paginateClients,
} from '../clients-list'
import type { AdminClientListItem, ClientRegistration } from '@/types/clients.types'

// A single fully-typed sample row; overrides keep each case readable. The DTO
// carries only `has_secret_hash` — never a `client_secret` — matching the live
// masked contract; fixtures read clearly as samples.
const base: AdminClientListItem = {
  client_id: 'portal-web',
  display_name: 'Portal Web',
  type: 'confidential',
  environment: 'live',
  app_base_url: 'https://portal.example.test',
  redirect_uris: ['https://portal.example.test/auth/callback'],
  post_logout_redirect_uris: ['https://portal.example.test/'],
  allowed_scopes: ['openid', 'profile', 'email'],
  backchannel_logout_uri: 'https://portal.example.test/auth/backchannel/logout',
  backchannel_logout_internal: false,
  owner_email: 'ops@example.test',
  provisioning: 'jit',
  status: 'active',
  category: 'publik',
  has_secret_hash: true,
}

function makeClient(overrides: Partial<AdminClientListItem>): AdminClientListItem {
  return { ...base, ...overrides }
}

function makeRegistration(overrides: Partial<ClientRegistration>): ClientRegistration {
  return {
    client_id: 'portal-web',
    display_name: 'Portal Web (registration)',
    type: 'confidential',
    environment: 'live',
    app_base_url: 'https://portal.example.test',
    redirect_uris: ['https://portal.example.test/auth/callback'],
    post_logout_redirect_uris: ['https://portal.example.test/'],
    backchannel_logout_uri: 'https://portal.example.test/auth/backchannel/logout',
    allowed_scopes: ['openid', 'profile', 'email'],
    owner_email: 'registry-owner@example.test',
    provisioning: 'jit',
    status: 'active',
    has_secret_hash: true,
    ...overrides,
  }
}

describe('mergeClients', () => {
  it('overlays runtime onto a registration per-field, but a null runtime field keeps the registration value', () => {
    const registrations = [
      makeRegistration({
        client_id: 'portal-web',
        display_name: 'Portal Web (registration)',
        type: 'confidential',
        owner_email: 'registry-owner@example.test',
        backchannel_logout_uri: 'https://portal.example.test/auth/backchannel/logout',
      }),
    ]
    const runtime = [
      makeClient({
        client_id: 'portal-web',
        display_name: null,
        type: null,
        owner_email: null,
        backchannel_logout_uri: null,
        status: 'active',
      }),
    ]

    const merged = mergeClients(runtime, registrations)

    expect(merged).toHaveLength(1)
    // null runtime fields fall back to the registration — the parity-critical guarantee.
    expect(merged[0]?.display_name).toBe('Portal Web (registration)')
    expect(merged[0]?.type).toBe('confidential')
    expect(merged[0]?.owner_email).toBe('registry-owner@example.test')
    expect(merged[0]?.backchannel_logout_uri).toBe(
      'https://portal.example.test/auth/backchannel/logout',
    )
  })

  it('prefers a present runtime field over the registration value', () => {
    const registrations = [makeRegistration({ client_id: 'portal-web', status: 'staged' })]
    const runtime = [makeClient({ client_id: 'portal-web', display_name: 'Portal Web (live)', status: 'active' })]

    const merged = mergeClients(runtime, registrations)

    expect(merged[0]?.display_name).toBe('Portal Web (live)')
    expect(merged[0]?.status).toBe('active')
  })

  it('retains registration-only (staged) clients that have no runtime row', () => {
    const registrations = [
      makeRegistration({
        client_id: 'analytics-staged',
        display_name: 'Analytics (staged)',
        status: 'staged',
      }),
    ]
    const runtime: readonly AdminClientListItem[] = []

    const merged = mergeClients(runtime, registrations)

    expect(merged.map((c) => c.client_id)).toEqual(['analytics-staged'])
    expect(merged[0]?.status).toBe('staged')
  })

  it('keeps runtime-only clients that have no registration row', () => {
    const runtime = [makeClient({ client_id: 'admin-console', display_name: 'Admin Console' })]

    const merged = mergeClients(runtime, [])

    expect(merged.map((c) => c.client_id)).toEqual(['admin-console'])
    expect(merged[0]?.display_name).toBe('Admin Console')
  })

  it('keeps registration-defined fields the runtime DTO never carries (category survives)', () => {
    // Registration has no `category`; it must come from the runtime overlay and not be lost.
    const registrations = [makeRegistration({ client_id: 'staff-app' })]
    const runtime = [makeClient({ client_id: 'staff-app', category: 'kepegawaian' })]

    const merged = mergeClients(runtime, registrations)

    expect(merged[0]?.category).toBe('kepegawaian')
  })

  it('never introduces a client_secret onto a merged row (only has_secret_hash)', () => {
    const merged = mergeClients([makeClient({})], [makeRegistration({})])
    const row = merged[0] as Record<string, unknown>
    expect('client_secret' in row).toBe(false)
    expect('clientSecret' in row).toBe(false)
    expect(row.has_secret_hash).toBe(true)
  })
})

const sample: readonly AdminClientListItem[] = [
  makeClient({ client_id: 'portal-web', display_name: 'Portal Web', status: 'active' }),
  makeClient({ client_id: 'admin-console', display_name: 'Admin Console', status: 'active' }),
  makeClient({ client_id: 'analytics-staged', display_name: 'Analytics', status: 'staged' }),
  makeClient({ client_id: 'legacy-app', display_name: null, status: 'disabled' }),
]

describe('filterClients', () => {
  it('returns the full list when query is empty and status is "all"', () => {
    expect(filterClients(sample, { query: '', status: 'all' })).toHaveLength(4)
    expect(filterClients(sample, { query: '   ', status: 'all' })).toHaveLength(4)
  })

  it('matches case-insensitively across display_name and client_id', () => {
    expect(filterClients(sample, { query: 'PORTAL', status: 'all' }).map((c) => c.client_id)).toEqual([
      'portal-web',
    ])
    expect(
      filterClients(sample, { query: 'analytics-staged', status: 'all' }).map((c) => c.client_id),
    ).toEqual(['analytics-staged'])
  })

  it('does not crash on a null display_name and still matches by client_id', () => {
    expect(filterClients(sample, { query: 'legacy-app', status: 'all' }).map((c) => c.client_id)).toEqual([
      'legacy-app',
    ])
  })

  it('filters by status', () => {
    expect(filterClients(sample, { query: '', status: 'staged' }).map((c) => c.client_id)).toEqual([
      'analytics-staged',
    ])
    expect(filterClients(sample, { query: '', status: 'disabled' }).map((c) => c.client_id)).toEqual([
      'legacy-app',
    ])
  })

  it('combines query and status (AND)', () => {
    expect(filterClients(sample, { query: 'portal', status: 'staged' })).toHaveLength(0)
    expect(filterClients(sample, { query: 'analytics', status: 'staged' })).toHaveLength(1)
  })
})

describe('paginateClients', () => {
  const many: readonly AdminClientListItem[] = Array.from({ length: 30 }, (_, i) =>
    makeClient({ client_id: `client-${i}`, display_name: `Client ${i}` }),
  )

  it('returns the first page-size slice for page 1 and the remainder for page 2', () => {
    expect(paginateClients(many, 1)).toHaveLength(CLIENTS_PAGE_SIZE)
    expect(paginateClients(many, 2)).toHaveLength(30 - CLIENTS_PAGE_SIZE)
    expect(paginateClients(many, 1)[0]?.client_id).toBe('client-0')
    expect(paginateClients(many, 2)[0]?.client_id).toBe(`client-${CLIENTS_PAGE_SIZE}`)
  })

  it('honours an explicit page size and clamps page < 1 to the first page', () => {
    expect(paginateClients(many, 1, 10)).toHaveLength(10)
    expect(paginateClients(many, 0, 10)[0]?.client_id).toBe('client-0')
  })

  it('returns an empty slice for a page beyond the data', () => {
    expect(paginateClients(many, 99)).toEqual([])
  })
})

describe('clientsPageCount', () => {
  it('ceils total/size and is never below 1', () => {
    expect(clientsPageCount(0)).toBe(1)
    expect(clientsPageCount(25)).toBe(1)
    expect(clientsPageCount(26)).toBe(2)
    expect(clientsPageCount(50)).toBe(2)
    expect(clientsPageCount(51)).toBe(3)
    expect(clientsPageCount(10, 10)).toBe(1)
    expect(clientsPageCount(11, 10)).toBe(2)
  })
})
```

2. [ ] Run it — expect **FAIL** (`../clients-list` does not exist → import/resolution error):
   `npm run test -- app/lib/clients/__tests__/clients-list.spec.ts`

3. [ ] Implement `app/lib/clients/clients-list.ts` (FULL code — typed per-field overlay, no `Record<string, unknown>` cast on the merge surface):

```ts
import type { AdminClientListItem, ClientRegistration, ClientStatus } from '@/types/clients.types'

// The backend `GET /api/admin/clients` returns a flat `{ clients }` with no query
// params (extract-legacy §6), so search / status-filter / pagination are derived
// client-side over the hydrated, already-masked list. 25 mirrors the Phase-4
// Users table page size.
export const CLIENTS_PAGE_SIZE = 25

export type ClientsStatusFilter = 'all' | ClientStatus

// A registration carries no `category`, `backchannel_logout_internal`, or secret
// timestamps — it is a strict subset of the list item. Lift it into the merged
// shape explicitly so the overlay below stays fully typed (no `Record` cast).
function registrationToListItem(reg: ClientRegistration): AdminClientListItem {
  return {
    client_id: reg.client_id,
    display_name: reg.display_name,
    type: reg.type,
    environment: reg.environment,
    app_base_url: reg.app_base_url,
    redirect_uris: reg.redirect_uris,
    post_logout_redirect_uris: reg.post_logout_redirect_uris,
    allowed_scopes: reg.allowed_scopes,
    backchannel_logout_uri: reg.backchannel_logout_uri,
    owner_email: reg.owner_email,
    provisioning: reg.provisioning,
    status: reg.status,
    has_secret_hash: reg.has_secret_hash,
  }
}

// Parity-critical (extract-legacy §5): per-field `runtime[k] ?? registration[k]`
// so a registration's display_name / type / owner_email / backchannel survives a
// runtime row whose field is null. Fields the runtime DTO owns exclusively
// (category, backchannel_logout_internal) come straight from runtime.
function overlay(runtime: AdminClientListItem, base: AdminClientListItem): AdminClientListItem {
  return {
    client_id: runtime.client_id,
    display_name: runtime.display_name ?? base.display_name,
    type: runtime.type ?? base.type,
    environment: runtime.environment ?? base.environment,
    app_base_url: runtime.app_base_url ?? base.app_base_url,
    redirect_uris: runtime.redirect_uris ?? base.redirect_uris,
    post_logout_redirect_uris: runtime.post_logout_redirect_uris ?? base.post_logout_redirect_uris,
    allowed_scopes: runtime.allowed_scopes ?? base.allowed_scopes,
    backchannel_logout_uri: runtime.backchannel_logout_uri ?? base.backchannel_logout_uri,
    backchannel_logout_internal: runtime.backchannel_logout_internal ?? base.backchannel_logout_internal,
    owner_email: runtime.owner_email ?? base.owner_email,
    provisioning: runtime.provisioning ?? base.provisioning,
    status: runtime.status ?? base.status,
    category: runtime.category ?? base.category,
    has_secret_hash: runtime.has_secret_hash ?? base.has_secret_hash,
  }
}

// Seed from registrations first so registration-only (e.g. `staged`) clients
// still appear; then overlay runtime per-field. Replaces the legacy
// `mergeClientMetadata` `Record<string, unknown>` cast with a typed merge.
export function mergeClients(
  runtime: readonly AdminClientListItem[],
  registrations: readonly ClientRegistration[],
): readonly AdminClientListItem[] {
  const merged = new Map<string, AdminClientListItem>()
  for (const reg of registrations) {
    merged.set(reg.client_id, registrationToListItem(reg))
  }
  for (const client of runtime) {
    const base = merged.get(client.client_id)
    merged.set(client.client_id, base ? overlay(client, base) : client)
  }
  return [...merged.values()]
}

// Case-insensitive substring over the operator-meaningful fields (display name,
// client id); status filters on `status`. No PII fields exist on a client.
export function filterClients(
  list: readonly AdminClientListItem[],
  opts: { query: string; status: ClientsStatusFilter },
): readonly AdminClientListItem[] {
  const q = opts.query.trim().toLowerCase()
  return list.filter((client) => {
    if (opts.status !== 'all' && client.status !== opts.status) return false
    if (q === '') return true
    return (
      (client.display_name ?? '').toLowerCase().includes(q) ||
      client.client_id.toLowerCase().includes(q)
    )
  })
}

// 1-based page; page < 1 is clamped to the first page so a stale page ref can
// never index before the start of the list.
export function paginateClients(
  list: readonly AdminClientListItem[],
  page: number,
  size: number = CLIENTS_PAGE_SIZE,
): readonly AdminClientListItem[] {
  const start = (Math.max(1, page) - 1) * size
  return list.slice(start, start + size)
}

// Always at least one page so the folio renders "01 / 01" for an empty result.
export function clientsPageCount(total: number, size: number = CLIENTS_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / size))
}
```

4. [ ] Run it — expect **PASS** (all `mergeClients` / `filterClients` / `paginateClients` / `clientsPageCount` describes green):
   `npm run test -- app/lib/clients/__tests__/clients-list.spec.ts`

5. [ ] Refactor check: confirm no `Record<string, unknown>` cast leaked onto the merge surface (the legacy anti-pattern, extract-legacy §11) and that `overlay`/`registrationToListItem` carry no `any`. Nothing to extract — the three list helpers mirror `users-list.ts` 1:1 and stay independent. No change if clean.

6. [ ] Commit (exact):
   `git add app/lib/clients/clients-list.ts app/lib/clients/__tests__/clients-list.spec.ts`
   ```
   feat(sso-admin-frontend): typed clients merge + search/filter/pagination

   Seed the merge Map from client-integration registrations then overlay
   runtime clients per-field (runtime[k] ?? registration[k]) so a
   registration's display_name/type/owner_email/backchannel survives a null
   runtime field and registration-only staged clients still appear. Replaces
   the legacy Record<string, unknown> cast with a typed merge, and adds
   client-side filter/paginate/page-count over the masked list.

   Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
   ```

**Deliverable:** unit-tested pure merge + filter + paginate with the parity-critical "registration fields survive a null runtime overlay; staged-only rows appear" assertions, plus the negative "no `client_secret`/`clientSecret` key on a merged row" guarantee.

**Task-scoped DoD (run from `services/sso-admin-frontend`; report any blocked command explicitly, never claim PASS for a command that did not run):**
`npm run typecheck && npm run lint && npm run format:check && npm run test -- app/lib/clients/__tests__/clients-list.spec.ts`

---

### Task 5.3: Pure create-form + URI-policy + scope-catalog validation

The validation-heavy pure module that becomes the **one** source of truth for client URI rules. The legacy carried two divergent validators: the create-form (`client-create-form.ts` — strict: rejects `*` wildcards and query strings, requires http/https) and the list page's `findUriValidationMessages` (loose: `URL.canParse` only, no wildcard/query rejection, hard-coded Indonesian strings — extract-legacy §8). This task consolidates both onto the **stricter create-form rules**: the edit-form `validateUriPolicy` reuses `isRedirectUri`/`isBackchannelUri` and returns an i18n **key** (never a hard-coded string — extract-legacy §11 anti-pattern). It also ships the create-form field validators, the payload builder, and the scope-catalog helpers. No Nuxt, no network — pure stdlib (`URL`, `RegExp`, `Set`). This task neither performs a privileged action nor renders/hydrates client data, so the privileged-action matrix, the one-time-secret discipline, and the SSR token-leak step do **not** apply here (they live in Tasks 5.9–5.12); no `client_secret` is read, built, or referenced anywhere in this module. Copy-and-adapt the validator-module shape of `app/lib/users/user-identifiers.ts`.

**Files**
- Create: `app/lib/clients/client-create-form.ts`
- Test: `app/lib/clients/__tests__/client-create-form.spec.ts`

**Interfaces**
- Consumes: `ClientCreatePayload`, `ClientType`, `ClientCategory`, `ScopeCatalogEntry` from `@/types/clients.types` (Task 5.1). Copy-and-adapt template: `app/lib/users/user-identifiers.ts`. (No Nuxt, no other runtime deps.)
- Produces (`app/lib/clients/client-create-form.ts`):
  - `type ClientCreateForm = { display_name: string; client_id: string; owner_email: string; client_type: ClientType | null; category: ClientCategory | ''; redirect_uri: string; backchannel_logout_uri: string }`
  - `function slugifyClientId(displayName: string): string`
  - `function isValidClientId(value: string): boolean` (regex `/^[a-z0-9][a-z0-9-]{2,62}$/u`)
  - `function isValidOwnerEmail(value: string): boolean` (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/u`)
  - `function isRedirectUri(value: string): boolean` (valid URL, `http:`|`https:`, NO `*` wildcard, NO query string)
  - `function isBackchannelUri(value: string, redirectUri: string): boolean` (empty/whitespace OK; else valid http|https, no `*`, no query, AND same origin as `redirectUri`)
  - `function parseScopes(value: string): readonly string[]` (split `/[\s,]+/`, trim, drop empties, dedup)
  - `function validateClientCreateForm(form: ClientCreateForm, selectedScopes: readonly string[]): Readonly<Record<string, string>>` (field→i18n-error-key map; empty object = valid; scopes must be non-empty AND include `openid`; category + client_type required)
  - `function toClientCreatePayload(form: ClientCreateForm, selectedScopes: readonly string[]): ClientCreatePayload` (throws if `client_type`/`category` null/`''`; derives `app_base_url=redirect.origin`, `callback_path=redirect.pathname`, `logout_path`=backchannel pathname or `/auth/backchannel/logout`; `environment:'development'`, `provisioning:'jit'`)
  - `function validateUriPolicy(input: { redirect_uris: readonly string[]; post_logout_redirect_uris: readonly string[]; backchannel_logout_uri: string }): string | null` (consolidated edit-form validator — returns ONE i18n-error-key or `null`; reuses `isRedirectUri`/`isBackchannelUri`; rejects duplicates across redirect+logout; logout/backchannel must share the first redirect's origin)
  - `function mergeAvailableScopes(catalog: readonly ScopeCatalogEntry[], clientScopes: readonly string[]): readonly string[]` (catalog ∪ client's custom scopes, catalog order first)
  - `function scopeParityWarnings(catalog: readonly ScopeCatalogEntry[], clientScopes: readonly string[]): readonly string[]` (client scopes absent from catalog)

**i18n error keys returned** (all under the existing `clients.*` namespace — already present in both locale files: `validation_display_name`, `validation_client_id`, `validation_owner_email`, `validation_redirect_uri`, `validation_logout_uri`, `validation_client_type`, `validation_category`, `validation_scopes`). `validateUriPolicy` additionally returns `clients.validation_uri_duplicate` and `clients.validation_logout_origin` for the consolidated duplicate / origin-mismatch cases — these are **net-new keys ADDED to both `app/locales/{id,en}.json` by the consuming Task 5.11** (`ClientUriPolicyForm.vue`), keeping this module pure (no locale edits here). This module emits the key strings only.

**Steps**

1. [ ] Write the FAILING test `app/lib/clients/__tests__/client-create-form.spec.ts` (FULL code):

```ts
import { describe, expect, it } from 'vitest'
import type { ClientCreateForm } from '../client-create-form'
import {
  isBackchannelUri,
  isRedirectUri,
  isValidClientId,
  isValidOwnerEmail,
  mergeAvailableScopes,
  parseScopes,
  scopeParityWarnings,
  slugifyClientId,
  toClientCreatePayload,
  validateClientCreateForm,
  validateUriPolicy,
} from '../client-create-form'
import type { ScopeCatalogEntry } from '@/types/clients.types'

const baseForm = (): ClientCreateForm => ({
  display_name: 'Selamat Kerja',
  client_id: 'selamat-kerja',
  owner_email: 'ops@example.com',
  client_type: 'confidential',
  category: 'kepegawaian',
  redirect_uri: 'https://app.example.com/auth/callback',
  backchannel_logout_uri: '',
})

const scope = (name: string, default_allowed = true): ScopeCatalogEntry => ({
  name,
  description: `${name} scope`,
  claims: [],
  default_allowed,
})

describe('slugifyClientId', () => {
  it('lowercases, hyphenates non-alphanumerics, and trims edge hyphens', () => {
    expect(slugifyClientId('  Selamat Kerja!  ')).toBe('selamat-kerja')
    expect(slugifyClientId('My__Cool  App')).toBe('my-cool-app')
    expect(slugifyClientId('Already-Valid-99')).toBe('already-valid-99')
  })

  it('caps the slug at 63 characters', () => {
    expect(slugifyClientId('a'.repeat(80)).length).toBe(63)
  })
})

describe('isValidClientId', () => {
  it('accepts 3–63 lowercase alnum/hyphen ids starting with alnum', () => {
    expect(isValidClientId('abc')).toBe(true)
    expect(isValidClientId('selamat-kerja-99')).toBe(true)
    expect(isValidClientId('a'.repeat(63))).toBe(true)
  })

  it('rejects too-short, too-long, leading-hyphen, and uppercase/space ids', () => {
    expect(isValidClientId('ab')).toBe(false) // 2 chars
    expect(isValidClientId('a'.repeat(64))).toBe(false) // 64 chars
    expect(isValidClientId('-abc')).toBe(false)
    expect(isValidClientId('Abc')).toBe(false)
    expect(isValidClientId('a b')).toBe(false)
    expect(isValidClientId('app_name')).toBe(false)
  })
})

describe('isValidOwnerEmail', () => {
  it('accepts a well-formed address and rejects malformed input', () => {
    expect(isValidOwnerEmail('ops@example.co.id')).toBe(true)
    expect(isValidOwnerEmail('no-at-sign')).toBe(false)
    expect(isValidOwnerEmail('ops@example')).toBe(false)
    expect(isValidOwnerEmail('ops @example.com')).toBe(false)
    expect(isValidOwnerEmail('')).toBe(false)
  })
})

describe('isRedirectUri', () => {
  it('accepts http/https URLs without wildcard or query', () => {
    expect(isRedirectUri('https://app.example.com/auth/callback')).toBe(true)
    expect(isRedirectUri('http://localhost:3000/cb')).toBe(true)
  })

  it('rejects wildcards, query strings, non-http schemes, and garbage', () => {
    expect(isRedirectUri('https://*.example.com/cb')).toBe(false)
    expect(isRedirectUri('https://app.example.com/cb?next=1')).toBe(false)
    expect(isRedirectUri('ftp://app.example.com/cb')).toBe(false)
    expect(isRedirectUri('javascript:alert(1)')).toBe(false)
    expect(isRedirectUri('not a url')).toBe(false)
    expect(isRedirectUri('')).toBe(false)
  })
})

describe('isBackchannelUri', () => {
  const redirect = 'https://app.example.com/auth/callback'

  it('treats empty/whitespace as valid (optional field)', () => {
    expect(isBackchannelUri('', redirect)).toBe(true)
    expect(isBackchannelUri('   ', redirect)).toBe(true)
  })

  it('requires the same origin as the redirect URI', () => {
    expect(isBackchannelUri('https://app.example.com/logout', redirect)).toBe(true)
    expect(isBackchannelUri('https://other.example.com/logout', redirect)).toBe(false)
  })

  it('rejects wildcard/query/invalid backchannel URLs', () => {
    expect(isBackchannelUri('https://app.example.com/*', redirect)).toBe(false)
    expect(isBackchannelUri('https://app.example.com/logout?x=1', redirect)).toBe(false)
    expect(isBackchannelUri('nonsense', redirect)).toBe(false)
  })
})

describe('parseScopes', () => {
  it('splits on whitespace/commas, trims, drops empties, and dedups', () => {
    expect(parseScopes('openid  profile, email ,, openid')).toEqual(['openid', 'profile', 'email'])
    expect(parseScopes('   ')).toEqual([])
  })
})

describe('validateClientCreateForm', () => {
  it('returns an empty map for a fully valid form', () => {
    expect(validateClientCreateForm(baseForm(), ['openid', 'profile'])).toEqual({})
  })

  it('flags each invalid field with its i18n key', () => {
    const errors = validateClientCreateForm(
      {
        display_name: '   ',
        client_id: 'Bad ID',
        owner_email: 'nope',
        client_type: null,
        category: '',
        redirect_uri: 'https://app.example.com/cb?x=1',
        backchannel_logout_uri: 'https://other.example.com/logout',
      },
      [],
    )
    expect(errors).toEqual({
      display_name: 'clients.validation_display_name',
      client_id: 'clients.validation_client_id',
      owner_email: 'clients.validation_owner_email',
      client_type: 'clients.validation_client_type',
      category: 'clients.validation_category',
      redirect_uri: 'clients.validation_redirect_uri',
      backchannel_logout_uri: 'clients.validation_logout_uri',
      scopes: 'clients.validation_scopes',
    })
  })

  it('requires scopes to be non-empty AND include openid', () => {
    expect(validateClientCreateForm(baseForm(), ['profile'])).toEqual({
      scopes: 'clients.validation_scopes',
    })
    expect(validateClientCreateForm(baseForm(), [])).toEqual({
      scopes: 'clients.validation_scopes',
    })
  })
})

describe('toClientCreatePayload', () => {
  it('derives base url / callback path and pins environment + provisioning', () => {
    const payload = toClientCreatePayload(baseForm(), ['openid', 'profile'])
    expect(payload).toEqual({
      app_name: 'Selamat Kerja',
      client_id: 'selamat-kerja',
      environment: 'development',
      client_type: 'confidential',
      app_base_url: 'https://app.example.com',
      callback_path: '/auth/callback',
      logout_path: '/auth/backchannel/logout',
      owner_email: 'ops@example.com',
      provisioning: 'jit',
      allowed_scopes: ['openid', 'profile'],
      category: 'kepegawaian',
    })
  })

  it('uses the backchannel pathname as logout_path when present', () => {
    const form = { ...baseForm(), backchannel_logout_uri: 'https://app.example.com/auth/logout' }
    expect(toClientCreatePayload(form, ['openid']).logout_path).toBe('/auth/logout')
  })

  it('throws when client_type or category is unset', () => {
    expect(() => toClientCreatePayload({ ...baseForm(), client_type: null }, ['openid'])).toThrow()
    expect(() => toClientCreatePayload({ ...baseForm(), category: '' }, ['openid'])).toThrow()
  })
})

describe('validateUriPolicy', () => {
  const ok = {
    redirect_uris: ['https://app.example.com/auth/callback'],
    post_logout_redirect_uris: ['https://app.example.com/auth/loggedout'],
    backchannel_logout_uri: 'https://app.example.com/auth/backchannel',
  }

  it('returns null for a fully valid policy', () => {
    expect(validateUriPolicy(ok)).toBeNull()
  })

  it('requires at least one valid redirect URI', () => {
    expect(
      validateUriPolicy({ redirect_uris: [], post_logout_redirect_uris: [], backchannel_logout_uri: '' }),
    ).toBe('clients.validation_redirect_uri')
    expect(validateUriPolicy({ ...ok, redirect_uris: ['https://app.example.com/cb?x=1'] })).toBe(
      'clients.validation_redirect_uri',
    )
  })

  it('rejects an invalid post-logout URI and an origin mismatch', () => {
    expect(validateUriPolicy({ ...ok, post_logout_redirect_uris: ['not a url'] })).toBe(
      'clients.validation_logout_uri',
    )
    expect(
      validateUriPolicy({ ...ok, post_logout_redirect_uris: ['https://evil.example.com/out'] }),
    ).toBe('clients.validation_logout_origin')
  })

  it('rejects duplicate URIs across redirect + logout', () => {
    expect(
      validateUriPolicy({
        redirect_uris: ['https://app.example.com/auth/callback'],
        post_logout_redirect_uris: ['https://app.example.com/auth/callback'],
        backchannel_logout_uri: '',
      }),
    ).toBe('clients.validation_uri_duplicate')
  })

  it('rejects an invalid or cross-origin backchannel URI', () => {
    expect(validateUriPolicy({ ...ok, backchannel_logout_uri: 'nonsense' })).toBe(
      'clients.validation_logout_uri',
    )
    expect(
      validateUriPolicy({ ...ok, backchannel_logout_uri: 'https://evil.example.com/bc' }),
    ).toBe('clients.validation_logout_origin')
  })
})

describe('scope catalog helpers', () => {
  const catalog = [scope('openid'), scope('profile'), scope('email')]

  it('mergeAvailableScopes appends client-only scopes after the catalog', () => {
    expect(mergeAvailableScopes(catalog, ['openid', 'legacy:read'])).toEqual([
      'openid',
      'profile',
      'email',
      'legacy:read',
    ])
  })

  it('scopeParityWarnings lists client scopes absent from the catalog', () => {
    expect(scopeParityWarnings(catalog, ['openid', 'legacy:read', 'ghost'])).toEqual([
      'legacy:read',
      'ghost',
    ])
    expect(scopeParityWarnings(catalog, ['openid', 'profile'])).toEqual([])
  })
})
```

2. [ ] Run it — expect **FAIL** (module `../client-create-form` does not exist → import/resolution error):
   `npm run test -- app/lib/clients/__tests__/client-create-form.spec.ts`

3. [ ] Implement `app/lib/clients/client-create-form.ts` (FULL code):

```ts
// Single source of truth for client URI + create-form validation. The legacy
// SPA shipped TWO divergent URI validators — the strict create-form rules and
// the looser list-page `findUriValidationMessages` (URL.canParse only,
// hard-coded Indonesian strings). This module consolidates BOTH onto the
// stricter create-form rules and returns i18n KEYS only (never literal copy).
// The client_id regex matches the backend integration contract: 3–63 chars,
// lowercase alnum + hyphen, must start alnum. No Nuxt, no network. No
// client_secret is read or constructed here.

import type {
  ClientCategory,
  ClientCreatePayload,
  ClientType,
  ScopeCatalogEntry,
} from '@/types/clients.types'

export type ClientCreateForm = {
  display_name: string
  client_id: string
  owner_email: string
  client_type: ClientType | null
  category: ClientCategory | ''
  redirect_uri: string
  backchannel_logout_uri: string
}

const CLIENT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{2,62}$/u
const OWNER_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u
const DEFAULT_LOGOUT_PATH = '/auth/backchannel/logout'

export function slugifyClientId(displayName: string): string {
  return displayName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 63)
}

export function isValidClientId(value: string): boolean {
  return CLIENT_ID_PATTERN.test(value)
}

export function isValidOwnerEmail(value: string): boolean {
  return OWNER_EMAIL_PATTERN.test(value)
}

// Strict redirect rule (the consolidated source of truth): a parseable URL,
// http/https only, no `*` wildcard, no query string.
export function isRedirectUri(value: string): boolean {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
  if (value.includes('*')) return false
  if (url.search !== '') return false
  return true
}

// Backchannel logout is optional; when present it follows the redirect rules
// AND must share the redirect's origin.
export function isBackchannelUri(value: string, redirectUri: string): boolean {
  if (value.trim() === '') return true
  if (!isRedirectUri(value)) return false
  try {
    return new URL(value).origin === new URL(redirectUri).origin
  } catch {
    return false
  }
}

export function parseScopes(value: string): readonly string[] {
  const parts = value
    .split(/[\s,]+/u)
    .map((s) => s.trim())
    .filter((s) => s !== '')
  return [...new Set(parts)]
}

export function validateClientCreateForm(
  form: ClientCreateForm,
  selectedScopes: readonly string[],
): Readonly<Record<string, string>> {
  const errors: Record<string, string> = {}
  if (form.display_name.trim() === '') errors.display_name = 'clients.validation_display_name'
  if (!isValidClientId(form.client_id)) errors.client_id = 'clients.validation_client_id'
  if (!isValidOwnerEmail(form.owner_email)) errors.owner_email = 'clients.validation_owner_email'
  if (form.client_type == null) errors.client_type = 'clients.validation_client_type'
  if (form.category === '') errors.category = 'clients.validation_category'
  if (!isRedirectUri(form.redirect_uri)) errors.redirect_uri = 'clients.validation_redirect_uri'
  if (!isBackchannelUri(form.backchannel_logout_uri, form.redirect_uri)) {
    errors.backchannel_logout_uri = 'clients.validation_logout_uri'
  }
  if (selectedScopes.length === 0 || !selectedScopes.includes('openid')) {
    errors.scopes = 'clients.validation_scopes'
  }
  return errors
}

// Mirrors the backend ClientIntegrationContractBuilder: category is REQUIRED so
// a staff app can never be silently published as public. Throws on the unset
// invariants so callers must validate first.
export function toClientCreatePayload(
  form: ClientCreateForm,
  selectedScopes: readonly string[],
): ClientCreatePayload {
  if (form.client_type == null) throw new Error('client_type is required')
  if (form.category === '') throw new Error('category is required')
  const redirect = new URL(form.redirect_uri)
  const backchannel = form.backchannel_logout_uri.trim()
  const logoutPath = backchannel === '' ? DEFAULT_LOGOUT_PATH : new URL(backchannel).pathname
  return {
    app_name: form.display_name.trim(),
    client_id: form.client_id,
    environment: 'development',
    client_type: form.client_type,
    app_base_url: redirect.origin,
    callback_path: redirect.pathname,
    logout_path: logoutPath,
    owner_email: form.owner_email.trim(),
    provisioning: 'jit',
    allowed_scopes: [...selectedScopes],
    category: form.category,
  }
}

// Consolidated edit-form validator: one i18n key or null. Reuses the strict
// create-form rules so the edit form and create form agree byte-for-byte.
export function validateUriPolicy(input: {
  redirect_uris: readonly string[]
  post_logout_redirect_uris: readonly string[]
  backchannel_logout_uri: string
}): string | null {
  const redirects = input.redirect_uris.map((u) => u.trim()).filter((u) => u !== '')
  if (redirects.length === 0) return 'clients.validation_redirect_uri'
  for (const uri of redirects) {
    if (!isRedirectUri(uri)) return 'clients.validation_redirect_uri'
  }
  const baseOrigin = new URL(redirects[0]!).origin

  const logouts = input.post_logout_redirect_uris.map((u) => u.trim()).filter((u) => u !== '')
  for (const uri of logouts) {
    if (!isRedirectUri(uri)) return 'clients.validation_logout_uri'
    if (new URL(uri).origin !== baseOrigin) return 'clients.validation_logout_origin'
  }

  const all = [...redirects, ...logouts]
  if (new Set(all).size !== all.length) return 'clients.validation_uri_duplicate'

  const backchannel = input.backchannel_logout_uri.trim()
  if (backchannel !== '') {
    if (!isRedirectUri(backchannel)) return 'clients.validation_logout_uri'
    if (new URL(backchannel).origin !== baseOrigin) return 'clients.validation_logout_origin'
  }
  return null
}

export function mergeAvailableScopes(
  catalog: readonly ScopeCatalogEntry[],
  clientScopes: readonly string[],
): readonly string[] {
  const names = catalog.map((entry) => entry.name)
  const known = new Set(names)
  const extra = clientScopes.filter((scope) => !known.has(scope))
  return [...names, ...new Set(extra)]
}

export function scopeParityWarnings(
  catalog: readonly ScopeCatalogEntry[],
  clientScopes: readonly string[],
): readonly string[] {
  const known = new Set(catalog.map((entry) => entry.name))
  return clientScopes.filter((scope) => !known.has(scope))
}
```

4. [ ] Run it — expect **PASS** (all suites green):
   `npm run test -- app/lib/clients/__tests__/client-create-form.spec.ts`

5. [ ] Refactor pass — confirm nothing to extract: the module is flat pure functions; the redirect/origin parsing is already shared via `isRedirectUri`/`isBackchannelUri` (no duplicated `new URL(...)` validation logic), and there is no overlap with `app/lib/status-tone.ts` or `app/lib/clients/clients-view-state.ts`. Confirm no traceability markers, no hard-coded UI copy (only i18n keys), and no `client_secret` reference. Re-run, still green:
   `npm run test -- app/lib/clients/__tests__/client-create-form.spec.ts`

6. [ ] Commit:
   `git add app/lib/clients/client-create-form.ts app/lib/clients/__tests__/client-create-form.spec.ts && git commit -m "$(printf 'feat(sso-admin-frontend): pure client create-form + URI-policy + scope-catalog validation\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"`

**Task DoD gate** (run from `services/sso-admin-frontend`; report any blocked command explicitly, never claim PASS for a command that did not run):
`npm run test -- app/lib/clients/__tests__/client-create-form.spec.ts && npm run typecheck && npm run lint && npm run format:check`

**Deliverable:** the single-source-of-truth validation module (client_id slug + regex, owner-email, strict redirect/backchannel URI, category + client_type required, scopes incl. `openid`), the `toClientCreatePayload` builder (`development`/`jit`, derived base-url/callback/logout paths), the consolidated `validateUriPolicy` edit-form validator returning i18n keys, and the `mergeAvailableScopes`/`scopeParityWarnings` scope-catalog helpers — all unit-tested, no Nuxt, no network, no secret.

---

### Task 5.4: Clients service over api-client + Nitro proxy allow-list

A typed `clientsApi` (copy-and-adapt of `app/services/users.api.ts`): one method per backend Clients endpoint, each calling `apiClient.<verb><T>('/api/admin/…')` against a same-origin BFF path. This is the **single network seam** for the whole Clients domain — every composable, page, and action reaches the backend only through `clientsApi`. The Nitro proxy (`server/utils/admin-proxy.ts`) injects the Bearer token from `event.context` and rewrites `/api/admin/*` → `/admin/api/*`; the SPA stays token-blind.

The **split path scheme is load-bearing** (Global Constraints): read/update/scope-sync/delete/rotate use `/api/admin/clients*`; create/stage/activate/disable/decommission/registrations use `/api/admin/client-integrations*`. There is **no** `POST /api/admin/clients` — new clients are created via `POST /api/admin/client-integrations`. Optional payload fields are omitted when empty (`...(x && { x })`) so the backend's `sometimes`/`nullable` validators never see `''`/`undefined`; the one exception is `backchannel_logout_uri`, where `null` is a meaningful "clear the URI" state and so is forwarded whenever `!== undefined`.

This task is a **pure forwarding seam** — no rendering, no hydration, no error mapping, no secret handling. Two consequences, both mirroring Phase-4 Task 4.3:

- **Privileged-action matrix is out of scope here.** `create`/`rotateSecret`/`update`/`syncScopes`/`activate`/`disable`/`decommission`/`delete` are destructive/privileged, but the `401/403/419/422/428/429/5xx` + step-up matrix and the `PrivilegedActionDialog` confirm/impact UI are exercised against the shared Phase-4 infra at the composable/component boundary (Tasks 5.10–5.13), not at the pure service seam. The seam only forwards verb + path + body.
- **No SSR / `__NUXT__` assertions here.** This task neither renders client data nor enters the hydration payload, so the SSR token-leak gate (the `client_secret` sentinel + field-name checks) is extended in **Task 5.14**, not 5.4. The plaintext-secret responses (`create` confidential, `rotateSecret`) are forwarded through unchanged and **never** logged or copied by the service — a test asserts the response is returned by identity (`toBe`), proving the seam neither persists nor transforms the secret-bearing payload. The one-time-reveal-modal discipline lives in Tasks 5.9/5.10/5.12.

The Nitro allow-list **already contains** all but one client route (extract-foundation §12): exact `GET /api/admin/clients`, `GET /api/admin/scopes`, `GET /api/admin/client-integrations/registrations`, `POST /api/admin/client-integrations`, `POST /api/admin/client-integrations/stage`; patterns for `GET|PATCH|DELETE /api/admin/clients/:id`, `PUT …/scopes`, `POST …/rotate-secret`, `POST /api/admin/client-integrations/:id/disable|decommission`. Add the **one missing** entry: pattern `POST /api/admin/client-integrations/:id/activate` (parameterised, so a new `RegExp` using the existing `CLIENT_ID_PATTERN`).

**Files**
- Create: `services/sso-admin-frontend/app/services/clients.api.ts`
- Modify: `services/sso-admin-frontend/server/utils/admin-proxy.ts` (add the `activate` pattern)
- Test: `services/sso-admin-frontend/app/services/__tests__/clients.api.spec.ts`
- Modify (extend): `services/sso-admin-frontend/server/__tests__/admin-proxy.spec.ts` (assert `activate` builds, is Bearer-injected, maps `/api/admin/*`→`/admin/api/*`; assert the unlisted `POST /api/admin/clients` is rejected — proving the split path scheme)

**Interfaces**
- Produces (`app/services/clients.api.ts`): `export const clientsApi` with:
  - `list(): Promise<ClientListResponse>` → `GET /api/admin/clients`
  - `registrations(): Promise<ClientRegistrationsResponse>` → `GET /api/admin/client-integrations/registrations`
  - `show(clientId: string): Promise<ClientDetailResponse>` → `GET /api/admin/clients/${clientId}`
  - `getScopes(): Promise<ScopeCatalogResponse>` → `GET /api/admin/scopes`
  - `create(payload: ClientCreatePayload): Promise<CreateClientResponse>` → `POST /api/admin/client-integrations`
  - `stage(payload: ClientCreatePayload): Promise<ClientIntegrationResponse>` → `POST /api/admin/client-integrations/stage`
  - `update(clientId: string, payload: ClientUpdatePayload): Promise<ClientMutationResponse>` → `PATCH /api/admin/clients/${clientId}`
  - `syncScopes(clientId: string, payload: SyncScopesPayload): Promise<ClientMutationResponse>` → `PUT /api/admin/clients/${clientId}/scopes`
  - `rotateSecret(clientId: string): Promise<RotateSecretResponse>` → `POST /api/admin/clients/${clientId}/rotate-secret` (no body)
  - `activate(clientId: string, payload: ActivatePayload): Promise<ClientIntegrationResponse>` → `POST /api/admin/client-integrations/${clientId}/activate`
  - `disable(clientId: string, payload: DisablePayload): Promise<ClientIntegrationResponse>` → `POST /api/admin/client-integrations/${clientId}/disable`
  - `decommission(clientId: string, payload: DecommissionPayload): Promise<ClientIntegrationResponse>` → `POST /api/admin/client-integrations/${clientId}/decommission`
  - `delete(clientId: string): Promise<DeleteClientResponse>` → `DELETE /api/admin/clients/${clientId}`
- Produces (`server/utils/admin-proxy.ts`): `ALLOWED_ADMIN_ROUTE_PATTERNS` gains `new RegExp(\`^POST /api/admin/client-integrations/${CLIENT_ID_PATTERN}/activate$\`, 'u')`.
- Consumes: `apiClient` (`@/lib/api/api-client`); all request/response types from `@/types/clients.types` (Task 5.1). Proxy reuses the existing `CLIENT_ID_PATTERN`, `ALLOWED_ADMIN_ROUTES`, `ALLOWED_ADMIN_ROUTE_PATTERNS`, `buildAdminApiRequest`. Copy-and-adapt template: `app/services/users.api.ts`.

**Steps**

1. [ ] Write the failing test `services/sso-admin-frontend/app/services/__tests__/clients.api.spec.ts` (real assertions on path/verb/body for all 13 methods, incl. empty-omit, `backchannel_logout_uri: null` preservation, and secret-payload pass-through by identity):

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ActivatePayload,
  ClientCreatePayload,
  ClientUpdatePayload,
  CreateClientResponse,
  DecommissionPayload,
  DisablePayload,
  RotateSecretResponse,
  SyncScopesPayload,
} from '@/types/clients.types'

const get = vi.fn<(path: string) => Promise<unknown>>()
const post = vi.fn<(path: string, body?: unknown) => Promise<unknown>>()
const patch = vi.fn<(path: string, body?: unknown) => Promise<unknown>>()
const put = vi.fn<(path: string, body?: unknown) => Promise<unknown>>()
const del = vi.fn<(path: string) => Promise<unknown>>()
vi.mock('@/lib/api/api-client', () => ({
  apiClient: { get, post, patch, put, delete: del },
}))

const { clientsApi } = await import('../clients.api')

const draft: ClientCreatePayload = {
  app_name: 'Sample Portal',
  client_id: 'sample-portal',
  environment: 'development',
  client_type: 'confidential',
  app_base_url: 'https://sample.example',
  callback_path: '/auth/callback',
  logout_path: '/auth/backchannel/logout',
  owner_email: 'owner@example.com',
  provisioning: 'jit',
  allowed_scopes: ['openid', 'profile'],
  category: 'publik',
}

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  patch.mockReset()
  put.mockReset()
  del.mockReset()
})

describe('clientsApi — read seam (clients* paths)', () => {
  it('list() GETs the same-origin client list path and passes the DTO through', async () => {
    const payload = { clients: [] }
    get.mockResolvedValue(payload)
    await expect(clientsApi.list()).resolves.toBe(payload)
    expect(get).toHaveBeenCalledWith('/api/admin/clients')
  })

  it('registrations() GETs the client-integrations registrations path', async () => {
    const payload = { registrations: [] }
    get.mockResolvedValue(payload)
    await expect(clientsApi.registrations()).resolves.toBe(payload)
    expect(get).toHaveBeenCalledWith('/api/admin/client-integrations/registrations')
  })

  it('show() GETs the detail path for the client id', async () => {
    const payload = { client: {} }
    get.mockResolvedValue(payload)
    await expect(clientsApi.show('portal')).resolves.toBe(payload)
    expect(get).toHaveBeenCalledWith('/api/admin/clients/portal')
  })

  it('getScopes() GETs the scope catalog path', async () => {
    const payload = { scopes: [] }
    get.mockResolvedValue(payload)
    await expect(clientsApi.getScopes()).resolves.toBe(payload)
    expect(get).toHaveBeenCalledWith('/api/admin/scopes')
  })
})

describe('clientsApi — integration create/stage (client-integrations* paths)', () => {
  it('create() POSTs the draft to /client-integrations and returns the secret-bearing response by identity', async () => {
    // The plaintext secret arrives only here, as the body of this POST. The seam
    // forwards the response untouched — never copies, transforms, or logs it.
    const response: CreateClientResponse = {
      registration: { client_id: 'sample-portal' },
      plaintext_secret: 'sample-plaintext-secret-not-real',
    }
    post.mockResolvedValue(response)
    await expect(clientsApi.create(draft)).resolves.toBe(response)
    expect(post).toHaveBeenCalledWith('/api/admin/client-integrations', draft)
  })

  it('stage() POSTs the draft to /client-integrations/stage', async () => {
    post.mockResolvedValue({ registration: {} })
    await clientsApi.stage(draft)
    expect(post).toHaveBeenCalledWith('/api/admin/client-integrations/stage', draft)
  })
})

describe('clientsApi — update + scope sync (clients* paths)', () => {
  it('update() PATCHes only the provided fields (empty omitted, null backchannel preserved)', async () => {
    patch.mockResolvedValue({ client: {} })
    const payload: ClientUpdatePayload = {
      display_name: 'Renamed Sample',
      backchannel_logout_uri: null,
      category: '' as never,
    }
    await clientsApi.update('portal', payload)
    expect(patch).toHaveBeenCalledWith('/api/admin/clients/portal', {
      display_name: 'Renamed Sample',
      backchannel_logout_uri: null,
    })
  })

  it('update() forwards redirect/post-logout arrays and category when present', async () => {
    patch.mockResolvedValue({ client: {} })
    const payload: ClientUpdatePayload = {
      owner_email: 'new-owner@example.com',
      redirect_uris: ['https://sample.example/callback'],
      post_logout_redirect_uris: ['https://sample.example'],
      category: 'kepegawaian',
    }
    await clientsApi.update('portal', payload)
    expect(patch).toHaveBeenCalledWith('/api/admin/clients/portal', {
      owner_email: 'new-owner@example.com',
      redirect_uris: ['https://sample.example/callback'],
      post_logout_redirect_uris: ['https://sample.example'],
      category: 'kepegawaian',
    })
  })

  it('syncScopes() PUTs the scopes to the clients scopes path', async () => {
    put.mockResolvedValue({ client: {} })
    const payload: SyncScopesPayload = { scopes: ['openid', 'profile'] }
    await clientsApi.syncScopes('portal', payload)
    expect(put).toHaveBeenCalledWith('/api/admin/clients/portal/scopes', {
      scopes: ['openid', 'profile'],
    })
  })
})

describe('clientsApi — secret rotation (clients* path)', () => {
  it('rotateSecret() POSTs the rotate-secret path with no body and returns the response by identity', async () => {
    const response: RotateSecretResponse = {
      rotation: {
        client_id: 'portal',
        plaintext_once: 'sample-plaintext-rotation-not-real',
        plaintext_secret: 'sample-plaintext-rotation-not-real',
      },
    }
    post.mockResolvedValue(response)
    await expect(clientsApi.rotateSecret('portal')).resolves.toBe(response)
    expect(post).toHaveBeenCalledWith('/api/admin/clients/portal/rotate-secret')
  })
})

describe('clientsApi — lifecycle (client-integrations* paths)', () => {
  it('activate() POSTs secret_hash to the activate path when provided', async () => {
    post.mockResolvedValue({ registration: {} })
    const payload: ActivatePayload = { secret_hash: 'sample-hash' }
    await clientsApi.activate('newapp', payload)
    expect(post).toHaveBeenCalledWith('/api/admin/client-integrations/newapp/activate', {
      secret_hash: 'sample-hash',
    })
  })

  it('activate() omits secret_hash when empty', async () => {
    post.mockResolvedValue({ registration: {} })
    await clientsApi.activate('newapp', {})
    expect(post).toHaveBeenCalledWith('/api/admin/client-integrations/newapp/activate', {})
  })

  it('disable() POSTs the reason to the disable path', async () => {
    post.mockResolvedValue({ registration: {} })
    const payload: DisablePayload = { reason: 'Offboarded (sample).' }
    await clientsApi.disable('newapp', payload)
    expect(post).toHaveBeenCalledWith('/api/admin/client-integrations/newapp/disable', {
      reason: 'Offboarded (sample).',
    })
  })

  it('disable() omits the reason when empty', async () => {
    post.mockResolvedValue({ registration: {} })
    await clientsApi.disable('newapp', {})
    expect(post).toHaveBeenCalledWith('/api/admin/client-integrations/newapp/disable', {})
  })

  it('decommission() POSTs the reason to the decommission path', async () => {
    post.mockResolvedValue({ registration: {} })
    const payload: DecommissionPayload = { reason: 'Retired (sample).' }
    await clientsApi.decommission('newapp', payload)
    expect(post).toHaveBeenCalledWith('/api/admin/client-integrations/newapp/decommission', {
      reason: 'Retired (sample).',
    })
  })

  it('delete() DELETEs the clients detail path', async () => {
    del.mockResolvedValue({ message: 'Client registration deleted successfully.' })
    await clientsApi.delete('portal')
    expect(del).toHaveBeenCalledWith('/api/admin/clients/portal')
  })
})
```

2. [ ] Run it — expect **FAIL** (`../clients.api` does not exist; the top-level `await import('../clients.api')` rejects, so every spec errors):
   `npm run test -- app/services/__tests__/clients.api.spec.ts`

3. [ ] Implement `services/sso-admin-frontend/app/services/clients.api.ts` (FULL code):

```ts
import { apiClient } from '@/lib/api/api-client'
import type {
  ActivatePayload,
  ClientCreatePayload,
  ClientDetailResponse,
  ClientIntegrationResponse,
  ClientListResponse,
  ClientMutationResponse,
  ClientRegistrationsResponse,
  ClientUpdatePayload,
  CreateClientResponse,
  DecommissionPayload,
  DeleteClientResponse,
  DisablePayload,
  RotateSecretResponse,
  ScopeCatalogResponse,
  SyncScopesPayload,
} from '@/types/clients.types'

// Same-origin BFF paths. The Nitro proxy (server/utils/admin-proxy.ts) injects
// the Bearer access token from event.context and rewrites /api/admin/* →
// /admin/api/* before forwarding to the backend. The browser/SPA is token-blind.
//
// This is the single network seam for the Clients domain. The SPLIT PATH SCHEME
// is load-bearing: read/update/scope-sync/delete/rotate use /api/admin/clients*;
// create/stage/activate/disable/decommission/registrations use
// /api/admin/client-integrations*. There is NO POST /api/admin/clients — new
// clients are created via POST /api/admin/client-integrations.
//
// Pure forwarding seam: no rendering, no error mapping, no secret handling. The
// plaintext client_secret returned by create (confidential) and rotateSecret is
// forwarded through UNCHANGED — never copied, transformed, persisted, or logged
// here; the one-time reveal modal owns it as a client-only ref (Tasks 5.9/5.10/5.12).
// Optional fields are omitted when empty so `sometimes`/`nullable` validators
// never see '' / undefined; backchannel_logout_uri is the exception — null is the
// meaningful "clear the URI" state, forwarded whenever it is not undefined.
function clientPath(clientId: string, action?: string): string {
  return action ? `/api/admin/clients/${clientId}/${action}` : `/api/admin/clients/${clientId}`
}

function integrationPath(clientId: string, action: string): string {
  return `/api/admin/client-integrations/${clientId}/${action}`
}

export const clientsApi = {
  list(): Promise<ClientListResponse> {
    return apiClient.get<ClientListResponse>('/api/admin/clients')
  },

  registrations(): Promise<ClientRegistrationsResponse> {
    return apiClient.get<ClientRegistrationsResponse>('/api/admin/client-integrations/registrations')
  },

  show(clientId: string): Promise<ClientDetailResponse> {
    return apiClient.get<ClientDetailResponse>(clientPath(clientId))
  },

  getScopes(): Promise<ScopeCatalogResponse> {
    return apiClient.get<ScopeCatalogResponse>('/api/admin/scopes')
  },

  create(payload: ClientCreatePayload): Promise<CreateClientResponse> {
    return apiClient.post<CreateClientResponse>('/api/admin/client-integrations', payload)
  },

  stage(payload: ClientCreatePayload): Promise<ClientIntegrationResponse> {
    return apiClient.post<ClientIntegrationResponse>('/api/admin/client-integrations/stage', payload)
  },

  update(clientId: string, payload: ClientUpdatePayload): Promise<ClientMutationResponse> {
    return apiClient.patch<ClientMutationResponse>(clientPath(clientId), {
      ...(payload.display_name !== undefined && { display_name: payload.display_name }),
      ...(payload.owner_email !== undefined && { owner_email: payload.owner_email }),
      ...(payload.redirect_uris && { redirect_uris: payload.redirect_uris }),
      ...(payload.post_logout_redirect_uris && {
        post_logout_redirect_uris: payload.post_logout_redirect_uris,
      }),
      ...(payload.backchannel_logout_uri !== undefined && {
        backchannel_logout_uri: payload.backchannel_logout_uri,
      }),
      ...(payload.category && { category: payload.category }),
    })
  },

  syncScopes(clientId: string, payload: SyncScopesPayload): Promise<ClientMutationResponse> {
    return apiClient.put<ClientMutationResponse>(clientPath(clientId, 'scopes'), {
      scopes: payload.scopes,
    })
  },

  rotateSecret(clientId: string): Promise<RotateSecretResponse> {
    return apiClient.post<RotateSecretResponse>(clientPath(clientId, 'rotate-secret'))
  },

  activate(clientId: string, payload: ActivatePayload): Promise<ClientIntegrationResponse> {
    return apiClient.post<ClientIntegrationResponse>(integrationPath(clientId, 'activate'), {
      ...(payload.secret_hash && { secret_hash: payload.secret_hash }),
    })
  },

  disable(clientId: string, payload: DisablePayload): Promise<ClientIntegrationResponse> {
    return apiClient.post<ClientIntegrationResponse>(integrationPath(clientId, 'disable'), {
      ...(payload.reason && { reason: payload.reason }),
    })
  },

  decommission(
    clientId: string,
    payload: DecommissionPayload,
  ): Promise<ClientIntegrationResponse> {
    return apiClient.post<ClientIntegrationResponse>(integrationPath(clientId, 'decommission'), {
      ...(payload.reason && { reason: payload.reason }),
    })
  },

  delete(clientId: string): Promise<DeleteClientResponse> {
    return apiClient.delete<DeleteClientResponse>(clientPath(clientId))
  },
}
```

4. [ ] Run it — expect **PASS** (all 16 clients.api specs green):
   `npm run test -- app/services/__tests__/clients.api.spec.ts`

5. [ ] Add the one missing proxy allow-list entry to `services/sso-admin-frontend/server/utils/admin-proxy.ts`:
   - In `ALLOWED_ADMIN_ROUTE_PATTERNS`, add directly after the existing `…/decommission$` pattern:
     ```ts
     new RegExp(`^POST /api/admin/client-integrations/${CLIENT_ID_PATTERN}/activate$`, 'u'),
     ```

6. [ ] Extend the failing proxy test `services/sso-admin-frontend/server/__tests__/admin-proxy.spec.ts` — add these specs inside the existing `describe('admin BFF API proxy', …)` block (the `session` fixture + `headers()` helper already exist in the file):

```ts
  it('allows POST /api/admin/client-integrations/:id/activate through the admin BFF API proxy', () => {
    const request = buildAdminApiRequest({
      internalBaseUrl: 'https://backend.internal',
      pathname: '/api/admin/client-integrations/newapp/activate',
      search: '',
      method: 'POST',
      headers: { accept: 'application/json', 'x-request-id': 'req-activate' },
      session,
    })

    expect(request.url).toBe('https://backend.internal/admin/api/client-integrations/newapp/activate')
    expect(request.init.method).toBe('POST')
    expect(headers(request).get('Authorization')).toBe('Bearer access-token-admin')
  })

  it('rejects POST /api/admin/clients — clients are created via client-integrations, not POST /clients', () => {
    // The split path scheme: GET /clients is allow-listed (path is known) but POST
    // is not — so the method, not the path, is the rejection reason.
    expect(() =>
      buildAdminApiRequest({
        internalBaseUrl: 'https://backend.internal',
        pathname: '/api/admin/clients',
        search: '',
        method: 'POST',
        headers: { accept: 'application/json' },
        session,
      }),
    ).toThrow('Admin API proxy method is not allowed.')
  })
```

7. [ ] Run the proxy suite — expect **PASS** (existing specs + the two new client-route specs green):
   `npm run test -- server/__tests__/admin-proxy.spec.ts`

8. [ ] Refactor pass (no behaviour change): confirm `clientPath`/`integrationPath` are the only places a client id is interpolated (no duplicated `/api/admin/clients/${…}` or `/api/admin/client-integrations/${…}` literals in callers); confirm no `fetch`/`$fetch` appears in `clients.api.ts`; confirm the new allow-list entries reuse the existing `CLIENT_ID_PATTERN` constant (not a re-declared regex). Re-run steps 4 and 7 to confirm still green.

9. [ ] Commit:
   `git add app/services/clients.api.ts app/services/__tests__/clients.api.spec.ts server/utils/admin-proxy.ts server/__tests__/admin-proxy.spec.ts && git commit -m "$(printf 'feat(sso-admin-frontend): clients service over api-client + proxy allow-list\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"`

**Task-scoped DoD** (run from `services/sso-admin-frontend`; report any blocked command explicitly, never claim PASS for a command that did not run):
`npm run typecheck && npm run lint && npm run format:check && npm run test -- app/services/__tests__/clients.api.spec.ts server/__tests__/admin-proxy.spec.ts`

---

### Task 5.5: List + detail + scope-catalog composables (SSR data boundaries)

Three thin `useAsyncData` wrappers over `clientsApi` — the SSR read seams the list page (5.7), detail page (5.8) and create page (5.10) compose against. `useClientsList` runs `clientsApi.list()` + `clientsApi.registrations()` in **parallel** inside **one** `useAsyncData`, merges them with `mergeClients` (Task 5.2), derives search/status-filter/pagination client-side over the hydrated list (the backend list has no query params), keeps `null` (no response) distinct from `[]` (answered-empty), and exposes `isStale` (a failed background refresh keeps the last good snapshot on screen). `useClientDetail` resolves one client by route param under a per-id key (id via `toValue`; Nuxt re-runs page setup on a param change, so a static per-client key is correct). `useScopeCatalog` fetches the scope catalog **failing closed** — any error yields `[]` so a catalog outage degrades the scope grid to "no catalog scopes" rather than blocking the page. All three resolve server-side so only masked DTOs (`has_secret_hash` only — never a secret) hydrate into `__NUXT_DATA__`; the Bearer token stays in Nitro `event.context`. Copy-and-adapt of `app/composables/useUsersList.ts` + `app/composables/useUserDetail.ts`; tested in `*.nuxt.spec.ts` with `useAsyncData` mocked at the boundary (`mockNuxtImport`).

**Files**
- Create: `app/composables/useClientsList.ts`
- Create: `app/composables/useClientDetail.ts`
- Create: `app/composables/useScopeCatalog.ts`
- Test: `app/composables/__tests__/useClientsList.nuxt.spec.ts`
- Test: `app/composables/__tests__/useClientDetail.nuxt.spec.ts`
- Test: `app/composables/__tests__/useScopeCatalog.nuxt.spec.ts`

**Interfaces**
- Produces (`app/composables/useClientsList.ts`):
  - `type UseClientsListReturn = { readonly clients: ComputedRef<readonly AdminClientListItem[] | null>; readonly filtered: ComputedRef<readonly AdminClientListItem[]>; readonly paged: ComputedRef<readonly AdminClientListItem[]>; readonly viewState: ComputedRef<ClientsViewState>; readonly total: ComputedRef<number>; readonly filteredTotal: ComputedRef<number>; readonly page: Ref<number>; readonly pageCount: ComputedRef<number>; readonly query: Ref<string>; readonly statusFilter: Ref<ClientsStatusFilter>; readonly requestId: ComputedRef<string | null>; readonly isStale: ComputedRef<boolean>; readonly refresh: () => Promise<void> }`
  - `function useClientsList(): UseClientsListReturn` — `useAsyncData` key `'admin-clients-list'`; handler runs `Promise.all([clientsApi.list(), clientsApi.registrations()])` then `mergeClients`.
- Produces (`app/composables/useClientDetail.ts`):
  - `type UseClientDetailReturn = { readonly client: ComputedRef<AdminClientDetail | null>; readonly viewState: ComputedRef<ClientDetailViewState>; readonly requestId: ComputedRef<string | null>; readonly refresh: () => Promise<void> }`
  - `function useClientDetail(clientId: MaybeRefOrGetter<string>): UseClientDetailReturn` — key `'admin-client-detail:' + id`.
- Produces (`app/composables/useScopeCatalog.ts`):
  - `type UseScopeCatalogReturn = { readonly scopes: ComputedRef<readonly ScopeCatalogEntry[]>; readonly pending: ComputedRef<boolean>; readonly error: ComputedRef<unknown> }`
  - `function useScopeCatalog(): UseScopeCatalogReturn` — key `'admin-scope-catalog'`, fails closed to `[]` on error.
- Consumes: `clientsApi` (Task 5.4); `mergeClients`/`filterClients`/`paginateClients`/`clientsPageCount`/`CLIENTS_PAGE_SIZE`/`ClientsStatusFilter` (Task 5.2); `resolveClientsViewState`/`resolveClientDetailViewState`/`ClientsViewState`/`ClientDetailViewState` (Task 5.1); `AdminClientListItem`/`AdminClientDetail`/`ClientDetailResponse`/`ScopeCatalogEntry`/`ScopeCatalogResponse` (Task 5.1); `ApiError`/`getLastRequestId` (`@/lib/api/api-client`). Copy-and-adapt templates: `app/composables/useUsersList.ts`, `app/composables/useUserDetail.ts`.

**Steps**

1. [ ] Write the failing list-composable test `app/composables/__tests__/useClientsList.nuxt.spec.ts` (real behaviour — parallel service wiring under the stable key, merge of list+registrations in the handler, view-state branches, search/filter/paginate, page reset, stale snapshot, redacted request id, refresh delegation, and a no-secret/no-token SSR-boundary assertion that still allows the public `client_id`):

```ts
// *.nuxt.spec.ts → routed to the 'nuxt' env where mockNuxtImport is available.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { ApiError } from '@/lib/api/api-client'
import { clientsApi } from '@/services/clients.api'
import { useClientsList } from '../useClientsList'
import type {
  AdminClientListItem,
  ClientListResponse,
  ClientRegistration,
  ClientRegistrationsResponse,
} from '@/types/clients.types'

vi.mock('@/services/clients.api', () => ({
  clientsApi: {
    list: vi.fn<() => Promise<ClientListResponse>>(),
    registrations: vi.fn<() => Promise<ClientRegistrationsResponse>>(),
  },
}))

// The composable's useAsyncData handler returns the MERGED list plus a captured
// request id; this controllable stand-in is shaped to match so the test can drive
// derived state and also exercise the real handler (Promise.all + mergeClients).
type ClientsListData = { readonly clients: readonly AdminClientListItem[]; readonly requestId: string | null }
const data = ref<ClientsListData | null>(null)
const pending = ref(false)
const error = ref<unknown>(null)
const refreshMock = vi.fn<() => Promise<void>>(async () => {})
let capturedKey: string | null = null
let capturedHandler: (() => Promise<ClientsListData>) | null = null

mockNuxtImport('useAsyncData', () => {
  return (key: string, handler: () => Promise<ClientsListData>) => {
    capturedKey = key
    capturedHandler = handler
    return { data, pending, error, refresh: refreshMock }
  }
})

// One fully-typed sample row; overrides keep each case readable. List/detail DTOs
// carry only `has_secret_hash` — never a secret — matching the live contract.
const base: AdminClientListItem = {
  client_id: 'portal-web',
  display_name: 'Portal Web',
  type: 'confidential',
  environment: 'live',
  app_base_url: 'https://portal.example.test',
  redirect_uris: ['https://portal.example.test/callback'],
  post_logout_redirect_uris: [],
  allowed_scopes: ['openid', 'profile'],
  backchannel_logout_uri: null,
  backchannel_logout_internal: false,
  owner_email: 'ops@example.test',
  provisioning: 'jit',
  status: 'active',
  category: 'publik',
  has_secret_hash: true,
}
const makeClient = (o: Partial<AdminClientListItem>): AdminClientListItem => ({ ...base, ...o })
const makeData = (clients: readonly AdminClientListItem[]): ClientsListData => ({ clients, requestId: null })

const ready: ClientsListData = makeData([
  makeClient({ client_id: 'portal-web', display_name: 'Portal Web', status: 'active' }),
  makeClient({ client_id: 'staff-console', display_name: 'Staff Console', category: 'kepegawaian', status: 'disabled' }),
])
const many: ClientsListData = makeData(
  Array.from({ length: 30 }, (_, i) =>
    makeClient({ client_id: `client-${i}`, display_name: `Client ${i}` }),
  ),
)

beforeEach(() => {
  data.value = null
  pending.value = false
  error.value = null
  capturedKey = null
  capturedHandler = null
  vi.clearAllMocks()
})
afterEach(() => vi.clearAllMocks())

describe('useClientsList', () => {
  it('wires the service under a stable asyncData key and fetches list + registrations in parallel, merged', async () => {
    const listResponse: ClientListResponse = {
      clients: [makeClient({ client_id: 'portal-web', display_name: 'Portal Web', status: 'active' })],
    }
    const stagedReg: ClientRegistration = {
      client_id: 'staged-only',
      display_name: 'Staged Only',
      redirect_uris: ['https://staged.example.test/callback'],
      status: 'staged',
      has_secret_hash: false,
    }
    const regsResponse: ClientRegistrationsResponse = { registrations: [stagedReg] }
    vi.mocked(clientsApi.list).mockResolvedValue(listResponse)
    vi.mocked(clientsApi.registrations).mockResolvedValue(regsResponse)

    useClientsList()
    expect(capturedKey).toBe('admin-clients-list')

    const result = await capturedHandler?.()
    expect(clientsApi.list).toHaveBeenCalledTimes(1)
    expect(clientsApi.registrations).toHaveBeenCalledTimes(1)
    // The staged registration-only row survives the merge alongside the runtime client.
    expect(result?.clients.map((c) => c.client_id).sort()).toEqual(['portal-web', 'staged-only'])
  })

  it('keeps null (no response) distinct from [] and derives loading / ready / empty', () => {
    const list = useClientsList()
    expect(list.viewState.value).toBe('loading')
    expect(list.clients.value).toBeNull()
    data.value = ready
    expect(list.viewState.value).toBe('ready')
    expect(list.clients.value).toHaveLength(2)
    data.value = makeData([])
    expect(list.clients.value).toEqual([])
    expect(list.viewState.value).toBe('empty')
  })

  it('applies the search query and status filter to derived rows', () => {
    data.value = ready
    const list = useClientsList()
    list.query.value = 'staff'
    expect(list.filtered.value.map((c) => c.client_id)).toEqual(['staff-console'])
    expect(list.filteredTotal.value).toBe(1)
    list.query.value = ''
    list.statusFilter.value = 'disabled'
    expect(list.filtered.value.map((c) => c.client_id)).toEqual(['staff-console'])
    expect(list.total.value).toBe(2)
  })

  it('paginates the filtered list and reports the page count', () => {
    data.value = many
    const list = useClientsList()
    expect(list.paged.value).toHaveLength(25)
    expect(list.pageCount.value).toBe(2)
    list.page.value = 2
    expect(list.paged.value).toHaveLength(5)
  })

  it('resets to page 1 when the query or status filter changes', async () => {
    data.value = many
    const list = useClientsList()
    list.page.value = 2
    list.query.value = 'Client 1'
    await nextTick()
    expect(list.page.value).toBe(1)
  })

  it('maps a first-load 403 to forbidden and exposes the redacted request id', () => {
    error.value = new ApiError(403, 'forbidden', 'forbidden', null, 'admin-req-DENIED42')
    const list = useClientsList()
    expect(list.viewState.value).toBe('forbidden')
    expect(list.requestId.value).toBe('admin-req-DENIED42')
  })

  it('maps a first-load 401 to unauthenticated', () => {
    error.value = new ApiError(401, 'no session')
    expect(useClientsList().viewState.value).toBe('unauthenticated')
  })

  it('keeps the last good list on a background refresh failure (stale)', () => {
    data.value = ready
    error.value = new ApiError(500, 'boom')
    const list = useClientsList()
    expect(list.viewState.value).toBe('ready')
    expect(list.isStale.value).toBe(true)
  })

  it('refresh() delegates to the underlying asyncData refresh', async () => {
    await useClientsList().refresh()
    expect(refreshMock).toHaveBeenCalledTimes(1)
  })

  it('hydrates only masked DTOs — no client_secret / token leaks, but the public client_id is present', () => {
    // This data boundary passes the masked backend DTO through verbatim; it must
    // never introduce a secret or token field. (The full SSR payload leak gate
    // over /clients is Task 5.14; this guards the composable boundary.)
    data.value = many
    const list = useClientsList()
    const serialized = JSON.stringify({ clients: list.clients.value, paged: list.paged.value })
    expect(serialized).not.toMatch(/client_secret|clientSecret|access_token|refresh_token|id_token|Bearer/i)
    // client_id is a public identifier and is expected to hydrate.
    expect(serialized).toContain('client-0')
  })
})
```

2. [ ] Run it — expect **FAIL** (`../useClientsList` does not exist → import/resolution error):
   `npm run test -- app/composables/__tests__/useClientsList.nuxt.spec.ts`
   Expected: `Error: Failed to load url @/composables/useClientsList` (or `Cannot find module '../useClientsList'`); suite reports failed, 0 passed.

3. [ ] Implement `app/composables/useClientsList.ts` (FULL code — copy-and-adapt of `useUsersList.ts`, with the parallel list+registrations merge in the handler):

```ts
import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'
import { ApiError, getLastRequestId } from '@/lib/api/api-client'
import { clientsApi } from '@/services/clients.api'
import { resolveClientsViewState, type ClientsViewState } from '@/lib/clients/clients-view-state'
import {
  CLIENTS_PAGE_SIZE,
  clientsPageCount,
  filterClients,
  mergeClients,
  paginateClients,
  type ClientsStatusFilter,
} from '@/lib/clients/clients-list'
import type { AdminClientListItem } from '@/types/clients.types'

// The handler returns the merged list plus the request id captured at fetch time,
// so a redacted support ref survives into the hydrated payload even on success.
type ClientsListData = {
  readonly clients: readonly AdminClientListItem[]
  readonly requestId: string | null
}

export type UseClientsListReturn = {
  readonly clients: ComputedRef<readonly AdminClientListItem[] | null>
  readonly filtered: ComputedRef<readonly AdminClientListItem[]>
  readonly paged: ComputedRef<readonly AdminClientListItem[]>
  readonly viewState: ComputedRef<ClientsViewState>
  readonly total: ComputedRef<number>
  readonly filteredTotal: ComputedRef<number>
  readonly page: Ref<number>
  readonly pageCount: ComputedRef<number>
  readonly query: Ref<string>
  readonly statusFilter: Ref<ClientsStatusFilter>
  readonly requestId: ComputedRef<string | null>
  readonly isStale: ComputedRef<boolean>
  readonly refresh: () => Promise<void>
}

export function useClientsList(): UseClientsListReturn {
  // Runs during SSR: the runtime clients and the staged registrations are fetched
  // in parallel and merged server-side, so the masked DTO hydrates with no client
  // flash. Only `has_secret_hash` crosses — never a secret — and the Bearer token
  // stays in the Nitro event.context, never reaching the page/__NUXT__.
  const { data, pending, error, refresh } = useAsyncData<ClientsListData>(
    'admin-clients-list',
    async () => {
      const [list, regs] = await Promise.all([clientsApi.list(), clientsApi.registrations()])
      return {
        clients: mergeClients(list.clients, regs.registrations),
        requestId: getLastRequestId(),
      }
    },
  )

  // `null` (no response yet) is kept distinct from `[]` (an answered, empty list)
  // so the view-state resolver tells "loading/error" apart from "empty".
  const clients = computed<readonly AdminClientListItem[] | null>(() => data.value?.clients ?? null)
  const rows = computed<readonly AdminClientListItem[]>(() => clients.value ?? [])

  const query = ref('')
  const statusFilter = ref<ClientsStatusFilter>('all')
  const page = ref(1)

  const filtered = computed<readonly AdminClientListItem[]>(() =>
    filterClients(rows.value, { query: query.value, status: statusFilter.value }),
  )
  const total = computed<number>(() => rows.value.length)
  const filteredTotal = computed<number>(() => filtered.value.length)
  const pageCount = computed<number>(() => clientsPageCount(filteredTotal.value, CLIENTS_PAGE_SIZE))
  const paged = computed<readonly AdminClientListItem[]>(() =>
    paginateClients(filtered.value, page.value, CLIENTS_PAGE_SIZE),
  )

  const viewState = computed<ClientsViewState>(() =>
    resolveClientsViewState({ pending: pending.value, error: error.value, list: clients.value }),
  )

  // A background refresh failed but we still hold a good list — keep it on screen
  // with a stale notice rather than blanking the table.
  const isStale = computed<boolean>(() => Boolean(error.value) && clients.value !== null)

  const requestId = computed<string | null>(() =>
    error.value instanceof ApiError
      ? (error.value.requestId ?? getLastRequestId())
      : (data.value?.requestId ?? getLastRequestId()),
  )

  // Reset to the first page whenever the result set changes, so a narrowing
  // search/filter never strands the operator on an out-of-range page.
  watch([query, statusFilter], () => {
    page.value = 1
  })

  return {
    clients,
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

4. [ ] Run it — expect **PASS**:
   `npm run test -- app/composables/__tests__/useClientsList.nuxt.spec.ts`
   Expected: `Test Files  1 passed (1)` · `Tests  10 passed (10)`.

5. [ ] Write the failing detail-composable test `app/composables/__tests__/useClientDetail.nuxt.spec.ts` (real behaviour — stable per-id key, distinct keys, getter support, ready/loading branches, `404 → not_found`, `403 → forbidden` + redacted ref, `401 → unauthenticated`, refresh delegation, and a no-secret pass-through assertion proving `has_secret_hash` surfaces but no secret/token does):

```ts
// *.nuxt.spec.ts → routed to the 'nuxt' env where mockNuxtImport is available.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { ApiError } from '@/lib/api/api-client'
import { clientsApi } from '@/services/clients.api'
import { useClientDetail } from '../useClientDetail'
import type { ClientDetailResponse } from '@/types/clients.types'

vi.mock('@/services/clients.api', () => ({
  clientsApi: { show: vi.fn<(id: string) => Promise<ClientDetailResponse>>() },
}))

const data = ref<ClientDetailResponse | null>(null)
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

// Detail DTO as the backend returns it: secret status is the `has_secret_hash`
// BOOLEAN plus rotation timestamps — never a secret value or field.
const ready: ClientDetailResponse = {
  client: {
    client_id: 'portal-web',
    display_name: 'Portal Web',
    type: 'confidential',
    environment: 'live',
    app_base_url: 'https://portal.example.test',
    redirect_uris: ['https://portal.example.test/callback'],
    post_logout_redirect_uris: [],
    allowed_scopes: ['openid', 'profile'],
    backchannel_logout_uri: null,
    backchannel_logout_internal: false,
    owner_email: 'ops@example.test',
    provisioning: 'jit',
    status: 'active',
    category: 'publik',
    has_secret_hash: true,
    activated_at: '2026-01-02T00:00:00Z',
    disabled_at: null,
    secret_rotated_at: '2026-06-01T00:00:00Z',
    secret_expires_at: '2027-06-01T00:00:00Z',
  },
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

describe('useClientDetail', () => {
  it('wires the service under a stable per-client asyncData key', () => {
    useClientDetail('portal-web')
    expect(capturedKey).toBe('admin-client-detail:portal-web')
    capturedHandler?.()
    expect(clientsApi.show).toHaveBeenCalledWith('portal-web')
  })

  it('keys distinctly per client id', () => {
    useClientDetail('client-a')
    expect(capturedKey).toBe('admin-client-detail:client-a')
    useClientDetail('client-b')
    expect(capturedKey).toBe('admin-client-detail:client-b')
  })

  it('accepts a getter for the client id', () => {
    useClientDetail(() => 'from-getter')
    expect(capturedKey).toBe('admin-client-detail:from-getter')
    capturedHandler?.()
    expect(clientsApi.show).toHaveBeenCalledWith('from-getter')
  })

  it('exposes the client from the ready response', () => {
    data.value = ready
    const detail = useClientDetail('portal-web')
    expect(detail.viewState.value).toBe('ready')
    expect(detail.client.value).toEqual(ready.client)
  })

  it('returns a null client before data resolves (loading)', () => {
    const detail = useClientDetail('portal-web')
    expect(detail.viewState.value).toBe('loading')
    expect(detail.client.value).toBeNull()
  })

  it('maps a first-load 404 to not_found', () => {
    error.value = new ApiError(404, 'not found')
    expect(useClientDetail('missing').viewState.value).toBe('not_found')
  })

  it('maps a first-load 403 to forbidden and exposes the redacted request id', () => {
    error.value = new ApiError(403, 'forbidden', 'forbidden', null, 'admin-req-DENIED42')
    const detail = useClientDetail('portal-web')
    expect(detail.viewState.value).toBe('forbidden')
    expect(detail.requestId.value).toBe('admin-req-DENIED42')
  })

  it('maps a first-load 401 to unauthenticated', () => {
    error.value = new ApiError(401, 'no session')
    expect(useClientDetail('portal-web').viewState.value).toBe('unauthenticated')
  })

  it('surfaces the has_secret_hash boolean but never a secret or token', () => {
    data.value = ready
    const client = useClientDetail('portal-web').client.value
    expect(client?.has_secret_hash).toBe(true)
    const serialized = JSON.stringify(client)
    expect(serialized).not.toMatch(/client_secret|clientSecret|access_token|refresh_token|id_token|Bearer/i)
    // client_id is a public identifier and is expected to surface.
    expect(serialized).toContain('portal-web')
  })

  it('refresh() delegates to the underlying asyncData refresh', async () => {
    await useClientDetail('portal-web').refresh()
    expect(refreshMock).toHaveBeenCalledTimes(1)
  })
})
```

6. [ ] Run it — expect **FAIL** (`../useClientDetail` does not exist):
   `npm run test -- app/composables/__tests__/useClientDetail.nuxt.spec.ts`
   Expected: `Error: Failed to load url @/composables/useClientDetail` (or `Cannot find module '../useClientDetail'`); suite reports failed, 0 passed.

7. [ ] Implement `app/composables/useClientDetail.ts` (FULL code — copy-and-adapt of `useUserDetail.ts`):

```ts
import { computed, toRaw, toValue, type ComputedRef, type MaybeRefOrGetter } from 'vue'
import { ApiError, getLastRequestId } from '@/lib/api/api-client'
import { clientsApi } from '@/services/clients.api'
import {
  resolveClientDetailViewState,
  type ClientDetailViewState,
} from '@/lib/clients/clients-view-state'
import type { AdminClientDetail, ClientDetailResponse } from '@/types/clients.types'

export type UseClientDetailReturn = {
  readonly client: ComputedRef<AdminClientDetail | null>
  readonly viewState: ComputedRef<ClientDetailViewState>
  readonly requestId: ComputedRef<string | null>
  readonly refresh: () => Promise<void>
}

export function useClientDetail(clientId: MaybeRefOrGetter<string>): UseClientDetailReturn {
  // ponytail: the id is resolved once at setup. Nuxt re-runs page setup on a
  // route-param change (navigating /clients/A → /clients/B remounts), so a static
  // per-client key is correct; make it reactive only if same-component id swaps
  // ever appear.
  const id = toValue(clientId)

  // Runs during SSR so the masked detail DTO resolves server-side and hydrates
  // into the payload (only `has_secret_hash` — never a secret). The Bearer token
  // stays in Nitro event.context and never reaches window.__NUXT__.
  const { data, pending, error, refresh } = useAsyncData<ClientDetailResponse>(
    'admin-client-detail:' + id,
    () => clientsApi.show(id),
  )

  // toRaw: the masked DTO is display-only; callers receive plain objects so
  // identity comparisons and toRaw-based deep picks behave as expected.
  const client = computed<AdminClientDetail | null>(() =>
    data.value != null ? toRaw(data.value.client) : null,
  )

  const viewState = computed<ClientDetailViewState>(() =>
    resolveClientDetailViewState({
      pending: pending.value,
      error: error.value,
      client: client.value,
    }),
  )

  const requestId = computed<string | null>(() =>
    error.value instanceof ApiError
      ? (error.value.requestId ?? getLastRequestId())
      : getLastRequestId(),
  )

  return {
    client,
    viewState,
    requestId,
    refresh: async () => {
      await refresh()
    },
  }
}
```

8. [ ] Run it — expect **PASS**:
   `npm run test -- app/composables/__tests__/useClientDetail.nuxt.spec.ts`
   Expected: `Test Files  1 passed (1)` · `Tests  11 passed (11)`.

9. [ ] Write the failing scope-catalog test `app/composables/__tests__/useScopeCatalog.nuxt.spec.ts` (real behaviour — stable key + service wiring, scopes exposed on success, **fails closed to `[]` on error even with stale data present**, pending/error pass-through):

```ts
// *.nuxt.spec.ts → routed to the 'nuxt' env where mockNuxtImport is available.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { ApiError } from '@/lib/api/api-client'
import { clientsApi } from '@/services/clients.api'
import { useScopeCatalog } from '../useScopeCatalog'
import type { ScopeCatalogResponse } from '@/types/clients.types'

vi.mock('@/services/clients.api', () => ({
  clientsApi: { getScopes: vi.fn<() => Promise<ScopeCatalogResponse>>() },
}))

const data = ref<ScopeCatalogResponse | null>(null)
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

const catalog: ScopeCatalogResponse = {
  scopes: [
    { name: 'openid', description: 'OpenID subject', claims: ['sub'], default_allowed: true },
    { name: 'profile', description: 'Profile claims', claims: ['name'], default_allowed: true },
  ],
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

describe('useScopeCatalog', () => {
  it('wires the scope service under a stable asyncData key', () => {
    useScopeCatalog()
    expect(capturedKey).toBe('admin-scope-catalog')
    capturedHandler?.()
    expect(clientsApi.getScopes).toHaveBeenCalledTimes(1)
  })

  it('exposes the catalog scopes when the fetch resolves', () => {
    data.value = catalog
    const { scopes } = useScopeCatalog()
    expect(scopes.value.map((s) => s.name)).toEqual(['openid', 'profile'])
  })

  it('returns an empty catalog before the fetch resolves', () => {
    const { scopes, pending: p } = useScopeCatalog()
    expect(scopes.value).toEqual([])
    p // pending tracked below
  })

  it('fails closed to [] on error — even if a stale catalog is still in data', () => {
    data.value = catalog
    error.value = new ApiError(500, 'catalog unavailable')
    const { scopes } = useScopeCatalog()
    expect(scopes.value).toEqual([])
  })

  it('passes pending and error through unchanged', () => {
    pending.value = true
    const err = new ApiError(503, 'down')
    error.value = err
    const c = useScopeCatalog()
    expect(c.pending.value).toBe(true)
    expect(c.error.value).toBe(err)
  })
})
```

10. [ ] Run it — expect **FAIL** (`../useScopeCatalog` does not exist):
    `npm run test -- app/composables/__tests__/useScopeCatalog.nuxt.spec.ts`
    Expected: `Error: Failed to load url @/composables/useScopeCatalog` (or `Cannot find module '../useScopeCatalog'`); suite reports failed, 0 passed.

11. [ ] Implement `app/composables/useScopeCatalog.ts` (FULL code):

```ts
import { computed, type ComputedRef } from 'vue'
import { clientsApi } from '@/services/clients.api'
import type { ScopeCatalogEntry, ScopeCatalogResponse } from '@/types/clients.types'

export type UseScopeCatalogReturn = {
  readonly scopes: ComputedRef<readonly ScopeCatalogEntry[]>
  readonly pending: ComputedRef<boolean>
  readonly error: ComputedRef<unknown>
}

export function useScopeCatalog(): UseScopeCatalogReturn {
  // Runs during SSR so the scope catalog hydrates with the page. It FAILS CLOSED:
  // any error yields [] so a catalog outage degrades the scope grid to "no catalog
  // scopes" rather than blocking client create/edit. The catalog carries no secret.
  const { data, pending, error } = useAsyncData<ScopeCatalogResponse>('admin-scope-catalog', () =>
    clientsApi.getScopes(),
  )

  const scopes = computed<readonly ScopeCatalogEntry[]>(() =>
    error.value ? [] : (data.value?.scopes ?? []),
  )

  return {
    scopes,
    pending: computed<boolean>(() => pending.value),
    error: computed<unknown>(() => error.value),
  }
}
```

12. [ ] Run it — expect **PASS**:
    `npm run test -- app/composables/__tests__/useScopeCatalog.nuxt.spec.ts`
    Expected: `Test Files  1 passed (1)` · `Tests  5 passed (5)`.

13. [ ] Refactor pass (no behaviour change): confirm all three read as verbatim mirrors of their Phase-4 templates — same import set, same `ApiError.requestId ?? getLastRequestId()` fallback, every return field `readonly`, no `any`, no extra abstraction, `null`-vs-`[]` distinction preserved. Re-run the three files together to confirm still green:
    `npm run test -- app/composables/__tests__/useClientsList.nuxt.spec.ts app/composables/__tests__/useClientDetail.nuxt.spec.ts app/composables/__tests__/useScopeCatalog.nuxt.spec.ts`

14. [ ] Commit (green only):

```
git add app/composables/useClientsList.ts app/composables/useClientDetail.ts app/composables/useScopeCatalog.ts app/composables/__tests__/useClientsList.nuxt.spec.ts app/composables/__tests__/useClientDetail.nuxt.spec.ts app/composables/__tests__/useScopeCatalog.nuxt.spec.ts && git commit -m "$(printf 'feat(sso-admin-frontend): clients list/detail/scope-catalog SSR composables\n\nWrap clientsApi in useAsyncData at three SSR data boundaries. useClientsList\nfetches list + registrations in parallel under admin-clients-list, merges them\nvia mergeClients, derives client-side search/filter/pagination, keeps null\ndistinct from [], and exposes a stale-snapshot flag. useClientDetail resolves\none client under a per-id key with a 404-aware view-state. useScopeCatalog\nfails closed to [] on error. Only masked DTOs (has_secret_hash, never a secret)\nhydrate; tested with useAsyncData mocked at the boundary.\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

**Deliverable:** three SSR-resolved composables — list (parallel merge + filter/paginate + stale) under `admin-clients-list`, detail (404-aware) under `admin-client-detail:<id>`, and the fail-closed scope catalog under `admin-scope-catalog` — hydrating masked DTOs only, all green.

**Task-scoped DoD gate (run from `services/sso-admin-frontend`; report any blocked command explicitly, never claim PASS for a command that did not run):**
`npm run test -- app/composables/__tests__/useClientsList.nuxt.spec.ts app/composables/__tests__/useClientDetail.nuxt.spec.ts app/composables/__tests__/useScopeCatalog.nuxt.spec.ts && npm run typecheck && npm run lint && npm run format:check`
(the full `npm run test && npm run build && npm run test:e2e` runs at the phase gate.)

---

### Task 5.6: ClientsTable.vue (Swiss domain table)

The client master list rendered as a hairline `UiDataList` (name · client id · category · status), with the `client_id` shown as a mono/folio composition element (column `variant: 'id'`), the client status shown as a `UiStatusBadge` (tone + label → **never colour-alone**, every client always carries a badge), the `category` shown as its own badge (`tone='brand'` for `kepegawaian`, neutral otherwise — paired with a label, never colour-alone), a per-row `#actions` "view" affordance that emits `select(client_id)`, and folio next/previous pagination via `UiDataList`'s `next`/`previous` plus a `NN / NN` page folio. Dumb/presentational: it receives pre-built, pre-localized, pre-masked rows and emits intents — it does no fetching, no view-state mapping, no localization, no API calls. Copy-and-adapt of `app/components/users/UsersTable.vue` (typed row, computed columns, `UiDataList` + per-cell slots). DS deps are imported explicitly (matching `UiDataList`'s own `import UiFolio from './UiFolio.vue'` style) so a plain `@vue/test-utils` mount resolves them without Nuxt auto-import.

> Note on category tone: the skeleton's `ClientsTableRow` carries only `category: string` (no `categoryTone`), so the component derives the badge tone from the value (`kepegawaian → 'brand'`, else `'neutral'`), honoring the Global-Constraints category-badge rule without widening the row type. The page passes the raw domain value (`publik` / `kepegawaian`) — those are the real category names, not fabricated labels, so they read clearly in Swiss copy.

**Files**
- Create: `app/components/clients/ClientsTable.vue`
- Test: `app/components/clients/__tests__/ClientsTable.spec.ts`

**Interfaces**
- Produces (`app/components/clients/ClientsTable.vue`):
  - `type ClientsTableRow = { readonly id: string; readonly name: string; readonly clientId: string; readonly category: string; readonly status: string; readonly statusTone: StatusTone }` (`id` = `client_id`, the row key; structurally a `UiDataListRow`)
  - Props: `{ caption: string; nameLabel: string; clientIdLabel: string; categoryLabel: string; statusLabel: string; viewLabel: string; rows: readonly ClientsTableRow[]; total: number; page?: number; pageCount?: number; nextLabel?: string; previousLabel?: string }`
  - Emits: `select(id: string)`, `next()`, `previous()`
- Consumes: `UiDataList` (+ `UiDataListColumn`, `UiDataListRow`) from `@/components/ui/UiDataList.vue`; `UiStatusBadge` from `@/components/ui/UiStatusBadge.vue`; `UiButton` from `@/components/ui/UiButton.vue`; `UiFolio` from `@/components/ui/UiFolio.vue`; `StatusTone` from `@/lib/status-tone`. Copy-and-adapt template: `app/components/users/UsersTable.vue`.

**Steps**

1. [ ] Write the failing test `app/components/clients/__tests__/ClientsTable.spec.ts` (real behaviour — rendered columns, status + category badge tones/labels, mono client id, row select emit, pagination emits, page folio, and a no-secret/no-token/no-raw-PII assertion over the rendered HTML; `client_id` IS allowed to render):

```ts
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ClientsTable, { type ClientsTableRow } from '../ClientsTable.vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'

// Rows read clearly as samples (Swiss: no fabricated personas/telemetry). They are
// already localized + masked by the page — this component is dumb. The badges land
// in column order per row: category, then status (name + clientId are plain cells).
const rows: readonly ClientsTableRow[] = [
  {
    id: 'portal-pegawai',
    name: 'Portal Pegawai',
    clientId: 'portal-pegawai',
    category: 'kepegawaian',
    status: 'Aktif',
    statusTone: 'success',
  },
  {
    id: 'layanan-publik',
    name: 'Layanan Publik',
    clientId: 'layanan-publik',
    category: 'publik',
    status: 'Staged',
    statusTone: 'warning',
  },
  {
    id: 'aplikasi-nonaktif',
    name: 'Aplikasi Nonaktif',
    clientId: 'aplikasi-nonaktif',
    category: 'publik',
    status: 'Nonaktif',
    statusTone: 'neutral',
  },
]

function mountTable() {
  return mount(ClientsTable, {
    props: {
      caption: 'Klien Terdaftar',
      nameLabel: 'Nama',
      clientIdLabel: 'Client ID',
      categoryLabel: 'Kategori',
      statusLabel: 'Status',
      viewLabel: 'Lihat',
      rows,
      total: 14,
      page: 1,
      pageCount: 3,
      nextLabel: 'Berikutnya',
      previousLabel: 'Sebelumnya',
    },
  })
}

describe('ClientsTable', () => {
  it('renders the caption, the column labels, and every row’s fields (incl. the mono client id)', () => {
    const wrapper = mountTable()
    expect(wrapper.text()).toContain('Klien Terdaftar')
    expect(wrapper.text()).toContain('Nama')
    expect(wrapper.text()).toContain('Client ID')
    expect(wrapper.text()).toContain('Kategori')
    expect(wrapper.text()).toContain('Status')
    expect(wrapper.text()).toContain('Portal Pegawai')
    // client_id is a public identifier and renders verbatim (the §7.3 folio/mono cell)
    expect(wrapper.text()).toContain('layanan-publik')
  })

  it('renders status AND category as UiStatusBadges — tone + label, never colour-alone', () => {
    const wrapper = mountTable()
    const badges = wrapper.findAllComponents(UiStatusBadge)
    // two badges per row (category, then status), in column order
    expect(badges).toHaveLength(rows.length * 2)
    expect(badges.map((b) => b.props('tone'))).toEqual([
      'brand', // row 0 category: kepegawaian
      'success', // row 0 status
      'neutral', // row 1 category: publik
      'warning', // row 1 status
      'neutral', // row 2 category: publik
      'neutral', // row 2 status
    ])
    // every badge carries a real text label (the shape/dot never stands alone)
    expect(badges.map((b) => b.props('label'))).toEqual([
      'kepegawaian',
      'Aktif',
      'publik',
      'Staged',
      'publik',
      'Nonaktif',
    ])
  })

  it('emits select(id) with the row client id when the row view action is clicked', async () => {
    const wrapper = mountTable()
    const viewButtons = wrapper.findAll('[data-testid="clients-row-view"]')
    expect(viewButtons).toHaveLength(rows.length)
    expect(viewButtons[0]!.text()).toBe('Lihat')
    await viewButtons[1]!.trigger('click')
    expect(wrapper.emitted('select')).toEqual([['layanan-publik']])
  })

  it('re-emits next() / previous() from the folio pagination controls', async () => {
    const wrapper = mountTable()
    await wrapper.get('[data-testid="data-list-next"]').trigger('click')
    await wrapper.get('[data-testid="data-list-previous"]').trigger('click')
    expect(wrapper.emitted('next')).toHaveLength(1)
    expect(wrapper.emitted('previous')).toHaveLength(1)
  })

  it('renders the page position as a folio numeral (page / pageCount)', () => {
    const wrapper = mountTable()
    expect(wrapper.get('[data-testid="clients-page-folio"]').text()).toMatch(/01\s*\/\s*03/)
  })

  it('omits the page folio when page / pageCount are not provided', () => {
    const wrapper = mount(ClientsTable, {
      props: {
        caption: 'Klien Terdaftar',
        nameLabel: 'Nama',
        clientIdLabel: 'Client ID',
        categoryLabel: 'Kategori',
        statusLabel: 'Status',
        viewLabel: 'Lihat',
        rows,
        total: 3,
      },
    })
    expect(wrapper.find('[data-testid="clients-page-folio"]').exists()).toBe(false)
    // no pagination buttons without labels
    expect(wrapper.find('[data-testid="data-list-next"]').exists()).toBe(false)
  })

  it('renders no client_secret (value/field name), token, or raw-PII digit run in its HTML', () => {
    const html = mountTable().html()
    expect(html).not.toMatch(
      /client_secret|clientSecret|access_token|refresh_token|id_token|Bearer|SENTINEL-/,
    )
    // raw NIK (16) / NIP (18) / NISN (10) shapes: any unbroken 10+ digit run is a leak.
    expect(html).not.toMatch(/\d{10,}/)
  })
})
```

2. [ ] Run it — expect **FAIL** (`../ClientsTable.vue` does not exist → import/resolution error):
   `npm run test -- app/components/clients/__tests__/ClientsTable.spec.ts`

3. [ ] Implement `app/components/clients/ClientsTable.vue` (FULL code):

```vue
<script setup lang="ts">
import { computed } from 'vue'
import UiDataList, {
  type UiDataListColumn,
  type UiDataListRow,
} from '@/components/ui/UiDataList.vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiFolio from '@/components/ui/UiFolio.vue'
import type { StatusTone } from '@/lib/status-tone'

export type ClientsTableRow = {
  readonly id: string
  readonly name: string
  readonly clientId: string
  readonly category: string
  readonly status: string
  readonly statusTone: StatusTone
}

const props = withDefaults(
  defineProps<{
    readonly caption: string
    readonly nameLabel: string
    readonly clientIdLabel: string
    readonly categoryLabel: string
    readonly statusLabel: string
    readonly viewLabel: string
    readonly rows: readonly ClientsTableRow[]
    readonly total: number
    readonly page?: number
    readonly pageCount?: number
    readonly nextLabel?: string
    readonly previousLabel?: string
  }>(),
  {
    page: undefined,
    pageCount: undefined,
    nextLabel: undefined,
    previousLabel: undefined,
  },
)

const emit = defineEmits<{
  (event: 'select', id: string): void
  (event: 'next'): void
  (event: 'previous'): void
}>()

const columns = computed<readonly UiDataListColumn[]>(() => [
  { key: 'name', label: props.nameLabel, align: 'left' },
  // client_id is a public identifier rendered as a mono/folio composition element
  { key: 'clientId', label: props.clientIdLabel, align: 'left', variant: 'id' },
  { key: 'category', label: props.categoryLabel, align: 'left' },
  { key: 'status', label: props.statusLabel, align: 'left' },
])

// ClientsTableRow is structurally assignable to UiDataListRow (every field is a
// string and it carries an `id`), so this is identity at runtime.
const dataRows = computed<readonly UiDataListRow[]>(() => props.rows)

const showFolio = computed<boolean>(() => props.page != null && props.pageCount != null)

// row.* arrives typed as string | number | null | undefined (UiDataListRow); the
// page only ever feeds well-formed ClientsTableRows, so narrow defensively.
function rowTone(value: unknown): StatusTone {
  return (typeof value === 'string' ? value : 'neutral') as StatusTone
}

// Category badge tone: staff apps are brand-toned, everything else neutral. Tone
// is derived (the row type carries no categoryTone) but never stands alone — the
// badge always pairs the dot with the category label.
function categoryTone(value: unknown): StatusTone {
  return String(value ?? '').toLowerCase() === 'kepegawaian' ? 'brand' : 'neutral'
}

function rowText(value: unknown): string {
  return value == null || value === '' ? '—' : String(value)
}
</script>

<template>
  <div class="clients-table" data-component="clients-table">
    <UiDataList
      :caption="caption"
      :columns="columns"
      :rows="dataRows"
      :total="total"
      :next-label="nextLabel"
      :previous-label="previousLabel"
      @next="emit('next')"
      @previous="emit('previous')"
    >
      <template #cell(category)="{ row }">
        <UiStatusBadge :tone="categoryTone(row.category)" :label="rowText(row.category)" />
      </template>
      <template #cell(status)="{ row }">
        <UiStatusBadge :tone="rowTone(row.statusTone)" :label="rowText(row.status)" />
      </template>
      <template #actions="{ row }">
        <UiButton
          variant="ghost"
          size="sm"
          data-testid="clients-row-view"
          @click="emit('select', String(row.id))"
        >
          {{ viewLabel }}
        </UiButton>
      </template>
    </UiDataList>

    <div v-if="showFolio" class="clients-table__pagefolio">
      <span data-testid="clients-page-folio">
        <UiFolio :index="page" :total="pageCount" variant="count" />
      </span>
    </div>
  </div>
</template>

<style scoped>
.clients-table {
  display: grid;
  gap: 12px;
}
.clients-table__pagefolio {
  display: flex;
  justify-content: flex-end;
  color: var(--fg-3);
}
</style>
```

> Note: `rowTone`/`categoryTone`/`rowText` take `unknown` to keep vue-tsc clean — `row.category`/`row.statusTone`/`row.status` (typed by `UiDataListRow` as `string | number | null | undefined`) are assignable to `unknown`, and the runtime narrowing is unchanged. Keep `:rows="dataRows"` (no template cast), exactly like `UsersTable.vue`. The mono/folio rendering of `client_id` is owned by `UiDataList` via the column `variant: 'id'` — the component does not hard-code `--font-mono`. Pagination buttons are owned by `UiDataList` (they render only when `nextLabel`/`previousLabel` are set, testids `data-list-next` / `data-list-previous`); this component only re-emits intents — disabling at page bounds is the page's job (Task 5.7).

4. [ ] Run it — expect **PASS**:
   `npm run test -- app/components/clients/__tests__/ClientsTable.spec.ts`

5. [ ] Refactor check (no behaviour change): confirm there are no hard-coded colours (both tones flow through `UiStatusBadge`/tokens), no shadows, `--font-mono` is untouched (the client id uses the `variant: 'id'` column + counts use `UiFolio`), red `--danger` is never introduced (this read-only table has no destructive affordance), and the component holds zero strings of its own — every label is a prop. Re-run the test to confirm still green.

6. [ ] Commit:
   `git add app/components/clients/ClientsTable.vue app/components/clients/__tests__/ClientsTable.spec.ts && git commit -m "$(printf 'feat(sso-admin-frontend): Swiss ClientsTable (UiDataList + folio client id + status/category badges + view action)\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"`

**Deliverable:** a tested presentational Swiss client table — mono/folio `client_id`, status + category badges (never colour-alone), per-row view action, folio pagination — with the no-secret/no-token/no-raw-PII HTML assertion green.

**Task DoD (run from `services/sso-admin-frontend`; report any blocked command explicitly, never claim PASS for a command that did not run):**
`npm run typecheck && npm run lint && npm run format:check && npm run test -- app/components/clients/__tests__/ClientsTable.spec.ts`
(the full `test` / `build` / `test:e2e` service gate runs in the Phase-5 final DoD task.)

---

### Task 5.7: Clients list page (all states, permission-gated, search/filter)

`app/pages/clients/index.vue` — the Clients master list: an **unconditional** masked-principal hero (eyebrow / title / summary + `signed_in_as` + folio record count) so the SSR leak gate's positive assertions hold in every state, then the six-state ladder driven by `useClientsList().viewState` — `loading`→`UiSkeleton`, `forbidden`→`UiStatusView tone=forbidden`, `unauthenticated`→`UiStatusView tone=step_up`, `error`→`UiStatusView tone=error` (+refresh action), `empty`→`UiEmptyState` (no-data vs no-permission distinct — see below), `ready`→`isStale` warning banner + search `UiInput` + status `UiSelect` + `ClientsTable`. A "New client" CTA (named route `admin.clients.create`) renders **only** when `hasPermission('admin.clients.write')`; row select navigates to the named route `admin.clients.detail`. This is a **read-only list surface** — it contains no write/destructive action, so the privileged-action matrix does **not** apply here; it **does** hydrate client rows, so it carries the no-token / no-`client_secret` / no-raw-PII SSR assertion (the `client_id` is a public identifier and IS allowed). Copy-and-adapt of `app/pages/users/index.vue`.

> **Empty no-data vs no-permission:** the page never reaches `viewState === 'empty'` for a non-admin — `admin-guard.global.ts` + `definePageMeta.permissions` redirect them to `/forbidden`, and a backend reject lands on `viewState === 'forbidden'`. So `empty` is unambiguously "no clients exist". The distinction is preserved structurally: `forbidden` (no permission / backend 403) and `empty` (authorized but zero rows) are **separate** ladder branches rendering different components (`UiStatusView` vs `UiEmptyState`) — the test asserts they never co-render.

**Files**
- Create: `app/pages/clients/index.vue`
- Modify: `app/locales/id.json`, `app/locales/en.json` (ADD only the genuinely-new keys below, to BOTH files, keeping id↔en parity; REUSE the existing `clients.*` namespace — do NOT add a `client.*` singular namespace)
- Test: `app/pages/__tests__/clients-list.page.nuxt.spec.ts`
- (Unchanged, must stay green) `app/pages/__tests__/route-map.spec.ts` — asserts the meta `name`/`layout`/`permissions`/`requiresAdmin` by source string match; if it enumerates expected routes, add `admin.clients` there.

**Interfaces**
- Produces: the rendered `/clients` route — `definePageMeta({ name: 'admin.clients', layout: 'admin', requiresAdmin: true, permissions: ['admin.clients.read'] })`. State ladder per above. Create CTA → `{ name: 'admin.clients.create' }`; row select → `navigateTo({ name: 'admin.clients.detail', params: { clientId } })`. **No exported API.** `useAsyncData` key `'admin-clients-principal'` (masked principal only).
- Consumes: `useClientsList` + `UseClientsListReturn` (Task 5.5); `ClientsTable` + `ClientsTableRow` (Task 5.6); `resolveClientStatusTone` + `CLIENT_STATUSES` (Task 5.1); `useSessionStore` (`principal.display_name`, `ensureSession`, `hasPermission`) (`@/stores/session.store`); `useI18n` (`@/composables/useI18n`); `UiSkeleton`/`UiStatusView`/`UiEmptyState`/`UiButton`/`UiInput`/`UiSelect` (+ `UiSelectOption`)/`UiFolio` (`@/components/ui/*`); `navigateTo`/`useAsyncData` (Nuxt auto-imports). Copy-and-adapt template: `app/pages/users/index.vue`.
- New locale keys (BOTH `id` + `en`, inside the existing `"clients"` block — these are absent today; everything else the page needs already exists: `eyebrow`, `title`, `summary`, `loading`, `forbidden_title`, `error_title`, `empty_title`, `empty_desc`, `btn_create_client`, `col_client`, `col_client_id`, `col_status`, `btn_view`, `search_label`, `search_placeholder`): `signed_in_as`, `filter_status`, `filter_all`, `col_category`, `page_next`, `page_previous`, `status_active`, `status_staged`, `status_disabled`, `status_decommissioned`. Category cell labels reuse the existing `category_public` (publik) / `category_staff` (kepegawaian).

> Ordering note: `admin.clients.detail` (Task 5.8) and `admin.clients.create` (Task 5.10) are built later. `experimental.typedPages` is off in `nuxt.config.ts`, so `navigateTo({ name: 'admin.clients.detail', … })` and `{ name: 'admin.clients.create' }` are untyped `RouteLocationRaw` — they typecheck and build now and resolve once 5.8/5.10 land. The page test mocks `navigateTo` and stubs `NuxtLink`, so no real navigation/route resolution is attempted here.

**Steps**

1. [ ] **RED** — write the failing test `app/pages/__tests__/clients-list.page.nuxt.spec.ts` (real behaviour; mocked at the data + store + navigation boundaries — `*.nuxt.spec.ts` routes to the `nuxt` env where `mountSuspended` + `mockNuxtImport` are available). Every `vi.fn` carries a type parameter (oxlint `vitest/require-mock-type-parameters`):

```ts
// *.nuxt.spec.ts → 'nuxt' env: mountSuspended drives the page's async setup
// (useAsyncData('admin-clients-principal') + useI18n auto-imports). The list
// composable, the session store, and navigateTo are mocked so each state is
// deterministic and no real network/navigation runs.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import ClientsTable from '@/components/clients/ClientsTable.vue'
import type { AdminClientListItem } from '@/types/clients.types'
import type { ClientsStatusFilter } from '@/lib/clients/clients-list'
import type { ClientsViewState } from '@/lib/clients/clients-view-state'

// A sample merged client row. It reads clearly as a sample. The list/detail DTOs
// carry ONLY has_secret_hash (a boolean) — never a client_secret value or field.
// client_id is a public identifier and is allowed to hydrate.
const sampleClient: AdminClientListItem = {
  client_id: 'portal-web',
  display_name: 'Operator Portal',
  type: 'confidential',
  environment: 'live',
  app_base_url: 'https://portal.example.test',
  redirect_uris: ['https://portal.example.test/callback'],
  post_logout_redirect_uris: [],
  allowed_scopes: ['openid', 'profile'],
  backchannel_logout_uri: null,
  backchannel_logout_internal: false,
  owner_email: 'owner@example.test',
  provisioning: 'jit',
  status: 'active',
  category: 'kepegawaian',
  has_secret_hash: true,
}

const paged = ref<readonly AdminClientListItem[]>([])
const viewState = ref<ClientsViewState>('loading')
const requestId = ref<string | null>(null)
const total = ref(0)
const filteredTotal = ref(0)
const page = ref(1)
const pageCount = ref(1)
const query = ref('')
const statusFilter = ref<ClientsStatusFilter>('all')
const isStale = ref(false)
const refreshMock = vi.fn<() => Promise<void>>(async () => {})

vi.mock('@/composables/useClientsList', () => ({
  useClientsList: () => ({
    clients: ref([]),
    filtered: ref([]),
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
    refresh: refreshMock,
  }),
}))

const canWrite = ref(true)
vi.mock('@/stores/session.store', () => ({
  useSessionStore: () => ({
    principal: { display_name: 'Admin Sentinel' },
    ensureSession: vi.fn<() => Promise<string>>(async () => 'authenticated'),
    hasPermission: (permission: string) =>
      permission === 'admin.clients.write' ? canWrite.value : true,
  }),
}))

// vi.hoisted ensures navigateMock exists before mockNuxtImport's hoisted factory runs.
const navigateMock = vi.hoisted(() => vi.fn<(...args: unknown[]) => unknown>())
mockNuxtImport('navigateTo', () => navigateMock)

const ClientsIndex = (await import('../clients/index.vue')).default

beforeEach(() => {
  paged.value = []
  viewState.value = 'loading'
  requestId.value = null
  total.value = 0
  filteredTotal.value = 0
  page.value = 1
  pageCount.value = 1
  query.value = ''
  statusFilter.value = 'all'
  isStale.value = false
  canWrite.value = true
  vi.clearAllMocks()
})
afterEach(() => vi.clearAllMocks())

describe('clients list page', () => {
  it('always renders the masked principal hero with no token/secret/PII, regardless of state', async () => {
    const wrapper = await mountSuspended(ClientsIndex)
    expect(wrapper.find('[data-page="clients"]').exists()).toBe(true)
    const principal = wrapper.find('[data-principal-name]')
    expect(principal.exists()).toBe(true)
    expect(principal.text()).toContain('Admin Sentinel')
    expect(wrapper.html()).not.toMatch(/access_token|refresh_token|id_token|Bearer/)
    expect(wrapper.html()).not.toMatch(/client_secret|clientSecret/)
  })

  it('loading → skeleton, no table', async () => {
    viewState.value = 'loading'
    const wrapper = await mountSuspended(ClientsIndex)
    expect(wrapper.findComponent(UiSkeleton).exists()).toBe(true)
    expect(wrapper.findComponent(ClientsTable).exists()).toBe(false)
  })

  it('forbidden → forbidden status view (distinct from empty), raw request id redacted', async () => {
    viewState.value = 'forbidden'
    requestId.value = 'admin-req-DENIED42'
    const wrapper = await mountSuspended(ClientsIndex)
    expect(wrapper.findComponent(UiStatusView).props('tone')).toBe('forbidden')
    expect(wrapper.findComponent(UiEmptyState).exists()).toBe(false)
    expect(wrapper.text()).not.toContain('admin-req-DENIED42')
  })

  it('unauthenticated → step_up status view', async () => {
    viewState.value = 'unauthenticated'
    const wrapper = await mountSuspended(ClientsIndex)
    expect(wrapper.findComponent(UiStatusView).props('tone')).toBe('step_up')
  })

  it('error → error status view with a refresh action; raw request id redacted to REF-', async () => {
    viewState.value = 'error'
    requestId.value = 'admin-req-FAILED99'
    const wrapper = await mountSuspended(ClientsIndex)
    expect(wrapper.findComponent(UiStatusView).props('tone')).toBe('error')
    expect(wrapper.text()).toContain('REF-')
    expect(wrapper.text()).not.toContain('admin-req-FAILED99')
    await wrapper.find('[data-test="clients-refresh"]').trigger('click')
    expect(refreshMock).toHaveBeenCalledTimes(1)
  })

  it('empty → empty state, not a status view (authorized but zero rows)', async () => {
    viewState.value = 'empty'
    const wrapper = await mountSuspended(ClientsIndex)
    expect(wrapper.findComponent(UiEmptyState).exists()).toBe(true)
    expect(wrapper.findComponent(UiStatusView).exists()).toBe(false)
  })

  it('ready → isStale banner + search input + status select + table with mapped rows, no secret/PII', async () => {
    viewState.value = 'ready'
    paged.value = [sampleClient]
    total.value = 1
    filteredTotal.value = 1
    isStale.value = true
    const wrapper = await mountSuspended(ClientsIndex)
    expect(wrapper.find('[role="status"]').exists()).toBe(true) // stale banner
    expect(wrapper.findComponent(UiInput).exists()).toBe(true)
    expect(wrapper.findComponent(UiSelect).exists()).toBe(true)
    const table = wrapper.findComponent(ClientsTable)
    expect(table.exists()).toBe(true)
    const rows = table.props('rows') as ReadonlyArray<{
      id: string
      name: string
      clientId: string
      statusTone: string
    }>
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      id: 'portal-web',
      name: 'Operator Portal',
      clientId: 'portal-web',
      statusTone: 'success',
    })
    // No token, no client_secret value/field, no raw NIK(16)/NIP(18)/NISN(10) digit run.
    expect(wrapper.html()).not.toMatch(/access_token|Bearer/)
    expect(wrapper.html()).not.toMatch(/client_secret|clientSecret/)
    expect(wrapper.html()).not.toMatch(/\d{16}|\d{18}|\d{10}/)
  })

  it('status filter offers "all" + every client status', async () => {
    viewState.value = 'ready'
    paged.value = [sampleClient]
    total.value = 1
    filteredTotal.value = 1
    const wrapper = await mountSuspended(ClientsIndex)
    const options = wrapper.findComponent(UiSelect).props('options') as ReadonlyArray<{
      value: string
    }>
    expect(options.map((o) => o.value)).toEqual([
      'all',
      'active',
      'staged',
      'disabled',
      'decommissioned',
    ])
  })

  it('shows the New client link only with admin.clients.write', async () => {
    viewState.value = 'ready'
    paged.value = [sampleClient]
    canWrite.value = true
    const allowed = await mountSuspended(ClientsIndex)
    expect(allowed.find('[data-test="clients-create"]').exists()).toBe(true)
    canWrite.value = false
    const denied = await mountSuspended(ClientsIndex)
    expect(denied.find('[data-test="clients-create"]').exists()).toBe(false)
  })

  it('row select navigates to the named detail route with the client id', async () => {
    viewState.value = 'ready'
    paged.value = [sampleClient]
    total.value = 1
    filteredTotal.value = 1
    const wrapper = await mountSuspended(ClientsIndex)
    wrapper.findComponent(ClientsTable).vm.$emit('select', 'portal-web')
    expect(navigateMock).toHaveBeenCalledWith({
      name: 'admin.clients.detail',
      params: { clientId: 'portal-web' },
    })
  })
})
```

2. [ ] **Run it — expect FAIL** (the page does not exist yet):
   `npm run test -- app/pages/__tests__/clients-list.page.nuxt.spec.ts`
   Expected: fails at the top-level `await import('../clients/index.vue')` with `Failed to load url ../clients/index.vue` (or, once the file is stubbed but incomplete, real assertion failures such as `Unable to find [data-page="clients"]`). The failure is because the behaviour is missing — not a typo.

3. [ ] **GREEN** — create `app/pages/clients/index.vue` (copy-and-adapt of `app/pages/users/index.vue`; swap `users`→`clients`, `subjectId`→`clientId`, `useUsersList`→`useClientsList`, `UsersTable`→`ClientsTable`, `USER_ACCOUNT_STATUSES`→`CLIENT_STATUSES`, `resolveUserStatusTone`→`resolveClientStatusTone`):

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { AlertTriangle } from 'lucide-vue-next'
import { useSessionStore } from '@/stores/session.store'
import { useI18n } from '@/composables/useI18n'
import { useClientsList } from '@/composables/useClientsList'
import { resolveClientStatusTone } from '@/lib/clients/clients-view-state'
import { CLIENT_STATUSES } from '@/types/clients.types'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiSelect, { type UiSelectOption } from '@/components/ui/UiSelect.vue'
import UiFolio from '@/components/ui/UiFolio.vue'
import ClientsTable, { type ClientsTableRow } from '@/components/clients/ClientsTable.vue'

definePageMeta({
  name: 'admin.clients',
  layout: 'admin',
  requiresAdmin: true,
  permissions: ['admin.clients.read'],
})

const { t } = useI18n()

// SAFE HYDRATION: resolve the masked principal server-side (display name, role,
// capability flags only). OIDC tokens stay in Nitro event.context; the
// client_secret never enters a list DTO (only has_secret_hash) so nothing
// secret reaches useState / __NUXT__.
const store = useSessionStore()
await useAsyncData('admin-clients-principal', () => store.ensureSession())

// SAFE DATA: the list is fetched through the clientsApi service (no direct fetch
// in the page) and arrives as masked DTOs only. Search/filter/pagination are
// derived client-side over the hydrated list (the backend exposes no query params).
const {
  paged,
  viewState,
  requestId,
  total,
  filteredTotal,
  page,
  pageCount,
  query,
  statusFilter,
  isStale,
  refresh,
} = useClientsList()

const canCreate = computed<boolean>(() => store.hasPermission('admin.clients.write'))

function statusLabel(status: string): string {
  const path = `clients.status_${status}`
  const translated = t(path)
  return translated === path ? status : translated
}

// publik → category_public, kepegawaian → category_staff (existing keys); else raw.
function categoryLabel(category: string | null | undefined): string {
  if (category === 'publik') return t('clients.category_public')
  if (category === 'kepegawaian') return t('clients.category_staff')
  return category ?? '—'
}

const statusOptions = computed<readonly UiSelectOption[]>(() => [
  { value: 'all', label: t('clients.filter_all') },
  ...CLIENT_STATUSES.map((status) => ({ value: status, label: statusLabel(status) })),
])

const tableRows = computed<readonly ClientsTableRow[]>(() =>
  paged.value.map((client) => ({
    id: client.client_id,
    name: client.display_name ?? client.client_id,
    clientId: client.client_id,
    category: categoryLabel(client.category),
    status: statusLabel(client.status ?? '—'),
    statusTone: resolveClientStatusTone(client.status),
  })),
)

function onSelect(clientId: string): void {
  void navigateTo({ name: 'admin.clients.detail', params: { clientId } })
}

function onNext(): void {
  if (page.value < pageCount.value) page.value += 1
}

function onPrevious(): void {
  if (page.value > 1) page.value -= 1
}

async function onRefresh(): Promise<void> {
  await refresh()
}
</script>

<template>
  <section class="clients" data-page="clients">
    <header class="clients__hero">
      <span class="clients__eyebrow">{{ t('clients.eyebrow') }}</span>
      <div class="clients__heading">
        <div class="clients__heading-text">
          <h1 class="clients__title">{{ t('clients.title') }}</h1>
          <p class="clients__summary">{{ t('clients.summary') }}</p>
          <p class="clients__principal" data-principal-name>
            {{ t('clients.signed_in_as', { name: store.principal?.display_name ?? '—' }) }}
          </p>
        </div>
        <NuxtLink
          v-if="canCreate"
          :to="{ name: 'admin.clients.create' }"
          class="clients__create"
          data-test="clients-create"
        >
          <UiButton variant="primary" size="sm">{{ t('clients.btn_create_client') }}</UiButton>
        </NuxtLink>
      </div>
      <dl v-if="total > 0" class="clients__evidence">
        <dt>{{ t('clients.title') }}</dt>
        <dd><UiFolio :index="filteredTotal" :total="total" /></dd>
      </dl>
    </header>

    <UiSkeleton v-if="viewState === 'loading'" :rows="6" :label="t('clients.loading')" />

    <UiStatusView
      v-else-if="viewState === 'forbidden'"
      tone="forbidden"
      :eyebrow="t('clients.eyebrow')"
      :title="t('clients.forbidden_title')"
      :description="t('common.forbidden_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="viewState === 'unauthenticated'"
      tone="step_up"
      :eyebrow="t('clients.eyebrow')"
      :title="t('common.session_expired_title')"
      :description="t('common.session_expired_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="viewState === 'error'"
      tone="error"
      :eyebrow="t('clients.eyebrow')"
      :title="t('clients.error_title')"
      :description="t('common.error_loading_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    >
      <template #actions>
        <UiButton variant="secondary" size="sm" data-test="clients-refresh" @click="onRefresh">
          {{ t('common.btn_refresh') }}
        </UiButton>
      </template>
    </UiStatusView>

    <UiEmptyState
      v-else-if="viewState === 'empty'"
      :title="t('clients.empty_title')"
      :description="t('clients.empty_desc')"
    >
      <template #action>
        <UiButton variant="secondary" size="sm" @click="onRefresh">
          {{ t('common.btn_refresh') }}
        </UiButton>
      </template>
    </UiEmptyState>

    <template v-else>
      <div v-if="isStale" class="clients__banner" role="status">
        <AlertTriangle :size="16" aria-hidden="true" />
        <span>{{ t('common.error_loading_desc') }}</span>
      </div>

      <div class="clients__controls">
        <UiInput
          v-model="query"
          class="clients__search"
          :placeholder="t('clients.search_placeholder')"
          :aria-label="t('clients.search_label')"
        />
        <UiSelect
          v-model="statusFilter"
          class="clients__filter"
          :options="statusOptions"
          :aria-label="t('clients.filter_status')"
        />
      </div>

      <ClientsTable
        :caption="t('clients.title')"
        :name-label="t('clients.col_client')"
        :client-id-label="t('clients.col_client_id')"
        :category-label="t('clients.col_category')"
        :status-label="t('clients.col_status')"
        :view-label="t('clients.btn_view')"
        :rows="tableRows"
        :total="filteredTotal"
        :page="page"
        :page-count="pageCount"
        :next-label="t('clients.page_next')"
        :previous-label="t('clients.page_previous')"
        @select="onSelect"
        @next="onNext"
        @previous="onPrevious"
      />
    </template>
  </section>
</template>

<style scoped>
.clients {
  display: grid;
  gap: 24px;
  padding: 24px;
}
.clients__hero {
  display: grid;
  gap: 6px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border);
}
.clients__eyebrow {
  font: 600 0.6875rem/1 var(--font-sans);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.clients__heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.clients__heading-text {
  display: grid;
  gap: 6px;
}
.clients__title {
  margin: 0;
  font: 600 1.5rem/1.2 var(--font-sans);
  letter-spacing: -0.02em;
  color: var(--fg);
}
.clients__summary {
  margin: 0;
  max-width: 64ch;
  font: 400 0.875rem/1.6 var(--font-sans);
  color: var(--fg-2);
}
.clients__principal {
  margin: 0;
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--fg-2);
}
.clients__create {
  flex: none;
  text-decoration: none;
}
.clients__evidence {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 4px 0 0;
}
.clients__evidence dt {
  font: 600 0.625rem/1 var(--font-sans);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.clients__evidence dd {
  margin: 0;
}
.clients__banner {
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
.clients__controls {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.clients__search {
  flex: 1 1 280px;
}
.clients__filter {
  flex: 0 1 220px;
}
</style>
```

4. [ ] Add the genuinely-new locale keys to BOTH `app/locales/id.json` and `app/locales/en.json` inside the existing `"clients"` block (keep id↔en parity; do not touch the other 141 keys). Example values (translate the `id` set; the `en` set is shown):

   `en.json` → `clients`:
   ```json
   "signed_in_as": "Signed in as {name}",
   "filter_status": "Filter by status",
   "filter_all": "All statuses",
   "col_category": "Category",
   "page_next": "Next",
   "page_previous": "Previous",
   "status_active": "Active",
   "status_staged": "Staged",
   "status_disabled": "Disabled",
   "status_decommissioned": "Decommissioned"
   ```
   `id.json` → `clients`:
   ```json
   "signed_in_as": "Masuk sebagai {name}",
   "filter_status": "Saring berdasarkan status",
   "filter_all": "Semua status",
   "col_category": "Kategori",
   "page_next": "Berikutnya",
   "page_previous": "Sebelumnya",
   "status_active": "Aktif",
   "status_staged": "Disiapkan",
   "status_disabled": "Dinonaktifkan",
   "status_decommissioned": "Dihentikan"
   ```

5. [ ] **Run it — expect PASS**:
   `npm run test -- app/pages/__tests__/clients-list.page.nuxt.spec.ts`
   Expected: all assertions green (the `clients list page` describe block passes, including the six-state ladder, the status-filter option list `['all','active','staged','disabled','decommissioned']`, the permission-gated create link, the `client_secret`/`clientSecret`/token/PII absence checks, and the named-route navigation on row select).

6. [ ] **Verify parity + route map** stay green:
   `node -e "const a=require('./app/locales/id.json').clients,b=require('./app/locales/en.json').clients;const ka=Object.keys(a).sort(),kb=Object.keys(b).sort();if(JSON.stringify(ka)!==JSON.stringify(kb)){console.error('LOCALE PARITY DRIFT');process.exit(1)}console.log('clients locale parity OK',ka.length)"`
   `npm run test -- app/pages/__tests__/route-map.spec.ts`
   Expected: `clients locale parity OK 151` and the route-map spec green.

7. [ ] **REFACTOR if needed** — the page is a near-verbatim copy of `users/index.vue`; keep it that way (no new abstraction). Only deviation: `categoryLabel` maps the two backend categories to the existing `category_public`/`category_staff` keys. No further extraction.

8. [ ] **Commit** (only on green):
   ```
   git add app/pages/clients/index.vue \
     app/pages/__tests__/clients-list.page.nuxt.spec.ts \
     app/locales/id.json app/locales/en.json
   git commit -m "feat(sso-admin-frontend): Swiss clients list page (six states, permission-gated search/filter)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
   ```

**Task DoD (run from `services/sso-admin-frontend`):** `npm run typecheck && npm run lint && npm run format:check && npm run test -- app/pages/__tests__/clients-list.page.nuxt.spec.ts app/pages/__tests__/route-map.spec.ts` — all green (report any blocked command explicitly, never claim PASS for a command that did not run). The full `build` / `test` / `test:e2e` service gate runs in Task 5.14.

---

### Task 5.8: Client detail page (read-only tabs: overview/URIs/scopes/security/lifecycle)

Create the deep-linkable detail route `app/pages/clients/[clientId].vue` as a **read-only** surface first (the metadata/URI/scope edit forms 5.11, the rotate-secret action 5.12, and the lifecycle actions 5.13 are slotted in by later tasks and wired `@done="refresh"`). This is the net-new deep link the legacy SPA never had — detail was a master/detail drawer with no URL (extract-legacy §6, §11 anti-pattern); Phase 4 added `users/[subjectId]`, Phase 5 adds the symmetrical `clients/[clientId]`. Mirror the `users/[subjectId].vue` state machine: the hero renders **unconditionally** (so the SSR-leak gate's positive assertions — `data-page="client-detail"`, the masked principal, the consent-trail link, the public `client_id` folio — always hold), then exactly one branch per `ClientDetailViewState`, including a **dedicated `not_found` surface** (`UiEmptyState`) distinct from `forbidden`/`error` (`UiStatusView`). The `ready` body composes five read-only panels:

- **overview** (`data-panel="overview"`): `type` (`ov_type`), `category` as a `UiStatusBadge` (tone `brand` for `kepegawaian`, `neutral` otherwise — never colour-alone), `owner_email` (`ov_owner`), and `status` as a `UiStatusBadge` (`resolveClientStatusTone`).
- **URIs** (`data-panel="uris"`): `redirect_uris` + `post_logout_redirect_uris` as lists (empty → `no_redirect_uris` / `no_logout_uris`), `backchannel_logout_uri` (empty → `val_not_set`).
- **scopes** (`data-panel="scopes"`): the client's `allowed_scopes` rendered as `UiStatusBadge`s (empty → `no_scopes`); a `scope_parity_warning` `role="alert"` banner when `scopeParityWarnings(catalog, allowed_scopes)` is non-empty (catalog from `useScopeCatalog`, which fails closed to `[]` so the banner simply never shows when the catalog is unreachable).
- **security** (`data-panel="security"`): `has_secret_hash` rendered as the **boolean label only** — `val_stored` when `true`, `val_not_available` when falsy (`ov_secret_hash`); `secret_rotated_at` as a `UiFolio` timestamp or `val_not_set` (`ov_secret_rotated`). **The plaintext `client_secret` is NEVER on this DTO and never rendered** — only the masked `has_secret_hash` boolean.
- **lifecycle** (`data-panel="lifecycle"`): `activated_at` (`lc_activated`), `disabled_at` (`lc_disabled`), `secret_expires_at` (`lc_secret_expires`) as `UiFolio` timestamps or `val_not_set`, and `provisioning` (`lc_provisioning`).

The hero renders the masked principal (`signed_in_as`), `display_name || client_id` as the title, the **public** `client_id` via `UiFolio variant="id"` (mono — the §7.3 raw-id rule) with a copy affordance, the status + category badges, and a cross-domain consent-trail `NuxtLink` (named route, not a Clients endpoint — consent records live in the authentication-audit domain). Below each panel, HTML mount-point comments mark where the write/action components land in 5.11–5.13, gated by `admin.clients.write`; this task ships **no** write control. The page reaches data only through `useClientDetail` + `useScopeCatalog` (no direct `fetch`/`$fetch`); the page test mocks both composables + the session store so every state is deterministic.

**Files**
- Create: `app/pages/clients/[clientId].vue`
- Modify: `app/locales/id.json`, `app/locales/en.json` (ADD only the genuinely-new keys in step 4 — `clients.signed_in_as` / `status_unknown` / `not_found_title` / `not_found_desc` / `btn_back`; all other keys this page uses — `eyebrow`, `title`, `loading`, `forbidden_title`, `error_title`, `tab_overview`/`tab_uris`/`tab_scopes`/`tab_security`/`tab_lifecycle`, `ov_type`/`ov_owner`/`ov_secret_hash`/`ov_secret_rotated`, `lc_activated`/`lc_disabled`/`lc_secret_expires`/`lc_provisioning`, `redirect_uris_title`/`logout_uris_title`/`backchannel_uri_title`, `no_redirect_uris`/`no_logout_uris`, `allowed_scopes_title`/`no_scopes`/`scope_parity_warning`, `label_category`, `category_public`/`category_staff`, `val_stored`/`val_not_available`/`val_not_set`, `col_status`, `btn_consent_trail` — ALREADY EXIST at id↔en parity and are REUSED, not re-added)
- Modify: `app/pages/__tests__/route-map.spec.ts` (add the `admin.clients.detail` row to `domainPages` so the new page's meta is asserted)
- Test: `app/pages/__tests__/clients-detail.page.nuxt.spec.ts`

**Interfaces**
- Produces: route page named `admin.clients.detail` — `definePageMeta({ name: 'admin.clients.detail', layout: 'admin', requiresAdmin: true, permissions: ['admin.clients.read'] })`; `const clientId = computed(() => String(route.params.clientId ?? ''))` (path id, not a secret). Renders the five read-only tabs; exposes mount points for the action components (5.10–5.13). New `clients.*` locale keys (parity). **No exported API.**
- Consumes: `useClientDetail` (Task 5.5); `useScopeCatalog` + `mergeAvailableScopes`/`scopeParityWarnings` (Tasks 5.5/5.3); `resolveClientStatusTone` (Task 5.1); `UiStatusView`/`UiSkeleton`/`UiEmptyState`/`UiStatusBadge`/`UiDataList`/`UiFolio` (`@/components/ui/*`); `formatTechnicalPreview`/`formatSupportReference` (`@/lib/display-identifiers`); session store `hasPermission`; `useI18n`. Copy-and-adapt template: `app/pages/users/[subjectId].vue`.

**Steps**

1. [ ] Add the `admin.clients.detail` row to the route-map test so its meta is enforced. In `app/pages/__tests__/route-map.spec.ts`, insert into `domainPages` (immediately after the `clients/new.vue` entry):

```ts
  {
    file: 'clients/[clientId].vue',
    name: 'admin.clients.detail',
    permissions: ['admin.clients.read'],
  },
```

2. [ ] Write the failing page test `app/pages/__tests__/clients-detail.page.nuxt.spec.ts`:

```ts
// *.nuxt.spec.ts → 'nuxt' env: mountSuspended drives the page's async setup
// (useRoute + useI18n + definePageMeta auto-imports). Data boundary + scope
// catalog + session store are mocked so each ClientDetailViewState is deterministic.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import enLocale from '@/locales/en.json'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import type { AdminClientDetail, ScopeCatalogEntry } from '@/types/clients.types'
import type { ClientDetailViewState } from '@/lib/clients/clients-view-state'

const client = ref<AdminClientDetail | null>(null)
const viewState = ref<ClientDetailViewState>('loading')
const requestId = ref<string | null>(null)
const scopes = ref<readonly ScopeCatalogEntry[]>([])
const refreshMock = vi.fn<() => Promise<void>>(async () => {})

// ponytail: pin locale to 'en' so assertions use literal English strings.
// Default locale is 'id'; without this mock the spec would assert Indonesian.
vi.mock('@/composables/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      const parts = key.split('.')
      let val: unknown = enLocale
      for (const part of parts) {
        val = (val as Record<string, unknown>)?.[part]
      }
      if (typeof val !== 'string') return key
      if (!params) return val
      return val.replace(/\{(\w+)\}/gu, (_: string, k: string) => String(params[k] ?? ''))
    },
  }),
}))

vi.mock('@/composables/useClientDetail', () => ({
  useClientDetail: () => ({ client, viewState, requestId, refresh: refreshMock }),
}))

vi.mock('@/composables/useScopeCatalog', () => ({
  useScopeCatalog: () => ({ scopes, pending: computed(() => false), error: computed(() => null) }),
}))

vi.mock('@/stores/session.store', () => ({
  useSessionStore: () => ({
    principal: { display_name: 'Admin Sentinel' },
    hasPermission: () => true,
  }),
}))

// The list/detail DTOs carry only has_secret_hash — never a secret. This sentinel
// MUST NOT appear anywhere in the rendered tree or hydrated payload.
const SECRET_CANARY = 'cs_PLAINTEXT_DO_NOT_LEAK_abcdef0123456789'

const READY_CLIENT: AdminClientDetail = {
  client_id: 'selamat-kerja',
  display_name: 'Selamat Kerja',
  type: 'confidential',
  environment: 'live',
  app_base_url: 'https://selamat-kerja.timeh.my.id',
  redirect_uris: ['https://selamat-kerja.timeh.my.id/auth/callback'],
  post_logout_redirect_uris: ['https://selamat-kerja.timeh.my.id/auth/logout'],
  allowed_scopes: ['openid', 'profile', 'email', 'kepegawaian.read'],
  backchannel_logout_uri: 'https://selamat-kerja.timeh.my.id/auth/backchannel/logout',
  backchannel_logout_internal: false,
  owner_email: 'ops@selamat-kerja.example',
  provisioning: 'jit',
  status: 'active',
  category: 'kepegawaian',
  has_secret_hash: true,
  activated_at: '2026-06-20T10:00:00Z',
  disabled_at: null,
  secret_rotated_at: '2026-06-25T08:00:00Z',
  secret_expires_at: '2026-12-25T08:00:00Z',
}

const CATALOG: readonly ScopeCatalogEntry[] = [
  { name: 'openid', description: 'OpenID', claims: ['sub'], default_allowed: true },
  { name: 'profile', description: 'Profile', claims: ['name'], default_allowed: true },
  { name: 'email', description: 'Email', claims: ['email'], default_allowed: true },
  // 'kepegawaian.read' is intentionally absent → drives the scope-parity warning.
]

const ClientDetail = (await import('../clients/[clientId].vue')).default

beforeEach(() => {
  client.value = null
  viewState.value = 'loading'
  requestId.value = null
  scopes.value = []
  vi.clearAllMocks()
})
afterEach(() => vi.clearAllMocks())

describe('client detail page', () => {
  it('always renders the masked principal + public client id in the hero, no token/secret', async () => {
    client.value = READY_CLIENT
    viewState.value = 'ready'
    const wrapper = await mountSuspended(ClientDetail)
    const principal = wrapper.find('[data-principal-name]')
    expect(principal.exists()).toBe(true)
    expect(principal.text()).toContain('Admin Sentinel')
    expect(wrapper.find('[data-page="client-detail"]').exists()).toBe(true)
    // client_id is a PUBLIC identifier — it renders (folio); no secret/token does.
    expect(wrapper.text()).toContain('selamat-kerja')
    const html = wrapper.html()
    expect(html).not.toMatch(/access_token|refresh_token|id_token|Bearer/)
    expect(html).not.toMatch(/client_secret|clientSecret/i)
    expect(html).not.toContain(SECRET_CANARY)
  })

  it('loading → skeleton, no overview panel', async () => {
    viewState.value = 'loading'
    const wrapper = await mountSuspended(ClientDetail)
    expect(wrapper.findComponent(UiSkeleton).exists()).toBe(true)
    expect(wrapper.find('[data-panel="overview"]').exists()).toBe(false)
  })

  it('forbidden → forbidden status view (no-permission), distinct from not_found', async () => {
    viewState.value = 'forbidden'
    requestId.value = 'admin-req-DENIED42'
    const wrapper = await mountSuspended(ClientDetail)
    expect(wrapper.findComponent(UiStatusView).props('tone')).toBe('forbidden')
    expect(wrapper.findComponent(UiEmptyState).exists()).toBe(false)
    expect(wrapper.text()).not.toMatch(/SQLSTATE|stack trace|Bearer/i)
  })

  it('unauthenticated → step_up status view', async () => {
    viewState.value = 'unauthenticated'
    const wrapper = await mountSuspended(ClientDetail)
    expect(wrapper.findComponent(UiStatusView).props('tone')).toBe('step_up')
  })

  it('not_found → dedicated empty surface, not a status view', async () => {
    viewState.value = 'not_found'
    const wrapper = await mountSuspended(ClientDetail)
    expect(wrapper.findComponent(UiEmptyState).exists()).toBe(true)
    expect(wrapper.findComponent(UiStatusView).exists()).toBe(false)
    expect(wrapper.text()).toContain('Client not found')
  })

  it('error → error status view; raw request id is redacted to REF-XXXXXXXX', async () => {
    viewState.value = 'error'
    requestId.value = 'admin-req-FAILED99'
    const wrapper = await mountSuspended(ClientDetail)
    expect(wrapper.findComponent(UiStatusView).props('tone')).toBe('error')
    expect(wrapper.text()).toContain('REF-')
    expect(wrapper.text()).not.toContain('admin-req-FAILED99')
  })

  it('ready → overview panel: type/owner + status & category badges (never colour-alone)', async () => {
    viewState.value = 'ready'
    client.value = READY_CLIENT
    const wrapper = await mountSuspended(ClientDetail)
    const overview = wrapper.find('[data-panel="overview"]')
    expect(overview.exists()).toBe(true)
    expect(overview.text()).toContain('confidential')
    expect(overview.text()).toContain('ops@selamat-kerja.example')
    const tones = wrapper.findAllComponents(UiStatusBadge).map((b) => b.props('tone'))
    expect(tones).toContain('success') // active status → success
    expect(tones).toContain('brand') // kepegawaian category → brand
  })

  it('ready → URIs panel lists redirect/post-logout/backchannel', async () => {
    viewState.value = 'ready'
    client.value = READY_CLIENT
    const wrapper = await mountSuspended(ClientDetail)
    const uris = wrapper.find('[data-panel="uris"]')
    expect(uris.exists()).toBe(true)
    expect(uris.text()).toContain('https://selamat-kerja.timeh.my.id/auth/callback')
    expect(uris.text()).toContain('https://selamat-kerja.timeh.my.id/auth/logout')
    expect(uris.text()).toContain('https://selamat-kerja.timeh.my.id/auth/backchannel/logout')
  })

  it('ready → scopes panel renders badges + a parity warning for catalog-absent scopes', async () => {
    viewState.value = 'ready'
    client.value = READY_CLIENT
    scopes.value = CATALOG
    const wrapper = await mountSuspended(ClientDetail)
    const scopesPanel = wrapper.find('[data-panel="scopes"]')
    expect(scopesPanel.exists()).toBe(true)
    expect(scopesPanel.text()).toContain('openid')
    expect(scopesPanel.text()).toContain('kepegawaian.read')
    // The custom scope is absent from the catalog → parity warning banner shows.
    expect(scopesPanel.find('[role="alert"]').exists()).toBe(true)
    expect(scopesPanel.text()).toContain('kepegawaian.read')
  })

  it('ready → security panel shows has_secret_hash boolean only, NEVER the secret', async () => {
    viewState.value = 'ready'
    client.value = READY_CLIENT
    const wrapper = await mountSuspended(ClientDetail)
    const security = wrapper.find('[data-panel="security"]')
    expect(security.exists()).toBe(true)
    expect(security.text()).toContain('Stored') // has_secret_hash:true → val_stored
    const html = wrapper.html()
    expect(html).not.toMatch(/client_secret|clientSecret/i)
    expect(html).not.toContain(SECRET_CANARY)
  })

  it('ready → security panel shows "not available" when has_secret_hash is falsy', async () => {
    viewState.value = 'ready'
    client.value = { ...READY_CLIENT, has_secret_hash: false }
    const wrapper = await mountSuspended(ClientDetail)
    expect(wrapper.find('[data-panel="security"]').text()).toContain('Not available')
  })

  it('ready → lifecycle panel surfaces activation/secret-expiry/provisioning', async () => {
    viewState.value = 'ready'
    client.value = READY_CLIENT
    const wrapper = await mountSuspended(ClientDetail)
    const lifecycle = wrapper.find('[data-panel="lifecycle"]')
    expect(lifecycle.exists()).toBe(true)
    expect(lifecycle.text()).toContain('jit') // provisioning
  })

  it('ready → hero exposes a consent-trail link; this surface has NO write control', async () => {
    viewState.value = 'ready'
    client.value = READY_CLIENT
    const wrapper = await mountSuspended(ClientDetail)
    expect(wrapper.find('[data-consent-trail]').exists()).toBe(true)
    // Read-only: no rotate/disable/decommission/delete/save controls yet (5.11–5.13).
    expect(wrapper.text()).not.toMatch(/rotate|disable|decommission|delete|save/i)
  })

  it('never serializes a client secret value or field name into the SSR HTML', async () => {
    viewState.value = 'ready'
    client.value = READY_CLIENT
    const html = (await mountSuspended(ClientDetail)).html()
    expect(html).not.toMatch(/client_secret|clientSecret/i)
    expect(html).not.toContain(SECRET_CANARY)
    expect(html).not.toMatch(/access_token|refresh_token|id_token|Bearer/)
  })
})
```

3. [ ] Run it — expect **FAIL** (`../clients/[clientId].vue` does not exist → import/resolution error):

```
npm run test -- app/pages/__tests__/clients-detail.page.nuxt.spec.ts
```
Expected: the suite errors on module resolution / `default` import of the missing page (RED). The `route-map.spec.ts` `admin.clients.detail` row also fails (`existsSync` false) — both prove the behaviour is genuinely missing.

4. [ ] Add the genuinely-new i18n keys (BOTH files, id↔en parity). All other keys this page renders already exist in the `clients.*` namespace. In `app/locales/id.json` inside the existing `"clients"` block add ONLY:

```json
"signed_in_as": "Masuk sebagai {name}",
"status_unknown": "Tidak diketahui",
"not_found_title": "Klien tidak ditemukan",
"not_found_desc": "Klien untuk tautan ini tidak ada atau telah dihapus.",
"btn_back": "Kembali ke klien",
```

   …and the same keys in `app/locales/en.json` inside `"clients"`:

```json
"signed_in_as": "Signed in as {name}",
"status_unknown": "Unknown",
"not_found_title": "Client not found",
"not_found_desc": "The client for this link does not exist or has been removed.",
"btn_back": "Back to clients",
```

5. [ ] Implement the page `app/pages/clients/[clientId].vue` (read-only; copy-and-adapt of `app/pages/users/[subjectId].vue`):

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useSessionStore } from '@/stores/session.store'
import { useI18n } from '@/composables/useI18n'
import { useClientDetail } from '@/composables/useClientDetail'
import { useScopeCatalog } from '@/composables/useScopeCatalog'
import { resolveClientStatusTone } from '@/lib/clients/clients-view-state'
import { scopeParityWarnings } from '@/lib/clients/client-create-form'
import type { StatusTone } from '@/lib/status-tone'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import UiFolio from '@/components/ui/UiFolio.vue'
import UiButton from '@/components/ui/UiButton.vue'

definePageMeta({
  name: 'admin.clients.detail',
  layout: 'admin',
  requiresAdmin: true,
  permissions: ['admin.clients.read'],
})

const { t } = useI18n()
const store = useSessionStore()
const route = useRoute()

// route.params.clientId is a PUBLIC OIDC client identifier (a path id), not a
// secret. The composable resolves the masked detail DTO server-side via the BFF;
// the Bearer token stays in the Nitro event.context and never reaches the page or
// window.__NUXT__. The detail DTO carries only `has_secret_hash` — never a secret.
const clientId = computed<string>(() => String(route.params.clientId ?? ''))
const { client, viewState, requestId, refresh } = useClientDetail(clientId)
// Scope catalog fails closed to [] (useScopeCatalog) — the parity banner simply
// never shows when the catalog is unreachable; it never blocks the read surface.
const { scopes: scopeCatalog } = useScopeCatalog()

// canWrite gates the (later-mounted) edit/action controls; this task ships none.
const canWrite = computed<boolean>(() => store.hasPermission('admin.clients.write'))

const headerTitle = computed<string>(
  () => client.value?.display_name || clientId.value || t('clients.title'),
)
const statusTone = computed<StatusTone>(() => resolveClientStatusTone(client.value?.status))
const categoryTone = computed<StatusTone>(() =>
  client.value?.category === 'kepegawaian' ? 'brand' : 'neutral',
)
const categoryLabel = computed<string>(() =>
  client.value?.category === 'kepegawaian'
    ? t('clients.category_staff')
    : t('clients.category_public'),
)
const allowedScopes = computed<readonly string[]>(() => client.value?.allowed_scopes ?? [])
const parityWarnings = computed<readonly string[]>(() =>
  scopeParityWarnings(scopeCatalog.value, allowedScopes.value),
)

function secretHashLabel(stored: boolean | null | undefined): string {
  return stored ? t('clients.val_stored') : t('clients.val_not_available')
}

// client_id is a PUBLIC identifier — copying it carries no secret. Guarded so SSR
// (no navigator/clipboard) is a safe no-op.
function copyClientId(): void {
  if (import.meta.client) void navigator.clipboard?.writeText(clientId.value)
}

async function onRefresh(): Promise<void> {
  await refresh()
}

async function onBack(): Promise<void> {
  await navigateTo({ name: 'admin.clients' })
}
</script>

<template>
  <section class="client-detail" data-page="client-detail">
    <header class="client-detail__hero">
      <span class="client-detail__eyebrow">{{ t('clients.eyebrow') }}</span>
      <h1 class="client-detail__title">{{ headerTitle }}</h1>
      <p class="client-detail__principal" data-principal-name>
        {{ t('clients.signed_in_as', { name: store.principal?.display_name ?? '—' }) }}
      </p>
      <!-- client_id is a PUBLIC identifier — rendered as a mono folio (§7.3 raw-id rule). -->
      <p class="client-detail__id">
        <span class="client-detail__id-label">{{ t('clients.col_client_id') }}</span>
        <UiFolio :value="clientId" variant="id" data-client-id />
        <UiButton variant="ghost" size="sm" data-copy-client-id @click="copyClientId">
          {{ t('common.copy') }}
        </UiButton>
      </p>
      <div v-if="client" class="client-detail__badges">
        <UiStatusBadge :tone="statusTone" :label="client.status ?? t('clients.status_unknown')" />
        <UiStatusBadge :tone="categoryTone" :label="categoryLabel" />
      </div>
      <NuxtLink
        class="client-detail__consent"
        data-consent-trail
        :to="{ name: 'admin.authentication-audit', query: { clientId } }"
      >
        {{ t('clients.btn_consent_trail') }}
      </NuxtLink>
    </header>

    <UiSkeleton v-if="viewState === 'loading'" :rows="6" :label="t('clients.loading')" />

    <UiStatusView
      v-else-if="viewState === 'forbidden'"
      tone="forbidden"
      :eyebrow="t('clients.eyebrow')"
      :title="t('clients.forbidden_title')"
      :description="t('common.forbidden_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="viewState === 'unauthenticated'"
      tone="step_up"
      :eyebrow="t('clients.eyebrow')"
      :title="t('common.session_expired_title')"
      :description="t('common.session_expired_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    />

    <UiEmptyState
      v-else-if="viewState === 'not_found'"
      :title="t('clients.not_found_title')"
      :description="t('clients.not_found_desc')"
    >
      <template #action>
        <UiButton variant="secondary" size="sm" @click="onBack">
          {{ t('clients.btn_back') }}
        </UiButton>
      </template>
    </UiEmptyState>

    <UiStatusView
      v-else-if="viewState === 'error'"
      tone="error"
      :eyebrow="t('clients.eyebrow')"
      :title="t('clients.error_title')"
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

    <div v-else-if="client" class="client-detail__panels">
      <section class="client-detail__panel" data-panel="overview" aria-labelledby="overview-heading">
        <h2 id="overview-heading" class="client-detail__panel-title">{{ t('clients.tab_overview') }}</h2>
        <dl class="client-detail__grid">
          <div class="client-detail__field">
            <dt>{{ t('clients.ov_type') }}</dt>
            <dd>{{ client.type ?? '—' }}</dd>
          </div>
          <div class="client-detail__field">
            <dt>{{ t('clients.label_category') }}</dt>
            <dd><UiStatusBadge :tone="categoryTone" :label="categoryLabel" /></dd>
          </div>
          <div class="client-detail__field">
            <dt>{{ t('clients.ov_owner') }}</dt>
            <dd>{{ client.owner_email ?? '—' }}</dd>
          </div>
          <div class="client-detail__field">
            <dt>{{ t('clients.col_status') }}</dt>
            <dd>
              <UiStatusBadge :tone="statusTone" :label="client.status ?? t('clients.status_unknown')" />
            </dd>
          </div>
        </dl>
        <!-- 5.11 ClientMetadataForm mounts here when canWrite (admin.clients.write) -->
      </section>

      <section class="client-detail__panel" data-panel="uris" aria-labelledby="uris-heading">
        <h2 id="uris-heading" class="client-detail__panel-title">{{ t('clients.tab_uris') }}</h2>
        <h3 class="client-detail__subhead">{{ t('clients.redirect_uris_title') }}</h3>
        <ul v-if="client.redirect_uris.length" class="client-detail__uris">
          <li v-for="uri in client.redirect_uris" :key="uri">{{ uri }}</li>
        </ul>
        <p v-else class="client-detail__muted">{{ t('clients.no_redirect_uris') }}</p>

        <h3 class="client-detail__subhead">{{ t('clients.logout_uris_title') }}</h3>
        <ul v-if="(client.post_logout_redirect_uris ?? []).length" class="client-detail__uris">
          <li v-for="uri in client.post_logout_redirect_uris" :key="uri">{{ uri }}</li>
        </ul>
        <p v-else class="client-detail__muted">{{ t('clients.no_logout_uris') }}</p>

        <h3 class="client-detail__subhead">{{ t('clients.backchannel_uri_title') }}</h3>
        <p class="client-detail__value">{{ client.backchannel_logout_uri || t('clients.val_not_set') }}</p>
        <!-- 5.11 ClientUriPolicyForm mounts here when canWrite (admin.clients.write) -->
      </section>

      <section class="client-detail__panel" data-panel="scopes" aria-labelledby="scopes-heading">
        <h2 id="scopes-heading" class="client-detail__panel-title">{{ t('clients.tab_scopes') }}</h2>
        <p v-if="parityWarnings.length" class="client-detail__warning" role="alert">
          {{ t('clients.scope_parity_warning') }} {{ parityWarnings.join(', ') }}
        </p>
        <ul v-if="allowedScopes.length" class="client-detail__scopes">
          <li v-for="scope in allowedScopes" :key="scope">
            <UiStatusBadge tone="neutral" :label="scope" />
          </li>
        </ul>
        <p v-else class="client-detail__muted">{{ t('clients.no_scopes') }}</p>
        <!-- 5.11 ClientScopePolicyForm mounts here when canWrite (admin.clients.write) -->
      </section>

      <section class="client-detail__panel" data-panel="security" aria-labelledby="security-heading">
        <h2 id="security-heading" class="client-detail__panel-title">{{ t('clients.tab_security') }}</h2>
        <dl class="client-detail__grid">
          <div class="client-detail__field">
            <dt>{{ t('clients.ov_secret_hash') }}</dt>
            <!-- has_secret_hash is a BOOLEAN — the plaintext secret never reaches this DTO. -->
            <dd>{{ secretHashLabel(client.has_secret_hash) }}</dd>
          </div>
          <div class="client-detail__field">
            <dt>{{ t('clients.ov_secret_rotated') }}</dt>
            <dd>
              <UiFolio v-if="client.secret_rotated_at" :value="client.secret_rotated_at" variant="timestamp" />
              <span v-else>{{ t('clients.val_not_set') }}</span>
            </dd>
          </div>
        </dl>
        <!-- 5.12 ClientSecretRotation mounts here when canWrite (admin.clients.write · step-up) -->
      </section>

      <section class="client-detail__panel" data-panel="lifecycle" aria-labelledby="lifecycle-heading">
        <h2 id="lifecycle-heading" class="client-detail__panel-title">{{ t('clients.tab_lifecycle') }}</h2>
        <dl class="client-detail__grid">
          <div class="client-detail__field">
            <dt>{{ t('clients.lc_activated') }}</dt>
            <dd>
              <UiFolio v-if="client.activated_at" :value="client.activated_at" variant="timestamp" />
              <span v-else>{{ t('clients.val_not_set') }}</span>
            </dd>
          </div>
          <div class="client-detail__field">
            <dt>{{ t('clients.lc_disabled') }}</dt>
            <dd>
              <UiFolio v-if="client.disabled_at" :value="client.disabled_at" variant="timestamp" />
              <span v-else>{{ t('clients.val_not_set') }}</span>
            </dd>
          </div>
          <div class="client-detail__field">
            <dt>{{ t('clients.lc_secret_expires') }}</dt>
            <dd>
              <UiFolio v-if="client.secret_expires_at" :value="client.secret_expires_at" variant="timestamp" />
              <span v-else>{{ t('clients.val_not_set') }}</span>
            </dd>
          </div>
          <div class="client-detail__field">
            <dt>{{ t('clients.lc_provisioning') }}</dt>
            <dd>{{ client.provisioning ?? '—' }}</dd>
          </div>
        </dl>
        <!-- 5.13 ClientLifecycleActions mounts here when canWrite + admin.sessions.terminate (step-up) -->
      </section>
    </div>
  </section>
</template>

<style scoped>
.client-detail {
  display: grid;
  gap: 24px;
  padding: 24px;
}
.client-detail__hero {
  display: grid;
  gap: 6px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border);
}
.client-detail__eyebrow {
  font: 600 0.6875rem/1 var(--font-sans);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.client-detail__title {
  margin: 0;
  font: 600 1.5rem/1.2 var(--font-sans);
  letter-spacing: -0.02em;
  color: var(--fg);
}
.client-detail__principal {
  margin: 0;
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--fg-2);
}
.client-detail__id {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
}
.client-detail__id-label {
  font: 600 0.625rem/1 var(--font-sans);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.client-detail__badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.client-detail__consent {
  justify-self: start;
  font: 600 0.75rem/1 var(--font-sans);
  color: var(--accent);
  text-decoration: none;
}
.client-detail__panels {
  display: grid;
  gap: 20px;
}
.client-detail__panel {
  display: grid;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--border);
}
.client-detail__panel-title {
  margin: 0;
  font: 600 0.9375rem/1.2 var(--font-sans);
  color: var(--fg);
}
.client-detail__subhead {
  margin: 0;
  font: 600 0.625rem/1 var(--font-sans);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.client-detail__grid {
  display: grid;
  gap: 12px 24px;
  margin: 0;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}
.client-detail__field {
  display: grid;
  gap: 2px;
}
.client-detail__field dt {
  font: 600 0.625rem/1 var(--font-sans);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.client-detail__field dd {
  margin: 0;
  font: 400 0.875rem/1.5 var(--font-sans);
  color: var(--fg);
  overflow-wrap: anywhere;
}
.client-detail__uris,
.client-detail__scopes {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
  font: 400 0.8125rem/1.5 var(--font-mono);
  overflow-wrap: anywhere;
}
.client-detail__scopes {
  font-family: var(--font-sans);
}
.client-detail__value {
  margin: 0;
  font: 400 0.8125rem/1.5 var(--font-mono);
  color: var(--fg);
  overflow-wrap: anywhere;
}
.client-detail__warning {
  margin: 0;
  padding: 8px 12px;
  border: 1px solid var(--border);
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--fg-2);
}
.client-detail__muted {
  margin: 0;
  font: 400 0.875rem/1.5 var(--font-sans);
  color: var(--fg-3);
}
</style>
```

   Note on the copy affordance: `copyClientId()` is `import.meta.client`-guarded so SSR (no `navigator`) is safe and the click is a no-op when the Clipboard API is absent. `client_id` is a public identifier, so the copy path carries no secret. ponytail: no copy-state toast — `common.copied` confirmation is deferred to the secret-reveal modal (Task 5.9) where it actually matters.

6. [ ] Run the page test — expect **PASS** (all states + the no-secret/no-token leak assertions green):

```
npm run test -- app/pages/__tests__/clients-detail.page.nuxt.spec.ts
```
Expected: `Test Files 1 passed`, all `it` cases pass.

7. [ ] Run the route-map test — expect **PASS** (the new `admin.clients.detail` meta row is asserted):

```
npm run test -- app/pages/__tests__/route-map.spec.ts
```
Expected: `admin route map › guards admin.clients.detail with admin role and its permissions` passes.

8. [ ] Refactor pass (keep it lazy): confirm no direct `fetch`/`$fetch`, no hardcoded internal client path strings (use the named `admin.clients` / `admin.clients.detail` refs only), no colour-alone status (every badge has a `label`), and that no write control leaked onto this read-only surface. Re-run both specs to confirm still green.

9. [ ] Scope the gates and commit on green:

```
npm run typecheck && npm run lint -- app/pages/clients/[clientId].vue app/pages/__tests__/clients-detail.page.nuxt.spec.ts
git add app/pages/clients/[clientId].vue app/pages/__tests__/clients-detail.page.nuxt.spec.ts app/pages/__tests__/route-map.spec.ts app/locales/id.json app/locales/en.json
git commit -m "feat(sso-admin-frontend): read-only client detail page with five tabs

Add the deep-linkable clients/[clientId] route (admin.clients.read) with the
full state ladder incl. not_found and read-only overview/URIs/scopes/security/
lifecycle tabs. Security tab shows the has_secret_hash boolean only — the
plaintext client secret never reaches the detail DTO or SSR payload. Hero
renders the public client_id via folio + copy, status/category badges, and a
consent-trail link. Write/action mounts are left for 5.11-5.13.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

**Task-scoped DoD gate (run from `services/sso-admin-frontend`):**
`npm run typecheck && npm run lint && npm run format:check && npm run test && npm run build` — all green; the full `npm run test:e2e` Clients run is exercised at the phase gate. Report any blocked command explicitly; never claim PASS for a command that did not run.

---

### Task 5.9: One-time-secret reveal primitive (`ClientSecretReveal.vue` + extract helper)

The defining-hazard primitive, consumed by **both** create (Task 5.10) and rotate (Task 5.12). A pure `extractRevealedSecret` resolves the plaintext via the backend's fallback chain (`plaintext_secret ?? plaintext_once ?? client_secret ?? secret ?? null`); a pure `buildClientEnvSnippet` builds the copy-paste `SSO_*` env block (secret line emitted **only** when a secret is present — public clients omit it). `ClientSecretReveal.vue` shows the secret **once** in a `UiDialog` with an explicit destructive warning (`--danger #E4002B`, paired with text), a tested copy action, the optional env snippet, and a Clear/Close affordance. **The secret is owned by the PARENT as a client-only `ref` (never `useState`/Pinia/`localStorage`/`sessionStorage`/query/hash); the parent nulls it on close** — this component holds nothing and never logs the secret. This is the one net-new clients-specific component; it follows the `UiDialog` usage in `app/components/users/PrivilegedActionDialog.vue` for a11y/focus.

This task is **not** a privileged action and makes **no** API call — it is a pure display modal + two pure string helpers. The full `401/403/419/422/428/429/5xx` + step-up privileged-action matrix is exercised by the *consumers* (Task 5.10 create, Task 5.12 rotate) where the actual POST happens; do **not** re-implement the matrix here. Likewise, the SSR-payload leak gate for the freshly-issued secret lives in Task 5.14 — this component only ever receives the secret via a client-only `ref` (set from a client-side POST response), so it is structurally absent from SSR; the binding proof carried *here* is the one-time-secret discipline (rendered once, cleared on close → absent from DOM, never persisted, never logged, copy tested, warning shown).

**Locale note:** the `clients.*` reveal keys already exist in **both** `id.json` + `en.json` (`secret_reveal_title`, `secret_reveal_warning`, `create_secret_warning`, `client_secret_label`, `btn_copy_secret`, `btn_copy_all_config`, `btn_clear_secret`, `copy_success`, `copy_failed`) — title/description/warning/copyLabel/clearLabel/closeLabel are passed in as **props** (so create vs rotate differ in copy), and the component reads only `clients.copy_success` / `clients.copy_failed` for transient copy feedback. **No locale keys are added in this task.**

**Files**
- Create: `app/lib/clients/client-secret.ts`
- Create: `app/components/clients/ClientSecretReveal.vue`
- Test: `app/lib/clients/__tests__/client-secret.spec.ts`
- Test: `app/components/clients/__tests__/ClientSecretReveal.spec.ts`

**Interfaces**
- Consumes:
  - `ClientSecretRotation` from `@/types/clients.types` (Task 5.1).
  - `UiDialog`, `UiButton` from `@/components/ui/*` (foundation §1; `UiDialog` props `{ open, titleId, title, description, closeLabel, overlayClass?, wide? }`, emits `close`).
  - `useI18n` from `@/composables/useI18n` (foundation; `t(key)` only — for `clients.copy_success` / `clients.copy_failed`).
  - a11y/focus reference (not imported): `app/components/users/PrivilegedActionDialog.vue`.
- Produces (`app/lib/clients/client-secret.ts`):
  - `function extractRevealedSecret(rotation: ClientSecretRotation | null | undefined): string | null` — fallback chain `plaintext_secret ?? plaintext_once ?? client_secret ?? secret ?? null`.
  - `interface ClientEnvSnippetInput { readonly clientId: string; readonly secret?: string | null; readonly issuer?: string; readonly redirectUri?: string; readonly postLogoutUri?: string; readonly scopes?: readonly string[] }`
  - `function buildClientEnvSnippet(input: ClientEnvSnippetInput): string` — emits `SSO_ISSUER` / `SSO_CLIENT_ID` / `SSO_CLIENT_SECRET?` / `SSO_REDIRECT_URI` / `SSO_POST_LOGOUT_URI` / `SSO_SCOPES` lines, omitting any absent field; secret line present **only** when `secret` is truthy.
- Produces (`app/components/clients/ClientSecretReveal.vue`):
  - Props: `{ open: boolean; clientId: string; secret: string | null; envSnippet?: string; isPublic?: boolean; title: string; description: string; warning: string; copyLabel: string; clearLabel: string; closeLabel: string }`
  - Emits: `close()`, `copy()` — parent owns `open` + the secret `ref`; the component persists nothing and logs nothing.

---

#### Step 1 — RED: failing pure-helper test (`client-secret.spec.ts`)

- [ ] Write `app/lib/clients/__tests__/client-secret.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildClientEnvSnippet, extractRevealedSecret } from '../client-secret'
import type { ClientSecretRotation } from '@/types/clients.types'

// A clearly-sample secret: reads as a sample, never a real credential.
const SAMPLE_SECRET = 'sample-secret-DO-NOT-USE-9f8e7d6c'

describe('extractRevealedSecret', () => {
  it('returns null for null / undefined', () => {
    expect(extractRevealedSecret(null)).toBeNull()
    expect(extractRevealedSecret(undefined)).toBeNull()
  })

  it('prefers plaintext_secret over every other field', () => {
    const rotation: ClientSecretRotation = {
      client_id: 'sample-app',
      plaintext_secret: SAMPLE_SECRET,
      plaintext_once: 'other-1',
      client_secret: 'other-2',
      secret: 'other-3',
    }
    expect(extractRevealedSecret(rotation)).toBe(SAMPLE_SECRET)
  })

  it('walks the fallback chain plaintext_once -> client_secret -> secret', () => {
    expect(
      extractRevealedSecret({ client_id: 'a', plaintext_once: SAMPLE_SECRET }),
    ).toBe(SAMPLE_SECRET)
    expect(
      extractRevealedSecret({ client_id: 'a', client_secret: SAMPLE_SECRET }),
    ).toBe(SAMPLE_SECRET)
    expect(extractRevealedSecret({ client_id: 'a', secret: SAMPLE_SECRET })).toBe(SAMPLE_SECRET)
  })

  it('returns null when no plaintext field is present (public client)', () => {
    expect(extractRevealedSecret({ client_id: 'public-app' })).toBeNull()
  })
})

describe('buildClientEnvSnippet', () => {
  it('emits SSO_CLIENT_ID always and SSO_CLIENT_SECRET only when a secret is present', () => {
    const withSecret = buildClientEnvSnippet({ clientId: 'sample-app', secret: SAMPLE_SECRET })
    expect(withSecret).toContain('SSO_CLIENT_ID=sample-app')
    expect(withSecret).toContain(`SSO_CLIENT_SECRET=${SAMPLE_SECRET}`)

    const publicClient = buildClientEnvSnippet({ clientId: 'public-app' })
    expect(publicClient).toContain('SSO_CLIENT_ID=public-app')
    expect(publicClient).not.toContain('SSO_CLIENT_SECRET')
  })

  it('omits absent optional fields and joins scopes with a single space', () => {
    const snippet = buildClientEnvSnippet({
      clientId: 'sample-app',
      issuer: 'https://api-sso.example.test',
      redirectUri: 'https://app.example.test/callback',
      scopes: ['openid', 'profile', 'email'],
    })
    expect(snippet).toContain('SSO_ISSUER=https://api-sso.example.test')
    expect(snippet).toContain('SSO_REDIRECT_URI=https://app.example.test/callback')
    expect(snippet).toContain('SSO_SCOPES=openid profile email')
    expect(snippet).not.toContain('SSO_POST_LOGOUT_URI')
    expect(snippet).not.toContain('SSO_CLIENT_SECRET')
  })
})
```

- [ ] Run it — expect **FAIL** (module not found / undefined exports):

```bash
npm run test -- app/lib/clients/__tests__/client-secret.spec.ts
```

Expected: `Failed to resolve import "../client-secret"` (or `extractRevealedSecret is not a function`) — RED.

#### Step 2 — GREEN: implement `client-secret.ts`

- [ ] Create `app/lib/clients/client-secret.ts`:

```ts
import type { ClientSecretRotation } from '@/types/clients.types'

/**
 * Resolve the one-time plaintext secret from a create / rotate-secret response.
 * The backend has used four field names for the same value over time; resolve
 * them in priority order. Returns null when none is present (public clients
 * have no secret). The result is a transient value — the caller MUST hold it
 * only in a client-only ref and never persist or log it.
 */
export function extractRevealedSecret(
  rotation: ClientSecretRotation | null | undefined,
): string | null {
  if (!rotation) return null
  return (
    rotation.plaintext_secret ??
    rotation.plaintext_once ??
    rotation.client_secret ??
    rotation.secret ??
    null
  )
}

export interface ClientEnvSnippetInput {
  readonly clientId: string
  readonly secret?: string | null
  readonly issuer?: string
  readonly redirectUri?: string
  readonly postLogoutUri?: string
  readonly scopes?: readonly string[]
}

/**
 * Build the copy-paste `SSO_*` environment block for a freshly registered
 * client. The secret line is emitted ONLY when a secret is supplied (public
 * clients omit it). Pure string — nothing here is logged or persisted.
 * `SSO_ISSUER` is intentionally omitted: no caller supplies `issuer` (it would
 * have come from the deferred contract endpoint, see Architecture "Out of
 * scope"), so the operator fills the issuer in by hand.
 */
export function buildClientEnvSnippet(input: ClientEnvSnippetInput): string {
  const lines: string[] = []
  if (input.issuer) lines.push(`SSO_ISSUER=${input.issuer}`)
  lines.push(`SSO_CLIENT_ID=${input.clientId}`)
  if (input.secret) lines.push(`SSO_CLIENT_SECRET=${input.secret}`)
  if (input.redirectUri) lines.push(`SSO_REDIRECT_URI=${input.redirectUri}`)
  if (input.postLogoutUri) lines.push(`SSO_POST_LOGOUT_URI=${input.postLogoutUri}`)
  if (input.scopes && input.scopes.length > 0) {
    lines.push(`SSO_SCOPES=${input.scopes.join(' ')}`)
  }
  return lines.join('\n')
}
```

- [ ] Run it — expect **PASS**:

```bash
npm run test -- app/lib/clients/__tests__/client-secret.spec.ts
```

Expected: all `client-secret.spec.ts` tests green.

#### Step 3 — RED: failing component test (`ClientSecretReveal.spec.ts`)

- [ ] Write `app/components/clients/__tests__/ClientSecretReveal.spec.ts`. The component reads `useI18n` (a Nuxt auto-import that calls `useCookie`/`useState`), so under the plain jsdom env it is mocked to a passthrough `t`. The clipboard is stubbed; the parent-owned-ref discipline is exercised through a small harness component:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, ref } from 'vue'
import { mount } from '@vue/test-utils'
import ClientSecretReveal from '../ClientSecretReveal.vue'

// useI18n calls useCookie/useState (Nuxt auto-imports) that are absent under the
// plain jsdom env — mock it to a passthrough t (keys returned verbatim).
vi.mock('@/composables/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
    locale: ref('id'),
    setLocale: vi.fn<(locale: 'id' | 'en') => void>(),
    availableLocales: ['id', 'en'] as const,
  }),
}))

const SAMPLE_SECRET = 'sample-secret-DO-NOT-USE-9f8e7d6c'

const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined)

const baseProps = {
  open: true,
  clientId: 'sample-app',
  secret: SAMPLE_SECRET,
  title: 'Client secret',
  description: 'Shown once.',
  warning: 'Copy it now — it will not be shown again.',
  copyLabel: 'Copy secret',
  clearLabel: 'Clear and close',
  closeLabel: 'Close',
}

beforeEach(() => {
  writeText.mockClear()
  Object.assign(navigator, { clipboard: { writeText } })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ClientSecretReveal', () => {
  it('renders the secret value and the explicit destructive warning once', () => {
    const wrapper = mount(ClientSecretReveal, { props: baseProps })
    expect(wrapper.get('[data-testid="client-secret-value"]').text()).toBe(SAMPLE_SECRET)
    expect(wrapper.get('[data-testid="client-secret-warning"]').text()).toContain(
      'will not be shown again',
    )
    // exactly one rendering of the secret in the tree
    expect(wrapper.html().match(new RegExp(SAMPLE_SECRET, 'g'))).toHaveLength(1)
  })

  it('copies the secret to the clipboard, emits copy(), and shows success feedback', async () => {
    const wrapper = mount(ClientSecretReveal, { props: baseProps })
    await wrapper.get('[data-testid="client-secret-copy"]').trigger('click')
    await Promise.resolve()
    expect(writeText).toHaveBeenCalledExactlyOnceWith(SAMPLE_SECRET)
    expect(wrapper.emitted('copy')).toHaveLength(1)
    expect(wrapper.get('[data-testid="client-secret-copy-feedback"]').text()).toBe(
      'clients.copy_success',
    )
  })

  it('copies the full env block (which embeds the secret) when an envSnippet is provided', async () => {
    const envSnippet = `SSO_CLIENT_ID=sample-app\nSSO_CLIENT_SECRET=${SAMPLE_SECRET}`
    const wrapper = mount(ClientSecretReveal, { props: { ...baseProps, envSnippet } })
    await wrapper.get('[data-testid="client-secret-copy"]').trigger('click')
    await Promise.resolve()
    expect(writeText).toHaveBeenCalledExactlyOnceWith(envSnippet)
    expect(writeText.mock.calls[0]![0]).toContain(SAMPLE_SECRET)
  })

  it('shows the failure feedback (without logging) when the clipboard write rejects', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    writeText.mockRejectedValueOnce(new Error('denied'))
    const wrapper = mount(ClientSecretReveal, { props: baseProps })
    await wrapper.get('[data-testid="client-secret-copy"]').trigger('click')
    await Promise.resolve()
    await Promise.resolve()
    expect(wrapper.get('[data-testid="client-secret-copy-feedback"]').text()).toBe(
      'clients.copy_failed',
    )
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('emits close() when the Clear/Close affordance is clicked (parent owns dismissal)', async () => {
    const wrapper = mount(ClientSecretReveal, { props: baseProps })
    await wrapper.get('[data-testid="client-secret-clear"]').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('never writes the secret to localStorage / sessionStorage and never logs it', async () => {
    const localSet = vi.spyOn(Storage.prototype, 'setItem')
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const wrapper = mount(ClientSecretReveal, { props: baseProps })
    await wrapper.get('[data-testid="client-secret-copy"]').trigger('click')
    await Promise.resolve()
    await wrapper.get('[data-testid="client-secret-clear"]').trigger('click')

    const storedSecret = localSet.mock.calls.some((call) => String(call[1]).includes(SAMPLE_SECRET))
    expect(storedSecret).toBe(false)
    const loggedSecret = [logSpy, warnSpy, errorSpy].some((spy) =>
      spy.mock.calls.some((call) => call.some((arg) => String(arg).includes(SAMPLE_SECRET))),
    )
    expect(loggedSecret).toBe(false)
  })

  it('is absent from the DOM after the parent nulls the secret ref on close', async () => {
    // Harness reproduces the binding contract: the PARENT owns the secret ref
    // and nulls it (+ closes) on @close. The component caches nothing.
    const Harness = defineComponent({
      components: { ClientSecretReveal },
      setup() {
        const open = ref(true)
        const secret = ref<string | null>(SAMPLE_SECRET)
        const onClose = (): void => {
          secret.value = null
          open.value = false
        }
        return { open, secret, onClose }
      },
      template: `
        <ClientSecretReveal
          :open="open"
          :secret="secret"
          client-id="sample-app"
          title="t"
          description="d"
          warning="w"
          copy-label="Copy"
          clear-label="Clear"
          close-label="Close"
          @close="onClose"
        />`,
    })

    const wrapper = mount(Harness)
    expect(wrapper.html()).toContain(SAMPLE_SECRET)
    await wrapper.get('[data-testid="client-secret-clear"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.html()).not.toContain(SAMPLE_SECRET)
  })
})
```

- [ ] Run it — expect **FAIL** (component not found):

```bash
npm run test -- app/components/clients/__tests__/ClientSecretReveal.spec.ts
```

Expected: `Failed to resolve import "../ClientSecretReveal.vue"` — RED.

#### Step 4 — GREEN: implement `ClientSecretReveal.vue`

- [ ] Create `app/components/clients/ClientSecretReveal.vue`:

```vue
<script setup lang="ts">
import { ref } from 'vue'
import UiDialog from '@/components/ui/UiDialog.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { useI18n } from '@/composables/useI18n'

interface Props {
  readonly open: boolean
  readonly clientId: string
  readonly secret: string | null
  readonly envSnippet?: string
  readonly isPublic?: boolean
  readonly title: string
  readonly description: string
  readonly warning: string
  readonly copyLabel: string
  readonly clearLabel: string
  readonly closeLabel: string
}

const props = withDefaults(defineProps<Props>(), {
  envSnippet: '',
  isPublic: false,
})

const emit = defineEmits<{ (event: 'close'): void; (event: 'copy'): void }>()

const { t } = useI18n()

// Transient, component-local COPY FEEDBACK only — never the secret itself.
const copyState = ref<'idle' | 'copied' | 'failed'>('idle')

async function onCopy(): Promise<void> {
  // Copy the full env block when present (it embeds the SSO_CLIENT_SECRET line);
  // otherwise the bare secret. Read straight from props — never cached/stored.
  const payload = props.envSnippet || props.secret || ''
  try {
    await navigator.clipboard.writeText(payload)
    copyState.value = 'copied'
  } catch {
    // Swallow WITHOUT logging — the secret must never reach a console/log sink.
    copyState.value = 'failed'
  }
  emit('copy')
}

function onClose(): void {
  copyState.value = 'idle'
  emit('close')
}
</script>

<template>
  <UiDialog
    :open="open"
    title-id="client-secret-reveal"
    :title="title"
    :description="description"
    :close-label="closeLabel"
    @close="onClose"
  >
    <div class="secret-reveal">
      <p class="secret-reveal__warning" role="alert" data-testid="client-secret-warning">
        {{ warning }}
      </p>

      <code
        v-if="!isPublic && secret"
        class="secret-reveal__value"
        data-testid="client-secret-value"
        >{{ secret }}</code
      >

      <pre v-if="envSnippet" class="secret-reveal__env" data-testid="client-secret-env">{{
        envSnippet
      }}</pre>

      <p
        v-if="copyState !== 'idle'"
        class="secret-reveal__feedback"
        role="status"
        data-testid="client-secret-copy-feedback"
      >
        {{ copyState === 'copied' ? t('clients.copy_success') : t('clients.copy_failed') }}
      </p>

      <div class="secret-reveal__actions">
        <UiButton
          v-if="secret || envSnippet"
          variant="secondary"
          data-testid="client-secret-copy"
          @click="onCopy"
        >
          {{ copyLabel }}
        </UiButton>
        <UiButton variant="danger" data-testid="client-secret-clear" @click="onClose">
          {{ clearLabel }}
        </UiButton>
      </div>
    </div>
  </UiDialog>
</template>

<style scoped>
.secret-reveal {
  display: grid;
  gap: 14px;
}
.secret-reveal__warning {
  font: 500 0.8125rem/1.5 var(--font-sans);
  color: var(--danger);
}
.secret-reveal__value {
  padding: 10px 12px;
  font: 500 0.8125rem/1.4 var(--font-mono);
  color: var(--fg);
  word-break: break-all;
  background: var(--muted);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
}
.secret-reveal__env {
  padding: 12px;
  overflow-x: auto;
  font: 400 0.75rem/1.5 var(--font-mono);
  color: var(--fg);
  background: var(--muted);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
}
.secret-reveal__feedback {
  font: 400 0.75rem/1.4 var(--font-sans);
  color: var(--fg-2);
}
.secret-reveal__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
```

Notes on the binding choices: the warning text + the Clear affordance are the only `--danger #E4002B` elements (the destructive affordance), paired with text labels — never colour-alone. The secret renders in `--font-mono` (reserved for raw IDs/credentials). `isPublic` gates the bare-secret `<code>` (a public client never reveals a secret value, only its env block). The component never imports `useState`/Pinia/storage and never calls `console.*` with the secret.

- [ ] Run it — expect **PASS**:

```bash
npm run test -- app/components/clients/__tests__/ClientSecretReveal.spec.ts
```

Expected: all `ClientSecretReveal.spec.ts` tests green (renders once, copy works + emits, env-block copy, failure-without-log, close emits, no-store/no-log, DOM-absent-after-close).

#### Step 5 — REFACTOR

- [ ] No duplication to extract (two small pure helpers + one SFC). Confirm both new test files pass together and oxlint is clean on the new files:

```bash
npm run test -- app/lib/clients/__tests__/client-secret.spec.ts app/components/clients/__tests__/ClientSecretReveal.spec.ts
npx oxlint app/lib/clients/client-secret.ts app/components/clients/ClientSecretReveal.vue app/lib/clients/__tests__/client-secret.spec.ts app/components/clients/__tests__/ClientSecretReveal.spec.ts
```

Expected: tests green; oxlint reports `Found 0 warnings and 0 errors` (every `vi.fn` carries a type parameter).

#### Step 6 — Commit

- [ ] Stage and commit:

```bash
git add app/lib/clients/client-secret.ts \
  app/components/clients/ClientSecretReveal.vue \
  app/lib/clients/__tests__/client-secret.spec.ts \
  app/components/clients/__tests__/ClientSecretReveal.spec.ts
git commit -m "feat(sso-admin-frontend): one-time client-secret reveal primitive

Add the pure extractRevealedSecret fallback chain + buildClientEnvSnippet
SSO_* block builder, and ClientSecretReveal.vue: shows the plaintext secret
once with an explicit destructive warning, a tested copy action, the optional
env snippet, and a Clear/Close affordance. The parent owns the secret as a
client-only ref and nulls it on close; the component persists nothing and
never logs the secret. Consumed by client create (Task 5.10) and rotate
(Task 5.12).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

**Task DoD (run from `services/sso-admin-frontend`):** `npm run typecheck && npm run lint && npm run format:check && npm run test && npm run build` — all green (the two new pure-helper/component specs included; report any blocked command explicitly, never claim PASS for a command that did not run). The one-time-secret discipline is proven here by `ClientSecretReveal.spec.ts` (renders once · copy tested · feedback-without-log · **secret absent from the DOM after the parent nulls the ref on close** · never written to `localStorage`/`sessionStorage` · never logged); the SSR-payload leak gate for the freshly-issued secret is extended in Task 5.14, and the create/rotate privileged-action matrix in Tasks 5.10/5.12.

---

### Task 5.10: Create client page (`clients/new.vue`) with one-time secret reveal

Create `app/pages/clients/new.vue` — the Swiss create-client form built on `FormPageShell` + `FormSection` + `UiFormField`/`UiInput`/`UiSelect`. Three sections: **identity** (display name → auto-slugs `client_id` until the operator edits it, with a live valid/invalid indicator from `isValidClientId`; owner email), **integration** (client type `public`/`confidential`, **category required** `publik`/`kepegawaian`, redirect URI, optional backchannel logout URI), and **scopes** (a free-text scopes input parsed by `parseScopes`, `openid` always forced into the submitted set; `useScopeCatalog` renders the catalog names as a fail-closed hint list). All gating uses the Task-5.3 pure validators via `validateClientCreateForm` + the live per-field computeds. Submit runs through the **reused** `usePrivilegedAction` (`admin.clients.write`, freshness `step_up`) so the full failure matrix + step-up are honoured by the one shared runner. On a successful **create** of a confidential client the response carries `plaintext_secret`; it is placed in a **client-only `ref`** (set from the client-side POST, never SSR-hydrated) and `ClientSecretReveal` opens; on its close the ref is nulled and the page `navigateTo`s the detail route. A public create has no secret → navigate straight to detail. A secondary **Stage** action posts `clientsApi.stage` (staged registration, no secret) and navigates to detail. There is **no `?created=` query, no cross-page intent, no Pinia store** — the dropped legacy `createdClientIntent` anti-pattern is not carried forward. Copy-and-adapt of `app/pages/users/new.vue`.

> ponytail: one `usePrivilegedAction<CreateClientResponse>()` instance serves both submit paths — the stage runner maps `ClientIntegrationResponse → { registration }`, which is assignable to `CreateClientResponse` (its `plaintext_secret` is just absent), so the success branch ("secret? reveal : navigate") is identical for both and never reveals on stage. No new failure-mapping code: the 401/403/419/422/428/429/5xx→status matrix is owned + unit-tested in `usePrivilegedAction` (Phase 4) and in `resolvePrivilegedActionFailure`; this page test mocks that composable and drives each mapped status to assert the page's surface/navigation — the correct altitude. No `UiTextarea`, no checkbox-grid component for scopes here (the scope-policy grid is Task 5.11's edit form); a one-line `parseScopes` + forced `openid` is enough for create. The plaintext secret is a plain `ref(null)` — never `useState`/Pinia/storage — so it is structurally impossible for it to enter the SSR payload (it is only ever assigned inside the client-side click handler).

**Files**
- Create: `app/pages/clients/new.vue`
- Modify: `app/locales/id.json`, `app/locales/en.json` (ADD only the genuinely-new keys below, to BOTH files, keeping id↔en parity; REUSE the existing `clients.*` namespace — 141 keys already present — and the existing `common.*`/`menu.*` keys)
- Test: `app/pages/__tests__/clients-new.page.nuxt.spec.ts`
- (Unchanged, must go/stay green) `app/pages/__tests__/route-map.spec.ts` — already enumerates `clients/new.vue` → `admin.clients.create` / `['admin.clients.write']`; the `definePageMeta` block must match it exactly (this is the first task that makes that row pass).

**Interfaces**
- Produces: the rendered `/clients/new` route page named `admin.clients.create` — `definePageMeta({ name: 'admin.clients.create', layout: 'admin', requiresAdmin: true, permissions: ['admin.clients.write'] })`. `const action = usePrivilegedAction<CreateClientResponse>()`. Submit: `const created = await action.run(() => clientsApi.create(payload)); if (!created) return; if (created.plaintext_secret) { revealedClientId.value = created.registration.client_id; revealedSecret.value = created.plaintext_secret } else { navigateTo(detail) }`. Reveal close → null `revealedSecret` (client-only `ref`) then `navigateTo({ name: 'admin.clients.detail', params: { clientId } })`. Stage path → `clientsApi.stage(payload)` then navigate. New `clients.*` locale keys added with parity. No exported API.
- Consumes: `usePrivilegedAction` (`@/composables/usePrivilegedAction`, Phase 4 reused — NOT copied into a clients path); `clientsApi.create`/`clientsApi.stage` (`@/services/clients.api`, Task 5.4); `validateClientCreateForm`/`toClientCreatePayload`/`slugifyClientId`/`isValidClientId`/`parseScopes`/`ClientCreateForm` (`@/lib/clients/client-create-form`, Task 5.3); `useScopeCatalog` (`@/composables/useScopeCatalog`, Task 5.5); `ClientSecretReveal` (`@/components/clients/ClientSecretReveal.vue`) + `buildClientEnvSnippet` (`@/lib/clients/client-secret`, Task 5.9); `CreateClientResponse` (`@/types/clients.types`, Task 5.1); `FormPageShell`/`FormSection` (`@/components/form/*`), `UiFormField`/`UiInput`/`UiSelect` (+ `UiSelectOption`) / `UiStatusView` (`@/components/ui/*`); `useI18n`; `navigateTo` + named route `admin.clients.detail` (Nuxt auto-imports). Copy-and-adapt template: `app/pages/users/new.vue`.

**Steps**

1. [ ] Add the new locale keys to BOTH catalogs (parity is enforced — no missing-key tolerance). Insert into the `clients` object of `app/locales/id.json`:

```json
"btn_stage": "Simpan sebagai draft",
"create_failed_title": "Gagal membuat klien",
"create_failed_desc": "Permintaan tidak dapat diselesaikan. Coba lagi, dan sertakan referensi dukungan bila menghubungi tim.",
"rate_limited_title": "Terlalu banyak permintaan",
"rate_limited_desc": "Batas permintaan tercapai. Tunggu sebentar lalu coba lagi."
```

   And the English mirror into the `clients` object of `app/locales/en.json`:

```json
"btn_stage": "Save as draft",
"create_failed_title": "Could not create the client",
"create_failed_desc": "The request could not be completed. Try again, and quote the support reference if you contact the team.",
"rate_limited_title": "Too many requests",
"rate_limited_desc": "Request limit reached. Wait a moment and try again."
```

   (`forbidden_title`, `error_title`, `step_up_title`, `step_up_description`, `step_up_action`, `create_title`, `create_dialog_description`, `create_identity_section_desc`, `create_config_section_desc`, `btn_create_client`, `secret_reveal_title`/`secret_reveal_warning`/`create_secret_warning`/`btn_copy_secret`/`btn_clear_secret`/`btn_done`/`btn_copy_all_config`, and every `label_*`/`validation_*`/`category_*`/`type_*`/`client_id_*`/`scopes_hint`/`redirect_uri_helper`/`logout_url_helper` key already exist in `clients.*` — do NOT re-add them. `common.session_expired_title`/`common.session_expired_desc`/`common.forbidden_desc`/`common.identity`/`common.btn_cancel` and `menu.clients` already exist. Run `npm run format:check` after editing JSON so order/trailing commas stay clean.)

2. [ ] Write the FAILING test `app/pages/__tests__/clients-new.page.nuxt.spec.ts` — real behaviour: validation gating, the create-success → one-time-secret reveal → close → navigate path, the public-create → straight navigate path, the stage path, the privileged-action matrix driven through the mocked shared runner, and the one-time-secret + no-leak guarantees:

```ts
// *.nuxt.spec.ts → 'nuxt' env: mountSuspended runs the page's async setup
// (useScopeCatalog, useI18n). The service seam, the scope catalog, the shared
// privileged-action runner, the session store and navigateTo are mocked so each
// branch is deterministic.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import ClientSecretReveal from '@/components/clients/ClientSecretReveal.vue'
import type {
  ClientCreatePayload,
  CreateClientResponse,
  ClientIntegrationResponse,
  ScopeCatalogEntry,
} from '@/types/clients.types'
import type {
  PrivilegedActionFailure,
  PrivilegedActionStatus,
} from '@/lib/users/privileged-action'

// --- service seam -----------------------------------------------------------
const createMock = vi.fn<(p: ClientCreatePayload) => Promise<CreateClientResponse>>()
const stageMock = vi.fn<(p: ClientCreatePayload) => Promise<ClientIntegrationResponse>>()
vi.mock('@/services/clients.api', () => ({
  clientsApi: { create: createMock, stage: stageMock },
}))

// --- scope catalog (fail-closed hint list) ----------------------------------
const catalog = ref<readonly ScopeCatalogEntry[]>([])
vi.mock('@/composables/useScopeCatalog', () => ({
  useScopeCatalog: () => ({
    scopes: computed(() => catalog.value),
    pending: computed(() => false),
    error: computed(() => null),
  }),
}))

// --- session store ----------------------------------------------------------
const hasPermissionMock = vi.fn<(p: string) => boolean>(() => true)
vi.mock('@/stores/session.store', () => ({
  useSessionStore: () => ({ hasPermission: hasPermissionMock }),
}))

// --- shared privileged-action runner (the matrix lives in Phase 4; here we
//     drive its observable outputs) ------------------------------------------
const status = ref<PrivilegedActionStatus>('idle')
const isSubmitting = ref(false)
const failure = ref<PrivilegedActionFailure | null>(null)
const stepUpUrl = ref<string | null>(null)
const runMock = vi.fn<(runner: () => Promise<unknown>) => Promise<unknown>>(async (runner) => {
  status.value = 'submitting'
  isSubmitting.value = true
  failure.value = null
  try {
    const data = await runner()
    status.value = 'success'
    return data
  } catch {
    return null
  } finally {
    isSubmitting.value = false
  }
})
const resetMock = vi.fn<() => void>(() => {
  status.value = 'idle'
  failure.value = null
})
vi.mock('@/composables/usePrivilegedAction', () => ({
  usePrivilegedAction: () => ({
    status,
    isSubmitting: computed(() => isSubmitting.value),
    failure,
    requestId: computed(() => failure.value?.requestId ?? null),
    auditEventId: computed(() => failure.value?.auditEventId ?? null),
    fieldErrors: computed(() => failure.value?.fieldErrors ?? {}),
    stepUpUrl,
    run: runMock,
    reset: resetMock,
  }),
}))

// --- navigateTo -------------------------------------------------------------
// vi.hoisted ensures navigateMock exists before mockNuxtImport's hoisted factory runs
const navigateMock = vi.hoisted(() => vi.fn<() => Promise<void>>(async () => {}))
mockNuxtImport('navigateTo', () => navigateMock)

function makeCreated(secret: string | undefined): CreateClientResponse {
  return {
    registration: {
      client_id: 'selamat-kerja',
      display_name: 'Selamat Kerja',
      type: secret ? 'confidential' : 'public',
      environment: 'development',
      app_base_url: 'https://selamat-kerja.example.test',
      redirect_uris: ['https://selamat-kerja.example.test/auth/callback'],
      allowed_scopes: ['openid', 'profile'],
      status: 'staged',
      has_secret_hash: Boolean(secret),
    },
    ...(secret ? { plaintext_secret: secret } : {}),
  }
}

const ClientsNew = (await import('../clients/new.vue')).default

// fill a confidential, valid form (scopes input always yields openid + the typed set)
async function fillValid(
  wrapper: Awaited<ReturnType<typeof mountSuspended>>,
  type: 'confidential' | 'public' = 'confidential',
) {
  await wrapper.find('#create_display_name').setValue('Selamat Kerja')
  await wrapper.find('#create_owner_email').setValue('ops@example.test')
  await wrapper.find('#create_client_type').setValue(type)
  await wrapper.find('#create_category').setValue('kepegawaian')
  await wrapper
    .find('#create_redirect_uri')
    .setValue('https://selamat-kerja.example.test/auth/callback')
  await wrapper.find('#create_scopes').setValue('profile email')
  await wrapper.vm.$nextTick()
}

beforeEach(() => {
  catalog.value = [
    { name: 'openid', description: 'OpenID', claims: ['sub'], default_allowed: true },
    { name: 'profile', description: 'Profile', claims: ['name'], default_allowed: true },
  ]
  status.value = 'idle'
  isSubmitting.value = false
  failure.value = null
  stepUpUrl.value = null
  hasPermissionMock.mockReturnValue(true)
  vi.clearAllMocks()
  createMock.mockResolvedValue(makeCreated('topsecret-plaintext-XYZ'))
  stageMock.mockResolvedValue({ registration: makeCreated(undefined).registration })
})
afterEach(() => vi.clearAllMocks())

describe('clients/new page — validation gating', () => {
  it('disables submit on an empty form', async () => {
    const wrapper = await mountSuspended(ClientsNew)
    expect(wrapper.find('[data-testid="form-submit"]').attributes('disabled')).toBeDefined()
  })

  it('auto-slugs the client_id from the display name and flags it valid', async () => {
    const wrapper = await mountSuspended(ClientsNew)
    await wrapper.find('#create_display_name').setValue('Selamat Kerja')
    await wrapper.vm.$nextTick()
    expect((wrapper.find('#create_client_id').element as HTMLInputElement).value).toBe(
      'selamat-kerja',
    )
    expect(wrapper.find('[data-testid="client-id-valid"]').exists()).toBe(true)
  })

  it('flags an invalid (too-short) client_id and keeps submit disabled', async () => {
    const wrapper = await mountSuspended(ClientsNew)
    await fillValid(wrapper)
    await wrapper.find('#create_client_id').setValue('ab') // < 3 chars
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="client-id-invalid"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="form-submit"]').attributes('disabled')).toBeDefined()
  })

  it('keeps submit disabled until a category is chosen (category is required)', async () => {
    const wrapper = await mountSuspended(ClientsNew)
    await wrapper.find('#create_display_name').setValue('Selamat Kerja')
    await wrapper.find('#create_owner_email').setValue('ops@example.test')
    await wrapper.find('#create_client_type').setValue('confidential')
    await wrapper
      .find('#create_redirect_uri')
      .setValue('https://selamat-kerja.example.test/auth/callback')
    await wrapper.find('#create_scopes').setValue('profile')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="form-submit"]').attributes('disabled')).toBeDefined()
    await wrapper.find('#create_category').setValue('kepegawaian')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="form-submit"]').attributes('disabled')).toBeUndefined()
  })

  it('flags an invalid redirect URI (wildcard) and keeps submit disabled', async () => {
    const wrapper = await mountSuspended(ClientsNew)
    await fillValid(wrapper)
    await wrapper.find('#create_redirect_uri').setValue('https://*.example.test/cb')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('#create_redirect_uri-error').exists()).toBe(true)
    expect(wrapper.find('[data-testid="form-submit"]').attributes('disabled')).toBeDefined()
  })

  it('enables submit on a valid form', async () => {
    const wrapper = await mountSuspended(ClientsNew)
    await fillValid(wrapper)
    expect(wrapper.find('[data-testid="form-submit"]').attributes('disabled')).toBeUndefined()
  })
})

describe('clients/new page — create privileged-action matrix', () => {
  it('4.1 confidential success → create called with openid-forced scopes, reveals the secret once, no navigation yet', async () => {
    const wrapper = await mountSuspended(ClientsNew)
    await fillValid(wrapper)
    await wrapper.find('[data-testid="form-submit"]').trigger('click')
    await wrapper.vm.$nextTick()

    expect(createMock).toHaveBeenCalledTimes(1)
    const payload = createMock.mock.calls[0]![0]
    expect(payload.client_id).toBe('selamat-kerja')
    expect(payload.category).toBe('kepegawaian')
    expect(payload.client_type).toBe('confidential')
    expect(payload.allowed_scopes).toContain('openid') // openid forced even though not typed
    expect(payload.allowed_scopes).toContain('profile')

    const reveal = wrapper.findComponent(ClientSecretReveal)
    expect(reveal.props('open')).toBe(true)
    expect(reveal.props('secret')).toBe('topsecret-plaintext-XYZ')
    expect(navigateMock).not.toHaveBeenCalled() // navigation deferred to reveal close
  })

  it('public success → no secret reveal, navigates straight to the detail route', async () => {
    createMock.mockResolvedValueOnce(makeCreated(undefined))
    const wrapper = await mountSuspended(ClientsNew)
    await fillValid(wrapper, 'public')
    await wrapper.find('[data-testid="form-submit"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.findComponent(ClientSecretReveal).props('open')).toBe(false)
    expect(navigateMock).toHaveBeenCalledWith({
      name: 'admin.clients.detail',
      params: { clientId: 'selamat-kerja' },
    })
  })

  it('stage path posts clientsApi.stage (no create, no secret) and navigates to detail', async () => {
    const wrapper = await mountSuspended(ClientsNew)
    await fillValid(wrapper)
    await wrapper.find('[data-testid="form-stage"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(stageMock).toHaveBeenCalledTimes(1)
    expect(createMock).not.toHaveBeenCalled()
    expect(wrapper.findComponent(ClientSecretReveal).props('open')).toBe(false)
    expect(navigateMock).toHaveBeenCalledWith({
      name: 'admin.clients.detail',
      params: { clientId: 'selamat-kerja' },
    })
  })

  it('4.2 forbidden / 403 → forbidden surface, no navigation, redacted reference', async () => {
    runMock.mockImplementationOnce(async () => {
      status.value = 'forbidden'
      failure.value = {
        status: 'forbidden',
        requestId: 'admin-req-DENIED42',
        auditEventId: null,
        fieldErrors: {},
        stepUpUrl: null,
      }
      isSubmitting.value = false
      return null
    })
    const wrapper = await mountSuspended(ClientsNew)
    await fillValid(wrapper)
    await wrapper.find('[data-testid="form-submit"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.findComponent(UiStatusView).props('tone')).toBe('forbidden')
    expect(navigateMock).not.toHaveBeenCalled()
    expect(wrapper.text()).not.toContain('admin-req-DENIED42')
    expect(wrapper.text()).toContain('REF-')
  })

  it('4.3 unauthenticated / 401 (and 419) → step-up tone surface, no navigation', async () => {
    runMock.mockImplementationOnce(async () => {
      status.value = 'unauthenticated'
      failure.value = {
        status: 'unauthenticated',
        requestId: null,
        auditEventId: null,
        fieldErrors: {},
        stepUpUrl: null,
      }
      isSubmitting.value = false
      return null
    })
    const wrapper = await mountSuspended(ClientsNew)
    await fillValid(wrapper)
    await wrapper.find('[data-testid="form-submit"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.findComponent(UiStatusView).props('tone')).toBe('step_up')
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('4.5 rate limit / 429 → safe rate-limited copy, no raw exception', async () => {
    runMock.mockImplementationOnce(async () => {
      status.value = 'rate_limited'
      failure.value = {
        status: 'rate_limited',
        requestId: 'admin-req-RL',
        auditEventId: null,
        fieldErrors: {},
        stepUpUrl: null,
      }
      isSubmitting.value = false
      return null
    })
    const wrapper = await mountSuspended(ClientsNew)
    await fillValid(wrapper)
    await wrapper.find('[data-testid="form-submit"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.findComponent(UiStatusView).props('tone')).toBe('error')
    expect(wrapper.text()).not.toMatch(/SQLSTATE|stack trace|Bearer/i)
  })

  it('4.6 validation / 422 → server field errors bind to fields, no navigation', async () => {
    runMock.mockImplementationOnce(async () => {
      status.value = 'invalid'
      failure.value = {
        status: 'invalid',
        requestId: null,
        auditEventId: null,
        fieldErrors: { client_id: ['client_id already registered.'] },
        stepUpUrl: null,
      }
      isSubmitting.value = false
      return null
    })
    const wrapper = await mountSuspended(ClientsNew)
    await fillValid(wrapper)
    await wrapper.find('[data-testid="form-submit"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('#create_client_id-error').text()).toContain('already registered.')
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('4.7 step-up / 428 → step-up notice + re-auth link to step_up_url, no navigation', async () => {
    runMock.mockImplementationOnce(async () => {
      status.value = 'step_up_required'
      stepUpUrl.value = '/auth/login?prompt=login&max_age=0'
      failure.value = {
        status: 'step_up_required',
        requestId: null,
        auditEventId: null,
        fieldErrors: {},
        stepUpUrl: '/auth/login?prompt=login&max_age=0',
      }
      isSubmitting.value = false
      return null
    })
    const wrapper = await mountSuspended(ClientsNew)
    await fillValid(wrapper)
    await wrapper.find('[data-testid="form-submit"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.findComponent(UiStatusView).props('tone')).toBe('step_up')
    const link = wrapper.find('[data-testid="step-up-link"]')
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toBe('/auth/login?prompt=login&max_age=0')
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('4.8 backend 5xx → error tone surface with safe copy + redacted reference', async () => {
    runMock.mockImplementationOnce(async () => {
      status.value = 'error'
      failure.value = {
        status: 'error',
        requestId: 'admin-req-FAILED99',
        auditEventId: null,
        fieldErrors: {},
        stepUpUrl: null,
      }
      isSubmitting.value = false
      return null
    })
    const wrapper = await mountSuspended(ClientsNew)
    await fillValid(wrapper)
    await wrapper.find('[data-testid="form-submit"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.findComponent(UiStatusView).props('tone')).toBe('error')
    expect(wrapper.text()).toContain('REF-')
    expect(wrapper.text()).not.toContain('admin-req-FAILED99')
  })

  it('4.10 leaves no stale loading/disabled state after an error (valid form stays submittable)', async () => {
    runMock.mockImplementationOnce(async () => {
      status.value = 'error'
      failure.value = {
        status: 'error',
        requestId: null,
        auditEventId: null,
        fieldErrors: {},
        stepUpUrl: null,
      }
      isSubmitting.value = false
      return null
    })
    const wrapper = await mountSuspended(ClientsNew)
    await fillValid(wrapper)
    await wrapper.find('[data-testid="form-submit"]').trigger('click')
    await wrapper.vm.$nextTick()
    const submit = wrapper.find('[data-testid="form-submit"]')
    expect(submit.attributes('disabled')).toBeUndefined()
    expect(submit.attributes('aria-busy')).toBeUndefined()
  })

  it('does nothing (no run, no create) when submit is invoked on an invalid form', async () => {
    const wrapper = await mountSuspended(ClientsNew)
    await wrapper.find('[data-testid="form-submit"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(runMock).not.toHaveBeenCalled()
    expect(createMock).not.toHaveBeenCalled()
  })
})

describe('clients/new page — one-time secret discipline', () => {
  it('reveals the secret once, then on close nulls the ref (secret absent from DOM) and navigates to detail', async () => {
    const wrapper = await mountSuspended(ClientsNew)
    await fillValid(wrapper)
    await wrapper.find('[data-testid="form-submit"]').trigger('click')
    await wrapper.vm.$nextTick()

    const reveal = wrapper.findComponent(ClientSecretReveal)
    expect(reveal.props('secret')).toBe('topsecret-plaintext-XYZ')

    // closing the modal nulls the client-only ref and navigates
    reveal.vm.$emit('close')
    await wrapper.vm.$nextTick()
    expect(wrapper.findComponent(ClientSecretReveal).props('open')).toBe(false)
    expect(wrapper.findComponent(ClientSecretReveal).props('secret')).toBeNull()
    expect(wrapper.html()).not.toContain('topsecret-plaintext-XYZ')
    expect(navigateMock).toHaveBeenCalledWith({
      name: 'admin.clients.detail',
      params: { clientId: 'selamat-kerja' },
    })
  })

  it('never persists the plaintext secret to localStorage / sessionStorage', async () => {
    const wrapper = await mountSuspended(ClientsNew)
    await fillValid(wrapper)
    await wrapper.find('[data-testid="form-submit"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(JSON.stringify(window.localStorage)).not.toContain('topsecret-plaintext-XYZ')
    expect(JSON.stringify(window.sessionStorage)).not.toContain('topsecret-plaintext-XYZ')
  })

  it('SSR-renders the empty form with no client_secret field name or token shape in the markup', async () => {
    const wrapper = await mountSuspended(ClientsNew)
    const html = wrapper.html()
    expect(html).not.toMatch(/client_secret|clientSecret/)
    expect(html).not.toMatch(/access_token|refresh_token|id_token|Bearer/)
  })
})
```

3. [ ] Run it — expect FAIL (the page file does not exist yet):

```
npm run test -- clients-new.page
```
   Expected output: `Error: Failed to load url ../clients/new.vue` (or `Cannot find module`), the suite is RED. (Also `route-map.spec.ts`'s `clients/new.vue` row is currently red for the same reason — it goes green in the next step.)

4. [ ] Minimal implementation — create `app/pages/clients/new.vue`:

```vue
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Check, X } from 'lucide-vue-next'
import { useI18n } from '@/composables/useI18n'
import { usePrivilegedAction } from '@/composables/usePrivilegedAction'
import { useScopeCatalog } from '@/composables/useScopeCatalog'
import { clientsApi } from '@/services/clients.api'
import {
  slugifyClientId,
  isValidClientId,
  parseScopes,
  validateClientCreateForm,
  toClientCreatePayload,
  type ClientCreateForm,
} from '@/lib/clients/client-create-form'
import { buildClientEnvSnippet } from '@/lib/clients/client-secret'
import type { CreateClientResponse } from '@/types/clients.types'
import FormPageShell from '@/components/form/FormPageShell.vue'
import FormSection from '@/components/form/FormSection.vue'
import UiFormField from '@/components/ui/UiFormField.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiSelect, { type UiSelectOption } from '@/components/ui/UiSelect.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import UiButton from '@/components/ui/UiButton.vue'
import ClientSecretReveal from '@/components/clients/ClientSecretReveal.vue'

definePageMeta({
  name: 'admin.clients.create',
  layout: 'admin',
  requiresAdmin: true,
  permissions: ['admin.clients.write'],
})

const { t } = useI18n()
const action = usePrivilegedAction<CreateClientResponse>()
const { scopes: catalogScopes } = useScopeCatalog()

// --- form state -------------------------------------------------------------
const form = ref<ClientCreateForm>({
  display_name: '',
  client_id: '',
  owner_email: '',
  client_type: null,
  category: '',
  redirect_uri: '',
  backchannel_logout_uri: '',
})
const scopesText = ref('')
const isClientIdManual = ref(false)

// openid is always forced into the submitted set (TDD parity)
const selectedScopes = computed<readonly string[]>(() =>
  Array.from(new Set(['openid', ...parseScopes(scopesText.value)])),
)

watch(
  () => form.value.display_name,
  (name) => {
    if (!isClientIdManual.value) form.value.client_id = slugifyClientId(name)
  },
)

const clientTypeOptions = computed<readonly UiSelectOption[]>(() => [
  { value: 'public', label: t('clients.type_public') },
  { value: 'confidential', label: t('clients.type_confidential') },
])
const categoryOptions = computed<readonly UiSelectOption[]>(() => [
  { value: '', label: t('clients.category_placeholder') },
  { value: 'publik', label: t('clients.category_public') },
  { value: 'kepegawaian', label: t('clients.category_staff') },
])

// --- validation -------------------------------------------------------------
const fieldErrors = computed(() => validateClientCreateForm(form.value, selectedScopes.value))
const serverFieldErrors = computed(() => action.fieldErrors.value)
function serverError(field: string): string | undefined {
  return serverFieldErrors.value[field]?.[0]
}
function fieldError(field: string): string | undefined {
  const key = fieldErrors.value[field]
  return key ? t(key) : serverError(field)
}

const clientIdValid = computed<boolean>(() => isValidClientId(form.value.client_id.trim()))
const isInvalid = computed<boolean>(() => Object.keys(fieldErrors.value).length > 0)

// --- failure surface --------------------------------------------------------
const showFailure = computed<boolean>(() =>
  ['forbidden', 'unauthenticated', 'step_up_required', 'rate_limited', 'error'].includes(
    action.status.value,
  ),
)
const failureTone = computed<'error' | 'forbidden' | 'step_up'>(() => {
  switch (action.status.value) {
    case 'forbidden':
      return 'forbidden'
    case 'unauthenticated':
    case 'step_up_required':
      return 'step_up'
    default:
      return 'error'
  }
})
const failureTitle = computed<string>(() => {
  switch (action.status.value) {
    case 'forbidden':
      return t('clients.forbidden_title')
    case 'unauthenticated':
      return t('common.session_expired_title')
    case 'step_up_required':
      return t('clients.step_up_title')
    case 'rate_limited':
      return t('clients.rate_limited_title')
    default:
      return t('clients.create_failed_title')
  }
})
const failureDescription = computed<string>(() => {
  switch (action.status.value) {
    case 'forbidden':
      return t('common.forbidden_desc')
    case 'unauthenticated':
      return t('common.session_expired_desc')
    case 'step_up_required':
      return t('clients.step_up_description')
    case 'rate_limited':
      return t('clients.rate_limited_desc')
    default:
      return t('clients.create_failed_desc')
  }
})

// --- one-time secret (CLIENT-ONLY ref — never useState/Pinia/storage) --------
const revealedSecret = ref<string | null>(null)
const revealedClientId = ref('')
const revealOpen = computed<boolean>(() => revealedSecret.value !== null)
const envSnippet = computed<string>(() =>
  buildClientEnvSnippet({
    clientId: revealedClientId.value,
    secret: revealedSecret.value,
    redirectUri: form.value.redirect_uri.trim(),
    scopes: selectedScopes.value,
  }),
)

// --- submit -----------------------------------------------------------------
async function submit(mode: 'create' | 'stage'): Promise<void> {
  if (isInvalid.value || action.isSubmitting.value) return
  const payload = toClientCreatePayload(form.value, selectedScopes.value)
  const result = await action.run(() =>
    mode === 'stage'
      ? clientsApi.stage(payload).then((r) => ({ registration: r.registration }))
      : clientsApi.create(payload),
  )
  if (!result) return
  if (result.plaintext_secret) {
    revealedClientId.value = result.registration.client_id
    revealedSecret.value = result.plaintext_secret
    return
  }
  await navigateTo({
    name: 'admin.clients.detail',
    params: { clientId: result.registration.client_id },
  })
}

async function onRevealClose(): Promise<void> {
  const clientId = revealedClientId.value
  revealedSecret.value = null // clear the one-time secret
  revealedClientId.value = ''
  await navigateTo({ name: 'admin.clients.detail', params: { clientId } })
}

async function onCancel(): Promise<void> {
  await navigateTo({ name: 'admin.clients' })
}
</script>

<template>
  <FormPageShell
    :parent-label="t('menu.clients')"
    :active-label="t('clients.create_title')"
    :title="t('clients.create_title')"
    :description="t('clients.create_dialog_description')"
    :submit-label="t('clients.btn_create_client')"
    :cancel-label="t('common.btn_cancel')"
    :is-submitting="action.isSubmitting.value"
    :is-invalid="isInvalid"
    @submit="submit('create')"
    @cancel="onCancel"
  >
    <template #footer-right>
      <UiButton
        variant="secondary"
        type="button"
        data-testid="form-stage"
        :disabled="isInvalid || action.isSubmitting.value"
        @click="submit('stage')"
      >
        {{ t('clients.btn_stage') }}
      </UiButton>
      <UiButton
        variant="primary"
        type="button"
        data-testid="form-submit"
        :disabled="isInvalid || action.isSubmitting.value"
        :aria-busy="action.isSubmitting.value ? 'true' : undefined"
        @click="submit('create')"
      >
        {{ t('clients.btn_create_client') }}
      </UiButton>
    </template>

    <UiStatusView
      v-if="showFailure"
      :tone="failureTone"
      :eyebrow="t('menu.clients')"
      :title="failureTitle"
      :description="failureDescription"
      :request-id="action.requestId.value ?? undefined"
      :standalone="false"
    >
      <template v-if="action.stepUpUrl.value" #actions>
        <a class="clients-new__step-up" :href="action.stepUpUrl.value" data-testid="step-up-link">
          {{ t('clients.step_up_action') }}
        </a>
      </template>
    </UiStatusView>

    <FormSection :title="t('common.identity')" :description="t('clients.create_identity_section_desc')">
      <UiFormField
        id="create_display_name"
        :label="t('clients.label_display_name')"
        :error="fieldError('display_name')"
        required
      >
        <UiInput
          id="create_display_name"
          v-model="form.display_name"
          autocomplete="off"
          :invalid="Boolean(fieldError('display_name'))"
        />
      </UiFormField>

      <UiFormField
        id="create_client_id"
        :label="t('clients.label_client_id')"
        :hint="t('clients.client_id_helper')"
        :error="fieldError('client_id')"
        required
      >
        <div class="clients-new__client-id">
          <UiInput
            id="create_client_id"
            v-model="form.client_id"
            autocomplete="off"
            :invalid="Boolean(fieldError('client_id'))"
            @input="isClientIdManual = true"
          />
          <span
            v-if="form.client_id.trim() && clientIdValid"
            class="clients-new__id-ok"
            data-testid="client-id-valid"
          >
            <Check :size="14" aria-hidden="true" /> {{ t('clients.client_id_valid') }}
          </span>
          <span
            v-else-if="form.client_id.trim()"
            class="clients-new__id-bad"
            data-testid="client-id-invalid"
          >
            <X :size="14" aria-hidden="true" /> {{ t('clients.client_id_invalid') }}
          </span>
        </div>
      </UiFormField>

      <UiFormField
        id="create_owner_email"
        :label="t('clients.label_owner_email')"
        :error="fieldError('owner_email')"
        required
      >
        <UiInput
          id="create_owner_email"
          v-model="form.owner_email"
          type="email"
          autocomplete="off"
          :invalid="Boolean(fieldError('owner_email'))"
        />
      </UiFormField>
    </FormSection>

    <FormSection
      :title="t('clients.metadata_title')"
      :description="t('clients.create_config_section_desc')"
    >
      <UiFormField id="create_client_type" :label="t('clients.label_client_type')" required>
        <UiSelect
          id="create_client_type"
          v-model="form.client_type"
          :options="clientTypeOptions"
        />
      </UiFormField>

      <UiFormField
        id="create_category"
        :label="t('clients.label_category')"
        :hint="t('clients.category_helper')"
        :error="fieldError('category')"
        required
      >
        <UiSelect id="create_category" v-model="form.category" :options="categoryOptions" />
      </UiFormField>

      <UiFormField
        id="create_redirect_uri"
        :label="t('clients.label_redirect_uri')"
        :hint="t('clients.redirect_uri_helper')"
        :error="fieldError('redirect_uri')"
        required
      >
        <UiInput
          id="create_redirect_uri"
          v-model="form.redirect_uri"
          autocomplete="off"
          :invalid="Boolean(fieldError('redirect_uri'))"
        />
      </UiFormField>

      <UiFormField
        id="create_backchannel_uri"
        :label="t('clients.label_backchannel_uri')"
        :hint="t('clients.logout_url_helper')"
        :error="fieldError('backchannel_logout_uri')"
      >
        <UiInput
          id="create_backchannel_uri"
          v-model="form.backchannel_logout_uri"
          autocomplete="off"
          :invalid="Boolean(fieldError('backchannel_logout_uri'))"
        />
      </UiFormField>
    </FormSection>

    <FormSection :title="t('clients.allowed_scopes_title')">
      <UiFormField
        id="create_scopes"
        :label="t('clients.label_allowed_scopes')"
        :hint="t('clients.scopes_hint')"
        :error="fieldError('scopes')"
        required
      >
        <UiInput
          id="create_scopes"
          v-model="scopesText"
          autocomplete="off"
          :invalid="Boolean(fieldError('scopes'))"
        />
      </UiFormField>
      <ul v-if="catalogScopes.length" class="clients-new__catalog" aria-live="polite">
        <li v-for="scope in catalogScopes" :key="scope.name">{{ scope.name }}</li>
      </ul>
    </FormSection>
  </FormPageShell>

  <ClientSecretReveal
    :open="revealOpen"
    :client-id="revealedClientId"
    :secret="revealedSecret"
    :env-snippet="envSnippet"
    :title="t('clients.secret_reveal_title')"
    :description="t('clients.create_secret_warning')"
    :warning="t('clients.secret_reveal_warning')"
    :copy-label="t('clients.btn_copy_secret')"
    :clear-label="t('clients.btn_clear_secret')"
    :close-label="t('clients.btn_done')"
    @close="onRevealClose"
  />
</template>

<style scoped>
.clients-new__client-id {
  display: flex;
  align-items: center;
  gap: 12px;
}
.clients-new__id-ok,
.clients-new__id-bad {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font: 600 0.75rem/1 var(--font-sans);
  white-space: nowrap;
}
.clients-new__id-ok {
  color: var(--success);
}
.clients-new__id-bad {
  color: var(--danger);
}
.clients-new__catalog {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
  font: 500 0.6875rem/1 var(--font-mono);
  color: var(--fg-3);
}
.clients-new__step-up {
  font: 600 0.8125rem/1 var(--font-sans);
  color: var(--accent);
  text-decoration: underline;
}
</style>
```

   (`UiSelect` returns the raw option value for `client_type`/`category`; `''` keeps category unselected so `validateClientCreateForm` flags it required. `category` is typed `ClientCategory | ''` in `ClientCreateForm`, matching the `''` placeholder. The `#footer-right` slot replaces `FormPageShell`'s default submit so both **Stage** and **Create** render; `data-testid="form-submit"` stays on the primary so the shared form-shell tests and this suite agree.)

5. [ ] Run it — expect PASS:

```
npm run test -- clients-new.page route-map
```
   Expected output: both `clients-new.page.nuxt.spec.ts` and `route-map.spec.ts` GREEN (the `clients/new.vue → admin.clients.create / ['admin.clients.write']` row now resolves), 0 failures.

6. [ ] Refactor if needed — keep the failure-surface computeds and the single-`action`/dual-mode `submit` as-is (they mirror `users/new.vue`); confirm no `client_secret`/`clientSecret` field name, token, or the plaintext value is read into a `useState`/Pinia/storage call anywhere in the file (the secret is a bare `ref`). Re-run step 5 to confirm still GREEN.

7. [ ] Commit:

```
git add app/pages/clients/new.vue app/pages/__tests__/clients-new.page.nuxt.spec.ts app/locales/id.json app/locales/en.json
git commit -m "feat(sso-admin-frontend): create-client page with one-time secret reveal

Build clients/new.vue on FormPageShell with the Task-5.3 validators
(live client_id slug + valid/invalid indicator, redirect URI, required
category, scopes with forced openid). Submit and Stage both run the
reused usePrivilegedAction; a confidential create reveals its plaintext
secret once via ClientSecretReveal held in a client-only ref that is
nulled on close before navigating to detail. No created-query, no
cross-page intent, no store.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

**Definition of Done (run from `services/sso-admin-frontend`):** `npm run typecheck && npm run lint && npm run format:check && npm run test && npm run build` all pass (the Clients e2e in `npm run test:e2e` is exercised by Task 5.13, which adds the create + one-time-secret Playwright flow).

---

### Task 5.11: Metadata + URI-policy + scope-policy edit actions (write, in detail tabs)

Three **inline** write forms embedded into the detail page tabs — overview metadata, URI policy, scope policy — each with its **own** reused `usePrivilegedAction` instance running `clientsApi.update` / `clientsApi.syncScopes`, gated by `admin.clients.write`, surfacing the full failure matrix (`401/403/419/422/428/429/5xx`; the routes are the **`:write`** freshness window so a stale window → `step_up_required` with a `step_up_url`), and emitting `done()` so the page calls `useClientDetail.refresh()` (state is never left stale). Local form state initialized from `props.client` and re-seeded when the client changes — this **replaces the legacy page-owned-reactive-buffer-by-reference anti-pattern**. `ClientScopePolicyForm` renders a switch grid over `mergeAvailableScopes` (`openid` forced-on + disabled) with a `scopeParityWarnings` banner. Copy-and-adapt the **inline-form half** of `app/components/users/UserLifecycleActions.vue` (the `sync-profile` form: own runner instance, inline `role="alert"` failure banner with step-up link + redacted `REF-…`, no confirm dialog).

These are **routine non-destructive writes** (metadata edit / URI policy / scope sync), so — exactly like the Phase-4 `sync-profile` form — they do **not** open `PrivilegedActionDialog` (that dialog is reserved for the destructive lifecycle actions in Task 5.13). The privileged-action **failure matrix is re-exercised at the component boundary** to prove every status surfaces safe copy + a redacted reference, leaves no stale `submitting`, and never emits `done` on failure. `--danger #E4002B` appears **only** on the functional error-banner hairline — the submit buttons use the neutral/`primary` variant, never `danger`.

**Files**
- Create: `app/components/clients/ClientMetadataForm.vue`
- Create: `app/components/clients/ClientUriPolicyForm.vue`
- Create: `app/components/clients/ClientScopePolicyForm.vue`
- Modify: `app/pages/clients/[clientId].vue` (mount the three forms in their tabs; permission-gate by `admin.clients.write`; wire `@done="refresh"`; pass `:catalog` to the scope form)
- Modify: `app/locales/id.json`, `app/locales/en.json` (reuse existing `clients.*` keys; fix the mislocalised English `btn_save_*` values; ADD the one genuinely-new key below — BOTH files, keep parity)
- Test: `app/components/clients/__tests__/ClientMetadataForm.spec.ts`
- Test: `app/components/clients/__tests__/ClientUriPolicyForm.spec.ts`
- Test: `app/components/clients/__tests__/ClientScopePolicyForm.spec.ts`
- Modify (extend): `app/pages/__tests__/clients-detail.page.nuxt.spec.ts` (forms mount only when `admin.clients.write`; `done` triggers `refresh`; no `client_secret`/`clientSecret`/token field name in SSR HTML or `__NUXT_DATA__`)

**Interfaces**
- Consumes:
  - `usePrivilegedAction` (`@/composables/usePrivilegedAction`) — reused from Phase 4 as-is. (`PrivilegedActionDialog` is listed in the skeleton Consumes for the clients domain, but the **inline-form half** copied here does not use it — routine non-destructive writes use the inline failure surface, matching the `sync-profile` precedent.)
  - `clientsApi.update` / `clientsApi.syncScopes` (`@/services/clients.api`, Task 5.4)
  - `validateUriPolicy` / `mergeAvailableScopes` / `scopeParityWarnings` / `isValidOwnerEmail` (`@/lib/clients/client-create-form`, Task 5.3)
  - `AdminClientDetail` / `ScopeCatalogEntry` / `ClientUpdatePayload` / `SyncScopesPayload` (`@/types/clients.types`, Task 5.1)
  - `UiFormField` / `UiInput` / `UiTextarea` / `UiSwitch` / `UiButton` (`@/components/ui/*`)
  - `useSessionStore().hasPermission` (`@/stores/session.store`); `formatSupportReference` (`@/lib/display-identifiers`); `useI18n` (`@/composables/useI18n`)
  - `app/pages/clients/[clientId].vue` (Task 5.8) mounts the three forms.
  - Copy-and-adapt template: `app/components/users/UserLifecycleActions.vue` (inline-form half).
- Produces:
  - `app/components/clients/ClientMetadataForm.vue` — Props: `{ client: AdminClientDetail }`; Emits: `done()`. Submits `clientsApi.update(client.client_id, { display_name, owner_email })`.
  - `app/components/clients/ClientUriPolicyForm.vue` — Props: `{ client: AdminClientDetail }`; Emits: `done()`. Validates via `validateUriPolicy`; submits `clientsApi.update(client.client_id, { redirect_uris, post_logout_redirect_uris, backchannel_logout_uri })`.
  - `app/components/clients/ClientScopePolicyForm.vue` — Props: `{ client: AdminClientDetail; catalog: readonly ScopeCatalogEntry[] }`; Emits: `done()`. Switch grid over `mergeAvailableScopes` (`openid` forced-on + disabled) + `scopeParityWarnings` banner; submits `clientsApi.syncScopes(client.client_id, { scopes })`.

> **Validator-return contract pinned with Task 5.3:** `validateUriPolicy(...)` returns a **full `clients.*` i18n key** (e.g. `'clients.validation_redirect_uri'`) or `null` — identical to `validateClientCreateForm`/Task 5.10; the component renders it via ``t(key)`` (no extra namespace prefix — the key already carries `clients.`). Keep this identical in Task 5.3.

**Steps**

---

#### Part A — `ClientMetadataForm.vue`

1. [ ] **RED — write `app/components/clients/__tests__/ClientMetadataForm.spec.ts`** (plain jsdom spec; mocks service + store + i18n + the privileged-action runner). Covers permission gating, client-side email validation, success → correct payload + `done`, and the full failure matrix (with REF redaction + no stale + no `done`):

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { computed, ref } from 'vue'
import ClientMetadataForm from '../ClientMetadataForm.vue'
import type { AdminClientDetail } from '@/types/clients.types'
import type { PrivilegedActionFailure } from '@/lib/users/privileged-action'

const clientsApi = {
  update: vi.fn<(id: string, payload: unknown) => Promise<unknown>>(),
  syncScopes: vi.fn<(id: string, payload: unknown) => Promise<unknown>>(),
}
vi.mock('@/services/clients.api', () => ({ clientsApi }))

let permitted: string[] = []
vi.mock('@/stores/session.store', () => ({
  useSessionStore: () => ({ hasPermission: (p: string) => permitted.includes(p) }),
}))
vi.mock('@/composables/useI18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

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

const client = {
  client_id: 'portal',
  display_name: 'SSO Portal',
  owner_email: 'owner@example.com',
  redirect_uris: ['https://app.example/callback'],
  has_secret_hash: true,
} as unknown as AdminClientDetail

function mountForm() {
  return mount(ClientMetadataForm, { props: { client } })
}

beforeEach(() => {
  vi.clearAllMocks()
  permitted = ['admin.clients.write']
  isSubmitting.value = false
  failure.value = null
  runImpl.mockImplementation(async (fn: () => Promise<unknown>) => fn())
  clientsApi.update.mockResolvedValue({ client })
})

describe('ClientMetadataForm — permission gating', () => {
  it('renders the form when the operator may write', () => {
    expect(mountForm().find('[data-testid="client-metadata-form"]').exists()).toBe(true)
  })
  it('renders nothing when the operator may not write', () => {
    permitted = []
    expect(mountForm().find('[data-testid="client-metadata-form"]').exists()).toBe(false)
  })
})

describe('ClientMetadataForm — validation + submit', () => {
  it('pre-fills the current metadata from the client prop', () => {
    const w = mountForm()
    expect((w.find('#client-display-name').element as HTMLInputElement).value).toBe('SSO Portal')
    expect((w.find('#client-owner-email').element as HTMLInputElement).value).toBe(
      'owner@example.com',
    )
  })
  it('disables submit + calls no API when the owner email is malformed', async () => {
    const w = mountForm()
    await w.find('#client-owner-email').setValue('not-an-email')
    await w.find('[data-testid="client-metadata-form"]').trigger('submit')
    expect(clientsApi.update).not.toHaveBeenCalled()
  })
  it('submits only the metadata fields and emits done on success', async () => {
    const w = mountForm()
    await w.find('#client-display-name').setValue('SSO Portal v2')
    await w.find('[data-testid="client-metadata-form"]').trigger('submit')
    await w.vm.$nextTick()
    expect(clientsApi.update).toHaveBeenCalledWith('portal', {
      display_name: 'SSO Portal v2',
      owner_email: 'owner@example.com',
    })
    expect(w.emitted('done')).toHaveLength(1)
  })
})

describe('ClientMetadataForm — failure matrix (401/403/419/422/428:write/429/5xx)', () => {
  const cases: { status: PrivilegedActionFailure['status']; stepUpUrl: string | null }[] = [
    { status: 'forbidden', stepUpUrl: null }, // 403
    { status: 'unauthenticated', stepUpUrl: null }, // 401 / 419
    { status: 'rate_limited', stepUpUrl: null }, // 429
    { status: 'invalid', stepUpUrl: null }, // 422
    { status: 'step_up_required', stepUpUrl: '/auth/login?prompt=login' }, // 428 (:write stale)
    { status: 'error', stepUpUrl: null }, // 5xx
  ]
  for (const c of cases) {
    it(`surfaces ${c.status} safely with a redacted REF and no stale loading`, async () => {
      runImpl.mockImplementation(async () => {
        failure.value = {
          status: c.status,
          requestId: 'req-meta-99887766',
          auditEventId: 'aud-1',
          fieldErrors: c.status === 'invalid' ? { display_name: ['too long'] } : {},
          stepUpUrl: c.stepUpUrl,
        }
        isSubmitting.value = false
        return null
      })
      const w = mountForm()
      await w.find('#client-display-name').setValue('New name')
      await w.find('[data-testid="client-metadata-form"]').trigger('submit')
      await w.vm.$nextTick()
      const banner = w.find('[data-testid="metadata-error"]')
      expect(banner.exists()).toBe(true)
      expect(banner.text()).toContain('common.error_generic')
      expect(w.text()).toContain('REF-')
      expect(w.text()).not.toContain('req-meta-99887766')
      expect(w.emitted('done')).toBeUndefined()
      expect(isSubmitting.value).toBe(false)
      if (c.status === 'step_up_required') {
        const link = w.find('[data-testid="metadata-stepup-link"]')
        expect(link.exists()).toBe(true)
        expect(link.attributes('href')).toBe('/auth/login?prompt=login')
      }
    })
  }
})
```

2. [ ] **Run it — expect FAIL** (component missing):

```bash
npm run test -- app/components/clients/__tests__/ClientMetadataForm.spec.ts
```
Expected: `Failed to resolve import "../ClientMetadataForm.vue"` — RED.

3. [ ] **GREEN — write `app/components/clients/ClientMetadataForm.vue`:**

```vue
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { AdminClientDetail, ClientUpdatePayload } from '@/types/clients.types'
import { isValidOwnerEmail } from '@/lib/clients/client-create-form'
import { usePrivilegedAction } from '@/composables/usePrivilegedAction'
import { clientsApi } from '@/services/clients.api'
import { useSessionStore } from '@/stores/session.store'
import { useI18n } from '@/composables/useI18n'
import { formatSupportReference } from '@/lib/display-identifiers'
import UiButton from '@/components/ui/UiButton.vue'
import UiFormField from '@/components/ui/UiFormField.vue'
import UiInput from '@/components/ui/UiInput.vue'

const props = defineProps<{ client: AdminClientDetail }>()
const emit = defineEmits<{ done: [] }>()

const session = useSessionStore()
const { t } = useI18n()
const action = usePrivilegedAction<unknown>()

const canWrite = computed(() => session.hasPermission('admin.clients.write'))

// Local form state seeded from the client — never a buffer passed by reference.
const form = ref({ display_name: '', owner_email: '' })
function resetForm(): void {
  form.value = {
    display_name: props.client.display_name ?? '',
    owner_email: props.client.owner_email ?? '',
  }
}
resetForm()
watch(() => props.client.client_id, resetForm)

const emailInvalid = computed(
  () => form.value.owner_email !== '' && !isValidOwnerEmail(form.value.owner_email),
)
const isInvalid = computed(() => form.value.display_name.trim() === '' || emailInvalid.value)
const ownerEmailError = computed(
  () => emailInvalid.value || (action.fieldErrors.value.owner_email?.length ?? 0) > 0,
)
const displayNameServerError = computed(
  () => (action.fieldErrors.value.display_name?.length ?? 0) > 0,
)
const failureRef = computed(() => formatSupportReference(action.requestId.value))

function buildPayload(): ClientUpdatePayload {
  return {
    display_name: form.value.display_name.trim(),
    owner_email: form.value.owner_email.trim(),
  }
}

async function submit(): Promise<void> {
  if (isInvalid.value) return
  const result = await action.run(() => clientsApi.update(props.client.client_id, buildPayload()))
  if (result === null) return
  emit('done')
}
</script>

<template>
  <form
    v-if="canWrite"
    class="client-form"
    data-testid="client-metadata-form"
    @submit.prevent="submit"
  >
    <h3 class="client-form__title">{{ t('clients.metadata_title') }}</h3>

    <UiFormField
      id="client-display-name"
      :label="t('clients.label_display_name')"
      :error="displayNameServerError ? t('clients.validation_display_name') : undefined"
      required
    >
      <UiInput
        id="client-display-name"
        :model-value="form.display_name"
        :invalid="displayNameServerError"
        @update:model-value="form.display_name = $event"
      />
    </UiFormField>

    <UiFormField
      id="client-owner-email"
      :label="t('clients.label_owner_email')"
      :error="ownerEmailError ? t('clients.validation_owner_email') : undefined"
    >
      <UiInput
        id="client-owner-email"
        :model-value="form.owner_email"
        :invalid="ownerEmailError"
        @update:model-value="form.owner_email = $event"
      />
    </UiFormField>

    <div v-if="action.failure.value" data-testid="metadata-error" class="client-form__error" role="alert">
      <p>{{ t('common.error_generic') }}</p>
      <a
        v-if="action.stepUpUrl.value"
        :href="action.stepUpUrl.value"
        data-testid="metadata-stepup-link"
        class="client-form__stepup"
        >{{ t('clients.btn_step_up') }}</a
      >
      <p v-if="failureRef" class="client-form__ref">{{ failureRef }}</p>
    </div>

    <UiButton type="submit" :disabled="isInvalid || action.isSubmitting.value">
      {{ t('clients.btn_save_metadata') }}
    </UiButton>
  </form>
</template>

<style scoped>
.client-form {
  display: grid;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--border);
}
.client-form__title {
  margin: 0;
  font: 600 0.9375rem/1.2 var(--font-sans);
  color: var(--fg);
}
.client-form__error {
  display: grid;
  gap: 4px;
  padding: 12px;
  border: 1px solid var(--danger);
  border-radius: var(--r-sm);
}
.client-form__error p {
  margin: 0;
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--danger);
}
.client-form__stepup {
  font: 500 0.8125rem/1.4 var(--font-sans);
  color: var(--accent);
}
.client-form__ref {
  font-family: var(--font-mono);
  color: var(--fg-3);
}
</style>
```

4. [ ] **Run it — expect PASS:**

```bash
npm run test -- app/components/clients/__tests__/ClientMetadataForm.spec.ts
```
Expected: all `ClientMetadataForm.spec.ts` tests green.

---

#### Part B — `ClientUriPolicyForm.vue`

5. [ ] **RED — write `app/components/clients/__tests__/ClientUriPolicyForm.spec.ts`.** Mocks `clientsApi`, the store, `useI18n`, the runner, and `validateUriPolicy` (so the test drives the consolidated validator deterministically). Covers line-parsing, validation-blocks-submit, success payload (`backchannel` empty → `null`), `done`, and one representative failure:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { computed, ref } from 'vue'
import ClientUriPolicyForm from '../ClientUriPolicyForm.vue'
import type { AdminClientDetail } from '@/types/clients.types'
import type { PrivilegedActionFailure } from '@/lib/users/privileged-action'

const clientsApi = {
  update: vi.fn<(id: string, payload: unknown) => Promise<unknown>>(),
  syncScopes: vi.fn<(id: string, payload: unknown) => Promise<unknown>>(),
}
vi.mock('@/services/clients.api', () => ({ clientsApi }))

const validateUriPolicy = vi.fn<(input: unknown) => string | null>(() => null)
vi.mock('@/lib/clients/client-create-form', () => ({ validateUriPolicy }))

let permitted: string[] = []
vi.mock('@/stores/session.store', () => ({
  useSessionStore: () => ({ hasPermission: (p: string) => permitted.includes(p) }),
}))
vi.mock('@/composables/useI18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

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

const client = {
  client_id: 'portal',
  redirect_uris: ['https://app.example/callback'],
  post_logout_redirect_uris: ['https://app.example'],
  backchannel_logout_uri: 'https://app.example/bclogout',
} as unknown as AdminClientDetail

function mountForm() {
  return mount(ClientUriPolicyForm, { props: { client } })
}

beforeEach(() => {
  vi.clearAllMocks()
  permitted = ['admin.clients.write']
  isSubmitting.value = false
  failure.value = null
  validateUriPolicy.mockReturnValue(null)
  runImpl.mockImplementation(async (fn: () => Promise<unknown>) => fn())
  clientsApi.update.mockResolvedValue({ client })
})

describe('ClientUriPolicyForm — permission gating', () => {
  it('renders nothing when the operator may not write', () => {
    permitted = []
    expect(mountForm().find('[data-testid="client-uri-policy-form"]').exists()).toBe(false)
  })
})

describe('ClientUriPolicyForm — validation + submit', () => {
  it('pre-fills redirect/logout URIs one-per-line from the client prop', () => {
    const w = mountForm()
    expect((w.find('#client-redirect-uris').element as HTMLTextAreaElement).value).toBe(
      'https://app.example/callback',
    )
  })
  it('blocks submit and shows the validator error when validateUriPolicy returns a key', async () => {
    validateUriPolicy.mockReturnValue('clients.validation_redirect_uri')
    const w = mountForm()
    await w.find('[data-testid="client-uri-policy-form"]').trigger('submit')
    expect(clientsApi.update).not.toHaveBeenCalled()
    expect(w.find('[data-testid="uri-policy-validation"]').text()).toContain(
      'clients.validation_redirect_uri',
    )
  })
  it('parses lines, nulls an empty backchannel, submits the URI policy and emits done', async () => {
    const w = mountForm()
    await w.find('#client-redirect-uris').setValue('https://a.example/cb\n  https://b.example/cb ')
    await w.find('#client-post-logout-uris').setValue('https://a.example')
    await w.find('#client-backchannel-uri').setValue('   ')
    await w.find('[data-testid="client-uri-policy-form"]').trigger('submit')
    await w.vm.$nextTick()
    expect(clientsApi.update).toHaveBeenCalledWith('portal', {
      redirect_uris: ['https://a.example/cb', 'https://b.example/cb'],
      post_logout_redirect_uris: ['https://a.example'],
      backchannel_logout_uri: null,
    })
    expect(w.emitted('done')).toHaveLength(1)
  })
})

describe('ClientUriPolicyForm — failure surface (:write step-up representative)', () => {
  it('surfaces a step-up failure with link + REF and no stale loading', async () => {
    runImpl.mockImplementation(async () => {
      failure.value = {
        status: 'step_up_required',
        requestId: 'req-uri-44556677',
        auditEventId: null,
        fieldErrors: {},
        stepUpUrl: '/auth/login?prompt=login',
      }
      isSubmitting.value = false
      return null
    })
    const w = mountForm()
    await w.find('[data-testid="client-uri-policy-form"]').trigger('submit')
    await w.vm.$nextTick()
    const banner = w.find('[data-testid="uri-policy-error"]')
    expect(banner.exists()).toBe(true)
    expect(w.find('[data-testid="uri-policy-stepup-link"]').attributes('href')).toBe(
      '/auth/login?prompt=login',
    )
    expect(w.text()).toContain('REF-')
    expect(w.text()).not.toContain('req-uri-44556677')
    expect(w.emitted('done')).toBeUndefined()
    expect(isSubmitting.value).toBe(false)
  })
})
```

6. [ ] **Run it — expect FAIL** (component missing):

```bash
npm run test -- app/components/clients/__tests__/ClientUriPolicyForm.spec.ts
```
Expected: `Failed to resolve import "../ClientUriPolicyForm.vue"` — RED.

7. [ ] **GREEN — write `app/components/clients/ClientUriPolicyForm.vue`:**

```vue
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { AdminClientDetail, ClientUpdatePayload } from '@/types/clients.types'
import { validateUriPolicy } from '@/lib/clients/client-create-form'
import { usePrivilegedAction } from '@/composables/usePrivilegedAction'
import { clientsApi } from '@/services/clients.api'
import { useSessionStore } from '@/stores/session.store'
import { useI18n } from '@/composables/useI18n'
import { formatSupportReference } from '@/lib/display-identifiers'
import UiButton from '@/components/ui/UiButton.vue'
import UiFormField from '@/components/ui/UiFormField.vue'
import UiTextarea from '@/components/ui/UiTextarea.vue'
import UiInput from '@/components/ui/UiInput.vue'

const props = defineProps<{ client: AdminClientDetail }>()
const emit = defineEmits<{ done: [] }>()

const session = useSessionStore()
const { t } = useI18n()
const action = usePrivilegedAction<unknown>()

const canWrite = computed(() => session.hasPermission('admin.clients.write'))

const form = ref({ redirect_uris: '', post_logout_redirect_uris: '', backchannel_logout_uri: '' })
function resetForm(): void {
  form.value = {
    redirect_uris: (props.client.redirect_uris ?? []).join('\n'),
    post_logout_redirect_uris: (props.client.post_logout_redirect_uris ?? []).join('\n'),
    backchannel_logout_uri: props.client.backchannel_logout_uri ?? '',
  }
}
resetForm()
watch(() => props.client.client_id, resetForm)

function parseLines(value: string): readonly string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

const redirectUris = computed(() => parseLines(form.value.redirect_uris))
const postLogoutUris = computed(() => parseLines(form.value.post_logout_redirect_uris))
const backchannel = computed(() => form.value.backchannel_logout_uri.trim())

// Single consolidated validator (Task 5.3) — returns a full clients.* i18n key or null.
const validationKey = computed(() =>
  validateUriPolicy({
    redirect_uris: redirectUris.value,
    post_logout_redirect_uris: postLogoutUris.value,
    backchannel_logout_uri: backchannel.value,
  }),
)
const failureRef = computed(() => formatSupportReference(action.requestId.value))

function buildPayload(): ClientUpdatePayload {
  return {
    redirect_uris: redirectUris.value,
    post_logout_redirect_uris: postLogoutUris.value,
    backchannel_logout_uri: backchannel.value === '' ? null : backchannel.value,
  }
}

async function submit(): Promise<void> {
  if (validationKey.value !== null) return
  const result = await action.run(() => clientsApi.update(props.client.client_id, buildPayload()))
  if (result === null) return
  emit('done')
}
</script>

<template>
  <form
    v-if="canWrite"
    class="client-form"
    data-testid="client-uri-policy-form"
    @submit.prevent="submit"
  >
    <h3 class="client-form__title">{{ t('clients.uri_policy_title') }}</h3>

    <UiFormField id="client-redirect-uris" :label="t('clients.label_redirect_uris')" required>
      <UiTextarea
        id="client-redirect-uris"
        :model-value="form.redirect_uris"
        @update:model-value="form.redirect_uris = $event"
      />
    </UiFormField>

    <UiFormField id="client-post-logout-uris" :label="t('clients.label_post_logout_uris')">
      <UiTextarea
        id="client-post-logout-uris"
        :model-value="form.post_logout_redirect_uris"
        @update:model-value="form.post_logout_redirect_uris = $event"
      />
    </UiFormField>

    <UiFormField id="client-backchannel-uri" :label="t('clients.label_backchannel_uri')">
      <UiInput
        id="client-backchannel-uri"
        :model-value="form.backchannel_logout_uri"
        @update:model-value="form.backchannel_logout_uri = $event"
      />
    </UiFormField>

    <p
      v-if="validationKey"
      data-testid="uri-policy-validation"
      class="client-form__validation"
      role="alert"
    >
      {{ t(validationKey) }}
    </p>

    <div v-if="action.failure.value" data-testid="uri-policy-error" class="client-form__error" role="alert">
      <p>{{ t('common.error_generic') }}</p>
      <a
        v-if="action.stepUpUrl.value"
        :href="action.stepUpUrl.value"
        data-testid="uri-policy-stepup-link"
        class="client-form__stepup"
        >{{ t('clients.btn_step_up') }}</a
      >
      <p v-if="failureRef" class="client-form__ref">{{ failureRef }}</p>
    </div>

    <UiButton type="submit" :disabled="validationKey !== null || action.isSubmitting.value">
      {{ t('clients.btn_save_uri_policy') }}
    </UiButton>
  </form>
</template>

<style scoped>
.client-form {
  display: grid;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--border);
}
.client-form__title {
  margin: 0;
  font: 600 0.9375rem/1.2 var(--font-sans);
  color: var(--fg);
}
.client-form__validation {
  margin: 0;
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--danger);
}
.client-form__error {
  display: grid;
  gap: 4px;
  padding: 12px;
  border: 1px solid var(--danger);
  border-radius: var(--r-sm);
}
.client-form__error p {
  margin: 0;
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--danger);
}
.client-form__stepup {
  font: 500 0.8125rem/1.4 var(--font-sans);
  color: var(--accent);
}
.client-form__ref {
  font-family: var(--font-mono);
  color: var(--fg-3);
}
</style>
```

8. [ ] **Run it — expect PASS:**

```bash
npm run test -- app/components/clients/__tests__/ClientUriPolicyForm.spec.ts
```
Expected: all `ClientUriPolicyForm.spec.ts` tests green.

---

#### Part C — `ClientScopePolicyForm.vue`

9. [ ] **RED — write `app/components/clients/__tests__/ClientScopePolicyForm.spec.ts`.** Mocks `clientsApi`, store, `useI18n`, the runner; stubs `UiSwitch` (so the grid is testable by `data-scope`). Covers the merged grid, `openid` forced-on + disabled, parity-warning banner, toggle → submit payload, `done`, and one representative failure:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { computed, ref } from 'vue'
import ClientScopePolicyForm from '../ClientScopePolicyForm.vue'
import type { AdminClientDetail, ScopeCatalogEntry } from '@/types/clients.types'
import type { PrivilegedActionFailure } from '@/lib/users/privileged-action'

const clientsApi = {
  update: vi.fn<(id: string, payload: unknown) => Promise<unknown>>(),
  syncScopes: vi.fn<(id: string, payload: unknown) => Promise<unknown>>(),
}
vi.mock('@/services/clients.api', () => ({ clientsApi }))

let permitted: string[] = []
vi.mock('@/stores/session.store', () => ({
  useSessionStore: () => ({ hasPermission: (p: string) => permitted.includes(p) }),
}))
vi.mock('@/composables/useI18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

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

const catalog: ScopeCatalogEntry[] = [
  { name: 'openid', description: 'Subject', claims: ['sub'], default_allowed: true },
  { name: 'profile', description: 'Profile', claims: ['name'], default_allowed: true },
  { name: 'email', description: 'Email', claims: ['email'], default_allowed: false },
]

// Client carries a custom scope absent from the catalog -> parity warning + merged grid row.
const client = {
  client_id: 'portal',
  allowed_scopes: ['openid', 'profile', 'legacy:read'],
} as unknown as AdminClientDetail

// Stub UiSwitch as a checkbox so the grid is assertable by scope name.
const SwitchStub = {
  name: 'UiSwitch',
  props: ['modelValue', 'label', 'disabled'],
  emits: ['update:modelValue'],
  template: `<label :data-scope="label" :data-disabled="disabled">
    <input
      type="checkbox"
      :checked="modelValue"
      :disabled="disabled"
      @change="$emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
    />{{ label }}</label>`,
}

function mountForm() {
  return mount(ClientScopePolicyForm, {
    props: { client, catalog },
    global: { stubs: { UiSwitch: SwitchStub } },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  permitted = ['admin.clients.write']
  isSubmitting.value = false
  failure.value = null
  runImpl.mockImplementation(async (fn: () => Promise<unknown>) => fn())
  clientsApi.syncScopes.mockResolvedValue({ client })
})

describe('ClientScopePolicyForm — grid + parity', () => {
  it('renders nothing when the operator may not write', () => {
    permitted = []
    expect(mountForm().find('[data-testid="client-scope-policy-form"]').exists()).toBe(false)
  })
  it('renders the merged catalog ∪ client scopes (including the custom one)', () => {
    const w = mountForm()
    for (const name of ['openid', 'profile', 'email', 'legacy:read'])
      expect(w.find(`[data-scope="${name}"]`).exists()).toBe(true)
  })
  it('forces openid on and disabled', () => {
    const row = mountForm().find('[data-scope="openid"]')
    expect(row.attributes('data-disabled')).toBe('true')
    expect((row.find('input').element as HTMLInputElement).checked).toBe(true)
  })
  it('shows the scope parity warning for client scopes absent from the catalog', () => {
    const w = mountForm()
    const banner = w.find('[data-testid="scope-parity-warning"]')
    expect(banner.exists()).toBe(true)
    expect(banner.text()).toContain('legacy:read')
  })
})

describe('ClientScopePolicyForm — submit', () => {
  it('toggles a scope, syncs the selected set, and emits done', async () => {
    const w = mountForm()
    await w.find('[data-scope="email"] input').setValue(true)
    await w.find('[data-testid="client-scope-policy-form"]').trigger('submit')
    await w.vm.$nextTick()
    expect(clientsApi.syncScopes).toHaveBeenCalledTimes(1)
    const [id, payload] = clientsApi.syncScopes.mock.calls[0] as [string, { scopes: string[] }]
    expect(id).toBe('portal')
    expect([...payload.scopes].sort()).toEqual(['email', 'legacy:read', 'openid', 'profile'])
    expect(w.emitted('done')).toHaveLength(1)
  })
  it('cannot deselect openid (forced) — it stays in the synced set', async () => {
    const w = mountForm()
    await w.find('[data-scope="profile"] input').setValue(false)
    await w.find('[data-testid="client-scope-policy-form"]').trigger('submit')
    const [, payload] = clientsApi.syncScopes.mock.calls[0] as [string, { scopes: string[] }]
    expect(payload.scopes).toContain('openid')
    expect(payload.scopes).not.toContain('profile')
  })
})

describe('ClientScopePolicyForm — failure surface', () => {
  it('surfaces an invalid (422) failure with REF and no stale loading', async () => {
    runImpl.mockImplementation(async () => {
      failure.value = {
        status: 'invalid',
        requestId: 'req-scope-11223344',
        auditEventId: null,
        fieldErrors: { scopes: ['unknown scope'] },
        stepUpUrl: null,
      }
      isSubmitting.value = false
      return null
    })
    const w = mountForm()
    await w.find('[data-testid="client-scope-policy-form"]').trigger('submit')
    await w.vm.$nextTick()
    expect(w.find('[data-testid="scope-policy-error"]').exists()).toBe(true)
    expect(w.text()).toContain('REF-')
    expect(w.text()).not.toContain('req-scope-11223344')
    expect(w.emitted('done')).toBeUndefined()
    expect(isSubmitting.value).toBe(false)
  })
})
```

10. [ ] **Run it — expect FAIL** (component missing):

```bash
npm run test -- app/components/clients/__tests__/ClientScopePolicyForm.spec.ts
```
Expected: `Failed to resolve import "../ClientScopePolicyForm.vue"` — RED.

11. [ ] **GREEN — write `app/components/clients/ClientScopePolicyForm.vue`:**

```vue
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { AdminClientDetail, ScopeCatalogEntry, SyncScopesPayload } from '@/types/clients.types'
import { mergeAvailableScopes, scopeParityWarnings } from '@/lib/clients/client-create-form'
import { usePrivilegedAction } from '@/composables/usePrivilegedAction'
import { clientsApi } from '@/services/clients.api'
import { useSessionStore } from '@/stores/session.store'
import { useI18n } from '@/composables/useI18n'
import { formatSupportReference } from '@/lib/display-identifiers'
import UiButton from '@/components/ui/UiButton.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'

const FORCED_SCOPE = 'openid'

const props = defineProps<{ client: AdminClientDetail; catalog: readonly ScopeCatalogEntry[] }>()
const emit = defineEmits<{ done: [] }>()

const session = useSessionStore()
const { t } = useI18n()
const action = usePrivilegedAction<unknown>()

const canWrite = computed(() => session.hasPermission('admin.clients.write'))

const clientScopes = computed(() => props.client.allowed_scopes ?? [])
const available = computed(() => mergeAvailableScopes(props.catalog, clientScopes.value))
const warnings = computed(() => scopeParityWarnings(props.catalog, clientScopes.value))

const selected = ref<readonly string[]>([])
function resetSelected(): void {
  const base = new Set(clientScopes.value)
  base.add(FORCED_SCOPE)
  selected.value = [...base]
}
resetSelected()
watch(() => props.client.client_id, resetSelected)

function isChecked(scope: string): boolean {
  return scope === FORCED_SCOPE || selected.value.includes(scope)
}
function toggle(scope: string, on: boolean): void {
  if (scope === FORCED_SCOPE) return
  const set = new Set(selected.value)
  if (on) set.add(scope)
  else set.delete(scope)
  set.add(FORCED_SCOPE)
  selected.value = [...set]
}

const failureRef = computed(() => formatSupportReference(action.requestId.value))

function buildPayload(): SyncScopesPayload {
  const set = new Set(selected.value)
  set.add(FORCED_SCOPE)
  return { scopes: [...set] }
}

async function submit(): Promise<void> {
  const result = await action.run(() =>
    clientsApi.syncScopes(props.client.client_id, buildPayload()),
  )
  if (result === null) return
  emit('done')
}
</script>

<template>
  <form
    v-if="canWrite"
    class="client-form"
    data-testid="client-scope-policy-form"
    @submit.prevent="submit"
  >
    <h3 class="client-form__title">{{ t('clients.scope_policy_title') }}</h3>

    <p
      v-if="warnings.length"
      data-testid="scope-parity-warning"
      class="client-form__warning"
      role="alert"
    >
      {{ t('clients.scope_parity_warning') }} {{ warnings.join(', ') }}
    </p>

    <div class="client-form__grid" role="group" :aria-label="t('clients.allowed_scopes_title')">
      <UiSwitch
        v-for="scope in available"
        :key="scope"
        :label="scope"
        :model-value="isChecked(scope)"
        :disabled="scope === 'openid'"
        @update:model-value="toggle(scope, $event)"
      />
    </div>

    <div v-if="action.failure.value" data-testid="scope-policy-error" class="client-form__error" role="alert">
      <p>{{ t('common.error_generic') }}</p>
      <a
        v-if="action.stepUpUrl.value"
        :href="action.stepUpUrl.value"
        data-testid="scope-policy-stepup-link"
        class="client-form__stepup"
        >{{ t('clients.btn_step_up') }}</a
      >
      <p v-if="failureRef" class="client-form__ref">{{ failureRef }}</p>
    </div>

    <UiButton type="submit" :disabled="action.isSubmitting.value">
      {{ t('clients.btn_save_scope_policy') }}
    </UiButton>
  </form>
</template>

<style scoped>
.client-form {
  display: grid;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--border);
}
.client-form__title {
  margin: 0;
  font: 600 0.9375rem/1.2 var(--font-sans);
  color: var(--fg);
}
.client-form__warning {
  margin: 0;
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--fg-2);
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
}
.client-form__grid {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
}
.client-form__error {
  display: grid;
  gap: 4px;
  padding: 12px;
  border: 1px solid var(--danger);
  border-radius: var(--r-sm);
}
.client-form__error p {
  margin: 0;
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--danger);
}
.client-form__stepup {
  font: 500 0.8125rem/1.4 var(--font-sans);
  color: var(--accent);
}
.client-form__ref {
  font-family: var(--font-mono);
  color: var(--fg-3);
}
</style>
```

12. [ ] **Run it — expect PASS:**

```bash
npm run test -- app/components/clients/__tests__/ClientScopePolicyForm.spec.ts
```
Expected: all `ClientScopePolicyForm.spec.ts` tests green.

---

#### Part D — locales + wire into the detail page

13. [ ] **Locale keys — reuse + fix + ADD (BOTH `app/locales/id.json` and `app/locales/en.json`, inside the existing `clients` object).**
   - **Reuse as-is** (already present): `metadata_title`, `uri_policy_title`, `scope_policy_title`, `label_display_name`, `label_owner_email`, `label_redirect_uris`, `label_post_logout_uris`, `label_backchannel_uri`, `validation_display_name`, `validation_owner_email`, `validation_redirect_uri`, `validation_logout_uri`, `scope_parity_warning`, `allowed_scopes_title`, `btn_step_up`; plus `common.error_generic`.
   - **Fix the mislocalised English values** (currently Indonesian copy leaked into `en.json` — Swiss rule: standard English labels, no themed/foreign copy):
     - `clients.btn_save_metadata` → en: `"Save metadata"` (id stays `"Simpan metadata"`)
     - `clients.btn_save_uri_policy` → en: `"Save URI policy"` (id stays `"Simpan URI policy"`)
     - `clients.btn_save_scope_policy` → en: `"Save scope policy"` (id stays `"Simpan scope policy"`)
   - **ADD the one genuinely-new key** (the no-write empty hint, mirrors `users.actions_none`):
     - `clients.actions_none` — en: `"You do not have permission to edit this client."`, id: `"Anda tidak memiliki izin untuk menyunting klien ini."`

   Verify parity after editing:

```bash
node -e "const id=require('./app/locales/id.json'),en=require('./app/locales/en.json');const diff=(a,b)=>[...Object.keys(a).filter(k=>!(k in b)),...Object.keys(b).filter(k=>!(k in a))];const d=[...diff(id.clients,en.clients).map(k=>'clients.'+k),...diff(id.common,en.common).map(k=>'common.'+k)];if(d.length){console.error('MISMATCH',d);process.exit(1)}console.log('locale parity OK')"
```
Expected: `locale parity OK`.

14. [ ] **RED — extend `app/pages/__tests__/clients-detail.page.nuxt.spec.ts`** (the read-only page test from Task 5.8) to assert the three forms mount under `admin.clients.write`, that `@done` triggers `refresh`, and the SSR-render carries no secret/token field name. Add a permitted principal + the scope catalog to the mocks already in that file, then:

```ts
import ClientMetadataForm from '@/components/clients/ClientMetadataForm.vue'
import ClientUriPolicyForm from '@/components/clients/ClientUriPolicyForm.vue'
import ClientScopePolicyForm from '@/components/clients/ClientScopePolicyForm.vue'

describe('clients detail page — write forms (Task 5.11)', () => {
  it('mounts the three edit forms when the operator may write', async () => {
    permitted = ['admin.clients.read', 'admin.clients.write']
    const page = await mountSuspended(ClientDetailPage, { route: '/clients/portal' })
    expect(page.findComponent(ClientMetadataForm).exists()).toBe(true)
    expect(page.findComponent(ClientUriPolicyForm).exists()).toBe(true)
    expect(page.findComponent(ClientScopePolicyForm).exists()).toBe(true)
  })

  it('hides the edit forms for a read-only operator', async () => {
    permitted = ['admin.clients.read']
    const page = await mountSuspended(ClientDetailPage, { route: '/clients/portal' })
    expect(page.findComponent(ClientMetadataForm).exists()).toBe(false)
  })

  it('refreshes detail when a form emits done', async () => {
    permitted = ['admin.clients.read', 'admin.clients.write']
    const page = await mountSuspended(ClientDetailPage, { route: '/clients/portal' })
    refreshMock.mockClear()
    page.findComponent(ClientMetadataForm).vm.$emit('done')
    await nextTick()
    expect(refreshMock).toHaveBeenCalledTimes(1)
  })

  it('never serialises a client secret or token field into the SSR payload', async () => {
    permitted = ['admin.clients.read', 'admin.clients.write']
    const html = await renderSuspended(ClientDetailPage, { route: '/clients/portal' }).then((r) =>
      r.html(),
    )
    expect(html).not.toMatch(/client_secret|clientSecret|access_token|accessToken|refresh_token/i)
    // client_id is a public identifier and IS allowed to appear.
    expect(html).toContain('portal')
  })
})
```
Run — expect FAIL (forms not yet mounted in the page):

```bash
npm run test -- app/pages/__tests__/clients-detail.page.nuxt.spec.ts
```
Expected: `findComponent(ClientMetadataForm)` returns a non-existent wrapper — RED.

15. [ ] **GREEN — wire the forms into `app/pages/clients/[clientId].vue`.** In the overview tab mount `ClientMetadataForm`, in the URIs tab `ClientUriPolicyForm`, in the scopes tab `ClientScopePolicyForm`, each gated by `canWrite` and wired `@done="refresh"`. The page already exposes `client`, `refresh`, the scope `catalog`, and a `canWrite` permission flag from Task 5.8; add only the imports + the three mounts:

```vue
<script setup lang="ts">
// …existing Task 5.8 setup (useClientDetail, useScopeCatalog, canWrite, etc.)…
import ClientMetadataForm from '@/components/clients/ClientMetadataForm.vue'
import ClientUriPolicyForm from '@/components/clients/ClientUriPolicyForm.vue'
import ClientScopePolicyForm from '@/components/clients/ClientScopePolicyForm.vue'
</script>

<template>
  <!-- …overview tab… -->
  <ClientMetadataForm v-if="client && canWrite" :client="client" @done="refresh" />

  <!-- …URIs tab… -->
  <ClientUriPolicyForm v-if="client && canWrite" :client="client" @done="refresh" />

  <!-- …scopes tab… -->
  <ClientScopePolicyForm
    v-if="client && canWrite"
    :client="client"
    :catalog="catalog"
    @done="refresh"
  />
</template>
```

Run — expect PASS:

```bash
npm run test -- app/pages/__tests__/clients-detail.page.nuxt.spec.ts
```
Expected: the four new page cases + all existing Task 5.8 cases green.

16. [ ] **REFACTOR (optional).** The three failure-banner blocks are byte-identical; if they grow, extract a tiny `ClientFormFailure.vue` presentational child (Props `{ failure: boolean; stepUpUrl: string|null; requestId: string|null }`). Only do this once it earns its keep — three copies of a 9-line block is below the extraction threshold. No behaviour change; re-run all three component specs + the page spec to confirm still green.

17. [ ] **Commit:**

```bash
git add app/components/clients/ClientMetadataForm.vue \
        app/components/clients/ClientUriPolicyForm.vue \
        app/components/clients/ClientScopePolicyForm.vue \
        app/components/clients/__tests__/ClientMetadataForm.spec.ts \
        app/components/clients/__tests__/ClientUriPolicyForm.spec.ts \
        app/components/clients/__tests__/ClientScopePolicyForm.spec.ts \
        app/pages/clients/\[clientId\].vue \
        app/pages/__tests__/clients-detail.page.nuxt.spec.ts \
        app/locales/id.json app/locales/en.json
git commit -m "feat(sso-admin-frontend): client metadata, URI-policy, and scope-policy edit forms

Three inline write forms in the client detail tabs, each over its own reused
usePrivilegedAction instance (clientsApi.update / syncScopes), gated by
admin.clients.write, surfacing the :write step-up + 422 + full failure matrix
with redacted references, and refreshing detail on success. Local form state
seeded from the client prop replaces the page-owned reactive buffer. The scope
form renders a switch grid over mergeAvailableScopes with openid forced and a
scope-parity warning banner.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

**Task-scoped Definition of Done** (run from `services/sso-admin-frontend`; report any blocked command explicitly, never claim PASS for a command that did not run):

```bash
npm run typecheck && npm run lint && npm run format:check \
  && npm run test -- app/components/clients/__tests__/ClientMetadataForm.spec.ts \
       app/components/clients/__tests__/ClientUriPolicyForm.spec.ts \
       app/components/clients/__tests__/ClientScopePolicyForm.spec.ts \
       app/pages/__tests__/clients-detail.page.nuxt.spec.ts \
  && npm run test && npm run build
```
(Clients changes critical governance UI + navigation, so `npm run test:e2e` also qualifies and must pass before the phase is considered done.)

---

### Task 5.12: Secret rotation action (security tab) — one-time reveal

`ClientSecretRotation.vue` is the rotate-secret control mounted in the detail page's **security** tab. A `UiButton` (danger affordance) opens the **reused** `PrivilegedActionDialog` carrying the impact warning ("rotating invalidates the current secret immediately — the old secret stops working at once"); on confirm it runs the **reused** `usePrivilegedAction` → `clientsApi.rotateSecret`. The rotated plaintext is held **only** in a client-only `revealed = ref<string|null>(null)` (never `useState`/Pinia/`localStorage`/`sessionStorage`, never logged), passed straight to `ClientSecretReveal` (Task 5.9) for a **one-time** display, then **nulled on close** while `emit('done')` triggers the detail refresh (so `has_secret_hash` / `secret_rotated_at` update). The rotate-secret route is a `:step_up` window, so the full privileged-action matrix is re-exercised here — including the `client_secret_rotation_invalid` 422 a **public** client returns. Gated by `admin.clients.write`. Copy-and-adapt the action-wiring half of `app/components/users/UserLifecycleActions.vue`.

**Files**
- Create: `app/components/clients/ClientSecretRotation.vue`
- Modify: `app/pages/clients/[clientId].vue` (mount in the security tab; `@done="refresh"`, gated by `admin.clients.write`)
- Modify: `app/locales/id.json`, `app/locales/en.json` (ADD only the genuinely-new `clients.*` keys below, to BOTH files, keep id↔en parity; reuse existing `common.*`/`users.btn_step_up`)
- Test: `app/components/clients/__tests__/ClientSecretRotation.spec.ts` (plain `*.spec.ts` — `@vue/test-utils` + jsdom, mirrors `UserLifecycleActions.spec.ts`; no Nuxt runtime needed)

**Interfaces**
- Produces (`app/components/clients/ClientSecretRotation.vue`):
  - Props: `{ client: AdminClientDetail }`
  - Emits: `done()`
  - Internal (the binding shapes later/sibling tasks rely on): `const action = usePrivilegedAction<RotateSecretResponse>()` and `const revealed = ref<string | null>(null)` — `revealed` is the **only** place the plaintext lives; set from the POST response via `extractRevealedSecret(result.rotation)`, nulled in the reveal-close handler. On success: `revealed.value = extractRevealedSecret(result.rotation)`; on reveal close: `revealed.value = null` + `emit('done')`.
- Consumes: `usePrivilegedAction` (`@/composables/usePrivilegedAction`, Phase 4 — reused) + `PrivilegedActionDialog` (`@/components/users/PrivilegedActionDialog.vue`, Phase 4 — reused as-is, NOT copied into `clients/`); `clientsApi.rotateSecret` (`@/services/clients.api`, Task 5.4); `ClientSecretReveal` + `extractRevealedSecret` + `buildClientEnvSnippet` (Task 5.9 — `@/components/clients/ClientSecretReveal.vue`, `@/lib/clients/client-secret`); `AdminClientDetail` + `RotateSecretResponse` (`@/types/clients.types`, Task 5.1); session store `hasPermission` (`@/stores/session.store`); `useI18n` (`@/composables/useI18n`); `UiButton` (`@/components/ui/UiButton.vue`). Copy-and-adapt template: `app/components/users/UserLifecycleActions.vue` (the action-wiring half — `onTrigger`/`execute`/`onConfirm`/`onCancel` + dialog binding).

New locale keys (add to BOTH `id.json` and `en.json` under `clients`, keep parity; skip any already added by Task 5.9/5.10):

| Key | id | en |
|---|---|---|
| `clients.btn_rotate_secret` | "Putar rahasia" | "Rotate secret" |
| `clients.rotate_secret_unavailable` | "Anda tidak memiliki izin untuk memutar rahasia klien." | "You do not have permission to rotate this client's secret." |
| `clients.confirm_rotate_secret_title` | "Putar rahasia klien?" | "Rotate client secret?" |
| `clients.confirm_rotate_secret_desc` | "Rahasia baru langsung berlaku dan rahasia lama berhenti bekerja seketika. Pastikan aplikasi terkait siap menerima nilai baru sebelum melanjutkan." | "The new secret takes effect immediately and the old secret stops working at once. Make sure the relying app is ready to receive the new value before you continue." |
| `clients.secret_rotated_title` | "Rahasia klien diputar" | "Client secret rotated" |
| `clients.secret_rotated_desc` | "Salin rahasia ini sekarang — hanya ditampilkan satu kali dan tidak dapat diambil lagi." | "Copy this secret now — it is shown only once and cannot be retrieved again." |
| `clients.secret_reveal_warning` | "Rahasia ini setara kata sandi. Simpan di tempat aman; jangan kirim lewat kanal tidak terenkripsi." | "This secret is password-equivalent. Store it securely; never send it over an unencrypted channel." |
| `clients.btn_copy_secret` | "Salin rahasia" | "Copy secret" |
| `clients.btn_clear_secret` | "Bersihkan & tutup" | "Clear & close" |

Reuse without adding: `common.close`, `common.error_generic`, `users.btn_step_up` (verify each still resolves; the Phase-4 catalog has all three).

---

- [ ] **RED — write the failing test.** Create `app/components/clients/__tests__/ClientSecretRotation.spec.ts`:

```ts
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { computed, ref } from 'vue'
import type { PrivilegedActionFailure } from '@/lib/users/privileged-action'
import type { AdminClientDetail, RotateSecretResponse } from '@/types/clients.types'

const SECRET = 'sek-PLAINTEXT-DO-NOT-LEAK-9f8e7d6c5b4a'

const clientsApi = {
  rotateSecret: vi.fn<(clientId: string) => Promise<RotateSecretResponse>>(),
}
vi.mock('@/services/clients.api', () => ({ clientsApi }))

let permitted: string[] = []
vi.mock('@/stores/session.store', () => ({
  useSessionStore: () => ({ hasPermission: (p: string) => permitted.includes(p) }),
}))
vi.mock('@/composables/useI18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

// Controllable privileged-action runner double (same shape as the 4.x specs).
const isSubmitting = ref(false)
const failure = ref<PrivilegedActionFailure | null>(null)
const runImpl = vi.fn<(fn: () => Promise<unknown>) => Promise<unknown>>(async (fn) => fn())
const resetImpl = vi.fn<() => void>(() => {
  failure.value = null
  isSubmitting.value = false
})
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
    reset: resetImpl,
  }),
}))

// Dynamic import AFTER the vi.mock registrations + top-level doubles (TDZ — a static
// import is hoisted above these consts, so the factories would deref them too early).
const ClientSecretRotation = (await import('../ClientSecretRotation.vue')).default

const client = {
  client_id: 'portal',
  display_name: 'SSO Portal',
  type: 'confidential',
  redirect_uris: ['https://app.example/callback'],
  post_logout_redirect_uris: ['https://app.example'],
  allowed_scopes: ['openid', 'profile'],
  status: 'active',
  category: 'publik',
  has_secret_hash: true,
} as unknown as AdminClientDetail

const DialogStub = {
  name: 'PrivilegedActionDialog',
  props: ['open', 'title', 'description', 'danger', 'submitting', 'stepUpUrl', 'errorMessage', 'requestId'],
  emits: ['confirm', 'cancel'],
  template: `<div v-if="open" data-testid="dialog" :data-danger="danger">
    <p data-testid="dialog-desc">{{ description }}</p>
    <p data-testid="dialog-error">{{ errorMessage }}</p>
    <p data-testid="dialog-ref">{{ requestId }}</p>
    <a v-if="stepUpUrl" data-testid="dialog-stepup" :href="stepUpUrl">step-up</a>
    <button data-testid="dialog-confirm" @click="$emit('confirm')">confirm</button>
    <button data-testid="dialog-cancel" @click="$emit('cancel')">cancel</button>
  </div>`,
}
const RevealStub = {
  name: 'ClientSecretReveal',
  props: ['open', 'clientId', 'secret', 'envSnippet', 'isPublic', 'title', 'description', 'warning', 'copyLabel', 'clearLabel', 'closeLabel'],
  emits: ['close', 'copy'],
  template: `<div v-if="open" data-testid="reveal">
    <code data-testid="reveal-secret">{{ secret }}</code>
    <button data-testid="reveal-close" @click="$emit('close')">close</button>
  </div>`,
}

function mountRotation() {
  return mount(ClientSecretRotation, {
    props: { client },
    global: {
      stubs: { PrivilegedActionDialog: DialogStub, ClientSecretReveal: RevealStub },
    },
  })
}

function rotationResponse(): RotateSecretResponse {
  return {
    rotation: {
      client_id: 'portal',
      plaintext_once: SECRET,
      plaintext_secret: SECRET,
      rotated_at: '2026-06-28T12:00:00+00:00',
      expires_at: '2026-12-28T12:00:00+00:00',
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  permitted = ['admin.clients.write']
  isSubmitting.value = false
  failure.value = null
  runImpl.mockImplementation(async (fn: () => Promise<unknown>) => fn())
  resetImpl.mockImplementation(() => {
    failure.value = null
    isSubmitting.value = false
  })
  clientsApi.rotateSecret.mockResolvedValue(rotationResponse())
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ClientSecretRotation — permission gating', () => {
  it('hides the rotate button and shows the unavailable hint without admin.clients.write', () => {
    permitted = []
    const w = mountRotation()
    expect(w.find('[data-action="rotate-secret"]').exists()).toBe(false)
    expect(w.text()).toContain('clients.rotate_secret_unavailable')
  })
  it('renders the rotate button when permitted', () => {
    expect(mountRotation().find('[data-action="rotate-secret"]').exists()).toBe(true)
  })
})

describe('ClientSecretRotation — confirm gate', () => {
  it('opens the danger confirm dialog and does NOT call the API yet', async () => {
    const w = mountRotation()
    await w.find('[data-action="rotate-secret"]').trigger('click')
    expect(w.find('[data-testid="dialog"]').attributes('data-danger')).toBe('true')
    expect(w.find('[data-testid="dialog-desc"]').text()).toBe('clients.confirm_rotate_secret_desc')
    expect(clientsApi.rotateSecret).not.toHaveBeenCalled()
  })
  it('cancel closes the dialog and calls NO api', async () => {
    const w = mountRotation()
    await w.find('[data-action="rotate-secret"]').trigger('click')
    await w.find('[data-testid="dialog-cancel"]').trigger('click')
    expect(w.find('[data-testid="dialog"]').exists()).toBe(false)
    expect(clientsApi.rotateSecret).not.toHaveBeenCalled()
  })
})

describe('ClientSecretRotation — success (4.1) + one-time secret', () => {
  it('calls rotateSecret(client_id) once on confirm and reveals the plaintext once', async () => {
    const w = mountRotation()
    await w.find('[data-action="rotate-secret"]').trigger('click')
    await w.find('[data-testid="dialog-confirm"]').trigger('click')
    await w.vm.$nextTick()
    expect(clientsApi.rotateSecret).toHaveBeenCalledExactlyOnceWith('portal')
    expect(w.find('[data-testid="dialog"]').exists()).toBe(false) // confirm dialog closed
    expect(w.find('[data-testid="reveal-secret"]').text()).toBe(SECRET)
  })

  it('clears the secret from the DOM on reveal close and emits done (refresh)', async () => {
    const w = mountRotation()
    await w.find('[data-action="rotate-secret"]').trigger('click')
    await w.find('[data-testid="dialog-confirm"]').trigger('click')
    await w.vm.$nextTick()
    expect(w.html()).toContain(SECRET)

    await w.find('[data-testid="reveal-close"]').trigger('click')
    await w.vm.$nextTick()
    expect(w.find('[data-testid="reveal"]').exists()).toBe(false)
    expect(w.html()).not.toContain(SECRET) // gone from the DOM after close
    expect(w.emitted('done')).toHaveLength(1)
  })

  it('never persists the plaintext to storage and never logs it', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const w = mountRotation()
    await w.find('[data-action="rotate-secret"]').trigger('click')
    await w.find('[data-testid="dialog-confirm"]').trigger('click')
    await w.vm.$nextTick()
    await w.find('[data-testid="reveal-close"]').trigger('click')
    await w.vm.$nextTick()

    const storageCarriedSecret = setItem.mock.calls.some((args) =>
      args.some((a) => typeof a === 'string' && a.includes(SECRET)),
    )
    const loggedSecret = [...logSpy.mock.calls, ...errSpy.mock.calls, ...warnSpy.mock.calls]
      .flat()
      .some((a) => typeof a === 'string' && a.includes(SECRET))
    expect(storageCarriedSecret).toBe(false)
    expect(loggedSecret).toBe(false)
  })
})

describe('ClientSecretRotation — privileged-action matrix (4.2–4.8, step-up, public-client 422)', () => {
  const cases: { status: PrivilegedActionFailure['status']; stepUpUrl: string | null }[] = [
    { status: 'forbidden', stepUpUrl: null }, // 4.2 / 403
    { status: 'unauthenticated', stepUpUrl: null }, // 4.3 / 401 + 4.4 / 419
    { status: 'rate_limited', stepUpUrl: null }, // 4.5 / 429
    { status: 'invalid', stepUpUrl: null }, // 4.6 / 422 client_secret_rotation_invalid (public client)
    { status: 'step_up_required', stepUpUrl: '/auth/login?prompt=login&max_age=0' }, // 4.7 / 428 (:step_up window)
    { status: 'error', stepUpUrl: null }, // 4.8 / 5xx
  ]
  for (const c of cases) {
    it(`surfaces ${c.status} in the dialog with a redacted REF, no reveal, no stale loading`, async () => {
      runImpl.mockImplementation(async () => {
        failure.value = {
          status: c.status,
          requestId: 'req-rotate-44556677',
          auditEventId: 'aud-3',
          fieldErrors: {},
          stepUpUrl: c.stepUpUrl,
        }
        isSubmitting.value = false // 4.10: never left submitting after error
        return null
      })
      const w = mountRotation()
      await w.find('[data-action="rotate-secret"]').trigger('click')
      await w.find('[data-testid="dialog-confirm"]').trigger('click')
      await w.vm.$nextTick()
      expect(w.find('[data-testid="dialog"]').exists()).toBe(true) // stays open to show the failure
      expect(w.find('[data-testid="dialog-error"]').text()).toBe('common.error_generic')
      expect(w.find('[data-testid="dialog-ref"]').text()).toBe('req-rotate-44556677')
      expect(w.find('[data-testid="reveal"]').exists()).toBe(false) // never a reveal on failure
      expect(w.html()).not.toContain(SECRET)
      expect(w.emitted('done')).toBeUndefined()
      expect(isSubmitting.value).toBe(false)
      expect(w.find('[data-testid="dialog-stepup"]').exists()).toBe(c.status === 'step_up_required')
    })
  }
})
```

- [ ] **RED — run it, expect FAIL.** From `services/sso-admin-frontend`:
  `npm run test -- app/components/clients/__tests__/ClientSecretRotation.spec.ts`
  Expected: FAIL — `Failed to resolve import "../ClientSecretRotation.vue"` (the component does not exist yet). This is the missing-behavior failure, not a typo.

- [ ] **GREEN — minimal implementation.** Create `app/components/clients/ClientSecretRotation.vue`:

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import type { AdminClientDetail, RotateSecretResponse } from '@/types/clients.types'
import { usePrivilegedAction } from '@/composables/usePrivilegedAction'
import PrivilegedActionDialog from '@/components/users/PrivilegedActionDialog.vue'
import ClientSecretReveal from '@/components/clients/ClientSecretReveal.vue'
import { buildClientEnvSnippet, extractRevealedSecret } from '@/lib/clients/client-secret'
import { clientsApi } from '@/services/clients.api'
import { useSessionStore } from '@/stores/session.store'
import { useI18n } from '@/composables/useI18n'
import UiButton from '@/components/ui/UiButton.vue'

const props = defineProps<{ client: AdminClientDetail }>()
const emit = defineEmits<{ done: [] }>()

const session = useSessionStore()
const { t } = useI18n()
const action = usePrivilegedAction<RotateSecretResponse>()

const canWrite = computed(() => session.hasPermission('admin.clients.write'))
const confirming = ref(false)
// The ONLY place the plaintext lives: a client-only ref — never useState/Pinia/storage,
// never logged. Set from the POST response, nulled on reveal close.
const revealed = ref<string | null>(null)

const envSnippet = computed(() =>
  revealed.value === null
    ? ''
    : buildClientEnvSnippet({
        clientId: props.client.client_id,
        secret: revealed.value,
        redirectUri: props.client.redirect_uris[0],
        postLogoutUri: props.client.post_logout_redirect_uris?.[0],
        scopes: props.client.allowed_scopes,
      }),
)

function onTrigger(): void {
  action.reset()
  confirming.value = true
}

async function onConfirm(): Promise<void> {
  const result = await action.run(() => clientsApi.rotateSecret(props.client.client_id))
  if (result === null) return // failure stays in the dialog (safe copy + REF + step-up link)
  confirming.value = false
  const secret = extractRevealedSecret(result.rotation)
  if (secret === null) {
    emit('done') // defensive: no plaintext to show, still refresh the detail
    return
  }
  revealed.value = secret
}

function onCancel(): void {
  confirming.value = false
  action.reset()
}

function onRevealClose(): void {
  revealed.value = null // clear the one-time secret from memory
  emit('done') // refresh detail so has_secret_hash / secret_rotated_at update
}
</script>

<template>
  <section class="client-secret-rotation" data-testid="client-secret-rotation">
    <p v-if="!canWrite" class="client-secret-rotation__none">
      {{ t('clients.rotate_secret_unavailable') }}
    </p>

    <template v-else>
      <UiButton
        variant="danger"
        data-action="rotate-secret"
        :disabled="action.isSubmitting.value"
        @click="onTrigger"
      >
        {{ t('clients.btn_rotate_secret') }}
      </UiButton>

      <PrivilegedActionDialog
        :open="confirming"
        :title="t('clients.confirm_rotate_secret_title')"
        :description="t('clients.confirm_rotate_secret_desc')"
        :danger="true"
        :submitting="action.isSubmitting.value"
        :step-up-url="action.stepUpUrl.value"
        :step-up-label="t('users.btn_step_up')"
        :error-message="action.failure.value ? t('common.error_generic') : null"
        :request-id="action.requestId.value"
        @confirm="onConfirm"
        @cancel="onCancel"
      />

      <ClientSecretReveal
        :open="revealed !== null"
        :client-id="client.client_id"
        :secret="revealed"
        :env-snippet="envSnippet"
        :title="t('clients.secret_rotated_title')"
        :description="t('clients.secret_rotated_desc')"
        :warning="t('clients.secret_reveal_warning')"
        :copy-label="t('clients.btn_copy_secret')"
        :clear-label="t('clients.btn_clear_secret')"
        :close-label="t('common.close')"
        @close="onRevealClose"
      />
    </template>
  </section>
</template>

<style scoped>
.client-secret-rotation {
  display: grid;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--border);
}
.client-secret-rotation__none {
  margin: 0;
  font: 400 0.875rem/1.5 var(--font-sans);
  color: var(--fg-3);
}
</style>
```

  Then add the nine `clients.*` keys to **both** `app/locales/id.json` and `app/locales/en.json` (table above; skip any already present from Task 5.9/5.10 to avoid duplicate keys; keep id↔en parity).

- [ ] **GREEN — run it, expect PASS.** From `services/sso-admin-frontend`:
  `npm run test -- app/components/clients/__tests__/ClientSecretRotation.spec.ts`
  Expected: PASS — all describe blocks green (permission gating, confirm gate, success + one-time secret incl. DOM-absent-after-close + no-storage/no-log, and the six-status matrix incl. public-client `invalid`/422 and `step_up_required`/428).

- [ ] **Wire into the detail page.** Edit `app/pages/clients/[clientId].vue` — import `ClientSecretRotation` and mount it in the **security** tab panel beneath the `has_secret_hash` / `secret_rotated_at` read-out, gated by the client being present:

```vue
<ClientSecretRotation v-if="client" :client="client" @done="refresh" />
```

  (`refresh` is the `useClientDetail` return from Task 5.8; the component self-gates the button on `admin.clients.write`, so no extra `v-if` permission guard is needed — but keep the read-only `has_secret_hash` panel visible to read-only operators.)

- [ ] **REFACTOR (only if needed).** No shared abstraction to extract — this is a single, focused action component. The error/step-up surfacing is the reused `PrivilegedActionDialog`; do NOT add a new dialog. Re-run the unit test to confirm still green.

- [ ] **Verify no regression in the surrounding gates** before commit (fast subset): `npm run typecheck` and `npm run lint` from `services/sso-admin-frontend` — expect 0 errors (catches the locale-parity + `vi.fn` type-parameter + import-path rules).

- [ ] **Commit (green only).**
  `git add app/components/clients/ClientSecretRotation.vue app/components/clients/__tests__/ClientSecretRotation.spec.ts app/pages/clients/[clientId].vue app/locales/id.json app/locales/en.json`
  ```
  git commit -m "$(cat <<'EOF'
feat(sso-admin-frontend): client secret rotation action with one-time reveal

Rotate-secret control in the client security tab: a reused PrivilegedActionDialog
(impact warning + :step_up matrix) drives clientsApi.rotateSecret, then the rotated
plaintext is shown once via ClientSecretReveal held only in a client-only ref that is
nulled on close. Emits done so the detail page refreshes. Gated by admin.clients.write;
covers the full privileged-action matrix including the public-client 422
(client_secret_rotation_invalid). The secret never reaches Pinia/useState/storage/logs.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
  ```

**Task DoD (run from `services/sso-admin-frontend`; report any blocked command explicitly, never claim PASS for a command that did not run):** `npm run typecheck && npm run lint && npm run format:check && npm run test && npm run build` — all green. The one-time-secret discipline (shown once, cleared on close with DOM-absence proven, never persisted to storage, never logged) and the full privileged-action matrix (403/401/419/429/422-public-client/428-step-up/5xx, no stale loading, no reveal on failure) are proven by `app/components/clients/__tests__/ClientSecretRotation.spec.ts`. The end-to-end rotate→reveal→clear flow and the SSR-leak proof that the rotated secret never enters the SSR HTML / `__NUXT_DATA__` are exercised in Task 5.14 (e2e + leak gate).

---

### Task 5.13: Lifecycle/destructive actions (activate / disable / decommission / delete)

Add the destructive lifecycle surface to the client detail page through **one** descriptor-driven component over the **reused** Phase-4 privileged-action infra. A **pure** `client-actions.ts` table encodes each action's permission pair (`admin.clients.write` **and** `admin.sessions.terminate`), confirm requirement, reason policy, type-to-confirm-by-`client_id` flag, danger affordance, and the `status`es it `appliesTo` (so it is unit-testable with zero Nuxt context). `ClientLifecycleActions.vue` renders permission-gated buttons (only when the operator holds **both** permissions), disables buttons whose `appliesTo` does not include the client's current `status`, opens the reused `PrivilegedActionDialog` with an impact summary (token/session/client-impact warning) plus an optional reason (disable/decommission) or a type-to-confirm `client_id` field (delete) plus the step-up notice, runs the matching `clientsApi` method through the reused `usePrivilegedAction`, and on success emits `done()` (activate/disable/decommission → page calls `useClientDetail.refresh()`, never left stale) or `deleted()` (page calls `navigateTo({ name: 'admin.clients' })`). `ReasonPolicy` + `isReasonValid` are **imported from `@/lib/users/user-actions`** (reused generic helpers, never re-declared).

The full privileged-action matrix lives on the shared infra (Task 4.9 / extract-foundation §3); here it is re-exercised at the **component boundary** to prove every failure status (`401/403/419/422/428/429/5xx` + step-up) surfaces safe copy + a redacted `REF-` reference in the dialog, leaves no stale loading, and that cancel calls no API. The clients-specific cases the matrix must cover: the `client_integration_invalid` **422** (e.g. activating a non-staged registration) → `invalid`, and the **seeded-403** (decommissioning a `provisioning=seeded` registration) → `forbidden` (extract-backend §lifecycle rows). Copy-and-adapt of `app/lib/users/user-actions.ts` + `app/components/users/UserLifecycleActions.vue` (action-wiring half — no sync-profile form here; the edit forms are Task 5.11).

**Files**
- Create: `app/lib/clients/client-actions.ts`
- Create: `app/components/clients/ClientLifecycleActions.vue`
- Modify: `app/pages/clients/[clientId].vue` (mount `ClientLifecycleActions` in the lifecycle tab; wire `@done="refresh"`; on `@deleted` call `navigateTo({ name: 'admin.clients' })`)
- Modify: `app/locales/id.json`, `app/locales/en.json` (ADD only the genuinely-new keys below, to BOTH files, keep id↔en parity; reuse the existing `clients.*` keys)
- Test: `app/lib/clients/__tests__/client-actions.spec.ts`
- Test: `app/components/clients/__tests__/ClientLifecycleActions.spec.ts`
- Modify (extend): `app/pages/__tests__/clients-detail.page.nuxt.spec.ts` (actions mount when both permissions held; `done` triggers `refresh`; `deleted` triggers `navigateTo({ name: 'admin.clients' })`; no `client_secret` in SSR HTML)

**Interfaces**
- Consumes:
  - `usePrivilegedAction` (`@/composables/usePrivilegedAction`) + `PrivilegedActionDialog` (`@/components/users/PrivilegedActionDialog.vue`) — Phase 4, reused as-is (NOT copied into a `clients/` path)
  - `ReasonPolicy` + `isReasonValid` (`@/lib/users/user-actions`) — reused generic helpers, never re-declared
  - `clientsApi.activate` / `disable` / `decommission` / `delete` (Task 5.4)
  - `AdminClientDetail`, `ClientStatus`, `DisablePayload`, `DecommissionPayload`, `ActivatePayload` (Task 5.1)
  - `useSessionStore().hasPermission` (`@/stores/session.store`)
  - `useClientDetail().refresh` + `navigateTo` (via the page — Tasks 5.5/5.8)
  - `formatSupportReference` (`@/lib/display-identifiers`); `useI18n` (`@/composables/useI18n`); `UiButton` / `UiFormField` (`@/components/ui/*`)
- Produces (`app/lib/clients/client-actions.ts`):
  - `type ClientActionId = 'activate' | 'disable' | 'decommission' | 'delete'`
  - `type ClientActionDescriptor = { readonly id: ClientActionId; readonly permission: 'admin.clients.write'; readonly secondaryPermission: 'admin.sessions.terminate'; readonly confirmRequired: boolean; readonly reason: ReasonPolicy; readonly confirmByClientId: boolean; readonly danger: boolean; readonly appliesTo: readonly ClientStatus[] }`
  - `const CLIENT_ACTIONS: Readonly<Record<ClientActionId, ClientActionDescriptor>>`
- Produces (`app/components/clients/ClientLifecycleActions.vue`):
  - Props: `{ client: AdminClientDetail }`; Emits: `done()` (after a successful activate/disable/decommission so the page refreshes), `deleted()` (after a successful delete so the page navigates back to the list)

**Steps**

1. [ ] **RED — pure descriptor table.** Write `app/lib/clients/__tests__/client-actions.spec.ts` asserting the descriptor flags from the backend contract (extract-backend §lifecycle: every lifecycle action requires `CLIENTS_WRITE` + `SESSIONS_TERMINATE` in the `:step_up` window; activate applies only to `staged` and is not destructive; disable/decommission carry an optional reason and are destructive; delete is destructive and type-to-confirm by `client_id`). `isReasonValid` is the reused generic helper from `@/lib/users/user-actions`, so the spec imports it from there — proving it is not re-declared in `client-actions.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { CLIENT_ACTIONS, type ClientActionId } from '../client-actions'
import { isReasonValid } from '@/lib/users/user-actions'

describe('CLIENT_ACTIONS descriptor table', () => {
  it('gates every lifecycle action behind BOTH clients-write and sessions-terminate', () => {
    for (const id of Object.keys(CLIENT_ACTIONS) as ClientActionId[]) {
      expect(CLIENT_ACTIONS[id].permission).toBe('admin.clients.write')
      expect(CLIENT_ACTIONS[id].secondaryPermission).toBe('admin.sessions.terminate')
    }
  })

  it('flags the destructive affordances as danger, activate as routine', () => {
    expect(CLIENT_ACTIONS.activate.danger).toBe(false)
    for (const id of ['disable', 'decommission', 'delete'] as ClientActionId[])
      expect(CLIENT_ACTIONS[id].danger).toBe(true)
  })

  it('requires confirmation for every lifecycle action (all are step-up + impactful)', () => {
    for (const id of Object.keys(CLIENT_ACTIONS) as ClientActionId[])
      expect(CLIENT_ACTIONS[id].confirmRequired).toBe(true)
  })

  it('encodes the reason policy: optional reason on disable/decommission, none elsewhere', () => {
    expect(CLIENT_ACTIONS.disable.reason).toEqual({ required: false, max: 255 })
    expect(CLIENT_ACTIONS.decommission.reason).toEqual({ required: false, max: 255 })
    expect(CLIENT_ACTIONS.activate.reason).toBeNull()
    expect(CLIENT_ACTIONS.delete.reason).toBeNull()
  })

  it('requires type-to-confirm-by-client-id only for delete', () => {
    expect(CLIENT_ACTIONS.delete.confirmByClientId).toBe(true)
    for (const id of ['activate', 'disable', 'decommission'] as ClientActionId[])
      expect(CLIENT_ACTIONS[id].confirmByClientId).toBe(false)
  })

  it('binds each action to the statuses it applies to', () => {
    expect(CLIENT_ACTIONS.activate.appliesTo).toEqual(['staged'])
    expect(CLIENT_ACTIONS.disable.appliesTo).toEqual(['active'])
    expect(CLIENT_ACTIONS.decommission.appliesTo).toEqual(['active', 'disabled'])
    expect(CLIENT_ACTIONS.delete.appliesTo).toEqual([
      'active',
      'staged',
      'disabled',
      'decommissioned',
    ])
  })

  it('every id is its own key (no descriptor drift)', () => {
    for (const id of Object.keys(CLIENT_ACTIONS) as ClientActionId[])
      expect(CLIENT_ACTIONS[id].id).toBe(id)
  })

  it('reuses the generic isReasonValid helper for the optional reason policy', () => {
    expect(isReasonValid(CLIENT_ACTIONS.disable.reason, '')).toBe(true) // optional → empty OK
    expect(isReasonValid(CLIENT_ACTIONS.disable.reason, 'x'.repeat(256))).toBe(false) // > max
    expect(isReasonValid(CLIENT_ACTIONS.delete.reason, '')).toBe(true) // null policy → always valid
  })
})
```

2. [ ] **Run it — expect FAIL** (module missing):

```bash
npm run test -- app/lib/clients/__tests__/client-actions.spec.ts
```
Expected: `Error: Failed to load url ../client-actions` / `CLIENT_ACTIONS is not defined` — RED.

3. [ ] **GREEN — write `app/lib/clients/client-actions.ts`** (pure; the only imports are the type-level `ClientStatus` and the reused `ReasonPolicy` — `isReasonValid` is NOT re-declared here):

```ts
// Pure, Nuxt-free descriptor table for the client lifecycle/destructive actions.
// Each entry encodes the backend contract (extract-backend §lifecycle): the
// CLIENTS_WRITE + SESSIONS_TERMINATE permission pair (every lifecycle route lives
// in the session-management destructive group), the step-up-implied confirm, the
// reason policy, the type-to-confirm-by-client_id gate for delete, the danger
// affordance, and which statuses the action applies to. No Vue, no network, no DOM
// — unit-testable in isolation so descriptor drift is caught before the surface.
// ReasonPolicy + isReasonValid are reused from the generic users helper.
import type { ReasonPolicy } from '@/lib/users/user-actions'
import type { ClientStatus } from '@/types/clients.types'

export type ClientActionId = 'activate' | 'disable' | 'decommission' | 'delete'

export type ClientActionDescriptor = {
  readonly id: ClientActionId
  readonly permission: 'admin.clients.write'
  readonly secondaryPermission: 'admin.sessions.terminate'
  readonly confirmRequired: boolean
  readonly reason: ReasonPolicy
  readonly confirmByClientId: boolean
  readonly danger: boolean
  readonly appliesTo: readonly ClientStatus[]
}

export const CLIENT_ACTIONS: Readonly<Record<ClientActionId, ClientActionDescriptor>> = {
  activate: {
    id: 'activate',
    permission: 'admin.clients.write',
    secondaryPermission: 'admin.sessions.terminate',
    confirmRequired: true,
    reason: null,
    confirmByClientId: false,
    danger: false,
    appliesTo: ['staged'],
  },
  disable: {
    id: 'disable',
    permission: 'admin.clients.write',
    secondaryPermission: 'admin.sessions.terminate',
    confirmRequired: true,
    reason: { required: false, max: 255 },
    confirmByClientId: false,
    danger: true,
    appliesTo: ['active'],
  },
  decommission: {
    id: 'decommission',
    permission: 'admin.clients.write',
    secondaryPermission: 'admin.sessions.terminate',
    confirmRequired: true,
    reason: { required: false, max: 255 },
    confirmByClientId: false,
    danger: true,
    appliesTo: ['active', 'disabled'],
  },
  delete: {
    id: 'delete',
    permission: 'admin.clients.write',
    secondaryPermission: 'admin.sessions.terminate',
    confirmRequired: true,
    reason: null,
    confirmByClientId: true,
    danger: true,
    appliesTo: ['active', 'staged', 'disabled', 'decommissioned'],
  },
}
```

4. [ ] **Run it — expect PASS:**

```bash
npm run test -- app/lib/clients/__tests__/client-actions.spec.ts
```
Expected: all `client-actions.spec.ts` tests green.

5. [ ] **ADD locale keys** (BOTH `app/locales/id.json` and `app/locales/en.json`, inside the existing `clients` object — REUSE the already-present `btn_disable_client` / `btn_decommission_client` / `btn_delete_client`, `label_disable_reason` / `label_decommission` / `label_delete_confirmation`, `delete_confirmation_error`, `lifecycle_impact`, `lifecycle_title`, `tab_lifecycle`, and the shared `common.error_generic`; ADD only these net-new keys for activate, the step-up affordance, the no-permission hint, and the per-action confirm copy):

  - `clients.btn_activate_client` — en: `"Activate client"`, id: `"Aktifkan klien"`
  - `clients.btn_step_up` — en: `"Re-authenticate to continue"`, id: `"Autentikasi ulang untuk melanjutkan"`
  - `clients.actions_none` — en: `"You do not have permission to manage this client's lifecycle."`, id: `"Anda tidak memiliki izin untuk mengelola siklus hidup klien ini."`
  - `clients.confirm_activate_title` — en: `"Activate this client?"`, id: `"Aktifkan klien ini?"`
  - `clients.confirm_activate_desc` — en: `"The staged registration becomes live and can begin issuing authorizations. No tokens are revoked."`, id: `"Registrasi yang disiapkan menjadi aktif dan dapat mulai menerbitkan otorisasi. Tidak ada token yang dicabut."`
  - `clients.confirm_disable_title` — en: `"Disable this client?"`, id: `"Nonaktifkan klien ini?"`
  - `clients.confirm_disable_desc` — en: `"New authorization is blocked immediately and active tokens may be revoked. Existing sessions for this client can be terminated."`, id: `"Otorisasi baru langsung diblokir dan token aktif dapat dicabut. Sesi yang ada untuk klien ini dapat diakhiri."`
  - `clients.confirm_decommission_title` — en: `"Decommission this client?"`, id: `"Hentikan klien ini?"`
  - `clients.confirm_decommission_desc` — en: `"The client configuration is retired and redirect evidence is cleared. This cannot be undone from this console."`, id: `"Konfigurasi klien dipensiunkan dan bukti pengalihan dihapus. Ini tidak dapat dibatalkan dari konsol ini."`
  - `clients.confirm_delete_title` — en: `"Delete this client permanently?"`, id: `"Hapus klien ini secara permanen?"`
  - `clients.confirm_delete_desc` — en: `"The registration is deleted permanently and all of its tokens and sessions are revoked. Type the client ID to confirm."`, id: `"Registrasi dihapus secara permanen dan seluruh token serta sesinya dicabut. Ketik ID klien untuk konfirmasi."`

   Verify parity after editing — diff **both** the `clients` and `common` namespaces:

```bash
node -e "const id=require('./app/locales/id.json'),en=require('./app/locales/en.json');const diff=(a,b)=>[...Object.keys(a).filter(k=>!(k in b)),...Object.keys(b).filter(k=>!(k in a))];const d=[...diff(id.clients,en.clients).map(k=>'clients.'+k),...diff(id.common,en.common).map(k=>'common.'+k)];if(d.length){console.error('MISMATCH',d);process.exit(1)}console.log('locale parity OK')"
```
Expected: `locale parity OK`.

6. [ ] **RED — component.** Write `app/components/clients/__tests__/ClientLifecycleActions.spec.ts` (plain jsdom spec; mocks the service + store + i18n + composable; stubs the dialog). It covers: dual-permission gating, applicability-by-`status` disabling, confirm-opens-dialog-without-calling-API, cancel-calls-no-API, danger flag, activate sends `{}`, disable sends the reason, delete type-to-confirm (wrong text → no API + inline error; exact `client_id` → `delete` called + `deleted` emitted), success emits `done` for non-delete, and the **full privileged-action failure matrix** (incl. the `invalid`/422 `client_integration_invalid` and `forbidden`/seeded-403 cases) surfaced safely at the component boundary:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { computed, ref } from 'vue'
import type { PrivilegedActionFailure } from '@/lib/users/privileged-action'
import type { ClientActionId } from '@/lib/clients/client-actions'

const clientsApi = {
  activate: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  disable: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  decommission: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  delete: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}
vi.mock('@/services/clients.api', () => ({ clientsApi }))

let permitted: string[] = []
vi.mock('@/stores/session.store', () => ({
  useSessionStore: () => ({ hasPermission: (p: string) => permitted.includes(p) }),
}))
vi.mock('@/composables/useI18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

// Controllable privileged-action runner double (mirrors the Task 4.11 mock).
const isSubmitting = ref(false)
const failure = ref<PrivilegedActionFailure | null>(null)
const runImpl = vi.fn<(fn: () => Promise<unknown>) => Promise<unknown>>(async (fn) => fn())
vi.mock('@/composables/usePrivilegedAction', () => ({
  usePrivilegedAction: () => ({
    status: ref('idle'),
    isSubmitting,
    failure,
    // Reactive computeds: a static ref(failure.value?…) would be read once at setup
    // (failure null) and never update after runImpl sets failure.value.
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

// Dynamic import after the vi.mock registrations + top-level doubles (TDZ-safe).
const ClientLifecycleActions = (await import('../ClientLifecycleActions.vue')).default

const client = {
  client_id: 'selamat-kerja',
  display_name: 'Selamat Kerja',
  type: 'confidential',
  category: 'kepegawaian',
  status: 'active',
  has_secret_hash: true,
  redirect_uris: ['https://selamat-kerja.example.test/auth/callback'],
} as unknown as import('@/types/clients.types').AdminClientDetail

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
    'errorMessage',
    'requestId',
  ],
  emits: ['confirm', 'cancel', 'update:reason'],
  template: `<div v-if="open" data-testid="dialog" :data-danger="danger">
    <p data-testid="dialog-desc">{{ description }}</p>
    <p data-testid="dialog-reason-label">{{ reasonLabel }}</p>
    <p data-testid="dialog-error">{{ errorMessage }}</p>
    <p data-testid="dialog-ref">{{ requestId }}</p>
    <input data-testid="dialog-reason" :value="reason" @input="$emit('update:reason', $event.target.value)" />
    <button data-testid="dialog-confirm" @click="$emit('confirm')">confirm</button>
    <button data-testid="dialog-cancel" @click="$emit('cancel')">cancel</button>
  </div>`,
}

function mountActions(over: Partial<typeof client> = {}) {
  return mount(ClientLifecycleActions, {
    props: { client: { ...client, ...over } as typeof client },
    global: { stubs: { PrivilegedActionDialog: DialogStub }, renderStubDefaultSlot: true },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  permitted = ['admin.clients.write', 'admin.sessions.terminate']
  isSubmitting.value = false
  failure.value = null
  runImpl.mockImplementation(async (fn: () => Promise<unknown>) => fn())
})

describe('ClientLifecycleActions — dual-permission gating', () => {
  it('renders lifecycle buttons only when BOTH permissions are held', () => {
    const w = mountActions()
    expect(w.find('[data-action="disable"]').exists()).toBe(true)
    expect(w.find('[data-action="delete"]').exists()).toBe(true)
  })
  it('hides every action when sessions-terminate is missing', () => {
    permitted = ['admin.clients.write']
    const w = mountActions()
    expect(w.find('[data-action="disable"]').exists()).toBe(false)
    expect(w.text()).toContain('clients.actions_none')
  })
})

describe('ClientLifecycleActions — applicability by status', () => {
  it('disables activate on an active client and enables disable/decommission/delete', () => {
    const w = mountActions({ status: 'active' })
    expect(w.find('[data-action="activate"]').attributes('disabled')).toBeDefined()
    expect(w.find('[data-action="disable"]').attributes('disabled')).toBeUndefined()
    expect(w.find('[data-action="decommission"]').attributes('disabled')).toBeUndefined()
    expect(w.find('[data-action="delete"]').attributes('disabled')).toBeUndefined()
  })
  it('enables activate and disables disable on a staged client', () => {
    const w = mountActions({ status: 'staged' })
    expect(w.find('[data-action="activate"]').attributes('disabled')).toBeUndefined()
    expect(w.find('[data-action="disable"]').attributes('disabled')).toBeDefined()
  })
})

describe('ClientLifecycleActions — confirm vs cancel', () => {
  it('opens the confirm dialog and does NOT call the API yet', async () => {
    const w = mountActions()
    await w.find('[data-action="disable"]').trigger('click')
    expect(w.find('[data-testid="dialog"]').exists()).toBe(true)
    expect(clientsApi.disable).not.toHaveBeenCalled()
  })
  it('marks the destructive dialog danger and cancel calls NO api', async () => {
    const w = mountActions()
    await w.find('[data-action="disable"]').trigger('click')
    expect(w.find('[data-testid="dialog"]').attributes('data-danger')).toBe('true')
    await w.find('[data-testid="dialog-cancel"]').trigger('click')
    expect(w.find('[data-testid="dialog"]').exists()).toBe(false)
    expect(clientsApi.disable).not.toHaveBeenCalled()
  })
})

describe('ClientLifecycleActions — success paths (4.1)', () => {
  it('activate posts an empty payload and emits done', async () => {
    const w = mountActions({ status: 'staged' })
    await w.find('[data-action="activate"]').trigger('click')
    await w.find('[data-testid="dialog-confirm"]').trigger('click')
    await w.vm.$nextTick()
    expect(clientsApi.activate).toHaveBeenCalledWith('selamat-kerja', {})
    expect(w.emitted('done')).toHaveLength(1)
    expect(w.emitted('deleted')).toBeUndefined()
  })
  it('disable forwards the trimmed reason and emits done', async () => {
    const w = mountActions()
    await w.find('[data-action="disable"]').trigger('click')
    await w.find('[data-testid="dialog-reason"]').setValue('Vendor offboarded')
    await w.find('[data-testid="dialog-confirm"]').trigger('click')
    await w.vm.$nextTick()
    expect(clientsApi.disable).toHaveBeenCalledWith('selamat-kerja', { reason: 'Vendor offboarded' })
    expect(w.emitted('done')).toHaveLength(1)
  })
})

describe('ClientLifecycleActions — delete type-to-confirm', () => {
  it('blocks delete and shows an inline error until the typed client_id matches', async () => {
    const w = mountActions()
    await w.find('[data-action="delete"]').trigger('click')
    expect(w.find('[data-testid="dialog-reason-label"]').text()).toBe(
      'clients.label_delete_confirmation',
    )
    await w.find('[data-testid="dialog-reason"]').setValue('wrong-id')
    await w.find('[data-testid="dialog-confirm"]').trigger('click')
    await w.vm.$nextTick()
    expect(clientsApi.delete).not.toHaveBeenCalled()
    expect(w.find('[data-testid="dialog-error"]').text()).toBe('clients.delete_confirmation_error')
    expect(w.find('[data-testid="dialog"]').exists()).toBe(true) // stays open
  })
  it('deletes and emits deleted (not done) once the exact client_id is typed', async () => {
    const w = mountActions()
    await w.find('[data-action="delete"]').trigger('click')
    await w.find('[data-testid="dialog-reason"]').setValue('selamat-kerja')
    await w.find('[data-testid="dialog-confirm"]').trigger('click')
    await w.vm.$nextTick()
    expect(clientsApi.delete).toHaveBeenCalledWith('selamat-kerja')
    expect(w.emitted('deleted')).toHaveLength(1)
    expect(w.emitted('done')).toBeUndefined()
  })
})

describe('ClientLifecycleActions — failure matrix (401/403/419/422/428/429/5xx)', () => {
  const cases: { status: PrivilegedActionFailure['status']; stepUpUrl: string | null }[] = [
    { status: 'forbidden', stepUpUrl: null }, // 403 incl. seeded-403 decommission
    { status: 'unauthenticated', stepUpUrl: null }, // 401 + 419
    { status: 'rate_limited', stepUpUrl: null }, // 429
    { status: 'invalid', stepUpUrl: null }, // 422 client_integration_invalid
    { status: 'step_up_required', stepUpUrl: '/auth/login?prompt=login&max_age=0' }, // 428
    { status: 'error', stepUpUrl: null }, // 5xx
  ]
  for (const c of cases) {
    it(`surfaces ${c.status} safely with a redacted REF and no stale loading`, async () => {
      runImpl.mockImplementation(async () => {
        failure.value = {
          status: c.status,
          requestId: 'req-clients-9911',
          auditEventId: 'aud-1',
          fieldErrors: {},
          stepUpUrl: c.stepUpUrl,
        }
        isSubmitting.value = false // never left submitting after error
        return null
      })
      const w = mountActions()
      await w.find('[data-action="decommission"]').trigger('click')
      await w.find('[data-testid="dialog-confirm"]').trigger('click')
      await w.vm.$nextTick()
      expect(w.find('[data-testid="dialog"]').exists()).toBe(true) // stays open to show the failure
      expect(w.find('[data-testid="dialog-ref"]').text()).toBe('req-clients-9911')
      expect(w.find('[data-testid="dialog-error"]').text()).toBe('common.error_generic')
      expect(w.text()).not.toMatch(/acr|urn:|stack|trace|eyJ/i) // no raw ACR/trace leak
      expect(w.emitted('done')).toBeUndefined()
      expect(w.emitted('deleted')).toBeUndefined()
      expect(isSubmitting.value).toBe(false)
    })
  }

  it('passes the re-auth URL to the dialog step-up affordance on 428', async () => {
    runImpl.mockImplementation(async () => {
      failure.value = {
        status: 'step_up_required',
        requestId: 'req-clients-stepup',
        auditEventId: null,
        fieldErrors: {},
        stepUpUrl: '/auth/login?prompt=login&max_age=0',
      }
      isSubmitting.value = false
      return null
    })
    const w = mountActions()
    await w.find('[data-action="disable"]').trigger('click')
    await w.find('[data-testid="dialog-confirm"]').trigger('click')
    await w.vm.$nextTick()
    const dialog = w.findComponent({ name: 'PrivilegedActionDialog' })
    expect(dialog.props('stepUpUrl')).toBe('/auth/login?prompt=login&max_age=0')
  })
})
```

   ponytail: `client_integration_invalid` 422 and the seeded-403 both arrive as `ApiError`s the shared `resolvePrivilegedActionFailure` already maps to `invalid` / `forbidden` (extract-foundation §3); this spec asserts the surface, not the mapping (that is Task 4.9's spec) — `as ClientActionId` keeps the test import meaningful without re-testing the matrix internals.

7. [ ] **Run it — expect FAIL** (component missing):

```bash
npm run test -- app/components/clients/__tests__/ClientLifecycleActions.spec.ts
```
Expected: `Failed to resolve import "../ClientLifecycleActions.vue"` — RED.

8. [ ] **GREEN — write `app/components/clients/ClientLifecycleActions.vue`:**

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import type {
  ActivatePayload,
  AdminClientDetail,
  ClientStatus,
  DecommissionPayload,
  DisablePayload,
} from '@/types/clients.types'
import { CLIENT_ACTIONS, type ClientActionId } from '@/lib/clients/client-actions'
import { usePrivilegedAction } from '@/composables/usePrivilegedAction'
import PrivilegedActionDialog from '@/components/users/PrivilegedActionDialog.vue'
import { clientsApi } from '@/services/clients.api'
import { useSessionStore } from '@/stores/session.store'
import { useI18n } from '@/composables/useI18n'
import UiButton from '@/components/ui/UiButton.vue'

const props = defineProps<{ client: AdminClientDetail }>()
const emit = defineEmits<{ done: []; deleted: [] }>()

const session = useSessionStore()
const { t } = useI18n()
const action = usePrivilegedAction<unknown>()

const activeAction = ref<ClientActionId | null>(null)
// `reason` doubles as the disable/decommission reason AND the delete type-to-confirm
// text (the reused PrivilegedActionDialog exposes a single `reason` field; the exact
// client_id match is enforced in onConfirm below).
const reason = ref('')
const confirmMismatch = ref(false)

const BTN_KEY: Record<ClientActionId, string> = {
  activate: 'btn_activate_client',
  disable: 'btn_disable_client',
  decommission: 'btn_decommission_client',
  delete: 'btn_delete_client',
}

const visibleActions = computed(() =>
  (Object.keys(CLIENT_ACTIONS) as ClientActionId[]).filter(
    (id) =>
      session.hasPermission(CLIENT_ACTIONS[id].permission) &&
      session.hasPermission(CLIENT_ACTIONS[id].secondaryPermission),
  ),
)
const hasAnyAction = computed(() => visibleActions.value.length > 0)

function isApplicable(id: ClientActionId): boolean {
  return CLIENT_ACTIONS[id].appliesTo.includes(props.client.status as ClientStatus)
}

const activeDescriptor = computed(() =>
  activeAction.value ? CLIENT_ACTIONS[activeAction.value] : null,
)
const dialogTitle = computed(() =>
  activeAction.value ? t(`clients.confirm_${activeAction.value}_title`) : '',
)
const dialogDescription = computed(() =>
  activeAction.value ? t(`clients.confirm_${activeAction.value}_desc`) : '',
)
const reasonLabel = computed(() => {
  switch (activeAction.value) {
    case 'disable':
      return t('clients.label_disable_reason')
    case 'decommission':
      return t('clients.label_decommission')
    case 'delete':
      return t('clients.label_delete_confirmation')
    default:
      return ''
  }
})
const dialogError = computed(() => {
  if (confirmMismatch.value) return t('clients.delete_confirmation_error')
  return action.failure.value ? t('common.error_generic') : null
})

function callApi(id: ClientActionId): Promise<unknown> {
  const cid = props.client.client_id
  switch (id) {
    case 'activate': {
      // Posts {} on purpose — the backend mints/derives the secret server-side
      // (no UI secret_hash path this phase).
      const payload: ActivatePayload = {}
      return clientsApi.activate(cid, payload)
    }
    case 'disable': {
      const payload: DisablePayload = { reason: reason.value.trim() }
      return clientsApi.disable(cid, payload)
    }
    case 'decommission': {
      const payload: DecommissionPayload = { reason: reason.value.trim() }
      return clientsApi.decommission(cid, payload)
    }
    case 'delete':
      return clientsApi.delete(cid)
  }
}

async function execute(id: ClientActionId): Promise<void> {
  const result = await action.run(() => callApi(id))
  // Failure stays visible in the dialog (REF + safe copy + step-up); no stale state.
  if (result === null) return
  activeAction.value = null
  reason.value = ''
  confirmMismatch.value = false
  if (id === 'delete') emit('deleted')
  else emit('done')
}

function onTrigger(id: ClientActionId): void {
  action.reset()
  reason.value = ''
  confirmMismatch.value = false
  activeAction.value = id
}

function onUpdateReason(value: string): void {
  reason.value = value
  confirmMismatch.value = false
}

function onConfirm(): void {
  const id = activeAction.value
  if (!id) return
  // Type-to-confirm gate: delete only runs when the typed value equals the client_id.
  if (CLIENT_ACTIONS[id].confirmByClientId && reason.value.trim() !== props.client.client_id) {
    confirmMismatch.value = true
    return
  }
  void execute(id)
}

function onCancel(): void {
  activeAction.value = null
  reason.value = ''
  confirmMismatch.value = false
  action.reset()
}
</script>

<template>
  <section class="client-actions" data-testid="client-lifecycle-actions">
    <h3 class="client-actions__title">{{ t('clients.lifecycle_title') }}</h3>
    <p class="client-actions__impact">{{ t('clients.lifecycle_impact') }}</p>

    <p v-if="!hasAnyAction" class="client-actions__none">{{ t('clients.actions_none') }}</p>

    <div v-if="hasAnyAction" class="client-actions__buttons" role="group">
      <UiButton
        v-for="id in visibleActions"
        :key="id"
        :data-action="id"
        :variant="CLIENT_ACTIONS[id].danger ? 'danger' : 'secondary'"
        :disabled="!isApplicable(id) || action.isSubmitting.value"
        @click="onTrigger(id)"
      >
        {{ t(`clients.${BTN_KEY[id]}`) }}
      </UiButton>
    </div>

    <PrivilegedActionDialog
      :open="activeAction !== null"
      :title="dialogTitle"
      :description="dialogDescription"
      :danger="activeDescriptor?.danger ?? false"
      :reason-label="reasonLabel"
      :reason-required="(activeDescriptor?.reason?.required ?? false) || activeDescriptor?.confirmByClientId === true"
      :reason-min="activeDescriptor?.confirmByClientId ? 1 : activeDescriptor?.reason?.min"
      :reason-max="activeDescriptor?.reason?.max ?? 255"
      :reason="reason"
      :submitting="action.isSubmitting.value"
      :step-up-url="action.stepUpUrl.value"
      :step-up-label="t('clients.btn_step_up')"
      :error-message="dialogError"
      :request-id="action.requestId.value"
      @update:reason="onUpdateReason"
      @confirm="onConfirm"
      @cancel="onCancel"
    />
  </section>
</template>

<style scoped>
.client-actions {
  display: grid;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--border);
}
.client-actions__title {
  margin: 0;
  font: 600 0.9375rem/1.2 var(--font-sans);
  color: var(--fg);
}
.client-actions__impact {
  margin: 0;
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--fg-2);
}
.client-actions__none {
  margin: 0;
  font: 400 0.875rem/1.5 var(--font-sans);
  color: var(--fg-3);
}
.client-actions__buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
</style>
```

   ponytail: the reused `PrivilegedActionDialog` exposes only a single `reason` field and gates its confirm button on reason length, so for `delete` the type-to-confirm reuses that field (`reasonMin:1`) and the **exact** `client_id` match is enforced in `onConfirm` (mismatch → `clients.delete_confirmation_error`, dialog stays open, no API). This is the lazy-correct path: no new dialog variant, the destructive button is disabled until the field is non-empty, and a wrong value never reaches the API. Contract pinned: a mismatch is an **inline error with the dialog kept OPEN and no API call** (not a disabled-on-mismatch button), so a wrong `client_id` is rejected client-side before any backend call — asserted by the "stays open / not toHaveBeenCalled" delete spec. `--danger` red appears solely on the `variant="danger"` lifecycle buttons + the danger dialog (Swiss: red = destructive only, always with a text label).

9. [ ] **Run it — expect PASS:**

```bash
npm run test -- app/components/clients/__tests__/ClientLifecycleActions.spec.ts
```
Expected: gating / applicability / confirm-cancel / activate-empty-payload / disable-reason / delete-type-to-confirm / all six failure-matrix cases + step-up url green.

10. [ ] **RED → GREEN — wire into the detail page.** Extend `app/pages/__tests__/clients-detail.page.nuxt.spec.ts` (mock `useClientDetail` returning a masked `ready` client + a `refresh` spy; mock the session store `hasPermission` true for both perms; `mockNuxtImport('navigateTo', …)`) to assert the surface mounts on `ready`, `done` triggers `refresh`, `deleted` navigates to the list, and no `client_secret` is serialized:

```ts
  it('mounts the lifecycle actions and refreshes detail after a successful action', async () => {
    const refresh = vi.fn<() => Promise<void>>()
    mockClientDetail({ client: maskedClient, viewState: 'ready', refresh })
    mockSession({ hasPermission: () => true })
    const wrapper = await mountSuspended(ClientDetailPage)
    const actions = wrapper.findComponent({ name: 'ClientLifecycleActions' })
    expect(actions.exists()).toBe(true)
    actions.vm.$emit('done')
    await wrapper.vm.$nextTick()
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('navigates back to the clients list after a successful delete', async () => {
    mockClientDetail({ client: maskedClient, viewState: 'ready', refresh: vi.fn<() => Promise<void>>() })
    mockSession({ hasPermission: () => true })
    const wrapper = await mountSuspended(ClientDetailPage)
    wrapper.findComponent({ name: 'ClientLifecycleActions' }).vm.$emit('deleted')
    await wrapper.vm.$nextTick()
    expect(navigateToMock).toHaveBeenCalledWith({ name: 'admin.clients' })
  })

  it('never serializes a client_secret into the SSR HTML', async () => {
    mockClientDetail({ client: maskedClient, viewState: 'ready', refresh: vi.fn<() => Promise<void>>() })
    mockSession({ hasPermission: () => true })
    const html = (await mountSuspended(ClientDetailPage)).html()
    expect(html).not.toMatch(/client_secret|clientSecret/i)
  })
```

   where the top of the spec declares the navigate spy via the Nuxt auto-import:

```ts
const navigateToMock = vi.fn<(...args: unknown[]) => Promise<void> | void>()
mockNuxtImport('navigateTo', () => navigateToMock)
```

   Then mount the surface in the lifecycle tab of `app/pages/clients/[clientId].vue`'s `ready` branch and wire the page callback:

```vue
<ClientLifecycleActions :client="client" @done="refresh" @deleted="onDeleted" />
```

```ts
const { client, refresh } = useClientDetail(() => route.params.clientId as string)
function onDeleted(): void {
  void navigateTo({ name: 'admin.clients' })
}
```

   `ClientLifecycleActions` is auto-imported (Nuxt components dir).

11. [ ] **Run it — expect PASS:**

```bash
npm run test -- app/pages/__tests__/clients-detail.page.nuxt.spec.ts
```
Expected: the existing read-only detail cases (Task 5.8) plus the three new cases green; no `client_secret` match.

12. [ ] **REFACTOR.** Confirm no duplicated label/branch logic crept in: the confirm copy comes from the `confirm_<id>_title/desc` convention (no per-action hardcoded strings), the failure copy comes from `usePrivilegedAction` state only, and `--danger` red appears solely on the `variant="danger"` buttons + the danger dialog. Re-run the touched suites:

```bash
npm run test -- app/lib/clients/__tests__/client-actions.spec.ts app/components/clients/__tests__/ClientLifecycleActions.spec.ts app/pages/__tests__/clients-detail.page.nuxt.spec.ts
```
Expected: all green.

13. [ ] **Commit** (green only):

```bash
git add app/lib/clients/client-actions.ts \
        app/lib/clients/__tests__/client-actions.spec.ts \
        app/components/clients/ClientLifecycleActions.vue \
        app/components/clients/__tests__/ClientLifecycleActions.spec.ts \
        app/pages/clients/\[clientId\].vue \
        app/pages/__tests__/clients-detail.page.nuxt.spec.ts \
        app/locales/id.json app/locales/en.json
git commit -m "$(cat <<'EOF'
feat(sso-admin-frontend): wire client lifecycle/destructive actions into detail page

Add a descriptor-driven ClientLifecycleActions surface over the reused
privileged-action infra: activate, disable, decommission, and permanent delete,
each gated by clients-write AND sessions-terminate, applicable only to the
client's current status, confirmed with an impact summary plus an optional
reason (disable/decommission) or a type-to-confirm client_id (delete) and a
step-up notice. Activate/disable/decommission refresh detail on success; delete
navigates back to the list. The full failure matrix (incl. client_integration
422 and seeded-403) surfaces safe copy + a redacted reference with no stale
state. ReasonPolicy/isReasonValid are reused from the generic users helper.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Task-scoped DoD** (run from `services/sso-admin-frontend`; report any blocked command explicitly, never claim PASS for a command that did not run):

```bash
npm run typecheck && npm run lint && npm run format:check && npm run test && npm run build
```

---

### Task 5.14: Extend the SSR token-leak gate + Clients e2e + full DoD

Prove the **client list + detail DTOs** are leak-safe in the SSR payload, prove the freshly-issued **client secret** never has an SSR path, add the required Clients Playwright e2e (incl. the one-time-secret display), then run the complete Definition-of-Done gate. The leak fixture (`test/fixtures/ssr-leak`) is a Nuxt **layer over the real app**: after Phase 4 its `server/routes/api/admin/me.get.ts` grants the sentinel principal the *users* permissions only, so `/clients` and `/clients/[clientId]` would render `forbidden`. Grant the sentinel principal the clients permissions, add masked list + detail fixture routes (plus the two extra routes the clients composables fan out to during SSR — `client-integrations/registrations` and `scopes` — so both pages reach their `ready` state), extend `collectSecretLeaks` with a `client_secret`/`clientSecret` field-name check + a client-secret sentinel value, add `fetchClientsList()`/`fetchClientDetail()` render helpers + their `.toEqual([])` assertions, then write the Nuxt-4 `e2e/clients.spec.ts` and run the full gate.

**Design decision — why no secret value is injected into the detail fixture (read first):** the client list + detail DTOs carry **only** `has_secret_hash` (boolean), never a secret value or a `client_secret`/`clientSecret` field — that is the whole masked-DTO invariant from Task 5.1. `useClientDetail` (Task 5.5, copy of `useUserDetail`) returns the **raw** `clientsApi.show()` response as its `useAsyncData` data, so anything the fixture puts on `client.*` is serialized verbatim into `__NUXT_DATA__`. Therefore a `client_secret` planted in the detail fixture would genuinely leak (it has no page-side stripping path — unlike the user-detail session id, which the page rewrites to `formatTechnicalPreview` → `REF-`). The plaintext secret has **no SSR path by design**: it arrives only as the body of a client-initiated `POST` (create-confidential / rotate-secret), never via hydration. So the SSR gate proves the secret never leaks by (a) the masked fixtures carrying only `has_secret_hash`, and (b) the extended `collectSecretLeaks` standing as a regression tripwire on both the secret **value** (`SENTINEL.clientSecret`) and the **field names** (`client_secret`/`clientSecret`) across HTML + payload — the same philosophy the existing token-name regex already uses. The live one-time reveal → copy → clear behaviour is proven instead by `e2e/clients.spec.ts` (browser, client-side POST).

**Files**
- Modify: `test/fixtures/ssr-leak/sentinels.ts` (add a `clientSecret` sentinel VALUE to `SENTINEL` — never re-declare the existing fields)
- Modify: `test/fixtures/ssr-leak/server/routes/api/admin/me.get.ts` (grant the sentinel principal `admin.clients.read`/`admin.clients.write`/`admin.sessions.terminate` + a `clients` menu, **keeping** the existing dashboard/users/roles grants so the dashboard + users gate assertions stay green)
- Create: `test/fixtures/ssr-leak/server/routes/api/admin/clients/index.get.ts` (masked `ClientListResponse` — `has_secret_hash` only, no secret)
- Create: `test/fixtures/ssr-leak/server/routes/api/admin/clients/[clientId].get.ts` (masked `ClientDetailResponse` — `has_secret_hash: true`, no secret value, no `client_secret` field)
- Create: `test/fixtures/ssr-leak/server/routes/api/admin/client-integrations/registrations.get.ts` (`{ registrations: [] }` — **required**: `useClientsList` runs `list()` + `registrations()` in one `Promise.all`; if `registrations` 404s through the catch-all proxy the whole `useAsyncData` rejects and `/clients` renders `error`, not `ready`)
- Create: `test/fixtures/ssr-leak/server/routes/api/admin/scopes.get.ts` (`{ scopes: [] }` — for a deterministic detail render; `useScopeCatalog` fails closed to `[]`, but stubbing keeps the payload deterministic, mirroring the Phase-4 roles fixture; beyond the skeleton's listed Produces, required for a clean `ready` render)
- Modify: `test/ssr-token-leak.gate.spec.ts` (extend `collectSecretLeaks`; add `fetchClientsList()`/`fetchClientDetail()` + their `.toEqual([])` assertions)
- Create (replace the legacy SPA file): `e2e/clients.spec.ts` (nav · forbidden · create→one-time-secret modal→copy→close · rotate-secret→modal→clear · lifecycle disable)
- (Verify green) the full service DoD gate

**Interfaces**
- Produces:
  - extended `collectSecretLeaks` in `test/ssr-token-leak.gate.spec.ts` — additionally reports `SENTINEL.clientSecret` (value) and any `client_secret`/`clientSecret` (field name)
  - `fetchClientsList()`/`fetchClientDetail()` SSR-render helpers + their two `.toEqual([])` assertion blocks (HTML + `__NUXT_DATA__`)
  - `SENTINEL.clientSecret` added to `test/fixtures/ssr-leak/sentinels.ts`
  - the four fixture routes above (masked/safe DTOs only)
  - `e2e/clients.spec.ts` (nav · forbidden · create one-time-secret modal+copy+close · rotate one-time-secret modal+clear · disable)
- Consumes: `collectSecretLeaks`/`collectPiiShapeLeaks`/`extractPayload`/`SENTINEL`/`SSR_LEAK_CANARY` (`test/fixtures/ssr-leak/*` + the gate spec); the clients pages (Tasks 5.7/5.8/5.10) + the action components (5.11/5.12/5.13) built earlier; `@nuxt/test-utils/e2e` + the Playwright harness. Mirror template: the Phase-4 users-page gate tests + `e2e/users.spec.ts`.

**Background (load-bearing facts, verified against the codebase):**
- `admin-guard.global.ts` enforces `hasEveryPermission(meta.permissions)`. Both `/clients` and `/clients/[clientId]` declare `permissions: ['admin.clients.read']`, so `me.get.ts` must carry `admin.clients.read` or both pages render `/forbidden`.
- `useClientsList` (Task 5.5) fans out to `clientsApi.list()` (`GET /api/admin/clients`) **and** `clientsApi.registrations()` (`GET /api/admin/client-integrations/registrations`) inside one `useAsyncData`. Both must resolve during SSR or the list page renders `error`.
- The fixture catch-all `server/routes/api/admin/[...].ts` proxies to the (unreachable) backend; a more-specific route file wins. New routes are picked up automatically by the subprocess pre-build in `test/globalSetup.ts`; the gate runs `setup({ build: false })` against `.output`.
- `collectPiiShapeLeaks` greps **word-bounded** 16/18/10-digit runs — keep every fixture value's longest digit run < 10 (ISO timestamps and short numeric ids are safe; do not introduce a 10+ digit run).
- The gate uses single-argument `expect(value).toEqual([])` (oxlint `jest/valid-expect` bans `expect(value, message)`); `setup()` is called directly inside the `async describe` callback, never in `beforeAll`.

**Steps**

1. [ ] Add the client-secret sentinel value. In `test/fixtures/ssr-leak/sentinels.ts`, add one field to the `SENTINEL` object (a distinctive non-secret placeholder whose only job is to be detectable if it ever leaks):

```ts
export const SENTINEL = {
  // OIDC token VALUES — must live only in Nitro event.context, never serialized.
  access: 'SENTINEL-ACCESS-TOKEN-3f9a2c7d1e',
  refresh: 'SENTINEL-REFRESH-TOKEN-8b1d6e0a4c',
  id: 'SENTINEL-ID-TOKEN-5c2f9a8b3d',
  sid: 'SENTINEL-SID-7e4a1b9c0d',
  // Plaintext client secret VALUE — exists only on a client-side create/rotate POST
  // response, NEVER on event.context and NEVER in a list/detail DTO. The gate proves
  // it never reaches SSR HTML / the payload (regression tripwire).
  clientSecret: 'SENTINEL-CLIENT-SECRET-2a7f4b1e9c',
  // Raw government PII VALUES, shaped EXACTLY like real identifiers.
  nik: '3174091987654321', // 16 digits (NIK)
  nip: '198509152023011007', // 18 digits (NIP)
  nisn: '0098123456', // 10 digits (NISN)
} as const
```

2. [ ] Extend `collectSecretLeaks` in `test/ssr-token-leak.gate.spec.ts`. After the existing token-value / token-name / PII-value / canary / secret-name reports (right before `return leaks`), add the client-secret value + field-name checks:

```ts
  // Plaintext client-secret VALUE (one-time secret — never on the SSR path).
  reportContains(SENTINEL.clientSecret, 'leaks the client-secret value')
  // Client-secret + rotate-response plaintext field NAMES (snake_case wire +
  // camelCase shapes). The masked list/detail DTOs carry only `has_secret_hash`,
  // never these names; `client_id` and `has_secret_hash` are deliberately NOT matched.
  reportMatches(/client_secret|clientSecret|plaintext_secret|plaintext_once/, 'leaks a client-secret field name')
```

(No code change is needed to `collectPiiShapeLeaks`; the client DTOs carry no government identifiers.)

3. [ ] Grant the sentinel principal the clients permissions. In `test/fixtures/ssr-leak/server/routes/api/admin/me.get.ts`, replace the `permissions` block with the merged set (keep `subject_id`/`email`/`display_name`/`role`/`auth_context` and the existing dashboard/users/roles grants unchanged so the dashboard + users gate assertions stay green):

```ts
      permissions: {
        view_admin_panel: true,
        manage_sessions: true,
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
        ],
      },
```

4. [ ] Create the masked list fixture `test/fixtures/ssr-leak/server/routes/api/admin/clients/index.get.ts` (FULL code) — a `ClientListResponse` carrying only `has_secret_hash`, no secret:

```ts
// SSR token-leak fixture: a representative MASKED OAuth-client list so the §3.3
// gate can render /clients in its READY state and the payload collectors cover the
// masked AdminClientListItem DTO. The confidential client exposes only
// `has_secret_hash: true` — NEVER a secret value, NEVER a client_secret field. No
// digit run reaches 10, so collectPiiShapeLeaks stays clean. A more-specific route
// wins over the layer's catch-all server/routes/api/admin/[...].ts.
import { defineEventHandler } from 'h3'

export default defineEventHandler(() => ({
  clients: [
    {
      client_id: 'acme-portal',
      display_name: 'Acme Portal',
      type: 'confidential',
      environment: 'live',
      app_base_url: 'https://acme.example.test',
      redirect_uris: ['https://acme.example.test/auth/callback'],
      post_logout_redirect_uris: ['https://acme.example.test/auth/logout'],
      allowed_scopes: ['openid', 'profile', 'email'],
      backchannel_logout_uri: 'https://acme.example.test/auth/backchannel/logout',
      backchannel_logout_internal: false,
      owner_email: 'ops@acme.example.test',
      provisioning: 'jit',
      status: 'active',
      category: 'kepegawaian',
      has_secret_hash: true,
    },
  ],
}))
```

5. [ ] Create the masked detail fixture `test/fixtures/ssr-leak/server/routes/api/admin/clients/[clientId].get.ts` (FULL code) — a `ClientDetailResponse` with `has_secret_hash: true` and **no** secret value / `client_secret` field (see the design decision above):

```ts
// SSR token-leak fixture: a representative MASKED OAuth-client detail so the §3.3
// gate can render /clients/[clientId] in its READY state. It carries only
// `has_secret_hash: true` plus secret TIMESTAMPS (rotated/expires) — NEVER the
// plaintext secret and NEVER a client_secret field: the masked-DTO invariant
// (Task 5.1) keeps the secret off the SSR path entirely, and useClientDetail
// serializes this response verbatim into __NUXT_DATA__, so anything placed on
// client.* would genuinely leak. No digit run reaches 10.
import { defineEventHandler } from 'h3'

export default defineEventHandler((event) => {
  const clientId = (event.context.params?.clientId as string | undefined) ?? 'acme-portal'
  return {
    client: {
      client_id: clientId,
      display_name: 'Acme Portal',
      type: 'confidential',
      environment: 'live',
      app_base_url: 'https://acme.example.test',
      redirect_uris: ['https://acme.example.test/auth/callback'],
      post_logout_redirect_uris: ['https://acme.example.test/auth/logout'],
      allowed_scopes: ['openid', 'profile', 'email'],
      backchannel_logout_uri: 'https://acme.example.test/auth/backchannel/logout',
      backchannel_logout_internal: false,
      owner_email: 'ops@acme.example.test',
      provisioning: 'jit',
      status: 'active',
      category: 'kepegawaian',
      has_secret_hash: true,
      activated_at: '2026-06-01T00:00:00Z',
      disabled_at: null,
      secret_rotated_at: '2026-06-01T00:00:00Z',
      secret_expires_at: '2026-12-01T00:00:00Z',
    },
  }
})
```

6. [ ] Create the registrations fixture `test/fixtures/ssr-leak/server/routes/api/admin/client-integrations/registrations.get.ts` (FULL code) so `useClientsList`'s parallel `registrations()` call resolves during SSR instead of rejecting through the catch-all proxy:

```ts
// SSR token-leak fixture: empty masked staged-registration list so
// useClientsList's parallel clientsApi.registrations() resolves deterministically
// during the gate render rather than rejecting against the unreachable backend.
// No token/secret/PII.
import { defineEventHandler } from 'h3'

export default defineEventHandler(() => ({ registrations: [] }))
```

7. [ ] Create the scopes fixture `test/fixtures/ssr-leak/server/routes/api/admin/scopes.get.ts` (FULL code) for a deterministic detail render (`useScopeCatalog` fails closed to `[]`, so this is determinism, not correctness — mirrors the Phase-4 roles fixture):

```ts
// SSR token-leak fixture: empty masked scope catalog so useScopeCatalog resolves
// deterministically during the gate render rather than failing closed against the
// unreachable backend. No token/secret/PII.
import { defineEventHandler } from 'h3'

export default defineEventHandler(() => ({ scopes: [] }))
```

8. [ ] Add the `fetchClientsList()`/`fetchClientDetail()` helpers to `test/ssr-token-leak.gate.spec.ts`, after the existing `fetchUserDetail` helper:

```ts
function fetchClientsList(): Promise<string> {
  return $fetch('/clients')
}

function fetchClientDetail(): Promise<string> {
  return $fetch('/clients/acme-portal')
}
```

9. [ ] Add four `it` blocks inside the same `describe` (after the users-page blocks). Note: the clients DTOs carry **no** session id, so these use the strict (default) `collectSecretLeaks` — `allowSessionId` is NOT set. The last block is a **negative control** that proves the tripwire actually fires (so the `.toEqual([])` assertions above are not vacuously green):

```ts
  it('renders the clients list + detail server-side in their ready (masked) state', async () => {
    const listHtml = await fetchClientsList()
    expect(listHtml).toContain('data-admin-shell')
    expect(listHtml).toContain('Acme Portal')

    const detailHtml = await fetchClientDetail()
    expect(detailHtml).toContain('data-admin-shell')
    expect(detailHtml).toContain('Acme Portal')
    // The public client_id is allowed to render (it is a public identifier, not a secret).
    expect(detailHtml).toContain('acme-portal')
  })

  it('does not leak token/secret/PII values into the clients-page SSR HTML', async () => {
    const listHtml = await fetchClientsList()
    const detailHtml = await fetchClientDetail()
    expect(collectSecretLeaks(listHtml, 'clients-list SSR HTML')).toEqual([])
    expect(collectSecretLeaks(detailHtml, 'client-detail SSR HTML')).toEqual([])
  })

  it('does not leak token/secret/PII values into the clients-page hydration payload', async () => {
    for (const html of [await fetchClientsList(), await fetchClientDetail()]) {
      const serialized = JSON.stringify(JSON.parse(extractPayload(html)))
      expect(collectSecretLeaks(serialized, 'clients __NUXT__ payload')).toEqual([])
      expect(collectPiiShapeLeaks(serialized, 'clients __NUXT__ payload')).toEqual([])
    }
  })

  it('collectSecretLeaks is LIVE — it reports a planted client secret (negative control)', () => {
    // Tripwire self-test: prove the detector is not vacuously green. A payload that
    // embeds the sentinel secret value AND a client_secret field name MUST be
    // reported — otherwise the `.toEqual([])` assertions above could pass even with
    // a broken detector.
    const planted = `{"client":{"client_secret":"${SENTINEL.clientSecret}"}}`
    expect(collectSecretLeaks(planted, 'negative control')).not.toEqual([])
  })
```

10. [ ] Run the gate — expect **FAIL** at first: on a stale `.output` the new fixture routes 404 → `/clients` renders `error` (rejected `registrations`) and `/clients/acme-portal` renders `forbidden`/`error` → `Acme Portal`/`acme-portal` are absent → the new positive-assertion `it` block fails:
    `npm run test -- test/ssr-token-leak.gate.spec.ts`

11. [ ] Confirm `test/globalSetup.ts` rebuilt the fixture layer (the lock dir is removed on teardown, so the next run rebuilds fresh and picks up the new routes), then re-run — expect **PASS** (both pages render `ready`; no token/secret/PII-shape, no client-secret value or field name, in HTML or payload):
    `npm run test -- test/ssr-token-leak.gate.spec.ts`

12. [ ] Commit the gate extension:
    `git add test/fixtures/ssr-leak/sentinels.ts test/fixtures/ssr-leak/server/routes/api/admin/me.get.ts test/fixtures/ssr-leak/server/routes/api/admin/clients/ test/fixtures/ssr-leak/server/routes/api/admin/client-integrations/ test/fixtures/ssr-leak/server/routes/api/admin/scopes.get.ts test/ssr-token-leak.gate.spec.ts && git commit -m "$(printf 'test(sso-admin-frontend): extend SSR leak gate to the client list + detail DTOs + client-secret\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"`

13. [ ] Write `e2e/clients.spec.ts` (FULL replacement of the legacy SPA file). Covers the five required flows (quality §11 / design §9): critical navigation, forbidden flow, **create with one-time secret display + copy + close**, **rotate-secret display + clear**, and lifecycle disable. Every `vi.fn`-style stub is a Playwright route (no Vitest mocks here). Selectors use the standard labels shipped by Tasks 5.7/5.8/5.10/5.12/5.13 (the e2e runs last, so the pages exist); if a label drifts, fix the **selector** to match the shipped standard label, never the page. The one-time secret value below is a throwaway test token, never a real credential:

```ts
import { expect, test } from '@playwright/test'

// useI18n resolves locale from the `admin_locale` cookie at SSR time (DEFAULT_LOCALE='id');
// Playwright's `locale:'en-US'` only sets Accept-Language, which useI18n ignores. Set the
// cookie on the context so SSR renders English and the English-label selectors below match.
test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: 'admin_locale', value: 'en', url: baseURL! }])
})

// Full-capability admin principal (clients read + write + sessions.terminate for lifecycle).
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
      manage_sessions: true,
      permissions: [
        'admin.dashboard.view',
        'admin.clients.read',
        'admin.clients.write',
        'admin.sessions.terminate',
      ],
      capabilities: {
        'admin.dashboard.view': true,
        'admin.clients.read': true,
        'admin.clients.write': true,
        'admin.sessions.terminate': true,
      },
      menus: [
        { id: 'dashboard', label: 'Dashboard', required_permission: 'admin.dashboard.view', visible: true },
        { id: 'clients', label: 'Clients', required_permission: 'admin.clients.read', visible: true },
      ],
    },
  },
}

// Read-only admin principal WITHOUT admin.clients.read (forbidden-flow case).
const principalNoClients = {
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

const client = {
  client_id: 'acme-portal',
  display_name: 'Acme Portal',
  type: 'confidential',
  environment: 'live',
  app_base_url: 'https://acme.example.test',
  redirect_uris: ['https://acme.example.test/auth/callback'],
  post_logout_redirect_uris: ['https://acme.example.test/auth/logout'],
  allowed_scopes: ['openid', 'profile', 'email'],
  backchannel_logout_uri: 'https://acme.example.test/auth/backchannel/logout',
  backchannel_logout_internal: false,
  owner_email: 'ops@acme.example.test',
  provisioning: 'jit',
  status: 'active',
  category: 'kepegawaian',
  has_secret_hash: true,
  activated_at: '2026-06-01T00:00:00Z',
  disabled_at: null,
  secret_rotated_at: '2026-06-01T00:00:00Z',
  secret_expires_at: '2026-12-01T00:00:00Z',
}

const ONE_TIME_SECRET = 'oncesecret-e2e-acme-portal'

async function mockMe(page, body) {
  await page.route('**/api/admin/me', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) })
  })
}

async function mockClientsData(page) {
  await page.route('**/api/admin/clients', async (route) => {
    if (route.request().method() !== 'GET') return route.continue()
    await route.fulfill({
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-clients-e2e' },
      body: JSON.stringify({ clients: [client] }),
    })
  })
  await page.route('**/api/admin/client-integrations/registrations', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ registrations: [] }) })
  })
  await page.route('**/api/admin/clients/acme-portal', async (route) => {
    if (route.request().method() !== 'GET') return route.continue()
    await route.fulfill({
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-clients-e2e' },
      body: JSON.stringify({ client }),
    })
  })
  await page.route('**/api/admin/scopes', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        scopes: [
          { name: 'openid', description: 'OpenID', claims: ['sub'], default_allowed: true },
          { name: 'profile', description: 'Profile', claims: ['name'], default_allowed: true },
          { name: 'email', description: 'Email', claims: ['email'], default_allowed: true },
        ],
      }),
    })
  })
}

test('critical navigation: clients list to deep-linked detail, no token leak', async ({ page }) => {
  await mockMe(page, principal)
  await mockClientsData(page)

  await page.goto('/clients')
  await expect(page.getByRole('navigation', { name: 'Admin modules' })).toContainText('Clients')
  await expect(page.getByText('Acme Portal')).toBeVisible()
  // The folio client_id (a public identifier) renders.
  await expect(page.getByText('acme-portal').first()).toBeVisible()

  await page.getByRole('link', { name: /Acme Portal/u }).click()
  await expect(page).toHaveURL(/\/clients\/acme-portal$/u)
  await expect(page.getByRole('heading', { name: /Acme Portal/u })).toBeVisible()
  await expect(page.getByText(/Bearer|access_token|client_secret|SQLSTATE/u)).toHaveCount(0)
})

test('forbidden flow: admin without admin.clients.read sees the safe forbidden surface', async ({ page }) => {
  await mockMe(page, principalNoClients)

  await page.goto('/clients')
  await expect(page).toHaveURL(/\/forbidden$/u)
  await expect(page.getByRole('navigation', { name: 'Admin modules' })).not.toContainText('Clients')
  await expect(page.getByText(/Bearer|access_token|client_secret|SQLSTATE/u)).toHaveCount(0)
})

test('create: confidential client shows the one-time secret once, copy works, gone after close', async ({ page }) => {
  await mockMe(page, principal)
  await mockClientsData(page)
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])

  await page.route('**/api/admin/client-integrations', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-create-e2e', 'cache-control': 'no-store' },
      body: JSON.stringify({ registration: { ...client }, plaintext_secret: ONE_TIME_SECRET }),
    })
  })

  await page.goto('/clients/new')
  await page.getByLabel('Display name').fill('Acme Portal')
  await page.getByLabel('Redirect URI').fill('https://acme.example.test/auth/callback')
  await page.getByLabel('Client type').selectOption('confidential')
  await page.getByLabel('Application category').selectOption('kepegawaian')
  await page.getByLabel('Allowed scopes').fill('openid profile email')
  await page.getByRole('button', { name: 'Create client' }).click()

  // The plaintext secret displays once, in the reveal modal.
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText(ONE_TIME_SECRET)).toBeVisible()

  // Copy action is tested.
  await dialog.getByRole('button', { name: /Copy Secret/u }).click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(ONE_TIME_SECRET)

  // Close clears it: the secret is gone from the DOM and we land on the detail route.
  await dialog.getByRole('button', { name: /Done/u }).click()
  await expect(page.getByText(ONE_TIME_SECRET)).toHaveCount(0)
  await expect(page).toHaveURL(/\/clients\/acme-portal$/u)
})

test('rotate-secret: shows the rotated secret once, cleared on close', async ({ page }) => {
  await mockMe(page, principal)
  await mockClientsData(page)

  await page.route('**/api/admin/clients/acme-portal/rotate-secret', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-rotate-e2e', 'cache-control': 'no-store' },
      body: JSON.stringify({
        rotation: {
          client_id: 'acme-portal',
          plaintext_once: ONE_TIME_SECRET,
          plaintext_secret: ONE_TIME_SECRET,
          rotated_at: '2026-06-28T12:00:00Z',
          expires_at: '2026-12-28T12:00:00Z',
        },
      }),
    })
  })

  await page.goto('/clients/acme-portal')
  // Security tab -> rotate -> confirm (PrivilegedActionDialog, step-up window).
  await page.getByRole('tab', { name: /Security/u }).click()
  await page.getByRole('button', { name: 'Rotate secret' }).click()
  await page.getByRole('button', { name: 'Confirm' }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText(ONE_TIME_SECRET)).toBeVisible()

  // Clear from screen: the rotated plaintext is gone from the DOM.
  await dialog.getByRole('button', { name: /Clear secret from screen|Done/u }).click()
  await expect(page.getByText(ONE_TIME_SECRET)).toHaveCount(0)
})

test('lifecycle: disable requires a reason + confirmation, then succeeds', async ({ page }) => {
  await mockMe(page, principal)
  await mockClientsData(page)

  let disableCalled = false
  await page.route('**/api/admin/client-integrations/acme-portal/disable', async (route) => {
    disableCalled = true
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-disable-e2e' },
      body: JSON.stringify({ registration: { ...client, status: 'disabled', disabled_at: '2026-06-28T12:30:00Z' } }),
    })
  })

  await page.goto('/clients/acme-portal')
  await page.getByRole('tab', { name: /Lifecycle/u }).click()
  await page.getByRole('button', { name: 'Disable client' }).click()

  const dialog = page.getByRole('dialog')
  // Impact summary visible before submit; confirm disabled until the reason is valid.
  await expect(dialog.getByText(/Impact summary/u)).toBeVisible()
  await dialog.getByRole('textbox').fill('Decommissioning the staging integration.')
  await dialog.getByRole('button', { name: 'Confirm' }).click()

  await expect.poll(() => disableCalled).toBe(true)
  await expect(page.getByText(/Bearer|access_token|client_secret|SQLSTATE/u)).toHaveCount(0)
})
```

14. [ ] Run the Clients e2e — expect **PASS** once the pages from 5.7/5.8/5.10/5.12/5.13 are built (this task runs last in the phase, so they exist). If a selector label drifts from the shipped component, fix the selector (not the page) to match the standard label:
    `npm run test:e2e -- e2e/clients.spec.ts`

15. [ ] Commit the e2e:
    `git add e2e/clients.spec.ts && git commit -m "$(printf 'test(sso-admin-frontend): Nuxt-4 Clients e2e (nav, forbidden, one-time secret, rotate, disable)\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"`

16. [ ] Run the **full Definition-of-Done gate** from `services/sso-admin-frontend` (each must PASS; if any command is blocked by the environment, report exactly which command and why — never claim PASS for a command that did not run):
    - `npm run typecheck`
    - `npm run lint`
    - `npm run format:check` (run `npm run format` first if it flags the new fixture/spec/e2e files, then re-check)
    - `npm run test`
    - `npm run build`
    - `npm run test:e2e`

17. [ ] If `format` rewrote any file in step 16, commit the formatting:
    `git add -A && git commit -m "$(printf 'style(sso-admin-frontend): format Clients phase test fixtures + e2e\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"`

**Task DoD (run from `services/sso-admin-frontend`):** `npm run typecheck && npm run lint && npm run format:check && npm run test && npm run build`, plus `npm run test:e2e` — all green (or any blocked command reported explicitly), with the SSR leak gate proving the client list + detail DTOs and the one-time client secret (value + `client_secret`/`clientSecret` field names) leak nothing into the SSR HTML or `__NUXT_DATA__`, and `e2e/clients.spec.ts` proving the one-time secret displays once, copies, and is gone after close/clear.

---

## Phase 5 Definition of Done

- [ ] DTO + pure resolvers (view-state/list-merge/create-form/secret) + service + proxy allow-list + composables + table/domain components + read-only detail + create page + edit/scope/rotate/lifecycle actions + one-time-secret reveal all implemented test-first (Tasks 5.1–5.14), each committed green.
- [ ] **Full gate green** from `services/sso-admin-frontend`: `npm run typecheck` (0 errors), `npm run lint` (0 errors), `npm run format:check`, `npm run test`, `npm run build` — all PASS (any blocked command reported explicitly, never claimed PASS).
- [ ] **SSR token-leak gate extended** to cover the client **list + detail** DTOs: masked DTOs only (`has_secret_hash` boolean, never a secret), with **no `client_secret`/`clientSecret` value or field name**, no access/refresh/ID token, session secret, raw PII, or raw backend exception in the SSR HTML or `__NUXT__`/`__NUXT_DATA__`; `collectSecretLeaks` carries a `client_secret` sentinel value + `client_secret`/`clientSecret` field-name check; `fetchClientsList()`/`fetchClientDetail()` assert `.toEqual([])`.
- [ ] **One-time-secret discipline verified**: the plaintext `client_secret` from create-confidential + rotate-secret displays once in a client-only component `ref` (never `useState`/Pinia/storage/query/hash), is cleared on modal close (absent from the DOM after close, proven by test), is never logged, the copy action is tested, and the responses carry `Cache-Control: no-store`; the legacy `rotationSecret`/`createdClientIntent` store persistence is not carried forward.
- [ ] **Privileged-action test matrix applied to every destructive/write action** (metadata edit, URI-policy edit, scope sync, rotate-secret, activate, disable, decommission, delete, create + stage): allowed/403/401/419/429/422/step-up(428)/5xx + no-stale-state, with destructive-confirm + per-feature permission tests, and **step-up enforced on rotate-secret and create** (`:step_up` freshness window) plus the `admin.clients.write` + `admin.sessions.terminate` gate on lifecycle actions.
- [ ] **id ↔ en locale parity** holds for the `clients.*` (and any touched `common.*`) catalogs — no parity drift; the existing `clients.*` namespace is reused (not the empty `client.*` singular), genuinely-new keys added to BOTH files.
- [ ] **Clients e2e flow green** (`npm run test:e2e -- e2e/clients.spec.ts`): nav, forbidden, masked list + detail, create/rotate one-time-secret display (shown once, copies, gone after close/clear), lifecycle with step-up.
- [ ] Swiss discipline upheld: tokens-only, hairline (no shadow), single accent `#002FA7`, `danger #E4002B` reserved for destructive/critical-security-status (with text label, never colour-alone), status never colour-alone, `--font-mono` only for raw IDs/correlation (the `client_id`; timestamps/counts use condensed-sans `UiFolio`).
- [ ] The `feat/admin-frontend-nuxt4-ssr-swiss-redesign` branch **stays off `main` until the Phase 18 cutover** — Phase 5 merges into the feature branch only.
