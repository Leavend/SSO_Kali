# Phase 13 — Authentication Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the admin **Authentication Audit** page (`/authentication-audit`) to Nuxt 4 SSR + the Swiss design system — a read-only, cursor-paginated, filterable log of user authentication events (login/logout/consent/MFA/auth-errors), with a per-event detail drawer, and no token/secret/raw-gov-PII reaching SSR HTML or `__NUXT_DATA__`.

**Architecture:** Read-only list domain. The page calls `useAuthAuditEvents()` → `authAuditApi.listEvents(filters)` → `apiClient.get('/api/admin/audit/authentication-events?…')`. The BFF proxy already allow-lists that path (no proxy change). The **first page renders server-side** via `useAsyncData` (SSR-hydrated, leak-gated); **filter changes refetch** via `{ watch: [filters] }`; **"load more" appends** later cursor pages client-side. The backend `AdminAuthenticationAuditPresenter` returns an **already-masked** event (sensitive `context` keys → `[redacted]` server-side); the **list rows are complete** (the presenter returns an identical shape for list and show), so the detail drawer renders from the selected row — **no `show` fetch, no detail composable**. There are **no mutations, no privileged actions, no danger affordances** on this page.

**Tech Stack:** Nuxt 4.4.8 (SSR), Vue 3.5 SFC, TypeScript strict, Vitest 4 + `@nuxt/test-utils` 4, the shipped Swiss DS (`UiDataList`, `UiStatusBadge`, `UiSelect`, `UiInput`, `UiButton`, `UiDetailDrawer`, `UiFolio`, `UiSkeleton`, `UiStatusView`, `UiEmptyState`), `useAsyncData`, `apiClient`/`ApiError`.

## Global Constraints

- **Branch stays OFF `main`** until Phase 18 cutover. Commit only the listed task commits.
- **Commit trailer (verbatim):** `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **No traceability markers** (`OG#`/`UC###`/`FR###`/`BE-FR###` etc.) anywhere — names, comments, routes, tests, config, locale keys, test names. (The legacy code carried `FR-044`/`UC-41` markers in comments — do NOT port them.)
- **No token / secret / raw-gov-PII (NIK/NIP/NISN/birth_date) in SSR HTML or `__NUXT_DATA__`.** Tokens live only in the Nitro `event.context`. The §3.3 leak gate uses the **STRICT** form (no `allowSessionId`): the audit DTO carries no token/secret/gov-PII. **Email IS an allowed display field** (the §3.3 decision from Phase 4 — `email` renders verbatim; only NIK/NIP/NISN/birth_date are forbidden + masked). `ip_address`, `subject_id` (opaque ULID), `session_id` (an audit record's own operational handle, distinct from the admin's OIDC `sid`), `user_agent`, `request_id` are operational fields and render freely.
- **Backend is the masking boundary.** `context` is redacted server-side (keys containing `authorization`/`bearer`/`cookie`/`password`/`secret`/`token` → `[redacted]`). The page faithfully renders the backend-masked record; it does not re-derive masking.
- **Swiss discipline:** hairline borders, no shadows, single Klein accent `#002FA7`; `#E4002B`/`--danger` only on destructive affordances + inline form-validation text. This page has **no** destructive affordance → renders **zero** `#E4002B` accent. `danger` *tone* on a status badge (a `failed` outcome) is allowed and matches the shipped `resolveHealthTone` (Phase 10) / dashboard `locked/rejected → danger` (Phase 3) precedent. Status is **never colour-alone** — tone + label via `UiStatusBadge`.
- **i18n parity:** every key added to `en.json` must exist in `id.json` (and vice-versa). `t(key, params)` supports `{param}` interpolation. Run the parity check before each locale-touching commit.
- **oxlint:** every `vi.fn(...)` needs a type parameter; every `.toThrow(...)`/`rejects.toThrow(...)` needs a message argument. The controller verifies **both** oxlint AND eslint (`.vue` errors like `vue/no-ref-as-operand` are eslint-only).
- **Test env routing by FILENAME:** pure-logic + dumb-component tests are jsdom (`@vue/test-utils` `mount`, plain `*.spec.ts`); composable + page tests are nuxt env (`*.nuxt.spec.ts` / `*.page.nuxt.spec.ts`, `mountSuspended`/`mockNuxtImport`).
- **DoD per task (controller-verified DIRECT, bypassing rtk cache):** `./node_modules/.bin/oxlint .` (0/0), `./node_modules/.bin/eslint <touched .vue>` (0), `npx vue-tsc --noEmit` (0), the task's vitest specs green; locale tasks also run the parity check. Final task adds full-suite + build + SSR leak gate.
- **e2e is DEFERRED to Phase 18** (playwright.config.ts is still legacy-SPA-wired). Author `e2e/authentication-audit.spec.ts` against the shipped Nuxt routes but do **not** run it as a gate this phase.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `app/types/auth-audit.types.ts` | DTO mirroring the presenter (event, subject, request, pagination, filters) | 13.1 |
| `app/lib/auth-audit/auth-audit-view-state.ts` | Pure `resolveAuthAuditViewState` + `resolveOutcomeTone` | 13.1 |
| `app/lib/auth-audit/auth-audit-query.ts` | Pure `buildAuthAuditQuery` (omit-blank query string) + `DEFAULT_AUTH_AUDIT_LIMIT` | 13.2 |
| `app/services/auth-audit.api.ts` | `authAuditApi.listEvents(filters)` over `apiClient` | 13.3 |
| `app/composables/useAuthAuditEvents.ts` | SSR first page + filter refetch + cursor load-more | 13.4 |
| `app/components/auth-audit/AuthAuditTable.vue` | Dumb Swiss table (outcome badge, masked subject/ip) | 13.5 |
| `app/components/auth-audit/AuthAuditFilterBar.vue` | Dumb filter bar (outcome/event-type/subject/from/to + reset) | 13.6 |
| `app/pages/authentication-audit.vue` | Compose states + table + detail drawer (read surface) | 13.7 |
| `app/locales/en.json` / `id.json` | `auth_audit` block (replace with the final Swiss key set) | 13.7 |
| `app/pages/authentication-audit.vue` (extend) | Wire filter search + cursor load-more | 13.8 |
| `test/ssr-token-leak.gate.spec.ts` | STRICT auth-audit leak assertions | 13.9 |
| `test/fixtures/ssr-leak/server/routes/api/admin/audit/authentication-events/index.get.ts` | Ready-state masked-event fixture | 13.9 |
| `test/fixtures/ssr-leak/server/routes/api/admin/me.get.ts` | Grant `admin.authentication-audit.read` | 13.9 |
| `e2e/authentication-audit.spec.ts` | Deferred Playwright spec (authored, not run) | 13.9 |

**No change needed:** `server/utils/admin-proxy.ts` already allow-lists `GET /api/admin/audit/authentication-events` (line 26). The `show`-by-id route is also allow-listed, but the frontend does not use it (rows are complete).

**Backend contract (authoritative — `AdminAuthenticationAuditPresenter`):**
```jsonc
// GET /api/admin/audit/authentication-events?<filters>
{
  "events": [
    {
      "event_id": "01J…",                       // opaque ULID-ish, [A-Z0-9]+
      "event_type": "user.login",
      "outcome": "succeeded",                    // enum: failed | started | succeeded
      "subject": { "subject_id": "01H…|null", "email": "user@example.gov|null" },
      "client_id": "portal|null",
      "session_id": "sess_…|null",               // the audited session's handle (NOT the admin's OIDC sid)
      "request": { "ip_address": "203.0.113.4|null", "user_agent": "…|null", "request_id": "req_…|null" },
      "error_code": "invalid_credentials|null",
      "context": { /* backend-redacted: sensitive keys → "[redacted]" */ },
      "occurred_at": "2026-06-28T14:32:15+00:00|null"
    }
  ],
  "pagination": { "per_page": 50, "next_cursor": "…|null", "previous_cursor": "…|null", "has_more": true }
}
```
Filters accepted by the backend (`ListAuthenticationAuditEventsRequest`): `limit`(1–100), `cursor`, `event_type`, `outcome`∈{failed,started,succeeded}, `subject_id`, `client_id`, `session_id`, `request_id`, `error_code`, `consent_action`∈{allow,deny,revoke}, `from`(date), `to`(date≥from), `support_reference`. The UI exposes a focused subset (outcome, event_type, subject_id, from, to); `buildAuthAuditQuery` passes through any set key, so the contract stays extensible.

---

### Task 13.1: DTO + view-state + outcome tone

**Files:**
- Create: `app/types/auth-audit.types.ts`
- Create: `app/lib/auth-audit/auth-audit-view-state.ts`
- Test: `app/lib/auth-audit/__tests__/auth-audit-view-state.spec.ts`

**Interfaces:**
- Consumes: `StatusTone` from `@/lib/status-tone`; `ApiError` from `@/lib/api/api-client`.
- Produces:
  - `AuthAuditSubject = { readonly subject_id: string | null; readonly email: string | null }`
  - `AuthAuditRequest = { readonly ip_address: string | null; readonly user_agent: string | null; readonly request_id: string | null }`
  - `AuthAuditEvent = { readonly event_id: string; readonly event_type: string; readonly outcome: string; readonly subject: AuthAuditSubject; readonly client_id: string | null; readonly session_id: string | null; readonly request: AuthAuditRequest; readonly error_code: string | null; readonly context: Readonly<Record<string, unknown>>; readonly occurred_at: string | null }`
  - `AuthAuditPagination = { readonly per_page?: number; readonly next_cursor?: string | null; readonly previous_cursor?: string | null; readonly has_more?: boolean }`
  - `AuthAuditFilters = { readonly limit?: number; readonly cursor?: string; readonly event_type?: string; readonly outcome?: string; readonly subject_id?: string; readonly client_id?: string; readonly session_id?: string; readonly request_id?: string; readonly error_code?: string; readonly consent_action?: string; readonly from?: string; readonly to?: string; readonly support_reference?: string }`
  - `AuthAuditListResponse = { readonly events: readonly AuthAuditEvent[]; readonly pagination?: AuthAuditPagination }`
  - `AuthAuditViewState = 'loading' | 'unauthenticated' | 'forbidden' | 'error' | 'empty' | 'ready'`
  - `resolveAuthAuditViewState(args: ResolveAuthAuditViewStateArgs): AuthAuditViewState`
  - `resolveOutcomeTone(outcome: string): StatusTone`

- [ ] **Step 1: Write the failing test**

