# Phase 3 — Dashboard (FR-050 / UC-52) Implementation Plan

**For agentic workers — REQUIRED SUB-SKILL:** Execute this plan with `superpowers:executing-plans`, and for **every** task below invoke `superpowers:test-driven-development` (RED → GREEN → REFACTOR). Never write implementation code before a failing test exists; never claim PASS without running the exact command and reading its output (`superpowers:verification-before-completion`).

## Goal

Port the admin **Dashboard** governance domain to the Nuxt 4 (full SSR) + Swiss stack on branch `feat/admin-frontend-nuxt4-ssr-swiss-redesign`. The page is the read-only control-plane cockpit: it renders the masked summary counters (users, sessions, clients, audit, incidents, data-subject-requests) returned by `GET /admin/api/dashboard/summary`, behind `admin.dashboard.view`. It must implement all five per-page states (loading · empty · error · forbidden · success), distinguish "no data" from "no permission", surface a safe request/correlation reference on error, and never leak a token, secret, or raw PII into the SSR HTML or the `__NUXT__` hydration payload.

This builds **on** the existing `app/pages/dashboard.vue` (keeps its `definePageMeta` name `admin.dashboard`, `layout: 'admin'`, `requiresAdmin: true`, `permissions: ['admin.dashboard.view']`, and the safe principal hydration via `useAsyncData('admin-dashboard-principal', …)`). The summary is fetched the same safe way: through a typed **service** (no direct `fetch`/`$fetch` in the page) wrapped in `useAsyncData` so it resolves server-side and hydrates as a masked DTO only.

## Architecture

Request/data flow (all server-side during SSR, re-used on client navigation):

```
pages/dashboard.vue
  ├─ useAsyncData('admin-dashboard-principal', () => sessionStore.ensureSession())   // existing — masked principal
  └─ useDashboardSummary()                                                           // NEW composable (SSR data boundary)
        └─ useAsyncData('admin-dashboard-summary', () => dashboardApi.getSummary())
              └─ dashboardApi.getSummary()                                           // app/services/dashboard.api.ts
                    └─ apiClient.get('/api/admin/dashboard/summary')                 // same-origin, credentials:'include'
                          └─ Nitro: server/routes/api/admin/[...].ts
                                └─ handleAdminApiProxy: inject Bearer from event.context,
                                   rewrite /api/admin/* → /admin/api/* → backend
```

- **Pure state logic** lives in `app/lib/dashboard/dashboard-view-state.ts` (`resolveDashboardViewState`, `isDashboardEmpty`, `resolveCounterTone`, `isDashboardStale`) — mirrors the existing `admin-guard-resolver.ts` (pure) + `admin-guard.global.ts` (glue) split so most logic is unit-testable without a Nuxt context.
- **Composable glue** `app/composables/useDashboardSummary.ts` wraps `useAsyncData` and maps `{ pending, error, data }` to a `DashboardViewState`, a redacted `requestId`, the `degraded` group list, and an `isStale` flag.
- **State surfaces** reuse the Swiss DS: `UiSkeleton` (loading), `UiStatusView` (forbidden / unauthenticated / error, with built-in request-ref redaction), `UiEmptyState` (no-data).
- **Metrics** render via `DashboardMetricGroup.vue` composing `UiDataList` + `UiStatusBadge` (tone-bearing counters: locked/denied/rejected → danger, staged/hold → warning, active/fulfilled/approved → success; zero/null → neutral) + `UiFolio` (neutral numeric values, and the `generated_at` timestamp as a folio).
- **Evidence:** the redacted support reference renders once per state — `UiStatusView`'s built-in `request-id` on error/forbidden/unauthenticated, and the hero `generated_at` folio on ready (no duplicate evidence panel).
- The backend stays the security boundary; the page also handles a backend `403`/`401` defensively even though `admin-guard.global.ts` already gates the route.

## Tech Stack

- **Nuxt 4.4.8** (`ssr: true`, universal), **Vue 3.5** SFC, **TypeScript strict**.
- **Pinia** (`admin-session` store — existing; consumed read-only here).
- **Data:** `useAsyncData` + typed `apiClient` over `$fetch`/`useRequestFetch` (`app/lib/api/api-client.ts`, `ApiError` with `status`/`code`/`requestId`).
- **UI:** Swiss DS components in `app/components/ui/*`, `lucide-vue-next` icons, Tailwind v4 + `assets/tokens.css` Swiss tokens.
- **i18n:** `app/composables/useI18n.ts` (`id` default, `en`), catalogs `app/locales/{id,en}.json`.
- **Tests:** Vitest 4 (`npm run test` = `vitest run`); `@nuxt/test-utils/runtime` (`mountSuspended`, `mockNuxtImport`) for `*.nuxt.spec.ts` (auto-routed to the `nuxt` env by filename), `@vue/test-utils` + jsdom for plain `*.spec.ts`, `@nuxt/test-utils/e2e` for the SSR leak gate. Playwright e2e is out of scope for this phase (covered at cutover, §10).

## Global Constraints

Binding values for every task. A task is **not done** if any is violated.

- **Full SSR** (`ssr: true`): the principal and the summary resolve **server-side** (no client bootstrap flash). The summary `useAsyncData` is not `await`ed in the page but Nuxt still settles it before serializing the payload.
- **No browser token handling:** no access/refresh/ID token, client secret, or credential is created, exchanged, read, stored, or logged in the browser. The SPA is token-blind.
- **SSR payload safety (§3.3, mandatory):** only **safe, already-masked DTOs and safe principal fields** (display name, role, capability booleans, counters, timestamps) may enter the SSR HTML or `__NUXT__`/`__NUXT_DATA__`. Tokens, session secrets, and raw NIK/NIP/NISN stay in Nitro `event.context` only. The `test/ssr-token-leak.gate.spec.ts` gate must stay green and is **extended** to cover the summary DTO in this phase.
- **Same-origin session only:** admin calls use the same-origin relative path `/api/admin/dashboard/summary` and the encrypted session cookie; no token headers are minted in the browser.
- **No direct `fetch`/`$fetch` in pages or components** — the page reaches the network only through `dashboardApi` (service) via `apiClient`.
- **Swiss design discipline:** tokens-only (no hard-coded colors), **no shadows** as structure (1px hairline borders), **single accent `#002FA7`** (interactive/brand), red **only** as functional `danger` `#E4002B` (destructive/critical state), status **never color-alone** (always tone + label/shape via `UiStatusBadge`), `--font-mono` reserved **only** for raw IDs/correlation values; timestamps and counts render as condensed-sans folio numerals via `UiFolio` (`variant="timestamp"`/`"count"`), NOT mono.
- **Permission-aware:** `definePageMeta({ permissions: ['admin.dashboard.view'] })`; `admin-guard.global.ts` enforces role + permission; the page additionally renders a safe `forbidden` surface if the backend returns `403` despite the UI (defense in depth).
- **TDD:** RED → GREEN → REFACTOR per task; commit only on green.
- **Conventional commits**, each ending with the trailer:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

