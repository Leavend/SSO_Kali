# Phase 8 — Security Policy (Versioning) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the `/policy` admin surface as a Nuxt-4 SSR, Swiss-redesigned **security-policy versioning console** — per-category version history (password · mfa · session · lockout · legal_hold) with a propose-draft → activate / rollback lifecycle — at functional parity with the legacy SPA, test-first, with no token/secret/PII in the SSR payload and every state transition behind the privileged-action matrix.

**Architecture:** `app/pages/policy.vue` (SSR, permission-gated, all six states) → `app/composables/useSecurityPolicies.ts` (`useAsyncData`, category-reactive, view-state + stale + requestId) → `app/services/policy.api.ts` (single network seam over `apiClient`) → Nitro BFF (`/api/admin/*` → `/admin/api/*`, injects `Bearer`, already allow-listed) → Laravel backend. Pure logic (view-state, status-tone, category catalog, JSON-payload parse, transition impact) lives in `app/lib/policy/`. The three write transitions (propose · activate · rollback) each run through the **reused** `usePrivilegedAction` + `PrivilegedActionDialog` so the full `401/403/419/422/428/429/5xx` + step-up matrix surfaces safe, status-keyed copy and a redacted support reference.

**Tech Stack:** Nuxt 4.4.8 (full SSR), Vue 3.5 SFC, TypeScript strict, Pinia (`useSessionStore` consumed read-only for `hasPermission`), `useAsyncData` + `apiClient`, Vitest 4 + `@nuxt/test-utils` 4 (nuxt-runtime specs named `*.nuxt.spec.ts`), Playwright (e2e authored; run deferred to Phase 18). Reka UI primitives via the ported Swiss `Ui*` components.

## Global Constraints

These apply to **every** task — each task's requirements implicitly include this section.

- **Backend is the security boundary.** The UI gate is UX minimization; the backend re-checks permission + fresh-auth + MFA on every call. Never weaken a UI gate to "match" the backend, and never assume the UI gate is sufficient.
- **Permission keys (verbatim, from `AdminPermission.php`):** read `admin.security-policy.read` · propose(write) `admin.security-policy.write` · activate **and** rollback `admin.security-policy.activate` (rollback has no own permission). Reads are gated at the page (`definePageMeta.permissions`); write/activate/rollback affordances gate on `useSessionStore().hasPermission(<key>)`.
- **Step-up is real.** Propose requires `EnsureFreshAdminAuth:write` (auth fresher than ~1800s); activate/rollback require `:step_up` (~900s). Stale auth → **HTTP 428** `{ error: "reauth_required", step_up_url }`. A separate **403** `mfa_required` gate also applies. The privileged-action matrix already maps 428/412/`reauth_required`/`step_up_required` → `step_up_required` (checked FIRST) and surfaces `step_up_url`.
- **Backend status codes (this domain):** 422 validation (`{ errors }`) + domain errors (`invalid_category`, `security_policy_invalid` for version-not-found / "rolled-back cannot be re-activated"); 403 `forbidden` / `mfa_required`; 401 `unauthorized`; 428 `reauth_required`; 429 throttle. **There is no 409 and no 412 in this domain** — a re-activate conflict comes back as **422 `security_policy_invalid`**.
- **Categories (verbatim, from `SecurityPolicy::CATEGORIES`):** `password`, `mfa`, `session`, `lockout`, `legal_hold`. No others. The route regex is `[a-z_]+`; the const list is authoritative.
- **Policy `status` enum (verbatim):** `draft`, `active`, `superseded`, `rolled_back`. No `scheduled`/`pending` — a future `effective_at` is metadata only; the row still flips `active` immediately.
- **SSR token-leak gate (design §3.3, mandatory):** Tokens, session secrets, and raw PII must **never** enter the SSR HTML or the `__NUXT__`/`__NUXT_DATA__` hydration payload. Tokens live only in the Nitro `event.context`. **FORBIDDEN in SSR HTML / payload:** access/refresh/ID token values + field names (`accessToken|refreshToken|idToken|access_token|refresh_token|id_token`); session/client secret values + names (`sessionEncryptionSecret|adminOidcClientSecret|client_secret`); raw NIK(16)/NIP(18)/NISN(10) digit runs (word-bounded `\b\d{16}\b` / `\b\d{18}\b` / `\b\d{10}\b`); raw backend exceptions; the `SSR_LEAK_CANARY`. **The policy DTOs carry NO token/secret/session-id/government-PII** — the `payload` is non-secret config (the backend never writes a secret into it), `actor_subject_id` is the acting admin's opaque OIDC subject id (ULID — not gov-PII, not a credential), and `reason` is admin-authored audit justification. So the policy leak-gate blocks use the **strict** checks (no `allowSessionId`), and the `/policy` fixture payloads must avoid token-name keys and 10/16/18-digit runs. (`actor_subject_id` is treated like the device `session.id` allowed in Phase 4 — an operational identifier, safe to hydrate — but because policy carries no `sid`, the strict gate applies unchanged.)
- **Free-form payload caveat:** backend validation on propose is `payload => required|array` with **no per-key schema**. The system never *populates* a secret, but it cannot *prevent* an operator from typing one into the JSON. The payload editor is free-form config; the client parses/validates it is a JSON object before submit, but the backend remains the authority. Do not claim the client redacts the payload.
- **Swiss design system:** single Klein-blue accent `--accent #002FA7` for interactive/brand; **`--danger #E4002B` reserved for destructive/reverting affordances only** — in this domain that is the **rollback** action and nothing else (propose and activate are accent). Status is always tone **+** text label via `UiStatusBadge` (never colour-alone). Hairline 1px borders, no shadows as primary structure, sharp radii. Folio numerals (`UiFolio`) for version numbers and timestamps; `--font-mono` only for raw IDs (the `actor_subject_id`). Standard labels ("Security policy", "Activate", "Roll back", "Cancel") — no themed copy, no `//` kickers, Lucide icons only.
- **No traceability markers** (`OG#`, `UC###`, `FR###`, `BE-FR###`) anywhere in source, tests, comments, routes, or config. Descriptive domain names only.
- **Locale parity:** `app/locales/en.json` and `app/locales/id.json` stay in sync — every key added to one is added to the other. The `policy.*` block already exists in both; extend it, do not duplicate keys.
- **Reuse, don't rebuild:** the Nitro proxy already allow-lists all four security-policy routes; every `Ui*` primitive, the privileged-action infra (`usePrivilegedAction` + `PrivilegedActionDialog` + `resolvePrivilegedActionFailure`), `apiClient`/`ApiError`, the SSR-leak-gate harness, and the RBAC surface (Phase 7) all exist — consume them as-is. Phase 8 builds **only** the policy-version DTOs, pure helpers, service, composable, table component, page body, and the leak-gate/e2e extension. The legacy page crammed roles + permission-catalog into `/policy`; those now live on `/roles` (Phase 7) — **do not** re-render them here.
- **`npm run lint` is `run-s lint:*`** → BOTH `lint:oxlint` (`oxlint .`) AND `lint:eslint` (`eslint "src/**/*.vue" "app/**/*.vue"`) must pass; a green oxlint with a red eslint is NOT done. oxlint rules that bite: every `vi.fn(...)` needs a type parameter; every `.toThrow(...)` needs a message argument.
- **Commit trailer (verbatim):** `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## Task Index

| Task | Title | Deliverable |
|---|---|---|
| 8.1 | Policy DTO types + pure view-state / status-tone | `app/types/policy.types.ts`, `app/lib/policy/policy-view-state.ts` |
| 8.2 | Pure policy helpers (category catalog · JSON parse · transition impact) | `app/lib/policy/policy-helpers.ts` |
| 8.3 | `policy.api.ts` service (single network seam) | `app/services/policy.api.ts` |
| 8.4 | `useSecurityPolicies` SSR composable (category-reactive) | `app/composables/useSecurityPolicies.ts` |
| 8.5 | `PolicyVersionsTable.vue` (Swiss version-history table) | `app/components/policy/PolicyVersionsTable.vue` |
| 8.6 | `/policy` page — all six states, category selector, active summary, versions table + detail drawer (read surface) | `app/pages/policy.vue` |
| 8.7 | Propose-draft privileged write (`PolicyDraftForm.vue` + parse-validate) | `app/components/policy/PolicyDraftForm.vue` + page |
| 8.8 | Activate-version privileged action (confirm + impact + step-up matrix) | `app/pages/policy.vue` |
| 8.9 | Rollback-version privileged action (danger confirm + 422 domain mapping) | `app/pages/policy.vue` |
| 8.10 | Extend SSR token-leak gate + Policy e2e + full Phase-8 DoD | `test/ssr-token-leak.gate.spec.ts`, fixture, `e2e/policy.spec.ts` |

---

### Task 8.1: Policy DTO types + pure view-state / status-tone resolver

**Files:**
- Create: `app/types/policy.types.ts`
- Create: `app/lib/policy/policy-view-state.ts`
- Test: `app/lib/policy/__tests__/policy-view-state.spec.ts`

**Interfaces:**
- Consumes: `ApiError` (`@/lib/api/api-client`); `StatusTone` (`@/lib/status-tone`).
- Produces:
  - `app/types/policy.types.ts`: `SecurityPolicyCategory = 'password'|'mfa'|'session'|'lockout'|'legal_hold'`; `SecurityPolicyStatus = 'draft'|'active'|'superseded'|'rolled_back'`; `SecurityPolicy` (id, category, version, status, payload, effective_at?, activated_at?, superseded_at?, actor_subject_id?, reason?, created_at, updated_at); `SecurityPolicyListResponse` (category, active, policies); `ProposePolicyPayload` ({ payload, reason? }); `PolicyTransitionPayload` ({ reason?, effective_at? }); `PolicyMutationResponse` ({ policy }).
  - `app/lib/policy/policy-view-state.ts`: `PolicyViewState = 'loading'|'unauthenticated'|'forbidden'|'error'|'empty'|'ready'`; `resolvePolicyViewState({ pending, error, policies }): PolicyViewState`; `resolvePolicyStatusTone(status: string): StatusTone`.

- [ ] **Step 1: Write the failing test** — `app/lib/policy/__tests__/policy-view-state.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api/api-client'
import {
  resolvePolicyStatusTone,
  resolvePolicyViewState,
} from '../policy-view-state'
import type { SecurityPolicy } from '@/types/policy.types'

const policy = (over: Partial<SecurityPolicy> = {}): SecurityPolicy => ({
  id: 1,
  category: 'password',
  version: 1,
  status: 'active',
  payload: { min_length: 14 },
  effective_at: '2026-06-01T00:00:00Z',
  activated_at: '2026-06-01T00:00:00Z',
  superseded_at: null,
  actor_subject_id: '01HZX9ADMINULID0000000000',
  reason: 'Baseline',
  created_at: '2026-06-01T00:00:00Z',
  updated_at: '2026-06-01T00:00:00Z',
  ...over,
})

describe('resolvePolicyViewState', () => {
  it('is loading when nothing has resolved yet', () => {
    expect(resolvePolicyViewState({ pending: true, error: null, policies: null })).toBe('loading')
  })

  it('maps a 401 (no prior list) to unauthenticated', () => {
    expect(
      resolvePolicyViewState({ pending: false, error: new ApiError(401, 'x'), policies: null }),
    ).toBe('unauthenticated')
  })

  it('maps a 403 (no prior list) to forbidden', () => {
    expect(
      resolvePolicyViewState({ pending: false, error: new ApiError(403, 'x'), policies: null }),
    ).toBe('forbidden')
  })

  it('maps any other error (no prior list) to error', () => {
    expect(
      resolvePolicyViewState({ pending: false, error: new ApiError(500, 'x'), policies: null }),
    ).toBe('error')
  })

  it('is empty when the category has zero versions', () => {
    expect(resolvePolicyViewState({ pending: false, error: null, policies: [] })).toBe('empty')
  })

  it('is ready when versions exist', () => {
    expect(
      resolvePolicyViewState({ pending: false, error: null, policies: [policy()] }),
    ).toBe('ready')
  })

  it('keeps a good list on screen when a background refresh errors (ready, not error)', () => {
    expect(
      resolvePolicyViewState({ pending: false, error: new ApiError(500, 'x'), policies: [policy()] }),
    ).toBe('ready')
  })
})

describe('resolvePolicyStatusTone', () => {
  it('maps each status to a distinct, accessible tone (never colour-alone — paired with a label in the badge)', () => {
    expect(resolvePolicyStatusTone('active')).toBe('success')
    expect(resolvePolicyStatusTone('draft')).toBe('info')
    expect(resolvePolicyStatusTone('rolled_back')).toBe('warning')
    expect(resolvePolicyStatusTone('superseded')).toBe('neutral')
  })

  it('falls back to neutral for an unknown status', () => {
    expect(resolvePolicyStatusTone('something-new')).toBe('neutral')
  })
})
```

- [ ] **Step 2: Run it — expect FAIL** (`npm run test -- app/lib/policy/__tests__/policy-view-state.spec.ts`). Expected: module-not-found (`policy-view-state` / `policy.types` do not exist).

- [ ] **Step 3: Create `app/types/policy.types.ts`:**

```ts
// Security-policy DTOs. The backend serializes via SecurityPolicyService::present()
// (no API Resource). `payload` is non-secret admin-authored config (the backend
// never writes a secret into it); `actor_subject_id` is the acting admin's opaque
// OIDC subject id (ULID — not gov-PII); `reason` is free-text audit justification.
export type SecurityPolicyCategory = 'password' | 'mfa' | 'session' | 'lockout' | 'legal_hold'

export type SecurityPolicyStatus = 'draft' | 'active' | 'superseded' | 'rolled_back'

export type SecurityPolicy = {
  readonly id: number
  readonly category: string
  readonly version: number
  readonly status: string
  readonly payload: Readonly<Record<string, unknown>>
  readonly effective_at?: string | null
  readonly activated_at?: string | null
  readonly superseded_at?: string | null
  readonly actor_subject_id?: string | null
  readonly reason?: string | null
  readonly created_at: string
  readonly updated_at: string
}

export type SecurityPolicyListResponse = {
  readonly category: string
  // The active policy's payload object, or `[]` (empty array) when none is active —
  // the backend returns a PHP empty array, which serializes as JSON `[]`, not `{}`.
  readonly active: Readonly<Record<string, unknown>> | readonly unknown[]
  readonly policies: readonly SecurityPolicy[]
}

