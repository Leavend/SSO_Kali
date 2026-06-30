# Phase 4 — Users (FR-051, FR-022 / UC-50, UC-53–UC-56) Implementation Plan

**For agentic workers — REQUIRED SUB-SKILL:** Execute this plan with `superpowers:executing-plans`, and for **every** task below invoke `superpowers:test-driven-development` (RED → GREEN → REFACTOR). Never write implementation code before a failing test exists; never claim PASS without running the exact command and reading its output (`superpowers:verification-before-completion`).

## Goal

Port the admin **Users** governance domain to the Nuxt 4 (full SSR) + Swiss stack on branch `feat/admin-frontend-nuxt4-ssr-swiss-redesign`. Users is the operator console for the IdP's account population: list / search / detail of every account, create + profile-update with multi-identifier validation (email + government identifiers), and the full privileged-action surface — lock/unlock, deactivate/reactivate, password-reset, reset-MFA, **require-MFA/unrequire-MFA** (new this phase), and single-role assignment. The acceptance bar is **behavioral + visual parity** with the existing Vue-SPA Users feature plus the net-new backend capabilities (government-identifier fields and the require/unrequire-MFA actions), implemented test-first.

Every page implements the five states (loading · empty · error · forbidden · success); empty distinguishes "no data" from "no permission"; every write/destructive action runs through **one** shared privileged-action infrastructure that handles confirmation + impact summary + the full `401/403/419/422/428/429/5xx` + fresh-auth/step-up matrix; and no token, secret, or **raw** PII (raw NIK/NIP/NISN/birth_date/email, raw session id) may enter the SSR HTML or the `__NUXT__` hydration payload — the backend already returns these **masked**, and the SSR leak gate is extended to prove it.

This builds on the existing stub pages `app/pages/users/index.vue` (`definePageMeta` name `admin.users`, `permissions: ['admin.users.read']`) and `app/pages/users/new.vue` (name `admin.users.create`, `permissions: ['admin.users.write']`), and adds a real, deep-linkable detail route `app/pages/users/[subjectId].vue` (`admin.users.read`) — replacing the legacy drawer-with-no-route anti-pattern. All data flows through a typed **service** over `apiClient` (no direct `fetch`/`$fetch` in pages/components), wrapped in `useAsyncData` so it resolves server-side and hydrates as masked DTOs only.

## Architecture

Request/data flow (server-side during SSR, re-used on client navigation):

```
pages/users/index.vue
  ├─ useAsyncData('admin-users-principal', () => sessionStore.ensureSession())   // safe masked principal
  └─ useUsersList()                                                              // SSR data boundary (list)
        └─ useAsyncData('admin-users-list', () => usersApi.list())
              └─ usersApi.list() → apiClient.get('/api/admin/users')            // same-origin, credentials:'include'
                    └─ Nitro server/routes/api/admin/[...].ts → handleAdminApiProxy
                       (inject Bearer from event.context, rewrite /api/admin/* → /admin/api/*)

pages/users/[subjectId].vue
  └─ useUserDetail(subjectId) → useAsyncData('admin-user-detail:'+id, () => usersApi.show(id))
        └─ UserLifecycleActions.vue / UserRoleAssignment.vue / sync-profile form
              └─ usePrivilegedAction() + PrivilegedActionDialog  → usersApi.<mutation>()
                    → on success: useUserDetail.refresh()  (explicit, never stale)

pages/users/new.vue
  └─ FormPageShell + FormSection + UiFormField  → usePrivilegedAction() → usersApi.create()
```

- **Pure logic** (no Nuxt, no network) lives under `app/lib/users/`: DTO-agnostic view-state + status-tone (`users-view-state.ts`), client search/filter/pagination (`users-list.ts`), identifier + password validation (`user-identifiers.ts`, `managed-user-password-policy.ts`), the privileged-action error→status matrix (`privileged-action.ts`), and the action descriptor table (`user-actions.ts`). This mirrors the dashboard's pure-resolver split so the matrix is unit-testable without a Nuxt context.
- **Service** `app/services/users.api.ts` (+ `app/services/roles.api.ts` for the assignment dropdown) is the single network seam.
- **Composables** `app/composables/useUsersList.ts` and `app/composables/useUserDetail.ts` wrap `useAsyncData`; `app/composables/usePrivilegedAction.ts` is the reusable mutation runner.
- **Components** under `app/components/users/`: `UsersTable.vue` (domain table over `UiDataList`), `PrivilegedActionDialog.vue` (the destructive-confirm over `UiAlertDialog`), `UserLifecycleActions.vue`, `UserRoleAssignment.vue`.
- **State surfaces** reuse the Swiss DS: `UiSkeleton` (loading), `UiStatusView` (forbidden / unauthenticated / error / step-up, with built-in request-ref redaction), `UiEmptyState` (no data), `UiStatusBadge` (account status, never colour-alone), `UiFolio` (record counts, timestamps, masked IDs).
- **Backend stays the security boundary.** `admin-guard.global.ts` gates routes by role + meta permissions; every page additionally renders a safe forbidden/step-up surface if the backend rejects despite the UI.
- **Out of scope (backend does not expose on Users routes):** session *termination* (`DELETE /users/{id}/sessions` is a Sessions controller — sessions are shown **read-only** here); a dedicated entitlement endpoint (the "entitlements view" is represented by the user's roles + MFA-requirement + login-context security panel, all present in the detail DTO); server-side pagination/sort (`GET /users` returns a flat `{ users }` with no query params — search/filter/pagination are derived client-side over the hydrated list). `GET /admin/api/permissions` (`admin.roles.read`) belongs to the future Roles-management domain and is intentionally **NOT** consumed by the Users domain (role assignment uses `GET /admin/api/roles` only).

## Tech Stack

- **Nuxt 4** (`ssr: true`, universal), **Vue 3.5** SFC, **TypeScript strict**.
- **Pinia** (`admin-session` store — existing; consumed read-only for principal + `hasPermission`/`hasEveryPermission`).
- **Data:** `useAsyncData` + typed `apiClient` over `$fetch`/`useRequestFetch` (`app/lib/api/api-client.ts`, `ApiError` with `status`/`code`/`requestId`/`payload`).
- **UI:** Swiss DS components in `app/components/ui/*` + `app/components/form/*`, `lucide-vue-next` icons, Tailwind v4 + `assets/tokens.css` Swiss tokens. Reka UI keeps a11y primitives (`UiDialog`/`UiAlertDialog`).
- **i18n:** `app/composables/useI18n.ts` (`id` default, `en`), catalogs `app/locales/{id,en}.json` — `users.*` already has 102 keys at full parity; ADD only genuinely-new keys, to BOTH files.
- **Tests:** Vitest 4 (`npm run test` = `vitest run`); `@nuxt/test-utils/runtime` (`mountSuspended`, `renderSuspended`, `mockNuxtImport`) for `*.nuxt.spec.ts` (auto-routed to the `nuxt` env by filename); `@vue/test-utils` + jsdom for plain `*.spec.ts`; `@nuxt/test-utils/e2e` for the SSR leak gate; Playwright for the Users e2e (`npm run test:e2e`).

## Global Constraints

Binding values for every task. A task is **not done** if any is violated.

- **Full SSR** (`ssr: true`): principal + list + detail resolve **server-side** (no client bootstrap flash). `useAsyncData` settles before the payload is serialized.
- **SSR token-leak guard (§3.3, mandatory):** only **safe, already-masked DTOs and safe principal fields** (display name, role, capability booleans, menus) may enter the SSR HTML or `__NUXT__`/`__NUXT_DATA__`. Tokens, session secrets, and **raw NIK/NIP/NISN/birth_date** stay in Nitro `event.context` only. For Users, government identifiers hydrate **only** as the backend's masked values (`GovernmentIdentifier` masking) — never raw; raw session ids are rendered masked via `formatTechnicalPreview`. **FORBIDDEN in SSR HTML / `__NUXT_DATA__`:** access/refresh/ID tokens, session/client secrets, any credential; raw NIK (16-digit) / NIP (18-digit) / NISN (10-digit) / birth_date; raw backend exceptions. The `test/ssr-token-leak.gate.spec.ts` gate must stay green and is **extended** in this phase to cover the user list + detail DTOs. **Target user EMAIL is an allowed display field in the admin console (operator necessity);** the §3.3 forbidden-PII set the gate enforces is NIK(16) / NIP(18) / NISN(10) / birth_date + token values/names/secrets — these stay masked and gate-forbidden.
- **No browser token handling:** no access/refresh/ID token, client secret, or credential is created, exchanged, read, stored, or logged in the browser. The SPA is token-blind; the Admin BFF injects the Bearer server-side.
- **Same-origin session only:** admin calls use same-origin relative paths (`/api/admin/users…`, `/api/admin/roles`) and the encrypted session cookie (`credentials:'include'`); no token headers minted in the browser.
- **No direct `fetch`/`$fetch` in pages or components** — the network is reached only through `usersApi` / `rolesApi` (services) via `apiClient`.
- **Swiss design discipline:** tokens-only (no hard-coded colours), **no shadows** as structure (1px hairline borders), radius ~0–2px, **single accent `#002FA7`** (interactive/brand), red `--danger #E4002B` used **only** as functional/destructive (lock, deactivate, reset-MFA, require-MFA) and on **critical security status badges** (locked/rejected — always paired with a text label, never colour-alone, consistent with the Phase 3 dashboard tone resolver) — never brand; status **never colour-alone** (always tone + label/shape via `UiStatusBadge`); `--font-sans` is the single family; `--font-mono` reserved **only** for raw IDs/correlation values; record counts (`02 / 14`), timestamps, and masked IDs render as condensed-sans **folio** numerals via `UiFolio`. Standard labels/copy only — no themed copy, `//` kickers, unicode-glyph icons (use Lucide), or fabricated personas; mock rows in tests read clearly as samples.
- **Permission-aware (route + nav + action):** page meta declares `permissions` per the route map; `admin-guard.global.ts` enforces role + permission; each page also handles a backend `401/403/428` defensively. Action visibility is gated by `sessionStore.hasPermission(...)`. Permission strings follow the backend contract **verbatim** — never ad-hoc:

  | Path | Page | meta `permissions` | Write/destructive actions on the surface (permission · freshness) |
  |---|---|---|---|
  | `/users` | `pages/users/index.vue` | `admin.users.read` | (link to create — gated `admin.users.write`) |
  | `/users/[subjectId]` | `pages/users/[subjectId].vue` | `admin.users.read` | sync-profile, deactivate, reactivate, password-reset, reset-mfa (`admin.users.write` · `write`); lock, unlock, require-mfa, unrequire-mfa (`admin.users.lock` · `step_up`); assign role (`admin.roles.write` · `write`) |
  | `/users/new` | `pages/users/new.vue` | `admin.users.write` | create (`admin.users.write` · `write`) |

  (Backend gates `GET /users`/`/users/{id}` by admin-role only; the `admin.users.read` meta is stricter UX minimization and is correct. **Preflight verified: `admin.users.read` is in the backend RBAC matrix (`AdminPermission.php`) and drives `AdminMenu`, so admin principals receive it in `/admin/api/me`; the list+detail page guard on `admin.users.read` is therefore reachable in production — no role-only fallback needed.** Internal navigation uses **named route refs**, never hardcoded path strings.)
- **Privileged-action test matrix (TDD §4 — every write/destructive/role action; failing tests BEFORE implementation):**
  - 4.1 allowed success path · 4.2 missing permission / 403 · 4.3 unauthenticated / 401 · 4.4 CSRF or session expired / 419 (if applicable) · 4.5 rate limit / 429 · 4.6 validation error / 422 · 4.7 fresh-auth / step-up / MFA-assurance required (428/412/`reauth_required`/`step_up_required`, surfaces `step_up_url`) · 4.8 backend 5xx with safe error copy · 4.9 audit/correlation id shown or stored when backend sends it · 4.10 action leaves **no** stale loading/disabled state after an error.
  - Destructive-confirm tests: impact summary visible before submit · primary destructive button disabled until confirmation valid · cancel calls **no** API · success state shows no secret/PII excess.
  - Per-feature permission matrix tests: unauthenticated → redirect/session-expired · non-admin → forbidden · admin w/o permission → forbidden/action hidden · admin w/ permission → usable · backend 403 despite UI → safe forbidden.
- **HTTP failure set (safe copy, never raw backend exception):** `401`, `403`, `419` (if applicable), `422` (field errors), `429`, `5xx`. Error surfaces show safe copy + a redacted support reference (`REF-XXXXXXXX` via `formatSupportReference`); raw request ids are never rendered.
- **Degraded/stale handling:** after any action, **explicitly refresh** detail/list state (never leave it stale); if a refresh fails but a good snapshot exists, keep it on screen with a stale notice.
- **PII handling:** NIK/NIP/NISN/birth_date are login identifiers — accepted **raw** on create/sync (regex-validated, lowercased email), returned **masked** only; never logged, never stored in browser storage/Pinia-persisted/URL/console; rendered masked via `formatMaskedIdentifier` / `formatTechnicalPreview`. Show only identifiers sufficient for safe operator action. Password-reset token is **never** rendered (backend emails it) — show only safe evidence copy.
- **One-time secret discipline:** Users surfaces no client secret; no plaintext credential is shown or retained (n/a unless a future field surfaces one).
- **No-traceability-markers:** new code must NOT contain `OG#`, `UC###`, `FR###`, `BE-FR###`-style identifiers in names, comments, routes, tests, or config — descriptive domain names only. The FR/UC references in this header are for planning, never source.
- **Reuse over reinvent:** import the foundation verbatim — DS components (`UiButton/UiInput/UiSelect/UiSwitch/UiTextarea/UiStatusBadge/UiDataList/UiDetailDrawer/UiDialog/UiAlertDialog/UiEmptyState/UiSkeleton/UiStatusView/UiFolio`, `FormPageShell/FormSection/UiFormField`), `apiClient`, `resolveStatusTone`, `display-identifiers`, the `useDashboardSummary`/`DashboardMetricGroup` SSR + domain-component patterns, the session store permission helpers, and the existing `users.*` locale keys. Do **not** rebuild any of these.
- **TDD:** RED → GREEN → REFACTOR per task; at least one assertion fails because the behaviour is missing (not a typo); commit only on green.
- **Definition-of-Done gate (run from `services/sso-admin-frontend`; report any blocked command explicitly, never claim PASS for a command that did not run):**
  `npm run typecheck && npm run lint && npm run format:check && npm run test && npm run build`, plus `npm run test:e2e` (Users changes route/navigation/critical governance UI — it qualifies).
- **Conventional commits**, each ending with the trailer:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

### Task 4.1: Users DTO types + pure view-state / status-tone resolver

Pure types and pure functions first — no Nuxt, no network. Establishes the masked DTO shapes (every field `readonly`; the government identifiers `nik`/`nip`/`nisn`/`birth_date` are **masked** strings or `null`, never raw; `effective_status` drives the badge) and the view-state mapping (error-first security branch; list-empty distinct from forbidden; detail `404 → not_found`) that the composables and pages consume. Mirrors the dashboard's `dashboard-view-state.ts` pure-resolver split so the matrix is unit-testable without a Nuxt context. `resolveUserStatusTone` delegates to the existing `resolveStatusTone` alias map (active→success, locked→danger, disabled/deactivated→neutral) rather than re-tabulating tones.

**Files**
- Create: `app/types/users.types.ts`
- Create: `app/lib/users/users-view-state.ts`
- Test: `app/lib/users/__tests__/users-view-state.spec.ts`

**Interfaces**
- Produces (`app/types/users.types.ts`):
  - `type UserAccountStatus = 'active' | 'locked' | 'disabled' | 'deactivated'`
  - `type UserRoleRef = { readonly slug: string; readonly name: string; readonly is_system: boolean }`
  - `type LoginContext = { readonly ip_address: string | null; readonly mfa_required: boolean; readonly last_seen_at: string | null }`
  - `type UserSession = { readonly id: string; readonly ip_address?: string | null; readonly user_agent?: string | null; readonly last_seen_at?: string | null; readonly created_at?: string | null }`
  - `type AdminUserSummary` — the masked account DTO (full field list below; `nik`/`nip`/`nisn`/`birth_date` are **MASKED** strings or `null`)
  - `type AdminUserListItem = AdminUserSummary & { readonly login_context: LoginContext | null }`
  - `type AdminUserDetail = AdminUserSummary`
  - `type UserRoleView = { readonly subject_id: string; readonly email: string; readonly display_name: string | null; readonly role: string | null; readonly status: string | null; readonly roles: readonly UserRoleRef[] }`
  - Responses: `UserListResponse`, `UserDetailResponse`, `UserMutationResponse`, `CreateUserResponse`, `PasswordResetResponse`, `ResetMfaResponse`, `UserRoleResponse`
  - Payloads: `CreateUserPayload`, `SyncProfilePayload`, `LockPayload`, `ReasonPayload`, `AssignRolesPayload`
  - `const USER_ACCOUNT_STATUSES = ['active','locked','disabled','deactivated'] as const`
- Produces (`app/lib/users/users-view-state.ts`):
  - `type UsersViewState = 'loading' | 'unauthenticated' | 'forbidden' | 'error' | 'empty' | 'ready'`
  - `type UserDetailViewState = 'loading' | 'unauthenticated' | 'forbidden' | 'not_found' | 'error' | 'ready'`
  - `function isUsersListEmpty(list: readonly AdminUserListItem[]): boolean`
  - `function resolveUsersViewState(args: { pending: boolean; error: unknown; list: readonly AdminUserListItem[] | null }): UsersViewState`
  - `function resolveUserDetailViewState(args: { pending: boolean; error: unknown; user: AdminUserDetail | null }): UserDetailViewState` (404 → `not_found`)
  - `function resolveUserStatusTone(status: UserAccountStatus | string | null | undefined): StatusTone` (active→success, locked→danger, disabled/deactivated→neutral)
- Consumes: `ApiError` from `@/lib/api/api-client` (signature `new ApiError(status, message, code?, payload?, requestId?)`); `StatusTone` + `resolveStatusTone` from `@/lib/status-tone`.

**Steps**

1. [ ] Write the failing test `app/lib/users/__tests__/users-view-state.spec.ts` (real behaviour, not mocks; also pins the masked-PII invariant at the DTO boundary):

```ts
import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api/api-client'
import {
  isUsersListEmpty,
  resolveUserDetailViewState,
  resolveUserStatusTone,
  resolveUsersViewState,
} from '../users-view-state'
import type { AdminUserDetail, AdminUserListItem } from '@/types/users.types'

// Sample row — reads clearly as a fixture. PII fields hold the BACKEND-MASKED
// form only (GovernmentIdentifier masking), never the raw 16/18/10-digit value.
const sample: AdminUserListItem = {
  id: 1,
  subject_id: 'sub-sample-0001',
  email: 'operator.sample@example.test',
  given_name: 'Operator',
  family_name: 'Sample',
  display_name: 'Operator Sample',
  role: 'admin',
  status: 'active',
  effective_status: 'active',
  disabled_at: null,
  disabled_reason: null,
  locked_at: null,
  locked_until: null,
  locked_reason: null,
  locked_by_subject_id: null,
  lock_count: 0,
  local_account_enabled: true,
  profile_synced_at: null,
  email_verified_at: '2026-06-01T00:00:00Z',
  last_login_at: '2026-06-27T09:00:00Z',
  created_at: '2026-01-01T00:00:00Z',
  nik: '32••••••••••1234',
  nip: '1980••••••••••0012',
  nisn: '00••••5678',
  birth_date: '1990-••-••',
  mfa_enrolled: true,
  mfa_methods: ['totp'],
  mfa_mandatory: false,
  roles: [{ slug: 'admin', name: 'Administrator', is_system: true }],
  login_context: { ip_address: '203.0.113.10', mfa_required: true, last_seen_at: '2026-06-27T09:00:00Z' },
}

const detail: AdminUserDetail = (() => {
  const { login_context: _drop, ...rest } = sample
  return rest
})()

describe('isUsersListEmpty', () => {
  it('is true only for a zero-length list (no-data, distinct from forbidden)', () => {
    expect(isUsersListEmpty([])).toBe(true)
    expect(isUsersListEmpty([sample])).toBe(false)
  })
})

describe('resolveUsersViewState', () => {
  it('loading when no list and no error', () => {
    expect(resolveUsersViewState({ pending: true, error: null, list: null })).toBe('loading')
  })
  it('maps a first-load 401 to unauthenticated', () => {
    expect(
      resolveUsersViewState({ pending: false, error: new ApiError(401, 'no session'), list: null }),
    ).toBe('unauthenticated')
  })
  it('maps a first-load 403 to forbidden (distinct from empty)', () => {
    expect(
      resolveUsersViewState({ pending: false, error: new ApiError(403, 'forbidden'), list: null }),
    ).toBe('forbidden')
  })
  it('maps other first-load errors to error (incl. H3-shaped statusCode)', () => {
    expect(
      resolveUsersViewState({ pending: false, error: new ApiError(500, 'boom'), list: null }),
    ).toBe('error')
    expect(resolveUsersViewState({ pending: false, error: { statusCode: 502 }, list: null })).toBe(
      'error',
    )
  })
  it('empty vs ready once a list is present (a stale-refresh error keeps the snapshot)', () => {
    expect(resolveUsersViewState({ pending: false, error: null, list: [] })).toBe('empty')
    expect(resolveUsersViewState({ pending: false, error: null, list: [sample] })).toBe('ready')
    expect(
      resolveUsersViewState({ pending: false, error: new ApiError(500, 'boom'), list: [sample] }),
    ).toBe('ready')
    // an empty list with a background error is still "empty", never blanked to error
    expect(
      resolveUsersViewState({ pending: false, error: new ApiError(500, 'boom'), list: [] }),
    ).toBe('empty')
  })
})

describe('resolveUserDetailViewState', () => {
  it('loading when no user and no error', () => {
    expect(resolveUserDetailViewState({ pending: true, error: null, user: null })).toBe('loading')
  })
  it('maps a first-load 404 to not_found (distinct from error)', () => {
    expect(
      resolveUserDetailViewState({ pending: false, error: new ApiError(404, 'missing'), user: null }),
    ).toBe('not_found')
    expect(
      resolveUserDetailViewState({ pending: false, error: { statusCode: 404 }, user: null }),
    ).toBe('not_found')
  })
  it('maps 401/403/other first-load errors', () => {
    expect(
      resolveUserDetailViewState({ pending: false, error: new ApiError(401, 'x'), user: null }),
    ).toBe('unauthenticated')
    expect(
      resolveUserDetailViewState({ pending: false, error: new ApiError(403, 'x'), user: null }),
    ).toBe('forbidden')
    expect(
      resolveUserDetailViewState({ pending: false, error: new ApiError(500, 'x'), user: null }),
    ).toBe('error')
  })
  it('ready once the user is present, even on a background-refresh error', () => {
    expect(resolveUserDetailViewState({ pending: false, error: null, user: detail })).toBe('ready')
    expect(
      resolveUserDetailViewState({ pending: false, error: new ApiError(500, 'x'), user: detail }),
    ).toBe('ready')
  })
})

describe('resolveUserStatusTone', () => {
  it('maps account statuses to Swiss tones (red reserved for locked)', () => {
    expect(resolveUserStatusTone('active')).toBe('success')
    expect(resolveUserStatusTone('locked')).toBe('danger')
    expect(resolveUserStatusTone('disabled')).toBe('neutral')
    expect(resolveUserStatusTone('deactivated')).toBe('neutral')
    expect(resolveUserStatusTone(null)).toBe('neutral')
    expect(resolveUserStatusTone(undefined)).toBe('neutral')
    expect(resolveUserStatusTone('something-unknown')).toBe('neutral')
  })
})

describe('masked-PII invariant (DTO boundary)', () => {
  it('the sample DTO carries masked identifiers only — no raw 16/18/10-digit run', () => {
    const blob = JSON.stringify(sample)
    expect(blob).not.toMatch(/\b\d{16}\b/u) // raw NIK
    expect(blob).not.toMatch(/\b\d{18}\b/u) // raw NIP
    expect(blob).not.toMatch(/\b\d{10}\b/u) // raw NISN
  })
})
```

2. [ ] Run it — expect **FAIL** (modules `../users-view-state` and `@/types/users.types` do not exist → import/resolution error):
   `npm run test -- app/lib/users/__tests__/users-view-state.spec.ts`

3. [ ] Implement `app/types/users.types.ts` (FULL code):

```ts
// Safe, masked admin Users DTOs for the BFF endpoints under /api/admin/users.
// Every field is readonly. The government identifiers nik/nip/nisn/birth_date are
// the BACKEND-MASKED form (GovernmentIdentifier masking) or null — the raw values
// never cross the network boundary and must never enter the SSR payload.
export type UserAccountStatus = 'active' | 'locked' | 'disabled' | 'deactivated'

export const USER_ACCOUNT_STATUSES = ['active', 'locked', 'disabled', 'deactivated'] as const

export type UserRoleRef = {
  readonly slug: string
  readonly name: string
  readonly is_system: boolean
}

export type LoginContext = {
  readonly ip_address: string | null
  readonly mfa_required: boolean
  readonly last_seen_at: string | null
}

export type UserSession = {
  readonly id: string
  readonly ip_address?: string | null
  readonly user_agent?: string | null
  readonly last_seen_at?: string | null
  readonly created_at?: string | null
}

export type AdminUserSummary = {
  readonly id: number
  readonly subject_id: string
  readonly email: string
  readonly given_name: string | null
  readonly family_name: string | null
  readonly display_name: string | null
  readonly role: string | null
  readonly status: string | null
  readonly effective_status: UserAccountStatus
  readonly disabled_at: string | null
  readonly disabled_reason: string | null
  readonly locked_at: string | null
  readonly locked_until: string | null
  readonly locked_reason: string | null
  readonly locked_by_subject_id: string | null
  readonly lock_count: number
  readonly local_account_enabled: boolean
  readonly profile_synced_at: string | null
  readonly email_verified_at: string | null
  readonly last_login_at: string | null
  readonly created_at: string | null
  // MASKED identifiers (string) or null — never raw NIK/NIP/NISN/birth_date.
  readonly nik: string | null
  readonly nip: string | null
  readonly nisn: string | null
  readonly birth_date: string | null
  readonly mfa_enrolled: boolean
  readonly mfa_methods: readonly string[]
  readonly mfa_mandatory: boolean
  readonly roles: readonly UserRoleRef[]
}

export type AdminUserListItem = AdminUserSummary & {
  readonly login_context: LoginContext | null
}

export type AdminUserDetail = AdminUserSummary

export type UserRoleView = {
  readonly subject_id: string
  readonly email: string
  readonly display_name: string | null
  readonly role: string | null
  readonly status: string | null
  readonly roles: readonly UserRoleRef[]
}

export type UserListResponse = {
  readonly users: readonly AdminUserListItem[]
}

export type UserDetailResponse = {
  readonly user: AdminUserDetail
  readonly login_context: LoginContext | null
  readonly sessions: readonly UserSession[]
}

export type UserMutationResponse = {
  readonly user: AdminUserDetail
}

export type CreateUserResponse = {
  readonly user: AdminUserDetail
  readonly delivery_status: string
}

export type PasswordResetResponse = {
  readonly user: AdminUserDetail
  readonly password_reset: { readonly expires_at: string }
  readonly delivery_status: string
}

export type ResetMfaResponse = {
  readonly reset: boolean
  readonly message: string
  readonly reenrollment_required: boolean
}

export type UserRoleResponse = {
  readonly user: UserRoleView
}

export type CreateUserPayload = {
  readonly email: string
  readonly display_name: string
  readonly role: 'admin' | 'user' | 'pegawai'
  readonly given_name?: string
  readonly family_name?: string
  readonly password?: string
  readonly local_account_enabled?: boolean
  readonly nik?: string
  readonly nip?: string
  readonly nisn?: string
  readonly birth_date?: string
}

export type SyncProfilePayload = {
  readonly email?: string
  readonly display_name?: string
  readonly given_name?: string
  readonly family_name?: string
  readonly nik?: string
  readonly nip?: string
  readonly nisn?: string
  readonly birth_date?: string
}

export type LockPayload = {
  readonly reason: string
  readonly locked_until?: string
}

export type ReasonPayload = {
  readonly reason: string
}

export type AssignRolesPayload = {
  readonly role_slugs: readonly [string]
}
```

4. [ ] Implement `app/lib/users/users-view-state.ts` (FULL code):

```ts
import { ApiError } from '@/lib/api/api-client'
import { resolveStatusTone, type StatusTone } from '@/lib/status-tone'
import type { AdminUserDetail, AdminUserListItem, UserAccountStatus } from '@/types/users.types'

export type UsersViewState =
  | 'loading'
  | 'unauthenticated'
  | 'forbidden'
  | 'error'
  | 'empty'
  | 'ready'

export type UserDetailViewState =
  | 'loading'
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'error'
  | 'ready'

// "Empty" = the backend answered with an empty population. Deliberately distinct
// from `forbidden` (a 403 → no permission) so the page shows "no users yet" copy
// rather than an access-denied surface.
export function isUsersListEmpty(list: readonly AdminUserListItem[]): boolean {
  return list.length === 0
}

export function resolveUsersViewState({
  error,
  list,
}: {
  readonly pending: boolean
  readonly error: unknown
  readonly list: readonly AdminUserListItem[] | null
}): UsersViewState {
  // Security boundary: an error with NO prior snapshot surfaces the real
  // auth/permission state. Once a list exists it stays on screen even if a
  // background refresh fails (handled by the composable's stale flag).
  if (error && !list) {
    const status = errorStatus(error)
    if (status === 401) return 'unauthenticated'
    if (status === 403) return 'forbidden'
    return 'error'
  }
  if (list) return isUsersListEmpty(list) ? 'empty' : 'ready'
  return 'loading'
}

export function resolveUserDetailViewState({
  error,
  user,
}: {
  readonly pending: boolean
  readonly error: unknown
  readonly user: AdminUserDetail | null
}): UserDetailViewState {
  if (error && !user) {
    const status = errorStatus(error)
    if (status === 401) return 'unauthenticated'
    if (status === 403) return 'forbidden'
    if (status === 404) return 'not_found'
    return 'error'
  }
  if (user) return 'ready'
  return 'loading'
}

// Reuse the shared alias map (active→success, locked→danger,
// disabled/deactivated→neutral) — Swiss reserves red for the genuinely critical
// `locked` state; routine lifecycle states are neutral.
export function resolveUserStatusTone(
  status: UserAccountStatus | string | null | undefined,
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

5. [ ] Run it — expect **PASS** (all describe blocks green, including the masked-PII boundary assertion):
   `npm run test -- app/lib/users/__tests__/users-view-state.spec.ts`

6. [ ] Refactor check: no duplication to extract (`errorStatus` mirrors the dashboard resolver by design — both are pure, isolated, and tested independently; sharing them would couple two domains for three lines, not worth it). Confirm `npm run typecheck` is clean for the new files.

7. [ ] Commit:
   `git add app/types/users.types.ts app/lib/users/ && git commit -m "$(printf 'feat(sso-admin-frontend): users DTO types + pure view-state/status-tone resolver\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"`

**Deliverable:** masked Users DTO module + unit-tested pure view-state/tone resolvers (list-empty distinct from forbidden, detail `404 → not_found`, status tone), all green.

**Task-scoped DoD (run from `services/sso-admin-frontend`):**
`npm run typecheck && npm run lint && npm run test -- app/lib/users/__tests__/users-view-state.spec.ts`

---

### Task 4.2: Identifier + password validation + PII display helpers (pure)

Pure validation/formatting used by the create (Task 4.10) and sync-profile (Task 4.11) forms and by any masked-PII display (Task 4.8 detail page). Ports the legacy 12+/upper/lower/number/symbol/≤128 password checklist (empty = valid, password is optional) and adds the net-new government-identifier validators whose regexes mirror the backend FormRequests **exactly** (`CreateManagedUserRequest` / `SyncManagedUserProfileRequest`: `nik` `^[0-9]{16}$`, `nip` `^[0-9]{18}$`, `nisn` `^[0-9]{10}$`, `birth_date` `date_format:Y-m-d` + real-date). No Nuxt, no network — these are pure stdlib functions. This task neither performs a privileged action nor renders/hydrates user data, so the privileged-action matrix and the SSR token-leak step do not apply here (they live in Tasks 4.9–4.13); `formatMaskedIdentifier` only guards the null/empty case — the value it passes through is **already masked by the backend**, never raw PII.

**Files**
- Create: `app/lib/users/managed-user-password-policy.ts`
- Create: `app/lib/users/user-identifiers.ts`
- Test: `app/lib/users/__tests__/managed-user-password-policy.spec.ts`
- Test: `app/lib/users/__tests__/user-identifiers.spec.ts`

**Interfaces**
- Produces (`managed-user-password-policy.ts`):
  - `type PasswordRequirementId = 'min_length' | 'uppercase' | 'lowercase' | 'number' | 'symbol' | 'max_length'`
  - `type PasswordRequirement = { readonly id: PasswordRequirementId; readonly met: boolean }`
  - `function evaluateManagedUserPassword(password: string): readonly PasswordRequirement[]` (min ≥12, ≥1 `[A-Z]`, ≥1 `[a-z]`, ≥1 `[0-9]`, ≥1 `[^A-Za-z0-9]`, max ≤128)
  - `function isManagedUserPasswordValid(password: string): boolean` (empty string → `true`, optional; non-empty → every requirement met)
- Produces (`user-identifiers.ts`):
  - `const EMAIL_PATTERN: RegExp`
  - `function isValidEmail(value: string): boolean`
  - `function normalizeEmail(value: string): string` (trim + lowercase)
  - `function isValidNik(value: string): boolean` (`^[0-9]{16}$`)
  - `function isValidNip(value: string): boolean` (`^[0-9]{18}$`)
  - `function isValidNisn(value: string): boolean` (`^[0-9]{10}$`)
  - `function isValidBirthDate(value: string): boolean` (`YYYY-MM-DD`, real calendar date)
  - `function formatMaskedIdentifier(value: string | null | undefined): string` (null/`''` → `'—'`, else passthrough — value is already masked by the backend)
- Consumes: nothing (pure stdlib).

**Steps**

1. [ ] Write the FAILING test `app/lib/users/__tests__/managed-user-password-policy.spec.ts` (FULL code):

```ts
import { describe, expect, it } from 'vitest'
import {
  evaluateManagedUserPassword,
  isManagedUserPasswordValid,
  type PasswordRequirementId,
} from '../managed-user-password-policy'

const met = (password: string, id: PasswordRequirementId): boolean => {
  const requirement = evaluateManagedUserPassword(password).find((r) => r.id === id)
  if (!requirement) throw new Error(`missing requirement ${id}`)
  return requirement.met
}

describe('evaluateManagedUserPassword', () => {
  it('returns all six requirements in a stable order', () => {
    const ids = evaluateManagedUserPassword('').map((r) => r.id)
    expect(ids).toEqual(['min_length', 'uppercase', 'lowercase', 'number', 'symbol', 'max_length'])
  })

  it('flags min_length only at 12+ characters', () => {
    expect(met('Ab1!aaaa', 'min_length')).toBe(false) // 8 chars
    expect(met('Ab1!aaaaaaaa', 'min_length')).toBe(true) // 12 chars
  })

  it('flags each character class independently', () => {
    expect(met('ab1!ab1!ab1!', 'uppercase')).toBe(false)
    expect(met('AB1!AB1!AB1!', 'lowercase')).toBe(false)
    expect(met('Abcd!Abcd!Ab', 'number')).toBe(false)
    expect(met('Abcd1Abcd1Ab', 'symbol')).toBe(false)
    expect(met('Abcd1!Abcd1!', 'uppercase')).toBe(true)
  })

  it('keeps max_length met until length exceeds 128', () => {
    expect(met('A'.repeat(128), 'max_length')).toBe(true)
    expect(met('A'.repeat(129), 'max_length')).toBe(false)
  })
})

describe('isManagedUserPasswordValid', () => {
  it('treats an empty string as valid (password is optional)', () => {
    expect(isManagedUserPasswordValid('')).toBe(true)
  })

  it('requires every requirement for a non-empty password', () => {
    expect(isManagedUserPasswordValid('short')).toBe(false)
    expect(isManagedUserPasswordValid('Str0ng!Passw0rd')).toBe(true)
  })

  it('rejects a password over 128 characters even if otherwise strong', () => {
    expect(isManagedUserPasswordValid(`Aa1!${'a'.repeat(130)}`)).toBe(false)
  })
})
```

2. [ ] Run it — expect **FAIL** (module `../managed-user-password-policy` does not exist → import/resolution error):
   `npm run test -- app/lib/users/__tests__/managed-user-password-policy.spec.ts`

3. [ ] Implement `app/lib/users/managed-user-password-policy.ts` (FULL code):

```ts
// Pure password-policy checklist for the create / sync-profile forms. Ported
// from the legacy admin SPA, plus an explicit max-length requirement so the
// 128-char ceiling reads as a checklist item rather than a silent failure.
// No Nuxt, no network — labels are resolved by the form via i18n keyed on `id`.

export type PasswordRequirementId =
  | 'min_length'
  | 'uppercase'
  | 'lowercase'
  | 'number'
  | 'symbol'
  | 'max_length'

export type PasswordRequirement = {
  readonly id: PasswordRequirementId
  readonly met: boolean
}

export function evaluateManagedUserPassword(password: string): readonly PasswordRequirement[] {
  return [
    { id: 'min_length', met: password.length >= 12 },
    { id: 'uppercase', met: /[A-Z]/u.test(password) },
    { id: 'lowercase', met: /[a-z]/u.test(password) },
    { id: 'number', met: /[0-9]/u.test(password) },
    { id: 'symbol', met: /[^A-Za-z0-9]/u.test(password) },
    { id: 'max_length', met: password.length <= 128 },
  ]
}

// Password is OPTIONAL (gated by the local-account toggle): an empty string is
// valid. A non-empty password must satisfy every requirement, including the
// max-length ceiling.
export function isManagedUserPasswordValid(password: string): boolean {
  if (password === '') return true
  return evaluateManagedUserPassword(password).every((requirement) => requirement.met)
}
```

4. [ ] Run it — expect **PASS**:
   `npm run test -- app/lib/users/__tests__/managed-user-password-policy.spec.ts`

5. [ ] Write the FAILING test `app/lib/users/__tests__/user-identifiers.spec.ts` (FULL code):

```ts
import { describe, expect, it } from 'vitest'
import {
  EMAIL_PATTERN,
  formatMaskedIdentifier,
  isValidBirthDate,
  isValidEmail,
  isValidNik,
  isValidNip,
  isValidNisn,
  normalizeEmail,
} from '../user-identifiers'

describe('email', () => {
  it('EMAIL_PATTERN matches a simple address and rejects malformed input', () => {
    expect(EMAIL_PATTERN.test('admin@example.com')).toBe(true)
    expect(EMAIL_PATTERN.test('no-at-sign')).toBe(false)
    expect(EMAIL_PATTERN.test('user@example')).toBe(false)
  })

  it('isValidEmail accepts a well-formed address and rejects spaces/missing parts', () => {
    expect(isValidEmail('user@example.co.id')).toBe(true)
    expect(isValidEmail('user @example.com')).toBe(false)
    expect(isValidEmail('user@example')).toBe(false)
    expect(isValidEmail('')).toBe(false)
  })

  it('normalizeEmail trims and lowercases', () => {
    expect(normalizeEmail('  Admin@Example.COM  ')).toBe('admin@example.com')
  })
})

describe('government identifiers (backend regexes verbatim)', () => {
  it('isValidNik requires exactly 16 digits', () => {
    expect(isValidNik('1234567890123456')).toBe(true)
    expect(isValidNik('123456789012345')).toBe(false) // 15
    expect(isValidNik('12345678901234567')).toBe(false) // 17
    expect(isValidNik('12345678901234ab')).toBe(false)
  })

  it('isValidNip requires exactly 18 digits', () => {
    expect(isValidNip('123456789012345678')).toBe(true)
    expect(isValidNip('12345678901234567')).toBe(false) // 17
    expect(isValidNip('1234567890123456789')).toBe(false) // 19
  })

  it('isValidNisn requires exactly 10 digits', () => {
    expect(isValidNisn('0123456789')).toBe(true)
    expect(isValidNisn('012345678')).toBe(false) // 9
    expect(isValidNisn('01234567890')).toBe(false) // 11
  })
})

describe('birth date', () => {
  it('accepts a real YYYY-MM-DD date', () => {
    expect(isValidBirthDate('1990-07-15')).toBe(true)
  })

  it('rejects malformed shapes', () => {
    expect(isValidBirthDate('1990-7-15')).toBe(false)
    expect(isValidBirthDate('15-07-1990')).toBe(false)
    expect(isValidBirthDate('1990/07/15')).toBe(false)
    expect(isValidBirthDate('')).toBe(false)
  })

  it('rejects impossible calendar dates', () => {
    expect(isValidBirthDate('2026-02-30')).toBe(false)
    expect(isValidBirthDate('2026-13-01')).toBe(false)
    expect(isValidBirthDate('2026-00-10')).toBe(false)
  })
})

describe('formatMaskedIdentifier', () => {
  it('renders an em dash for null/undefined/empty', () => {
    expect(formatMaskedIdentifier(null)).toBe('—')
    expect(formatMaskedIdentifier(undefined)).toBe('—')
    expect(formatMaskedIdentifier('')).toBe('—')
  })

  it('passes through an already-masked backend value unchanged', () => {
    expect(formatMaskedIdentifier('••••••••3456')).toBe('••••••••3456')
  })
})
```

6. [ ] Run it — expect **FAIL** (module `../user-identifiers` does not exist → import/resolution error):
   `npm run test -- app/lib/users/__tests__/user-identifiers.spec.ts`

7. [ ] Implement `app/lib/users/user-identifiers.ts` (FULL code):

```ts
// Pure identifier validation + masked-PII display for the Users forms. The
// government-identifier regexes mirror the backend FormRequests EXACTLY
// (CreateManagedUserRequest / SyncManagedUserProfileRequest): nik = 16 digits,
// nip = 18 digits, nisn = 10 digits, birth_date = `date_format:Y-m-d` + a real
// date — keep them in lock-step with the backend. NIK/NIP/NISN are accepted RAW
// here for submission only; they are never rendered raw. No Nuxt, no network.

// Same shape as the legacy admin SPA email check.
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value)
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