### Task 3.1: Dashboard DTO + pure view-state / tone resolver

Pure types and pure functions first — no Nuxt, no network. Establishes the masked DTO shape (counters are `number | null`; backend degrades a single counter to `null` and lists it in `degraded`) and the view-state mapping that the composable and page consume.

**Files**
- Create: `app/types/dashboard.types.ts`
- Create: `app/lib/dashboard/dashboard-view-state.ts`
- Test: `app/lib/dashboard/__tests__/dashboard-view-state.spec.ts`

**Interfaces**
- Produces (`app/types/dashboard.types.ts`):
  - `type DashboardCounter = number | null`
  - `type DashboardCounterGroup = Readonly<Record<string, DashboardCounter>>`
  - `type DashboardCounters = { readonly users; sessions; clients; audit; incidents; data_subject_requests: DashboardCounterGroup }`
  - `type DashboardSummary = { readonly generated_at: string; readonly partial: boolean; readonly degraded: readonly string[]; readonly counters: DashboardCounters }`
  - `const DASHBOARD_GROUP_KEYS = ['users','sessions','clients','audit','incidents','data_subject_requests'] as const`
  - `type DashboardGroupKey = (typeof DASHBOARD_GROUP_KEYS)[number]`
- Produces (`app/lib/dashboard/dashboard-view-state.ts`):
  - `type DashboardViewState = 'loading' | 'unauthenticated' | 'forbidden' | 'error' | 'empty' | 'ready'`
  - `resolveCounterTone(key: string, value: number | null): StatusTone`
  - `isDashboardEmpty(summary: DashboardSummary): boolean`
  - `resolveDashboardViewState(args: { pending: boolean; error: unknown; summary: DashboardSummary | null }): DashboardViewState`
  - `isDashboardStale(error: unknown, summary: DashboardSummary | null): boolean`
- Consumes: `ApiError` from `@/lib/api/api-client`; `StatusTone` from `@/lib/status-tone`.

**Steps**

1. [ ] Write the failing test `app/lib/dashboard/__tests__/dashboard-view-state.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api/api-client'
import {
  isDashboardEmpty,
  isDashboardStale,
  resolveCounterTone,
  resolveDashboardViewState,
} from '../dashboard-view-state'
import type { DashboardSummary } from '@/types/dashboard.types'

const ready: DashboardSummary = {
  generated_at: '2026-06-28T14:32:15Z',
  partial: false,
  degraded: [],
  counters: {
    users: { total: 1250, active: 1100, disabled: 50, deactivated: 100, locked: 0 },
    sessions: { portal_active: 420, rp_active: 380 },
    clients: { total: 85, active: 72, staged: 8, decommissioned: 5 },
    audit: { admin_last_24h: 2340, auth_last_24h: 18500 },
    incidents: { admin_denied_last_24h: 12 },
    data_subject_requests: { submitted: 3, approved: 7, rejected: 2, fulfilled: 18, on_hold: 1 },
  },
}

const empty: DashboardSummary = {
  generated_at: '2026-06-28T14:32:15Z',
  partial: false,
  degraded: [],
  counters: {
    users: { total: 0, active: 0, disabled: 0, deactivated: 0, locked: 0 },
    sessions: { portal_active: 0, rp_active: 0 },
    clients: { total: 0, active: 0, staged: 0, decommissioned: 0 },
    audit: { admin_last_24h: 0, auth_last_24h: 0 },
    incidents: { admin_denied_last_24h: 0 },
    data_subject_requests: { submitted: 0, approved: 0, rejected: 0, fulfilled: 0, on_hold: 0 },
  },
}

describe('resolveCounterTone', () => {
  it('maps state-bearing counter keys to a tone, zero/null to neutral', () => {
    expect(resolveCounterTone('locked', 3)).toBe('danger')
    expect(resolveCounterTone('admin_denied_last_24h', 12)).toBe('danger')
    expect(resolveCounterTone('rejected', 2)).toBe('danger')
    expect(resolveCounterTone('staged', 8)).toBe('warning')
    expect(resolveCounterTone('on_hold', 1)).toBe('warning')
    expect(resolveCounterTone('active', 1100)).toBe('success')
    expect(resolveCounterTone('fulfilled', 18)).toBe('success')
    expect(resolveCounterTone('approved', 7)).toBe('success')
    // Routine lifecycle counts are NEUTRAL, not danger (Swiss: red = critical only).
    expect(resolveCounterTone('disabled', 50)).toBe('neutral')
    expect(resolveCounterTone('deactivated', 100)).toBe('neutral')
    expect(resolveCounterTone('decommissioned', 5)).toBe('neutral')
    // 'deactivated'/'portal_active' must NOT match 'active' via substring → neutral.
    expect(resolveCounterTone('portal_active', 420)).toBe('neutral')
    expect(resolveCounterTone('rp_active', 380)).toBe('neutral')
    expect(resolveCounterTone('total', 1250)).toBe('neutral')
    expect(resolveCounterTone('locked', 0)).toBe('neutral')
    expect(resolveCounterTone('active', null)).toBe('neutral')
  })
})

describe('isDashboardEmpty', () => {
  it('is true only when every counter across every group is null or 0', () => {
    expect(isDashboardEmpty(empty)).toBe(true)
    expect(isDashboardEmpty(ready)).toBe(false)
  })
})

describe('resolveDashboardViewState', () => {
  it('loading when no summary, no error', () => {
    expect(resolveDashboardViewState({ pending: true, error: null, summary: null })).toBe('loading')
  })
  it('maps a first-load 401 to unauthenticated', () => {
    expect(
      resolveDashboardViewState({ pending: false, error: new ApiError(401, 'no session'), summary: null }),
    ).toBe('unauthenticated')
  })
  it('maps a first-load 403 to forbidden (distinct from empty)', () => {
    expect(
      resolveDashboardViewState({ pending: false, error: new ApiError(403, 'forbidden'), summary: null }),
    ).toBe('forbidden')
  })
  it('maps other first-load errors to error (incl. H3-shaped statusCode)', () => {
    expect(
      resolveDashboardViewState({ pending: false, error: new ApiError(500, 'boom'), summary: null }),
    ).toBe('error')
    expect(
      resolveDashboardViewState({ pending: false, error: { statusCode: 502 }, summary: null }),
    ).toBe('error')
  })
  it('ready / empty when a summary is present (error is kept on screen, not blanked)', () => {
    expect(resolveDashboardViewState({ pending: false, error: null, summary: ready })).toBe('ready')
    expect(resolveDashboardViewState({ pending: false, error: null, summary: empty })).toBe('empty')
    // background refresh failed but we still hold a good snapshot → keep it visible
    expect(
      resolveDashboardViewState({ pending: false, error: new ApiError(500, 'boom'), summary: ready }),
    ).toBe('ready')
  })
})

describe('isDashboardStale', () => {
  it('is true only when an error coexists with a prior summary', () => {
    expect(isDashboardStale(new ApiError(500, 'x'), ready)).toBe(true)
    expect(isDashboardStale(null, ready)).toBe(false)
    expect(isDashboardStale(new ApiError(500, 'x'), null)).toBe(false)
  })
})
```

