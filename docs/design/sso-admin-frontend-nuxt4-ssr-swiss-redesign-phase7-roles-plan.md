# Phase 7 — Roles (RBAC) Implementation Plan

**For agentic workers — REQUIRED SUB-SKILL:** Execute this plan with `superpowers:executing-plans`, and for **every** task below invoke `superpowers:test-driven-development` (RED → GREEN → REFACTOR). Never write implementation code before a failing test exists; never claim PASS without running the exact command and reading its output (`superpowers:verification-before-completion`).

## Goal

Port the admin **Roles** (RBAC) governance domain to the Nuxt 4 (full SSR) + Swiss stack on branch `feat/admin-frontend-nuxt4-ssr-swiss-redesign`. Roles is the operator console for the IdP's access-control model: the list of every role, the catalog of every permission, and — the **defining UI of this domain** — a dense, in-page **role × permission matrix** that distinguishes role, permission, and assignment. The single route `/roles` (`admin.roles.read`) hosts everything: the role list, the matrix, and the create / edit-metadata / sync-permissions / delete write surfaces.

The acceptance bar is **behavioral + visual parity** with the existing Vue-SPA Roles feature (`src/features/roles/`), **minus its anti-patterns** (the hard-coded `admin`/`user` allow-list filter is dropped — the SSR version renders **every** role the backend returns, sorted not filtered), implemented test-first.

Every Roles write is a **privileged, security-critical action**: editing a role's permissions (sync-permissions) changes access for **everyone holding the role**, so it carries a confirmation + an impact summary ("changes the permission set for N users holding this role") + the full `401/403/419/422/428/429/5xx` + fresh-auth/step-up matrix. **System / built-in roles (`is_system === true`) are protected in the UI** — no edit, no delete, no editable matrix cells. **Deleting a role is a higher-privilege action than create/update/sync** (double permission gate + step-up freshness). And **no token, secret, or raw PII may enter the SSR HTML or the `__NUXT__` hydration payload** — the roles DTOs carry only slugs, names, descriptions, and counts, so the SSR leak gate is extended to prove it.

This builds on the existing stub `app/pages/roles.vue` (`definePageMeta` name `admin.roles`, `permissions: ['admin.roles.read']`, already asserted in `app/pages/__tests__/route-map.spec.ts:55`), the existing `app/services/roles.api.ts` (`rolesApi.list()` only — **extended**, not replaced), and the existing `AdminRole` + `RolesResponse` types in `app/types/users.types.ts` (**extended**, not redefined). All data flows through the typed `rolesApi` service over `apiClient` (no direct `fetch`/`$fetch` in pages/components), wrapped in `useAsyncData` so it resolves server-side and hydrates as masked DTOs only.

## Architecture

Request/data flow (read paths server-side during SSR, re-used on client navigation; the writes are client-confirmed privileged flows):

```
pages/roles.vue
  ├─ useAsyncData('admin-roles-principal', () => sessionStore.ensureSession())   // safe masked principal
  ├─ useRolesList()        → useAsyncData('admin-roles-list', () => rolesApi.list())
  │     └─ rolesApi.list() → apiClient.get('/api/admin/roles')
  │           └─ Nitro server/routes/api/admin/[...].ts → handleAdminApiProxy
  │              (inject Bearer from event.context, rewrite /api/admin/* → /admin/api/*)
  ├─ usePermissionCatalog() → useAsyncData('admin-permissions', () => rolesApi.permissions())
  ├─ RolesTable.vue        (role list + CRUD entry points; #actions = edit / manage-permissions / delete, gated)
  ├─ RoleMatrix.vue        (THE role × permission matrix over UiDataList + UiSwitch/UiStatusBadge + UiFolio)
  │     └─ emits toggle(roleSlug, permissionSlug, granted) / save(roleSlug)
  ├─ RoleFormDialog.vue    (create + edit-metadata forms)
  │     └─ usePrivilegedAction() → rolesApi.store() / rolesApi.update()  → on success: useRolesList().refresh()
  └─ PrivilegedActionDialog.vue (Phase-4, reused as-is)
        ├─ sync permissions → usePrivilegedAction() → rolesApi.syncPermissions(slug, { permission_slugs })
        └─ delete role      → usePrivilegedAction() → rolesApi.destroy(slug)
              → on success: useRolesList().refresh()  (explicit, never stale)
```

- **Pure logic** (no Nuxt, no network) lives under `app/lib/roles/`: DTO-agnostic view-state + status-tone (`roles-view-state.ts`), client search/filter/pagination (`roles-list.ts`), the matrix grant-map + diff model that produces the sync payload + impact (`roles-matrix.ts`), and create/edit field validation (`role-form.ts`). This mirrors the Phase-4/5/6 pure-resolver split so the matrix and the grant-diff are unit-testable without a Nuxt context.
- **Service** `app/services/roles.api.ts` is the single network seam — **the existing object is extended** with `permissions`/`store`/`update`/`syncPermissions`/`destroy` (mirroring `clients.api.ts`, which has the exact `update`(PATCH) / `syncScopes`(PUT) / `delete`(DELETE) template for `update` / `syncPermissions` / `destroy`).
- **Composables** `app/composables/useRolesList.ts` (copy-and-adapt of `useUsersList.ts`) and `app/composables/usePermissionCatalog.ts` (copy-and-adapt of `useObservabilitySummary.ts`) wrap `useAsyncData`; `usePrivilegedAction` is **reused from Phase 4, not rebuilt**.
- **Components** under `app/components/roles/`: `RolesTable.vue` (role-list table over `UiDataList`, copy-and-adapt of `UsersTable.vue`), `RoleMatrix.vue` (the editable role × permission matrix over `UiDataList` + `UiSwitch`/`UiStatusBadge` + `UiFolio`), `RoleFormDialog.vue` (create/edit metadata over `UiDialog` + `UiFormField`). The destructive/async-confirm dialog is the Phase-4 `app/components/users/PrivilegedActionDialog.vue`, **reused as-is** (not copied into a roles path).
- **State surfaces** reuse the Swiss DS: `UiSkeleton` (loading), `UiStatusView` (forbidden / unauthenticated / error / step-up, with built-in request-ref redaction), `UiEmptyState` (no data), `UiStatusBadge` (system/custom role, granted/denied matrix cell — never colour-alone), `UiFolio` (role/permission counts, IDs as folio composition elements).
- **Backend stays the security boundary.** `admin-guard.global.ts` gates routes by role + meta permissions; the page additionally renders a safe forbidden/step-up surface if the backend rejects despite the UI.
- **Out of scope:** **`PUT /admin/api/users/{subjectId}/roles` (`syncUserRoles` — user→role assignment) is Phase-4 and already done; it is NOT in Phase-7 scope.** Phase 7 owns the role and permission *catalog* objects (list, permission catalog, role create/update/sync-permissions/delete) — assigning roles to a *user* stays on the Users domain. No server-side pagination/sort (`GET /roles` returns a flat `{ roles }` with no query params — search/filter/pagination are derived client-side over the hydrated list). No Pinia roles store (the legacy `admin-roles` store and its `supportedRoleOrder` filter anti-pattern are **not** carried forward — list state is `useAsyncData`-owned). The legacy custom modal-overlay markup, inline styles, and `any`-cast permission laundering are not carried forward.

## Tech Stack

- **Nuxt 4** (`ssr: true`, universal), **Vue 3.5** SFC, **TypeScript strict**.
- **Pinia** (`admin-session` store — existing; consumed read-only for principal + `hasPermission`/`hasEveryPermission`).
- **Data:** `useAsyncData` + typed `apiClient` over `$fetch`/`useRequestFetch` (`app/lib/api/api-client.ts`, `ApiError` with `status`/`code`/`requestId`/`payload`, `getLastRequestId()`).
- **UI:** Swiss DS components in `app/components/ui/*` + `app/components/form/*`, `lucide-vue-next` icons, Tailwind v4 + `assets/tokens.css` Swiss tokens. Reka UI keeps a11y primitives (`UiDialog`/`UiAlertDialog`).
- **i18n:** `app/composables/useI18n.ts` (`id` default, `en`), catalogs `app/locales/{id,en}.json` — a `roles.*` block is **already fully populated in BOTH** files (`en.json` 205–246, `id.json` 205–247: `eyebrow, title, summary, loading, forbidden_title, error_title, empty_title, empty_desc, list_title, matrix_title, matrix_desc, no_permissions, permissions_label, btn_create_role, create_role_title, edit_role_title, edit_permissions_title, btn_save, btn_cancel, label_name, label_slug, label_description, confirm_delete_title/desc, confirm_sync_permissions_title/desc, roles_create_success, roles_update_success, roles_delete_success, roles_permissions_success, btn_edit, btn_delete, btn_manage_permissions, system_role, custom_role, col_role, col_users, col_status, detail_desc, close_detail`; `confirm_*_desc` use `{target}` interpolation). **ADD only genuinely-new keys, to BOTH files** (e.g. a granted/denied a11y label, a per-column matrix header, the "N users affected" impact copy).
- **Tests:** Vitest 4 (`npm run test` = `vitest run`); `@nuxt/test-utils/runtime` (`mountSuspended`, `renderSuspended`, `mockNuxtImport`) for `*.nuxt.spec.ts` (auto-routed to the `nuxt` env by filename); `@vue/test-utils` + jsdom for plain `*.spec.ts`; `@nuxt/test-utils/e2e` for the SSR leak gate; Playwright for the e2e (`npm run test:e2e`). Every `vi.fn` carries a type parameter; service mocks use `vi.mock('@/services/roles.api', …)`; the SSR gate collects-then-`expect(value).toEqual([])` (no `expect(value, message)` — oxlint `jest/valid-expect`).

## Global Constraints

Binding values for every task. A task is **not done** if any is violated.

- **Full SSR** (`ssr: true`): principal + role list + permission catalog resolve **server-side** (no client bootstrap flash). `useAsyncData` settles before the payload is serialized.
- **SSR token-leak guard (design §3.3, mandatory — verbatim):** "Under universal SSR, server-fetched data is serialized into the page payload (`window.__NUXT__`). Tokens, session secrets, and raw PII must **never** enter the SSR HTML or the hydrated payload. Tokens live only in the Nitro request context (`event.context`), read per request from the encrypted session cookie and injected into upstream calls server-side. Only **safe, already-masked DTOs and safe principal fields** (display name, role, capability booleans, menus) hydrate to the client. A dedicated test gate asserts the SSR HTML + `__NUXT__` payload contain no token/secret/raw-PII patterns." **FORBIDDEN in SSR HTML / `__NUXT_DATA__`:** access/refresh/ID tokens (values + field names `accessToken|refreshToken|idToken|access_token|refresh_token|id_token`), session/client secrets, any credential; raw NIK(16)/NIP(18)/NISN(10) digit runs; raw backend exceptions; known secret env values; the `SSR_LEAK_CANARY`. **Allowed to hydrate:** safe already-masked DTOs (the role list + permission catalog — slugs, names, descriptions, counts only) and safe principal fields. The roles DTOs carry **no token/secret/PII**, so the standard strict checks apply (no `allowSessionId`). `test/ssr-token-leak.gate.spec.ts` is **extended** this phase (Task 7.11) to cover the roles HTML + hydration payload, mirroring the dashboard-summary extension in commit `f60ceb49`.
- **RBAC-matrix UI expectation (design §2 / standart §7.5, binding):** the matrix must **clearly distinguish role, permission, and assignment**; the missing-permission state must be **safe and not leak raw backend policy detail**; bulk assignment must show a **change summary before submit**. The matrix is realized as a dense **table** (`UiDataList`): rows = permissions (grouped by `category`), columns = roles, each editable cell a `UiSwitch` (read-only cells a `UiStatusBadge`). **Do NOT invent a bespoke grid** — `UiDataList` + `#cell(<role.slug>)` slot is the base.
- **Privileged-action rule (design §8 / standart §8, verbatim classes `write | destructive | export | one-time-secret | operational-evidence`):** every Roles write (create, update-metadata, sync-permissions, delete) MUST get the full treatment — "confirmation with impact summary; destructive primary disabled until confirmation valid; cancel calls no API; loading/disabled reset after error; fresh-auth/step-up/MFA-assurance state honored when backend requires it; audit/correlation evidence shown or stored appropriately." **Sync-permissions impact summary names the blast radius**: "changes the permission set for N users holding this role". **System / built-in role protection (extract-backend — `is_system === true` IS the protect-this-role flag; there is no separate `editable`/`locked` field):** when `is_system`, the UI hides Edit + Delete and renders that role's matrix column as **non-editable** (`UiStatusBadge` granted/denied, never a `UiSwitch`) — the backend `UpdateManagedRoleAction`/`DeleteManagedRoleAction` throw on system roles regardless, so this is UX minimization over an authoritative backend gate.
- **Step-up / freshness windows (extract-backend, binding):** every Roles route carries `EnsureAdminMfaAssurance` (MFA-assurance is on **100%** of read + write routes). `EnsureFreshAdminAuth` adds a freshness window on writes: create / update / sync-permissions use **`:write`** (short write-freshness); **delete uses `:step_up`** (stricter recent-reauth window). Stale auth → backend JSON error carrying `step_up_url`; the privileged-action matrix maps `428`/`412`/`reauth_required`/`step_up_required` → `step_up_required` and surfaces `stepUpUrl`. The UI surfaces step-up on 428 for create / update / sync-permissions / delete.
- **Privileged-action test matrix (TDD §4 — every write action; failing tests BEFORE implementation):** 4.1 allowed success · 4.2 missing permission / 403 · 4.3 unauthenticated / 401 · 4.4 CSRF or session expired / 419 (if applicable) · 4.5 rate limit / 429 · 4.6 validation error / 422 (field errors) · 4.7 fresh-auth / step-up / MFA-assurance required (**428**/412/`reauth_required`/`step_up_required`, surfaces `step_up_url`) · 4.8 backend 5xx with safe error copy · 4.9 audit/correlation id shown or stored when backend sends it · 4.10 action leaves **no** stale loading/disabled state after an error. Destructive/confirm tests: impact summary visible before submit · primary destructive button disabled until confirmation valid · cancel calls **no** API · success state shows no secret/PII excess. Per-feature permission matrix: unauthenticated → redirect/session-expired · non-admin → forbidden · admin w/o permission → forbidden/action hidden · admin w/ permission → usable · backend 403 despite UI → safe forbidden.
- **HTTP failure set (safe copy, never raw backend exception):** `401`, `403`, `419` (if applicable), `422`, `428` (step-up/Precondition-Required), `429`, `5xx`. Domain `422` codes from extract-backend: `role_management_failed` ("System role metadata cannot be modified.", "System roles cannot be deleted.", "Role still has assigned users."), `admin_action_failed` (generic), and Laravel field-error `{ message, errors }`; `404 not_found` for an unknown slug. Error surfaces show **safe copy + a redacted support reference** (`REF-XXXXXXXX` via `formatSupportReference`) + a request/correlation id when the backend sends it; raw request ids and raw exceptions are never rendered.
- **No browser token handling:** no access/refresh/ID token, secret, or credential is created, exchanged, read, stored, or logged in the browser. The SPA is token-blind; the Admin BFF (`admin-proxy.ts`) injects the Bearer server-side.
- **Same-origin session only:** admin calls use same-origin relative paths (`/api/admin/roles`, `/api/admin/permissions`, `/api/admin/roles/{slug}`, `/api/admin/roles/{slug}/permissions`) and the encrypted session cookie (`credentials:'include'`, `Accept: application/json`); no token headers minted in the browser.
- **No direct `fetch`/`$fetch` in pages or components** — the network is reached only through `rolesApi` (the service) via `apiClient`.
- **Swiss design discipline:** tokens-only (no hard-coded colours), **no shadows** as structure (1px hairline `--border #E5E5E7`), radius ~0–2px, **single accent `--accent #002FA7`** (interactive/brand), red `--danger #E4002B` used **only** as functional/destructive (delete role, and a denied/critical status when paired with a label) — **never** brand, never generic emphasis; the create/edit/sync confirm stays accent/warning, **only delete is danger red**; status **never colour-alone** (tone + label/shape via `UiStatusBadge`; matrix granted/denied cells encode state with shape/label, not colour alone). `--font-sans` (`'Söhne','Helvetica Neue',Helvetica,Arial,sans-serif`) is the single family; **`--font-mono` reserved ONLY for raw IDs/correlation values**. **Folio numerals (the §7.3 differentiator, must be visible in rendered output):** role/permission counts (`02 / 14`) and any ID columns render as condensed-sans folio composition elements anchored to a visible 1px hairline grid via `UiFolio` — the matrix counts and role-count evidence are the load-bearing folio surfaces. Standard labels/copy only ("Roles", "Permissions", "Save", "Cancel", "Delete") — no themed copy, mono-caps filler subtitles, `//` kickers, unicode-glyph icons (use Lucide), or fabricated personas; mock rows in tests read clearly as samples.
- **Permission-aware (route + nav + action):** page meta declares `permissions` per the route map; `admin-guard.global.ts` enforces role + permission (ensure principal, `hasAdminRole`, `hasEveryPermission`, redirect `/forbidden`; map bootstrap failures `mfa_enrollment_required → /mfa-required`, `step_up_required → /step-up-required`, unreachable → `/admin-api-unreachable`); the page also handles a backend `401/403/428` defensively. Action visibility is gated by `sessionStore.hasPermission(...)`. Permission strings follow the backend contract **verbatim** — never ad-hoc:

  | Path | Page | meta `permissions` | Write/destructive actions on the surface (permission · freshness window) |
  |---|---|---|---|
  | `/roles` | `pages/roles.vue` | `admin.roles.read` | create role (`admin.roles.write` · `:write`); update role metadata (`admin.roles.write` · `:write`); sync permissions (`admin.roles.write` · `:write`); **delete role (`admin.roles.write` AND `admin.sessions.terminate` + admin-session-management role · `:step_up`)** |

  Write affordances are gated on `admin.roles.write`. **Delete is the high-privilege exception**: extract-backend routes `DELETE /admin/api/roles/{role}` inside the session-management group, requiring `ROLES_WRITE` **AND** `SESSIONS_TERMINATE` **AND** `RequireAdminSessionManagementRole` **AND** `:step_up` freshness — so `canDelete = hasPermission('admin.roles.write') && hasPermission('admin.sessions.terminate')` (verify the exact `admin.sessions.terminate` capability key against the principal matrix; if absent, hide delete) and the backend re-checks regardless. Internal navigation uses **named route refs**, never hardcoded path strings.
- **Degraded/stale handling:** after any action, **explicitly refresh** the role list (never leave it stale); if a background refresh fails but a good snapshot exists, keep it on screen with a stale notice. The permission catalog and role list are independent fetches — a failing catalog degrades the matrix columns' permission labels, not the whole page.
- **No-traceability-markers:** new code must NOT contain `OG#`, `UC###`, `FR###`, `BE-FR###`-style identifiers in names, comments, routes, tests, or config — descriptive domain names only. The FR/UC references in any planning note are never source.
- **REUSE Phase-4/5/6 infrastructure — do NOT duplicate it (binding):** consume the existing infra **from its existing path as-is**, never copied into a `roles/` path:
  - `app/lib/users/privileged-action.ts` — `resolvePrivilegedActionFailure(error: unknown): PrivilegedActionFailure`, `PrivilegedActionStatus`, `PrivilegedActionFailure` (the pure HTTP-error→state matrix; step-up first on 428/412/`reauth_required`/`step_up_required`). Domain-agnostic despite the `users/` path — imported directly.
  - `app/composables/usePrivilegedAction.ts` — `usePrivilegedAction<T>(): { status, isSubmitting, failure, requestId, auditEventId, fieldErrors, stepUpUrl, run, reset }`. One instance per role action (create/update/sync/delete). `run(() => rolesApi.<mutation>(...))` returns the DTO on success or `null` on failure.
  - `app/components/users/PrivilegedActionDialog.vue` — the async-hold confirm dialog (parent owns `open`; confirm is NOT an `AlertDialogAction` and stays open through submit; renders only redacted `REF-…`). Used for sync-permissions (reasonless confirm + impact summary) and delete (danger, reasonless confirm). Create/edit use `RoleFormDialog.vue` + `usePrivilegedAction` directly (the form dialog is the confirm surface).
  All other reuse is **copy-and-adapt** of the named file (swap users/observability → roles): `useUsersList.ts` → `useRolesList.ts`; `useObservabilitySummary.ts` → `usePermissionCatalog.ts`; `users-list.ts` → `roles-list.ts`; `users-view-state.ts` → `roles-view-state.ts`; `UsersTable.vue` → `RolesTable.vue`; `users/index.vue` (all-states list shell) → `roles.vue`. Also reuse verbatim: DS components (`UiButton/UiInput/UiSelect/UiSwitch/UiTextarea/UiStatusBadge/UiDataList/UiDetailDrawer/UiDialog/UiAlertDialog/UiEmptyState/UiSkeleton/UiStatusView/UiFolio`, `UiFormField`), `apiClient` + `getLastRequestId` + `ApiError`, `resolveStatusTone` + `StatusTone` (`@/lib/status-tone`), `display-identifiers` (`formatSupportReference`/`formatTechnicalPreview`), the session store permission helpers, and the existing `roles.*` locale keys. **The Nitro proxy allow-list (`server/utils/admin-proxy.ts`) ALREADY contains every Phase-7 route** (`GET /api/admin/roles`, `GET /api/admin/permissions`, `POST /api/admin/roles`, `PATCH /api/admin/roles/{slug}`, `PUT /api/admin/roles/{slug}/permissions`, `DELETE /api/admin/roles/{slug}`) — **no proxy edit needed**; adding allow/deny assertions in `server/__tests__/admin-proxy.spec.ts` is optional belt-and-suspenders.
- **EXTEND the existing `rolesApi` + types — do NOT duplicate (binding):** add `permissions`/`store`/`update`/`syncPermissions`/`destroy` to the **same** `rolesApi` object in `app/services/roles.api.ts` (do not re-declare `rolesApi.list`); extend `AdminRole` + `RolesResponse` and add the new types **in `app/types/users.types.ts`** (do not create a parallel roles type module). `AdminRole`, `RolesResponse`, and `AssignRolesPayload` already exist there.
- **TDD:** RED → GREEN → REFACTOR per task; at least one assertion fails because the behaviour is missing (not a typo); commit only on green.
- **Definition-of-Done gate (run from `services/sso-admin-frontend`; report any blocked command explicitly, never claim PASS for a command that did not run):** `npm run typecheck && npm run lint && npm run format:check && npm run test && npm run build`, plus `npm run test:e2e` (the Roles route + matrix is critical governance UI — it qualifies). **`npm run lint` is `run-s lint:*` and runs BOTH `lint:oxlint` (`oxlint .`) AND `lint:eslint` (`eslint "src/**/*.vue" "app/**/*.vue" --cache`) — both must pass; a green oxlint with red eslint (or vice versa) is NOT done.**
- **Conventional commits**, each ending with the trailer:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

### Task 7.1: Roles DTO types (extend) + pure view-state / status-tone resolver

**Files**
- Edit: `app/types/users.types.ts` (extend in place — `AdminRole`/`RolesResponse`/`AssignRolesPayload` already exist at lines 146–168; the new types are appended after `RolesResponse`, the existing types are NOT redefined)
- Create: `app/lib/roles/roles-view-state.ts`
- Test: `app/lib/roles/__tests__/roles-view-state.spec.ts`

**Interfaces**
- Consumes:
  - `ApiError` from `@/lib/api/api-client` — constructor `new ApiError(status, message, code = null, payload = null, requestId = null)` (verified at `app/lib/api/api-client.ts:33-44`)
  - `StatusTone` + `resolveStatusTone` from `@/lib/status-tone` (`StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'brand' | 'neutral'`)
  - existing `AdminRole` + `RolesResponse` from `@/types/users.types` (do NOT redefine)
  - Mirrors Phase-4 `app/lib/users/users-view-state.ts` (error-first switch + `errorStatus` H3/ApiError extractor) and `resolveUserStatusTone`.
- Produces (`app/types/users.types.ts`, ADD — do not redefine `AdminRole`/`RolesResponse`):
  - `type AdminPermission = { readonly slug: string; readonly name: string; readonly description: string | null; readonly category: string | null }` — the `GET /permissions` catalog item. It carries `description`, unlike the inline `AdminRole.permissions[]` shape (`{ slug; name; category }`) which omits it. **Keep them distinct — do NOT replace the inline `AdminRole.permissions[]` element with `AdminPermission`.**
  - `type PermissionsResponse = { readonly permissions: readonly AdminPermission[] }`
  - `type CreateRolePayload = { readonly slug: string; readonly name: string; readonly description?: string | null; readonly permission_slugs?: readonly string[] }`
  - `type UpdateRolePayload = { readonly name?: string; readonly description?: string | null }`
  - `type SyncPermissionsPayload = { readonly permission_slugs: readonly string[] }`
  - `type RoleMutationResponse = { readonly role: AdminRole }`
  - `type RoleDeleteResponse = { readonly deleted: boolean; readonly role_slug: string }`
- Produces (`app/lib/roles/roles-view-state.ts`):
  - `type RolesViewState = 'loading' | 'unauthenticated' | 'forbidden' | 'error' | 'empty' | 'ready'`
  - `function isRolesEmpty(roles: readonly AdminRole[]): boolean`
  - `function resolveRolesViewState(args: { pending: boolean; error: unknown; roles: readonly AdminRole[] | null }): RolesViewState` — error-first: error with no prior snapshot → 401 `unauthenticated`, 403 `forbidden`, else `error`; then `roles === null` (unfetched) → `loading`; `[]` (empty) → `empty`; else `ready`.
  - `function resolveRoleStatusTone(isSystem: boolean): StatusTone` — system → `'info'`, custom → `'neutral'`.

**Deliverable:** typed roles DTO surface (extended, not duplicated) + a unit-tested pure view-state/status-tone resolver, with the masked-DTO invariant pinned at the boundary (`AdminRole`/`AdminPermission` carry no token/secret/raw-PII).

**Steps**

- [ ] **RED — write the failing pure test.** This task is pure logic (no Nuxt, no network), so the test is a plain `*.spec.ts`. Create `app/lib/roles/__tests__/roles-view-state.spec.ts` with the COMPLETE test below (asserts real behaviour: error-first ordering, `null` vs `[]` distinction, both status tones, and the masked-DTO invariant — the role/permission DTOs carry slugs/names/counts only, no token/secret/raw 16/18/10-digit PII run):

  ```ts
  import { describe, expect, it } from 'vitest'
  import { ApiError } from '@/lib/api/api-client'
  import {
    isRolesEmpty,
    resolveRoleStatusTone,
    resolveRolesViewState,
  } from '../roles-view-state'
  import type { AdminRole } from '@/types/users.types'

  // Sample roles — read clearly as fixtures. A role DTO is public governance
  // config: slug, name, description, counts, and the inline permission shape
  // (slug/name/category, NO description) — never a token, secret, or raw PII.
  const systemRole: AdminRole = {
    id: 1,
    slug: 'admin',
    name: 'Administrator',
    description: 'Built-in administrator role.',
    is_system: true,
    permissions: [
      { slug: 'admin.roles.read', name: 'Read roles', category: 'roles' },
      { slug: 'admin.roles.write', name: 'Write roles', category: 'roles' },
    ],
    user_count: 3,
    users_count: 3,
  }

  const customRole: AdminRole = {
    id: 2,
    slug: 'helpdesk',
    name: 'Helpdesk',
    description: null,
    is_system: false,
    permissions: [{ slug: 'admin.users.read', name: 'Read users', category: 'users' }],
    user_count: 12,
    users_count: 12,
  }

  describe('isRolesEmpty', () => {
    it('is true only for a zero-length list (no-data, distinct from forbidden)', () => {
      expect(isRolesEmpty([])).toBe(true)
      expect(isRolesEmpty([systemRole])).toBe(false)
    })
  })

  describe('resolveRolesViewState', () => {
    it('loading when roles are unfetched (null) and no error', () => {
      expect(resolveRolesViewState({ pending: true, error: null, roles: null })).toBe('loading')
    })
    it('maps a first-load 401 to unauthenticated', () => {
      expect(
        resolveRolesViewState({ pending: false, error: new ApiError(401, 'no session'), roles: null }),
      ).toBe('unauthenticated')
    })
    it('maps a first-load 403 to forbidden (distinct from empty)', () => {
      expect(
        resolveRolesViewState({ pending: false, error: new ApiError(403, 'forbidden'), roles: null }),
      ).toBe('forbidden')
    })
    it('maps other first-load errors to error (incl. H3-shaped statusCode)', () => {
      expect(
        resolveRolesViewState({ pending: false, error: new ApiError(500, 'boom'), roles: null }),
      ).toBe('error')
      expect(resolveRolesViewState({ pending: false, error: { statusCode: 502 }, roles: null })).toBe(
        'error',
      )
    })
    it('keeps null (unfetched) distinct from [] (empty)', () => {
      expect(resolveRolesViewState({ pending: false, error: null, roles: null })).toBe('loading')
      expect(resolveRolesViewState({ pending: false, error: null, roles: [] })).toBe('empty')
    })
    it('empty vs ready once a list is present (a stale-refresh error keeps the snapshot)', () => {
      expect(resolveRolesViewState({ pending: false, error: null, roles: [] })).toBe('empty')
      expect(resolveRolesViewState({ pending: false, error: null, roles: [customRole] })).toBe('ready')
      // a background-refresh error never blanks an existing snapshot
      expect(
        resolveRolesViewState({ pending: false, error: new ApiError(500, 'boom'), roles: [customRole] }),
      ).toBe('ready')
      // an empty list with a background error stays "empty", never error
      expect(
        resolveRolesViewState({ pending: false, error: new ApiError(500, 'boom'), roles: [] }),
      ).toBe('empty')
    })
  })

  describe('resolveRoleStatusTone', () => {
    it('maps system roles to info and custom roles to neutral (never colour-alone elsewhere)', () => {
      expect(resolveRoleStatusTone(true)).toBe('info')
      expect(resolveRoleStatusTone(false)).toBe('neutral')
    })
  })

  describe('masked-DTO invariant (boundary)', () => {
    it('role DTOs carry no token/secret field name and no raw 16/18/10-digit PII run', () => {
      const blob = JSON.stringify([systemRole, customRole])
      expect(blob).not.toMatch(/access_?token|refresh_?token|id_?token|secret/iu)
      expect(blob).not.toMatch(/\b\d{16}\b/u) // raw NIK
      expect(blob).not.toMatch(/\b\d{18}\b/u) // raw NIP
      expect(blob).not.toMatch(/\b\d{10}\b/u) // raw NISN
    })
  })
  ```

- [ ] **Run it — expect FAIL.** From `services/sso-admin-frontend` (`npm run test` is `vitest run` — single-shot, terminates with a verdict; pass the file to scope it):
  ```
  npm run test -- app/lib/roles/__tests__/roles-view-state.spec.ts
  ```
  Expected: the run FAILS at module resolution — `Failed to resolve import "../roles-view-state"` (the file does not exist yet). This is the RED state: the failure is the missing implementation, not a typo.

- [ ] **GREEN — add the DTO types.** Append the seven new types to `app/types/users.types.ts` immediately after `export type RolesResponse = …` (line 168). Do NOT touch `AdminRole`/`RolesResponse`/`AssignRolesPayload`. Match the surrounding `readonly`/inline-object house style:

  ```ts
  // GET /admin/api/permissions — the permission catalog item. Distinct from the
  // inline AdminRole.permissions[] element ({ slug; name; category }): the catalog
  // item additionally carries `description`. Public governance config — no PII.
  export type AdminPermission = {
    readonly slug: string
    readonly name: string
    readonly description: string | null
    readonly category: string | null
  }

  export type PermissionsResponse = { readonly permissions: readonly AdminPermission[] }

  // POST /admin/api/roles
  export type CreateRolePayload = {
    readonly slug: string
    readonly name: string
    readonly description?: string | null
    readonly permission_slugs?: readonly string[]
  }

  // PATCH /admin/api/roles/{slug} — metadata only (name/description); slug immutable.
  export type UpdateRolePayload = {
    readonly name?: string
    readonly description?: string | null
  }

  // PUT /admin/api/roles/{slug}/permissions — full-replace permission set.
  export type SyncPermissionsPayload = { readonly permission_slugs: readonly string[] }

  export type RoleMutationResponse = { readonly role: AdminRole }

  export type RoleDeleteResponse = { readonly deleted: boolean; readonly role_slug: string }
  ```

- [ ] **GREEN — create the resolver.** Create `app/lib/roles/roles-view-state.ts` mirroring `app/lib/users/users-view-state.ts` (same error-first switch + the `errorStatus` ApiError/H3 extractor); `resolveRoleStatusTone` does NOT route through `resolveStatusTone` (system→info / custom→neutral is a fixed two-state map, not a status-alias lookup) — but keep the `StatusTone` import as the return type:

  ```ts
  import { ApiError } from '@/lib/api/api-client'
  import type { StatusTone } from '@/lib/status-tone'
  import type { AdminRole } from '@/types/users.types'

  export type RolesViewState =
    | 'loading'
    | 'unauthenticated'
    | 'forbidden'
    | 'error'
    | 'empty'
    | 'ready'

  // "Empty" = the backend answered with a zero-length role list. Deliberately
  // distinct from `forbidden` (a 403 → no permission) so the page shows a
  // "no roles yet" surface, not an access-denied one. `null` (unfetched) is a
  // third state — it stays `loading`, never collapsing into `empty`.
  export function isRolesEmpty(roles: readonly AdminRole[]): boolean {
    return roles.length === 0
  }

  export function resolveRolesViewState({
    error,
    roles,
  }: {
    readonly pending: boolean
    readonly error: unknown
    readonly roles: readonly AdminRole[] | null
  }): RolesViewState {
    // Security boundary: an error with NO prior snapshot surfaces the real
    // auth/permission state. Once a list exists it stays on screen even if a
    // background refresh fails (the composable's stale flag carries that).
    if (error && !roles) {
      const status = errorStatus(error)
      if (status === 401) return 'unauthenticated'
      if (status === 403) return 'forbidden'
      return 'error'
    }
    if (roles) return isRolesEmpty(roles) ? 'empty' : 'ready'
    return 'loading'
  }

  // System (built-in) roles read as `info` (protected, informational); custom
  // roles are `neutral`. Swiss: status is tone + label via UiStatusBadge, never
  // colour-alone, and red is reserved for the destructive affordance only.
  export function resolveRoleStatusTone(isSystem: boolean): StatusTone {
    return isSystem ? 'info' : 'neutral'
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

- [ ] **Run it — expect PASS.** From `services/sso-admin-frontend`:
  ```
  npm run test -- app/lib/roles/__tests__/roles-view-state.spec.ts
  ```
  Expected: all suites green — `isRolesEmpty` (1), `resolveRolesViewState` (5), `resolveRoleStatusTone` (1), `masked-DTO invariant (boundary)` (1). Read the output; do not claim PASS without it.

- [ ] **REFACTOR (only if needed).** No abstraction warranted — this mirrors the Phase-4 resolver one-to-one. Confirm `npm run typecheck` is clean for the two touched files (the new types resolve, no `AdminRole` redefinition collision).

- [ ] **Commit.**
  ```
  git add app/types/users.types.ts app/lib/roles/roles-view-state.ts app/lib/roles/__tests__/roles-view-state.spec.ts
  git commit -m "$(cat <<'EOF'
  feat(sso-admin-frontend): roles DTO types + pure roles view-state/status-tone resolver

  Extend users.types.ts in place with the roles catalog/payload/response DTOs
  (AdminPermission carries description, kept distinct from the inline
  AdminRole.permissions[] shape) and add the pure roles view-state resolver:
  error-first (401/403), null (unfetched) distinct from [] (empty), and a
  system->info / custom->neutral status tone. Mirrors the Phase-4 users
  resolver; masked-DTO invariant pinned at the boundary (no token/secret/PII).

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

**Task DoD (run from `services/sso-admin-frontend`; report any blocked command explicitly, never claim PASS for a command that did not run):**
```
npm run typecheck && npm run lint && npm run format:check && npm run test
```
(`npm run lint` is `run-s lint:*` → BOTH `lint:oxlint` (`oxlint .`) AND `lint:eslint` must pass; a green oxlint with red eslint is NOT done. The full `npm run build` + `npm run test:e2e` are exercised by Task 7.11 once the page renders; this pure-logic task gates on typecheck · lint[oxlint+eslint] · format:check · test.)

