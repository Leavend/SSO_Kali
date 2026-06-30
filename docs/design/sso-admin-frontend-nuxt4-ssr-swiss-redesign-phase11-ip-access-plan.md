# Phase 11 — IP Access Rules (admin allow/block list) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the admin **IP access rules** domain (list + create + delete of CIDR allow/block rules) from the legacy Vue SPA into the Nuxt 4 SSR rewrite, token-blind through the Nitro BFF, Swiss-styled, with the create + delete privileged-action matrix and the §3.3 SSR token-leak gate extended (strict — this DTO carries no token/secret/session-id/gov-PII).

**Architecture:** Same layered shape every prior domain phase uses — `types` → pure `lib` (view-state + tones + form validation/payload) → `services` api → `composables` SSR loader → `components` (table + create dialog) → `pages/ip-access.vue` (read surface + 2 write flows). Writes route through the shared `usePrivilegedAction` runner (`resolvePrivilegedActionFailure` matrix). Create is `:step_up`-gated (accent affordance); delete is **double-gated** (`write` + the backend session-management role, surfaced via `admin.sessions.terminate`) and is the **only** `--danger` affordance in the domain.

**Tech Stack:** Nuxt 4.4.8 (SSR, srcDir `app/`), Vue 3.5 SFC + TS strict, Vitest 4 + `@nuxt/test-utils` 4 (page specs in nuxt env via `*.page.nuxt.spec.ts`; lib/component/api specs in jsdom via `*.spec.ts`), reka-ui dialog primitives.

## Global Constraints

- **No traceability markers** (`OG#`, `UC###`, `FR###`, `BE-FR###`) anywhere — names, comments, tests, routes, locale keys, commits. Descriptive domain names only.
- **PII / secrets**: this domain has none in its DTO. Still — never render a raw exception `.message`, never render a raw `X-Request-Id` (only `formatSupportReference` → `REF-XXXXXXXX`).
- **§3.3 SSR leak gate**: no token / secret / raw-PII value or field-name in SSR HTML or `__NUXT_DATA__`. ip-access uses the **strict** collector (NO `allowSessionId`) — the DTO has no session id.
- **Swiss palette**: `--danger` (`#E4002B`) ONLY on the destructive delete affordance + inline form-validation text. Status is never colour-alone — every badge carries tone **and** label.
- **Backend is the security boundary.** The SPA is token-blind; the BFF injects the Bearer. Branch stays OFF `main` until the Phase 18 cutover.
- **Commit trailer** for every commit in this phase:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Run gates DIRECT (bypass rtk cache): `npx oxlint`, `npx eslint <changed .vue/.ts>`, `npm run typecheck`, and the task's spec file. The REAL format gate is `npx prettier --check --experimental-cli .` (plain `prettier --check .` false-reds on a pre-existing `UAT-admin-governance-checklist.md` — ignore that one).
- Every `vi.fn(...)` in a test needs a type parameter (oxlint `require-mock-type-parameters`), even if never called. Every `.toThrow(...)` needs a message argument.

---

## Backend contract (ground truth — overrides the legacy SPA on any disagreement)

| Action | Method + path (BFF) | Backend perms / middleware | Body | Success |
|---|---|---|---|---|
| List | `GET /api/admin/ip-access-rules` | `admin.ip-access.read`, MFA assurance | — | `200 { rules: IpAccessRule[] }` |
| Create | `POST /api/admin/ip-access-rules` | `admin.ip-access.write`, `EnsureFreshAdminAuth:step_up`, MFA | `StoreIpAccessRuleRequest` | `201 { rule: IpAccessRule }` |
| Delete | `DELETE /api/admin/ip-access-rules/{id}` (`id` = `[0-9]+`) | `admin.ip-access.write`, `:step_up`, MFA, **`RequireAdminSessionManagementRole`** | — | `204 No Content` |