2. [ ] Run it — expect **FAIL** (modules `../dashboard-view-state` and `@/types/dashboard.types` do not exist → import/resolution error):
   `npm run test -- app/lib/dashboard/__tests__/dashboard-view-state.spec.ts`

3. [ ] Implement `app/types/dashboard.types.ts` (FULL code):

```ts
// Safe, masked dashboard summary DTO for GET /admin/api/dashboard/summary.
// Every field is an aggregate counter or a timestamp — no token, secret,
// identifier, or raw PII (verified against the backend contract). Counters are
// nullable: the backend degrades a single counter to `null` (and lists it in
// `degraded`) when its query fails, rather than failing the whole request.
export type DashboardCounter = number | null

export type DashboardCounterGroup = Readonly<Record<string, DashboardCounter>>

export type DashboardCounters = {
  readonly users: DashboardCounterGroup
  readonly sessions: DashboardCounterGroup
  readonly clients: DashboardCounterGroup
  readonly audit: DashboardCounterGroup
  readonly incidents: DashboardCounterGroup
  readonly data_subject_requests: DashboardCounterGroup
}

export type DashboardSummary = {
  readonly generated_at: string
  readonly partial: boolean
  readonly degraded: readonly string[]
  readonly counters: DashboardCounters
}

// Fixed render order for the grid; keyed to the backend counter groups and to
// the `dashboard.counters.<key>` i18n namespace.
export const DASHBOARD_GROUP_KEYS = [
  'users',
  'sessions',
  'clients',
  'audit',
  'incidents',
  'data_subject_requests',
] as const

export type DashboardGroupKey = (typeof DASHBOARD_GROUP_KEYS)[number]
```

4. [ ] Implement `app/lib/dashboard/dashboard-view-state.ts` (FULL code):

```ts
import { ApiError } from '@/lib/api/api-client'
import type { StatusTone } from '@/lib/status-tone'
import type { DashboardSummary } from '@/types/dashboard.types'

export type DashboardViewState =
  | 'loading'
  | 'unauthenticated'
  | 'forbidden'
  | 'error'
  | 'empty'
  | 'ready'

export type ResolveViewStateArgs = {
  readonly pending: boolean
  readonly error: unknown
  readonly summary: DashboardSummary | null
}

// State-bearing counter keys carry a tone so the metric reads as a status, not a
// bare number (Swiss "never colour alone": tone always pairs with a label +
// the UiStatusBadge dot/shape). Zero and null are always neutral.
//
// EXACT-key matching (not substring `includes`): `deactivated` contains the
// substring `active`, so a loose SUCCESS match would mis-tone it; and Swiss
// reserves red for genuinely critical states only. Routine lifecycle counts
// (disabled, deactivated, decommissioned, total, submitted, *_active session
// counts, *_last_24h volumes) stay NEUTRAL. `denied` is matched as a suffix for
// the `admin_denied_last_24h` incident counter.
const DANGER_KEYS = new Set(['locked', 'rejected'])
const WARNING_KEYS = new Set(['staged', 'on_hold'])
const SUCCESS_KEYS = new Set(['active', 'fulfilled', 'approved'])

export function resolveCounterTone(key: string, value: number | null): StatusTone {
  if (value == null || value === 0) return 'neutral'
  const k = key.toLowerCase()
  if (DANGER_KEYS.has(k) || k.includes('denied')) return 'danger'
  if (WARNING_KEYS.has(k)) return 'warning'
  if (SUCCESS_KEYS.has(k)) return 'success'
  return 'neutral'
}

// "Empty" = the backend answered, but every counter across every group is null
// or 0. Deliberately distinct from `forbidden` (a 403 → no permission) so the
// page shows "no data yet" copy rather than an access-denied surface.
export function isDashboardEmpty(summary: DashboardSummary): boolean {
  return Object.values(summary.counters).every((group) =>
    Object.values(group).every((value) => value == null || value === 0),
  )
}

export function resolveDashboardViewState({
  error,
  summary,
}: ResolveViewStateArgs): DashboardViewState {
  // Security boundary: an error with NO prior snapshot must surface the real
  // auth/permission state, never be hidden. A background-refresh error that
  // still has a good snapshot is handled by `isDashboardStale` (data stays on
  // screen) — symmetric with the legacy dashboard store gate.
  if (error && !summary) {
    const status = errorStatus(error)
    if (status === 401) return 'unauthenticated'
    if (status === 403) return 'forbidden'
    return 'error'
  }
  if (summary) return isDashboardEmpty(summary) ? 'empty' : 'ready'
  return 'loading'
}

// A background refresh failed but we still hold a good snapshot — show the data
// with a degraded/stale banner instead of blanking the cockpit.
export function isDashboardStale(error: unknown, summary: DashboardSummary | null): boolean {
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

5. [ ] Run it — expect **PASS**:
   `npm run test -- app/lib/dashboard/__tests__/dashboard-view-state.spec.ts`

6. [ ] Commit:
   `git add app/types/dashboard.types.ts app/lib/dashboard/ && git commit -m "$(printf 'feat(sso-admin-frontend): dashboard DTO + pure view-state/tone resolver\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"`

---

### Task 3.2: Dashboard summary service (no direct fetch in the page)

A one-method typed service over `apiClient`, mirroring `app/services/auth.api.ts`. This is the page's only network seam.

**Files**
- Create: `app/services/dashboard.api.ts`
- Test: `app/services/__tests__/dashboard.api.spec.ts`

**Interfaces**
- Produces: `export const dashboardApi: { getSummary(): Promise<DashboardSummary> }`
- Consumes: `apiClient.get<DashboardSummary>('/api/admin/dashboard/summary')` (same-origin BFF path; the Nitro proxy already allowlists `GET /api/admin/dashboard/summary` and rewrites it to the backend's `/admin/api/dashboard/summary` with an injected Bearer token).

**Steps**

1. [ ] Write the failing test `app/services/__tests__/dashboard.api.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import type { DashboardSummary } from '@/types/dashboard.types'

const get = vi.fn<(path: string) => Promise<unknown>>()
vi.mock('@/lib/api/api-client', () => ({ apiClient: { get } }))

const { dashboardApi } = await import('../dashboard.api')