export type ProposePolicyPayload = {
  readonly payload: Readonly<Record<string, unknown>>
  readonly reason?: string
}

export type PolicyTransitionPayload = {
  readonly reason?: string
  readonly effective_at?: string
}

export type PolicyMutationResponse = {
  readonly policy: SecurityPolicy
}
```

- [ ] **Step 4: Create `app/lib/policy/policy-view-state.ts`** (mirrors `roles-view-state.ts`; adds the status-tone map this domain needs because `resolveStatusTone` aliases `draft`/`superseded`/`rolled_back` all to `neutral`):

```ts
import { ApiError } from '@/lib/api/api-client'
import type { StatusTone } from '@/lib/status-tone'
import type { SecurityPolicy } from '@/types/policy.types'

export type PolicyViewState =
  | 'loading'
  | 'unauthenticated'
  | 'forbidden'
  | 'error'
  | 'empty'
  | 'ready'

// "Empty" = the category answered with zero versions. Distinct from `forbidden`
// (403) so the page shows a "no policy yet" surface, not access-denied. `null`
// (unfetched) stays `loading` and never collapses into `empty`.
export function resolvePolicyViewState({
  error,
  policies,
}: {
  readonly pending: boolean
  readonly error: unknown
  readonly policies: readonly SecurityPolicy[] | null
}): PolicyViewState {
  // An error with NO prior snapshot surfaces the real auth/permission state. Once a
  // list exists it stays on screen even if a background refresh fails (the
  // composable's stale flag carries that).
  if (error && !policies) {
    const status = errorStatus(error)
    if (status === 401) return 'unauthenticated'
    if (status === 403) return 'forbidden'
    return 'error'
  }
  if (policies) return policies.length === 0 ? 'empty' : 'ready'
  return 'loading'
}

// Distinct tone per lifecycle status, always paired with a text label in
// UiStatusBadge (never colour-alone). active=success, draft=info, rolled_back=
// warning, superseded/unknown=neutral. Red (danger) is NOT used for status — it is
// reserved for the rollback affordance.
export function resolvePolicyStatusTone(status: string): StatusTone {
  switch (status) {
    case 'active':
      return 'success'
    case 'draft':
      return 'info'
    case 'rolled_back':
      return 'warning'
    case 'superseded':
    default:
      return 'neutral'
  }
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

- [ ] **Step 5: Run it — expect PASS** (`npm run test -- app/lib/policy/__tests__/policy-view-state.spec.ts`). Expected: GREEN (9 assertions).

- [ ] **Step 6: Commit:**

```bash
git add app/types/policy.types.ts app/lib/policy/policy-view-state.ts app/lib/policy/__tests__/policy-view-state.spec.ts
git commit -m "$(cat <<'EOF'
feat(sso-admin-frontend): policy DTO types + pure view-state/status-tone

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Task-scoped DoD:** `npm run typecheck && npm run lint && npm run format:check && npm run test -- app/lib/policy/__tests__/policy-view-state.spec.ts` — all green (both lint passes). No render/network/privileged-action in this pure task, so no SSR-leak step here (that is Task 8.10).

---

### Task 8.2: Pure policy helpers (category catalog · JSON parse · transition impact)

**Files:**
- Create: `app/lib/policy/policy-helpers.ts`
- Test: `app/lib/policy/__tests__/policy-helpers.spec.ts`

**Interfaces:**
- Consumes: `SecurityPolicyCategory`, `SecurityPolicy` (`@/types/policy.types`).
- Produces:
  - `POLICY_CATEGORIES: readonly SecurityPolicyCategory[]` (the five, in display order).
  - `isPolicyCategory(value: string): value is SecurityPolicyCategory`.
  - `parsePolicyPayload(text: string): { ok: true; value: Record<string, unknown> } | { ok: false; error: 'syntax' | 'not_object' }` — pure JSON parse + "must be a non-array object" guard (mirrors the backend `required|array`/object contract; never throws).
  - `findActiveVersion(policies: readonly SecurityPolicy[]): number | null` — the version number whose status is `active`, else null.
  - `describeTransitionImpact(targetVersion: number, activeVersion: number | null): { targetVersion: number; activeVersion: number | null; replacesActive: boolean }` — pure summary behind the activate/rollback confirm copy.

- [ ] **Step 1: Write the failing test** — `app/lib/policy/__tests__/policy-helpers.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  POLICY_CATEGORIES,
  describeTransitionImpact,
  findActiveVersion,
  isPolicyCategory,
  parsePolicyPayload,
} from '../policy-helpers'
import type { SecurityPolicy } from '@/types/policy.types'

const policy = (over: Partial<SecurityPolicy>): SecurityPolicy => ({
  id: 1,
  category: 'password',
  version: 1,
  status: 'superseded',
  payload: {},
  created_at: '2026-06-01T00:00:00Z',
  updated_at: '2026-06-01T00:00:00Z',
  ...over,
})

describe('POLICY_CATEGORIES / isPolicyCategory', () => {
  it('lists exactly the five backend categories in display order', () => {
    expect(POLICY_CATEGORIES).toEqual(['password', 'mfa', 'session', 'lockout', 'legal_hold'])
  })

  it('narrows a known category and rejects an unknown one', () => {
    expect(isPolicyCategory('session')).toBe(true)
    expect(isPolicyCategory('roles')).toBe(false)
  })
})

describe('parsePolicyPayload', () => {
  it('accepts a JSON object', () => {
    expect(parsePolicyPayload('{"min_length":14}')).toEqual({ ok: true, value: { min_length: 14 } })
  })

  it('rejects malformed JSON without throwing', () => {
    expect(parsePolicyPayload('{not json')).toEqual({ ok: false, error: 'syntax' })
  })

  it('rejects a JSON array (backend wants an object payload)', () => {
    expect(parsePolicyPayload('[1,2,3]')).toEqual({ ok: false, error: 'not_object' })
  })

  it('rejects a JSON scalar', () => {
    expect(parsePolicyPayload('42')).toEqual({ ok: false, error: 'not_object' })
    expect(parsePolicyPayload('null')).toEqual({ ok: false, error: 'not_object' })
  })
})

describe('findActiveVersion', () => {
  it('returns the active version number', () => {
    expect(
      findActiveVersion([policy({ version: 3, status: 'active' }), policy({ version: 2 })]),
    ).toBe(3)
  })

  it('returns null when no version is active', () => {
    expect(findActiveVersion([policy({ version: 1 }), policy({ version: 2 })])).toBeNull()
  })
})

describe('describeTransitionImpact', () => {
  it('flags a transition that replaces a currently-active version', () => {
    expect(describeTransitionImpact(5, 3)).toEqual({
      targetVersion: 5,
      activeVersion: 3,
      replacesActive: true,
    })
  })

  it('flags a transition with no current active version', () => {
    expect(describeTransitionImpact(1, null)).toEqual({
      targetVersion: 1,
      activeVersion: null,
      replacesActive: false,
    })
  })

  it('does not flag replacement when the target is already the active version', () => {
    expect(describeTransitionImpact(3, 3).replacesActive).toBe(false)
  })
})
```

- [ ] **Step 2: Run it — expect FAIL** (`npm run test -- app/lib/policy/__tests__/policy-helpers.spec.ts`). Expected: module-not-found.

- [ ] **Step 3: Create `app/lib/policy/policy-helpers.ts`:**

```ts
import type { SecurityPolicy, SecurityPolicyCategory } from '@/types/policy.types'

// The five backend categories (SecurityPolicy::CATEGORIES), in display order.
export const POLICY_CATEGORIES: readonly SecurityPolicyCategory[] = [
  'password',
  'mfa',
  'session',
  'lockout',
  'legal_hold',
]

export function isPolicyCategory(value: string): value is SecurityPolicyCategory {
  return (POLICY_CATEGORIES as readonly string[]).includes(value)
}

// Parse the draft-payload textarea into a JSON object. The backend wants
// `payload => required|array` (a JSON object); reject syntax errors and non-object
// JSON (arrays, scalars, null) up front so the operator sees the problem before the
// round-trip. Never throws — returns a discriminated result.
export type ParsedPolicyPayload =
  | { readonly ok: true; readonly value: Record<string, unknown> }
  | { readonly ok: false; readonly error: 'syntax' | 'not_object' }

export function parsePolicyPayload(text: string): ParsedPolicyPayload {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, error: 'syntax' }
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'not_object' }
  }
  return { ok: true, value: parsed as Record<string, unknown> }
}

export function findActiveVersion(policies: readonly SecurityPolicy[]): number | null {
  return policies.find((p) => p.status === 'active')?.version ?? null
}

// Pure summary behind the activate/rollback confirm copy: which version becomes
// active and which one (if any) it replaces.
export type PolicyTransitionImpact = {
  readonly targetVersion: number
  readonly activeVersion: number | null
  readonly replacesActive: boolean
}

export function describeTransitionImpact(
  targetVersion: number,
  activeVersion: number | null,
): PolicyTransitionImpact {
  return {
    targetVersion,
    activeVersion,
    replacesActive: activeVersion !== null && activeVersion !== targetVersion,
  }
}
```

- [ ] **Step 4: Run it — expect PASS.** Expected: GREEN.

- [ ] **Step 5: Commit:**

```bash
git add app/lib/policy/policy-helpers.ts app/lib/policy/__tests__/policy-helpers.spec.ts
git commit -m "$(cat <<'EOF'
feat(sso-admin-frontend): pure policy helpers (catalog, JSON parse, transition impact)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Task-scoped DoD:** `npm run typecheck && npm run lint && npm run format:check && npm run test -- app/lib/policy/__tests__/policy-helpers.spec.ts` — all green.

---

### Task 8.3: `policy.api.ts` service (single network seam)

**Files:**
- Create: `app/services/policy.api.ts`
- Test: `app/services/__tests__/policy.api.spec.ts`

**Interfaces:**
- Consumes: `apiClient` (`@/lib/api/api-client`) — `get<T>(path)`, `post<T>(path, body?)`; `SecurityPolicyListResponse`, `ProposePolicyPayload`, `PolicyTransitionPayload`, `PolicyMutationResponse` (`@/types/policy.types`).
- Produces: `policyApi` with
  - `list(category: string): Promise<SecurityPolicyListResponse>` → `GET /api/admin/security-policies/{category}`
  - `propose(category: string, payload: ProposePolicyPayload): Promise<PolicyMutationResponse>` → `POST /api/admin/security-policies/{category}`
  - `activate(category: string, version: number, payload: PolicyTransitionPayload): Promise<PolicyMutationResponse>` → `POST /api/admin/security-policies/{category}/{version}/activate`
  - `rollback(category: string, version: number, payload: PolicyTransitionPayload): Promise<PolicyMutationResponse>` → `POST /api/admin/security-policies/{category}/{version}/rollback`

> ponytail: a dumb forwarding seam — no rendering, no error mapping, no token handling (the Nitro proxy injects the Bearer server-side; the SPA is token-blind). The four routes are already in the proxy allow-list (`server/utils/admin-proxy.ts`), so there is no proxy change. `category` is path-encoded defensively per the `roles.api.ts` convention even though it is a fixed enum.

- [ ] **Step 1: Write the failing test** — `app/services/__tests__/policy.api.spec.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { policyApi } from '../policy.api'
import { apiClient } from '@/lib/api/api-client'

vi.mock('@/lib/api/api-client', () => ({
  apiClient: {
    get: vi.fn<(path: string) => Promise<unknown>>(),
    post: vi.fn<(path: string, body?: unknown) => Promise<unknown>>(),
  },
}))

const get = vi.mocked(apiClient.get)
const post = vi.mocked(apiClient.post)

afterEach(() => {
  vi.clearAllMocks()
})

describe('policyApi', () => {
  it('list GETs the category-scoped endpoint', async () => {
    get.mockResolvedValue({ category: 'password', active: {}, policies: [] })
    await policyApi.list('password')
    expect(get).toHaveBeenCalledWith('/api/admin/security-policies/password')
  })

  it('propose POSTs the payload + reason to the category endpoint', async () => {
    post.mockResolvedValue({ policy: {} })
    await policyApi.propose('session', { payload: { idle_timeout_minutes: 15 }, reason: 'tighten' })
    expect(post).toHaveBeenCalledWith('/api/admin/security-policies/session', {
      payload: { idle_timeout_minutes: 15 },
      reason: 'tighten',
    })
  })

  it('activate POSTs to the version activate endpoint', async () => {
    post.mockResolvedValue({ policy: {} })
    await policyApi.activate('mfa', 4, { reason: 'go live' })
    expect(post).toHaveBeenCalledWith('/api/admin/security-policies/mfa/4/activate', {
      reason: 'go live',
    })
  })

  it('rollback POSTs to the version rollback endpoint', async () => {
    post.mockResolvedValue({ policy: {} })
    await policyApi.rollback('lockout', 2, { reason: 'revert' })
    expect(post).toHaveBeenCalledWith('/api/admin/security-policies/lockout/2/rollback', {
      reason: 'revert',
    })
  })

  it('path-encodes the category segment', async () => {
    get.mockResolvedValue({ category: 'legal_hold', active: {}, policies: [] })
    await policyApi.list('legal_hold')
    expect(get).toHaveBeenCalledWith('/api/admin/security-policies/legal_hold')
  })
})
```

- [ ] **Step 2: Run it — expect FAIL** (module-not-found).

- [ ] **Step 3: Create `app/services/policy.api.ts`:**

```ts
import { apiClient } from '@/lib/api/api-client'
import type {
  PolicyMutationResponse,
  PolicyTransitionPayload,
  ProposePolicyPayload,
  SecurityPolicyListResponse,
} from '@/types/policy.types'

// Single network seam for the security-policy versioning domain. The BFF rewrites
// /api/admin/* -> /admin/api/* and injects the Bearer; these four routes are
// already in the Nitro proxy allow-list.
function categoryPath(category: string): string {
  return `/api/admin/security-policies/${encodeURIComponent(category)}`
}

export const policyApi = {
  list(category: string): Promise<SecurityPolicyListResponse> {
    return apiClient.get<SecurityPolicyListResponse>(categoryPath(category))
  },
  propose(category: string, payload: ProposePolicyPayload): Promise<PolicyMutationResponse> {
    return apiClient.post<PolicyMutationResponse>(categoryPath(category), payload)
  },
  activate(
    category: string,
    version: number,
    payload: PolicyTransitionPayload,
  ): Promise<PolicyMutationResponse> {
    return apiClient.post<PolicyMutationResponse>(`${categoryPath(category)}/${version}/activate`, payload)
  },
  rollback(
    category: string,
    version: number,
    payload: PolicyTransitionPayload,
  ): Promise<PolicyMutationResponse> {
    return apiClient.post<PolicyMutationResponse>(`${categoryPath(category)}/${version}/rollback`, payload)
  },
}
```