---

### Task 7.2: Pure roles-list (filter/paginate) + roles-matrix (grant-map + sync-diff) model

The two pure modules that back the Roles surface with **zero** Nuxt or network: `roles-list.ts` is the search/filter/pagination of the hydrated role list (a 1:1 port of `app/lib/users/users-list.ts`, narrowed to a single `query` string matched on `name` + `slug` — there is no status facet for roles), and `roles-matrix.ts` is **net-new** logic that turns the role DTOs into an editable `roleSlug → Set<permissionSlug>` grant map, a pure `togglePendingGrant` that returns a NEW map (never mutates the seeded server state), and `diffRoleGrants` that produces both the sorted full `permission_slugs` PUT-replace body (the matrix is a **replace**, not a patch — the sync endpoint takes the complete set) and the `added`/`removed`/`changed` impact behind the Task-7.9 "N users affected" summary. These are the load-bearing sync-payload + impact source consumed by `RoleMatrix.vue` (7.6), the page (7.7), and sync-permissions (7.9). This task neither performs a privileged action nor renders/hydrates role data — it is pure stdlib functions over already-masked DTOs — so the privileged-action matrix and the SSR token-leak step do **not** apply here (they live in Tasks 7.8–7.11); the matrix UI mechanics (UiDataList + UiSwitch/UiStatusBadge, system-role protection) live in Task 7.6 on top of this model.

**Files**
- Create: `app/lib/roles/roles-list.ts`
- Create: `app/lib/roles/roles-matrix.ts`
- Test: `app/lib/roles/__tests__/roles-list.spec.ts`
- Test: `app/lib/roles/__tests__/roles-matrix.spec.ts`

**Interfaces**
- Produces (`app/lib/roles/roles-list.ts`):
  - `const ROLES_PAGE_SIZE = 25`
  - `function filterRoles(roles: readonly AdminRole[], query: string): readonly AdminRole[]` (case-insensitive substring match on `name` + `slug`)
  - `function paginateRoles(roles: readonly AdminRole[], page: number, size: number): readonly AdminRole[]`
  - `function rolesPageCount(total: number, size: number): number` (`Math.max(1, Math.ceil(total / size))`)
- Produces (`app/lib/roles/roles-matrix.ts`):
  - `type RoleGrantMap = ReadonlyMap<string, ReadonlySet<string>>` (roleSlug → set of granted permission slugs)
  - `function buildRoleGrantMap(roles: readonly AdminRole[]): RoleGrantMap`
  - `function isGranted(grants: RoleGrantMap, roleSlug: string, permissionSlug: string): boolean`
  - `function togglePendingGrant(grants: RoleGrantMap, roleSlug: string, permissionSlug: string, granted: boolean): RoleGrantMap` (pure, returns a new map)
  - `type RoleGrantDiff = { readonly added: readonly string[]; readonly removed: readonly string[]; readonly changed: boolean; readonly permission_slugs: readonly string[] }`
  - `function diffRoleGrants(original: ReadonlySet<string>, pending: ReadonlySet<string>): RoleGrantDiff` (`permission_slugs` = the full sorted pending set = the PUT-replace body)
- Consumes: `AdminRole` from `@/types/users.types` (already defined; carries `slug`, `name`, `is_system`, `user_count`, and `permissions: readonly { slug; name; category }[]`). Mirrors Phase-4 `app/lib/users/users-list.ts` (filter/paginate/pageCount); the matrix model is net-new pure logic.

**Steps**

1. [ ] Write the FAILING test `app/lib/roles/__tests__/roles-list.spec.ts` (FULL code — real behaviour, not mock-only):

```ts
import { describe, expect, it } from 'vitest'
import { ROLES_PAGE_SIZE, filterRoles, paginateRoles, rolesPageCount } from '../roles-list'
import type { AdminRole } from '@/types/users.types'

// One fully-typed sample role; overrides keep each case readable. Role slugs +
// names are public access-control config (no token/secret/PII), matching the
// masked DTO the backend returns from GET /admin/api/roles.
const base: AdminRole = {
  id: 1,
  slug: 'administrator',
  name: 'Administrator',
  description: 'Full administrative access',
  is_system: true,
  permissions: [],
  user_count: 0,
  users_count: 0,
}

function makeRole(overrides: Partial<AdminRole>): AdminRole {
  return { ...base, ...overrides }
}

const sample: readonly AdminRole[] = [
  makeRole({ slug: 'administrator', name: 'Administrator', is_system: true }),
  makeRole({ slug: 'auditor', name: 'Read-only Auditor', is_system: false }),
  makeRole({ slug: 'help-desk', name: 'Help Desk', is_system: false }),
  makeRole({ slug: 'security-officer', name: 'Security Officer', is_system: false }),
]

describe('filterRoles', () => {
  it('returns the full list when the query is empty or whitespace-only', () => {
    expect(filterRoles(sample, '')).toHaveLength(4)
    expect(filterRoles(sample, '   ')).toHaveLength(4)
  })

  it('matches the query case-insensitively across name and slug', () => {
    expect(filterRoles(sample, 'auditor').map((r) => r.slug)).toEqual(['auditor'])
    expect(filterRoles(sample, 'HELP DESK').map((r) => r.slug)).toEqual(['help-desk'])
    expect(filterRoles(sample, 'security-officer').map((r) => r.slug)).toEqual(['security-officer'])
  })

  it('matches on slug even when the name does not contain the query', () => {
    expect(filterRoles(sample, 'administrator').map((r) => r.slug)).toEqual(['administrator'])
  })

  it('returns an empty list when nothing matches', () => {
    expect(filterRoles(sample, 'nonexistent')).toEqual([])
  })
})

describe('paginateRoles', () => {
  const many: readonly AdminRole[] = Array.from({ length: 30 }, (_, i) =>
    makeRole({ slug: `role-${i}`, name: `Role ${i}` }),
  )

  it('returns the first page-size slice for page 1 and the remainder for page 2', () => {
    expect(paginateRoles(many, 1, ROLES_PAGE_SIZE)).toHaveLength(ROLES_PAGE_SIZE)
    expect(paginateRoles(many, 2, ROLES_PAGE_SIZE)).toHaveLength(30 - ROLES_PAGE_SIZE)
    expect(paginateRoles(many, 1, ROLES_PAGE_SIZE)[0]?.slug).toBe('role-0')
    expect(paginateRoles(many, 2, ROLES_PAGE_SIZE)[0]?.slug).toBe(`role-${ROLES_PAGE_SIZE}`)
  })

  it('honours an explicit page size and clamps page < 1 to the first page', () => {
    expect(paginateRoles(many, 1, 10)).toHaveLength(10)
    expect(paginateRoles(many, 0, 10)[0]?.slug).toBe('role-0')
  })

  it('returns an empty slice for a page beyond the data', () => {
    expect(paginateRoles(many, 99, ROLES_PAGE_SIZE)).toEqual([])
  })
})

describe('rolesPageCount', () => {
  it('ceils total/size and is never below 1', () => {
    expect(rolesPageCount(0, ROLES_PAGE_SIZE)).toBe(1)
    expect(rolesPageCount(25, ROLES_PAGE_SIZE)).toBe(1)
    expect(rolesPageCount(26, ROLES_PAGE_SIZE)).toBe(2)
    expect(rolesPageCount(50, ROLES_PAGE_SIZE)).toBe(2)
    expect(rolesPageCount(51, ROLES_PAGE_SIZE)).toBe(3)
    expect(rolesPageCount(10, 10)).toBe(1)
    expect(rolesPageCount(11, 10)).toBe(2)
  })

  it('pins the default page size to 25 (parity with the Users table)', () => {
    expect(ROLES_PAGE_SIZE).toBe(25)
  })
})
```

2. [ ] Run it — expect **FAIL** (module `../roles-list` does not exist → import/resolution error). From `services/sso-admin-frontend`:
   `npm run test -- app/lib/roles/__tests__/roles-list.spec.ts`

3. [ ] Implement `app/lib/roles/roles-list.ts` (FULL code):

```ts
import type { AdminRole } from '@/types/users.types'

// The backend `GET /admin/api/roles` returns a flat `{ roles }` with no query
// params, so search / pagination are derived client-side over the hydrated,
// already-masked list. 25 mirrors the Users table page size. Unlike Users there
// is no status facet — a role's only filter axis is its name/slug text.
export const ROLES_PAGE_SIZE = 25

// Case-insensitive substring match over the operator-meaningful fields: the
// human role name and the stable slug. Role slugs + names are public access
// config, not secrets, so both are searchable.
export function filterRoles(roles: readonly AdminRole[], query: string): readonly AdminRole[] {
  const q = query.trim().toLowerCase()
  if (q === '') return roles
  return roles.filter(
    (role) => role.name.toLowerCase().includes(q) || role.slug.toLowerCase().includes(q),
  )
}

// 1-based page; page < 1 is clamped to the first page so a stale page ref can
// never index before the start of the list.
export function paginateRoles(
  roles: readonly AdminRole[],
  page: number,
  size: number = ROLES_PAGE_SIZE,
): readonly AdminRole[] {
  const start = (Math.max(1, page) - 1) * size
  return roles.slice(start, start + size)
}

// Always at least one page so the folio renders "01 / 01" for an empty result.
export function rolesPageCount(total: number, size: number = ROLES_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / size))
}
```

4. [ ] Run it — expect **PASS** (all `roles-list` describe blocks green):
   `npm run test -- app/lib/roles/__tests__/roles-list.spec.ts`

5. [ ] Write the FAILING test `app/lib/roles/__tests__/roles-matrix.spec.ts` (FULL code — real behaviour, asserts immutability + sort + diff):

```ts
import { describe, expect, it } from 'vitest'
import {
  buildRoleGrantMap,
  diffRoleGrants,
  isGranted,
  togglePendingGrant,
  type RoleGrantMap,
} from '../roles-matrix'
import type { AdminRole } from '@/types/users.types'

const base: AdminRole = {
  id: 1,
  slug: 'administrator',
  name: 'Administrator',
  description: null,
  is_system: true,
  permissions: [],
  user_count: 0,
  users_count: 0,
}

function makeRole(overrides: Partial<AdminRole>): AdminRole {
  return { ...base, ...overrides }
}

const perm = (slug: string, category: string | null = 'roles') => ({
  slug,
  name: slug.replace(/[._]/g, ' '),
  category,
})

const roles: readonly AdminRole[] = [
  makeRole({
    slug: 'administrator',
    name: 'Administrator',
    is_system: true,
    permissions: [perm('admin.roles.read'), perm('admin.roles.write')],
  }),
  makeRole({
    slug: 'auditor',
    name: 'Read-only Auditor',
    is_system: false,
    permissions: [perm('admin.roles.read')],
  }),
]

describe('buildRoleGrantMap', () => {
  it('builds a roleSlug -> Set<permissionSlug> map from the role DTOs', () => {
    const grants = buildRoleGrantMap(roles)
    expect([...(grants.get('administrator') ?? [])].sort()).toEqual([
      'admin.roles.read',
      'admin.roles.write',
    ])
    expect([...(grants.get('auditor') ?? [])]).toEqual(['admin.roles.read'])
  })

  it('represents a role with no permissions as an empty set, not absent', () => {
    const grants = buildRoleGrantMap([makeRole({ slug: 'empty-role', permissions: [] })])
    expect(grants.get('empty-role')?.size).toBe(0)
  })
})

describe('isGranted', () => {
  const grants: RoleGrantMap = buildRoleGrantMap(roles)

  it('reports true only for a permission held by the role', () => {
    expect(isGranted(grants, 'administrator', 'admin.roles.write')).toBe(true)
    expect(isGranted(grants, 'auditor', 'admin.roles.write')).toBe(false)
  })

  it('reports false for an unknown role slug', () => {
    expect(isGranted(grants, 'ghost', 'admin.roles.read')).toBe(false)
  })
})

describe('togglePendingGrant', () => {
  it('returns a NEW map and never mutates the input (granting a permission)', () => {
    const original = buildRoleGrantMap(roles)
    const next = togglePendingGrant(original, 'auditor', 'admin.roles.write', true)
    expect(next).not.toBe(original)
    expect(isGranted(next, 'auditor', 'admin.roles.write')).toBe(true)
    // the original seeded map is untouched
    expect(isGranted(original, 'auditor', 'admin.roles.write')).toBe(false)
  })

  it('removes a permission when granted is false without touching other roles', () => {
    const original = buildRoleGrantMap(roles)
    const next = togglePendingGrant(original, 'administrator', 'admin.roles.write', false)
    expect(isGranted(next, 'administrator', 'admin.roles.write')).toBe(false)
    expect(isGranted(next, 'administrator', 'admin.roles.read')).toBe(true)
    // unrelated role column is preserved
    expect(isGranted(next, 'auditor', 'admin.roles.read')).toBe(true)
    // the original administrator set is unchanged
    expect(isGranted(original, 'administrator', 'admin.roles.write')).toBe(true)
  })

  it('is idempotent: granting an already-granted permission yields the same membership', () => {
    const original = buildRoleGrantMap(roles)
    const next = togglePendingGrant(original, 'auditor', 'admin.roles.read', true)
    expect([...(next.get('auditor') ?? [])]).toEqual(['admin.roles.read'])
  })

  it('grants onto a role that was not seeded in the map', () => {
    const original = buildRoleGrantMap(roles)
    const next = togglePendingGrant(original, 'new-role', 'admin.roles.read', true)
    expect(isGranted(next, 'new-role', 'admin.roles.read')).toBe(true)
  })
})

describe('diffRoleGrants', () => {
  it('reports added/removed sorted and the full sorted permission_slugs PUT body', () => {
    const original = new Set(['admin.roles.read', 'admin.roles.write'])
    const pending = new Set(['admin.users.read', 'admin.roles.read'])
    const diff = diffRoleGrants(original, pending)
    expect(diff.added).toEqual(['admin.users.read'])
    expect(diff.removed).toEqual(['admin.roles.write'])
    expect(diff.changed).toBe(true)
    expect(diff.permission_slugs).toEqual(['admin.roles.read', 'admin.users.read'])
  })

  it('reports changed=false with empty added/removed for identical sets', () => {
    const original = new Set(['admin.roles.read'])
    const pending = new Set(['admin.roles.read'])
    const diff = diffRoleGrants(original, pending)
    expect(diff.added).toEqual([])
    expect(diff.removed).toEqual([])
    expect(diff.changed).toBe(false)
    expect(diff.permission_slugs).toEqual(['admin.roles.read'])
  })

  it('treats clearing all permissions as a valid empty PUT body', () => {
    const original = new Set(['admin.roles.read', 'admin.roles.write'])
    const pending = new Set<string>()
    const diff = diffRoleGrants(original, pending)
    expect(diff.removed).toEqual(['admin.roles.read', 'admin.roles.write'])
    expect(diff.added).toEqual([])
    expect(diff.changed).toBe(true)
    expect(diff.permission_slugs).toEqual([])
  })
})
```

6. [ ] Run it — expect **FAIL** (module `../roles-matrix` does not exist → import/resolution error):
   `npm run test -- app/lib/roles/__tests__/roles-matrix.spec.ts`

7. [ ] Implement `app/lib/roles/roles-matrix.ts` (FULL code):

```ts
import type { AdminRole } from '@/types/users.types'

// Pure model for the role × permission matrix. No Vue, no network: it turns the
// hydrated role DTOs into an editable grant map, toggles produce a NEW map
// (never mutate the seeded server snapshot), and the diff yields both the full
// sorted `permission_slugs` PUT-replace body and the added/removed impact behind
// the "N users affected" sync confirmation. The sync endpoint REPLACES the set,
// so `permission_slugs` is the complete pending set, not a patch.

export type RoleGrantMap = ReadonlyMap<string, ReadonlySet<string>>

// Seed from the role DTOs. A role with no permissions becomes an EMPTY set
// (present, size 0) so the matrix column renders all-denied rather than absent.
export function buildRoleGrantMap(roles: readonly AdminRole[]): RoleGrantMap {
  return new Map(roles.map((role) => [role.slug, new Set(role.permissions.map((p) => p.slug))]))
}

export function isGranted(
  grants: RoleGrantMap,
  roleSlug: string,
  permissionSlug: string,
): boolean {
  return grants.get(roleSlug)?.has(permissionSlug) ?? false
}

// Pure toggle: copies the map and only the affected role's set, leaving every
// other column's set reference intact. The returned map is always a new object.
export function togglePendingGrant(
  grants: RoleGrantMap,
  roleSlug: string,
  permissionSlug: string,
  granted: boolean,
): RoleGrantMap {
  const next = new Map(grants)
  const current = new Set(grants.get(roleSlug) ?? [])
  if (granted) current.add(permissionSlug)
  else current.delete(permissionSlug)
  next.set(roleSlug, current)
  return next
}

export type RoleGrantDiff = {
  readonly added: readonly string[]
  readonly removed: readonly string[]
  readonly changed: boolean
  readonly permission_slugs: readonly string[]
}

// Diff one role's original vs pending set. `permission_slugs` is the full sorted
// pending set (the PUT-replace body — an empty array is a valid "clear all").
export function diffRoleGrants(
  original: ReadonlySet<string>,
  pending: ReadonlySet<string>,
): RoleGrantDiff {
  const added = [...pending].filter((slug) => !original.has(slug)).sort()
  const removed = [...original].filter((slug) => !pending.has(slug)).sort()
  return {
    added,
    removed,
    changed: added.length > 0 || removed.length > 0,
    permission_slugs: [...pending].sort(),
  }
}
```

8. [ ] Run it — expect **PASS** (all `roles-matrix` describe blocks green):
   `npm run test -- app/lib/roles/__tests__/roles-matrix.spec.ts`

9. [ ] Refactor if needed — both modules are pure stdlib; keep them dependency-free (no Nuxt, no `apiClient`, no Vue reactivity). Confirm no traceability markers (`OG#`/`UC###`/`FR###`/`BE-FR###`) leaked into names or comments. Re-run both spec files to confirm still green:
   `npm run test -- app/lib/roles/__tests__/roles-list.spec.ts app/lib/roles/__tests__/roles-matrix.spec.ts`

10. [ ] Commit (run from `services/sso-admin-frontend`):

```bash
git add app/lib/roles/roles-list.ts app/lib/roles/roles-matrix.ts \
  app/lib/roles/__tests__/roles-list.spec.ts app/lib/roles/__tests__/roles-matrix.spec.ts
git commit -m "feat(sso-admin-frontend): pure roles-list + roles-matrix grant-diff model

Port users-list filter/paginate to roles (name+slug) and add the net-new
matrix grant-map: buildRoleGrantMap, pure togglePendingGrant (new map), and
diffRoleGrants producing the sorted permission_slugs PUT body plus
added/removed/changed for the sync impact summary. No Vue, no network.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

**Task-scoped DoD (run from `services/sso-admin-frontend`):** `npm run typecheck && npm run lint && npm run format:check && npm run test -- app/lib/roles/__tests__/roles-list.spec.ts app/lib/roles/__tests__/roles-matrix.spec.ts` — and `npm run lint` is `run-s lint:*`, so **both** `lint:oxlint` (`oxlint .`) AND `lint:eslint` (`eslint "src/**/*.vue" "app/**/*.vue" --cache`) must pass; a green oxlint with a red eslint (or vice versa) is NOT done. (The full `npm run test` + `npm run build` + `npm run test:e2e` gate is exercised at the phase boundary in Task 7.11.)

---

### Task 7.3: Extend `rolesApi` service over api-client (single network seam)

**Files**
- Edit: `app/services/roles.api.ts` (EXTEND the existing `rolesApi` object — keep `list()` exactly as-is; do NOT re-declare it)
- Edit (test): `app/services/__tests__/roles.api.spec.ts` (a spec already exists with the `list()` test only — EXTEND it: keep the `list()` case, add the new-method cases. Phase-template note in the skeleton said "new — none exists today"; reality is the `list()` spec from the read seam already landed, so this task ADDS to it rather than creating it.)

**Interfaces**
- Consumes:
  - `apiClient.{get,post,patch,put,delete}<T>` from `@/lib/api/api-client` (all five verbs exist on the `ApiClient` interface)
  - From `@/types/users.types` (added in Task 7.1): `CreateRolePayload`, `UpdateRolePayload`, `SyncPermissionsPayload`, `RoleMutationResponse`, `RoleDeleteResponse`, `PermissionsResponse`; plus the existing `RolesResponse` (already imported)
  - Exact template: `app/services/clients.api.ts` (`update` PATCH / `syncScopes` PUT / `delete` DELETE; the `...(x && { x })` omit-empty idiom; the `!== undefined` "null is meaningful" idiom for `backchannel_logout_uri`, mirrored here by `description`)
- Produces (added to the SAME `rolesApi` object in `app/services/roles.api.ts`):
  - private `rolePath(slug: string): string` = `` `/api/admin/roles/${encodeURIComponent(slug)}` ``
  - `permissions(): Promise<PermissionsResponse>` → `apiClient.get('/api/admin/permissions')`
  - `store(payload: CreateRolePayload): Promise<RoleMutationResponse>` → `apiClient.post('/api/admin/roles', body)` (`slug` + `name` always; `description` and `permission_slugs` omitted via `...(x && { x })` when empty)
  - `update(slug: string, payload: UpdateRolePayload): Promise<RoleMutationResponse>` → `apiClient.patch(rolePath(slug), body)` (metadata only — `name`/`description`; `description: null` is the meaningful "clear" state, forwarded whenever it is **not `undefined`**)
  - `syncPermissions(slug: string, payload: SyncPermissionsPayload): Promise<RoleMutationResponse>` → `apiClient.put(`${rolePath(slug)}/permissions`, { permission_slugs: payload.permission_slugs })`
  - `destroy(slug: string): Promise<RoleDeleteResponse>` → `apiClient.delete(rolePath(slug))`

This is a **pure forwarding seam**: no rendering, no error mapping, no token/secret handling (the Nitro proxy injects the Bearer server-side; the SPA is token-blind). The roles DTOs carry only slugs/names/descriptions/counts — no token/secret/PII flows through here, so there is **no SSR-leak assertion in this task** (the leak gate is Task 7.11; the privileged-action failure matrix lives in the composable/page Tasks 7.8–7.10, not in this dumb seam).

> `encodeURIComponent` is defensive: the backend `{role}` binding is the slug, regex `[a-z0-9_-]+`, so encoding is the identity for every valid slug. It costs nothing and keeps the seam correct if an invalid slug ever reaches it. No contrived "slug with a space" test — such a slug can never be a real role.

**Steps**

- [ ] **RED — write the failing test.** Replace the body of `app/services/__tests__/roles.api.spec.ts` with the full spec below (it keeps the existing `list()` case verbatim and adds one case per new method). Mock all five `apiClient` verbs; type every `vi.fn`; assert each method hits the right HTTP verb, the same-origin `/api/admin/*` path, and the exact body shape.

  ```ts
  import { beforeEach, describe, expect, it, vi } from 'vitest'
  import type {
    CreateRolePayload,
    PermissionsResponse,
    RoleDeleteResponse,
    RoleMutationResponse,
    RolesResponse,
    SyncPermissionsPayload,
    UpdateRolePayload,
  } from '@/types/users.types'

  const get = vi.fn<(path: string) => Promise<unknown>>()
  const post = vi.fn<(path: string, body?: unknown) => Promise<unknown>>()
  const patch = vi.fn<(path: string, body?: unknown) => Promise<unknown>>()
  const put = vi.fn<(path: string, body?: unknown) => Promise<unknown>>()
  const del = vi.fn<(path: string) => Promise<unknown>>()
  vi.mock('@/lib/api/api-client', () => ({
    apiClient: { get, post, patch, put, delete: del },
  }))

  const { rolesApi } = await import('../roles.api')

  beforeEach(() => {
    get.mockReset()
    post.mockReset()
    patch.mockReset()
    put.mockReset()
    del.mockReset()
  })

  describe('rolesApi — read seam', () => {
    it('list() GETs the same-origin BFF roles path and returns the DTO unchanged', async () => {
      const payload: RolesResponse = {
        roles: [
          {
            id: 1,
            slug: 'user',
            name: 'Pengguna',
            description: 'Akun pengguna standar',
            is_system: true,
            permissions: [{ slug: 'profile.read', name: 'Baca profil', category: 'profile' }],
            user_count: 1100,
            users_count: 1100,
          },
          {
            id: 2,
            slug: 'admin',
            name: 'Administrator',
            description: null,
            is_system: true,
            permissions: [{ slug: 'admin.roles.write', name: 'Kelola peran', category: null }],
            user_count: 4,
            users_count: 4,
          },
        ],
      }
      get.mockResolvedValue(payload)
      await expect(rolesApi.list()).resolves.toBe(payload)
      expect(get).toHaveBeenCalledWith('/api/admin/roles')
    })

    it('permissions() GETs the same-origin permission catalog path and passes the DTO through', async () => {
      const payload: PermissionsResponse = {
        permissions: [
          { slug: 'users.read', name: 'Read users', description: 'Allow reading user records', category: 'users' },
        ],
      }
      get.mockResolvedValue(payload)
      await expect(rolesApi.permissions()).resolves.toBe(payload)
      expect(get).toHaveBeenCalledWith('/api/admin/permissions')
    })
  })

  describe('rolesApi — create (store)', () => {
    it('store() POSTs slug + name + description + permission_slugs when all provided', async () => {
      const response: RoleMutationResponse = {
        role: {
          id: 9,
          slug: 'editor',
          name: 'Editor',
          description: 'Content editor (sample)',
          is_system: false,
          permissions: [{ slug: 'users.read', name: 'Read users', category: 'users' }],
          user_count: 0,
          users_count: 0,
        },
      }
      post.mockResolvedValue(response)
      const payload: CreateRolePayload = {
        slug: 'editor',
        name: 'Editor',
        description: 'Content editor (sample)',
        permission_slugs: ['users.read'],
      }
      await expect(rolesApi.store(payload)).resolves.toBe(response)
      expect(post).toHaveBeenCalledWith('/api/admin/roles', {
        slug: 'editor',
        name: 'Editor',
        description: 'Content editor (sample)',
        permission_slugs: ['users.read'],
      })
    })

    it('store() omits empty description and absent permission_slugs (slug + name only)', async () => {
      post.mockResolvedValue({ role: {} })
      const payload: CreateRolePayload = { slug: 'viewer', name: 'Viewer', description: null }
      await rolesApi.store(payload)
      expect(post).toHaveBeenCalledWith('/api/admin/roles', { slug: 'viewer', name: 'Viewer' })
    })
  })

  describe('rolesApi — update metadata', () => {
    it('update() PATCHes the slug path forwarding name and a meaningful null description', async () => {
      patch.mockResolvedValue({ role: {} })
      const payload: UpdateRolePayload = { name: 'Renamed Editor', description: null }
      await rolesApi.update('editor', payload)
      expect(patch).toHaveBeenCalledWith('/api/admin/roles/editor', {
        name: 'Renamed Editor',
        description: null,
      })
    })

    it('update() omits fields left undefined (description-only patch)', async () => {
      patch.mockResolvedValue({ role: {} })
      const payload: UpdateRolePayload = { description: 'Updated note (sample)' }
      await rolesApi.update('editor', payload)
      expect(patch).toHaveBeenCalledWith('/api/admin/roles/editor', {
        description: 'Updated note (sample)',
      })
    })
  })

  describe('rolesApi — sync permissions', () => {
    it('syncPermissions() PUTs permission_slugs to the slug permissions path', async () => {
      put.mockResolvedValue({ role: {} })
      const payload: SyncPermissionsPayload = { permission_slugs: ['users.read', 'users.write'] }
      await rolesApi.syncPermissions('editor', payload)
      expect(put).toHaveBeenCalledWith('/api/admin/roles/editor/permissions', {
        permission_slugs: ['users.read', 'users.write'],
      })
    })

    it('syncPermissions() forwards an empty array (clears all permissions)', async () => {
      put.mockResolvedValue({ role: {} })
      const payload: SyncPermissionsPayload = { permission_slugs: [] }
      await rolesApi.syncPermissions('editor', payload)
      expect(put).toHaveBeenCalledWith('/api/admin/roles/editor/permissions', {
        permission_slugs: [],
      })
    })
  })

  describe('rolesApi — destroy', () => {
    it('destroy() DELETEs the slug path and returns the delete envelope by identity', async () => {
      const response: RoleDeleteResponse = { deleted: true, role_slug: 'editor' }
      del.mockResolvedValue(response)
      await expect(rolesApi.destroy('editor')).resolves.toBe(response)
      expect(del).toHaveBeenCalledWith('/api/admin/roles/editor')
    })
  })
  ```

- [ ] **Run it — expect FAIL.**
  ```
  npx vitest run app/services/__tests__/roles.api.spec.ts
  ```
  Expected: the `list()` + `permissions()` read cases pass, but the create/update/sync/destroy cases FAIL — `TypeError: rolesApi.store is not a function` (and the same for `update`/`syncPermissions`/`destroy`), because those methods do not exist yet. (RED is real: the failure is the missing behaviour, not a typo.)

- [ ] **GREEN — minimal implementation.** Replace `app/services/roles.api.ts` with the full object below (keeps `list()` unchanged; adds the `rolePath` helper + five methods, mirroring `clients.api.ts`):

  ```ts
  import { apiClient } from '@/lib/api/api-client'
  import type {
    CreateRolePayload,
    PermissionsResponse,
    RoleDeleteResponse,
    RoleMutationResponse,
    RolesResponse,
    SyncPermissionsPayload,
    UpdateRolePayload,
  } from '@/types/users.types'

  // Same-origin BFF paths. The Nitro proxy (server/utils/admin-proxy.ts) injects the
  // Bearer access token from event.context and rewrites /api/admin/* → /admin/api/*
  // before forwarding to the backend. Every Phase-7 roles route is already allow-listed.
  //
  // Single network seam for the Roles domain: pure forwarding — no rendering, no error
  // mapping, no token/secret handling. On create, optional fields are omitted when empty
  // so the backend `sometimes` validators never see '' / undefined. On update,
  // description:null is the meaningful "clear the description" state, forwarded whenever
  // it is not undefined. The slug is encodeURIComponent'd defensively (valid slugs match
  // [a-z0-9_-]+, so this is the identity for every real role).
  function rolePath(slug: string): string {
    return `/api/admin/roles/${encodeURIComponent(slug)}`
  }

  export const rolesApi = {
    list(): Promise<RolesResponse> {
      return apiClient.get<RolesResponse>('/api/admin/roles')
    },

    permissions(): Promise<PermissionsResponse> {
      return apiClient.get<PermissionsResponse>('/api/admin/permissions')
    },

    store(payload: CreateRolePayload): Promise<RoleMutationResponse> {
      return apiClient.post<RoleMutationResponse>('/api/admin/roles', {
        slug: payload.slug,
        name: payload.name,
        ...(payload.description && { description: payload.description }),
        ...(payload.permission_slugs && { permission_slugs: payload.permission_slugs }),
      })
    },

    update(slug: string, payload: UpdateRolePayload): Promise<RoleMutationResponse> {
      return apiClient.patch<RoleMutationResponse>(rolePath(slug), {
        ...(payload.name !== undefined && { name: payload.name }),
        ...(payload.description !== undefined && { description: payload.description }),
      })
    },

    syncPermissions(slug: string, payload: SyncPermissionsPayload): Promise<RoleMutationResponse> {
      return apiClient.put<RoleMutationResponse>(`${rolePath(slug)}/permissions`, {
        permission_slugs: payload.permission_slugs,
      })
    },

    destroy(slug: string): Promise<RoleDeleteResponse> {
      return apiClient.delete<RoleDeleteResponse>(rolePath(slug))
    },
  }
  ```

- [ ] **Run it — expect PASS.**
  ```
  npx vitest run app/services/__tests__/roles.api.spec.ts
  ```
  Expected: all cases pass (read seam ×2, store ×2, update ×2, syncPermissions ×2, destroy ×1).

- [ ] **REFACTOR.** None expected — the object mirrors `clients.api.ts` 1:1. Confirm no `fetch`/`$fetch` was introduced (the only network access is via `apiClient`) and that `list()` is byte-identical to before. Skip if nothing to change.

- [ ] **Commit (only on green).**
  ```
  git add app/services/roles.api.ts app/services/__tests__/roles.api.spec.ts
  git commit -m "$(cat <<'EOF'
  feat(sso-admin-frontend): extend rolesApi with permissions/store/update/syncPermissions/destroy

  Add the create/update-metadata/sync-permissions/delete write methods plus the
  permission-catalog read to the existing rolesApi object over apiClient, mirroring
  clients.api (PATCH update / PUT syncScopes / DELETE). encodeURIComponent slug path
  helper; create omits empty optionals, update forwards a meaningful null description.

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

**Task-scoped DoD (run from `services/sso-admin-frontend`; report any blocked command explicitly — never claim PASS for a command that did not run):**
```
npm run typecheck && npm run lint:oxlint && npm run lint:eslint && npm run format:check && npm run test
```
(`npm run lint` = `run-s lint:*` runs BOTH `lint:oxlint` (`oxlint .`) AND `lint:eslint`; both must pass. The full-build/`test:e2e`/leak-gate gates run in Task 7.11; this seam-only task does not render a page.)

---

### Task 7.4: useRolesList + usePermissionCatalog SSR composables

The two SSR data boundaries for the Roles domain. `useRolesList` wraps `rolesApi.list()` in `useAsyncData` (resolves server-side, masked DTO hydrates with no client flash) and exposes the mapped view-state + redacted request id + stale flag + client-side **search** (name/slug, case-insensitive) and **pagination** — the backend `GET /roles` has no query params, so search/paging are derived over the hydrated list. It is a copy-and-adapt of `app/composables/useUsersList.ts` with the user `statusFilter` axis dropped (roles filter on `query` only). `usePermissionCatalog` is the single-resource catalog fetch (matrix columns' permission labels) wrapped in its own `useAsyncData('admin-permissions', …)` — a copy-and-adapt of `app/composables/useObservabilitySummary.ts`, reusing the **same** `resolveRolesViewState` resolver so the matrix can degrade independently of the role list. All pure list logic lives in `app/lib/roles/roles-list.ts` (Task 7.2) and the view-state resolver in `app/lib/roles/roles-view-state.ts` (Task 7.1), so both composables stay thin and are tested with `useAsyncData` mocked at the boundary (deterministic state mapping). No write/privileged action and no template render here — these are read-path data seams only, so the privileged-action matrix and the SSR-HTML render gate do not apply to this task (the SSR payload leak gate over `/roles` is Task 7.11); a data-boundary leak assertion is still included to pin that neither composable introduces a token field or raw identifier into the hydrated list.

**Files**
- Create: `app/composables/useRolesList.ts`
- Create: `app/composables/usePermissionCatalog.ts`
- Test: `app/composables/__tests__/useRolesList.nuxt.spec.ts`
- Test: `app/composables/__tests__/usePermissionCatalog.nuxt.spec.ts`

**Interfaces**
- Consumes: `rolesApi.list`/`rolesApi.permissions` (`@/services/roles.api`); `resolveRolesViewState`/`isRolesEmpty` + `RolesViewState` (`@/lib/roles/roles-view-state`); `filterRoles`/`paginateRoles`/`rolesPageCount`/`ROLES_PAGE_SIZE` (`@/lib/roles/roles-list`); `getLastRequestId`/`ApiError` (`@/lib/api/api-client`); `AdminRole`/`AdminPermission`/`RolesResponse`/`PermissionsResponse` (`@/types/users.types`). Copy-and-adapt of `app/composables/useUsersList.ts` (list) + `app/composables/useObservabilitySummary.ts` (single-resource).
- Produces (`app/composables/useRolesList.ts`):
  - `function useRolesList(): { roles: Ref<readonly AdminRole[] | null>; filtered: ComputedRef<readonly AdminRole[]>; paged: ComputedRef<readonly AdminRole[]>; total: ComputedRef<number>; filteredTotal: ComputedRef<number>; pageCount: ComputedRef<number>; page: Ref<number>; query: Ref<string>; viewState: ComputedRef<RolesViewState>; isStale: ComputedRef<boolean>; requestId: ComputedRef<string | null>; pending: Ref<boolean>; refresh: () => Promise<void> }` — `useAsyncData('admin-roles-list', () => rolesApi.list())`; keeps `null` (unfetched) distinct from `[]` (empty); resets `page` to 1 on `query` change; `isStale = Boolean(error) && roles !== null`.
- Produces (`app/composables/usePermissionCatalog.ts`):
  - `function usePermissionCatalog(): { permissions: Ref<readonly AdminPermission[] | null>; viewState: ComputedRef<RolesViewState>; isStale: ComputedRef<boolean>; requestId: ComputedRef<string | null>; pending: Ref<boolean>; refresh: () => Promise<void> }` — `useAsyncData('admin-permissions', () => rolesApi.permissions())`; keeps `null` distinct from `[]`; `isStale = Boolean(error) && permissions !== null`.

**Steps**

1. [ ] Write the failing list-composable test `app/composables/__tests__/useRolesList.nuxt.spec.ts` (real behaviour — keys/wiring, loading→ready→empty, search, pagination, page reset, forbidden/unauthenticated mapping, stale, refresh delegation, masked-DTO leak guard):

```ts
// *.nuxt.spec.ts → routed to the 'nuxt' env where mockNuxtImport is available.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { ApiError } from '@/lib/api/api-client'
import { rolesApi } from '@/services/roles.api'
import { useRolesList } from '../useRolesList'
import type { AdminRole, RolesResponse } from '@/types/users.types'

vi.mock('@/services/roles.api', () => ({
  rolesApi: { list: vi.fn<() => Promise<RolesResponse>>() },
}))

// Controllable useAsyncData stand-in: the test mutates data/pending/error and
// asserts the composable's derived state, and captures the key + handler so we
// can prove the composable wires the service under the contracted asyncData key.
const data = ref<RolesResponse | null>(null)
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

// One fully-typed sample role; overrides keep each case readable. Rows read
// clearly as samples — no fabricated personas, no raw secrets/PII.
const base: AdminRole = {
  id: 1,
  slug: 'support-agent',
  name: 'Support Agent',
  description: 'Reads tickets and user profiles.',
  is_system: false,
  permissions: [{ slug: 'admin.users.read', name: 'Read users', category: 'users' }],
  user_count: 3,
  users_count: 3,
}
const makeRole = (o: Partial<AdminRole>): AdminRole => ({ ...base, ...o })

const ready: RolesResponse = {
  roles: [
    makeRole({ id: 1, slug: 'support-agent', name: 'Support Agent' }),
    makeRole({ id: 2, slug: 'auditor', name: 'Auditor', is_system: true }),
  ],
}
const many: RolesResponse = {
  roles: Array.from({ length: 30 }, (_, i) =>
    makeRole({ id: i + 1, slug: `role-${i}`, name: `Role ${i}` }),
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

describe('useRolesList', () => {
  it('wires the roles service under a stable asyncData key', () => {
    useRolesList()
    expect(capturedKey).toBe('admin-roles-list')
    capturedHandler?.()
    expect(rolesApi.list).toHaveBeenCalledTimes(1)
  })

  it('derives loading / ready / empty and keeps null distinct from []', () => {
    const list = useRolesList()
    expect(list.viewState.value).toBe('loading')
    expect(list.roles.value).toBeNull()
    data.value = ready
    expect(list.viewState.value).toBe('ready')
    expect(list.roles.value).toHaveLength(2)
    expect(list.total.value).toBe(2)
    data.value = { roles: [] }
    expect(list.viewState.value).toBe('empty')
    expect(list.roles.value).toEqual([])
  })

  it('applies the search query to derived rows (name + slug, case-insensitive)', () => {
    data.value = ready
    const list = useRolesList()
    list.query.value = 'AUDIT'
    expect(list.filtered.value.map((r) => r.slug)).toEqual(['auditor'])
    expect(list.filteredTotal.value).toBe(1)
    list.query.value = 'support-agent'
    expect(list.filtered.value.map((r) => r.slug)).toEqual(['support-agent'])
    list.query.value = ''
    expect(list.filtered.value).toHaveLength(2)
  })

  it('paginates the filtered list and reports the page count', () => {
    data.value = many
    const list = useRolesList()
    expect(list.paged.value).toHaveLength(25)
    expect(list.pageCount.value).toBe(2)
    list.page.value = 2
    expect(list.paged.value).toHaveLength(5)
  })

  it('resets to page 1 when the query changes', async () => {
    data.value = many
    const list = useRolesList()
    list.page.value = 2
    list.query.value = 'Role 1'
    await nextTick()
    expect(list.page.value).toBe(1)
  })

  it('maps a first-load 403 to forbidden and exposes the redacted request id', () => {
    error.value = new ApiError(403, 'forbidden', 'forbidden', null, 'admin-req-DENIED42')
    const list = useRolesList()
    expect(list.viewState.value).toBe('forbidden')
    expect(list.requestId.value).toBe('admin-req-DENIED42')
  })

  it('maps a first-load 401 to unauthenticated', () => {
    error.value = new ApiError(401, 'no session')
    expect(useRolesList().viewState.value).toBe('unauthenticated')
  })

  it('keeps the last good list on a background refresh failure (stale)', () => {
    data.value = ready
    error.value = new ApiError(500, 'boom')
    const list = useRolesList()
    expect(list.viewState.value).toBe('ready')
    expect(list.isStale.value).toBe(true)
  })

  it('refresh() delegates to the underlying asyncData refresh', async () => {
    await useRolesList().refresh()
    expect(refreshMock).toHaveBeenCalledTimes(1)
  })

  it('hydrates only masked DTOs — no token field, no raw NIK/NIP/NISN digit-run', () => {
    // The composable passes the backend DTO through verbatim; it must never
    // introduce a token field or an un-masked identifier. The full SSR payload
    // leak gate over /roles is Task 7.11 — this guards the data boundary itself.
    data.value = many
    const list = useRolesList()
    const serialized = JSON.stringify({ roles: list.roles.value, paged: list.paged.value })
    expect(serialized).not.toMatch(/access_token|refresh_token|id_token|Bearer|client_secret/i)
    expect(serialized).not.toMatch(/\b\d{16}\b|\b\d{18}\b|\b\d{10}\b/)
  })
})
```

2. [ ] Run it — expect **FAIL** (module not found, the composable does not exist yet):

```
npm run test -- src/../app/composables/__tests__/useRolesList.nuxt.spec.ts
```
Run from `services/sso-admin-frontend`. Expected: `Failed to resolve import "../useRolesList"` / suite fails to collect. (If the alias glob differs, the equivalent invocation is `npx vitest run app/composables/__tests__/useRolesList.nuxt.spec.ts`.)

3. [ ] Write the minimal implementation `app/composables/useRolesList.ts`:

```ts
import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'
import { ApiError, getLastRequestId } from '@/lib/api/api-client'
import { rolesApi } from '@/services/roles.api'
import { resolveRolesViewState, type RolesViewState } from '@/lib/roles/roles-view-state'
import { ROLES_PAGE_SIZE, filterRoles, paginateRoles, rolesPageCount } from '@/lib/roles/roles-list'
import type { AdminRole, RolesResponse } from '@/types/users.types'

export type UseRolesListReturn = {
  readonly roles: Ref<readonly AdminRole[] | null>
  readonly filtered: ComputedRef<readonly AdminRole[]>
  readonly paged: ComputedRef<readonly AdminRole[]>
  readonly total: ComputedRef<number>
  readonly filteredTotal: ComputedRef<number>
  readonly pageCount: ComputedRef<number>
  readonly page: Ref<number>
  readonly query: Ref<string>
  readonly viewState: ComputedRef<RolesViewState>
  readonly isStale: ComputedRef<boolean>
  readonly requestId: ComputedRef<string | null>
  readonly pending: Ref<boolean>
  readonly refresh: () => Promise<void>
}

export function useRolesList(): UseRolesListReturn {
  // Runs during SSR so the masked role list resolves server-side and hydrates
  // into the payload (safe DTO only — slugs, names, descriptions, counts). The
  // access token stays in the Nitro event.context and never reaches __NUXT__.
  const { data, pending, error, refresh } = useAsyncData<RolesResponse>('admin-roles-list', () =>
    rolesApi.list(),
  )

  // `null` (no response yet) is kept distinct from `[]` (an answered, empty
  // catalog) so the view-state resolver tells loading/error apart from empty.
  const roles = computed<readonly AdminRole[] | null>(() => data.value?.roles ?? null)
  const list = computed<readonly AdminRole[]>(() => roles.value ?? [])

  const query = ref('')
  const page = ref(1)

  const filtered = computed<readonly AdminRole[]>(() => filterRoles(list.value, query.value))
  const total = computed<number>(() => list.value.length)
  const filteredTotal = computed<number>(() => filtered.value.length)
  const pageCount = computed<number>(() => rolesPageCount(filteredTotal.value, ROLES_PAGE_SIZE))
  const paged = computed<readonly AdminRole[]>(() =>
    paginateRoles(filtered.value, page.value, ROLES_PAGE_SIZE),
  )

  const viewState = computed<RolesViewState>(() =>
    resolveRolesViewState({ pending: pending.value, error: error.value, roles: roles.value }),
  )

  // A background refresh failed but we still hold a good list — keep it on screen
  // with a stale notice rather than blanking the table.
  const isStale = computed<boolean>(() => Boolean(error.value) && roles.value !== null)

  const requestId = computed<string | null>(() =>
    error.value instanceof ApiError
      ? (error.value.requestId ?? getLastRequestId())
      : getLastRequestId(),
  )

  // Reset to the first page whenever the result set narrows, so a tighter search
  // never strands the operator on an out-of-range page.
  watch(query, () => {
    page.value = 1
  })

  return {
    roles,
    filtered,
    paged,
    total,
    filteredTotal,
    pageCount,
    page,
    query,
    viewState,
    isStale,
    requestId,
    pending,
    refresh: async () => {
      await refresh()
    },
  }
}
```

4. [ ] Run it — expect **PASS** (all 10 `it` blocks green):

```
npm run test -- app/composables/__tests__/useRolesList.nuxt.spec.ts
```
Expected tail: `Test Files  1 passed (1)` · `Tests  10 passed (10)`.

5. [ ] Write the failing catalog-composable test `app/composables/__tests__/usePermissionCatalog.nuxt.spec.ts`:

```ts
// *.nuxt.spec.ts → routed to the 'nuxt' env where mockNuxtImport is available.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { ApiError } from '@/lib/api/api-client'
import { rolesApi } from '@/services/roles.api'
import { usePermissionCatalog } from '../usePermissionCatalog'
import type { AdminPermission, PermissionsResponse } from '@/types/users.types'

vi.mock('@/services/roles.api', () => ({
  rolesApi: { permissions: vi.fn<() => Promise<PermissionsResponse>>() },
}))

const data = ref<PermissionsResponse | null>(null)
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

const base: AdminPermission = {
  slug: 'admin.users.read',
  name: 'Read users',
  description: 'View the user directory.',
  category: 'users',
}
const makePermission = (o: Partial<AdminPermission>): AdminPermission => ({ ...base, ...o })

const catalog: PermissionsResponse = {
  permissions: [
    makePermission({ slug: 'admin.users.read', name: 'Read users', category: 'users' }),
    makePermission({ slug: 'admin.roles.write', name: 'Write roles', category: 'roles' }),
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

describe('usePermissionCatalog', () => {
  it('wires the permissions service under a stable asyncData key', () => {
    usePermissionCatalog()
    expect(capturedKey).toBe('admin-permissions')
    capturedHandler?.()
    expect(rolesApi.permissions).toHaveBeenCalledTimes(1)
  })

  it('derives loading / ready / empty and keeps null distinct from []', () => {
    const cat = usePermissionCatalog()
    expect(cat.viewState.value).toBe('loading')
    expect(cat.permissions.value).toBeNull()
    data.value = catalog
    expect(cat.viewState.value).toBe('ready')
    expect(cat.permissions.value?.map((p) => p.slug)).toEqual([
      'admin.users.read',
      'admin.roles.write',
    ])
    data.value = { permissions: [] }
    expect(cat.viewState.value).toBe('empty')
    expect(cat.permissions.value).toEqual([])
  })

  it('maps a first-load 403 to forbidden and exposes the redacted request id', () => {
    error.value = new ApiError(403, 'forbidden', 'forbidden', null, 'admin-req-CATALOG7')
    const cat = usePermissionCatalog()
    expect(cat.viewState.value).toBe('forbidden')
    expect(cat.requestId.value).toBe('admin-req-CATALOG7')
  })

  it('maps a first-load 401 to unauthenticated', () => {
    error.value = new ApiError(401, 'no session')
    expect(usePermissionCatalog().viewState.value).toBe('unauthenticated')
  })

  it('keeps the last good catalog on a background refresh failure (stale)', () => {
    data.value = catalog
    error.value = new ApiError(500, 'catalog down')
    const cat = usePermissionCatalog()
    expect(cat.viewState.value).toBe('ready')
    expect(cat.isStale.value).toBe(true)
  })

  it('passes pending through unchanged', () => {
    pending.value = true
    expect(usePermissionCatalog().pending.value).toBe(true)
  })

  it('refresh() delegates to the underlying asyncData refresh', async () => {
    await usePermissionCatalog().refresh()
    expect(refreshMock).toHaveBeenCalledTimes(1)
  })

  it('hydrates only masked catalog DTOs — no token field, no raw digit-run', () => {
    data.value = catalog
    const cat = usePermissionCatalog()
    const serialized = JSON.stringify({ permissions: cat.permissions.value })
    expect(serialized).not.toMatch(/access_token|refresh_token|id_token|Bearer|client_secret/i)
    expect(serialized).not.toMatch(/\b\d{16}\b|\b\d{18}\b|\b\d{10}\b/)
  })
})
```

6. [ ] Run it — expect **FAIL** (`Failed to resolve import "../usePermissionCatalog"`):

```
npm run test -- app/composables/__tests__/usePermissionCatalog.nuxt.spec.ts
```

7. [ ] Write the minimal implementation `app/composables/usePermissionCatalog.ts`:

```ts
import { computed, type ComputedRef, type Ref } from 'vue'
import { ApiError, getLastRequestId } from '@/lib/api/api-client'
import { rolesApi } from '@/services/roles.api'
import { resolveRolesViewState, type RolesViewState } from '@/lib/roles/roles-view-state'
import type { AdminPermission, AdminRole, PermissionsResponse } from '@/types/users.types'

export type UsePermissionCatalogReturn = {
  readonly permissions: Ref<readonly AdminPermission[] | null>
  readonly viewState: ComputedRef<RolesViewState>
  readonly isStale: ComputedRef<boolean>
  readonly requestId: ComputedRef<string | null>
  readonly pending: Ref<boolean>
  readonly refresh: () => Promise<void>
}

export function usePermissionCatalog(): UsePermissionCatalogReturn {
  // Runs during SSR so the permission catalog resolves server-side and hydrates
  // into the payload (safe config only — slugs, names, descriptions, categories;
  // permission slugs are public config). Independent of the role-list fetch so a
  // failing catalog degrades the matrix column labels, not the whole page.
  const { data, pending, error, refresh } = useAsyncData<PermissionsResponse>(
    'admin-permissions',
    () => rolesApi.permissions(),
  )

  // `null` (unfetched) stays distinct from `[]` (answered, empty catalog).
  const permissions = computed<readonly AdminPermission[] | null>(
    () => data.value?.permissions ?? null,
  )

  const viewState = computed<RolesViewState>(() =>
    resolveRolesViewState({
      pending: pending.value,
      error: error.value,
      // ponytail: the resolver is emptiness-only (null vs [] vs has-items); the
      // catalog reuses it through the AdminRole-shaped arg — only null-ness and
      // .length are read, never role-specific fields. No second resolver needed.
      roles: permissions.value as readonly AdminRole[] | null,
    }),
  )

  const isStale = computed<boolean>(() => Boolean(error.value) && permissions.value !== null)

  const requestId = computed<string | null>(() =>
    error.value instanceof ApiError
      ? (error.value.requestId ?? getLastRequestId())
      : getLastRequestId(),
  )

  return {
    permissions,
    viewState,
    isStale,
    requestId,
    pending,
    refresh: async () => {
      await refresh()
    },
  }
}
```

8. [ ] Run it — expect **PASS**:

```
npm run test -- app/composables/__tests__/usePermissionCatalog.nuxt.spec.ts
```
Expected tail: `Test Files  1 passed (1)` · `Tests  8 passed (8)`.

9. [ ] Refactor pass (only if needed): confirm no `statusFilter`/observability leftovers from the copy-and-adapt, no `any`, every `vi.fn` carries a type parameter, and both files import types from `@/types/users.types`. Re-run both spec files together to confirm green: `npm run test -- app/composables/__tests__/useRolesList.nuxt.spec.ts app/composables/__tests__/usePermissionCatalog.nuxt.spec.ts`.

10. [ ] Commit:

```
git add app/composables/useRolesList.ts app/composables/usePermissionCatalog.ts \
        app/composables/__tests__/useRolesList.nuxt.spec.ts \
        app/composables/__tests__/usePermissionCatalog.nuxt.spec.ts
git commit -m "feat(sso-admin-frontend): useRolesList + usePermissionCatalog SSR composables

Wrap rolesApi.list/permissions in useAsyncData so the role list and
permission catalog resolve server-side and hydrate as masked DTOs only.
useRolesList mirrors useUsersList (search + pagination, null distinct from
empty, stale flag, redacted request id); usePermissionCatalog is the
single-resource catalog over the shared roles view-state resolver.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

**Task DoD (run from `services/sso-admin-frontend`; report any blocked command explicitly, never claim PASS for a command that did not run):** `npm run typecheck && npm run lint && npm run format:check && npm run test && npm run build` — where `npm run lint` is `run-s lint:*` and must pass **both** `lint:oxlint` (`oxlint .`) **and** `lint:eslint` (`eslint "src/**/*.vue" "app/**/*.vue" --cache`); a green oxlint with red eslint (or vice versa) is NOT done.