const NIK_PATTERN = /^[0-9]{16}$/u
const NIP_PATTERN = /^[0-9]{18}$/u
const NISN_PATTERN = /^[0-9]{10}$/u

export function isValidNik(value: string): boolean {
  return NIK_PATTERN.test(value)
}

export function isValidNip(value: string): boolean {
  return NIP_PATTERN.test(value)
}

export function isValidNisn(value: string): boolean {
  return NISN_PATTERN.test(value)
}

const BIRTH_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u

// Mirrors the backend `date_format:Y-m-d` + `date` pair: the shape must match
// AND the value must be a real calendar date. The UTC round-trip rejects
// rollovers (2026-02-30 → March) and out-of-range months (2026-13-01, 2026-00-10)
// without explicit range arithmetic.
export function isValidBirthDate(value: string): boolean {
  if (!BIRTH_DATE_PATTERN.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

// The backend already masks NIK/NIP/NISN (GovernmentIdentifier) before they
// reach the SSR payload; this only guards null/empty so the UI never renders a
// bare blank cell. The value is passed through unchanged — already safe to show.
export function formatMaskedIdentifier(value: string | null | undefined): string {
  return value == null || value === '' ? '—' : value
}
```

8. [ ] Run it — expect **PASS**:
   `npm run test -- app/lib/users/__tests__/user-identifiers.spec.ts`

9. [ ] Refactor pass — confirm there is nothing to extract (both modules are flat pure functions; no shared helper, no Nuxt context, no duplication with `app/lib/status-tone.ts` or `app/lib/display-identifiers.ts`). Re-run both files once more, still green:
   `npm run test -- app/lib/users/__tests__/managed-user-password-policy.spec.ts app/lib/users/__tests__/user-identifiers.spec.ts`

10. [ ] Commit:
    `git add app/lib/users/managed-user-password-policy.ts app/lib/users/user-identifiers.ts app/lib/users/__tests__/managed-user-password-policy.spec.ts app/lib/users/__tests__/user-identifiers.spec.ts && git commit -m "$(printf 'feat(sso-admin-frontend): pure password-policy + identifier validators + masked-PII helper\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"`

**Task DoD gate** (run from `services/sso-admin-frontend`; report any blocked command explicitly):
`npm run test -- app/lib/users/__tests__/managed-user-password-policy.spec.ts app/lib/users/__tests__/user-identifiers.spec.ts && npm run typecheck && npm run lint && npm run format:check`

**Deliverable:** unit-tested password-policy + identifier validators + masked-PII display helper, all green.

---

### Task 4.3: Users service over api-client (single network seam)

A typed service object mirroring `app/services/dashboard.api.ts`: one method per backend Users endpoint, each calling `apiClient.<verb><T>('/api/admin/users…')` against a same-origin BFF path. This is the **single network seam** for the whole Users domain — every composable, page, and action reaches the backend only through `usersApi`. The Nitro proxy (`server/utils/admin-proxy.ts`) injects the Bearer token from `event.context` and rewrites `/api/admin/*` → `/admin/api/*`; the SPA stays token-blind. Optional payload fields are omitted when empty (`...(x && { x })`) so the service never sends `''`/`undefined` to a `sometimes`/`nullable` validator; the one boolean (`local_account_enabled`) is forwarded even when `false`, because `false` is a meaningful create-time state (account disabled), not an "empty" value. (Backend follow-up: confirm with the backend team the create default applied when `local_account_enabled` is omitted entirely — keep the `!== undefined` forwarding + its test regardless.)

This task is a **pure forwarding seam** — no rendering, no hydration, no error mapping. The privileged-action error matrix (`401/403/419/422/428/429/5xx` + step-up) is exercised against the shared infra in **Task 4.9**, not here; the SSR token-leak / raw-PII gate is extended in **Task 4.13**. Accordingly this task neither renders user data nor enters the `__NUXT__` payload, so those assertions are out of scope for 4.3 (the raw NIK/NIP/NISN values in the test below are **create-path inputs** — the one path the backend legitimately accepts raw — and live only in a unit-test fixture, never in SSR HTML).

**Files**
- Create: `services/sso-admin-frontend/app/services/users.api.ts`
- Test: `services/sso-admin-frontend/app/services/__tests__/users.api.spec.ts`

**Interfaces**
- Produces: `export const usersApi` with:
  - `list(): Promise<UserListResponse>` → `GET /api/admin/users`
  - `show(subjectId: string): Promise<UserDetailResponse>` → `GET /api/admin/users/${subjectId}`
  - `create(payload: CreateUserPayload): Promise<CreateUserResponse>` → `POST /api/admin/users`
  - `deactivate(subjectId: string, payload: ReasonPayload): Promise<UserMutationResponse>` → `POST .../deactivate`
  - `reactivate(subjectId: string): Promise<UserMutationResponse>` → `POST .../reactivate` (no body)
  - `issuePasswordReset(subjectId: string): Promise<PasswordResetResponse>` → `POST .../password-reset` (no body)
  - `syncProfile(subjectId: string, payload: SyncProfilePayload): Promise<UserMutationResponse>` → `POST .../sync-profile`
  - `resetMfa(subjectId: string, payload: ReasonPayload): Promise<ResetMfaResponse>` → `POST .../reset-mfa`
  - `lock(subjectId: string, payload: LockPayload): Promise<UserMutationResponse>` → `POST .../lock`
  - `unlock(subjectId: string, payload: ReasonPayload): Promise<UserMutationResponse>` → `POST .../unlock`
  - `requireMfa(subjectId: string, payload: ReasonPayload): Promise<UserMutationResponse>` → `POST .../require-mfa`
  - `unrequireMfa(subjectId: string, payload: ReasonPayload): Promise<UserMutationResponse>` → `POST .../unrequire-mfa`
  - `assignRoles(subjectId: string, payload: AssignRolesPayload): Promise<UserRoleResponse>` → `PUT .../roles`
- Consumes: `apiClient` (`@/lib/api/api-client`); all request/response types from `@/types/users.types` (Task 4.1). All `GET`/`POST`/`PUT` user paths are already allow-listed in the Nitro proxy; `require-mfa`/`unrequire-mfa` are new POST paths — if the proxy 400s them, the allow-list entry is added in Task 4.11 (not this task).

**Steps**

1. [ ] Write the failing test `services/sso-admin-frontend/app/services/__tests__/users.api.spec.ts` (real assertions on path/verb/body for all 13 methods, incl. empty-omit and boolean-`false` preservation):

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  AssignRolesPayload,
  CreateUserPayload,
  LockPayload,
  ReasonPayload,
  SyncProfilePayload,
} from '@/types/users.types'

const get = vi.fn<(path: string) => Promise<unknown>>()
const post = vi.fn<(path: string, body?: unknown) => Promise<unknown>>()
const put = vi.fn<(path: string, body?: unknown) => Promise<unknown>>()
vi.mock('@/lib/api/api-client', () => ({ apiClient: { get, post, put } }))

const { usersApi } = await import('../users.api')

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  put.mockReset()
})

describe('usersApi — read seam', () => {
  it('list() GETs the same-origin user list path and passes the DTO through', async () => {
    const payload = { users: [] }
    get.mockResolvedValue(payload)
    await expect(usersApi.list()).resolves.toBe(payload)
    expect(get).toHaveBeenCalledWith('/api/admin/users')
  })

  it('show() GETs the detail path for the subject id', async () => {
    const payload = { user: {}, login_context: null, sessions: [] }
    get.mockResolvedValue(payload)
    await expect(usersApi.show('sub-123')).resolves.toBe(payload)
    expect(get).toHaveBeenCalledWith('/api/admin/users/sub-123')
  })
})

describe('usersApi — create', () => {
  it('POSTs only the required fields when all optionals are empty', async () => {
    const payload: CreateUserPayload = {
      email: 'sample.staff@example.com',
      display_name: 'Sample Staff',
      role: 'pegawai',
      given_name: '',
      family_name: '',
      password: '',
      nik: '',
      nip: '',
      nisn: '',
      birth_date: '',
    }
    post.mockResolvedValue({ user: {}, delivery_status: 'queued' })
    await usersApi.create(payload)
    expect(post).toHaveBeenCalledWith('/api/admin/users', {
      email: 'sample.staff@example.com',
      display_name: 'Sample Staff',
      role: 'pegawai',
    })
  })

  it('forwards filled optionals incl. local_account_enabled=false (false is meaningful, not empty)', async () => {
    // Sample (clearly fake) raw identifiers — create is the one path the backend accepts raw.
    const payload: CreateUserPayload = {
      email: 'sample.staff@example.com',
      display_name: 'Sample Staff',
      role: 'pegawai',
      given_name: 'Sample',
      family_name: 'Staff',
      password: 'Sample-Passw0rd!',
      local_account_enabled: false,
      nik: '3200000000000001',
      nip: '190000000000000001',
      nisn: '0000000001',
      birth_date: '1990-01-01',
    }
    post.mockResolvedValue({ user: {}, delivery_status: 'queued' })
    await usersApi.create(payload)
    expect(post).toHaveBeenCalledWith('/api/admin/users', {
      email: 'sample.staff@example.com',
      display_name: 'Sample Staff',
      role: 'pegawai',
      given_name: 'Sample',
      family_name: 'Staff',
      password: 'Sample-Passw0rd!',
      local_account_enabled: false,
      nik: '3200000000000001',
      nip: '190000000000000001',
      nisn: '0000000001',
      birth_date: '1990-01-01',
    })
  })
})

describe('usersApi — lifecycle mutations', () => {
  it('deactivate() POSTs the reason to the deactivate path', async () => {
    post.mockResolvedValue({ user: {} })
    const payload: ReasonPayload = { reason: 'Offboarded (sample).' }
    await usersApi.deactivate('sub-1', payload)
    expect(post).toHaveBeenCalledWith('/api/admin/users/sub-1/deactivate', {
      reason: 'Offboarded (sample).',
    })
  })

  it('reactivate() POSTs the reactivate path with no body', async () => {
    post.mockResolvedValue({ user: {} })
    await usersApi.reactivate('sub-1')
    expect(post).toHaveBeenCalledWith('/api/admin/users/sub-1/reactivate')
  })

  it('issuePasswordReset() POSTs the password-reset path with no body', async () => {
    const payload = { user: {}, password_reset: { expires_at: '2026-07-01T00:00:00Z' }, delivery_status: 'queued' }
    post.mockResolvedValue(payload)
    await expect(usersApi.issuePasswordReset('sub-1')).resolves.toBe(payload)
    expect(post).toHaveBeenCalledWith('/api/admin/users/sub-1/password-reset')
  })

  it('syncProfile() POSTs only the changed fields (empty omitted)', async () => {
    post.mockResolvedValue({ user: {} })
    const payload: SyncProfilePayload = { display_name: 'Renamed Sample', email: '', nik: '' }
    await usersApi.syncProfile('sub-1', payload)
    expect(post).toHaveBeenCalledWith('/api/admin/users/sub-1/sync-profile', {
      display_name: 'Renamed Sample',
    })
  })

  it('resetMfa() POSTs the reason to the reset-mfa path', async () => {
    post.mockResolvedValue({ reset: true, message: 'ok', reenrollment_required: true })
    const payload: ReasonPayload = { reason: 'Lost authenticator (sample).' }
    await usersApi.resetMfa('sub-1', payload)
    expect(post).toHaveBeenCalledWith('/api/admin/users/sub-1/reset-mfa', {
      reason: 'Lost authenticator (sample).',
    })
  })

  it('lock() POSTs reason + locked_until when provided', async () => {
    post.mockResolvedValue({ user: {} })
    const payload: LockPayload = { reason: 'Suspicious activity (sample).', locked_until: '2026-07-01T00:00:00Z' }
    await usersApi.lock('sub-1', payload)
    expect(post).toHaveBeenCalledWith('/api/admin/users/sub-1/lock', {
      reason: 'Suspicious activity (sample).',
      locked_until: '2026-07-01T00:00:00Z',
    })
  })

  it('lock() omits locked_until when absent', async () => {
    post.mockResolvedValue({ user: {} })
    const payload: LockPayload = { reason: 'Suspicious activity (sample).' }
    await usersApi.lock('sub-1', payload)
    expect(post).toHaveBeenCalledWith('/api/admin/users/sub-1/lock', {
      reason: 'Suspicious activity (sample).',
    })
  })

  it('unlock() POSTs the reason to the unlock path', async () => {
    post.mockResolvedValue({ user: {} })
    const payload: ReasonPayload = { reason: 'Verified owner (sample).' }
    await usersApi.unlock('sub-1', payload)
    expect(post).toHaveBeenCalledWith('/api/admin/users/sub-1/unlock', {
      reason: 'Verified owner (sample).',
    })
  })

  it('requireMfa() POSTs the reason to the require-mfa path', async () => {
    post.mockResolvedValue({ user: {} })
    const payload: ReasonPayload = { reason: 'Elevated risk (sample).' }
    await usersApi.requireMfa('sub-1', payload)
    expect(post).toHaveBeenCalledWith('/api/admin/users/sub-1/require-mfa', {
      reason: 'Elevated risk (sample).',
    })
  })

  it('unrequireMfa() POSTs the reason to the unrequire-mfa path', async () => {
    post.mockResolvedValue({ user: {} })
    const payload: ReasonPayload = { reason: 'Risk cleared (sample).' }
    await usersApi.unrequireMfa('sub-1', payload)
    expect(post).toHaveBeenCalledWith('/api/admin/users/sub-1/unrequire-mfa', {
      reason: 'Risk cleared (sample).',
    })
  })
})

describe('usersApi — role assignment', () => {
  it('assignRoles() PUTs the single-element role_slugs to the roles path', async () => {
    put.mockResolvedValue({ user: {} })
    const payload: AssignRolesPayload = { role_slugs: ['administrator'] }
    await usersApi.assignRoles('sub-1', payload)
    expect(put).toHaveBeenCalledWith('/api/admin/users/sub-1/roles', {
      role_slugs: ['administrator'],
    })
  })
})
```

2. [ ] Run it — expect **FAIL** (`../users.api` does not exist; the dynamic `import('../users.api')` rejects so every test errors):
   `npm run test -- app/services/__tests__/users.api.spec.ts`

3. [ ] Implement `services/sso-admin-frontend/app/services/users.api.ts` (FULL code):

```ts
import { apiClient } from '@/lib/api/api-client'
import type {
  AssignRolesPayload,
  CreateUserPayload,
  CreateUserResponse,
  LockPayload,
  PasswordResetResponse,
  ReasonPayload,
  ResetMfaResponse,
  SyncProfilePayload,
  UserDetailResponse,
  UserListResponse,
  UserMutationResponse,
  UserRoleResponse,
} from '@/types/users.types'

// Same-origin BFF paths. The Nitro proxy (server/utils/admin-proxy.ts) injects
// the Bearer access token from event.context and rewrites /api/admin/* →
// /admin/api/* before forwarding to the backend. The browser/SPA is token-blind.
//
// This is the single network seam for the Users domain. Optional fields are
// omitted when empty so the backend's `sometimes`/`nullable` validators never
// see '' or undefined; local_account_enabled is the one exception — false is a
// meaningful create state (account disabled), so it is forwarded explicitly.
function userPath(subjectId: string, action?: string): string {
  return action ? `/api/admin/users/${subjectId}/${action}` : `/api/admin/users/${subjectId}`
}

export const usersApi = {
  list(): Promise<UserListResponse> {
    return apiClient.get<UserListResponse>('/api/admin/users')
  },

  show(subjectId: string): Promise<UserDetailResponse> {
    return apiClient.get<UserDetailResponse>(userPath(subjectId))
  },

  create(payload: CreateUserPayload): Promise<CreateUserResponse> {
    return apiClient.post<CreateUserResponse>('/api/admin/users', {
      email: payload.email,
      display_name: payload.display_name,
      role: payload.role,
      ...(payload.given_name && { given_name: payload.given_name }),
      ...(payload.family_name && { family_name: payload.family_name }),
      ...(payload.password && { password: payload.password }),
      ...(payload.local_account_enabled !== undefined && {
        local_account_enabled: payload.local_account_enabled,
      }),
      ...(payload.nik && { nik: payload.nik }),
      ...(payload.nip && { nip: payload.nip }),
      ...(payload.nisn && { nisn: payload.nisn }),
      ...(payload.birth_date && { birth_date: payload.birth_date }),
    })
  },

  deactivate(subjectId: string, payload: ReasonPayload): Promise<UserMutationResponse> {
    return apiClient.post<UserMutationResponse>(userPath(subjectId, 'deactivate'), {
      reason: payload.reason,
    })
  },

  reactivate(subjectId: string): Promise<UserMutationResponse> {
    return apiClient.post<UserMutationResponse>(userPath(subjectId, 'reactivate'))
  },

  issuePasswordReset(subjectId: string): Promise<PasswordResetResponse> {
    return apiClient.post<PasswordResetResponse>(userPath(subjectId, 'password-reset'))
  },

  syncProfile(subjectId: string, payload: SyncProfilePayload): Promise<UserMutationResponse> {
    return apiClient.post<UserMutationResponse>(userPath(subjectId, 'sync-profile'), {
      ...(payload.email && { email: payload.email }),
      ...(payload.display_name && { display_name: payload.display_name }),
      ...(payload.given_name && { given_name: payload.given_name }),
      ...(payload.family_name && { family_name: payload.family_name }),
      ...(payload.nik && { nik: payload.nik }),
      ...(payload.nip && { nip: payload.nip }),
      ...(payload.nisn && { nisn: payload.nisn }),
      ...(payload.birth_date && { birth_date: payload.birth_date }),
    })
  },

  resetMfa(subjectId: string, payload: ReasonPayload): Promise<ResetMfaResponse> {
    return apiClient.post<ResetMfaResponse>(userPath(subjectId, 'reset-mfa'), {
      reason: payload.reason,
    })
  },

  lock(subjectId: string, payload: LockPayload): Promise<UserMutationResponse> {
    return apiClient.post<UserMutationResponse>(userPath(subjectId, 'lock'), {
      reason: payload.reason,
      ...(payload.locked_until && { locked_until: payload.locked_until }),
    })
  },

  unlock(subjectId: string, payload: ReasonPayload): Promise<UserMutationResponse> {
    return apiClient.post<UserMutationResponse>(userPath(subjectId, 'unlock'), {
      reason: payload.reason,
    })
  },

  requireMfa(subjectId: string, payload: ReasonPayload): Promise<UserMutationResponse> {
    return apiClient.post<UserMutationResponse>(userPath(subjectId, 'require-mfa'), {
      reason: payload.reason,
    })
  },

  unrequireMfa(subjectId: string, payload: ReasonPayload): Promise<UserMutationResponse> {
    return apiClient.post<UserMutationResponse>(userPath(subjectId, 'unrequire-mfa'), {
      reason: payload.reason,
    })
  },

  assignRoles(subjectId: string, payload: AssignRolesPayload): Promise<UserRoleResponse> {
    return apiClient.put<UserRoleResponse>(userPath(subjectId, 'roles'), {
      role_slugs: payload.role_slugs,
    })
  },
}
```

4. [ ] Run it — expect **PASS** (all 14 specs green):
   `npm run test -- app/services/__tests__/users.api.spec.ts`

5. [ ] Refactor pass (no behaviour change): confirm the `userPath` helper is the only place a subject id is interpolated (no hardcoded `/api/admin/users/${...}` duplicated in callers), confirm no `fetch`/`$fetch` appears in the file, and re-run step 4 to confirm still green.

6. [ ] Commit:
   `git add app/services/users.api.ts app/services/__tests__/users.api.spec.ts && git commit -m "$(printf 'feat(sso-admin-frontend): users service over api-client (single network seam)\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"`

**Deliverable:** typed `usersApi` covering all 13 user endpoints, each verified to call the correct same-origin path/verb/body, empty optionals omitted, `local_account_enabled=false` preserved — all green.

**Task DoD (run from `services/sso-admin-frontend`):**
`npm run typecheck && npm run lint && npm run format:check && npm run test -- app/services/__tests__/users.api.spec.ts`

---

### Task 4.4: `useUsersList` composable + pure client search/filter/pagination

The SSR data boundary for the list: wrap `usersApi.list()` in `useAsyncData` (resolves server-side, masked DTO hydrates with no client flash), expose the mapped view-state + redacted request id + stale flag, and provide client-side **search** (`display_name`/`email`/`subject_id`, case-insensitive), **status filter** (over `effective_status`), and **pagination** — the backend list has no query params, so this is derived over the hydrated list. The pure list logic is extracted into `users-list.ts` so it is unit-testable without a Nuxt context (mirrors the dashboard's pure-resolver split). Tested in `*.nuxt.spec.ts` with `useAsyncData` mocked at the boundary so state mapping is deterministic.

**Files**
- Create: `app/lib/users/users-list.ts`
- Create: `app/composables/useUsersList.ts`
- Test: `app/lib/users/__tests__/users-list.spec.ts`
- Test: `app/composables/__tests__/useUsersList.nuxt.spec.ts`

**Interfaces**
- Produces (`app/lib/users/users-list.ts`):
  - `const USERS_PAGE_SIZE = 25`
  - `type UsersStatusFilter = 'all' | UserAccountStatus`
  - `function filterUsers(list: readonly AdminUserListItem[], args: { query: string; status: UsersStatusFilter }): readonly AdminUserListItem[]`
  - `function paginateUsers(list: readonly AdminUserListItem[], page: number, size?: number): readonly AdminUserListItem[]`
  - `function pageCount(total: number, size?: number): number`
- Produces (`app/composables/useUsersList.ts`):
  - `type UseUsersListReturn = { readonly users: ComputedRef<readonly AdminUserListItem[]>; readonly filtered: ComputedRef<readonly AdminUserListItem[]>; readonly paged: ComputedRef<readonly AdminUserListItem[]>; readonly viewState: ComputedRef<UsersViewState>; readonly total: ComputedRef<number>; readonly filteredTotal: ComputedRef<number>; readonly page: Ref<number>; readonly pageCount: ComputedRef<number>; readonly query: Ref<string>; readonly statusFilter: Ref<UsersStatusFilter>; readonly requestId: ComputedRef<string | null>; readonly isStale: ComputedRef<boolean>; readonly refresh: () => Promise<void> }`
  - `function useUsersList(): UseUsersListReturn`
- Consumes: `useAsyncData<UserListResponse>('admin-users-list', () => usersApi.list())`; `usersApi` (4.3); `resolveUsersViewState` (4.1); `filterUsers`/`paginateUsers`/`pageCount`/`USERS_PAGE_SIZE`; `UserAccountStatus`, `AdminUserListItem`, `UserListResponse`, `UsersViewState` (4.1); `ApiError`, `getLastRequestId` (`@/lib/api/api-client`).

**Steps**

1. [ ] Write the failing pure-logic test `app/lib/users/__tests__/users-list.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  USERS_PAGE_SIZE,
  filterUsers,
  pageCount,
  paginateUsers,
} from '../users-list'
import type { AdminUserListItem } from '@/types/users.types'

// A single fully-typed sample row; overrides keep each case readable. PII fields
// are the BACKEND-MASKED form (only the trailing 4 digits survive) — fixtures
// must never carry a raw 16/18/10-digit identifier, matching the live contract.
const base: AdminUserListItem = {
  id: 1,
  subject_id: 'usr_budi',
  email: 'budi.santoso@example.test',
  given_name: 'Budi',
  family_name: 'Santoso',
  display_name: 'Budi Santoso',
  role: 'user',
  status: 'active',
  effective_status: 'active',
  disabled_at: null,
  disabled_reason: null,
  locked_at: null,
  locked_until: null,
  locked_reason: null,
  locked_by_subject_id: null,
  lock_count: 0,
  local_account_enabled: true,
  profile_synced_at: null,
  email_verified_at: null,
  last_login_at: null,
  created_at: '2026-01-01T00:00:00Z',
  nik: '••••••••••••3456',
  nip: null,
  nisn: null,
  birth_date: null,
  mfa_enrolled: false,
  mfa_methods: [],
  mfa_mandatory: false,
  roles: [],
  login_context: null,
}

function makeUser(overrides: Partial<AdminUserListItem>): AdminUserListItem {
  return { ...base, ...overrides }
}

const sample: readonly AdminUserListItem[] = [
  makeUser({ subject_id: 'usr_budi', display_name: 'Budi Santoso', email: 'budi@example.test', effective_status: 'active' }),
  makeUser({ subject_id: 'usr_citra', display_name: 'Citra Lestari', email: 'citra@example.test', effective_status: 'locked' }),
  makeUser({ subject_id: 'usr_dewi', display_name: null, email: 'dewi.k@example.test', effective_status: 'disabled' }),
  makeUser({ subject_id: 'usr_eko', display_name: 'Eko Prasetyo', email: 'eko@example.test', effective_status: 'deactivated' }),
]

describe('filterUsers', () => {
  it('returns the full list when query is empty and status is "all"', () => {
    expect(filterUsers(sample, { query: '', status: 'all' })).toHaveLength(4)
    // whitespace-only query is treated as empty
    expect(filterUsers(sample, { query: '   ', status: 'all' })).toHaveLength(4)
  })

  it('matches the query case-insensitively across display_name, email and subject_id', () => {
    expect(filterUsers(sample, { query: 'citra', status: 'all' }).map((u) => u.subject_id)).toEqual(['usr_citra'])
    expect(filterUsers(sample, { query: 'EKO@EXAMPLE', status: 'all' }).map((u) => u.subject_id)).toEqual(['usr_eko'])
    expect(filterUsers(sample, { query: 'usr_dewi', status: 'all' }).map((u) => u.subject_id)).toEqual(['usr_dewi'])
  })

  it('does not crash on a null display_name and still matches by email', () => {
    expect(filterUsers(sample, { query: 'dewi.k', status: 'all' }).map((u) => u.subject_id)).toEqual(['usr_dewi'])
  })

  it('filters by effective_status, not the raw status field', () => {
    expect(filterUsers(sample, { query: '', status: 'locked' }).map((u) => u.subject_id)).toEqual(['usr_citra'])
    expect(filterUsers(sample, { query: '', status: 'deactivated' }).map((u) => u.subject_id)).toEqual(['usr_eko'])
  })

  it('combines query and status (AND)', () => {
    expect(filterUsers(sample, { query: 'citra', status: 'active' })).toHaveLength(0)
    expect(filterUsers(sample, { query: 'citra', status: 'locked' })).toHaveLength(1)
  })
})

describe('paginateUsers', () => {
  const many: readonly AdminUserListItem[] = Array.from({ length: 30 }, (_, i) =>
    makeUser({ subject_id: `usr_${i}`, email: `u${i}@example.test`, display_name: `User ${i}` }),
  )

  it('returns the first page-size slice for page 1 and the remainder for page 2', () => {
    expect(paginateUsers(many, 1)).toHaveLength(USERS_PAGE_SIZE)
    expect(paginateUsers(many, 2)).toHaveLength(30 - USERS_PAGE_SIZE)
    expect(paginateUsers(many, 1)[0]?.subject_id).toBe('usr_0')
    expect(paginateUsers(many, 2)[0]?.subject_id).toBe(`usr_${USERS_PAGE_SIZE}`)
  })

  it('honours an explicit page size and clamps page < 1 to the first page', () => {
    expect(paginateUsers(many, 1, 10)).toHaveLength(10)
    expect(paginateUsers(many, 0, 10)[0]?.subject_id).toBe('usr_0')
  })

  it('returns an empty slice for a page beyond the data', () => {
    expect(paginateUsers(many, 99)).toEqual([])
  })
})

describe('pageCount', () => {
  it('ceils total/size and is never below 1', () => {
    expect(pageCount(0)).toBe(1)
    expect(pageCount(25)).toBe(1)
    expect(pageCount(26)).toBe(2)
    expect(pageCount(50)).toBe(2)
    expect(pageCount(51)).toBe(3)
    expect(pageCount(10, 10)).toBe(1)
    expect(pageCount(11, 10)).toBe(2)
  })
})
```

2. [ ] Run it — expect **FAIL** (`../users-list` does not exist → import/resolution error):
   `npm run test -- app/lib/users/__tests__/users-list.spec.ts`

3. [ ] Implement `app/lib/users/users-list.ts` (FULL code):

```ts
import type { AdminUserListItem, UserAccountStatus } from '@/types/users.types'

// The backend `GET /admin/api/users` returns a flat `{ users }` with no query
// params, so search / status-filter / pagination are derived client-side over
// the hydrated, already-masked list. 25 mirrors the legacy Users table page size.
export const USERS_PAGE_SIZE = 25

export type UsersStatusFilter = 'all' | UserAccountStatus

// Case-insensitive substring match over the operator-meaningful identity fields
// (display name, email, subject id); status filters on `effective_status` — the
// computed lifecycle state the badge shows — not the raw `status` column. PII
// identifiers (nik/nip/nisn) are deliberately NOT searchable: they are masked.
export function filterUsers(
  list: readonly AdminUserListItem[],
  args: { query: string; status: UsersStatusFilter },
): readonly AdminUserListItem[] {
  const q = args.query.trim().toLowerCase()
  return list.filter((user) => {
    if (args.status !== 'all' && user.effective_status !== args.status) return false
    if (q === '') return true
    return (
      (user.display_name ?? '').toLowerCase().includes(q) ||
      user.email.toLowerCase().includes(q) ||
      user.subject_id.toLowerCase().includes(q)
    )
  })
}

// 1-based page; page < 1 is clamped to the first page so a stale page ref can
// never index before the start of the list.
export function paginateUsers(
  list: readonly AdminUserListItem[],
  page: number,
  size: number = USERS_PAGE_SIZE,
): readonly AdminUserListItem[] {
  const start = (Math.max(1, page) - 1) * size
  return list.slice(start, start + size)
}

// Always at least one page so the folio renders "01 / 01" for an empty result.
export function pageCount(total: number, size: number = USERS_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / size))
}
```

4. [ ] Run it — expect **PASS**:
   `npm run test -- app/lib/users/__tests__/users-list.spec.ts`

5. [ ] Write the failing composable test `app/composables/__tests__/useUsersList.nuxt.spec.ts`:

```ts
// *.nuxt.spec.ts → routed to the 'nuxt' env where mockNuxtImport is available.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { ApiError } from '@/lib/api/api-client'
import { usersApi } from '@/services/users.api'
import { useUsersList } from '../useUsersList'
import type { AdminUserListItem, UserListResponse } from '@/types/users.types'

vi.mock('@/services/users.api', () => ({
  usersApi: { list: vi.fn<() => Promise<UserListResponse>>() },
}))

// Controllable useAsyncData stand-in: the test mutates data/pending/error and
// asserts the composable's derived state, and captures the key + handler so we
// can prove the composable wires the service correctly.
const data = ref<UserListResponse | null>(null)
const pending = ref(false)
const error = ref<unknown>(null)
const refreshMock = vi.fn(async () => {})
let capturedKey: string | null = null
let capturedHandler: (() => unknown) | null = null

mockNuxtImport('useAsyncData', () => {
  return (key: string, handler: () => unknown) => {
    capturedKey = key
    capturedHandler = handler
    return { data, pending, error, refresh: refreshMock }
  }
})

const base: AdminUserListItem = {
  id: 1,
  subject_id: 'usr_budi',
  email: 'budi.santoso@example.test',
  given_name: 'Budi',
  family_name: 'Santoso',
  display_name: 'Budi Santoso',
  role: 'user',
  status: 'active',
  effective_status: 'active',
  disabled_at: null,
  disabled_reason: null,
  locked_at: null,
  locked_until: null,
  locked_reason: null,
  locked_by_subject_id: null,
  lock_count: 0,
  local_account_enabled: true,
  profile_synced_at: null,
  email_verified_at: null,
  last_login_at: null,
  created_at: '2026-01-01T00:00:00Z',
  nik: '••••••••••••3456',
  nip: null,
  nisn: null,
  birth_date: null,
  mfa_enrolled: false,
  mfa_methods: [],
  mfa_mandatory: false,
  roles: [],
  login_context: null,
}
const makeUser = (o: Partial<AdminUserListItem>): AdminUserListItem => ({ ...base, ...o })

const ready: UserListResponse = {
  users: [
    makeUser({ subject_id: 'usr_budi', display_name: 'Budi Santoso', email: 'budi@example.test', effective_status: 'active' }),
    makeUser({ subject_id: 'usr_citra', display_name: 'Citra Lestari', email: 'citra@example.test', effective_status: 'locked' }),
  ],
}
const many: UserListResponse = {
  users: Array.from({ length: 30 }, (_, i) =>
    makeUser({ subject_id: `usr_${i}`, email: `u${i}@example.test`, display_name: `User ${i}` }),
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

describe('useUsersList', () => {
  it('wires the service under a stable asyncData key', () => {
    useUsersList()
    expect(capturedKey).toBe('admin-users-list')
    capturedHandler?.()
    expect(usersApi.list).toHaveBeenCalledTimes(1)
  })

  it('derives loading / ready / empty from the list', () => {
    const list = useUsersList()
    expect(list.viewState.value).toBe('loading')
    data.value = ready
    expect(list.viewState.value).toBe('ready')
    expect(list.users.value).toHaveLength(2)
    data.value = { users: [] }
    expect(list.viewState.value).toBe('empty')
  })

  it('applies the search query and status filter to derived rows', () => {
    data.value = ready
    const list = useUsersList()
    list.query.value = 'citra'
    expect(list.filtered.value.map((u) => u.subject_id)).toEqual(['usr_citra'])
    expect(list.filteredTotal.value).toBe(1)
    list.query.value = ''
    list.statusFilter.value = 'locked'
    expect(list.filtered.value.map((u) => u.subject_id)).toEqual(['usr_citra'])
    expect(list.total.value).toBe(2)
  })

  it('paginates the filtered list and reports the page count', () => {
    data.value = many
    const list = useUsersList()
    expect(list.paged.value).toHaveLength(25)
    expect(list.pageCount.value).toBe(2)
    list.page.value = 2
    expect(list.paged.value).toHaveLength(5)
  })

  it('resets to page 1 when the query or status filter changes', async () => {
    data.value = many
    const list = useUsersList()
    list.page.value = 2
    list.query.value = 'User 1'
    await nextTick()
    expect(list.page.value).toBe(1)
  })

  it('maps a first-load 403 to forbidden and exposes the redacted request id', () => {
    error.value = new ApiError(403, 'forbidden', 'forbidden', null, 'admin-req-DENIED42')
    const list = useUsersList()
    expect(list.viewState.value).toBe('forbidden')
    expect(list.requestId.value).toBe('admin-req-DENIED42')
  })

  it('maps a first-load 401 to unauthenticated', () => {
    error.value = new ApiError(401, 'no session')
    expect(useUsersList().viewState.value).toBe('unauthenticated')
  })

  it('keeps the last good list on a background refresh failure (stale)', () => {
    data.value = ready
    error.value = new ApiError(500, 'boom')
    const list = useUsersList()
    expect(list.viewState.value).toBe('ready')
    expect(list.isStale.value).toBe(true)
  })

  it('refresh() delegates to the underlying asyncData refresh', async () => {
    await useUsersList().refresh()
    expect(refreshMock).toHaveBeenCalledTimes(1)
  })

  it('hydrates only masked DTOs — no token and no raw NIK/NIP/NISN digit-run leaks', () => {
    // The composable passes the masked backend DTO through verbatim; it must
    // never introduce a token field or an un-masked identifier. (The full SSR
    // payload leak gate over /users is Task 4.13; this guards the data boundary.)
    data.value = many
    const list = useUsersList()
    const serialized = JSON.stringify({ users: list.users.value, paged: list.paged.value })
    expect(serialized).not.toMatch(/access_token|refresh_token|id_token|Bearer|client_secret/i)
    expect(serialized).not.toMatch(/\b\d{16}\b|\b\d{18}\b|\b\d{10}\b/)
  })
})
```

6. [ ] Run it — expect **FAIL** (`../useUsersList` does not exist):
   `npm run test -- app/composables/__tests__/useUsersList.nuxt.spec.ts`

7. [ ] Implement `app/composables/useUsersList.ts` (FULL code):

```ts
import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'
import { ApiError, getLastRequestId } from '@/lib/api/api-client'
import { usersApi } from '@/services/users.api'
import { resolveUsersViewState, type UsersViewState } from '@/lib/users/users-view-state'
import {
  USERS_PAGE_SIZE,
  filterUsers,
  pageCount as computePageCount,
  paginateUsers,
  type UsersStatusFilter,
} from '@/lib/users/users-list'
import type { AdminUserListItem, UserListResponse } from '@/types/users.types'

export type UseUsersListReturn = {
  readonly users: ComputedRef<readonly AdminUserListItem[]>
  readonly filtered: ComputedRef<readonly AdminUserListItem[]>
  readonly paged: ComputedRef<readonly AdminUserListItem[]>
  readonly viewState: ComputedRef<UsersViewState>
  readonly total: ComputedRef<number>
  readonly filteredTotal: ComputedRef<number>
  readonly page: Ref<number>
  readonly pageCount: ComputedRef<number>
  readonly query: Ref<string>
  readonly statusFilter: Ref<UsersStatusFilter>
  readonly requestId: ComputedRef<string | null>
  readonly isStale: ComputedRef<boolean>
  readonly refresh: () => Promise<void>
}

export function useUsersList(): UseUsersListReturn {
  // Runs during SSR so the masked list resolves server-side and hydrates into the
  // payload (safe DTO only — masked identifiers + lifecycle fields). The access
  // token stays in the Nitro event.context and never reaches the page/__NUXT__.
  const { data, pending, error, refresh } = useAsyncData<UserListResponse>(
    'admin-users-list',
    () => usersApi.list(),
  )

  // `null` (no response yet) is kept distinct from `[]` (an answered, empty list)
  // so the view-state resolver tells "loading/error" apart from "empty".
  const list = computed<readonly AdminUserListItem[] | null>(() => data.value?.users ?? null)
  const users = computed<readonly AdminUserListItem[]>(() => list.value ?? [])

  const query = ref('')
  const statusFilter = ref<UsersStatusFilter>('all')
  const page = ref(1)

  const filtered = computed<readonly AdminUserListItem[]>(() =>
    filterUsers(users.value, { query: query.value, status: statusFilter.value }),
  )
  const total = computed<number>(() => users.value.length)
  const filteredTotal = computed<number>(() => filtered.value.length)
  const pageCount = computed<number>(() => computePageCount(filteredTotal.value, USERS_PAGE_SIZE))
  const paged = computed<readonly AdminUserListItem[]>(() =>
    paginateUsers(filtered.value, page.value, USERS_PAGE_SIZE),
  )

  const viewState = computed<UsersViewState>(() =>
    resolveUsersViewState({ pending: pending.value, error: error.value, list: list.value }),
  )

  // A background refresh failed but we still hold a good list — keep it on screen
  // with a stale notice rather than blanking the table.
  const isStale = computed<boolean>(() => Boolean(error.value) && list.value !== null)

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
    users,
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

8. [ ] Run the composable test — expect **PASS**:
   `npm run test -- app/composables/__tests__/useUsersList.nuxt.spec.ts`

9. [ ] Refactor pass (optional): confirm both modules read cleanly, no `any`, every return field is `readonly` per the contract; re-run both test files to confirm still green:
   `npm run test -- app/lib/users/__tests__/users-list.spec.ts app/composables/__tests__/useUsersList.nuxt.spec.ts`

10. [ ] Commit:
   `git add app/lib/users/users-list.ts app/lib/users/__tests__/users-list.spec.ts app/composables/useUsersList.ts app/composables/__tests__/useUsersList.nuxt.spec.ts && git commit -m "$(printf 'feat(sso-admin-frontend): useUsersList SSR composable + pure client list logic\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"`

**Deliverable:** SSR list composable wired under the stable key `admin-users-list` with unit-tested client filter/paginate/page-count, all green.

**Task-scoped DoD gate (run from `services/sso-admin-frontend`; report any blocked command explicitly, never claim PASS for a command that did not run):**
`npm run test -- app/lib/users/__tests__/users-list.spec.ts app/composables/__tests__/useUsersList.nuxt.spec.ts && npm run typecheck && npm run lint && npm run format:check`

---

### Task 4.5: UsersTable.vue (Swiss domain table)

The user list rendered as a hairline `UiDataList` (user · email · role · status), with the account status shown as a `UiStatusBadge` (tone + label → **never colour-alone**, every account always carries a badge), a per-row `#actions` "view detail" affordance, and folio next/previous pagination via `UiDataList`'s `next`/`previous`. Dumb/presentational: it receives pre-built, pre-localized, pre-masked rows and emits intents — it does no fetching, no view-state mapping, no localization. Mirrors `DashboardMetricGroup.vue` exactly (typed row, computed columns, `UiDataList` + per-cell slots). DS deps are imported explicitly (matching `UiDataList`'s own `import UiFolio from './UiFolio.vue'` style) so a plain `@vue/test-utils` mount resolves them without Nuxt auto-import.

**Files**
- Create: `app/components/users/UsersTable.vue`
- Test: `app/components/users/__tests__/UsersTable.spec.ts`

**Interfaces**
- Produces (component):
  - `type UsersTableRow = { readonly id: string; readonly displayName: string; readonly email: string; readonly role: string; readonly status: string; readonly statusTone: StatusTone }` (`id` = `subject_id`, the row key)
  - Props: `{ caption: string; userLabel: string; emailLabel: string; roleLabel: string; statusLabel: string; viewLabel: string; rows: readonly UsersTableRow[]; total: number; page?: number; pageCount?: number; nextLabel?: string; previousLabel?: string }`
  - Emits: `select(id: string)`, `next()`, `previous()`
- Consumes: `UiDataList` (+ `UiDataListColumn`, `UiDataListRow`) from `@/components/ui/UiDataList.vue`; `UiStatusBadge` from `@/components/ui/UiStatusBadge.vue`; `UiButton` from `@/components/ui/UiButton.vue`; `UiFolio` from `@/components/ui/UiFolio.vue`; `StatusTone` from `@/lib/status-tone`.

**Steps**

1. [ ] Write the failing test `app/components/users/__tests__/UsersTable.spec.ts` (real behaviour — rendered columns, status-badge tones/labels, row select emit, pagination emits, page folio, and a no-token/no-raw-PII assertion over the rendered HTML):

```ts
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import UsersTable, { type UsersTableRow } from '../UsersTable.vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'

// Rows read clearly as samples (Swiss: no fabricated personas). They are already
// masked + localized by the page — this component is dumb.
const rows: readonly UsersTableRow[] = [
  {
    id: 'usr_sample_001',
    displayName: 'Operator Satu',
    email: 'operator.satu@example.test',
    role: 'admin',
    status: 'Aktif',
    statusTone: 'success',
  },
  {
    id: 'usr_sample_002',
    displayName: 'Operator Dua',
    email: 'operator.dua@example.test',
    role: 'user',
    status: 'Terkunci',
    statusTone: 'danger',
  },
  {
    id: 'usr_sample_003',
    displayName: 'Operator Tiga',
    email: 'operator.tiga@example.test',
    role: 'pegawai',
    status: 'Deaktivasi',
    statusTone: 'neutral',
  },
]

function mountTable() {
  return mount(UsersTable, {
    props: {
      caption: 'Akun Pengguna',
      userLabel: 'Pengguna',
      emailLabel: 'Surel',
      roleLabel: 'Peran',
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

describe('UsersTable', () => {
  it('renders the caption, the column labels, and every row’s fields', () => {
    const wrapper = mountTable()
    expect(wrapper.text()).toContain('Akun Pengguna')
    expect(wrapper.text()).toContain('Pengguna')
    expect(wrapper.text()).toContain('Surel')
    expect(wrapper.text()).toContain('Peran')
    expect(wrapper.text()).toContain('Status')
    expect(wrapper.text()).toContain('Operator Satu')
    expect(wrapper.text()).toContain('operator.dua@example.test')
    expect(wrapper.text()).toContain('pegawai')
  })

  it('renders account status as a UiStatusBadge per row — tone + label, never colour-alone', () => {
    const wrapper = mountTable()
    const badges = wrapper.findAllComponents(UiStatusBadge)
    expect(badges).toHaveLength(rows.length)
    expect(badges.map((b) => b.props('tone'))).toEqual(['success', 'danger', 'neutral'])
    // every badge carries a real text label (the shape/dot never stands alone)
    expect(badges.map((b) => b.props('label'))).toEqual(['Aktif', 'Terkunci', 'Deaktivasi'])
  })

  it('emits select(id) with the row subject id when the row view action is clicked', async () => {
    const wrapper = mountTable()
    const viewButtons = wrapper.findAll('[data-testid="users-row-view"]')
    expect(viewButtons).toHaveLength(rows.length)
    expect(viewButtons[0].text()).toBe('Lihat')
    await viewButtons[1].trigger('click')
    expect(wrapper.emitted('select')).toEqual([['usr_sample_002']])
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
    expect(wrapper.get('[data-testid="users-page-folio"]').text()).toMatch(/01\s*\/\s*03/)
  })

  it('omits the page folio when page / pageCount are not provided', () => {
    const wrapper = mount(UsersTable, {
      props: {
        caption: 'Akun Pengguna',
        userLabel: 'Pengguna',
        emailLabel: 'Surel',
        roleLabel: 'Peran',
        statusLabel: 'Status',
        viewLabel: 'Lihat',
        rows,
        total: 3,
      },
    })
    expect(wrapper.find('[data-testid="users-page-folio"]').exists()).toBe(false)
    // no pagination buttons without labels
    expect(wrapper.find('[data-testid="data-list-next"]').exists()).toBe(false)
  })

  it('renders no token value/name and no raw-PII digit run (16/18/10) in its HTML', () => {
    const html = mountTable().html()
    expect(html).not.toMatch(/access_token|refresh_token|id_token|Bearer|SENTINEL-/)
    // raw NIK (16) / NIP (18) / NISN (10) shapes: any unbroken 10+ digit run is a leak.
    expect(html).not.toMatch(/\d{10,}/)
  })
})
```

2. [ ] Run it — expect **FAIL** (`../UsersTable.vue` does not exist → import/resolution error):
   `npm run test -- app/components/users/__tests__/UsersTable.spec.ts`

3. [ ] Implement `app/components/users/UsersTable.vue` (FULL code):

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

export type UsersTableRow = {
  readonly id: string
  readonly displayName: string
  readonly email: string
  readonly role: string
  readonly status: string
  readonly statusTone: StatusTone
}

const props = withDefaults(
  defineProps<{
    readonly caption: string
    readonly userLabel: string
    readonly emailLabel: string
    readonly roleLabel: string
    readonly statusLabel: string
    readonly viewLabel: string
    readonly rows: readonly UsersTableRow[]
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
  { key: 'displayName', label: props.userLabel, align: 'left' },
  { key: 'email', label: props.emailLabel, align: 'left' },
  { key: 'role', label: props.roleLabel, align: 'left' },
  { key: 'status', label: props.statusLabel, align: 'left' },
])

// UsersTableRow is structurally assignable to UiDataListRow (every field is a
// string and it carries an `id`), so this is identity at runtime.
const dataRows = computed<readonly UiDataListRow[]>(() => props.rows)

const showFolio = computed<boolean>(() => props.page != null && props.pageCount != null)

// row.* arrives typed as string | number | null | undefined (UiDataListRow); the
// page only ever feeds well-formed UsersTableRows, so narrow defensively.
function rowTone(value: unknown): StatusTone {
  return (typeof value === 'string' ? value : 'neutral') as StatusTone
}

function rowText(value: unknown): string {
  return value == null || value === '' ? '—' : String(value)
}
</script>

<template>
  <div class="users-table" data-component="users-table">
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
      <template #cell(status)="{ row }">
        <UiStatusBadge :tone="rowTone(row.statusTone)" :label="rowText(row.status)" />
      </template>
      <template #actions="{ row }">
        <UiButton
          variant="ghost"
          size="sm"
          data-testid="users-row-view"
          @click="emit('select', String(row.id))"
        >
          {{ viewLabel }}
        </UiButton>
      </template>
    </UiDataList>

    <div v-if="showFolio" class="users-table__pagefolio">
      <span data-testid="users-page-folio">
        <UiFolio :index="page" :total="pageCount" variant="count" />
      </span>
    </div>
  </div>
</template>

<style scoped>
.users-table {
  display: grid;
  gap: 12px;
}
.users-table__pagefolio {
  display: flex;
  justify-content: flex-end;
  color: var(--fg-3);
}
</style>
```

> Note: `rowTone(value: unknown)` / `rowText(value: unknown)` keep vue-tsc clean — `row.statusTone` / `row.status` (typed by `UiDataListRow`) are assignable to `unknown`, and the runtime `typeof` narrowing is unchanged. Keep `:rows="dataRows"` (no template cast), exactly like `DashboardMetricGroup.vue`. Pagination buttons are owned by `UiDataList` (they render only when `nextLabel`/`previousLabel` are set, testids `data-list-next` / `data-list-previous`); this component only re-emits intents — disabling at page bounds is the page's job.

4. [ ] Run it — expect **PASS**:
   `npm run test -- app/components/users/__tests__/UsersTable.spec.ts`

5. [ ] Refactor check (no behaviour change): confirm there are no hard-coded colours (tones flow through `UiStatusBadge`/tokens), no shadows, `--font-mono` is untouched (counts use `UiFolio`), and the component holds zero strings of its own — every label is a prop. Re-run the test to confirm still green.

6. [ ] Commit:
   `git add app/components/users/UsersTable.vue app/components/users/__tests__/UsersTable.spec.ts && git commit -m "$(printf 'feat(sso-admin-frontend): Swiss UsersTable (UiDataList + status badge + view action + folio)\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"`

**Deliverable:** presentational Swiss users table rendering status badges + per-row view action + folio pagination, all green.

**Task DoD (run from `services/sso-admin-frontend`; report any blocked command explicitly, never claim PASS for a command that did not run):**
`npm run typecheck && npm run lint && npm run format:check && npm run test -- app/components/users/__tests__/UsersTable.spec.ts`
(the full `test` / `build` / `test:e2e` service gate runs in Task 4.13.)

---

### Task 4.6: Users list page (all states, permission-gated, search/filter/pagination UI)

Replace the `app/pages/users/index.vue` stub body with the `dashboard.vue` all-states state machine: an **unconditional** hero (eyebrow / title / summary + masked principal + folio record count) so the SSR leak gate's positive assertions hold in every state, then one branch per `viewState` — `loading`→`UiSkeleton`, `forbidden`/`unauthenticated`/`error`→`UiStatusView` (inline `:standalone="false"`, redacted `:request-id`, refresh action on `error`), `empty`→`UiEmptyState`, `ready`→search `UiInput` + status `UiSelect` + `UsersTable`. A "New user" `UiButton` (named route `admin.users.create`) renders **only** when `hasPermission('admin.users.write')`. Row select navigates to the named route `admin.users.detail`. This is a **read-only list surface** — it contains no write/destructive action, so the privileged-action matrix does not apply here; it does hydrate user rows, so it carries the no-raw-PII/no-token SSR assertion. The page test mocks `useUsersList` + the session store + `navigateTo` so every state is deterministic.

**Files**
- Modify: `services/sso-admin-frontend/app/pages/users/index.vue`
- Modify: `services/sso-admin-frontend/app/locales/id.json`, `services/sso-admin-frontend/app/locales/en.json` (ADD only the genuinely-new keys below; `users.search_placeholder` + `users.label_search` ALREADY EXIST — reuse them, do not re-add)
- Test: `services/sso-admin-frontend/app/pages/__tests__/users-index.page.nuxt.spec.ts`
- (Unchanged, must stay green) `services/sso-admin-frontend/app/pages/__tests__/route-map.spec.ts` — asserts the meta `name`/`layout`/`permissions`/`requiresAdmin` by source string match.

**Interfaces**
- Consumes: `useUsersList` + `UseUsersListReturn` (4.4); `UsersTable` + `UsersTableRow` (4.5); `resolveUserStatusTone` (4.1); `USER_ACCOUNT_STATUSES` (4.1); `useSessionStore` (`principal.display_name`, `hasPermission`); `useI18n`; `UiSkeleton`/`UiStatusView`/`UiEmptyState`/`UiButton`/`UiInput`/`UiSelect` (+ `UiSelectOption`)/`UiFolio`; named routes `admin.users.create` + `admin.users.detail`; `navigateTo`/`useAsyncData` (Nuxt auto-imports).
- Produces: the rendered `/users` route (keeps `definePageMeta({ name: 'admin.users', layout: 'admin', requiresAdmin: true, permissions: ['admin.users.read'] })`). **No exported API.**
- New locale keys (BOTH `id` + `en`, inside the existing `"users"` block): `signed_in_as`, `filter_status`, `filter_all`, `col_view`, `status_active`, `status_locked`, `status_disabled`, `status_deactivated`, `page_next`, `page_previous`.

> Ordering note: `admin.users.detail` is created in Task 4.8. `experimental.typedPages` is **off** in `nuxt.config.ts`, so `navigateTo({ name: 'admin.users.detail', … })` is an untyped `RouteLocationRaw` — it typechecks and builds now and resolves once 4.8 lands. The page test mocks `navigateTo`, so no real navigation is attempted here.

**Steps**

1. [ ] Write the failing test `app/pages/__tests__/users-index.page.nuxt.spec.ts` (real behaviour, mocked at the data + store + navigation boundaries — `*.nuxt.spec.ts` routes to the `nuxt` env where `mountSuspended` + `mockNuxtImport` are available):

```ts
// *.nuxt.spec.ts → 'nuxt' env: mountSuspended drives the page's async setup
// (useAsyncData('admin-users-principal') + useI18n auto-imports). The list
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
import UsersTable from '@/components/users/UsersTable.vue'
import type { AdminUserListItem } from '@/types/users.types'
import type { UsersStatusFilter } from '@/lib/users/users-list'
import type { UsersViewState } from '@/lib/users/users-view-state'

// A masked sample row: government identifiers arrive pre-masked from the backend
// (bullet runs, NEVER the raw 16/18/10-digit value). It reads clearly as a sample.
const sampleUser: AdminUserListItem = {
  id: 1,
  subject_id: 'user-sub-0001',
  email: 'casey.operator@example.test',
  given_name: 'Casey',
  family_name: 'Operator',
  display_name: 'Casey Operator',
  role: 'admin',
  status: 'active',
  effective_status: 'active',
  disabled_at: null,
  disabled_reason: null,
  locked_at: null,
  locked_until: null,
  locked_reason: null,
  locked_by_subject_id: null,
  lock_count: 0,
  local_account_enabled: true,
  profile_synced_at: null,
  email_verified_at: null,
  last_login_at: null,
  created_at: null,
  nik: '••••••••••••3456',
  nip: null,
  nisn: null,
  birth_date: null,
  mfa_enrolled: false,
  mfa_methods: [],
  mfa_mandatory: false,
  roles: [],
  login_context: null,
}

const paged = ref<readonly AdminUserListItem[]>([])
const viewState = ref<UsersViewState>('loading')
const requestId = ref<string | null>(null)
const total = ref(0)
const filteredTotal = ref(0)
const page = ref(1)
const pageCount = ref(1)
const query = ref('')
const statusFilter = ref<UsersStatusFilter>('all')
const isStale = ref(false)
const refreshMock = vi.fn(async () => {})

vi.mock('@/composables/useUsersList', () => ({
  useUsersList: () => ({
    users: ref([]),
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
    ensureSession: vi.fn(async () => 'authenticated'),
    hasPermission: (permission: string) =>
      permission === 'admin.users.write' ? canWrite.value : true,
  }),
}))

const navigateMock = vi.fn()
mockNuxtImport('navigateTo', () => navigateMock)

const UsersIndex = (await import('../users/index.vue')).default

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

describe('users list page', () => {
  it('always renders the masked principal hero with no token/PII, regardless of state', async () => {
    const wrapper = await mountSuspended(UsersIndex)
    expect(wrapper.find('[data-page="users"]').exists()).toBe(true)
    const principal = wrapper.find('[data-principal-name]')
    expect(principal.exists()).toBe(true)
    expect(principal.text()).toContain('Admin Sentinel')
    expect(wrapper.html()).not.toMatch(/access_token|refresh_token|id_token|Bearer|SENTINEL-/)
  })

  it('loading → skeleton, no table', async () => {
    viewState.value = 'loading'
    const wrapper = await mountSuspended(UsersIndex)
    expect(wrapper.findComponent(UiSkeleton).exists()).toBe(true)
    expect(wrapper.findComponent(UsersTable).exists()).toBe(false)
  })

  it('forbidden → forbidden status view (distinct from empty)', async () => {
    viewState.value = 'forbidden'
    requestId.value = 'admin-req-DENIED42'
    const wrapper = await mountSuspended(UsersIndex)
    expect(wrapper.findComponent(UiStatusView).props('tone')).toBe('forbidden')
    expect(wrapper.findComponent(UiEmptyState).exists()).toBe(false)
    expect(wrapper.text()).not.toContain('admin-req-DENIED42')
  })

  it('unauthenticated → step_up status view', async () => {
    viewState.value = 'unauthenticated'
    const wrapper = await mountSuspended(UsersIndex)
    expect(wrapper.findComponent(UiStatusView).props('tone')).toBe('step_up')
  })

  it('error → error status view with a refresh action; raw request id redacted to REF-', async () => {
    viewState.value = 'error'
    requestId.value = 'admin-req-FAILED99'
    const wrapper = await mountSuspended(UsersIndex)
    expect(wrapper.findComponent(UiStatusView).props('tone')).toBe('error')
    expect(wrapper.text()).toContain('REF-')
    expect(wrapper.text()).not.toContain('admin-req-FAILED99')
    await wrapper.find('[data-test="users-refresh"]').trigger('click')
    expect(refreshMock).toHaveBeenCalledTimes(1)
  })

  it('empty → empty state, not a status view', async () => {
    viewState.value = 'empty'
    const wrapper = await mountSuspended(UsersIndex)
    expect(wrapper.findComponent(UiEmptyState).exists()).toBe(true)
    expect(wrapper.findComponent(UiStatusView).exists()).toBe(false)
  })

  it('ready → search input + status select + table with mapped rows, no raw PII', async () => {
    viewState.value = 'ready'
    paged.value = [sampleUser]
    total.value = 1
    filteredTotal.value = 1
    const wrapper = await mountSuspended(UsersIndex)
    expect(wrapper.findComponent(UiInput).exists()).toBe(true)
    expect(wrapper.findComponent(UiSelect).exists()).toBe(true)
    const table = wrapper.findComponent(UsersTable)
    expect(table.exists()).toBe(true)
    const rows = table.props('rows') as ReadonlyArray<{ id: string; displayName: string; statusTone: string }>
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ id: 'user-sub-0001', displayName: 'Casey Operator', statusTone: 'success' })
    // No token and no raw NIK(16)/NIP(18)/NISN(10) digit run leaks into the markup.
    expect(wrapper.html()).not.toMatch(/access_token|Bearer|SENTINEL-/)
    expect(wrapper.html()).not.toMatch(/\d{16}|\d{18}|\d{10}/)
  })

  it('status filter offers "all" + every account status', async () => {
    viewState.value = 'ready'
    paged.value = [sampleUser]
    total.value = 1
    filteredTotal.value = 1
    const wrapper = await mountSuspended(UsersIndex)
    const options = wrapper.findComponent(UiSelect).props('options') as ReadonlyArray<{ value: string }>
    expect(options.map((o) => o.value)).toEqual(['all', 'active', 'locked', 'disabled', 'deactivated'])
  })

  it('shows the New user link only with admin.users.write', async () => {
    viewState.value = 'ready'
    paged.value = [sampleUser]
    canWrite.value = true
    const allowed = await mountSuspended(UsersIndex)
    expect(allowed.find('[data-test="users-create"]').exists()).toBe(true)
    canWrite.value = false
    const denied = await mountSuspended(UsersIndex)
    expect(denied.find('[data-test="users-create"]').exists()).toBe(false)
  })

  it('row select navigates to the named detail route with the subject id', async () => {
    viewState.value = 'ready'
    paged.value = [sampleUser]
    total.value = 1
    filteredTotal.value = 1
    const wrapper = await mountSuspended(UsersIndex)
    wrapper.findComponent(UsersTable).vm.$emit('select', 'user-sub-0001')
    expect(navigateMock).toHaveBeenCalledWith({
      name: 'admin.users.detail',
      params: { subjectId: 'user-sub-0001' },
    })
  })
})
```

2. [ ] Run it — expect **FAIL** (the stub renders only `<h1>Users</h1>`: no `[data-page="users"]`, no skeleton/status-view/empty-state/table, no select/create):
   `cd services/sso-admin-frontend && npm run test -- app/pages/__tests__/users-index.page.nuxt.spec.ts`

3. [ ] Add the new i18n keys. In `app/locales/id.json` inside the existing `"users"` block add:

```json
"signed_in_as": "Masuk sebagai {name}",
"filter_status": "Saring status",
"filter_all": "Semua status",
"col_view": "Lihat",
"status_active": "Aktif",
"status_locked": "Terkunci",
"status_disabled": "Dinonaktifkan",
"status_deactivated": "Deaktivasi",
"page_next": "Berikutnya",
"page_previous": "Sebelumnya"
```

   In `app/locales/en.json` inside the existing `"users"` block add:

```json
"signed_in_as": "Signed in as {name}",
"filter_status": "Filter status",
"filter_all": "All statuses",
"col_view": "View",
"status_active": "Active",
"status_locked": "Locked",
"status_disabled": "Disabled",
"status_deactivated": "Deactivated",
"page_next": "Next",
"page_previous": "Previous"
```

4. [ ] Implement `app/pages/users/index.vue` (FULL replacement):

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { AlertTriangle } from 'lucide-vue-next'
import { useSessionStore } from '@/stores/session.store'
import { useI18n } from '@/composables/useI18n'
import { useUsersList } from '@/composables/useUsersList'
import { resolveUserStatusTone } from '@/lib/users/users-view-state'
import { USER_ACCOUNT_STATUSES } from '@/types/users.types'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiSelect, { type UiSelectOption } from '@/components/ui/UiSelect.vue'
import UiFolio from '@/components/ui/UiFolio.vue'
import UsersTable, { type UsersTableRow } from '@/components/users/UsersTable.vue'

definePageMeta({
  name: 'admin.users',
  layout: 'admin',
  requiresAdmin: true,
  permissions: ['admin.users.read'],
})

const { t } = useI18n()

// SAFE HYDRATION: resolve the masked principal server-side (display name, role,
// capability flags only). OIDC tokens + raw government PII stay in Nitro
// event.context and are never written to useState / __NUXT__.
const store = useSessionStore()
await useAsyncData('admin-users-principal', () => store.ensureSession())

// SAFE DATA: the list is fetched through the usersApi service (no direct fetch in
// the page) and arrives as masked DTOs only. Search/filter/pagination are derived
// client-side over the hydrated list (the backend exposes no query params).
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
} = useUsersList()

const canCreate = computed<boolean>(() => store.hasPermission('admin.users.write'))

function statusLabel(status: string): string {
  const path = `users.status_${status}`
  const translated = t(path)
  return translated === path ? status : translated
}

const statusOptions = computed<readonly UiSelectOption[]>(() => [
  { value: 'all', label: t('users.filter_all') },
  ...USER_ACCOUNT_STATUSES.map((status) => ({ value: status, label: statusLabel(status) })),
])

const tableRows = computed<readonly UsersTableRow[]>(() =>
  paged.value.map((user) => ({
    id: user.subject_id,
    displayName: user.display_name ?? user.email,
    email: user.email,
    role: user.role ?? '—',
    status: statusLabel(user.effective_status),
    statusTone: resolveUserStatusTone(user.effective_status),
  })),
)

function onSelect(subjectId: string): void {
  void navigateTo({ name: 'admin.users.detail', params: { subjectId } })
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
  <section class="users" data-page="users">
    <header class="users__hero">
      <span class="users__eyebrow">{{ t('users.eyebrow') }}</span>
      <div class="users__heading">
        <div class="users__heading-text">
          <h1 class="users__title">{{ t('users.title') }}</h1>
          <p class="users__summary">{{ t('users.summary') }}</p>
          <p class="users__principal" data-principal-name>
            {{ t('users.signed_in_as', { name: store.principal?.display_name ?? '—' }) }}
          </p>
        </div>
        <NuxtLink
          v-if="canCreate"
          :to="{ name: 'admin.users.create' }"
          class="users__create"
          data-test="users-create"
        >
          <UiButton variant="primary" size="sm">{{ t('users.btn_create_user') }}</UiButton>
        </NuxtLink>
      </div>
      <dl v-if="total > 0" class="users__evidence">
        <dt>{{ t('users.title') }}</dt>
        <dd><UiFolio :index="filteredTotal" :total="total" /></dd>
      </dl>
    </header>

    <UiSkeleton v-if="viewState === 'loading'" :rows="6" :label="t('users.loading')" />

    <UiStatusView
      v-else-if="viewState === 'forbidden'"
      tone="forbidden"
      :eyebrow="t('users.eyebrow')"
      :title="t('users.forbidden_title')"
      :description="t('common.forbidden_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="viewState === 'unauthenticated'"
      tone="step_up"
      :eyebrow="t('users.eyebrow')"
      :title="t('common.session_expired_title')"
      :description="t('common.session_expired_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="viewState === 'error'"
      tone="error"
      :eyebrow="t('users.eyebrow')"
      :title="t('users.error_title')"
      :description="t('common.error_loading_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    >
      <template #actions>
        <UiButton variant="secondary" size="sm" data-test="users-refresh" @click="onRefresh">
          {{ t('common.btn_refresh') }}
        </UiButton>
      </template>
    </UiStatusView>

    <UiEmptyState
      v-else-if="viewState === 'empty'"
      :title="t('users.empty_title')"
      :description="t('users.empty_desc')"
    >
      <template #action>
        <UiButton variant="secondary" size="sm" @click="onRefresh">
          {{ t('common.btn_refresh') }}
        </UiButton>
      </template>
    </UiEmptyState>

    <template v-else>
      <div v-if="isStale" class="users__banner" role="status">
        <AlertTriangle :size="16" aria-hidden="true" />
        <span>{{ t('common.error_loading_desc') }}</span>
      </div>

      <div class="users__controls">
        <UiInput
          v-model="query"
          class="users__search"
          :placeholder="t('users.search_placeholder')"
          :aria-label="t('users.label_search')"
        />
        <UiSelect
          v-model="statusFilter"
          class="users__filter"
          :options="statusOptions"
          :aria-label="t('users.filter_status')"
        />
      </div>

      <UsersTable
        :caption="t('users.title')"
        :user-label="t('users.col_user')"
        :email-label="t('users.col_email')"
        :role-label="t('users.label_role')"
        :status-label="t('users.col_status')"
        :view-label="t('users.col_view')"
        :rows="tableRows"
        :total="filteredTotal"
        :page="page"
        :page-count="pageCount"
        :next-label="t('users.page_next')"
        :previous-label="t('users.page_previous')"
        @select="onSelect"
        @next="onNext"
        @previous="onPrevious"
      />
    </template>
  </section>
</template>

<style scoped>
.users {
  display: grid;
  gap: 24px;
  padding: 24px;
}
.users__hero {
  display: grid;
  gap: 6px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border);
}
.users__eyebrow {
  font: 600 0.6875rem/1 var(--font-sans);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.users__heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.users__heading-text {
  display: grid;
  gap: 6px;
}
.users__title {
  margin: 0;
  font: 600 1.5rem/1.2 var(--font-sans);
  letter-spacing: -0.02em;
  color: var(--fg);
}
.users__summary {
  margin: 0;
  max-width: 64ch;
  font: 400 0.875rem/1.6 var(--font-sans);
  color: var(--fg-2);
}
.users__principal {
  margin: 0;
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--fg-2);
}
.users__create {
  flex: none;
  text-decoration: none;
}
.users__evidence {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 4px 0 0;
}
.users__evidence dt {
  font: 600 0.625rem/1 var(--font-sans);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.users__evidence dd {
  margin: 0;
}
.users__banner {
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
.users__controls {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.users__search {
  flex: 1 1 280px;
}
.users__filter {
  flex: 0 1 220px;
}
</style>
```

5. [ ] Run the page test + the route-map guard test — expect **PASS** for both:
   `cd services/sso-admin-frontend && npm run test -- app/pages/__tests__/users-index.page.nuxt.spec.ts app/pages/__tests__/route-map.spec.ts`

6. [ ] Refactor pass (keep tests green): confirm no hard-coded colours (tokens only), no shadows, the single accent stays on the create `UiButton`, `#E4002B` is NOT introduced (this list has no destructive affordance), status renders via `UsersTable`'s `UiStatusBadge` (tone + label, never colour-alone), and counts render via `UiFolio`. Re-run step 5 after any change.

7. [ ] Commit:
   `cd services/sso-admin-frontend && git add app/pages/users/index.vue app/locales/id.json app/locales/en.json app/pages/__tests__/users-index.page.nuxt.spec.ts && git commit -m "$(printf 'feat(sso-admin-frontend): compose Swiss users list page (all states, permission-gated)\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"`

**Deliverable:** Swiss list page with all five states + search/filter/pagination + permission-gated create link + masked-row hydration, all green.

**Task-scoped DoD (run from `services/sso-admin-frontend`; report any blocked command explicitly, never claim PASS for a command that did not run):**
`npm run typecheck && npm run lint && npm run format:check && npm run test -- app/pages/__tests__/users-index.page.nuxt.spec.ts app/pages/__tests__/route-map.spec.ts`

---

### Task 4.7: useUserDetail composable (SSR detail boundary)

The SSR data boundary for one user: wrap `usersApi.show(subjectId)` in `useAsyncData` under a per-subject key, expose `user`/`loginContext`/`sessions`, the mapped `UserDetailViewState` (404 → `not_found`), the redacted request id, and an explicit `refresh()` the action surfaces call after every mutation. This is the read seam the detail page (4.8) and the lifecycle/role actions (4.11–4.12) compose against — it resolves server-side so the masked detail DTO hydrates into `__NUXT_DATA__` and the Bearer token never leaves Nitro's `event.context`. Mirrors `useDashboardSummary.ts` exactly (stable key · service call · `toRaw` · error-first view-state · `requestId` via `ApiError.requestId ?? getLastRequestId()`). Tested in `*.nuxt.spec.ts` with `useAsyncData` mocked at the boundary (`mockNuxtImport`).

**Files**
- Create: `app/composables/useUserDetail.ts`
- Test: `app/composables/__tests__/useUserDetail.nuxt.spec.ts`

**Interfaces**
- Produces:
  - `type UseUserDetailReturn = { readonly user: ComputedRef<AdminUserDetail | null>; readonly loginContext: ComputedRef<LoginContext | null>; readonly sessions: ComputedRef<readonly UserSession[]>; readonly viewState: ComputedRef<UserDetailViewState>; readonly requestId: ComputedRef<string | null>; readonly refresh: () => Promise<void> }`
  - `function useUserDetail(subjectId: MaybeRefOrGetter<string>): UseUserDetailReturn`
- Consumes: `useAsyncData<UserDetailResponse>('admin-user-detail:' + id, () => usersApi.show(id))` (stable per-subject key); `usersApi` (4.3); `UserDetailResponse`, `AdminUserDetail`, `LoginContext`, `UserSession`, `UserDetailViewState`, `resolveUserDetailViewState` (4.1); `ApiError`, `getLastRequestId` (`@/lib/api/api-client`).

**Steps**

1. [ ] Write the failing test `app/composables/__tests__/useUserDetail.nuxt.spec.ts` (real behavior — stable key, service wiring, all view-state branches incl. `not_found`, redacted request id, refresh delegation, and a pass-through-masking assertion so this read boundary never unmasks/reshapes PII):

```ts
// *.nuxt.spec.ts → routed to the 'nuxt' env where mockNuxtImport is available.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { ApiError } from '@/lib/api/api-client'
import { usersApi } from '@/services/users.api'
import { useUserDetail } from '../useUserDetail'
import type { UserDetailResponse } from '@/types/users.types'

vi.mock('@/services/users.api', () => ({
  usersApi: { show: vi.fn<(id: string) => Promise<UserDetailResponse>>() },
}))

// Controllable useAsyncData stand-in: the test mutates data/pending/error and
// asserts the composable's derived state. Captures the key + handler so we can
// prove the composable wires the service under the per-subject key.
const data = ref<UserDetailResponse | null>(null)
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

// Detail DTO as the backend returns it: government identifiers already MASKED,
// session id is a raw technical value the page (not this composable) masks.
const ready: UserDetailResponse = {
  user: {
    id: 7,
    subject_id: 'usr_sample_7',
    email: 'sample.operator@example.test',
    given_name: 'Sample',
    family_name: 'Operator',
    display_name: 'Sample Operator',
    role: 'user',
    status: 'active',
    effective_status: 'active',
    disabled_at: null,
    disabled_reason: null,
    locked_at: null,
    locked_until: null,
    locked_reason: null,
    locked_by_subject_id: null,
    lock_count: 0,
    local_account_enabled: true,
    profile_synced_at: null,
    email_verified_at: '2026-01-02T00:00:00Z',
    last_login_at: '2026-06-20T08:00:00Z',
    created_at: '2025-12-01T00:00:00Z',
    nik: '32********7654',
    nip: '1990********003',
    nisn: '00****8421',
    birth_date: '1990-**-**',
    mfa_enrolled: true,
    mfa_methods: ['totp'],
    mfa_mandatory: false,
    roles: [{ slug: 'user', name: 'User', is_system: true }],
  },
  login_context: { ip_address: '203.0.113.7', mfa_required: false, last_seen_at: '2026-06-27T09:00:00Z' },
  sessions: [
    { id: 'sess_raw_abcdef0123456789', ip_address: '203.0.113.7', user_agent: 'Sample/1.0', last_seen_at: '2026-06-27T09:00:00Z', created_at: '2026-06-20T08:00:00Z' },
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

describe('useUserDetail', () => {
  it('wires the service under a stable per-subject asyncData key', () => {
    useUserDetail('usr_sample_7')
    expect(capturedKey).toBe('admin-user-detail:usr_sample_7')
    capturedHandler?.()
    expect(usersApi.show).toHaveBeenCalledWith('usr_sample_7')
  })

  it('keys distinctly per subject id', () => {
    useUserDetail('usr_a')
    expect(capturedKey).toBe('admin-user-detail:usr_a')
    useUserDetail('usr_b')
    expect(capturedKey).toBe('admin-user-detail:usr_b')
  })

  it('accepts a getter for the subject id', () => {
    useUserDetail(() => 'usr_from_getter')
    expect(capturedKey).toBe('admin-user-detail:usr_from_getter')
    capturedHandler?.()
    expect(usersApi.show).toHaveBeenCalledWith('usr_from_getter')
  })

  it('exposes user, login context and sessions from the ready response', () => {
    data.value = ready
    const detail = useUserDetail('usr_sample_7')
    expect(detail.viewState.value).toBe('ready')
    expect(detail.user.value).toEqual(ready.user)
    expect(detail.loginContext.value).toEqual(ready.login_context)
    expect(detail.sessions.value).toEqual(ready.sessions)
  })

  it('returns null user / null context / empty sessions before data resolves (loading)', () => {
    const detail = useUserDetail('usr_sample_7')
    expect(detail.viewState.value).toBe('loading')
    expect(detail.user.value).toBeNull()
    expect(detail.loginContext.value).toBeNull()
    expect(detail.sessions.value).toEqual([])
  })

  it('maps a first-load 404 to not_found', () => {
    error.value = new ApiError(404, 'not found')
    expect(useUserDetail('usr_missing').viewState.value).toBe('not_found')
  })

  it('maps a first-load 403 to forbidden and exposes the redacted request id', () => {
    error.value = new ApiError(403, 'forbidden', 'forbidden', null, 'admin-req-DENIED42')
    const detail = useUserDetail('usr_sample_7')
    expect(detail.viewState.value).toBe('forbidden')
    expect(detail.requestId.value).toBe('admin-req-DENIED42')
  })

  it('maps a first-load 401 to unauthenticated', () => {
    error.value = new ApiError(401, 'no session')
    expect(useUserDetail('usr_sample_7').viewState.value).toBe('unauthenticated')
  })

  it('passes government identifiers through exactly as masked by the backend (no unmask/reshape)', () => {
    data.value = ready
    const u = useUserDetail('usr_sample_7').user.value
    // This boundary is display-only: it must surface the backend's masked values
    // verbatim and never derive a raw 16/18/10-digit identifier of its own.
    expect(u?.nik).toBe('32********7654')
    expect(u?.nip).toBe('1990********003')
    expect(u?.nisn).toBe('00****8421')
    expect(/^\d{16}$/.test(u?.nik ?? '')).toBe(false)
    expect(/^\d{18}$/.test(u?.nip ?? '')).toBe(false)
    expect(/^\d{10}$/.test(u?.nisn ?? '')).toBe(false)
  })

  it('refresh() delegates to the underlying asyncData refresh', async () => {
    await useUserDetail('usr_sample_7').refresh()
    expect(refreshMock).toHaveBeenCalledTimes(1)
  })
})
```

2. [ ] Run it — expect **FAIL** (module missing): the file `app/composables/useUserDetail.ts` does not exist yet, so the import throws and every test errors.

```
npm run test -- app/composables/__tests__/useUserDetail.nuxt.spec.ts
```
Expected: `Error: Failed to load url @/composables/useUserDetail` (or `Cannot find module '../useUserDetail'`); suite reports failed, 0 passed.

3. [ ] Write the minimal implementation `app/composables/useUserDetail.ts` (verbatim mirror of `useDashboardSummary.ts` — stable key, service call, `toRaw`, error-first view-state, redacted request id):

```ts
import { computed, toRaw, toValue, type ComputedRef, type MaybeRefOrGetter } from 'vue'
import { ApiError, getLastRequestId } from '@/lib/api/api-client'
import { usersApi } from '@/services/users.api'
import {
  resolveUserDetailViewState,
  type UserDetailViewState,
} from '@/lib/users/users-view-state'
import type {
  AdminUserDetail,
  LoginContext,
  UserDetailResponse,
  UserSession,
} from '@/types/users.types'

export type UseUserDetailReturn = {
  readonly user: ComputedRef<AdminUserDetail | null>
  readonly loginContext: ComputedRef<LoginContext | null>
  readonly sessions: ComputedRef<readonly UserSession[]>
  readonly viewState: ComputedRef<UserDetailViewState>
  readonly requestId: ComputedRef<string | null>
  readonly refresh: () => Promise<void>
}

export function useUserDetail(subjectId: MaybeRefOrGetter<string>): UseUserDetailReturn {
  // ponytail: the id is resolved once at setup. Nuxt re-runs page setup on a
  // route-param change (navigating /users/A → /users/B remounts), so a static
  // per-subject key is correct; make it reactive only if same-component id swaps
  // ever appear.
  const id = toValue(subjectId)

  // Runs during SSR so the masked detail DTO resolves server-side and hydrates
  // into the payload (already-masked PII + raw session id the page masks). The
  // Bearer token stays in Nitro event.context and never reaches window.__NUXT__.
  const { data, pending, error, refresh } = useAsyncData<UserDetailResponse>(
    'admin-user-detail:' + id,
    () => usersApi.show(id),
  )

  // toRaw: the masked DTO is display-only; callers receive plain objects so
  // identity comparisons and toRaw-based deep picks behave as expected.
  const user = computed<AdminUserDetail | null>(() =>
    data.value != null ? toRaw(data.value.user) : null,
  )

  const loginContext = computed<LoginContext | null>(() =>
    data.value != null ? (data.value.login_context ?? null) : null,
  )

  const sessions = computed<readonly UserSession[]>(() => data.value?.sessions ?? [])

  const viewState = computed<UserDetailViewState>(() =>
    resolveUserDetailViewState({
      pending: pending.value,
      error: error.value,
      user: user.value,
    }),
  )

  const requestId = computed<string | null>(() =>
    error.value instanceof ApiError
      ? (error.value.requestId ?? getLastRequestId())
      : getLastRequestId(),
  )

  return {
    user,
    loginContext,
    sessions,
    viewState,
    requestId,
    refresh: async () => {
      await refresh()
    },
  }
}
```

4. [ ] Run it — expect **PASS**: all 11 tests green.

```
npm run test -- app/composables/__tests__/useUserDetail.nuxt.spec.ts
```
Expected: `Test Files  1 passed (1)` · `Tests  11 passed (11)`.

5. [ ] Refactor check (no behavior change): confirm zero drift from the `useDashboardSummary.ts` shape (same import set, same `ApiError.requestId ?? getLastRequestId()` fallback, no extra abstraction), and that `app/lib/users/users-view-state.ts` already exports `resolveUserDetailViewState` (4.1) — no new view-state logic introduced here. No edits expected; if any, re-run step 4 and keep it green.

6. [ ] Commit (green only):

```
git add app/composables/useUserDetail.ts app/composables/__tests__/useUserDetail.nuxt.spec.ts
git commit -m "feat(sso-admin-frontend): useUserDetail SSR detail composable

Wrap usersApi.show in useAsyncData under a stable per-subject key
(admin-user-detail:<id>); expose masked user, login context and
read-only sessions, the 404-aware detail view-state, the redacted
request id, and an explicit refresh the action surfaces call after
every mutation. Mirrors useDashboardSummary; tested with useAsyncData
mocked at the boundary.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

**Deliverable:** SSR detail composable exposing user/login-context/sessions + view-state + refresh, all green.

**Task-scoped DoD (run from `services/sso-admin-frontend`):**
`npm run test -- app/composables/__tests__/useUserDetail.nuxt.spec.ts` green, then the file-scoped gate `npm run typecheck && npm run lint && npm run format:check` passes (full `npm run test && npm run build && npm run test:e2e` runs at the phase gate, Task 4.13).

---

### Task 4.8: User detail page (read-only: masked PII, roles, sessions, security/MFA)

Create the deep-linkable detail route `app/pages/users/[subjectId].vue` as a **read-only** surface first (lifecycle/role actions are wired in 4.11–4.12). Mirror the `dashboard.vue` state machine: the hero renders **unconditionally** (so the SSR leak gate's positive assertions — `data-page="user-detail"`, the masked principal, the safe back link — always hold), then exactly one branch per `UserDetailViewState`, including a **dedicated `not_found` surface** distinct from `forbidden`/`error`. The `ready` body composes three panels: an **overview** (display name, the target user's email rendered plainly — an intentionally-shown operator field, not masked — masked `nik`/`nip`/`nisn`/`birth_date` via `formatMaskedIdentifier`, `local_account_enabled`, and timestamps as `UiFolio`), a **security/MFA panel** (`mfa_enrolled`, `mfa_methods`, `mfa_mandatory`, plus `login_context.mfa_required`/`ip_address`/`last_seen_at`), and a **read-only sessions `UiDataList`** whose session ids render masked via `formatTechnicalPreview` (the raw id never reaches the rendered tree — the row key is a synthetic index, never the raw sid), with the user's roles rendered as `UiStatusBadge`s. The account status badge tone comes from `resolveUserStatusTone(effective_status)`. The page reaches data only through `useUserDetail` (no direct `fetch`/`$fetch`); the page test mocks `useUserDetail` + the session store so every state is deterministic.

**Files**
- Create: `app/pages/users/[subjectId].vue`
- Modify: `app/locales/id.json`, `app/locales/en.json` (ADD only genuinely-new keys — see step 3; `users.tab_overview`/`tab_security`/`tab_sessions`/`mfa_required`/`signed_in_as`/`label_email`/`label_display_name`/`label_role`/`local_account`/`email_verified`/`last_login`/`last_synced`/`ip_address`/`group_account_status`/`sessions_title`/`no_sessions`/`enabled`/`disabled`/`yes`/`no`/`status_unknown` ALREADY EXIST at id↔en parity and are reused, NOT re-added)
- Test: `app/pages/__tests__/users-detail.page.nuxt.spec.ts`
- Modify: `app/pages/__tests__/route-map.spec.ts` (add the `admin.users.detail` row to its enumerated `domainPages` list so the new page's meta is asserted)

**Interfaces**
- Consumes: `useUserDetail` (4.7) → `{ user, loginContext, sessions, viewState, requestId, refresh }`; `useSessionStore` (`principal.display_name`, `hasPermission`); `resolveUserStatusTone` (4.1); `formatMaskedIdentifier` (4.2); `formatTechnicalPreview` (`@/lib/display-identifiers`); `useI18n`; `UiSkeleton`/`UiStatusView`/`UiEmptyState`/`UiStatusBadge`/`UiDataList` (+ `UiDataListColumn`/`UiDataListRow`)/`UiFolio`/`UiButton`; `useRoute` → `route.params.subjectId`; `navigateTo` + named route `admin.users`.
- Produces: the rendered `/users/[subjectId]` route with `definePageMeta({ name: 'admin.users.detail', layout: 'admin', requiresAdmin: true, permissions: ['admin.users.read'] })`. New `users.*` locale keys (step 3). **No exported API.**

**Steps**

1. [ ] Write the failing test `app/pages/__tests__/users-detail.page.nuxt.spec.ts`:

```ts
// *.nuxt.spec.ts → 'nuxt' env: mountSuspended drives the page's async setup
// (useRoute + useI18n + definePageMeta auto-imports). Data boundary + session
// store are mocked so each UserDetailViewState is deterministic.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import UiDataList from '@/components/ui/UiDataList.vue'
import type { AdminUserDetail, LoginContext, UserSession } from '@/types/users.types'
import type { UserDetailViewState } from '@/lib/users/users-view-state'

const user = ref<AdminUserDetail | null>(null)
const loginContext = ref<LoginContext | null>(null)
const sessions = ref<readonly UserSession[]>([])
const viewState = ref<UserDetailViewState>('loading')
const requestId = ref<string | null>(null)
const refreshMock = vi.fn(async () => {})

vi.mock('@/composables/useUserDetail', () => ({
  useUserDetail: () => ({ user, loginContext, sessions, viewState, requestId, refresh: refreshMock }),
}))

vi.mock('@/stores/session.store', () => ({
  useSessionStore: () => ({
    principal: { display_name: 'Admin Sentinel' },
    hasPermission: () => true,
  }),
}))

// A raw session id that MUST NOT survive into the rendered tree — the page keys
// rows by index and renders formatTechnicalPreview(id) only.
const RAW_SID = 'session-raw-id-DO-NOT-LEAK-abcdef0123456789'

// PII arrives ALREADY MASKED from the backend (GovernmentIdentifier masking).
// Government identifiers are masked by the backend; formatMaskedIdentifier passes them through —
// no raw 16/18/10-digit run exists. Email is an intentionally-shown operator field (rendered verbatim).
const READY_USER: AdminUserDetail = {
  id: 42,
  subject_id: 'usr_2f9a',
  email: 'target.operator@example.gov',
  given_name: 'Admin',
  family_name: 'Sample',
  display_name: 'Admin Sample',
  role: 'admin',
  status: 'active',
  effective_status: 'active',
  disabled_at: null,
  disabled_reason: null,
  locked_at: null,
  locked_until: null,
  locked_reason: null,
  locked_by_subject_id: null,
  lock_count: 0,
  local_account_enabled: true,
  profile_synced_at: '2026-06-20T10:00:00Z',
  email_verified_at: '2026-06-01T08:00:00Z',
  last_login_at: '2026-06-27T09:15:00Z',
  created_at: '2026-01-10T00:00:00Z',
  nik: '32••••••••••0001',
  nip: '1980••••••••••0002',
  nisn: '00••••0003',
  birth_date: '1980-••-••',
  mfa_enrolled: true,
  mfa_methods: ['totp'],
  mfa_mandatory: false,
  roles: [{ slug: 'admin', name: 'Administrator', is_system: true }],
}
const LOGIN: LoginContext = {
  ip_address: '203.0.113.7',
  mfa_required: true,
  last_seen_at: '2026-06-27T09:15:00Z',
}
const SESSIONS: readonly UserSession[] = [
  {
    id: RAW_SID,
    ip_address: '203.0.113.7',
    user_agent: 'Mozilla/5.0',
    last_seen_at: '2026-06-27T09:15:00Z',
    created_at: '2026-06-26T00:00:00Z',
  },
]

const UserDetail = (await import('../users/[subjectId].vue')).default

beforeEach(() => {
  user.value = null
  loginContext.value = null
  sessions.value = []
  viewState.value = 'loading'
  requestId.value = null
  vi.clearAllMocks()
})
afterEach(() => vi.clearAllMocks())

describe('user detail page', () => {
  it('always renders the masked principal in the hero with no token/PII', async () => {
    const wrapper = await mountSuspended(UserDetail)
    const principal = wrapper.find('[data-principal-name]')
    expect(principal.exists()).toBe(true)
    expect(principal.text()).toContain('Admin Sentinel')
    expect(wrapper.find('[data-page="user-detail"]').exists()).toBe(true)
    expect(wrapper.html()).not.toMatch(/access_token|refresh_token|id_token|Bearer|SENTINEL-/)
  })

  it('loading → skeleton, no overview panel', async () => {
    viewState.value = 'loading'
    const wrapper = await mountSuspended(UserDetail)
    expect(wrapper.findComponent(UiSkeleton).exists()).toBe(true)
    expect(wrapper.find('[data-panel="overview"]').exists()).toBe(false)
  })

  it('forbidden → forbidden status view (no-permission), distinct from not_found', async () => {
    viewState.value = 'forbidden'
    requestId.value = 'admin-req-DENIED42'
    const wrapper = await mountSuspended(UserDetail)
    expect(wrapper.findComponent(UiStatusView).props('tone')).toBe('forbidden')
    expect(wrapper.findComponent(UiEmptyState).exists()).toBe(false)
    expect(wrapper.text()).not.toMatch(/SQLSTATE|stack trace|Bearer/i)
  })

  it('unauthenticated → step_up status view', async () => {
    viewState.value = 'unauthenticated'
    const wrapper = await mountSuspended(UserDetail)
    expect(wrapper.findComponent(UiStatusView).props('tone')).toBe('step_up')
  })

  it('not_found → dedicated empty surface, not a status view', async () => {
    viewState.value = 'not_found'
    const wrapper = await mountSuspended(UserDetail)
    expect(wrapper.findComponent(UiEmptyState).exists()).toBe(true)
    expect(wrapper.findComponent(UiStatusView).exists()).toBe(false)
    expect(wrapper.text()).toContain('User not found')
  })

  it('error → error status view; raw request id is redacted to REF-XXXXXXXX', async () => {
    viewState.value = 'error'
    requestId.value = 'admin-req-FAILED99'
    const wrapper = await mountSuspended(UserDetail)
    expect(wrapper.findComponent(UiStatusView).props('tone')).toBe('error')
    expect(wrapper.text()).toContain('REF-')
    expect(wrapper.text()).not.toContain('admin-req-FAILED99')
  })

  it('ready → overview with masked PII, status badge tone, no raw PII/token', async () => {
    viewState.value = 'ready'
    user.value = READY_USER
    loginContext.value = LOGIN
    sessions.value = SESSIONS
    const wrapper = await mountSuspended(UserDetail)

    expect(wrapper.find('[data-panel="overview"]').exists()).toBe(true)
    // Email renders verbatim (intentionally-shown operator field); government identifiers render masked.
    expect(wrapper.text()).toContain('target.operator@example.gov')
    expect(wrapper.text()).toContain('32••••••••••0001')
    // Account status as a tone+label badge (never colour-alone): active → success.
    const tones = wrapper.findAllComponents(UiStatusBadge).map((b) => b.props('tone'))
    expect(tones).toContain('success')
    // Roles rendered as badges (label present).
    expect(wrapper.text()).toContain('Administrator')
    // No raw secret/token and no raw PII digit-shapes leak into the HTML.
    const html = wrapper.html()
    expect(html).not.toMatch(/access_token|refresh_token|id_token|Bearer|SENTINEL-/)
    expect(html).not.toMatch(/\d{16}/) // raw NIK shape
    expect(html).not.toMatch(/\d{18}/) // raw NIP shape
    expect(html).not.toMatch(/\d{10}/) // raw NISN shape
  })

  it('ready → security/MFA panel surfaces enrolment + login context', async () => {
    viewState.value = 'ready'
    user.value = READY_USER
    loginContext.value = LOGIN
    const wrapper = await mountSuspended(UserDetail)
    const security = wrapper.find('[data-panel="security"]')
    expect(security.exists()).toBe(true)
    expect(security.text()).toContain('MFA enrolled')
    expect(security.text()).toContain('totp')
    expect(security.text()).toContain('203.0.113.7') // login_context ip
  })

  it('ready → sessions list is read-only and masks the raw session id', async () => {
    viewState.value = 'ready'
    user.value = READY_USER
    loginContext.value = LOGIN
    sessions.value = SESSIONS
    const wrapper = await mountSuspended(UserDetail)
    expect(wrapper.findComponent(UiDataList).exists()).toBe(true)
    const html = wrapper.html()
    expect(html).toContain('REF-') // formatTechnicalPreview masked id
    expect(html).not.toContain(RAW_SID) // raw session id never rendered
    // No terminate/revoke control on this read-only surface (added in 4.11).
    expect(wrapper.text()).not.toMatch(/revoke|terminate/i)
  })
})
```

2. [ ] Run it — expect **FAIL** (`../users/[subjectId].vue` does not exist → import/resolution error):
   `npm run test -- app/pages/__tests__/users-detail.page.nuxt.spec.ts`

3. [ ] Add the new i18n keys. Existing `users.*` keys (`tab_overview`/`tab_security`/`tab_sessions`/`mfa_required`/`signed_in_as`/`label_email`/`label_display_name`/`label_role`/`local_account`/`email_verified`/`last_login`/`last_synced`/`ip_address`/`group_account_status`/`sessions_title`/`no_sessions`/`enabled`/`disabled`/`yes`/`no`/`status_unknown`) are **reused** — do **not** re-add them. In `app/locales/id.json` inside the existing `"users"` block add ONLY:

```json
"not_found_title": "Pengguna tidak ditemukan",
"not_found_desc": "Akun untuk tautan ini tidak ada atau telah dihapus.",
"field_nik": "NIK",
"field_nip": "NIP",
"field_nisn": "NISN",
"field_birth_date": "Tanggal lahir",
"mfa_enrolled": "MFA terdaftar",
"mfa_methods": "Metode MFA",
"login_ip": "IP login terakhir",
"last_seen": "Terakhir aktif",
"overview_title": "Ringkasan akun",
"security_title": "Keamanan & MFA",
"roles_title": "Peran",
"col_session": "Sesi",
"btn_back": "Kembali ke daftar"
```

   In `app/locales/en.json` inside the existing `"users"` block add ONLY (parity — same keys):

```json
"not_found_title": "User not found",
"not_found_desc": "The account for this link does not exist or has been removed.",
"field_nik": "NIK",
"field_nip": "NIP",
"field_nisn": "NISN",
"field_birth_date": "Birth date",
"mfa_enrolled": "MFA enrolled",
"mfa_methods": "MFA methods",
"login_ip": "Last login IP",
"last_seen": "Last seen",
"overview_title": "Account overview",
"security_title": "Security & MFA",
"roles_title": "Roles",
"col_session": "Session",
"btn_back": "Back to list"
```

4. [ ] Add the `admin.users.detail` row to `app/pages/__tests__/route-map.spec.ts` so the new page's meta is asserted by the existing route-map guard. In the `domainPages` array, after the `users/new.vue` entry, add:

```ts
  {
    file: 'users/[subjectId].vue',
    name: 'admin.users.detail',
    permissions: ['admin.users.read'],
  },
```

5. [ ] Implement `app/pages/users/[subjectId].vue` (FULL code):

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useSessionStore } from '@/stores/session.store'
import { useI18n } from '@/composables/useI18n'
import { useUserDetail } from '@/composables/useUserDetail'
import { resolveUserStatusTone } from '@/lib/users/users-view-state'
import { formatMaskedIdentifier } from '@/lib/users/user-identifiers'
import { formatTechnicalPreview } from '@/lib/display-identifiers'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import UiDataList, {
  type UiDataListColumn,
  type UiDataListRow,
} from '@/components/ui/UiDataList.vue'
import UiFolio from '@/components/ui/UiFolio.vue'
import UiButton from '@/components/ui/UiButton.vue'

definePageMeta({
  name: 'admin.users.detail',
  layout: 'admin',
  requiresAdmin: true,
  permissions: ['admin.users.read'],
})

const { t } = useI18n()
const store = useSessionStore()
const route = useRoute()

// route.params.subjectId is a path identifier (subject id), not a secret. The
// composable resolves the masked detail DTO server-side via the BFF; tokens stay
// in the Nitro event.context and never reach the page or window.__NUXT__.
const subjectId = computed<string>(() => String(route.params.subjectId ?? ''))
const { user, loginContext, sessions, viewState, requestId, refresh } = useUserDetail(subjectId)

const headerTitle = computed<string>(() => user.value?.display_name ?? t('users.title'))
const statusTone = computed(() => resolveUserStatusTone(user.value?.effective_status))

// PII fields arrive ALREADY MASKED from the backend; formatMaskedIdentifier only
// normalizes null/'' → em dash. Never render the raw value (there is none).
function bool(value: boolean | null | undefined): string {
  return value ? t('users.yes') : t('users.no')
}

const sessionColumns = computed<readonly UiDataListColumn[]>(() => [
  { key: 'sid', label: t('users.col_session'), variant: 'id' },
  { key: 'ip', label: t('users.ip_address'), align: 'left' },
  { key: 'lastSeen', label: t('users.last_seen'), variant: 'timestamp', align: 'left' },
])

// Row key is a synthetic index, NEVER the raw session id; the displayed id is the
// masked support-reference form so the raw sid never reaches the rendered tree.
const sessionRows = computed<readonly UiDataListRow[]>(() =>
  sessions.value.map((session, index) => ({
    id: `session-${index}`,
    sid: formatTechnicalPreview(session.id),
    ip: session.ip_address ?? '—',
    lastSeen: session.last_seen_at ?? '—',
  })),
)

async function onRefresh(): Promise<void> {
  await refresh()
}

async function onBack(): Promise<void> {
  await navigateTo({ name: 'admin.users' })
}
</script>

<template>
  <section class="user-detail" data-page="user-detail">
    <header class="user-detail__hero">
      <span class="user-detail__eyebrow">{{ t('users.eyebrow') }}</span>
      <h1 class="user-detail__title">{{ headerTitle }}</h1>
      <p class="user-detail__principal" data-principal-name>
        {{ t('users.signed_in_as', { name: store.principal?.display_name ?? '—' }) }}
      </p>
      <UiStatusBadge
        v-if="user"
        :tone="statusTone"
        :status="user.effective_status"
        :label="user.effective_status ?? t('users.status_unknown')"
      />
    </header>

    <UiSkeleton v-if="viewState === 'loading'" :rows="6" :label="t('users.loading')" />

    <UiStatusView
      v-else-if="viewState === 'forbidden'"
      tone="forbidden"
      :eyebrow="t('users.eyebrow')"
      :title="t('users.forbidden_title')"
      :description="t('common.forbidden_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="viewState === 'unauthenticated'"
      tone="step_up"
      :eyebrow="t('users.eyebrow')"
      :title="t('common.session_expired_title')"
      :description="t('common.session_expired_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    />

    <UiEmptyState
      v-else-if="viewState === 'not_found'"
      :title="t('users.not_found_title')"
      :description="t('users.not_found_desc')"
    >
      <template #action>
        <UiButton variant="secondary" size="sm" @click="onBack">
          {{ t('users.btn_back') }}
        </UiButton>
      </template>
    </UiEmptyState>

    <UiStatusView
      v-else-if="viewState === 'error'"
      tone="error"
      :eyebrow="t('users.eyebrow')"
      :title="t('users.error_title')"
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

    <div v-else-if="user" class="user-detail__panels">
      <section class="user-detail__panel" data-panel="overview" aria-labelledby="overview-heading">
        <h2 id="overview-heading" class="user-detail__panel-title">{{ t('users.overview_title') }}</h2>
        <dl class="user-detail__grid">
          <div class="user-detail__field">
            <dt>{{ t('users.label_display_name') }}</dt>
            <dd>{{ user.display_name ?? '—' }}</dd>
          </div>
          <div class="user-detail__field">
            <dt>{{ t('users.label_email') }}</dt>
            <!-- Email is an intentionally-shown operator field (operator necessity), rendered plainly — not masked. -->
            <dd>{{ user.email ?? '—' }}</dd>
          </div>
          <div class="user-detail__field">
            <dt>{{ t('users.label_role') }}</dt>
            <dd>{{ user.role ?? '—' }}</dd>
          </div>
          <div class="user-detail__field">
            <dt>{{ t('users.field_nik') }}</dt>
            <dd>{{ formatMaskedIdentifier(user.nik) }}</dd>
          </div>
          <div class="user-detail__field">
            <dt>{{ t('users.field_nip') }}</dt>
            <dd>{{ formatMaskedIdentifier(user.nip) }}</dd>
          </div>
          <div class="user-detail__field">
            <dt>{{ t('users.field_nisn') }}</dt>
            <dd>{{ formatMaskedIdentifier(user.nisn) }}</dd>
          </div>
          <div class="user-detail__field">
            <dt>{{ t('users.field_birth_date') }}</dt>
            <dd>{{ formatMaskedIdentifier(user.birth_date) }}</dd>
          </div>
          <div class="user-detail__field">
            <dt>{{ t('users.local_account') }}</dt>
            <dd>{{ user.local_account_enabled ? t('users.enabled') : t('users.disabled') }}</dd>
          </div>
          <div class="user-detail__field">
            <dt>{{ t('users.email_verified') }}</dt>
            <dd>
              <UiFolio v-if="user.email_verified_at" :value="user.email_verified_at" variant="timestamp" />
              <span v-else>{{ t('users.no') }}</span>
            </dd>
          </div>
          <div class="user-detail__field">
            <dt>{{ t('users.last_login') }}</dt>
            <dd>
              <UiFolio v-if="user.last_login_at" :value="user.last_login_at" variant="timestamp" />
              <span v-else>—</span>
            </dd>
          </div>
          <div class="user-detail__field">
            <dt>{{ t('users.last_synced') }}</dt>
            <dd>
              <UiFolio v-if="user.profile_synced_at" :value="user.profile_synced_at" variant="timestamp" />
              <span v-else>—</span>
            </dd>
          </div>
        </dl>
      </section>

      <section class="user-detail__panel" data-panel="security" aria-labelledby="security-heading">
        <h2 id="security-heading" class="user-detail__panel-title">{{ t('users.security_title') }}</h2>
        <dl class="user-detail__grid">
          <div class="user-detail__field">
            <dt>{{ t('users.mfa_enrolled') }}</dt>
            <dd>{{ bool(user.mfa_enrolled) }}</dd>
          </div>
          <div class="user-detail__field">
            <dt>{{ t('users.mfa_required') }}</dt>
            <dd>{{ bool(user.mfa_mandatory || loginContext?.mfa_required) }}</dd>
          </div>
          <div class="user-detail__field">
            <dt>{{ t('users.mfa_methods') }}</dt>
            <dd>{{ user.mfa_methods.length ? user.mfa_methods.join(', ') : '—' }}</dd>
          </div>
          <div class="user-detail__field">
            <dt>{{ t('users.login_ip') }}</dt>
            <dd>{{ loginContext?.ip_address ?? '—' }}</dd>
          </div>
          <div class="user-detail__field">
            <dt>{{ t('users.last_seen') }}</dt>
            <dd>
              <UiFolio v-if="loginContext?.last_seen_at" :value="loginContext.last_seen_at" variant="timestamp" />
              <span v-else>—</span>
            </dd>
          </div>
        </dl>
      </section>

      <section class="user-detail__panel" data-panel="roles" aria-labelledby="roles-heading">
        <h2 id="roles-heading" class="user-detail__panel-title">{{ t('users.roles_title') }}</h2>
        <ul v-if="user.roles.length" class="user-detail__roles">
          <li v-for="role in user.roles" :key="role.slug">
            <UiStatusBadge :tone="role.is_system ? 'info' : 'neutral'" :label="role.name" />
          </li>
        </ul>
        <p v-else class="user-detail__muted">—</p>
      </section>

      <section class="user-detail__panel" data-panel="sessions" aria-labelledby="sessions-heading">
        <h2 id="sessions-heading" class="user-detail__panel-title">{{ t('users.sessions_title') }}</h2>
        <UiDataList
          v-if="sessionRows.length"
          :caption="t('users.sessions_title')"
          :columns="sessionColumns"
          :rows="sessionRows"
          :total="sessionRows.length"
        />
        <p v-else class="user-detail__muted">{{ t('users.no_sessions') }}</p>
      </section>
    </div>
  </section>
</template>

<style scoped>
.user-detail {
  display: grid;
  gap: 24px;
  padding: 24px;
}
.user-detail__hero {
  display: grid;
  gap: 6px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border);
}
.user-detail__eyebrow {
  font: 600 0.6875rem/1 var(--font-sans);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.user-detail__title {
  margin: 0;
  font: 600 1.5rem/1.2 var(--font-sans);
  letter-spacing: -0.02em;
  color: var(--fg);
}
.user-detail__principal {
  margin: 0;
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--fg-2);
}
.user-detail__panels {
  display: grid;
  gap: 20px;
}
.user-detail__panel {
  display: grid;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--border);
}
.user-detail__panel-title {
  margin: 0;
  font: 600 0.9375rem/1.2 var(--font-sans);
  color: var(--fg);
}
.user-detail__grid {
  display: grid;
  gap: 12px 24px;
  margin: 0;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}
.user-detail__field {
  display: grid;
  gap: 2px;
}
.user-detail__field dt {
  font: 600 0.625rem/1 var(--font-sans);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.user-detail__field dd {
  margin: 0;
  font: 400 0.875rem/1.5 var(--font-sans);
  color: var(--fg);
  overflow-wrap: anywhere;
}
.user-detail__roles {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.user-detail__muted {
  margin: 0;
  font: 400 0.875rem/1.5 var(--font-sans);
  color: var(--fg-3);
}
</style>
```

> Note: the `—` em-dash escapes above are written so this plan stays ASCII-safe — type them as the literal `—` character in the actual `.vue` and `.ts` source (matching `dashboard.vue`'s inline `—`). The two `formatMaskedIdentifier` em-dash returns are already `—` inside that helper.

6. [ ] Run the page test + the route-map guard test — expect **PASS** for both:
   `npm run test -- app/pages/__tests__/users-detail.page.nuxt.spec.ts app/pages/__tests__/route-map.spec.ts`

7. [ ] Refactor pass (keep tests green): confirm the page reaches the network only through `useUserDetail` (no `fetch`/`$fetch`), that the only red on the surface is none (read-only page — no destructive affordance yet; `#E4002B` stays reserved for 4.11), and that the hero/panels use tokens-only Swiss styling (hairline borders, no shadows, `UiFolio` for timestamps). Re-run step 6 to confirm still green.

8. [ ] Commit:
   `git add app/pages/users/[subjectId].vue app/locales/id.json app/locales/en.json app/pages/__tests__/users-detail.page.nuxt.spec.ts app/pages/__tests__/route-map.spec.ts && git commit -m "$(printf 'feat(sso-admin-frontend): Swiss read-only user detail page (masked PII, sessions, MFA)\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"`

**Deliverable:** deep-linkable read-only detail page with all states (incl. `not_found`) + masked PII/sessions/MFA panels, all green.

**Task-scoped DoD (run from `services/sso-admin-frontend`; report any blocked command explicitly, never claim PASS for a command that did not run):**
`npm run test -- app/pages/__tests__/users-detail.page.nuxt.spec.ts app/pages/__tests__/route-map.spec.ts && npm run typecheck && npm run lint && npm run format:check`

---

### Task 4.9: Shared privileged-action infrastructure (pure matrix + composable + confirm dialog)

The reusable core every write/destructive/role action plugs into: a **pure** error→status matrix, the `usePrivilegedAction` runner that owns submitting/success/failure state (and never leaves a stale loading flag), and the `PrivilegedActionDialog` that pairs an impact summary + optional reason input + step-up notice + safe error/REF reference. The **full privileged-action test matrix** (4.1–4.10 + the destructive-confirm cases) is exercised **here** on the infra so each downstream action (Tasks 4.10–4.12) stays thin.

**Files**
- Create: `app/lib/users/privileged-action.ts`
- Create: `app/composables/usePrivilegedAction.ts`
- Create: `app/components/users/PrivilegedActionDialog.vue`
- Test: `app/lib/users/__tests__/privileged-action.spec.ts`
- Test: `app/composables/__tests__/usePrivilegedAction.nuxt.spec.ts`
- Test: `app/components/users/__tests__/PrivilegedActionDialog.spec.ts`

**Interfaces**
- Produces (`app/lib/users/privileged-action.ts`):
  - `type PrivilegedActionStatus = 'idle' | 'submitting' | 'success' | 'forbidden' | 'unauthenticated' | 'step_up_required' | 'rate_limited' | 'invalid' | 'error'`
  - `type PrivilegedActionFailure = { readonly status: Exclude<PrivilegedActionStatus,'idle'|'submitting'|'success'>; readonly requestId: string | null; readonly auditEventId: string | null; readonly fieldErrors: Readonly<Record<string, readonly string[]>>; readonly stepUpUrl: string | null }`
  - `function resolvePrivilegedActionFailure(error: unknown): PrivilegedActionFailure` (428/412 or code `reauth_required`/`step_up_required` → step_up_required + `stepUpUrl` from `payload.step_up_url`; 401/419 → unauthenticated; 403 → forbidden; 422 → invalid + `fieldErrors` from `payload.errors`; 429 → rate_limited; else → error; `requestId = ApiError.requestId ?? getLastRequestId()`; `auditEventId` from `payload.audit_event_id`)
- Produces (`app/composables/usePrivilegedAction.ts`):
  - `type UsePrivilegedActionReturn<T> = { readonly status: Ref<PrivilegedActionStatus>; readonly isSubmitting: ComputedRef<boolean>; readonly failure: Ref<PrivilegedActionFailure | null>; readonly requestId: ComputedRef<string | null>; readonly auditEventId: ComputedRef<string | null>; readonly fieldErrors: ComputedRef<Readonly<Record<string, readonly string[]>>>; readonly stepUpUrl: ComputedRef<string | null>; readonly run: (runner: () => Promise<T>) => Promise<T | null>; readonly reset: () => void }`
  - `function usePrivilegedAction<T>(): UsePrivilegedActionReturn<T>` (`run` sets `submitting`, clears failure, returns data on success / `null` on failure with status mapped via `resolvePrivilegedActionFailure`; `isSubmitting` always resets — no stale loading; `reset` → `idle`)
- Produces (`app/components/users/PrivilegedActionDialog.vue`):
  - Props: `{ open: boolean; title: string; description: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean; reasonLabel?: string; reasonRequired?: boolean; reasonMin?: number; reasonMax?: number; reason?: string; submitting?: boolean; stepUpUrl?: string | null; stepUpLabel?: string; errorMessage?: string | null; requestId?: string | null }`
  - Emits: `confirm()`, `cancel()`, `update:reason(value: string)` (confirm disabled until reason valid when `reasonRequired` AND not `submitting`; cancel/overlay/Esc emit `cancel` and call no API; renders impact `description`, optional `UiTextarea` reason, step-up notice/link when `stepUpUrl`, safe `errorMessage` + redacted `REF-` reference)
- Consumes: `ApiError`, `getLastRequestId` (`@/lib/api/api-client`); `UiButton`, `UiTextarea` (`@/components/ui/*`); `formatSupportReference` (`@/lib/display-identifiers`); the reka-ui `AlertDialog*` a11y primitives.

> **Architecture note (decision the skeleton left implicit).** The skeleton calls `PrivilegedActionDialog` a "`UiAlertDialog` wrapper". The shipped `UiAlertDialog` (`app/components/ui/UiAlertDialog.vue`) exposes **no body slot and no disabled-confirm binding**, both of which this contract requires (a `UiTextarea` reason field *inside* the dialog, plus a confirm button disabled until the reason is valid). To meet the behavioral contract **without modifying a shared DS component** consumed by other domains, `PrivilegedActionDialog` is built directly on the same reka-ui `AlertDialog*` primitives `UiAlertDialog` itself uses (the a11y layer the design mandates keeping). It still consumes `UiButton`, `UiTextarea`, and `formatSupportReference` exactly as the contract lists. No new dependency is added — reka-ui already ships.

**Steps**

1. [ ] Write the failing test `app/lib/users/__tests__/privileged-action.spec.ts` (the pure matrix — 4.2–4.9 + field-error/step-up extraction):

```ts
import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api/api-client'
import { resolvePrivilegedActionFailure } from '../privileged-action'

describe('resolvePrivilegedActionFailure — HTTP status matrix', () => {
  it('4.3 — 401 maps to unauthenticated', () => {
    expect(resolvePrivilegedActionFailure(new ApiError(401, 'unauthorized')).status).toBe(
      'unauthenticated',
    )
  })

  it('4.4 — 419 (session/CSRF expired) maps to unauthenticated', () => {
    expect(resolvePrivilegedActionFailure(new ApiError(419, 'session expired')).status).toBe(
      'unauthenticated',
    )
  })

  it('4.2 — 403 maps to forbidden', () => {
    expect(resolvePrivilegedActionFailure(new ApiError(403, 'forbidden')).status).toBe('forbidden')
  })

  it('4.5 — 429 maps to rate_limited', () => {
    expect(resolvePrivilegedActionFailure(new ApiError(429, 'too many requests')).status).toBe(
      'rate_limited',
    )
  })

  it('4.6 — 422 maps to invalid and lifts field errors from payload.errors', () => {
    const failure = resolvePrivilegedActionFailure(
      new ApiError(422, 'validation failed', 'validation_failed', {
        message: 'The given data was invalid.',
        errors: { email: ['Email already taken.'], nik: ['Invalid NIK.'] },
      }),
    )
    expect(failure.status).toBe('invalid')
    expect(failure.fieldErrors.email).toEqual(['Email already taken.'])
    expect(failure.fieldErrors.nik).toEqual(['Invalid NIK.'])
  })

  it('4.7 — 428 (reauth_required) maps to step_up_required and lifts step_up_url', () => {
    const failure = resolvePrivilegedActionFailure(
      new ApiError(428, 'reauth required', 'reauth_required', {
        error: 'reauth_required',
        step_up_url: '/auth/login?prompt=login&max_age=0&return_to=%2Fusers',
      }),
    )
    expect(failure.status).toBe('step_up_required')
    expect(failure.stepUpUrl).toBe('/auth/login?prompt=login&max_age=0&return_to=%2Fusers')
  })

  it('4.7 — a step_up_required code on a non-428 status still maps to step_up_required', () => {
    const failure = resolvePrivilegedActionFailure(
      new ApiError(403, 'step up', 'step_up_required', { step_up_url: '/auth/login' }),
    )
    expect(failure.status).toBe('step_up_required')
    expect(failure.stepUpUrl).toBe('/auth/login')
  })

  it('4.8 — 5xx maps to error with no leaked field/step-up data', () => {
    const failure = resolvePrivilegedActionFailure(new ApiError(500, 'boom'))
    expect(failure.status).toBe('error')
    expect(failure.fieldErrors).toEqual({})
    expect(failure.stepUpUrl).toBeNull()
  })

  it('4.9 — surfaces requestId (ApiError wins) and auditEventId from payload', () => {
    const failure = resolvePrivilegedActionFailure(
      new ApiError(422, 'invalid', 'validation_failed', { audit_event_id: 'evt_abc123' }, 'req_xyz'),
    )
    expect(failure.requestId).toBe('req_xyz')
    expect(failure.auditEventId).toBe('evt_abc123')
  })

  it('a non-ApiError (thrown string/object) is treated as a generic error, never crashes', () => {
    const failure = resolvePrivilegedActionFailure(new TypeError('network down'))
    expect(failure.status).toBe('error')
    expect(failure.auditEventId).toBeNull()
    expect(failure.fieldErrors).toEqual({})
    expect(failure.stepUpUrl).toBeNull()
  })
})
```

2. [ ] Run it — expect **FAIL** (module `../privileged-action` does not exist → resolution error):
   `npm run test -- app/lib/users/__tests__/privileged-action.spec.ts`

3. [ ] Implement `app/lib/users/privileged-action.ts` (FULL code):

```ts
import { ApiError, getLastRequestId } from '@/lib/api/api-client'

// One canonical mapping from a transport error to an operator-safe action
// outcome. Pure: no Vue, no network, no DOM — every write/destructive/role
// action in the Users domain routes its failures through here, so the
// status/field-error/step-up/correlation matrix is unit-testable in isolation.
export type PrivilegedActionStatus =
  | 'idle'
  | 'submitting'
  | 'success'
  | 'forbidden'
  | 'unauthenticated'
  | 'step_up_required'
  | 'rate_limited'
  | 'invalid'
  | 'error'

export type PrivilegedActionFailureStatus = Exclude<
  PrivilegedActionStatus,
  'idle' | 'submitting' | 'success'
>

export type PrivilegedActionFailure = {
  readonly status: PrivilegedActionFailureStatus
  readonly requestId: string | null
  readonly auditEventId: string | null
  readonly fieldErrors: Readonly<Record<string, readonly string[]>>
  readonly stepUpUrl: string | null
}

// Shape of the JSON body the backend attaches to a failed admin mutation.
// All fields optional — the middleware/controller envelopes differ by status
// (validation: { message, errors }; middleware: { error, error_description,
// step_up_url }; controller: { error, message }).
type ErrorPayload = {
  readonly errors?: Readonly<Record<string, readonly string[]>>
  readonly audit_event_id?: string | null
  readonly step_up_url?: string | null
}

function readPayload(payload: unknown): ErrorPayload {
  return typeof payload === 'object' && payload !== null ? (payload as ErrorPayload) : {}
}

function isStepUp(error: ApiError): boolean {
  return (
    error.status === 428 ||
    error.status === 412 ||
    error.code === 'reauth_required' ||
    error.code === 'step_up_required'
  )
}

function mapStatus(error: ApiError): PrivilegedActionFailureStatus {
  // Step-up is checked first: the backend can emit a step-up code on a 403/428,
  // and re-authentication must take precedence over a plain "forbidden" surface.
  if (isStepUp(error)) return 'step_up_required'
  if (error.status === 401 || error.status === 419) return 'unauthenticated'
  if (error.status === 403) return 'forbidden'
  if (error.status === 422) return 'invalid'
  if (error.status === 429) return 'rate_limited'
  return 'error'
}

export function resolvePrivilegedActionFailure(error: unknown): PrivilegedActionFailure {
  if (!(error instanceof ApiError)) {
    return {
      status: 'error',
      requestId: getLastRequestId(),
      auditEventId: null,
      fieldErrors: {},
      stepUpUrl: null,
    }
  }
  const payload = readPayload(error.payload)
  const status = mapStatus(error)
  return {
    status,
    requestId: error.requestId ?? getLastRequestId(),
    auditEventId: payload.audit_event_id ?? null,
    fieldErrors: status === 'invalid' ? (payload.errors ?? {}) : {},
    stepUpUrl: status === 'step_up_required' ? (payload.step_up_url ?? null) : null,
  }
}
```

4. [ ] Run it — expect **PASS**:
   `npm run test -- app/lib/users/__tests__/privileged-action.spec.ts`

5. [ ] Write the failing test `app/composables/__tests__/usePrivilegedAction.nuxt.spec.ts` (the runner — 4.1 success, 4.10 no-stale-loading, failure mapping, reset):

```ts
import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api/api-client'
import { usePrivilegedAction } from '@/composables/usePrivilegedAction'

describe('usePrivilegedAction', () => {
  it('4.1 — allowed success path: returns data, status success, never stuck submitting', async () => {
    const action = usePrivilegedAction<{ ok: boolean }>()
    expect(action.status.value).toBe('idle')

    const promise = action.run(async () => ({ ok: true }))
    expect(action.isSubmitting.value).toBe(true) // submitting while in-flight

    const result = await promise
    expect(result).toEqual({ ok: true })
    expect(action.status.value).toBe('success')
    expect(action.isSubmitting.value).toBe(false)
    expect(action.failure.value).toBeNull()
  })

  it('4.6/4.9 — failure returns null, maps status, exposes field errors + correlation', async () => {
    const action = usePrivilegedAction()
    const result = await action.run(async () => {
      throw new ApiError(
        422,
        'invalid',
        'validation_failed',
        { errors: { email: ['Taken.'] }, audit_event_id: 'evt_1' },
        'req_1',
      )
    })

    expect(result).toBeNull()
    expect(action.status.value).toBe('invalid')
    expect(action.fieldErrors.value.email).toEqual(['Taken.'])
    expect(action.requestId.value).toBe('req_1')
    expect(action.auditEventId.value).toBe('evt_1')
  })

  it('4.7 — step-up failure exposes stepUpUrl', async () => {
    const action = usePrivilegedAction()
    await action.run(async () => {
      throw new ApiError(428, 'reauth', 'reauth_required', { step_up_url: '/auth/login' })
    })
    expect(action.status.value).toBe('step_up_required')
    expect(action.stepUpUrl.value).toBe('/auth/login')
  })

  it('4.10 — after an error the runner leaves NO stale loading/disabled flag', async () => {
    const action = usePrivilegedAction()
    await action.run(async () => {
      throw new ApiError(500, 'boom')
    })
    expect(action.status.value).toBe('error')
    expect(action.isSubmitting.value).toBe(false)
  })

  it('reset() clears the action back to idle', async () => {
    const action = usePrivilegedAction()
    await action.run(async () => {
      throw new ApiError(403, 'no')
    })
    expect(action.status.value).toBe('forbidden')
    action.reset()
    expect(action.status.value).toBe('idle')
    expect(action.failure.value).toBeNull()
  })
})
```

6. [ ] Run it — expect **FAIL** (module `@/composables/usePrivilegedAction` does not exist):
   `npm run test -- app/composables/__tests__/usePrivilegedAction.nuxt.spec.ts`

7. [ ] Implement `app/composables/usePrivilegedAction.ts` (FULL code):

```ts
import { computed, ref, type ComputedRef, type Ref } from 'vue'
import {
  resolvePrivilegedActionFailure,
  type PrivilegedActionFailure,
  type PrivilegedActionStatus,
} from '@/lib/users/privileged-action'

export type UsePrivilegedActionReturn<T> = {
  readonly status: Ref<PrivilegedActionStatus>
  readonly isSubmitting: ComputedRef<boolean>
  readonly failure: Ref<PrivilegedActionFailure | null>
  readonly requestId: ComputedRef<string | null>
  readonly auditEventId: ComputedRef<string | null>
  readonly fieldErrors: ComputedRef<Readonly<Record<string, readonly string[]>>>
  readonly stepUpUrl: ComputedRef<string | null>
  readonly run: (runner: () => Promise<T>) => Promise<T | null>
  readonly reset: () => void
}

// Mutation runner shared by every Users write/destructive/role action. Owns the
// submitting → success | <failure-status> lifecycle. The try/catch guarantees
// `status` always settles off `submitting`, so a failed action can never leave a
// stale loading/disabled flag on the surface (TDD §4.10).
export function usePrivilegedAction<T>(): UsePrivilegedActionReturn<T> {
  const status = ref<PrivilegedActionStatus>('idle')
  const failure = ref<PrivilegedActionFailure | null>(null)

  async function run(runner: () => Promise<T>): Promise<T | null> {
    status.value = 'submitting'
    failure.value = null
    try {
      const result = await runner()
      status.value = 'success'
      return result
    } catch (error) {
      const mapped = resolvePrivilegedActionFailure(error)
      failure.value = mapped
      status.value = mapped.status
      return null
    }
  }

  function reset(): void {
    status.value = 'idle'
    failure.value = null
  }

  return {
    status,
    isSubmitting: computed(() => status.value === 'submitting'),
    failure,
    requestId: computed(() => failure.value?.requestId ?? null),
    auditEventId: computed(() => failure.value?.auditEventId ?? null),
    fieldErrors: computed(() => failure.value?.fieldErrors ?? {}),
    stepUpUrl: computed(() => failure.value?.stepUpUrl ?? null),
    run,
    reset,
  }
}
```

8. [ ] Run it — expect **PASS**:
   `npm run test -- app/composables/__tests__/usePrivilegedAction.nuxt.spec.ts`

9. [ ] Write the failing test `app/components/users/__tests__/PrivilegedActionDialog.spec.ts` (the destructive-confirm matrix + redaction; plain `*.spec.ts`, `@vue/test-utils`):

```ts
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PrivilegedActionDialog from '../PrivilegedActionDialog.vue'

function render(props: Record<string, unknown> = {}) {
  return mount(PrivilegedActionDialog, {
    props: {
      open: true,
      title: 'Lock account',
      description: 'This signs the user out of every device and blocks new logins.',
      confirmLabel: 'Lock account',
      cancelLabel: 'Cancel',
      ...props,
    },
  })
}

describe('PrivilegedActionDialog', () => {
  it('shows the impact summary before submit', () => {
    const wrapper = render()
    expect(wrapper.get('[data-testid="privileged-action-impact"]').text()).toContain(
      'signs the user out of every device',
    )
  })

  it('primary destructive button is disabled until the required reason is valid', async () => {
    const wrapper = render({
      danger: true,
      reasonLabel: 'Reason',
      reasonRequired: true,
      reasonMax: 255,
      reason: '',
    })
    const confirm = wrapper.get('[data-testid="privileged-action-confirm"]')
    expect(confirm.attributes('disabled')).toBeDefined()

    await wrapper.setProps({ reason: 'Compromised credentials reported by user.' })
    expect(
      wrapper.get('[data-testid="privileged-action-confirm"]').attributes('disabled'),
    ).toBeUndefined()
  })

  it('emits update:reason as the operator types', async () => {
    const wrapper = render({ reasonLabel: 'Reason', reasonRequired: true })
    await wrapper.get('[data-testid="privileged-action-reason"]').setValue('Policy violation.')
    expect(wrapper.emitted('update:reason')?.at(-1)).toEqual(['Policy violation.'])
  })

  it('confirm button is disabled while submitting (no double-submit)', () => {
    const wrapper = render({ submitting: true })
    expect(
      wrapper.get('[data-testid="privileged-action-confirm"]').attributes('disabled'),
    ).toBeDefined()
  })

  it('cancel emits cancel and never confirm (cancel calls no API)', async () => {
    const wrapper = render()
    await wrapper.get('[data-testid="privileged-action-cancel"]').trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
    expect(wrapper.emitted('confirm')).toBeUndefined()
  })

  it('confirm emits confirm when enabled', async () => {
    const wrapper = render()
    await wrapper.get('[data-testid="privileged-action-confirm"]').trigger('click')
    expect(wrapper.emitted('confirm')).toHaveLength(1)
  })

  it('4.7 — renders a step-up notice/link when stepUpUrl is present', () => {
    const wrapper = render({ stepUpUrl: '/auth/login?prompt=login', stepUpLabel: 'Re-authenticate' })
    const stepUp = wrapper.get('[data-testid="privileged-action-stepup"]')
    expect(stepUp.text()).toContain('Re-authenticate')
    expect(stepUp.get('a').attributes('href')).toBe('/auth/login?prompt=login')
  })

  it('4.8/4.9 — shows safe error copy + a REDACTED support reference, never the raw request id', () => {
    const wrapper = render({
      errorMessage: 'The action could not be completed. Please try again.',
      requestId: 'b3f1c2d4-aaaa-bbbb-cccc-1234567890ab',
    })
    const error = wrapper.get('[data-testid="privileged-action-error"]')
    expect(error.text()).toContain('could not be completed')
    // Correlation id is redacted to REF-XXXXXXXX; the raw id must NOT appear.
    expect(wrapper.get('[data-testid="privileged-action-ref"]').text()).toMatch(/^REF-[0-9A-Z]+$/)
    expect(wrapper.html()).not.toContain('b3f1c2d4-aaaa-bbbb-cccc-1234567890ab')
  })

  it('uses the danger confirm variant only when danger is set', () => {
    const danger = render({ danger: true })
    expect(danger.get('[data-testid="privileged-action-confirm"]').classes().join(' ')).toMatch(
      /danger/,
    )
  })
})
```

10. [ ] Run it — expect **FAIL** (component `../PrivilegedActionDialog.vue` does not exist):
    `npm run test -- app/components/users/__tests__/PrivilegedActionDialog.spec.ts`

11. [ ] Implement `app/components/users/PrivilegedActionDialog.vue` (FULL code):

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
import { computed } from 'vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiTextarea from '@/components/ui/UiTextarea.vue'
import { formatSupportReference } from '@/lib/display-identifiers'

interface Props {
  readonly open: boolean
  readonly title: string
  readonly description: string
  readonly confirmLabel?: string
  readonly cancelLabel?: string
  readonly danger?: boolean
  readonly reasonLabel?: string
  readonly reasonRequired?: boolean
  readonly reasonMin?: number
  readonly reasonMax?: number
  readonly reason?: string
  readonly submitting?: boolean
  readonly stepUpUrl?: string | null
  readonly stepUpLabel?: string
  readonly errorMessage?: string | null
  readonly requestId?: string | null
}

const props = withDefaults(defineProps<Props>(), {
  confirmLabel: 'Confirm',
  cancelLabel: 'Cancel',
  danger: false,
  reasonLabel: '',
  reasonRequired: false,
  reasonMin: 0,
  reasonMax: 255,
  reason: '',
  submitting: false,
  stepUpUrl: null,
  stepUpLabel: '',
  errorMessage: null,
  requestId: null,
})

const emit = defineEmits<{
  (event: 'confirm'): void
  (event: 'cancel'): void
  (event: 'update:reason', value: string): void
}>()

const showReason = computed(() => props.reasonLabel.length > 0)

// Valid when not required, else when the trimmed length sits within [min, max]
// (min collapses to 1 when unset so an empty required reason is rejected).
const reasonValid = computed(() => {
  if (!props.reasonRequired) return true
  const length = props.reason.trim().length
  return length >= (props.reasonMin || 1) && length <= props.reasonMax
})

const confirmDisabled = computed(() => props.submitting || !reasonValid.value)

// Raw correlation id is never rendered — only the redacted REF-XXXXXXXX form.
const supportReference = computed(() => formatSupportReference(props.requestId))

function onCancel(): void {
  emit('cancel')
}
</script>

<template>
  <AlertDialogRoot :open="open" @update:open="(value) => !value && onCancel()">
    <AlertDialogPortal disabled force-mount>
      <AlertDialogOverlay class="pa-dialog__overlay" data-testid="privileged-action-overlay" />
      <AlertDialogContent class="pa-dialog">
        <AlertDialogTitle class="pa-dialog__title">{{ title }}</AlertDialogTitle>
        <AlertDialogDescription class="pa-dialog__impact" data-testid="privileged-action-impact">
          {{ description }}
        </AlertDialogDescription>

        <div v-if="showReason" class="pa-dialog__field">
          <label class="pa-dialog__label" for="privileged-action-reason">{{ reasonLabel }}</label>
          <UiTextarea
            id="privileged-action-reason"
            data-testid="privileged-action-reason"
            :model-value="reason"
            :rows="3"
            :disabled="submitting"
            @update:model-value="(value) => emit('update:reason', value)"
          />
        </div>

        <p v-if="stepUpUrl" class="pa-dialog__stepup" data-testid="privileged-action-stepup">
          <a :href="stepUpUrl">{{ stepUpLabel || stepUpUrl }}</a>
        </p>

        <p
          v-if="errorMessage"
          class="pa-dialog__error"
          role="alert"
          data-testid="privileged-action-error"
        >
          {{ errorMessage }}
          <span
            v-if="supportReference"
            class="pa-dialog__ref"
            data-testid="privileged-action-ref"
          >
            {{ supportReference }}
          </span>
        </p>

        <div class="pa-dialog__actions">
          <AlertDialogCancel as-child>
            <UiButton data-testid="privileged-action-cancel" variant="secondary" @click="onCancel">
              {{ cancelLabel }}
            </UiButton>
          </AlertDialogCancel>
          <AlertDialogAction as-child @click="emit('confirm')">
            <UiButton
              data-testid="privileged-action-confirm"
              :variant="danger ? 'danger' : 'primary'"
              :disabled="confirmDisabled"
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
.pa-dialog__overlay {
  position: fixed;
  inset: 0;
  z-index: 1100;
  background: rgb(10 10 10 / 0.4);
}
.pa-dialog {
  position: fixed;
  top: 50%;
  left: 50%;
  z-index: 1101;
  display: grid;
  gap: 14px;
  width: min(92vw, 32rem);
  padding: 20px;
  background: var(--card);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-md);
  transform: translate(-50%, -50%);
}
.pa-dialog__title {
  font: 600 1rem/1.2 var(--font-sans);
  letter-spacing: -0.01em;
  color: var(--fg);
}
.pa-dialog__impact {
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--fg-2);
}
.pa-dialog__field {
  display: grid;
  gap: 6px;
}
.pa-dialog__label {
  font: 500 0.75rem/1.3 var(--font-sans);
  color: var(--fg-2);
}
.pa-dialog__stepup {
  font: 500 0.8125rem/1.4 var(--font-sans);
  color: var(--accent);
}
.pa-dialog__error {
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--danger);
}
.pa-dialog__ref {
  margin-left: 6px;
  font-family: var(--font-mono);
  color: var(--fg-3);
}
.pa-dialog__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 4px;
}
</style>
```

12. [ ] Run it — expect **PASS**:
    `npm run test -- app/components/users/__tests__/PrivilegedActionDialog.spec.ts`

13. [ ] Token-leak / PII self-check (this component is the only place a raw correlation id could surface): the `[data-testid="privileged-action-ref"]` assertion already proves the dialog renders **only** the redacted `REF-XXXXXXXX` form and that the raw request-id string is absent from `wrapper.html()`. No DTO / token / NIK-NIP-NISN value passes through this component — `description`, `errorMessage`, and `reason` are caller-supplied safe copy, never serialized into `__NUXT_DATA__` (the dialog is client-interactive state, not SSR-hydrated data). No extra fixture needed here; the SSR-payload leak gate for the user DTOs is covered in Task 4.13.

14. [ ] Refactor pass (keep green): confirm no `any`, every Produces type matches the skeleton verbatim, no traceability markers (`OG#`/`UC###`/`FR###`/`BE-FR###`) in source/tests, Swiss discipline held (tokens only; `--danger` reserved for the destructive confirm variant; `--font-mono` only on the `REF-` reference). Re-run all three specs:
    `npm run test -- app/lib/users/__tests__/privileged-action.spec.ts app/composables/__tests__/usePrivilegedAction.nuxt.spec.ts app/components/users/__tests__/PrivilegedActionDialog.spec.ts`

15. [ ] Commit:
    `git add app/lib/users/privileged-action.ts app/composables/usePrivilegedAction.ts app/components/users/PrivilegedActionDialog.vue app/lib/users/__tests__/privileged-action.spec.ts app/composables/__tests__/usePrivilegedAction.nuxt.spec.ts app/components/users/__tests__/PrivilegedActionDialog.spec.ts && git commit -m "$(printf 'feat(sso-admin-frontend): shared privileged-action infra (matrix + runner + confirm dialog)\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"`

**Deliverable:** the shared confirm/impact/step-up + error matrix infra, with the full 4.1–4.10 + destructive-confirm test matrix green here so downstream actions (4.10–4.12) stay thin.

**Task-scoped DoD (run from `services/sso-admin-frontend`; report any blocked command explicitly, never claim PASS for a command that did not run):**
`npm run typecheck && npm run lint && npm run format:check && npm run test && npm run build`
(No route/navigation change in this task — `npm run test:e2e` is exercised at Task 4.13 where the Users routes that mount this infra exist.)

---

### Task 4.10: Create user form page (`users/new.vue`)

Replace the `app/pages/users/new.vue` stub with the Swiss create-user form built on `FormPageShell` + `FormSection` + `UiFormField`/`UiInput`/`UiSelect`/`UiSwitch`. Three sections: **identity** (email — lowercased via `normalizeEmail` + a live duplicate guard against the already-loaded list, given/family that auto-compose `display_name` until the operator edits it, role select `user`/`admin`/`pegawai`), **local account & credentials** (a `UiSwitch` toggle + optional password with the live policy checklist from `evaluateManagedUserPassword`, **cleared when the toggle is switched off**), and the net-new **government identifiers** (`nik`/`nip`/`nisn` text + `birth_date` as a native `<input type="date">`), each validated by the Task 4.2 pure validators. Submit runs through `usePrivilegedAction` (create = `admin.users.write`, freshness `write`) so the **full failure matrix + step-up** are honoured by one shared runner; on success `navigateTo` the new user's detail route by `subject_id`. `FormPageShell`'s `isInvalid`/`isSubmitting` are bound so the primary submit is disabled while invalid or in-flight and never leaves a stale loading state after an error. Mirrors the legacy `UserCreatePage.vue` field/validation behaviour (parity) minus the legacy store/toast/anti-patterns.

> ponytail: no `UiTextarea` is imported here — the create form has no multiline field (the reason input lives on the lifecycle actions, Task 4.11). No `app/lib/display-name.ts` helper is pulled in — the given+family compose is a two-line local function, not worth a shared module for one caller. The full 401/403/419/422/428/429/5xx→status mapping matrix is owned + unit-tested in `usePrivilegedAction` (4.9); this page test mocks that composable and drives each mapped status to assert the page's surface/navigation, which is the correct altitude.

**Files**
- Modify: `app/pages/users/new.vue`
- Modify: `app/locales/id.json`, `app/locales/en.json` (ADD only genuinely-new identifier-field / validation / failure-surface keys; REUSE the existing create-user `users.*` keys: `create_user_title`, `create_user_dialog_description`, `btn_create_user`, `label_email`/`label_display_name`/`label_display_name_preview`/`label_given_name`/`label_family_name`/`label_role`/`role_user`/`role_admin`/`label_password`/`label_password_helper`/`label_local_account`/`label_local_account_helper`, `validation_email`/`validation_email_duplicate`/`validation_display_name`/`validation_password`, `password_requirement_length`/`_uppercase`/`_lowercase`/`_number`/`_symbol`; and `menu.users`, `common.identity`/`common.access`/`common.btn_create`/`common.btn_cancel`/`common.session_expired_title`/`common.session_expired_desc`/`common.forbidden_desc`/`common.error_loading_desc`)
- Test: `app/pages/__tests__/users-new.page.nuxt.spec.ts`
- (Unchanged, must stay green) `app/pages/__tests__/route-map.spec.ts` — already enumerates `users/new.vue` → `admin.users.create` / `['admin.users.write']`; the meta block must not drift.

**Interfaces**
- Consumes: `usersApi.create` (4.3); `usePrivilegedAction` (4.9); `CreateUserPayload`/`CreateUserResponse` (4.1); `isValidEmail`/`normalizeEmail`/`isValidNik`/`isValidNip`/`isValidNisn`/`isValidBirthDate` + `evaluateManagedUserPassword` + `PasswordRequirementId` (4.2); `useUsersList` (4.4) for the duplicate-email guard; `useSessionStore` (`hasPermission`); `useI18n`; `FormPageShell`/`FormSection`/`UiFormField`/`UiInput`/`UiSelect`/`UiSwitch`/`UiTextarea`, `UiStatusView`/`UiButton`; `navigateTo` + named routes `admin.users.detail` and `admin.users` (Nuxt auto-imports).
- Produces: the rendered `/users/new` route (keeps `definePageMeta({ name: 'admin.users.create', layout: 'admin', requiresAdmin: true, permissions: ['admin.users.write'] })`). No exported API.

**Steps**

1. [ ] Add the new locale keys to BOTH catalogs (parity is enforced — no missing-key tolerance). Insert into the `users` object of `app/locales/id.json`:

```json
"role_pegawai": "Pegawai",
"password_requirement_max_length": "Maksimal 128 karakter",
"section_credentials_title": "Akun lokal & kredensial",
"section_credentials_desc": "Izinkan login email + password. Jika nonaktif, akun hanya masuk via SSO/federasi dan tidak bisa reset password.",
"section_identifiers_title": "Identitas pemerintah",
"section_identifiers_desc": "Opsional. NIK/NIP/NISN dan tanggal lahir disimpan terenkripsi dan hanya ditampilkan dalam bentuk tersamar.",
"label_nik": "NIK",
"label_nip": "NIP",
"label_nisn": "NISN",
"label_birth_date": "Tanggal lahir",
"validation_nik": "NIK harus 16 digit angka.",
"validation_nip": "NIP harus 18 digit angka.",
"validation_nisn": "NISN harus 10 digit angka.",
"validation_birth_date": "Tanggal lahir tidak valid (gunakan format YYYY-MM-DD).",
"create_failed_title": "Gagal membuat akun",
"create_failed_desc": "Permintaan tidak dapat diselesaikan. Coba lagi, dan sertakan referensi dukungan bila menghubungi tim.",
"rate_limited_title": "Terlalu banyak permintaan",
"rate_limited_desc": "Batas permintaan tercapai. Tunggu sebentar lalu coba lagi.",
"step_up_required_title": "Perlu autentikasi ulang",
"step_up_required_desc": "Tindakan ini butuh sesi admin yang baru. Autentikasi ulang lalu ulangi.",
"btn_step_up": "Autentikasi ulang"
```

   And the English mirror into the `users` object of `app/locales/en.json`:

```json
"role_pegawai": "Staff",
"password_requirement_max_length": "At most 128 characters",
"section_credentials_title": "Local account & credentials",
"section_credentials_desc": "Allow email + password sign-in. When off, the account only signs in via SSO/federation and cannot reset its password.",
"section_identifiers_title": "Government identifiers",
"section_identifiers_desc": "Optional. NIK/NIP/NISN and birth date are stored encrypted and only ever shown masked.",
"label_nik": "NIK",
"label_nip": "NIP",
"label_nisn": "NISN",
"label_birth_date": "Birth date",
"validation_nik": "NIK must be 16 digits.",
"validation_nip": "NIP must be 18 digits.",
"validation_nisn": "NISN must be 10 digits.",
"validation_birth_date": "Birth date is invalid (use YYYY-MM-DD).",
"create_failed_title": "Could not create the account",
"create_failed_desc": "The request could not be completed. Try again, and quote the support reference if you contact the team.",
"rate_limited_title": "Too many requests",
"rate_limited_desc": "Request limit reached. Wait a moment and try again.",
"step_up_required_title": "Re-authentication required",
"step_up_required_desc": "This action needs a fresh admin session. Re-authenticate and retry.",
"btn_step_up": "Re-authenticate"
```

   (`forbidden_title` already exists in `users.*` and `failureTitle` reuses it — do NOT re-add it. Run `npm run format:check` after editing JSON so trailing commas/order stay clean.)

2. [ ] Write the failing test `app/pages/__tests__/users-new.page.nuxt.spec.ts` (real behaviour — validation gating, the success→navigate path, and the create privileged-action matrix driven through the mocked shared runner):

```ts
// *.nuxt.spec.ts → 'nuxt' env: mountSuspended runs the page's async setup
// (useAsyncData via useUsersList, useI18n). The data/duplicate boundary, the
// shared privileged-action runner, the service, the session store and
// navigateTo are mocked so each branch is deterministic.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import type {
  AdminUserListItem,
  CreateUserPayload,
  CreateUserResponse,
} from '@/types/users.types'
import type {
  PrivilegedActionFailure,
  PrivilegedActionStatus,
} from '@/lib/users/privileged-action'

// --- service seam -----------------------------------------------------------
const createMock = vi.fn<(p: CreateUserPayload) => Promise<CreateUserResponse>>()
vi.mock('@/services/users.api', () => ({ usersApi: { create: createMock } }))

// --- duplicate-guard list ---------------------------------------------------
const listUsers = ref<readonly AdminUserListItem[]>([])
vi.mock('@/composables/useUsersList', () => ({
  useUsersList: () => ({ users: computed(() => listUsers.value) }),
}))

// --- session store ----------------------------------------------------------
const hasPermissionMock = vi.fn<(p: string) => boolean>(() => true)
vi.mock('@/stores/session.store', () => ({
  useSessionStore: () => ({ hasPermission: hasPermissionMock }),
}))

// --- shared privileged-action runner (the matrix lives in 4.9; here we drive
//     its observable outputs) -------------------------------------------------
const status = ref<PrivilegedActionStatus>('idle')
const isSubmitting = ref(false)
const failure = ref<PrivilegedActionFailure | null>(null)
const stepUpUrl = ref<string | null>(null)
const runMock = vi.fn<(runner: () => Promise<unknown>) => Promise<unknown>>(
  async (runner) => {
    status.value = 'submitting'
    isSubmitting.value = true
    try {
      const data = await runner()
      status.value = 'success'
      return data
    } finally {
      isSubmitting.value = false
    }
  },
)
const resetMock = vi.fn(() => {
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
const navigateMock = vi.fn(async () => {})
mockNuxtImport('navigateTo', () => navigateMock)

function makeCreated(subjectId: string): CreateUserResponse {
  return {
    user: {
      id: 42,
      subject_id: subjectId,
      email: 'new.operator@example.test',
      given_name: 'New',
      family_name: 'Operator',
      display_name: 'New Operator',
      role: 'user',
      status: 'active',
      effective_status: 'active',
      disabled_at: null,
      disabled_reason: null,
      locked_at: null,
      locked_until: null,
      locked_reason: null,
      locked_by_subject_id: null,
      lock_count: 0,
      local_account_enabled: true,
      profile_synced_at: null,
      email_verified_at: null,
      last_login_at: null,
      created_at: '2026-06-28T00:00:00Z',
      nik: null,
      nip: null,
      nisn: null,
      birth_date: null,
      mfa_enrolled: false,
      mfa_methods: [],
      mfa_mandatory: false,
      roles: [{ slug: 'user', name: 'User', is_system: true }],
    },
    delivery_status: 'queued',
  }
}

const UsersNew = (await import('../users/new.vue')).default

async function fillValid(wrapper: Awaited<ReturnType<typeof mountSuspended>>) {
  await wrapper.find('#create_email').setValue('New.Operator@Example.Test')
  await wrapper.find('#create_display_name').setValue('New Operator')
  await wrapper.vm.$nextTick()
}

beforeEach(() => {
  listUsers.value = []
  status.value = 'idle'
  isSubmitting.value = false
  failure.value = null
  stepUpUrl.value = null
  hasPermissionMock.mockReturnValue(true)
  createMock.mockResolvedValue(makeCreated('usr_new_42'))
  vi.clearAllMocks()
  createMock.mockResolvedValue(makeCreated('usr_new_42'))
})
afterEach(() => vi.clearAllMocks())

describe('users/new page — validation gating', () => {
  it('disables submit on an empty form', async () => {
    const wrapper = await mountSuspended(UsersNew)
    expect(wrapper.find('[data-testid="form-submit"]').attributes('disabled')).toBeDefined()
  })

  it('flags an invalid email and keeps submit disabled', async () => {
    const wrapper = await mountSuspended(UsersNew)
    await wrapper.find('#create_email').setValue('not-an-email')
    await wrapper.find('#create_display_name').setValue('Someone')
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('Email tidak valid'.slice(0, 5)) // localized validation_email
    expect(wrapper.find('[data-testid="form-submit"]').attributes('disabled')).toBeDefined()
  })

  it('flags a duplicate email against the loaded list', async () => {
    listUsers.value = [{ email: 'taken@example.test' } as AdminUserListItem]
    const wrapper = await mountSuspended(UsersNew)
    await wrapper.find('#create_email').setValue('TAKEN@example.test')
    await wrapper.find('#create_display_name').setValue('Someone')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="form-submit"]').attributes('disabled')).toBeDefined()
    // duplicate copy differs from the format-invalid copy
    expect(wrapper.find('#create_email-error').exists()).toBe(true)
  })

  it('flags a malformed NIK (not 16 digits) and keeps submit disabled', async () => {
    const wrapper = await mountSuspended(UsersNew)
    await fillValid(wrapper)
    await wrapper.find('#create_nik').setValue('12345') // too short
    await wrapper.vm.$nextTick()
    expect(wrapper.find('#create_nik-error').exists()).toBe(true)
    expect(wrapper.find('[data-testid="form-submit"]').attributes('disabled')).toBeDefined()
  })

  it('clears the password + checklist when the local-account toggle goes off', async () => {
    const wrapper = await mountSuspended(UsersNew)
    await fillValid(wrapper)
    await wrapper.find('#create_password').setValue('short') // invalid → checklist + error
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-password-checklist]').exists()).toBe(true)
    await wrapper.find('[role="switch"]').trigger('click') // toggle local account OFF
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-password-checklist]').exists()).toBe(false)
    expect((wrapper.find('#create_password').element as HTMLInputElement | null)).toBeFalsy()
    // password no longer blocks submit once the local account is disabled
    expect(wrapper.find('[data-testid="form-submit"]').attributes('disabled')).toBeUndefined()
  })

  it('enables submit on a valid identity-only form (local account, no password)', async () => {
    const wrapper = await mountSuspended(UsersNew)
    await fillValid(wrapper)
    expect(wrapper.find('[data-testid="form-submit"]').attributes('disabled')).toBeUndefined()
  })
})

describe('users/new page — create privileged-action matrix', () => {
  it('4.1 success → create called with a normalized payload, then navigates to detail', async () => {
    const wrapper = await mountSuspended(UsersNew)
    await fillValid(wrapper)
    await wrapper.find('#create_password').setValue('Sup3rSecret!Pass')
    await wrapper.find('#create_nik').setValue('3201234567890001')
    await wrapper.vm.$nextTick()
    await wrapper.find('[data-testid="form-submit"]').trigger('click')
    await wrapper.vm.$nextTick()

    expect(createMock).toHaveBeenCalledTimes(1)
    const payload = createMock.mock.calls[0]![0]
    expect(payload.email).toBe('new.operator@example.test') // lowercased
    expect(payload.display_name).toBe('New Operator')
    expect(payload.role).toBe('user')
    expect(payload.local_account_enabled).toBe(true)
    expect(payload.password).toBe('Sup3rSecret!Pass')
    expect(payload.nik).toBe('3201234567890001')
    expect(navigateMock).toHaveBeenCalledWith({
      name: 'admin.users.detail',
      params: { subjectId: 'usr_new_42' },
    })
  })

  it('omits password from the payload when the local account is disabled', async () => {
    const wrapper = await mountSuspended(UsersNew)
    await fillValid(wrapper)
    await wrapper.find('#create_password').setValue('Sup3rSecret!Pass')
    await wrapper.find('[role="switch"]').trigger('click') // disable local account
    await wrapper.vm.$nextTick()
    await wrapper.find('[data-testid="form-submit"]').trigger('click')
    await wrapper.vm.$nextTick()
    const payload = createMock.mock.calls[0]![0]
    expect('password' in payload).toBe(false)
    expect(payload.local_account_enabled).toBe(false)
  })

  it('4.2 forbidden / 403 → forbidden surface, no navigation', async () => {
    runMock.mockImplementationOnce(async () => {
      status.value = 'forbidden'
      failure.value = { status: 'forbidden', requestId: 'admin-req-DENIED42', auditEventId: null, fieldErrors: {}, stepUpUrl: null }
      isSubmitting.value = false
      return null
    })
    const wrapper = await mountSuspended(UsersNew)
    await fillValid(wrapper)
    await wrapper.find('[data-testid="form-submit"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.findComponent(UiStatusView).props('tone')).toBe('forbidden')
    expect(navigateMock).not.toHaveBeenCalled()
    expect(wrapper.text()).not.toContain('admin-req-DENIED42') // redacted to REF-
    expect(wrapper.text()).toContain('REF-')
  })

  it('4.3 unauthenticated / 401 (and 419) → step-up tone surface', async () => {
    runMock.mockImplementationOnce(async () => {
      status.value = 'unauthenticated'
      failure.value = { status: 'unauthenticated', requestId: null, auditEventId: null, fieldErrors: {}, stepUpUrl: null }
      isSubmitting.value = false
      return null
    })
    const wrapper = await mountSuspended(UsersNew)
    await fillValid(wrapper)
    await wrapper.find('[data-testid="form-submit"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.findComponent(UiStatusView).props('tone')).toBe('step_up')
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('4.5 rate limit / 429 → safe rate-limited copy, no raw exception', async () => {
    runMock.mockImplementationOnce(async () => {
      status.value = 'rate_limited'
      failure.value = { status: 'rate_limited', requestId: 'admin-req-RL', auditEventId: null, fieldErrors: {}, stepUpUrl: null }
      isSubmitting.value = false
      return null
    })
    const wrapper = await mountSuspended(UsersNew)
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
        fieldErrors: { email: ['Email already registered.'], nip: ['NIP already registered.'] },
        stepUpUrl: null,
      }
      isSubmitting.value = false
      return null
    })
    const wrapper = await mountSuspended(UsersNew)
    await fillValid(wrapper)
    await wrapper.find('[data-testid="form-submit"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('#create_email-error').text()).toContain('Email already registered.')
    expect(wrapper.find('#create_nip-error').text()).toContain('NIP already registered.')
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('4.7 step-up / 428 → step-up notice + re-auth link to step_up_url, no navigation', async () => {
    runMock.mockImplementationOnce(async () => {
      status.value = 'step_up_required'
      stepUpUrl.value = '/auth/login?prompt=login&max_age=0'
      failure.value = { status: 'step_up_required', requestId: null, auditEventId: null, fieldErrors: {}, stepUpUrl: '/auth/login?prompt=login&max_age=0' }
      isSubmitting.value = false
      return null
    })
    const wrapper = await mountSuspended(UsersNew)
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
      failure.value = { status: 'error', requestId: 'admin-req-FAILED99', auditEventId: null, fieldErrors: {}, stepUpUrl: null }
      isSubmitting.value = false
      return null
    })
    const wrapper = await mountSuspended(UsersNew)
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
      failure.value = { status: 'error', requestId: null, auditEventId: null, fieldErrors: {}, stepUpUrl: null }
      isSubmitting.value = false
      return null
    })
    const wrapper = await mountSuspended(UsersNew)
    await fillValid(wrapper)
    await wrapper.find('[data-testid="form-submit"]').trigger('click')
    await wrapper.vm.$nextTick()
    const submit = wrapper.find('[data-testid="form-submit"]')
    expect(submit.attributes('disabled')).toBeUndefined()
    expect(submit.attributes('aria-busy')).toBeUndefined()
  })

  it('does nothing (no run, no create) when submit is invoked on an invalid form', async () => {
    const wrapper = await mountSuspended(UsersNew)
    // form is empty → invalid
    await wrapper.find('[data-testid="form-submit"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(runMock).not.toHaveBeenCalled()
    expect(createMock).not.toHaveBeenCalled()
  })

  it('never leaks a token or raw PII shape into the rendered output', async () => {
    const wrapper = await mountSuspended(UsersNew)
    await fillValid(wrapper)
    await wrapper.vm.$nextTick()
    const html = wrapper.html()
    expect(html).not.toMatch(/access_token|refresh_token|id_token|Bearer/)
    expect(html).not.toMatch(/\b\d{16}\b|\b\d{18}\b|\b\d{10}\b/) // raw NIK/NIP/NISN shapes
  })
})
```

3. [ ] Run it — expect **FAIL**: the stub `new.vue` renders only `<h1>New user</h1>`, so the form ids/testids and the `usePrivilegedAction` wiring are absent and nearly every assertion fails.

```
npm run test -- app/pages/__tests__/users-new.page.nuxt.spec.ts
```
Expected: suite runs, multiple failures (`Cannot read properties of undefined` / `find('#create_email')` returns an empty wrapper / `runMock` never called); 0 passed for the behavioural tests.

4. [ ] Write the minimal implementation — replace `app/pages/users/new.vue` entirely:

```vue
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Check, X } from 'lucide-vue-next'
import { useI18n } from '@/composables/useI18n'
import { useSessionStore } from '@/stores/session.store'
import { useUsersList } from '@/composables/useUsersList'
import { usePrivilegedAction } from '@/composables/usePrivilegedAction'
import { usersApi } from '@/services/users.api'
import {
  isValidEmail,
  isValidBirthDate,
  isValidNik,
  isValidNip,
  isValidNisn,
  normalizeEmail,
} from '@/lib/users/user-identifiers'
import {
  evaluateManagedUserPassword,
  type PasswordRequirementId,
} from '@/lib/users/managed-user-password-policy'
import type { CreateUserPayload } from '@/types/users.types'
import FormPageShell from '@/components/form/FormPageShell.vue'
import FormSection from '@/components/form/FormSection.vue'
import UiFormField from '@/components/ui/UiFormField.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiSelect, { type UiSelectOption } from '@/components/ui/UiSelect.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'

definePageMeta({
  name: 'admin.users.create',
  layout: 'admin',
  requiresAdmin: true,
  permissions: ['admin.users.write'],
})

const { t } = useI18n()
const store = useSessionStore()
const action = usePrivilegedAction<Awaited<ReturnType<typeof usersApi.create>>>()

// Duplicate-email guard: reuse the SSR list boundary (shared 'admin-users-list'
// asyncData cache). Only apply the guard when the operator may read users —
// the backend gates the list by admin role anyway; this just avoids surfacing a
// duplicate hint the operator cannot verify.
const { users } = useUsersList()
const canCheckDuplicates = computed(() => store.hasPermission('admin.users.read'))
const existingEmails = computed(
  () => new Set(users.value.map((u) => u.email.toLowerCase())),
)

// --- form state -------------------------------------------------------------
const email = ref('')
const givenName = ref('')
const familyName = ref('')
const displayName = ref('')
const role = ref<string>('user')
const isLocalAccountEnabled = ref(true)
const password = ref('')
const nik = ref('')
const nip = ref('')
const nisn = ref('')
const birthDate = ref('')
const isDisplayNameManual = ref(false)

const roleOptions = computed<readonly UiSelectOption[]>(() => [
  { value: 'user', label: t('users.role_user') },
  { value: 'admin', label: t('users.role_admin') },
  { value: 'pegawai', label: t('users.role_pegawai') },
])

// ponytail: two-line compose, not a shared module for a single caller.
function firstWord(value: string): string {
  return value.trim().split(/\s+/u).filter(Boolean)[0] ?? ''
}
const displayNamePreview = computed<string>(
  () => [firstWord(givenName.value), firstWord(familyName.value)].filter(Boolean).join(' ') || '—',
)
watch([givenName, familyName], () => {
  if (!isDisplayNameManual.value) {
    displayName.value = displayNamePreview.value === '—' ? '' : displayNamePreview.value
  }
})
watch(isLocalAccountEnabled, (enabled) => {
  if (!enabled) password.value = ''
})

const passwordRequirements = computed(() => evaluateManagedUserPassword(password.value))
function requirementLabel(id: PasswordRequirementId): string {
  // reuse the existing min/upper/lower/number/symbol keys; max_length is new.
  return id === 'min_length'
    ? t('users.password_requirement_length')
    : t(`users.password_requirement_${id}`)
}

// --- validation -------------------------------------------------------------
const serverFieldErrors = computed(() => action.fieldErrors.value)
function serverError(field: string): string | undefined {
  return serverFieldErrors.value[field]?.[0]
}

const emailError = computed<string | undefined>(() => {
  const value = email.value.trim().toLowerCase()
  if (!value) return serverError('email')
  if (!isValidEmail(value)) return t('users.validation_email')
  if (canCheckDuplicates.value && existingEmails.value.has(value)) {
    return t('users.validation_email_duplicate')
  }
  return serverError('email')
})
const displayNameError = computed<string | undefined>(() =>
  displayName.value.trim() === '' ? t('users.validation_display_name') : undefined,
)
const passwordError = computed<string | undefined>(() => {
  if (!isLocalAccountEnabled.value || password.value === '') return undefined
  return passwordRequirements.value.every((r) => r.met)
    ? undefined
    : t('users.validation_password')
})
const nikError = computed<string | undefined>(() =>
  nik.value.trim() !== '' && !isValidNik(nik.value.trim())
    ? t('users.validation_nik')
    : serverError('nik'),
)
const nipError = computed<string | undefined>(() =>
  nip.value.trim() !== '' && !isValidNip(nip.value.trim())
    ? t('users.validation_nip')
    : serverError('nip'),
)
const nisnError = computed<string | undefined>(() =>
  nisn.value.trim() !== '' && !isValidNisn(nisn.value.trim())
    ? t('users.validation_nisn')
    : serverError('nisn'),
)
const birthDateError = computed<string | undefined>(() =>
  birthDate.value.trim() !== '' && !isValidBirthDate(birthDate.value.trim())
    ? t('users.validation_birth_date')
    : serverError('birth_date'),
)

const isInvalid = computed<boolean>(() => {
  if (!email.value.trim() || !displayName.value.trim()) return true
  return Boolean(
    emailError.value ||
      displayNameError.value ||
      passwordError.value ||
      nikError.value ||
      nipError.value ||
      nisnError.value ||
      birthDateError.value,
  )
})

// --- failure surface (status mapping owned by usePrivilegedAction) ----------
const showFailure = computed<boolean>(() => {
  const s = action.status.value
  return s === 'forbidden' || s === 'unauthenticated' || s === 'step_up_required' || s === 'rate_limited' || s === 'error'
})
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
      return t('users.forbidden_title')
    case 'unauthenticated':
      return t('common.session_expired_title')
    case 'step_up_required':
      return t('users.step_up_required_title')
    case 'rate_limited':
      return t('users.rate_limited_title')
    default:
      return t('users.create_failed_title')
  }
})
const failureDescription = computed<string>(() => {
  switch (action.status.value) {
    case 'forbidden':
      return t('common.forbidden_desc')
    case 'unauthenticated':
      return t('common.session_expired_desc')
    case 'step_up_required':
      return t('users.step_up_required_desc')
    case 'rate_limited':
      return t('users.rate_limited_desc')
    default:
      return t('users.create_failed_desc')
  }
})

// --- submit -----------------------------------------------------------------
function buildPayload(): CreateUserPayload {
  const given = givenName.value.trim()
  const family = familyName.value.trim()
  const nikV = nik.value.trim()
  const nipV = nip.value.trim()
  const nisnV = nisn.value.trim()
  const birth = birthDate.value.trim()
  return {
    email: normalizeEmail(email.value),
    display_name: displayName.value.trim(),
    role: role.value as CreateUserPayload['role'],
    local_account_enabled: isLocalAccountEnabled.value,
    ...(given && { given_name: given }),
    ...(family && { family_name: family }),
    ...(isLocalAccountEnabled.value && password.value && { password: password.value }),
    ...(nikV && { nik: nikV }),
    ...(nipV && { nip: nipV }),
    ...(nisnV && { nisn: nisnV }),
    ...(birth && { birth_date: birth }),
  }
}

async function onSubmit(): Promise<void> {
  if (isInvalid.value || action.isSubmitting.value) return
  const created = await action.run(() => usersApi.create(buildPayload()))
  if (created) {
    await navigateTo({
      name: 'admin.users.detail',
      params: { subjectId: created.user.subject_id },
    })
  }
}

async function onCancel(): Promise<void> {
  await navigateTo({ name: 'admin.users' })
}
</script>

<template>
  <FormPageShell
    :parent-label="t('menu.users')"
    :active-label="t('common.btn_create')"
    :title="t('users.create_user_title')"
    :description="t('users.create_user_dialog_description')"
    :submit-label="t('users.btn_create_user')"
    :cancel-label="t('common.btn_cancel')"
    :is-submitting="action.isSubmitting.value"
    :is-invalid="isInvalid"
    @submit="onSubmit"
    @cancel="onCancel"
  >
    <UiStatusView
      v-if="showFailure"
      :tone="failureTone"
      :eyebrow="t('menu.users')"
      :title="failureTitle"
      :description="failureDescription"
      :request-id="action.requestId.value ?? undefined"
      :standalone="false"
    >
      <template v-if="action.stepUpUrl.value" #actions>
        <a
          class="users-new__step-up"
          :href="action.stepUpUrl.value"
          data-testid="step-up-link"
        >
          {{ t('users.btn_step_up') }}
        </a>
      </template>
    </UiStatusView>

    <FormSection :title="t('common.identity')">
      <UiFormField
        id="create_email"
        :label="t('users.label_email')"
        :error="emailError"
        required
      >
        <UiInput
          id="create_email"
          v-model="email"
          type="email"
          autocomplete="off"
          aria-describedby="create_email-error"
          :invalid="Boolean(emailError)"
        />
      </UiFormField>

      <div class="users-new__row">
        <UiFormField id="create_given_name" :label="t('users.label_given_name')">
          <UiInput id="create_given_name" v-model="givenName" autocomplete="off" />
        </UiFormField>
        <UiFormField id="create_family_name" :label="t('users.label_family_name')">
          <UiInput id="create_family_name" v-model="familyName" autocomplete="off" />
        </UiFormField>
      </div>

      <UiFormField
        id="create_display_name"
        :label="t('users.label_display_name')"
        :hint="t('users.label_display_name_preview') + ': ' + displayNamePreview"
        :error="displayNameError"
        required
      >
        <UiInput
          id="create_display_name"
          v-model="displayName"
          autocomplete="off"
          :invalid="Boolean(displayNameError)"
          @input="isDisplayNameManual = true"
        />
      </UiFormField>
    </FormSection>

    <FormSection :title="t('common.access')">
      <UiFormField id="create_role" :label="t('users.label_role')" required>
        <UiSelect id="create_role" v-model="role" :options="roleOptions" />
      </UiFormField>
    </FormSection>

    <FormSection
      :title="t('users.section_credentials_title')"
      :description="t('users.section_credentials_desc')"
    >
      <UiSwitch v-model="isLocalAccountEnabled" :label="t('users.label_local_account')" />

      <template v-if="isLocalAccountEnabled">
        <UiFormField
          id="create_password"
          :label="t('users.label_password')"
          :hint="t('users.label_password_helper')"
          :error="passwordError"
        >
          <UiInput
            id="create_password"
            v-model="password"
            type="password"
            autocomplete="new-password"
            :invalid="Boolean(passwordError)"
          />
        </UiFormField>

        <ul v-if="password" data-password-checklist aria-live="polite" class="users-new__checklist">
          <li
            v-for="requirement in passwordRequirements"
            :key="requirement.id"
            :data-met="requirement.met ? 'true' : 'false'"
            class="users-new__requirement"
          >
            <Check v-if="requirement.met" :size="14" aria-hidden="true" />
            <X v-else :size="14" aria-hidden="true" />
            {{ requirementLabel(requirement.id) }}
          </li>
        </ul>
      </template>
    </FormSection>

    <FormSection
      :title="t('users.section_identifiers_title')"
      :description="t('users.section_identifiers_desc')"
    >
      <div class="users-new__row">
        <UiFormField id="create_nik" :label="t('users.label_nik')" :error="nikError">
          <UiInput
            id="create_nik"
            v-model="nik"
            inputmode="numeric"
            autocomplete="off"
            :invalid="Boolean(nikError)"
          />
        </UiFormField>
        <UiFormField id="create_nip" :label="t('users.label_nip')" :error="nipError">
          <UiInput
            id="create_nip"
            v-model="nip"
            inputmode="numeric"
            autocomplete="off"
            :invalid="Boolean(nipError)"
          />
        </UiFormField>
      </div>
      <div class="users-new__row">
        <UiFormField id="create_nisn" :label="t('users.label_nisn')" :error="nisnError">
          <UiInput
            id="create_nisn"
            v-model="nisn"
            inputmode="numeric"
            autocomplete="off"
            :invalid="Boolean(nisnError)"
          />
        </UiFormField>
        <UiFormField
          id="create_birth_date"
          :label="t('users.label_birth_date')"
          :error="birthDateError"
        >
          <UiInput
            id="create_birth_date"
            v-model="birthDate"
            type="date"
            autocomplete="off"
            :invalid="Boolean(birthDateError)"
          />
        </UiFormField>
      </div>
    </FormSection>
  </FormPageShell>
</template>

<style scoped>
.users-new__row {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}
.users-new__checklist {
  display: grid;
  gap: 6px;
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
}
.users-new__requirement {
  display: flex;
  align-items: center;
  gap: 8px;
  font: 500 0.75rem/1.4 var(--font-sans);
  color: var(--fg-3);
}
.users-new__requirement[data-met='true'] {
  color: var(--success);
}
.users-new__step-up {
  font: 600 0.8125rem/1 var(--font-sans);
  color: var(--accent);
  text-decoration: underline;
}
</style>
```

   Notes: `UiFormField` renders the error region as `#{id}-error` with `role="alert"`, so binding `:error` is enough for the field-error assertions; the password checklist colours met requirements with `--success` and unmet with the neutral `--fg-3` (the destructive `--danger` red is **not** used here — this is a write, not a destructive action, so red stays reserved). The failure surface reuses `UiStatusView` (`:standalone="false"`) which already redacts the raw request id to `REF-XXXXXXXX` and never prints raw backend text.

5. [ ] Run it — expect **PASS**.

```
npm run test -- app/pages/__tests__/users-new.page.nuxt.spec.ts
```
Expected: `Test Files  1 passed (1)` · `Tests  16 passed (16)`.

6. [ ] Refactor check (no behaviour change): confirm the route-map invariant is intact and the new locale keys are at id↔en parity:

```
npm run test -- app/pages/__tests__/route-map.spec.ts
node -e "const id=require('./app/locales/id.json').users,en=require('./app/locales/en.json').users;const m=Object.keys(id).filter(k=>!(k in en)).concat(Object.keys(en).filter(k=>!(k in id)));console.log(m.length?'PARITY DRIFT: '+m.join(','):'parity OK')"
```
Expected: route-map green; `parity OK`. No other edits expected; if any, re-run step 5 and keep it green.

7. [ ] Commit (green only):

```
git add app/pages/users/new.vue app/pages/__tests__/users-new.page.nuxt.spec.ts app/locales/id.json app/locales/en.json
git commit -m "feat(sso-admin-frontend): Swiss create-user form page

Replace the users/new stub with FormPageShell + FormSection +
UiFormField/UiInput/UiSelect/UiSwitch: identity (lowercased email +
duplicate guard, composed display name, role select), an optional
local-account password with a live policy checklist cleared when the
toggle is off, and the net-new government identifiers (nik/nip/nisn/
birth_date) validated by the pure validators. Submit runs through the
shared usePrivilegedAction runner (create = write/step-up) so the full
failure matrix and step-up surface are honoured, and navigates to the
new user's detail route on success. FormPageShell isInvalid/isSubmitting
are bound so submit never leaves a stale loading state after an error.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

**Deliverable:** create-user form with identifier+password validation and the privileged-action submit matrix, all green.

**Task-scoped DoD (run from `services/sso-admin-frontend`):**
`npm run test -- app/pages/__tests__/users-new.page.nuxt.spec.ts app/pages/__tests__/route-map.spec.ts` green, then the file-scoped gate `npm run typecheck && npm run lint && npm run format:check` passes (full `npm run test && npm run build && npm run test:e2e` runs at the phase gate, Task 4.13).

---

### Task 4.11: Lifecycle/destructive actions + sync-profile update (wired into detail page)

Add the privileged-action surface to the detail page through **one** descriptor-driven component over the shared infra (Task 4.9), plus the sync-profile (update) form. A **pure** `user-actions.ts` table encodes each action's permission / freshness-implied confirm / reason-policy / danger flags (so it is unit-testable with zero Nuxt context); `UserLifecycleActions.vue` renders permission-gated buttons, opens `PrivilegedActionDialog` (impact summary + optional reason + step-up notice) for `confirmRequired` actions, runs the matching `usersApi` method through `usePrivilegedAction`, and on success emits `done()` so the page calls `useUserDetail.refresh()` (state is never left stale). Buttons for inapplicable transitions (e.g. `unlock` on an unlocked account) are disabled. The sync-profile form is mounted in the overview with identifier validation (Task 4.2), runs through its own `usePrivilegedAction` instance (write/step-up matrix honoured), and refreshes on success. Password-reset success renders **safe evidence copy only** — the reset token is never rendered (the backend emails it). The two new backend paths `require-mfa` / `unrequire-mfa` are added to the Nitro proxy allow-list (the other six lifecycle paths are already allow-listed).

The full privileged-action matrix lives on the shared infra (Task 4.9); here it is re-exercised at the **component boundary** to prove every failure status (`401/403/419/422/428/429/5xx` + step-up) surfaces safe copy + a redacted `REF-` reference in the dialog, leaves no stale loading, and that cancel calls no API.

**Files**
- Create: `app/lib/users/user-actions.ts`
- Create: `app/components/users/UserLifecycleActions.vue`
- Modify: `app/pages/users/[subjectId].vue` (mount `UserLifecycleActions` + the sync-profile form; wire `@done="refresh"`)
- Modify: `server/utils/admin-proxy.ts` (add `require-mfa` / `unrequire-mfa` to `ALLOWED_ADMIN_ROUTE_PATTERNS`)
- Modify: `app/locales/id.json`, `app/locales/en.json` (ADD only the genuinely-new keys below, to BOTH files, keep parity)
- Test: `app/lib/users/__tests__/user-actions.spec.ts`
- Test: `app/components/users/__tests__/UserLifecycleActions.spec.ts`
- Modify (extend): `server/__tests__/admin-proxy.spec.ts` (assert the two new paths build, are Bearer-injected, and map to backend)
- Modify (extend): `app/pages/__tests__/users-detail.page.nuxt.spec.ts` (actions mount when permitted; `done` triggers `refresh`; no raw PII in SSR HTML)

**Interfaces**
- Consumes:
  - `usePrivilegedAction` + `PrivilegedActionDialog` (Task 4.9)
  - `usersApi.lock` / `unlock` / `deactivate` / `reactivate` / `resetMfa` / `issuePasswordReset` / `requireMfa` / `unrequireMfa` / `syncProfile` (Task 4.3)
  - `AdminUserDetail`, `ReasonPayload`, `LockPayload`, `SyncProfilePayload` (Task 4.1)
  - `isValidEmail` / `normalizeEmail` / `isValidNik` / `isValidNip` / `isValidNisn` / `isValidBirthDate` (Task 4.2)
  - `useSessionStore().hasPermission` (`@/stores/session.store`)
  - `useUserDetail().refresh` (via the page — Task 4.7)
  - `useI18n` (`@/composables/useI18n`); `UiButton` / `UiFormField` / `UiInput` (`@/components/ui/*`)
  - `server/utils/admin-proxy.ts` allow-list (`SUBJECT_ID_PATTERN`, `ALLOWED_ADMIN_ROUTE_PATTERNS`)
- Produces (`app/lib/users/user-actions.ts`):
  - `type UserActionId = 'lock' | 'unlock' | 'deactivate' | 'reactivate' | 'reset_mfa' | 'password_reset' | 'require_mfa' | 'unrequire_mfa'`
  - `type ReasonPolicy = { readonly required: boolean; readonly min?: number; readonly max: number } | null`
  - `type UserActionDescriptor = { readonly id: UserActionId; readonly permission: 'admin.users.write' | 'admin.users.lock'; readonly confirmRequired: boolean; readonly reason: ReasonPolicy; readonly danger: boolean }`
  - `const USER_ACTIONS: Readonly<Record<UserActionId, UserActionDescriptor>>`
  - `function isReasonValid(policy: ReasonPolicy, value: string): boolean`
- Produces (`app/components/users/UserLifecycleActions.vue`):
  - Props: `{ user: AdminUserDetail }`; Emits: `done()` (fires after any successful action so the page refreshes detail)

**Steps**

1. [ ] **RED — pure descriptor table.** Write `app/lib/users/__tests__/user-actions.spec.ts` asserting the descriptor flags from the backend contract (extract-backend §2: lock/unlock/require/unrequire = `admin.users.lock` + step-up; deactivate/reactivate/reset-mfa/password-reset = `admin.users.write`; reset-mfa reason `min:8 max:240`; lock/deactivate/require/unrequire reason `max:255`; reactivate/password-reset carry no reason) and the `isReasonValid` policy:

```ts
import { describe, expect, it } from 'vitest'
import { USER_ACTIONS, isReasonValid, type UserActionId } from '../user-actions'

describe('USER_ACTIONS descriptor table', () => {
  it('maps each lifecycle action to its backend permission', () => {
    expect(USER_ACTIONS.lock.permission).toBe('admin.users.lock')
    expect(USER_ACTIONS.unlock.permission).toBe('admin.users.lock')
    expect(USER_ACTIONS.require_mfa.permission).toBe('admin.users.lock')
    expect(USER_ACTIONS.unrequire_mfa.permission).toBe('admin.users.lock')
    expect(USER_ACTIONS.deactivate.permission).toBe('admin.users.write')
    expect(USER_ACTIONS.reactivate.permission).toBe('admin.users.write')
    expect(USER_ACTIONS.reset_mfa.permission).toBe('admin.users.write')
    expect(USER_ACTIONS.password_reset.permission).toBe('admin.users.write')
  })

  it('flags the destructive affordances as danger, the routine restorations as not', () => {
    const danger: UserActionId[] = ['lock', 'deactivate', 'reset_mfa', 'password_reset', 'require_mfa']
    for (const id of danger) expect(USER_ACTIONS[id].danger).toBe(true)
    expect(USER_ACTIONS.unlock.danger).toBe(false)
    expect(USER_ACTIONS.reactivate.danger).toBe(false)
    expect(USER_ACTIONS.unrequire_mfa.danger).toBe(false)
  })

  it('requires confirmation for every action except the no-reason restorations', () => {
    expect(USER_ACTIONS.unlock.confirmRequired).toBe(false)
    expect(USER_ACTIONS.reactivate.confirmRequired).toBe(false)
    for (const id of ['lock', 'deactivate', 'reset_mfa', 'password_reset', 'require_mfa', 'unrequire_mfa'] as UserActionId[])
      expect(USER_ACTIONS[id].confirmRequired).toBe(true)
  })

  it('encodes the backend reason rules', () => {
    expect(USER_ACTIONS.lock.reason).toEqual({ required: true, max: 255 })
    expect(USER_ACTIONS.unlock.reason).toEqual({ required: false, max: 255 })
    expect(USER_ACTIONS.reset_mfa.reason).toEqual({ required: true, min: 8, max: 240 })
    expect(USER_ACTIONS.reactivate.reason).toBeNull()
    expect(USER_ACTIONS.password_reset.reason).toBeNull()
  })

  it('every id is its own key (no descriptor drift)', () => {
    for (const id of Object.keys(USER_ACTIONS) as UserActionId[]) expect(USER_ACTIONS[id].id).toBe(id)
  })
})

describe('isReasonValid', () => {
  it('treats a null policy as always valid', () => {
    expect(isReasonValid(null, '')).toBe(true)
    expect(isReasonValid(null, 'anything')).toBe(true)
  })
  it('rejects empty/whitespace when required, accepts empty when optional', () => {
    expect(isReasonValid({ required: true, max: 255 }, '')).toBe(false)
    expect(isReasonValid({ required: true, max: 255 }, '   ')).toBe(false)
    expect(isReasonValid({ required: true, max: 255 }, 'Compromised credential')).toBe(true)
    expect(isReasonValid({ required: false, max: 255 }, '')).toBe(true)
  })
  it('enforces min and max length on the trimmed value', () => {
    expect(isReasonValid({ required: true, min: 8, max: 240 }, 'short')).toBe(false)
    expect(isReasonValid({ required: true, min: 8, max: 240 }, 'long enough reason')).toBe(true)
    expect(isReasonValid({ required: true, max: 255 }, 'x'.repeat(256))).toBe(false)
    expect(isReasonValid({ required: false, max: 255 }, 'x'.repeat(256))).toBe(false)
  })
})
```

2. [ ] **Run it — expect FAIL** (module missing):

```bash
npm run test -- app/lib/users/__tests__/user-actions.spec.ts
```
Expected: `Error: Failed to load url ../user-actions` / `USER_ACTIONS is not defined` — RED.

3. [ ] **GREEN — write `app/lib/users/user-actions.ts`** (pure, no imports):

```ts
export type UserActionId =
  | 'lock'
  | 'unlock'
  | 'deactivate'
  | 'reactivate'
  | 'reset_mfa'
  | 'password_reset'
  | 'require_mfa'
  | 'unrequire_mfa'

export type ReasonPolicy = { readonly required: boolean; readonly min?: number; readonly max: number } | null

export type UserActionDescriptor = {
  readonly id: UserActionId
  readonly permission: 'admin.users.write' | 'admin.users.lock'
  readonly confirmRequired: boolean
  readonly reason: ReasonPolicy
  readonly danger: boolean
}

export const USER_ACTIONS: Readonly<Record<UserActionId, UserActionDescriptor>> = {
  lock: { id: 'lock', permission: 'admin.users.lock', confirmRequired: true, reason: { required: true, max: 255 }, danger: true },
  unlock: { id: 'unlock', permission: 'admin.users.lock', confirmRequired: false, reason: { required: false, max: 255 }, danger: false },
  deactivate: { id: 'deactivate', permission: 'admin.users.write', confirmRequired: true, reason: { required: true, max: 255 }, danger: true },
  reactivate: { id: 'reactivate', permission: 'admin.users.write', confirmRequired: false, reason: null, danger: false },
  reset_mfa: { id: 'reset_mfa', permission: 'admin.users.write', confirmRequired: true, reason: { required: true, min: 8, max: 240 }, danger: true },
  password_reset: { id: 'password_reset', permission: 'admin.users.write', confirmRequired: true, reason: null, danger: true },
  require_mfa: { id: 'require_mfa', permission: 'admin.users.lock', confirmRequired: true, reason: { required: true, max: 255 }, danger: true },
  unrequire_mfa: { id: 'unrequire_mfa', permission: 'admin.users.lock', confirmRequired: true, reason: { required: true, max: 255 }, danger: false },
}

export function isReasonValid(policy: ReasonPolicy, value: string): boolean {
  if (policy === null) return true
  const trimmed = value.trim()
  if (trimmed.length === 0) return !policy.required
  if (policy.min !== undefined && trimmed.length < policy.min) return false
  return trimmed.length <= policy.max
}
```

4. [ ] **Run it — expect PASS:**

```bash
npm run test -- app/lib/users/__tests__/user-actions.spec.ts
```
Expected: all `user-actions.spec.ts` tests green.

5. [ ] **RED — proxy allow-list.** Extend `server/__tests__/admin-proxy.spec.ts` with two cases (mirror the existing `lock` case at lines 30–45) asserting the new paths build, map to backend, and inject the server Bearer:

```ts
  it('allows POST /api/admin/users/:sub/require-mfa through the admin BFF API proxy', () => {
    const request = buildAdminApiRequest({
      internalBaseUrl: 'https://backend.internal',
      pathname: '/api/admin/users/sub_admin/require-mfa',
      search: '',
      method: 'POST',
      headers: { accept: 'application/json', 'x-request-id': 'req-rmfa' },
      session,
    })
    expect(request.url).toBe('https://backend.internal/admin/api/users/sub_admin/require-mfa')
    expect(headers(request).get('Authorization')).toBe('Bearer access-token-admin')
  })

  it('allows POST /api/admin/users/:sub/unrequire-mfa through the admin BFF API proxy', () => {
    const request = buildAdminApiRequest({
      internalBaseUrl: 'https://backend.internal',
      pathname: '/api/admin/users/sub_admin/unrequire-mfa',
      search: '',
      method: 'POST',
      headers: { accept: 'application/json', 'x-request-id': 'req-urmfa' },
      session,
    })
    expect(request.url).toBe('https://backend.internal/admin/api/users/sub_admin/unrequire-mfa')
    expect(headers(request).get('Authorization')).toBe('Bearer access-token-admin')
  })
```

6. [ ] **Run it — expect FAIL** (proxy rejects unlisted path):

```bash
npm run test -- server/__tests__/admin-proxy.spec.ts
```
Expected: `Admin API proxy method is not allowed.` (or `... path is not allowed.`) thrown — RED.

7. [ ] **GREEN — add the two patterns** to `ALLOWED_ADMIN_ROUTE_PATTERNS` in `server/utils/admin-proxy.ts`, immediately after the `sync-profile` entry (line 75):

```ts
  new RegExp(`^POST /api/admin/users/${SUBJECT_ID_PATTERN}/require-mfa$`, 'u'),
  new RegExp(`^POST /api/admin/users/${SUBJECT_ID_PATTERN}/unrequire-mfa$`, 'u'),
```

8. [ ] **Run it — expect PASS:**

```bash
npm run test -- server/__tests__/admin-proxy.spec.ts
```
Expected: both new cases + all existing proxy cases green.

9. [ ] **ADD locale keys** (BOTH `app/locales/id.json` and `app/locales/en.json`, inside the existing `users` object — reuse `btn_lock`/`btn_unlock`/`btn_deactivate`/`btn_reactivate`/`btn_reset_mfa`/`btn_issue_reset`/`btn_sync_profile`, `confirm_lock_*`/`confirm_deactivate_*`/`confirm_reset_mfa_*`/`confirm_password_reset_*`, `label_reason`, `sync_profile_title`, `password_reset_evidence`, and the `field_nik`/`field_nip`/`field_nisn`/`field_birth_date` keys added in Task 4.8; ADD only these net-new keys for the require/unrequire-MFA actions, the sync-profile success toast, the sync-profile field labels, the no-permission empty hint, and a shared generic-error string):

  - `users.btn_require_mfa` — en: `"Require MFA"`, id: `"Wajibkan MFA"`
  - `users.btn_unrequire_mfa` — en: `"Remove MFA requirement"`, id: `"Cabut kewajiban MFA"`
  - `users.confirm_require_mfa_title` — en: `"Require MFA for this account?"`, id: `"Wajibkan MFA untuk akun ini?"`
  - `users.confirm_require_mfa_desc` — en: `"The account will be forced to enrol multi-factor authentication before the next sign-in completes."`, id: `"Akun akan diwajibkan mendaftarkan autentikasi multi-faktor sebelum proses masuk berikutnya selesai."`
  - `users.confirm_unrequire_mfa_title` — en: `"Remove the MFA requirement?"`, id: `"Cabut kewajiban MFA?"`
  - `users.confirm_unrequire_mfa_desc` — en: `"Multi-factor authentication will no longer be mandatory for this account."`, id: `"Autentikasi multi-faktor tidak lagi diwajibkan untuk akun ini."`
  - `users.update_profile_title` — en: `"Update profile"`, id: `"Perbarui profil"`
  - `users.update_profile_desc` — en: `"Change identifiers and profile fields. Government identifiers are validated before submission."`, id: `"Ubah pengenal dan kolom profil. Pengenal kependudukan divalidasi sebelum dikirim."`
  - `users.update_profile_success` — en: `"Profile updated."`, id: `"Profil diperbarui."`
  - `users.actions_none` — en: `"You do not have permission to manage this account."`, id: `"Anda tidak memiliki izin untuk mengelola akun ini."`
  - `users.field_email` — en: `"Email"`, id: `"Email"`
  - `users.field_display_name` — en: `"Display name"`, id: `"Nama tampilan"`
  - `common.error_generic` (ADD to the **`common`** block of BOTH files, not `users`) — en: `"Something went wrong. Please try again."`, id: `"Terjadi kesalahan. Silakan coba lagi."`

   Verify parity after editing — diff **both** the `users` and `common` namespaces (the sync-profile form binds `common.error_generic`, so parity must cover `common` too):

```bash
node -e "const id=require('./app/locales/id.json'),en=require('./app/locales/en.json');const diff=(a,b)=>[...Object.keys(a).filter(k=>!(k in b)),...Object.keys(b).filter(k=>!(k in a))];const d=[...diff(id.users,en.users).map(k=>'users.'+k),...diff(id.common,en.common).map(k=>'common.'+k)];if(d.length){console.error('MISMATCH',d);process.exit(1)}console.log('locale parity OK')"
```
Expected: `locale parity OK`.

10. [ ] **RED — component.** Write `app/components/users/__tests__/UserLifecycleActions.spec.ts` (plain jsdom spec; mocks the composable + service + store + i18n; stubs the dialog). It covers permission gating, applicability disabling, confirm-vs-direct flow, cancel-calls-no-API, success → `done` emit, password-reset safe-evidence-only, and the **full privileged-action failure matrix** surfaced at the component boundary:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { computed, ref } from 'vue'
import UserLifecycleActions from '../UserLifecycleActions.vue'
import type { PrivilegedActionFailure } from '@/lib/users/privileged-action'

const usersApi = {
  lock: vi.fn(), unlock: vi.fn(), deactivate: vi.fn(), reactivate: vi.fn(),
  resetMfa: vi.fn(), issuePasswordReset: vi.fn(), requireMfa: vi.fn(),
  unrequireMfa: vi.fn(), syncProfile: vi.fn(),
}
vi.mock('@/services/users.api', () => ({ usersApi }))

let permitted: string[] = []
vi.mock('@/stores/session.store', () => ({
  useSessionStore: () => ({ hasPermission: (p: string) => permitted.includes(p) }),
}))
vi.mock('@/composables/useI18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

// Controllable privileged-action runner double.
const isSubmitting = ref(false)
const failure = ref<PrivilegedActionFailure | null>(null)
const runImpl = vi.fn(async (fn: () => Promise<unknown>) => fn())
vi.mock('@/composables/usePrivilegedAction', () => ({
  usePrivilegedAction: () => ({
    status: ref('idle'),
    isSubmitting,
    failure,
    // Reactive computeds (mirror Task 4.10's mock): static `ref(failure.value?…)`
    // would be evaluated once at setup (failure null) and never update after
    // runImpl sets failure.value, so the REF/step-up bindings would stay empty.
    requestId: computed(() => failure.value?.requestId ?? null),
    auditEventId: computed(() => failure.value?.auditEventId ?? null),
    fieldErrors: computed(() => failure.value?.fieldErrors ?? {}),
    stepUpUrl: computed(() => failure.value?.stepUpUrl ?? null),
    run: runImpl,
    reset: () => { failure.value = null; isSubmitting.value = false },
  }),
}))

const user = {
  id: 1, subject_id: 'sub_target', email: 'target@example.test', display_name: 'Target',
  effective_status: 'active', local_account_enabled: true, mfa_enrolled: true, mfa_mandatory: false,
  nik: '1234********3456', nip: null, nisn: null, birth_date: '****-**-15', roles: [],
} as unknown as import('@/types/users.types').AdminUserDetail

const DialogStub = {
  name: 'PrivilegedActionDialog',
  props: ['open', 'title', 'description', 'danger', 'reasonRequired', 'reasonMin', 'reasonMax', 'reason', 'submitting', 'stepUpUrl', 'errorMessage', 'requestId'],
  emits: ['confirm', 'cancel', 'update:reason'],
  template: `<div v-if="open" data-testid="dialog" :data-danger="danger">
    <p data-testid="dialog-desc">{{ description }}</p>
    <p data-testid="dialog-error">{{ errorMessage }}</p>
    <p data-testid="dialog-ref">{{ requestId }}</p>
    <button data-testid="dialog-confirm" @click="$emit('confirm')">confirm</button>
    <button data-testid="dialog-cancel" @click="$emit('cancel')">cancel</button>
  </div>`,
}

function mountActions() {
  return mount(UserLifecycleActions, {
    props: { user },
    global: { stubs: { PrivilegedActionDialog: DialogStub }, renderStubDefaultSlot: true },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  permitted = ['admin.users.write', 'admin.users.lock']
  isSubmitting.value = false
  failure.value = null
  runImpl.mockImplementation(async (fn: () => Promise<unknown>) => fn())
})

describe('UserLifecycleActions — permission gating', () => {
  it('renders only buttons the operator is permitted to use', () => {
    permitted = ['admin.users.write']
    const w = mountActions()
    expect(w.find('[data-action="deactivate"]').exists()).toBe(true)
    expect(w.find('[data-action="lock"]').exists()).toBe(false) // needs admin.users.lock
  })
  it('shows the no-permission hint when nothing is permitted', () => {
    permitted = []
    expect(mountActions().text()).toContain('users.actions_none')
  })
})

describe('UserLifecycleActions — applicability', () => {
  it('disables unlock on an unlocked account and lock is enabled', () => {
    const w = mountActions()
    expect(w.find('[data-action="unlock"]').attributes('disabled')).toBeDefined()
    expect(w.find('[data-action="lock"]').attributes('disabled')).toBeUndefined()
  })
})

describe('UserLifecycleActions — confirm vs direct', () => {
  it('opens the confirm dialog for a confirmRequired action and does NOT call the API yet', async () => {
    const w = mountActions()
    await w.find('[data-action="deactivate"]').trigger('click')
    expect(w.find('[data-testid="dialog"]').exists()).toBe(true)
    expect(usersApi.deactivate).not.toHaveBeenCalled()
  })
  it('runs a no-confirm action directly with no dialog', async () => {
    permitted = ['admin.users.lock']
    const locked = { ...user, effective_status: 'locked' } as typeof user
    const w = mount(UserLifecycleActions, { props: { user: locked }, global: { stubs: { PrivilegedActionDialog: DialogStub } } })
    await w.find('[data-action="unlock"]').trigger('click')
    expect(w.find('[data-testid="dialog"]').exists()).toBe(false)
    expect(usersApi.unlock).toHaveBeenCalledWith('sub_target', { reason: '' })
  })
})

describe('UserLifecycleActions — destructive confirm', () => {
  it('marks the danger dialog and calls the API only on confirm', async () => {
    const w = mountActions()
    await w.find('[data-action="lock"]').trigger('click')
    expect(w.find('[data-testid="dialog"]').attributes('data-danger')).toBe('true')
    await w.find('[data-testid="dialog-confirm"]').trigger('click')
    expect(usersApi.lock).toHaveBeenCalledTimes(1)
  })
  it('cancel closes the dialog and calls NO api (4.matrix: cancel calls no API)', async () => {
    const w = mountActions()
    await w.find('[data-action="deactivate"]').trigger('click')
    await w.find('[data-testid="dialog-cancel"]').trigger('click')
    expect(w.find('[data-testid="dialog"]').exists()).toBe(false)
    expect(usersApi.deactivate).not.toHaveBeenCalled()
  })
})

describe('UserLifecycleActions — success (4.1)', () => {
  it('emits done after a successful action so the page refreshes', async () => {
    const w = mountActions()
    await w.find('[data-action="deactivate"]').trigger('click')
    await w.find('[data-testid="dialog-confirm"]').trigger('click')
    await w.vm.$nextTick()
    expect(w.emitted('done')).toHaveLength(1)
  })
  it('shows password-reset safe evidence only — never a token (PII discipline)', async () => {
    usersApi.issuePasswordReset.mockResolvedValue({
      user, password_reset: { expires_at: '2026-06-29T00:00:00Z' }, delivery_status: 'queued',
    })
    const w = mountActions()
    await w.find('[data-action="password_reset"]').trigger('click')
    await w.find('[data-testid="dialog-confirm"]').trigger('click')
    await w.vm.$nextTick()
    expect(w.text()).toContain('users.password_reset_evidence')
    expect(w.text()).not.toMatch(/eyJ|Bearer|reset[_-]?token/i)
  })
})

describe('UserLifecycleActions — failure matrix (4.2–4.8, 4.9, 4.10)', () => {
  const cases: { status: PrivilegedActionFailure['status']; stepUpUrl: string | null }[] = [
    { status: 'forbidden', stepUpUrl: null },        // 4.2 / 403
    { status: 'unauthenticated', stepUpUrl: null },  // 4.3 / 401 + 4.4 / 419
    { status: 'rate_limited', stepUpUrl: null },     // 4.5 / 429
    { status: 'invalid', stepUpUrl: null },          // 4.6 / 422
    { status: 'step_up_required', stepUpUrl: '/auth/login?prompt=login' }, // 4.7 / 428
    { status: 'error', stepUpUrl: null },            // 4.8 / 5xx
  ]
  for (const c of cases) {
    it(`surfaces ${c.status} safely with a redacted reference and no stale loading`, async () => {
      runImpl.mockImplementation(async () => {
        failure.value = { status: c.status, requestId: 'req-abc12345', auditEventId: 'aud-1', fieldErrors: {}, stepUpUrl: c.stepUpUrl }
        isSubmitting.value = false // 4.10: never left submitting after error
        return null
      })
      const w = mountActions()
      await w.find('[data-action="deactivate"]').trigger('click')
      await w.find('[data-testid="dialog-confirm"]').trigger('click')
      await w.vm.$nextTick()
      expect(w.find('[data-testid="dialog"]').exists()).toBe(true) // dialog stays open to show the failure
      expect(w.find('[data-testid="dialog-ref"]').text()).toBe('req-abc12345')
      expect(w.emitted('done')).toBeUndefined() // no refresh on failure
      expect(isSubmitting.value).toBe(false)
    })
  }
})

describe('UserLifecycleActions — direct-action failure surface (B6: 428 step-up + 5xx never swallowed)', () => {
  // `unlock` (admin.users.lock + step_up) and `reactivate` (admin.users.write) run
  // via `void execute(id)` with NO dialog. Before the fix their failures surfaced
  // ONLY through PrivilegedActionDialog (which renders only when activeAction!==null),
  // so a 428 step-up / 5xx was silently swallowed. They must reach an inline banner.
  const directCases: { id: UserActionId; effective: string }[] = [
    { id: 'unlock', effective: 'locked' },
    { id: 'reactivate', effective: 'deactivated' },
  ]
  const failures: { status: PrivilegedActionFailure['status']; stepUpUrl: string | null }[] = [
    { status: 'step_up_required', stepUpUrl: '/auth/login?prompt=login&max_age=0' }, // 428
    { status: 'error', stepUpUrl: null }, // 5xx
  ]
  for (const dc of directCases) {
    for (const f of failures) {
      it(`surfaces ${f.status} from the direct ${dc.id} action via an inline banner`, async () => {
        permitted = ['admin.users.write', 'admin.users.lock']
        runImpl.mockImplementation(async () => {
          failure.value = { status: f.status, requestId: 'req-direct-77881122', auditEventId: 'aud-9', fieldErrors: {}, stepUpUrl: f.stepUpUrl }
          isSubmitting.value = false // 4.10: never left submitting after error
          return null
        })
        const target = { ...user, effective_status: dc.effective } as typeof user
        const w = mount(UserLifecycleActions, {
          props: { user: target },
          global: { stubs: { PrivilegedActionDialog: DialogStub } },
        })
        await w.find(`[data-action="${dc.id}"]`).trigger('click')
        await w.vm.$nextTick()
        expect(runImpl).toHaveBeenCalledTimes(1)
        expect(w.find('[data-testid="dialog"]').exists()).toBe(false) // direct action: never a dialog
        const banner = w.find('[data-testid="lifecycle-direct-failure"]')
        expect(banner.exists()).toBe(true)
        expect(banner.text()).toContain('REF-') // redacted reference only
        expect(w.text()).not.toContain('req-direct-77881122') // raw correlation id never rendered
        expect(w.text()).not.toMatch(/acr|urn:|stack|trace|eyJ/i) // no raw ACR/trace leak
        if (f.status === 'step_up_required') {
          const link = w.find('[data-testid="lifecycle-direct-stepup-link"]')
          expect(link.exists()).toBe(true)
          expect(link.attributes('href')).toBe('/auth/login?prompt=login&max_age=0')
        }
        expect(w.emitted('done')).toBeUndefined()
        expect(isSubmitting.value).toBe(false)
      })
    }
  }
})

describe('UserLifecycleActions — sync-profile failure (one representative case)', () => {
  // The lifecycle loop already drives every status through the shared 4.9
  // runner + surfaces; the sync-profile form runs through its own instance of the
  // SAME runner, so a single representative failure proves it is wired safely.
  it('surfaces a sync-profile failure with safe copy + REF and no stale loading', async () => {
    runImpl.mockImplementation(async () => {
      failure.value = { status: 'error', requestId: 'req-profile-55667788', auditEventId: null, fieldErrors: {}, stepUpUrl: null }
      isSubmitting.value = false
      return null
    })
    const w = mountActions()
    await w.find('#profile-display-name').setValue('Renamed Operator')
    await w.find('[data-testid="sync-profile-form"]').trigger('submit')
    await w.vm.$nextTick()
    expect(runImpl).toHaveBeenCalledTimes(1)
    const error = w.find('[data-testid="profile-error"]')
    expect(error.exists()).toBe(true)
    expect(error.text()).toContain('common.error_generic')
    expect(w.text()).toContain('REF-')
    expect(w.text()).not.toContain('req-profile-55667788')
    expect(w.emitted('done')).toBeUndefined()
    expect(isSubmitting.value).toBe(false)
  })
})
```

11. [ ] **Run it — expect FAIL** (component missing):

```bash
npm run test -- app/components/users/__tests__/UserLifecycleActions.spec.ts
```
Expected: `Failed to resolve import "../UserLifecycleActions.vue"` — RED.

12. [ ] **GREEN — write `app/components/users/UserLifecycleActions.vue`:**

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import type { AdminUserDetail, ReasonPayload, SyncProfilePayload } from '@/types/users.types'
import { USER_ACTIONS, isReasonValid, type UserActionId } from '@/lib/users/user-actions'
import { usePrivilegedAction } from '@/composables/usePrivilegedAction'
import PrivilegedActionDialog from '@/components/users/PrivilegedActionDialog.vue'
import { usersApi } from '@/services/users.api'
import { useSessionStore } from '@/stores/session.store'
import { useI18n } from '@/composables/useI18n'
import { formatSupportReference } from '@/lib/display-identifiers'
import {
  isValidBirthDate,
  isValidEmail,
  isValidNik,
  isValidNip,
  isValidNisn,
  normalizeEmail,
} from '@/lib/users/user-identifiers'
import UiButton from '@/components/ui/UiButton.vue'
import UiFormField from '@/components/ui/UiFormField.vue'
import UiInput from '@/components/ui/UiInput.vue'

const props = defineProps<{ user: AdminUserDetail }>()
const emit = defineEmits<{ done: [] }>()

const session = useSessionStore()
const { t } = useI18n()
const action = usePrivilegedAction<unknown>()
const profile = usePrivilegedAction<unknown>()

const activeAction = ref<UserActionId | null>(null)
const reason = ref('')
const passwordResetEvidence = ref<string | null>(null)

// The DIRECT (no-confirm) actions never open the dialog, so their failures need
// their own inline surface; the sync-profile form runs through `profile`. Both
// render only the redacted REF, never the raw correlation id.
const showDirectFailure = computed(() => action.failure.value !== null && activeAction.value === null)
const directFailureRef = computed(() => formatSupportReference(action.requestId.value))
const profileFailureRef = computed(() => formatSupportReference(profile.requestId.value))

// i18n key maps (reuse existing users.* keys; require/unrequire-MFA are new in this task).
const BTN_KEY: Record<UserActionId, string> = {
  lock: 'btn_lock', unlock: 'btn_unlock', deactivate: 'btn_deactivate', reactivate: 'btn_reactivate',
  reset_mfa: 'btn_reset_mfa', password_reset: 'btn_issue_reset', require_mfa: 'btn_require_mfa',
  unrequire_mfa: 'btn_unrequire_mfa',
}
const CONFIRM_KEY: Partial<Record<UserActionId, string>> = {
  lock: 'lock', deactivate: 'deactivate', reset_mfa: 'reset_mfa', password_reset: 'password_reset',
  require_mfa: 'require_mfa', unrequire_mfa: 'unrequire_mfa',
}

const visibleActions = computed(() =>
  (Object.keys(USER_ACTIONS) as UserActionId[]).filter((id) =>
    session.hasPermission(USER_ACTIONS[id].permission),
  ),
)
const hasAnyAction = computed(() => visibleActions.value.length > 0)

function isApplicable(id: UserActionId): boolean {
  const u = props.user
  switch (id) {
    case 'lock': return u.effective_status !== 'locked'
    case 'unlock': return u.effective_status === 'locked'
    case 'deactivate': return u.effective_status !== 'deactivated' && u.effective_status !== 'disabled'
    case 'reactivate': return u.effective_status === 'deactivated' || u.effective_status === 'disabled'
    case 'reset_mfa': return u.mfa_enrolled
    case 'password_reset': return u.local_account_enabled
    case 'require_mfa': return !u.mfa_mandatory
    case 'unrequire_mfa': return u.mfa_mandatory
  }
}

const activeDescriptor = computed(() => (activeAction.value ? USER_ACTIONS[activeAction.value] : null))
const dialogTitle = computed(() =>
  activeAction.value && CONFIRM_KEY[activeAction.value]
    ? t(`users.confirm_${CONFIRM_KEY[activeAction.value]}_title`)
    : '',
)
const dialogDescription = computed(() =>
  activeAction.value && CONFIRM_KEY[activeAction.value]
    ? t(`users.confirm_${CONFIRM_KEY[activeAction.value]}_desc`)
    : '',
)

function callApi(id: UserActionId): Promise<unknown> {
  const sub = props.user.subject_id
  const payload: ReasonPayload = { reason: reason.value.trim() }
  switch (id) {
    case 'lock': return usersApi.lock(sub, payload)
    case 'unlock': return usersApi.unlock(sub, payload)
    case 'deactivate': return usersApi.deactivate(sub, payload)
    case 'reactivate': return usersApi.reactivate(sub)
    case 'reset_mfa': return usersApi.resetMfa(sub, payload)
    case 'password_reset': return usersApi.issuePasswordReset(sub)
    case 'require_mfa': return usersApi.requireMfa(sub, payload)
    case 'unrequire_mfa': return usersApi.unrequireMfa(sub, payload)
  }
}

async function execute(id: UserActionId): Promise<void> {
  passwordResetEvidence.value = null
  const result = await action.run(() => callApi(id))
  // Failure is surfaced safely: the dialog (confirm actions) or the inline banner
  // (direct actions — activeAction stays null) shows safe copy + REF + step-up link.
  if (result === null) return
  activeAction.value = null
  reason.value = ''
  if (id === 'password_reset') passwordResetEvidence.value = t('users.password_reset_evidence')
  emit('done')
}

function onTrigger(id: UserActionId): void {
  action.reset()
  reason.value = ''
  if (USER_ACTIONS[id].confirmRequired) {
    activeAction.value = id
    return
  }
  void execute(id)
}

function onConfirm(): void {
  if (activeAction.value) void execute(activeAction.value)
}

function onCancel(): void {
  activeAction.value = null
  reason.value = ''
  action.reset()
}

// ── sync-profile (update) ──────────────────────────────────────────────────
const canWrite = computed(() => session.hasPermission('admin.users.write'))
const form = ref({ email: '', display_name: '', given_name: '', family_name: '', nik: '', nip: '', nisn: '', birth_date: '' })

const fieldErrors = computed(() => {
  const f = form.value
  return {
    email: f.email !== '' && !isValidEmail(f.email),
    nik: f.nik !== '' && !isValidNik(f.nik),
    nip: f.nip !== '' && !isValidNip(f.nip),
    nisn: f.nisn !== '' && !isValidNisn(f.nisn),
    birth_date: f.birth_date !== '' && !isValidBirthDate(f.birth_date),
  }
})
const isProfileDirty = computed(() => Object.values(form.value).some((v) => v.trim() !== ''))
const isProfileInvalid = computed(() => Object.values(fieldErrors.value).some(Boolean))

function buildProfilePayload(): SyncProfilePayload {
  const f = form.value
  return {
    ...(f.email && { email: normalizeEmail(f.email) }),
    ...(f.display_name && { display_name: f.display_name.trim() }),
    ...(f.given_name && { given_name: f.given_name.trim() }),
    ...(f.family_name && { family_name: f.family_name.trim() }),
    ...(f.nik && { nik: f.nik.trim() }),
    ...(f.nip && { nip: f.nip.trim() }),
    ...(f.nisn && { nisn: f.nisn.trim() }),
    ...(f.birth_date && { birth_date: f.birth_date.trim() }),
  }
}

async function submitProfile(): Promise<void> {
  if (!isProfileDirty.value || isProfileInvalid.value) return
  const result = await profile.run(() => usersApi.syncProfile(props.user.subject_id, buildProfilePayload()))
  if (result === null) return
  form.value = { email: '', display_name: '', given_name: '', family_name: '', nik: '', nip: '', nisn: '', birth_date: '' }
  emit('done')
}
</script>

<template>
  <section class="user-actions" data-testid="user-lifecycle-actions">
    <p v-if="!hasAnyAction && !canWrite" class="user-actions__none">{{ t('users.actions_none') }}</p>

    <div v-if="hasAnyAction" class="user-actions__buttons" role="group">
      <UiButton
        v-for="id in visibleActions"
        :key="id"
        :data-action="id"
        :variant="USER_ACTIONS[id].danger ? 'danger' : 'secondary'"
        :disabled="!isApplicable(id) || action.isSubmitting.value"
        @click="onTrigger(id)"
      >
        {{ t(`users.${BTN_KEY[id]}`) }}
      </UiButton>
    </div>

    <p v-if="passwordResetEvidence" data-testid="password-reset-evidence" class="user-actions__evidence">
      {{ passwordResetEvidence }}
    </p>

    <PrivilegedActionDialog
      :open="activeAction !== null"
      :title="dialogTitle"
      :description="dialogDescription"
      :danger="activeDescriptor?.danger ?? false"
      :reason-label="t('users.label_reason')"
      :reason-required="activeDescriptor?.reason?.required ?? false"
      :reason-min="activeDescriptor?.reason?.min"
      :reason-max="activeDescriptor?.reason?.max"
      :reason="reason"
      :submitting="action.isSubmitting.value"
      :step-up-url="action.stepUpUrl.value"
      :step-up-label="t('users.btn_step_up')"
      :error-message="action.failure.value ? t('common.error_generic') : null"
      :request-id="action.requestId.value"
      @update:reason="reason = $event"
      @confirm="onConfirm"
      @cancel="onCancel"
    />

    <div
      v-if="showDirectFailure"
      data-testid="lifecycle-direct-failure"
      class="user-actions__failure"
      role="alert"
    >
      <p>{{ t('common.error_generic') }}</p>
      <a
        v-if="action.stepUpUrl.value"
        :href="action.stepUpUrl.value"
        data-testid="lifecycle-direct-stepup-link"
        class="user-actions__stepup"
      >
        {{ t('users.btn_step_up') }}
      </a>
      <p v-if="directFailureRef" class="user-actions__ref">{{ directFailureRef }}</p>
    </div>

    <form v-if="canWrite" class="user-actions__profile" data-testid="sync-profile-form" @submit.prevent="submitProfile">
      <h3>{{ t('users.update_profile_title') }}</h3>
      <p>{{ t('users.update_profile_desc') }}</p>
      <UiFormField id="profile-email" :label="t('users.field_email')" :error="fieldErrors.email ? t('users.validation_email') : undefined">
        <UiInput id="profile-email" :model-value="form.email" :invalid="fieldErrors.email" @update:model-value="form.email = $event" />
      </UiFormField>
      <UiFormField id="profile-display-name" :label="t('users.field_display_name')">
        <UiInput id="profile-display-name" :model-value="form.display_name" @update:model-value="form.display_name = $event" />
      </UiFormField>
      <UiFormField id="profile-nik" :label="t('users.field_nik')" :error="fieldErrors.nik ? t('users.validation_nik') : undefined">
        <UiInput id="profile-nik" :model-value="form.nik" :invalid="fieldErrors.nik" @update:model-value="form.nik = $event" />
      </UiFormField>
      <UiFormField id="profile-nip" :label="t('users.field_nip')" :error="fieldErrors.nip ? t('users.validation_nip') : undefined">
        <UiInput id="profile-nip" :model-value="form.nip" :invalid="fieldErrors.nip" @update:model-value="form.nip = $event" />
      </UiFormField>
      <UiFormField id="profile-nisn" :label="t('users.field_nisn')" :error="fieldErrors.nisn ? t('users.validation_nisn') : undefined">
        <UiInput id="profile-nisn" :model-value="form.nisn" :invalid="fieldErrors.nisn" @update:model-value="form.nisn = $event" />
      </UiFormField>
      <UiFormField id="profile-birth-date" :label="t('users.field_birth_date')" :error="fieldErrors.birth_date ? t('users.validation_birth_date') : undefined">
        <UiInput id="profile-birth-date" type="date" :model-value="form.birth_date" :invalid="fieldErrors.birth_date" @update:model-value="form.birth_date = $event" />
      </UiFormField>
      <p v-if="profile.failure.value" data-testid="profile-error" role="alert">
        {{ t('common.error_generic') }}
        <span v-if="profileFailureRef" class="user-actions__ref">{{ profileFailureRef }}</span>
      </p>
      <UiButton type="submit" :disabled="!isProfileDirty || isProfileInvalid || profile.isSubmitting.value">
        {{ t('users.btn_sync_profile') }}
      </UiButton>
    </form>
  </section>
</template>
```

   ponytail: `validation_email`/`validation_nik`/`validation_nip`/`validation_nisn`/`validation_birth_date` and `field_nik`/`field_nip`/`field_nisn`/`field_birth_date` are reused (Tasks 4.8/4.10). `field_email`/`field_display_name` (`users`) and `error_generic` (`common`) do NOT exist in the catalogs yet — they are added net-new in step 9 to BOTH files (same parity batch, which is why step 9's check now diffs `common` too). The sync-profile form lives in this component because the Interfaces contract lists `syncProfile` + `UiFormField`/`UiInput` as this component's consumers; it stays a flat `<form>`, not a second extracted component.

13. [ ] **Run it — expect PASS:**

```bash
npm run test -- app/components/users/__tests__/UserLifecycleActions.spec.ts
```
Expected: permission/applicability/confirm/cancel/success/evidence + all six failure-matrix cases green.

14. [ ] **RED → GREEN — wire into the detail page.** Extend `app/pages/__tests__/users-detail.page.nuxt.spec.ts` (mock `useUserDetail` returning a masked `ready` user + a `refresh` spy; mock the session store `hasPermission` true) to assert: the actions surface mounts on `ready`, a `done` event triggers `refresh`, and **no raw PII** appears in the rendered HTML:

```ts
  it('mounts the lifecycle actions and refreshes detail after a successful action', async () => {
    const refresh = vi.fn()
    mockUserDetail({ user: maskedUser, viewState: 'ready', refresh })
    mockSession({ hasPermission: () => true })
    const wrapper = await mountSuspended(UserDetailPage)
    const actions = wrapper.findComponent({ name: 'UserLifecycleActions' })
    expect(actions.exists()).toBe(true)
    actions.vm.$emit('done')
    await wrapper.vm.$nextTick()
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('never serializes raw NIK/NIP/NISN into the SSR HTML', async () => {
    mockUserDetail({ user: maskedUser, viewState: 'ready', refresh: vi.fn() })
    mockSession({ hasPermission: () => true })
    const html = (await mountSuspended(UserDetailPage)).html()
    expect(html).not.toMatch(/\b\d{16}\b/) // raw NIK
    expect(html).not.toMatch(/\b\d{18}\b/) // raw NIP
    expect(html).not.toMatch(/\b\d{10}\b/) // raw NISN
  })
```

   Then update `app/pages/users/[subjectId].vue`'s `ready` branch to mount the surface and re-fetch on `done`:

```vue
<UserLifecycleActions :user="user" @done="refresh" />
```

   where `const { user, refresh } = useUserDetail(() => route.params.subjectId as string)` (from Task 4.7). `UserLifecycleActions` is auto-imported in the page (Nuxt components dir).

15. [ ] **Run it — expect PASS:**

```bash
npm run test -- app/pages/__tests__/users-detail.page.nuxt.spec.ts
```
Expected: existing read-only detail cases (Task 4.8) plus the two new cases green; no raw-PII match.

16. [ ] **REFACTOR.** Confirm no duplicated label/branch logic crept in; the failure-copy comes from `usePrivilegedAction` state only (no per-action error strings); `--danger` red appears solely on the `variant="danger"` lifecycle buttons + the danger dialog (Swiss: red = destructive only). Re-run the three touched suites:

```bash
npm run test -- app/lib/users/__tests__/user-actions.spec.ts app/components/users/__tests__/UserLifecycleActions.spec.ts server/__tests__/admin-proxy.spec.ts app/pages/__tests__/users-detail.page.nuxt.spec.ts
```
Expected: all green.

17. [ ] **Commit** (green only):

```bash
git add app/lib/users/user-actions.ts \
        app/lib/users/__tests__/user-actions.spec.ts \
        app/components/users/UserLifecycleActions.vue \
        app/components/users/__tests__/UserLifecycleActions.spec.ts \
        app/pages/users/\[subjectId\].vue \
        app/pages/__tests__/users-detail.page.nuxt.spec.ts \
        server/utils/admin-proxy.ts \
        server/__tests__/admin-proxy.spec.ts \
        app/locales/id.json app/locales/en.json
git commit -m "$(cat <<'EOF'
feat(sso-admin-frontend): wire user lifecycle/destructive actions + sync-profile into detail page

Add a descriptor-driven UserLifecycleActions surface over the shared
privileged-action infra: permission-gated lock/unlock, deactivate/reactivate,
reset-mfa, password-reset, and require/unrequire-mfa, each confirmed with an
impact summary + reason where the backend demands it, refreshing detail on
success and surfacing the full failure matrix safely. Add the sync-profile
update form with government-identifier validation, and allow-list the new
require-mfa/unrequire-mfa proxy paths. Password-reset shows safe evidence only.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Task-scoped DoD** (run from `services/sso-admin-frontend`; report any blocked command explicitly, never claim PASS for a command that did not run):

```bash
npm run typecheck && npm run lint && npm run format:check && npm run test && npm run build
```

---

### Task 4.12: Role assignment (roles service + assign action with self-assignment re-auth)

Add single-role assignment to the detail page with the **full privileged-action treatment** (design §8 — assignment rewrites the user's entire role/permission set, so it is confirmed and step-up-aware like every other destructive action). A tiny `rolesApi.list()` feeds a radio group (one primary role per the backend `role_slugs` `array size:1` contract). Reading that catalog (`GET /api/admin/roles`) requires **`admin.roles.read`** (extract-backend #14) — distinct from the `admin.roles.write` that gates the submit — so the fetch is gated on `admin.roles.read` and **fails closed**: any fetch error (or missing read permission) yields an empty list behind a safe notice, never an unhandled `useAsyncData` rejection. The **`Save Role`** button opens a confirmation (`UiAlertDialog`) showing an **impact summary** (it replaces the whole role/permission set; for self-assignment it warns the admin's own access can change) with a `Confirm` control; only on confirm does `UserRoleAssignment.vue` run `usersApi.assignRoles` through the shared `usePrivilegedAction` runner (permission `admin.roles.write`, freshness `write`). A **428 / `step_up_required`** from the assign call surfaces step-up inline (mirroring the create page): the `action.stepUpUrl` re-auth link plus copy containing "step-up"/"MFA assurance" — **not** the generic `role_assign_failed`. When the admin assigns a role to **their own** subject, a role change can invalidate the current admin session, so on success the component re-runs `sessionStore.ensureSession(true)` and — when the refreshed result is no longer `authenticated` — routes to login / step-up / mfa / forbidden / api-unreachable / error by reusing the existing `resolveBootstrapFailure` guard resolver (the same mapping the global guard uses). On a successful non-self assignment (or a self assignment that stays authenticated) it emits `done()` so the page refreshes detail. The `GET /api/admin/roles` proxy allow-list entry **already exists** (`server/utils/admin-proxy.ts` line 33) — the task only verifies it, no edit is required.

**Files**
- Create: `app/services/roles.api.ts`
- Modify: `app/types/users.types.ts` (add `AdminRole` + `RolesResponse`)
- Create: `app/components/users/UserRoleAssignment.vue`
- Modify: `app/pages/users/[subjectId].vue` (mount the assignment surface, wire `@done="refresh"`)
- Verify (no edit — already allow-listed): `server/utils/admin-proxy.ts` (`'GET /api/admin/roles'` already in `ALLOWED_ADMIN_ROUTES`)
- Modify: `app/locales/id.json`, `app/locales/en.json` (ADD `users.role_assign_failed` + the confirm/step-up/unavailable keys + `common.btn_confirm` — see step 8; reuse existing `users.assign_roles_title`/`label_role`/`btn_save_roles`/`roles_self_warn`/`roles_sync_success`/`roles_min_required`/`btn_step_up` and `common.btn_cancel`)
- Modify (extend): `app/pages/__tests__/users-detail.page.nuxt.spec.ts` (add a `vi.mock('@/services/roles.api')` so the now-mounted `UserRoleAssignment` does not fire a real roles fetch in the 4.8 ready-state tests — see step 11)
- Test: `app/services/__tests__/roles.api.spec.ts`
- Test: `app/components/users/__tests__/UserRoleAssignment.nuxt.spec.ts`

> **Test-filename deviation from the skeleton (deliberate):** the skeleton lists `UserRoleAssignment.spec.ts`, but the component depends on Nuxt auto-imports (`useAsyncData`, `navigateTo`, `useRoute`, `useRequestURL`, `useRuntimeConfig`) which only resolve in the `nuxt` Vitest env. Per the binding test-routing rule ("all composable + auto-import-dependent specs MUST be `*.nuxt.spec.ts`") the test is named `UserRoleAssignment.nuxt.spec.ts`. The filename is not an interface any other task consumes.

**Interfaces**
- Produces (`app/services/roles.api.ts`): `export const rolesApi = { list(): Promise<RolesResponse> }` → `GET /api/admin/roles`
- Produces (`app/types/users.types.ts` additions):
  - `type AdminRole = { readonly id: number; readonly slug: string; readonly name: string; readonly description: string | null; readonly is_system: boolean; readonly permissions: readonly { readonly slug: string; readonly name: string; readonly category: string | null }[]; readonly user_count: number; readonly users_count: number }`
  - `type RolesResponse = { readonly roles: readonly AdminRole[] }`
- Produces (`UserRoleAssignment.vue`): Props `{ user: AdminUserDetail }`; Emits `done()`
- Consumes: `rolesApi.list` (this task) via `useAsyncData('admin-roles-list', …)` **gated on `admin.roles.read`** (fail-closed on error/no-permission); `usersApi.assignRoles` + `AssignRolesPayload`/`UserRoleResponse` (4.3/4.1); `usePrivilegedAction` (4.9); `useSessionStore` (`principal.subject_id`, `ensureSession`, `hasPermission('admin.roles.read')` for the fetch + `hasPermission('admin.roles.write')` for the submit); `resolveBootstrapFailure` (`@/lib/auth/admin-guard-resolver`); `formatSupportReference` (`@/lib/display-identifiers`); `useI18n`; `UiAlertDialog` (`@/components/ui/UiAlertDialog.vue`, the confirm gate); `UiButton`/`UiFormField`.

**Steps**

1. [ ] Write the failing service test `app/services/__tests__/roles.api.spec.ts` (mirrors `dashboard.api.spec.ts` — mock the api-client, assert path/verb + DTO pass-through):

```ts
import { describe, expect, it, vi } from 'vitest'
import type { RolesResponse } from '@/types/users.types'

const get = vi.fn<(path: string) => Promise<unknown>>()
vi.mock('@/lib/api/api-client', () => ({ apiClient: { get } }))

const { rolesApi } = await import('../roles.api')

describe('rolesApi', () => {
  it('GETs the same-origin BFF roles path and returns the DTO unchanged', async () => {
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
})
```

2. [ ] Run it — expect **FAIL** (`../roles.api` and the `RolesResponse` type do not exist yet → import/resolution error):
   `npm run test -- app/services/__tests__/roles.api.spec.ts`

3. [ ] Add the role DTO types to `app/types/users.types.ts` (append; keep every field `readonly`, matching the backend `AdminRolePresenter::role()` shape — both `user_count` and `users_count` are present and equal):

```ts
// GET /admin/api/roles — masked governance DTO (no token/secret/PII). Both
// `user_count` and `users_count` are returned by the backend (same value); the
// frontend treats them as interchangeable counters.
export type AdminRole = {
  readonly id: number
  readonly slug: string
  readonly name: string
  readonly description: string | null
  readonly is_system: boolean
  readonly permissions: readonly {
    readonly slug: string
    readonly name: string
    readonly category: string | null
  }[]
  readonly user_count: number
  readonly users_count: number
}

export type RolesResponse = { readonly roles: readonly AdminRole[] }
```

4. [ ] Implement `app/services/roles.api.ts` (FULL code):

```ts
import { apiClient } from '@/lib/api/api-client'
import type { RolesResponse } from '@/types/users.types'

// Same-origin BFF path. The Nitro proxy (server/utils/admin-proxy.ts) injects the
// Bearer access token from event.context and rewrites /api/admin/* → /admin/api/*
// before forwarding to the backend. `GET /api/admin/roles` is already allow-listed.
export const rolesApi = {
  list(): Promise<RolesResponse> {
    return apiClient.get<RolesResponse>('/api/admin/roles')
  },
}
```

5. [ ] Run it — expect **PASS**:
   `npm run test -- app/services/__tests__/roles.api.spec.ts`

6. [ ] Write the failing component test `app/components/users/__tests__/UserRoleAssignment.nuxt.spec.ts`. It mocks the services, the session store, and `usePrivilegedAction` (controllable run/failure), and mocks the Nuxt auto-imports so the radio render, the **single-role** payload, the self-assignment re-auth routing matrix, the permission gate, the no-stale-state-after-failure rule, and the token/PII leak guard are all asserted on real behavior:

```ts
// *.nuxt.spec.ts → 'nuxt' env: mountSuspended + mockNuxtImport for the auto-imports.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import type { SessionEnsureResult } from '@/stores/session.store'
import type {
  AdminUserDetail,
  RolesResponse,
  UserRoleResponse,
} from '@/types/users.types'
import type {
  PrivilegedActionFailure,
  PrivilegedActionStatus,
} from '@/lib/users/privileged-action'

// --- domain doubles ---------------------------------------------------------
const ROLES: RolesResponse = {
  roles: [
    { id: 1, slug: 'user', name: 'Pengguna', description: null, is_system: true, permissions: [], user_count: 1100, users_count: 1100 },
    { id: 2, slug: 'admin', name: 'Administrator', description: null, is_system: true, permissions: [], user_count: 4, users_count: 4 },
  ],
}

function makeUser(subjectId: string, roleSlug: string): AdminUserDetail {
  return {
    id: 9, subject_id: subjectId, email: 'ops.sample@example.test',
    given_name: 'Ops', family_name: 'Sample', display_name: 'Ops Sample',
    role: roleSlug, status: 'active', effective_status: 'active',
    disabled_at: null, disabled_reason: null, locked_at: null, locked_until: null,
    locked_reason: null, locked_by_subject_id: null, lock_count: 0,
    local_account_enabled: true, profile_synced_at: null, email_verified_at: null,
    last_login_at: null, created_at: null,
    nik: '1234********3456', nip: null, nisn: null, birth_date: '****-**-15',
    mfa_enrolled: false, mfa_methods: [], mfa_mandatory: false,
    roles: [{ slug: roleSlug, name: roleSlug === 'admin' ? 'Administrator' : 'Pengguna', is_system: true }],
  }
}

const SELF = 'USR-SELF-0001'
const OTHER = 'USR-OTHER-0002'

// --- service mocks ----------------------------------------------------------
const assignRoles = vi.fn<() => Promise<UserRoleResponse>>()
vi.mock('@/services/users.api', () => ({ usersApi: { assignRoles } }))
vi.mock('@/services/roles.api', () => ({ rolesApi: { list: vi.fn(async () => ROLES) } }))

// --- session store mock -----------------------------------------------------
const principalSubject = ref<string>('USR-ADMIN-0000')
const ensureResult = ref<SessionEnsureResult>('authenticated')
const ensureSession = vi.fn(async (_force?: boolean) => ensureResult.value)
const hasPermission = vi.fn((_p: string) => true)
vi.mock('@/stores/session.store', () => ({
  useSessionStore: () => ({
    principal: { subject_id: principalSubject.value, email: 'admin@example.test', display_name: 'Admin', role: 'admin' },
    ensureSession,
    hasPermission,
  }),
}))

// --- usePrivilegedAction mock (controllable run/failure) --------------------
const status = ref<PrivilegedActionStatus>('idle')
const isSubmitting = ref(false)
const failure = ref<PrivilegedActionFailure | null>(null)
const requestId = ref<string | null>(null)
const stepUpUrl = ref<string | null>(null) // shared so the 428 case can drive the step-up link
const run = vi.fn()
vi.mock('@/composables/usePrivilegedAction', () => ({
  usePrivilegedAction: () => ({
    status, isSubmitting, failure, requestId,
    auditEventId: ref<string | null>(null),
    fieldErrors: ref<Readonly<Record<string, readonly string[]>>>({}),
    stepUpUrl,
    run, reset: vi.fn(),
  }),
}))

// --- Nuxt auto-imports ------------------------------------------------------
const rolesData = ref<RolesResponse | null>(ROLES)
const rolesError = ref<unknown>(null) // fail-closed: a non-null error empties the catalog
mockNuxtImport('useAsyncData', () => {
  return (_key: string, _handler: () => unknown) => ({ data: rolesData, error: rolesError })
})
const navigateTo = vi.fn(async () => {})
mockNuxtImport('navigateTo', () => navigateTo)
mockNuxtImport('useRoute', () => () => ({ fullPath: `/users/${SELF}` }))
mockNuxtImport('useRequestURL', () => () => new URL('https://admin-sso.example.test/'))
mockNuxtImport('useRuntimeConfig', () => () => ({ public: { basePath: '/' } }))

const UserRoleAssignment = (await import('../UserRoleAssignment.vue')).default

// Stub the confirm gate (reka-ui AlertDialog teleports its content; the stub keeps
// the two-step open→Confirm flow deterministic and inline). The real UiAlertDialog
// is exercised end-to-end in Task 4.13's Playwright spec.
const AlertStub = {
  name: 'UiAlertDialog',
  props: ['open', 'title', 'description', 'confirmLabel', 'cancelLabel', 'danger'],
  emits: ['confirm', 'cancel'],
  template: `<div v-if="open" data-testid="confirm-dialog">
    <p data-testid="confirm-desc">{{ description }}</p>
    <button data-testid="ui-alert-dialog-confirm" @click="$emit('confirm')">{{ confirmLabel || 'Confirm' }}</button>
    <button data-testid="ui-alert-dialog-cancel" @click="$emit('cancel')">{{ cancelLabel || 'Cancel' }}</button>
  </div>`,
}

beforeEach(() => {
  principalSubject.value = 'USR-ADMIN-0000'
  ensureResult.value = 'authenticated'
  status.value = 'idle'
  isSubmitting.value = false
  failure.value = null
  requestId.value = null
  stepUpUrl.value = null
  rolesData.value = ROLES
  rolesError.value = null
  hasPermission.mockReturnValue(true)
  // default: run() executes its runner (success), returning the resolved DTO
  run.mockImplementation(async (runner: () => Promise<unknown>) => runner())
  assignRoles.mockResolvedValue({
    user: { subject_id: OTHER, email: 'ops.sample@example.test', display_name: 'Ops Sample', role: 'admin', status: 'active', roles: [{ slug: 'admin', name: 'Administrator', is_system: true }] },
  })
  vi.clearAllMocks()
  run.mockImplementation(async (runner: () => Promise<unknown>) => runner())
})
afterEach(() => vi.clearAllMocks())

async function mountFor(subjectId: string, roleSlug = 'user') {
  return mountSuspended(UserRoleAssignment, {
    props: { user: makeUser(subjectId, roleSlug) },
    global: { stubs: { UiAlertDialog: AlertStub } },
  })
}

// Open the confirm gate, then click Confirm — the privileged-action flow now
// confirms before the mutation fires (design §8).
async function confirmAssign(wrapper: Awaited<ReturnType<typeof mountFor>>) {
  await wrapper.find('[data-testid="role-assign-submit"]').trigger('click')
  await wrapper.find('[data-testid="ui-alert-dialog-confirm"]').trigger('click')
  await wrapper.vm.$nextTick()
}

describe('UserRoleAssignment', () => {
  it('renders one radio per role and pre-selects the user current role', async () => {
    const wrapper = await mountFor(OTHER, 'user')
    const radios = wrapper.findAll('input[type="radio"]')
    expect(radios).toHaveLength(2)
    expect(wrapper.text()).toContain('Pengguna')
    expect(wrapper.text()).toContain('Administrator')
    const checked = wrapper.find<HTMLInputElement>('input[value="user"]')
    expect(checked.element.checked).toBe(true)
  })

  it('assigns exactly one role (size:1 tuple) and emits done for another subject', async () => {
    const wrapper = await mountFor(OTHER, 'user')
    await wrapper.find('input[value="admin"]').setValue()
    await confirmAssign(wrapper)
    expect(assignRoles).toHaveBeenCalledWith(OTHER, { role_slugs: ['admin'] })
    expect(ensureSession).not.toHaveBeenCalled()
    expect(navigateTo).not.toHaveBeenCalled()
    expect(wrapper.emitted('done')).toHaveLength(1)
  })

  it('self-assignment that stays authenticated re-runs ensureSession then emits done', async () => {
    principalSubject.value = SELF
    ensureResult.value = 'authenticated'
    const wrapper = await mountFor(SELF, 'user')
    await wrapper.find('input[value="admin"]').setValue()
    await confirmAssign(wrapper)
    expect(ensureSession).toHaveBeenCalledWith(true)
    expect(navigateTo).not.toHaveBeenCalled()
    expect(wrapper.emitted('done')).toHaveLength(1)
  })

  it('self-assignment that needs step-up routes to step-up and does NOT emit done', async () => {
    principalSubject.value = SELF
    ensureResult.value = 'step_up_required'
    const wrapper = await mountFor(SELF, 'user')
    await wrapper.find('input[value="admin"]').setValue()
    await confirmAssign(wrapper)
    expect(ensureSession).toHaveBeenCalledWith(true)
    expect(navigateTo).toHaveBeenCalledWith({
      name: 'admin.step-up-required',
      query: { return_to: `/users/${SELF}` },
    })
    expect(wrapper.emitted('done')).toBeUndefined()
  })

  it('self-assignment that drops to unauthenticated routes to the external login url', async () => {
    principalSubject.value = SELF
    ensureResult.value = 'unauthenticated'
    const wrapper = await mountFor(SELF, 'user')
    await wrapper.find('input[value="admin"]').setValue()
    await confirmAssign(wrapper)
    const [url, opts] = navigateTo.mock.calls[0]
    expect(String(url)).toContain('/auth/login')
    expect(String(url)).toContain('return_to=')
    expect(opts).toEqual({ external: true })
    expect(wrapper.emitted('done')).toBeUndefined()
  })

  it('hides the submit when the admin lacks admin.roles.write and never calls the API', async () => {
    hasPermission.mockImplementation((p: string) => p !== 'admin.roles.write')
    const wrapper = await mountFor(OTHER, 'user')
    expect(wrapper.find('[data-testid="role-assign-submit"]').exists()).toBe(false)
    expect(assignRoles).not.toHaveBeenCalled()
  })

  it('on failure (e.g. 422 single-role / 403) shows safe copy + redacted REF, emits no done, leaves no stale loading', async () => {
    run.mockResolvedValue(null) // runner failed; usePrivilegedAction mapped + reset isSubmitting
    status.value = 'invalid'
    requestId.value = 'admin-req-ROLEFAIL7'
    failure.value = { status: 'invalid', requestId: 'admin-req-ROLEFAIL7', auditEventId: null, fieldErrors: { role_slugs: ['Satu akun hanya boleh memiliki satu peran.'] }, stepUpUrl: null }
    const wrapper = await mountFor(OTHER, 'user')
    await confirmAssign(wrapper)
    expect(wrapper.emitted('done')).toBeUndefined()
    expect(isSubmitting.value).toBe(false)
    expect(wrapper.text()).toContain('REF-')
    expect(wrapper.text()).not.toContain('admin-req-ROLEFAIL7')
  })

  it('on a 428 from the assign call surfaces a step-up re-auth link + step-up copy (not the generic failure)', async () => {
    run.mockResolvedValue(null)
    status.value = 'step_up_required'
    requestId.value = 'admin-req-STEPUP9'
    stepUpUrl.value = '/auth/login?prompt=login&max_age=0'
    failure.value = { status: 'step_up_required', requestId: 'admin-req-STEPUP9', auditEventId: null, fieldErrors: {}, stepUpUrl: '/auth/login?prompt=login&max_age=0' }
    const wrapper = await mountFor(OTHER, 'user')
    await confirmAssign(wrapper)
    const link = wrapper.find('[data-testid="step-up-link"]')
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toBe('/auth/login?prompt=login&max_age=0')
    expect(wrapper.text()).toContain('step-up') // role_step_up_desc copy, both locales contain it
    expect(wrapper.emitted('done')).toBeUndefined()
  })

  it('fails closed with a safe notice (no radios, no submit) when the roles fetch errors', async () => {
    rolesError.value = new Error('backend unreachable')
    const wrapper = await mountFor(OTHER, 'user')
    expect(wrapper.findAll('input[type="radio"]')).toHaveLength(0)
    expect(wrapper.find('[data-testid="roles-unavailable"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="role-assign-submit"]').exists()).toBe(false)
    expect(assignRoles).not.toHaveBeenCalled()
  })

  it('renders no token, Bearer, or raw-PII digit run', async () => {
    const wrapper = await mountFor(OTHER, 'user')
    expect(wrapper.html()).not.toMatch(/Bearer|access_token|refresh_token|id_token|\b\d{16}\b|\b\d{18}\b|\b\d{10}\b/u)
  })
})
```

7. [ ] Run it — expect **FAIL** (`../UserRoleAssignment.vue` does not exist):
   `npm run test -- app/components/users/__tests__/UserRoleAssignment.nuxt.spec.ts`

8. [ ] Add the new i18n keys (parity is enforced — add to BOTH files). In `app/locales/id.json` inside the existing `"users"` block add:

```json
"role_assign_failed": "Gagal menetapkan peran. Coba lagi.",
"role_step_up_desc": "Perubahan ini perlu step-up baru (jaminan MFA). Autentikasi ulang lalu coba lagi.",
"assign_confirm_title": "Tetapkan peran?",
"assign_confirm_desc": "Ini mengganti seluruh peran dan set izin pengguna. Mereka hanya mempertahankan peran yang Anda pilih.",
"assign_confirm_self_desc": "Ini mengubah peran dan set izin Anda SENDIRI dan dapat mencabut akses admin Anda saat ini. Anda mungkin perlu autentikasi ulang setelahnya.",
"roles_unavailable": "Daftar peran tidak tersedia saat ini."
```

   In `app/locales/en.json` inside the existing `"users"` block add:

```json
"role_assign_failed": "Could not assign the role. Please try again.",
"role_step_up_desc": "This change needs a fresh step-up (MFA assurance). Re-authenticate and try again.",
"assign_confirm_title": "Assign role?",
"assign_confirm_desc": "This replaces the user's entire role and permission set. They keep only the role you select.",
"assign_confirm_self_desc": "This changes your OWN role and permission set and can revoke your current admin access. You may need to re-authenticate afterwards.",
"roles_unavailable": "The role list is unavailable right now."
```

   And add a shared confirm label to the `"common"` block of BOTH files (the high-risk confirm control must read `Confirm`): in `app/locales/id.json` add `"btn_confirm": "Konfirmasi"`, in `app/locales/en.json` add `"btn_confirm": "Confirm"`. (`users.btn_step_up` from Task 4.10 and `common.btn_cancel` are reused.) Verify parity diffs both namespaces:

```bash
node -e "const id=require('./app/locales/id.json'),en=require('./app/locales/en.json');const diff=(a,b)=>[...Object.keys(a).filter(k=>!(k in b)),...Object.keys(b).filter(k=>!(k in a))];const d=[...diff(id.users,en.users).map(k=>'users.'+k),...diff(id.common,en.common).map(k=>'common.'+k)];if(d.length){console.error('MISMATCH',d);process.exit(1)}console.log('locale parity OK')"
```

9. [ ] Implement `app/components/users/UserRoleAssignment.vue` (FULL code):

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from '@/composables/useI18n'
import { usePrivilegedAction } from '@/composables/usePrivilegedAction'
import { rolesApi } from '@/services/roles.api'
import { usersApi } from '@/services/users.api'
import { useSessionStore } from '@/stores/session.store'
import { resolveBootstrapFailure } from '@/lib/auth/admin-guard-resolver'
import { formatSupportReference } from '@/lib/display-identifiers'
import UiAlertDialog from '@/components/ui/UiAlertDialog.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiFormField from '@/components/ui/UiFormField.vue'
import type {
  AdminUserDetail,
  RolesResponse,
  UserRoleResponse,
} from '@/types/users.types'

const props = defineProps<{ readonly user: AdminUserDetail }>()
const emit = defineEmits<{ (e: 'done'): void }>()

const { t } = useI18n()
const session = useSessionStore()
const action = usePrivilegedAction<UserRoleResponse>()

// Reading the role catalog (GET /admin/api/roles) is gated by admin.roles.read
// (extract-backend #14) — distinct from admin.roles.write, which only gates the
// submit. Both are UX minimization; the proxy + AdminGuard remain the boundary.
const canReadRoles = computed<boolean>(() => session.hasPermission('admin.roles.read'))
const canAssign = computed<boolean>(() => session.hasPermission('admin.roles.write'))
// A role change on the admin's OWN subject can invalidate the current session,
// so we re-verify it after a successful self-assignment.
const isSelf = computed<boolean>(() => props.user.subject_id === session.principal?.subject_id)

// Roles resolve server-side and hydrate (governance DTO — no token/secret/PII).
// Fail closed: only fetch when permitted, and treat any fetch error as an empty
// catalog behind a safe notice rather than an unhandled useAsyncData rejection.
const { data: rolesData, error: rolesError } = useAsyncData<RolesResponse>(
  'admin-roles-list',
  () => (canReadRoles.value ? rolesApi.list() : Promise.resolve({ roles: [] })),
)
const rolesUnavailable = computed<boolean>(() => !canReadRoles.value || rolesError.value != null)
const roles = computed(() => (rolesUnavailable.value ? [] : (rolesData.value?.roles ?? [])))

// The backend enforces `role_slugs` array size:1 — a radio group is the natural
// single-primary-role control; we always submit exactly one slug.
const selected = ref<string>(props.user.roles[0]?.slug ?? '')

// Confirmation gate: assigning a role rewrites the user's entire role/permission
// set (and, for self-assignment, the admin's own access), so it is confirmed like
// every other privileged action (design §8) before the mutation fires.
const confirmOpen = ref<boolean>(false)
const confirmDescription = computed<string>(() =>
  isSelf.value ? t('users.assign_confirm_self_desc') : t('users.assign_confirm_desc'),
)

const supportRef = computed<string | null>(() => formatSupportReference(action.requestId.value))
// Step-up (428) gets its own copy (mirrors the create page); every other failure
// falls back to the generic role-assignment failure copy.
const failureMessage = computed<string | undefined>(() => {
  if (action.failure.value === null) return undefined
  return action.status.value === 'step_up_required'
    ? t('users.role_step_up_desc')
    : t('users.role_assign_failed')
})

function openConfirm(): void {
  if (!canAssign.value || selected.value === '') return
  action.reset()
  confirmOpen.value = true
}

function onCancel(): void {
  confirmOpen.value = false
}

async function onConfirm(): Promise<void> {
  confirmOpen.value = false
  if (!canAssign.value || selected.value === '') return

  const result = await action.run(() =>
    usersApi.assignRoles(props.user.subject_id, { role_slugs: [selected.value] as const }),
  )
  if (result === null) return // failure mapped + surfaced inline (copy + REF + step-up link); no stale state

  if (isSelf.value) {
    const ensure = await session.ensureSession(true)
    if (ensure !== 'authenticated') {
      const origin = useRequestURL().origin
      const basePath = useRuntimeConfig().public.basePath
      const resolution = resolveBootstrapFailure(ensure, useRoute().fullPath, origin, basePath)
      if (resolution.kind === 'login') {
        await navigateTo(resolution.url, { external: true })
        return
      }
      if (resolution.kind === 'route') {
        await navigateTo(resolution.to)
        return
      }
    }
  }

  emit('done')
}
</script>

<template>
  <section class="role-assignment" data-section="role-assignment">
    <h2 class="role-assignment__title">{{ t('users.assign_roles_title') }}</h2>

    <p v-if="isSelf" class="role-assignment__warn" role="note">
      {{ t('users.roles_self_warn') }}
    </p>

    <p
      v-if="rolesUnavailable"
      data-testid="roles-unavailable"
      class="role-assignment__warn"
      role="note"
    >
      {{ t('users.roles_unavailable') }}
    </p>

    <UiFormField
      v-else
      id="role-assignment"
      :label="t('users.label_role')"
      :hint="selected === '' ? t('users.roles_min_required') : undefined"
      :error="failureMessage"
    >
      <fieldset class="role-assignment__options">
        <legend class="sr-only">{{ t('users.label_role') }}</legend>
        <label v-for="role in roles" :key="role.slug" class="role-assignment__option">
          <input
            v-model="selected"
            type="radio"
            name="role-assignment"
            :value="role.slug"
            :disabled="!canAssign || action.isSubmitting.value"
          />
          <span>{{ role.name }}</span>
        </label>
      </fieldset>
    </UiFormField>

    <a
      v-if="action.stepUpUrl.value"
      :href="action.stepUpUrl.value"
      data-testid="step-up-link"
      class="role-assignment__step-up"
    >
      {{ t('users.btn_step_up') }}
    </a>

    <p v-if="action.failure.value && supportRef" class="role-assignment__ref">{{ supportRef }}</p>

    <UiButton
      v-if="canAssign && !rolesUnavailable"
      data-testid="role-assign-submit"
      variant="primary"
      size="sm"
      :disabled="selected === '' || action.isSubmitting.value"
      @click="openConfirm"
    >
      {{ t('users.btn_save_roles') }}
    </UiButton>

    <UiAlertDialog
      :open="confirmOpen"
      :title="t('users.assign_confirm_title')"
      :description="confirmDescription"
      :confirm-label="t('common.btn_confirm')"
      :cancel-label="t('common.btn_cancel')"
      :danger="false"
      @confirm="onConfirm"
      @cancel="onCancel"
    />
  </section>
</template>

<style scoped>
.role-assignment {
  display: grid;
  gap: 12px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}
.role-assignment__title {
  margin: 0;
  font: 600 1rem/1.3 var(--font-sans);
  letter-spacing: -0.01em;
  color: var(--fg);
}
.role-assignment__warn {
  margin: 0;
  font: 500 0.8125rem/1.5 var(--font-sans);
  color: var(--fg-2);
}
.role-assignment__options {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  border: 0;
}
.role-assignment__option {
  display: flex;
  align-items: center;
  gap: 8px;
  font: 400 0.875rem/1.4 var(--font-sans);
  color: var(--fg);
}
.role-assignment__ref {
  margin: 0;
  font: 400 0.75rem/1.4 var(--font-mono);
  color: var(--fg-3);
}
.role-assignment__step-up {
  font: 600 0.8125rem/1 var(--font-sans);
  color: var(--accent);
  text-decoration: underline;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
```

10. [ ] Run the component test — expect **PASS**:
    `npm run test -- app/components/users/__tests__/UserRoleAssignment.nuxt.spec.ts`

11. [ ] Mount the surface in `app/pages/users/[subjectId].vue`: import the component and render it inside the `ready` body (after the roles list), binding the detail composable's `refresh` to its `done` event so the detail re-fetches after an assignment. Add the import alongside the other detail-component imports:

```ts
import UserRoleAssignment from '@/components/users/UserRoleAssignment.vue'
```

   and in the `ready` template branch, after the read-only roles list:

```vue
        <UserRoleAssignment v-if="user" :user="user" @done="refresh" />
```

   (`user` and `refresh` already come from `useUserDetail` in the page; `UserRoleAssignment` self-gates on `admin.roles.read`/`admin.roles.write`, so no extra page-level permission wrapper is needed.)

   Because the detail page now mounts `UserRoleAssignment` in its `ready` body, the Task 4.8 ready-state tests in `app/pages/__tests__/users-detail.page.nuxt.spec.ts` would otherwise fire its `useAsyncData('admin-roles-list', () => rolesApi.list())` against the unreachable backend. Add a service mock at the top of that spec (alongside the existing `useUserDetail`/session mocks) so the fetch is deterministic:

```ts
vi.mock('@/services/roles.api', () => ({ rolesApi: { list: vi.fn(async () => ({ roles: [] })) } }))
```

12. [ ] Verify the proxy allow-list already covers the call (no edit expected) — `'GET /api/admin/roles'` is already present in `ALLOWED_ADMIN_ROUTES`:
    `npm run test -- server/__tests__/admin-proxy.spec.ts` (or `grep -n "GET /api/admin/roles" server/utils/admin-proxy.ts` → confirms the entry; if absent, add `'GET /api/admin/roles'` to the set).

13. [ ] Re-run the full Task-4.12 test set plus the route-map guard — expect **PASS**:
    `npm run test -- app/services/__tests__/roles.api.spec.ts app/components/users/__tests__/UserRoleAssignment.nuxt.spec.ts app/pages/__tests__/users-detail.page.nuxt.spec.ts app/pages/__tests__/route-map.spec.ts`

14. [ ] Refactor if needed (keep the `done`→`refresh` wiring and the single new locale key parity intact), then commit:
    `git add app/services/roles.api.ts app/services/__tests__/roles.api.spec.ts app/types/users.types.ts app/components/users/UserRoleAssignment.vue app/components/users/__tests__/UserRoleAssignment.nuxt.spec.ts app/pages/users/[subjectId].vue app/locales/id.json app/locales/en.json && git commit -m "$(printf 'feat(sso-admin-frontend): single-role assignment with self-assignment re-auth\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"`

**Task-scoped DoD (run from `services/sso-admin-frontend`; report any blocked command explicitly, never claim PASS for a command that did not run):**
`npm run typecheck && npm run lint && npm run format:check && npm run test`

---

### Task 4.13: Extend the SSR token-leak gate + Users e2e + full DoD

Prove the **user list + detail DTOs** are leak-safe in the SSR payload, add the required Users Playwright e2e, then run the complete Definition-of-Done gate. The leak fixture (`test/fixtures/ssr-leak`) is a Nuxt **layer over the real app**: today it stubs the masked principal (`server/routes/api/admin/me.get.ts`) and dashboard summary, so `/users` and `/users/[subjectId]` would render `forbidden` (the sentinel principal lacks the users permissions) or `error` (no fixture data route). Grant the sentinel principal the users permissions, add masked users list + detail fixture routes so both pages render their `ready` state during the gate, then the existing `collectSecretLeaks` + `collectPiiShapeLeaks` collectors automatically cover the masked PII + the (masked) session id. The detail session carries the sentinel `sid` as its **raw** value so masking is proven by the absence of the raw value plus the presence of its `REF-` preview. Finally rewrite the legacy-SPA `e2e/users.spec.ts` for the Nuxt-4 routes (deep-link detail) and run the full gate.

**Files**
- Create: `test/fixtures/ssr-leak/server/routes/api/admin/users/index.get.ts` (masked `UserListResponse`)
- Create: `test/fixtures/ssr-leak/server/routes/api/admin/users/[subjectId].get.ts` (masked `UserDetailResponse` with `login_context` + a session carrying the sentinel `sid` as its raw value to prove masking)
- Create: `test/fixtures/ssr-leak/server/routes/api/admin/roles/index.get.ts` (masked `{ roles: [] }` so the detail page's role-options `useAsyncData` resolves deterministically instead of hitting the unreachable backend — beyond the skeleton's listed Produces, but required for a clean `ready` detail render in the gate)
- Modify: `test/fixtures/ssr-leak/server/routes/api/admin/me.get.ts` (grant the sentinel principal `admin.users.read`/`admin.users.write`/`admin.users.lock`/`admin.roles.read`/`admin.roles.write` + a `users` menu so the guard admits `/users` and `/users/[subjectId]`; `admin.roles.read` is what makes `UserRoleAssignment` actually fetch the roles fixture below, so its DTO enters the SSR payload and the leak collectors cover it)
- Modify: `test/ssr-token-leak.gate.spec.ts` (render `/users` + a detail route; assert masked, no sentinel/PII-shape, raw `sid` masked to its `REF-` preview)
- Modify (rewrite): `e2e/users.spec.ts` (replace the legacy-SPA drawer spec with the Nuxt-4 routes: critical nav to `/users`, forbidden flow, role-assignment high-risk path) — the skeleton says "Create", but the file already exists as the legacy Vue-SPA spec, so this is a full rewrite
- (Verify green) the full service DoD gate

**Interfaces**
- Produces (fixture routes): static masked DTOs (no token/secret; PII fields are the backend-masked form, never the raw sentinel; one session whose raw id is `SENTINEL.sid` to prove the page masks it).
- Consumes: `test/fixtures/ssr-leak/sentinels.ts` (`SENTINEL.{nik,nip,nisn,sid}`), the gate's `collectSecretLeaks`/`collectPiiShapeLeaks`/`extractPayload`; the `@nuxt/test-utils/e2e` + Playwright harness.

**Background (load-bearing facts verified against the codebase):**
- `formatSupportReference(value)` (`app/lib/display-identifiers.ts`) normalizes to `[A-Z0-9]`, then `REF-${normalized.slice(-8)}`. So `formatTechnicalPreview(SENTINEL.sid)` (`'SENTINEL-SID-7e4a1b9c0d'`) → normalized `SENTINELSID7E4A1B9C0D` → **`REF-4A1B9C0D`**. The raw `SENTINEL-SID-7e4a1b9c0d` therefore never renders, and the masked preview is a deterministic, assertable positive.
- `collectPiiShapeLeaks` greps **word-bounded** 16/18/10-digit runs. Every masked fixture value must keep its longest digit run < 10 (split by `*`), and no fixture timestamp/id/count may form a 10/16/18-digit run.
- `admin-guard.global.ts` enforces `hasEveryPermission(meta.permissions)` against the principal — the sentinel `me.get.ts` must carry the users permissions or `/users` renders the `/forbidden` page instead of the masked list.
- The fixture is pre-built in a subprocess by `test/globalSetup.ts`; the gate runs `setup({ build: false })` against `.output`. New fixture routes are picked up by that subprocess build automatically.

**Steps**

1. [ ] Grant the sentinel principal the users permissions. In `test/fixtures/ssr-leak/server/routes/api/admin/me.get.ts`, replace the `permissions` block (keep `subject_id`/`email`/`display_name`/`role`/`auth_context` unchanged so the existing dashboard gate assertions stay green) with:

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
        ],
        capabilities: {
          'admin.dashboard.view': true,
          'admin.users.read': true,
          'admin.users.write': true,
          'admin.users.lock': true,
          'admin.roles.read': true,
          'admin.roles.write': true,
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
        ],
      },
```

2. [ ] Create the masked list fixture route `test/fixtures/ssr-leak/server/routes/api/admin/users/index.get.ts` (FULL code) — a `UserListResponse` whose government identifiers are already in the backend-masked form (no 16/18/10-digit run, never the raw sentinel):

```ts
// SSR token-leak fixture: a representative MASKED user list so the §3.3 gate can
// render /users in its READY state and the payload collectors cover the masked
// AdminUserListItem DTO. Government identifiers are the backend-masked form
// (GovernmentIdentifier): the longest digit run is < 10, so collectPiiShapeLeaks
// stays clean, and they are NOT the raw 16/18/10-digit SENTINEL values. A
// more-specific route wins over the layer's catch-all server/routes/api/admin/[...].ts.
import { defineEventHandler } from 'h3'

export default defineEventHandler(() => ({
  users: [
    {
      id: 4021,
      subject_id: 'sub-target-sentinel',
      email: 'target.user@example.test',
      given_name: 'Target',
      family_name: 'User',
      display_name: 'Target User',
      role: 'user',
      status: 'active',
      effective_status: 'active',
      disabled_at: null,
      disabled_reason: null,
      locked_at: null,
      locked_until: null,
      locked_reason: null,
      locked_by_subject_id: null,
      lock_count: 0,
      local_account_enabled: true,
      profile_synced_at: '2026-06-20T09:15:00Z',
      email_verified_at: '2026-06-19T08:00:00Z',
      last_login_at: '2026-06-27T22:40:00Z',
      created_at: '2026-01-04T03:30:00Z',
      nik: '3174********4321',
      nip: '1985**********1007',
      nisn: '0098****56',
      birth_date: '1987-**-**',
      mfa_enrolled: true,
      mfa_methods: ['totp'],
      mfa_mandatory: false,
      roles: [{ slug: 'user', name: 'User', is_system: true }],
      login_context: {
        ip_address: '203.0.113.7',
        mfa_required: false,
        last_seen_at: '2026-06-27T22:41:00Z',
      },
    },
  ],
}))
```

3. [ ] Create the masked detail fixture route `test/fixtures/ssr-leak/server/routes/api/admin/users/[subjectId].get.ts` (FULL code) — a `UserDetailResponse` whose one session carries the **raw** `SENTINEL.sid` so the page must mask it:

```ts
// SSR token-leak fixture: a representative MASKED user detail so the §3.3 gate
// can render /users/[subjectId] in its READY state. The single session carries
// the RAW SENTINEL.sid as its id: the detail page renders session ids through
// formatTechnicalPreview (REF-XXXXXXXX), so the raw sid must NEVER appear in the
// HTML or __NUXT_DATA__ — proven by the gate. Government identifiers are masked
// (no 16/18/10-digit run, never the raw NIK/NIP/NISN sentinel).
import { defineEventHandler } from 'h3'
import { SENTINEL } from '../../../../../sentinels'

export default defineEventHandler((event) => {
  const subjectId = (event.context.params?.subjectId as string | undefined) ?? 'sub-target-sentinel'
  return {
    user: {
      id: 4021,
      subject_id: subjectId,
      email: 'target.user@example.test',
      given_name: 'Target',
      family_name: 'User',
      display_name: 'Target User',
      role: 'user',
      status: 'active',
      effective_status: 'active',
      disabled_at: null,
      disabled_reason: null,
      locked_at: null,
      locked_until: null,
      locked_reason: null,
      locked_by_subject_id: null,
      lock_count: 0,
      local_account_enabled: true,
      profile_synced_at: '2026-06-20T09:15:00Z',
      email_verified_at: '2026-06-19T08:00:00Z',
      last_login_at: '2026-06-27T22:40:00Z',
      created_at: '2026-01-04T03:30:00Z',
      nik: '3174********4321',
      nip: '1985**********1007',
      nisn: '0098****56',
      birth_date: '1987-**-**',
      mfa_enrolled: true,
      mfa_methods: ['totp'],
      mfa_mandatory: false,
      roles: [{ slug: 'user', name: 'User', is_system: true }],
    },
    login_context: {
      ip_address: '203.0.113.7',
      mfa_required: false,
      last_seen_at: '2026-06-27T22:41:00Z',
    },
    sessions: [
      {
        // RAW session id on purpose: the page must mask it to REF-4A1B9C0D.
        id: SENTINEL.sid,
        ip_address: '203.0.113.7',
        user_agent: 'Mozilla/5.0',
        last_seen_at: '2026-06-27T22:41:00Z',
        created_at: '2026-06-27T22:00:00Z',
      },
    ],
  }
})
```

4. [ ] Create the roles fixture route `test/fixtures/ssr-leak/server/routes/api/admin/roles/index.get.ts` (FULL code) so the detail page's role-assignment `useAsyncData('admin-roles-list', …)` resolves during SSR instead of hitting the unreachable backend:

```ts
// SSR token-leak fixture: empty masked roles list so UserRoleAssignment's
// useAsyncData('admin-roles-list') resolves deterministically during the gate
// render rather than failing against the unreachable backend. No token/secret/PII.
import { defineEventHandler } from 'h3'

export default defineEventHandler(() => ({ roles: [] }))
```

5. [ ] Add the failing gate assertions to `test/ssr-token-leak.gate.spec.ts`. After the existing `fetchDashboard` helper add:

```ts
function fetchUsersList(): Promise<string> {
  return $fetch('/users')
}

function fetchUserDetail(): Promise<string> {
  return $fetch('/users/sub-target-sentinel')
}
```

Then add three `it` blocks inside the same `describe`:

```ts
  it('renders the users list + detail server-side in their ready (masked) state', async () => {
    const listHtml = await fetchUsersList()
    expect(listHtml).toContain('data-admin-shell')
    expect(listHtml).toContain('Target User')

    const detailHtml = await fetchUserDetail()
    expect(detailHtml).toContain('data-admin-shell')
    expect(detailHtml).toContain('Target User')
    // The raw session id was rendered through formatTechnicalPreview, proving the
    // page masks it (REF-4A1B9C0D is SENTINEL.sid normalized + sliced to 8).
    expect(detailHtml).toContain('REF-4A1B9C0D')
  })

  it('does not leak token/PII/secret values into the users-page SSR HTML', async () => {
    const listHtml = await fetchUsersList()
    const detailHtml = await fetchUserDetail()
    expect(collectSecretLeaks(listHtml, 'users-list SSR HTML')).toEqual([])
    expect(collectSecretLeaks(detailHtml, 'user-detail SSR HTML')).toEqual([])
  })

  it('does not leak token/PII/secret values into the users-page hydration payload', async () => {
    for (const html of [await fetchUsersList(), await fetchUserDetail()]) {
      const serialized = JSON.stringify(JSON.parse(extractPayload(html)))
      expect(collectSecretLeaks(serialized, 'users __NUXT__ payload')).toEqual([])
      expect(collectPiiShapeLeaks(serialized, 'users __NUXT__ payload')).toEqual([])
    }
  })
```

6. [ ] Run the gate — expect **FAIL** at first because the fixture routes are not yet in the pre-built `.output` until `test/globalSetup.ts` rebuilds (the lock dir is removed on teardown, so the next run rebuilds fresh). On a stale `.output` the new routes 404 → `/users`/`/users/sub-target-sentinel` render `forbidden`/`error` → `Target User` and `REF-4A1B9C0D` are absent → the new `it` blocks fail on the positive assertions:
   `npm run test -- test/ssr-token-leak.gate.spec.ts`

7. [ ] Confirm the fixture pre-build picked up the new routes, then re-run — expect **PASS** (both pages render `ready`; no token/secret/PII-shape in HTML or payload; raw `sid` masked):
   `npm run test -- test/ssr-token-leak.gate.spec.ts`

8. [ ] Commit the gate extension:
   `git add test/fixtures/ssr-leak/server/routes/api/admin/users/ test/fixtures/ssr-leak/server/routes/api/admin/roles/ test/fixtures/ssr-leak/server/routes/api/admin/me.get.ts test/ssr-token-leak.gate.spec.ts && git commit -m "$(printf 'test(sso-admin-frontend): extend SSR leak gate to the user list + detail DTOs\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"`

9. [ ] Rewrite `e2e/users.spec.ts` for the Nuxt-4 routes (FULL replacement). Covers the three required high-risk flows (quality §11): critical navigation, forbidden flow, and the role-assignment matrix path (success + step-up). Selectors use standard labels/roles that match the pages built in 4.6/4.8/4.11/4.12; the role-assignment open control is the `Save Role` button (`users.btn_save_roles`) and the confirm gate is `UiAlertDialog` whose confirm button reads `Confirm` (`common.btn_confirm`):

```ts
import { expect, test } from '@playwright/test'

// useI18n resolves locale from the `admin_locale` cookie at SSR time (DEFAULT_LOCALE='id');
// Playwright's `locale:'en-US'` only sets Accept-Language, which useI18n ignores, and there is
// no `dev-sso-admin-locale` localStorage bridge in the Nuxt stack. Set the cookie on the context
// so SSR renders English and the English-label selectors below match the rendered UI.
// NOTE: the merged e2e/dashboard.spec.ts carries the same legacy (broken) locale pattern — apply
// this identical `admin_locale=en` cookie fix there too so its English selectors resolve.
test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: 'admin_locale', value: 'en', url: baseURL! }])
})

// Full-capability admin principal (read + write + lock + roles.write).
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
      permissions: [
        'admin.dashboard.view',
        'admin.users.read',
        'admin.users.write',
        'admin.users.lock',
        'admin.roles.read',
        'admin.roles.write',
      ],
      capabilities: {
        'admin.dashboard.view': true,
        'admin.users.read': true,
        'admin.users.write': true,
        'admin.users.lock': true,
        'admin.roles.read': true,
        'admin.roles.write': true,
      },
      menus: [
        { id: 'dashboard', label: 'Dashboard', required_permission: 'admin.dashboard.view', visible: true },
        { id: 'users', label: 'Users', required_permission: 'admin.users.read', visible: true },
      ],
    },
  },
}

// Read-only admin principal WITHOUT admin.users.read (forbidden-flow case).
const principalNoUsers = {
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

const user = {
  id: 4021,
  subject_id: 'sub_target',
  email: 'target.user@example.test',
  given_name: 'Target',
  family_name: 'User',
  display_name: 'Target User',
  role: 'user',
  status: 'active',
  effective_status: 'active',
  disabled_at: null,
  disabled_reason: null,
  locked_at: null,
  locked_until: null,
  locked_reason: null,
  locked_by_subject_id: null,
  lock_count: 0,
  local_account_enabled: true,
  profile_synced_at: '2026-06-20T09:15:00Z',
  email_verified_at: '2026-06-19T08:00:00Z',
  last_login_at: '2026-06-27T22:40:00Z',
  created_at: '2026-01-04T03:30:00Z',
  nik: '3174********4321',
  nip: '1985**********1007',
  nisn: '0098****56',
  birth_date: '1987-**-**',
  mfa_enrolled: true,
  mfa_methods: ['totp'],
  mfa_mandatory: false,
  roles: [{ slug: 'user', name: 'User', is_system: true }],
}

async function mockMe(page, body) {
  await page.route('**/api/admin/me', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) })
  })
}