- [ ] **Step 4: Run it — expect PASS.**

- [ ] **Step 5: Commit:**

```bash
git add app/services/policy.api.ts app/services/__tests__/policy.api.spec.ts
git commit -m "$(cat <<'EOF'
feat(sso-admin-frontend): policy.api service over the admin api-client

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Task-scoped DoD:** `npm run typecheck && npm run lint && npm run format:check && npm run test -- app/services/__tests__/policy.api.spec.ts` — all green.

---

### Task 8.4: `useSecurityPolicies` SSR composable (category-reactive)

**Files:**
- Create: `app/composables/useSecurityPolicies.ts`
- Test: `app/composables/__tests__/useSecurityPolicies.nuxt.spec.ts`

**Interfaces:**
- Consumes: `useAsyncData` (Nuxt auto-import); `policyApi` (`@/services/policy.api`); `resolvePolicyViewState`, `PolicyViewState` (`@/lib/policy/policy-view-state`); `ApiError`, `getLastRequestId` (`@/lib/api/api-client`); `SecurityPolicy`, `SecurityPolicyCategory`, `SecurityPolicyListResponse` (`@/types/policy.types`).
- Produces: `useSecurityPolicies(category: Ref<SecurityPolicyCategory>): UseSecurityPoliciesReturn` where
  - `policies: Ref<readonly SecurityPolicy[] | null>` (null = unfetched, kept distinct from `[]`)
  - `active: ComputedRef<Readonly<Record<string, unknown>> | null>` (the active payload object, or `null` when the backend returns `[]`/`{}`/absent)
  - `viewState: ComputedRef<PolicyViewState>`, `isStale: ComputedRef<boolean>`, `requestId: ComputedRef<string | null>`, `pending: Ref<boolean>`, `refresh: () => Promise<void>`.
  - Refetches when `category` changes (`useAsyncData` `watch: [category]`); SSR-resolves so the masked DTO hydrates and the token stays in Nitro context.

- [ ] **Step 1: Write the failing test** — `app/composables/__tests__/useSecurityPolicies.nuxt.spec.ts`:

```ts
// *.nuxt.spec.ts → nuxt env. useAsyncData is mocked to run the handler once (so we
// assert policyApi.list got the category) and to return refs the test drives.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { ApiError } from '@/lib/api/api-client'
import type { SecurityPolicy, SecurityPolicyCategory } from '@/types/policy.types'

const listMock = vi.fn<(category: string) => Promise<unknown>>()
vi.mock('@/services/policy.api', () => ({ policyApi: { list: listMock } }))

const dataRef = ref<unknown>(null)
const pendingRef = ref(false)
const errorRef = ref<unknown>(null)
const refreshMock = vi.fn<() => Promise<void>>(async () => {})

mockNuxtImport('useAsyncData', () => {
  return (_key: string, handler: () => Promise<unknown>) => {
    void handler() // record the policyApi.list(category) call
    return { data: dataRef, pending: pendingRef, error: errorRef, refresh: refreshMock }
  }
})

const { useSecurityPolicies } = await import('../useSecurityPolicies')

const policy: SecurityPolicy = {
  id: 1,
  category: 'password',
  version: 1,
  status: 'active',
  payload: { min_length: 14 },
  created_at: '2026-06-01T00:00:00Z',
  updated_at: '2026-06-01T00:00:00Z',
}

beforeEach(() => {
  dataRef.value = null
  pendingRef.value = false
  errorRef.value = null
  listMock.mockReset()
  listMock.mockResolvedValue({ category: 'password', active: {}, policies: [] })
})
afterEach(() => {
  vi.clearAllMocks()
})

describe('useSecurityPolicies', () => {
  it('fetches the given category', () => {
    const category = ref<SecurityPolicyCategory>('session')
    useSecurityPolicies(category)
    expect(listMock).toHaveBeenCalledWith('session')
  })

  it('maps loading / empty / ready from the response', () => {
    const r = useSecurityPolicies(ref<SecurityPolicyCategory>('password'))
    pendingRef.value = true
    expect(r.viewState.value).toBe('loading')
    pendingRef.value = false
    dataRef.value = { category: 'password', active: {}, policies: [] }
    expect(r.viewState.value).toBe('empty')
    dataRef.value = { category: 'password', active: {}, policies: [policy] }
    expect(r.viewState.value).toBe('ready')
    expect(r.policies.value).toEqual([policy])
  })

  it('normalizes the active payload: [] and {} both become null, a real object passes through', () => {
    const r = useSecurityPolicies(ref<SecurityPolicyCategory>('password'))
    dataRef.value = { category: 'password', active: [], policies: [policy] }
    expect(r.active.value).toBeNull()
    dataRef.value = { category: 'password', active: {}, policies: [policy] }
    expect(r.active.value).toBeNull()
    dataRef.value = { category: 'password', active: { min_length: 14 }, policies: [policy] }
    expect(r.active.value).toEqual({ min_length: 14 })
  })

  it('keeps the last-good list and flags stale when a refresh errors', () => {
    const r = useSecurityPolicies(ref<SecurityPolicyCategory>('password'))
    dataRef.value = { category: 'password', active: {}, policies: [policy] }
    errorRef.value = new ApiError(500, 'boom')
    expect(r.viewState.value).toBe('ready')
    expect(r.isStale.value).toBe(true)
  })

  it('surfaces the ApiError requestId', () => {
    const r = useSecurityPolicies(ref<SecurityPolicyCategory>('password'))
    errorRef.value = new ApiError(403, 'no', undefined, {}, 'req-policy')
    expect(r.requestId.value).toBe('req-policy')
  })
})
```

- [ ] **Step 2: Run it — expect FAIL** (module-not-found).

- [ ] **Step 3: Create `app/composables/useSecurityPolicies.ts`:**

```ts
import { computed, type ComputedRef, type Ref } from 'vue'
import { ApiError, getLastRequestId } from '@/lib/api/api-client'
import { policyApi } from '@/services/policy.api'
import { resolvePolicyViewState, type PolicyViewState } from '@/lib/policy/policy-view-state'
import type {
  SecurityPolicy,
  SecurityPolicyCategory,
  SecurityPolicyListResponse,
} from '@/types/policy.types'

export type UseSecurityPoliciesReturn = {
  readonly policies: Ref<readonly SecurityPolicy[] | null>
  readonly active: ComputedRef<Readonly<Record<string, unknown>> | null>
  readonly viewState: ComputedRef<PolicyViewState>
  readonly isStale: ComputedRef<boolean>
  readonly requestId: ComputedRef<string | null>
  readonly pending: Ref<boolean>
  readonly refresh: () => Promise<void>
}

