# Phase 9 — Admin Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the `/sessions` admin surface as a Nuxt-4 SSR, Swiss-redesigned **active-session console** — list every active device/OIDC session, inspect one in a read drawer, and **terminate** a session through a step-up-gated, self-lockout-aware destructive action — at functional parity with the legacy SPA, test-first, leaking no token/secret in the SSR payload.

**Architecture:** `app/pages/sessions.vue` (SSR, permission-gated, all six states) → `app/composables/useSessionsList.ts` (`useAsyncData`, view-state + stale + requestId) → `app/services/sessions.api.ts` (single network seam over `apiClient`) → Nitro BFF (`/api/admin/*` → `/admin/api/*`, injects `Bearer`, already allow-listed) → Laravel backend. Pure logic (view-state, client-side search, own-session detection) lives in `app/lib/sessions/`. The single write (terminate) runs through the **reused** `usePrivilegedAction` + `PrivilegedActionDialog` (`danger`) so the full `403/419/422/428/429/5xx` + step-up matrix surfaces safe, status-keyed copy and a redacted support reference; terminating one of the acting admin's own sessions warns and re-verifies the principal afterward (it can sign them out).

**Tech Stack:** Nuxt 4.4.8 (full SSR), Vue 3.5 SFC, TypeScript strict, Pinia (`useSessionStore` consumed read-only for `hasPermission` + `principal.subject_id`), `useAsyncData` + `apiClient`, Vitest 4 + `@nuxt/test-utils` 4 (nuxt-runtime specs named `*.nuxt.spec.ts`), Playwright (e2e authored; run deferred to Phase 18). Reka UI primitives via the ported Swiss `Ui*` components.

## Global Constraints

These apply to **every** task.

- **Backend is the security boundary.** The UI gate is UX minimization; the backend re-checks permission + session-management role + fresh-auth + MFA on every call. Never weaken a UI gate to "match" the backend.
- **Permission gate.** The `/sessions` route is gated `admin.sessions.terminate` via `definePageMeta` (matches the existing stub + the spec route table). Backend reality: GET (list) has **no** route permission gate (only authenticated-admin + MFA-assurance); DELETE (terminate) requires `admin.sessions.terminate` **AND** a session-management role (`RequireAdminSessionManagementRole`, role ∈ `config('sso.admin.session_management_roles')`, default `['admin']`). The UI cannot see the role, so the terminate affordance gates on `hasPermission('admin.sessions.terminate')` and the backend enforces the role + step-up.
- **Step-up is real.** DELETE `/sessions/{id}` is behind `EnsureFreshAdminAuth:step_up` (the high tier). Stale auth → **HTTP 428** `{ error: "reauth_required", step_up_url }`. A separate **403** `mfa_required` gate also applies. The privileged-action matrix already maps 428/412/`reauth_required`/`step_up_required` → `step_up_required` (checked FIRST) and surfaces `step_up_url`.
- **Terminate error codes (this domain, verbatim):** 403 `forbidden` (role gate "Explicit session management role is required." OR permission gate), 403 `mfa_required`, 428 `reauth_required`, 429 throttle (write 10/min), 500 `admin_action_failed` ("Failed to revoke session." — the generic DELETE failure is **500, not 422**), 422 `role_management_failed` (rare). **There is NO 404 on DELETE** — terminating a missing/already-revoked session returns **200** `{ revoked: true, session_id, revoked_tokens: 0, backchannel_fanout: 0 }`. 401 `unauthorized` if the admin context is absent.
- **No self-protection in the backend, and no `is_current` flag in the DTO.** The backend allows an admin to terminate their own session (it signs them out) and provides no marker to identify the acting admin's row. The UI MUST implement its own self-lockout guard: a session whose `subject_id` equals the acting principal's `subject_id` (`useSessionStore().principal.subject_id`) is one of the admin's own — warn before terminating, and after a successful self-affecting terminate **re-verify the principal** (`ensureSession(true)` → `resolveBootstrapFailure` → re-route if it dropped), mirroring the roles/policy domains. `reverifySelf` is a no-op when the terminated session was a different device (the current session still authenticates).
- **SSR token-leak gate (design §3.3, mandatory):** Tokens, session secrets, and raw PII must **never** enter the SSR HTML or the `__NUXT__`/`__NUXT_DATA__` payload. **FORBIDDEN:** access/refresh/ID token values + field names (`accessToken|refreshToken|idToken|access_token|refresh_token|id_token`); session/client secret values + names (`sessionEncryptionSecret|adminOidcClientSecret|client_secret`); raw NIK(16)/NIP(18)/NISN(10) digit runs (`\b\d{16}\b` / `\b\d{18}\b` / `\b\d{10}\b`); raw backend exceptions; the `SSR_LEAK_CANARY`. **The session DTO carries NO token/secret/credential and NO gov-PII** — only operational metadata: `session_id` (the opaque session HANDLE used to terminate — an identifier, not a credential), `client_id`, `subject_id` (opaque OIDC subject, ULID — not gov-PII), `email` (allowed display field, per the Phase-4 target-email decision), `display_name`, `scope`, `ip_address`, `user_agent`, timestamps. So the sessions leak-gate blocks use **`allowSessionId: true`** (the `session_id` operational identifier is rendered/hydrated by design — this is the exact case Phase 4 introduced `allowSessionId` for, used on the users pages). The `/sessions` fixture must keep every field free of token-name keys and 10/16/18-digit runs (IPs like `203.0.113.45`, ULID subject ids, clean user-agent strings).
- **Swiss design system:** single Klein-blue accent `--accent #002FA7`; **`--danger #E4002B` reserved for destructive affordances only** — in this domain that is the **terminate** action and nothing else. Status is tone **+** text label via `UiStatusBadge` (never colour-alone). Hairline borders, no shadows, sharp radii. Folio numerals for record counts/timestamps; `--font-mono` only for raw IDs (`session_id`, `subject_id`, `ip_address`). Standard labels ("Sessions", "Revoke", "Cancel") — no themed copy, Lucide icons only.
- **No traceability markers** (`OG#`, `UC###`, `FR###`, `BE-FR###`) anywhere.
- **Locale parity:** `app/locales/en.json` and `app/locales/id.json` stay in sync. The `sessions.*` block already exists in both (33 keys) — extend it, do not duplicate keys.
- **Reuse, don't rebuild:** the Nitro proxy already allow-lists `GET /api/admin/sessions` and `DELETE /api/admin/sessions/{id}`; every `Ui*` primitive, the privileged-action infra (`usePrivilegedAction` + `PrivilegedActionDialog` + `resolvePrivilegedActionFailure`), the `resolveBootstrapFailure` bootstrap resolver, `apiClient`/`ApiError`, and the SSR-leak-gate harness all exist — consume them as-is. Phase 9 builds only the session DTOs, pure helpers, service, composable, table, page body, the terminate action, and the leak-gate/e2e extension.
- **`npm run lint` is `run-s lint:*`** → BOTH `lint:oxlint` (`oxlint .`) AND `lint:eslint` (`eslint "src/**/*.vue" "app/**/*.vue"`) must pass. oxlint rules that bite: every `vi.fn(...)` needs a type parameter; every `.toThrow(...)` needs a message argument. `npm run format:check` is `prettier --check --experimental-cli .` (use the npm script — plain `npx prettier --check .` false-reds on a pre-existing UAT markdown).
- **Commit trailer (verbatim):** `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## Task Index

| Task | Title | Deliverable |
|---|---|---|
| 9.1 | Session DTO types + pure view-state | `app/types/sessions.types.ts`, `app/lib/sessions/sessions-view-state.ts` |
| 9.2 | Pure session helpers (client-side search · own-session detection) | `app/lib/sessions/sessions-list.ts` |
| 9.3 | `sessions.api.ts` service (single network seam) | `app/services/sessions.api.ts` |
| 9.4 | `useSessionsList` SSR composable | `app/composables/useSessionsList.ts` |
| 9.5 | `SessionsTable.vue` (Swiss active-session table) | `app/components/sessions/SessionsTable.vue` |
| 9.6 | `/sessions` page — all six states, search, detail drawer (read surface) | `app/pages/sessions.vue` |
| 9.7 | Terminate-session privileged action (danger · step-up · self-lockout) | `app/pages/sessions.vue` |
| 9.8 | Extend SSR token-leak gate + Sessions e2e + full Phase-9 DoD | `test/ssr-token-leak.gate.spec.ts`, fixture, `e2e/sessions.spec.ts` |

---

### Task 9.1: Session DTO types + pure view-state resolver

**Files:**
- Create: `app/types/sessions.types.ts`
- Create: `app/lib/sessions/sessions-view-state.ts`
- Test: `app/lib/sessions/__tests__/sessions-view-state.spec.ts`

**Interfaces:**
- Consumes: `ApiError` (`@/lib/api/api-client`).
- Produces:
  - `app/types/sessions.types.ts`: `AdminSession` (the REAL backend shape — `email`/`display_name`, plus `scope`/`expires_at`); `SessionListResponse` ({ sessions }); `SessionRevokeResponse` ({ revoked, session_id, revoked_tokens?, backchannel_fanout? }).
  - `app/lib/sessions/sessions-view-state.ts`: `SessionsViewState = 'loading'|'unauthenticated'|'forbidden'|'error'|'empty'|'ready'`; `resolveSessionsViewState({ pending, error, sessions }): SessionsViewState`.

- [ ] **Step 1: Write the failing test** — `app/lib/sessions/__tests__/sessions-view-state.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api/api-client'
import { resolveSessionsViewState } from '../sessions-view-state'
import type { AdminSession } from '@/types/sessions.types'

const session = (over: Partial<AdminSession> = {}): AdminSession => ({
  session_id: 'sess_handle_1',
  client_id: 'portal',
  subject_id: '01HZX9SUBJECTULID00000000AB',
  email: 'user@example.test',
  display_name: 'Test User',
  scope: 'openid profile',
  ip_address: '203.0.113.45',
  user_agent: 'Mozilla/5.0',
  created_at: '2026-06-01T00:00:00Z',
  last_activity_at: '2026-06-02T00:00:00Z',
  expires_at: '2026-07-01T00:00:00Z',
  ...over,
})