describe('dashboardApi', () => {
  it('GETs the same-origin BFF summary path and returns the DTO unchanged', async () => {
    const payload: DashboardSummary = {
      generated_at: '2026-06-28T14:32:15Z',
      partial: false,
      degraded: [],
      counters: {
        users: { total: 1, active: 1, disabled: 0, deactivated: 0, locked: 0 },
        sessions: { portal_active: 0, rp_active: 0 },
        clients: { total: 0, active: 0, staged: 0, decommissioned: 0 },
        audit: { admin_last_24h: 0, auth_last_24h: 0 },
        incidents: { admin_denied_last_24h: 0 },
        data_subject_requests: { submitted: 0, approved: 0, rejected: 0, fulfilled: 0, on_hold: 0 },
      },
    }
    get.mockResolvedValue(payload)
    await expect(dashboardApi.getSummary()).resolves.toBe(payload)
    expect(get).toHaveBeenCalledWith('/api/admin/dashboard/summary')
  })
})
```

2. [ ] Run it — expect **FAIL** (`../dashboard.api` does not exist):
   `npm run test -- app/services/__tests__/dashboard.api.spec.ts`

3. [ ] Implement `app/services/dashboard.api.ts` (FULL code):

```ts
import { apiClient } from '@/lib/api/api-client'
import type { DashboardSummary } from '@/types/dashboard.types'

// Same-origin BFF path. The Nitro proxy (server/utils/admin-proxy.ts) injects
// the Bearer access token from event.context and rewrites /api/admin/* →
// /admin/api/* before forwarding to the backend. The browser/SPA is token-blind.
export const dashboardApi = {
  getSummary(): Promise<DashboardSummary> {
    return apiClient.get<DashboardSummary>('/api/admin/dashboard/summary')
  },
}
```

4. [ ] Run it — expect **PASS**:
   `npm run test -- app/services/__tests__/dashboard.api.spec.ts`

5. [ ] Commit:
   `git add app/services/dashboard.api.ts app/services/__tests__/dashboard.api.spec.ts && git commit -m "$(printf 'feat(sso-admin-frontend): dashboard summary service over api-client\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"`

---

### Task 3.3: `useDashboardSummary` composable (SSR data boundary)

The Nuxt glue: wrap the service in `useAsyncData` (runs during SSR so the masked DTO hydrates with no client flash) and expose the mapped view state, redacted request id, degraded group list, stale flag, and a `refresh`. Pure mapping is delegated to Task 3.1's resolver. Tested in a `*.nuxt.spec.ts` where `useAsyncData` is mocked at the boundary so state mapping is deterministic.

**Files**
- Create: `app/composables/useDashboardSummary.ts`
- Test: `app/composables/__tests__/useDashboardSummary.nuxt.spec.ts`

**Interfaces**
- Produces:
  ```ts
  type UseDashboardSummaryReturn = {
    readonly summary: ComputedRef<DashboardSummary | null>
    readonly viewState: ComputedRef<DashboardViewState>
    readonly requestId: ComputedRef<string | null>
    readonly degraded: ComputedRef<readonly string[]>
    readonly isStale: ComputedRef<boolean>
    readonly refresh: () => Promise<void>
  }
  function useDashboardSummary(): UseDashboardSummaryReturn
  ```
- Consumes: `useAsyncData<DashboardSummary>('admin-dashboard-summary', () => dashboardApi.getSummary())`; `resolveDashboardViewState`, `isDashboardStale` (Task 3.1); `ApiError`, `getLastRequestId` (`@/lib/api/api-client`).

**Steps**

1. [ ] Write the failing test `app/composables/__tests__/useDashboardSummary.nuxt.spec.ts`:

```ts
// *.nuxt.spec.ts → routed to the 'nuxt' env where mockNuxtImport is available.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { ApiError } from '@/lib/api/api-client'
import { dashboardApi } from '@/services/dashboard.api'
import { useDashboardSummary } from '../useDashboardSummary'
import type { DashboardSummary } from '@/types/dashboard.types'

vi.mock('@/services/dashboard.api', () => ({
  dashboardApi: { getSummary: vi.fn<() => Promise<DashboardSummary>>() },
}))

// Controllable useAsyncData stand-in: the test mutates data/pending/error and
// asserts the composable's derived state. Captures the key + handler so we can
// prove the composable wires the service correctly.
const data = ref<DashboardSummary | null>(null)
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