export function useSecurityPolicies(
  category: Ref<SecurityPolicyCategory>,
): UseSecurityPoliciesReturn {
  // Runs during SSR so the masked policy list resolves server-side and hydrates as
  // safe DTO only. The token stays in Nitro event.context. Refetches on category
  // change via the watch option (one static key; data is replaced per category).
  const { data, pending, error, refresh } = useAsyncData<SecurityPolicyListResponse>(
    'admin-security-policies',
    () => policyApi.list(category.value),
    { watch: [category] },
  )

  const policies = computed<readonly SecurityPolicy[] | null>(() => data.value?.policies ?? null)

  // The backend returns the active payload object, or `[]` when none is active.
  // Normalize `[]`, `{}`, and absent all to null so the page shows one "no active
  // configuration" surface.
  const active = computed<Readonly<Record<string, unknown>> | null>(() => {
    const value = data.value?.active
    if (!value || Array.isArray(value)) return null
    return Object.keys(value).length > 0 ? value : null
  })

  const viewState = computed<PolicyViewState>(() =>
    resolvePolicyViewState({ pending: pending.value, error: error.value, policies: policies.value }),
  )

  const isStale = computed<boolean>(() => Boolean(error.value) && policies.value !== null)

  const requestId = computed<string | null>(() =>
    error.value instanceof ApiError
      ? (error.value.requestId ?? getLastRequestId())
      : getLastRequestId(),
  )

  return {
    policies,
    active,
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
git add app/composables/useSecurityPolicies.ts app/composables/__tests__/useSecurityPolicies.nuxt.spec.ts
git commit -m "$(cat <<'EOF'
feat(sso-admin-frontend): useSecurityPolicies SSR composable (category-reactive)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Task-scoped DoD:** `npm run typecheck && npm run lint && npm run format:check && npm run test -- app/composables/__tests__/useSecurityPolicies.nuxt.spec.ts` — all green.

---

### Task 8.5: `PolicyVersionsTable.vue` (Swiss version-history table)

**Files:**
- Create: `app/components/policy/PolicyVersionsTable.vue`
- Test: `app/components/policy/__tests__/PolicyVersionsTable.spec.ts`

**Interfaces:**
- Consumes: `UiDataList` (+ `UiDataListColumn`, `UiDataListRow`), `UiStatusBadge`, `UiFolio` (`@/components/ui/*`); `resolvePolicyStatusTone` (`@/lib/policy/policy-view-state`); `SecurityPolicy` (`@/types/policy.types`).
- Produces: `PolicyVersionsTable.vue` — props `policies: readonly SecurityPolicy[]`, `caption`, `versionLabel`, `effectiveLabel`, `statusLabel`, `actorLabel: string`, `statusLabels: Readonly<Record<string, string>>` (status → display label); emits `select(id: number)`. The version cell is a button (keyboard-reachable) that emits `select`; the actor id renders mono (`UiFolio variant="id"`); the status renders tone+label via `UiStatusBadge` (never colour-alone); the effective timestamp renders via `UiFolio variant="timestamp"`.

> ponytail: presentational only — no fetch, no privileged action, no i18n inside the component (the page passes resolved labels, matching `RolesTable`). Explicit `Ui*` imports (not auto-import), so the spec is a plain jsdom `mount`.

- [ ] **Step 1: Write the failing test** — `app/components/policy/__tests__/PolicyVersionsTable.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PolicyVersionsTable from '../PolicyVersionsTable.vue'
import type { SecurityPolicy } from '@/types/policy.types'

const policies: readonly SecurityPolicy[] = [
  {
    id: 7,
    category: 'password',
    version: 3,
    status: 'active',
    payload: { min_length: 14 },
    effective_at: '2026-06-20T10:00:00Z',
    actor_subject_id: '01HZX9ADMINULID0000000000',
    reason: 'Tighten',
    created_at: '2026-06-20T10:00:00Z',
    updated_at: '2026-06-20T10:00:00Z',
  },
  {
    id: 6,
    category: 'password',
    version: 2,
    status: 'superseded',
    payload: { min_length: 12 },
    effective_at: '2026-05-01T10:00:00Z',
    actor_subject_id: '01HZX9ADMINULID1111111111',
    reason: 'Baseline',
    created_at: '2026-05-01T10:00:00Z',
    updated_at: '2026-05-01T10:00:00Z',
  },
]

const props = {
  policies,
  caption: 'Versions',
  versionLabel: 'Version',
  effectiveLabel: 'Effective',
  statusLabel: 'Status',
  actorLabel: 'Changed by',
  statusLabels: { active: 'Active', superseded: 'Superseded' },
}

describe('PolicyVersionsTable', () => {
  it('renders one selectable row per version with its mapped status label', () => {
    const wrapper = mount(PolicyVersionsTable, { props })
    expect(wrapper.find('[data-testid="policy-version-select-7"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="policy-version-select-6"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Active')
    expect(wrapper.text()).toContain('Superseded')
  })

  it('emits select with the policy id when a version button is clicked', async () => {
    const wrapper = mount(PolicyVersionsTable, { props })
    await wrapper.find('[data-testid="policy-version-select-7"]').trigger('click')
    expect(wrapper.emitted('select')).toEqual([[7]])
  })

  it('renders the actor id (mono) for each row', () => {
    const wrapper = mount(PolicyVersionsTable, { props })
    expect(wrapper.text()).toContain('01HZX9ADMINULID0000000000')
  })
})
```

- [ ] **Step 2: Run it — expect FAIL** (component does not exist).

- [ ] **Step 3: Create `app/components/policy/PolicyVersionsTable.vue`:**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import UiDataList, {
  type UiDataListColumn,
  type UiDataListRow,
} from '@/components/ui/UiDataList.vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import UiFolio from '@/components/ui/UiFolio.vue'
import { resolvePolicyStatusTone } from '@/lib/policy/policy-view-state'
import type { SecurityPolicy } from '@/types/policy.types'

const props = defineProps<{
  readonly policies: readonly SecurityPolicy[]
  readonly caption: string
  readonly versionLabel: string
  readonly effectiveLabel: string
  readonly statusLabel: string
  readonly actorLabel: string
  readonly statusLabels: Readonly<Record<string, string>>
}>()

const emit = defineEmits<{
  (event: 'select', id: number): void
}>()

const columns = computed<readonly UiDataListColumn[]>(() => [
  { key: 'version', label: props.versionLabel, align: 'left' },
  { key: 'effective', label: props.effectiveLabel, align: 'left' },
  { key: 'status', label: props.statusLabel, align: 'right' },
])

const rows = computed<readonly UiDataListRow[]>(() =>
  props.policies.map((policy) => ({
    id: String(policy.id),
    version: policy.version,
    effective: policy.effective_at ?? '—',
    status: policy.status,
    actor: policy.actor_subject_id ?? '—',
  })),
)

function statusText(status: string): string {
  return props.statusLabels[status] ?? status
}
</script>

<template>
  <UiDataList :caption="caption" :columns="columns" :rows="rows">
    <template #cell(version)="{ row }">
      <button
        type="button"
        class="policy-versions__select"
        :data-testid="`policy-version-select-${row.id}`"
        @click="emit('select', Number(row.id))"
      >
        <UiFolio :index="Number(row['version'])" variant="count" />
      </button>
      <span class="policy-versions__actor">
        {{ actorLabel }}:
        <UiFolio :value="String(row['actor'])" variant="id" />
      </span>
    </template>

    <template #cell(effective)="{ row }">
      <UiFolio :value="String(row['effective'])" variant="timestamp" />
    </template>

    <template #cell(status)="{ row }">
      <UiStatusBadge
        :tone="resolvePolicyStatusTone(String(row['status']))"
        :label="statusText(String(row['status']))"
      />
    </template>
  </UiDataList>
</template>

<style scoped>
.policy-versions__select {
  appearance: none;
  padding: 0;
  background: none;
  border: none;
  font: inherit;
  color: var(--accent);
  cursor: pointer;
}
.policy-versions__select:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.policy-versions__actor {
  display: block;
  margin-top: 2px;
  font: 400 0.6875rem/1.2 var(--font-sans);
  color: var(--fg-3);
}
</style>
```

- [ ] **Step 4: Run it — expect PASS.**

- [ ] **Step 5: Commit:**

```bash
git add app/components/policy/PolicyVersionsTable.vue app/components/policy/__tests__/PolicyVersionsTable.spec.ts
git commit -m "$(cat <<'EOF'
feat(sso-admin-frontend): Swiss PolicyVersionsTable (version history, folio + status)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Task-scoped DoD:** `npm run typecheck && npm run lint && npm run format:check && npm run test -- app/components/policy/__tests__/PolicyVersionsTable.spec.ts` — all green.

---

### Task 8.6: `/policy` page — all six states, category selector, active summary, versions table + detail drawer (read surface)

**Files:**
- Modify: `app/pages/policy.vue` (replace the placeholder body)
- Modify: `app/locales/en.json` + `app/locales/id.json` (extend the existing `policy.*` block — see Step 3)
- Test: `app/pages/__tests__/policy.page.nuxt.spec.ts`

**Interfaces:**
- Consumes: `useSecurityPolicies` (8.4); `PolicyVersionsTable` (8.5); `findActiveVersion`, `POLICY_CATEGORIES` (8.2); `useSessionStore` (`@/stores/session.store`); `useI18n` (`@/composables/useI18n`); `UiSelect`, `UiSkeleton`, `UiStatusView`, `UiEmptyState`, `UiDetailDrawer`, `UiFormField`, `UiFolio` (`@/components/ui/*`); `SecurityPolicy`, `SecurityPolicyCategory` (`@/types/policy.types`).
- Produces (`app/pages/policy.vue`): a read surface — category `UiSelect`, an **active-configuration summary** (the `active` payload as a Swiss mono `<pre>`, or an "no active policy" line), the `PolicyVersionsTable`, and a read-only `UiDetailDrawer` (selected version → status badge, effective folio, actor mono, reason, and the version `payload` JSON in a mono `<pre>`). Six states. The page declares the canonical handler names Tasks 8.7–8.9 fill: `onSelectVersion`, `onCloseDrawer`, `onCategoryChange`, `onRefresh`, plus stubs `onProposeSubmit`/`onActivateRequested`/`onRollbackRequested` (bodies arrive in 8.7–8.9). `successMessage` (single aria-live region, reused by 8.7–8.9).

> ponytail: no JSON-viewer dependency — the payload renders as `JSON.stringify(payload, null, 2)` inside a `<pre class="policy-json">` styled mono (copy the `ClientSecretReveal` `<pre>` styling). No date-format layer — timestamps render via `UiFolio variant="timestamp"` (the app shows raw ISO in folio styling).

- [ ] **Step 1: Write the failing test** — `app/pages/__tests__/policy.page.nuxt.spec.ts`:

```ts
// *.nuxt.spec.ts → nuxt env. The composable, session store, i18n and navigateTo are
// mocked so each state is deterministic; mountSuspended runs the page's async setup.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import enLocale from '@/locales/en.json'
import type { PolicyViewState } from '@/lib/policy/policy-view-state'
import type { SecurityPolicy } from '@/types/policy.types'

const ACTIVE_POLICY: SecurityPolicy = {
  id: 7,
  category: 'password',
  version: 3,
  status: 'active',
  payload: { min_length: 14, require_special: true },
  effective_at: '2026-06-20T10:00:00Z',
  actor_subject_id: '01HZX9ADMINULID0000000000',
  reason: 'Tighten password policy',
  created_at: '2026-06-20T10:00:00Z',
  updated_at: '2026-06-20T10:00:00Z',
}

const policiesRef = ref<readonly SecurityPolicy[] | null>([ACTIVE_POLICY])
const activeRef = ref<Readonly<Record<string, unknown>> | null>({ min_length: 14 })
const viewStateRef = ref<PolicyViewState>('ready')
const refreshMock = vi.fn<() => Promise<void>>(async () => {})
vi.mock('@/composables/useSecurityPolicies', () => ({
  useSecurityPolicies: () => ({
    policies: policiesRef,
    active: computed(() => activeRef.value),
    viewState: computed(() => viewStateRef.value),
    isStale: computed(() => false),
    requestId: computed(() => null),
    pending: ref(false),
    refresh: refreshMock,
  }),
}))

let permitted: string[] = []
const ensureSessionMock = vi.fn<(force?: boolean) => Promise<string>>(async () => 'authenticated')
vi.mock('@/stores/session.store', () => ({
  useSessionStore: () => ({
    principal: { display_name: 'Admin Sentinel' },
    ensureSession: ensureSessionMock,
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

const PolicyPage = (await import('../policy.vue')).default

beforeEach(() => {
  permitted = ['admin.security-policy.read']
  policiesRef.value = [ACTIVE_POLICY]
  activeRef.value = { min_length: 14 }
  viewStateRef.value = 'ready'
  refreshMock.mockReset()
})
afterEach(() => {
  vi.clearAllMocks()
})

describe('policy page — states', () => {
  it('renders the loading skeleton', async () => {
    viewStateRef.value = 'loading'
    const wrapper = await mountSuspended(PolicyPage)
    expect(wrapper.find('[data-page="policy"]').exists()).toBe(true)
    expect(wrapper.text()).toContain(enLocale.policy.loading)
  })

  it('renders the forbidden surface', async () => {
    viewStateRef.value = 'forbidden'
    const wrapper = await mountSuspended(PolicyPage)
    expect(wrapper.text()).toContain(enLocale.policy.forbidden_title)
  })

  it('renders the empty surface when the category has no versions', async () => {
    viewStateRef.value = 'empty'
    policiesRef.value = []
    const wrapper = await mountSuspended(PolicyPage)
    expect(wrapper.text()).toContain(enLocale.policy.empty_title)
  })

  it('renders the versions table in the ready state', async () => {
    const wrapper = await mountSuspended(PolicyPage)
    expect(wrapper.find('[data-testid="policy-version-select-7"]').exists()).toBe(true)
  })
})

describe('policy page — active summary + detail drawer', () => {
  it('shows the active configuration payload (read surface)', async () => {
    const wrapper = await mountSuspended(PolicyPage)
    expect(wrapper.find('[data-testid="policy-active-summary"]').text()).toContain('min_length')
  })

  it('opens the read-only detail drawer with the version payload + actor on row select', async () => {
    const wrapper = await mountSuspended(PolicyPage)
    await wrapper.find('[data-testid="policy-version-select-7"]').trigger('click')
    await flushPromises()
    const drawer = wrapper.find('[data-testid="policy-detail"]')
    expect(drawer.exists()).toBe(true)
    expect(drawer.text()).toContain('require_special') // payload JSON rendered
    expect(drawer.text()).toContain('01HZX9ADMINULID0000000000') // actor mono
    expect(drawer.text()).toContain('Tighten password policy') // reason
  })
})
```

- [ ] **Step 2: Run it — expect FAIL** (the placeholder page renders only `<h1>Security policy</h1>`).

- [ ] **Step 3: Extend the `policy.*` locale block** (BOTH `app/locales/en.json` and `app/locales/id.json`, inside the existing `policy` object — add only keys not already present; keep parity).

`en.json` → `policy`:
```json
    "signed_in_as": "Signed in as {name}",
    "active_title": "Active configuration",
    "active_none": "No active policy for this category.",
    "label_actor": "Changed by",
    "payload_label": "Payload",
    "status_draft": "Draft",
    "status_active": "Active",
    "status_superseded": "Superseded",
    "status_rolled_back": "Rolled back",
    "category_password": "Password",
    "category_mfa": "Multi-factor",
    "category_session": "Session",
    "category_lockout": "Lockout",
    "category_legal_hold": "Legal hold"
```
`id.json` → `policy`:
```json
    "signed_in_as": "Masuk sebagai {name}",
    "active_title": "Konfigurasi aktif",
    "active_none": "Belum ada kebijakan aktif untuk kategori ini.",
    "label_actor": "Diubah oleh",
    "payload_label": "Muatan",
    "status_draft": "Draf",
    "status_active": "Aktif",
    "status_superseded": "Digantikan",
    "status_rolled_back": "Dikembalikan",
    "category_password": "Kata sandi",
    "category_mfa": "Multi-faktor",
    "category_session": "Sesi",
    "category_lockout": "Penguncian",
    "category_legal_hold": "Penahanan hukum"
```

- [ ] **Step 4: Replace `app/pages/policy.vue`** (read surface; the handler bodies for propose/activate/rollback land in 8.7–8.9):

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useSessionStore } from '@/stores/session.store'
import { useI18n } from '@/composables/useI18n'
import { useSecurityPolicies } from '@/composables/useSecurityPolicies'
import { POLICY_CATEGORIES, findActiveVersion } from '@/lib/policy/policy-helpers'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import UiFormField from '@/components/ui/UiFormField.vue'
import UiFolio from '@/components/ui/UiFolio.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import UiDetailDrawer from '@/components/ui/UiDetailDrawer.vue'
import PolicyVersionsTable from '@/components/policy/PolicyVersionsTable.vue'
import { resolvePolicyStatusTone } from '@/lib/policy/policy-view-state'
import type { SecurityPolicy, SecurityPolicyCategory } from '@/types/policy.types'

definePageMeta({
  name: 'admin.policy',
  layout: 'admin',
  requiresAdmin: true,
  permissions: ['admin.security-policy.read'],
})

const { t } = useI18n()
const store = useSessionStore()

// SAFE HYDRATION: resolve the masked principal server-side. Tokens stay in Nitro
// event.context; the policy DTOs carry no token/secret/PII (payload is non-secret
// config, actor_subject_id is an opaque admin ULID, reason is audit text).
await useAsyncData('admin-policy-principal', () => store.ensureSession())

const category = ref<SecurityPolicyCategory>('password')
const { policies, active, viewState, requestId, isStale, refresh } = useSecurityPolicies(category)

const policyList = computed<readonly SecurityPolicy[]>(() => policies.value ?? [])
const activeVersion = computed<number | null>(() => findActiveVersion(policyList.value))

// UiSelect speaks `string`; this writable proxy keeps the v-model binding
// type-checking while `category` stays the typed Ref passed to the composable
// (mirrors app/pages/clients/new.vue + ComplianceExportPanel.vue).
const categoryModel = computed<string>({
  get: () => category.value,
  set: (value) => {
    category.value = value as SecurityPolicyCategory
  },
})

const categoryOptions = computed(() =>
  POLICY_CATEGORIES.map((c) => ({ value: c, label: t(`policy.category_${c}`) })),
)

const statusLabels = computed<Readonly<Record<string, string>>>(() => ({
  draft: t('policy.status_draft'),
  active: t('policy.status_active'),
  superseded: t('policy.status_superseded'),
  rolled_back: t('policy.status_rolled_back'),
}))

// The active payload, pretty-printed (read surface). Non-secret config only.
const activeJson = computed<string | null>(() =>
  active.value ? JSON.stringify(active.value, null, 2) : null,
)

// Master-detail: selected version drives the read-only drawer.
const selectedId = ref<number | null>(null)
const selectedPolicy = computed<SecurityPolicy | null>(
  () => policyList.value.find((p) => p.id === selectedId.value) ?? null,
)
const selectedJson = computed<string>(() =>
  selectedPolicy.value ? JSON.stringify(selectedPolicy.value.payload, null, 2) : '',
)

// Single page-level success region — reused by propose/activate/rollback (8.7–8.9).
const successMessage = ref<string | null>(null)

function onSelectVersion(id: number): void {
  selectedId.value = id
}
function onCloseDrawer(): void {
  selectedId.value = null
}
async function onCategoryChange(): Promise<void> {
  selectedId.value = null
  successMessage.value = null
  // The composable refetches via its category watch; nothing else to do.
}
async function onRefresh(): Promise<void> {
  await refresh()
}

// Handler bodies filled by later tasks (declared once; never renamed):
function onProposeSubmit(): void {
  /* Task 8.7 */
}
function onActivateRequested(_version: number): void {
  /* Task 8.8 */
}
function onRollbackRequested(_version: number): void {
  /* Task 8.9 */
}
</script>

<template>
  <section class="policy" data-page="policy" data-admin-shell>
    <header class="policy__hero">
      <span class="policy__eyebrow">{{ t('policy.eyebrow') }}</span>
      <div class="policy__heading">
        <h1 class="policy__title">{{ t('policy.title') }}</h1>
        <p class="policy__summary">{{ t('policy.summary') }}</p>
        <p class="policy__principal" data-principal-name>
          {{ t('policy.signed_in_as', { name: store.principal?.display_name ?? '—' }) }}
        </p>
      </div>
      <UiFormField id="policy-category" :label="t('policy.label_category')">
        <UiSelect
          id="policy-category"
          v-model="categoryModel"
          :options="categoryOptions"
          @update:model-value="onCategoryChange"
        />
      </UiFormField>
    </header>

    <p
      v-if="successMessage"
      class="policy__success"
      role="status"
      aria-live="polite"
      data-testid="policy-action-success"
    >
      {{ successMessage }}
    </p>

    <UiSkeleton v-if="viewState === 'loading'" :rows="5" :label="t('policy.loading')" />

    <UiStatusView
      v-else-if="viewState === 'forbidden'"
      tone="forbidden"
      :eyebrow="t('policy.eyebrow')"
      :title="t('policy.forbidden_title')"
      :description="t('common.forbidden_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="viewState === 'unauthenticated'"
      tone="step_up"
      :eyebrow="t('policy.eyebrow')"
      :title="t('common.session_expired_title')"
      :description="t('common.session_expired_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="viewState === 'error'"
      tone="error"
      :eyebrow="t('policy.eyebrow')"
      :title="t('policy.error_title')"
      :description="t('common.error_loading_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    >
      <template #actions>
        <UiButton variant="secondary" size="sm" data-testid="policy-refresh" @click="onRefresh">
          {{ t('common.btn_refresh') }}
        </UiButton>
      </template>
    </UiStatusView>

    <UiEmptyState
      v-else-if="viewState === 'empty'"
      :title="t('policy.empty_title')"
      :description="t('policy.empty_desc')"
    />

    <template v-else>
      <div v-if="isStale" class="policy__banner" role="status">
        {{ t('common.error_loading_desc') }}
      </div>

      <section class="policy__active" aria-labelledby="policy-active-title">
        <h2 id="policy-active-title" class="policy__h2">{{ t('policy.active_title') }}</h2>
        <pre v-if="activeJson" class="policy-json" data-testid="policy-active-summary">{{ activeJson }}</pre>
        <p v-else class="policy__muted" data-testid="policy-active-summary">
          {{ t('policy.active_none') }}
        </p>
      </section>

      <section class="policy__versions" aria-labelledby="policy-versions-title">
        <h2 id="policy-versions-title" class="policy__h2">{{ t('policy.versions_title') }}</h2>
        <PolicyVersionsTable
          :policies="policyList"
          :caption="t('policy.versions_title')"
          :version-label="t('policy.col_version')"
          :effective-label="t('policy.col_effective')"
          :status-label="t('policy.col_status')"
          :actor-label="t('policy.label_actor')"
          :status-labels="statusLabels"
          @select="onSelectVersion"
        />
      </section>

      <UiDetailDrawer
        v-if="selectedPolicy"
        :open="selectedPolicy !== null"
        title-id="policy-detail-drawer"
        :title="`${selectedPolicy.category} · v${selectedPolicy.version}`"
        :description="t('policy.detail_desc')"
        :close-label="t('policy.close_detail')"
        wide
        @close="onCloseDrawer"
      >
        <div class="policy-detail" data-testid="policy-detail">
          <div class="policy-detail__head">
            <UiStatusBadge
              :tone="resolvePolicyStatusTone(selectedPolicy.status)"
              :label="statusLabels[selectedPolicy.status] ?? selectedPolicy.status"
            />
            <span class="policy-detail__effective">
              <UiFolio :value="String(selectedPolicy.effective_at ?? '—')" variant="timestamp" />
            </span>
          </div>
          <p class="policy-detail__actor">
            {{ t('policy.label_actor') }}:
            <UiFolio :value="String(selectedPolicy.actor_subject_id ?? '—')" variant="id" />
          </p>
          <p v-if="selectedPolicy.reason" class="policy-detail__reason">{{ selectedPolicy.reason }}</p>
          <h3 class="policy-detail__h3">{{ t('policy.payload_label') }}</h3>
          <pre class="policy-json">{{ selectedJson }}</pre>
        </div>
      </UiDetailDrawer>
    </template>
  </section>
</template>

<style scoped>
.policy {
  display: grid;
  gap: 24px;
  padding: 24px;
}
.policy__hero {
  display: grid;
  gap: 12px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border);
}
.policy__eyebrow {
  font: 600 0.6875rem/1 var(--font-sans);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.policy__title {
  margin: 0;
  font: 600 1.5rem/1.2 var(--font-sans);
  letter-spacing: -0.02em;
  color: var(--fg);
}
.policy__summary,
.policy__principal {
  margin: 0;
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--fg-2);
}
.policy__h2 {
  margin: 0 0 12px;
  font: 600 1rem/1.3 var(--font-sans);
  color: var(--fg);
}
.policy__success {
  margin: 0;
  padding: 10px 14px;
  font: 500 0.8125rem/1.4 var(--font-sans);
  color: var(--fg);
  background: var(--card);
  border: 1px solid var(--border);
}
.policy__banner {
  padding: 10px 14px;
  font: 500 0.8125rem/1.4 var(--font-sans);
  color: var(--warning-soft-fg);
  background: var(--warning-soft);
  border: 1px solid var(--warning-soft-fg);
}
.policy__muted {
  margin: 0;
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--fg-3);
}
.policy-json {
  margin: 0;
  padding: 12px;
  overflow-x: auto;
  font: 400 0.75rem/1.5 var(--font-mono);
  color: var(--fg);
  background: var(--bg-2);
  border: 1px solid var(--border);
  white-space: pre;
}
.policy-detail {
  display: grid;
  gap: 12px;
}
.policy-detail__head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.policy-detail__actor,
.policy-detail__reason {
  margin: 0;
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--fg-2);
}
.policy-detail__h3 {
  margin: 4px 0 0;
  font: 600 0.8125rem/1.2 var(--font-sans);
  color: var(--fg);
}
</style>
```

- [ ] **Step 5: Run it — expect PASS** (`npm run test -- app/pages/__tests__/policy.page.nuxt.spec.ts`). Expected: GREEN — states (4) + active summary + drawer (2).

- [ ] **Step 6: Commit:**

```bash
git add app/pages/policy.vue app/pages/__tests__/policy.page.nuxt.spec.ts app/locales/en.json app/locales/id.json
git commit -m "$(cat <<'EOF'
feat(sso-admin-frontend): compose Swiss policy page (states, versions table, read drawer)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Task-scoped DoD:** `npm run typecheck && npm run lint && npm run format:check && npm run test -- app/pages/__tests__/policy.page.nuxt.spec.ts` — all green (both lint passes). The SSR-leak gate over `/policy` lands in Task 8.10.