describe('resolveSessionsViewState', () => {
  it('is loading when nothing has resolved yet', () => {
    expect(resolveSessionsViewState({ pending: true, error: null, sessions: null })).toBe('loading')
  })

  it('maps a 401 (no prior list) to unauthenticated', () => {
    expect(
      resolveSessionsViewState({ pending: false, error: new ApiError(401, 'x'), sessions: null }),
    ).toBe('unauthenticated')
  })

  it('maps a 403 (no prior list) to forbidden', () => {
    expect(
      resolveSessionsViewState({ pending: false, error: new ApiError(403, 'x'), sessions: null }),
    ).toBe('forbidden')
  })

  it('maps any other error (no prior list) to error', () => {
    expect(
      resolveSessionsViewState({ pending: false, error: new ApiError(500, 'x'), sessions: null }),
    ).toBe('error')
  })

  it('is empty when there are zero active sessions', () => {
    expect(resolveSessionsViewState({ pending: false, error: null, sessions: [] })).toBe('empty')
  })

  it('is ready when sessions exist', () => {
    expect(
      resolveSessionsViewState({ pending: false, error: null, sessions: [session()] }),
    ).toBe('ready')
  })

  it('keeps a good list on screen when a background refresh errors (ready, not error)', () => {
    expect(
      resolveSessionsViewState({ pending: false, error: new ApiError(500, 'x'), sessions: [session()] }),
    ).toBe('ready')
  })
})
```

- [ ] **Step 2: Run it — expect FAIL** (`npm run test -- app/lib/sessions/__tests__/sessions-view-state.spec.ts`): module-not-found.

- [ ] **Step 3: Create `app/types/sessions.types.ts`:**

```ts
// Admin session DTOs — the EXACT backend shape from AdminSessionService::sessionPayload.
// The DTO carries only operational metadata: session_id is the opaque session HANDLE
// (the terminate key — an identifier, not a credential), subject_id is an opaque OIDC
// subject (ULID, not gov-PII), email is an allowed display field. No token/secret.
export interface AdminSession {
  readonly session_id: string
  readonly client_id?: string | null
  readonly subject_id?: string | null
  readonly email?: string | null
  readonly display_name?: string | null
  readonly scope?: string | null
  readonly ip_address?: string | null
  readonly user_agent?: string | null
  readonly created_at?: string | null
  readonly last_activity_at?: string | null
  readonly expires_at?: string | null
}

export interface SessionListResponse {
  readonly sessions: readonly AdminSession[]
}

// DELETE /sessions/{id} returns a superset of { revoked, session_id } with token-count
// metadata; revoking a missing session is NOT an error (200, revoked_tokens: 0).
export interface SessionRevokeResponse {
  readonly revoked: boolean
  readonly session_id: string
  readonly revoked_tokens?: number
  readonly backchannel_fanout?: number
}
```

- [ ] **Step 4: Create `app/lib/sessions/sessions-view-state.ts`** (mirrors `roles-view-state.ts` / `policy-view-state.ts`):

```ts
import { ApiError } from '@/lib/api/api-client'
import type { AdminSession } from '@/types/sessions.types'

export type SessionsViewState =
  | 'loading'
  | 'unauthenticated'
  | 'forbidden'
  | 'error'
  | 'empty'
  | 'ready'