---

### Task 7.5: RolesTable.vue (Swiss role-list domain table)

**Files**
- Create: `app/components/roles/RolesTable.vue`
- Test: `app/components/roles/__tests__/RolesTable.nuxt.spec.ts`

**Interfaces**
- Produces (`app/components/roles/RolesTable.vue`) — props:
  - `roles: readonly AdminRole[]` (required)
  - `caption: string` (required)
  - `roleLabel: string`, `usersLabel: string`, `statusLabel: string`, `systemLabel: string`, `customLabel: string`, `editLabel: string`, `managePermissionsLabel: string`, `deleteLabel: string` (all required — label-blind table; i18n is resolved in the page)
  - `canWrite: boolean = false`, `canDelete: boolean = false`
  - **Pagination passthrough (mirror `UsersTable.vue`):** `total: number` (required), `page?: number`, `pageCount?: number`, `nextLabel?: string`, `previousLabel?: string` — forwarded to `UiDataList` (`:total`/`:next-label`/`:previous-label` + `@next`/`@previous`) with a separate `data-testid="roles-page-folio"` page folio (`page` / `pageCount`), exactly like `UsersTable`. The caption folio uses the passed `total` (the page feeds `filteredTotal`), **never** `roles.length`.
  - emits: `select(slug: string)`, `edit(role: AdminRole)`, `managePermissions(role: AdminRole)`, `delete(role: AdminRole)`, `next()`, `previous()`
  - Wraps `UiDataList` with columns **Role** (`#cell(role)` → role name as the select affordance + slug as a `UiFolio` composition element), **Users** (`#cell(users)` → `UiFolio` count of `user_count`), **Status** (`#cell(status)` → `UiStatusBadge` via `resolveRoleStatusTone(is_system)` — System vs Custom, **never colour-alone**); `#actions` → `UiButton variant="ghost" size="sm"` for Edit / Manage Permissions / Delete. **System roles (`is_system`) hide Edit, Manage Permissions, and Delete** — a built-in role exposes no write/matrix entry point at all (the matrix renders it read-only in Task 7.6). Action buttons render only when `canWrite` (Delete additionally requires `canDelete`).
- Consumes: `UiDataList` (+ `UiDataListColumn`/`UiDataListRow`) `@/components/ui/UiDataList.vue`; `UiStatusBadge` `@/components/ui/UiStatusBadge.vue`; `UiButton` `@/components/ui/UiButton.vue`; `UiFolio` `@/components/ui/UiFolio.vue`; `resolveRoleStatusTone` `@/lib/roles/roles-view-state` (Task 7.1); `AdminRole` `@/types/users.types`. Copy-and-adapt of `app/components/users/UsersTable.vue`.

**Deliverable:** a dumb, label-blind role-list table with system/custom status badges, folio role-count evidence, and permission-gated edit / manage-permissions / delete action affordances.

**Steps**

- [ ] **Write the failing test.** Create `app/components/roles/__tests__/RolesTable.nuxt.spec.ts` (nuxt-runtime by filename — uses `mountSuspended`). Mock rows read clearly as samples (one `is_system` role + two custom roles). Cover: badge tone/label per row (system → `info`/`systemLabel`, custom → `neutral`/`customLabel`), folio user-count render, system-role action gating (hides Edit + Manage Permissions + Delete — a system row exposes **no** write trigger), full-writer custom-role actions, `canWrite=false` hides every write action, `canDelete=false` hides Delete only, emitted events carry the right payloads (slug for `select`, the full `AdminRole` for `edit`/`managePermissions`/`delete`), the **pagination passthrough** (re-emits `next`/`previous` from the `UiDataList` controls + the `roles-page-folio` page numeral — mirror `UsersTable.spec`), and the SSR/no-leak text guard:

  ```ts
  import { describe, expect, it } from 'vitest'
  import { mountSuspended } from '@nuxt/test-utils/runtime'
  import RolesTable from '../RolesTable.vue'
  import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
  import type { AdminRole } from '@/types/users.types'

  // Sample rows: already masked + localized by the page — this component is dumb.
  const roles: readonly AdminRole[] = [
    {
      id: 1,
      slug: 'platform-admin',
      name: 'Platform Admin',
      description: 'Full platform control',
      is_system: true,
      permissions: [{ slug: 'admin.roles.read', name: 'Read roles', category: 'roles' }],
      user_count: 3,
      users_count: 3,
    },
    {
      id: 2,
      slug: 'helpdesk',
      name: 'Helpdesk',
      description: null,
      is_system: false,
      permissions: [],
      user_count: 7,
      users_count: 7,
    },
    {
      id: 3,
      slug: 'auditor',
      name: 'Auditor',
      description: null,
      is_system: false,
      permissions: [],
      user_count: 0,
      users_count: 0,
    },
  ]

  const labels = {
    caption: 'Daftar Peran',
    roleLabel: 'Peran',
    usersLabel: 'Pengguna',
    statusLabel: 'Status',
    systemLabel: 'Sistem',
    customLabel: 'Kustom',
    editLabel: 'Ubah',
    managePermissionsLabel: 'Kelola Izin',
    deleteLabel: 'Hapus',
    nextLabel: 'Berikutnya',
    previousLabel: 'Sebelumnya',
  }

  function mountTable(overrides: Partial<{ canWrite: boolean; canDelete: boolean }> = {}) {
    return mountSuspended(RolesTable, {
      props: {
        roles,
        ...labels,
        total: 14,
        page: 1,
        pageCount: 3,
        canWrite: true,
        canDelete: true,
        ...overrides,
      },
    })
  }

  describe('RolesTable', () => {
    it('renders the caption, column labels, and every role name + slug', async () => {
      const wrapper = await mountTable()
      expect(wrapper.text()).toContain('Daftar Peran')
      expect(wrapper.text()).toContain('Peran')
      expect(wrapper.text()).toContain('Pengguna')
      expect(wrapper.text()).toContain('Status')
      expect(wrapper.text()).toContain('Platform Admin')
      expect(wrapper.text()).toContain('platform-admin')
      expect(wrapper.text()).toContain('helpdesk')
    })

    it('renders System vs Custom status as a UiStatusBadge — tone + label, never colour-alone', async () => {
      const wrapper = await mountTable()
      const badges = wrapper.findAllComponents(UiStatusBadge)
      expect(badges).toHaveLength(roles.length)
      expect(badges.map((b) => b.props('tone'))).toEqual(['info', 'neutral', 'neutral'])
      expect(badges.map((b) => b.props('label'))).toEqual(['Sistem', 'Kustom', 'Kustom'])
    })

    it('renders the per-role user count as a folio numeral', async () => {
      const wrapper = await mountTable()
      const folios = wrapper.findAll('[data-testid="roles-row-users"]')
      expect(folios).toHaveLength(roles.length)
      expect(folios[1]!.text()).toMatch(/07/)
    })

    it('emits select(slug) when the role name affordance is clicked', async () => {
      const wrapper = await mountTable()
      const selects = wrapper.findAll('[data-testid="roles-row-select"]')
      expect(selects).toHaveLength(roles.length)
      await selects[1]!.trigger('click')
      expect(wrapper.emitted('select')).toEqual([['helpdesk']])
    })

    it('exposes no write trigger for system roles (no Edit, Manage, or Delete)', async () => {
      const wrapper = await mountTable()
      const rows = wrapper.findAll('tbody tr')
      const systemRow = rows[0]!
      expect(systemRow.find('[data-testid="roles-row-edit"]').exists()).toBe(false)
      expect(systemRow.find('[data-testid="roles-row-manage"]').exists()).toBe(false)
      expect(systemRow.find('[data-testid="roles-row-delete"]').exists()).toBe(false)
    })

    it('renders Edit / Manage / Delete for custom roles when canWrite && canDelete', async () => {
      const wrapper = await mountTable()
      const customRow = wrapper.findAll('tbody tr')[1]!
      expect(customRow.find('[data-testid="roles-row-edit"]').exists()).toBe(true)
      expect(customRow.find('[data-testid="roles-row-manage"]').exists()).toBe(true)
      expect(customRow.find('[data-testid="roles-row-delete"]').exists()).toBe(true)
    })

    it('hides every write action when canWrite is false', async () => {
      const wrapper = await mountTable({ canWrite: false })
      expect(wrapper.find('[data-testid="roles-row-edit"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="roles-row-manage"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="roles-row-delete"]').exists()).toBe(false)
    })

    it('hides Delete only when canDelete is false (writer without delete privilege)', async () => {
      const wrapper = await mountTable({ canDelete: false })
      const customRow = wrapper.findAll('tbody tr')[1]!
      expect(customRow.find('[data-testid="roles-row-edit"]').exists()).toBe(true)
      expect(customRow.find('[data-testid="roles-row-manage"]').exists()).toBe(true)
      expect(customRow.find('[data-testid="roles-row-delete"]').exists()).toBe(false)
    })

    it('emits edit / managePermissions / delete with the full AdminRole', async () => {
      const wrapper = await mountTable()
      const customRow = wrapper.findAll('tbody tr')[1]!
      await customRow.find('[data-testid="roles-row-edit"]').trigger('click')
      await customRow.find('[data-testid="roles-row-manage"]').trigger('click')
      await customRow.find('[data-testid="roles-row-delete"]').trigger('click')
      expect(wrapper.emitted('edit')).toEqual([[roles[1]]])
      expect(wrapper.emitted('managePermissions')).toEqual([[roles[1]]])
      expect(wrapper.emitted('delete')).toEqual([[roles[1]]])
    })

    it('re-emits next() / previous() from the UiDataList pagination controls', async () => {
      const wrapper = await mountTable()
      await wrapper.get('[data-testid="data-list-next"]').trigger('click')
      await wrapper.get('[data-testid="data-list-previous"]').trigger('click')
      expect(wrapper.emitted('next')).toHaveLength(1)
      expect(wrapper.emitted('previous')).toHaveLength(1)
    })

    it('renders the page position as a folio numeral (page / pageCount)', async () => {
      const wrapper = await mountTable()
      expect(wrapper.get('[data-testid="roles-page-folio"]').text()).toMatch(/01\s*\/\s*03/)
    })

    it('omits the page folio + pagination controls when page / pageCount + labels are absent', async () => {
      const wrapper = await mountSuspended(RolesTable, {
        props: {
          roles,
          ...labels,
          nextLabel: undefined,
          previousLabel: undefined,
          total: 3,
          canWrite: true,
          canDelete: true,
        },
      })
      expect(wrapper.find('[data-testid="roles-page-folio"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="data-list-next"]').exists()).toBe(false)
    })

    it('renders no token value/name and no raw-PII digit run in its HTML', async () => {
      const html = (await mountTable()).html()
      expect(html).not.toMatch(/access_token|refresh_token|id_token|Bearer|SENTINEL-/)
      expect(html).not.toMatch(/\d{10,}/)
    })
  })
  ```

- [ ] **Run it — expect FAIL.** From `services/sso-admin-frontend`:
  ```bash
  npm run test:unit -- app/components/roles/__tests__/RolesTable.nuxt.spec.ts
  ```
  Expected: FAIL — `Failed to resolve import "../RolesTable.vue"` (component does not exist yet).

- [ ] **Minimal implementation.** Create `app/components/roles/RolesTable.vue` (copy-and-adapt of `UsersTable.vue` — takes `AdminRole[]` directly, derives rows, looks up the full role by slug for object-payload emits):

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
  import { resolveRoleStatusTone } from '@/lib/roles/roles-view-state'
  import type { StatusTone } from '@/lib/status-tone'
  import type { AdminRole } from '@/types/users.types'

  type RolesTableRow = UiDataListRow & {
    readonly role: string
    readonly slug: string
    readonly users: number
    readonly status: string
    readonly statusTone: StatusTone
    readonly isSystem: boolean
  }

  const props = withDefaults(
    defineProps<{
      readonly roles: readonly AdminRole[]
      readonly caption: string
      readonly roleLabel: string
      readonly usersLabel: string
      readonly statusLabel: string
      readonly systemLabel: string
      readonly customLabel: string
      readonly editLabel: string
      readonly managePermissionsLabel: string
      readonly deleteLabel: string
      readonly canWrite?: boolean
      readonly canDelete?: boolean
      // Pagination passthrough — mirrors UsersTable.vue. `total` is the page's
      // filteredTotal (drives the caption folio); page/pageCount drive the page folio.
      readonly total: number
      readonly page?: number
      readonly pageCount?: number
      readonly nextLabel?: string
      readonly previousLabel?: string
    }>(),
    {
      canWrite: false,
      canDelete: false,
      page: undefined,
      pageCount: undefined,
      nextLabel: undefined,
      previousLabel: undefined,
    },
  )

  const emit = defineEmits<{
    (event: 'select', slug: string): void
    (event: 'edit', role: AdminRole): void
    (event: 'managePermissions', role: AdminRole): void
    (event: 'delete', role: AdminRole): void
    (event: 'next'): void
    (event: 'previous'): void
  }>()

  const showFolio = computed<boolean>(() => props.page != null && props.pageCount != null)

  const columns = computed<readonly UiDataListColumn[]>(() => [
    { key: 'role', label: props.roleLabel, align: 'left' },
    { key: 'users', label: props.usersLabel, align: 'left' },
    { key: 'status', label: props.statusLabel, align: 'left' },
  ])

  const rolesBySlug = computed<ReadonlyMap<string, AdminRole>>(
    () => new Map(props.roles.map((role) => [role.slug, role])),
  )

  const rows = computed<readonly RolesTableRow[]>(() =>
    props.roles.map((role) => ({
      id: role.slug,
      role: role.name,
      slug: role.slug,
      users: role.user_count,
      status: role.is_system ? props.systemLabel : props.customLabel,
      statusTone: resolveRoleStatusTone(role.is_system),
      isSystem: role.is_system,
    })),
  )

  // row.* arrives typed as string | number | null | undefined (UiDataListRow);
  // the local row shape is well-formed, so narrow defensively for the slots.
  function rowTone(value: unknown): StatusTone {
    return (typeof value === 'string' ? value : 'neutral') as StatusTone
  }

  function rowText(value: unknown): string {
    return value == null || value === '' ? '—' : String(value)
  }

  function rowCount(value: unknown): number {
    return typeof value === 'number' ? value : 0
  }

  function emitFor(slug: unknown, event: 'edit' | 'managePermissions' | 'delete'): void {
    const role = rolesBySlug.value.get(String(slug))
    if (role) emit(event, role)
  }
  </script>

  <template>
    <div class="roles-table" data-component="roles-table">
      <UiDataList
        :caption="caption"
        :columns="columns"
        :rows="rows"
        :total="total"
        :next-label="nextLabel"
        :previous-label="previousLabel"
        @next="emit('next')"
        @previous="emit('previous')"
      >
        <template #cell(role)="{ row }">
          <button
            type="button"
            class="roles-table__name"
            data-testid="roles-row-select"
            @click="emit('select', String(row.id))"
          >
            {{ rowText(row.role) }}
          </button>
          <span class="roles-table__slug"><UiFolio :value="String(row.slug)" /></span>
        </template>

        <template #cell(users)="{ row }">
          <span data-testid="roles-row-users">
            <UiFolio :index="rowCount(row.users)" variant="count" />
          </span>
        </template>

        <template #cell(status)="{ row }">
          <UiStatusBadge :tone="rowTone(row.statusTone)" :label="rowText(row.status)" />
        </template>

        <template #actions="{ row }">
          <UiButton
            v-if="canWrite && !row.isSystem"
            variant="ghost"
            size="sm"
            data-testid="roles-row-edit"
            @click="emitFor(row.id, 'edit')"
          >
            {{ editLabel }}
          </UiButton>
          <UiButton
            v-if="canWrite && !row.isSystem"
            variant="ghost"
            size="sm"
            data-testid="roles-row-manage"
            @click="emitFor(row.id, 'managePermissions')"
          >
            {{ managePermissionsLabel }}
          </UiButton>
          <UiButton
            v-if="canWrite && canDelete && !row.isSystem"
            variant="ghost"
            size="sm"
            data-testid="roles-row-delete"
            @click="emitFor(row.id, 'delete')"
          >
            {{ deleteLabel }}
          </UiButton>
        </template>
      </UiDataList>

      <div v-if="showFolio" class="roles-table__pagefolio">
        <span data-testid="roles-page-folio">
          <UiFolio :index="page" :total="pageCount" variant="count" />
        </span>
      </div>
    </div>
  </template>

  <style scoped>
  .roles-table {
    display: grid;
    gap: 12px;
  }
  .roles-table__pagefolio {
    display: flex;
    justify-content: flex-end;
    color: var(--fg-3);
  }
  .roles-table__name {
    border: 0;
    background: none;
    padding: 0;
    color: var(--accent);
    font: inherit;
    cursor: pointer;
    text-align: left;
  }
  .roles-table__slug {
    display: block;
    color: var(--fg-3);
  }
  </style>
  ```

  Notes for the implementer: `--danger #E4002B` is not used here — Delete is a ghost button in the list; the red destructive affordance lives in the Task 7.10 `PrivilegedActionDialog danger` confirm, not on the row. The slug renders as a default (condensed) `UiFolio`, not the `id`/mono variant — mono is reserved for raw correlation IDs, and a role slug is public config text.

- [ ] **Run it — expect PASS.**
  ```bash
  npm run test:unit -- app/components/roles/__tests__/RolesTable.nuxt.spec.ts
  ```
  Expected: PASS — all assertions green (badge tone/label, folio count, system-role gating, canWrite/canDelete gating, emitted payloads, no-leak guard).

- [ ] **Refactor if needed.** Keep it label-blind and dumb (no `useI18n`, no store, no network). Confirm `tbody tr` ordering matches `props.roles` so the per-row gating assertions stay stable. No other changes.