- All three BFF paths are **already** allow-listed in `server/utils/admin-proxy.ts` (static `GET`/`POST` + a `DELETE …/[0-9]+` regex). **No proxy change is needed in this phase** — do not touch the proxy.
- **`IpAccessRule` DTO** (exact JSON fields): `id:number`, `cidr:string`, `mode:'allow'|'block'`, `reason:string|null`, `expires_at:string|null`, `actor_subject_id:string|null`, `created_at:string|null`, `updated_at:string|null`. No token/secret/gov-PII.
- **`StoreIpAccessRuleRequest` rules**: `cidr` required|string|max:45|regex `^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\/\d{1,2}$`; `mode` required|in:allow,block; `reason` **required**|string|max:1000; `expires_at` nullable|date|after:now.
- **Status codes that matter**: 422 (validation → Laravel `{message, errors}`; the `message` is generic but we still never render it — map to safe domain copy + client-side field errors); 428/412 (fresh-auth / MFA-assurance → step-up); 403 (perm or role); 404 (delete of a missing rule → falls through `resolvePrivilegedActionFailure` to generic `error`, acceptable — refresh reconciles).
- **Permissions on the frontend**: page-meta gate `admin.ip-access.read`; create form gated by `admin.ip-access.write`; delete gated by `write` **and** `admin.sessions.terminate` (the UI proxy for the backend's session-management role — the same double-gate pattern Phases 9 & 10 use).

## File Structure

| File | Responsibility |
|---|---|
| `app/types/ip-access.types.ts` (create) | The 8-field DTO + list/single responses + create payload. |
| `app/lib/ip-access/ip-access-view-state.ts` (create) | `resolveIpAccessViewState` (6 states) + `resolveModeTone` (Swiss: allow→success, block→warning). |
| `app/lib/ip-access/ip-access-form.ts` (create) | `IpAccessFormModel`, `validateIpAccessForm` (cidr/reason), `buildCreateRulePayload` (omit blank `expires_at`). |
| `app/services/ip-access.api.ts` (create) | `ipAccessApi.list/create/remove` (3 methods; `remove`, not `delete`). |
| `app/composables/useIpAccessRules.ts` (create) | `useAsyncData` SSR loader → `{ rules, viewState, isStale, requestId, pending, refresh }`. |
| `app/components/ip-access/IpAccessRulesTable.vue` (create) | Read-only table: cidr (clickable mono → select), mode badge, reason, created. |
| `app/components/ip-access/IpAccessRuleFormDialog.vue` (create) | Create-only form dialog (internal i18n), 4 fields + client validation + error/step-up surface. |
| `app/pages/ip-access.vue` (replace stub) | Read surface (6 states + detail drawer) + create flow + delete flow. |
| `app/locales/en.json` + `app/locales/id.json` (extend `ip_access` block) | Write-flow copy (kept at parity). |
| `test/fixtures/ssr-leak/server/routes/api/admin/ip-access-rules/index.get.ts` (create) | Masked rule list so the gate renders the page READY. |
| `test/fixtures/ssr-leak/server/routes/api/admin/me.get.ts` (modify) | Add `admin.ip-access.read` + `.write` caps. |
| `test/ssr-token-leak.gate.spec.ts` (modify) | `fetchIpAccess` + 3 strict it-blocks. |
| `e2e/ip-access.spec.ts` (replace legacy) | Authored; **run DEFERRED to Phase 18** (playwright still legacy-wired). |

---

### Task 11.1: Types + view-state + mode tone

**Files:**
- Create: `app/types/ip-access.types.ts`
- Create: `app/lib/ip-access/ip-access-view-state.ts`
- Test: `app/lib/ip-access/__tests__/ip-access-view-state.spec.ts`

**Interfaces:**
- Produces: `IpAccessMode = 'allow'|'block'`; `IpAccessRule`, `IpAccessListResponse`, `IpAccessRuleResponse`, `IpAccessRuleCreatePayload`; `IpAccessViewState`; `resolveIpAccessViewState({pending,error,rules})`; `resolveModeTone(mode): StatusTone`.

- [ ] **Step 1: Write the failing test**

```ts
// app/lib/ip-access/__tests__/ip-access-view-state.spec.ts
import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api/api-client'
import {
  resolveIpAccessViewState,
  resolveModeTone,
} from '@/lib/ip-access/ip-access-view-state'
import type { IpAccessRule } from '@/types/ip-access.types'

const RULE: IpAccessRule = {
  id: 1,
  cidr: '203.0.113.0/24',
  mode: 'block',
  reason: 'Maintenance window',
  expires_at: null,
  actor_subject_id: 'sub-admin',
  created_at: '2026-06-20T10:00:00Z',
  updated_at: '2026-06-20T10:00:00Z',
}

describe('resolveIpAccessViewState', () => {
  it('is loading when no rules and no error yet', () => {
    expect(resolveIpAccessViewState({ pending: true, error: null, rules: null })).toBe('loading')
  })
  it('maps 401 → unauthenticated, 403 → forbidden, other → error (only when no rules)', () => {
    const mk = (status: number) =>
      resolveIpAccessViewState({
        pending: false,
        error: new ApiError(status, 'x'),
        rules: null,
      })
    expect(mk(401)).toBe('unauthenticated')
    expect(mk(403)).toBe('forbidden')
    expect(mk(500)).toBe('error')
  })
  it('is empty for a zero-length list and ready when rules exist', () => {
    expect(resolveIpAccessViewState({ pending: false, error: null, rules: [] })).toBe('empty')
    expect(resolveIpAccessViewState({ pending: false, error: null, rules: [RULE] })).toBe('ready')
  })
  it('stays ready (stale) when an error arrives but cached rules exist', () => {
    expect(
      resolveIpAccessViewState({ pending: false, error: new ApiError(500, 'x'), rules: [RULE] }),
    ).toBe('ready')
  })
})

describe('resolveModeTone', () => {
  it('allow → success, block → warning (Swiss: danger is NOT a status colour)', () => {
    expect(resolveModeTone('allow')).toBe('success')
    expect(resolveModeTone('block')).toBe('warning')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/lib/ip-access/__tests__/ip-access-view-state.spec.ts`
Expected: FAIL — cannot resolve `@/types/ip-access.types` / `@/lib/ip-access/ip-access-view-state`.

- [ ] **Step 3a: Create the types**

```ts
// app/types/ip-access.types.ts
// IP access rule DTO — the EXACT backend shape (IpAccessRule model / API resource,
// 8 fields). No token, secret, session id, or gov-PII is serialized; cidr/reason/
// actor_subject_id are operational config + an opaque admin subject id.
export type IpAccessMode = 'allow' | 'block'

export type IpAccessRule = {
  readonly id: number
  readonly cidr: string
  readonly mode: IpAccessMode
  readonly reason: string | null
  readonly expires_at: string | null
  readonly actor_subject_id: string | null
  readonly created_at: string | null
  readonly updated_at: string | null
}

export type IpAccessListResponse = {
  readonly rules: readonly IpAccessRule[]
}

export type IpAccessRuleResponse = {
  readonly rule: IpAccessRule
}

// Create payload — reason is REQUIRED by StoreIpAccessRuleRequest; expires_at is
// omitted entirely when the operator leaves it blank (backend rule is nullable).
export type IpAccessRuleCreatePayload = {
  readonly cidr: string
  readonly mode: IpAccessMode
  readonly reason: string
  readonly expires_at?: string
}
```

- [ ] **Step 3b: Create the view-state + tone**

```ts
// app/lib/ip-access/ip-access-view-state.ts
import { ApiError } from '@/lib/api/api-client'
import type { StatusTone } from '@/lib/status-tone'
import type { IpAccessMode, IpAccessRule } from '@/types/ip-access.types'

export type IpAccessViewState =
  | 'loading'
  | 'unauthenticated'
  | 'forbidden'
  | 'error'
  | 'empty'
  | 'ready'

export function resolveIpAccessViewState({
  error,
  rules,
}: {
  readonly pending: boolean
  readonly error: unknown
  readonly rules: readonly IpAccessRule[] | null
}): IpAccessViewState {
  if (error && !rules) {
    const status = errorStatus(error)
    if (status === 401) return 'unauthenticated'
    if (status === 403) return 'forbidden'
    return 'error'
  }
  if (rules) return rules.length === 0 ? 'empty' : 'ready'
  return 'loading'
}

// Swiss: #E4002B/--danger is reserved for destructive affordances + inline
// validation, NOT for a benign mode badge. allow → success, block → warning
// (the badge carries both tone AND label; colour is never load-bearing). This is
// a deliberate divergence from the legacy SPA, which rendered block in danger-red.
export function resolveModeTone(mode: IpAccessMode): StatusTone {
  return mode === 'allow' ? 'success' : 'warning'
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

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/lib/ip-access/__tests__/ip-access-view-state.spec.ts`
Expected: PASS (7 assertions).

- [ ] **Step 5: Gates + commit**

Run: `npx oxlint && npm run typecheck`
Expected: 0 / 0.

```bash
git add app/types/ip-access.types.ts app/lib/ip-access/ip-access-view-state.ts app/lib/ip-access/__tests__/ip-access-view-state.spec.ts
git commit -m "feat(sso-admin-frontend): ip-access types + view-state + mode tone"
```

---

### Task 11.2: Form validation + create-payload builder

**Files:**
- Create: `app/lib/ip-access/ip-access-form.ts`
- Test: `app/lib/ip-access/__tests__/ip-access-form.spec.ts`

**Interfaces:**
- Consumes: `IpAccessMode`, `IpAccessRuleCreatePayload` (Task 11.1).
- Produces: `IpAccessFormModel`; `validateIpAccessForm(form): { valid, fieldErrors }`; `buildCreateRulePayload(form): IpAccessRuleCreatePayload`.

- [ ] **Step 1: Write the failing test**

```ts
// app/lib/ip-access/__tests__/ip-access-form.spec.ts
import { describe, expect, it } from 'vitest'
import {
  buildCreateRulePayload,
  validateIpAccessForm,
  type IpAccessFormModel,
} from '@/lib/ip-access/ip-access-form'

function model(overrides: Partial<IpAccessFormModel> = {}): IpAccessFormModel {
  return { cidr: '203.0.113.0/24', mode: 'block', reason: 'maint', expires_at: '', ...overrides }
}

describe('validateIpAccessForm', () => {
  it('passes a well-formed rule', () => {
    expect(validateIpAccessForm(model())).toEqual({ valid: true, fieldErrors: {} })
  })
  it('requires cidr and reason', () => {
    const r = validateIpAccessForm(model({ cidr: '   ', reason: '' }))
    expect(r.valid).toBe(false)
    expect(r.fieldErrors.cidr).toBe('required')
    expect(r.fieldErrors.reason).toBe('required')
  })
  it('rejects a malformed cidr (mirrors the backend regex)', () => {
    expect(validateIpAccessForm(model({ cidr: 'not-a-cidr' })).fieldErrors.cidr).toBe('pattern')
    expect(validateIpAccessForm(model({ cidr: '10.0.0.1' })).fieldErrors.cidr).toBe('pattern')
  })
  it('rejects a reason longer than 1000 chars', () => {
    expect(validateIpAccessForm(model({ reason: 'x'.repeat(1001) })).fieldErrors.reason).toBe('max')
  })
})

describe('buildCreateRulePayload', () => {
  it('trims and includes the required fields, omitting blank expires_at', () => {
    expect(buildCreateRulePayload(model({ cidr: ' 10.0.0.0/8 ', reason: '  hi  ' }))).toEqual({
      cidr: '10.0.0.0/8',
      mode: 'block',
      reason: 'hi',
    })
  })
  it('includes expires_at (trimmed) when present', () => {
    expect(
      buildCreateRulePayload(model({ expires_at: ' 2027-01-01T00:00:00Z ' })).expires_at,
    ).toBe('2027-01-01T00:00:00Z')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/lib/ip-access/__tests__/ip-access-form.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// app/lib/ip-access/ip-access-form.ts
import type { IpAccessMode, IpAccessRuleCreatePayload } from '@/types/ip-access.types'

export type IpAccessFormModel = {
  cidr: string
  mode: IpAccessMode
  reason: string
  expires_at: string
}

// Mirror StoreIpAccessRuleRequest: cidr is IPv4/prefix (the backend uses exactly
// this loose regex — no octet-range check — so the client matches it rather than
// rejecting inputs the backend would accept); reason is required, max 1000.
const CIDR_RE = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\/\d{1,2}$/u
const REASON_MAX = 1000

export function validateIpAccessForm(
  form: IpAccessFormModel,
): { valid: boolean; fieldErrors: Record<string, string> } {
  const fieldErrors: Record<string, string> = {}
  const cidr = form.cidr.trim()
  if (!cidr) fieldErrors.cidr = 'required'
  else if (!CIDR_RE.test(cidr)) fieldErrors.cidr = 'pattern'

  const reason = form.reason.trim()
  if (!reason) fieldErrors.reason = 'required'
  else if (reason.length > REASON_MAX) fieldErrors.reason = 'max'

  return { valid: Object.keys(fieldErrors).length === 0, fieldErrors }
}

export function buildCreateRulePayload(form: IpAccessFormModel): IpAccessRuleCreatePayload {
  const expires = form.expires_at.trim()
  return {
    cidr: form.cidr.trim(),
    mode: form.mode,
    reason: form.reason.trim(),
    ...(expires ? { expires_at: expires } : {}),
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/lib/ip-access/__tests__/ip-access-form.spec.ts`
Expected: PASS.

- [ ] **Step 5: Gates + commit**

Run: `npx oxlint && npm run typecheck` → 0 / 0.

```bash
git add app/lib/ip-access/ip-access-form.ts app/lib/ip-access/__tests__/ip-access-form.spec.ts
git commit -m "feat(sso-admin-frontend): ip-access form validation + create-payload builder"
```

---

### Task 11.3: API service (list / create / remove)

**Files:**
- Create: `app/services/ip-access.api.ts`
- Test: `app/services/__tests__/ip-access.api.spec.ts`

**Interfaces:**
- Consumes: `apiClient` (`get`/`post`/`delete`), `IpAccessListResponse`, `IpAccessRuleCreatePayload`, `IpAccessRuleResponse`.
- Produces: `ipAccessApi.list(): Promise<IpAccessListResponse>`, `ipAccessApi.create(payload): Promise<IpAccessRuleResponse>`, `ipAccessApi.remove(id: number): Promise<void>`.

- [ ] **Step 1: Write the failing test**

```ts
// app/services/__tests__/ip-access.api.spec.ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '@/lib/api/api-client'
import { ipAccessApi } from '@/services/ip-access.api'

afterEach(() => vi.restoreAllMocks())

describe('ipAccessApi', () => {
  it('list GETs the collection', async () => {
    const get = vi
      .spyOn(apiClient, 'get')
      .mockResolvedValue({ rules: [] } as never)
    await ipAccessApi.list()
    expect(get).toHaveBeenCalledWith('/api/admin/ip-access-rules')
  })

  it('create POSTs the payload', async () => {
    const post = vi
      .spyOn(apiClient, 'post')
      .mockResolvedValue({ rule: {} } as never)
    const payload = { cidr: '10.0.0.0/8', mode: 'block', reason: 'x' } as const
    await ipAccessApi.create(payload)
    expect(post).toHaveBeenCalledWith('/api/admin/ip-access-rules', payload)
  })

  it('remove DELETEs by numeric id', async () => {
    const del = vi
      .spyOn(apiClient, 'delete')
      .mockResolvedValue(undefined as never)
    await ipAccessApi.remove(42)
    expect(del).toHaveBeenCalledWith('/api/admin/ip-access-rules/42')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/services/__tests__/ip-access.api.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// app/services/ip-access.api.ts
import { apiClient } from '@/lib/api/api-client'
import type {
  IpAccessListResponse,
  IpAccessRuleCreatePayload,
  IpAccessRuleResponse,
} from '@/types/ip-access.types'

const BASE = '/api/admin/ip-access-rules'

export const ipAccessApi = {
  list(): Promise<IpAccessListResponse> {
    return apiClient.get<IpAccessListResponse>(BASE)
  },
  create(payload: IpAccessRuleCreatePayload): Promise<IpAccessRuleResponse> {
    return apiClient.post<IpAccessRuleResponse>(BASE, payload)
  },
  // id is the backend's numeric primary key (route param [0-9]+) — safe to
  // interpolate directly; no encodeURIComponent needed for a number.
  remove(id: number): Promise<void> {
    return apiClient.delete<void>(`${BASE}/${id}`)
  },
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/services/__tests__/ip-access.api.spec.ts`
Expected: PASS.

- [ ] **Step 5: Gates + commit**

Run: `npx oxlint && npm run typecheck` → 0 / 0.

```bash
git add app/services/ip-access.api.ts app/services/__tests__/ip-access.api.spec.ts
git commit -m "feat(sso-admin-frontend): ip-access api service (list/create/remove)"
```

---

### Task 11.4: `useIpAccessRules` SSR composable

**Files:**
- Create: `app/composables/useIpAccessRules.ts`
- Test: `app/composables/__tests__/useIpAccessRules.nuxt.spec.ts`

**Interfaces:**
- Consumes: `ipAccessApi.list`, `resolveIpAccessViewState`, `ApiError`/`getLastRequestId`.
- Produces: `useIpAccessRules(): { rules, viewState, isStale, requestId, pending, refresh }` (shapes mirror `useExternalIdpsList`).

- [ ] **Step 1: Write the failing test** (nuxt env — drives the `useAsyncData` refs directly, byte-mirroring the shipped `useExternalIdpsList.nuxt.spec.ts`; mock ONLY `list` so there is no bare `vi.fn()` to trip oxlint `require-mock-type-parameters`, and `ref` is a top-level import — NOT `require('vue')` inside the factory)

```ts
// app/composables/__tests__/useIpAccessRules.nuxt.spec.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { ApiError } from '@/lib/api/api-client'
import type { IpAccessRule } from '@/types/ip-access.types'

const listMock = vi.fn<() => Promise<unknown>>()
vi.mock('@/services/ip-access.api', () => ({ ipAccessApi: { list: listMock } }))

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

const { useIpAccessRules } = await import('../useIpAccessRules')

const RULE: IpAccessRule = {
  id: 1,
  cidr: '10.0.0.0/8',
  mode: 'block',
  reason: null,
  expires_at: null,
  actor_subject_id: null,
  created_at: null,
  updated_at: null,
}

beforeEach(() => {
  dataRef.value = null
  pendingRef.value = false
  errorRef.value = null
  listMock.mockReset()
  listMock.mockResolvedValue({ rules: [] })
})
afterEach(() => {
  vi.clearAllMocks()
})

describe('useIpAccessRules', () => {
  it('fetches the rule list', () => {
    useIpAccessRules()
    expect(listMock).toHaveBeenCalledTimes(1)
  })
  it('maps loading / empty / ready', () => {
    const r = useIpAccessRules()
    pendingRef.value = true
    expect(r.viewState.value).toBe('loading')
    pendingRef.value = false
    dataRef.value = { rules: [] }
    expect(r.viewState.value).toBe('empty')
    dataRef.value = { rules: [RULE] }
    expect(r.viewState.value).toBe('ready')
    expect(r.rules.value).toEqual([RULE])
  })
  it('keeps the last-good list and flags stale on a refresh error', () => {
    const r = useIpAccessRules()
    dataRef.value = { rules: [RULE] }
    errorRef.value = new ApiError(500, 'boom')
    expect(r.viewState.value).toBe('ready')
    expect(r.isStale.value).toBe(true)
  })
  it('surfaces the ApiError requestId', () => {
    const r = useIpAccessRules()
    errorRef.value = new ApiError(403, 'no', undefined, {}, 'req-ip')
    expect(r.requestId.value).toBe('req-ip')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/composables/__tests__/useIpAccessRules.nuxt.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** (byte-mirror of `useExternalIdpsList`, retargeted)

```ts
// app/composables/useIpAccessRules.ts
import { computed, type ComputedRef, type Ref } from 'vue'
import { ApiError, getLastRequestId } from '@/lib/api/api-client'
import { ipAccessApi } from '@/services/ip-access.api'
import {
  resolveIpAccessViewState,
  type IpAccessViewState,
} from '@/lib/ip-access/ip-access-view-state'
import type { IpAccessListResponse, IpAccessRule } from '@/types/ip-access.types'

export type UseIpAccessRulesReturn = {
  readonly rules: Ref<readonly IpAccessRule[] | null>
  readonly viewState: ComputedRef<IpAccessViewState>
  readonly isStale: ComputedRef<boolean>
  readonly requestId: ComputedRef<string | null>
  readonly pending: Ref<boolean>
  readonly refresh: () => Promise<void>
}

export function useIpAccessRules(): UseIpAccessRulesReturn {
  const { data, pending, error, refresh } = useAsyncData<IpAccessListResponse>(
    'admin-ip-access-rules',
    () => ipAccessApi.list(),
  )

  const rules = computed<readonly IpAccessRule[] | null>(() => data.value?.rules ?? null)

  const viewState = computed<IpAccessViewState>(() =>
    resolveIpAccessViewState({ pending: pending.value, error: error.value, rules: rules.value }),
  )

  const isStale = computed<boolean>(() => Boolean(error.value) && rules.value !== null)

  const requestId = computed<string | null>(() =>
    error.value instanceof ApiError
      ? (error.value.requestId ?? getLastRequestId())
      : getLastRequestId(),
  )

  return {
    rules,
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

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/composables/__tests__/useIpAccessRules.nuxt.spec.ts`
Expected: PASS.

- [ ] **Step 5: Gates + commit**

Run: `npx oxlint && npm run typecheck` → 0 / 0.

```bash
git add app/composables/useIpAccessRules.ts app/composables/__tests__/useIpAccessRules.nuxt.spec.ts
git commit -m "feat(sso-admin-frontend): useIpAccessRules SSR loader"
```

---

### Task 11.5: `IpAccessRulesTable` component

**Files:**
- Create: `app/components/ip-access/IpAccessRulesTable.vue`
- Test: `app/components/ip-access/__tests__/IpAccessRulesTable.spec.ts` (jsdom — explicit Ui imports)

**Interfaces:**
- Consumes: `IpAccessRule`, `resolveModeTone`, `UiDataList`/`UiStatusBadge`/`UiFolio`.
- Produces: props `{ rules, caption, cidrLabel, modeLabel, reasonLabel, createdLabel, allowText, blockText }`; emits `select(id: number)`. Per-row select button testid `ip-access-select-{id}`.

- [ ] **Step 1: Write the failing test**

```ts
// app/components/ip-access/__tests__/IpAccessRulesTable.spec.ts
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import IpAccessRulesTable from '@/components/ip-access/IpAccessRulesTable.vue'
import type { IpAccessRule } from '@/types/ip-access.types'

const RULES: readonly IpAccessRule[] = [
  {
    id: 7,
    cidr: '203.0.113.0/24',
    mode: 'block',
    reason: 'Maintenance window',
    expires_at: null,
    actor_subject_id: 'sub-admin',
    created_at: '2026-06-20T10:00:00Z',
    updated_at: '2026-06-20T10:00:00Z',
  },
]

function mountTable() {
  return mount(IpAccessRulesTable, {
    props: {
      rules: RULES,
      caption: 'IP access rules',
      cidrLabel: 'CIDR',
      modeLabel: 'Mode',
      reasonLabel: 'Reason',
      createdLabel: 'Created',
      allowText: 'Allow',
      blockText: 'Block',
    },
  })
}

describe('IpAccessRulesTable', () => {
  it('renders the cidr, reason, and a labelled mode badge', () => {
    const html = mountTable().html()
    expect(html).toContain('203.0.113.0/24')
    expect(html).toContain('Maintenance window')
    expect(html).toContain('Block') // mode label, not colour-alone
  })

  it('emits select(id) as a NUMBER when the cidr button is clicked', async () => {
    const wrapper = mountTable()
    await wrapper.find('[data-testid="ip-access-select-7"]').trigger('click')
    expect(wrapper.emitted('select')?.[0]).toEqual([7])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/components/ip-access/__tests__/IpAccessRulesTable.spec.ts`
Expected: FAIL — component not found.

- [ ] **Step 3: Implement**

```vue
<!-- app/components/ip-access/IpAccessRulesTable.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import UiDataList, {
  type UiDataListColumn,
  type UiDataListRow,
} from '@/components/ui/UiDataList.vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import UiFolio from '@/components/ui/UiFolio.vue'
import { resolveModeTone } from '@/lib/ip-access/ip-access-view-state'
import type { IpAccessRule } from '@/types/ip-access.types'

const props = defineProps<{
  readonly rules: readonly IpAccessRule[]
  readonly caption: string
  readonly cidrLabel: string
  readonly modeLabel: string
  readonly reasonLabel: string
  readonly createdLabel: string
  readonly allowText: string
  readonly blockText: string
}>()

const emit = defineEmits<{ (event: 'select', id: number): void }>()

const columns = computed<readonly UiDataListColumn[]>(() => [
  { key: 'cidr', label: props.cidrLabel, align: 'left' },
  { key: 'mode', label: props.modeLabel, align: 'left' },
  { key: 'reason', label: props.reasonLabel, align: 'left' },
  { key: 'created', label: props.createdLabel, align: 'right', variant: 'timestamp' },
])

// UiDataListRow.id is a string; the rule's numeric id is stringified for the row
// and parsed back to a number on select.
const rows = computed<readonly UiDataListRow[]>(() =>
  props.rules.map((rule) => ({
    id: String(rule.id),
    cidr: rule.cidr,
    mode: rule.mode,
    reason: rule.reason ?? '—',
    created: rule.created_at ?? '—',
  })),
)

function ruleById(id: number): IpAccessRule | undefined {
  return props.rules.find((rule) => rule.id === id)
}

function modeText(mode: string): string {
  return mode === 'allow' ? props.allowText : props.blockText
}
</script>

<template>
  <UiDataList :caption="caption" :columns="columns" :rows="rows">
    <template #cell(cidr)="{ row }">
      <button
        type="button"
        class="ip-access-table__select"
        :data-testid="`ip-access-select-${row.id}`"
        @click="emit('select', Number(row.id))"
      >
        <UiFolio :value="String(row['cidr'])" variant="id" />
      </button>
    </template>

    <template #cell(mode)="{ row }">
      <UiStatusBadge
        :tone="resolveModeTone(ruleById(Number(row.id))?.mode ?? 'block')"
        :label="modeText(String(row['mode']))"
      />
    </template>
  </UiDataList>
</template>

<style scoped>
.ip-access-table__select {
  appearance: none;
  padding: 0;
  background: none;
  border: none;
  font: inherit;
  color: var(--accent);
  cursor: pointer;
  text-align: left;
}
.ip-access-table__select:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/components/ip-access/__tests__/IpAccessRulesTable.spec.ts`
Expected: PASS.

- [ ] **Step 5: Gates + commit**

Run: `npx oxlint && npx eslint app/components/ip-access/IpAccessRulesTable.vue && npm run typecheck` → 0 / 0 / 0.

```bash
git add app/components/ip-access/IpAccessRulesTable.vue app/components/ip-access/__tests__/IpAccessRulesTable.spec.ts
git commit -m "feat(sso-admin-frontend): ip-access rules table (mode badge tone+label)"
```

---

### Task 11.6: Page read surface (states + table + detail drawer) + locale

**Files:**
- Modify (replace stub): `app/pages/ip-access.vue`
- Modify: `app/locales/en.json` + `app/locales/id.json` (extend `ip_access`)
- Test: `app/pages/__tests__/ip-access.page.nuxt.spec.ts`

**Interfaces:**
- Consumes: `useIpAccessRules`, `useSessionStore`, `useI18n`, `IpAccessRulesTable`, `UiSkeleton`/`UiStatusView`/`UiEmptyState`/`UiDetailDrawer`/`UiStatusBadge`/`UiFolio`/`UiButton`.
- Produces: the page shell + a `selectedRule` detail drawer. Write handlers are **declared as stubs** here (`onCreateRequested`, `onDeleteRequested`) and filled in 11.8 / 11.9 — declare them now so the template never references an undefined symbol.

**Locale keys to ADD to the `ip_access` block (en first, then mirror id at parity).** The block already has: `eyebrow, title, summary, loading, forbidden_title, error_title, empty_title, empty_desc, create_title, create_desc, rules_title, label_cidr, label_mode, label_reason, label_expires_at, btn_add_rule, btn_delete, col_cidr, col_mode, col_reason, col_created`. ADD:

```jsonc
// en.json — ip_access additions
"signed_in_as": "Signed in as {name}",
"list_caption": "IP access rules",
"mode_allow": "Allow",
"mode_block": "Block",
"col_expires": "Expires",
"never": "Never",
"ov_reason": "Reason",
"ov_expires": "Expires",
"ov_actor": "Added by",
"ov_created": "Created",
"ov_updated": "Updated",
"cidr_placeholder": "203.0.113.0/24",
"reason_placeholder": "Internal maintenance CIDR",
"create_success": "IP access rule added.",
"create_invalid": "The rule could not be saved. Check the CIDR, mode, and reason.",
"delete_success": "IP access rule deleted.",
"delete_invalid": "The rule could not be deleted.",
"confirm_delete_title": "Delete IP access rule",
"confirm_delete_desc": "Permanently remove the {mode} rule for {cidr}. This action is audited.",
"step_up_cta": "Re-verify to continue",
"field_required": "This field is required.",
"field_pattern": "Enter a valid CIDR, e.g. 203.0.113.0/24.",
"field_max": "Keep this under 1000 characters."
```

```jsonc
// id.json — ip_access additions (same keys, Indonesian copy, parity)
"signed_in_as": "Masuk sebagai {name}",
"list_caption": "Aturan akses IP",
"mode_allow": "Izinkan",
"mode_block": "Blokir",
"col_expires": "Kedaluwarsa",
"never": "Tidak ada",
"ov_reason": "Alasan",
"ov_expires": "Kedaluwarsa",
"ov_actor": "Ditambahkan oleh",
"ov_created": "Dibuat",
"ov_updated": "Diperbarui",
"cidr_placeholder": "203.0.113.0/24",
"reason_placeholder": "CIDR untuk pemeliharaan internal",
"create_success": "Aturan akses IP ditambahkan.",
"create_invalid": "Aturan tidak dapat disimpan. Periksa CIDR, mode, dan alasan.",
"delete_success": "Aturan akses IP dihapus.",
"delete_invalid": "Aturan tidak dapat dihapus.",
"confirm_delete_title": "Hapus aturan akses IP",
"confirm_delete_desc": "Hapus permanen aturan {mode} untuk {cidr}. Tindakan ini diaudit.",
"step_up_cta": "Verifikasi ulang untuk melanjutkan",
"field_required": "Bidang ini wajib diisi.",
"field_pattern": "Masukkan CIDR yang valid, mis. 203.0.113.0/24.",
"field_max": "Maksimal 1000 karakter."
```

- [ ] **Step 1: Write the failing test**

```ts
// app/pages/__tests__/ip-access.page.nuxt.spec.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import enLocale from '@/locales/en.json'
import type { IpAccessRule } from '@/types/ip-access.types'

vi.mock('@/services/ip-access.api', () => ({
  ipAccessApi: {
    list: vi.fn<() => Promise<unknown>>(),
    create: vi.fn<(p: unknown) => Promise<unknown>>(),
    remove: vi.fn<(id: number) => Promise<void>>(),
  },
}))

const RULE: IpAccessRule = {
  id: 7,
  cidr: '203.0.113.0/24',
  mode: 'block',
  reason: 'Maintenance window',
  expires_at: null,
  actor_subject_id: 'sub-admin-7',
  created_at: '2026-06-20T10:00:00Z',
  updated_at: '2026-06-20T10:00:00Z',
}
const rulesRef = ref<readonly IpAccessRule[] | null>([RULE])
const viewStateRef = ref<'loading' | 'forbidden' | 'unauthenticated' | 'error' | 'empty' | 'ready'>(
  'ready',
)
vi.mock('@/composables/useIpAccessRules', () => ({
  useIpAccessRules: () => ({
    rules: rulesRef,
    viewState: computed(() => viewStateRef.value),
    isStale: computed(() => false),
    requestId: computed(() => null),
    pending: ref(false),
    refresh: vi.fn<() => Promise<void>>(async () => {}),
  }),
}))

let permitted: string[] = []
vi.mock('@/stores/session.store', () => ({
  useSessionStore: () => ({
    principal: { display_name: 'Admin', subject_id: 'a1' },
    ensureSession: vi.fn<() => Promise<string>>(async () => 'authenticated'),
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
      return params
        ? val.replace(/\{(\w+)\}/gu, (_: string, k: string) => String(params[k] ?? ''))
        : val
    },
  }),
}))
mockNuxtImport('navigateTo', () => vi.fn<(...a: unknown[]) => Promise<void>>(async () => {}))
const Page = (await import('../ip-access.vue')).default

beforeEach(() => {
  permitted = ['admin.ip-access.read']
  rulesRef.value = [RULE]
  viewStateRef.value = 'ready'
})
afterEach(() => vi.clearAllMocks())

describe('ip-access page — read surface', () => {
  it('renders the table with the rule + Swiss mode label', async () => {
    const wrapper = await mountSuspended(Page)
    expect(wrapper.find('[data-page="ip-access"]').exists()).toBe(true)
    expect(wrapper.html()).toContain('203.0.113.0/24')
    expect(wrapper.html()).toContain(enLocale.ip_access.mode_block)
  })

  it('hides the Add button without write permission', async () => {
    const wrapper = await mountSuspended(Page)
    expect(wrapper.find('[data-testid="ip-access-create"]').exists()).toBe(false)
  })

  it('shows the Add button with write permission', async () => {
    permitted = ['admin.ip-access.read', 'admin.ip-access.write']
    const wrapper = await mountSuspended(Page)
    expect(wrapper.find('[data-testid="ip-access-create"]').exists()).toBe(true)
  })

  it('opens the detail drawer on select and shows reason + actor', async () => {
    const wrapper = await mountSuspended(Page)
    await wrapper.find('[data-testid="ip-access-select-7"]').trigger('click')
    await flushPromises()
    const drawer = wrapper.find('[data-testid="ip-access-detail"]')
    expect(drawer.exists()).toBe(true)
    expect(drawer.text()).toContain('Maintenance window')
    expect(drawer.text()).toContain('sub-admin-7')
  })

  it('hides the drawer Delete button without the double gate', async () => {
    permitted = ['admin.ip-access.read', 'admin.ip-access.write'] // missing sessions.terminate
    const wrapper = await mountSuspended(Page)
    await wrapper.find('[data-testid="ip-access-select-7"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="ip-access-delete"]').exists()).toBe(false)
  })

  it('renders the empty state when there are no rules', async () => {
    rulesRef.value = []
    viewStateRef.value = 'empty'
    const wrapper = await mountSuspended(Page)
    expect(wrapper.text()).toContain(enLocale.ip_access.empty_title)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/pages/__tests__/ip-access.page.nuxt.spec.ts`
Expected: FAIL — the stub page renders only `<h1>IP access</h1>`; no `data-page`, table, or drawer.

- [ ] **Step 3a: Extend the locale blocks** per the JSON above (en.json + id.json). Keep the existing keys; add the new ones. Confirm both blocks have identical key sets.

- [ ] **Step 3b: Replace the page** (read surface only — write handlers stubbed)

```vue
<!-- app/pages/ip-access.vue -->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useSessionStore } from '@/stores/session.store'
import { useI18n } from '@/composables/useI18n'
import { useIpAccessRules } from '@/composables/useIpAccessRules'
import { resolveModeTone } from '@/lib/ip-access/ip-access-view-state'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import UiFolio from '@/components/ui/UiFolio.vue'
import UiDetailDrawer from '@/components/ui/UiDetailDrawer.vue'
import IpAccessRulesTable from '@/components/ip-access/IpAccessRulesTable.vue'
import type { IpAccessRule } from '@/types/ip-access.types'

definePageMeta({
  name: 'admin.ip-access',
  layout: 'admin',
  requiresAdmin: true,
  permissions: ['admin.ip-access.read'],
})

const { t } = useI18n()
const store = useSessionStore()

await useAsyncData('admin-ip-access-principal', () => store.ensureSession())

const { rules, viewState, requestId, isStale, refresh } = useIpAccessRules()

const ruleList = computed<readonly IpAccessRule[]>(() => rules.value ?? [])

const canWrite = computed<boolean>(() => store.hasPermission('admin.ip-access.write'))
// Delete is double-gated: write + sessions.terminate (the backend also requires
// the session-management role, enforced server-side and invisible to the UI).
const canDelete = computed<boolean>(
  () => canWrite.value && store.hasPermission('admin.sessions.terminate'),
)

const selectedId = ref<number | null>(null)
const selectedRule = computed<IpAccessRule | null>(
  () => ruleList.value.find((r) => r.id === selectedId.value) ?? null,
)

const successMessage = ref<string | null>(null)

const modeLabels = computed<Readonly<Record<string, string>>>(() => ({
  allow: t('ip_access.mode_allow'),
  block: t('ip_access.mode_block'),
}))

function onSelectRule(id: number): void {
  selectedId.value = id
}
function onCloseDrawer(): void {
  selectedId.value = null
}
async function onRefresh(): Promise<void> {
  await refresh()
}

// Write handlers — declared as stubs here so the template binds a stable symbol;
// bodies are implemented in Task 11.8 (create) and Task 11.9 (delete).
function onCreateRequested(): void {
  // implemented in 11.8
}
function onDeleteRequested(_rule: IpAccessRule): void {
  // implemented in 11.9
}
</script>

<template>
  <section class="ip-access" data-page="ip-access" data-admin-shell>
    <header class="ip-access__hero">
      <span class="ip-access__eyebrow">{{ t('ip_access.eyebrow') }}</span>
      <div class="ip-access__heading">
        <div>
          <h1 class="ip-access__title">{{ t('ip_access.title') }}</h1>
          <p class="ip-access__summary">{{ t('ip_access.summary') }}</p>
          <p class="ip-access__principal" data-principal-name>
            {{ t('ip_access.signed_in_as', { name: store.principal?.display_name ?? '—' }) }}
          </p>
        </div>
        <UiButton
          v-if="canWrite"
          variant="primary"
          size="sm"
          data-testid="ip-access-create"
          @click="onCreateRequested"
        >
          {{ t('ip_access.btn_add_rule') }}
        </UiButton>
      </div>
    </header>

    <p
      v-if="successMessage"
      class="ip-access__success"
      role="status"
      aria-live="polite"
      data-testid="ip-access-action-success"
    >
      {{ successMessage }}
    </p>

    <UiSkeleton v-if="viewState === 'loading'" :rows="6" :label="t('ip_access.loading')" />

    <UiStatusView
      v-else-if="viewState === 'forbidden'"
      tone="forbidden"
      :eyebrow="t('ip_access.eyebrow')"
      :title="t('ip_access.forbidden_title')"
      :description="t('common.forbidden_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="viewState === 'unauthenticated'"
      tone="step_up"
      :eyebrow="t('ip_access.eyebrow')"
      :title="t('common.session_expired_title')"
      :description="t('common.session_expired_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="viewState === 'error'"
      tone="error"
      :eyebrow="t('ip_access.eyebrow')"
      :title="t('ip_access.error_title')"
      :description="t('common.error_loading_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    >
      <template #actions>
        <UiButton variant="secondary" size="sm" data-testid="ip-access-refresh" @click="onRefresh">
          {{ t('common.btn_refresh') }}
        </UiButton>
      </template>
    </UiStatusView>

    <UiEmptyState
      v-else-if="viewState === 'empty'"
      :title="t('ip_access.empty_title')"
      :description="t('ip_access.empty_desc')"
    />

    <template v-else>
      <div v-if="isStale" class="ip-access__banner" role="status">
        {{ t('common.error_loading_desc') }}
      </div>

      <IpAccessRulesTable
        :rules="ruleList"
        :caption="t('ip_access.list_caption')"
        :cidr-label="t('ip_access.col_cidr')"
        :mode-label="t('ip_access.col_mode')"
        :reason-label="t('ip_access.col_reason')"
        :created-label="t('ip_access.col_created')"
        :allow-text="t('ip_access.mode_allow')"
        :block-text="t('ip_access.mode_block')"
        @select="onSelectRule"
      />

      <UiDetailDrawer
        v-if="selectedRule"
        :open="selectedRule !== null"
        title-id="ip-access-detail-drawer"
        :title="selectedRule.cidr"
        :description="modeLabels[selectedRule.mode] ?? selectedRule.mode"
        :close-label="t('common.close')"
        @close="onCloseDrawer"
      >
        <div class="ip-detail" data-testid="ip-access-detail">
          <div class="ip-detail__head">
            <UiStatusBadge
              :tone="resolveModeTone(selectedRule.mode)"
              :label="modeLabels[selectedRule.mode] ?? selectedRule.mode"
            />
          </div>
          <dl class="ip-detail__grid">
            <div class="ip-detail__wide">
              <dt>{{ t('ip_access.ov_reason') }}</dt>
              <dd>{{ selectedRule.reason ?? '—' }}</dd>
            </div>
            <div>
              <dt>{{ t('ip_access.ov_expires') }}</dt>
              <dd>
                <UiFolio
                  v-if="selectedRule.expires_at"
                  :value="selectedRule.expires_at"
                  variant="timestamp"
                />
                <span v-else>{{ t('ip_access.never') }}</span>
              </dd>
            </div>
            <div>
              <dt>{{ t('ip_access.ov_actor') }}</dt>
              <dd><UiFolio :value="selectedRule.actor_subject_id ?? '—'" variant="id" /></dd>
            </div>
            <div>
              <dt>{{ t('ip_access.ov_created') }}</dt>
              <dd><UiFolio :value="selectedRule.created_at ?? '—'" variant="timestamp" /></dd>
            </div>
            <div>
              <dt>{{ t('ip_access.ov_updated') }}</dt>
              <dd><UiFolio :value="selectedRule.updated_at ?? '—'" variant="timestamp" /></dd>
            </div>
          </dl>

          <div v-if="canDelete" class="ip-detail__actions">
            <UiButton
              variant="danger"
              size="sm"
              data-testid="ip-access-delete"
              @click="onDeleteRequested(selectedRule)"
            >
              {{ t('common.btn_delete') }}
            </UiButton>
          </div>
        </div>
      </UiDetailDrawer>
    </template>
  </section>
</template>

<style scoped>
.ip-access {
  display: grid;
  gap: 24px;
  padding: 24px;
}
.ip-access__hero {
  display: grid;
  gap: 6px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border);
}
.ip-access__heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.ip-access__eyebrow {
  font: 600 0.6875rem/1 var(--font-sans);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.ip-access__title {
  margin: 0;
  font: 600 1.5rem/1.2 var(--font-sans);
  letter-spacing: -0.02em;
  color: var(--fg);
}
.ip-access__summary,
.ip-access__principal {
  margin: 0;
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--fg-2);
}
.ip-access__success {
  margin: 0;
  padding: 10px 14px;
  font: 500 0.8125rem/1.4 var(--font-sans);
  color: var(--fg);
  background: var(--card);
  border: 1px solid var(--border);
}
.ip-access__banner {
  padding: 10px 14px;
  font: 500 0.8125rem/1.4 var(--font-sans);
  color: var(--warning-soft-fg);
  background: var(--warning-soft);
  border: 1px solid var(--warning-soft-fg);
}
.ip-detail {
  display: grid;
  gap: 16px;
}
.ip-detail__head {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.ip-detail__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 16px;
  margin: 0;
}
.ip-detail__wide {
  grid-column: 1 / -1;
}
.ip-detail__grid dt {
  font: 600 0.625rem/1.2 var(--font-sans);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.ip-detail__grid dd {
  margin: 2px 0 0;
  font: 400 0.8125rem/1.4 var(--font-sans);
  color: var(--fg);
  overflow-wrap: anywhere;
}
.ip-detail__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border);
}
</style>
```

> Implementer note: `onCreateRequested` / `onDeleteRequested` are intentionally empty stubs in this task (the lint rule against unused params is satisfied by the `_rule` prefix). They are NOT exported and will be fleshed out in 11.8/11.9; do not delete the `successMessage` ref — 11.8/11.9 write to it. If oxlint flags the empty function bodies, add a single `// ponytail:` line inside each noting it's filled by the next task.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/pages/__tests__/ip-access.page.nuxt.spec.ts`
Expected: PASS (6 it-blocks).

- [ ] **Step 5: Gates + commit**

Run: `npx oxlint && npx eslint app/pages/ip-access.vue && npm run typecheck` → 0 / 0 / 0.
Run (locale parity sanity): `node -e "const e=require('./app/locales/en.json'),i=require('./app/locales/id.json');const a=Object.keys(e.ip_access).sort(),b=Object.keys(i.ip_access).sort();console.log(JSON.stringify(a)===JSON.stringify(b)?'PARITY OK':'MISMATCH')"` → `PARITY OK`.

```bash
git add app/pages/ip-access.vue app/pages/__tests__/ip-access.page.nuxt.spec.ts app/locales/en.json app/locales/id.json
git commit -m "feat(sso-admin-frontend): ip-access read surface (states + table + detail drawer)"
```

---

### Task 11.7: `IpAccessRuleFormDialog` (create-only)

**Files:**
- Create: `app/components/ip-access/IpAccessRuleFormDialog.vue`
- Test: `app/components/ip-access/__tests__/IpAccessRuleFormDialog.nuxt.spec.ts` (**nuxt env** — the dialog teleports its content via reka-ui, so it must mount under `mountSuspended`, exactly like the shipped `ExternalIdpFormDialog.nuxt.spec.ts`; a jsdom `mount` would not find the teleported form)

**Interfaces:**
- Consumes: `validateIpAccessForm`, `buildCreateRulePayload`, `IpAccessFormModel`, `useI18n`, `formatSupportReference`, `UiDialog`/`UiFormField`/`UiInput`/`UiSelect`/`UiButton`.
- Produces: props `{ open, submitting?, errorMessage?, stepUpUrl?, requestId? }`; emits `submit(payload: IpAccessRuleCreatePayload)` + `cancel`. Re-seeds a blank model on each open (`mode` defaults `'block'`). Field testids `ip-access-field-{cidr,mode,reason,expires_at}`; submit `ip-access-form-submit`; error `ip-access-form-error`; ref `ip-access-form-ref`; step-up `ip-access-form-stepup`.

- [ ] **Step 1: Write the failing test**

```ts
// app/components/ip-access/__tests__/IpAccessRuleFormDialog.nuxt.spec.ts
// Mirrors the shipped ExternalIdpFormDialog.nuxt.spec.ts: nuxt env (mountSuspended,
// for the teleported dialog), t returns the key, and submit is triggered on the
// FORM element (a bare <button type=submit> click does NOT fire @submit.prevent in
// this test env — proven by the shipped dialog tests).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import IpAccessRuleFormDialog from '../IpAccessRuleFormDialog.vue'
import type { IpAccessRuleCreatePayload } from '@/types/ip-access.types'

vi.mock('@/composables/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

afterEach(() => {
  vi.clearAllMocks()
})

describe('IpAccessRuleFormDialog — create', () => {
  it('blocks submit and surfaces field errors on empty required fields', async () => {
    const wrapper = await mountSuspended(IpAccessRuleFormDialog, { props: { open: true } })
    await wrapper.find('[data-testid="ip-access-form"]').trigger('submit')
    expect(wrapper.emitted('submit')).toBeFalsy()
    expect(wrapper.find('[data-testid="ip-access-form"]').text()).toContain(
      'ip_access.field_required',
    )
  })

  it('emits a built create payload for a valid form (default mode block)', async () => {
    const wrapper = await mountSuspended(IpAccessRuleFormDialog, { props: { open: true } })
    await wrapper.find('[data-testid="ip-access-field-cidr"]').setValue('203.0.113.0/24')
    await wrapper.find('[data-testid="ip-access-field-reason"]').setValue('maintenance')
    await wrapper.find('[data-testid="ip-access-form"]').trigger('submit')
    const events = wrapper.emitted('submit')
    expect(events).toBeTruthy()
    expect(events![0]![0] as IpAccessRuleCreatePayload).toEqual({
      cidr: '203.0.113.0/24',
      mode: 'block',
      reason: 'maintenance',
    })
  })

  it('renders a SAFE error banner + redacted REF (never the raw request id)', async () => {
    const wrapper = await mountSuspended(IpAccessRuleFormDialog, {
      props: {
        open: true,
        errorMessage: 'The rule could not be saved.',
        requestId: 'req-abc12345',
      },
    })
    expect(wrapper.find('[data-testid="ip-access-form-error"]').text()).toContain(
      'The rule could not be saved.',
    )
    expect(wrapper.find('[data-testid="ip-access-form-ref"]').text()).toMatch(/^REF-/u)
    expect(wrapper.html()).not.toContain('req-abc12345')
  })

  it('renders a step-up link when stepUpUrl is set', async () => {
    const wrapper = await mountSuspended(IpAccessRuleFormDialog, {
      props: { open: true, stepUpUrl: 'https://idp.example/step-up' },
    })
    expect(wrapper.find('[data-testid="ip-access-form-stepup"]').attributes('href')).toBe(
      'https://idp.example/step-up',
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/components/ip-access/__tests__/IpAccessRuleFormDialog.nuxt.spec.ts`
Expected: FAIL — component not found.

- [ ] **Step 3: Implement**

```vue
<!-- app/components/ip-access/IpAccessRuleFormDialog.vue -->
<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import UiDialog from '@/components/ui/UiDialog.vue'
import UiFormField from '@/components/ui/UiFormField.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiSelect, { type UiSelectOption } from '@/components/ui/UiSelect.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { useI18n } from '@/composables/useI18n'
import {
  buildCreateRulePayload,
  validateIpAccessForm,
  type IpAccessFormModel,
} from '@/lib/ip-access/ip-access-form'
import { formatSupportReference } from '@/lib/display-identifiers'
import type { IpAccessRuleCreatePayload } from '@/types/ip-access.types'

const props = withDefaults(
  defineProps<{
    readonly open: boolean
    readonly submitting?: boolean
    readonly errorMessage?: string | null
    readonly stepUpUrl?: string | null
    readonly requestId?: string | null
  }>(),
  { submitting: false, errorMessage: null, stepUpUrl: null, requestId: null },
)

const emit = defineEmits<{
  (event: 'submit', payload: IpAccessRuleCreatePayload): void
  (event: 'cancel'): void
}>()

const { t } = useI18n()

function blank(): IpAccessFormModel {
  return { cidr: '', mode: 'block', reason: '', expires_at: '' }
}

const form = reactive<IpAccessFormModel>(blank())
const submitAttempted = ref(false)

// Re-seed blank on every (re)open so a previous draft never bleeds into the next.
watch(
  () => props.open,
  (open) => {
    if (!open) return
    Object.assign(form, blank())
    submitAttempted.value = false
  },
  { immediate: true },
)

// UiSelect models a string; bridge it to the IpAccessMode union.
const modeModel = computed<string>({
  get: () => form.mode,
  set: (value) => {
    form.mode = value === 'allow' ? 'allow' : 'block'
  },
})
const modeOptions = computed<readonly UiSelectOption[]>(() => [
  { value: 'allow', label: t('ip_access.mode_allow') },
  { value: 'block', label: t('ip_access.mode_block') },
])

const validation = computed(() => validateIpAccessForm(form))

function fieldError(field: string): string | undefined {
  if (!submitAttempted.value) return undefined
  const code = validation.value.fieldErrors[field]
  return code ? t(`ip_access.field_${code}`) : undefined
}

const reference = computed(() => (props.requestId ? formatSupportReference(props.requestId) : null))
const canSubmit = computed(() => validation.value.valid && !props.submitting)

function onSubmit(): void {
  submitAttempted.value = true
  if (!validation.value.valid || props.submitting) return
  emit('submit', buildCreateRulePayload(form))
}
</script>

<template>
  <UiDialog
    :open="open"
    title-id="ip-access-form-dialog"
    :title="t('ip_access.create_title')"
    :description="t('ip_access.create_desc')"
    :close-label="t('common.btn_cancel')"
    @close="emit('cancel')"
  >
    <form class="ip-form" data-testid="ip-access-form" @submit.prevent="onSubmit">
      <UiFormField
        id="ip_cidr"
        :label="t('ip_access.label_cidr')"
        :error="fieldError('cidr')"
        required
      >
        <UiInput
          id="ip_cidr"
          v-model="form.cidr"
          data-testid="ip-access-field-cidr"
          autocomplete="off"
          :placeholder="t('ip_access.cidr_placeholder')"
          :invalid="Boolean(fieldError('cidr'))"
        />
      </UiFormField>

      <UiFormField id="ip_mode" :label="t('ip_access.label_mode')">
        <UiSelect
          id="ip_mode"
          v-model="modeModel"
          :options="modeOptions"
          data-testid="ip-access-field-mode"
        />
      </UiFormField>

      <UiFormField
        id="ip_reason"
        :label="t('ip_access.label_reason')"
        :error="fieldError('reason')"
        required
      >
        <UiInput
          id="ip_reason"
          v-model="form.reason"
          data-testid="ip-access-field-reason"
          autocomplete="off"
          :placeholder="t('ip_access.reason_placeholder')"
          :invalid="Boolean(fieldError('reason'))"
        />
      </UiFormField>

      <UiFormField id="ip_expires" :label="t('ip_access.label_expires_at')">
        <UiInput
          id="ip_expires"
          v-model="form.expires_at"
          type="date"
          data-testid="ip-access-field-expires_at"
          autocomplete="off"
        />
      </UiFormField>

      <p v-if="errorMessage" class="ip-form__error" role="alert" data-testid="ip-access-form-error">
        {{ errorMessage }}
        <span v-if="reference" class="ip-form__ref" data-testid="ip-access-form-ref">{{
          reference
        }}</span>
      </p>

      <a
        v-if="stepUpUrl"
        class="ip-form__step-up"
        :href="stepUpUrl"
        data-testid="ip-access-form-stepup"
      >
        {{ t('ip_access.step_up_cta') }}
      </a>

      <div class="ip-form__actions">
        <UiButton type="button" variant="ghost" size="sm" @click="emit('cancel')">
          {{ t('common.btn_cancel') }}
        </UiButton>
        <UiButton
          type="submit"
          variant="primary"
          size="sm"
          :disabled="!canSubmit"
          data-testid="ip-access-form-submit"
        >
          {{ t('common.btn_save') }}
        </UiButton>
      </div>
    </form>
  </UiDialog>
</template>

<style scoped>
.ip-form {
  display: grid;
  gap: 14px;
}
.ip-form__error {
  margin: 0;
  font: 500 0.75rem/1.4 var(--font-sans);
  color: var(--danger);
}
.ip-form__ref {
  margin-left: 6px;
  font-family: var(--font-mono);
  color: var(--fg-3);
}
.ip-form__step-up {
  font: 600 0.8125rem/1 var(--font-sans);
  color: var(--accent);
  text-decoration: underline;
}
.ip-form__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
```

> Implementer note: `IpAccessMode` is intentionally NOT imported here — the `modeModel` setter assigns the string literals `'allow'`/`'block'` (narrowed to `IpAccessMode` by `form.mode`'s declared type), so the type identifier is never referenced and importing it would fail `noUnusedLocals`/oxlint. Only `IpAccessRuleCreatePayload` is imported.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/components/ip-access/__tests__/IpAccessRuleFormDialog.nuxt.spec.ts`
Expected: PASS (4 it-blocks).

- [ ] **Step 5: Gates + commit**

Run: `npx oxlint && npx eslint app/components/ip-access/IpAccessRuleFormDialog.vue && npm run typecheck` → 0 / 0 / 0.

```bash
git add app/components/ip-access/IpAccessRuleFormDialog.vue app/components/ip-access/__tests__/IpAccessRuleFormDialog.nuxt.spec.ts
git commit -m "feat(sso-admin-frontend): ip-access create form dialog (client-validated, step-up aware)"
```

---

### Task 11.8: Create flow wiring (page)

**Files:**
- Modify: `app/pages/ip-access.vue`
- Test: `app/pages/__tests__/ip-access-create.page.nuxt.spec.ts`

**Interfaces:**
- Consumes: `usePrivilegedAction`, `ipAccessApi.create`, `IpAccessRuleFormDialog`, `IpAccessRuleCreatePayload`, `IpAccessRuleResponse`.
- Produces: a wired `onCreateRequested` (opens the dialog) + `onFormSubmit` + `onFormCancel`; the `<IpAccessRuleFormDialog>` mounted at page root; `formError` (status-keyed; `invalid` → `create_invalid`, never `.message`).

- [ ] **Step 1: Write the failing test**

```ts
// app/pages/__tests__/ip-access-create.page.nuxt.spec.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import enLocale from '@/locales/en.json'
import { ApiError } from '@/lib/api/api-client'
import type { IpAccessRule } from '@/types/ip-access.types'

const createMock = vi.fn<(p: unknown) => Promise<unknown>>()
vi.mock('@/services/ip-access.api', () => ({
  ipAccessApi: {
    list: vi.fn<() => Promise<unknown>>(),
    create: createMock,
    remove: vi.fn<(id: number) => Promise<void>>(),
  },
}))

const RULE: IpAccessRule = {
  id: 7,
  cidr: '203.0.113.0/24',
  mode: 'block',
  reason: 'maint',
  expires_at: null,
  actor_subject_id: 'sub-a',
  created_at: null,
  updated_at: null,
}
const rulesRef = ref<readonly IpAccessRule[] | null>([RULE])
const refreshMock = vi.fn<() => Promise<void>>(async () => {})
vi.mock('@/composables/useIpAccessRules', () => ({
  useIpAccessRules: () => ({
    rules: rulesRef,
    viewState: computed(() => 'ready' as const),
    isStale: computed(() => false),
    requestId: computed(() => null),
    pending: ref(false),
    refresh: refreshMock,
  }),
}))
let permitted: string[] = []
vi.mock('@/stores/session.store', () => ({
  useSessionStore: () => ({
    principal: { display_name: 'Admin', subject_id: 'a1' },
    ensureSession: vi.fn<() => Promise<string>>(async () => 'authenticated'),
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
      return params
        ? val.replace(/\{(\w+)\}/gu, (_: string, k: string) => String(params[k] ?? ''))
        : val
    },
  }),
}))
mockNuxtImport('navigateTo', () => vi.fn<(...a: unknown[]) => Promise<void>>(async () => {}))
const Page = (await import('../ip-access.vue')).default

async function openForm(wrapper: Awaited<ReturnType<typeof mountSuspended>>) {
  await wrapper.find('[data-testid="ip-access-create"]').trigger('click')
  await flushPromises()
}
async function fillValid(wrapper: Awaited<ReturnType<typeof mountSuspended>>) {
  await wrapper.find('[data-testid="ip-access-field-cidr"]').setValue('203.0.113.0/24')
  await wrapper.find('[data-testid="ip-access-field-reason"]').setValue('maintenance')
}

beforeEach(() => {
  permitted = ['admin.ip-access.read', 'admin.ip-access.write']
  rulesRef.value = [RULE]
  createMock.mockReset()
  refreshMock.mockReset()
})
afterEach(() => vi.clearAllMocks())

describe('ip-access create flow', () => {
  it('submits, refreshes, and reports success', async () => {
    createMock.mockResolvedValue({ rule: RULE })
    const wrapper = await mountSuspended(Page)
    await openForm(wrapper)
    await fillValid(wrapper)
    await wrapper.find('[data-testid="ip-access-form"]').trigger('submit')
    await flushPromises()
    expect(createMock).toHaveBeenCalledWith({
      cidr: '203.0.113.0/24',
      mode: 'block',
      reason: 'maintenance',
    })
    expect(refreshMock).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="ip-access-action-success"]').text()).toBe(
      enLocale.ip_access.create_success,
    )
  })

  it('maps a 422 to SAFE copy (never the raw message) and does not refresh', async () => {
    createMock.mockRejectedValue(
      new ApiError(422, 'SQLSTATE[23000]: duplicate key', 'validation', {}, 'req-422'),
    )
    const wrapper = await mountSuspended(Page)
    await openForm(wrapper)
    await fillValid(wrapper)
    await wrapper.find('[data-testid="ip-access-form"]').trigger('submit')
    await flushPromises()
    expect(wrapper.find('[data-testid="ip-access-form-error"]').text()).toContain(
      enLocale.ip_access.create_invalid,
    )
    expect(wrapper.html()).not.toContain('SQLSTATE')
    expect(wrapper.html()).not.toContain('req-422')
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('surfaces step-up on 428', async () => {
    createMock.mockRejectedValue(
      new ApiError(428, 'reauth', 'reauth_required', { step_up_url: 'https://idp.example/up' }, 'r'),
    )
    const wrapper = await mountSuspended(Page)
    await openForm(wrapper)
    await fillValid(wrapper)
    await wrapper.find('[data-testid="ip-access-form"]').trigger('submit')
    await flushPromises()
    expect(wrapper.find('[data-testid="ip-access-form-stepup"]').attributes('href')).toBe(
      'https://idp.example/up',
    )
    expect(refreshMock).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/pages/__tests__/ip-access-create.page.nuxt.spec.ts`
Expected: FAIL — `onCreateRequested` is a no-op stub; no form dialog mounted.

- [ ] **Step 3: Implement** — in `app/pages/ip-access.vue`:

3a. Add imports to the `<script setup>`:

```ts
import IpAccessRuleFormDialog from '@/components/ip-access/IpAccessRuleFormDialog.vue'
import { usePrivilegedAction } from '@/composables/usePrivilegedAction'
import { ipAccessApi } from '@/services/ip-access.api'
import type { IpAccessRuleCreatePayload, IpAccessRuleResponse } from '@/types/ip-access.types'
```

3b. Replace the `onCreateRequested` stub with the create-flow state + handlers:

```ts
const formOpen = ref(false)
const createAction = usePrivilegedAction<IpAccessRuleResponse>()

// SAFE status-keyed copy — a 422 may carry a raw DB/validation message which MUST
// NOT be rendered; map to safe domain copy. step_up surfaces via the dialog link.
const formError = computed<string | null>(() => {
  const status = createAction.failure.value?.status
  if (!status || status === 'step_up_required') return null
  if (status === 'invalid') return t('ip_access.create_invalid')
  return t('common.error_generic')
})

function onCreateRequested(): void {
  createAction.reset()
  successMessage.value = null
  formOpen.value = true
}
function onFormCancel(): void {
  formOpen.value = false
}
async function onFormSubmit(payload: IpAccessRuleCreatePayload): Promise<void> {
  const result = await createAction.run(() => ipAccessApi.create(payload))
  if (result === null) return // failure (invalid/step-up/error) stays in the dialog
  formOpen.value = false
  successMessage.value = t('ip_access.create_success')
  await refresh()
}
```

3c. Mount the dialog before `</section>` (after the `<template v-else>` block, as a sibling — like external-idps):

```vue
    <IpAccessRuleFormDialog
      :open="formOpen"
      :submitting="createAction.isSubmitting.value"
      :error-message="formError"
      :request-id="createAction.requestId.value"
      :step-up-url="createAction.stepUpUrl.value"
      @submit="onFormSubmit"
      @cancel="onFormCancel"
    />
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/pages/__tests__/ip-access-create.page.nuxt.spec.ts && npx vitest run app/pages/__tests__/ip-access.page.nuxt.spec.ts`
Expected: PASS both (create flow + no read-surface regression).

- [ ] **Step 5: Gates + commit**

Run: `npx oxlint && npx eslint app/pages/ip-access.vue && npm run typecheck` → 0 / 0 / 0.

```bash
git add app/pages/ip-access.vue app/pages/__tests__/ip-access-create.page.nuxt.spec.ts
git commit -m "feat(sso-admin-frontend): ip-access create flow (step-up aware, 422→safe copy)"
```

---

### Task 11.9: Delete flow (double-gate danger action)

**Files:**
- Modify: `app/pages/ip-access.vue`
- Test: `app/pages/__tests__/ip-access-delete.page.nuxt.spec.ts`

**Interfaces:**
- Consumes: `PrivilegedActionDialog`, `usePrivilegedAction<void>`, `ipAccessApi.remove`.
- Produces: a wired `onDeleteRequested` + `onDeleteCancel` + `onDeleteConfirm`; the `<PrivilegedActionDialog danger>` mounted at page root; `deleteError` (status-keyed; `invalid` → `delete_invalid`, never `.message`).

- [ ] **Step 1: Write the failing test**

```ts
// app/pages/__tests__/ip-access-delete.page.nuxt.spec.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import enLocale from '@/locales/en.json'
import { ApiError } from '@/lib/api/api-client'
import type { IpAccessRule } from '@/types/ip-access.types'

const removeMock = vi.fn<(id: number) => Promise<void>>()
vi.mock('@/services/ip-access.api', () => ({
  ipAccessApi: {
    list: vi.fn<() => Promise<unknown>>(),
    create: vi.fn<(p: unknown) => Promise<unknown>>(),
    remove: removeMock,
  },
}))

const RULE: IpAccessRule = {
  id: 7,
  cidr: '203.0.113.0/24',
  mode: 'block',
  reason: 'maint',
  expires_at: null,
  actor_subject_id: 'sub-a',
  created_at: null,
  updated_at: null,
}
const rulesRef = ref<readonly IpAccessRule[] | null>([RULE])
const refreshMock = vi.fn<() => Promise<void>>(async () => {})
vi.mock('@/composables/useIpAccessRules', () => ({
  useIpAccessRules: () => ({
    rules: rulesRef,
    viewState: computed(() => 'ready' as const),
    isStale: computed(() => false),
    requestId: computed(() => null),
    pending: ref(false),
    refresh: refreshMock,
  }),
}))
let permitted: string[] = []
vi.mock('@/stores/session.store', () => ({
  useSessionStore: () => ({
    principal: { display_name: 'Admin', subject_id: 'a1' },
    ensureSession: vi.fn<() => Promise<string>>(async () => 'authenticated'),
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
      return params
        ? val.replace(/\{(\w+)\}/gu, (_: string, k: string) => String(params[k] ?? ''))
        : val
    },
  }),
}))
mockNuxtImport('navigateTo', () => vi.fn<(...a: unknown[]) => Promise<void>>(async () => {}))
const Page = (await import('../ip-access.vue')).default

async function openDelete(wrapper: Awaited<ReturnType<typeof mountSuspended>>) {
  await wrapper.find('[data-testid="ip-access-select-7"]').trigger('click')
  await flushPromises()
  await wrapper.find('[data-testid="ip-access-delete"]').trigger('click')
  await flushPromises()
}

beforeEach(() => {
  permitted = ['admin.ip-access.read', 'admin.ip-access.write', 'admin.sessions.terminate']
  rulesRef.value = [RULE]
  removeMock.mockReset()
  refreshMock.mockReset()
})
afterEach(() => vi.clearAllMocks())

describe('ip-access delete — double gate', () => {
  it('hides Delete without sessions.terminate (single gate is not enough)', async () => {
    permitted = ['admin.ip-access.read', 'admin.ip-access.write']
    const wrapper = await mountSuspended(Page)
    await wrapper.find('[data-testid="ip-access-select-7"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="ip-access-delete"]').exists()).toBe(false)
  })

  it('confirm deletes, refreshes, reports success; cancel calls no API', async () => {
    removeMock.mockResolvedValue(undefined)
    const wrapper = await mountSuspended(Page)
    await openDelete(wrapper)
    expect(removeMock).not.toHaveBeenCalled()
    await wrapper.find('[data-testid="privileged-action-cancel"]').trigger('click')
    await flushPromises()
    expect(removeMock).not.toHaveBeenCalled()
    await openDelete(wrapper)
    await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
    await flushPromises()
    expect(removeMock).toHaveBeenCalledWith(7)
    expect(refreshMock).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="ip-access-action-success"]').text()).toBe(
      enLocale.ip_access.delete_success,
    )
  })

  it('maps a 422 to SAFE copy (never the raw message) and does not refresh', async () => {
    removeMock.mockRejectedValue(
      new ApiError(422, 'SQLSTATE row not found', 'validation', {}, 'req-422'),
    )
    const wrapper = await mountSuspended(Page)
    await openDelete(wrapper)
    await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="privileged-action-error"]').text()).toContain(
      enLocale.ip_access.delete_invalid,
    )
    expect(wrapper.html()).not.toContain('SQLSTATE')
    expect(wrapper.html()).not.toContain('req-422')
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('surfaces step-up on 428', async () => {
    removeMock.mockRejectedValue(
      new ApiError(428, 'reauth', 'reauth_required', { step_up_url: 'https://idp.example/up' }, 'r'),
    )
    const wrapper = await mountSuspended(Page)
    await openDelete(wrapper)
    await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
    await flushPromises()
    expect(
      wrapper.find('[data-testid="privileged-action-stepup"]').find('a').attributes('href'),
    ).toBe('https://idp.example/up')
    expect(refreshMock).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/pages/__tests__/ip-access-delete.page.nuxt.spec.ts`
Expected: FAIL — `onDeleteRequested` is a no-op stub; no confirm dialog.

- [ ] **Step 3: Implement** — in `app/pages/ip-access.vue`:

3a. Add imports:

```ts
import PrivilegedActionDialog from '@/components/users/PrivilegedActionDialog.vue'
```

3b. Replace the `onDeleteRequested` stub with the delete-flow state + handlers:

```ts
const deleteAction = usePrivilegedAction<void>()
const deleteTarget = ref<IpAccessRule | null>(null)

const deleteDescription = computed<string>(() =>
  deleteTarget.value
    ? t('ip_access.confirm_delete_desc', {
        mode: modeLabels.value[deleteTarget.value.mode] ?? deleteTarget.value.mode,
        cidr: deleteTarget.value.cidr,
      })
    : '',
)

// SAFE status-keyed copy — a 422 may carry a raw DB/not-found message which MUST
// NOT be rendered; map to safe domain copy.
const deleteError = computed<string | null>(() => {
  const status = deleteAction.failure.value?.status
  if (!status || status === 'step_up_required') return null
  if (status === 'invalid') return t('ip_access.delete_invalid')
  return t('common.error_generic')
})

function onDeleteRequested(rule: IpAccessRule): void {
  deleteAction.reset()
  successMessage.value = null
  deleteTarget.value = rule
}
function onDeleteCancel(): void {
  deleteTarget.value = null
}
async function onDeleteConfirm(): Promise<void> {
  const target = deleteTarget.value
  if (!target) return
  // run() resolves the runner's value: undefined on void success, null on failure.
  const result = await deleteAction.run(() => ipAccessApi.remove(target.id))
  if (result === null) return
  deleteTarget.value = null
  selectedId.value = null
  successMessage.value = t('ip_access.delete_success')
  await refresh()
}
```

3c. Mount the confirm dialog before `</section>` (sibling of the form dialog):

```vue
    <PrivilegedActionDialog
      v-if="deleteTarget !== null"
      :open="deleteTarget !== null"
      :title="t('ip_access.confirm_delete_title')"
      :description="deleteDescription"
      :confirm-label="t('common.btn_delete')"
      :cancel-label="t('common.btn_cancel')"
      danger
      :submitting="deleteAction.isSubmitting.value"
      :error-message="deleteError"
      :request-id="deleteAction.requestId.value"
      :step-up-url="deleteAction.stepUpUrl.value"
      :step-up-label="t('ip_access.step_up_cta')"
      @confirm="onDeleteConfirm"
      @cancel="onDeleteCancel"
    />
```

> Implementer note: `modeLabels` is already declared in Task 11.6 — reuse it; do not re-declare. `selectedId` (not `selectedKey`) is the drawer selection ref from 11.6.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/pages/__tests__/ip-access-delete.page.nuxt.spec.ts && npx vitest run app/pages/__tests__/ip-access-create.page.nuxt.spec.ts && npx vitest run app/pages/__tests__/ip-access.page.nuxt.spec.ts`
Expected: PASS all three.

- [ ] **Step 5: Gates + commit**

Run: `npx oxlint && npx eslint app/pages/ip-access.vue && npm run typecheck` → 0 / 0 / 0.

```bash
git add app/pages/ip-access.vue app/pages/__tests__/ip-access-delete.page.nuxt.spec.ts
git commit -m "feat(sso-admin-frontend): ip-access delete danger action (double-gate, safe 422)"
```

---

### Task 11.10: SSR leak gate (strict) + fixture + me caps + e2e + DoD

**Files:**
- Create: `test/fixtures/ssr-leak/server/routes/api/admin/ip-access-rules/index.get.ts`
- Modify: `test/fixtures/ssr-leak/server/routes/api/admin/me.get.ts`
- Modify: `test/ssr-token-leak.gate.spec.ts`
- Replace (legacy): `e2e/ip-access.spec.ts` (authored; run DEFERRED Phase 18)

**Interfaces:**
- Consumes the §3.3 gate harness (`setup({ build:false })`, `collectSecretLeaks` strict, `collectPiiShapeLeaks`, `extractPayload`).

- [ ] **Step 1: Add the fixture rule list** (clean of any token/secret/session-id/PII-shaped digit run)

```ts
// test/fixtures/ssr-leak/server/routes/api/admin/ip-access-rules/index.get.ts
// SSR token-leak fixture: a representative IP access rule list so the §3.3 gate
// renders the page READY. No token, secret, session id, or PII-shaped digit run —
// CIDR octets are ≤3 digits, ISO timestamps have no 10/16/18-digit run, and the
// actor subject id is an opaque ULID-style string (no long digit run).
import { defineEventHandler } from 'h3'

export default defineEventHandler(() => ({
  rules: [
    {
      id: 1,
      cidr: '203.0.113.0/24',
      mode: 'block',
      reason: 'Blocked maintenance range',
      expires_at: null,
      actor_subject_id: 'sub-admin-sentinel',
      created_at: '2026-06-20T10:00:00Z',
      updated_at: '2026-06-20T10:00:00Z',
    },
    {
      id: 2,
      cidr: '198.51.100.0/24',
      mode: 'allow',
      reason: 'Office egress range',
      expires_at: '2027-01-01T00:00:00Z',
      actor_subject_id: 'sub-secops-sentinel',
      created_at: '2026-06-21T09:00:00Z',
      updated_at: '2026-06-21T09:00:00Z',
    },
  ],
}))
```

- [ ] **Step 2: Add the page caps to `me.get.ts`** — in BOTH the `permissions` array and the `capabilities` object, add (keep them adjacent to the existing external-idps caps):

```ts
// permissions: array — add:
'admin.ip-access.read',
'admin.ip-access.write',
```
```ts
// capabilities: object — add:
'admin.ip-access.read': true,
'admin.ip-access.write': true,
```

(The page-meta gate needs `admin.ip-access.read`; the Add button needs `.write`; delete additionally needs `admin.sessions.terminate`, which is already present.)

- [ ] **Step 3: Extend the gate spec** — add the fetch helper next to `fetchExternalIdps`:

```ts
function fetchIpAccess(): Promise<string> {
  // admin_locale=en so the mode badge renders the English label under the gate.
  return $fetch('/ip-access', { headers: { cookie: 'admin_locale=en' } })
}
```

Add three it-blocks after the external-idps blocks (inside the same `describe`):

```ts
it('renders the IP access rules server-side in their ready state', async () => {
  const html = await fetchIpAccess()
  expect(html).toContain('data-admin-shell')
  // a CIDR + a mode label render, proving the table mounted (mode is shown as a
  // STATUS label, never colour-alone).
  expect(html).toContain('203.0.113.0/24')
  expect(html).toContain('Block')
})

it('does not leak token/secret/PII values into the ip-access SSR HTML', async () => {
  // Strict — the IP-access DTO carries only cidr/mode/reason/timestamps + an opaque
  // actor subject id; no token, secret, session id, or gov-PII. NO allowSessionId.
  const html = await fetchIpAccess()
  expect(collectSecretLeaks(html, 'ip-access SSR HTML')).toEqual([])
})

it('does not leak token/secret/PII values into the ip-access hydration payload', async () => {
  const html = await fetchIpAccess()
  const serialized = JSON.stringify(JSON.parse(extractPayload(html)))
  expect(collectSecretLeaks(serialized, 'ip-access __NUXT__ payload')).toEqual([])
  expect(collectPiiShapeLeaks(serialized, 'ip-access __NUXT__ payload')).toEqual([])
})
```

- [ ] **Step 4: Author the e2e spec** (run deferred). Replace `e2e/ip-access.spec.ts` with a Nuxt-route version mirroring `e2e/external-idps.spec.ts` structure: load `/ip-access`, assert the table + Add button (write principal) + the delete confirm double-gate. Keep it authored but DO NOT run it — `playwright.config.ts` is still legacy-SPA-wired (systemic, Phase 18). A one-line header comment must state: `// RUN DEFERRED to Phase 18 — playwright.config.ts still targets the legacy SPA.`

- [ ] **Step 5: Run the gate + the full DoD**

Run the leak gate (rebuilds the fixture layer in globalSetup):
`npm run test -- test/ssr-token-leak.gate.spec.ts`
Expected: PASS — the 3 new ip-access blocks green, the planted-secret tripwire still red→reported (live), total count = prior 26 + 3 = **29**.

Full DoD (DIRECT):
- `npx oxlint` → 0
- `npx eslint app/pages/ip-access.vue app/components/ip-access/*.vue` → 0
- `npm run typecheck` → 0
- `npx prettier --check --experimental-cli .` → clean
- locale parity: the `node -e` parity check from 11.6 → `PARITY OK`
- `npm run test` → full suite green (expect prior 1223 + the new ip-access specs)
- `npm run build` → PASS

- [ ] **Step 6: Commit (gate + e2e separately, mirroring prior phases)**

```bash
git add test/ssr-token-leak.gate.spec.ts test/fixtures/ssr-leak/server/routes/api/admin/ip-access-rules/index.get.ts test/fixtures/ssr-leak/server/routes/api/admin/me.get.ts
git commit -m "test(sso-admin-frontend): extend SSR leak gate to the ip-access rules list (strict)"

git add e2e/ip-access.spec.ts
git commit -m "test(sso-admin-frontend): port ip-access e2e to Nuxt routes (run deferred to cutover)"
```

---

## Self-Review

**1. Spec coverage.** Backend contract (list/create/delete, perms, step-up, double-gate, 422-safe) → Tasks 11.3/11.8/11.9. DTO (8 fields) → 11.1. Read surface (6 states + drawer) → 11.6. Swiss mode tone → 11.1/11.5. Create + delete privileged matrix → 11.8/11.9. SSR strict leak gate → 11.10. Locale parity → 11.6/11.10. No proxy change (already allow-listed) — explicitly out of scope. **No gap.**

**2. Placeholder scan.** Every code step carries complete code; every test step carries the full test; every command has expected output. The two page-task stubs (11.6) are deliberately empty and explicitly filled by 11.8/11.9 — flagged, not a placeholder.

**3. Type consistency.** `resolveModeTone(mode: IpAccessMode)`, `validateIpAccessForm`, `buildCreateRulePayload`, `ipAccessApi.{list,create,remove}`, `useIpAccessRules` return shape, `IpAccessRulesTable` props/emit, `IpAccessRuleFormDialog` props/emit, page handler names (`onCreateRequested`/`onFormSubmit`/`onDeleteRequested`/`onDeleteConfirm`), and the `selectedId`/`modeLabels`/`successMessage` refs are referenced identically across 11.6 → 11.8 → 11.9. `remove(id: number)` matches the numeric DTO `id`; the table stringifies `id` for `UiDataListRow` and parses it back to a number on `select`. ✔

## Open decision flagged for adversarial verify

- **Mode badge tone (11.1/11.5).** Legacy mapped `block → danger` (red). This plan maps `block → warning` (amber), `allow → success` (green), to keep `--danger` exclusive to the destructive delete affordance per the Swiss rule. The badge always carries a text label, so colour is never load-bearing. If the reviewers judge `neutral` a better fit for a benign-but-restrictive block rule, swap `warning → neutral` in `resolveModeTone` + its test — a one-line change.