// "Empty" = the backend answered with zero active sessions. Distinct from `forbidden`
// (403) so the page shows a "no active sessions" surface, not access-denied. `null`
// (unfetched) stays `loading`.
export function resolveSessionsViewState({
  error,
  sessions,
}: {
  readonly pending: boolean
  readonly error: unknown
  readonly sessions: readonly AdminSession[] | null
}): SessionsViewState {
  if (error && !sessions) {
    const status = errorStatus(error)
    if (status === 401) return 'unauthenticated'
    if (status === 403) return 'forbidden'
    return 'error'
  }
  if (sessions) return sessions.length === 0 ? 'empty' : 'ready'
  return 'loading'
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

- [ ] **Step 5: Run it — expect PASS** (7 assertions).

- [ ] **Step 6: Commit:**

```bash
git add app/types/sessions.types.ts app/lib/sessions/sessions-view-state.ts app/lib/sessions/__tests__/sessions-view-state.spec.ts
git commit -m "$(cat <<'EOF'
feat(sso-admin-frontend): session DTO types + pure view-state resolver

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Task-scoped DoD:** `npm run typecheck && npm run lint && npm run format:check && npm run test -- app/lib/sessions/__tests__/sessions-view-state.spec.ts` — all green. No render/network here, so no SSR-leak step (that is Task 9.8).

---

### Task 9.2: Pure session helpers (client-side search · own-session detection)

**Files:**
- Create: `app/lib/sessions/sessions-list.ts`
- Test: `app/lib/sessions/__tests__/sessions-list.spec.ts`

**Interfaces:**
- Consumes: `AdminSession` (`@/types/sessions.types`).
- Produces:
  - `filterSessions(sessions: readonly AdminSession[], query: string): readonly AdminSession[]` — case-insensitive match over `session_id`, `client_id`, `display_name`, `email`, `ip_address`; empty/whitespace query returns the input.
  - `isOwnSession(session: AdminSession, principalSubjectId: string | null | undefined): boolean` — true when the session belongs to the acting admin (`subject_id` equals the principal's, both present). Drives the self-lockout warning.

- [ ] **Step 1: Write the failing test** — `app/lib/sessions/__tests__/sessions-list.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { filterSessions, isOwnSession } from '../sessions-list'
import type { AdminSession } from '@/types/sessions.types'

const make = (over: Partial<AdminSession>): AdminSession => ({
  session_id: 'sess_1',
  client_id: 'portal',
  subject_id: 'subj_a',
  email: 'a@example.test',
  display_name: 'Alice Admin',
  ip_address: '203.0.113.10',
  ...over,
})

const sessions: readonly AdminSession[] = [
  make({ session_id: 'sess_alpha', display_name: 'Alice Admin', ip_address: '203.0.113.10', client_id: 'portal' }),
  make({ session_id: 'sess_bravo', display_name: 'Bob Operator', ip_address: '198.51.100.7', client_id: 'console' }),
]

describe('filterSessions', () => {
  it('returns all sessions for an empty/whitespace query', () => {
    expect(filterSessions(sessions, '')).toBe(sessions)
    expect(filterSessions(sessions, '   ')).toBe(sessions)
  })

  it('matches on display name (case-insensitive)', () => {
    expect(filterSessions(sessions, 'alice').map((s) => s.session_id)).toEqual(['sess_alpha'])
  })

  it('matches on ip address', () => {
    expect(filterSessions(sessions, '198.51').map((s) => s.session_id)).toEqual(['sess_bravo'])
  })

  it('matches on session id and client id', () => {
    expect(filterSessions(sessions, 'bravo').map((s) => s.session_id)).toEqual(['sess_bravo'])
    expect(filterSessions(sessions, 'console').map((s) => s.session_id)).toEqual(['sess_bravo'])
  })

  it('matches on email', () => {
    expect(filterSessions([make({ session_id: 'x', email: 'find.me@example.test' })], 'find.me')).toHaveLength(1)
  })

  it('returns an empty list when nothing matches', () => {
    expect(filterSessions(sessions, 'zzz-no-match')).toEqual([])
  })
})

describe('isOwnSession', () => {
  it('is true when the session subject matches the principal', () => {
    expect(isOwnSession(make({ subject_id: 'me' }), 'me')).toBe(true)
  })

  it('is false for a different subject', () => {
    expect(isOwnSession(make({ subject_id: 'other' }), 'me')).toBe(false)
  })

  it('is false when either side is missing', () => {
    expect(isOwnSession(make({ subject_id: null }), 'me')).toBe(false)
    expect(isOwnSession(make({ subject_id: 'me' }), null)).toBe(false)
    expect(isOwnSession(make({ subject_id: 'me' }), undefined)).toBe(false)
  })
})
```

- [ ] **Step 2: Run it — expect FAIL** (module-not-found).

- [ ] **Step 3: Create `app/lib/sessions/sessions-list.ts`:**

```ts
import type { AdminSession } from '@/types/sessions.types'

// Client-side search over the hydrated active-session list (the backend GET has no
// query params). Matches the fields an operator can see: session id, client, name,
// email, IP. An empty/whitespace query returns the input array unchanged (same ref).
export function filterSessions(
  sessions: readonly AdminSession[],
  query: string,
): readonly AdminSession[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return sessions
  return sessions.filter((session) =>
    [
      session.session_id,
      session.client_id,
      session.display_name,
      session.email,
      session.ip_address,
    ].some((field) => field != null && field.toLowerCase().includes(needle)),
  )
}

// Self-lockout detection: the backend offers no `is_current` flag and no
// self-protection, so the UI flags a session as the acting admin's own when its
// subject_id equals the principal's. Terminating such a session can sign the admin
// out, so the confirm warns and the page re-verifies the principal afterward.
export function isOwnSession(
  session: AdminSession,
  principalSubjectId: string | null | undefined,
): boolean {
  return (
    principalSubjectId != null &&
    session.subject_id != null &&
    session.subject_id === principalSubjectId
  )
}
```

- [ ] **Step 4: Run it — expect PASS.**

- [ ] **Step 5: Commit:**

```bash
git add app/lib/sessions/sessions-list.ts app/lib/sessions/__tests__/sessions-list.spec.ts
git commit -m "$(cat <<'EOF'
feat(sso-admin-frontend): pure session search + own-session detection

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Task-scoped DoD:** `npm run typecheck && npm run lint && npm run format:check && npm run test -- app/lib/sessions/__tests__/sessions-list.spec.ts` — all green.

---

### Task 9.3: `sessions.api.ts` service (single network seam)

**Files:**
- Create: `app/services/sessions.api.ts`
- Test: `app/services/__tests__/sessions.api.spec.ts`

**Interfaces:**
- Consumes: `apiClient` (`@/lib/api/api-client`) — `get<T>(path)`, `delete<T>(path)`; `SessionListResponse`, `SessionRevokeResponse` (`@/types/sessions.types`).
- Produces: `sessionsApi` with
  - `list(): Promise<SessionListResponse>` → `GET /api/admin/sessions`
  - `revoke(sessionId: string): Promise<SessionRevokeResponse>` → `DELETE /api/admin/sessions/{sessionId}`

> ponytail: no `show()` — the list DTO already carries every field the drawer needs, so a per-session GET is dead weight (YAGNI). A dumb forwarding seam; the Nitro proxy injects the Bearer and already allow-lists both routes. `sessionId` is path-encoded defensively.

- [ ] **Step 1: Write the failing test** — `app/services/__tests__/sessions.api.spec.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { sessionsApi } from '../sessions.api'
import { apiClient } from '@/lib/api/api-client'

vi.mock('@/lib/api/api-client', () => ({
  apiClient: {
    get: vi.fn<(path: string) => Promise<unknown>>(),
    delete: vi.fn<(path: string) => Promise<unknown>>(),
  },
}))

const get = vi.mocked(apiClient.get)
const del = vi.mocked(apiClient.delete)

afterEach(() => {
  vi.clearAllMocks()
})

describe('sessionsApi', () => {
  it('list GETs the sessions endpoint', async () => {
    get.mockResolvedValue({ sessions: [] })
    await sessionsApi.list()
    expect(get).toHaveBeenCalledWith('/api/admin/sessions')
  })

  it('revoke DELETEs the session endpoint', async () => {
    del.mockResolvedValue({ revoked: true, session_id: 'sess_1' })
    await sessionsApi.revoke('sess_1')
    expect(del).toHaveBeenCalledWith('/api/admin/sessions/sess_1')
  })

  it('path-encodes the session id', async () => {
    del.mockResolvedValue({ revoked: true, session_id: 'a/b' })
    await sessionsApi.revoke('a/b')
    expect(del).toHaveBeenCalledWith('/api/admin/sessions/a%2Fb')
  })
})
```

- [ ] **Step 2: Run it — expect FAIL** (module-not-found).

- [ ] **Step 3: Create `app/services/sessions.api.ts`:**

```ts
import { apiClient } from '@/lib/api/api-client'
import type { SessionListResponse, SessionRevokeResponse } from '@/types/sessions.types'

// Single network seam for the admin-sessions domain. The BFF rewrites /api/admin/* ->
// /admin/api/* and injects the Bearer; both routes are already in the proxy allow-list.
export const sessionsApi = {
  list(): Promise<SessionListResponse> {
    return apiClient.get<SessionListResponse>('/api/admin/sessions')
  },
  revoke(sessionId: string): Promise<SessionRevokeResponse> {
    return apiClient.delete<SessionRevokeResponse>(
      `/api/admin/sessions/${encodeURIComponent(sessionId)}`,
    )
  },
}
```

- [ ] **Step 4: Run it — expect PASS.**

- [ ] **Step 5: Commit:**

```bash
git add app/services/sessions.api.ts app/services/__tests__/sessions.api.spec.ts
git commit -m "$(cat <<'EOF'
feat(sso-admin-frontend): sessions.api service over the admin api-client

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Task-scoped DoD:** `npm run typecheck && npm run lint && npm run format:check && npm run test -- app/services/__tests__/sessions.api.spec.ts` — all green.

---

### Task 9.4: `useSessionsList` SSR composable

**Files:**
- Create: `app/composables/useSessionsList.ts`
- Test: `app/composables/__tests__/useSessionsList.nuxt.spec.ts`

**Interfaces:**
- Consumes: `useAsyncData` (Nuxt auto-import); `sessionsApi` (`@/services/sessions.api`); `resolveSessionsViewState`, `SessionsViewState` (`@/lib/sessions/sessions-view-state`); `ApiError`, `getLastRequestId` (`@/lib/api/api-client`); `AdminSession`, `SessionListResponse` (`@/types/sessions.types`).
- Produces: `useSessionsList(): UseSessionsListReturn` —
  - `sessions: Ref<readonly AdminSession[] | null>` (null = unfetched, distinct from `[]`)
  - `viewState: ComputedRef<SessionsViewState>`, `isStale: ComputedRef<boolean>`, `requestId: ComputedRef<string | null>`, `pending: Ref<boolean>`, `refresh: () => Promise<void>`.

- [ ] **Step 1: Write the failing test** — `app/composables/__tests__/useSessionsList.nuxt.spec.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { ApiError } from '@/lib/api/api-client'
import type { AdminSession } from '@/types/sessions.types'

const listMock = vi.fn<() => Promise<unknown>>()
vi.mock('@/services/sessions.api', () => ({ sessionsApi: { list: listMock } }))

const dataRef = ref<unknown>(null)
const pendingRef = ref(false)
const errorRef = ref<unknown>(null)
const refreshMock = vi.fn<() => Promise<void>>(async () => {})

mockNuxtImport('useAsyncData', () => {
  return (_key: string, handler: () => Promise<unknown>) => {
    void handler()
    return { data: dataRef, pending: pendingRef, error: errorRef, refresh: refreshMock }
  }
})

const { useSessionsList } = await import('../useSessionsList')

const session: AdminSession = {
  session_id: 'sess_1',
  client_id: 'portal',
  subject_id: 'subj_a',
  email: 'a@example.test',
  display_name: 'Alice',
}

beforeEach(() => {
  dataRef.value = null
  pendingRef.value = false
  errorRef.value = null
  listMock.mockReset()
  listMock.mockResolvedValue({ sessions: [] })
})
afterEach(() => {
  vi.clearAllMocks()
})

describe('useSessionsList', () => {
  it('fetches the session list', () => {
    useSessionsList()
    expect(listMock).toHaveBeenCalledTimes(1)
  })

  it('maps loading / empty / ready', () => {
    const r = useSessionsList()
    pendingRef.value = true
    expect(r.viewState.value).toBe('loading')
    pendingRef.value = false
    dataRef.value = { sessions: [] }
    expect(r.viewState.value).toBe('empty')
    dataRef.value = { sessions: [session] }
    expect(r.viewState.value).toBe('ready')
    expect(r.sessions.value).toEqual([session])
  })

  it('keeps the last-good list and flags stale on a refresh error', () => {
    const r = useSessionsList()
    dataRef.value = { sessions: [session] }
    errorRef.value = new ApiError(500, 'boom')
    expect(r.viewState.value).toBe('ready')
    expect(r.isStale.value).toBe(true)
  })

  it('surfaces the ApiError requestId', () => {
    const r = useSessionsList()
    errorRef.value = new ApiError(403, 'no', undefined, {}, 'req-sessions')
    expect(r.requestId.value).toBe('req-sessions')
  })
})
```

- [ ] **Step 2: Run it — expect FAIL** (module-not-found).

- [ ] **Step 3: Create `app/composables/useSessionsList.ts`:**

```ts
import { computed, type ComputedRef, type Ref } from 'vue'
import { ApiError, getLastRequestId } from '@/lib/api/api-client'
import { sessionsApi } from '@/services/sessions.api'
import { resolveSessionsViewState, type SessionsViewState } from '@/lib/sessions/sessions-view-state'
import type { AdminSession, SessionListResponse } from '@/types/sessions.types'

export type UseSessionsListReturn = {
  readonly sessions: Ref<readonly AdminSession[] | null>
  readonly viewState: ComputedRef<SessionsViewState>
  readonly isStale: ComputedRef<boolean>
  readonly requestId: ComputedRef<string | null>
  readonly pending: Ref<boolean>
  readonly refresh: () => Promise<void>
}

export function useSessionsList(): UseSessionsListReturn {
  // Runs during SSR so the masked session list resolves server-side and hydrates as
  // safe operational DTO only (no token/secret). The token stays in Nitro context.
  const { data, pending, error, refresh } = useAsyncData<SessionListResponse>(
    'admin-sessions-list',
    () => sessionsApi.list(),
  )

  const sessions = computed<readonly AdminSession[] | null>(() => data.value?.sessions ?? null)

  const viewState = computed<SessionsViewState>(() =>
    resolveSessionsViewState({ pending: pending.value, error: error.value, sessions: sessions.value }),
  )

  const isStale = computed<boolean>(() => Boolean(error.value) && sessions.value !== null)

  const requestId = computed<string | null>(() =>
    error.value instanceof ApiError
      ? (error.value.requestId ?? getLastRequestId())
      : getLastRequestId(),
  )

  return {
    sessions,
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

- [ ] **Step 4: Run it — expect PASS.**

- [ ] **Step 5: Commit:**

```bash
git add app/composables/useSessionsList.ts app/composables/__tests__/useSessionsList.nuxt.spec.ts
git commit -m "$(cat <<'EOF'
feat(sso-admin-frontend): useSessionsList SSR composable

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Task-scoped DoD:** `npm run typecheck && npm run lint && npm run format:check && npm run test -- app/composables/__tests__/useSessionsList.nuxt.spec.ts` — all green.

---

### Task 9.5: `SessionsTable.vue` (Swiss active-session table)

**Files:**
- Create: `app/components/sessions/SessionsTable.vue`
- Test: `app/components/sessions/__tests__/SessionsTable.spec.ts`

**Interfaces:**
- Consumes: `UiDataList` (+ `UiDataListColumn`, `UiDataListRow`), `UiStatusBadge`, `UiFolio` (`@/components/ui/*`); `AdminSession` (`@/types/sessions.types`).
- Produces: `SessionsTable.vue` — props `sessions: readonly AdminSession[]`, `caption`, `userLabel`, `sessionIdLabel`, `clientLabel`, `ipLabel`, `statusLabel`, `activeLabel: string`; emits `select(sessionId: string)`. The user cell holds a keyboard-reachable button (emits `select`); `session_id` + `ip_address` render mono (`UiFolio variant="id"`); status renders a single tone+label `UiStatusBadge` (the list returns active sessions only — `success`/`activeLabel`, never colour-alone).

> ponytail: presentational only — no fetch, no privileged action, no i18n inside (the page passes resolved labels, like `RolesTable`/`PolicyVersionsTable`). Explicit `Ui*` imports, so the spec is a plain jsdom `mount`.

- [ ] **Step 1: Write the failing test** — `app/components/sessions/__tests__/SessionsTable.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import SessionsTable from '../SessionsTable.vue'
import type { AdminSession } from '@/types/sessions.types'

const sessions: readonly AdminSession[] = [
  {
    session_id: 'sess_alpha_handle',
    client_id: 'portal',
    subject_id: '01HZX9SUBJECTULID00000000AB',
    email: 'alice@example.test',
    display_name: 'Alice Admin',
    ip_address: '203.0.113.10',
    user_agent: 'Mozilla/5.0',
  },
  {
    session_id: 'sess_bravo_handle',
    client_id: 'console',
    subject_id: '01HZX9SUBJECTULID11111111CD',
    email: 'bob@example.test',
    display_name: 'Bob Operator',
    ip_address: '198.51.100.7',
    user_agent: 'Mozilla/5.0',
  },
]

const props = {
  sessions,
  caption: 'Active sessions',
  userLabel: 'User',
  sessionIdLabel: 'Session ID',
  clientLabel: 'Client',
  ipLabel: 'IP',
  statusLabel: 'Status',
  activeLabel: 'Active',
}

describe('SessionsTable', () => {
  it('renders one selectable row per session with user + IP', () => {
    const wrapper = mount(SessionsTable, { props })
    expect(wrapper.find('[data-testid="session-select-sess_alpha_handle"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="session-select-sess_bravo_handle"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Alice Admin')
    expect(wrapper.text()).toContain('203.0.113.10')
  })

  it('emits select with the session id on user-cell click', async () => {
    const wrapper = mount(SessionsTable, { props })
    await wrapper.find('[data-testid="session-select-sess_alpha_handle"]').trigger('click')
    expect(wrapper.emitted('select')).toEqual([['sess_alpha_handle']])
  })

  it('renders the active status label (tone + text, never colour-alone)', () => {
    const wrapper = mount(SessionsTable, { props })
    expect(wrapper.text()).toContain('Active')
  })
}) 
```

- [ ] **Step 2: Run it — expect FAIL** (component does not exist).

- [ ] **Step 3: Create `app/components/sessions/SessionsTable.vue`:**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import UiDataList, {
  type UiDataListColumn,
  type UiDataListRow,
} from '@/components/ui/UiDataList.vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import UiFolio from '@/components/ui/UiFolio.vue'
import type { AdminSession } from '@/types/sessions.types'

const props = defineProps<{
  readonly sessions: readonly AdminSession[]
  readonly caption: string
  readonly userLabel: string
  readonly sessionIdLabel: string
  readonly clientLabel: string
  readonly ipLabel: string
  readonly statusLabel: string
  readonly activeLabel: string
}>()

const emit = defineEmits<{
  (event: 'select', sessionId: string): void
}>()

const columns = computed<readonly UiDataListColumn[]>(() => [
  { key: 'user', label: props.userLabel, align: 'left' },
  { key: 'session', label: props.sessionIdLabel, align: 'left' },
  { key: 'client', label: props.clientLabel, align: 'left' },
  { key: 'ip', label: props.ipLabel, align: 'left' },
  { key: 'status', label: props.statusLabel, align: 'right' },
])

const rows = computed<readonly UiDataListRow[]>(() =>
  props.sessions.map((session) => ({
    id: session.session_id,
    user: session.display_name ?? '—',
    session: session.session_id,
    client: session.client_id ?? '—',
    ip: session.ip_address ?? '—',
  })),
)
</script>

<template>
  <UiDataList :caption="caption" :columns="columns" :rows="rows">
    <template #cell(user)="{ row }">
      <button
        type="button"
        class="sessions-table__select"
        :data-testid="`session-select-${row.id}`"
        @click="emit('select', String(row.id))"
      >
        {{ row['user'] }}
      </button>
    </template>

    <template #cell(session)="{ row }">
      <UiFolio :value="String(row['session'])" variant="id" />
    </template>

    <template #cell(ip)="{ row }">
      <UiFolio :value="String(row['ip'])" variant="id" />
    </template>

    <template #cell(status)>
      <UiStatusBadge tone="success" :label="activeLabel" />
    </template>
  </UiDataList>
</template>

<style scoped>
.sessions-table__select {
  appearance: none;
  padding: 0;
  background: none;
  border: none;
  font: inherit;
  color: var(--accent);
  cursor: pointer;
  text-align: left;
}
.sessions-table__select:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
</style>
```

- [ ] **Step 4: Run it — expect PASS.**

- [ ] **Step 5: Commit:**

```bash
git add app/components/sessions/SessionsTable.vue app/components/sessions/__tests__/SessionsTable.spec.ts
git commit -m "$(cat <<'EOF'
feat(sso-admin-frontend): Swiss SessionsTable (active sessions, mono ids)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Task-scoped DoD:** `npm run typecheck && npm run lint && npm run format:check && npm run test -- app/components/sessions/__tests__/SessionsTable.spec.ts` — all green.

---

### Task 9.6: `/sessions` page — all six states, search, detail drawer (read surface)

**Files:**
- Modify: `app/pages/sessions.vue` (replace the placeholder body)
- Modify: `app/locales/en.json` + `app/locales/id.json` (extend the `sessions.*` block — see Step 3)
- Test: `app/pages/__tests__/sessions.page.nuxt.spec.ts`

**Interfaces:**
- Consumes: `useSessionsList` (9.4); `filterSessions` (9.2); `SessionsTable` (9.5); `useSessionStore` (`@/stores/session.store`); `useI18n` (`@/composables/useI18n`); `UiSkeleton`, `UiStatusView`, `UiEmptyState`, `UiInput`, `UiFormField`, `UiFolio`, `UiButton`, `UiStatusBadge`, `UiDetailDrawer` (`@/components/ui/*`); `AdminSession` (`@/types/sessions.types`).
- Produces (`app/pages/sessions.vue`): the read surface — a search `UiInput` (client-side `filterSessions`), the `SessionsTable`, and a read-only `UiDetailDrawer` (selected session → status badge, session id mono, client, user name, email, ip mono, user-agent, created/last-activity folios). Six states. Declares the canonical handler names Task 9.7 fills: `onSelectSession`, `onCloseDrawer`, `onRefresh`, plus the `onTerminateRequested(session: AdminSession)` stub. `successMessage` (single aria-live region, reused by 9.7).

> ponytail: no per-session GET (the list row carries every field); no pagination (the active-session list is small — search covers it; add paging only if a deployment shows huge lists). Timestamps render via `UiFolio variant="timestamp"`.

- [ ] **Step 1: Write the failing test** — `app/pages/__tests__/sessions.page.nuxt.spec.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import enLocale from '@/locales/en.json'
import type { SessionsViewState } from '@/lib/sessions/sessions-view-state'
import type { AdminSession } from '@/types/sessions.types'

const SESSION: AdminSession = {
  session_id: 'sess_alpha_handle',
  client_id: 'portal',
  subject_id: '01HZX9SUBJECTULID00000000AB',
  email: 'alice@example.test',
  display_name: 'Alice Admin',
  scope: 'openid profile',
  ip_address: '203.0.113.10',
  user_agent: 'Mozilla/5.0 (Macintosh)',
  created_at: '2026-06-01T00:00:00Z',
  last_activity_at: '2026-06-02T08:30:00Z',
  expires_at: '2026-07-01T00:00:00Z',
}

const sessionsRef = ref<readonly AdminSession[] | null>([SESSION])
const viewStateRef = ref<SessionsViewState>('ready')
const refreshMock = vi.fn<() => Promise<void>>(async () => {})
vi.mock('@/composables/useSessionsList', () => ({
  useSessionsList: () => ({
    sessions: sessionsRef,
    viewState: computed(() => viewStateRef.value),
    isStale: computed(() => false),
    requestId: computed(() => null),
    pending: ref(false),
    refresh: refreshMock,
  }),
}))

let permitted: string[] = []
vi.mock('@/stores/session.store', () => ({
  useSessionStore: () => ({
    principal: { display_name: 'Admin Sentinel', subject_id: '01HZX9ADMINULID00000000ZZ' },
    ensureSession: vi.fn<(force?: boolean) => Promise<string>>(async () => 'authenticated'),
    hasPermission: (p: string) => permitted.includes(p),
    get roles() {
      return [] as readonly string[]
    },
  }),
}))

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

mockNuxtImport('navigateTo', () => vi.fn<(...a: unknown[]) => Promise<void>>(async () => {}))

const SessionsPage = (await import('../sessions.vue')).default

beforeEach(() => {
  permitted = ['admin.sessions.terminate']
  sessionsRef.value = [SESSION]
  viewStateRef.value = 'ready'
  refreshMock.mockReset()
})
afterEach(() => {
  vi.clearAllMocks()
})

describe('sessions page — states', () => {
  it('renders the loading skeleton', async () => {
    viewStateRef.value = 'loading'
    const wrapper = await mountSuspended(SessionsPage)
    expect(wrapper.find('[data-page="sessions"]').exists()).toBe(true)
    expect(wrapper.find(`[aria-label="${enLocale.sessions.loading}"]`).exists()).toBe(true)
  })

  it('renders the forbidden surface', async () => {
    viewStateRef.value = 'forbidden'
    const wrapper = await mountSuspended(SessionsPage)
    expect(wrapper.text()).toContain(enLocale.sessions.forbidden_title)
  })

  it('renders the empty surface when there are no active sessions', async () => {
    viewStateRef.value = 'empty'
    sessionsRef.value = []
    const wrapper = await mountSuspended(SessionsPage)
    expect(wrapper.text()).toContain(enLocale.sessions.empty)
  })

  it('renders the sessions table in the ready state', async () => {
    const wrapper = await mountSuspended(SessionsPage)
    expect(wrapper.find('[data-testid="session-select-sess_alpha_handle"]').exists()).toBe(true)
  })
})

describe('sessions page — search + detail drawer', () => {
  it('filters the table by the search query', async () => {
    sessionsRef.value = [
      SESSION,
      { ...SESSION, session_id: 'sess_bravo_handle', display_name: 'Bob Operator', ip_address: '198.51.100.7' },
    ]
    const wrapper = await mountSuspended(SessionsPage)
    await wrapper.find('[data-testid="sessions-search"]').setValue('bob')
    await flushPromises()
    expect(wrapper.find('[data-testid="session-select-sess_bravo_handle"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="session-select-sess_alpha_handle"]').exists()).toBe(false)
  })

  it('opens the read-only detail drawer with session metadata on row select', async () => {
    const wrapper = await mountSuspended(SessionsPage)
    await wrapper.find('[data-testid="session-select-sess_alpha_handle"]').trigger('click')
    await flushPromises()
    const drawer = wrapper.find('[data-testid="session-detail"]')
    expect(drawer.exists()).toBe(true)
    expect(drawer.text()).toContain('alice@example.test') // email
    expect(drawer.text()).toContain('203.0.113.10') // ip mono
    expect(drawer.text()).toContain('Mozilla/5.0 (Macintosh)') // user agent
  })
})
```

- [ ] **Step 2: Run it — expect FAIL** (the placeholder page renders only `<h1>Sessions</h1>`).

- [ ] **Step 3: Extend the `sessions.*` locale block** (BOTH files, inside the existing `sessions` object — add only keys not already present; keep parity).

`en.json` → `sessions`:
```json
    "signed_in_as": "Signed in as {name}",
    "ov_email": "Email",
    "ov_user_agent": "User agent",
    "ov_created": "Created",
    "ov_last_activity": "Last activity",
    "terminate_success": "Session terminated.",
    "self_affect_warn": "This is one of your own sessions — terminating it will sign you out.",
    "step_up_cta": "Re-authenticate to continue"
```
`id.json` → `sessions`:
```json
    "signed_in_as": "Masuk sebagai {name}",
    "ov_email": "Email",
    "ov_user_agent": "Agen pengguna",
    "ov_created": "Dibuat",
    "ov_last_activity": "Aktivitas terakhir",
    "terminate_success": "Sesi dihentikan.",
    "self_affect_warn": "Ini salah satu sesi Anda sendiri — menghentikannya akan mengeluarkan Anda.",
    "step_up_cta": "Autentikasi ulang untuk melanjutkan"
```

- [ ] **Step 4: Replace `app/pages/sessions.vue`** (read surface; terminate wiring lands in 9.7):

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useSessionStore } from '@/stores/session.store'
import { useI18n } from '@/composables/useI18n'
import { useSessionsList } from '@/composables/useSessionsList'
import { filterSessions } from '@/lib/sessions/sessions-list'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiFormField from '@/components/ui/UiFormField.vue'
import UiFolio from '@/components/ui/UiFolio.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import UiDetailDrawer from '@/components/ui/UiDetailDrawer.vue'
import SessionsTable from '@/components/sessions/SessionsTable.vue'
import type { AdminSession } from '@/types/sessions.types'

definePageMeta({
  name: 'admin.sessions',
  layout: 'admin',
  requiresAdmin: true,
  permissions: ['admin.sessions.terminate'],
})

const { t } = useI18n()
const store = useSessionStore()

// SAFE HYDRATION: resolve the masked principal server-side. Tokens stay in Nitro
// event.context; the session DTOs carry no token/secret (only operational metadata:
// session_id handle, subject_id, email, ip, user-agent, timestamps).
await useAsyncData('admin-sessions-principal', () => store.ensureSession())

const { sessions, viewState, requestId, isStale, refresh } = useSessionsList()

const sessionList = computed<readonly AdminSession[]>(() => sessions.value ?? [])
const searchQuery = ref('')
const filtered = computed<readonly AdminSession[]>(() =>
  filterSessions(sessionList.value, searchQuery.value),
)

const canTerminate = computed<boolean>(() => store.hasPermission('admin.sessions.terminate'))

// Master-detail: selected session drives the read-only drawer.
const selectedSessionId = ref<string | null>(null)
const selectedSession = computed<AdminSession | null>(
  () => sessionList.value.find((s) => s.session_id === selectedSessionId.value) ?? null,
)

// Single page-level success region — reused by terminate (9.7).
const successMessage = ref<string | null>(null)

function onSelectSession(sessionId: string): void {
  selectedSessionId.value = sessionId
}
function onCloseDrawer(): void {
  selectedSessionId.value = null
}
async function onRefresh(): Promise<void> {
  await refresh()
}

// Handler body filled by Task 9.7 (declared once; never renamed):
function onTerminateRequested(_session: AdminSession): void {
  /* Task 9.7 */
}
</script>

<template>
  <section class="sessions" data-page="sessions" data-admin-shell>
    <header class="sessions__hero">
      <span class="sessions__eyebrow">{{ t('sessions.eyebrow') }}</span>
      <h1 class="sessions__title">{{ t('sessions.title') }}</h1>
      <p class="sessions__summary">{{ t('sessions.summary') }}</p>
      <p class="sessions__principal" data-principal-name>
        {{ t('sessions.signed_in_as', { name: store.principal?.display_name ?? '—' }) }}
      </p>
    </header>

    <p
      v-if="successMessage"
      class="sessions__success"
      role="status"
      aria-live="polite"
      data-testid="sessions-action-success"
    >
      {{ successMessage }}
    </p>

    <UiSkeleton v-if="viewState === 'loading'" :rows="6" :label="t('sessions.loading')" />

    <UiStatusView
      v-else-if="viewState === 'forbidden'"
      tone="forbidden"
      :eyebrow="t('sessions.eyebrow')"
      :title="t('sessions.forbidden_title')"
      :description="t('common.forbidden_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="viewState === 'unauthenticated'"
      tone="step_up"
      :eyebrow="t('sessions.eyebrow')"
      :title="t('common.session_expired_title')"
      :description="t('common.session_expired_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="viewState === 'error'"
      tone="error"
      :eyebrow="t('sessions.eyebrow')"
      :title="t('sessions.error_title')"
      :description="t('common.error_loading_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    >
      <template #actions>
        <UiButton variant="secondary" size="sm" data-testid="sessions-refresh" @click="onRefresh">
          {{ t('common.btn_refresh') }}
        </UiButton>
      </template>
    </UiStatusView>

    <UiEmptyState
      v-else-if="viewState === 'empty'"
      :title="t('sessions.empty')"
      :description="t('sessions.empty_desc')"
    />

    <template v-else>
      <div v-if="isStale" class="sessions__banner" role="status">
        {{ t('common.error_loading_desc') }}
      </div>

      <UiFormField id="sessions-search" :label="t('sessions.search_label')">
        <UiInput
          id="sessions-search"
          v-model="searchQuery"
          :placeholder="t('sessions.search_placeholder')"
          data-testid="sessions-search"
        />
      </UiFormField>

      <SessionsTable
        :sessions="filtered"
        :caption="t('sessions.list_aria')"
        :user-label="t('sessions.col_user')"
        :session-id-label="t('sessions.col_session_id')"
        :client-label="t('sessions.col_client')"
        :ip-label="t('sessions.col_ip')"
        :status-label="t('common.status')"
        :active-label="t('sessions.status_active')"
        @select="onSelectSession"
      />

      <UiDetailDrawer
        v-if="selectedSession"
        :open="selectedSession !== null"
        title-id="session-detail-drawer"
        :title="selectedSession.display_name ?? t('sessions.title')"
        :description="t('sessions.detail_tabs_label')"
        :close-label="t('common.close')"
        wide
        @close="onCloseDrawer"
      >
        <div class="session-detail" data-testid="session-detail">
          <div class="session-detail__head">
            <UiStatusBadge tone="success" :label="t('sessions.status_active')" />
          </div>
          <dl class="session-detail__grid">
            <div>
              <dt>{{ t('sessions.ov_session_id') }}</dt>
              <dd><UiFolio :value="selectedSession.session_id" variant="id" /></dd>
            </div>
            <div>
              <dt>{{ t('sessions.ov_client_id') }}</dt>
              <dd>{{ selectedSession.client_id ?? '—' }}</dd>
            </div>
            <div>
              <dt>{{ t('sessions.ov_user_name') }}</dt>
              <dd>{{ selectedSession.display_name ?? '—' }}</dd>
            </div>
            <div>
              <dt>{{ t('sessions.ov_email') }}</dt>
              <dd>{{ selectedSession.email ?? '—' }}</dd>
            </div>
            <div>
              <dt>{{ t('sessions.ov_ip_address') }}</dt>
              <dd><UiFolio :value="String(selectedSession.ip_address ?? '—')" variant="id" /></dd>
            </div>
            <div>
              <dt>{{ t('sessions.ov_user_agent') }}</dt>
              <dd>{{ selectedSession.user_agent ?? '—' }}</dd>
            </div>
            <div>
              <dt>{{ t('sessions.ov_created') }}</dt>
              <dd><UiFolio :value="String(selectedSession.created_at ?? '—')" variant="timestamp" /></dd>
            </div>
            <div>
              <dt>{{ t('sessions.ov_last_activity') }}</dt>
              <dd>
                <UiFolio :value="String(selectedSession.last_activity_at ?? '—')" variant="timestamp" />
              </dd>
            </div>
          </dl>
        </div>
      </UiDetailDrawer>
    </template>
  </section>
</template>

<style scoped>
.sessions {
  display: grid;
  gap: 24px;
  padding: 24px;
}
.sessions__hero {
  display: grid;
  gap: 6px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border);
}
.sessions__eyebrow {
  font: 600 0.6875rem/1 var(--font-sans);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.sessions__title {
  margin: 0;
  font: 600 1.5rem/1.2 var(--font-sans);
  letter-spacing: -0.02em;
  color: var(--fg);
}
.sessions__summary,
.sessions__principal {
  margin: 0;
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--fg-2);
}
.sessions__success {
  margin: 0;
  padding: 10px 14px;
  font: 500 0.8125rem/1.4 var(--font-sans);
  color: var(--fg);
  background: var(--card);
  border: 1px solid var(--border);
}
.sessions__banner {
  padding: 10px 14px;
  font: 500 0.8125rem/1.4 var(--font-sans);
  color: var(--warning-soft-fg);
  background: var(--warning-soft);
  border: 1px solid var(--warning-soft-fg);
}
.session-detail {
  display: grid;
  gap: 16px;
}
.session-detail__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 16px;
  margin: 0;
}
.session-detail__grid dt {
  font: 600 0.625rem/1.2 var(--font-sans);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.session-detail__grid dd {
  margin: 2px 0 0;
  font: 400 0.8125rem/1.4 var(--font-sans);
  color: var(--fg);
}
</style>
```

- [ ] **Step 5: Run it — expect PASS** (`npm run test -- app/pages/__tests__/sessions.page.nuxt.spec.ts`). Expected: GREEN — states (4) + search filter + drawer (2).

- [ ] **Step 6: Commit:**

```bash
git add app/pages/sessions.vue app/pages/__tests__/sessions.page.nuxt.spec.ts app/locales/en.json app/locales/id.json
git commit -m "$(cat <<'EOF'
feat(sso-admin-frontend): compose Swiss sessions page (states, search, read drawer)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Task-scoped DoD:** `npm run typecheck && npm run lint && npm run format:check && npm run test -- app/pages/__tests__/sessions.page.nuxt.spec.ts` — all green (both lint passes). The SSR-leak gate over `/sessions` lands in Task 9.8.

---

### Task 9.7: Terminate-session privileged action (danger · step-up · self-lockout)

**Files:**
- Modify: `app/pages/sessions.vue` (fill `onTerminateRequested`; add the terminate `usePrivilegedAction` + danger dialog + the drawer Revoke button + `reverifySelf`)
- Test: `app/pages/__tests__/sessions-terminate.page.nuxt.spec.ts`

**Interfaces:**
- Consumes: `usePrivilegedAction` (`@/composables/usePrivilegedAction`), `PrivilegedActionDialog` (`@/components/users/PrivilegedActionDialog.vue`), `sessionsApi.revoke` (`@/services/sessions.api`), `isOwnSession` (`@/lib/sessions/sessions-list`), `resolveBootstrapFailure` (`@/lib/auth/admin-guard-resolver`), `SessionRevokeResponse` (`@/types/sessions.types`).
- Produces (`app/pages/sessions.vue`): a Revoke affordance **inside the detail drawer**, shown only when `canTerminate` (`admin.sessions.terminate`); a `usePrivilegedAction<SessionRevokeResponse>()` instance + reused `PrivilegedActionDialog` with **`danger`** (the single `--danger #E4002B` affordance in this domain); the confirm copy is `sessions.terminate_hint` plus a distinct `sessions.self_affect_warn` line when the target is one of the acting admin's own sessions (`isOwnSession(target, store.principal?.subject_id)`); on confirm runs `sessionsApi.revoke(target.session_id)` through the matrix; success → close dialog + close drawer + `refresh()` + `successMessage` (`sessions.terminate_success`), then **re-verify the principal** when the terminated session was the admin's own (`reverifySelf`: `ensureSession(true)` → `resolveBootstrapFailure` → re-route if it dropped); 428 → step-up link; only REF; cancel calls no API; a failed terminate leaves no stale loading.

> ponytail: one privileged action reusing the matrix wholesale — no domain error mapping needed (terminate's failures are 403/428/429/5xx, all safe-generic; there is no 404 and the 422 is vanishingly rare). The only domain-specific logic is the self-lockout guard, which mirrors the roles/policy `reverifySelf`.

- [ ] **Step 1: Write the failing test** — `app/pages/__tests__/sessions-terminate.page.nuxt.spec.ts` (same harness as the page spec; make `usePrivilegedAction` + `PrivilegedActionDialog` **real**, spy only `sessionsApi.revoke`; include a non-self session AND a self session whose `subject_id` matches the mocked principal):

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import enLocale from '@/locales/en.json'
import { ApiError } from '@/lib/api/api-client'
import type { SessionRevokeResponse, AdminSession } from '@/types/sessions.types'

const revokeMock = vi.fn<(id: string) => Promise<SessionRevokeResponse>>()
vi.mock('@/services/sessions.api', () => ({
  sessionsApi: { list: vi.fn<() => Promise<unknown>>(), revoke: revokeMock },
}))

const ADMIN_SUBJECT = '01HZX9ADMINULID00000000ZZ'
const OTHER: AdminSession = {
  session_id: 'sess_other', client_id: 'portal', subject_id: 'subj_other',
  email: 'bob@example.test', display_name: 'Bob Operator', ip_address: '198.51.100.7',
}
const MINE: AdminSession = {
  session_id: 'sess_mine', client_id: 'console', subject_id: ADMIN_SUBJECT,
  email: 'admin@example.test', display_name: 'Admin Sentinel', ip_address: '203.0.113.9',
}
const sessionsRef = ref<readonly AdminSession[] | null>([OTHER, MINE])
const refreshMock = vi.fn<() => Promise<void>>(async () => {})
vi.mock('@/composables/useSessionsList', () => ({
  useSessionsList: () => ({
    sessions: sessionsRef, viewState: computed(() => 'ready' as const),
    isStale: computed(() => false), requestId: computed(() => null),
    pending: ref(false), refresh: refreshMock,
  }),
}))

let permitted: string[] = []
const ensureSessionMock = vi.fn<(force?: boolean) => Promise<string>>(async () => 'authenticated')
vi.mock('@/stores/session.store', () => ({
  useSessionStore: () => ({
    principal: { display_name: 'Admin Sentinel', subject_id: ADMIN_SUBJECT },
    ensureSession: ensureSessionMock,
    hasPermission: (p: string) => permitted.includes(p),
    get roles() { return [] as readonly string[] },
  }),
}))
vi.mock('@/composables/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      let val: unknown = enLocale
      for (const part of key.split('.')) val = (val as Record<string, unknown>)?.[part]
      if (typeof val !== 'string') return key
      return params ? val.replace(/\{(\w+)\}/gu, (_: string, k: string) => String(params[k] ?? '')) : val
    },
  }),
}))

