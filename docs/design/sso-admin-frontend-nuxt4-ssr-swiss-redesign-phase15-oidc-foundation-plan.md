# Phase 15 — OIDC Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the admin **OIDC Foundation** page (`/oidc-foundation`) to Nuxt 4 SSR + the Swiss design system — a read-only protocol-health cockpit surfacing the backend snapshot (discovery metadata, JWKS public-key status, endpoint availability + rotation/availability evidence, scope/claim/algorithm catalog, and issuer/endpoint consistency), with no token/secret/raw-gov-PII reaching SSR HTML or `__NUXT_DATA__`.

**Architecture:** Read-only single-fetch domain (the richest DTO). The page calls `useOidcFoundation()` → `oidcFoundationApi.getSnapshot()` → `apiClient.get('/api/admin/oidc-foundation')`. The BFF proxy already allow-lists that path (no proxy change); the backend `OidcFoundationSnapshotBuilder` returns a complete `OidcFoundationSnapshot` (all **public** OIDC discovery metadata + operational health — no secrets, no private keys, no PII). The page composes five dumb panels (Discovery, JWKS, Availability, Consistency, Catalog) plus an overview header. No mutations, no actions, no danger affordances.

**Tech Stack:** Nuxt 4.4.8 (SSR), Vue 3.5 SFC, TypeScript strict, Vitest 4 + `@nuxt/test-utils` 4, the shipped Swiss DS (`UiDataList`, `UiStatusBadge`, `UiFolio`, `UiSkeleton`, `UiStatusView`, `UiButton`), `useAsyncData`, `apiClient`/`ApiError`.

## Global Constraints

- **Branch stays OFF `main`** until Phase 18 cutover. Commit only the listed task commits.
- **Commit trailer (verbatim):** `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **No traceability markers** (`OG#`/`UC###`/`FR###`/`BE-FR###` etc.) anywhere. ⚠️ The existing `oidc` locale title is `"Protocol Health and Evidence FR-001–FR-005."` — the `FR-001–FR-005` is a traceability marker; the 15.7 locale replacement **drops it**.
- **No token / secret / raw-gov-PII (NIK/NIP/NISN/birth_date) in SSR HTML or `__NUXT_DATA__`.** Tokens live only in the Nitro `event.context`. The §3.3 leak gate uses the **STRICT** form (no `allowSessionId`): the snapshot is all public OIDC metadata + health (issuer/endpoint URLs, JWKS **public**-key ids `kid`/`alg`/`use`/`status`, scope/claim/algorithm catalog, availability metrics, `correlation_id`) — no token, secret, private key, session id, or gov-PII.
- **Swiss discipline:** hairline borders, no shadows, no gradients; single Klein accent `#002FA7`; `#E4002B`/`--danger` only on destructive affordances + inline form-validation. This page has **no** destructive affordance → renders **zero** `#E4002B` accent. Status is **never colour-alone** — tone + label via `UiStatusBadge`. `danger` *tone* on a status badge (an `unavailable`/`mismatch`/`failed` health state) is allowed and matches the shipped `resolveHealthTone` precedent.
- **i18n parity:** every key added to `en.json` must exist in `id.json` (and vice-versa). `t(key, params)` supports `{param}` interpolation. Run the parity check before the locale-touching commit.
- **oxlint:** every `vi.fn(...)` needs a type parameter; every `.toThrow(...)` needs a message. The controller verifies **both** oxlint AND eslint (`.vue` errors are eslint-only).
- **Test env routing by FILENAME:** pure-logic + dumb-component tests are jsdom (`@vue/test-utils` `mount`, plain `*.spec.ts`); composable + page tests are nuxt env (`*.nuxt.spec.ts` / `*.page.nuxt.spec.ts`).
- **DoD per task (controller-verified DIRECT, bypassing rtk cache):** `./node_modules/.bin/oxlint .` (0/0), `./node_modules/.bin/eslint <touched .vue>` (0), `npx vue-tsc --noEmit` (0), the task's vitest specs green; the locale task also runs the parity check. Final task adds full-suite + build + SSR leak gate.
- **e2e is DEFERRED to Phase 18** (playwright.config.ts is still legacy-SPA-wired). Author `e2e/oidc-foundation.spec.ts` against the shipped Nuxt routes but do **not** run it as a gate this phase.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `app/types/oidc-foundation.types.ts` | The full `OidcFoundationSnapshot` DTO + sub-types | 15.1 |
| `app/lib/oidc-foundation/oidc-foundation-view-state.ts` | Pure view-state + tone resolvers (availability/evidence/consistency/scope-label) | 15.1 |
| `app/services/oidc-foundation.api.ts` | `oidcFoundationApi.getSnapshot()` over `apiClient` | 15.2 |
| `app/composables/useOidcFoundation.ts` | SSR single-fetch composable | 15.3 |
| `app/components/oidc-foundation/OidcDiscoveryPanel.vue` | Discovery metadata (issuer/endpoints + supported lists) | 15.4 |
| `app/components/oidc-foundation/OidcJwksPanel.vue` | JWKS public-key table | 15.5 |
| `app/components/oidc-foundation/OidcCatalogPanel.vue` | Scope/claim/algorithm catalog tables | 15.5 |
| `app/components/oidc-foundation/OidcAvailabilityPanel.vue` | Endpoint availability + rotation/availability evidence | 15.6 |
| `app/components/oidc-foundation/OidcConsistencyPanel.vue` | Issuer + endpoint consistency | 15.6 |
| `app/pages/oidc-foundation.vue` | Overview header + compose panels + states (replaces stub) | 15.7 |
| `app/locales/en.json` / `id.json` | `oidc` block (replace with the final Swiss key set, no FR marker) | 15.7 |
| `test/ssr-token-leak.gate.spec.ts` | STRICT oidc-foundation leak assertions | 15.8 |
| `test/fixtures/ssr-leak/server/routes/api/admin/oidc-foundation/index.get.ts` | Ready-state snapshot fixture | 15.8 |
| `e2e/oidc-foundation.spec.ts` | Deferred Playwright spec (authored, not run) | 15.8 |

**No change needed:** `server/utils/admin-proxy.ts` already allow-lists `GET /api/admin/oidc-foundation`. The `me.get` fixture already grants `admin.dashboard.view` (the oidc-foundation permission) — no fixture-permission change.

**Authoritative DTO (`OidcFoundationSnapshotBuilder` — top-level keys verified against the backend):** `{ checked_at, correlation_id, discovery, jwks: { keys }, availability: { discovery, jwks }, evidence: { jwks_rotation, availability_timeline }, catalog: { scopes, claims, algorithms }, issuer_consistency, endpoint_consistency }`.

---

### Task 15.1: DTO + view-state + tone resolvers

**Files:**
- Create: `app/types/oidc-foundation.types.ts`
- Create: `app/lib/oidc-foundation/oidc-foundation-view-state.ts`
- Test: `app/lib/oidc-foundation/__tests__/oidc-foundation-view-state.spec.ts`

**Interfaces:**
- Consumes: `StatusTone` from `@/lib/status-tone`; `ApiError` from `@/lib/api/api-client`.
- Produces (types): `OidcAvailabilityStatus`, `OidcEvidenceStatus`, `OidcConsistencyStatus`, `ScopeLabelStatus`, `OidcDiscoveryMetadata`, `OidcJwksKey`, `OidcEndpointAvailability`, `OidcRotationEvidence`, `OidcAvailabilityEvidence`, `OidcScopeCatalogItem`, `OidcClaimCatalogItem`, `OidcAlgorithmCatalogItem`, `OidcIssuerConsistency`, `OidcEndpointConsistency`, `OidcFoundationSnapshot`.
- Produces (lib): `OidcFoundationViewState = 'loading' | 'unauthenticated' | 'forbidden' | 'error' | 'ready'`; `resolveOidcFoundationViewState(args)`; `resolveAvailabilityTone(s)`; `resolveEvidenceTone(s)`; `resolveConsistencyTone(s)`; `resolveScopeLabelTone(s)`; `resolveJwksKeyTone(s)`.

- [ ] **Step 1: Write the failing test**

```ts
// app/lib/oidc-foundation/__tests__/oidc-foundation-view-state.spec.ts
import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api/api-client'
import {
  resolveOidcFoundationViewState,
  resolveAvailabilityTone,
  resolveEvidenceTone,
  resolveConsistencyTone,
  resolveScopeLabelTone,
  resolveJwksKeyTone,
} from '@/lib/oidc-foundation/oidc-foundation-view-state'
import type { OidcFoundationSnapshot } from '@/types/oidc-foundation.types'

const SNAPSHOT = { checked_at: '2026-06-28T10:00:00Z' } as OidcFoundationSnapshot

describe('resolveOidcFoundationViewState', () => {
  it('loading without snapshot or error', () => {
    expect(resolveOidcFoundationViewState({ pending: true, error: null, snapshot: null })).toBe('loading')
  })
  it('ready with a snapshot', () => {
    expect(resolveOidcFoundationViewState({ pending: false, error: null, snapshot: SNAPSHOT })).toBe('ready')
  })
  it('maps 401/403/other with no snapshot', () => {
    expect(resolveOidcFoundationViewState({ pending: false, error: new ApiError(401, 'x'), snapshot: null })).toBe('unauthenticated')
    expect(resolveOidcFoundationViewState({ pending: false, error: new ApiError(403, 'x'), snapshot: null })).toBe('forbidden')
    expect(resolveOidcFoundationViewState({ pending: false, error: new ApiError(500, 'x'), snapshot: null })).toBe('error')
  })
  it('reads the plain hydration-shaped error (statusCode)', () => {
    expect(resolveOidcFoundationViewState({ pending: false, error: { statusCode: 403 }, snapshot: null })).toBe('forbidden')
  })
})

describe('oidc tone resolvers', () => {
  it('availability: healthy/degraded/unavailable/unknown', () => {
    expect(resolveAvailabilityTone('healthy')).toBe('success')
    expect(resolveAvailabilityTone('degraded')).toBe('warning')
    expect(resolveAvailabilityTone('unavailable')).toBe('danger')
    expect(resolveAvailabilityTone('unknown')).toBe('neutral')
  })
  it('evidence: available/recorded/stale/missing/failed', () => {
    expect(resolveEvidenceTone('available')).toBe('success')
    expect(resolveEvidenceTone('recorded')).toBe('success') // backend's real jwks_rotation value
    expect(resolveEvidenceTone('stale')).toBe('warning')
    expect(resolveEvidenceTone('missing')).toBe('danger')
    expect(resolveEvidenceTone('failed')).toBe('danger')
  })
  it('jwks key tone: published/active -> success, rotated -> warning, else neutral', () => {
    expect(resolveJwksKeyTone('published')).toBe('success') // backend's real key status
    expect(resolveJwksKeyTone('active')).toBe('success')
    expect(resolveJwksKeyTone('rotated')).toBe('warning')
    expect(resolveJwksKeyTone('retired')).toBe('neutral')
  })
  it('consistency: pass/warning/mismatch/unknown', () => {
    expect(resolveConsistencyTone('pass')).toBe('success')
    expect(resolveConsistencyTone('warning')).toBe('warning')
    expect(resolveConsistencyTone('mismatch')).toBe('danger')
    expect(resolveConsistencyTone('unknown')).toBe('neutral')
  })
  it('scope label: mapped/missing_label/unknown_custom/deprecated', () => {
    expect(resolveScopeLabelTone('mapped')).toBe('success')
    expect(resolveScopeLabelTone('missing_label')).toBe('warning')
    expect(resolveScopeLabelTone('unknown_custom')).toBe('warning')
    expect(resolveScopeLabelTone('deprecated')).toBe('neutral')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run app/lib/oidc-foundation/__tests__/oidc-foundation-view-state.spec.ts`
Expected: FAIL — modules unresolved.

- [ ] **Step 3: Write the DTO**