---

### Task 8.7: Propose-draft privileged write (payload textarea + parse-validate + confirm)

**Files:**
- Modify: `app/pages/policy.vue` (fill `onProposeSubmit`; add the draft textarea, the propose `PrivilegedActionDialog`, and the propose `usePrivilegedAction` instance)
- Modify: `app/locales/en.json` + `app/locales/id.json` (add the propose keys)
- Test: `app/pages/__tests__/policy-propose.page.nuxt.spec.ts`

**Interfaces:**
- Consumes: `usePrivilegedAction` (`@/composables/usePrivilegedAction`), `PrivilegedActionDialog` (`@/components/users/PrivilegedActionDialog.vue`), `UiTextarea` (`@/components/ui/UiTextarea.vue`), `parsePolicyPayload` (`@/lib/policy/policy-helpers`), `policyApi` (`@/services/policy.api`), `PolicyMutationResponse` (`@/types/policy.types`).
- Produces (`app/pages/policy.vue`): a `usePrivilegedAction<PolicyMutationResponse>()` propose instance; a `canWrite` computed (`admin.security-policy.write`); a payload `UiTextarea` gated on `canWrite` with an **inline JSON parse error** (`parsePolicyPayload` — never submits invalid JSON / non-object); a "Create draft" button that opens the reused `PrivilegedActionDialog` (accent, not danger) carrying the optional reason; on confirm runs `policyApi.propose(category, { payload, reason })` through the matrix; on success closes the dialog, sets `successMessage` (`policy.propose_success`), and `refresh()`es. The full `403/419/422/428/429/5xx` + step-up matrix surfaces safe copy + only `REF-…`; cancel calls no API.

> ponytail: the textarea is the only new input; reason + the entire failure matrix (step-up link, REF, no-stale-loading) come from the reused dialog + runner — no inline REF rendering, no second confirm primitive. Backend validates `payload => required|array` regardless; the client parse-guard is fail-fast UX, not the authority.

- [ ] **Step 1: Write the failing test** — `app/pages/__tests__/policy-propose.page.nuxt.spec.ts`. Mirror the harness from `policy.page.nuxt.spec.ts` (mock `useSecurityPolicies`, `useSessionStore` with `permitted` incl. `admin.security-policy.write`, `useI18n` pinned to en, `navigateTo`), but make `usePrivilegedAction` + `PrivilegedActionDialog` **real** and spy only `policyApi.propose`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import enLocale from '@/locales/en.json'
import { ApiError } from '@/lib/api/api-client'
import type { PolicyMutationResponse, SecurityPolicy } from '@/types/policy.types'

const proposeMock = vi.fn<(category: string, payload: unknown) => Promise<PolicyMutationResponse>>()
vi.mock('@/services/policy.api', () => ({
  policyApi: { list: vi.fn(), propose: proposeMock, activate: vi.fn(), rollback: vi.fn() },
}))