async function mockUsersData(page) {
  await page.route('**/api/admin/users', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-users-e2e' },
      body: JSON.stringify({ users: [user] }),
    })
  })
  await page.route('**/api/admin/users/sub_target', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-users-e2e' },
      body: JSON.stringify({
        user,
        login_context: { ip_address: '203.0.113.7', mfa_required: false, last_seen_at: '2026-06-27T22:41:00Z' },
        sessions: [],
      }),
    })
  })
  await page.route('**/api/admin/roles', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        roles: [
          { id: 1, slug: 'user', name: 'User', description: null, is_system: true, permissions: [], user_count: 1, users_count: 1 },
          { id: 2, slug: 'pegawai', name: 'Pegawai', description: null, is_system: false, permissions: [], user_count: 0, users_count: 0 },
        ],
      }),
    })
  })
}

test('critical navigation: list → deep-linked detail with masked PII, no token', async ({ page }) => {
  await mockMe(page, principal)
  await mockUsersData(page)

  await page.goto('/users')
  await expect(page.getByRole('navigation', { name: 'Admin modules' })).toContainText('Users')
  await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible()
  await expect(page.getByText('Target User')).toBeVisible()

  await page.getByRole('link', { name: /Target User/u }).click()
  await expect(page).toHaveURL(/\/users\/sub_target$/u)
  await expect(page.getByRole('heading', { name: 'Target User' })).toBeVisible()
  // Masked identifier is rendered; no raw 16/18/10-digit PII, no token.
  await expect(page.getByText('3174********4321')).toBeVisible()
  await expect(page.getByText(/\b\d{16}\b|\b\d{18}\b|\b\d{10}\b/u)).toHaveCount(0)
  await expect(page.getByText(/Bearer|access_token|refreshToken|SQLSTATE/u)).toHaveCount(0)
})