```ts
// app/types/oidc-foundation.types.ts

export type OidcAvailabilityStatus = 'healthy' | 'degraded' | 'unavailable' | 'unknown'
// 'recorded' is the value the backend currently emits for jwks_rotation.status;
// 'available' is the forward-looking healthy value. Both are positive evidence.
export type OidcEvidenceStatus = 'available' | 'recorded' | 'missing' | 'failed' | 'stale'
export type OidcConsistencyStatus = 'pass' | 'warning' | 'mismatch' | 'unknown'
export type ScopeLabelStatus = 'mapped' | 'missing_label' | 'unknown_custom' | 'deprecated'

export type OidcDiscoveryMetadata = {
  readonly issuer: string
  readonly authorization_endpoint: string
  readonly token_endpoint: string
  readonly jwks_uri: string
  readonly userinfo_endpoint: string
  readonly response_types_supported: readonly string[]
  readonly grant_types_supported: readonly string[]
  readonly scopes_supported: readonly string[]
  readonly claims_supported: readonly string[]
  readonly id_token_signing_alg_values_supported: readonly string[]
}

export type OidcJwksKey = {
  readonly kid: string
  readonly alg: string
  readonly use: string
  readonly status: string
  readonly published_at: string | null
  readonly rotated_at: string | null
}

export type OidcEndpointAvailability = {
  readonly name: string
  readonly status: OidcAvailabilityStatus
  readonly http_status: number | null
  readonly latency_ms: number | null
  readonly last_checked_at: string | null
  readonly evidence_ref: string | null
}

export type OidcRotationEvidence = {
  readonly status: OidcEvidenceStatus
  readonly label: string
  readonly environment: string | null
  readonly latest_drill_at: string | null
  readonly operator_signoff: string | null
  readonly evidence_ref: string | null
}

export type OidcAvailabilityEvidence = {
  readonly status: OidcEvidenceStatus
  readonly label: string
  readonly checked_at: string | null
  readonly evidence_ref: string | null
}

export type OidcScopeCatalogItem = {
  readonly name: string
  readonly label: string
  readonly description: string
  readonly label_status: ScopeLabelStatus
}

export type OidcClaimCatalogItem = {
  readonly name: string
  readonly scope_dependency: string | null
  readonly sensitivity: string
}

export type OidcAlgorithmCatalogItem = {
  readonly name: string
  readonly usage: string
  readonly status: string
}

export type OidcIssuerConsistency = {
  readonly status: OidcConsistencyStatus
  readonly configured_issuer: string
  readonly discovery_issuer: string
  readonly public_base_url: string
  readonly last_checked_at: string
}

export type OidcEndpointConsistency = {
  readonly name: string
  readonly discovered_url: string
  readonly expected_url: string
  readonly status: 'pass' | 'mismatch'
}

export type OidcFoundationSnapshot = {
  readonly checked_at: string
  readonly correlation_id: string | null
  readonly discovery: OidcDiscoveryMetadata
  readonly jwks: { readonly keys: readonly OidcJwksKey[] }
  readonly availability: {
    readonly discovery: OidcEndpointAvailability
    readonly jwks: OidcEndpointAvailability
  }
  readonly evidence: {
    readonly jwks_rotation: OidcRotationEvidence
    readonly availability_timeline: readonly OidcAvailabilityEvidence[]
  }
  readonly catalog: {
    readonly scopes: readonly OidcScopeCatalogItem[]
    readonly claims: readonly OidcClaimCatalogItem[]
    readonly algorithms: readonly OidcAlgorithmCatalogItem[]
  }
  readonly issuer_consistency: OidcIssuerConsistency
  readonly endpoint_consistency: readonly OidcEndpointConsistency[]
}
```

- [ ] **Step 4: Write the view-state + tones**

```ts
// app/lib/oidc-foundation/oidc-foundation-view-state.ts
import { ApiError } from '@/lib/api/api-client'
import type { StatusTone } from '@/lib/status-tone'
import type {
  OidcAvailabilityStatus,
  OidcConsistencyStatus,
  OidcEvidenceStatus,
  OidcFoundationSnapshot,
  ScopeLabelStatus,
} from '@/types/oidc-foundation.types'

export type OidcFoundationViewState =
  | 'loading'
  | 'unauthenticated'
  | 'forbidden'
  | 'error'
  | 'ready'

export type ResolveOidcFoundationViewStateArgs = {
  // `pending` is part of the args for call-site uniformity with the other domain
  // composables; a snapshot always carries data, so there is no empty state.
  readonly pending: boolean
  readonly error: unknown
  readonly snapshot: OidcFoundationSnapshot | null
}

export function resolveOidcFoundationViewState({
  error,
  snapshot,
}: ResolveOidcFoundationViewStateArgs): OidcFoundationViewState {
  if (error && !snapshot) {
    const status = errorStatus(error)
    if (status === 401) return 'unauthenticated'
    if (status === 403) return 'forbidden'
    return 'error'
  }
  if (snapshot) return 'ready'
  return 'loading'
}

// danger is used for the genuinely-bad health states (unavailable / missing /
// failed / mismatch) — the shipped resolveHealthTone precedent. This is the
// status-badge tone palette, not the reserved-for-destructive #E4002B accent.
export function resolveAvailabilityTone(status: OidcAvailabilityStatus): StatusTone {
  switch (status) {
    case 'healthy':
      return 'success'
    case 'degraded':
      return 'warning'
    case 'unavailable':
      return 'danger'
    default:
      return 'neutral'
  }
}

export function resolveEvidenceTone(status: OidcEvidenceStatus): StatusTone {
  switch (status) {
    case 'available':
    case 'recorded':
      return 'success'
    case 'stale':
      return 'warning'
    case 'missing':
    case 'failed':
      return 'danger'
    default:
      return 'neutral'
  }
}

// JWKS key lifecycle status. The backend currently emits 'published' for every
// active signing key; the shared resolveStatusTone has no alias for it, so this
// domain-scoped resolver keeps a published key reading as healthy (success).
export function resolveJwksKeyTone(status: string): StatusTone {
  switch (status) {
    case 'published':
    case 'active':
      return 'success'
    case 'rotated':
    case 'retiring':
      return 'warning'
    default:
      return 'neutral'
  }
}

export function resolveConsistencyTone(status: OidcConsistencyStatus): StatusTone {
  switch (status) {
    case 'pass':
      return 'success'
    case 'warning':
      return 'warning'
    case 'mismatch':
      return 'danger'
    default:
      return 'neutral'
  }
}

export function resolveScopeLabelTone(status: ScopeLabelStatus): StatusTone {
  switch (status) {
    case 'mapped':
      return 'success'
    case 'missing_label':
    case 'unknown_custom':
      return 'warning'
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

Run: `./node_modules/.bin/vitest run app/lib/oidc-foundation/__tests__/oidc-foundation-view-state.spec.ts`
Expected: PASS.

- [ ] **Step 6: Verify gates + commit**

Run: `./node_modules/.bin/oxlint . && npx vue-tsc --noEmit`

```bash
git add app/types/oidc-foundation.types.ts app/lib/oidc-foundation/oidc-foundation-view-state.ts app/lib/oidc-foundation/__tests__/oidc-foundation-view-state.spec.ts
git commit -m "$(cat <<'EOF'
feat(sso-admin-frontend): oidc-foundation DTO + view-state + tone resolvers

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 15.2: OIDC Foundation API service

**Files:**
- Create: `app/services/oidc-foundation.api.ts`
- Test: `app/services/__tests__/oidc-foundation.api.spec.ts`

**Interfaces:**
- Consumes: `apiClient` from `@/lib/api/api-client`; `OidcFoundationSnapshot` from `@/types/oidc-foundation.types`.
- Produces: `oidcFoundationApi.getSnapshot(): Promise<OidcFoundationSnapshot>`.
- **No proxy change** — `GET /api/admin/oidc-foundation` is already allow-listed.

- [ ] **Step 1: Write the failing test**

```ts
// app/services/__tests__/oidc-foundation.api.spec.ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '@/lib/api/api-client'
import { oidcFoundationApi } from '@/services/oidc-foundation.api'

afterEach(() => vi.restoreAllMocks())

describe('oidcFoundationApi.getSnapshot', () => {
  it('GETs the foundation snapshot path', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ checked_at: 'x' } as never)
    await oidcFoundationApi.getSnapshot()
    expect(get).toHaveBeenCalledWith('/api/admin/oidc-foundation')
  })

  it('passes the snapshot through unchanged', async () => {
    const snapshot = { checked_at: 'x', correlation_id: null }
    vi.spyOn(apiClient, 'get').mockResolvedValue(snapshot as never)
    expect(await oidcFoundationApi.getSnapshot()).toBe(snapshot)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run app/services/__tests__/oidc-foundation.api.spec.ts`
Expected: FAIL — module unresolved.

- [ ] **Step 3: Write the service**

```ts
// app/services/oidc-foundation.api.ts
import { apiClient } from '@/lib/api/api-client'
import type { OidcFoundationSnapshot } from '@/types/oidc-foundation.types'

export const oidcFoundationApi = {
  // GET the OIDC foundation snapshot. The BFF injects the Bearer token; the SPA is
  // token-blind. The response is all public OIDC discovery metadata + health.
  getSnapshot(): Promise<OidcFoundationSnapshot> {
    return apiClient.get<OidcFoundationSnapshot>('/api/admin/oidc-foundation')
  },
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run app/services/__tests__/oidc-foundation.api.spec.ts`
Expected: PASS.

- [ ] **Step 5: Verify gates + commit**

Run: `./node_modules/.bin/oxlint . && npx vue-tsc --noEmit`

```bash
git add app/services/oidc-foundation.api.ts app/services/__tests__/oidc-foundation.api.spec.ts
git commit -m "$(cat <<'EOF'
feat(sso-admin-frontend): oidc-foundation.api getSnapshot

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 15.3: `useOidcFoundation` SSR composable

**Files:**
- Create: `app/composables/useOidcFoundation.ts`
- Test: `app/composables/__tests__/useOidcFoundation.nuxt.spec.ts`

**Interfaces:**
- Consumes: `useAsyncData`; `oidcFoundationApi.getSnapshot`; `resolveOidcFoundationViewState`/`OidcFoundationViewState`; `ApiError`/`getLastRequestId`; `OidcFoundationSnapshot`.
- Produces: `useOidcFoundation(): UseOidcFoundationReturn` where `UseOidcFoundationReturn = { readonly snapshot: ComputedRef<OidcFoundationSnapshot | null>; readonly viewState: ComputedRef<OidcFoundationViewState>; readonly requestId: ComputedRef<string | null>; readonly refresh: () => Promise<void> }`.

- [ ] **Step 1: Write the failing test** (mirrors the shipped `useIpAccessRules.nuxt.spec.ts` idiom)

```ts
// app/composables/__tests__/useOidcFoundation.nuxt.spec.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { ApiError } from '@/lib/api/api-client'
import type { OidcFoundationSnapshot } from '@/types/oidc-foundation.types'

const getSnapshotMock = vi.fn<() => Promise<unknown>>()
vi.mock('@/services/oidc-foundation.api', () => ({ oidcFoundationApi: { getSnapshot: getSnapshotMock } }))

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

const { useOidcFoundation } = await import('../useOidcFoundation')

const SNAPSHOT = { checked_at: '2026-06-28T10:00:00Z', correlation_id: 'corr-1' } as OidcFoundationSnapshot

beforeEach(() => {
  dataRef.value = null
  pendingRef.value = false
  errorRef.value = null
  getSnapshotMock.mockReset()
  getSnapshotMock.mockResolvedValue(SNAPSHOT)
})
afterEach(() => vi.clearAllMocks())