const navigateMock = vi.hoisted(() => vi.fn<(...a: unknown[]) => Promise<void>>(async () => {}))
mockNuxtImport('navigateTo', () => navigateMock)
mockNuxtImport('useRoute', () => () => ({ fullPath: '/sessions' }))
mockNuxtImport('useRequestURL', () => () => new URL('https://admin-sso.example/sessions'))
mockNuxtImport('useRuntimeConfig', () => () => ({ public: { basePath: '/' } }))

const SessionsPage = (await import('../sessions.vue')).default

async function openDrawerAndTerminate(wrapper: Awaited<ReturnType<typeof mountSuspended>>, id: string) {
  await wrapper.find(`[data-testid="session-select-${id}"]`).trigger('click')
  await flushPromises()
  await wrapper.find('[data-testid="session-terminate"]').trigger('click')
  await flushPromises()
}

beforeEach(() => {
  permitted = ['admin.sessions.terminate']
  sessionsRef.value = [OTHER, MINE]
  revokeMock.mockReset()
  refreshMock.mockReset()
  ensureSessionMock.mockReset()
  ensureSessionMock.mockResolvedValue('authenticated')
})
afterEach(() => { vi.clearAllMocks() })

describe('sessions terminate — gate + lifecycle', () => {
  it('hides Revoke without the terminate capability', async () => {
    permitted = []
    const wrapper = await mountSuspended(SessionsPage)
    await wrapper.find('[data-testid="session-select-sess_other"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="session-terminate"]').exists()).toBe(false)
  })

  it('confirm revokes the session, refreshes, and reports success; cancel calls no API', async () => {
    revokeMock.mockResolvedValue({ revoked: true, session_id: 'sess_other' })
    const wrapper = await mountSuspended(SessionsPage)
    await wrapper.find('[data-testid="session-select-sess_other"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="session-terminate"]').trigger('click')
    await flushPromises()
    expect(revokeMock).not.toHaveBeenCalled() // dialog open, not yet confirmed
    await wrapper.find('[data-testid="privileged-action-cancel"]').trigger('click')
    await flushPromises()
    expect(revokeMock).not.toHaveBeenCalled()
    // re-open + confirm
    await openDrawerAndTerminate(wrapper, 'sess_other')
    await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
    await flushPromises()
    expect(revokeMock).toHaveBeenCalledWith('sess_other')
    expect(refreshMock).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="sessions-action-success"]').text()).toBe(
      enLocale.sessions.terminate_success,
    )
  })
})