- [ ] **Commit (only on green).**
  ```bash
  git add app/components/roles/RolesTable.vue app/components/roles/__tests__/RolesTable.nuxt.spec.ts
  git commit -m "feat(sso-admin-frontend): Swiss RolesTable role-list domain table

  Label-blind UiDataList table for the roles list: system/custom status
  badge via resolveRoleStatusTone (never colour-alone), folio user-count,
  and permission-gated edit/manage-permissions/delete affordances. System
  roles hide edit+delete; delete also requires canDelete.

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

**Task-scoped DoD (run from `services/sso-admin-frontend`):**
```bash
npm run typecheck && npm run lint && npm run format:check && npm run test:unit -- app/components/roles/__tests__/RolesTable.nuxt.spec.ts
```
(`npm run lint` is `run-s lint:*` — BOTH `lint:oxlint` and `lint:eslint` must pass.)

---

### Task 7.6: RoleMatrix.vue (the role × permission matrix)

**Files**
- Create: `app/components/roles/RoleMatrix.vue`
- Test: `app/components/roles/__tests__/RoleMatrix.nuxt.spec.ts`

**Interfaces**
- Produces (`app/components/roles/RoleMatrix.vue`) — props:
  - `roles: readonly AdminRole[]` (required — matrix columns)
  - `permissions: readonly AdminPermission[]` (required — matrix rows, grouped by `category`)
  - `grants: RoleGrantMap` (required — the parent-owned pending grant state)
  - `caption: string` (required), `permissionLabel: string`, `categoryLabel: string`, `grantedLabel: string`, `deniedLabel: string`, `saveLabel: string`
  - `canWrite: boolean = false`
  - `dirtyRoleSlugs: readonly string[] = []` (which role columns have unsaved changes → enable that column's Save)
  - emits: `toggle(payload: { roleSlug: string; permissionSlug: string; granted: boolean })`, `save(roleSlug: string)`
  - Builds `columns = [{ key:'permission', label: permissionLabel, align:'left' }, ...roles.map(r => ({ key: r.slug, label: r.name, align:'left' }))]` and `rows` = one `UiDataListRow` per permission (`{ id: perm.slug, permission: perm.name }`). `#cell(permission)` → name + category sub-label. `#cell(<role.slug>)` → `UiSwitch` (`:model-value="isGranted(grants, role.slug, row.id)"`, `:label="`${role.name}: ${row.permission}`"`, `:disabled="role.is_system || !canWrite"`, `@update:model-value` → emit `toggle`) for editable columns, **or `UiStatusBadge` granted/denied for `is_system` / read-only columns** (never a switch). `UiFolio` for the role-count / permission-count evidence. Per-role Save `UiButton` enabled only when that slug is in `dirtyRoleSlugs` and `canWrite`.
- Consumes: `UiDataList`/`UiSwitch`/`UiStatusBadge`/`UiFolio`/`UiButton` (`@/components/ui/*`); `isGranted` + `RoleGrantMap` (`@/lib/roles/roles-matrix`); `AdminRole`/`AdminPermission` (`@/types/users.types`). Builds on the `UiDataList` `#cell` template (no bespoke grid).

**Deliverable:** the defining dense role × permission matrix — editable `UiSwitch` cells for custom roles, read-only `UiStatusBadge` cells for system roles, folio counts, per-role Save — emitting toggle/save for the page to wire into sync-permissions.

> Dumb/label-blind component (i18n done by the page; matrix payload via `@/lib/roles/roles-matrix` from Task 7.2). **Not a privileged action** — no API call, no `usePrivilegedAction`, no `PrivilegedActionDialog` (the page owns sync-permissions confirm in Task 7.9). This task only renders the grid + emits `toggle`/`save`. It DOES render role/permission data, so the SSR-safety assertion (no token value/name, no raw-PII digit run) is included; role/permission **slugs are public config and allowed**.

---

#### Steps

- [ ] **Write the FAILING test** — `app/components/roles/__tests__/RoleMatrix.nuxt.spec.ts`. Mounts the real component (no stubbed children) with sample roles/permissions and a real `RoleGrantMap` from `buildRoleGrantMap` (Task 7.2). Asserts real behavior: switch cells for the custom column, badge cells for the system column, the exact `toggle` payload, the per-role `save` emit + dirty-gated enable/disable, `canWrite=false` disables the switch, and no token/PII leak in HTML.

  ```ts
  // *.nuxt.spec.ts → 'nuxt' env: mountSuspended renders the full slot tree.
  import { describe, expect, it } from 'vitest'
  import { mountSuspended } from '@nuxt/test-utils/runtime'
  import RoleMatrix from '../RoleMatrix.vue'
  import UiSwitch from '@/components/ui/UiSwitch.vue'
  import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
  import UiButton from '@/components/ui/UiButton.vue'
  import { buildRoleGrantMap } from '@/lib/roles/roles-matrix'
  import type { AdminPermission, AdminRole } from '@/types/users.types'

  // Rows read clearly as samples (Swiss: no fabricated personas). Slugs/names are
  // public config; counts are small so no digit run can read as raw PII.
  const PERMISSIONS: readonly AdminPermission[] = [
    { slug: 'roles.read', name: 'Read roles', description: null, category: 'Roles' },
    { slug: 'roles.write', name: 'Write roles', description: null, category: 'Roles' },
    { slug: 'users.read', name: 'Read users', description: null, category: 'Users' },
  ]

  const ROLES: readonly AdminRole[] = [
    {
      id: 1,
      slug: 'editor',
      name: 'Editor',
      description: null,
      is_system: false,
      permissions: [{ slug: 'roles.read', name: 'Read roles', category: 'Roles' }],
      user_count: 3,
      users_count: 3,
    },
    {
      id: 2,
      slug: 'admin',
      name: 'Administrator',
      description: null,
      is_system: true,
      permissions: [
        { slug: 'roles.read', name: 'Read roles', category: 'Roles' },
        { slug: 'roles.write', name: 'Write roles', category: 'Roles' },
        { slug: 'users.read', name: 'Read users', category: 'Users' },
      ],
      user_count: 2,
      users_count: 2,
    },
  ]

  function mountMatrix(overrides: { canWrite?: boolean; dirtyRoleSlugs?: readonly string[] } = {}) {
    return mountSuspended(RoleMatrix, {
      props: {
        roles: ROLES,
        permissions: PERMISSIONS,
        grants: buildRoleGrantMap(ROLES),
        caption: 'Matriks peran',
        permissionLabel: 'Izin',
        categoryLabel: 'Kategori',
        grantedLabel: 'Diberikan',
        deniedLabel: 'Ditolak',
        saveLabel: 'Simpan',
        canWrite: overrides.canWrite ?? true,
        dirtyRoleSlugs: overrides.dirtyRoleSlugs ?? [],
      },
    })
  }

  describe('RoleMatrix', () => {
    it('renders the caption, the per-role column headers, and a row per permission', async () => {
      const wrapper = await mountMatrix()
      expect(wrapper.text()).toContain('Matriks peran')
      expect(wrapper.text()).toContain('Editor')
      expect(wrapper.text()).toContain('Administrator')
      expect(wrapper.text()).toContain('Read roles')
      expect(wrapper.text()).toContain('Read users')
      // permission cell carries the category sub-label
      expect(wrapper.text()).toContain('Kategori')
    })

    it('renders an editable UiSwitch in every custom-role column cell, reflecting the grant', async () => {
      const wrapper = await mountMatrix()
      const switches = wrapper.findAllComponents(UiSwitch)
      // one switch per permission for the single custom column ('editor')
      expect(switches).toHaveLength(PERMISSIONS.length)
      // every switch belongs to the custom column, never the system column
      const ids = switches.map((s) => s.attributes('data-testid'))
      expect(ids.every((id) => id?.startsWith('role-cell-editor-'))).toBe(true)
      // a11y label names role + permission even though the column header repeats it
      const readRolesSwitch = wrapper.get('[data-testid="role-cell-editor-roles.read"]')
      expect(readRolesSwitch.get('button[role="switch"]').attributes('aria-label')).toBe(
        'Editor: Read roles',
      )
      expect(readRolesSwitch.get('button[role="switch"]').attributes('aria-checked')).toBe('true')
      expect(
        wrapper
          .get('[data-testid="role-cell-editor-roles.write"]')
          .get('button[role="switch"]')
          .attributes('aria-checked'),
      ).toBe('false')
    })

    it('renders a read-only UiStatusBadge (granted/denied) for the system-role column — never a switch', async () => {
      const wrapper = await mountMatrix()
      // no switch carries a system-column id
      const switchIds = wrapper.findAllComponents(UiSwitch).map((s) => s.attributes('data-testid'))
      expect(switchIds.some((id) => id?.startsWith('role-cell-admin-'))).toBe(false)
      // the system column renders a badge per permission, all granted here
      const badges = wrapper.findAllComponents(UiStatusBadge)
      expect(badges).toHaveLength(PERMISSIONS.length)
      expect(badges.map((b) => b.props('label'))).toEqual(['Diberikan', 'Diberikan', 'Diberikan'])
      // shape/label, never colour-alone
      expect(wrapper.get('[data-testid="role-cell-admin-users.read"]').text()).toContain('Diberikan')
    })

    it('emits toggle({ roleSlug, permissionSlug, granted }) with the inverted grant on a switch click', async () => {
      const wrapper = await mountMatrix()
      await wrapper
        .get('[data-testid="role-cell-editor-roles.write"]')
        .get('button[role="switch"]')
        .trigger('click')
      expect(wrapper.emitted('toggle')).toEqual([
        [{ roleSlug: 'editor', permissionSlug: 'roles.write', granted: true }],
      ])
    })

    it('disables custom-column switches when canWrite is false (read-only matrix)', async () => {
      const wrapper = await mountMatrix({ canWrite: false })
      const button = wrapper
        .get('[data-testid="role-cell-editor-roles.read"]')
        .get('button[role="switch"]')
      expect(button.attributes('disabled')).toBeDefined()
    })

    it('enables a per-role Save only when its slug is dirty and canWrite, and emits save(slug)', async () => {
      const dirty = await mountMatrix({ canWrite: true, dirtyRoleSlugs: ['editor'] })
      const save = dirty.get('[data-testid="role-save-editor"]')
      expect(save.attributes('disabled')).toBeUndefined()
      await save.trigger('click')
      expect(dirty.emitted('save')).toEqual([['editor']])

      const clean = await mountMatrix({ canWrite: true, dirtyRoleSlugs: [] })
      expect(clean.get('[data-testid="role-save-editor"]').attributes('disabled')).toBeDefined()
      // system roles are never editable → never get a Save affordance
      expect(clean.find('[data-testid="role-save-admin"]').exists()).toBe(false)
    })

    it('renders role/permission counts as visible folio numerals', async () => {
      const wrapper = await mountMatrix()
      expect(wrapper.get('[data-testid="role-matrix-role-folio"]').text()).toMatch(/02\s*\/\s*02/)
      expect(
        wrapper.get('[data-testid="role-matrix-permission-folio"]').text(),
      ).toMatch(/03\s*\/\s*03/)
    })

    it('renders no token value/name and no raw-PII digit run (16/18/10) in its HTML', async () => {
      const html = (await mountMatrix()).html()
      expect(html).not.toMatch(/access_token|refresh_token|id_token|Bearer|SENTINEL-/)
      // role/permission slugs are public config; only an unbroken 10+ digit run is a leak.
      expect(html).not.toMatch(/\d{10,}/)
    })
  })
  ```

- [ ] **Run it — expect FAIL** (component file does not exist yet):
  ```bash
  cd services/sso-admin-frontend && npx vitest run app/components/roles/__tests__/RoleMatrix.nuxt.spec.ts
  ```
  Expected: the run fails at import — `Failed to resolve import "../RoleMatrix.vue"` (and `0 passed`). RED confirmed by a missing component, not a typo.

- [ ] **Minimal implementation** — `app/components/roles/RoleMatrix.vue` (real, complete; dumb/label-blind; UiDataList + per-column dynamic `#cell` slots, no bespoke grid):

  ```vue
  <script setup lang="ts">
  import { computed } from 'vue'
  import UiDataList, {
    type UiDataListColumn,
    type UiDataListRow,
  } from '@/components/ui/UiDataList.vue'
  import UiSwitch from '@/components/ui/UiSwitch.vue'
  import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
  import UiFolio from '@/components/ui/UiFolio.vue'
  import UiButton from '@/components/ui/UiButton.vue'
  import { isGranted, type RoleGrantMap } from '@/lib/roles/roles-matrix'
  import type { AdminPermission, AdminRole } from '@/types/users.types'

  const props = withDefaults(
    defineProps<{
      readonly roles: readonly AdminRole[]
      readonly permissions: readonly AdminPermission[]
      readonly grants: RoleGrantMap
      readonly caption: string
      readonly permissionLabel: string
      readonly categoryLabel: string
      readonly grantedLabel: string
      readonly deniedLabel: string
      readonly saveLabel: string
      readonly canWrite?: boolean
      readonly dirtyRoleSlugs?: readonly string[]
    }>(),
    {
      canWrite: false,
      dirtyRoleSlugs: () => [],
    },
  )

  const emit = defineEmits<{
    (
      event: 'toggle',
      payload: { roleSlug: string; permissionSlug: string; granted: boolean },
    ): void
    (event: 'save', roleSlug: string): void
  }>()

  // Permissions grouped by category (stable sort: category, then name) so the
  // table reads as category blocks — no bespoke grouped grid needed.
  const sortedPermissions = computed<readonly AdminPermission[]>(() =>
    [...props.permissions].sort(
      (a, b) =>
        (a.category ?? '').localeCompare(b.category ?? '') || a.name.localeCompare(b.name),
    ),
  )

  const permissionLookup = computed<ReadonlyMap<string, AdminPermission>>(
    () => new Map(props.permissions.map((permission) => [permission.slug, permission])),
  )

  const columns = computed<readonly UiDataListColumn[]>(() => [
    { key: 'permission', label: props.permissionLabel, align: 'left' },
    ...props.roles.map((role) => ({ key: role.slug, label: role.name, align: 'left' as const })),
  ])

  const rows = computed<readonly UiDataListRow[]>(() =>
    sortedPermissions.value.map((permission) => ({
      id: permission.slug,
      permission: permission.name,
    })),
  )

  // System roles are protected (read-only badge, no Save); only custom roles are editable.
  const editableRoles = computed<readonly AdminRole[]>(() =>
    props.roles.filter((role) => !role.is_system),
  )

  function cellSlotName(slug: string): string {
    return `cell(${slug})`
  }

  function categoryOf(rowId: unknown): string {
    return permissionLookup.value.get(String(rowId))?.category ?? '—'
  }

  function granted(roleSlug: string, rowId: unknown): boolean {
    return isGranted(props.grants, roleSlug, String(rowId))
  }

  function onToggle(roleSlug: string, rowId: unknown, value: boolean): void {
    emit('toggle', { roleSlug, permissionSlug: String(rowId), granted: value })
  }

  function saveEnabled(slug: string): boolean {
    return props.canWrite && props.dirtyRoleSlugs.includes(slug)
  }
  </script>

  <template>
    <div class="role-matrix" data-component="role-matrix">
      <UiDataList :caption="caption" :columns="columns" :rows="rows">
        <template #cell(permission)="{ row }">
          <span class="role-matrix__perm">
            <span class="role-matrix__perm-name">{{ row.permission }}</span>
            <span class="role-matrix__perm-cat">{{ categoryLabel }}: {{ categoryOf(row.id) }}</span>
          </span>
        </template>

        <template
          v-for="role in roles"
          :key="role.slug"
          #[cellSlotName(role.slug)]="{ row }"
        >
          <UiSwitch
            v-if="!role.is_system"
            :data-testid="`role-cell-${role.slug}-${row.id}`"
            :model-value="granted(role.slug, row.id)"
            :label="`${role.name}: ${row.permission}`"
            :disabled="role.is_system || !canWrite"
            @update:model-value="onToggle(role.slug, row.id, $event)"
          />
          <UiStatusBadge
            v-else
            :data-testid="`role-cell-${role.slug}-${row.id}`"
            :tone="granted(role.slug, row.id) ? 'success' : 'neutral'"
            :label="granted(role.slug, row.id) ? grantedLabel : deniedLabel"
          />
        </template>
      </UiDataList>

      <div class="role-matrix__folio">
        <span data-testid="role-matrix-role-folio">
          <UiFolio :index="roles.length" :total="roles.length" variant="count" />
        </span>
        <span data-testid="role-matrix-permission-folio">
          <UiFolio :index="permissions.length" :total="permissions.length" variant="count" />
        </span>
      </div>

      <div v-if="editableRoles.length" class="role-matrix__saves">
        <UiButton
          v-for="role in editableRoles"
          :key="role.slug"
          :data-testid="`role-save-${role.slug}`"
          variant="secondary"
          size="sm"
          :disabled="!saveEnabled(role.slug)"
          @click="emit('save', role.slug)"
        >
          {{ role.name }} · {{ saveLabel }}
        </UiButton>
      </div>
    </div>
  </template>

  <style scoped>
  .role-matrix {
    display: grid;
    gap: 12px;
  }
  .role-matrix__perm {
    display: grid;
    gap: 2px;
  }
  .role-matrix__perm-name {
    font: 500 0.8125rem/1.2 var(--font-sans);
    color: var(--fg);
  }
  .role-matrix__perm-cat {
    font: 400 0.6875rem/1.2 var(--font-sans);
    color: var(--fg-3);
  }
  .role-matrix__folio {
    display: flex;
    justify-content: flex-end;
    gap: 16px;
    color: var(--fg-3);
  }
  .role-matrix__saves {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: flex-end;
  }
  </style>
  ```

  > ponytail: no bespoke grid, no local pending-state copy — the parent owns `grants`/`dirtyRoleSlugs` (controlled). Save lives in a footer strip (not a table footer row) because UiDataList has no per-column footer slot; a strip is the shortest thing that aligns Save with custom columns. Add a sticky header / column-aligned footer only if the matrix grows past one screen.

  > **a11y note on the switch label.** `UiSwitch` renders its `label` prop in **two** places — the `button[role="switch"]`'s `aria-label` **and** a visible `<span class="ui-switch__label">`. Passing the verbose `` `${role.name}: ${row.permission}` `` therefore prints the full "Editor: Read roles" string as visible text in **every** dense matrix cell. The tests assert the verbose name on the `aria-label` (the screen-reader name must disambiguate the cell), so keep it there; if the visible repetition reads too noisy in the grid, the minimal follow-up is to give `UiSwitch` a separate `ariaLabel` prop (verbose) and pass an empty/`sr-only` visible `label` — do **not** drop the aria-label the tests rely on. Documented here rather than pre-built (the grid is legible at the current density).

- [ ] **Run it — expect PASS**:
  ```bash
  cd services/sso-admin-frontend && npx vitest run app/components/roles/__tests__/RoleMatrix.nuxt.spec.ts
  ```
  Expected: `Test Files  1 passed (1)` / `Tests  8 passed (8)`. GREEN.

- [ ] **Refactor if needed** — keep the dynamic-slot `v-for` and the controlled grant model; no local state, no extra abstraction. Re-run the file command above and confirm it stays green.