const POLICY: SecurityPolicy = {
  id: 7, category: 'password', version: 3, status: 'active',
  payload: { min_length: 14 }, effective_at: '2026-06-20T10:00:00Z',
  actor_subject_id: '01HZX9C7K3Q8VMETBD9R2F4K7N', reason: 'Tighten',
  created_at: '2026-06-20T10:00:00Z', updated_at: '2026-06-20T10:00:00Z',
}
const policiesRef = ref<readonly SecurityPolicy[] | null>([POLICY])
const refreshMock = vi.fn<() => Promise<void>>(async () => {})
vi.mock('@/composables/useSecurityPolicies', () => ({
  useSecurityPolicies: () => ({
    policies: policiesRef,
    active: computed(() => ({ min_length: 14 })),
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
    principal: { display_name: 'Admin Sentinel' },
    ensureSession: vi.fn<() => Promise<string>>(async () => 'authenticated'),
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
mockNuxtImport('navigateTo', () => vi.fn<(...a: unknown[]) => Promise<void>>(async () => {}))

const PolicyPage = (await import('../policy.vue')).default

beforeEach(() => {
  permitted = ['admin.security-policy.read', 'admin.security-policy.write']
  policiesRef.value = [POLICY]
  proposeMock.mockReset()
  refreshMock.mockReset()
})
afterEach(() => { vi.clearAllMocks() })

async function setPayload(wrapper: Awaited<ReturnType<typeof mountSuspended>>, text: string) {
  await wrapper.find('[data-testid="policy-draft-payload"]').setValue(text)
}

describe('policy propose — draft create', () => {
  it('hides the draft editor without the write capability', async () => {
    permitted = ['admin.security-policy.read']
    const wrapper = await mountSuspended(PolicyPage)
    expect(wrapper.find('[data-testid="policy-draft-payload"]').exists()).toBe(false)
  })

  it('shows an inline parse error and opens no dialog for invalid JSON', async () => {
    const wrapper = await mountSuspended(PolicyPage)
    await setPayload(wrapper, '{not json')
    await wrapper.find('[data-testid="policy-draft-submit"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="policy-draft-parse-error"]').text()).toContain(
      enLocale.policy.payload_parse_error,
    )
    expect(wrapper.find('[data-testid="privileged-action-confirm"]').exists()).toBe(false)
    expect(proposeMock).not.toHaveBeenCalled()
  })

  it('rejects a non-object payload (array) before any API call', async () => {
    const wrapper = await mountSuspended(PolicyPage)
    await setPayload(wrapper, '[1,2,3]')
    await wrapper.find('[data-testid="policy-draft-submit"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="policy-draft-parse-error"]').text()).toContain(
      enLocale.policy.payload_not_object,
    )
    expect(proposeMock).not.toHaveBeenCalled()
  })

  it('confirms valid JSON, proposes, refreshes, and reports success', async () => {
    proposeMock.mockResolvedValue({ policy: { ...POLICY, version: 4, status: 'draft' } })
    const wrapper = await mountSuspended(PolicyPage)
    await setPayload(wrapper, '{"min_length":16}')
    await wrapper.find('[data-testid="policy-draft-submit"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
    await flushPromises()
    expect(proposeMock).toHaveBeenCalledWith('password', { payload: { min_length: 16 }, reason: undefined })
    expect(refreshMock).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="policy-action-success"]').text()).toBe(
      enLocale.policy.propose_success,
    )
  })

  it('surfaces the step-up link on 428 and does not refresh', async () => {
    proposeMock.mockRejectedValue(
      new ApiError(428, 'reauth', 'reauth_required', { step_up_url: 'https://idp.example/step-up' }, 'req-428'),
    )
    const wrapper = await mountSuspended(PolicyPage)
    await setPayload(wrapper, '{"min_length":16}')
    await wrapper.find('[data-testid="policy-draft-submit"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="privileged-action-stepup"]').find('a').attributes('href')).toBe(
      'https://idp.example/step-up',
    )
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('shows safe copy + a redacted REF on a 500 without leaking the raw request id', async () => {
    proposeMock.mockRejectedValue(new ApiError(500, 'boom', undefined, {}, 'req-500'))
    const wrapper = await mountSuspended(PolicyPage)
    await setPayload(wrapper, '{"min_length":16}')
    await wrapper.find('[data-testid="policy-draft-submit"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="privileged-action-error"]').text()).toContain(
      enLocale.common.error_generic,
    )
    expect(wrapper.find('[data-testid="privileged-action-ref"]').text()).toMatch(/^REF-/u)
    expect(wrapper.html()).not.toContain('req-500')
    expect(refreshMock).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run it — expect FAIL** (no draft textarea / no propose wiring yet).

- [ ] **Step 3: Add the propose keys** to BOTH locales (inside `policy`):

`en.json`:
```json
    "confirm_propose_title": "Create policy draft?",
    "confirm_propose_desc": "Create a new draft version of the {category} policy from this payload.",
    "reason_label": "Reason (optional)",
    "payload_parse_error": "Payload must be valid JSON.",
    "payload_not_object": "Payload must be a JSON object.",
    "propose_success": "Draft version created.",
    "propose_invalid": "The payload was rejected. Review it and try again.",
    "step_up_cta": "Re-authenticate to continue"
```
`id.json`:
```json
    "confirm_propose_title": "Buat draf kebijakan?",
    "confirm_propose_desc": "Buat versi draf baru untuk kebijakan {category} dari muatan ini.",
    "reason_label": "Alasan (opsional)",
    "payload_parse_error": "Muatan harus berupa JSON yang valid.",
    "payload_not_object": "Muatan harus berupa objek JSON.",
    "propose_success": "Versi draf dibuat.",
    "propose_invalid": "Muatan ditolak. Periksa kembali lalu coba lagi.",
    "step_up_cta": "Autentikasi ulang untuk melanjutkan"
```

- [ ] **Step 4: Wire propose into `app/pages/policy.vue`.** Add to `<script setup>` (imports + state + replace the `onProposeSubmit` stub):

```ts
import { usePrivilegedAction } from '@/composables/usePrivilegedAction'
import PrivilegedActionDialog from '@/components/users/PrivilegedActionDialog.vue'
import UiTextarea from '@/components/ui/UiTextarea.vue'
import { parsePolicyPayload } from '@/lib/policy/policy-helpers'
import { policyApi } from '@/services/policy.api'
import type { PolicyMutationResponse } from '@/types/policy.types'

const canWrite = computed<boolean>(() => store.hasPermission('admin.security-policy.write'))

const proposeAction = usePrivilegedAction<PolicyMutationResponse>()
const payloadText = ref('{\n  "min_length": 14\n}')
const parseError = ref<string | null>(null)
const proposeOpen = ref(false)
const proposeReason = ref('')
const proposedPayload = ref<Record<string, unknown> | null>(null)

const proposeError = computed<string | null>(() => {
  const status = proposeAction.failure.value?.status
  if (!status || status === 'step_up_required') return null
  if (status === 'invalid') return t('policy.propose_invalid')
  return t('common.error_generic')
})

// REPLACE the 8.6 stub body (do NOT rename).
function onProposeSubmit(): void {
  const parsed = parsePolicyPayload(payloadText.value)
  if (!parsed.ok) {
    parseError.value =
      parsed.error === 'syntax' ? t('policy.payload_parse_error') : t('policy.payload_not_object')
    return
  }
  parseError.value = null
  proposedPayload.value = parsed.value
  proposeReason.value = ''
  proposeAction.reset()
  successMessage.value = null
  proposeOpen.value = true
}

function onProposeCancel(): void {
  proposeOpen.value = false
}

async function onProposeConfirm(): Promise<void> {
  const payload = proposedPayload.value
  if (!payload) return
  const reason = proposeReason.value.trim() || undefined
  const result = await proposeAction.run(() => policyApi.propose(category.value, { payload, reason }))
  if (result === null) return // failure stays in the open dialog
  proposeOpen.value = false
  successMessage.value = t('policy.propose_success')
  await refresh()
}
```

Add the draft editor inside the ready branch (before `PolicyVersionsTable`'s section), and the propose dialog at page level:

```vue
      <section v-if="canWrite" class="policy__draft" aria-labelledby="policy-draft-title">
        <h2 id="policy-draft-title" class="policy__h2">{{ t('policy.label_draft_payload') }}</h2>
        <UiTextarea v-model="payloadText" :rows="6" data-testid="policy-draft-payload" />
        <p
          v-if="parseError"
          class="policy__error"
          role="alert"
          data-testid="policy-draft-parse-error"
        >
          {{ parseError }}
        </p>
        <UiButton variant="primary" size="sm" data-testid="policy-draft-submit" @click="onProposeSubmit">
          {{ t('policy.btn_create_draft') }}
        </UiButton>
      </section>
```

```vue
    <PrivilegedActionDialog
      v-if="proposeOpen"
      :open="proposeOpen"
      :title="t('policy.confirm_propose_title')"
      :description="t('policy.confirm_propose_desc', { category })"
      :confirm-label="t('policy.btn_create_draft')"
      :cancel-label="t('common.btn_cancel')"
      :reason-label="t('policy.reason_label')"
      :reason="proposeReason"
      :submitting="proposeAction.isSubmitting.value"
      :error-message="proposeError"
      :request-id="proposeAction.requestId.value"
      :step-up-url="proposeAction.stepUpUrl.value"
      :step-up-label="t('policy.step_up_cta')"
      @update:reason="proposeReason = $event"
      @confirm="onProposeConfirm"
      @cancel="onProposeCancel"
    />
```

Add `.policy__error { margin: 0; font: 500 0.8125rem/1.4 var(--font-sans); color: var(--danger); }` to the `<style>` block. (`--danger` here is the inline VALIDATION text only — it is not a destructive affordance; the only destructive *affordance* in this domain is rollback in Task 8.9. Inline error text in the Swiss system uses `--danger` for the message, consistent with `RoleFormDialog`'s field errors.)

- [ ] **Step 5: Run it — expect PASS** (`npm run test -- app/pages/__tests__/policy-propose.page.nuxt.spec.ts`).

- [ ] **Step 6: Commit:**

```bash
git add app/pages/policy.vue app/pages/__tests__/policy-propose.page.nuxt.spec.ts app/locales/en.json app/locales/id.json
git commit -m "$(cat <<'EOF'
feat(sso-admin-frontend): propose-draft privileged write with payload parse-guard

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Task-scoped DoD:** `npm run typecheck && npm run lint && npm run format:check && npm run test -- app/pages/__tests__/policy-propose.page.nuxt.spec.ts` — all green. Re-run `policy.page.nuxt.spec.ts` to confirm no regression in the read surface.

---

### Task 8.8: Activate-version privileged action (confirm + transition impact + step-up matrix)

**Files:**
- Modify: `app/pages/policy.vue` (fill `onActivateRequested`; add the activate `usePrivilegedAction` + dialog + the drawer Activate button)
- Modify: `app/locales/en.json` + `app/locales/id.json` (add activate keys)
- Test: `app/pages/__tests__/policy-activate.page.nuxt.spec.ts`

**Interfaces:**
- Consumes: `usePrivilegedAction`, `PrivilegedActionDialog`, `policyApi.activate`, `describeTransitionImpact` (8.2), `PolicyMutationResponse`.
- Produces (`app/pages/policy.vue`): a `canActivate` computed (`admin.security-policy.activate`); an Activate affordance **inside the detail drawer**, shown only when `canActivate && selectedPolicy.status === 'draft'` (a draft is what gets promoted to active — UX minimization over the backend gate; active/superseded/rolled_back never show Activate); a `usePrivilegedAction<PolicyMutationResponse>()` activate instance + reused `PrivilegedActionDialog` (accent, **not** danger — activation is forward/operational); a `describeTransitionImpact(version, activeVersion)`-driven confirm description ("version N replaces active version M" / "version N becomes active"); on confirm runs `policyApi.activate(category, version, { reason })` through the matrix; success → close dialog + drawer, `refresh()`, `successMessage` (`policy.activate_success`); 422 `security_policy_invalid` → `policy.error_invalid_transition` (safe domain copy, never the raw exception); 428 → step-up link; cancel calls no API.

- [ ] **Step 1: Write the failing test** — `app/pages/__tests__/policy-activate.page.nuxt.spec.ts` (same harness; `permitted` includes `admin.security-policy.activate`; a **draft** version in the list so the drawer shows Activate; `usePrivilegedAction` + dialog real, only `policyApi.activate` spied):

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import enLocale from '@/locales/en.json'
import { ApiError } from '@/lib/api/api-client'
import type { PolicyMutationResponse, SecurityPolicy } from '@/types/policy.types'

const activateMock = vi.fn<(c: string, v: number, p: unknown) => Promise<PolicyMutationResponse>>()
vi.mock('@/services/policy.api', () => ({
  policyApi: { list: vi.fn(), propose: vi.fn(), activate: activateMock, rollback: vi.fn() },
}))

const ACTIVE: SecurityPolicy = {
  id: 7, category: 'password', version: 3, status: 'active', payload: { min_length: 14 },
  effective_at: '2026-06-20T10:00:00Z', actor_subject_id: '01HZX9C7K3Q8VMETBD9R2F4K7N',
  reason: 'Baseline', created_at: '2026-06-20T10:00:00Z', updated_at: '2026-06-20T10:00:00Z',
}
const DRAFT: SecurityPolicy = { ...ACTIVE, id: 8, version: 4, status: 'draft', reason: 'New draft' }
const policiesRef = ref<readonly SecurityPolicy[] | null>([DRAFT, ACTIVE])
const refreshMock = vi.fn<() => Promise<void>>(async () => {})
vi.mock('@/composables/useSecurityPolicies', () => ({
  useSecurityPolicies: () => ({
    policies: policiesRef, active: computed(() => ({ min_length: 14 })),
    viewState: computed(() => 'ready' as const), isStale: computed(() => false),
    requestId: computed(() => null), pending: ref(false), refresh: refreshMock,
  }),
}))
let permitted: string[] = []
vi.mock('@/stores/session.store', () => ({
  useSessionStore: () => ({
    principal: { display_name: 'Admin Sentinel' },
    ensureSession: vi.fn<() => Promise<string>>(async () => 'authenticated'),
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
mockNuxtImport('navigateTo', () => vi.fn<(...a: unknown[]) => Promise<void>>(async () => {}))

const PolicyPage = (await import('../policy.vue')).default

beforeEach(() => {
  permitted = ['admin.security-policy.read', 'admin.security-policy.activate']
  policiesRef.value = [DRAFT, ACTIVE]
  activateMock.mockReset()
  refreshMock.mockReset()
})
afterEach(() => { vi.clearAllMocks() })

async function openDraftDrawer(wrapper: Awaited<ReturnType<typeof mountSuspended>>) {
  await wrapper.find('[data-testid="policy-version-select-8"]').trigger('click')
  await flushPromises()
}

describe('policy activate', () => {
  it('shows Activate only for a draft version, and only with the activate capability', async () => {
    const wrapper = await mountSuspended(PolicyPage)
    await openDraftDrawer(wrapper)
    expect(wrapper.find('[data-testid="policy-activate"]').exists()).toBe(true)
  })

  it('hides Activate on the active version', async () => {
    const wrapper = await mountSuspended(PolicyPage)
    await wrapper.find('[data-testid="policy-version-select-7"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="policy-activate"]').exists()).toBe(false)
  })

  it('hides Activate without the activate capability', async () => {
    permitted = ['admin.security-policy.read']
    const wrapper = await mountSuspended(PolicyPage)
    await openDraftDrawer(wrapper)
    expect(wrapper.find('[data-testid="policy-activate"]').exists()).toBe(false)
  })

  it('confirm shows the transition impact (replaces active version) and calls no API before confirm', async () => {
    const wrapper = await mountSuspended(PolicyPage)
    await openDraftDrawer(wrapper)
    await wrapper.find('[data-testid="policy-activate"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="privileged-action-impact"]').text()).toContain('4')
    expect(wrapper.find('[data-testid="privileged-action-impact"]').text()).toContain('3')
    expect(activateMock).not.toHaveBeenCalled()
  })

  it('activates, refreshes, and reports success', async () => {
    activateMock.mockResolvedValue({ policy: { ...DRAFT, status: 'active' } })
    const wrapper = await mountSuspended(PolicyPage)
    await openDraftDrawer(wrapper)
    await wrapper.find('[data-testid="policy-activate"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
    await flushPromises()
    expect(activateMock).toHaveBeenCalledWith('password', 4, { reason: undefined })
    expect(refreshMock).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="policy-action-success"]').text()).toBe(enLocale.policy.activate_success)
  })

  it('maps 422 security_policy_invalid to safe domain copy without leaking the exception', async () => {
    activateMock.mockRejectedValue(
      new ApiError(422, 'Rolled-back versions cannot be re-activated', 'security_policy_invalid', {}, 'req-422'),
    )
    const wrapper = await mountSuspended(PolicyPage)
    await openDraftDrawer(wrapper)
    await wrapper.find('[data-testid="policy-activate"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="privileged-action-error"]').text()).toContain(
      enLocale.policy.error_invalid_transition,
    )
    expect(wrapper.html()).not.toContain('Rolled-back versions cannot be re-activated')
    expect(refreshMock).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run it — expect FAIL.**

- [ ] **Step 3: Add activate keys** (BOTH locales, in `policy`):

`en.json`:
```json
    "confirm_activate_title": "Activate this version?",
    "transition_impact_replaces": "Version {version} will replace the active version {active}.",
    "transition_impact_first": "Version {version} will become the active configuration.",
    "activate_success": "Policy version activated.",
    "error_invalid_transition": "This version can no longer be activated."
```
`id.json`:
```json
    "confirm_activate_title": "Aktifkan versi ini?",
    "transition_impact_replaces": "Versi {version} akan menggantikan versi aktif {active}.",
    "transition_impact_first": "Versi {version} akan menjadi konfigurasi aktif.",
    "activate_success": "Versi kebijakan diaktifkan.",
    "error_invalid_transition": "Versi ini tidak dapat diaktifkan lagi."
```

- [ ] **Step 4: Wire activate into `app/pages/policy.vue`.** Add to `<script setup>`:

```ts
import { describeTransitionImpact } from '@/lib/policy/policy-helpers'

const canActivate = computed<boolean>(() => store.hasPermission('admin.security-policy.activate'))

const activateAction = usePrivilegedAction<PolicyMutationResponse>()
const activateTarget = ref<number | null>(null)
const activateReason = ref('')

const activateDescription = computed<string>(() => {
  if (activateTarget.value === null) return ''
  const impact = describeTransitionImpact(activateTarget.value, activeVersion.value)
  return impact.replacesActive
    ? t('policy.transition_impact_replaces', { version: impact.targetVersion, active: impact.activeVersion })
    : t('policy.transition_impact_first', { version: impact.targetVersion })
})

const activateError = computed<string | null>(() => {
  const status = activateAction.failure.value?.status
  if (!status || status === 'step_up_required') return null
  if (status === 'invalid') return t('policy.error_invalid_transition')
  return t('common.error_generic')
})

// REPLACE the 8.6 stub body (do NOT rename).
function onActivateRequested(version: number): void {
  activateAction.reset()
  successMessage.value = null
  activateReason.value = ''
  activateTarget.value = version
}
function onActivateCancel(): void {
  activateTarget.value = null
}
async function onActivateConfirm(): Promise<void> {
  const version = activateTarget.value
  if (version === null) return
  const reason = activateReason.value.trim() || undefined
  const result = await activateAction.run(() => policyApi.activate(category.value, version, { reason }))
  if (result === null) return
  activateTarget.value = null
  selectedId.value = null
  successMessage.value = t('policy.activate_success')
  await refresh()
}
```

Add the Activate button inside the drawer's `policy-detail` (after the payload `<pre>`), and the activate dialog at page level:

```vue
          <div class="policy-detail__actions">
            <UiButton
              v-if="canActivate && selectedPolicy.status === 'draft'"
              variant="primary"
              size="sm"
              data-testid="policy-activate"
              @click="onActivateRequested(selectedPolicy.version)"
            >
              {{ t('policy.btn_activate') }}
            </UiButton>
          </div>
```

```vue
    <PrivilegedActionDialog
      v-if="activateTarget !== null"
      :open="activateTarget !== null"
      :title="t('policy.confirm_activate_title')"
      :description="activateDescription"
      :confirm-label="t('policy.btn_activate')"
      :cancel-label="t('common.btn_cancel')"
      :reason-label="t('policy.reason_label')"
      :reason="activateReason"
      :submitting="activateAction.isSubmitting.value"
      :error-message="activateError"
      :request-id="activateAction.requestId.value"
      :step-up-url="activateAction.stepUpUrl.value"
      :step-up-label="t('policy.step_up_cta')"
      @update:reason="activateReason = $event"
      @confirm="onActivateConfirm"
      @cancel="onActivateCancel"
    />
```

Add `.policy-detail__actions { display: flex; flex-wrap: wrap; gap: 8px; padding-top: 12px; border-top: 1px solid var(--border); }` to `<style>`.

> Note on `PrivilegedActionDialog` impact testid: the dialog renders its `description` inside `[data-testid="privileged-action-impact"]`. Confirm this in `PrivilegedActionDialog.vue`; if the description testid differs, the test's `privileged-action-impact` selector must match the dialog's actual description element (align the test to the component, never weaken it).

- [ ] **Step 5: Run it — expect PASS.**

- [ ] **Step 6: Commit:**

```bash
git add app/pages/policy.vue app/pages/__tests__/policy-activate.page.nuxt.spec.ts app/locales/en.json app/locales/id.json
git commit -m "$(cat <<'EOF'
feat(sso-admin-frontend): activate-version privileged action with transition impact

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Task-scoped DoD:** `npm run typecheck && npm run lint && npm run format:check && npm run test -- app/pages/__tests__/policy-activate.page.nuxt.spec.ts` — all green. Re-run the propose + read-surface specs (no regression).

---

### Task 8.9: Rollback-version privileged action (danger confirm + 422 domain mapping)

**Files:**
- Modify: `app/pages/policy.vue` (fill `onRollbackRequested`; add the rollback `usePrivilegedAction` + danger dialog + the drawer Roll-back button)
- Modify: `app/locales/en.json` + `app/locales/id.json` (add rollback keys)
- Test: `app/pages/__tests__/policy-rollback.page.nuxt.spec.ts`

**Interfaces:**
- Consumes: `usePrivilegedAction`, `PrivilegedActionDialog`, `policyApi.rollback`, `describeTransitionImpact`, `PolicyMutationResponse`.
- Produces (`app/pages/policy.vue`): a Roll-back affordance **inside the detail drawer**, shown only when `canActivate && selectedPolicy.status === 'superseded'` (reverting to a prior superseded version — active/draft/rolled_back never show Roll-back); a `usePrivilegedAction<PolicyMutationResponse>()` rollback instance + reused `PrivilegedActionDialog` with **`danger`** (the single `--danger #E4002B` destructive affordance in this domain); a `describeTransitionImpact`-driven confirm description; on confirm runs `policyApi.rollback(category, version, { reason })`; success → close + `refresh()` + `successMessage` (`policy.rollback_success`); 422 `security_policy_invalid` → `policy.error_invalid_transition`; 428 → step-up; cancel calls no API; a failed rollback leaves no stale loading.

> ponytail: rollback reuses the exact activate wiring with `danger` flipped and a different api call + success copy — no new infra. It is the ONLY danger-styled affordance on `/policy`; propose and activate are accent.

- [ ] **Step 1: Write the failing test** — `app/pages/__tests__/policy-rollback.page.nuxt.spec.ts` (harness as 8.8; a **superseded** version present so the drawer shows Roll-back; only `policyApi.rollback` spied):

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import enLocale from '@/locales/en.json'
import { ApiError } from '@/lib/api/api-client'
import type { PolicyMutationResponse, SecurityPolicy } from '@/types/policy.types'

const rollbackMock = vi.fn<(c: string, v: number, p: unknown) => Promise<PolicyMutationResponse>>()
vi.mock('@/services/policy.api', () => ({
  policyApi: { list: vi.fn(), propose: vi.fn(), activate: vi.fn(), rollback: rollbackMock },
}))

const ACTIVE: SecurityPolicy = {
  id: 7, category: 'password', version: 3, status: 'active', payload: { min_length: 14 },
  effective_at: '2026-06-20T10:00:00Z', actor_subject_id: '01HZX9C7K3Q8VMETBD9R2F4K7N',
  reason: 'Current', created_at: '2026-06-20T10:00:00Z', updated_at: '2026-06-20T10:00:00Z',
}
const SUPERSEDED: SecurityPolicy = { ...ACTIVE, id: 6, version: 2, status: 'superseded', reason: 'Older' }
const policiesRef = ref<readonly SecurityPolicy[] | null>([ACTIVE, SUPERSEDED])
const refreshMock = vi.fn<() => Promise<void>>(async () => {})
vi.mock('@/composables/useSecurityPolicies', () => ({
  useSecurityPolicies: () => ({
    policies: policiesRef, active: computed(() => ({ min_length: 14 })),
    viewState: computed(() => 'ready' as const), isStale: computed(() => false),
    requestId: computed(() => null), pending: ref(false), refresh: refreshMock,
  }),
}))
let permitted: string[] = []
vi.mock('@/stores/session.store', () => ({
  useSessionStore: () => ({
    principal: { display_name: 'Admin Sentinel' },
    ensureSession: vi.fn<() => Promise<string>>(async () => 'authenticated'),
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
mockNuxtImport('navigateTo', () => vi.fn<(...a: unknown[]) => Promise<void>>(async () => {}))

const PolicyPage = (await import('../policy.vue')).default

beforeEach(() => {
  permitted = ['admin.security-policy.read', 'admin.security-policy.activate']
  policiesRef.value = [ACTIVE, SUPERSEDED]
  rollbackMock.mockReset()
  refreshMock.mockReset()
})
afterEach(() => { vi.clearAllMocks() })

async function openSupersededDrawer(wrapper: Awaited<ReturnType<typeof mountSuspended>>) {
  await wrapper.find('[data-testid="policy-version-select-6"]').trigger('click')
  await flushPromises()
}

describe('policy rollback — the single danger affordance', () => {
  it('shows Roll-back only for a superseded version', async () => {
    const wrapper = await mountSuspended(PolicyPage)
    await openSupersededDrawer(wrapper)
    expect(wrapper.find('[data-testid="policy-rollback"]').exists()).toBe(true)
  })

  it('hides Roll-back on the active version', async () => {
    const wrapper = await mountSuspended(PolicyPage)
    await wrapper.find('[data-testid="policy-version-select-7"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="policy-rollback"]').exists()).toBe(false)
  })

  it('rolls back, refreshes, and reports success', async () => {
    rollbackMock.mockResolvedValue({ policy: { ...SUPERSEDED, status: 'active' } })
    const wrapper = await mountSuspended(PolicyPage)
    await openSupersededDrawer(wrapper)
    await wrapper.find('[data-testid="policy-rollback"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
    await flushPromises()
    expect(rollbackMock).toHaveBeenCalledWith('password', 2, { reason: undefined })
    expect(refreshMock).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="policy-action-success"]').text()).toBe(enLocale.policy.rollback_success)
  })

  it('maps 422 security_policy_invalid to safe domain copy and does not refresh', async () => {
    rollbackMock.mockRejectedValue(
      new ApiError(422, 'Rolled-back versions cannot be re-activated', 'security_policy_invalid', {}, 'req-422'),
    )
    const wrapper = await mountSuspended(PolicyPage)
    await openSupersededDrawer(wrapper)
    await wrapper.find('[data-testid="policy-rollback"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="privileged-action-error"]').text()).toContain(
      enLocale.policy.error_invalid_transition,
    )
    expect(wrapper.html()).not.toContain('Rolled-back versions cannot be re-activated')
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('surfaces step-up on 428 and leaves the confirm enabled (no stale loading)', async () => {
    rollbackMock.mockRejectedValue(
      new ApiError(428, 'reauth', 'reauth_required', { step_up_url: 'https://idp.example/step-up' }, 'req-428'),
    )
    const wrapper = await mountSuspended(PolicyPage)
    await openSupersededDrawer(wrapper)
    await wrapper.find('[data-testid="policy-rollback"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="privileged-action-stepup"]').find('a').attributes('href')).toBe(
      'https://idp.example/step-up',
    )
    expect(wrapper.find('[data-testid="privileged-action-confirm"]').attributes('disabled')).toBeUndefined()
    expect(refreshMock).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run it — expect FAIL.**

- [ ] **Step 3: Add rollback keys** (BOTH locales, in `policy`):

`en.json`:
```json
    "confirm_rollback_title": "Roll back to this version?",
    "rollback_success": "Policy rolled back."
```
`id.json`:
```json
    "confirm_rollback_title": "Kembalikan ke versi ini?",
    "rollback_success": "Kebijakan dikembalikan."
```
(`transition_impact_*`, `error_invalid_transition`, `reason_label`, `step_up_cta` are reused from 8.7/8.8 — do NOT re-add.)

- [ ] **Step 4: Wire rollback into `app/pages/policy.vue`** (mirrors activate; `danger`):

```ts
const rollbackAction = usePrivilegedAction<PolicyMutationResponse>()
const rollbackTarget = ref<number | null>(null)
const rollbackReason = ref('')

const rollbackDescription = computed<string>(() => {
  if (rollbackTarget.value === null) return ''
  const impact = describeTransitionImpact(rollbackTarget.value, activeVersion.value)
  return impact.replacesActive
    ? t('policy.transition_impact_replaces', { version: impact.targetVersion, active: impact.activeVersion })
    : t('policy.transition_impact_first', { version: impact.targetVersion })
})

const rollbackError = computed<string | null>(() => {
  const status = rollbackAction.failure.value?.status
  if (!status || status === 'step_up_required') return null
  if (status === 'invalid') return t('policy.error_invalid_transition')
  return t('common.error_generic')
})

// REPLACE the 8.6 stub body (do NOT rename).
function onRollbackRequested(version: number): void {
  rollbackAction.reset()
  successMessage.value = null
  rollbackReason.value = ''
  rollbackTarget.value = version
}
function onRollbackCancel(): void {
  rollbackTarget.value = null
}
async function onRollbackConfirm(): Promise<void> {
  const version = rollbackTarget.value
  if (version === null) return
  const reason = rollbackReason.value.trim() || undefined
  const result = await rollbackAction.run(() => policyApi.rollback(category.value, version, { reason }))
  if (result === null) return
  rollbackTarget.value = null
  selectedId.value = null
  successMessage.value = t('policy.rollback_success')
  await refresh()
}
```

Add the Roll-back button to the drawer `policy-detail__actions` (next to Activate) and the danger dialog at page level:

```vue
            <UiButton
              v-if="canActivate && selectedPolicy.status === 'superseded'"
              variant="danger"
              size="sm"
              data-testid="policy-rollback"
              @click="onRollbackRequested(selectedPolicy.version)"
            >
              {{ t('policy.btn_rollback') }}
            </UiButton>
```

```vue
    <PrivilegedActionDialog
      v-if="rollbackTarget !== null"
      :open="rollbackTarget !== null"
      :title="t('policy.confirm_rollback_title')"
      :description="rollbackDescription"
      :confirm-label="t('policy.btn_rollback')"
      :cancel-label="t('common.btn_cancel')"
      :reason-label="t('policy.reason_label')"
      :reason="rollbackReason"
      danger
      :submitting="rollbackAction.isSubmitting.value"
      :error-message="rollbackError"
      :request-id="rollbackAction.requestId.value"
      :step-up-url="rollbackAction.stepUpUrl.value"
      :step-up-label="t('policy.step_up_cta')"
      @update:reason="rollbackReason = $event"
      @confirm="onRollbackConfirm"
      @cancel="onRollbackCancel"
    />
```

- [ ] **Step 5: Run it — expect PASS.**

- [ ] **Step 6: Commit:**

```bash
git add app/pages/policy.vue app/pages/__tests__/policy-rollback.page.nuxt.spec.ts app/locales/en.json app/locales/id.json
git commit -m "$(cat <<'EOF'
feat(sso-admin-frontend): rollback-version danger action with safe 422 domain copy

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Task-scoped DoD:** `npm run typecheck && npm run lint && npm run format:check && npm run test -- app/pages/__tests__/policy-rollback.page.nuxt.spec.ts` — all green. Re-run the propose + activate + read-surface specs (no regression).

---

### Task 8.10: Extend the SSR token-leak gate + Policy e2e + full Phase-8 DoD

**Files:**
- Modify: `test/ssr-token-leak.gate.spec.ts` (add `fetchPolicy` + three policy `it` blocks)
- Create: `test/fixtures/ssr-leak/server/routes/api/admin/security-policies/[category].get.ts` (the policy list fixture — currently absent, so SSR would 404 the fetch)
- Verify (add caps if missing): `test/fixtures/ssr-leak/server/routes/api/admin/me.get.ts` — the sentinel principal must grant `admin.security-policy.read` (so `/policy` renders READY, not `/forbidden`), and `admin.security-policy.write` + `admin.security-policy.activate` (so the draft editor + drawer affordances hydrate under the gate)
- Create: `e2e/policy.spec.ts` (Playwright — the propose/activate/rollback high-risk paths)

**Interfaces:**
- Consumes: the gate helpers `extractPayload`, `collectSecretLeaks`, `collectPiiShapeLeaks`, the `$fetch`/`setup` harness; the fixture sentinel-session plugin; `policy.vue` (Tasks 8.6–8.9) as the rendered `/policy` route.
- Produces: `fetchPolicy = () => $fetch('/policy')`; a "renders ready (masked)" assertion (`data-admin-shell` + a fixture category/version label + a payload key); `collectSecretLeaks(html)`/`collectSecretLeaks(payload)`/`collectPiiShapeLeaks(payload)` all `toEqual([])` — **strict, no `allowSessionId`** (policy DTOs carry no token/secret/session-id/PII; `actor_subject_id` is a clean ULID with no 10/16/18-digit run, `payload` is non-secret config).

This is the **final integration + proof task** of Phase 8. It writes no product code — it proves, against a real SSR render and a real browser, that the policy surface (Tasks 8.1–8.9) leaks nothing and that its three privileged transitions work end to end. It mirrors the roles gate extension (commit `acac9e5f`) exactly.

- [ ] **Step 1: RED — extend the leak gate.** Add `fetchPolicy` next to the other fetchers, and the three `it` blocks after the roles group:

```ts
function fetchPolicy(): Promise<string> {
  return $fetch('/policy')
}
```
```ts
  it('renders the policy versions + active config server-side in their ready (masked) state', async () => {
    const html = await fetchPolicy()
    expect(html).toContain('data-admin-shell')
    // the active-config summary renders a payload key ...
    expect(html).toContain('min_length')
    // ... and the version table renders a status label, proving the surface mounted.
    expect(html).toContain('Active')
  })

  it('does not leak token/secret/PII values into the policy-page SSR HTML', async () => {
    // Strict — policy DTOs carry only non-secret config + an opaque ULID actor id.
    const html = await fetchPolicy()
    expect(collectSecretLeaks(html, 'policy SSR HTML')).toEqual([])
  })

  it('does not leak token/secret/PII values into the policy-page hydration payload', async () => {
    const html = await fetchPolicy()
    const serialized = JSON.stringify(JSON.parse(extractPayload(html)))
    expect(collectSecretLeaks(serialized, 'policy __NUXT__ payload')).toEqual([])
    expect(collectPiiShapeLeaks(serialized, 'policy __NUXT__ payload')).toEqual([])
  })
```

- [ ] **Step 2: Run it — expect FAIL** (`npm run test -- test/ssr-token-leak.gate.spec.ts`). Expected: the "ready (masked)" block fails — no `security-policies` fixture route, so the SSR fetch errors and the page renders error/empty, not `min_length`.

- [ ] **Step 3: GREEN — add the fixture route + verify caps.** Create `test/fixtures/ssr-leak/server/routes/api/admin/security-policies/[category].get.ts`:

```ts
// SSR token-leak fixture: a representative masked policy list so the §3.3 gate
// renders the Policy page in READY (an active + a superseded + a draft version) and
// the payload collectors cover the SecurityPolicy DTO. Non-secret config payloads,
// ULID actor ids (no 10/16/18-digit run), audit reasons — no token, secret, session
// id, or PII-shaped digit run. A future effective_at is metadata only.
import { defineEventHandler } from 'h3'

export default defineEventHandler(() => ({
  category: 'password',
  active: { min_length: 14, require_special: true },
  policies: [
    {
      id: 3,
      category: 'password',
      version: 3,
      status: 'active',
      payload: { min_length: 14, require_special: true },
      effective_at: '2026-06-20T10:00:00Z',
      activated_at: '2026-06-20T10:00:00Z',
      superseded_at: null,
      actor_subject_id: '01HZX9C7K3Q8VMETBD9R2F4K7N',
      reason: 'Tighten the password baseline.',
      created_at: '2026-06-20T10:00:00Z',
      updated_at: '2026-06-20T10:00:00Z',
    },
    {
      id: 2,
      category: 'password',
      version: 2,
      status: 'superseded',
      payload: { min_length: 12, require_special: false },
      effective_at: '2026-05-01T10:00:00Z',
      activated_at: '2026-05-01T10:00:00Z',
      superseded_at: '2026-06-20T10:00:00Z',
      actor_subject_id: '01HZX9C7K3Q8VMETBD9R2F4K8P',
      reason: 'Initial baseline.',
      created_at: '2026-05-01T10:00:00Z',
      updated_at: '2026-06-20T10:00:00Z',
    },
    {
      id: 4,
      category: 'password',
      version: 4,
      status: 'draft',
      payload: { min_length: 16, require_special: true },
      effective_at: null,
      activated_at: null,
      superseded_at: null,
      actor_subject_id: '01HZX9C7K3Q8VMETBD9R2F4K9Q',
      reason: 'Proposed stronger baseline.',
      created_at: '2026-06-28T10:00:00Z',
      updated_at: '2026-06-28T10:00:00Z',
    },
  ],
}))
```

Then confirm the sentinel principal grants the three policy capabilities (no edit if already present):
```bash
grep -E "admin.security-policy.(read|write|activate)" test/fixtures/ssr-leak/server/routes/api/admin/me.get.ts
```
Expected: all three under `capabilities` (and `permissions.permissions[]`). If any is missing, add it to BOTH `permissions.permissions[]` and `permissions.capabilities` (additive — it does not affect the other domains' gate blocks).

- [ ] **Step 4: Run it — expect PASS** (`npm run test -- test/ssr-token-leak.gate.spec.ts`). Expected: all policy blocks green; the pre-existing dashboard/users/clients/observability/roles blocks + the negative-control tripwire stay green.

- [ ] **Step 5: Commit the gate extension:**

```bash
git add test/ssr-token-leak.gate.spec.ts test/fixtures/ssr-leak/server/routes/api/admin/security-policies/[category].get.ts test/fixtures/ssr-leak/server/routes/api/admin/me.get.ts
git commit -m "$(cat <<'EOF'
test(sso-admin-frontend): extend SSR leak gate to the policy versions + payload

Render /policy under full SSR with the sentinel admin (security-policy
read+write+activate) and assert the version list, active config, and version
payload hydrate as non-secret config + opaque ULID actor ids only: no token
value/name, secret, session id, or PII-shaped digit run reaches the SSR HTML or
__NUXT_DATA__. Strict checks (no allowSessionId).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 6: Author the e2e** — `e2e/policy.spec.ts` (mirror `e2e/roles.spec.ts`: `admin_locale=en` cookie; mock `/api/admin/me` + `/api/admin/security-policies/*`; drive the three transitions). **Do NOT run `npm run test:e2e`** — Playwright is still wired to the legacy SPA (`playwright.config.ts`), so e2e is systemically deferred to Phase 18 (every prior phase deferred it identically). Author + commit the spec; it parses under tsc/eslint in the DoD.

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
      permissions: ['admin.dashboard.view', 'admin.security-policy.read', 'admin.security-policy.write', 'admin.security-policy.activate'],
      capabilities: { 'admin.dashboard.view': true, 'admin.security-policy.read': true, 'admin.security-policy.write': true, 'admin.security-policy.activate': true },
      menus: [
        { id: 'dashboard', label: 'Dashboard', required_permission: 'admin.dashboard.view', visible: true },
        { id: 'policy', label: 'Security policy', required_permission: 'admin.security-policy.read', visible: true },
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
const draft = { id: 4, category: 'password', version: 4, status: 'draft', payload: { min_length: 16 }, effective_at: null, actor_subject_id: '01HZX9C7K3Q8VMETBD9R2F4K9Q', reason: 'Proposed', created_at: '2026-06-28T10:00:00Z', updated_at: '2026-06-28T10:00:00Z' }
const active = { id: 3, category: 'password', version: 3, status: 'active', payload: { min_length: 14 }, effective_at: '2026-06-20T10:00:00Z', actor_subject_id: '01HZX9C7K3Q8VMETBD9R2F4K7N', reason: 'Baseline', created_at: '2026-06-20T10:00:00Z', updated_at: '2026-06-20T10:00:00Z' }
const superseded = { ...active, id: 2, version: 2, status: 'superseded' }

async function mockMe(page: Page, body: object) {
  await page.route('**/api/admin/me', async (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(body) }))
}
async function mockPolicies(page: Page) {
  await page.route('**/api/admin/security-policies/password', async (r) => {
    if (r.request().method() !== 'GET') return r.continue()
    await r.fulfill({ contentType: 'application/json', headers: { 'x-request-id': 'req-policy-e2e' }, body: JSON.stringify({ category: 'password', active: { min_length: 14 }, policies: [draft, active, superseded] }) })
  })
}

test('propose draft: invalid JSON blocks, valid JSON confirms and POSTs', async ({ page }) => {
  await mockMe(page, principal)
  await mockPolicies(page)
  let posted: unknown = null
  await page.route('**/api/admin/security-policies/password', async (r) => {
    if (r.request().method() !== 'POST') return r.continue()
    posted = r.request().postDataJSON()
    await r.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ policy: { ...draft, version: 5 } }) })
  })
  await page.goto('/policy')
  await page.getByTestId('policy-draft-payload').fill('{not json')
  await page.getByTestId('policy-draft-submit').click()
  await expect(page.getByTestId('policy-draft-parse-error')).toBeVisible()
  await page.getByTestId('policy-draft-payload').fill('{"min_length":18}')
  await page.getByTestId('policy-draft-submit').click()
  await page.getByTestId('privileged-action-confirm').click()
  await expect.poll(() => posted).not.toBeNull()
  expect(posted).toMatchObject({ payload: { min_length: 18 } })
  await expect(page.getByText(/Bearer|access_token|client_secret|SQLSTATE/u)).toHaveCount(0)
})

test('activate: drawer confirm shows impact and POSTs activate for a draft', async ({ page }) => {
  await mockMe(page, principal)
  await mockPolicies(page)
  let activated = false
  await page.route('**/api/admin/security-policies/password/4/activate', async (r) => {
    activated = true
    await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ policy: { ...draft, status: 'active' } }) })
  })
  await page.goto('/policy')
  await page.getByTestId('policy-version-select-4').click()
  await page.getByTestId('policy-activate').click()
  await expect(page.getByTestId('privileged-action-impact')).toContainText('4')
  await page.getByTestId('privileged-action-confirm').click()
  await expect.poll(() => activated).toBe(true)
})

test('rollback cancel calls no API; rollback is the danger affordance on a superseded version', async ({ page }) => {
  await mockMe(page, principal)
  await mockPolicies(page)
  let rolled = false
  await page.route('**/api/admin/security-policies/password/2/rollback', async (r) => { rolled = true; await r.continue() })
  await page.goto('/policy')
  await page.getByTestId('policy-version-select-2').click()
  await page.getByTestId('policy-rollback').click()
  await page.getByTestId('privileged-action-cancel').click()
  await expect(page.getByTestId('privileged-action-confirm')).toHaveCount(0)
  expect(rolled).toBe(false)
})

test('forbidden: an admin without security-policy.read lands on the safe forbidden surface', async ({ page }) => {
  await mockMe(page, readOnly)
  await page.goto('/policy')
  await expect(page).toHaveURL(/\/forbidden$/u)
  await expect(page.getByText(/Bearer|access_token|client_secret|SQLSTATE/u)).toHaveCount(0)
})
```

- [ ] **Step 7: Commit the e2e:**

```bash
git add e2e/policy.spec.ts
git commit -m "$(cat <<'EOF'
test(sso-admin-frontend): e2e the policy propose/activate/rollback high-risk paths

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 8: Run the full Phase-8 DoD gate** from `services/sso-admin-frontend` (report any blocked command explicitly; never claim PASS for a command that did not run). `npm run lint` is `run-s lint:*` — BOTH `lint:oxlint` AND `lint:eslint` must pass:

```bash
npm run typecheck && npm run lint && npm run format:check && npm run test && npm run build
```
e2e (`npm run test:e2e`) is **deferred to Phase 18** (legacy-SPA `playwright.config.ts`) — do not run it; report it as deferred.

---

## Phase 8 Definition of Done

- [ ] DTO types + pure view-state/status-tone (8.1) + pure helpers (catalog/JSON-parse/transition-impact, 8.2) + `policy.api` service (8.3) + `useSecurityPolicies` SSR composable (8.4) + `PolicyVersionsTable` (8.5) + the `/policy` page all-six-states read surface (8.6) + propose-draft (8.7) + activate (8.8) + rollback (8.9) + SSR-leak-gate/e2e (8.10) all implemented test-first, each committed green.
- [ ] **Full gate green** from `services/sso-admin-frontend`: `npm run typecheck` (0), `npm run lint` (0 — BOTH `lint:oxlint` and `lint:eslint`), `npm run format:check`, `npm run test` (full suite, including the new gate blocks + all policy specs), `npm run build` — all PASS (any blocked command reported explicitly).
- [ ] **SSR token-leak gate extended** (8.10) over the policy version list + active config + version payload (non-secret config + opaque ULID actor ids only): strict checks (no `allowSessionId`) prove no token value/name, secret, session id, raw NIK(16)/NIP(18)/NISN(10) digit run, raw backend exception, or `SSR_LEAK_CANARY` in the `/policy` SSR HTML or `__NUXT_DATA__`; collectors assert `.toEqual([])`; the pre-existing negative-control tripwire stays green.
- [ ] **Privileged-action matrix** applied to all three writes (propose `:write`, activate/rollback `:step_up`): every status (403/419/422/428/429/5xx + step-up) surfaces safe, status-keyed copy; the 422 `security_policy_invalid` conflict maps to `policy.error_invalid_transition` (the raw backend exception never renders); only `REF-…` is shown (never a raw request id); cancel calls no API; a failed action leaves no stale loading/disabled state; no `refresh()` on failure.
- [ ] **Domain UI rules:** the propose payload is parse-guarded client-side (invalid JSON / non-object never submitted); Activate shows only for `draft`, Roll-back only for `superseded`, neither on `active`/`rolled_back` (UX minimization over the authoritative backend gate); the active config + version payload render as non-secret JSON only.
- [ ] **Swiss discipline:** single Klein-blue accent; **`--danger #E4002B` used only on the rollback affordance** (propose + activate are accent); status is tone + label via `UiStatusBadge` (never colour-alone); folio numerals for versions + timestamps; `--font-mono` only for the `actor_subject_id`; hairline borders, no shadows.
- [ ] **Type discipline:** new types in `app/types/policy.types.ts`, never duplicated; the legacy `src/features/policy` RBAC concerns are NOT re-rendered here (roles live on `/roles`, Phase 7).
- [ ] **Page route + permission gating:** `/policy` gated `admin.security-policy.read` via `definePageMeta`; write/activate affordances via `useSessionStore().hasPermission`; all six states render server-side.
- [ ] **Locale parity:** `app/locales/en.json` + `id.json` stay in sync; all added `policy.*` keys present in both; no traceability markers anywhere.
- [ ] **E2E authored** for the propose/activate/rollback high-risk paths + the forbidden flow (`e2e/policy.spec.ts`); run **deferred to Phase 18** (legacy-SPA `playwright.config.ts`, systemic across all phases) — recorded, not silently skipped.
- [ ] **Branch discipline:** the feature branch stays off `main` until the Phase 18 cutover.

---