```ts
// app/lib/auth-audit/__tests__/auth-audit-view-state.spec.ts
import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api/api-client'
import {
  resolveAuthAuditViewState,
  resolveOutcomeTone,
} from '@/lib/auth-audit/auth-audit-view-state'
import type { AuthAuditEvent } from '@/types/auth-audit.types'

const EVENT: AuthAuditEvent = {
  event_id: '01J0AUTH',
  event_type: 'user.login',
  outcome: 'succeeded',
  subject: { subject_id: '01HSUBJECT', email: 'user@example.gov' },
  client_id: 'portal',
  session_id: 'sess_abc',
  request: { ip_address: '203.0.113.4', user_agent: 'UA', request_id: 'req_1' },
  error_code: null,
  context: {},
  occurred_at: '2026-06-28T14:32:15+00:00',
}

describe('resolveAuthAuditViewState', () => {
  it('is loading while pending with no events and no error', () => {
    expect(resolveAuthAuditViewState({ pending: true, error: null, events: null })).toBe('loading')
  })

  it('is empty when the backend returns zero events', () => {
    expect(resolveAuthAuditViewState({ pending: false, error: null, events: [] })).toBe('empty')
  })

  it('is ready when events are present', () => {
    expect(resolveAuthAuditViewState({ pending: false, error: null, events: [EVENT] })).toBe('ready')
  })

  it('maps 401/403 with no events to unauthenticated/forbidden, else error', () => {
    expect(
      resolveAuthAuditViewState({ pending: false, error: new ApiError(401, 'x'), events: null }),
    ).toBe('unauthenticated')
    expect(
      resolveAuthAuditViewState({ pending: false, error: new ApiError(403, 'x'), events: null }),
    ).toBe('forbidden')
    expect(
      resolveAuthAuditViewState({ pending: false, error: new ApiError(500, 'x'), events: null }),
    ).toBe('error')
  })

  it('reads a plain hydration-shaped error (statusCode) when ApiError did not survive SSR', () => {
    expect(
      resolveAuthAuditViewState({ pending: false, error: { statusCode: 403 }, events: null }),
    ).toBe('forbidden')
  })

  it('keeps showing events (ready) when a background error arrives but events are still held', () => {
    expect(
      resolveAuthAuditViewState({ pending: false, error: new ApiError(500, 'x'), events: [EVENT] }),
    ).toBe('ready')
  })
})

describe('resolveOutcomeTone', () => {
  it('succeeded -> success, failed -> danger, started -> info, unknown -> neutral', () => {
    expect(resolveOutcomeTone('succeeded')).toBe('success')
    expect(resolveOutcomeTone('failed')).toBe('danger')
    expect(resolveOutcomeTone('started')).toBe('info')
    expect(resolveOutcomeTone('whatever')).toBe('neutral')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run app/lib/auth-audit/__tests__/auth-audit-view-state.spec.ts`
Expected: FAIL — modules unresolved.

- [ ] **Step 3: Write the DTO**

```ts
// app/types/auth-audit.types.ts

/** Authentication audit event — mirrors AdminAuthenticationAuditPresenter::event(). */
export type AuthAuditSubject = {
  readonly subject_id: string | null
  readonly email: string | null
}

export type AuthAuditRequest = {
  readonly ip_address: string | null
  readonly user_agent: string | null
  readonly request_id: string | null
}

export type AuthAuditEvent = {
  readonly event_id: string
  readonly event_type: string
  readonly outcome: string
  readonly subject: AuthAuditSubject
  readonly client_id: string | null
  readonly session_id: string | null
  readonly request: AuthAuditRequest
  readonly error_code: string | null
  // Backend-redacted free-form context (sensitive keys already → "[redacted]").
  readonly context: Readonly<Record<string, unknown>>
  readonly occurred_at: string | null
}

export type AuthAuditPagination = {
  readonly per_page?: number
  readonly next_cursor?: string | null
  readonly previous_cursor?: string | null
  readonly has_more?: boolean
}

export type AuthAuditFilters = {
  readonly limit?: number
  readonly cursor?: string
  readonly event_type?: string
  readonly outcome?: string
  readonly subject_id?: string
  readonly client_id?: string
  readonly session_id?: string
  readonly request_id?: string
  readonly error_code?: string
  readonly consent_action?: string
  readonly from?: string
  readonly to?: string
  readonly support_reference?: string
}

export type AuthAuditListResponse = {
  readonly events: readonly AuthAuditEvent[]
  readonly pagination?: AuthAuditPagination
}
```

- [ ] **Step 4: Write the view-state + tone**

```ts
// app/lib/auth-audit/auth-audit-view-state.ts
import { ApiError } from '@/lib/api/api-client'
import type { StatusTone } from '@/lib/status-tone'
import type { AuthAuditEvent } from '@/types/auth-audit.types'

export type AuthAuditViewState =
  | 'loading'
  | 'unauthenticated'
  | 'forbidden'
  | 'error'
  | 'empty'
  | 'ready'

export type ResolveAuthAuditViewStateArgs = {
  // `pending` is part of the args for call-site uniformity with the other domain
  // composables; the resolver derives loading from the absence of events + error.
  readonly pending: boolean
  readonly error: unknown
  readonly events: readonly AuthAuditEvent[] | null
}

// Security boundary: an error with NO prior events must surface the real
// auth/permission state. A background error that still holds events keeps the
// list on screen (handled as stale by the composable).
export function resolveAuthAuditViewState({
  error,
  events,
}: ResolveAuthAuditViewStateArgs): AuthAuditViewState {
  if (error && !events) {
    const status = errorStatus(error)
    if (status === 401) return 'unauthenticated'
    if (status === 403) return 'forbidden'
    return 'error'
  }
  if (events) return events.length === 0 ? 'empty' : 'ready'
  return 'loading'
}

// outcome ∈ {failed, started, succeeded}. A failed authentication is a genuinely
// critical state -> danger tone (the shipped resolveHealthTone precedent); this is
// the status-badge tone palette, not the reserved-for-destructive #E4002B accent.
export function resolveOutcomeTone(outcome: string): StatusTone {
  switch (outcome) {
    case 'succeeded':
      return 'success'
    case 'failed':
      return 'danger'
    case 'started':
      return 'info'
    default:
      return 'neutral'
  }
}

// Hydration-safe: a custom ApiError instance does not survive useAsyncData's SSR
// error serialization, so also read the plain `{ statusCode | status }` shape.
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

- [ ] **Step 5: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run app/lib/auth-audit/__tests__/auth-audit-view-state.spec.ts`
Expected: PASS.

- [ ] **Step 6: Verify gates + commit**

Run: `./node_modules/.bin/oxlint . && npx vue-tsc --noEmit`

```bash
git add app/types/auth-audit.types.ts app/lib/auth-audit/auth-audit-view-state.ts app/lib/auth-audit/__tests__/auth-audit-view-state.spec.ts
git commit -m "$(cat <<'EOF'
feat(sso-admin-frontend): authentication-audit DTO + view-state + outcome tone

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 13.2: Query builder (omit-blank) + default limit

**Files:**
- Create: `app/lib/auth-audit/auth-audit-query.ts`
- Test: `app/lib/auth-audit/__tests__/auth-audit-query.spec.ts`

**Interfaces:**
- Consumes: `AuthAuditFilters` from `@/types/auth-audit.types`.
- Produces:
  - `DEFAULT_AUTH_AUDIT_LIMIT = 50`
  - `buildAuthAuditQuery(path: string, filters: AuthAuditFilters): string` — appends a `?`-query of every set, non-blank filter (skips `undefined`/`null`/`''`); returns `path` unchanged when no params.

- [ ] **Step 1: Write the failing test**

```ts
// app/lib/auth-audit/__tests__/auth-audit-query.spec.ts
import { describe, expect, it } from 'vitest'
import { buildAuthAuditQuery, DEFAULT_AUTH_AUDIT_LIMIT } from '@/lib/auth-audit/auth-audit-query'

const PATH = '/api/admin/audit/authentication-events'