describe('useOidcFoundation', () => {
  it('fetches the snapshot once', () => {
    useOidcFoundation()
    expect(getSnapshotMock).toHaveBeenCalledTimes(1)
  })
  it('maps loading then ready', () => {
    const r = useOidcFoundation()
    pendingRef.value = true
    expect(r.viewState.value).toBe('loading')
    pendingRef.value = false
    dataRef.value = SNAPSHOT
    expect(r.viewState.value).toBe('ready')
    expect(r.snapshot.value).toEqual(SNAPSHOT)
  })
  it('maps 403 forbidden and surfaces the ApiError requestId', () => {
    const r = useOidcFoundation()
    errorRef.value = new ApiError(403, 'no', undefined, {}, 'req-oidc')
    expect(r.viewState.value).toBe('forbidden')
    expect(r.requestId.value).toBe('req-oidc')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run app/composables/__tests__/useOidcFoundation.nuxt.spec.ts`
Expected: FAIL — module unresolved.

- [ ] **Step 3: Write the composable**

```ts
// app/composables/useOidcFoundation.ts
import { computed, toRaw, type ComputedRef } from 'vue'
import { ApiError, getLastRequestId } from '@/lib/api/api-client'
import { oidcFoundationApi } from '@/services/oidc-foundation.api'
import {
  resolveOidcFoundationViewState,
  type OidcFoundationViewState,
} from '@/lib/oidc-foundation/oidc-foundation-view-state'
import type { OidcFoundationSnapshot } from '@/types/oidc-foundation.types'

export type UseOidcFoundationReturn = {
  readonly snapshot: ComputedRef<OidcFoundationSnapshot | null>
  readonly viewState: ComputedRef<OidcFoundationViewState>
  readonly requestId: ComputedRef<string | null>
  readonly refresh: () => Promise<void>
}

export function useOidcFoundation(): UseOidcFoundationReturn {
  // Runs during SSR so the public snapshot resolves server-side and hydrates as
  // safe DTO only (no token/secret/private key/PII). The token stays in Nitro
  // event.context.
  const { data, pending, error, refresh } = useAsyncData<OidcFoundationSnapshot>(
    'admin-oidc-foundation',
    () => oidcFoundationApi.getSnapshot(),
  )

  const snapshot = computed<OidcFoundationSnapshot | null>(() =>
    data.value != null ? toRaw(data.value) : null,
  )

  const viewState = computed<OidcFoundationViewState>(() =>
    resolveOidcFoundationViewState({
      pending: pending.value,
      error: error.value,
      snapshot: snapshot.value,
    }),
  )

  const requestId = computed<string | null>(() =>
    error.value instanceof ApiError
      ? (error.value.requestId ?? getLastRequestId())
      : getLastRequestId(),
  )

  return {
    snapshot,
    viewState,
    requestId,
    refresh: async () => {
      await refresh()
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run app/composables/__tests__/useOidcFoundation.nuxt.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Verify gates + commit**

Run: `./node_modules/.bin/oxlint . && npx vue-tsc --noEmit`

```bash
git add app/composables/useOidcFoundation.ts app/composables/__tests__/useOidcFoundation.nuxt.spec.ts
git commit -m "$(cat <<'EOF'
feat(sso-admin-frontend): useOidcFoundation SSR composable

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 15.4: OidcDiscoveryPanel

**Files:**
- Create: `app/components/oidc-foundation/OidcDiscoveryPanel.vue`
- Test: `app/components/oidc-foundation/__tests__/OidcDiscoveryPanel.spec.ts`

**Interfaces:**
- Props: `{ readonly discovery: OidcDiscoveryMetadata; readonly labels: OidcDiscoveryLabels }` where `OidcDiscoveryLabels = { title, issuer, authorization, token, jwksUri, userinfo, responseTypes, grantTypes, scopes, claims, signingAlgs }` (all `string`). Renders the issuer + 4 endpoint URLs (mono, overflow-wrap) and the 5 supported lists (comma-joined). No i18n, no fetch.

- [ ] **Step 1: Write the failing test**

```ts
// app/components/oidc-foundation/__tests__/OidcDiscoveryPanel.spec.ts
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import OidcDiscoveryPanel from '@/components/oidc-foundation/OidcDiscoveryPanel.vue'
import type { OidcDiscoveryMetadata } from '@/types/oidc-foundation.types'

const LABELS = {
  title: 'Discovery',
  issuer: 'Issuer',
  authorization: 'Authorization endpoint',
  token: 'Token endpoint',
  jwksUri: 'JWKS URI',
  userinfo: 'Userinfo endpoint',
  responseTypes: 'Response types',
  grantTypes: 'Grant types',
  scopes: 'Scopes',
  claims: 'Claims',
  signingAlgs: 'ID token signing algorithms',
}

const DISCOVERY: OidcDiscoveryMetadata = {
  issuer: 'https://sso.example/oidc',
  authorization_endpoint: 'https://sso.example/oauth/authorize',
  token_endpoint: 'https://sso.example/oauth/token',
  jwks_uri: 'https://sso.example/oauth/jwks',
  userinfo_endpoint: 'https://sso.example/oauth/userinfo',
  response_types_supported: ['code'],
  grant_types_supported: ['authorization_code', 'refresh_token'],
  scopes_supported: ['openid', 'profile', 'email'],
  claims_supported: ['sub', 'email'],
  id_token_signing_alg_values_supported: ['RS256'],
}

describe('OidcDiscoveryPanel', () => {
  it('renders the issuer + endpoints + supported lists', () => {
    const w = mount(OidcDiscoveryPanel, { props: { discovery: DISCOVERY, labels: LABELS } })
    expect(w.find('[data-testid="oidc-discovery"]').exists()).toBe(true)
    expect(w.text()).toContain('https://sso.example/oidc')
    expect(w.text()).toContain('https://sso.example/oauth/jwks')
    expect(w.text()).toContain('authorization_code, refresh_token')
    expect(w.text()).toContain('openid, profile, email')
    expect(w.text()).toContain('RS256')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run app/components/oidc-foundation/__tests__/OidcDiscoveryPanel.spec.ts`
Expected: FAIL — component missing.

- [ ] **Step 3: Write the component**

```vue
<!-- app/components/oidc-foundation/OidcDiscoveryPanel.vue -->
<script setup lang="ts">
import type { OidcDiscoveryMetadata } from '@/types/oidc-foundation.types'

export type OidcDiscoveryLabels = {
  readonly title: string
  readonly issuer: string
  readonly authorization: string
  readonly token: string
  readonly jwksUri: string
  readonly userinfo: string
  readonly responseTypes: string
  readonly grantTypes: string
  readonly scopes: string
  readonly claims: string
  readonly signingAlgs: string
}

defineProps<{
  readonly discovery: OidcDiscoveryMetadata
  readonly labels: OidcDiscoveryLabels
}>()
</script>

<template>
  <section class="oidc-panel" data-testid="oidc-discovery" aria-labelledby="oidc-discovery-title">
    <h2 id="oidc-discovery-title" class="oidc-panel__title">{{ labels.title }}</h2>
    <dl class="oidc-panel__grid">
      <div class="oidc-panel__wide">
        <dt>{{ labels.issuer }}</dt>
        <dd class="oidc-panel__mono">{{ discovery.issuer }}</dd>
      </div>
      <div class="oidc-panel__wide">
        <dt>{{ labels.authorization }}</dt>
        <dd class="oidc-panel__mono">{{ discovery.authorization_endpoint }}</dd>
      </div>
      <div class="oidc-panel__wide">
        <dt>{{ labels.token }}</dt>
        <dd class="oidc-panel__mono">{{ discovery.token_endpoint }}</dd>
      </div>
      <div class="oidc-panel__wide">
        <dt>{{ labels.jwksUri }}</dt>
        <dd class="oidc-panel__mono">{{ discovery.jwks_uri }}</dd>
      </div>
      <div class="oidc-panel__wide">
        <dt>{{ labels.userinfo }}</dt>
        <dd class="oidc-panel__mono">{{ discovery.userinfo_endpoint }}</dd>
      </div>
      <div>
        <dt>{{ labels.responseTypes }}</dt>
        <dd>{{ discovery.response_types_supported.join(', ') }}</dd>
      </div>
      <div>
        <dt>{{ labels.grantTypes }}</dt>
        <dd>{{ discovery.grant_types_supported.join(', ') }}</dd>
      </div>
      <div>
        <dt>{{ labels.scopes }}</dt>
        <dd>{{ discovery.scopes_supported.join(', ') }}</dd>
      </div>
      <div>
        <dt>{{ labels.claims }}</dt>
        <dd>{{ discovery.claims_supported.join(', ') }}</dd>
      </div>
      <div>
        <dt>{{ labels.signingAlgs }}</dt>
        <dd>{{ discovery.id_token_signing_alg_values_supported.join(', ') }}</dd>
      </div>
    </dl>
  </section>
</template>

<style scoped>
.oidc-panel {
  display: grid;
  gap: 14px;
  padding: 20px;
  background: var(--card);
  border: 1px solid var(--border);
}
.oidc-panel__title {
  margin: 0;
  font: 600 1rem/1.3 var(--font-sans);
  color: var(--fg);
}
.oidc-panel__grid {
  margin: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 16px;
}
.oidc-panel__wide {
  grid-column: 1 / -1;
}
.oidc-panel__grid dt {
  font: 600 0.625rem/1.2 var(--font-sans);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.oidc-panel__grid dd {
  margin: 2px 0 0;
  font: 400 0.8125rem/1.4 var(--font-sans);
  color: var(--fg);
  overflow-wrap: anywhere;
}
.oidc-panel__mono {
  font-family: var(--font-mono, monospace);
}
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run app/components/oidc-foundation/__tests__/OidcDiscoveryPanel.spec.ts`
Expected: PASS.

- [ ] **Step 5: Verify gates + commit**

Run: `./node_modules/.bin/oxlint . && ./node_modules/.bin/eslint app/components/oidc-foundation/OidcDiscoveryPanel.vue && npx vue-tsc --noEmit`

```bash
git add app/components/oidc-foundation/OidcDiscoveryPanel.vue app/components/oidc-foundation/__tests__/OidcDiscoveryPanel.spec.ts
git commit -m "$(cat <<'EOF'
feat(sso-admin-frontend): Swiss OIDC discovery metadata panel

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 15.5: OidcJwksPanel + OidcCatalogPanel

**Files:**
- Create: `app/components/oidc-foundation/OidcJwksPanel.vue`
- Create: `app/components/oidc-foundation/OidcCatalogPanel.vue`
- Test: `app/components/oidc-foundation/__tests__/OidcJwksPanel.spec.ts`
- Test: `app/components/oidc-foundation/__tests__/OidcCatalogPanel.spec.ts`

**Interfaces:**
- `OidcJwksPanel` props: `{ readonly keys: readonly OidcJwksKey[]; readonly labels: OidcJwksLabels }` where `OidcJwksLabels = { title, caption, kid, alg, use, status, published, rotated }`. UiDataList; key `status` via `UiStatusBadge :status` (shared `resolveStatusTone`). published/rotated via `UiFolio variant="timestamp"`.
- `OidcCatalogPanel` props: `{ readonly catalog: OidcFoundationSnapshot['catalog']; readonly labels: OidcCatalogLabels }` where `OidcCatalogLabels = { title, scopesTitle, claimsTitle, algorithmsTitle, scopeName, scopeLabel, scopeDescription, scopeStatus, claimName, claimScope, claimSensitivity, algName, algUsage, algStatus, captionScopes, captionClaims, captionAlgorithms }`. Three UiDataLists; scope `label_status` via `resolveScopeLabelTone`; algorithm `status` via `UiStatusBadge :status`.

- [ ] **Step 1: Write the failing tests**

```ts
// app/components/oidc-foundation/__tests__/OidcJwksPanel.spec.ts
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import OidcJwksPanel from '@/components/oidc-foundation/OidcJwksPanel.vue'
import type { OidcJwksKey } from '@/types/oidc-foundation.types'

const LABELS = {
  title: 'JWKS', caption: 'JWKS keys', kid: 'Key ID', alg: 'Algorithm',
  use: 'Use', status: 'Status', published: 'Published', rotated: 'Rotated',
}
const KEYS: OidcJwksKey[] = [
  { kid: 'key-2026-a', alg: 'RS256', use: 'sig', status: 'published', published_at: '2026-05-01T00:00:00Z', rotated_at: null },
  { kid: 'key-2025-z', alg: 'RS256', use: 'sig', status: 'rotated', published_at: '2025-01-01T00:00:00Z', rotated_at: '2026-05-01T00:00:00Z' },
]

describe('OidcJwksPanel', () => {
  it('renders a row per key with kid + a healthy badge for the published key', () => {
    const w = mount(OidcJwksPanel, { props: { keys: KEYS, labels: LABELS } })
    expect(w.find('[data-testid="oidc-jwks"]').exists()).toBe(true)
    expect(w.text()).toContain('key-2026-a')
    expect(w.text()).toContain('published') // the real backend key status
    expect(w.text()).toContain('RS256')
    // a published key reads as success (resolveJwksKeyTone), shown as tone + label
    const badges = w.findAll('.status')
    expect(badges.some((b) => b.attributes('data-tone') === 'success')).toBe(true)
  })
})
```

```ts
// app/components/oidc-foundation/__tests__/OidcCatalogPanel.spec.ts
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import OidcCatalogPanel from '@/components/oidc-foundation/OidcCatalogPanel.vue'
import type { OidcFoundationSnapshot } from '@/types/oidc-foundation.types'

const LABELS = {
  title: 'Catalog', scopesTitle: 'Scopes', claimsTitle: 'Claims', algorithmsTitle: 'Algorithms',
  scopeName: 'Scope', scopeLabel: 'Label', scopeDescription: 'Description', scopeStatus: 'Label status',
  claimName: 'Claim', claimScope: 'Scope dependency', claimSensitivity: 'Sensitivity',
  algName: 'Algorithm', algUsage: 'Usage', algStatus: 'Status',
  captionScopes: 'Scope catalog', captionClaims: 'Claim catalog', captionAlgorithms: 'Algorithm catalog',
}
const CATALOG: OidcFoundationSnapshot['catalog'] = {
  scopes: [{ name: 'openid', label: 'OpenID', description: 'Base scope', label_status: 'mapped' }],
  claims: [{ name: 'email', scope_dependency: 'email', sensitivity: 'pii' }],
  algorithms: [{ name: 'RS256', usage: 'id_token', status: 'active' }],
}

describe('OidcCatalogPanel', () => {
  it('renders the scope / claim / algorithm tables', () => {
    const w = mount(OidcCatalogPanel, { props: { catalog: CATALOG, labels: LABELS } })
    expect(w.find('[data-testid="oidc-catalog"]').exists()).toBe(true)
    expect(w.text()).toContain('openid')
    expect(w.text()).toContain('mapped')
    expect(w.text()).toContain('email')
    expect(w.text()).toContain('RS256')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `./node_modules/.bin/vitest run app/components/oidc-foundation/__tests__/OidcJwksPanel.spec.ts app/components/oidc-foundation/__tests__/OidcCatalogPanel.spec.ts`
Expected: FAIL — components missing.

- [ ] **Step 3: Write `OidcJwksPanel.vue`**

```vue
<!-- app/components/oidc-foundation/OidcJwksPanel.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import UiDataList, {
  type UiDataListColumn,
  type UiDataListRow,
} from '@/components/ui/UiDataList.vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import { resolveJwksKeyTone } from '@/lib/oidc-foundation/oidc-foundation-view-state'
import type { OidcJwksKey } from '@/types/oidc-foundation.types'

export type OidcJwksLabels = {
  readonly title: string
  readonly caption: string
  readonly kid: string
  readonly alg: string
  readonly use: string
  readonly status: string
  readonly published: string
  readonly rotated: string
}

const props = defineProps<{
  readonly keys: readonly OidcJwksKey[]
  readonly labels: OidcJwksLabels
}>()

const columns = computed<readonly UiDataListColumn[]>(() => [
  { key: 'kid', label: props.labels.kid, align: 'left', variant: 'id' },
  { key: 'alg', label: props.labels.alg, align: 'left' },
  { key: 'use', label: props.labels.use, align: 'left' },
  { key: 'status', label: props.labels.status, align: 'left' },
  { key: 'published', label: props.labels.published, align: 'left', variant: 'timestamp' },
  { key: 'rotated', label: props.labels.rotated, align: 'left', variant: 'timestamp' },
])

const rows = computed<readonly UiDataListRow[]>(() =>
  props.keys.map((key) => ({
    id: key.kid,
    kid: key.kid,
    alg: key.alg,
    use: key.use,
    status: key.status,
    published: key.published_at ?? '—',
    rotated: key.rotated_at ?? '—',
  })),
)
</script>

<template>
  <section class="oidc-panel" data-testid="oidc-jwks" aria-labelledby="oidc-jwks-title">
    <h2 id="oidc-jwks-title" class="oidc-panel__title">{{ labels.title }}</h2>
    <UiDataList :caption="labels.caption" :columns="columns" :rows="rows">
      <template #cell(status)="{ row }">
        <UiStatusBadge
          :tone="resolveJwksKeyTone(String(row['status']))"
          :label="String(row['status'])"
        />
      </template>
    </UiDataList>
  </section>
</template>

<style scoped>
.oidc-panel {
  display: grid;
  gap: 14px;
  padding: 20px;
  background: var(--card);
  border: 1px solid var(--border);
}
.oidc-panel__title {
  margin: 0;
  font: 600 1rem/1.3 var(--font-sans);
  color: var(--fg);
}
</style>
```

- [ ] **Step 4: Write `OidcCatalogPanel.vue`**

```vue
<!-- app/components/oidc-foundation/OidcCatalogPanel.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import UiDataList, {
  type UiDataListColumn,
  type UiDataListRow,
} from '@/components/ui/UiDataList.vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import { resolveScopeLabelTone } from '@/lib/oidc-foundation/oidc-foundation-view-state'
import type { OidcFoundationSnapshot, ScopeLabelStatus } from '@/types/oidc-foundation.types'

export type OidcCatalogLabels = {
  readonly title: string
  readonly scopesTitle: string
  readonly claimsTitle: string
  readonly algorithmsTitle: string
  readonly scopeName: string
  readonly scopeLabel: string
  readonly scopeDescription: string
  readonly scopeStatus: string
  readonly claimName: string
  readonly claimScope: string
  readonly claimSensitivity: string
  readonly algName: string
  readonly algUsage: string
  readonly algStatus: string
  readonly captionScopes: string
  readonly captionClaims: string
  readonly captionAlgorithms: string
}

const props = defineProps<{
  readonly catalog: OidcFoundationSnapshot['catalog']
  readonly labels: OidcCatalogLabels
}>()

const scopeColumns = computed<readonly UiDataListColumn[]>(() => [
  { key: 'name', label: props.labels.scopeName, align: 'left' },
  { key: 'label', label: props.labels.scopeLabel, align: 'left' },
  { key: 'description', label: props.labels.scopeDescription, align: 'left' },
  { key: 'status', label: props.labels.scopeStatus, align: 'left' },
])
const scopeRows = computed<readonly UiDataListRow[]>(() =>
  props.catalog.scopes.map((scope) => ({
    id: scope.name,
    name: scope.name,
    label: scope.label,
    description: scope.description,
    status: scope.label_status,
  })),
)

const claimColumns = computed<readonly UiDataListColumn[]>(() => [
  { key: 'name', label: props.labels.claimName, align: 'left' },
  { key: 'scope', label: props.labels.claimScope, align: 'left' },
  { key: 'sensitivity', label: props.labels.claimSensitivity, align: 'left' },
])
const claimRows = computed<readonly UiDataListRow[]>(() =>
  props.catalog.claims.map((claim) => ({
    id: claim.name,
    name: claim.name,
    scope: claim.scope_dependency ?? '—',
    sensitivity: claim.sensitivity,
  })),
)

const algColumns = computed<readonly UiDataListColumn[]>(() => [
  { key: 'name', label: props.labels.algName, align: 'left' },
  { key: 'usage', label: props.labels.algUsage, align: 'left' },
  { key: 'status', label: props.labels.algStatus, align: 'left' },
])
const algRows = computed<readonly UiDataListRow[]>(() =>
  props.catalog.algorithms.map((alg) => ({
    id: alg.name,
    name: alg.name,
    usage: alg.usage,
    status: alg.status,
  })),
)

function scopeTone(status: string): ReturnType<typeof resolveScopeLabelTone> {
  return resolveScopeLabelTone(status as ScopeLabelStatus)
}
</script>

<template>
  <section class="oidc-panel" data-testid="oidc-catalog" aria-labelledby="oidc-catalog-title">
    <h2 id="oidc-catalog-title" class="oidc-panel__title">{{ labels.title }}</h2>

    <h3 class="oidc-panel__subtitle">{{ labels.scopesTitle }}</h3>
    <UiDataList :caption="labels.captionScopes" :columns="scopeColumns" :rows="scopeRows">
      <template #cell(status)="{ row }">
        <UiStatusBadge :tone="scopeTone(String(row['status']))" :label="String(row['status'])" />
      </template>
    </UiDataList>

    <h3 class="oidc-panel__subtitle">{{ labels.claimsTitle }}</h3>
    <UiDataList :caption="labels.captionClaims" :columns="claimColumns" :rows="claimRows" />

    <h3 class="oidc-panel__subtitle">{{ labels.algorithmsTitle }}</h3>
    <UiDataList :caption="labels.captionAlgorithms" :columns="algColumns" :rows="algRows">
      <template #cell(status)="{ row }">
        <UiStatusBadge :status="String(row['status'])" />
      </template>
    </UiDataList>
  </section>
</template>

<style scoped>
.oidc-panel {
  display: grid;
  gap: 14px;
  padding: 20px;
  background: var(--card);
  border: 1px solid var(--border);
}
.oidc-panel__title {
  margin: 0;
  font: 600 1rem/1.3 var(--font-sans);
  color: var(--fg);
}
.oidc-panel__subtitle {
  margin: 8px 0 0;
  font: 600 0.75rem/1.3 var(--font-sans);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--fg-3);
}
</style>
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `./node_modules/.bin/vitest run app/components/oidc-foundation/__tests__/OidcJwksPanel.spec.ts app/components/oidc-foundation/__tests__/OidcCatalogPanel.spec.ts`
Expected: PASS.

- [ ] **Step 6: Verify gates + commit**

Run: `./node_modules/.bin/oxlint . && ./node_modules/.bin/eslint app/components/oidc-foundation/OidcJwksPanel.vue app/components/oidc-foundation/OidcCatalogPanel.vue && npx vue-tsc --noEmit`

```bash
git add app/components/oidc-foundation/OidcJwksPanel.vue app/components/oidc-foundation/OidcCatalogPanel.vue app/components/oidc-foundation/__tests__/OidcJwksPanel.spec.ts app/components/oidc-foundation/__tests__/OidcCatalogPanel.spec.ts
git commit -m "$(cat <<'EOF'
feat(sso-admin-frontend): Swiss OIDC JWKS + catalog panels

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 15.6: OidcAvailabilityPanel + OidcConsistencyPanel

**Files:**
- Create: `app/components/oidc-foundation/OidcAvailabilityPanel.vue`
- Create: `app/components/oidc-foundation/OidcConsistencyPanel.vue`
- Test: `app/components/oidc-foundation/__tests__/OidcAvailabilityPanel.spec.ts`
- Test: `app/components/oidc-foundation/__tests__/OidcConsistencyPanel.spec.ts`

**Interfaces:**
- `OidcAvailabilityPanel` props: `{ readonly availability: OidcFoundationSnapshot['availability']; readonly evidence: OidcFoundationSnapshot['evidence']; readonly labels: OidcAvailabilityLabels }` where `OidcAvailabilityLabels = { title, httpStatus, latency, lastChecked, rotationTitle, rotationEnvironment, rotationDrill, rotationSignoff, timelineTitle }`. Renders the two endpoint availabilities (badge via `resolveAvailabilityTone`, endpoint name from `name`, status text from `status`), the JWKS-rotation evidence (badge via `resolveEvidenceTone`), and the availability timeline list (badge via `resolveEvidenceTone`). `evidence_ref` is an internal ops-doc pointer and is intentionally not rendered on this read-only page.
- `OidcConsistencyPanel` props: `{ readonly issuerConsistency: OidcIssuerConsistency; readonly endpointConsistency: readonly OidcEndpointConsistency[]; readonly labels: OidcConsistencyLabels }` where `OidcConsistencyLabels = { title, issuerTitle, configured, discovered, publicBase, lastChecked, endpointTitle, caption, name, discoveredUrl, expectedUrl, status }`. Renders issuer consistency (badge via `resolveConsistencyTone`) + the endpoint-consistency UiDataList (per-row status badge via `resolveConsistencyTone`).

- [ ] **Step 1: Write the failing tests**

```ts
// app/components/oidc-foundation/__tests__/OidcAvailabilityPanel.spec.ts
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import OidcAvailabilityPanel from '@/components/oidc-foundation/OidcAvailabilityPanel.vue'
import type { OidcFoundationSnapshot } from '@/types/oidc-foundation.types'

const LABELS = {
  title: 'Availability', httpStatus: 'HTTP', latency: 'Latency (ms)',
  lastChecked: 'Last checked', rotationTitle: 'JWKS rotation', rotationEnvironment: 'Environment',
  rotationDrill: 'Latest drill', rotationSignoff: 'Operator signoff', timelineTitle: 'Availability timeline',
}
const AVAILABILITY: OidcFoundationSnapshot['availability'] = {
  discovery: { name: 'Discovery', status: 'healthy', http_status: 200, latency_ms: 42, last_checked_at: '2026-06-28T10:00:00Z', evidence_ref: null },
  jwks: { name: 'JWKS', status: 'unavailable', http_status: 503, latency_ms: null, last_checked_at: '2026-06-28T10:00:00Z', evidence_ref: null },
}
const EVIDENCE: OidcFoundationSnapshot['evidence'] = {
  jwks_rotation: { status: 'recorded', label: 'Rotation drill', environment: 'production', latest_drill_at: '2026-05-30T00:00:00Z', operator_signoff: 'ops', evidence_ref: null },
  availability_timeline: [{ status: 'available', label: 'Daily probe', checked_at: '2026-06-28T00:00:00Z', evidence_ref: null }],
}

describe('OidcAvailabilityPanel', () => {
  it('renders endpoint availability + rotation evidence + timeline', () => {
    const w = mount(OidcAvailabilityPanel, { props: { availability: AVAILABILITY, evidence: EVIDENCE, labels: LABELS } })
    expect(w.find('[data-testid="oidc-availability"]').exists()).toBe(true)
    const jwks = w.find('[data-testid="oidc-availability-jwks"]')
    expect(jwks.attributes('data-tone')).toBe('danger') // unavailable
    expect(w.text()).toContain('Rotation drill')
    expect(w.text()).toContain('Daily probe')
  })
})
```

```ts
// app/components/oidc-foundation/__tests__/OidcConsistencyPanel.spec.ts
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import OidcConsistencyPanel from '@/components/oidc-foundation/OidcConsistencyPanel.vue'
import type { OidcEndpointConsistency, OidcIssuerConsistency } from '@/types/oidc-foundation.types'

const LABELS = {
  title: 'Consistency', issuerTitle: 'Issuer', configured: 'Configured issuer', discovered: 'Discovery issuer',
  publicBase: 'Public base URL', lastChecked: 'Last checked', endpointTitle: 'Endpoints', caption: 'Endpoint consistency',
  name: 'Endpoint', discoveredUrl: 'Discovered', expectedUrl: 'Expected', status: 'Status',
}
const ISSUER: OidcIssuerConsistency = {
  status: 'pass', configured_issuer: 'https://sso.example/oidc', discovery_issuer: 'https://sso.example/oidc',
  public_base_url: 'https://sso.example', last_checked_at: '2026-06-28T10:00:00Z',
}
const ENDPOINTS: OidcEndpointConsistency[] = [
  { name: 'token', discovered_url: 'https://sso.example/oauth/token', expected_url: 'https://sso.example/oauth/token', status: 'pass' },
  { name: 'jwks', discovered_url: 'https://sso.example/oauth/jwks', expected_url: 'https://sso.example/oauth/keys', status: 'mismatch' },
]

describe('OidcConsistencyPanel', () => {
  it('renders issuer consistency + endpoint table with status tones', () => {
    const w = mount(OidcConsistencyPanel, { props: { issuerConsistency: ISSUER, endpointConsistency: ENDPOINTS, labels: LABELS } })
    expect(w.find('[data-testid="oidc-consistency"]').exists()).toBe(true)
    expect(w.find('[data-testid="oidc-issuer-status"]').attributes('data-tone')).toBe('success')
    expect(w.text()).toContain('https://sso.example/oauth/keys')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `./node_modules/.bin/vitest run app/components/oidc-foundation/__tests__/OidcAvailabilityPanel.spec.ts app/components/oidc-foundation/__tests__/OidcConsistencyPanel.spec.ts`
Expected: FAIL — components missing.

- [ ] **Step 3: Write `OidcAvailabilityPanel.vue`**

```vue
<!-- app/components/oidc-foundation/OidcAvailabilityPanel.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import UiFolio from '@/components/ui/UiFolio.vue'
import {
  resolveAvailabilityTone,
  resolveEvidenceTone,
} from '@/lib/oidc-foundation/oidc-foundation-view-state'
import type { OidcEndpointAvailability, OidcFoundationSnapshot } from '@/types/oidc-foundation.types'

export type OidcAvailabilityLabels = {
  readonly title: string
  readonly httpStatus: string
  readonly latency: string
  readonly lastChecked: string
  readonly rotationTitle: string
  readonly rotationEnvironment: string
  readonly rotationDrill: string
  readonly rotationSignoff: string
  readonly timelineTitle: string
}

const props = defineProps<{
  readonly availability: OidcFoundationSnapshot['availability']
  readonly evidence: OidcFoundationSnapshot['evidence']
  readonly labels: OidcAvailabilityLabels
}>()

const endpoints = computed<readonly { readonly key: string; readonly value: OidcEndpointAvailability }[]>(
  () => [
    { key: 'discovery', value: props.availability.discovery },
    { key: 'jwks', value: props.availability.jwks },
  ],
)
</script>

<template>
  <section class="oidc-panel" data-testid="oidc-availability" aria-labelledby="oidc-availability-title">
    <h2 id="oidc-availability-title" class="oidc-panel__title">{{ labels.title }}</h2>

    <div v-for="ep in endpoints" :key="ep.key" class="oidc-availability__endpoint">
      <div class="oidc-availability__head">
        <strong>{{ ep.value.name }}</strong>
        <UiStatusBadge
          :data-testid="`oidc-availability-${ep.key}`"
          :tone="resolveAvailabilityTone(ep.value.status)"
          :label="ep.value.status"
        />
      </div>
      <dl class="oidc-availability__metrics">
        <div><dt>{{ labels.httpStatus }}</dt><dd>{{ ep.value.http_status ?? '—' }}</dd></div>
        <div><dt>{{ labels.latency }}</dt><dd>{{ ep.value.latency_ms ?? '—' }}</dd></div>
        <div>
          <dt>{{ labels.lastChecked }}</dt>
          <dd>
            <UiFolio v-if="ep.value.last_checked_at" :value="ep.value.last_checked_at" variant="timestamp" />
            <span v-else>—</span>
          </dd>
        </div>
      </dl>
    </div>

    <section class="oidc-availability__evidence" aria-label="rotation">
      <div class="oidc-availability__head">
        <strong>{{ labels.rotationTitle }}</strong>
        <UiStatusBadge
          :tone="resolveEvidenceTone(evidence.jwks_rotation.status)"
          :label="evidence.jwks_rotation.label"
        />
      </div>
      <dl class="oidc-availability__metrics">
        <div><dt>{{ labels.rotationEnvironment }}</dt><dd>{{ evidence.jwks_rotation.environment ?? '—' }}</dd></div>
        <div>
          <dt>{{ labels.rotationDrill }}</dt>
          <dd>
            <UiFolio v-if="evidence.jwks_rotation.latest_drill_at" :value="evidence.jwks_rotation.latest_drill_at" variant="timestamp" />
            <span v-else>—</span>
          </dd>
        </div>
        <div><dt>{{ labels.rotationSignoff }}</dt><dd>{{ evidence.jwks_rotation.operator_signoff ?? '—' }}</dd></div>
      </dl>
    </section>

    <section class="oidc-availability__evidence" aria-label="timeline">
      <strong class="oidc-panel__subtitle">{{ labels.timelineTitle }}</strong>
      <ul class="oidc-availability__timeline">
        <li v-for="(item, index) in evidence.availability_timeline" :key="index" class="oidc-availability__timeline-item">
          <UiStatusBadge :tone="resolveEvidenceTone(item.status)" :label="item.label" />
          <UiFolio v-if="item.checked_at" :value="item.checked_at" variant="timestamp" />
        </li>
      </ul>
    </section>
  </section>
</template>

<style scoped>
.oidc-panel {
  display: grid;
  gap: 14px;
  padding: 20px;
  background: var(--card);
  border: 1px solid var(--border);
}
.oidc-panel__title {
  margin: 0;
  font: 600 1rem/1.3 var(--font-sans);
  color: var(--fg);
}
.oidc-panel__subtitle {
  font: 600 0.75rem/1.3 var(--font-sans);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.oidc-availability__endpoint,
.oidc-availability__evidence {
  display: grid;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}
.oidc-availability__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.oidc-availability__metrics {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 8px 16px;
}
.oidc-availability__metrics dt {
  font: 600 0.625rem/1.2 var(--font-sans);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.oidc-availability__metrics dd {
  margin: 2px 0 0;
  font: 400 0.8125rem/1.4 var(--font-sans);
  color: var(--fg);
}
.oidc-availability__timeline {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 6px;
}
.oidc-availability__timeline-item {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
</style>
```

- [ ] **Step 4: Write `OidcConsistencyPanel.vue`**

```vue
<!-- app/components/oidc-foundation/OidcConsistencyPanel.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import UiDataList, {
  type UiDataListColumn,
  type UiDataListRow,
} from '@/components/ui/UiDataList.vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import UiFolio from '@/components/ui/UiFolio.vue'
import { resolveConsistencyTone } from '@/lib/oidc-foundation/oidc-foundation-view-state'
import type {
  OidcConsistencyStatus,
  OidcEndpointConsistency,
  OidcIssuerConsistency,
} from '@/types/oidc-foundation.types'

export type OidcConsistencyLabels = {
  readonly title: string
  readonly issuerTitle: string
  readonly configured: string
  readonly discovered: string
  readonly publicBase: string
  readonly lastChecked: string
  readonly endpointTitle: string
  readonly caption: string
  readonly name: string
  readonly discoveredUrl: string
  readonly expectedUrl: string
  readonly status: string
}

const props = defineProps<{
  readonly issuerConsistency: OidcIssuerConsistency
  readonly endpointConsistency: readonly OidcEndpointConsistency[]
  readonly labels: OidcConsistencyLabels
}>()

const columns = computed<readonly UiDataListColumn[]>(() => [
  { key: 'name', label: props.labels.name, align: 'left' },
  { key: 'discovered', label: props.labels.discoveredUrl, align: 'left' },
  { key: 'expected', label: props.labels.expectedUrl, align: 'left' },
  { key: 'status', label: props.labels.status, align: 'left' },
])
const rows = computed<readonly UiDataListRow[]>(() =>
  props.endpointConsistency.map((endpoint) => ({
    id: endpoint.name,
    name: endpoint.name,
    discovered: endpoint.discovered_url,
    expected: endpoint.expected_url,
    status: endpoint.status,
  })),
)

function endpointTone(status: string): ReturnType<typeof resolveConsistencyTone> {
  return resolveConsistencyTone(status as OidcConsistencyStatus)
}
</script>

<template>
  <section class="oidc-panel" data-testid="oidc-consistency" aria-labelledby="oidc-consistency-title">
    <h2 id="oidc-consistency-title" class="oidc-panel__title">{{ labels.title }}</h2>

    <section class="oidc-consistency__issuer" aria-label="issuer">
      <div class="oidc-consistency__head">
        <strong>{{ labels.issuerTitle }}</strong>
        <UiStatusBadge
          data-testid="oidc-issuer-status"
          :tone="resolveConsistencyTone(issuerConsistency.status)"
          :label="issuerConsistency.status"
        />
      </div>
      <dl class="oidc-consistency__grid">
        <div class="oidc-consistency__wide">
          <dt>{{ labels.configured }}</dt>
          <dd class="oidc-consistency__mono">{{ issuerConsistency.configured_issuer }}</dd>
        </div>
        <div class="oidc-consistency__wide">
          <dt>{{ labels.discovered }}</dt>
          <dd class="oidc-consistency__mono">{{ issuerConsistency.discovery_issuer }}</dd>
        </div>
        <div class="oidc-consistency__wide">
          <dt>{{ labels.publicBase }}</dt>
          <dd class="oidc-consistency__mono">{{ issuerConsistency.public_base_url }}</dd>
        </div>
        <div>
          <dt>{{ labels.lastChecked }}</dt>
          <dd><UiFolio :value="issuerConsistency.last_checked_at" variant="timestamp" /></dd>
        </div>
      </dl>
    </section>

    <section class="oidc-consistency__endpoints" aria-label="endpoints">
      <strong class="oidc-panel__subtitle">{{ labels.endpointTitle }}</strong>
      <UiDataList :caption="labels.caption" :columns="columns" :rows="rows">
        <template #cell(status)="{ row }">
          <UiStatusBadge :tone="endpointTone(String(row['status']))" :label="String(row['status'])" />
        </template>
      </UiDataList>
    </section>
  </section>
</template>

<style scoped>
.oidc-panel {
  display: grid;
  gap: 14px;
  padding: 20px;
  background: var(--card);
  border: 1px solid var(--border);
}
.oidc-panel__title {
  margin: 0;
  font: 600 1rem/1.3 var(--font-sans);
  color: var(--fg);
}
.oidc-panel__subtitle {
  font: 600 0.75rem/1.3 var(--font-sans);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.oidc-consistency__issuer,
.oidc-consistency__endpoints {
  display: grid;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}
.oidc-consistency__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.oidc-consistency__grid {
  margin: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 16px;
}
.oidc-consistency__wide {
  grid-column: 1 / -1;
}
.oidc-consistency__grid dt {
  font: 600 0.625rem/1.2 var(--font-sans);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.oidc-consistency__grid dd {
  margin: 2px 0 0;
  font: 400 0.8125rem/1.4 var(--font-sans);
  color: var(--fg);
  overflow-wrap: anywhere;
}
.oidc-consistency__mono {
  font-family: var(--font-mono, monospace);
}
</style>
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `./node_modules/.bin/vitest run app/components/oidc-foundation/__tests__/OidcAvailabilityPanel.spec.ts app/components/oidc-foundation/__tests__/OidcConsistencyPanel.spec.ts`
Expected: PASS.

- [ ] **Step 6: Verify gates + commit**

Run: `./node_modules/.bin/oxlint . && ./node_modules/.bin/eslint app/components/oidc-foundation/OidcAvailabilityPanel.vue app/components/oidc-foundation/OidcConsistencyPanel.vue && npx vue-tsc --noEmit`

```bash
git add app/components/oidc-foundation/OidcAvailabilityPanel.vue app/components/oidc-foundation/OidcConsistencyPanel.vue app/components/oidc-foundation/__tests__/OidcAvailabilityPanel.spec.ts app/components/oidc-foundation/__tests__/OidcConsistencyPanel.spec.ts
git commit -m "$(cat <<'EOF'
feat(sso-admin-frontend): Swiss OIDC availability + consistency panels

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 15.7: Page (overview + compose panels) + locale

**Files:**
- Modify (replace stub): `app/pages/oidc-foundation.vue`
- Modify: `app/locales/en.json` (`oidc` block), `app/locales/id.json` (`oidc` block)
- Test: `app/pages/__tests__/oidc-foundation.page.nuxt.spec.ts`

**Interfaces:**
- Consumes: `useOidcFoundation` (15.3); the five panels + their label types (15.4–15.6); `useSessionStore`; `useI18n`; `UiSkeleton`/`UiStatusView`/`UiButton`/`UiFolio`.
- **`definePageMeta` MUST keep `name: 'admin.oidc-foundation'`, `permissions: ['admin.dashboard.view']`** verbatim — `route-map.spec.ts` asserts this row.
- Replace the `oidc` locale block wholesale with the final Swiss key set below (drops the `FR-001–FR-005` marker from the title; adds the panel/overview keys).
- Renders: hero + overview (`checked_at`, `correlation_id`) on `ready`, then the five panels. `loading`/`forbidden`/`unauthenticated`/`error` surfaces mirror the other read-only pages.

- [ ] **Step 1: Write the failing page test**

```ts
// app/pages/__tests__/oidc-foundation.page.nuxt.spec.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import enLocale from '@/locales/en.json'
import type { OidcFoundationSnapshot } from '@/types/oidc-foundation.types'

function snapshot(): OidcFoundationSnapshot {
  return {
    checked_at: '2026-06-28T10:00:00Z',
    correlation_id: 'corr-abc',
    discovery: {
      issuer: 'https://sso.example/oidc',
      authorization_endpoint: 'https://sso.example/oauth/authorize',
      token_endpoint: 'https://sso.example/oauth/token',
      jwks_uri: 'https://sso.example/oauth/jwks',
      userinfo_endpoint: 'https://sso.example/oauth/userinfo',
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code'],
      scopes_supported: ['openid'],
      claims_supported: ['sub'],
      id_token_signing_alg_values_supported: ['RS256'],
    },
    jwks: { keys: [{ kid: 'key-a', alg: 'RS256', use: 'sig', status: 'published', published_at: null, rotated_at: null }] },
    availability: {
      discovery: { name: 'Discovery', status: 'healthy', http_status: 200, latency_ms: 40, last_checked_at: null, evidence_ref: null },
      jwks: { name: 'JWKS', status: 'healthy', http_status: 200, latency_ms: 30, last_checked_at: null, evidence_ref: null },
    },
    evidence: {
      jwks_rotation: { status: 'recorded', label: 'Rotation', environment: 'prod', latest_drill_at: null, operator_signoff: null, evidence_ref: null },
      availability_timeline: [],
    },
    catalog: {
      scopes: [{ name: 'openid', label: 'OpenID', description: 'Base', label_status: 'mapped' }],
      claims: [{ name: 'sub', scope_dependency: null, sensitivity: 'low' }],
      algorithms: [{ name: 'RS256', usage: 'id_token', status: 'active' }],
    },
    issuer_consistency: {
      status: 'pass', configured_issuer: 'https://sso.example/oidc', discovery_issuer: 'https://sso.example/oidc',
      public_base_url: 'https://sso.example', last_checked_at: '2026-06-28T10:00:00Z',
    },
    endpoint_consistency: [{ name: 'token', discovered_url: 'https://sso.example/oauth/token', expected_url: 'https://sso.example/oauth/token', status: 'pass' }],
  }
}

const snapshotRef = ref<OidcFoundationSnapshot | null>(snapshot())
const viewStateRef = ref<'loading' | 'unauthenticated' | 'forbidden' | 'error' | 'ready'>('ready')
const refreshMock = vi.fn<() => Promise<void>>(async () => {})

vi.mock('@/composables/useOidcFoundation', () => ({
  useOidcFoundation: () => ({
    snapshot: computed(() => snapshotRef.value),
    viewState: computed(() => viewStateRef.value),
    requestId: computed(() => null),
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
      return params ? val.replace(/\{(\w+)\}/gu, (_: string, k: string) => String(params[k] ?? '')) : val
    },
  }),
}))
mockNuxtImport('navigateTo', () => vi.fn<(...a: unknown[]) => Promise<void>>(async () => {}))
const Page = (await import('../oidc-foundation.vue')).default

beforeEach(() => {
  snapshotRef.value = snapshot()
  viewStateRef.value = 'ready'
})
afterEach(() => vi.clearAllMocks())

describe('oidc-foundation page', () => {
  it('renders all five panels through the admin shell', async () => {
    const w = await mountSuspended(Page)
    expect(w.find('[data-page="oidc-foundation"]').exists()).toBe(true)
    expect(w.find('[data-testid="oidc-discovery"]').exists()).toBe(true)
    expect(w.find('[data-testid="oidc-jwks"]').exists()).toBe(true)
    expect(w.find('[data-testid="oidc-availability"]').exists()).toBe(true)
    expect(w.find('[data-testid="oidc-consistency"]').exists()).toBe(true)
    expect(w.find('[data-testid="oidc-catalog"]').exists()).toBe(true)
    expect(w.text()).toContain('corr-abc')
  })

  it('renders the loading skeleton', async () => {
    snapshotRef.value = null
    viewStateRef.value = 'loading'
    const w = await mountSuspended(Page)
    expect(w.find('[data-testid="oidc-discovery"]').exists()).toBe(false)
  })

  it('renders the forbidden surface', async () => {
    snapshotRef.value = null
    viewStateRef.value = 'forbidden'
    const w = await mountSuspended(Page)
    expect(w.text()).toContain(enLocale.oidc.forbidden_title)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run app/pages/__tests__/oidc-foundation.page.nuxt.spec.ts`
Expected: FAIL — the stub renders nothing.

- [ ] **Step 3: Replace the `oidc` locale block (both files)**

Replace the existing `"oidc": { … }` block in `app/locales/en.json` with:

```json
  "oidc": {
    "eyebrow": "OIDC Foundation",
    "title": "Protocol health and evidence",
    "summary": "Read-only view of Discovery, JWKS, availability, catalog, and issuer/endpoint consistency. The backend remains the source of truth.",
    "signed_in_as": "Signed in as {name}",
    "loading": "Loading OIDC Foundation",
    "forbidden_title": "OIDC Foundation access denied",
    "error_title": "OIDC Foundation could not be loaded",
    "overview_checked_at": "Snapshot taken",
    "overview_correlation_id": "Correlation ID",
    "discovery_title": "Discovery metadata",
    "discovery_issuer": "Issuer",
    "discovery_authorization": "Authorization endpoint",
    "discovery_token": "Token endpoint",
    "discovery_jwks_uri": "JWKS URI",
    "discovery_userinfo": "Userinfo endpoint",
    "discovery_response_types": "Response types",
    "discovery_grant_types": "Grant types",
    "discovery_scopes": "Scopes",
    "discovery_claims": "Claims",
    "discovery_signing_algs": "ID token signing algorithms",
    "jwks_title": "JWKS public keys",
    "jwks_caption": "JWKS public key table",
    "jwks_kid": "Key ID",
    "jwks_alg": "Algorithm",
    "jwks_use": "Use",
    "jwks_status": "Status",
    "jwks_published": "Published",
    "jwks_rotated": "Rotated",
    "availability_title": "Endpoint availability",
    "availability_http": "HTTP status",
    "availability_latency": "Latency (ms)",
    "availability_last_checked": "Last checked",
    "availability_rotation_title": "JWKS rotation evidence",
    "availability_rotation_environment": "Environment",
    "availability_rotation_drill": "Latest drill",
    "availability_rotation_signoff": "Operator signoff",
    "availability_timeline_title": "Availability timeline",
    "consistency_title": "Consistency",
    "consistency_issuer_title": "Issuer consistency",
    "consistency_configured": "Configured issuer",
    "consistency_discovered": "Discovery issuer",
    "consistency_public_base": "Public base URL",
    "consistency_last_checked": "Last checked",
    "consistency_endpoint_title": "Endpoint consistency",
    "consistency_caption": "Endpoint consistency table",
    "consistency_name": "Endpoint",
    "consistency_discovered_url": "Discovered URL",
    "consistency_expected_url": "Expected URL",
    "consistency_status": "Status",
    "catalog_title": "Catalog",
    "catalog_scopes_title": "Scopes",
    "catalog_claims_title": "Claims",
    "catalog_algorithms_title": "Algorithms",
    "catalog_scope_name": "Scope",
    "catalog_scope_label": "Label",
    "catalog_scope_description": "Description",
    "catalog_scope_status": "Label status",
    "catalog_claim_name": "Claim",
    "catalog_claim_scope": "Scope dependency",
    "catalog_claim_sensitivity": "Sensitivity",
    "catalog_alg_name": "Algorithm",
    "catalog_alg_usage": "Usage",
    "catalog_alg_status": "Status",
    "catalog_caption_scopes": "Scope catalog table",
    "catalog_caption_claims": "Claim catalog table",
    "catalog_caption_algorithms": "Algorithm catalog table"
  },
```

Replace the existing `"oidc": { … }` block in `app/locales/id.json` with:

```json
  "oidc": {
    "eyebrow": "OIDC Foundation",
    "title": "Protocol health & evidence",
    "summary": "Tampilan read-only untuk Discovery, JWKS, availability, catalog, dan konsistensi issuer/endpoint. Backend tetap sumber kebenaran.",
    "signed_in_as": "Masuk sebagai {name}",
    "loading": "Memuat OIDC Foundation",
    "forbidden_title": "Akses OIDC Foundation ditolak",
    "error_title": "OIDC Foundation belum bisa dimuat",
    "overview_checked_at": "Snapshot diambil",
    "overview_correlation_id": "Correlation ID",
    "discovery_title": "Metadata discovery",
    "discovery_issuer": "Issuer",
    "discovery_authorization": "Authorization endpoint",
    "discovery_token": "Token endpoint",
    "discovery_jwks_uri": "JWKS URI",
    "discovery_userinfo": "Userinfo endpoint",
    "discovery_response_types": "Response types",
    "discovery_grant_types": "Grant types",
    "discovery_scopes": "Scopes",
    "discovery_claims": "Claims",
    "discovery_signing_algs": "Algoritma signing ID token",
    "jwks_title": "Kunci publik JWKS",
    "jwks_caption": "Tabel kunci publik JWKS",
    "jwks_kid": "Key ID",
    "jwks_alg": "Algoritma",
    "jwks_use": "Use",
    "jwks_status": "Status",
    "jwks_published": "Dipublish",
    "jwks_rotated": "Dirotasi",
    "availability_title": "Availability endpoint",
    "availability_http": "Status HTTP",
    "availability_latency": "Latency (ms)",
    "availability_last_checked": "Terakhir dicek",
    "availability_rotation_title": "Evidence rotasi JWKS",
    "availability_rotation_environment": "Environment",
    "availability_rotation_drill": "Drill terakhir",
    "availability_rotation_signoff": "Signoff operator",
    "availability_timeline_title": "Timeline availability",
    "consistency_title": "Konsistensi",
    "consistency_issuer_title": "Konsistensi issuer",
    "consistency_configured": "Issuer terkonfigurasi",
    "consistency_discovered": "Issuer discovery",
    "consistency_public_base": "Public base URL",
    "consistency_last_checked": "Terakhir dicek",
    "consistency_endpoint_title": "Konsistensi endpoint",
    "consistency_caption": "Tabel konsistensi endpoint",
    "consistency_name": "Endpoint",
    "consistency_discovered_url": "URL discovery",
    "consistency_expected_url": "URL diharapkan",
    "consistency_status": "Status",
    "catalog_title": "Catalog",
    "catalog_scopes_title": "Scopes",
    "catalog_claims_title": "Claims",
    "catalog_algorithms_title": "Algoritma",
    "catalog_scope_name": "Scope",
    "catalog_scope_label": "Label",
    "catalog_scope_description": "Deskripsi",
    "catalog_scope_status": "Status label",
    "catalog_claim_name": "Claim",
    "catalog_claim_scope": "Scope dependency",
    "catalog_claim_sensitivity": "Sensitivity",
    "catalog_alg_name": "Algoritma",
    "catalog_alg_usage": "Usage",
    "catalog_alg_status": "Status",
    "catalog_caption_scopes": "Tabel scope catalog",
    "catalog_caption_claims": "Tabel claim catalog",
    "catalog_caption_algorithms": "Tabel algorithm catalog"
  },
```

- [ ] **Step 4: Write the page**

```vue
<!-- app/pages/oidc-foundation.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import { useSessionStore } from '@/stores/session.store'
import { useI18n } from '@/composables/useI18n'
import { useOidcFoundation } from '@/composables/useOidcFoundation'
import OidcDiscoveryPanel, {
  type OidcDiscoveryLabels,
} from '@/components/oidc-foundation/OidcDiscoveryPanel.vue'
import OidcJwksPanel, { type OidcJwksLabels } from '@/components/oidc-foundation/OidcJwksPanel.vue'
import OidcCatalogPanel, {
  type OidcCatalogLabels,
} from '@/components/oidc-foundation/OidcCatalogPanel.vue'
import OidcAvailabilityPanel, {
  type OidcAvailabilityLabels,
} from '@/components/oidc-foundation/OidcAvailabilityPanel.vue'
import OidcConsistencyPanel, {
  type OidcConsistencyLabels,
} from '@/components/oidc-foundation/OidcConsistencyPanel.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiFolio from '@/components/ui/UiFolio.vue'

definePageMeta({
  name: 'admin.oidc-foundation',
  layout: 'admin',
  requiresAdmin: true,
  permissions: ['admin.dashboard.view'],
})

const { t } = useI18n()
const store = useSessionStore()

await useAsyncData('admin-oidc-foundation-principal', () => store.ensureSession())

const { snapshot, viewState, requestId, refresh } = useOidcFoundation()

const discoveryLabels = computed<OidcDiscoveryLabels>(() => ({
  title: t('oidc.discovery_title'),
  issuer: t('oidc.discovery_issuer'),
  authorization: t('oidc.discovery_authorization'),
  token: t('oidc.discovery_token'),
  jwksUri: t('oidc.discovery_jwks_uri'),
  userinfo: t('oidc.discovery_userinfo'),
  responseTypes: t('oidc.discovery_response_types'),
  grantTypes: t('oidc.discovery_grant_types'),
  scopes: t('oidc.discovery_scopes'),
  claims: t('oidc.discovery_claims'),
  signingAlgs: t('oidc.discovery_signing_algs'),
}))

const jwksLabels = computed<OidcJwksLabels>(() => ({
  title: t('oidc.jwks_title'),
  caption: t('oidc.jwks_caption'),
  kid: t('oidc.jwks_kid'),
  alg: t('oidc.jwks_alg'),
  use: t('oidc.jwks_use'),
  status: t('oidc.jwks_status'),
  published: t('oidc.jwks_published'),
  rotated: t('oidc.jwks_rotated'),
}))

const availabilityLabels = computed<OidcAvailabilityLabels>(() => ({
  title: t('oidc.availability_title'),
  httpStatus: t('oidc.availability_http'),
  latency: t('oidc.availability_latency'),
  lastChecked: t('oidc.availability_last_checked'),
  rotationTitle: t('oidc.availability_rotation_title'),
  rotationEnvironment: t('oidc.availability_rotation_environment'),
  rotationDrill: t('oidc.availability_rotation_drill'),
  rotationSignoff: t('oidc.availability_rotation_signoff'),
  timelineTitle: t('oidc.availability_timeline_title'),
}))

const consistencyLabels = computed<OidcConsistencyLabels>(() => ({
  title: t('oidc.consistency_title'),
  issuerTitle: t('oidc.consistency_issuer_title'),
  configured: t('oidc.consistency_configured'),
  discovered: t('oidc.consistency_discovered'),
  publicBase: t('oidc.consistency_public_base'),
  lastChecked: t('oidc.consistency_last_checked'),
  endpointTitle: t('oidc.consistency_endpoint_title'),
  caption: t('oidc.consistency_caption'),
  name: t('oidc.consistency_name'),
  discoveredUrl: t('oidc.consistency_discovered_url'),
  expectedUrl: t('oidc.consistency_expected_url'),
  status: t('oidc.consistency_status'),
}))

const catalogLabels = computed<OidcCatalogLabels>(() => ({
  title: t('oidc.catalog_title'),
  scopesTitle: t('oidc.catalog_scopes_title'),
  claimsTitle: t('oidc.catalog_claims_title'),
  algorithmsTitle: t('oidc.catalog_algorithms_title'),
  scopeName: t('oidc.catalog_scope_name'),
  scopeLabel: t('oidc.catalog_scope_label'),
  scopeDescription: t('oidc.catalog_scope_description'),
  scopeStatus: t('oidc.catalog_scope_status'),
  claimName: t('oidc.catalog_claim_name'),
  claimScope: t('oidc.catalog_claim_scope'),
  claimSensitivity: t('oidc.catalog_claim_sensitivity'),
  algName: t('oidc.catalog_alg_name'),
  algUsage: t('oidc.catalog_alg_usage'),
  algStatus: t('oidc.catalog_alg_status'),
  captionScopes: t('oidc.catalog_caption_scopes'),
  captionClaims: t('oidc.catalog_caption_claims'),
  captionAlgorithms: t('oidc.catalog_caption_algorithms'),
}))

async function onRefresh(): Promise<void> {
  await refresh()
}
</script>

<template>
  <section class="oidc" data-page="oidc-foundation" data-admin-shell>
    <header class="oidc__hero">
      <span class="oidc__eyebrow">{{ t('oidc.eyebrow') }}</span>
      <h1 class="oidc__title">{{ t('oidc.title') }}</h1>
      <p class="oidc__summary">{{ t('oidc.summary') }}</p>
      <p class="oidc__principal" data-principal-name>
        {{ t('oidc.signed_in_as', { name: store.principal?.display_name ?? '—' }) }}
      </p>
    </header>

    <UiSkeleton v-if="viewState === 'loading'" :rows="8" :label="t('oidc.loading')" />

    <UiStatusView
      v-else-if="viewState === 'forbidden'"
      tone="forbidden"
      :eyebrow="t('oidc.eyebrow')"
      :title="t('oidc.forbidden_title')"
      :description="t('common.forbidden_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="viewState === 'unauthenticated'"
      tone="step_up"
      :eyebrow="t('oidc.eyebrow')"
      :title="t('common.session_expired_title')"
      :description="t('common.session_expired_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="viewState === 'error'"
      tone="error"
      :eyebrow="t('oidc.eyebrow')"
      :title="t('oidc.error_title')"
      :description="t('common.error_loading_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    >
      <template #actions>
        <UiButton variant="secondary" size="sm" data-testid="oidc-refresh" @click="onRefresh">
          {{ t('common.btn_refresh') }}
        </UiButton>
      </template>
    </UiStatusView>

    <template v-else-if="snapshot">
      <div class="oidc__overview">
        <div>
          <span class="oidc__overview-label">{{ t('oidc.overview_checked_at') }}</span>
          <UiFolio :value="snapshot.checked_at" variant="timestamp" />
        </div>
        <div v-if="snapshot.correlation_id">
          <span class="oidc__overview-label">{{ t('oidc.overview_correlation_id') }}</span>
          <UiFolio :value="snapshot.correlation_id" variant="id" />
        </div>
      </div>

      <OidcDiscoveryPanel :discovery="snapshot.discovery" :labels="discoveryLabels" />
      <OidcJwksPanel :keys="snapshot.jwks.keys" :labels="jwksLabels" />
      <OidcAvailabilityPanel
        :availability="snapshot.availability"
        :evidence="snapshot.evidence"
        :labels="availabilityLabels"
      />
      <OidcConsistencyPanel
        :issuer-consistency="snapshot.issuer_consistency"
        :endpoint-consistency="snapshot.endpoint_consistency"
        :labels="consistencyLabels"
      />
      <OidcCatalogPanel :catalog="snapshot.catalog" :labels="catalogLabels" />
    </template>
  </section>
</template>

<style scoped>
.oidc {
  display: grid;
  gap: 20px;
  padding: 24px;
}
.oidc__hero {
  display: grid;
  gap: 6px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border);
}
.oidc__eyebrow {
  font: 600 0.6875rem/1 var(--font-sans);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.oidc__title {
  margin: 0;
  font: 600 1.5rem/1.2 var(--font-sans);
  letter-spacing: -0.02em;
  color: var(--fg);
}
.oidc__summary,
.oidc__principal {
  margin: 0;
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--fg-2);
}
.oidc__overview {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
}
.oidc__overview-label {
  display: block;
  font: 600 0.625rem/1.2 var(--font-sans);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fg-3);
  margin-bottom: 4px;
}
</style>
```

- [ ] **Step 5: Run the page test + route-map + parity**

Run: `./node_modules/.bin/vitest run app/pages/__tests__/oidc-foundation.page.nuxt.spec.ts app/pages/__tests__/route-map.spec.ts`
Expected: PASS (page 3 tests + route-map green).

Run the parity check:
```bash
node -e "const e=require('./app/locales/en.json'),i=require('./app/locales/id.json');const f=(o,p='')=>Object.entries(o).flatMap(([k,v])=>typeof v==='object'&&v?f(v,p+k+'.'):[p+k]);const ek=f(e).sort(),ik=f(i).sort();const d=ek.filter(k=>!ik.includes(k)).concat(ik.filter(k=>!ek.includes(k)));console.log('parity diff:',d); if(d.length)process.exit(1)"
```
Expected: `parity diff: []`.

Verify the FR marker is gone:
```bash
grep -rn "FR-001\|FR-005" app/locales/en.json app/locales/id.json app/pages/oidc-foundation.vue || echo "no FR marker"
```
Expected: `no FR marker`.

- [ ] **Step 6: Verify gates + commit**

Run: `./node_modules/.bin/oxlint . && ./node_modules/.bin/eslint app/pages/oidc-foundation.vue && npx vue-tsc --noEmit`

```bash
git add app/pages/oidc-foundation.vue app/locales/en.json app/locales/id.json app/pages/__tests__/oidc-foundation.page.nuxt.spec.ts
git commit -m "$(cat <<'EOF'
feat(sso-admin-frontend): Swiss OIDC foundation page (overview + five panels)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 15.8: SSR leak gate + deferred e2e + DoD

**Files:**
- Create: `test/fixtures/ssr-leak/server/routes/api/admin/oidc-foundation/index.get.ts`
- Modify: `test/ssr-token-leak.gate.spec.ts`
- Create: `e2e/oidc-foundation.spec.ts` (authored, DEFERRED — not run this phase)

**Interfaces:**
- Consumes the gate's existing `collectSecretLeaks`/`collectPiiShapeLeaks`/`extractPayload` helpers + the `$fetch`/`setup` harness.
- STRICT (no `allowSessionId`). The snapshot is all public OIDC metadata + health — no token/secret/private key/session id/gov-PII. `me.get` already grants `admin.dashboard.view` (no fixture-permission change).

- [ ] **Step 1: Write the fixture route**

```ts
// test/fixtures/ssr-leak/server/routes/api/admin/oidc-foundation/index.get.ts
// SSR token-leak fixture: a representative OIDC foundation snapshot so the §3.3 gate
// renders the page READY. All PUBLIC OIDC discovery metadata + operational health —
// issuer/endpoint URLs, JWKS PUBLIC-key ids (kid/alg/use/status — never private key
// material), scope/claim/algorithm catalog, availability metrics, opaque correlation
// id. No token, secret, session id, or PII-shaped digit run (no 10/16/18-digit run).
import { defineEventHandler } from 'h3'

export default defineEventHandler(() => ({
  checked_at: '2026-06-28T10:00:00Z',
  correlation_id: 'corr-oidc-sentinel',
  discovery: {
    issuer: 'https://sso.example/oidc',
    authorization_endpoint: 'https://sso.example/oauth/authorize',
    token_endpoint: 'https://sso.example/oauth/token',
    jwks_uri: 'https://sso.example/oauth/jwks',
    userinfo_endpoint: 'https://sso.example/oauth/userinfo',
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    scopes_supported: ['openid', 'profile', 'email'],
    claims_supported: ['sub', 'email', 'name'],
    id_token_signing_alg_values_supported: ['RS256'],
  },
  jwks: {
    keys: [
      { kid: 'key-sentinel-a', alg: 'RS256', use: 'sig', status: 'published', published_at: '2026-05-01T00:00:00Z', rotated_at: null },
    ],
  },
  availability: {
    discovery: { name: 'Discovery metadata', status: 'healthy', http_status: 200, latency_ms: 42, last_checked_at: '2026-06-28T10:00:00Z', evidence_ref: null },
    jwks: { name: 'JWKS public keys', status: 'healthy', http_status: 200, latency_ms: 31, last_checked_at: '2026-06-28T10:00:00Z', evidence_ref: null },
  },
  evidence: {
    jwks_rotation: { status: 'recorded', label: 'Rotation drill', environment: 'production', latest_drill_at: '2026-05-30T00:00:00Z', operator_signoff: 'ops-lead', evidence_ref: null },
    availability_timeline: [
      { status: 'available', label: 'Daily probe', checked_at: '2026-06-28T00:00:00Z', evidence_ref: null },
    ],
  },
  catalog: {
    scopes: [{ name: 'openid', label: 'OpenID', description: 'Base OIDC scope', label_status: 'mapped' }],
    claims: [{ name: 'sub', scope_dependency: null, sensitivity: 'low' }],
    algorithms: [{ name: 'RS256', usage: 'id_token', status: 'active' }],
  },
  issuer_consistency: {
    status: 'pass',
    configured_issuer: 'https://sso.example/oidc',
    discovery_issuer: 'https://sso.example/oidc',
    public_base_url: 'https://sso.example',
    last_checked_at: '2026-06-28T10:00:00Z',
  },
  endpoint_consistency: [
    { name: 'token', discovered_url: 'https://sso.example/oauth/token', expected_url: 'https://sso.example/oauth/token', status: 'pass' },
  ],
}))
```

- [ ] **Step 2: Add the gate fetch helper + assertions**

In `test/ssr-token-leak.gate.spec.ts`, add a `fetchOidcFoundation` helper next to `fetchProfile`:

```ts
function fetchOidcFoundation(): Promise<string> {
  // admin_locale=en so the status badges render the English labels.
  return $fetch('/oidc-foundation', { headers: { cookie: 'admin_locale=en' } })
}
```

Then add these three `it` blocks inside the `describe`, immediately before the `collectSecretLeaks is LIVE` negative-control test:

```ts
  it('renders the OIDC foundation snapshot server-side in its ready state', async () => {
    const html = await fetchOidcFoundation()
    expect(html).toContain('data-admin-shell')
    expect(html).toContain('data-page="oidc-foundation"')
    // the public discovery issuer + a JWKS key id render
    expect(html).toContain('https://sso.example/oidc')
    expect(html).toContain('key-sentinel-a')
  })

  it('does not leak token/secret/PII values into the oidc-foundation SSR HTML', async () => {
    // Strict — the snapshot is all public OIDC metadata + health; no token, secret,
    // private key, session id, or gov-PII. NO allowSessionId.
    const html = await fetchOidcFoundation()
    expect(collectSecretLeaks(html, 'oidc-foundation SSR HTML')).toEqual([])
  })

  it('does not leak token/secret/PII values into the oidc-foundation hydration payload', async () => {
    const html = await fetchOidcFoundation()
    const serialized = JSON.stringify(JSON.parse(extractPayload(html)))
    expect(collectSecretLeaks(serialized, 'oidc-foundation __NUXT__ payload')).toEqual([])
    expect(collectPiiShapeLeaks(serialized, 'oidc-foundation __NUXT__ payload')).toEqual([])
  })
```

- [ ] **Step 3: Write the deferred e2e spec**

```ts
// e2e/oidc-foundation.spec.ts
import { test, expect } from '@playwright/test'

// DEFERRED to Phase 18 cutover: playwright.config.ts is still legacy-SPA-wired
// (ports 5173/4173, no Nuxt build:web; Nuxt serves on 3000). Authored now against
// the shipped Nuxt routes so it becomes a real gate at cutover. Do NOT run as a
// gate this phase.
test('oidc-foundation page shows the protocol-health panels', async ({ page, context }) => {
  await context.addCookies([
    { name: 'admin_locale', value: 'en', url: 'http://localhost:3000' },
  ])
  await page.goto('/oidc-foundation')

  await expect(page.getByTestId('oidc-discovery')).toBeVisible()
  await expect(page.getByTestId('oidc-jwks')).toBeVisible()
  await expect(page.getByTestId('oidc-availability')).toBeVisible()
  await expect(page.getByTestId('oidc-consistency')).toBeVisible()
  await expect(page.getByTestId('oidc-catalog')).toBeVisible()
})
```

- [ ] **Step 4: Run the leak gate**

`test/globalSetup.ts` rebuilds the `ssr-leak` fixture layer on every fresh `vitest run`, so the new route is picked up automatically:

```bash
./node_modules/.bin/vitest run test/ssr-token-leak.gate.spec.ts
```
Expected: PASS — all prior gate tests + the 3 new oidc-foundation tests + the live negative control.

> Recovery note: if the gate fails with "no `__NUXT_DATA__`", a stale render, or the new route missing, a prior interrupted run may have left the build lock behind. Clear both lock and output, then re-run:
> ```bash
> rm -rf node_modules/.cache/sso-admin-e2e-build test/fixtures/ssr-leak/.output
> ./node_modules/.bin/vitest run test/ssr-token-leak.gate.spec.ts
> ```

- [ ] **Step 5: Full DoD gate**

```bash
./node_modules/.bin/oxlint .
./node_modules/.bin/eslint app/pages/oidc-foundation.vue app/components/oidc-foundation/*.vue
npx vue-tsc --noEmit
./node_modules/.bin/vitest run
npm run build
```
Expected: oxlint 0/0, eslint 0, typecheck 0, **full suite green**, build PASS, SSR leak gate green (now includes oidc-foundation).

- [ ] **Step 6: Commit**

```bash
git add test/fixtures/ssr-leak/server/routes/api/admin/oidc-foundation e2e/oidc-foundation.spec.ts test/ssr-token-leak.gate.spec.ts
git commit -m "$(cat <<'EOF'
test(sso-admin-frontend): STRICT oidc-foundation SSR leak gate + deferred e2e

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**1. Spec coverage** (`/oidc-foundation` → `pages/oidc-foundation.vue` → `admin.dashboard.view`, spec line 110; "Discovery, JWKS, availability, catalog, issuer + endpoint consistency"):
- Discovery metadata → 15.4. ✅ JWKS keys → 15.5. ✅ Availability + evidence → 15.6. ✅ Consistency (issuer + endpoint) → 15.6. ✅ Catalog (scopes/claims/algorithms) → 15.5. ✅
- DTO + tones → 15.1; api → 15.2; composable → 15.3; page compose + overview → 15.7. ✅
- `admin.dashboard.view` + `name: admin.oidc-foundation` preserved (route-map green); me.get already grants it. ✅
- STRICT SSR leak gate → 15.8. ✅
- FR-001–FR-005 traceability marker removed from the title (15.7). ✅

**2. Placeholder scan:** No `TBD`/`add appropriate`/`similar to`/`write tests for the above` — every step carries full code. ✅

**3. Type consistency:** The DTO types from 15.1 are consumed identically in 15.2/15.3/15.4/15.5/15.6/15.7. `OidcFoundationViewState` (5 states) consistent across 15.1/15.3/15.7. The five tone resolvers defined in 15.1 are used in 15.5 (`resolveScopeLabelTone` + `resolveJwksKeyTone`)/15.6 (`resolveAvailabilityTone`/`resolveEvidenceTone`/`resolveConsistencyTone`). `resolveEvidenceTone('recorded')` and `resolveJwksKeyTone('published')` cover the values the live backend actually emits. `oidcFoundationApi.getSnapshot` signature identical 15.2/15.3. `useOidcFoundation` return shape (snapshot/viewState/requestId/refresh) defined 15.3, consumed 15.7. Panel label types (`OidcDiscoveryLabels`/`OidcJwksLabels`/`OidcCatalogLabels`/`OidcAvailabilityLabels`/`OidcConsistencyLabels`) defined in their components (15.4–15.6), consumed in 15.7. Every `oidc.*` locale key the page references exists after the 15.7 block replacement. ✅

**Security invariants checklist (verify during execution):**
- The snapshot is all **public** OIDC metadata + health — no token/secret/**private key**/session id/gov-PII. STRICT leak gate (no `allowSessionId`). Fixture has no 10/16/18-digit run. ✅
- Page renders **zero** `error.message` (error view uses only static `oidc.error_title` + `common.*` + REF). ✅ by construction.
- **No destructive affordance** → zero `#E4002B` accent; `unavailable`/`mismatch`/`failed`/`missing` use `danger` *tone* on a status badge (shipped `resolveHealthTone` precedent). No gradient/shadow. ✅
- No proxy change; me.get unchanged (`admin.dashboard.view` already granted). ✅
- FR traceability marker stripped from the locale title. ✅