describe('sessions terminate — self-lockout guard', () => {
  it('warns when revoking one of the acting admin own sessions', async () => {
    const wrapper = await mountSuspended(SessionsPage)
    await openDrawerAndTerminate(wrapper, 'sess_mine')
    expect(wrapper.find('[data-testid="privileged-action-impact"]').text()).toContain(
      enLocale.sessions.self_affect_warn,
    )
  })

  it('non-self terminate shows no self-warning and never re-verifies', async () => {
    revokeMock.mockResolvedValue({ revoked: true, session_id: 'sess_other' })
    const wrapper = await mountSuspended(SessionsPage)
    await openDrawerAndTerminate(wrapper, 'sess_other')
    expect(wrapper.find('[data-testid="privileged-action-impact"]').text()).not.toContain(
      enLocale.sessions.self_affect_warn,
    )
    await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
    await flushPromises()
    expect(ensureSessionMock).not.toHaveBeenCalledWith(true)
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('self terminate that drops the session re-routes via the bootstrap resolver', async () => {
    revokeMock.mockResolvedValue({ revoked: true, session_id: 'sess_mine' })
    ensureSessionMock.mockResolvedValue('unauthenticated')
    const wrapper = await mountSuspended(SessionsPage)
    await openDrawerAndTerminate(wrapper, 'sess_mine')
    await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
    await flushPromises()
    expect(revokeMock).toHaveBeenCalledWith('sess_mine')
    expect(ensureSessionMock).toHaveBeenCalledWith(true)
    expect(navigateMock).toHaveBeenCalled()
  })

  it('self terminate of a different device stays put while still authenticated', async () => {
    revokeMock.mockResolvedValue({ revoked: true, session_id: 'sess_mine' })
    ensureSessionMock.mockResolvedValue('authenticated')
    const wrapper = await mountSuspended(SessionsPage)
    await openDrawerAndTerminate(wrapper, 'sess_mine')
    await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
    await flushPromises()
    expect(ensureSessionMock).toHaveBeenCalledWith(true)
    expect(navigateMock).not.toHaveBeenCalled()
  })
})

describe('sessions terminate — failure matrix (real runner)', () => {
  it.each([403, 419, 429, 500])(
    'surfaces safe copy + a redacted REF for %i without refreshing',
    async (status) => {
      revokeMock.mockRejectedValue(new ApiError(status, 'boom', undefined, {}, `req-${status}`))
      const wrapper = await mountSuspended(SessionsPage)
      await openDrawerAndTerminate(wrapper, 'sess_other')
      await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
      await flushPromises()
      expect(wrapper.find('[data-testid="privileged-action-error"]').text()).toContain(
        enLocale.common.error_generic,
      )
      expect(wrapper.find('[data-testid="privileged-action-ref"]').text()).toMatch(/^REF-/u)
      expect(wrapper.html()).not.toContain(`req-${status}`)
      expect(refreshMock).not.toHaveBeenCalled()
    },
  )

  it('surfaces the step-up link on 428 and does not refresh', async () => {
    revokeMock.mockRejectedValue(
      new ApiError(428, 'reauth', 'reauth_required', { step_up_url: 'https://idp.example/step-up' }, 'req-428'),
    )
    const wrapper = await mountSuspended(SessionsPage)
    await openDrawerAndTerminate(wrapper, 'sess_other')
    await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="privileged-action-stepup"]').find('a').attributes('href')).toBe(
      'https://idp.example/step-up',
    )
    expect(wrapper.find('[data-testid="privileged-action-error"]').exists()).toBe(false)
    expect(refreshMock).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run it — expect FAIL** (no Revoke affordance / terminate wiring yet).

- [ ] **Step 3: Wire terminate into `app/pages/sessions.vue`.** Add to `<script setup>` (imports + state + replace the `onTerminateRequested` stub):

```ts
import { usePrivilegedAction } from '@/composables/usePrivilegedAction'
import PrivilegedActionDialog from '@/components/users/PrivilegedActionDialog.vue'
import { isOwnSession } from '@/lib/sessions/sessions-list'
import { resolveBootstrapFailure } from '@/lib/auth/admin-guard-resolver'
import { sessionsApi } from '@/services/sessions.api'
import type { SessionRevokeResponse } from '@/types/sessions.types'

const terminateAction = usePrivilegedAction<SessionRevokeResponse>()
const terminateTarget = ref<AdminSession | null>(null)

const terminateIsSelf = computed<boolean>(
  () => terminateTarget.value != null && isOwnSession(terminateTarget.value, store.principal?.subject_id),
)

const terminateDescription = computed<string>(() => {
  if (!terminateTarget.value) return ''
  const base = t('sessions.terminate_hint')
  return terminateIsSelf.value ? `${base} ${t('sessions.self_affect_warn')}` : base
})

// Step-up drives its own link; every other failure is safe-generic (terminate has no
// domain-specific error and no 404).
const terminateError = computed<string | null>(() =>
  terminateAction.failure.value && terminateAction.failure.value.status !== 'step_up_required'
    ? t('common.error_generic')
    : null,
)

// Shared self-lockout re-verify: after revoking one of the admin's own sessions,
// re-confirm the principal; if it dropped (we revoked the current device), route out
// via the bootstrap-failure resolver (mirror roles/policy reverifySelf).
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

// REPLACE the 9.6 stub body (do NOT rename).
function onTerminateRequested(session: AdminSession): void {
  terminateAction.reset()
  successMessage.value = null
  terminateTarget.value = session
}
function onTerminateCancel(): void {
  terminateTarget.value = null
}
async function onTerminateConfirm(): Promise<void> {
  const target = terminateTarget.value
  if (!target) return
  const selfAffecting = terminateIsSelf.value
  const result = await terminateAction.run(() => sessionsApi.revoke(target.session_id))
  if (result === null) return // failure stays in the open dialog (error/step-up/REF)
  terminateTarget.value = null
  selectedSessionId.value = null
  successMessage.value = t('sessions.terminate_success')
  await refresh()
  if (selfAffecting) await reverifySelf() // revoking your own session can sign you out
}
```

Add the Revoke button inside the drawer's `session-detail` (after the `<dl>`), and the danger dialog at page level (after the `UiDetailDrawer`, before `</template>`'s `</section>` — outside the `v-else` so it persists through the action):

```vue
          <div v-if="canTerminate" class="session-detail__actions">
            <UiButton
              variant="danger"
              size="sm"
              data-testid="session-terminate"
              @click="onTerminateRequested(selectedSession)"
            >
              {{ t('sessions.btn_revoke') }}
            </UiButton>
          </div>
```

```vue
    <PrivilegedActionDialog
      v-if="terminateTarget !== null"
      :open="terminateTarget !== null"
      :title="t('sessions.confirm_revoke_title')"
      :description="terminateDescription"
      :confirm-label="t('sessions.btn_revoke')"
      :cancel-label="t('common.btn_cancel')"
      danger
      :submitting="terminateAction.isSubmitting.value"
      :error-message="terminateError"
      :request-id="terminateAction.requestId.value"
      :step-up-url="terminateAction.stepUpUrl.value"
      :step-up-label="t('sessions.step_up_cta')"
      @confirm="onTerminateConfirm"
      @cancel="onTerminateCancel"
    />
```

Add `.session-detail__actions { padding-top: 8px; border-top: 1px solid var(--border); }` to `<style>`.

> Note: place the page-level `PrivilegedActionDialog` OUTSIDE the `<template v-else>` (alongside the success region, at the `<section>` root level) so it survives the success path closing the drawer — the dialog's own `onTerminateConfirm` closes it. Confirm the dialog renders its description inside `[data-testid="privileged-action-impact"]` (per `PrivilegedActionDialog.vue`); align the test selector if it differs.

- [ ] **Step 4: Run it — expect PASS** (gate 1 + lifecycle 1 + self-lockout 4 + failure-matrix 4×it.each + 428 = 11 tests). Re-run `sessions.page.nuxt.spec.ts` for no-regression.

- [ ] **Step 5: Commit:**

```bash
git add app/pages/sessions.vue app/pages/__tests__/sessions-terminate.page.nuxt.spec.ts
git commit -m "$(cat <<'EOF'
feat(sso-admin-frontend): terminate-session danger action with self-lockout guard

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Task-scoped DoD:** `npm run typecheck && npm run lint && npm run format:check && npm run test -- app/pages/__tests__/sessions-terminate.page.nuxt.spec.ts app/pages/__tests__/sessions.page.nuxt.spec.ts` — all green.

---

### Task 9.8: Extend the SSR token-leak gate + Sessions e2e + full Phase-9 DoD

**Files:**
- Modify: `test/ssr-token-leak.gate.spec.ts` (add `fetchSessions` + three sessions `it` blocks)
- Create: `test/fixtures/ssr-leak/server/routes/api/admin/sessions/index.get.ts` (the session list fixture)
- Verify (add cap if missing): `test/fixtures/ssr-leak/server/routes/api/admin/me.get.ts` — the sentinel principal must grant `admin.sessions.terminate` (so `/sessions` renders READY, not `/forbidden`, and the Revoke affordance hydrates)
- Create: `e2e/sessions.spec.ts` (Playwright — the terminate high-risk path)

**Interfaces:**
- Consumes: the gate helpers `extractPayload`, `collectSecretLeaks`, `collectPiiShapeLeaks` (with the `{ allowSessionId: true }` option), the `$fetch`/`setup` harness; `sessions.vue` (9.6/9.7) as the rendered `/sessions` route.
- Produces: `fetchSessions = () => $fetch('/sessions', { headers: { cookie: 'admin_locale=en' } })`; a "renders ready (masked)" assertion (`data-admin-shell` + a fixture user/IP); `collectSecretLeaks(html, { allowSessionId: true })` / `collectSecretLeaks(payload, { allowSessionId: true })` / `collectPiiShapeLeaks(payload)` all `toEqual([])` — **`allowSessionId: true`** (the `session_id` operational handle is rendered/hydrated by design), mirroring the users-page blocks.

This is the **final integration + proof task** of Phase 9. It writes no product code — it proves, against a real SSR render and a real browser, that the sessions surface (Tasks 9.1–9.7) leaks nothing (only the operational `session_id` is exempted) and that the terminate flow works end to end. It mirrors the roles/policy gate extensions exactly.

- [ ] **Step 1: RED — extend the leak gate.** Add `fetchSessions` next to the other fetchers, and the three `it` blocks after the policy group:

```ts
function fetchSessions(): Promise<string> {
  // admin_locale=en so the status badge renders the English label under the gate.
  return $fetch('/sessions', { headers: { cookie: 'admin_locale=en' } })
}
```
```ts
  it('renders the active sessions server-side in their ready (masked) state', async () => {
    const html = await fetchSessions()
    expect(html).toContain('data-admin-shell')
    // a user display name + an IP from the fixture render, proving the table mounted.
    expect(html).toContain('Sentinel Operator')
    expect(html).toContain('203.0.113.45')
  })

  it('does not leak token/secret/PII values into the sessions-page SSR HTML', async () => {
    // allowSessionId: the session DTO carries the operational session_id HANDLE (the
    // terminate key, not a credential) — exempt it, but every other check stays strict.
    const html = await fetchSessions()
    expect(collectSecretLeaks(html, 'sessions SSR HTML', { allowSessionId: true })).toEqual([])
  })

  it('does not leak token/secret/PII values into the sessions-page hydration payload', async () => {
    const html = await fetchSessions()
    const serialized = JSON.stringify(JSON.parse(extractPayload(html)))
    expect(collectSecretLeaks(serialized, 'sessions __NUXT__ payload', { allowSessionId: true })).toEqual([])
    expect(collectPiiShapeLeaks(serialized, 'sessions __NUXT__ payload')).toEqual([])
  })
```

- [ ] **Step 2: Run it — expect FAIL** (`npm run test -- test/ssr-token-leak.gate.spec.ts`): the "ready (masked)" block fails — no `sessions` fixture route, so the SSR fetch errors and the page renders error/empty, not the fixture user.

- [ ] **Step 3: GREEN — add the fixture route + verify the cap.** Create `test/fixtures/ssr-leak/server/routes/api/admin/sessions/index.get.ts`:

```ts
// SSR token-leak fixture: a representative masked active-session list so the §3.3 gate
// renders the Sessions page READY. Operational metadata only — opaque session_id
// HANDLE + ULID subject id + email + IP + clean user-agent + timestamps. No token,
// secret, session cookie value, or PII-shaped digit run (IPs are dotted, no 10/16/18-
// digit run; the session_id handle is exempted via allowSessionId).
import { defineEventHandler } from 'h3'

export default defineEventHandler(() => ({
  sessions: [
    {
      session_id: 'sess_sentinel_handle_01',
      client_id: 'portal',
      subject_id: '01HZX9C7K3Q8VMETBD9R2F4K7N',
      email: 'sentinel.operator@dev-sso.local',
      display_name: 'Sentinel Operator',
      scope: 'openid profile',
      ip_address: '203.0.113.45',
      user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)',
      created_at: '2026-06-20T10:00:00Z',
      last_activity_at: '2026-06-28T09:15:00Z',
      expires_at: '2026-07-20T10:00:00Z',
    },
    {
      session_id: 'sess_console_handle_02',
      client_id: 'console',
      subject_id: '01HZX9C7K3Q8VMETBD9R2F4K8P',
      email: 'analyst@dev-sso.local',
      display_name: 'Analyst Two',
      scope: 'openid',
      ip_address: '198.51.100.7',
      user_agent: 'Mozilla/5.0 (Windows NT 10.0)',
      created_at: '2026-06-21T11:00:00Z',
      last_activity_at: '2026-06-28T08:00:00Z',
      expires_at: '2026-07-21T11:00:00Z',
    },
  ],
}))
```

Then confirm the sentinel principal grants the terminate capability:
```bash
grep -E "admin.sessions.terminate" test/fixtures/ssr-leak/server/routes/api/admin/me.get.ts
```
Expected: present under `capabilities` (and `permissions.permissions[]`). If missing, add it to BOTH (additive — does not affect other domains' gate blocks).

- [ ] **Step 4: Run it — expect PASS** (`npm run test -- test/ssr-token-leak.gate.spec.ts`). Expected: all sessions blocks green; the pre-existing dashboard/users/clients/observability/roles/policy blocks + the negative-control tripwire stay green.

- [ ] **Step 5: Commit the gate extension:**

```bash
git add test/ssr-token-leak.gate.spec.ts test/fixtures/ssr-leak/server/routes/api/admin/sessions/index.get.ts test/fixtures/ssr-leak/server/routes/api/admin/me.get.ts
git commit -m "$(cat <<'EOF'
test(sso-admin-frontend): extend SSR leak gate to the active sessions list

Render /sessions under full SSR with the sentinel admin and assert the session
list hydrates as operational metadata only — no token value/name, secret, or
PII-shaped digit run reaches the SSR HTML or __NUXT_DATA__. allowSessionId: the
session_id is the operational termination handle (not a credential), exempted as
on the users pages; every other check stays strict.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 6: Author the e2e** — `e2e/sessions.spec.ts` (mirror `e2e/policy.spec.ts`: `admin_locale=en` cookie; mock `/api/admin/me` + `/api/admin/sessions` + the DELETE; drive the terminate). **Do NOT run `npm run test:e2e`** — Playwright is still wired to the legacy SPA (`playwright.config.ts`), so e2e is systemically deferred to Phase 18 (every prior phase deferred it identically). Author + commit; it parses under tsc/eslint in the DoD.

```ts
import { expect, test, type Page } from '@playwright/test'

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: 'admin_locale', value: 'en', url: baseURL! }])
})

const principal = {
  principal: {
    subject_id: 'sub_admin', email: 'admin@dev-sso.local', display_name: 'Admin User', role: 'admin',
    last_login_at: null,
    auth_context: { auth_time: null, amr: ['pwd', 'mfa'], acr: 'urn:example:loa:2', mfa_enforced: true, mfa_verified: true },
    permissions: {
      view_admin_panel: true, manage_sessions: true,
      permissions: ['admin.dashboard.view', 'admin.sessions.terminate'],
      capabilities: { 'admin.dashboard.view': true, 'admin.sessions.terminate': true },
      menus: [
        { id: 'dashboard', label: 'Dashboard', required_permission: 'admin.dashboard.view', visible: true },
        { id: 'sessions', label: 'Sessions', required_permission: 'admin.sessions.terminate', visible: true },
      ],
    },
  },
}
const readOnly = {
  principal: {
    ...principal.principal,
    permissions: {
      view_admin_panel: true, manage_sessions: false,
      permissions: ['admin.dashboard.view'], capabilities: { 'admin.dashboard.view': true },
      menus: [{ id: 'dashboard', label: 'Dashboard', required_permission: 'admin.dashboard.view', visible: true }],
    },
  },
}
const other = { session_id: 'sess_other', client_id: 'portal', subject_id: 'subj_other', email: 'bob@dev-sso.local', display_name: 'Bob Operator', ip_address: '198.51.100.7', user_agent: 'Mozilla/5.0', created_at: '2026-06-20T10:00:00Z', last_activity_at: '2026-06-28T09:00:00Z', expires_at: '2026-07-20T10:00:00Z' }

async function mockMe(page: Page, body: object) {
  await page.route('**/api/admin/me', async (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(body) }))
}
async function mockSessions(page: Page) {
  await page.route('**/api/admin/sessions', async (r) => {
    if (r.request().method() !== 'GET') return r.continue()
    await r.fulfill({ contentType: 'application/json', headers: { 'x-request-id': 'req-sessions-e2e' }, body: JSON.stringify({ sessions: [other] }) })
  })
}

test('terminate: drawer confirm revokes a session and refreshes', async ({ page }) => {
  await mockMe(page, principal)
  await mockSessions(page)
  let revoked = false
  await page.route('**/api/admin/sessions/sess_other', async (r) => {
    if (r.request().method() !== 'DELETE') return r.continue()
    revoked = true
    await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ revoked: true, session_id: 'sess_other', revoked_tokens: 2, backchannel_fanout: 1 }) })
  })
  await page.goto('/sessions')
  await page.getByTestId('session-select-sess_other').click()
  await page.getByTestId('session-terminate').click()
  await page.getByTestId('privileged-action-confirm').click()
  await expect.poll(() => revoked).toBe(true)
  await expect(page.getByText(/Bearer|access_token|client_secret|SQLSTATE/u)).toHaveCount(0)
})

test('cancel calls no API: dismissing the terminate confirm fires no DELETE', async ({ page }) => {
  await mockMe(page, principal)
  await mockSessions(page)
  let called = false
  await page.route('**/api/admin/sessions/sess_other', async (r) => { if (r.request().method() === 'DELETE') called = true; await r.continue() })
  await page.goto('/sessions')
  await page.getByTestId('session-select-sess_other').click()
  await page.getByTestId('session-terminate').click()
  await page.getByTestId('privileged-action-cancel').click()
  await expect(page.getByTestId('privileged-action-confirm')).toHaveCount(0)
  expect(called).toBe(false)
})

test('forbidden: an admin without sessions.terminate lands on the safe forbidden surface', async ({ page }) => {
  await mockMe(page, readOnly)
  await page.goto('/sessions')
  await expect(page).toHaveURL(/\/forbidden$/u)
  await expect(page.getByText(/Bearer|access_token|client_secret|SQLSTATE/u)).toHaveCount(0)
})
```

- [ ] **Step 7: Commit the e2e:**

```bash
git add e2e/sessions.spec.ts
git commit -m "$(cat <<'EOF'
test(sso-admin-frontend): e2e the session terminate high-risk path

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 8: Run the full Phase-9 DoD gate** from `services/sso-admin-frontend` (report any blocked command explicitly):

```bash
npm run typecheck && npm run lint && npm run format:check && npm run test && npm run build
```
e2e (`npm run test:e2e`) is **deferred to Phase 18** (legacy-SPA `playwright.config.ts`) — do not run it; report it as deferred.

---

## Phase 9 Definition of Done

- [ ] DTO types + pure view-state (9.1) + pure helpers search/own-session (9.2) + `sessions.api` service (9.3) + `useSessionsList` SSR composable (9.4) + `SessionsTable` (9.5) + the `/sessions` page all-six-states read surface (9.6) + terminate privileged action (9.7) + SSR-leak-gate/e2e (9.8) all implemented test-first, each committed green.
- [ ] **Full gate green** from `services/sso-admin-frontend`: `npm run typecheck` (0), `npm run lint` (0 — BOTH `lint:oxlint` and `lint:eslint`), `npm run format:check`, `npm run test` (full suite, including the new gate blocks + all sessions specs), `npm run build` — all PASS.
- [ ] **SSR token-leak gate extended** (9.8) over the active-session list with **`allowSessionId: true`** (the `session_id` operational handle is rendered by design; every other check strict — no token value/name, secret, raw NIK(16)/NIP(18)/NISN(10) digit run, raw backend exception, or `SSR_LEAK_CANARY` in the `/sessions` SSR HTML or `__NUXT_DATA__`); collectors assert `.toEqual([])`; the pre-existing tripwire stays green.
- [ ] **Privileged-action matrix** applied to terminate (`:step_up`): every status (403/419/429/5xx + step-up) surfaces safe, status-keyed copy; only `REF-…` (never a raw request id or backend exception); cancel calls no API; a failed terminate leaves no stale loading; no `refresh()` on failure.
- [ ] **Self-lockout guard:** terminating a session whose `subject_id` matches the acting principal warns (`self_affect_warn`) and, on success, re-verifies the principal (`ensureSession(true)` → `resolveBootstrapFailure` → re-route if dropped); a non-self terminate never re-verifies; a self-terminate of a different device stays put.
- [ ] **Domain UI rules:** the terminate affordance gates on `admin.sessions.terminate`; the list/drawer render operational metadata only; there is no per-session GET (the list DTO is complete) and no 404 handling (DELETE never 404s).
- [ ] **Swiss discipline:** single accent; **`--danger #E4002B` only on the terminate affordance**; status is tone + label via `UiStatusBadge` (never colour-alone); `--font-mono` for `session_id`/`subject_id`/`ip_address`; folio timestamps; hairline borders, no shadows.
- [ ] **Type discipline:** new types in `app/types/sessions.types.ts` with the REAL backend field names (`email`/`display_name`, `scope`/`expires_at`), never duplicated.
- [ ] **Page route + permission gating:** `/sessions` gated `admin.sessions.terminate` via `definePageMeta`; the terminate affordance via `useSessionStore().hasPermission`; all six states render server-side.
- [ ] **Locale parity:** `app/locales/en.json` + `id.json` stay in sync; all added `sessions.*` keys present in both; no traceability markers anywhere.
- [ ] **E2E authored** for the terminate high-risk path + cancel + the forbidden flow (`e2e/sessions.spec.ts`); run **deferred to Phase 18** (legacy-SPA `playwright.config.ts`, systemic) — recorded, not silently skipped.
- [ ] **Branch discipline:** the feature branch stays off `main` until the Phase 18 cutover.

---