describe('buildAuthAuditQuery', () => {
  it('returns the bare path when there are no filters', () => {
    expect(buildAuthAuditQuery(PATH, {})).toBe(PATH)
  })

  it('omits blank / null / undefined values', () => {
    expect(
      buildAuthAuditQuery(PATH, { event_type: '', subject_id: undefined, outcome: 'succeeded' }),
    ).toBe(`${PATH}?outcome=succeeded`)
  })

  it('serializes set filters incl. limit and cursor', () => {
    const q = buildAuthAuditQuery(PATH, {
      limit: DEFAULT_AUTH_AUDIT_LIMIT,
      outcome: 'failed',
      from: '2026-06-01',
      cursor: 'abc123',
    })
    expect(q.startsWith(`${PATH}?`)).toBe(true)
    expect(q).toContain('limit=50')
    expect(q).toContain('outcome=failed')
    expect(q).toContain('from=2026-06-01')
    expect(q).toContain('cursor=abc123')
  })

  it('url-encodes values', () => {
    expect(buildAuthAuditQuery(PATH, { event_type: 'user login' })).toContain('event_type=user+login')
  })

  it('exposes the default limit', () => {
    expect(DEFAULT_AUTH_AUDIT_LIMIT).toBe(50)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run app/lib/auth-audit/__tests__/auth-audit-query.spec.ts`
Expected: FAIL — module unresolved.

- [ ] **Step 3: Write the query builder**

```ts
// app/lib/auth-audit/auth-audit-query.ts
import type { AuthAuditFilters } from '@/types/auth-audit.types'

export const DEFAULT_AUTH_AUDIT_LIMIT = 50

/**
 * Builds the list URL with a `?`-query of every set, non-blank filter. Blank
 * strings / null / undefined are skipped so an empty filter input never narrows
 * the query. Pure — no side effects, returns a new string.
 */
export function buildAuthAuditQuery(path: string, filters: AuthAuditFilters): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue
    params.set(key, String(value))
  }
  const query = params.toString()
  return query ? `${path}?${query}` : path
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run app/lib/auth-audit/__tests__/auth-audit-query.spec.ts`
Expected: PASS.

- [ ] **Step 5: Verify gates + commit**

Run: `./node_modules/.bin/oxlint . && npx vue-tsc --noEmit`

```bash
git add app/lib/auth-audit/auth-audit-query.ts app/lib/auth-audit/__tests__/auth-audit-query.spec.ts
git commit -m "$(cat <<'EOF'
feat(sso-admin-frontend): authentication-audit query builder (omit-blank) + default limit

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 13.3: Auth-audit API service

**Files:**
- Create: `app/services/auth-audit.api.ts`
- Test: `app/services/__tests__/auth-audit.api.spec.ts`

**Interfaces:**
- Consumes: `apiClient` from `@/lib/api/api-client`; `buildAuthAuditQuery` from `@/lib/auth-audit/auth-audit-query`; `AuthAuditFilters`/`AuthAuditListResponse` from `@/types/auth-audit.types`.
- Produces: `authAuditApi.listEvents(filters?: AuthAuditFilters): Promise<AuthAuditListResponse>`.
- **No proxy change** — `GET /api/admin/audit/authentication-events` is already allow-listed. The `show`-by-id endpoint is intentionally not used (list rows are complete).

- [ ] **Step 1: Write the failing test**

```ts
// app/services/__tests__/auth-audit.api.spec.ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '@/lib/api/api-client'
import { authAuditApi } from '@/services/auth-audit.api'

afterEach(() => vi.restoreAllMocks())

describe('authAuditApi.listEvents', () => {
  it('GETs the bare path with no filters', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ events: [] } as never)
    await authAuditApi.listEvents()
    expect(get).toHaveBeenCalledWith('/api/admin/audit/authentication-events')
  })

  it('GETs with the serialized non-blank filters', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ events: [] } as never)
    await authAuditApi.listEvents({ limit: 50, outcome: 'failed', subject_id: '' })
    const url = get.mock.calls[0]?.[0] as string
    expect(url.startsWith('/api/admin/audit/authentication-events?')).toBe(true)
    expect(url).toContain('limit=50')
    expect(url).toContain('outcome=failed')
    expect(url).not.toContain('subject_id')
  })

  it('passes the response through unchanged', async () => {
    const payload = { events: [{ event_id: 'x' }], pagination: { has_more: false } }
    vi.spyOn(apiClient, 'get').mockResolvedValue(payload as never)
    expect(await authAuditApi.listEvents()).toBe(payload)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run app/services/__tests__/auth-audit.api.spec.ts`
Expected: FAIL — module unresolved.

- [ ] **Step 3: Write the service**

```ts
// app/services/auth-audit.api.ts
import { apiClient } from '@/lib/api/api-client'
import { buildAuthAuditQuery } from '@/lib/auth-audit/auth-audit-query'
import type { AuthAuditFilters, AuthAuditListResponse } from '@/types/auth-audit.types'

const AUTH_AUDIT_PATH = '/api/admin/audit/authentication-events'

export const authAuditApi = {
  // GET the authentication-event page for the given filters (incl. cursor). The
  // BFF injects the Bearer token; the SPA is token-blind. The `show`-by-id route
  // exists but is unused — the list rows carry the full event shape, so the detail
  // drawer renders from the selected row.
  listEvents(filters: AuthAuditFilters = {}): Promise<AuthAuditListResponse> {
    return apiClient.get<AuthAuditListResponse>(buildAuthAuditQuery(AUTH_AUDIT_PATH, filters))
  },
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run app/services/__tests__/auth-audit.api.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Verify gates + commit**

Run: `./node_modules/.bin/oxlint . && npx vue-tsc --noEmit`

```bash
git add app/services/auth-audit.api.ts app/services/__tests__/auth-audit.api.spec.ts
git commit -m "$(cat <<'EOF'
feat(sso-admin-frontend): auth-audit.api listEvents (filtered, cursor-aware)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 13.4: `useAuthAuditEvents` composable (SSR + filter refetch + cursor load-more)

**Files:**
- Create: `app/composables/useAuthAuditEvents.ts`
- Test: `app/composables/__tests__/useAuthAuditEvents.nuxt.spec.ts`

**Interfaces:**
- Consumes: `useAsyncData` (Nuxt auto-import); `authAuditApi.listEvents`; `resolveAuthAuditViewState`/`AuthAuditViewState`; `DEFAULT_AUTH_AUDIT_LIMIT`; `ApiError`/`getLastRequestId`; the DTO types.
- Produces: `useAuthAuditEvents(initialFilters?: AuthAuditFilters): UseAuthAuditEventsReturn` where (`initialFilters` seed the SSR first fetch — e.g. a `client_id` deep-link from the clients-detail consent-trail link — so the first page renders pre-filtered)
  ```ts
  UseAuthAuditEventsReturn = {
    readonly events: ComputedRef<readonly AuthAuditEvent[] | null>
    readonly viewState: ComputedRef<AuthAuditViewState>
    readonly isStale: ComputedRef<boolean>
    readonly requestId: ComputedRef<string | null>
    readonly pending: Ref<boolean>
    readonly hasMore: ComputedRef<boolean>
    readonly search: (filters: AuthAuditFilters) => Promise<void>
    readonly loadMore: () => Promise<void>
    readonly refresh: () => Promise<void>
  }
  ```
  Behaviour: the first page resolves via `useAsyncData` (SSR-hydrated) and refetches when `filters` changes (`{ watch: [filters] }`). `events` = first page + client-appended `loadMore` pages. `search` resets the appended pages and replaces the filters (forcing one refetch). `loadMore` fetches the next cursor page and appends. `refresh` resets appended pages and re-runs the first page.

- [ ] **Step 1: Write the failing test** (mirrors the shipped `useSecurityPolicies.nuxt.spec.ts` idiom — mock the service, drive the `useAsyncData` refs)

```ts
// app/composables/__tests__/useAuthAuditEvents.nuxt.spec.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { ApiError } from '@/lib/api/api-client'
import type { AuthAuditEvent, AuthAuditListResponse } from '@/types/auth-audit.types'

const listMock = vi.fn<(filters?: unknown) => Promise<AuthAuditListResponse>>()
vi.mock('@/services/auth-audit.api', () => ({ authAuditApi: { listEvents: listMock } }))

const dataRef = ref<AuthAuditListResponse | null>(null)
const pendingRef = ref(false)
const errorRef = ref<unknown>(null)
const refreshMock = vi.fn<() => Promise<void>>(async () => {})

mockNuxtImport('useAsyncData', () => {
  return (_key: string, handler: () => Promise<unknown>) => {
    void handler() // record the first listEvents(filters) call
    return { data: dataRef, pending: pendingRef, error: errorRef, refresh: refreshMock }
  }
})

const { useAuthAuditEvents } = await import('../useAuthAuditEvents')

function event(id: string): AuthAuditEvent {
  return {
    event_id: id,
    event_type: 'user.login',
    outcome: 'succeeded',
    subject: { subject_id: null, email: null },
    client_id: null,
    session_id: null,
    request: { ip_address: null, user_agent: null, request_id: null },
    error_code: null,
    context: {},
    occurred_at: null,
  }
}

beforeEach(() => {
  dataRef.value = null
  pendingRef.value = false
  errorRef.value = null
  listMock.mockReset()
  listMock.mockResolvedValue({ events: [] })
})
afterEach(() => vi.clearAllMocks())

describe('useAuthAuditEvents', () => {
  it('fetches the first page with the default limit', () => {
    useAuthAuditEvents()
    expect(listMock).toHaveBeenCalledWith({ limit: 50 })
  })

  it('seeds the first fetch with initial filters (deep-link pre-filter)', () => {
    useAuthAuditEvents({ client_id: 'portal' })
    expect(listMock).toHaveBeenCalledWith({ client_id: 'portal', limit: 50 })
  })

  it('maps loading / empty / ready', () => {
    const r = useAuthAuditEvents()
    pendingRef.value = true
    expect(r.viewState.value).toBe('loading')
    pendingRef.value = false
    dataRef.value = { events: [] }
    expect(r.viewState.value).toBe('empty')
    dataRef.value = { events: [event('a')] }
    expect(r.viewState.value).toBe('ready')
    expect(r.events.value).toEqual([event('a')])
  })

  it('exposes hasMore from the first page cursor', () => {
    const r = useAuthAuditEvents()
    dataRef.value = { events: [event('a')], pagination: { next_cursor: 'c1' } }
    expect(r.hasMore.value).toBe(true)
    dataRef.value = { events: [event('a')], pagination: { next_cursor: null } }
    expect(r.hasMore.value).toBe(false)
  })

  it('loadMore appends the next cursor page and advances the cursor', async () => {
    const r = useAuthAuditEvents()
    dataRef.value = { events: [event('a')], pagination: { next_cursor: 'c1' } }
    listMock.mockResolvedValueOnce({ events: [event('b')], pagination: { next_cursor: null } })
    await r.loadMore()
    expect(listMock).toHaveBeenLastCalledWith({ limit: 50, cursor: 'c1' })
    expect(r.events.value).toEqual([event('a'), event('b')])
    expect(r.hasMore.value).toBe(false)
  })

  it('loadMore is a no-op when there is no next cursor', async () => {
    const r = useAuthAuditEvents()
    dataRef.value = { events: [event('a')], pagination: { next_cursor: null } }
    listMock.mockClear()
    await r.loadMore()
    expect(listMock).not.toHaveBeenCalled()
  })

  it('search resets appended pages (collapses back to the first page)', async () => {
    const r = useAuthAuditEvents()
    dataRef.value = { events: [event('a')], pagination: { next_cursor: 'c1' } }
    listMock.mockResolvedValueOnce({ events: [event('b')], pagination: { next_cursor: null } })
    await r.loadMore()
    expect(r.events.value).toEqual([event('a'), event('b')])
    await r.search({ outcome: 'failed' })
    expect(r.events.value).toEqual([event('a')]) // appended page cleared
  })

  it('maps 401/403 and surfaces the ApiError requestId', () => {
    const r = useAuthAuditEvents()
    errorRef.value = new ApiError(403, 'no', undefined, {}, 'req-aa')
    expect(r.viewState.value).toBe('forbidden')
    expect(r.requestId.value).toBe('req-aa')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run app/composables/__tests__/useAuthAuditEvents.nuxt.spec.ts`
Expected: FAIL — module unresolved.

- [ ] **Step 3: Write the composable**

```ts
// app/composables/useAuthAuditEvents.ts
import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { ApiError, getLastRequestId } from '@/lib/api/api-client'
import { authAuditApi } from '@/services/auth-audit.api'
import {
  resolveAuthAuditViewState,
  type AuthAuditViewState,
} from '@/lib/auth-audit/auth-audit-view-state'
import { DEFAULT_AUTH_AUDIT_LIMIT } from '@/lib/auth-audit/auth-audit-query'
import type {
  AuthAuditEvent,
  AuthAuditFilters,
  AuthAuditListResponse,
} from '@/types/auth-audit.types'

export type UseAuthAuditEventsReturn = {
  readonly events: ComputedRef<readonly AuthAuditEvent[] | null>
  readonly viewState: ComputedRef<AuthAuditViewState>
  readonly isStale: ComputedRef<boolean>
  readonly requestId: ComputedRef<string | null>
  readonly pending: Ref<boolean>
  readonly hasMore: ComputedRef<boolean>
  readonly search: (filters: AuthAuditFilters) => Promise<void>
  readonly loadMore: () => Promise<void>
  readonly refresh: () => Promise<void>
}

export function useAuthAuditEvents(
  initialFilters: AuthAuditFilters = {},
): UseAuthAuditEventsReturn {
  // initialFilters seed the SSR first fetch (e.g. a client_id deep-link from the
  // clients-detail consent-trail link) so the first page renders pre-filtered.
  const filters = ref<AuthAuditFilters>({ ...initialFilters, limit: DEFAULT_AUTH_AUDIT_LIMIT })
  // Client-appended cursor pages (beyond the SSR first page) + the live cursor.
  const extraEvents = ref<readonly AuthAuditEvent[]>([])
  const extraCursor = ref<string | null>(null)

  // First page runs during SSR so the masked event list hydrates as safe DTO only
  // (email allowed; no token/secret/gov-PII). Refetches on filter change.
  const { data, pending, error, refresh } = useAsyncData<AuthAuditListResponse>(
    'admin-authentication-audit',
    () => authAuditApi.listEvents(filters.value),
    { watch: [filters] },
  )

  const firstPage = computed<readonly AuthAuditEvent[] | null>(() => data.value?.events ?? null)
  const events = computed<readonly AuthAuditEvent[] | null>(() =>
    firstPage.value ? [...firstPage.value, ...extraEvents.value] : null,
  )

  // After a loadMore the live cursor is extraCursor; before any loadMore it is the
  // first page's next_cursor.
  const nextCursor = computed<string | null>(() =>
    extraEvents.value.length > 0
      ? extraCursor.value
      : (data.value?.pagination?.next_cursor ?? null),
  )
  const hasMore = computed<boolean>(() => Boolean(nextCursor.value))

  const viewState = computed<AuthAuditViewState>(() =>
    resolveAuthAuditViewState({
      pending: pending.value,
      error: error.value,
      events: firstPage.value,
    }),
  )
  const isStale = computed<boolean>(() => Boolean(error.value) && firstPage.value !== null)
  const requestId = computed<string | null>(() =>
    error.value instanceof ApiError
      ? (error.value.requestId ?? getLastRequestId())
      : getLastRequestId(),
  )

  function resetPages(): void {
    extraEvents.value = []
    extraCursor.value = null
  }

  async function search(next: AuthAuditFilters): Promise<void> {
    resetPages()
    // Replacing the ref triggers the useAsyncData watch -> first page refetches.
    filters.value = { ...next, limit: DEFAULT_AUTH_AUDIT_LIMIT }
  }

  async function loadMore(): Promise<void> {
    const cursor = nextCursor.value
    if (!cursor) return
    const response = await authAuditApi.listEvents({ ...filters.value, cursor })
    extraEvents.value = [...extraEvents.value, ...response.events]
    extraCursor.value = response.pagination?.next_cursor ?? null
  }

  return {
    events,
    viewState,
    isStale,
    requestId,
    pending,
    hasMore,
    search,
    loadMore,
    refresh: async () => {
      resetPages()
      await refresh()
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run app/composables/__tests__/useAuthAuditEvents.nuxt.spec.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Verify gates + commit**

Run: `./node_modules/.bin/oxlint . && npx vue-tsc --noEmit`

```bash
git add app/composables/useAuthAuditEvents.ts app/composables/__tests__/useAuthAuditEvents.nuxt.spec.ts
git commit -m "$(cat <<'EOF'
feat(sso-admin-frontend): useAuthAuditEvents (SSR first page + filter refetch + cursor load-more)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 13.5: AuthAuditTable (Swiss)

**Files:**
- Create: `app/components/auth-audit/AuthAuditTable.vue`
- Test: `app/components/auth-audit/__tests__/AuthAuditTable.spec.ts`

**Interfaces:**
- Props: `{ readonly events: readonly AuthAuditEvent[]; readonly caption: string; readonly occurredLabel: string; readonly typeLabel: string; readonly outcomeLabel: string; readonly subjectLabel: string; readonly ipLabel: string; readonly outcomeText: (outcome: string) => string }`. Emits `select(eventId: string)`.
- Reuses `UiDataList`, `UiStatusBadge`, `UiFolio` + `resolveOutcomeTone`. No i18n, no fetch. The subject cell shows `email ?? subject_id ?? '—'` (email is the allowed display field; subject_id is an opaque ULID). Outcome badge is always tone + label.

- [ ] **Step 1: Write the failing test**

```ts
// app/components/auth-audit/__tests__/AuthAuditTable.spec.ts
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import AuthAuditTable from '@/components/auth-audit/AuthAuditTable.vue'
import type { AuthAuditEvent } from '@/types/auth-audit.types'

function event(over: Partial<AuthAuditEvent> = {}): AuthAuditEvent {
  return {
    event_id: 'EV1',
    event_type: 'user.login',
    outcome: 'failed',
    subject: { subject_id: '01HSUB', email: 'user@example.gov' },
    client_id: 'portal',
    session_id: 'sess_1',
    request: { ip_address: '203.0.113.9', user_agent: 'UA', request_id: 'req_1' },
    error_code: 'invalid_credentials',
    context: {},
    occurred_at: '2026-06-28T14:32:15+00:00',
    ...over,
  }
}

function mountTable(events: AuthAuditEvent[]) {
  return mount(AuthAuditTable, {
    props: {
      events,
      caption: 'Authentication events',
      occurredLabel: 'Occurred',
      typeLabel: 'Type',
      outcomeLabel: 'Outcome',
      subjectLabel: 'Subject',
      ipLabel: 'IP',
      outcomeText: (o: string) => ({ failed: 'Failed', succeeded: 'Succeeded' })[o] ?? o,
    },
  })
}

describe('AuthAuditTable', () => {
  it('renders a row per event with the outcome badge (tone + label, never colour-alone)', () => {
    const w = mountTable([event(), event({ event_id: 'EV2', outcome: 'succeeded' })])
    expect(w.find('[data-testid="auth-audit-select-EV1"]').exists()).toBe(true)
    expect(w.find('[data-testid="auth-audit-select-EV2"]').exists()).toBe(true)
    const badge = w.find('[data-testid="auth-audit-outcome-EV1"]')
    expect(badge.attributes('data-tone')).toBe('danger') // failed
    expect(badge.text()).toContain('Failed')
  })

  it('shows email as the subject (allowed display field) and the event type + ip', () => {
    const w = mountTable([event()])
    expect(w.text()).toContain('user@example.gov')
    expect(w.text()).toContain('user.login')
    expect(w.text()).toContain('203.0.113.9')
  })

  it('emits select with the event_id when the row button is clicked', async () => {
    const w = mountTable([event()])
    await w.find('[data-testid="auth-audit-select-EV1"]').trigger('click')
    expect(w.emitted('select')?.[0]).toEqual(['EV1'])
  })

  it('falls back to subject_id then em dash when email is null', () => {
    const w = mountTable([event({ subject: { subject_id: '01HSUB', email: null } })])
    expect(w.text()).toContain('01HSUB')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run app/components/auth-audit/__tests__/AuthAuditTable.spec.ts`
Expected: FAIL — component missing.

- [ ] **Step 3: Write the component**

```vue
<!-- app/components/auth-audit/AuthAuditTable.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import UiDataList, {
  type UiDataListColumn,
  type UiDataListRow,
} from '@/components/ui/UiDataList.vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import UiFolio from '@/components/ui/UiFolio.vue'
import { resolveOutcomeTone } from '@/lib/auth-audit/auth-audit-view-state'
import type { AuthAuditEvent } from '@/types/auth-audit.types'

const props = defineProps<{
  readonly events: readonly AuthAuditEvent[]
  readonly caption: string
  readonly occurredLabel: string
  readonly typeLabel: string
  readonly outcomeLabel: string
  readonly subjectLabel: string
  readonly ipLabel: string
  readonly outcomeText: (outcome: string) => string
}>()

const emit = defineEmits<{ (event: 'select', eventId: string): void }>()

const columns = computed<readonly UiDataListColumn[]>(() => [
  { key: 'occurred', label: props.occurredLabel, align: 'left', variant: 'timestamp' },
  { key: 'type', label: props.typeLabel, align: 'left' },
  { key: 'outcome', label: props.outcomeLabel, align: 'left' },
  { key: 'subject', label: props.subjectLabel, align: 'left' },
  { key: 'ip', label: props.ipLabel, align: 'left' },
])

// The subject cell prefers email (the allowed display field); subject_id is an
// opaque ULID fallback. No raw gov-PII is present in the DTO.
const rows = computed<readonly UiDataListRow[]>(() =>
  props.events.map((e) => ({
    id: e.event_id,
    occurred: e.occurred_at ?? '—',
    type: e.event_type,
    outcome: e.outcome,
    subject: e.subject.email ?? e.subject.subject_id ?? '—',
    ip: e.request.ip_address ?? '—',
  })),
)
</script>

<template>
  <UiDataList :caption="caption" :columns="columns" :rows="rows">
    <template #cell(occurred)="{ row }">
      <button
        type="button"
        class="auth-audit-table__select"
        :data-testid="`auth-audit-select-${row.id}`"
        @click="emit('select', String(row.id))"
      >
        <UiFolio :value="String(row['occurred'])" variant="timestamp" />
      </button>
    </template>

    <template #cell(outcome)="{ row }">
      <UiStatusBadge
        :data-testid="`auth-audit-outcome-${row.id}`"
        :tone="resolveOutcomeTone(String(row['outcome']))"
        :label="outcomeText(String(row['outcome']))"
      />
    </template>
  </UiDataList>
</template>

<style scoped>
.auth-audit-table__select {
  appearance: none;
  padding: 0;
  background: none;
  border: none;
  font: inherit;
  color: var(--accent);
  cursor: pointer;
  text-align: left;
}
.auth-audit-table__select:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run app/components/auth-audit/__tests__/AuthAuditTable.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Verify gates + commit**

Run: `./node_modules/.bin/oxlint . && ./node_modules/.bin/eslint app/components/auth-audit/AuthAuditTable.vue && npx vue-tsc --noEmit`

```bash
git add app/components/auth-audit/AuthAuditTable.vue app/components/auth-audit/__tests__/AuthAuditTable.spec.ts
git commit -m "$(cat <<'EOF'
feat(sso-admin-frontend): Swiss AuthAuditTable (outcome badge, masked subject/ip)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 13.6: AuthAuditFilterBar (Swiss)

**Files:**
- Create: `app/components/auth-audit/AuthAuditFilterBar.vue`
- Test: `app/components/auth-audit/__tests__/AuthAuditFilterBar.spec.ts`

**Interfaces:**
- Props: `{ readonly labels: AuthAuditFilterLabels; readonly submitting?: boolean }` where `AuthAuditFilterLabels = { title, outcome, outcomeAll, outcomeSucceeded, outcomeFailed, outcomeStarted, eventType, subjectId, from, to, filter, reset }` (all `string`).
- Emits: `search(filters: AuthAuditFilters)` (non-blank fields only — blanks are dropped by `buildAuthAuditQuery` downstream, but the bar emits the full draft), `reset()`.
- A dumb component: holds local draft refs, emits on submit/reset. Reuses `UiSelect`, `UiInput`, `UiButton`. `outcome` is a string-modelled `UiSelect`; `from`/`to` are `UiInput type="date"`. No i18n, no fetch.

- [ ] **Step 1: Write the failing test**

```ts
// app/components/auth-audit/__tests__/AuthAuditFilterBar.spec.ts
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import AuthAuditFilterBar from '@/components/auth-audit/AuthAuditFilterBar.vue'

const LABELS = {
  title: 'Filter events',
  outcome: 'Outcome',
  outcomeAll: 'All outcomes',
  outcomeSucceeded: 'Succeeded',
  outcomeFailed: 'Failed',
  outcomeStarted: 'Started',
  eventType: 'Event type',
  subjectId: 'Account code',
  from: 'From',
  to: 'To',
  filter: 'Filter',
  reset: 'Reset',
}

function mountBar() {
  return mount(AuthAuditFilterBar, { props: { labels: LABELS } })
}

describe('AuthAuditFilterBar', () => {
  it('emits search with the entered filters on submit', async () => {
    const w = mountBar()
    await w.find('[data-testid="auth-audit-filter-event-type"]').setValue('user.login')
    await w.find('[data-testid="auth-audit-filter-subject-id"]').setValue('01HSUB')
    await w.find('[data-testid="auth-audit-filter-form"]').trigger('submit')
    const emitted = w.emitted('search')?.[0]?.[0] as Record<string, unknown>
    expect(emitted.event_type).toBe('user.login')
    expect(emitted.subject_id).toBe('01HSUB')
  })

  it('emits reset and clears the inputs', async () => {
    const w = mountBar()
    const eventType = w.find('[data-testid="auth-audit-filter-event-type"]')
    await eventType.setValue('user.login')
    await w.find('[data-testid="auth-audit-filter-reset"]').trigger('click')
    expect(w.emitted('reset')).toHaveLength(1)
    expect((eventType.element as HTMLInputElement).value).toBe('')
  })

  it('renders the four outcome options via the UiSelect :options prop', () => {
    const w = mountBar()
    const options = w.find('[data-testid="auth-audit-filter-outcome"]').findAll('option')
    expect(options).toHaveLength(4)
    expect(options[0]?.text()).toBe(LABELS.outcomeAll)
    expect(options[2]?.attributes('value')).toBe('failed')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run app/components/auth-audit/__tests__/AuthAuditFilterBar.spec.ts`
Expected: FAIL — component missing.

- [ ] **Step 3: Write the component**

```vue
<!-- app/components/auth-audit/AuthAuditFilterBar.vue -->
<script setup lang="ts">
import { computed, reactive } from 'vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiSelect, { type UiSelectOption } from '@/components/ui/UiSelect.vue'
import UiButton from '@/components/ui/UiButton.vue'
import type { AuthAuditFilters } from '@/types/auth-audit.types'

export type AuthAuditFilterLabels = {
  readonly title: string
  readonly outcome: string
  readonly outcomeAll: string
  readonly outcomeSucceeded: string
  readonly outcomeFailed: string
  readonly outcomeStarted: string
  readonly eventType: string
  readonly subjectId: string
  readonly from: string
  readonly to: string
  readonly filter: string
  readonly reset: string
}

const props = defineProps<{
  readonly labels: AuthAuditFilterLabels
  readonly submitting?: boolean
}>()

// UiSelect renders its own <option>s from an :options prop (it has no default
// slot), v-modelling a string. Build the outcome options from the labels.
const outcomeOptions = computed<readonly UiSelectOption[]>(() => [
  { value: '', label: props.labels.outcomeAll },
  { value: 'succeeded', label: props.labels.outcomeSucceeded },
  { value: 'failed', label: props.labels.outcomeFailed },
  { value: 'started', label: props.labels.outcomeStarted },
])

const emit = defineEmits<{
  (event: 'search', filters: AuthAuditFilters): void
  (event: 'reset'): void
}>()

const draft = reactive({
  outcome: '',
  event_type: '',
  subject_id: '',
  from: '',
  to: '',
})

function onSubmit(): void {
  emit('search', {
    outcome: draft.outcome,
    event_type: draft.event_type,
    subject_id: draft.subject_id,
    from: draft.from,
    to: draft.to,
  })
}

function onReset(): void {
  draft.outcome = ''
  draft.event_type = ''
  draft.subject_id = ''
  draft.from = ''
  draft.to = ''
  emit('reset')
}
</script>

<template>
  <form
    class="auth-audit-filter"
    data-testid="auth-audit-filter-form"
    aria-label="filter"
    @submit.prevent="onSubmit"
  >
    <p class="auth-audit-filter__title">{{ labels.title }}</p>
    <div class="auth-audit-filter__grid">
      <label class="auth-audit-filter__field">
        <span>{{ labels.outcome }}</span>
        <UiSelect
          v-model="draft.outcome"
          :options="outcomeOptions"
          data-testid="auth-audit-filter-outcome"
        />
      </label>

      <label class="auth-audit-filter__field">
        <span>{{ labels.eventType }}</span>
        <UiInput v-model="draft.event_type" data-testid="auth-audit-filter-event-type" />
      </label>

      <label class="auth-audit-filter__field">
        <span>{{ labels.subjectId }}</span>
        <UiInput v-model="draft.subject_id" data-testid="auth-audit-filter-subject-id" />
      </label>

      <label class="auth-audit-filter__field">
        <span>{{ labels.from }}</span>
        <UiInput v-model="draft.from" type="date" data-testid="auth-audit-filter-from" />
      </label>

      <label class="auth-audit-filter__field">
        <span>{{ labels.to }}</span>
        <UiInput v-model="draft.to" type="date" data-testid="auth-audit-filter-to" />
      </label>
    </div>

    <div class="auth-audit-filter__actions">
      <UiButton type="submit" variant="primary" size="sm" :disabled="submitting" data-testid="auth-audit-filter-submit">
        {{ labels.filter }}
      </UiButton>
      <UiButton type="button" variant="secondary" size="sm" data-testid="auth-audit-filter-reset" @click="onReset">
        {{ labels.reset }}
      </UiButton>
    </div>
  </form>
</template>

<style scoped>
.auth-audit-filter {
  display: grid;
  gap: 12px;
  padding: 16px;
  background: var(--card);
  border: 1px solid var(--border);
}
.auth-audit-filter__title {
  margin: 0;
  font: 600 0.6875rem/1 var(--font-sans);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.auth-audit-filter__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
}
.auth-audit-filter__field {
  display: grid;
  gap: 4px;
  font: 600 0.75rem/1.3 var(--font-sans);
  color: var(--fg-2);
}
.auth-audit-filter__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run app/components/auth-audit/__tests__/AuthAuditFilterBar.spec.ts`
Expected: PASS (3 tests).

> Note: if `UiSelect`/`UiInput` `v-model` + `setValue` interplay needs the native control, the testids land on the rendered `<select>`/`<input>` via attribute fallthrough (both DS controls have a single native root). If `setValue` cannot find the control, target the inner native element — but the shipped `UiInput`/`UiSelect` forward attrs to their root control, so the testids resolve.

- [ ] **Step 5: Verify gates + commit**

Run: `./node_modules/.bin/oxlint . && ./node_modules/.bin/eslint app/components/auth-audit/AuthAuditFilterBar.vue && npx vue-tsc --noEmit`

```bash
git add app/components/auth-audit/AuthAuditFilterBar.vue app/components/auth-audit/__tests__/AuthAuditFilterBar.spec.ts
git commit -m "$(cat <<'EOF'
feat(sso-admin-frontend): Swiss AuthAuditFilterBar (outcome/type/subject/date + reset)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 13.7: Page read surface (states + table + detail drawer) + locale

**Files:**
- Modify (replace stub): `app/pages/authentication-audit.vue`
- Modify: `app/locales/en.json` (`auth_audit` block), `app/locales/id.json` (`auth_audit` block)
- Test: `app/pages/__tests__/authentication-audit.page.nuxt.spec.ts`

**Interfaces:**
- Consumes: `useAuthAuditEvents` (13.4); `AuthAuditTable` (13.5); `resolveOutcomeTone` (13.1); `useSessionStore`; `useI18n`; `UiSkeleton`/`UiStatusView`/`UiEmptyState`/`UiButton`/`UiDetailDrawer`/`UiStatusBadge`/`UiFolio`.
- **`definePageMeta` MUST keep `name: 'admin.authentication-audit'`, `permissions: ['admin.authentication-audit.read']`** verbatim — `route-map.spec.ts` already asserts this row.
- Replace the `auth_audit` locale block wholesale with the final Swiss key set below (drops the legacy `consent_action*`/`support_reference`/unused filter-label keys; the implementer verifies no remaining `auth_audit.*` key is unreferenced).
- This task renders the read surface: states, filter bar slot, table, detail drawer (rendered from the selected row — NO fetch). The filter **search** + **load-more** wiring lands in 13.8 (the filter bar is present but its `@search`/`@reset` and the load-more button are wired next). To keep this task's deliverable self-contained, include the `AuthAuditFilterBar` import + the load-more button but wire them to the composable here; 13.8 only adds the search/loadMore handler bodies + their tests. (If you prefer, wire fully here — 13.8's tests still pass.)

- [ ] **Step 1: Write the failing page test**

```ts
// app/pages/__tests__/authentication-audit.page.nuxt.spec.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import enLocale from '@/locales/en.json'
import type { AuthAuditEvent } from '@/types/auth-audit.types'

function event(over: Partial<AuthAuditEvent> = {}): AuthAuditEvent {
  return {
    event_id: 'EV1',
    event_type: 'user.login',
    outcome: 'failed',
    subject: { subject_id: '01HSUB', email: 'user@example.gov' },
    client_id: 'portal',
    session_id: 'sess_1',
    request: { ip_address: '203.0.113.9', user_agent: 'UA', request_id: 'req_1' },
    error_code: 'invalid_credentials',
    context: { mfa: 'totp' },
    occurred_at: '2026-06-28T14:32:15+00:00',
    ...over,
  }
}

const eventsRef = ref<readonly AuthAuditEvent[] | null>([event()])
const viewStateRef = ref<'loading' | 'unauthenticated' | 'forbidden' | 'error' | 'empty' | 'ready'>('ready')
const hasMoreRef = ref(false)
const searchMock = vi.fn<(f: unknown) => Promise<void>>(async () => {})
const loadMoreMock = vi.fn<() => Promise<void>>(async () => {})
const refreshMock = vi.fn<() => Promise<void>>(async () => {})

vi.mock('@/composables/useAuthAuditEvents', () => ({
  useAuthAuditEvents: () => ({
    events: computed(() => eventsRef.value),
    viewState: computed(() => viewStateRef.value),
    isStale: computed(() => false),
    requestId: computed(() => null),
    pending: ref(false),
    hasMore: computed(() => hasMoreRef.value),
    search: searchMock,
    loadMore: loadMoreMock,
    refresh: refreshMock,
  }),
}))
vi.mock('@/stores/session.store', () => ({
  useSessionStore: () => ({
    principal: { display_name: 'Admin', subject_id: 'a1' },
    ensureSession: vi.fn<() => Promise<string>>(async () => 'authenticated'),
    hasPermission: () => true,
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
      return params
        ? val.replace(/\{(\w+)\}/gu, (_: string, k: string) => String(params[k] ?? ''))
        : val
    },
  }),
}))
mockNuxtImport('navigateTo', () => vi.fn<(...a: unknown[]) => Promise<void>>(async () => {}))
mockNuxtImport('useRoute', () => () => ({ query: {} }))
const Page = (await import('../authentication-audit.vue')).default

beforeEach(() => {
  eventsRef.value = [event()]
  viewStateRef.value = 'ready'
  hasMoreRef.value = false
})
afterEach(() => vi.clearAllMocks())

describe('authentication-audit page — read surface', () => {
  it('renders the table + event through the admin shell', async () => {
    const w = await mountSuspended(Page)
    expect(w.find('[data-page="authentication-audit"]').exists()).toBe(true)
    expect(w.find('[data-testid="auth-audit-select-EV1"]').exists()).toBe(true)
    expect(w.text()).toContain('user@example.gov')
  })

  it('opens the detail drawer on select and shows ip + redacted-aware context', async () => {
    const w = await mountSuspended(Page)
    await w.find('[data-testid="auth-audit-select-EV1"]').trigger('click')
    await flushPromises()
    const drawer = w.find('[data-testid="auth-audit-detail"]')
    expect(drawer.exists()).toBe(true)
    expect(drawer.text()).toContain('203.0.113.9')
    expect(drawer.text()).toContain('invalid_credentials')
  })

  it('renders the empty state when there are no events', async () => {
    eventsRef.value = []
    viewStateRef.value = 'empty'
    const w = await mountSuspended(Page)
    expect(w.text()).toContain(enLocale.auth_audit.empty_title)
  })

  it('renders the forbidden surface', async () => {
    eventsRef.value = null
    viewStateRef.value = 'forbidden'
    const w = await mountSuspended(Page)
    expect(w.text()).toContain(enLocale.auth_audit.forbidden_title)
  })

  it('shows the load-more button only when hasMore', async () => {
    hasMoreRef.value = true
    const w = await mountSuspended(Page)
    expect(w.find('[data-testid="auth-audit-load-more"]').exists()).toBe(true)
    hasMoreRef.value = false
    const w2 = await mountSuspended(Page)
    expect(w2.find('[data-testid="auth-audit-load-more"]').exists()).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run app/pages/__tests__/authentication-audit.page.nuxt.spec.ts`
Expected: FAIL — the stub renders nothing.

- [ ] **Step 3: Replace the `auth_audit` locale block (both files)**

Replace the existing `"auth_audit": { … }` block in `app/locales/en.json` with:

```json
  "auth_audit": {
    "eyebrow": "Security",
    "title": "Authentication Audit",
    "summary": "Authentication event history: login, logout, consent, MFA challenge, and authentication errors. Unlike the Audit Trail (admin actions), this records user authentication activity.",
    "signed_in_as": "Signed in as {name}",
    "filter_title": "Filter events",
    "filter_outcome": "Outcome",
    "filter_event_type": "Event type",
    "filter_subject_id": "Account code",
    "filter_from": "From",
    "filter_to": "To",
    "outcome_all": "All outcomes",
    "outcome_succeeded": "Succeeded",
    "outcome_failed": "Failed",
    "outcome_started": "Started",
    "btn_filter": "Filter",
    "btn_reset": "Reset",
    "btn_load_more": "Load more",
    "table_caption": "Authentication event table",
    "col_occurred_at": "Occurred at",
    "col_type": "Type",
    "col_outcome": "Outcome",
    "col_subject": "Subject",
    "col_ip_address": "IP address",
    "ov_email": "Email",
    "ov_subject_id": "Account code",
    "ov_client_id": "Application",
    "ov_session_id": "Session code",
    "ov_ip_address": "IP address",
    "ov_user_agent": "User agent",
    "ov_request_id": "Request code",
    "ov_error_code": "Error code",
    "ov_occurred_at": "Occurred at",
    "ov_context": "Context",
    "ov_context_empty": "No context recorded",
    "empty_title": "No authentication events yet",
    "empty_description": "Adjust the filters above or wait for authentication events to be recorded.",
    "loading": "Loading authentication audit",
    "forbidden_title": "Access denied",
    "session_expired_title": "Admin session expired",
    "session_expired_desc": "Sign in again from the portal to continue.",
    "error_loading_title": "Authentication audit could not be loaded",
    "error_loading_desc": "Reload, or use the request ID for investigation."
  },
```

Replace the existing `"auth_audit": { … }` block in `app/locales/id.json` with:

```json
  "auth_audit": {
    "eyebrow": "Keamanan",
    "title": "Authentication Audit",
    "summary": "Riwayat event autentikasi: login, logout, consent, MFA challenge, dan error autentikasi. Berbeda dari Audit Trail (aksi admin), halaman ini mencatat aktivitas autentikasi pengguna.",
    "signed_in_as": "Masuk sebagai {name}",
    "filter_title": "Filter event",
    "filter_outcome": "Outcome",
    "filter_event_type": "Tipe event",
    "filter_subject_id": "Kode akun",
    "filter_from": "Dari",
    "filter_to": "Sampai",
    "outcome_all": "Semua outcome",
    "outcome_succeeded": "Berhasil",
    "outcome_failed": "Gagal",
    "outcome_started": "Dimulai",
    "btn_filter": "Filter",
    "btn_reset": "Reset",
    "btn_load_more": "Muat lagi",
    "table_caption": "Tabel event autentikasi",
    "col_occurred_at": "Terjadi pada",
    "col_type": "Tipe",
    "col_outcome": "Outcome",
    "col_subject": "Subjek",
    "col_ip_address": "Alamat IP",
    "ov_email": "Email",
    "ov_subject_id": "Kode akun",
    "ov_client_id": "Aplikasi",
    "ov_session_id": "Kode sesi",
    "ov_ip_address": "Alamat IP",
    "ov_user_agent": "User agent",
    "ov_request_id": "Kode request",
    "ov_error_code": "Kode error",
    "ov_occurred_at": "Terjadi pada",
    "ov_context": "Context",
    "ov_context_empty": "Tidak ada context",
    "empty_title": "Belum ada event autentikasi",
    "empty_description": "Sesuaikan filter di atas atau tunggu event autentikasi terekam.",
    "loading": "Memuat authentication audit",
    "forbidden_title": "Akses ditolak",
    "session_expired_title": "Sesi admin berakhir",
    "session_expired_desc": "Login lagi dari portal untuk melanjutkan.",
    "error_loading_title": "Authentication audit belum bisa dimuat",
    "error_loading_desc": "Muat ulang, atau gunakan request ID untuk investigasi."
  },
```

- [ ] **Step 4: Write the page**

```vue
<!-- app/pages/authentication-audit.vue -->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useSessionStore } from '@/stores/session.store'
import { useI18n } from '@/composables/useI18n'
import { useAuthAuditEvents } from '@/composables/useAuthAuditEvents'
import { resolveOutcomeTone } from '@/lib/auth-audit/auth-audit-view-state'
import AuthAuditTable from '@/components/auth-audit/AuthAuditTable.vue'
import AuthAuditFilterBar, {
  type AuthAuditFilterLabels,
} from '@/components/auth-audit/AuthAuditFilterBar.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import UiFolio from '@/components/ui/UiFolio.vue'
import UiDetailDrawer from '@/components/ui/UiDetailDrawer.vue'
import type { AuthAuditEvent, AuthAuditFilters } from '@/types/auth-audit.types'

definePageMeta({
  name: 'admin.authentication-audit',
  layout: 'admin',
  requiresAdmin: true,
  permissions: ['admin.authentication-audit.read'],
})

const { t } = useI18n()
const store = useSessionStore()
const route = useRoute()

await useAsyncData('admin-authentication-audit-principal', () => store.ensureSession())

// A client_id deep-link (the clients-detail consent-trail link → this page) seeds
// the SSR first page pre-filtered to that client. The filter bar has no client_id
// field; Reset/Filter then take over with the bar's draft.
const clientIdQuery = typeof route.query.clientId === 'string' ? route.query.clientId : undefined

const { events, viewState, requestId, isStale, hasMore, search, loadMore, refresh } =
  useAuthAuditEvents(clientIdQuery ? { client_id: clientIdQuery } : {})

const eventList = computed<readonly AuthAuditEvent[]>(() => events.value ?? [])

const selectedId = ref<string | null>(null)
const selectedEvent = computed<AuthAuditEvent | null>(
  () => eventList.value.find((e) => e.event_id === selectedId.value) ?? null,
)

const outcomeText = (outcome: string): string => t(`auth_audit.outcome_${outcome}`)

const filterLabels = computed<AuthAuditFilterLabels>(() => ({
  title: t('auth_audit.filter_title'),
  outcome: t('auth_audit.filter_outcome'),
  outcomeAll: t('auth_audit.outcome_all'),
  outcomeSucceeded: t('auth_audit.outcome_succeeded'),
  outcomeFailed: t('auth_audit.outcome_failed'),
  outcomeStarted: t('auth_audit.outcome_started'),
  eventType: t('auth_audit.filter_event_type'),
  subjectId: t('auth_audit.filter_subject_id'),
  from: t('auth_audit.filter_from'),
  to: t('auth_audit.filter_to'),
  filter: t('auth_audit.btn_filter'),
  reset: t('auth_audit.btn_reset'),
}))

const contextEntries = computed<readonly [string, string][]>(() => {
  const ctx = selectedEvent.value?.context
  if (!ctx) return []
  return Object.entries(ctx).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)])
})

function onSelect(eventId: string): void {
  selectedId.value = eventId
}
function onCloseDrawer(): void {
  selectedId.value = null
}
async function onSearch(filters: AuthAuditFilters): Promise<void> {
  selectedId.value = null
  await search(filters)
}
async function onReset(): Promise<void> {
  selectedId.value = null
  await search({})
}
async function onLoadMore(): Promise<void> {
  await loadMore()
}
async function onRefresh(): Promise<void> {
  await refresh()
}
</script>

<template>
  <section class="auth-audit" data-page="authentication-audit" data-admin-shell>
    <header class="auth-audit__hero">
      <span class="auth-audit__eyebrow">{{ t('auth_audit.eyebrow') }}</span>
      <h1 class="auth-audit__title">{{ t('auth_audit.title') }}</h1>
      <p class="auth-audit__summary">{{ t('auth_audit.summary') }}</p>
      <p class="auth-audit__principal" data-principal-name>
        {{ t('auth_audit.signed_in_as', { name: store.principal?.display_name ?? '—' }) }}
      </p>
    </header>

    <AuthAuditFilterBar :labels="filterLabels" @search="onSearch" @reset="onReset" />

    <UiSkeleton v-if="viewState === 'loading'" :rows="6" :label="t('auth_audit.loading')" />

    <UiStatusView
      v-else-if="viewState === 'forbidden'"
      tone="forbidden"
      :eyebrow="t('auth_audit.eyebrow')"
      :title="t('auth_audit.forbidden_title')"
      :description="t('common.forbidden_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="viewState === 'unauthenticated'"
      tone="step_up"
      :eyebrow="t('auth_audit.eyebrow')"
      :title="t('auth_audit.session_expired_title')"
      :description="t('auth_audit.session_expired_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="viewState === 'error'"
      tone="error"
      :eyebrow="t('auth_audit.eyebrow')"
      :title="t('auth_audit.error_loading_title')"
      :description="t('auth_audit.error_loading_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    >
      <template #actions>
        <UiButton variant="secondary" size="sm" data-testid="auth-audit-refresh" @click="onRefresh">
          {{ t('common.btn_refresh') }}
        </UiButton>
      </template>
    </UiStatusView>

    <UiEmptyState
      v-else-if="viewState === 'empty'"
      :title="t('auth_audit.empty_title')"
      :description="t('auth_audit.empty_description')"
    />

    <template v-else>
      <div v-if="isStale" class="auth-audit__banner" role="status">
        {{ t('auth_audit.error_loading_desc') }}
      </div>

      <AuthAuditTable
        :events="eventList"
        :caption="t('auth_audit.table_caption')"
        :occurred-label="t('auth_audit.col_occurred_at')"
        :type-label="t('auth_audit.col_type')"
        :outcome-label="t('auth_audit.col_outcome')"
        :subject-label="t('auth_audit.col_subject')"
        :ip-label="t('auth_audit.col_ip_address')"
        :outcome-text="outcomeText"
        @select="onSelect"
      />

      <div v-if="hasMore" class="auth-audit__more">
        <UiButton variant="secondary" size="sm" data-testid="auth-audit-load-more" @click="onLoadMore">
          {{ t('auth_audit.btn_load_more') }}
        </UiButton>
      </div>

      <UiDetailDrawer
        v-if="selectedEvent"
        :open="selectedEvent !== null"
        title-id="auth-audit-detail-drawer"
        :title="selectedEvent.event_type"
        :description="selectedEvent.event_id"
        :close-label="t('common.close')"
        @close="onCloseDrawer"
      >
        <div class="auth-audit-detail" data-testid="auth-audit-detail">
          <div class="auth-audit-detail__head">
            <UiStatusBadge
              :tone="resolveOutcomeTone(selectedEvent.outcome)"
              :label="outcomeText(selectedEvent.outcome)"
            />
          </div>
          <dl class="auth-audit-detail__grid">
            <div>
              <dt>{{ t('auth_audit.ov_email') }}</dt>
              <dd>{{ selectedEvent.subject.email ?? '—' }}</dd>
            </div>
            <div>
              <dt>{{ t('auth_audit.ov_subject_id') }}</dt>
              <dd><UiFolio :value="selectedEvent.subject.subject_id ?? '—'" variant="id" /></dd>
            </div>
            <div>
              <dt>{{ t('auth_audit.ov_client_id') }}</dt>
              <dd>{{ selectedEvent.client_id ?? '—' }}</dd>
            </div>
            <div>
              <dt>{{ t('auth_audit.ov_session_id') }}</dt>
              <dd><UiFolio :value="selectedEvent.session_id ?? '—'" variant="id" /></dd>
            </div>
            <div>
              <dt>{{ t('auth_audit.ov_ip_address') }}</dt>
              <dd>{{ selectedEvent.request.ip_address ?? '—' }}</dd>
            </div>
            <div>
              <dt>{{ t('auth_audit.ov_request_id') }}</dt>
              <dd><UiFolio :value="selectedEvent.request.request_id ?? '—'" variant="id" /></dd>
            </div>
            <div class="auth-audit-detail__wide">
              <dt>{{ t('auth_audit.ov_user_agent') }}</dt>
              <dd>{{ selectedEvent.request.user_agent ?? '—' }}</dd>
            </div>
            <div>
              <dt>{{ t('auth_audit.ov_error_code') }}</dt>
              <dd>{{ selectedEvent.error_code ?? '—' }}</dd>
            </div>
            <div>
              <dt>{{ t('auth_audit.ov_occurred_at') }}</dt>
              <dd>
                <UiFolio
                  v-if="selectedEvent.occurred_at"
                  :value="selectedEvent.occurred_at"
                  variant="timestamp"
                />
                <span v-else>—</span>
              </dd>
            </div>
            <div class="auth-audit-detail__wide">
              <dt>{{ t('auth_audit.ov_context') }}</dt>
              <dd>
                <dl v-if="contextEntries.length" class="auth-audit-detail__context">
                  <div v-for="[key, value] in contextEntries" :key="key">
                    <dt>{{ key }}</dt>
                    <dd>{{ value }}</dd>
                  </div>
                </dl>
                <span v-else>{{ t('auth_audit.ov_context_empty') }}</span>
              </dd>
            </div>
          </dl>
        </div>
      </UiDetailDrawer>
    </template>
  </section>
</template>

<style scoped>
.auth-audit {
  display: grid;
  gap: 24px;
  padding: 24px;
}
.auth-audit__hero {
  display: grid;
  gap: 6px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border);
}
.auth-audit__eyebrow {
  font: 600 0.6875rem/1 var(--font-sans);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.auth-audit__title {
  margin: 0;
  font: 600 1.5rem/1.2 var(--font-sans);
  letter-spacing: -0.02em;
  color: var(--fg);
}
.auth-audit__summary,
.auth-audit__principal {
  margin: 0;
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--fg-2);
}
.auth-audit__banner {
  padding: 10px 14px;
  font: 500 0.8125rem/1.4 var(--font-sans);
  color: var(--warning-soft-fg);
  background: var(--warning-soft);
  border: 1px solid var(--warning-soft-fg);
}
.auth-audit__more {
  display: flex;
  justify-content: center;
}
.auth-audit-detail {
  display: grid;
  gap: 16px;
}
.auth-audit-detail__head {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.auth-audit-detail__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 16px;
  margin: 0;
}
.auth-audit-detail__wide {
  grid-column: 1 / -1;
}
.auth-audit-detail__grid > div > dt {
  font: 600 0.625rem/1.2 var(--font-sans);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.auth-audit-detail__grid > div > dd {
  margin: 2px 0 0;
  font: 400 0.8125rem/1.4 var(--font-sans);
  color: var(--fg);
  overflow-wrap: anywhere;
}
.auth-audit-detail__context {
  margin: 0;
  display: grid;
  gap: 6px;
}
.auth-audit-detail__context > div {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
  gap: 8px;
}
.auth-audit-detail__context dt {
  font: 600 0.6875rem/1.3 var(--font-mono, monospace);
  color: var(--fg-2);
}
.auth-audit-detail__context dd {
  margin: 0;
  font: 400 0.75rem/1.4 var(--font-mono, monospace);
  color: var(--fg);
  overflow-wrap: anywhere;
}
</style>
```

- [ ] **Step 5: Run the page test + route-map + parity**

Run: `./node_modules/.bin/vitest run app/pages/__tests__/authentication-audit.page.nuxt.spec.ts app/pages/__tests__/route-map.spec.ts`
Expected: PASS (page 5 tests + route-map green).

Run the parity check:
```bash
node -e "const e=require('./app/locales/en.json'),i=require('./app/locales/id.json');const f=(o,p='')=>Object.entries(o).flatMap(([k,v])=>typeof v==='object'&&v?f(v,p+k+'.'):[p+k]);const ek=f(e).sort(),ik=f(i).sort();const d=ek.filter(k=>!ik.includes(k)).concat(ik.filter(k=>!ek.includes(k)));console.log('parity diff:',d); if(d.length)process.exit(1)"
```
Expected: `parity diff: []`.

Verify no dead `auth_audit.*` key (every key referenced by the page/components/locale):
```bash
node -e "const e=require('./app/locales/en.json');const keys=Object.keys(e.auth_audit);const fs=require('fs');const src=['app/pages/authentication-audit.vue','app/components/auth-audit/AuthAuditTable.vue','app/components/auth-audit/AuthAuditFilterBar.vue'].map(p=>fs.readFileSync(p,'utf8')).join('\n');const dead=keys.filter(k=>!src.includes('auth_audit.'+k)&&!src.includes('outcome_'+'')&&!src.includes(\`\${k}\`));console.log('check these (some are built dynamically e.g. outcome_*):',dead)"
```
Expected: the only "unreferenced" hits are the dynamic `outcome_succeeded`/`outcome_failed`/`outcome_started` (built via `auth_audit.outcome_${outcome}`) — those ARE used. Confirm no other key is dead.

- [ ] **Step 6: Verify gates + commit**

Run: `./node_modules/.bin/oxlint . && ./node_modules/.bin/eslint app/pages/authentication-audit.vue && npx vue-tsc --noEmit`

```bash
git add app/pages/authentication-audit.vue app/locales/en.json app/locales/id.json app/pages/__tests__/authentication-audit.page.nuxt.spec.ts
git commit -m "$(cat <<'EOF'
feat(sso-admin-frontend): Swiss authentication-audit page (states + table + detail drawer)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 13.8: Filter search + cursor load-more wiring

**Files:**
- Modify: `app/pages/authentication-audit.vue` (handlers already present from 13.7 — add focused tests proving they drive the composable)
- Test: `app/pages/__tests__/authentication-audit-filter.page.nuxt.spec.ts`

**Interfaces:** Consumes the 13.7 page + the `useAuthAuditEvents` mock (`search`/`loadMore`). This task proves the filter-bar `@search`/`@reset` and the load-more button call the composable with the right arguments; if any handler was left unwired in 13.7, wire it now (the 13.7 page above already wires all three).

- [ ] **Step 1: Write the failing test**

```ts
// app/pages/__tests__/authentication-audit-filter.page.nuxt.spec.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import enLocale from '@/locales/en.json'
import type { AuthAuditEvent } from '@/types/auth-audit.types'

function event(): AuthAuditEvent {
  return {
    event_id: 'EV1',
    event_type: 'user.login',
    outcome: 'succeeded',
    subject: { subject_id: '01HSUB', email: 'user@example.gov' },
    client_id: 'portal',
    session_id: 'sess_1',
    request: { ip_address: '203.0.113.9', user_agent: 'UA', request_id: 'req_1' },
    error_code: null,
    context: {},
    occurred_at: '2026-06-28T14:32:15+00:00',
  }
}

const eventsRef = ref<readonly AuthAuditEvent[] | null>([event()])
const hasMoreRef = ref(true)
const searchMock = vi.fn<(f: unknown) => Promise<void>>(async () => {})
const loadMoreMock = vi.fn<() => Promise<void>>(async () => {})

vi.mock('@/composables/useAuthAuditEvents', () => ({
  useAuthAuditEvents: () => ({
    events: computed(() => eventsRef.value),
    viewState: computed(() => 'ready' as const),
    isStale: computed(() => false),
    requestId: computed(() => null),
    pending: ref(false),
    hasMore: computed(() => hasMoreRef.value),
    search: searchMock,
    loadMore: loadMoreMock,
    refresh: vi.fn<() => Promise<void>>(async () => {}),
  }),
}))
vi.mock('@/stores/session.store', () => ({
  useSessionStore: () => ({
    principal: { display_name: 'Admin', subject_id: 'a1' },
    ensureSession: vi.fn<() => Promise<string>>(async () => 'authenticated'),
    hasPermission: () => true,
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
      return params
        ? val.replace(/\{(\w+)\}/gu, (_: string, k: string) => String(params[k] ?? ''))
        : val
    },
  }),
}))
mockNuxtImport('navigateTo', () => vi.fn<(...a: unknown[]) => Promise<void>>(async () => {}))
mockNuxtImport('useRoute', () => () => ({ query: {} }))
const Page = (await import('../authentication-audit.vue')).default

beforeEach(() => {
  eventsRef.value = [event()]
  hasMoreRef.value = true
})
afterEach(() => vi.clearAllMocks())

describe('authentication-audit page — filter + load-more wiring', () => {
  it('drives the composable search with the entered filters', async () => {
    const w = await mountSuspended(Page)
    await w.find('[data-testid="auth-audit-filter-event-type"]').setValue('user.logout')
    await w.find('[data-testid="auth-audit-filter-form"]').trigger('submit')
    await flushPromises()
    const arg = searchMock.mock.calls[0]?.[0] as Record<string, unknown>
    expect(arg.event_type).toBe('user.logout')
  })

  it('reset drives an empty search', async () => {
    const w = await mountSuspended(Page)
    await w.find('[data-testid="auth-audit-filter-reset"]').trigger('click')
    await flushPromises()
    expect(searchMock).toHaveBeenCalledWith({})
  })

  it('load-more calls the composable loadMore', async () => {
    const w = await mountSuspended(Page)
    await w.find('[data-testid="auth-audit-load-more"]').trigger('click')
    await flushPromises()
    expect(loadMoreMock).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails (or passes if 13.7 already wired all handlers)**

Run: `./node_modules/.bin/vitest run app/pages/__tests__/authentication-audit-filter.page.nuxt.spec.ts`
Expected: PASS if 13.7's page wired `@search`/`@reset`/`@click` (it does). If a handler is missing, add it to `app/pages/authentication-audit.vue` (mirror the 13.7 `onSearch`/`onReset`/`onLoadMore` handlers) until green. This task's deliverable is the proven wiring + its regression tests.

- [ ] **Step 3: (only if a handler was missing) wire it**

The 13.7 page already contains:
```ts
async function onSearch(filters: AuthAuditFilters): Promise<void> { selectedId.value = null; await search(filters) }
async function onReset(): Promise<void> { selectedId.value = null; await search({}) }
async function onLoadMore(): Promise<void> { await loadMore() }
```
and the template binds `@search="onSearch" @reset="onReset"` on `AuthAuditFilterBar` and `@click="onLoadMore"` on the load-more button. No change needed.

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run app/pages/__tests__/authentication-audit-filter.page.nuxt.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Verify gates + commit**

Run: `./node_modules/.bin/oxlint . && ./node_modules/.bin/eslint app/pages/authentication-audit.vue && npx vue-tsc --noEmit`

```bash
git add app/pages/authentication-audit.vue app/pages/__tests__/authentication-audit-filter.page.nuxt.spec.ts
git commit -m "$(cat <<'EOF'
test(sso-admin-frontend): authentication-audit filter search + cursor load-more wiring

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 13.9: SSR leak gate + me.get permission + deferred e2e + DoD

**Files:**
- Create: `test/fixtures/ssr-leak/server/routes/api/admin/audit/authentication-events/index.get.ts`
- Modify: `test/fixtures/ssr-leak/server/routes/api/admin/me.get.ts` (grant `admin.authentication-audit.read`)
- Modify: `test/ssr-token-leak.gate.spec.ts`
- Create: `e2e/authentication-audit.spec.ts` (authored, DEFERRED — not run this phase)

**Interfaces:**
- Consumes the gate's existing `collectSecretLeaks`/`collectPiiShapeLeaks`/`extractPayload` helpers + the `$fetch`/`setup` harness.
- STRICT (no `allowSessionId`). The audit DTO carries email (allowed), ip, opaque ids, redacted context — no token/secret/gov-PII. The audit record's own `session_id` is a distinct operational handle (NOT `SENTINEL.sid`, the admin's OIDC session id which the gate keeps strictly absent).

- [ ] **Step 1: Grant the permission in the me.get fixture**

In `test/fixtures/ssr-leak/server/routes/api/admin/me.get.ts`, add `'admin.authentication-audit.read'` to the `permissions` array AND `'admin.authentication-audit.read': true` to the `capabilities` object (mirror how `admin.observability.read` is granted in that file). Do not touch other entries.

- [ ] **Step 2: Write the fixture route**

```ts
// test/fixtures/ssr-leak/server/routes/api/admin/audit/authentication-events/index.get.ts
// SSR token-leak fixture: a representative masked authentication-event list so the
// §3.3 gate renders the page READY. Operational fields only — email is the allowed
// display field; ip is dotted; subject_id/session_id/request_id are opaque; context
// is backend-redacted. No token, secret, or PII-shaped digit run (no 10/16/18-digit
// contiguous run). The session_id here is the AUDITED session's handle, distinct
// from the admin's OIDC sid (which the gate keeps strictly absent).
import { defineEventHandler } from 'h3'

export default defineEventHandler(() => ({
  events: [
    {
      event_id: '01JAUTHEVENTONE',
      event_type: 'user.login',
      outcome: 'failed',
      subject: { subject_id: '01HZX9C7K3Q8VMETBD9R2F4K7N', email: 'operator@dev-sso.local' },
      client_id: 'portal',
      session_id: 'sess_audit_handle_01',
      request: {
        ip_address: '203.0.113.42',
        user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)',
        request_id: 'req_audit_01',
      },
      error_code: 'invalid_credentials',
      context: { mfa: 'totp', authorization: '[redacted]' },
      occurred_at: '2026-06-28T14:32:15+00:00',
    },
    {
      event_id: '01JAUTHEVENTTWO',
      event_type: 'user.consent',
      outcome: 'succeeded',
      subject: { subject_id: '01HZX9C7K3Q8VMETBD9R2F4K8P', email: 'analyst@dev-sso.local' },
      client_id: 'console',
      session_id: 'sess_audit_handle_02',
      request: {
        ip_address: '198.51.100.7',
        user_agent: 'Mozilla/5.0 (X11; Linux x86_64)',
        request_id: 'req_audit_02',
      },
      error_code: null,
      context: {},
      occurred_at: '2026-06-28T15:00:00+00:00',
    },
  ],
  pagination: { per_page: 50, next_cursor: null, previous_cursor: null, has_more: false },
}))
```

- [ ] **Step 3: Add the gate fetch helper + assertions**

In `test/ssr-token-leak.gate.spec.ts`, add a `fetchAuthAudit` helper next to `fetchIpAccess`:

```ts
function fetchAuthAudit(): Promise<string> {
  // admin_locale=en so the outcome badge renders the English label.
  return $fetch('/authentication-audit', { headers: { cookie: 'admin_locale=en' } })
}
```

Then add these three `it` blocks inside the `describe`, immediately before the `collectSecretLeaks is LIVE` negative-control test:

```ts
  it('renders the authentication-audit list server-side in its ready state', async () => {
    const html = await fetchAuthAudit()
    expect(html).toContain('data-admin-shell')
    expect(html).toContain('data-page="authentication-audit"')
    // an event type + the (allowed) email render; outcome shown as a label, never colour-alone
    expect(html).toContain('user.login')
    expect(html).toContain('operator@dev-sso.local')
    expect(html).toContain('Failed')
  })

  it('does not leak token/secret/PII values into the authentication-audit SSR HTML', async () => {
    // Strict — the audit DTO carries email (allowed), ip, opaque ids, and a
    // backend-redacted context; no token, secret, OIDC sid, or gov-PII. NO allowSessionId.
    const html = await fetchAuthAudit()
    expect(collectSecretLeaks(html, 'authentication-audit SSR HTML')).toEqual([])
  })

  it('does not leak token/secret/PII values into the authentication-audit hydration payload', async () => {
    const html = await fetchAuthAudit()
    const serialized = JSON.stringify(JSON.parse(extractPayload(html)))
    expect(collectSecretLeaks(serialized, 'authentication-audit __NUXT__ payload')).toEqual([])
    expect(collectPiiShapeLeaks(serialized, 'authentication-audit __NUXT__ payload')).toEqual([])
  })
```

- [ ] **Step 4: Write the deferred e2e spec**

```ts
// e2e/authentication-audit.spec.ts
import { test, expect } from '@playwright/test'

// DEFERRED to Phase 18 cutover: playwright.config.ts is still legacy-SPA-wired
// (ports 5173/4173, no Nuxt build:web; Nuxt serves on 3000). Authored now against
// the shipped Nuxt routes so it becomes a real gate at cutover. Do NOT run as a
// gate this phase.
test('authentication-audit page lists events, filters, and opens a detail drawer', async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: 'admin_locale', value: 'en', url: 'http://localhost:3000' },
  ])
  await page.goto('/authentication-audit')

  await expect(page.getByTestId('auth-audit-filter-form')).toBeVisible()
  const firstRow = page.locator('[data-testid^="auth-audit-select-"]').first()
  await expect(firstRow).toBeVisible()
  await firstRow.click()
  await expect(page.getByTestId('auth-audit-detail')).toBeVisible()
})
```

- [ ] **Step 5: Run the leak gate**

`test/globalSetup.ts` rebuilds the `ssr-leak` fixture layer on every fresh `vitest run`, so the new route + me.get grant are picked up automatically:

```bash
./node_modules/.bin/vitest run test/ssr-token-leak.gate.spec.ts
```
Expected: PASS — all prior gate tests + the 3 new authentication-audit tests + the live negative control.

> Recovery note: if the gate fails with "no `__NUXT_DATA__`", a stale render, or the new route missing, a prior interrupted run may have left the build lock behind. Clear both lock and output, then re-run:
> ```bash
> rm -rf node_modules/.cache/sso-admin-e2e-build test/fixtures/ssr-leak/.output
> ./node_modules/.bin/vitest run test/ssr-token-leak.gate.spec.ts
> ```

- [ ] **Step 6: Full DoD gate**

```bash
./node_modules/.bin/oxlint .
./node_modules/.bin/eslint app/pages/authentication-audit.vue app/components/auth-audit/AuthAuditTable.vue app/components/auth-audit/AuthAuditFilterBar.vue
npx vue-tsc --noEmit
./node_modules/.bin/vitest run
npm run build
```
Expected: oxlint 0/0, eslint 0, typecheck 0, **full suite green**, build PASS, SSR leak gate green (now includes authentication-audit).

- [ ] **Step 7: Commit**

```bash
git add test/fixtures/ssr-leak/server/routes/api/admin/audit/authentication-events e2e/authentication-audit.spec.ts test/ssr-token-leak.gate.spec.ts test/fixtures/ssr-leak/server/routes/api/admin/me.get.ts
git commit -m "$(cat <<'EOF'
test(sso-admin-frontend): STRICT authentication-audit SSR leak gate + me.get grant + deferred e2e

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**1. Spec coverage** (`/authentication-audit` → `pages/authentication-audit.vue` → `admin.authentication-audit.read`, spec line 124; "authentication event history: login/logout/consent/MFA/auth-errors"):
- List of authentication events → 13.1 (DTO), 13.3 (api), 13.4 (composable), 13.5 (table), 13.7 (page). ✅
- Filters (outcome/event-type/subject/date) → 13.2 (query), 13.6 (filter bar), 13.8 (wiring). ✅
- Cursor pagination (load more) → 13.4 (composable loadMore), 13.7/13.8 (button + wiring). ✅
- Per-event detail → 13.7 (drawer from the complete row; show endpoint intentionally unused). ✅
- `admin.authentication-audit.read` + `name: admin.authentication-audit` preserved (route-map green). ✅
- STRICT SSR leak gate → 13.9. ✅

**2. Placeholder scan:** No `TBD`/`add appropriate`/`similar to`/`write tests for the above` — every step carries full code. ✅

**3. Type consistency:** `AuthAuditEvent`/`AuthAuditSubject`/`AuthAuditRequest`/`AuthAuditPagination`/`AuthAuditFilters`/`AuthAuditListResponse` defined in 13.1, consumed identically in 13.3/13.4/13.5/13.7. `AuthAuditViewState` (6 states) consistent across 13.1/13.4. `resolveOutcomeTone` defined in 13.1, used in 13.5/13.7. `buildAuthAuditQuery`/`DEFAULT_AUTH_AUDIT_LIMIT` defined in 13.2, used in 13.3/13.4. `authAuditApi.listEvents` signature identical in 13.3/13.4. `useAuthAuditEvents` return shape (events/viewState/isStale/requestId/pending/hasMore/search/loadMore/refresh) defined in 13.4, consumed in 13.7/13.8. `AuthAuditFilterLabels` defined in 13.6, consumed in 13.7. Locale keys referenced by the page (`auth_audit.*` incl. dynamic `outcome_${outcome}`, `common.forbidden_desc`/`btn_refresh`/`close`) all exist after the 13.7 block replacement. ✅

**Security invariants checklist (verify during execution):**
- Page renders **zero** `error.message` (error view uses only static `auth_audit.error_loading_*` + REF). ✅ by construction.
- Email rendered verbatim (allowed §3.3); NIK/NIP/NISN/birth_date never present in this DTO. ✅
- `context` rendered as backend-redacted key/values (frontend trusts the backend masking boundary). ✅
- STRICT leak gate (no `allowSessionId`): the admin's OIDC `sid` stays strictly absent; the audit record's own `session_id` is a distinct operational value that renders freely. Fixture has no 10/16/18-digit run (ULIDs/ips/timestamps only). ✅
- **No destructive affordance** → zero `#E4002B` accent; `failed` outcome uses `danger` *tone* on a status badge (shipped `resolveHealthTone` precedent). ✅
- No proxy change; `show`-by-id endpoint intentionally unused (rows complete). me.get grants the read permission. ✅