const ready: DashboardSummary = {
  generated_at: '2026-06-28T14:32:15Z',
  partial: false,
  degraded: [],
  counters: {
    users: { total: 1250, active: 1100, disabled: 50, deactivated: 100, locked: 0 },
    sessions: { portal_active: 420, rp_active: 380 },
    clients: { total: 85, active: 72, staged: 8, decommissioned: 5 },
    audit: { admin_last_24h: 2340, auth_last_24h: 18500 },
    incidents: { admin_denied_last_24h: 12 },
    data_subject_requests: { submitted: 3, approved: 7, rejected: 2, fulfilled: 18, on_hold: 1 },
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

describe('useDashboardSummary', () => {
  it('wires the service under a stable asyncData key', () => {
    useDashboardSummary()
    expect(capturedKey).toBe('admin-dashboard-summary')
    capturedHandler?.()
    expect(dashboardApi.getSummary).toHaveBeenCalledTimes(1)
  })

  it('derives ready / empty / loading from the summary', () => {
    const dash = useDashboardSummary()
    expect(dash.viewState.value).toBe('loading')
    data.value = ready
    expect(dash.viewState.value).toBe('ready')
    expect(dash.summary.value).toBe(ready)
  })

  it('maps a first-load 403 to forbidden and exposes the redacted request id', () => {
    error.value = new ApiError(403, 'forbidden', 'forbidden', null, 'admin-req-DENIED42')
    const dash = useDashboardSummary()
    expect(dash.viewState.value).toBe('forbidden')
    expect(dash.requestId.value).toBe('admin-req-DENIED42')
  })

  it('maps a first-load 401 to unauthenticated', () => {
    error.value = new ApiError(401, 'no session')
    expect(useDashboardSummary().viewState.value).toBe('unauthenticated')
  })

  it('keeps the last good snapshot on a background refresh failure (stale)', () => {
    data.value = ready
    error.value = new ApiError(500, 'boom')
    const dash = useDashboardSummary()
    expect(dash.viewState.value).toBe('ready')
    expect(dash.isStale.value).toBe(true)
  })

  it('surfaces the degraded group list only when the summary is partial', () => {
    data.value = { ...ready, partial: true, degraded: ['sessions', 'audit'] }
    const dash = useDashboardSummary()
    expect(dash.degraded.value).toEqual(['sessions', 'audit'])
    data.value = ready
    expect(useDashboardSummary().degraded.value).toEqual([])
  })

  it('refresh() delegates to the underlying asyncData refresh', async () => {
    await useDashboardSummary().refresh()
    expect(refreshMock).toHaveBeenCalledTimes(1)
  })
})
```

2. [ ] Run it — expect **FAIL** (`../useDashboardSummary` does not exist):
   `npm run test -- app/composables/__tests__/useDashboardSummary.nuxt.spec.ts`

3. [ ] Implement `app/composables/useDashboardSummary.ts` (FULL code):

```ts
import { computed, type ComputedRef } from 'vue'
import { ApiError, getLastRequestId } from '@/lib/api/api-client'
import { dashboardApi } from '@/services/dashboard.api'
import {
  isDashboardStale,
  resolveDashboardViewState,
  type DashboardViewState,
} from '@/lib/dashboard/dashboard-view-state'
import type { DashboardSummary } from '@/types/dashboard.types'

export type UseDashboardSummaryReturn = {
  readonly summary: ComputedRef<DashboardSummary | null>
  readonly viewState: ComputedRef<DashboardViewState>
  readonly requestId: ComputedRef<string | null>
  readonly degraded: ComputedRef<readonly string[]>
  readonly isStale: ComputedRef<boolean>
  readonly refresh: () => Promise<void>
}

export function useDashboardSummary(): UseDashboardSummaryReturn {
  // Runs during SSR so the masked summary resolves server-side and hydrates into
  // the payload (safe DTO only — counters + timestamp). The access token stays in
  // the Nitro event.context and never reaches the page or window.__NUXT__.
  const { data, pending, error, refresh } = useAsyncData<DashboardSummary>(
    'admin-dashboard-summary',
    () => dashboardApi.getSummary(),
  )

  const summary = computed<DashboardSummary | null>(() => data.value ?? null)

  const viewState = computed<DashboardViewState>(() =>
    resolveDashboardViewState({
      pending: pending.value,
      error: error.value,
      summary: summary.value,
    }),
  )

  const isStale = computed<boolean>(() => isDashboardStale(error.value, summary.value))

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
   `npm run test -- app/composables/__tests__/useDashboardSummary.nuxt.spec.ts`

5. [ ] Commit:
   `git add app/composables/useDashboardSummary.ts app/composables/__tests__/useDashboardSummary.nuxt.spec.ts && git commit -m "$(printf 'feat(sso-admin-frontend): useDashboardSummary SSR data composable\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"`

---

### Task 3.4: `DashboardMetricGroup.vue` (Swiss metric group)

One counter group rendered as a hairline `UiDataList` (metric · count), with tone-bearing counters shown as a `UiStatusBadge` (color + label + dot → never color-alone) and neutral numeric values as a `UiFolio`. Dumb/presentational: it receives pre-built, pre-localized rows. DS deps are imported explicitly (matching `UiDataList`'s own `import UiFolio from './UiFolio.vue'` style) so a plain `@vue/test-utils` mount resolves them without Nuxt auto-import.

**Files**
- Create: `app/components/dashboard/DashboardMetricGroup.vue`
- Test: `app/components/dashboard/__tests__/DashboardMetricGroup.spec.ts`

**Interfaces**
- Produces (component):
  - `type DashboardMetricRow = { readonly id: string; readonly label: string; readonly value: number | null; readonly tone: StatusTone }`
  - Props: `{ caption: string; metricLabel: string; countLabel: string; rows: readonly DashboardMetricRow[] }`
- Consumes: `UiDataList` (+ `UiDataListColumn`, `UiDataListRow`), `UiStatusBadge`, `UiFolio`, `StatusTone`.

**Steps**

1. [ ] Write the failing test `app/components/dashboard/__tests__/DashboardMetricGroup.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import DashboardMetricGroup, {
  type DashboardMetricRow,
} from '../DashboardMetricGroup.vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'

const rows: readonly DashboardMetricRow[] = [
  { id: 'users.total', label: 'Total Akun', value: 1250, tone: 'neutral' },
  { id: 'users.active', label: 'Pengguna Aktif', value: 1100, tone: 'success' },
  { id: 'users.locked', label: 'Akun Terkunci', value: 3, tone: 'danger' },
  { id: 'users.deactivated', label: 'Deaktivasi', value: null, tone: 'neutral' },
]

function mountGroup() {
  return mount(DashboardMetricGroup, {
    props: { caption: 'Pengguna', metricLabel: 'Metrik', countLabel: 'Jumlah', rows },
  })
}

describe('DashboardMetricGroup', () => {
  it('renders the caption and every metric label', () => {
    const wrapper = mountGroup()
    expect(wrapper.text()).toContain('Pengguna')
    expect(wrapper.text()).toContain('Total Akun')
    expect(wrapper.text()).toContain('Pengguna Aktif')
    expect(wrapper.text()).toContain('Akun Terkunci')
  })

  it('renders tone-bearing counters as a status badge (tone + label, never colour-alone)', () => {
    const wrapper = mountGroup()
    const badges = wrapper.findAllComponents(UiStatusBadge)
    const tones = badges.map((b) => b.props('tone'))
    expect(tones).toContain('success')
    expect(tones).toContain('danger')
    // neutral counters are NOT rendered as badges
    expect(tones).not.toContain('neutral')
  })

  it('formats numeric values and renders null as an em dash', () => {
    const wrapper = mountGroup()
    expect(wrapper.text()).toMatch(/1[.,]?250/) // locale-tolerant grouping
    expect(wrapper.text()).toContain('—')
  })
})
```

2. [ ] Run it — expect **FAIL** (`../DashboardMetricGroup.vue` does not exist):
   `npm run test -- app/components/dashboard/__tests__/DashboardMetricGroup.spec.ts`

3. [ ] Implement `app/components/dashboard/DashboardMetricGroup.vue` (FULL code):

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

export type DashboardMetricRow = {
  readonly id: string
  readonly label: string
  readonly value: number | null
  readonly tone: StatusTone
}

const props = defineProps<{
  readonly caption: string
  readonly metricLabel: string
  readonly countLabel: string
  readonly rows: readonly DashboardMetricRow[]
}>()

const columns = computed<readonly UiDataListColumn[]>(() => [
  { key: 'label', label: props.metricLabel, align: 'left' },
  { key: 'value', label: props.countLabel, align: 'right' },
])

// DashboardMetricRow is structurally assignable to UiDataListRow (all fields are
// string | number | null and it carries an `id`), so this is identity at runtime.
const dataRows = computed<readonly UiDataListRow[]>(() => props.rows)

function formatValue(value: string | number | null | undefined): string {
  if (value == null || value === '') return '—'
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isNaN(numeric) ? String(value) : new Intl.NumberFormat().format(numeric)
}

function rowTone(value: unknown): StatusTone {
  return (typeof value === 'string' ? value : 'neutral') as StatusTone
}
</script>

<template>
  <UiDataList
    class="dashboard-metric-group"
    :caption="caption"
    :columns="columns"
    :rows="dataRows"
    :total="rows.length"
  >
    <template #cell(value)="{ row }">
      <UiStatusBadge
        v-if="rowTone(row.tone) !== 'neutral'"
        :tone="rowTone(row.tone)"
        :label="formatValue(row.value)"
      />
      <UiFolio v-else :value="formatValue(row.value)" variant="count" />
    </template>
  </UiDataList>
</template>

<style scoped>
.dashboard-metric-group {
  break-inside: avoid;
}
</style>
```

> Note: `rowTone(value: unknown)` keeps the SFC vue-tsc clean — `row.tone` (typed by `UiDataListRow`) is assignable to `unknown`, and the runtime `typeof === 'string'` narrowing is unchanged. Keep `:rows="dataRows"` (no template cast).

4. [ ] Run it — expect **PASS**:
   `npm run test -- app/components/dashboard/__tests__/DashboardMetricGroup.spec.ts`

5. [ ] Commit:
   `git add app/components/dashboard/ && git commit -m "$(printf 'feat(sso-admin-frontend): Swiss DashboardMetricGroup (UiDataList + status badge + folio)\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"`

---

### Task 3.5: Compose the dashboard page + i18n keys

Wire it all together in `app/pages/dashboard.vue`: keep the existing meta + safe principal hydration, add the summary via `useDashboardSummary()`, and render the five states with the Swiss DS. The hero (eyebrow/title/summary/masked principal) renders **unconditionally** so the SSR leak gate's positive assertions (`data-page="dashboard"`, the principal name, `data-admin-shell`) always hold regardless of the summary state. The page test mocks at the boundary (`useDashboardSummary` + the session store) so each state is deterministic.

**Files**
- Modify: `app/pages/dashboard.vue`
- Modify: `app/locales/id.json`, `app/locales/en.json` (add `dashboard.signed_in_as`, `dashboard.degraded_banner`, `dashboard.metric_label`, `dashboard.count_label`; existing `dashboard.*` and `common.*` keys are reused)
- Test: `app/pages/__tests__/dashboard.page.nuxt.spec.ts`
- (Unchanged, must stay green) `app/pages/__tests__/route-map.spec.ts` — asserts the meta name/layout/permissions/`requiresAdmin`.

**Interfaces**
- Consumes: `useSessionStore` (`principal.display_name`, `ensureSession`), `useDashboardSummary` (Task 3.3), `resolveCounterTone` + `DASHBOARD_GROUP_KEYS`/`DashboardGroupKey` (Tasks 3.1), `DashboardMetricGroup` + `DashboardMetricRow` (Task 3.4), `useI18n`, `UiSkeleton`/`UiStatusView`/`UiEmptyState`/`UiButton`/`UiFolio`.
- Produces: the rendered `/dashboard` route (no exported API).

**Steps**

1. [ ] Write the failing test `app/pages/__tests__/dashboard.page.nuxt.spec.ts`:

```ts
// *.nuxt.spec.ts → 'nuxt' env: mountSuspended handles the page's async setup
// (useAsyncData + useI18n auto-imports). Data boundary + session store are mocked.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import DashboardMetricGroup from '@/components/dashboard/DashboardMetricGroup.vue'
import type { DashboardSummary } from '@/types/dashboard.types'
import type { DashboardViewState } from '@/lib/dashboard/dashboard-view-state'

const summary = ref<DashboardSummary | null>(null)
const viewState = ref<DashboardViewState>('loading')
const requestId = ref<string | null>(null)
const degraded = ref<readonly string[]>([])
const isStale = ref(false)
const refreshMock = vi.fn(async () => {})

vi.mock('@/composables/useDashboardSummary', () => ({
  useDashboardSummary: () => ({ summary, viewState, requestId, degraded, isStale, refresh: refreshMock }),
}))

vi.mock('@/stores/session.store', () => ({
  useSessionStore: () => ({
    principal: { display_name: 'Admin Sentinel' },
    ensureSession: vi.fn(async () => 'authenticated'),
  }),
}))

const READY: DashboardSummary = {
  generated_at: '2026-06-28T14:32:15Z',
  partial: false,
  degraded: [],
  counters: {
    users: { total: 1250, active: 1100, disabled: 50, deactivated: 100, locked: 0 },
    sessions: { portal_active: 420, rp_active: 380 },
    clients: { total: 85, active: 72, staged: 8, decommissioned: 5 },
    audit: { admin_last_24h: 2340, auth_last_24h: 18500 },
    incidents: { admin_denied_last_24h: 12 },
    data_subject_requests: { submitted: 3, approved: 7, rejected: 2, fulfilled: 18, on_hold: 1 },
  },
}
const EMPTY: DashboardSummary = {
  ...READY,
  counters: {
    users: { total: 0, active: 0, disabled: 0, deactivated: 0, locked: 0 },
    sessions: { portal_active: 0, rp_active: 0 },
    clients: { total: 0, active: 0, staged: 0, decommissioned: 0 },
    audit: { admin_last_24h: 0, auth_last_24h: 0 },
    incidents: { admin_denied_last_24h: 0 },
    data_subject_requests: { submitted: 0, approved: 0, rejected: 0, fulfilled: 0, on_hold: 0 },
  },
}

const Dashboard = (await import('../dashboard.vue')).default

beforeEach(() => {
  summary.value = null
  viewState.value = 'loading'
  requestId.value = null
  degraded.value = []
  isStale.value = false
  vi.clearAllMocks()
})
afterEach(() => vi.clearAllMocks())

describe('dashboard page', () => {
  it('always renders the masked principal in the hero with no token/PII', async () => {
    const wrapper = await mountSuspended(Dashboard)
    const principal = wrapper.find('[data-principal-name]')
    expect(principal.exists()).toBe(true)
    expect(principal.text()).toContain('Admin Sentinel')
    expect(wrapper.find('[data-page="dashboard"]').exists()).toBe(true)
    expect(wrapper.html()).not.toMatch(/access_token|refresh_token|id_token|Bearer|SENTINEL-/)
  })

  it('loading → skeleton, no metric groups', async () => {
    viewState.value = 'loading'
    const wrapper = await mountSuspended(Dashboard)
    expect(wrapper.findComponent(UiSkeleton).exists()).toBe(true)
    expect(wrapper.findAllComponents(DashboardMetricGroup).length).toBe(0)
  })

  it('forbidden → forbidden status view (no-permission), distinct from empty', async () => {
    viewState.value = 'forbidden'
    requestId.value = 'admin-req-DENIED42'
    const wrapper = await mountSuspended(Dashboard)
    const view = wrapper.findComponent(UiStatusView)
    expect(view.props('tone')).toBe('forbidden')
    expect(wrapper.findComponent(UiEmptyState).exists()).toBe(false)
    expect(wrapper.text()).not.toMatch(/SQLSTATE|stack trace|Bearer/i)
  })

  it('unauthenticated → step_up status view', async () => {
    viewState.value = 'unauthenticated'
    const wrapper = await mountSuspended(Dashboard)
    expect(wrapper.findComponent(UiStatusView).props('tone')).toBe('step_up')
  })

  it('error → error status view; raw request id is redacted to REF-XXXXXXXX', async () => {
    viewState.value = 'error'
    requestId.value = 'admin-req-FAILED99'
    const wrapper = await mountSuspended(Dashboard)
    expect(wrapper.findComponent(UiStatusView).props('tone')).toBe('error')
    expect(wrapper.text()).toContain('REF-')
    expect(wrapper.text()).not.toContain('admin-req-FAILED99')
  })

  it('empty (all-zero) → empty state, not a status view', async () => {
    viewState.value = 'empty'
    summary.value = EMPTY
    const wrapper = await mountSuspended(Dashboard)
    expect(wrapper.findComponent(UiEmptyState).exists()).toBe(true)
    expect(wrapper.findComponent(UiStatusView).exists()).toBe(false)
  })

  it('ready → six metric groups + generated_at folio, no secrets', async () => {
    viewState.value = 'ready'
    summary.value = READY
    const wrapper = await mountSuspended(Dashboard)
    expect(wrapper.findAllComponents(DashboardMetricGroup).length).toBe(6)
    expect(wrapper.text()).toContain('Total Akun') // localized counter label (id default)
    expect(wrapper.html()).toContain('2026-06-28T14:32:15Z') // folio timestamp
    expect(wrapper.html()).not.toMatch(/access_token|Bearer|SENTINEL-/)
  })

  it('partial → degraded banner naming the groups, data still visible', async () => {
    viewState.value = 'ready'
    summary.value = { ...READY, partial: true, degraded: ['sessions'] }
    degraded.value = ['sessions']
    const wrapper = await mountSuspended(Dashboard)
    expect(wrapper.find('[role="status"]').exists()).toBe(true)
    expect(wrapper.findAllComponents(DashboardMetricGroup).length).toBe(6)
  })
})
```

2. [ ] Run it — expect **FAIL** (current page renders only `<h1>` + principal; no skeleton/status-view/metric groups):
   `npm run test -- app/pages/__tests__/dashboard.page.nuxt.spec.ts`

3. [ ] Add the i18n keys. In `app/locales/id.json` inside the existing `"dashboard"` block add:

```json
"signed_in_as": "Masuk sebagai {name}",
"degraded_banner": "Sebagian counter gagal dimuat ({groups}). Menampilkan data yang tersedia.",
"metric_label": "Metrik",
"count_label": "Jumlah"
```

   In `app/locales/en.json` inside the existing `"dashboard"` block add:

```json
"signed_in_as": "Signed in as {name}",
"degraded_banner": "Some counters failed to load ({groups}). Showing available data.",
"metric_label": "Metric",
"count_label": "Count"
```

4. [ ] Implement `app/pages/dashboard.vue` (FULL replacement):

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { AlertTriangle } from 'lucide-vue-next'
import { useSessionStore } from '@/stores/session.store'
import { useI18n } from '@/composables/useI18n'
import { useDashboardSummary } from '@/composables/useDashboardSummary'
import { resolveCounterTone } from '@/lib/dashboard/dashboard-view-state'
import { DASHBOARD_GROUP_KEYS, type DashboardGroupKey } from '@/types/dashboard.types'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiFolio from '@/components/ui/UiFolio.vue'
import DashboardMetricGroup, {
  type DashboardMetricRow,
} from '@/components/dashboard/DashboardMetricGroup.vue'

definePageMeta({
  name: 'admin.dashboard',
  layout: 'admin',
  requiresAdmin: true,
  permissions: ['admin.dashboard.view'],
})

const { t } = useI18n()

// SAFE HYDRATION: resolve the masked principal server-side via the session store
// (display name, role, capability flags only). OIDC tokens + raw government PII
// stay in Nitro event.context and are never written to useState / __NUXT__.
const store = useSessionStore()
await useAsyncData('admin-dashboard-principal', () => store.ensureSession())

// SAFE DATA: the summary is fetched through a service (no direct fetch in the
// page). The DTO is aggregate counters + a timestamp only — no secret, token, or
// raw PII — so it is safe to serialize into the SSR payload.
const { summary, viewState, requestId, degraded, isStale, refresh } = useDashboardSummary()

function groupTitle(group: DashboardGroupKey): string {
  const path = `dashboard.counters.${group}.title`
  const translated = t(path)
  return translated === path ? group : translated
}

function counterLabel(group: DashboardGroupKey, key: string): string {
  const path = `dashboard.counters.${group}.${key}`
  const translated = t(path)
  return translated === path ? key.replace(/_/gu, ' ') : translated
}

const groups = computed(() => {
  const counters = summary.value?.counters
  if (!counters) return []
  return DASHBOARD_GROUP_KEYS.map((group) => ({
    key: group,
    caption: groupTitle(group),
    rows: Object.entries(counters[group]).map(
      ([key, value]): DashboardMetricRow => ({
        id: `${group}.${key}`,
        label: counterLabel(group, key),
        value,
        tone: resolveCounterTone(key, value),
      }),
    ),
  }))
})

const degradedLabel = computed<string>(() =>
  degraded.value.map((group) => groupTitle(group as DashboardGroupKey)).join(', '),
)

async function onRefresh(): Promise<void> {
  await refresh()
}
</script>

<template>
  <section class="dashboard" data-page="dashboard">
    <header class="dashboard__hero">
      <span class="dashboard__eyebrow">{{ t('dashboard.eyebrow') }}</span>
      <h1 class="dashboard__title">{{ t('dashboard.title') }}</h1>
      <p class="dashboard__summary">{{ t('dashboard.summary') }}</p>
      <p class="dashboard__principal" data-principal-name>
        {{ t('dashboard.signed_in_as', { name: store.principal?.display_name ?? '—' }) }}
      </p>
      <dl v-if="summary" class="dashboard__evidence">
        <dt>{{ t('dashboard.generated_at') }}</dt>
        <dd><UiFolio :value="summary.generated_at" variant="timestamp" /></dd>
      </dl>
    </header>

    <UiSkeleton v-if="viewState === 'loading'" :rows="6" :label="t('dashboard.loading')" />

    <UiStatusView
      v-else-if="viewState === 'forbidden'"
      tone="forbidden"
      :eyebrow="t('dashboard.eyebrow')"
      :title="t('dashboard.forbidden_title')"
      :description="t('common.forbidden_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="viewState === 'unauthenticated'"
      tone="step_up"
      :eyebrow="t('dashboard.eyebrow')"
      :title="t('common.session_expired_title')"
      :description="t('common.session_expired_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="viewState === 'error'"
      tone="error"
      :eyebrow="t('dashboard.eyebrow')"
      :title="t('dashboard.error_title')"
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
      :title="t('dashboard.empty_title')"
      :description="t('dashboard.empty_description')"
    >
      <template #action>
        <UiButton variant="secondary" size="sm" @click="onRefresh">
          {{ t('common.btn_refresh') }}
        </UiButton>
      </template>
    </UiEmptyState>

    <template v-else>
      <div v-if="(summary && summary.partial) || isStale" class="dashboard__banner" role="status">
        <AlertTriangle :size="16" aria-hidden="true" />
        <span v-if="summary && summary.partial">
          {{ t('dashboard.degraded_banner', { groups: degradedLabel }) }}
        </span>
        <span v-else>{{ t('dashboard.stale_banner') }}</span>
      </div>

      <div class="dashboard__grid">
        <DashboardMetricGroup
          v-for="group in groups"
          :key="group.key"
          :caption="group.caption"
          :metric-label="t('dashboard.metric_label')"
          :count-label="t('dashboard.count_label')"
          :rows="group.rows"
        />
      </div>
    </template>
  </section>
</template>

<style scoped>
.dashboard {
  display: grid;
  gap: 24px;
  padding: 24px;
}
.dashboard__hero {
  display: grid;
  gap: 6px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border);
}
.dashboard__eyebrow {
  font: 600 0.6875rem/1 var(--font-sans);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.dashboard__title {
  margin: 0;
  font: 600 1.5rem/1.2 var(--font-sans);
  letter-spacing: -0.02em;
  color: var(--fg);
}
.dashboard__summary {
  margin: 0;
  max-width: 64ch;
  font: 400 0.875rem/1.6 var(--font-sans);
  color: var(--fg-2);
}
.dashboard__principal {
  margin: 0;
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--fg-2);
}
.dashboard__evidence {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 4px 0 0;
}
.dashboard__evidence dt {
  font: 600 0.625rem/1 var(--font-sans);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.dashboard__evidence dd {
  margin: 0;
}
.dashboard__banner {
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
.dashboard__grid {
  display: grid;
  gap: 20px;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
}
</style>
```

5. [ ] Run the page test + the route-map guard test — expect **PASS** for both:
   `npm run test -- app/pages/__tests__/dashboard.page.nuxt.spec.ts app/pages/__tests__/route-map.spec.ts`

6. [ ] Commit:
   `git add app/pages/dashboard.vue app/locales/id.json app/locales/en.json app/pages/__tests__/dashboard.page.nuxt.spec.ts && git commit -m "$(printf 'feat(sso-admin-frontend): compose Swiss dashboard page (all states, permission-aware)\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"`

---

### Task 3.6: Extend the SSR token-leak gate + full DoD verification

Prove that the **summary DTO** is leak-safe in the SSR payload, then run the complete service Definition-of-Done gate. The leak fixture (`test/fixtures/ssr-leak`) extends the real app as a Nuxt layer; today it stubs the principal (`server/routes/api/admin/me.get.ts`) but not the summary, so `/dashboard` renders in the error state and the summary DTO never reaches the payload. Add a representative summary route to the fixture so the dashboard renders **ready** during the gate — then the existing payload collectors automatically cover the counters + timestamp.

**Files**
- Create: `test/fixtures/ssr-leak/server/routes/api/admin/dashboard/summary.get.ts`
- Modify: `test/ssr-token-leak.gate.spec.ts` (one assertion that the ready dashboard rendered)

**Interfaces**
- Produces (fixture route): a static `DashboardSummary` JSON (small aggregates only; no token/secret/PII and no 10/16/18-digit run that would trip `collectPiiShapeLeaks`).
- Consumes: nothing new; the gate's `collectSecretLeaks` / `collectPiiShapeLeaks` already assert over the full serialized payload.

**Steps**

1. [ ] Add the failing assertion to `test/ssr-token-leak.gate.spec.ts` — in the first `it` ("renders the authenticated dashboard server-side …") append:

```ts
    // The summary path rendered the READY state (folio timestamp is verbatim).
    expect(html).toContain('2026-06-28T14:32:15Z')
```

2. [ ] Run it — expect **FAIL** (no fixture summary route → `/dashboard` renders the error state, the timestamp is absent). The harness pre-builds the fixture in a subprocess via `test/globalSetup.ts`:
   `npm run test -- test/ssr-token-leak.gate.spec.ts`

3. [ ] Implement the fixture summary route `test/fixtures/ssr-leak/server/routes/api/admin/dashboard/summary.get.ts` (FULL code):

```ts
// SSR token-leak fixture: a representative masked dashboard summary so the §3.3
// gate renders the dashboard in its READY state and the existing payload
// collectors also cover the summary DTO (counters + timestamp). Values are small
// aggregates — no token, secret, identifier, or PII-shaped digit run (a more
// specific route wins over the layer's catch-all server/routes/api/admin/[...].ts).
import { defineEventHandler } from 'h3'

export default defineEventHandler(() => ({
  generated_at: '2026-06-28T14:32:15Z',
  partial: false,
  degraded: [],
  counters: {
    users: { total: 1250, active: 1100, disabled: 50, deactivated: 100, locked: 0 },
    sessions: { portal_active: 420, rp_active: 380 },
    clients: { total: 85, active: 72, staged: 8, decommissioned: 5 },
    audit: { admin_last_24h: 2340, auth_last_24h: 18500 },
    incidents: { admin_denied_last_24h: 12 },
    data_subject_requests: { submitted: 3, approved: 7, rejected: 2, fulfilled: 18, on_hold: 1 },
  },
}))
```

4. [ ] Run the gate — expect **PASS** (ready dashboard renders; no token/secret/PII in HTML or payload):
   `npm run test -- test/ssr-token-leak.gate.spec.ts`

5. [ ] Run the **full Definition-of-Done gate** (each must PASS; if any command is blocked in the environment, report it explicitly — never claim PASS):
   - `npm run typecheck`
   - `npm run lint`
   - `npm run format:check` (run `npm run format` first if it fails on the new files)
   - `npm run test`
   - `npm run build`

6. [ ] Commit:
   `git add test/fixtures/ssr-leak/server/routes/api/admin/dashboard/summary.get.ts test/ssr-token-leak.gate.spec.ts && git commit -m "$(printf 'test(sso-admin-frontend): extend SSR leak gate to the dashboard summary DTO\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"`

---

## Phase 3 Definition of Done

- [ ] DTO + pure resolver + service + composable + metric group + page all implemented test-first (Tasks 3.1–3.5), each committed green.
- [ ] Page renders all five states: **loading** (`UiSkeleton`), **empty** (`UiEmptyState`, all-zero — distinct from forbidden), **error** (`UiStatusView` + redacted `REF-` support reference), **forbidden**/**unauthenticated** (`UiStatusView`), **success** (six `DashboardMetricGroup`s) — plus the partial/degraded banner.
- [ ] Permission-aware: meta `permissions: ['admin.dashboard.view']` (route-map test green); page also handles backend 401/403 defensively.
- [ ] Summary fetched via the `dashboardApi` **service** through `apiClient` — **no direct `fetch`/`$fetch`** in the page or components.
- [ ] **No raw metrics secret/token/PII** exposed: SSR leak gate green, extended to cover the summary DTO; page tests assert no `access_token`/`Bearer`/`SENTINEL-` strings and that raw request ids are redacted to `REF-XXXXXXXX`.
- [ ] Swiss discipline upheld: tokens-only, hairline (no shadow), single accent `#002FA7`, `danger` reserved for destructive/critical (routine lifecycle counts — disabled/deactivated/decommissioned — are neutral), status never color-alone, `--font-mono` only for raw IDs/correlation (timestamps/counts use condensed-sans `UiFolio`).
- [ ] Full gate green: `typecheck`, `lint`, `format:check`, `test`, `build` (Task 3.6).

### Out of scope (deferred, by design — avoid gold-plating)
- 30s background polling (the legacy `useAutoRefresh`): not required by the spec/standard. A manual `refresh` action is provided on the error and empty states; `isStale`/degraded handling already keeps a good snapshot on a failed refresh. Add polling only if a later requirement asks for it.
- Playwright e2e for `/dashboard`: handled at cutover (§10), not per-domain phase.