- [ ] **Commit**:
  ```bash
  git add services/sso-admin-frontend/app/components/roles/RoleMatrix.vue \
          services/sso-admin-frontend/app/components/roles/__tests__/RoleMatrix.nuxt.spec.ts
  git commit -m "$(cat <<'EOF'
  feat(sso-admin-frontend): Swiss RoleMatrix (UiDataList switch/badge matrix, system-protected)

  Dense role x permission matrix over UiDataList: editable UiSwitch cells for
  custom-role columns, read-only UiStatusBadge granted/denied for system-role
  columns (never a switch), folio role/permission counts, per-role dirty-gated
  Save. Controlled — parent owns the grant map; emits toggle/save.

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

**Task DoD (run from `services/sso-admin-frontend`; report any blocked command explicitly, never claim PASS for one that did not run):**
```bash
npm run typecheck && npm run lint && npm run format:check && npx vitest run app/components/roles/__tests__/RoleMatrix.nuxt.spec.ts
```
`npm run lint` is `run-s lint:*` → BOTH `lint:oxlint` (`oxlint .`) AND `lint:eslint` (`eslint "src/**/*.vue" "app/**/*.vue" --cache`) must pass. The full-suite `npm run test` + `npm run build` run at the phase gate (Task 7.11).

---

### Task 7.7: Roles page — all states, permission-gated, list + matrix read surface

Replace the `app/pages/roles.vue` stub body (`<h1>Roles</h1>`) with the `users/index.vue` all-states state machine, adapted for the RBAC domain: an **unconditional** hero (eyebrow / title / summary + masked principal + folio role-count) so the SSR leak gate's positive assertions hold in every state, then one branch per `viewState` — `loading`→`UiSkeleton`, `forbidden`/`unauthenticated`/`error`→`UiStatusView` (inline `:standalone="false"`, redacted `:request-id`, refresh action on `error`), `empty`→`UiEmptyState` (no-data), `ready`→stale banner + search `UiInput` + `RolesTable` (paged role list) + `RoleMatrix` (the role × permission matrix over the full role list × permission catalog). `definePageMeta` is kept verbatim (already asserted in `route-map.spec.ts:55`).

This is the **read + structure** surface only. The four Roles writes (create / edit-metadata / sync-permissions / delete) are **stub open-dialog hooks** here — they set local intent state but call **no** API; they are wired through `usePrivilegedAction` + `PrivilegedActionDialog`/`RoleFormDialog` in Tasks 7.8–7.10. So **the privileged-action failure matrix (401/403/419/422/428/429/5xx + step-up) does NOT belong to this task** — it is covered in 7.8/7.9/7.10 where each write is actually wired. What 7.7 owns: rendering all six states, permission gating (`canWrite`/`canDelete`), the page-owned pending `RoleGrantMap` + `dirtyRoleSlugs` driven by the matrix `toggle`, search/pagination wiring, and the no-token/no-PII hydration assertion.

The page renders the `data-admin-shell` sentinel on its root **in addition to** `data-page="roles"`, so the Task-7.11 SSR leak gate's `expect(html).toContain('data-admin-shell')` holds for `/roles` independent of layout nesting (the `admin.vue` layout also carries it — the page test mounts without the layout, so the page must carry its own sentinel; both coexisting is harmless, `find('[data-admin-shell]')` returns the first).

The matrix protection of **system / built-in roles** (`is_system === true` → no editable switch, read-only `UiStatusBadge` cell, no Edit/Delete affordance) lives inside `RolesTable` (7.5) + `RoleMatrix` (7.6); 7.7 only feeds them the unfiltered `is_system` flag and the gating booleans.

**Files**
- Modify: `services/sso-admin-frontend/app/pages/roles.vue` (replace the `<h1>Roles</h1>` stub body; keep `definePageMeta`)
- Modify: `services/sso-admin-frontend/app/locales/id.json`, `services/sso-admin-frontend/app/locales/en.json` (ADD only the genuinely-new keys below, inside the existing `"roles"` block; the `roles.*` keys listed in the foundation extract ALREADY EXIST — reuse them, do not re-add)
- Test: `services/sso-admin-frontend/app/pages/__tests__/roles.page.nuxt.spec.ts`
- (Unchanged, must stay green) `services/sso-admin-frontend/app/pages/__tests__/route-map.spec.ts` — asserts the meta `name`/`layout`/`permissions`/`requiresAdmin` by source-string match.

**Interfaces**
- Consumes: `useRolesList` (7.4) + `usePermissionCatalog` (7.4); `RolesTable` (7.5) + `RoleMatrix` (7.6) from `@/components/roles/*`; `buildRoleGrantMap`/`togglePendingGrant`/`diffRoleGrants` + `RoleGrantMap` from `@/lib/roles/roles-matrix` (7.2); `useSessionStore` (`principal.display_name`, `hasPermission`) from `@/stores/session.store`; `UiStatusView`/`UiSkeleton`/`UiEmptyState`/`UiInput`/`UiButton`/`UiFolio` from `@/components/ui/*`; `useI18n` `roles.*` + `common.*` keys; `AdminRole`/`AdminPermission` from `@/types/users.types`; `useAsyncData` (Nuxt auto-import). `RolesTable` carries the same UiDataList pagination passthrough as `UsersTable` (`total`/`page`/`page-count`/`next-label`/`previous-label` props + `next`/`previous` emits — it is a copy-and-adapt of `UsersTable.vue`). `formatSupportReference` is **not** imported by the page (request-id redaction to `REF-…` is done inside `UiStatusView`); importing it unused would fail `lint`.
- Produces (`app/pages/roles.vue`): the rendered `/roles` route. `definePageMeta({ name: 'admin.roles', layout: 'admin', requiresAdmin: true, permissions: ['admin.roles.read'] })` (unchanged). Renders `data-page="roles"` + `data-admin-shell`; principal via `useAsyncData('admin-roles-principal', () => store.ensureSession())`; `useRolesList()` + `usePermissionCatalog()`; the six-state switch; search bound to `query`; pagination via `next`/`previous`; stale banner; `canWrite = computed(() => store.hasPermission('admin.roles.write'))`, `canDelete = computed(() => store.hasPermission('admin.roles.write') && store.hasPermission('admin.sessions.terminate'))`; page-owned pending `RoleGrantMap` (`pendingGrants`, seeded from `buildRoleGrantMap`) + `dirtyRoleSlugs` (`computed` via `diffRoleGrants`); `onMatrixToggle` updates `pendingGrants` via `togglePendingGrant`; a page-level `successMessage` ref + a single `aria-live` `data-testid="roles-action-success"` region (reused by 7.8–7.10 — no toast component exists); create button gated on `canWrite`; the canonical write handlers `openCreate` / `openEdit` / `onManagePermissions` / `onMatrixSave` / `onDeleteRequested` / `onSelectRole` are **stub open-dialog hooks** here (no API) whose bodies 7.8–7.10 replace in place (never rename). **No exported API.**
- New locale keys (BOTH `id` + `en`, inside the existing `"roles"` block): `signed_in_as`, `search_placeholder`, `label_search`, `page_next`, `page_previous`, `col_permission`, `col_category`, `granted`, `denied`.

**Steps**

1. [ ] Write the failing test `app/pages/__tests__/roles.page.nuxt.spec.ts` (real behaviour, mocked at the data + store boundaries; the matrix grant-map helpers run for real — `*.nuxt.spec.ts` routes to the `nuxt` env where `mountSuspended` + `mockNuxtImport` are available):

```ts
// *.nuxt.spec.ts → 'nuxt' env: mountSuspended drives the page's async setup
// (useAsyncData('admin-roles-principal') + useI18n auto-imports). The two list
// composables + the session store are mocked so each state is deterministic and
// no real network runs; the pure grant-map helpers (buildRoleGrantMap/isGranted/
// togglePendingGrant/diffRoleGrants) run for real so the dirty-tracking wiring is
// exercised end to end.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiInput from '@/components/ui/UiInput.vue'
import RolesTable from '@/components/roles/RolesTable.vue'
import RoleMatrix from '@/components/roles/RoleMatrix.vue'
import { isGranted, type RoleGrantMap } from '@/lib/roles/roles-matrix'
import type { AdminPermission, AdminRole } from '@/types/users.types'
import type { RolesViewState } from '@/lib/roles/roles-view-state'

// Sample rows read clearly as samples. One protected system role + one custom role.
const systemRole: AdminRole = {
  id: 1,
  slug: 'admin',
  name: 'Administrator',
  description: null,
  is_system: true,
  permissions: [{ slug: 'admin.roles.read', name: 'Read roles', category: 'roles' }],
  user_count: 3,
  users_count: 3,
}
const customRole: AdminRole = {
  id: 2,
  slug: 'editor',
  name: 'Editor',
  description: 'Content editor',
  is_system: false,
  permissions: [],
  user_count: 1,
  users_count: 1,
}
const samplePermissions: readonly AdminPermission[] = [
  { slug: 'admin.roles.read', name: 'Read roles', description: 'View role catalog', category: 'roles' },
  { slug: 'admin.roles.write', name: 'Write roles', description: 'Manage roles', category: 'roles' },
]

// useRolesList mock surface
const roles = ref<readonly AdminRole[] | null>(null)
const paged = ref<readonly AdminRole[]>([])
const viewState = ref<RolesViewState>('loading')
const requestId = ref<string | null>(null)
const total = ref(0)
const filteredTotal = ref(0)
const page = ref(1)
const pageCount = ref(1)
const query = ref('')
const isStale = ref(false)
const refreshMock = vi.fn<() => Promise<void>>(async () => {})

vi.mock('@/composables/useRolesList', () => ({
  useRolesList: () => ({
    roles,
    filtered: ref([]),
    paged,
    viewState,
    total,
    filteredTotal,
    page,
    pageCount,
    query,
    requestId,
    isStale,
    pending: ref(false),
    refresh: refreshMock,
  }),
}))

// usePermissionCatalog mock surface
const permissions = ref<readonly AdminPermission[] | null>(null)
vi.mock('@/composables/usePermissionCatalog', () => ({
  usePermissionCatalog: () => ({
    permissions,
    viewState: ref<RolesViewState>('ready'),
    isStale: ref(false),
    requestId: ref<string | null>(null),
    pending: ref(false),
    refresh: vi.fn<() => Promise<void>>(async () => {}),
  }),
}))

const canWrite = ref(true)
const canTerminate = ref(true)
vi.mock('@/stores/session.store', () => ({
  useSessionStore: () => ({
    principal: { display_name: 'Admin Sentinel' },
    ensureSession: vi.fn<() => Promise<string>>(async () => 'authenticated'),
    hasPermission: (permission: string) => {
      if (permission === 'admin.roles.write') return canWrite.value
      if (permission === 'admin.sessions.terminate') return canTerminate.value
      return true
    },
  }),
}))

const RolesPage = (await import('../roles.vue')).default

beforeEach(() => {
  roles.value = null
  paged.value = []
  viewState.value = 'loading'
  requestId.value = null
  total.value = 0
  filteredTotal.value = 0
  page.value = 1
  pageCount.value = 1
  query.value = ''
  isStale.value = false
  permissions.value = null
  canWrite.value = true
  canTerminate.value = true
  vi.clearAllMocks()
})
afterEach(() => vi.clearAllMocks())

describe('roles page', () => {
  it('always renders the masked principal hero + sentinels, regardless of state', async () => {
    const wrapper = await mountSuspended(RolesPage)
    expect(wrapper.find('[data-page="roles"]').exists()).toBe(true)
    expect(wrapper.find('[data-admin-shell]').exists()).toBe(true)
    const principal = wrapper.find('[data-principal-name]')
    expect(principal.exists()).toBe(true)
    expect(principal.text()).toContain('Admin Sentinel')
    expect(wrapper.html()).not.toMatch(/access_token|refresh_token|id_token|Bearer|SENTINEL-/)
  })

  it('loading → skeleton, no table/matrix', async () => {
    viewState.value = 'loading'
    const wrapper = await mountSuspended(RolesPage)
    expect(wrapper.findComponent(UiSkeleton).exists()).toBe(true)
    expect(wrapper.findComponent(RolesTable).exists()).toBe(false)
    expect(wrapper.findComponent(RoleMatrix).exists()).toBe(false)
  })

  it('forbidden → forbidden status view (distinct from empty), raw request id redacted', async () => {
    viewState.value = 'forbidden'
    requestId.value = 'admin-req-DENIED42'
    const wrapper = await mountSuspended(RolesPage)
    expect(wrapper.findComponent(UiStatusView).props('tone')).toBe('forbidden')
    expect(wrapper.findComponent(UiEmptyState).exists()).toBe(false)
    expect(wrapper.text()).not.toContain('admin-req-DENIED42')
  })

  it('unauthenticated → step_up status view', async () => {
    viewState.value = 'unauthenticated'
    const wrapper = await mountSuspended(RolesPage)
    expect(wrapper.findComponent(UiStatusView).props('tone')).toBe('step_up')
  })

  it('error → error status view with a refresh action; raw request id redacted to REF-', async () => {
    viewState.value = 'error'
    requestId.value = 'admin-req-FAILED99'
    const wrapper = await mountSuspended(RolesPage)
    expect(wrapper.findComponent(UiStatusView).props('tone')).toBe('error')
    expect(wrapper.text()).toContain('REF-')
    expect(wrapper.text()).not.toContain('admin-req-FAILED99')
    await wrapper.find('[data-testid="roles-refresh"]').trigger('click')
    expect(refreshMock).toHaveBeenCalledTimes(1)
  })

  it('empty → empty state, not a status view', async () => {
    viewState.value = 'empty'
    const wrapper = await mountSuspended(RolesPage)
    expect(wrapper.findComponent(UiEmptyState).exists()).toBe(true)
    expect(wrapper.findComponent(UiStatusView).exists()).toBe(false)
  })

  it('ready → search input + RolesTable (paged) + RoleMatrix (full roles × permissions), no token/PII', async () => {
    viewState.value = 'ready'
    roles.value = [systemRole, customRole]
    paged.value = [systemRole, customRole]
    permissions.value = samplePermissions
    total.value = 2
    filteredTotal.value = 2
    const wrapper = await mountSuspended(RolesPage)
    expect(wrapper.findComponent(UiInput).exists()).toBe(true)
    const table = wrapper.findComponent(RolesTable)
    const matrix = wrapper.findComponent(RoleMatrix)
    expect(table.exists()).toBe(true)
    expect(matrix.exists()).toBe(true)
    expect(table.props('roles')).toHaveLength(2)
    expect(matrix.props('roles')).toHaveLength(2)
    expect(matrix.props('permissions')).toHaveLength(2)
    // Matrix grants are seeded from buildRoleGrantMap: admin holds admin.roles.read.
    const grants = matrix.props('grants') as RoleGrantMap
    expect(isGranted(grants, 'admin', 'admin.roles.read')).toBe(true)
    expect(isGranted(grants, 'editor', 'admin.roles.read')).toBe(false)
    expect(wrapper.html()).not.toMatch(/access_token|Bearer|SENTINEL-/)
    expect(wrapper.html()).not.toMatch(/\d{16}|\d{18}|\d{10}/)
  })

  it('canWrite gates the create button + RolesTable/RoleMatrix write affordance', async () => {
    viewState.value = 'ready'
    roles.value = [customRole]
    paged.value = [customRole]
    permissions.value = samplePermissions
    canWrite.value = true
    const allowed = await mountSuspended(RolesPage)
    expect(allowed.find('[data-testid="roles-create"]').exists()).toBe(true)
    expect(allowed.findComponent(RolesTable).props('canWrite')).toBe(true)
    expect(allowed.findComponent(RoleMatrix).props('canWrite')).toBe(true)
    canWrite.value = false
    const denied = await mountSuspended(RolesPage)
    expect(denied.find('[data-testid="roles-create"]').exists()).toBe(false)
    expect(denied.findComponent(RolesTable).props('canWrite')).toBe(false)
    expect(denied.findComponent(RoleMatrix).props('canWrite')).toBe(false)
  })

  it('canDelete requires admin.roles.write AND admin.sessions.terminate', async () => {
    viewState.value = 'ready'
    roles.value = [customRole]
    paged.value = [customRole]
    permissions.value = samplePermissions
    canWrite.value = true
    canTerminate.value = true
    const both = await mountSuspended(RolesPage)
    expect(both.findComponent(RolesTable).props('canDelete')).toBe(true)
    canTerminate.value = false
    const noTerminate = await mountSuspended(RolesPage)
    expect(noTerminate.findComponent(RolesTable).props('canDelete')).toBe(false)
  })

  it('matrix toggle updates the page-owned pending grants + marks the role dirty', async () => {
    viewState.value = 'ready'
    roles.value = [customRole]
    paged.value = [customRole]
    permissions.value = samplePermissions
    const wrapper = await mountSuspended(RolesPage)
    const matrix = wrapper.findComponent(RoleMatrix)
    expect(matrix.props('dirtyRoleSlugs')).toEqual([])
    matrix.vm.$emit('toggle', {
      roleSlug: 'editor',
      permissionSlug: 'admin.roles.write',
      granted: true,
    })
    await nextTick()
    const grants = matrix.props('grants') as RoleGrantMap
    expect(isGranted(grants, 'editor', 'admin.roles.write')).toBe(true)
    expect(matrix.props('dirtyRoleSlugs')).toContain('editor')
  })

  it('write affordances are stub hooks here — emitting save/delete/edit calls no API', async () => {
    viewState.value = 'ready'
    roles.value = [customRole]
    paged.value = [customRole]
    permissions.value = samplePermissions
    const wrapper = await mountSuspended(RolesPage)
    // These are wired in 7.8–7.10; in 7.7 they must not throw and must not refresh
    // the list (no API path exists yet).
    wrapper.findComponent(RoleMatrix).vm.$emit('save', 'editor')
    wrapper.findComponent(RolesTable).vm.$emit('edit', customRole)
    wrapper.findComponent(RolesTable).vm.$emit('delete', customRole)
    wrapper.findComponent(RolesTable).vm.$emit('managePermissions', customRole)
    await nextTick()
    expect(refreshMock).not.toHaveBeenCalled()
  })
})
```

2. [ ] Run it — expect **FAIL** (the stub renders only `<h1>Roles</h1>`: no `[data-page="roles"]`, no `[data-admin-shell]`, no skeleton/status-view/empty-state, no `RolesTable`/`RoleMatrix`, no search input):
   `cd services/sso-admin-frontend && npm run test -- app/pages/__tests__/roles.page.nuxt.spec.ts`

3. [ ] Add the new i18n keys. In `app/locales/id.json` inside the existing `"roles"` block add:

```json
"signed_in_as": "Masuk sebagai {name}",
"search_placeholder": "Cari peran",
"label_search": "Cari peran",
"page_next": "Berikutnya",
"page_previous": "Sebelumnya",
"col_permission": "Izin",
"col_category": "Kategori",
"granted": "Diberikan",
"denied": "Ditolak"
```

   In `app/locales/en.json` inside the existing `"roles"` block add:

```json
"signed_in_as": "Signed in as {name}",
"search_placeholder": "Search roles",
"label_search": "Search roles",
"page_next": "Next",
"page_previous": "Previous",
"col_permission": "Permission",
"col_category": "Category",
"granted": "Granted",
"denied": "Denied"
```

4. [ ] Implement `app/pages/roles.vue` (FULL body replacement; keep the existing `definePageMeta`):

```vue
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { AlertTriangle } from 'lucide-vue-next'
import { useSessionStore } from '@/stores/session.store'
import { useI18n } from '@/composables/useI18n'
import { useRolesList } from '@/composables/useRolesList'
import { usePermissionCatalog } from '@/composables/usePermissionCatalog'
import {
  buildRoleGrantMap,
  diffRoleGrants,
  togglePendingGrant,
  type RoleGrantMap,
} from '@/lib/roles/roles-matrix'
import type { AdminPermission, AdminRole } from '@/types/users.types'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiFolio from '@/components/ui/UiFolio.vue'
import RolesTable from '@/components/roles/RolesTable.vue'
import RoleMatrix from '@/components/roles/RoleMatrix.vue'

definePageMeta({
  name: 'admin.roles',
  layout: 'admin',
  requiresAdmin: true,
  permissions: ['admin.roles.read'],
})

const { t } = useI18n()

// SAFE HYDRATION: resolve the masked principal server-side (display name, role,
// capability flags only). OIDC tokens stay in Nitro event.context and are never
// written to useState / __NUXT__. The roles + permission DTOs carry only slugs,
// names, descriptions and counts — no token/secret/PII.
const store = useSessionStore()
await useAsyncData('admin-roles-principal', () => store.ensureSession())

const {
  roles,
  paged,
  viewState,
  requestId,
  total,
  filteredTotal,
  page,
  pageCount,
  query,
  isStale,
  refresh,
} = useRolesList()

const { permissions } = usePermissionCatalog()

const canWrite = computed<boolean>(() => store.hasPermission('admin.roles.write'))
// Delete is the high-privilege exception: the backend route requires ROLES_WRITE
// AND SESSIONS_TERMINATE (+ admin-session-management role + :step_up freshness),
// so the affordance is double-gated; the backend re-checks regardless.
const canDelete = computed<boolean>(
  () => store.hasPermission('admin.roles.write') && store.hasPermission('admin.sessions.terminate'),
)

const roleList = computed<readonly AdminRole[]>(() => roles.value ?? [])
const permissionList = computed<readonly AdminPermission[]>(() => permissions.value ?? [])

// Page-owned pending grant state. originalGrants is the server snapshot; pending
// is the in-flight edit map; dirtyRoleSlugs drives which column's Save is enabled.
const originalGrants = computed<RoleGrantMap>(() => buildRoleGrantMap(roleList.value))
const pendingGrants = ref<RoleGrantMap>(buildRoleGrantMap(roleList.value))
watch(originalGrants, (next) => {
  pendingGrants.value = next
}, { immediate: true })

const dirtyRoleSlugs = computed<readonly string[]>(() =>
  roleList.value
    .filter(
      (role) =>
        diffRoleGrants(
          originalGrants.value.get(role.slug) ?? new Set<string>(),
          pendingGrants.value.get(role.slug) ?? new Set<string>(),
        ).changed,
    )
    .map((role) => role.slug),
)

// Page-level success feedback (no toast component exists in this app). 7.8/7.9/7.10
// each set `successMessage.value = t('roles.<x>_success')` and REUSE the single
// aria-live region below — they do not add their own success markup.
const successMessage = ref<string | null>(null)

function onMatrixToggle(payload: { roleSlug: string; permissionSlug: string; granted: boolean }): void {
  pendingGrants.value = togglePendingGrant(
    pendingGrants.value,
    payload.roleSlug,
    payload.permissionSlug,
    payload.granted,
  )
}

// Canonical handler names — declared ONCE here. Tasks 7.8–7.10 REPLACE the body of
// the matching handler (openCreate/openEdit · onMatrixSave · onDeleteRequested ·
// onSelectRole) without renaming, so every @event binding keeps resolving.
function openCreate(): void {
  /* open create-role dialog (Task 7.8) */
}
function openEdit(_role: AdminRole): void {
  /* open edit-metadata dialog (Task 7.8) */
}
function onManagePermissions(_role: AdminRole): void {
  /* Intentional no-op anchor this phase: the role × permission matrix below is the
     always-visible edit surface (toggle a cell, then save per role). No per-role
     focus state is wired in Phase 7. */
}
function onMatrixSave(_roleSlug: string): void {
  /* open sync-permissions confirm (Task 7.9) */
}
function onDeleteRequested(_role: AdminRole): void {
  /* open delete confirm (Task 7.10) */
}
function onSelectRole(_slug: string): void {
  /* open role detail drawer (deferred) */
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
  <section class="roles" data-page="roles" data-admin-shell>
    <header class="roles__hero">
      <span class="roles__eyebrow">{{ t('roles.eyebrow') }}</span>
      <div class="roles__heading">
        <div class="roles__heading-text">
          <h1 class="roles__title">{{ t('roles.title') }}</h1>
          <p class="roles__summary">{{ t('roles.summary') }}</p>
          <p class="roles__principal" data-principal-name>
            {{ t('roles.signed_in_as', { name: store.principal?.display_name ?? '—' }) }}
          </p>
        </div>
        <UiButton
          v-if="canWrite"
          variant="primary"
          size="sm"
          data-testid="roles-create"
          @click="openCreate"
        >
          {{ t('roles.btn_create_role') }}
        </UiButton>
      </div>
      <dl v-if="total > 0" class="roles__evidence">
        <dt>{{ t('roles.title') }}</dt>
        <dd><UiFolio :index="filteredTotal" :total="total" /></dd>
      </dl>
    </header>

    <!-- Single page-level success region — reused by create/edit/sync/delete (7.8–7.10). -->
    <p
      v-if="successMessage"
      class="roles__success"
      role="status"
      aria-live="polite"
      data-testid="roles-action-success"
    >
      {{ successMessage }}
    </p>

    <UiSkeleton v-if="viewState === 'loading'" :rows="6" :label="t('roles.loading')" />

    <UiStatusView
      v-else-if="viewState === 'forbidden'"
      tone="forbidden"
      :eyebrow="t('roles.eyebrow')"
      :title="t('roles.forbidden_title')"
      :description="t('common.forbidden_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="viewState === 'unauthenticated'"
      tone="step_up"
      :eyebrow="t('roles.eyebrow')"
      :title="t('common.session_expired_title')"
      :description="t('common.session_expired_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="viewState === 'error'"
      tone="error"
      :eyebrow="t('roles.eyebrow')"
      :title="t('roles.error_title')"
      :description="t('common.error_loading_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    >
      <template #actions>
        <UiButton variant="secondary" size="sm" data-testid="roles-refresh" @click="onRefresh">
          {{ t('common.btn_refresh') }}
        </UiButton>
      </template>
    </UiStatusView>

    <UiEmptyState
      v-else-if="viewState === 'empty'"
      :title="t('roles.empty_title')"
      :description="t('roles.empty_desc')"
    >
      <template #action>
        <UiButton variant="secondary" size="sm" @click="onRefresh">
          {{ t('common.btn_refresh') }}
        </UiButton>
      </template>
    </UiEmptyState>

    <template v-else>
      <div v-if="isStale" class="roles__banner" role="status">
        <AlertTriangle :size="16" aria-hidden="true" />
        <span>{{ t('common.error_loading_desc') }}</span>
      </div>

      <div class="roles__controls">
        <UiInput
          v-model="query"
          class="roles__search"
          :placeholder="t('roles.search_placeholder')"
          :aria-label="t('roles.label_search')"
        />
      </div>

      <RolesTable
        :roles="paged"
        :caption="t('roles.list_title')"
        :role-label="t('roles.col_role')"
        :users-label="t('roles.col_users')"
        :status-label="t('roles.col_status')"
        :system-label="t('roles.system_role')"
        :custom-label="t('roles.custom_role')"
        :edit-label="t('roles.btn_edit')"
        :manage-permissions-label="t('roles.btn_manage_permissions')"
        :delete-label="t('roles.btn_delete')"
        :can-write="canWrite"
        :can-delete="canDelete"
        :total="filteredTotal"
        :page="page"
        :page-count="pageCount"
        :next-label="t('roles.page_next')"
        :previous-label="t('roles.page_previous')"
        @select="onSelectRole"
        @edit="openEdit"
        @manage-permissions="onManagePermissions"
        @delete="onDeleteRequested"
        @next="onNext"
        @previous="onPrevious"
      />

      <RoleMatrix
        :roles="roleList"
        :permissions="permissionList"
        :grants="pendingGrants"
        :dirty-role-slugs="dirtyRoleSlugs"
        :caption="t('roles.matrix_title')"
        :permission-label="t('roles.col_permission')"
        :category-label="t('roles.col_category')"
        :granted-label="t('roles.granted')"
        :denied-label="t('roles.denied')"
        :save-label="t('roles.btn_save')"
        :can-write="canWrite"
        @toggle="onMatrixToggle"
        @save="onMatrixSave"
      />
    </template>
  </section>
</template>

<style scoped>
.roles {
  display: grid;
  gap: 24px;
  padding: 24px;
}
.roles__hero {
  display: grid;
  gap: 6px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border);
}
.roles__eyebrow {
  font: 600 0.6875rem/1 var(--font-sans);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.roles__heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.roles__heading-text {
  display: grid;
  gap: 6px;
}
.roles__title {
  margin: 0;
  font: 600 1.5rem/1.2 var(--font-sans);
  letter-spacing: -0.02em;
  color: var(--fg);
}
.roles__summary {
  margin: 0;
  max-width: 64ch;
  font: 400 0.875rem/1.6 var(--font-sans);
  color: var(--fg-2);
}
.roles__principal {
  margin: 0;
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--fg-2);
}
.roles__success {
  margin: 0;
  padding: 10px 14px;
  font: 500 0.8125rem/1.4 var(--font-sans);
  color: var(--fg);
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
}
.roles__evidence {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 4px 0 0;
}
.roles__evidence dt {
  font: 600 0.625rem/1 var(--font-sans);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.roles__evidence dd {
  margin: 0;
}
.roles__banner {
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
.roles__controls {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.roles__search {
  flex: 1 1 280px;
}
</style>
```

5. [ ] Run the page test + the route-map guard test — expect **PASS** for both:
   `cd services/sso-admin-frontend && npm run test -- app/pages/__tests__/roles.page.nuxt.spec.ts app/pages/__tests__/route-map.spec.ts`

6. [ ] Refactor pass (keep tests green): confirm tokens-only (no hard-coded colours), no shadows as structure (1px hairline), the single accent `--accent` stays on the create `UiButton`, **`#E4002B` / `--danger` is NOT introduced on this read surface** (delete is danger but its red lives on the affordance inside `RolesTable`, wired in 7.10 — not here), status renders via `RolesTable`/`RoleMatrix` `UiStatusBadge` (tone + label, never colour-alone), counts render via `UiFolio`, and the stub write handlers call **no** API. Re-run step 5 after any change.

7. [ ] Commit:
   `cd services/sso-admin-frontend && git add app/pages/roles.vue app/locales/id.json app/locales/en.json app/pages/__tests__/roles.page.nuxt.spec.ts && git commit -m "$(printf 'feat(sso-admin-frontend): compose Swiss roles page (all states, list + matrix, permission-gated)\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"`

**Deliverable:** the live `/roles` page rendering all six states server-side with the role list + editable matrix, `canWrite`/`canDelete`-gated affordances, page-owned pending `RoleGrantMap` + `dirtyRoleSlugs` driven by the matrix `toggle`, and search/pagination — write actions hidden/shown but stubbed (wired in 7.8–7.10), with the no-token/no-PII hydration assertion green.

**Task-scoped DoD (run from `services/sso-admin-frontend`; report any blocked command explicitly, never claim PASS for a command that did not run):**
`npm run typecheck && npm run lint && npm run format:check && npm run test -- app/pages/__tests__/roles.page.nuxt.spec.ts app/pages/__tests__/route-map.spec.ts` — where `npm run lint` is `run-s lint:*` and runs BOTH `lint:oxlint` (`oxlint .`) AND `lint:eslint` (`eslint "src/**/*.vue" "app/**/*.vue" --cache`); both must pass.

---

### Task 7.8: Create + edit-metadata role forms (`RoleFormDialog.vue`) + write actions

Pure form validation first, then the dialog over `UiDialog` + `UiFormField` (no
custom modal-overlay markup — the legacy `ui-modal` anti-pattern is dropped;
`UiDialog` already owns the overlay/portal), then the two write actions wired
into the page through the **reused** `usePrivilegedAction`. Both writes are
privileged: `POST /admin/api/roles` (HTTP **201**) and `PATCH
/admin/api/roles/{slug}`, each `ROLES_WRITE` · `:write` freshness → the full
`401/403/419/422/428/429/5xx` + step-up matrix. This task wires the create/edit
*forms* only; sync-permissions (7.9) and delete (7.10) come next.

> **Concrete choices made (no architect blocker):**
> 1. **No toast infrastructure exists in this app** (verified: zero `useToast`/
>    `Toast` in `app/`). Success REUSES the single page-level `successMessage` ref
>    + the `role="status" aria-live="polite"` region (`data-testid="roles-action-success"`)
>    **already declared in Task 7.7** — this task only sets
>    `successMessage.value = t('roles.roles_create_success' | 'roles.roles_update_success')`
>    on success; it adds **no** new success markup and does **not** re-declare the ref
>    (same primitive as the existing stale banner, `users/index.vue:169`).
> 2. `validateCreateRole`/`validateUpdateRole` return **human-readable English
>    fallback messages** in `RoleFormFieldErrors` (the type is `string|undefined`,
>    and the same shape carries Laravel's human 422 field messages from the
>    server) — so the dialog renders client and server errors uniformly.
> 3. Add ONE genuinely-new locale key `roles.btn_step_up` to **both** catalogs
>    (the re-auth link label inside the dialog; no `roles.*` step-up key exists,
>    and reusing `users.btn_step_up` would cross domain blocks).
> 4. **404 (unknown slug / concurrently deleted role) is out of the explicit
>    matrix** here and in 7.9/7.10: writes are only offered on already-hydrated
>    roles, so a 404 degrades to the generic error surface (`error` status → safe
>    copy + redacted `REF-…`) like any other non-mapped status — it is not an
>    uncovered case, just the generic branch.

**Files**
- Create: `app/lib/roles/role-form.ts`
- Create: `app/components/roles/RoleFormDialog.vue`
- Edit: `app/pages/roles.vue` (replace the 7.7 stubbed `openCreate`/`openEdit` hooks with the wired create + update flow; mount `RoleFormDialog`)
- Edit: `app/locales/en.json` + `app/locales/id.json` (add `roles.btn_step_up`)
- Test: `app/lib/roles/__tests__/role-form.spec.ts`
- Test: `app/components/roles/__tests__/RoleFormDialog.nuxt.spec.ts`
- Test: `app/pages/__tests__/roles-create-update.page.nuxt.spec.ts`

**Interfaces**
- Consumes:
  - `usePrivilegedAction` from `@/composables/usePrivilegedAction` (`run(runner): Promise<T|null>`, `status`, `isSubmitting`, `failure`, `requestId`, `auditEventId`, `fieldErrors`, `stepUpUrl`, `reset` — reused as-is, one instance per action).
  - `rolesApi.store` / `rolesApi.update` from `@/services/roles.api` (Task 7.3).
  - `validateCreateRole` / `validateUpdateRole` from `@/lib/roles/role-form` (this task).
  - `CreateRolePayload` / `UpdateRolePayload` / `RoleMutationResponse` / `AdminRole` from `@/types/users.types` (Task 7.1 / existing).
  - `UiDialog` / `UiFormField` / `UiInput` / `UiTextarea` / `UiButton` from `@/components/ui/*`.
  - `formatSupportReference` from `@/lib/display-identifiers`.
- Produces (`app/lib/roles/role-form.ts`):
  - `type RoleFormFieldErrors = Readonly<Record<'slug' | 'name' | 'description', string | undefined>>`
  - `function validateCreateRole(input: { slug: string; name: string; description: string }): { readonly valid: boolean; readonly fieldErrors: RoleFormFieldErrors; readonly payload: CreateRolePayload | null }` (slug required + `/^[a-z0-9][a-z0-9_-]*$/` + max 64; name required + max 120; description trimmed `|| null`, max 255)
  - `function validateUpdateRole(input: { name: string; description: string }): { readonly valid: boolean; readonly fieldErrors: RoleFormFieldErrors; readonly payload: UpdateRolePayload | null }` (name required; slug not editable/validated)
- Produces (`app/components/roles/RoleFormDialog.vue`) — props: `open: boolean`, `mode: 'create' | 'edit'`, `role?: AdminRole | null`, the label props (`createTitle`, `editTitle`, `slugLabel`, `nameLabel`, `descriptionLabel`, `saveLabel`, `cancelLabel`, `stepUpLabel`), `submitting: boolean`, `fieldErrors?: RoleFormFieldErrors`, `errorMessage?: string | null`, `requestId?: string | null`, `stepUpUrl?: string | null`; emits `submit(payload: CreateRolePayload | UpdateRolePayload)`, `cancel`. Slug input disabled in edit mode. Built over `UiDialog` + `UiFormField` + `UiInput`/`UiTextarea` — no custom modal-overlay markup.
- Produces (`app/pages/roles.vue`): two `usePrivilegedAction<RoleMutationResponse>` instances (create + update); `run(() => rolesApi.store(payload))` (201) and `run(() => rolesApi.update(slug, payload))`; on success close the dialog, call `useRolesList().refresh()`, set the success notice; step-up surfaced on 428 via the dialog `stepUpUrl` prop.

---

#### Step 1 — RED: pure form validation (`role-form.spec.ts`)

- [ ] Write `app/lib/roles/__tests__/role-form.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { validateCreateRole, validateUpdateRole } from '@/lib/roles/role-form'

describe('validateCreateRole', () => {
  it('accepts a valid role and returns a trimmed payload with null description when blank', () => {
    const r = validateCreateRole({ slug: '  support-agent ', name: '  Support Agent  ', description: '   ' })
    expect(r.valid).toBe(true)
    expect(r.fieldErrors).toEqual({ slug: undefined, name: undefined, description: undefined })
    expect(r.payload).toEqual({ slug: 'support-agent', name: 'Support Agent', description: null })
  })

  it('trims and keeps a non-empty description', () => {
    const r = validateCreateRole({ slug: 'ops', name: 'Ops', description: '  read only access  ' })
    expect(r.payload).toEqual({ slug: 'ops', name: 'Ops', description: 'read only access' })
  })

  it('rejects a blank slug', () => {
    const r = validateCreateRole({ slug: '   ', name: 'Ops', description: '' })
    expect(r.valid).toBe(false)
    expect(r.fieldErrors.slug).toBeDefined()
    expect(r.payload).toBeNull()
  })

  it('rejects a slug that breaks the pattern (uppercase / leading hyphen)', () => {
    expect(validateCreateRole({ slug: 'Ops', name: 'Ops', description: '' }).fieldErrors.slug).toBeDefined()
    expect(validateCreateRole({ slug: '-ops', name: 'Ops', description: '' }).fieldErrors.slug).toBeDefined()
  })

  it('rejects a slug over 64 chars', () => {
    const r = validateCreateRole({ slug: 'a'.repeat(65), name: 'Ops', description: '' })
    expect(r.fieldErrors.slug).toBeDefined()
    expect(r.valid).toBe(false)
  })

  it('rejects a blank name and a name over 120 chars', () => {
    expect(validateCreateRole({ slug: 'ops', name: '   ', description: '' }).fieldErrors.name).toBeDefined()
    expect(validateCreateRole({ slug: 'ops', name: 'n'.repeat(121), description: '' }).fieldErrors.name).toBeDefined()
  })

  it('rejects a description over 255 chars', () => {
    const r = validateCreateRole({ slug: 'ops', name: 'Ops', description: 'd'.repeat(256) })
    expect(r.fieldErrors.description).toBeDefined()
    expect(r.valid).toBe(false)
  })
})

describe('validateUpdateRole', () => {
  it('validates name only and never reports a slug error', () => {
    const r = validateUpdateRole({ name: 'Renamed Ops', description: 'desc' })
    expect(r.valid).toBe(true)
    expect(r.fieldErrors.slug).toBeUndefined()
    expect(r.payload).toEqual({ name: 'Renamed Ops', description: 'desc' })
  })

  it('clears description to null when blank', () => {
    expect(validateUpdateRole({ name: 'Ops', description: '   ' }).payload).toEqual({ name: 'Ops', description: null })
  })

  it('rejects a blank name', () => {
    const r = validateUpdateRole({ name: '  ', description: '' })
    expect(r.valid).toBe(false)
    expect(r.fieldErrors.name).toBeDefined()
    expect(r.payload).toBeNull()
  })
})
```

- [ ] Run it — expect FAIL (module missing):

```
npm run test -- app/lib/roles/__tests__/role-form.spec.ts
# EXPECT: FAIL — Cannot find module '@/lib/roles/role-form' (or 0 tests collected)
```

#### Step 2 — GREEN: implement `role-form.ts`

- [ ] Write `app/lib/roles/role-form.ts`:

```ts
import type { CreateRolePayload, UpdateRolePayload } from '@/types/users.types'

// Pure form validation for the role create / edit-metadata dialog. Mirrors the
// backend StoreManagedRole / UpdateManagedRole rules (slug regex + max64, name
// max120, description max255) so the dialog fails fast before a round-trip; the
// server stays the authority. Messages are human-readable fallbacks (the same
// RoleFormFieldErrors shape also carries Laravel's 422 field messages).
export type RoleFormFieldErrors = Readonly<Record<'slug' | 'name' | 'description', string | undefined>>

const SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]*$/
const SLUG_MAX = 64
const NAME_MAX = 120
const DESCRIPTION_MAX = 255

const MESSAGES = {
  slugRequired: 'Slug is required.',
  slugPattern:
    'Slug must start with a lowercase letter or number and use only lowercase letters, numbers, hyphens, or underscores.',
  slugTooLong: `Slug must be ${SLUG_MAX} characters or fewer.`,
  nameRequired: 'Name is required.',
  nameTooLong: `Name must be ${NAME_MAX} characters or fewer.`,
  descriptionTooLong: `Description must be ${DESCRIPTION_MAX} characters or fewer.`,
} as const

function slugError(slug: string): string | undefined {
  if (!slug) return MESSAGES.slugRequired
  if (slug.length > SLUG_MAX) return MESSAGES.slugTooLong
  if (!SLUG_PATTERN.test(slug)) return MESSAGES.slugPattern
  return undefined
}

function nameError(name: string): string | undefined {
  if (!name) return MESSAGES.nameRequired
  if (name.length > NAME_MAX) return MESSAGES.nameTooLong
  return undefined
}

function descriptionError(description: string): string | undefined {
  return description.length > DESCRIPTION_MAX ? MESSAGES.descriptionTooLong : undefined
}

export function validateCreateRole(input: { slug: string; name: string; description: string }): {
  readonly valid: boolean
  readonly fieldErrors: RoleFormFieldErrors
  readonly payload: CreateRolePayload | null
} {
  const slug = input.slug.trim()
  const name = input.name.trim()
  const description = input.description.trim()

  const fieldErrors: RoleFormFieldErrors = {
    slug: slugError(slug),
    name: nameError(name),
    description: descriptionError(description),
  }
  const valid = !fieldErrors.slug && !fieldErrors.name && !fieldErrors.description

  return {
    valid,
    fieldErrors,
    payload: valid ? { slug, name, description: description || null } : null,
  }
}

export function validateUpdateRole(input: { name: string; description: string }): {
  readonly valid: boolean
  readonly fieldErrors: RoleFormFieldErrors
  readonly payload: UpdateRolePayload | null
} {
  const name = input.name.trim()
  const description = input.description.trim()

  const fieldErrors: RoleFormFieldErrors = {
    slug: undefined, // slug is not editable on update
    name: nameError(name),
    description: descriptionError(description),
  }
  const valid = !fieldErrors.name && !fieldErrors.description

  return {
    valid,
    fieldErrors,
    payload: valid ? { name, description: description || null } : null,
  }
}
```

- [ ] Run it — expect PASS:

```
npm run test -- app/lib/roles/__tests__/role-form.spec.ts
# EXPECT: PASS — role-form (13 passed)
```

#### Step 3 — RED: dialog component test (`RoleFormDialog.nuxt.spec.ts`)

- [ ] Write `app/components/roles/__tests__/RoleFormDialog.nuxt.spec.ts`:

```ts
// *.nuxt.spec.ts → 'nuxt' env: mountSuspended renders UiDialog's portal inline
// (DialogPortal is force-mounted). The dialog is pure presentational — no service
// mocks needed; it validates locally via @/lib/roles/role-form.
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import RoleFormDialog from '@/components/roles/RoleFormDialog.vue'
import type { AdminRole } from '@/types/users.types'

const labels = {
  createTitle: 'Create role',
  editTitle: 'Edit role',
  slugLabel: 'Slug',
  nameLabel: 'Name',
  descriptionLabel: 'Description',
  saveLabel: 'Save',
  cancelLabel: 'Cancel',
  stepUpLabel: 'Re-authenticate',
}

const sampleRole: AdminRole = {
  id: 7,
  slug: 'support-agent',
  name: 'Support Agent',
  description: 'Handles tickets',
  is_system: false,
  permissions: [],
  user_count: 4,
  users_count: 4,
}

describe('RoleFormDialog — create mode', () => {
  it('keeps submit disabled until slug + name are valid, then emits the create payload', async () => {
    const wrapper = await mountSuspended(RoleFormDialog, { props: { open: true, mode: 'create', ...labels } })
    expect(wrapper.find('[data-testid="role-form-submit"]').attributes('disabled')).toBeDefined()

    await wrapper.find('#role_slug').setValue('support-agent')
    await wrapper.find('#role_name').setValue('Support Agent')
    await wrapper.find('#role_description').setValue('  Handles tickets ')
    expect(wrapper.find('[data-testid="role-form-submit"]').attributes('disabled')).toBeUndefined()

    await wrapper.find('[data-testid="role-form"]').trigger('submit')
    const emitted = wrapper.emitted('submit')
    expect(emitted).toBeTruthy()
    expect(emitted![0]![0]).toEqual({ slug: 'support-agent', name: 'Support Agent', description: 'Handles tickets' })
  })

  it('shows a client validation error after a submit attempt on an invalid form and emits nothing', async () => {
    const wrapper = await mountSuspended(RoleFormDialog, { props: { open: true, mode: 'create', ...labels } })
    await wrapper.find('[data-testid="role-form"]').trigger('submit')
    expect(wrapper.find('#role_slug-error').exists()).toBe(true)
    expect(wrapper.emitted('submit')).toBeFalsy()
  })
})

describe('RoleFormDialog — edit mode', () => {
  it('disables the slug field, prefills metadata, and emits an update payload without a slug', async () => {
    const wrapper = await mountSuspended(RoleFormDialog, {
      props: { open: true, mode: 'edit', role: sampleRole, ...labels },
    })
    const slugInput = wrapper.find('#role_slug').element as HTMLInputElement
    expect(slugInput.value).toBe('support-agent')
    expect(slugInput.disabled).toBe(true)
    expect((wrapper.find('#role_name').element as HTMLInputElement).value).toBe('Support Agent')

    await wrapper.find('#role_name').setValue('Senior Support Agent')
    await wrapper.find('[data-testid="role-form"]').trigger('submit')
    expect(wrapper.emitted('submit')![0]![0]).toEqual({ name: 'Senior Support Agent', description: 'Handles tickets' })
  })
})

describe('RoleFormDialog — server failure surfaces', () => {
  it('renders server field errors passed from the page', async () => {
    const wrapper = await mountSuspended(RoleFormDialog, {
      props: {
        open: true,
        mode: 'create',
        fieldErrors: { slug: 'Slug already registered.', name: undefined, description: undefined },
        ...labels,
      },
    })
    expect(wrapper.find('#role_slug-error').text()).toContain('already registered.')
  })

  it('redacts the request id to a REF- reference and never prints it raw', async () => {
    const wrapper = await mountSuspended(RoleFormDialog, {
      props: { open: true, mode: 'create', errorMessage: 'Something went wrong.', requestId: 'admin-req-SECRET77', ...labels },
    })
    expect(wrapper.text()).toContain('REF-')
    expect(wrapper.text()).not.toContain('admin-req-SECRET77')
  })

  it('renders the step-up re-auth link when stepUpUrl is set', async () => {
    const wrapper = await mountSuspended(RoleFormDialog, {
      props: { open: true, mode: 'create', stepUpUrl: '/auth/login?prompt=login&max_age=0', ...labels },
    })
    const link = wrapper.find('[data-testid="step-up-link"]')
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toBe('/auth/login?prompt=login&max_age=0')
  })

  it('emits cancel without emitting submit when cancel is clicked', async () => {
    const wrapper = await mountSuspended(RoleFormDialog, { props: { open: true, mode: 'create', ...labels } })
    const cancel = wrapper.findAll('button').find((b) => b.text() === 'Cancel')
    expect(cancel).toBeTruthy()
    await cancel!.trigger('click')
    expect(wrapper.emitted('cancel')).toBeTruthy()
    expect(wrapper.emitted('submit')).toBeFalsy()
  })
})
```

- [ ] Run it — expect FAIL (component missing):

```
npm run test -- app/components/roles/__tests__/RoleFormDialog.nuxt.spec.ts
# EXPECT: FAIL — Cannot find module '@/components/roles/RoleFormDialog.vue'
```

#### Step 4 — GREEN: implement `RoleFormDialog.vue`

- [ ] Write `app/components/roles/RoleFormDialog.vue`:

```vue
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import UiDialog from '@/components/ui/UiDialog.vue'
import UiFormField from '@/components/ui/UiFormField.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiTextarea from '@/components/ui/UiTextarea.vue'
import UiButton from '@/components/ui/UiButton.vue'
import {
  validateCreateRole,
  validateUpdateRole,
  type RoleFormFieldErrors,
} from '@/lib/roles/role-form'
import { formatSupportReference } from '@/lib/display-identifiers'
import type { AdminRole, CreateRolePayload, UpdateRolePayload } from '@/types/users.types'

interface Props {
  readonly open: boolean
  readonly mode: 'create' | 'edit'
  readonly role?: AdminRole | null
  readonly createTitle: string
  readonly editTitle: string
  readonly slugLabel: string
  readonly nameLabel: string
  readonly descriptionLabel: string
  readonly saveLabel: string
  readonly cancelLabel: string
  readonly stepUpLabel: string
  readonly submitting?: boolean
  readonly fieldErrors?: RoleFormFieldErrors
  readonly errorMessage?: string | null
  readonly requestId?: string | null
  readonly stepUpUrl?: string | null
}

const props = withDefaults(defineProps<Props>(), {
  role: null,
  submitting: false,
  fieldErrors: undefined,
  errorMessage: null,
  requestId: null,
  stepUpUrl: null,
})

const emit = defineEmits<{
  (event: 'submit', payload: CreateRolePayload | UpdateRolePayload): void
  (event: 'cancel'): void
}>()

const slug = ref('')
const name = ref('')
const description = ref('')
const submitAttempted = ref(false)

// Re-seed local state every time the dialog (re)opens or its target changes, so
// edit mode prefills the role and create mode starts blank. Client errors stay
// hidden until the first submit attempt; server fieldErrors always render.
watch(
  () => [props.open, props.mode, props.role] as const,
  () => {
    if (!props.open) return
    slug.value = props.role?.slug ?? ''
    name.value = props.role?.name ?? ''
    description.value = props.role?.description ?? ''
    submitAttempted.value = false
  },
  { immediate: true },
)

const validation = computed(() =>
  props.mode === 'create'
    ? validateCreateRole({ slug: slug.value, name: name.value, description: description.value })
    : validateUpdateRole({ name: name.value, description: description.value }),
)

function fieldError(field: 'slug' | 'name' | 'description'): string | undefined {
  return props.fieldErrors?.[field] ?? (submitAttempted.value ? validation.value.fieldErrors[field] : undefined)
}

const title = computed(() => (props.mode === 'create' ? props.createTitle : props.editTitle))
const reference = computed(() => (props.requestId ? formatSupportReference(props.requestId) : null))
const canSubmit = computed(() => validation.value.valid && !props.submitting)

function onSubmit(): void {
  submitAttempted.value = true
  const result = validation.value
  if (!result.valid || !result.payload || props.submitting) return
  emit('submit', result.payload)
}
</script>

<template>
  <UiDialog
    :open="open"
    title-id="role-form-dialog"
    :title="title"
    :description="title"
    :close-label="cancelLabel"
    @close="emit('cancel')"
  >
    <form class="role-form" data-testid="role-form" @submit.prevent="onSubmit">
      <UiFormField id="role_slug" :label="slugLabel" :error="fieldError('slug')" required>
        <UiInput
          id="role_slug"
          v-model="slug"
          autocomplete="off"
          :disabled="mode === 'edit'"
          :invalid="Boolean(fieldError('slug'))"
        />
      </UiFormField>

      <UiFormField id="role_name" :label="nameLabel" :error="fieldError('name')" required>
        <UiInput id="role_name" v-model="name" autocomplete="off" :invalid="Boolean(fieldError('name'))" />
      </UiFormField>

      <UiFormField id="role_description" :label="descriptionLabel" :error="fieldError('description')">
        <UiTextarea
          id="role_description"
          v-model="description"
          :rows="3"
          :invalid="Boolean(fieldError('description'))"
        />
      </UiFormField>

      <p v-if="errorMessage" class="role-form__error" role="alert" data-testid="role-form-error">
        {{ errorMessage }}
        <span v-if="reference" class="role-form__ref">{{ reference }}</span>
      </p>

      <a
        v-if="stepUpUrl"
        class="role-form__step-up"
        :href="stepUpUrl"
        data-testid="step-up-link"
      >
        {{ stepUpLabel }}
      </a>

      <div class="role-form__actions">
        <UiButton type="button" variant="ghost" size="sm" @click="emit('cancel')">
          {{ cancelLabel }}
        </UiButton>
        <UiButton
          type="submit"
          variant="primary"
          size="sm"
          :disabled="!canSubmit"
          data-testid="role-form-submit"
        >
          {{ saveLabel }}
        </UiButton>
      </div>
    </form>
  </UiDialog>
</template>

<style scoped>
.role-form {
  display: grid;
  gap: 16px;
}
.role-form__error {
  margin: 0;
  font: 500 0.75rem/1.4 var(--font-sans);
  color: var(--danger);
}
.role-form__ref {
  margin-left: 6px;
  font-family: var(--font-mono);
  color: var(--fg-3);
}
.role-form__step-up {
  font: 600 0.8125rem/1 var(--font-sans);
  color: var(--accent);
  text-decoration: underline;
}
.role-form__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
```

- [ ] Run it — expect PASS:

```
npm run test -- app/components/roles/__tests__/RoleFormDialog.nuxt.spec.ts
# EXPECT: PASS — RoleFormDialog (8 passed)
```

#### Step 5 — RED: page create/update privileged-action matrix (`roles-create-update.page.nuxt.spec.ts`)

- [ ] Write `app/pages/__tests__/roles-create-update.page.nuxt.spec.ts`:

```ts
// *.nuxt.spec.ts → 'nuxt' env. The list/catalog composables, the session store,
// the roles service seam, the shared privileged-action runner and navigateTo are
// mocked so each create/update branch is deterministic. We drive the real
// RoleFormDialog / RolesTable child components via their emitted events.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import RoleFormDialog from '@/components/roles/RoleFormDialog.vue'
import RolesTable from '@/components/roles/RolesTable.vue'
import type {
  AdminRole,
  CreateRolePayload,
  RoleMutationResponse,
  UpdateRolePayload,
} from '@/types/users.types'
import type {
  PrivilegedActionFailure,
  PrivilegedActionFailureStatus,
  PrivilegedActionStatus,
} from '@/lib/users/privileged-action'

const roleA: AdminRole = {
  id: 1, slug: 'platform-admin', name: 'Platform Admin', description: 'Full access',
  is_system: true, permissions: [{ slug: 'users.read', name: 'Read users', category: 'users' }],
  user_count: 3, users_count: 3,
}
const roleB: AdminRole = {
  id: 2, slug: 'support-agent', name: 'Support Agent', description: 'Tickets',
  is_system: false, permissions: [], user_count: 4, users_count: 4,
}

// --- roles service seam -----------------------------------------------------
const storeMock = vi.fn<(p: CreateRolePayload) => Promise<RoleMutationResponse>>()
const updateMock = vi.fn<(slug: string, p: UpdateRolePayload) => Promise<RoleMutationResponse>>()
vi.mock('@/services/roles.api', () => ({
  rolesApi: {
    list: vi.fn(),
    permissions: vi.fn(),
    store: storeMock,
    update: updateMock,
    syncPermissions: vi.fn(),
    destroy: vi.fn(),
  },
}))

// --- list / catalog composables ---------------------------------------------
const refreshMock = vi.fn<() => Promise<void>>(async () => {})
vi.mock('@/composables/useRolesList', () => ({
  useRolesList: () => {
    const roles = ref<readonly AdminRole[]>([roleA, roleB])
    return {
      roles,
      filtered: computed(() => roles.value),
      paged: computed(() => roles.value),
      total: computed(() => roles.value.length),
      filteredTotal: computed(() => roles.value.length),
      pageCount: computed(() => 1),
      page: ref(1),
      query: ref(''),
      viewState: computed(() => 'ready' as const),
      isStale: computed(() => false),
      requestId: computed(() => null),
      pending: ref(false),
      refresh: refreshMock,
    }
  },
}))
vi.mock('@/composables/usePermissionCatalog', () => ({
  usePermissionCatalog: () => ({
    permissions: ref([{ slug: 'users.read', name: 'Read users', description: 'Read', category: 'users' }]),
    viewState: computed(() => 'ready' as const),
    isStale: computed(() => false),
    requestId: computed(() => null),
    pending: ref(false),
    refresh: vi.fn(),
  }),
}))

// --- session store ----------------------------------------------------------
const hasPermissionMock = vi.fn<(p: string) => boolean>(() => true)
vi.mock('@/stores/session.store', () => ({
  useSessionStore: () => ({
    hasPermission: hasPermissionMock,
    ensureSession: vi.fn(async () => ({ display_name: 'Ops Admin' })),
    principal: { display_name: 'Ops Admin' },
  }),
}))

// --- shared privileged-action runner ----------------------------------------
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
  stepUpUrl.value = null
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

const navigateMock = vi.hoisted(() => vi.fn<() => Promise<void>>(async () => {}))
mockNuxtImport('navigateTo', () => navigateMock)

const RolesPage = (await import('../roles.vue')).default

const validCreate: CreateRolePayload = { slug: 'support-agent', name: 'Support Agent', description: null }
const validUpdate: UpdateRolePayload = { name: 'Renamed', description: null }

// PrivilegedActionFailure.status is the NARROWER PrivilegedActionFailureStatus
// (failure-only); typing the param wide as PrivilegedActionStatus is a TS2322 when
// it is assigned into `failure.value`. The wide PrivilegedActionStatus import stays
// for the `status` ref below.
function failWith(
  partial: Partial<PrivilegedActionFailure> & { status: PrivilegedActionFailureStatus },
): void {
  runMock.mockImplementationOnce(async () => {
    status.value = partial.status
    stepUpUrl.value = partial.stepUpUrl ?? null
    failure.value = {
      status: partial.status,
      requestId: partial.requestId ?? null,
      auditEventId: partial.auditEventId ?? null,
      fieldErrors: partial.fieldErrors ?? {},
      stepUpUrl: partial.stepUpUrl ?? null,
    }
    isSubmitting.value = false
    return null
  })
}

beforeEach(() => {
  status.value = 'idle'
  isSubmitting.value = false
  failure.value = null
  stepUpUrl.value = null
  hasPermissionMock.mockReturnValue(true)
  vi.clearAllMocks()
  storeMock.mockResolvedValue({ role: roleB })
  updateMock.mockResolvedValue({ role: roleB })
})
afterEach(() => vi.clearAllMocks())

describe('roles page — create privileged action', () => {
  it('4.1 success → store called with payload, list refreshed, success notice, dialog closed', async () => {
    const wrapper = await mountSuspended(RolesPage)
    await wrapper.find('[data-testid="roles-create"]').trigger('click')
    await wrapper.vm.$nextTick()
    const dialog = wrapper.findComponent(RoleFormDialog)
    expect(dialog.props('open')).toBe(true)
    expect(dialog.props('mode')).toBe('create')

    dialog.vm.$emit('submit', validCreate)
    await flushPromises()

    expect(storeMock).toHaveBeenCalledWith(validCreate)
    expect(refreshMock).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="roles-action-success"]').exists()).toBe(true)
    expect(wrapper.findComponent(RoleFormDialog).props('open')).toBe(false)
  })

  it('hides the create affordance when the admin lacks admin.roles.write', async () => {
    hasPermissionMock.mockReturnValue(false)
    const wrapper = await mountSuspended(RolesPage)
    expect(wrapper.find('[data-testid="roles-create"]').exists()).toBe(false)
  })

  it('4.2 missing permission / 403 → dialog stays open with safe copy + redacted REF, no refresh', async () => {
    failWith({ status: 'forbidden', requestId: 'admin-req-DENY1' })
    const wrapper = await mountSuspended(RolesPage)
    await wrapper.find('[data-testid="roles-create"]').trigger('click')
    await wrapper.vm.$nextTick()
    wrapper.findComponent(RoleFormDialog).vm.$emit('submit', validCreate)
    await flushPromises()
    const dialog = wrapper.findComponent(RoleFormDialog)
    expect(dialog.props('open')).toBe(true)
    expect(dialog.props('errorMessage')).toBeTruthy()
    expect(refreshMock).not.toHaveBeenCalled()
    expect(wrapper.text()).not.toContain('admin-req-DENY1')
    expect(wrapper.text()).toContain('REF-')
  })

  it('4.3 unauthenticated / 401 → safe session copy in dialog, no refresh', async () => {
    failWith({ status: 'unauthenticated' })
    const wrapper = await mountSuspended(RolesPage)
    await wrapper.find('[data-testid="roles-create"]').trigger('click')
    await wrapper.vm.$nextTick()
    wrapper.findComponent(RoleFormDialog).vm.$emit('submit', validCreate)
    await flushPromises()
    expect(wrapper.findComponent(RoleFormDialog).props('open')).toBe(true)
    expect(wrapper.findComponent(RoleFormDialog).props('errorMessage')).toBeTruthy()
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('4.4 session expired / 419 folds into unauthenticated → safe copy, no refresh', async () => {
    // resolvePrivilegedActionFailure maps 419 → 'unauthenticated'; same surface as 401.
    failWith({ status: 'unauthenticated' })
    const wrapper = await mountSuspended(RolesPage)
    await wrapper.find('[data-testid="roles-create"]').trigger('click')
    await wrapper.vm.$nextTick()
    wrapper.findComponent(RoleFormDialog).vm.$emit('submit', validCreate)
    await flushPromises()
    expect(wrapper.findComponent(RoleFormDialog).props('errorMessage')).toBeTruthy()
    expect(storeMock).toHaveBeenCalledTimes(1)
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('4.5 rate limit / 429 → safe copy, no raw exception, no refresh', async () => {
    failWith({ status: 'rate_limited', requestId: 'admin-req-RL' })
    const wrapper = await mountSuspended(RolesPage)
    await wrapper.find('[data-testid="roles-create"]').trigger('click')
    await wrapper.vm.$nextTick()
    wrapper.findComponent(RoleFormDialog).vm.$emit('submit', validCreate)
    await flushPromises()
    expect(wrapper.findComponent(RoleFormDialog).props('errorMessage')).toBeTruthy()
    expect(wrapper.text()).not.toMatch(/SQLSTATE|stack trace|Bearer/i)
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('4.6 validation / 422 → server field errors bind to the dialog, dialog open, no refresh', async () => {
    failWith({ status: 'invalid', fieldErrors: { slug: ['Slug already registered.'] } })
    const wrapper = await mountSuspended(RolesPage)
    await wrapper.find('[data-testid="roles-create"]').trigger('click')
    await wrapper.vm.$nextTick()
    wrapper.findComponent(RoleFormDialog).vm.$emit('submit', validCreate)
    await flushPromises()
    const dialog = wrapper.findComponent(RoleFormDialog)
    expect(dialog.props('open')).toBe(true)
    expect(dialog.props('fieldErrors')?.slug).toContain('already registered.')
    expect(refreshMock).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="roles-action-success"]').exists()).toBe(false)
  })

  it('4.7 step-up / 428 → stepUpUrl forwarded to the dialog, dialog open, no refresh', async () => {
    failWith({ status: 'step_up_required', stepUpUrl: '/auth/login?prompt=login&max_age=0' })
    const wrapper = await mountSuspended(RolesPage)
    await wrapper.find('[data-testid="roles-create"]').trigger('click')
    await wrapper.vm.$nextTick()
    wrapper.findComponent(RoleFormDialog).vm.$emit('submit', validCreate)
    await flushPromises()
    const dialog = wrapper.findComponent(RoleFormDialog)
    expect(dialog.props('stepUpUrl')).toBe('/auth/login?prompt=login&max_age=0')
    expect(dialog.props('open')).toBe(true)
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('4.8 backend 5xx → error copy + redacted REF, raw id/exception absent', async () => {
    failWith({ status: 'error', requestId: 'admin-req-FAIL9' })
    const wrapper = await mountSuspended(RolesPage)
    await wrapper.find('[data-testid="roles-create"]').trigger('click')
    await wrapper.vm.$nextTick()
    wrapper.findComponent(RoleFormDialog).vm.$emit('submit', validCreate)
    await flushPromises()
    expect(wrapper.text()).toContain('REF-')
    expect(wrapper.text()).not.toContain('admin-req-FAIL9')
    expect(wrapper.text()).not.toMatch(/SQLSTATE|Bearer/i)
  })

  it('4.9 audit/correlation id from backend is surfaced redacted, never raw', async () => {
    failWith({ status: 'error', requestId: 'admin-req-ZZ', auditEventId: 'audit-XYZ' })
    const wrapper = await mountSuspended(RolesPage)
    await wrapper.find('[data-testid="roles-create"]').trigger('click')
    await wrapper.vm.$nextTick()
    wrapper.findComponent(RoleFormDialog).vm.$emit('submit', validCreate)
    await flushPromises()
    expect(wrapper.text()).toContain('REF-')
    expect(wrapper.text()).not.toContain('admin-req-ZZ')
    expect(wrapper.text()).not.toContain('audit-XYZ')
  })

  it('4.10 leaves no stale submitting state after an error', async () => {
    failWith({ status: 'error' })
    const wrapper = await mountSuspended(RolesPage)
    await wrapper.find('[data-testid="roles-create"]').trigger('click')
    await wrapper.vm.$nextTick()
    wrapper.findComponent(RoleFormDialog).vm.$emit('submit', validCreate)
    await flushPromises()
    expect(wrapper.findComponent(RoleFormDialog).props('submitting')).toBe(false)
  })

  it('cancel calls no API and closes the dialog', async () => {
    const wrapper = await mountSuspended(RolesPage)
    await wrapper.find('[data-testid="roles-create"]').trigger('click')
    await wrapper.vm.$nextTick()
    wrapper.findComponent(RoleFormDialog).vm.$emit('cancel')
    await flushPromises()
    expect(wrapper.findComponent(RoleFormDialog).props('open')).toBe(false)
    expect(storeMock).not.toHaveBeenCalled()
    expect(refreshMock).not.toHaveBeenCalled()
  })
})

describe('roles page — update privileged action', () => {
  // Drive the edit flow through RolesTable @edit → dialog submit so the SHARED
  // dialog is fed by `formAction` (= updateAction in edit mode), not createAction.
  async function openEditAndSubmit(): Promise<Awaited<ReturnType<typeof mountSuspended>>> {
    const wrapper = await mountSuspended(RolesPage)
    wrapper.findComponent(RolesTable).vm.$emit('edit', roleB)
    await wrapper.vm.$nextTick()
    const dialog = wrapper.findComponent(RoleFormDialog)
    expect(dialog.props('mode')).toBe('edit')
    expect(dialog.props('role')).toEqual(roleB)
    dialog.vm.$emit('submit', validUpdate)
    await flushPromises()
    return wrapper
  }

  it('edit success → update called with (slug, payload), list refreshed, success notice', async () => {
    const wrapper = await openEditAndSubmit()
    expect(updateMock).toHaveBeenCalledWith('support-agent', validUpdate)
    expect(storeMock).not.toHaveBeenCalled()
    expect(refreshMock).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="roles-action-success"]').exists()).toBe(true)
  })

  it('edit 403 → safe copy + redacted REF in the dialog, dialog open, no refresh', async () => {
    failWith({ status: 'forbidden', requestId: 'admin-req-EDENY' })
    const wrapper = await openEditAndSubmit()
    const dialog = wrapper.findComponent(RoleFormDialog)
    expect(dialog.props('open')).toBe(true)
    expect(dialog.props('errorMessage')).toBeTruthy()
    expect(wrapper.text()).toContain('REF-')
    expect(wrapper.text()).not.toContain('admin-req-EDENY')
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('edit 422 → updateAction field errors bind to the shared dialog, dialog open, no refresh', async () => {
    failWith({ status: 'invalid', fieldErrors: { name: ['Name already taken.'] } })
    const wrapper = await openEditAndSubmit()
    const dialog = wrapper.findComponent(RoleFormDialog)
    expect(dialog.props('open')).toBe(true)
    expect(dialog.props('fieldErrors')?.name).toContain('already taken.')
    expect(refreshMock).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="roles-action-success"]').exists()).toBe(false)
  })

  it('edit 428 → stepUpUrl forwarded to the shared dialog, dialog open, no refresh', async () => {
    failWith({ status: 'step_up_required', stepUpUrl: '/auth/login?prompt=login&max_age=0' })
    const wrapper = await openEditAndSubmit()
    const dialog = wrapper.findComponent(RoleFormDialog)
    expect(dialog.props('stepUpUrl')).toBe('/auth/login?prompt=login&max_age=0')
    expect(dialog.props('open')).toBe(true)
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('edit failure leaves no stale submitting state on the shared dialog', async () => {
    failWith({ status: 'error' })
    const wrapper = await openEditAndSubmit()
    expect(wrapper.findComponent(RoleFormDialog).props('submitting')).toBe(false)
  })
})

describe('roles page — SSR markup carries no token/secret', () => {
  it('renders role slugs (public config, allowed) but no token/secret patterns', async () => {
    const wrapper = await mountSuspended(RolesPage)
    const html = wrapper.html()
    expect(html).not.toMatch(/access_token|refresh_token|id_token|Bearer/)
    expect(html).not.toMatch(/client_secret|"secret"/)
    expect(html).toContain('support-agent') // role slug is public config and may render
  })
})
```

- [ ] Run it — expect FAIL (page not yet wired; no `roles-create` / `RoleFormDialog`):

```
npm run test -- app/pages/__tests__/roles-create-update.page.nuxt.spec.ts
# EXPECT: FAIL — [data-testid="roles-create"] not found / RoleFormDialog not present
```

#### Step 6 — GREEN: add the create/update wiring to `app/pages/roles.vue`

7.7 leaves `openCreate`/`openEdit` as stubbed open-dialog hooks. Replace them
with the wired flow and mount the dialog. Add the new key to both locales.

- [ ] Add `roles.btn_step_up` to `app/locales/en.json` (inside the `roles` block):

```json
"btn_step_up": "Re-authenticate"
```

- [ ] Add `roles.btn_step_up` to `app/locales/id.json` (inside the `roles` block):

```json
"btn_step_up": "Autentikasi ulang"
```

- [ ] In `app/pages/roles.vue` `<script setup>`, add the imports + state + handlers (assumes 7.7 already destructured `refresh`, `canWrite`, `t`, and the session `store`):

```ts
// MERGE into roles.vue's existing <script setup> (Task 7.7). New symbols only:
// `ref`/`computed`, the `AdminRole` type, and the page-level `successMessage` ref +
// its `roles-action-success` aria-live region are ALREADY declared in 7.7 — reuse
// them, do not re-import or re-declare.
import RoleFormDialog from '@/components/roles/RoleFormDialog.vue'
import { usePrivilegedAction } from '@/composables/usePrivilegedAction'
import { rolesApi } from '@/services/roles.api'
import type {
  CreateRolePayload,
  RoleMutationResponse,
  UpdateRolePayload,
} from '@/types/users.types'

const dialogOpen = ref(false)
const dialogMode = ref<'create' | 'edit'>('create')
const editingRole = ref<AdminRole | null>(null)

const createAction = usePrivilegedAction<RoleMutationResponse>()
const updateAction = usePrivilegedAction<RoleMutationResponse>()
const formAction = computed(() => (dialogMode.value === 'create' ? createAction : updateAction))

// Map the privileged-action field errors (Record<string,string[]>) → the dialog's
// RoleFormFieldErrors (first message per field).
const dialogFieldErrors = computed(() => {
  const fe = formAction.value.fieldErrors.value
  return {
    slug: fe.slug?.[0],
    name: fe.name?.[0],
    description: fe.description?.[0],
  }
})

// Safe, status-keyed copy — never a raw backend exception.
const dialogError = computed<string | null>(() => {
  switch (formAction.value.status.value) {
    case 'forbidden':
      return t('common.forbidden_desc')
    case 'unauthenticated':
      return t('common.session_expired_desc')
    case 'step_up_required':
      return t('roles.error_title')
    case 'rate_limited':
    case 'error':
      return t('common.error_generic')
    default:
      return null
  }
})

function openCreate(): void {
  createAction.reset()
  successMessage.value = null
  dialogMode.value = 'create'
  editingRole.value = null
  dialogOpen.value = true
}

function openEdit(role: AdminRole): void {
  updateAction.reset()
  successMessage.value = null
  dialogMode.value = 'edit'
  editingRole.value = role
  dialogOpen.value = true
}

function closeDialog(): void {
  dialogOpen.value = false
}

async function onDialogSubmit(payload: CreateRolePayload | UpdateRolePayload): Promise<void> {
  if (dialogMode.value === 'create') {
    const created = await createAction.run(() => rolesApi.store(payload as CreateRolePayload))
    if (created) {
      dialogOpen.value = false
      successMessage.value = t('roles.roles_create_success')
      await refresh()
    }
    return
  }
  const slug = editingRole.value?.slug
  if (!slug) return
  const updated = await updateAction.run(() => rolesApi.update(slug, payload as UpdateRolePayload))
  if (updated) {
    dialogOpen.value = false
    successMessage.value = t('roles.roles_update_success')
    await refresh()
  }
}
```

- [ ] In `app/pages/roles.vue` `<template>`, add ONLY the `<RoleFormDialog>` element and ensure `RolesTable` is wired `@edit="openEdit"`. The create button (`data-testid="roles-create"`, gated on `canWrite`, `@click="openCreate"`) and the shared `roles-action-success` aria-live region ALREADY exist from Task 7.7 — do NOT add a second of either:

```vue
<!-- The `data-testid="roles-create"` button + the `roles-action-success` region are
     already in the Task-7.7 template; only the dialog is new here. -->

<RoleFormDialog
  :open="dialogOpen"
  :mode="dialogMode"
  :role="editingRole"
  :create-title="t('roles.create_role_title')"
  :edit-title="t('roles.edit_role_title')"
  :slug-label="t('roles.label_slug')"
  :name-label="t('roles.label_name')"
  :description-label="t('roles.label_description')"
  :save-label="t('roles.btn_save')"
  :cancel-label="t('roles.btn_cancel')"
  :step-up-label="t('roles.btn_step_up')"
  :submitting="formAction.isSubmitting.value"
  :field-errors="dialogFieldErrors"
  :error-message="dialogError"
  :request-id="formAction.requestId.value"
  :step-up-url="formAction.stepUpUrl.value"
  @submit="onDialogSubmit"
  @cancel="closeDialog"
/>
```

- [ ] Run all three task files — expect PASS:

```
npm run test -- app/lib/roles/__tests__/role-form.spec.ts app/components/roles/__tests__/RoleFormDialog.nuxt.spec.ts app/pages/__tests__/roles-create-update.page.nuxt.spec.ts
# EXPECT: PASS — role-form + RoleFormDialog + roles-create-update (all passed)
```

#### Step 7 — REFACTOR

- [ ] Confirm no `OG#`/`UC###`/`FR###`/`BE-FR###` markers, no hard-coded colours (tokens only), `--font-mono` used only for the REF reference, single accent on the primary/save affordance (no `--danger` on create/edit), and the legacy `ui-modal` overlay markup is **absent** (dialog is `UiDialog` only). Tidy without changing behaviour; re-run the three files if anything moved.

#### Step 8 — COMMIT

- [ ] Commit:

```
git add app/lib/roles/role-form.ts \
  app/lib/roles/__tests__/role-form.spec.ts \
  app/components/roles/RoleFormDialog.vue \
  app/components/roles/__tests__/RoleFormDialog.nuxt.spec.ts \
  app/pages/roles.vue \
  app/pages/__tests__/roles-create-update.page.nuxt.spec.ts \
  app/locales/en.json app/locales/id.json
git commit -m "feat(sso-admin-frontend): role create + edit-metadata forms (RoleFormDialog) with privileged-action matrix

Add pure role-form validation, a UiDialog-based RoleFormDialog (no legacy
modal-overlay markup; slug disabled in edit mode), and wire create (201) +
update through two usePrivilegedAction instances on roles.vue — refresh the
list and surface a success notice on success, full 401/403/419/422/428/429/5xx
+ step-up matrix on failure.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

**Task-scoped DoD** (run from `services/sso-admin-frontend`; report any blocked command explicitly, never claim PASS for a command that did not run):
`npm run test -- app/lib/roles/__tests__/role-form.spec.ts app/components/roles/__tests__/RoleFormDialog.nuxt.spec.ts app/pages/__tests__/roles-create-update.page.nuxt.spec.ts && npm run typecheck && npm run lint:oxlint && npm run lint:eslint && npm run format:check` — and `npm run lint` (= `run-s lint:*`, both oxlint AND eslint) must stay green. The full-suite `npm run test && npm run build && npm run test:e2e` gate runs in Task 7.11.

---

### Task 7.9: Sync-permissions privileged action (matrix save, impact summary)

The security-critical Roles write: editing a role's permission set changes access for **everyone holding that role**, so `RoleMatrix`'s `save(roleSlug)` must route through a confirmation that names the blast radius before it PUTs. This task adds one pure helper (`describePermissionImpact` — `affectedUsers = role.user_count`, plus `addedCount`/`removedCount` from the grant diff) and wires the page: on `save`, compute `diffRoleGrants(original, pending)`, open the **REUSED** Phase-4 `PrivilegedActionDialog` (`roles.confirm_sync_permissions_*` with `{target}` = role name + the "N users affected" impact line), and on confirm run `usePrivilegedAction(() => rolesApi.syncPermissions(slug, { permission_slugs: diff.permission_slugs }))`. The PUT body is the **full sorted pending set** (replace semantics), so an empty selection (`[]`) is allowed and clears all permissions. On success: explicit list `refresh()`, re-seed the pending grant map from the refreshed roles (the read-only `dirtyRoleSlugs` computed from Task 7.7 then recomputes empty for that slug — **no manual mutation**, it is not writable), set the shared `successMessage` (`roles.roles_permissions_success`) that renders in the Task-7.7 `roles-action-success` region, and close the dialog. **Self-lockout guard:** if the saved role is one the acting admin holds (`store.roles` includes its slug), a distinct self-warning line is shown in the confirm and, on a successful self-affecting save, the page re-verifies the principal (`store.ensureSession(true)`) and routes out via `resolveBootstrapFailure` if it drops (mirrors `UserRoleAssignment.vue`). The full failure matrix (`403/422/428/429/5xx`; 401 covers unauth — 419 is N/A for the Bearer-auth admin API, no stateful CSRF cookie) surfaces **inside the dialog** (safe copy + redacted `REF-…` + step-up link on the `:write`-window 428) and never leaves a stale `submitting`/disabled state; **cancel calls no API**. System-role columns never emit `save` (they render `UiStatusBadge`, not a `UiSwitch`, per Task 7.6) and the page guards `is_system` defensively. This is an **operational-write** action — the confirm primary stays **accent** (`primary`), never `--danger` red (red is reserved for delete in Task 7.10).

**Files**
- Create: `app/lib/roles/permission-impact.ts`
- Edit: `app/pages/roles.vue` (wire `RoleMatrix` `@save` → sync confirm dialog → `rolesApi.syncPermissions`; add the success notice; reseed grants)
- Edit: `app/locales/en.json` + `app/locales/id.json` (ADD two new keys — `roles.impact_users_affected` with `{count}` interpolation and `roles.self_affect_warn` (the self-lockout warning) — BOTH files, keep parity; every other `roles.*` key already exists)
- Test: `app/lib/roles/__tests__/permission-impact.spec.ts` (pure — plain `*.spec.ts`)
- Test: `app/pages/__tests__/roles-sync-permissions.page.nuxt.spec.ts` (Nuxt runtime — `*.nuxt.spec.ts`)

**Interfaces**
- Consumes:
  - `usePrivilegedAction` (`@/composables/usePrivilegedAction`) — reused from Phase 4 as-is; one instance for sync.
  - `PrivilegedActionDialog` (`@/components/users/PrivilegedActionDialog.vue`) — reused as-is (not copied into a `roles/` path); used reasonless (`reasonLabel` omitted) with `:danger="false"`.
  - `rolesApi.syncPermissions` (`@/services/roles.api`, Task 7.3).
  - `diffRoleGrants` / `RoleGrantDiff` / `buildRoleGrantMap` (`@/lib/roles/roles-matrix`, Task 7.2).
  - `describePermissionImpact` (`@/lib/roles/permission-impact`, this task).
  - `SyncPermissionsPayload` / `RoleMutationResponse` / `AdminRole` (`@/types/users.types`, Task 7.1 + existing).
  - `useRolesList` (`@/composables/useRolesList`, Task 7.4) for `roles` + `refresh`; `useI18n` `roles.*` keys; `useSessionStore().hasPermission` (`@/stores/session.store`); `formatSupportReference` (`@/lib/display-identifiers`, via the dialog).
  - Page scaffold from Tasks 7.7 (`pendingGrants: Ref<RoleGrantMap>`, `dirtyRoleSlugs: Ref<string[]>`, the `onMatrixToggle` handler) + 7.8 (the two create/update `usePrivilegedAction` instances) — already present when this task runs.
- Produces:
  - `app/lib/roles/permission-impact.ts`: `function describePermissionImpact(role: AdminRole, diff: RoleGrantDiff): { readonly affectedUsers: number; readonly addedCount: number; readonly removedCount: number }` (`affectedUsers = role.user_count`, `addedCount = diff.added.length`, `removedCount = diff.removed.length`).
  - `app/pages/roles.vue`: a `usePrivilegedAction<RoleMutationResponse>()` instance for sync; the 7.7 `onMatrixSave(roleSlug)` **stub body is replaced** (not renamed) to open the confirm dialog with the impact + self-warning summary; `onSyncConfirm()` runs `rolesApi.syncPermissions(slug, { permission_slugs })` and on success refreshes, reseeds `pendingGrants`, sets the shared `successMessage`, and re-verifies the principal when self-affecting; `onSyncCancel()` closes with no API. Uses the BARE destructured composable names from 7.7 (`roles`, `paged`, `refresh`, `viewState`, …) and the 7.7-declared `originalGrants`/`pendingGrants`/`dirtyRoleSlugs` — it does not re-declare them. New i18n keys `roles.impact_users_affected` + `roles.self_affect_warn`.

---

#### Part A — `permission-impact.ts` (pure impact model)

1. [ ] **RED — write `app/lib/roles/__tests__/permission-impact.spec.ts`.** Real assertions over the Task-7.2 `diffRoleGrants` output (no mocks — pure logic). Pins `affectedUsers = user_count` (NOT `users_count`), the add/remove counts, and the full-clear case:

```ts
import { describe, expect, it } from 'vitest'
import { describePermissionImpact } from '@/lib/roles/permission-impact'
import { diffRoleGrants } from '@/lib/roles/roles-matrix'
import type { AdminRole } from '@/types/users.types'

function makeRole(overrides: Partial<AdminRole> = {}): AdminRole {
  return {
    id: 7,
    slug: 'editor',
    name: 'Editor',
    description: null,
    is_system: false,
    permissions: [{ slug: 'users.read', name: 'Read users', category: 'users' }],
    user_count: 4,
    users_count: 4,
    ...overrides,
  }
}

describe('describePermissionImpact', () => {
  it('reports affectedUsers from role.user_count and added/removed from the diff', () => {
    const diff = diffRoleGrants(new Set(['users.read', 'users.write']), new Set(['users.read', 'clients.read']))
    const impact = describePermissionImpact(makeRole(), diff)
    expect(impact.affectedUsers).toBe(4)
    expect(impact.addedCount).toBe(1) // clients.read added
    expect(impact.removedCount).toBe(1) // users.write removed
  })

  it('reads user_count (not users_count) and reports zero change for an identical set', () => {
    const diff = diffRoleGrants(new Set(['users.read']), new Set(['users.read']))
    const impact = describePermissionImpact(makeRole({ user_count: 3, users_count: 999 }), diff)
    expect(impact.affectedUsers).toBe(3)
    expect(impact.addedCount).toBe(0)
    expect(impact.removedCount).toBe(0)
  })

  it('counts a full clear (empty pending set) as all-removed', () => {
    const diff = diffRoleGrants(new Set(['a', 'b']), new Set<string>())
    const impact = describePermissionImpact(makeRole(), diff)
    expect(impact.addedCount).toBe(0)
    expect(impact.removedCount).toBe(2)
  })
})
```

2. [ ] **Run it — expect FAIL** (module missing):
   `npm run test:unit -- app/lib/roles/__tests__/permission-impact.spec.ts`
   Expected: `Error: Failed to resolve import "@/lib/roles/permission-impact"` / `describePermissionImpact is not a function` → suite RED.

3. [ ] **GREEN — write `app/lib/roles/permission-impact.ts`** (one-liner over the existing diff — nothing speculative):

```ts
import type { AdminRole } from '@/types/users.types'
import type { RoleGrantDiff } from '@/lib/roles/roles-matrix'

// The data behind the "changes the permission set for N users holding this role"
// impact summary. affectedUsers is the blast radius (everyone holding the role);
// the copy is assembled in the page via i18n. user_count and users_count are the
// same backend value — use user_count (the documented field).
export function describePermissionImpact(
  role: AdminRole,
  diff: RoleGrantDiff,
): { readonly affectedUsers: number; readonly addedCount: number; readonly removedCount: number } {
  return {
    affectedUsers: role.user_count,
    addedCount: diff.added.length,
    removedCount: diff.removed.length,
  }
}
```

4. [ ] **Run it — expect PASS:**
   `npm run test:unit -- app/lib/roles/__tests__/permission-impact.spec.ts`
   Expected: `Test Files 1 passed` · `Tests 3 passed`.

5. [ ] **Refactor:** none expected (pure 3-field projection). Confirm no `any`, all fields `readonly`.

6. [ ] **Commit:**
   `git add app/lib/roles/permission-impact.ts app/lib/roles/__tests__/permission-impact.spec.ts`
   ```
   feat(sso-admin-frontend): pure permission-impact model for role sync blast radius

   describePermissionImpact projects affectedUsers (role.user_count) plus
   added/removed counts from the matrix grant diff — the data behind the
   "changes the permission set for N users holding this role" confirm summary.

   Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
   ```

---

#### Part B — i18n impact key + page sync-permissions wiring

7. [ ] **RED — write `app/pages/__tests__/roles-sync-permissions.page.nuxt.spec.ts`.** Mocks the service seam, the two list/catalog composables, the session store, the shared privileged-action runner, and stubs `RoleMatrix`/`RolesTable`/`RoleFormDialog` (those are tested in 7.5/7.6/7.8) — but uses the **real** `PrivilegedActionDialog` so the confirm/cancel/impact/step-up/REF behaviour is exercised end-to-end. The stub matrix emits `toggle`/`save` so the page's own diff + dialog wiring (the deliverable) is what is asserted. Covers the full privileged + destructive-confirm matrix:

```ts
// *.nuxt.spec.ts → 'nuxt' env. The page's sync-permissions flow is the unit under
// test: stub matrix emits toggle/save, the REAL PrivilegedActionDialog renders the
// impact + confirm, and the service/runner/list are mocked for deterministic branches.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import idLocale from '@/locales/id.json' // default locale is 'id' → assert the rendered copy
import type {
  AdminPermission,
  AdminRole,
  RoleMutationResponse,
  SyncPermissionsPayload,
} from '@/types/users.types'
import type { PrivilegedActionFailure, PrivilegedActionStatus } from '@/lib/users/privileged-action'

// --- fixtures ---------------------------------------------------------------
const EDITOR: AdminRole = {
  id: 7,
  slug: 'editor',
  name: 'Editor',
  description: 'Content editor',
  is_system: false,
  permissions: [{ slug: 'users.read', name: 'Read users', category: 'users' }],
  user_count: 4,
  users_count: 4,
}
const SYSTEM: AdminRole = {
  id: 1,
  slug: 'platform-admin',
  name: 'Platform Admin',
  description: null,
  is_system: true,
  permissions: [{ slug: 'users.read', name: 'Read users', category: 'users' }],
  user_count: 2,
  users_count: 2,
}
const PERMISSIONS: readonly AdminPermission[] = [
  { slug: 'users.read', name: 'Read users', description: 'Read user records', category: 'users' },
  { slug: 'clients.read', name: 'Read clients', description: 'Read OIDC clients', category: 'clients' },
]

// --- service seam -----------------------------------------------------------
const syncPermissionsMock =
  vi.fn<(slug: string, payload: SyncPermissionsPayload) => Promise<RoleMutationResponse>>()
vi.mock('@/services/roles.api', () => ({
  rolesApi: {
    list: vi.fn<() => Promise<unknown>>(),
    permissions: vi.fn<() => Promise<unknown>>(),
    store: vi.fn<(p: unknown) => Promise<unknown>>(),
    update: vi.fn<(s: string, p: unknown) => Promise<unknown>>(),
    syncPermissions: syncPermissionsMock,
    destroy: vi.fn<(s: string) => Promise<unknown>>(),
  },
}))

// --- list + catalog composables --------------------------------------------
const rolesRef = ref<readonly AdminRole[] | null>([EDITOR, SYSTEM])
const refreshMock = vi.fn<() => Promise<void>>(async () => {})
vi.mock('@/composables/useRolesList', () => ({
  useRolesList: () => ({
    roles: rolesRef,
    filtered: computed(() => rolesRef.value ?? []),
    paged: computed(() => rolesRef.value ?? []),
    total: computed(() => rolesRef.value?.length ?? 0),
    filteredTotal: computed(() => rolesRef.value?.length ?? 0),
    pageCount: computed(() => 1),
    page: ref(1),
    query: ref(''),
    viewState: computed(() => 'ready' as const),
    isStale: computed(() => false),
    requestId: computed(() => null),
    pending: ref(false),
    refresh: refreshMock,
  }),
}))
vi.mock('@/composables/usePermissionCatalog', () => ({
  usePermissionCatalog: () => ({
    permissions: ref(PERMISSIONS),
    viewState: computed(() => 'ready' as const),
    isStale: computed(() => false),
    requestId: computed(() => null),
    pending: ref(false),
    refresh: vi.fn<() => Promise<void>>(async () => {}),
  }),
}))

// --- session store ----------------------------------------------------------
// `roles` is the acting principal's role set (drives the self-lockout guard);
// ensureSession returns a SessionEnsureResult string so the re-verify path can
// be exercised. Both are mutated per-test.
const hasPermissionMock = vi.fn<(p: string) => boolean>(() => true)
const principalRoles = ref<readonly string[]>([])
const ensureSessionMock = vi.fn<(force?: boolean) => Promise<string>>(async () => 'authenticated')
vi.mock('@/stores/session.store', () => ({
  useSessionStore: () => ({
    hasPermission: hasPermissionMock,
    hasEveryPermission: () => true,
    ensureSession: ensureSessionMock,
    get roles() {
      return principalRoles.value
    },
    principal: ref(null),
  }),
}))

// --- shared privileged-action runner ---------------------------------------
const status = ref<PrivilegedActionStatus>('idle')
const isSubmitting = ref(false)
const failure = ref<PrivilegedActionFailure | null>(null)
const stepUpUrl = ref<string | null>(null)
const runMock = vi.fn<(runner: () => Promise<unknown>) => Promise<unknown>>(async (runner) => {
  status.value = 'submitting'
  isSubmitting.value = true
  try {
    const data = await runner()
    status.value = 'success'
    return data
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

// --- stub the matrix / table / form (covered in 7.5/7.6/7.8) ---------------
// Matrix stub emits the toggle/save the page wires; it never emits save for a
// system role (system columns render a badge, not a switch — Task 7.6).
vi.mock('@/components/roles/RoleMatrix.vue', () => ({
  default: defineComponent({
    name: 'RoleMatrixStub',
    emits: ['toggle', 'save'],
    setup(_, { emit }) {
      return () =>
        h('div', { 'data-testid': 'role-matrix-stub' }, [
          h(
            'button',
            {
              'data-testid': 'stub-grant-clients',
              onClick: () =>
                emit('toggle', { roleSlug: 'editor', permissionSlug: 'clients.read', granted: true }),
            },
            'grant',
          ),
          h(
            'button',
            {
              'data-testid': 'stub-revoke-users',
              onClick: () =>
                emit('toggle', { roleSlug: 'editor', permissionSlug: 'users.read', granted: false }),
            },
            'revoke',
          ),
          h('button', { 'data-testid': 'stub-save', onClick: () => emit('save', 'editor') }, 'save'),
        ])
    },
  }),
}))
vi.mock('@/components/roles/RolesTable.vue', () => ({
  default: defineComponent({ name: 'RolesTableStub', setup: () => () => h('div', 'roles-table') }),
}))
vi.mock('@/components/roles/RoleFormDialog.vue', () => ({
  default: defineComponent({ name: 'RoleFormDialogStub', setup: () => () => null }),
}))

const navigateMock = vi.hoisted(() => vi.fn<() => Promise<void>>(async () => {}))
mockNuxtImport('navigateTo', () => navigateMock)
// reverifySelf reads these auto-imports (mirror UserRoleAssignment.nuxt.spec).
mockNuxtImport('useRoute', () => () => ({ fullPath: '/roles' }))
mockNuxtImport('useRequestURL', () => () => new URL('https://admin-sso.example/roles'))
mockNuxtImport('useRuntimeConfig', () => () => ({ public: { basePath: '/' } }))

const RolesPage = (await import('../roles.vue')).default

function failWith(s: PrivilegedActionFailure): void {
  runMock.mockImplementationOnce(async () => {
    status.value = s.status
    failure.value = s
    stepUpUrl.value = s.stepUpUrl
    isSubmitting.value = false
    return null
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  rolesRef.value = [EDITOR, SYSTEM]
  status.value = 'idle'
  isSubmitting.value = false
  failure.value = null
  stepUpUrl.value = null
  hasPermissionMock.mockReturnValue(true)
  principalRoles.value = [] // not self-affecting by default
  ensureSessionMock.mockResolvedValue('authenticated')
  syncPermissionsMock.mockResolvedValue({ role: { ...EDITOR, permissions: [...EDITOR.permissions] } })
})
afterEach(() => vi.clearAllMocks())

async function openConfirm(wrapper: Awaited<ReturnType<typeof mountSuspended>>) {
  await wrapper.find('[data-testid="stub-grant-clients"]').trigger('click')
  await wrapper.find('[data-testid="stub-save"]').trigger('click')
  await wrapper.vm.$nextTick()
}

describe('roles page — sync-permissions confirm', () => {
  it('save opens the confirm dialog with the impact summary, and calls no API yet', async () => {
    const wrapper = await mountSuspended(RolesPage)
    await openConfirm(wrapper)
    const impact = wrapper.find('[data-testid="privileged-action-impact"]')
    expect(impact.exists()).toBe(true)
    expect(impact.text()).toContain('Editor') // {target} = role name
    expect(impact.text()).toContain('4') // affectedUsers = user_count
    expect(syncPermissionsMock).not.toHaveBeenCalled()
    expect(runMock).not.toHaveBeenCalled()
  })

  it('4.1 confirm → PUT the full sorted pending set, then refresh + success notice + clean dialog', async () => {
    const wrapper = await mountSuspended(RolesPage)
    await openConfirm(wrapper)
    await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()

    expect(syncPermissionsMock).toHaveBeenCalledTimes(1)
    expect(syncPermissionsMock).toHaveBeenCalledWith('editor', {
      permission_slugs: ['clients.read', 'users.read'], // sorted replace body
    })
    expect(refreshMock).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="roles-action-success"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="privileged-action-impact"]').exists()).toBe(false) // dialog closed
  })

  it('empty selection ([]) is allowed and clears all permissions', async () => {
    const wrapper = await mountSuspended(RolesPage)
    await wrapper.find('[data-testid="stub-revoke-users"]').trigger('click') // pending → {}
    await wrapper.find('[data-testid="stub-save"]').trigger('click')
    await wrapper.vm.$nextTick()
    await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(syncPermissionsMock).toHaveBeenCalledWith('editor', { permission_slugs: [] })
  })

  it('cancel calls no API and closes the dialog', async () => {
    const wrapper = await mountSuspended(RolesPage)
    await openConfirm(wrapper)
    await wrapper.find('[data-testid="privileged-action-cancel"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(syncPermissionsMock).not.toHaveBeenCalled()
    expect(refreshMock).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="privileged-action-impact"]').exists()).toBe(false)
  })

  it('4.2 forbidden / 403 → safe error + redacted REF in the dialog, no refresh', async () => {
    failWith({
      status: 'forbidden',
      requestId: 'admin-req-DENIED42',
      auditEventId: null,
      fieldErrors: {},
      stepUpUrl: null,
    })
    const wrapper = await mountSuspended(RolesPage)
    await openConfirm(wrapper)
    await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="privileged-action-error"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('REF-')
    expect(wrapper.text()).not.toContain('admin-req-DENIED42') // raw id redacted
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('4.3 unauthenticated / 401 → safe error, no refresh', async () => {
    failWith({
      status: 'unauthenticated',
      requestId: null,
      auditEventId: null,
      fieldErrors: {},
      stepUpUrl: null,
    })
    const wrapper = await mountSuspended(RolesPage)
    await openConfirm(wrapper)
    await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="privileged-action-error"]').exists()).toBe(true)
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('4.6 validation / 422 → safe error copy, no refresh, no raw exception', async () => {
    failWith({
      status: 'invalid',
      requestId: 'admin-req-VAL',
      auditEventId: null,
      fieldErrors: { permission_slugs: ['Unknown permission.'] },
      stepUpUrl: null,
    })
    const wrapper = await mountSuspended(RolesPage)
    await openConfirm(wrapper)
    await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="privileged-action-error"]').exists()).toBe(true)
    expect(wrapper.text()).not.toMatch(/SQLSTATE|stack trace|Bearer/i)
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('4.7 step-up / 428 → step-up link to step_up_url in the dialog, no refresh', async () => {
    failWith({
      status: 'step_up_required',
      requestId: null,
      auditEventId: null,
      fieldErrors: {},
      stepUpUrl: '/auth/login?prompt=login&max_age=0',
    })
    const wrapper = await mountSuspended(RolesPage)
    await openConfirm(wrapper)
    await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
    await wrapper.vm.$nextTick()
    const link = wrapper.find('[data-testid="privileged-action-stepup"] a')
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toBe('/auth/login?prompt=login&max_age=0')
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('4.5 rate limit / 429 + 4.8 5xx → safe copy + REF, no refresh', async () => {
    for (const s of ['rate_limited', 'error'] as const) {
      failWith({
        status: s,
        requestId: 'admin-req-X',
        auditEventId: null,
        fieldErrors: {},
        stepUpUrl: null,
      })
      const wrapper = await mountSuspended(RolesPage)
      await openConfirm(wrapper)
      await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
      await wrapper.vm.$nextTick()
      expect(wrapper.find('[data-testid="privileged-action-error"]').exists()).toBe(true)
      expect(wrapper.text()).toContain('REF-')
      expect(wrapper.text()).not.toContain('admin-req-X')
      expect(refreshMock).not.toHaveBeenCalled()
    }
  })

  it('4.10 leaves no stale submitting/disabled after an error (confirm stays usable)', async () => {
    failWith({
      status: 'error',
      requestId: null,
      auditEventId: null,
      fieldErrors: {},
      stepUpUrl: null,
    })
    const wrapper = await mountSuspended(RolesPage)
    await openConfirm(wrapper)
    await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
    await wrapper.vm.$nextTick()
    const confirm = wrapper.find('[data-testid="privileged-action-confirm"]')
    expect(confirm.exists()).toBe(true) // dialog stays open through the failure
    expect(confirm.attributes('disabled')).toBeUndefined()
  })

  it('4.9 surfaces an audit/correlation id REDACTED (REF-…), never raw', async () => {
    failWith({
      status: 'error',
      requestId: 'admin-req-AUD',
      auditEventId: 'audit-XYZ',
      fieldErrors: {},
      stepUpUrl: null,
    })
    const wrapper = await mountSuspended(RolesPage)
    await openConfirm(wrapper)
    await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('REF-')
    expect(wrapper.text()).not.toContain('admin-req-AUD')
    expect(wrapper.text()).not.toContain('audit-XYZ')
  })

  describe('self-lockout guard', () => {
    it('self-affecting save shows a distinct self-warning in the confirm dialog', async () => {
      principalRoles.value = ['editor'] // the acting admin holds the edited role
      const wrapper = await mountSuspended(RolesPage)
      await openConfirm(wrapper)
      const impact = wrapper.find('[data-testid="privileged-action-impact"]')
      expect(impact.exists()).toBe(true)
      expect(impact.text()).toContain(idLocale.roles.self_affect_warn)
    })

    it('non-self save does NOT show the self-warning and never re-verifies the session', async () => {
      principalRoles.value = ['some-other-role']
      const wrapper = await mountSuspended(RolesPage)
      await openConfirm(wrapper)
      expect(wrapper.find('[data-testid="privileged-action-impact"]').text()).not.toContain(
        idLocale.roles.self_affect_warn,
      )
      await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
      await wrapper.vm.$nextTick()
      // The page's useAsyncData bootstrap calls ensureSession() (no args); the guard
      // would call ensureSession(true). Non-self must NOT trigger the re-verify.
      expect(ensureSessionMock).not.toHaveBeenCalledWith(true)
      expect(navigateMock).not.toHaveBeenCalled()
    })

    it('self-affecting success re-verifies the principal and stays put while authenticated', async () => {
      principalRoles.value = ['editor']
      ensureSessionMock.mockResolvedValue('authenticated')
      const wrapper = await mountSuspended(RolesPage)
      await openConfirm(wrapper)
      await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
      await flushPromises() // run → refresh → reverifySelf → ensureSession chain
      expect(syncPermissionsMock).toHaveBeenCalledTimes(1)
      expect(ensureSessionMock).toHaveBeenCalledWith(true)
      expect(navigateMock).not.toHaveBeenCalled()
      expect(wrapper.find('[data-testid="roles-action-success"]').exists()).toBe(true)
    })

    it('self-affecting success that drops the session re-routes via the bootstrap resolver', async () => {
      principalRoles.value = ['editor']
      // persistent (not Once): the useAsyncData bootstrap consumes the first call,
      // so the guard's re-verify must also resolve 'unauthenticated'.
      ensureSessionMock.mockResolvedValue('unauthenticated')
      const wrapper = await mountSuspended(RolesPage)
      await openConfirm(wrapper)
      await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
      await flushPromises() // run → refresh → reverifySelf → ensureSession → navigateTo
      expect(ensureSessionMock).toHaveBeenCalledWith(true)
      expect(navigateMock).toHaveBeenCalled() // resolveBootstrapFailure → login/route
    })
  })

  it('renders no token or raw PII shape in the page output', async () => {
    const wrapper = await mountSuspended(RolesPage)
    await openConfirm(wrapper)
    const html = wrapper.html()
    expect(html).not.toMatch(/access_token|refresh_token|id_token|Bearer/)
    expect(html).not.toMatch(/\b\d{16}\b|\b\d{18}\b|\b\d{10}\b/) // raw NIK/NIP/NISN shapes
  })
})
```

8. [ ] **Run it — expect FAIL** (no `@save` wiring / no confirm dialog / no success notice / new key missing):
   `npm run test:unit -- app/pages/__tests__/roles-sync-permissions.page.nuxt.spec.ts`
   Expected: the `save opens the confirm dialog…` and `4.1 confirm …` cases RED — `[data-testid="privileged-action-impact"]`/`privileged-action-confirm` not found and `syncPermissionsMock` never called.

9. [ ] **GREEN — add the two i18n keys to BOTH locales** (keep id/en parity; a duplicate key fails `format:check`). In `app/locales/en.json`, inside the `roles` block (after `confirm_sync_permissions_desc`):
   ```json
   "impact_users_affected": "This changes the permission set for {count} users holding this role.",
   "self_affect_warn": "You currently hold this role — saving this change can revoke your own console access.",
   ```
   In `app/locales/id.json`, inside the `roles` block (same position):
   ```json
   "impact_users_affected": "Ini mengubah kumpulan permission untuk {count} pengguna yang memegang peran ini.",
   "self_affect_warn": "Anda saat ini memegang peran ini — menyimpan perubahan dapat mencabut akses konsol Anda sendiri.",
   ```

10. [ ] **GREEN — wire the sync flow in `app/pages/roles.vue`.** Add the imports + sync state + handlers to `<script setup>` (the list/catalog/grant scaffold from 7.7 and the create/update instances from 7.8 already exist — only the sync pieces are new):

```ts
// MERGE into roles.vue's existing <script setup> (Tasks 7.7/7.8). New symbols only.
// Already imported/declared and REUSED here (do not re-add): `ref`/`computed`,
// `usePrivilegedAction`, `rolesApi`, `buildRoleGrantMap`/`diffRoleGrants`, the BARE
// composable refs (`roles`/`paged`/`refresh`/`viewState`/…), `pendingGrants`, the
// read-only `originalGrants` + `dirtyRoleSlugs` computeds, the session `store`,
// `t`, and `successMessage`.
import PrivilegedActionDialog from '@/components/users/PrivilegedActionDialog.vue'
import { describePermissionImpact } from '@/lib/roles/permission-impact'
import { resolveBootstrapFailure } from '@/lib/auth/admin-guard-resolver'

const sync = usePrivilegedAction<RoleMutationResponse>()
const syncTarget = ref<AdminRole | null>(null)

// `originalGrants` (server snapshot) + `pendingGrants` + the read-only
// `dirtyRoleSlugs` computed all come from Task 7.7 — reuse, do NOT re-declare.
const syncDiff = computed(() =>
  syncTarget.value
    ? diffRoleGrants(
        originalGrants.value.get(syncTarget.value.slug) ?? new Set<string>(),
        pendingGrants.value.get(syncTarget.value.slug) ?? new Set<string>(),
      )
    : null,
)

// Self-lockout guard: is the edited role one the acting admin currently holds?
const syncIsSelf = computed<boolean>(
  () => syncTarget.value != null && store.roles.includes(syncTarget.value.slug),
)

// Operational-write impact summary: role name + users touched, plus a distinct
// self-warning line when the acting admin holds the role.
const syncDescription = computed(() => {
  const role = syncTarget.value
  const diff = syncDiff.value
  if (!role || !diff) return ''
  const impact = describePermissionImpact(role, diff)
  const base = `${t('roles.confirm_sync_permissions_desc', { target: role.name })} ${t('roles.impact_users_affected', { count: impact.affectedUsers })}`
  return syncIsSelf.value ? `${base} ${t('roles.self_affect_warn')}` : base
})

// Step-up drives its own link, never the generic error line (mirror deleteErrorMessage, 7.10).
const syncErrorMessage = computed(() =>
  sync.failure.value && sync.failure.value.status !== 'step_up_required'
    ? t('common.error_generic')
    : null,
)

// Shared self-lockout re-verify (also reused by delete in Task 7.10). After a
// self-affecting mutation, re-confirm the principal; if it dropped, route out via
// the existing bootstrap-failure resolver (mirror UserRoleAssignment.vue).
async function reverifySelf(): Promise<void> {
  const ensure = await store.ensureSession(true)
  if (ensure === 'authenticated') return
  const resolution = resolveBootstrapFailure(
    ensure,
    useRoute().fullPath,
    useRequestURL().origin,
    useRuntimeConfig().public.basePath,
  )
  if (resolution.kind === 'login') await navigateTo(resolution.url, { external: true })
  else if (resolution.kind === 'route') await navigateTo(resolution.to)
}

// REPLACE the 7.7 stub body of onMatrixSave (do NOT rename — the 7.7 RoleMatrix
// element already binds @save="onMatrixSave").
function onMatrixSave(roleSlug: string): void {
  const role = (roles.value ?? []).find((r) => r.slug === roleSlug)
  if (!role || role.is_system) return // system columns never reach save
  sync.reset()
  successMessage.value = null
  syncTarget.value = role
}

async function onSyncConfirm(): Promise<void> {
  const role = syncTarget.value
  const diff = syncDiff.value
  if (!role || !diff) return
  const selfAffecting = syncIsSelf.value
  const result = await sync.run(() =>
    rolesApi.syncPermissions(role.slug, { permission_slugs: diff.permission_slugs }),
  )
  if (result === null) return // failure stays in the dialog (safe copy + REF + step-up)
  await refresh()
  pendingGrants.value = buildRoleGrantMap(roles.value ?? []) // reseed → dirtyRoleSlugs recomputes (read-only)
  syncTarget.value = null
  successMessage.value = t('roles.roles_permissions_success')
  if (selfAffecting) await reverifySelf() // self-affecting: re-verify, re-route if the session dropped
}

function onSyncCancel(): void {
  syncTarget.value = null
  sync.reset()
}
```

   Template — the `RoleMatrix` element **already exists from Task 7.7** with the correct label bindings (`col_permission`/`col_category`/`granted`/`denied`) and already binds `@toggle="onMatrixToggle"` + `@save="onMatrixSave"`; do **NOT** re-paste it here. Success is rendered by the shared `roles-action-success` region from 7.7. The only new markup this task adds is the reused confirm dialog (operational-write → `:danger="false"`, reasonless), placed inside the ready branch after `RoleMatrix`:
```vue
<PrivilegedActionDialog
  v-if="syncTarget"
  :open="syncTarget !== null"
  :title="t('roles.confirm_sync_permissions_title')"
  :description="syncDescription"
  :confirm-label="t('roles.btn_save')"
  :cancel-label="t('roles.btn_cancel')"
  :danger="false"
  :submitting="sync.isSubmitting.value"
  :step-up-url="sync.stepUpUrl.value"
  :error-message="syncErrorMessage"
  :request-id="sync.requestId.value"
  @confirm="onSyncConfirm"
  @cancel="onSyncCancel"
/>
```

11. [ ] **Run it — expect PASS:**
    `npm run test:unit -- app/pages/__tests__/roles-sync-permissions.page.nuxt.spec.ts`
    Expected: `Test Files 1 passed` · all `roles page — sync-permissions confirm` cases green.

12. [ ] **Refactor:** the `RoleMatrix` element + its label bindings live in Task 7.7 (correct `col_permission`/`col_category`/`granted`/`denied` keys) — this task does not touch them, it only replaces the `onMatrixSave` body and adds the confirm dialog. Confirm no hard-coded colours, the confirm primary is accent (`:danger="false"`), `--danger` red appears nowhere in this flow (it is delete-only, Task 7.10), the read-only `dirtyRoleSlugs` computed is never assigned to, and no raw `requestId` is rendered (only `REF-…` via the dialog). Re-run the Part-B command — still green.

13. [ ] **Commit:**
    `git add app/pages/roles.vue app/locales/en.json app/locales/id.json app/pages/__tests__/roles-sync-permissions.page.nuxt.spec.ts`
    ```
    feat(sso-admin-frontend): wire role sync-permissions privileged action with impact confirm

    RoleMatrix save opens the reused PrivilegedActionDialog with an impact
    summary naming the N users affected, then PUT-replaces the role's
    permission set (empty selection clears all) through the full
    failure/step-up matrix and refreshes the list. Cancel calls no API;
    system-role columns never reach save; only delete stays danger-red.

    Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
    ```

---

**Task-scoped DoD (run from `services/sso-admin-frontend`; report any blocked command — never claim PASS for a command that did not run):**
`npm run typecheck && npm run lint && npm run format:check && npm run test && npm run build`
(`npm run lint` is `run-s lint:*` → BOTH `lint:oxlint` (`oxlint .`) AND `lint:eslint` (`eslint "src/**/*.vue" "app/**/*.vue" --cache`) must pass; the full-suite `npm run test` includes the new `permission-impact.spec.ts` + `roles-sync-permissions.page.nuxt.spec.ts`. The Roles e2e + SSR-leak-gate extension land in Task 7.11.)

---

### Task 7.10: Delete-role high-privilege action (double gate + step-up)

Wire `RolesTable`'s `delete(role)` emit into the **highest-privilege** Roles write. Deleting a role is not an ordinary write: extract-backend routes `DELETE /admin/api/roles/{role}` **inside the session-management group**, so the backend requires `ROLES_WRITE` **AND** `SESSIONS_TERMINATE` **AND** the admin-session-management role **AND** `:step_up` freshness — a stricter recent-reauth window than create/update/sync's `:write`. The UI mirrors that as UX minimization over an authoritative backend gate: the delete affordance is visible only when `canDelete = hasPermission('admin.roles.write') && hasPermission('admin.sessions.terminate')` **and** `!role.is_system` (RolesTable enforces the per-row `is_system` half from Task 7.5; the page supplies `canDelete`). The verified capability key is **`admin.sessions.terminate`** — the exact same dual-gate string the clients lifecycle already reads (`app/lib/clients/client-actions.ts:29`), so there is no new capability to invent; if it is absent from the principal matrix, delete stays hidden.

On `delete(role)` the page opens the **reused** `PrivilegedActionDialog` in `danger` mode (red `#E4002B` on the destructive confirm only — never elsewhere), titled `roles.confirm_delete_title` / described `roles.confirm_delete_desc` (`{target}` = role name; both keys already exist and already interpolate `{target}`). Confirm runs `usePrivilegedAction<RoleDeleteResponse>().run(() => rolesApi.destroy(role.slug))` (DELETE, `:step_up`). On success the page closes the dialog, sets the success message (`roles.roles_delete_success`), and **explicitly** refreshes the list (never stale). The full failure matrix is surfaced **inside the open dialog**: `step_up_required` (428/412/`reauth_required`/`step_up_required`) shows the step-up link; `invalid` (422 `role_management_failed`, in practice "Role still has assigned users." since system roles can never reach this button) shows safe domain copy + a redacted `REF-…`; every other status shows safe generic copy + `REF-…`. Cancel calls **no** API; a failed delete leaves **no** stale loading/disabled state (the `usePrivilegedAction` `finally` already settles `status` off `submitting`).

This task only **edits** `roles.vue` (the page shell, search/pagination, list/matrix render, create/update from 7.8, sync from 7.9 all already exist) and adds the failing page spec; the dialog, the runner, the failure matrix, the service method, and the response type are all consumed from their existing paths.

**Files**
- Edit: `app/pages/roles.vue` (add the delete `usePrivilegedAction` instance, `canDelete`, `deleteTarget`, the danger `PrivilegedActionDialog`, and `@delete` wiring on `RolesTable`)
- Edit: `app/locales/en.json` (ADD three net-new keys inside the existing `roles` object — see step 3; `roles.self_affect_warn` is REUSED from Task 7.9, not re-added)
- Edit: `app/locales/id.json` (ADD the same three keys, keep parity)
- Test: `app/pages/__tests__/roles-delete.page.nuxt.spec.ts` (new — nuxt-runtime)

**Interfaces**
- Consumes:
  - `usePrivilegedAction` (`@/composables/usePrivilegedAction`) — `usePrivilegedAction<T>(): { status, isSubmitting, failure, requestId, auditEventId, fieldErrors, stepUpUrl, run, reset }`; one instance for delete.
  - `PrivilegedActionDialog` (`@/components/users/PrivilegedActionDialog.vue`, **reused as-is**) — props `open/title/description/confirmLabel/cancelLabel/danger/submitting/stepUpUrl/stepUpLabel/errorMessage/requestId`; emits `confirm`/`cancel`; confirm does NOT auto-close.
  - `rolesApi.destroy` (`@/services/roles.api`) — `destroy(slug: string): Promise<RoleDeleteResponse>` (DELETE `/api/admin/roles/{slug}`).
  - `RoleDeleteResponse` (`@/types/users.types`) — `{ readonly deleted: boolean; readonly role_slug: string }`.
  - `useSessionStore().hasPermission` (`@/stores/session.store`) — `hasPermission(p: string): boolean`.
  - `useRolesList()` (`@/composables/useRolesList`) — for `refresh()` after success (already bound in 7.7).
  - `AdminRole` (`@/types/users.types`); `useI18n` (`@/composables/useI18n`) `roles.*` / `common.*` keys.
- Produces (`app/pages/roles.vue`):
  - a `usePrivilegedAction<RoleDeleteResponse>()` instance for delete;
  - `canDelete = computed(() => store.hasPermission('admin.roles.write') && store.hasPermission('admin.sessions.terminate'))`, passed as `:can-delete` to `RolesTable`;
  - the delete affordance gated on `canDelete && !role.is_system` (page supplies `canDelete`, RolesTable hides the per-row button on `is_system`);
  - `delete` wired via `usePrivilegedAction<RoleDeleteResponse>` + the danger `PrivilegedActionDialog`; the confirm description names the target, the `role.user_count` **blast radius** (`roles.delete_blast_radius`), and — when the role is one the acting admin holds (`store.roles`) — a distinct `roles.self_affect_warn` line; on success → close dialog + set the shared `successMessage` (`roles.roles_delete_success`) + `refresh()`, and on a self-affecting delete re-verify the principal via the shared `reverifySelf` (declared in 7.9) and re-route if it drops; step-up surfaced on 428. Uses the BARE composable names from 7.7 (`paged`/`viewState`/`refresh`).

> ponytail: no new composable, dialog, service method, or error-mapping module — `usePrivilegedAction` + `resolvePrivilegedActionFailure` already encode the entire 401/403/419/422/428/429/5xx + step-up matrix, and the clients domain already proved the `admin.roles.write` + `admin.sessions.terminate` dual gate. This task is wiring + one spec, nothing more.

**Steps**

1. [ ] **RED — write the failing page spec.** Create `app/pages/__tests__/roles-delete.page.nuxt.spec.ts`. The list composable, permission catalog, session store, `navigateTo`, and `useI18n` are mocked (so each branch is deterministic and assertions read literal English), but `usePrivilegedAction` and `PrivilegedActionDialog` are the **real** implementations and only `rolesApi.destroy` is a spy — so the test drives the genuine failure matrix end-to-end, not a mock of it.

```ts
// *.nuxt.spec.ts → 'nuxt' env: mountSuspended runs roles.vue's async setup
// (useAsyncData principal + useI18n + definePageMeta). The list/catalog
// composables, session store, navigateTo and i18n are mocked; the privileged-
// action runner + dialog are REAL so the delete matrix is exercised genuinely,
// and only rolesApi.destroy is a spy.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import enLocale from '@/locales/en.json'
import { ApiError } from '@/lib/api/api-client'
import type { AdminRole, AdminPermission, RoleDeleteResponse } from '@/types/users.types'

// --- service seam: only destroy matters here; the rest are inert spies -------
const destroyMock = vi.fn<(slug: string) => Promise<RoleDeleteResponse>>()
vi.mock('@/services/roles.api', () => ({
  rolesApi: {
    list: vi.fn(),
    permissions: vi.fn(),
    store: vi.fn(),
    update: vi.fn(),
    syncPermissions: vi.fn(),
    destroy: destroyMock,
  },
}))

// --- list composable (ready state with one custom + one system role) --------
const CUSTOM_ROLE: AdminRole = {
  id: 2,
  slug: 'support-agent',
  name: 'Support Agent',
  description: 'Front-line support operators',
  is_system: false,
  permissions: [{ slug: 'users.read', name: 'Read users', category: 'users' }],
  user_count: 4,
  users_count: 4,
}
const SYSTEM_ROLE: AdminRole = {
  id: 1,
  slug: 'platform-admin',
  name: 'Platform Admin',
  description: 'Full administrative access',
  is_system: true,
  permissions: [{ slug: 'users.read', name: 'Read users', category: 'users' }],
  user_count: 3,
  users_count: 3,
}
const PERMISSIONS: readonly AdminPermission[] = [
  { slug: 'users.read', name: 'Read users', description: 'Allow reading user records', category: 'users' },
]
const rolesRef = ref<readonly AdminRole[]>([CUSTOM_ROLE, SYSTEM_ROLE])
const refreshMock = vi.fn<() => Promise<void>>(async () => {})
vi.mock('@/composables/useRolesList', () => ({
  useRolesList: () => ({
    roles: rolesRef,
    filtered: computed(() => rolesRef.value),
    paged: computed(() => rolesRef.value),
    total: computed(() => rolesRef.value.length),
    filteredTotal: computed(() => rolesRef.value.length),
    pageCount: computed(() => 1),
    page: ref(1),
    query: ref(''),
    viewState: computed(() => 'ready' as const),
    isStale: computed(() => false),
    requestId: computed(() => null),
    pending: ref(false),
    refresh: refreshMock,
  }),
}))
vi.mock('@/composables/usePermissionCatalog', () => ({
  usePermissionCatalog: () => ({
    permissions: ref(PERMISSIONS),
    viewState: computed(() => 'ready' as const),
    isStale: computed(() => false),
    requestId: computed(() => null),
    pending: ref(false),
    refresh: vi.fn<() => Promise<void>>(async () => {}),
  }),
}))

// --- session store: mutable capability allow-list drives the double gate -----
// `roles` is the acting principal's role set (self-lockout guard); ensureSession
// returns a SessionEnsureResult string so the self re-verify path can be driven.
let permitted: string[] = []
let principalRoles: readonly string[] = []
const ensureSessionMock = vi.fn<(force?: boolean) => Promise<string>>(async () => 'authenticated')
vi.mock('@/stores/session.store', () => ({
  useSessionStore: () => ({
    principal: { display_name: 'Admin Sentinel' },
    ensureSession: ensureSessionMock,
    hasPermission: (p: string) => permitted.includes(p),
    get roles() {
      return principalRoles
    },
  }),
}))

// --- i18n pinned to en so assertions use literal English strings ------------
vi.mock('@/composables/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      let val: unknown = enLocale
      for (const part of key.split('.')) val = (val as Record<string, unknown>)?.[part]
      if (typeof val !== 'string') return key
      if (!params) return val
      return val.replace(/\{(\w+)\}/gu, (_: string, k: string) => String(params[k] ?? ''))
    },
  }),
}))

const navigateMock = vi.hoisted(() => vi.fn<(...a: unknown[]) => Promise<void>>(async () => {}))
mockNuxtImport('navigateTo', () => navigateMock)
// reverifySelf reads these auto-imports (mirror UserRoleAssignment.nuxt.spec).
mockNuxtImport('useRoute', () => () => ({ fullPath: '/roles' }))
mockNuxtImport('useRequestURL', () => () => new URL('https://admin-sso.example/roles'))
mockNuxtImport('useRuntimeConfig', () => () => ({ public: { basePath: '/' } }))

const RolesPage = (await import('../roles.vue')).default

const BOTH = ['admin.roles.read', 'admin.roles.write', 'admin.sessions.terminate']
type Wrapper = Awaited<ReturnType<typeof mountSuspended>>

function deleteButtons(wrapper: Wrapper) {
  return wrapper.findAll('button').filter((b) => b.text() === enLocale.roles.btn_delete)
}

async function openDeleteDialog(wrapper: Wrapper): Promise<void> {
  const buttons = deleteButtons(wrapper)
  expect(buttons.length).toBe(1)
  await buttons[0]!.trigger('click')
  await flushPromises()
}

beforeEach(() => {
  permitted = [...BOTH]
  principalRoles = [] // not self-affecting by default
  rolesRef.value = [CUSTOM_ROLE, SYSTEM_ROLE]
  destroyMock.mockReset()
  refreshMock.mockReset()
  ensureSessionMock.mockReset()
  ensureSessionMock.mockResolvedValue('authenticated')
})
afterEach(() => {
  vi.clearAllMocks()
})

describe('roles delete — double gate + system-role protection', () => {
  it('shows exactly one delete affordance (custom role only) with BOTH capabilities', async () => {
    const wrapper = await mountSuspended(RolesPage)
    // one custom + one system role → system role must NOT expose delete
    expect(deleteButtons(wrapper).length).toBe(1)
  })

  it('hides delete when admin.sessions.terminate is missing (single gate is not enough)', async () => {
    permitted = ['admin.roles.read', 'admin.roles.write']
    const wrapper = await mountSuspended(RolesPage)
    expect(deleteButtons(wrapper).length).toBe(0)
  })

  it('hides delete when admin.roles.write is missing', async () => {
    permitted = ['admin.roles.read', 'admin.sessions.terminate']
    const wrapper = await mountSuspended(RolesPage)
    expect(deleteButtons(wrapper).length).toBe(0)
  })

  it('hides delete entirely for a read-only admin', async () => {
    permitted = ['admin.roles.read']
    const wrapper = await mountSuspended(RolesPage)
    expect(deleteButtons(wrapper).length).toBe(0)
  })
})

describe('roles delete — danger confirm lifecycle', () => {
  it('opens the danger dialog naming the target + blast radius and calls no API before confirm', async () => {
    const wrapper = await mountSuspended(RolesPage)
    await openDeleteDialog(wrapper)
    const impact = wrapper.find('[data-testid="privileged-action-impact"]')
    expect(impact.exists()).toBe(true)
    expect(impact.text()).toContain('Support Agent')
    expect(impact.text()).toContain('4') // role.user_count blast radius
    const confirm = wrapper.find('[data-testid="privileged-action-confirm"]')
    expect(confirm.exists()).toBe(true)
    expect(confirm.text()).toBe(enLocale.common.btn_delete)
    expect(destroyMock).not.toHaveBeenCalled()
  })

  it('cancel calls no API and dismisses the dialog', async () => {
    const wrapper = await mountSuspended(RolesPage)
    await openDeleteDialog(wrapper)
    await wrapper.find('[data-testid="privileged-action-cancel"]').trigger('click')
    await flushPromises()
    expect(destroyMock).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="privileged-action-confirm"]').exists()).toBe(false)
  })

  it('confirm deletes the role, refreshes the list, and surfaces the success message', async () => {
    destroyMock.mockResolvedValue({ deleted: true, role_slug: 'support-agent' })
    const wrapper = await mountSuspended(RolesPage)
    await openDeleteDialog(wrapper)
    await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
    await flushPromises()
    expect(destroyMock).toHaveBeenCalledWith('support-agent')
    expect(refreshMock).toHaveBeenCalledTimes(1)
    const success = wrapper.find('[data-testid="roles-action-success"]')
    expect(success.exists()).toBe(true)
    expect(success.text()).toBe(enLocale.roles.roles_delete_success)
    expect(wrapper.find('[data-testid="privileged-action-confirm"]').exists()).toBe(false)
  })
})

describe('roles delete — self-lockout guard', () => {
  it('shows the distinct self-warning when deleting a role the acting admin holds', async () => {
    principalRoles = ['support-agent']
    const wrapper = await mountSuspended(RolesPage)
    await openDeleteDialog(wrapper)
    const impact = wrapper.find('[data-testid="privileged-action-impact"]')
    expect(impact.text()).toContain(enLocale.roles.self_affect_warn)
  })

  it('non-self delete shows no self-warning and never re-verifies the session', async () => {
    principalRoles = ['some-other-role']
    destroyMock.mockResolvedValue({ deleted: true, role_slug: 'support-agent' })
    const wrapper = await mountSuspended(RolesPage)
    await openDeleteDialog(wrapper)
    expect(wrapper.find('[data-testid="privileged-action-impact"]').text()).not.toContain(
      enLocale.roles.self_affect_warn,
    )
    await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
    await flushPromises()
    // useAsyncData bootstrap calls ensureSession() (no args); the guard would call
    // ensureSession(true). Non-self must NOT trigger the re-verify.
    expect(ensureSessionMock).not.toHaveBeenCalledWith(true)
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('self-affecting success re-verifies the principal and stays put while authenticated', async () => {
    principalRoles = ['support-agent']
    destroyMock.mockResolvedValue({ deleted: true, role_slug: 'support-agent' })
    ensureSessionMock.mockResolvedValue('authenticated')
    const wrapper = await mountSuspended(RolesPage)
    await openDeleteDialog(wrapper)
    await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
    await flushPromises()
    expect(destroyMock).toHaveBeenCalledWith('support-agent')
    expect(refreshMock).toHaveBeenCalledTimes(1)
    expect(ensureSessionMock).toHaveBeenCalledWith(true)
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('self-affecting success that drops the session re-routes via the bootstrap resolver', async () => {
    principalRoles = ['support-agent']
    destroyMock.mockResolvedValue({ deleted: true, role_slug: 'support-agent' })
    // persistent (not Once): the useAsyncData bootstrap consumes the first call,
    // so the guard's re-verify must also resolve 'unauthenticated'.
    ensureSessionMock.mockResolvedValue('unauthenticated')
    const wrapper = await mountSuspended(RolesPage)
    await openDeleteDialog(wrapper)
    await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
    await flushPromises()
    expect(ensureSessionMock).toHaveBeenCalledWith(true)
    expect(navigateMock).toHaveBeenCalled() // resolveBootstrapFailure → login/route
  })
})

describe('roles delete — privileged-action failure matrix (real runner)', () => {
  it.each([401, 403, 419, 429, 500])(
    'surfaces safe copy + a redacted REF for %i without refreshing or going stale',
    async (status) => {
      destroyMock.mockRejectedValue(new ApiError(status, 'boom', undefined, {}, `req-${status}`))
      const wrapper = await mountSuspended(RolesPage)
      await openDeleteDialog(wrapper)
      await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
      await flushPromises()
      const error = wrapper.find('[data-testid="privileged-action-error"]')
      expect(error.exists()).toBe(true)
      expect(error.text()).toContain(enLocale.common.error_generic)
      const ref = wrapper.find('[data-testid="privileged-action-ref"]')
      expect(ref.exists()).toBe(true)
      expect(ref.text()).toMatch(/^REF-/u)
      // no raw correlation id leaks into the surface
      expect(wrapper.html()).not.toContain(`req-${status}`)
      expect(refreshMock).not.toHaveBeenCalled()
      // dialog stays open and the confirm is re-enabled (no stale loading/disabled)
      const confirm = wrapper.find('[data-testid="privileged-action-confirm"]')
      expect(confirm.exists()).toBe(true)
      expect(confirm.attributes('disabled')).toBeUndefined()
    },
  )

  it('maps 422 role_management_failed to safe domain copy (role still has users)', async () => {
    destroyMock.mockRejectedValue(
      new ApiError(422, 'Role still has assigned users.', 'role_management_failed', {}, 'req-422'),
    )
    const wrapper = await mountSuspended(RolesPage)
    await openDeleteDialog(wrapper)
    await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
    await flushPromises()
    const error = wrapper.find('[data-testid="privileged-action-error"]')
    expect(error.exists()).toBe(true)
    expect(error.text()).toContain(enLocale.roles.delete_failed_has_users)
    // raw backend exception string is never rendered
    expect(wrapper.html()).not.toContain('Role still has assigned users.')
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('surfaces the step-up link on 428 and does not refresh', async () => {
    destroyMock.mockRejectedValue(
      new ApiError(
        428,
        'reauth required',
        'step_up_required',
        { step_up_url: 'https://idp.example/step-up' },
        'req-428',
      ),
    )
    const wrapper = await mountSuspended(RolesPage)
    await openDeleteDialog(wrapper)
    await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
    await flushPromises()
    const stepup = wrapper.find('[data-testid="privileged-action-stepup"]')
    expect(stepup.exists()).toBe(true)
    expect(stepup.find('a').attributes('href')).toBe('https://idp.example/step-up')
    // step-up is not a generic error; the error surface stays absent
    expect(wrapper.find('[data-testid="privileged-action-error"]').exists()).toBe(false)
    expect(refreshMock).not.toHaveBeenCalled()
    const confirm = wrapper.find('[data-testid="privileged-action-confirm"]')
    expect(confirm.attributes('disabled')).toBeUndefined()
  })
})
```

2. [ ] **Run it — expect FAIL.** The page has no delete wiring yet (no `data-testid="privileged-action-*"` rendered, no `roles.delete_failed_has_users` key):

```bash
npm run test -- app/pages/__tests__/roles-delete.page.nuxt.spec.ts
```
Expected: RED — e.g. `expect(buttons.length).toBe(1)` receives `0` (no delete button wired / `canDelete` undefined), and the dialog-open assertions fail because no `PrivilegedActionDialog` is mounted.

3. [ ] **GREEN — add the three net-new locale keys** (BOTH files, inside the existing `roles` object, keep id/en parity). Everything else (`confirm_delete_title/desc`, `roles_delete_success`, `common.btn_delete`, `common.btn_cancel`, `common.error_generic`) already exists, and `roles.self_affect_warn` is **REUSED from Task 7.9** — do **not** re-add it (a duplicate key fails `format:check` / the locale-parity check).

`app/locales/en.json` → `roles`:
```json
    "delete_failed_has_users": "This role still has assigned users. Reassign them before deleting the role.",
    "delete_blast_radius": "{count} users currently hold this role and will lose it.",
    "step_up_cta": "Re-authenticate to continue"
```
`app/locales/id.json` → `roles`:
```json
    "delete_failed_has_users": "Peran ini masih memiliki pengguna yang ditugaskan. Pindahkan pengguna tersebut sebelum menghapus peran.",
    "delete_blast_radius": "{count} pengguna saat ini memegang peran ini dan akan kehilangannya.",
    "step_up_cta": "Autentikasi ulang untuk melanjutkan"
```
> ponytail: backend deletion fails-closed (422 `role_management_failed`) when the role still has users, so the blast-radius line is UX honesty over an authoritative gate, not a client-side block — the confirm stays enabled and the server is the boundary.

4. [ ] **GREEN — wire delete into `app/pages/roles.vue`.** MERGE into the existing `<script setup lang="ts">`. New symbols only — `usePrivilegedAction`, `PrivilegedActionDialog`, `rolesApi`, `computed`/`ref`, the BARE composable refs (`paged`/`viewState`/`refresh`), the session `store`, `t`, `successMessage`, the **already-declared `canDelete`** (Task 7.7) and the shared `reverifySelf` (Task 7.9) are all present from 7.7–7.9; reuse them, do **not** re-declare:

```ts
import type { RoleDeleteResponse } from '@/types/users.types'

const deleteAction = usePrivilegedAction<RoleDeleteResponse>()
const deleteTarget = ref<AdminRole | null>(null)

// `canDelete` (write + sessions.terminate dual gate) is already declared in Task 7.7
// and passed as :can-delete to RolesTable — do NOT re-declare it here.

// Self-lockout guard: is the role being deleted one the acting admin holds?
const deleteIsSelf = computed<boolean>(
  () => deleteTarget.value != null && store.roles.includes(deleteTarget.value.slug),
)

// Confirm copy: target name + the user_count blast radius + (when self-affecting)
// the shared self-warning line. user_count is honesty over the authoritative
// backend gate (delete fails-closed 422 while the role still has users).
const deleteDescription = computed(() => {
  const role = deleteTarget.value
  if (!role) return ''
  const parts = [
    t('roles.confirm_delete_desc', { target: role.name }),
    t('roles.delete_blast_radius', { count: role.user_count }),
  ]
  if (deleteIsSelf.value) parts.push(t('roles.self_affect_warn'))
  return parts.join(' ')
})

// PrivilegedActionFailure carries no message — the dialog copy is status-mapped.
// invalid (422) on delete can only mean "role still has assigned users" because
// system roles never reach this button; step-up drives its own link, not an error.
const deleteErrorMessage = computed(() => {
  const status = deleteAction.failure.value?.status
  if (!status || status === 'step_up_required') return null
  if (status === 'invalid') return t('roles.delete_failed_has_users')
  return t('common.error_generic')
})

// REPLACE the 7.7 stub body of onDeleteRequested (do NOT rename).
function onDeleteRequested(role: AdminRole): void {
  deleteAction.reset()
  successMessage.value = null
  deleteTarget.value = role
}

function onDeleteCancel(): void {
  deleteTarget.value = null
}

async function onDeleteConfirm(): Promise<void> {
  const role = deleteTarget.value
  if (!role) return
  const selfAffecting = deleteIsSelf.value
  const result = await deleteAction.run(() => rolesApi.destroy(role.slug))
  if (result === null) return // failure stays in the open dialog (error/step-up/REF)
  deleteTarget.value = null
  successMessage.value = t('roles.roles_delete_success')
  await refresh()
  if (selfAffecting) await reverifySelf() // deleting a role you hold can revoke your own access
}
```

The existing `RolesTable` in the ready branch (Task 7.7) **already** binds `:can-delete="canDelete"` and `@delete="onDeleteRequested"` (and `canDelete` is declared in 7.7), and the `roles-action-success` region is already present — so the **only new markup** in this task is the danger confirm dialog. Add it inside the ready branch, after the existing `PrivilegedActionDialog` from 7.9:

```vue
    <PrivilegedActionDialog
      :open="deleteTarget !== null"
      :title="t('roles.confirm_delete_title')"
      :description="deleteDescription"
      :confirm-label="t('common.btn_delete')"
      :cancel-label="t('common.btn_cancel')"
      danger
      :submitting="deleteAction.isSubmitting.value"
      :error-message="deleteErrorMessage"
      :request-id="deleteAction.requestId.value"
      :step-up-url="deleteAction.stepUpUrl.value"
      :step-up-label="t('roles.step_up_cta')"
      @confirm="onDeleteConfirm"
      @cancel="onDeleteCancel"
    />
```
> ponytail: the `RolesTable` element, `:can-write`/`:can-delete`, every `@event` binding, and the success region all already exist from 7.7–7.9 — do **not** re-paste the table. This task adds exactly one element (the danger dialog) and replaces the `onDeleteRequested` stub body.

5. [ ] **Run it — expect PASS:**

```bash
npm run test -- app/pages/__tests__/roles-delete.page.nuxt.spec.ts
```
Expected: GREEN — visibility matrix (4), confirm lifecycle (3), and the failure matrix (`it.each` 5 statuses + 422 + 428) all pass.

6. [ ] **REFACTOR (only if needed).** If `deleteErrorMessage` or the confirm handler reads awkwardly, tidy in place — no new module, no shared helper extraction (the page is the only delete caller; YAGNI). Re-run the spec to confirm still green.

7. [ ] **Commit:**

```bash
git add app/pages/roles.vue app/pages/__tests__/roles-delete.page.nuxt.spec.ts app/locales/en.json app/locales/id.json
git commit -m "$(cat <<'EOF'
feat(sso-admin-frontend): wire double-gated step-up role delete

Gate the Roles delete affordance behind admin.roles.write AND
admin.sessions.terminate (plus the per-row is_system protection from
RolesTable), confirm through the reused PrivilegedActionDialog (danger),
and run rolesApi.destroy through usePrivilegedAction so the full
401/403/419/422/428/429/5xx + step-up matrix surfaces safe copy and a
redacted support reference. Refresh the list and toast on success;
cancel calls no API and a failed delete leaves no stale loading.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Task-scoped DoD** (run from `services/sso-admin-frontend`; BOTH lint steps must pass — `npm run lint` is `run-s lint:*` = `lint:oxlint` (`oxlint .`) **and** `lint:eslint` (`eslint "src/**/*.vue" "app/**/*.vue" --cache`); a green oxlint with red eslint is NOT done):

```bash
npm run typecheck && npm run lint && npm run format:check && npm run test -- app/pages/__tests__/roles-delete.page.nuxt.spec.ts
```
Expected: typecheck clean, both lint passes clean, format:check clean, and the delete page spec green. (The full-suite `npm run test && npm run build && npm run test:e2e` gate runs in Task 7.11.)

---

### Task 7.11: Extend the SSR token-leak gate + Roles e2e + full DoD

**Files**
- Edit: `test/ssr-token-leak.gate.spec.ts` (add `fetchRoles` + the three roles `it` blocks)
- Edit: `test/fixtures/ssr-leak/server/routes/api/admin/roles/index.get.ts` (replace the empty `{ roles: [] }` stub with a representative masked role list so the page renders READY, not EMPTY)
- Create: `test/fixtures/ssr-leak/server/routes/api/admin/permissions.get.ts` (the permission catalog fixture — currently absent, so the matrix columns/rows would never mount)
- Verify (no edit expected): `test/fixtures/ssr-leak/server/routes/api/admin/me.get.ts` — the sentinel principal's `permissions.capabilities` already contains `admin.roles.write` AND `admin.sessions.terminate`, so the editable matrix + delete affordance render under the gate; confirm before relying on it
- Create: `e2e/roles.spec.ts` (Playwright — the role × permission matrix high-risk path)
- Optional: `server/__tests__/admin-proxy.spec.ts` (roles allow/deny belt-and-suspenders assertions)

**Interfaces**
- Consumes: existing gate helpers `extractPayload`, `collectSecretLeaks`, `collectPiiShapeLeaks`, and the `$fetch`/`setup({ build:false })` harness in `test/ssr-token-leak.gate.spec.ts`; sentinels `SENTINEL` + `SSR_LEAK_CANARY` from `test/fixtures/ssr-leak/sentinels.ts`; the fixture principal plugin `test/fixtures/ssr-leak/app/plugins/sentinel-session.server.ts` (injects tokens/PII onto `event.context`, never the client); `rolesApi` + `roles.vue` (Tasks 7.3 / 7.7) as the rendered `/roles` route; the prebuilt fixture LAYER (`test/globalSetup.ts` rebuilds `.output` so new fixture routes are picked up); the full DoD command set.
- Produces (`test/ssr-token-leak.gate.spec.ts`): `const fetchRoles = () => $fetch('/roles')`; a "renders roles ready (masked)" assertion (`expect(html).toContain('data-admin-shell')` + a sentinel role name + a sentinel permission name); `collectSecretLeaks(html).toEqual([])` + `collectSecretLeaks(payload).toEqual([])` + `collectPiiShapeLeaks(payload).toEqual([])` for both the roles HTML and the hydration payload — **strict, no `allowSessionId`** (the roles DTOs carry no token/secret/PII).
- Produces (`e2e/roles.spec.ts`): the role/permission-matrix high-risk path — load `/roles`, assert the matrix renders, toggle a permission switch, save → confirm the sync-permissions impact summary (blast radius "N users holding this role") → assert the PUT fired; plus the forbidden / permission-hidden states (admin without `admin.roles.read` → `/forbidden`; system-role edit/delete hidden).

This is the **final integration + proof task** of Phase 7. It writes no product code — it proves, against a real SSR render and a real browser, that the roles surface built in Tasks 7.1–7.10 leaks nothing and that its single highest-risk flow (sync-permissions over the matrix) works end to end. It mirrors the dashboard-summary gate extension in commit `f60ceb49` exactly.

**Privileged-action note:** the e2e exercises **sync-permissions** (operational-write, accent confirm) through the reused `PrivilegedActionDialog`; the impact summary ("changes the permission set for N users holding this role") MUST be visible before confirm, and cancel must call no API. The destructive **delete** affordance (the only `#E4002B` red) is asserted only for its visibility gate here (double-permission + `!is_system`); its full failure/step-up matrix lives in Task 7.10's unit tests.

---

#### Step 1 — RED: extend the SSR leak gate for the roles page

The fixture roles route currently returns `{ roles: [] }` and there is no permissions fixture, so the roles page renders its EMPTY state and the "ready (masked)" assertion fails. Add `fetchRoles` next to the other fetchers (after `fetchCompliance`, around line 62) and the three `it` blocks after the observability/compliance group (after the block ending line 272), mirroring the users/clients blocks verbatim:

```ts
function fetchRoles(): Promise<string> {
  return $fetch('/roles')
}
```

```ts
  it('renders the roles list + matrix server-side in their ready (masked) state', async () => {
    const html = await fetchRoles()
    expect(html).toContain('data-admin-shell')
    // A custom (editable) role column header renders ...
    expect(html).toContain('Content Editor')
    // ... and a permission row label renders, proving the role × permission matrix mounted.
    expect(html).toContain('Manage users')
  })

  it('does not leak token/secret/PII values into the roles-page SSR HTML', async () => {
    // Strict — the roles DTOs carry only slugs/names/descriptions/counts (no token,
    // secret, session id, or PII), so NO allowSessionId exemption applies.
    const html = await fetchRoles()
    expect(collectSecretLeaks(html, 'roles SSR HTML')).toEqual([])
  })

  it('does not leak token/secret/PII values into the roles-page hydration payload', async () => {
    const html = await fetchRoles()
    const serialized = JSON.stringify(JSON.parse(extractPayload(html)))
    expect(collectSecretLeaks(serialized, 'roles __NUXT__ payload')).toEqual([])
    expect(collectPiiShapeLeaks(serialized, 'roles __NUXT__ payload')).toEqual([])
  })
```

- [ ] Add `fetchRoles` + the three `it` blocks above.
- [ ] Run: `npm run test -- test/ssr-token-leak.gate.spec.ts`
- [ ] Expected: **FAIL** — `renders the roles list + matrix … ready (masked)` fails on `expect(html).toContain('Content Editor')` (the fixture returns no roles and no permission catalog, so the page renders EMPTY).

#### Step 2 — GREEN: give the fixture a representative masked role list + permission catalog

Replace the empty roles fixture so the page renders READY with a **system** role (read-only matrix column) and a **custom** role (editable column). All values are text/small aggregates — no token, secret, session id, or 10/16/18-digit run.

`test/fixtures/ssr-leak/server/routes/api/admin/roles/index.get.ts`:

```ts
// SSR token-leak fixture: a representative masked role list so the §3.3 gate
// renders the Roles page in its READY state (a system role + a custom role) and the
// existing payload collectors also cover the AdminRole DTO. Slugs/names/descriptions
// + small counts only — no token, secret, session id, or PII-shaped digit run (a
// more specific route wins over the layer's catch-all server/routes/api/admin/[...].ts).
import { defineEventHandler } from 'h3'

export default defineEventHandler(() => ({
  roles: [
    {
      id: 1,
      slug: 'admin',
      name: 'Administrator',
      description: 'Built-in role with full administrative access.',
      is_system: true,
      permissions: [
        { slug: 'admin.users.read', name: 'View users', category: 'Users' },
        { slug: 'admin.users.write', name: 'Manage users', category: 'Users' },
        { slug: 'admin.roles.read', name: 'View roles', category: 'Roles' },
      ],
      user_count: 3,
      users_count: 3,
    },
    {
      id: 2,
      slug: 'content-editor',
      name: 'Content Editor',
      description: 'Custom role for content and user management.',
      is_system: false,
      permissions: [{ slug: 'admin.users.read', name: 'View users', category: 'Users' }],
      user_count: 7,
      users_count: 7,
    },
  ],
}))
```

`test/fixtures/ssr-leak/server/routes/api/admin/permissions.get.ts` (new):

```ts
// SSR token-leak fixture: the permission catalog so usePermissionCatalog's
// useAsyncData('admin-permissions') resolves deterministically and the role ×
// permission matrix renders its rows during the gate. Slugs/names/descriptions/
// categories only — no token, secret, session id, or PII-shaped digit run.
import { defineEventHandler } from 'h3'

export default defineEventHandler(() => ({
  permissions: [
    {
      slug: 'admin.users.read',
      name: 'View users',
      description: 'Read the user directory.',
      category: 'Users',
    },
    {
      slug: 'admin.users.write',
      name: 'Manage users',
      description: 'Create, edit, and lock users.',
      category: 'Users',
    },
    {
      slug: 'admin.roles.read',
      name: 'View roles',
      description: 'Read the role catalog.',
      category: 'Roles',
    },
  ],
}))
```

- [ ] Replace the roles fixture body and create the permissions fixture as above.
- [ ] Confirm the principal already grants the editable matrix + delete affordance (no edit expected):
      `grep -E "admin.roles.write|admin.sessions.terminate" test/fixtures/ssr-leak/server/routes/api/admin/me.get.ts`
      Expected: both capability keys present under `capabilities`. If either is missing, add it to `permissions.permissions[]` **and** `permissions.capabilities` (so `canWrite`/`canDelete` are true under the gate).
- [ ] Run: `npm run test -- test/ssr-token-leak.gate.spec.ts`
- [ ] Expected: **PASS** — all roles `it` blocks green (the page renders `data-admin-shell` + "Content Editor" + "Manage users"; both leak collectors and the PII-shape collector return `[]`). The pre-existing dashboard/users/clients/observability blocks and the negative-control tripwire stay green (`collectSecretLeaks` is still LIVE).

#### Step 3 — Commit the gate extension

- [ ] `git add test/ssr-token-leak.gate.spec.ts test/fixtures/ssr-leak/server/routes/api/admin/roles/index.get.ts test/fixtures/ssr-leak/server/routes/api/admin/permissions.get.ts`
- [ ] Commit:

```
test(sso-admin-frontend): extend SSR leak gate to the roles list + permission matrix

Render /roles under full SSR with the sentinel admin (admin.roles.write +
admin.sessions.terminate) and assert the role list + role × permission matrix
hydrate as masked DTOs only: no token value/name, secret, session id, or
PII-shaped digit run reaches the SSR HTML or __NUXT_DATA__. Strict checks (no
allowSessionId) — roles DTOs carry only slugs/names/descriptions/counts.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
```

#### Step 4 — RED→GREEN: the matrix high-risk e2e path

This is a coverage gate over the UI already wired in Tasks 7.7–7.10. Mirror `e2e/clients.spec.ts`: set the `admin_locale=en` cookie so SSR renders English labels, mock `/api/admin/me` + `/api/admin/roles` + `/api/admin/permissions` + the sync PUT via `page.route`, and drive the matrix. The reused `PrivilegedActionDialog` exposes the stable `privileged-action-confirm` testid; `UiSwitch` renders `role="switch"` with `aria-label` = `` `${role.name}: ${permission}` ``.

Create `e2e/roles.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test'

// useI18n resolves locale from the `admin_locale` cookie at SSR time (DEFAULT_LOCALE='id').
// Set it to 'en' so the English label selectors below match the rendered output.
test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: 'admin_locale', value: 'en', url: baseURL! }])
})

// Full-capability admin: roles read + write + sessions.terminate (delete is double-gated).
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
        'admin.roles.read',
        'admin.roles.write',
        'admin.sessions.terminate',
      ],
      capabilities: {
        'admin.dashboard.view': true,
        'admin.roles.read': true,
        'admin.roles.write': true,
        'admin.sessions.terminate': true,
      },
      menus: [
        { id: 'dashboard', label: 'Dashboard', required_permission: 'admin.dashboard.view', visible: true },
        { id: 'roles', label: 'Roles', required_permission: 'admin.roles.read', visible: true },
      ],
    },
  },
}

// Read-only admin WITHOUT admin.roles.read (forbidden-flow case).
const principalNoRoles = {
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

const systemRole = {
  id: 1,
  slug: 'admin',
  name: 'Administrator',
  description: 'Built-in administrator role.',
  is_system: true,
  permissions: [{ slug: 'admin.users.read', name: 'View users', category: 'Users' }],
  user_count: 3,
  users_count: 3,
}

const customRole = {
  id: 2,
  slug: 'content-editor',
  name: 'Content Editor',
  description: 'Custom content + user management role.',
  is_system: false,
  permissions: [{ slug: 'admin.users.read', name: 'View users', category: 'Users' }],
  user_count: 7,
  users_count: 7,
}

const permissions = {
  permissions: [
    { slug: 'admin.users.read', name: 'View users', description: 'Read the user directory.', category: 'Users' },
    { slug: 'admin.users.write', name: 'Manage users', description: 'Create and edit users.', category: 'Users' },
  ],
}

async function mockMe(page: Page, body: object): Promise<void> {
  await page.route('**/api/admin/me', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) })
  })
}

async function mockRolesData(page: Page): Promise<void> {
  await page.route('**/api/admin/roles', async (route) => {
    if (route.request().method() !== 'GET') return route.continue()
    await route.fulfill({
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-roles-e2e' },
      body: JSON.stringify({ roles: [systemRole, customRole] }),
    })
  })
  await page.route('**/api/admin/permissions', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(permissions) })
  })
}

test('matrix high-risk path: toggle a permission, confirm the sync impact summary, PUT fires', async ({ page }) => {
  await mockMe(page, principal)
  await mockRolesData(page)

  let syncBody: unknown = null
  await page.route('**/api/admin/roles/content-editor/permissions', async (route) => {
    if (route.request().method() !== 'PUT') return route.continue()
    syncBody = route.request().postDataJSON()
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-sync-e2e' },
      body: JSON.stringify({ role: { ...customRole, permissions: permissions.permissions } }),
    })
  })

  await page.goto('/roles')
  await expect(page.getByRole('navigation', { name: 'Admin modules' })).toContainText('Roles')

  // The matrix mounted: the custom role column + a permission row both render.
  await expect(page.getByText('Content Editor').first()).toBeVisible()
  await expect(page.getByText('Manage users').first()).toBeVisible()

  // Grant "Manage users" to the custom role (editable cell = UiSwitch, aria-label
  // "<role name>: <permission>"). The system role's column is a read-only badge, not a switch.
  await page.getByRole('switch', { name: 'Content Editor: Manage users' }).click()

  // Saving the dirty column opens the reused confirm dialog with the blast-radius impact.
  await page.getByRole('button', { name: 'Save' }).first().click()
  await expect(page.getByText(/changes the permission set for 7 users/iu)).toBeVisible()

  // Confirm → the PUT-replace fires with the full pending permission set.
  await page.getByTestId('privileged-action-confirm').click()
  await expect.poll(() => syncBody).not.toBeNull()
  expect(syncBody).toMatchObject({ permission_slugs: expect.arrayContaining(['admin.users.read', 'admin.users.write']) })
  await expect(page.getByText(/Bearer|access_token|client_secret|SQLSTATE/u)).toHaveCount(0)
})

test('cancel calls no API: dismissing the sync confirm fires no PUT', async ({ page }) => {
  await mockMe(page, principal)
  await mockRolesData(page)

  let putCalled = false
  await page.route('**/api/admin/roles/content-editor/permissions', async (route) => {
    if (route.request().method() === 'PUT') putCalled = true
    await route.continue()
  })

  await page.goto('/roles')
  await page.getByRole('switch', { name: 'Content Editor: Manage users' }).click()
  await page.getByRole('button', { name: 'Save' }).first().click()
  await page.getByTestId('privileged-action-cancel').click()
  await expect(page.getByTestId('privileged-action-confirm')).toHaveCount(0)
  expect(putCalled).toBe(false)
})

test('system role is protected: no editable switch + no delete in its column', async ({ page }) => {
  await mockMe(page, principal)
  await mockRolesData(page)

  await page.goto('/roles')
  // The system role's permission cell is a read-only status badge, never a switch.
  await expect(page.getByRole('switch', { name: 'Administrator: Manage users' })).toHaveCount(0)
  // The system role row hides Delete (UX minimization over the authoritative backend gate).
  const adminRow = page.getByRole('row', { name: /Administrator/u })
  await expect(adminRow.getByRole('button', { name: 'Delete' })).toHaveCount(0)
})

test('forbidden flow: admin without admin.roles.read sees the safe forbidden surface', async ({ page }) => {
  await mockMe(page, principalNoRoles)

  await page.goto('/roles')
  await expect(page).toHaveURL(/\/forbidden$/u)
  await expect(page.getByRole('navigation', { name: 'Admin modules' })).not.toContainText('Roles')
  await expect(page.getByText(/Bearer|access_token|client_secret|SQLSTATE/u)).toHaveCount(0)
})
```

- [ ] Write `e2e/roles.spec.ts` as above.
- [ ] Run: `npm run test:e2e -- roles`
- [ ] Expected: **PASS** — all four tests green. (This is verification of Tasks 7.7–7.10: a FAIL here is a real regression in the roles page/matrix/sync wiring, not the test — debug the page per `superpowers:systematic-debugging`, never weaken the assertions. If a selector mismatches because an upstream task chose a different visible label, align the selector to the rendered output, not the other way around.)

#### Step 5 — OPTIONAL: belt-and-suspenders proxy allow/deny assertions

The Nitro allow-list already routes every Phase-7 path (foundation §6), so this is non-blocking. If added, mirror the existing `it(...)` blocks in `server/__tests__/admin-proxy.spec.ts`; every `.toThrow(...)` carries a message:

```ts
it('allows the role write + sync + delete routes through the proxy', () => {
  expect(() => assertAdminRouteAllowed('POST', '/api/admin/roles')).not.toThrow()
  expect(() => assertAdminRouteAllowed('PATCH', '/api/admin/roles/content-editor')).not.toThrow()
  expect(() => assertAdminRouteAllowed('PUT', '/api/admin/roles/content-editor/permissions')).not.toThrow()
  expect(() => assertAdminRouteAllowed('DELETE', '/api/admin/roles/content-editor')).not.toThrow()
})

it('rejects a disallowed method on a known role path', () => {
  expect(() => assertAdminRouteAllowed('DELETE', '/api/admin/permissions')).toThrow(
    'Admin API proxy method is not allowed.',
  )
})
```

(Use the proxy's actual asserted symbol/signature from the existing spec — `assertAdminRouteAllowed` is a placeholder for whatever the file already imports; match it.)

- [ ] If added: `npm run test -- server/__tests__/admin-proxy.spec.ts` → **PASS**.
- [ ] If added, commit:

```
test(sso-admin-frontend): assert the roles routes through the admin proxy allow-list

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
```

#### Step 6 — Commit the e2e + run the full Phase-7 DoD gate

- [ ] `git add e2e/roles.spec.ts`
- [ ] Commit:

```
test(sso-admin-frontend): e2e the role × permission matrix high-risk path

Drive /roles end to end: toggle a permission, confirm the sync impact summary
(blast radius "N users holding this role"), assert the PUT-replace fires, and
prove cancel calls no API, the system role is protected (no switch, no delete),
and an admin without admin.roles.read lands on the safe forbidden surface.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
```

- [ ] Run the **full DoD gate** from `services/sso-admin-frontend`, reporting any blocked command explicitly (never claim PASS for a command that did not run). `npm run lint` is `run-s lint:*` — BOTH `lint:oxlint` (`oxlint .`) AND `lint:eslint` (`eslint "src/**/*.vue" "app/**/*.vue" --cache`) must pass:

```
npm run typecheck && npm run lint && npm run format:check && npm run test && npm run build && npm run test:e2e
```

**Definition of Done:** `npm run typecheck && npm run lint && npm run format:check && npm run test && npm run build && npm run test:e2e` all green from `services/sso-admin-frontend` (`npm run lint` runs BOTH `lint:oxlint` and `lint:eslint`); the SSR leak gate's roles blocks prove no token/secret/PII in the roles HTML or `__NUXT__` payload; the matrix e2e covers the sync-permissions high-risk path; any blocked command is reported explicitly with its output.

---

## Phase 7 Definition of Done

- [ ] DTO types (extend) + pure resolvers (roles view-state + status-tone) + pure roles-list (filter/paginate) + roles-matrix (grant-map + sync-diff) + role-form validation + permission-impact + extended `rolesApi` service + `useRolesList`/`usePermissionCatalog` composables + `RolesTable`/`RoleMatrix`/`RoleFormDialog` components + the `/roles` page (all six states) + create/edit/sync-permissions/delete write flows + SSR-leak/e2e gate all implemented test-first (Tasks 7.1–7.11), each committed green.
- [ ] **Full gate green** from `services/sso-admin-frontend`: `npm run typecheck` (0 errors), `npm run lint` (0 errors — **BOTH** `lint:oxlint` (`oxlint .`) AND `lint:eslint` (`eslint "src/**/*.vue" "app/**/*.vue" --cache`) pass), `npm run format:check`, `npm run test`, `npm run build` — all PASS (any blocked command reported explicitly, never claimed PASS).
- [ ] **SSR token-leak gate extended** (Task 7.11) to cover the **roles HTML + `__NUXT__`/`__NUXT_DATA__` hydration payload over the role + permission DTOs** (slugs, names, descriptions, counts only): strict checks (no `allowSessionId`) prove no access/refresh/ID token (value or field name), session/client secret, raw NIK(16)/NIP(18)/NISN(10) digit run, raw backend exception, or `SSR_LEAK_CANARY`; the roles leak-assertion `it()`s mirror the dashboard-summary block (commit `f60ceb49`) and assert `.toEqual([])`.
- [ ] **Privileged-action test matrix applied to every Roles write** (create role, update-metadata, sync-permissions, delete role): allowed/403/401/419(if applicable)/429/422(field errors)/step-up(428, surfacing `step_up_url`)/5xx + no-stale-loading-after-error, with destructive-confirm discipline (impact summary visible before submit, primary disabled until confirmation valid, cancel calls no API, success shows no secret/PII excess) and per-feature permission tests; **sync-permissions surfaces the blast-radius impact ("changes the permission set for N users holding this role")**; **step-up honored** on create/update/sync (`:write` freshness) and **delete (`:step_up` freshness)** with `EnsureAdminMfaAssurance` on 100% of read + write routes. **System / built-in role protection** (`is_system === true`): Edit + Delete hidden and the matrix column rendered non-editable (`UiStatusBadge`, never a `UiSwitch`); the backend re-checks regardless.
- [ ] **The role × permission matrix** clearly distinguishes role, permission, and assignment, is realized over `UiDataList` + `#cell(<role.slug>)` (`UiSwitch` editable cells / `UiStatusBadge` read-only cells — no bespoke grid), shows the change summary before submit, and never leaks raw backend policy detail in the missing-permission state.
- [ ] **`rolesApi` + types EXTENDED, not duplicated**: `permissions`/`store`/`update`/`syncPermissions`/`destroy` added to the same `rolesApi` object in `app/services/roles.api.ts` (`list()` reused); `AdminRole`/`RolesResponse` extended and the new types added in `app/types/users.types.ts` (no parallel roles type module); Phase-4/5/6 infra (`usePrivilegedAction`, `resolvePrivilegedActionFailure`, `PrivilegedActionDialog`, DS components, `apiClient`) consumed from its existing path as-is, never copied into a `roles/` path.
- [ ] **The `/roles` route** (`pages/roles.vue`, `definePageMeta` name `admin.roles`, `permissions: ['admin.roles.read']`) renders all six states server-side; affordances gated via `sessionStore.hasPermission` (`canWrite = admin.roles.write`; `canDelete = admin.roles.write && admin.sessions.terminate`); internal navigation uses named route refs, never hardcoded path strings; after any write the list is **explicitly refreshed**, never left stale.
- [ ] **id ↔ en locale parity** holds for the `roles.*` catalog — genuinely-new keys (granted/denied a11y labels, matrix column headers, the "N users affected" impact copy) added to BOTH `app/locales/id.json` and `app/locales/en.json`; no parity drift; no legacy traceability markers carried forward.
- [ ] **Roles e2e flow green** (`npm run test:e2e`): load `/roles`, assert the matrix renders, toggle a permission, confirm the sync impact summary, and assert the forbidden/permission-hidden states.
- [ ] Swiss discipline upheld: tokens-only, hairline (no shadow as structure), single accent `#002FA7`, `danger #E4002B` reserved for **delete role only** (and a denied/critical status badge always paired with a text label, never colour-alone) — the create/edit/sync confirm stays accent/warning, **NEVER danger red**; status never colour-alone (matrix granted/denied cells encode state with shape/label); `--font-mono` only for raw IDs/correlation values; **folio numerals** (role/permission counts `02 / 14`, ID columns) visible on the load-bearing folio surfaces (matrix counts, role-count evidence) via `UiFolio`.
- [ ] The `feat/admin-frontend-nuxt4-ssr-swiss-redesign` branch **stays off `main` until the Phase 18 cutover** — Phase 7 merges into the feature branch only.