test('forbidden flow: admin without admin.users.read sees the safe forbidden surface', async ({ page }) => {
  await mockMe(page, principalNoUsers)

  await page.goto('/users')
  await expect(page).toHaveURL(/\/forbidden$/u)
  await expect(page.getByRole('navigation', { name: 'Admin modules' })).not.toContainText('Users')
  await expect(page.getByText(/Bearer|access_token|SQLSTATE/u)).toHaveCount(0)
})

test('role assignment: high-risk path succeeds and surfaces safe step-up on 428', async ({ page }) => {
  await mockMe(page, principal)
  await mockUsersData(page)

  let assignAttempt = 0
  await page.route('**/api/admin/users/sub_target/roles', async (route) => {
    assignAttempt += 1
    if (assignAttempt === 1) {
      await route.fulfill({
        status: 428,
        contentType: 'application/json',
        headers: { 'x-request-id': 'req-stepup-e2e' },
        body: JSON.stringify({ error: 'step_up_required', message: 'raw ACR failure trace', step_up_url: '/step-up-required' }),
      })
      return
    }
    await route.fulfill({
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-assign-e2e' },
      body: JSON.stringify({
        user: { subject_id: 'sub_target', email: 'target.user@example.test', display_name: 'Target User', role: 'pegawai', status: 'active', roles: [{ slug: 'pegawai', name: 'Pegawai', is_system: false }] },
      }),
    })
  })

  await page.goto('/users/sub_target')

  // High-risk path #1: backend demands step-up — safe copy, redacted ref, no raw trace.
  await page.getByRole('radio', { name: 'Pegawai' }).check()
  await page.getByRole('button', { name: 'Save Role' }).click()
  await page.getByRole('button', { name: 'Confirm' }).click()
  await expect(page.getByText(/step-up|MFA assurance/u)).toBeVisible()
  await expect(page.getByText('REF-TEPUPE2E').first()).toBeVisible()
  await expect(page.getByText('raw ACR')).toHaveCount(0)

  // High-risk path #2: retry succeeds.
  await page.getByRole('button', { name: 'Save Role' }).click()
  await page.getByRole('button', { name: 'Confirm' }).click()
  await expect(page.getByText('Pegawai')).toBeVisible()
  await expect(page.getByText(/Bearer|access_token|SQLSTATE/u)).toHaveCount(0)
})
```

10. [ ] Run the Users e2e — expect **PASS** once the pages from 4.6/4.8/4.11/4.12 are built (this task runs last in the phase, so they exist). If a selector label drifts from the built component, fix the selector (not the page) to match the shipped standard label:
    `npm run test:e2e -- e2e/users.spec.ts`

11. [ ] Commit the e2e:
    `git add e2e/users.spec.ts && git commit -m "$(printf 'test(sso-admin-frontend): Nuxt-4 Users e2e (nav, forbidden, role assignment)\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"`

12. [ ] Run the **full Definition-of-Done gate** from `services/sso-admin-frontend` (each must PASS; if any command is blocked by the environment, report exactly which command and why — never claim PASS for a command that did not run):
    - `npm run typecheck`
    - `npm run lint`
    - `npm run format:check` (run `npm run format` first if it flags the new fixture/spec files, then re-check)
    - `npm run test`
    - `npm run build`
    - `npm run test:e2e`

13. [ ] If `format` rewrote any file in step 12, commit the formatting:
    `git add -A && git commit -m "$(printf 'style(sso-admin-frontend): format Users phase test fixtures + e2e\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"`

**Task DoD (run from `services/sso-admin-frontend`):** `npm run typecheck && npm run lint && npm run format:check && npm run test && npm run build`, plus `npm run test:e2e` — all green (or any blocked command reported explicitly), with the SSR leak gate proving the user list + detail DTOs (masked PII + masked session id) leak nothing into the SSR HTML or `__NUXT_DATA__`.

---

## Phase 4 Definition of Done

- [ ] DTO + pure resolvers + identifier/password helpers + service + composables + table/domain components + pages + privileged-action infra + lifecycle/role actions all implemented test-first (Tasks 4.1–4.13), each committed green.
- [ ] **Full gate green** from `services/sso-admin-frontend`: `npm run typecheck` (0 errors), `npm run lint` (0 errors), `npm run format:check`, `npm run test`, `npm run build` — all PASS (any blocked command reported explicitly, never claimed PASS).
- [ ] **SSR token-leak gate extended** to cover the user **list + detail** DTOs: masked PII (`nik`/`nip`/`nisn`/`birth_date` as backend-masked values only), masked session ids, and no access/refresh/ID token, secret, or raw backend exception in the SSR HTML or `__NUXT__`/`__NUXT_DATA__` (target user email is the one intentionally-shown operator field).
- [ ] **Privileged-action test matrix applied to every destructive/write action** (deactivate, reactivate, password-reset, reset-MFA, lock, unlock, require-MFA, unrequire-MFA, sync-profile, create, assign-role): allowed/403/401/419/429/422/step-up(428)/5xx + no-stale-state, with destructive-confirm and per-feature permission tests.
- [ ] **id ↔ en locale parity** holds for the `users.*` (and any touched `common.*`) catalogs — no parity drift; genuinely-new keys added to BOTH files, existing keys reused.
- [ ] **Users e2e flow green** (`npm run test:e2e -- e2e/users.spec.ts`): nav, forbidden, masked detail, role assignment with step-up.
- [ ] Swiss discipline upheld: tokens-only, hairline (no shadow), single accent `#002FA7`, `danger #E4002B` reserved for destructive/critical-security-status (with text label, never colour-alone), status never colour-alone, `--font-mono` only for raw IDs/correlation (timestamps/counts use condensed-sans `UiFolio`).
- [ ] The `feat/admin-frontend-nuxt4-ssr-swiss-redesign` branch **stays off `main` until the Phase 18 cutover** — Phase 4 merges into the feature branch only.
