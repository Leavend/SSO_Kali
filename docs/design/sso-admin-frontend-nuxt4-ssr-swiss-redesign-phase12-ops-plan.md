# Phase 12 — Ops (Readiness + Drill Evidence) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the admin **Ops** page (`/ops`) to Nuxt 4 SSR + the Swiss design system — a read-only operational cockpit showing backend **readiness** (database / redis / queue health) and a static **operational drill evidence** catalog (runbook + system-of-record links), with no token/secret/PII reaching SSR HTML or `__NUXT_DATA__`.

**Architecture:** Read-only, single-fetch domain (the simplest phase). The page calls `useOpsReadiness()` → `opsApi.getReadiness()` → `apiClient.get('/api/admin/ops/readiness')`. The BFF proxy already allow-lists that path and maps it to the backend `/ready` endpoint (no proxy change). **Crucial wrinkle:** the backend answers **HTTP 503 (not 200) when a dependency is down**, but the 503 body still carries the readiness breakdown — the service extracts that body and returns it as *data* (hydration-safe) so the operator sees *which* check failed, instead of a generic error. There are **no mutations, no privileged actions, no dialogs, and no danger affordances** on this page.

**Tech Stack:** Nuxt 4.4.8 (SSR), Vue 3.5 SFC, TypeScript strict, Vitest 4 + `@nuxt/test-utils` 4, the shipped Swiss DS (`UiStatusBadge`, `UiStatusView`, `UiSkeleton`, `UiButton`, `UiFolio`), `useAsyncData`, `apiClient`/`ApiError`.

## Global Constraints

- **Branch stays OFF `main`** until Phase 18 cutover. Commit only the listed task commits.
- **Commit trailer (verbatim):** `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **No traceability markers** (`OG#`/`UC###`/`FR###`/`BE-FR###` etc.) anywhere — names, comments, routes, tests, config, locale keys, test names. Use descriptive domain names.
- **No token / secret / raw-PII (NIK/NIP/NISN/birth_date) in SSR HTML or `__NUXT_DATA__`.** Tokens live only in the Nitro `event.context`. The §3.3 leak gate is the enforcement — ops uses the **STRICT** form (no `allowSessionId`): the readiness DTO carries no token/secret/session-id/gov-PII.
- **Swiss discipline:** hairline borders, no shadows, single Klein accent `#002FA7`; `#E4002B`/`--danger` only on destructive affordances + inline form-validation text. Status is **never colour-alone** — always tone + label via `UiStatusBadge`. Ops has **no** destructive affordance, so it renders **zero** `#E4002B` accent; `danger` *tone* on a status badge (a "down" health check) is allowed and matches the shipped `resolveHealthTone` precedent (Phase 10) and dashboard `locked/rejected → danger` (Phase 3).
- **i18n parity:** every key added to `en.json` must exist in `id.json` (and vice-versa). Run the parity check before each locale-touching commit. `t(key, params)` supports `{param}` interpolation.
- **Test env routing by filename:** `*.nuxt.spec.ts` / `*.page.nuxt.spec.ts` → nuxt env (`mountSuspended`/`mockNuxtImport`); other `*.spec.ts` → jsdom (`@vue/test-utils` `mount`). Pure-logic and dumb-component tests are jsdom; composable + page tests are nuxt-env.
- **oxlint:** every `vi.fn(...)` needs a type parameter; every `.toThrow(...)`/`rejects.toThrow(...)` needs a message argument. The controller verifies **both** oxlint AND eslint (`.vue` errors like `vue/no-ref-as-operand` are eslint-only).
- **DoD per task (controller-verified DIRECT, bypassing rtk cache):** `./node_modules/.bin/oxlint .` (0/0), `./node_modules/.bin/eslint <touched .vue>` (0), `npx vue-tsc --noEmit` typecheck (0), the task's vitest specs green, and for locale tasks the parity check 0/0. Final task adds full-suite + build + SSR leak gate.
- **e2e is DEFERRED to Phase 18** (playwright.config.ts is still legacy-SPA-wired). Author `e2e/ops.spec.ts` against the shipped Nuxt routes but do **not** run it as a gate this phase.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `app/types/ops.types.ts` | Narrowed readiness DTO (`OpsReadiness`, `OpsReadinessChecks`, `OpsQueueCheck`) + `OpsReadinessLabels` view type | 12.1 |
| `app/lib/ops/ops-view-state.ts` | Pure `resolveOpsViewState` + tone resolvers (`resolveReadinessTone`/`resolveCheckTone`/`resolveQueueTone`) | 12.1 |
| `app/lib/ops/ops-readiness.ts` | Pure `parseOpsReadiness` — validates + **narrows** raw `/ready` payload, strips `external_idps` and extra keys | 12.2 |
| `app/lib/ops/ops-drills.ts` | Static operational drill catalog (`OPS_DRILLS`, `OpsDrill`, `OPS_RUNBOOK_BASE_URL`, `runbookHref`) | 12.3 |
| `app/services/ops.api.ts` | `opsApi.getReadiness()` over `apiClient` — 503-with-body-aware | 12.4 |
| `app/composables/useOpsReadiness.ts` | SSR `useAsyncData` composable mapping view-state + requestId | 12.5 |
| `app/components/ops/OpsReadinessCard.vue` | Dumb readiness card (badges tone+label) | 12.6 |
| `app/components/ops/OpsDrillsList.vue` | Dumb drill catalog (external runbook links, `rel=noopener`) | 12.6 |
| `app/pages/ops.vue` | Compose all states + readiness card + drills (replaces the stub) | 12.7 |
| `app/locales/en.json` / `id.json` | `ops` block extension (drop dead `empty_*`, add readiness/drill keys) | 12.7 |
| `test/ssr-token-leak.gate.spec.ts` | STRICT ops leak assertions + `external_idps` strip canary | 12.8 |
| `test/fixtures/ssr-leak/server/routes/api/admin/ops/readiness/index.get.ts` | Ready-state fixture with an `external_idps` canary | 12.8 |
| `e2e/ops.spec.ts` | Deferred Playwright spec (authored, not run) | 12.8 |

**No change needed:** `server/utils/admin-proxy.ts` already allow-lists `GET /api/admin/ops/readiness` and maps it to backend `/ready`. `test/fixtures/ssr-leak/server/routes/api/admin/me.get.ts` already grants `admin.dashboard.view` (the ops permission) — no fixture-permission change.

**Backend contract (authoritative — `/ready` via `ReadinessController` → `InspectReadinessAction` → `ReadinessProbeService`):**
```jsonc
// 200 when ready, 503 when (database && redis) is false — body identical in shape
{
  "service": "sso-backend",
  "ready": true,                       // = checks.database && checks.redis
  "checks": {
    "database": true,                  // PLAIN boolean (not the legacy object union)
    "redis": true,                     // PLAIN boolean
    "queue": {                         // config-gated (readiness_queue_snapshot_enabled)
      "pending_jobs": 0,
      "failed_jobs": 0,
      "oldest_pending_age_seconds": null
    },
    "external_idps": { /* config-gated opaque per-IdP health map — STRIPPED at parse */ }
  }
}
```
The legacy SPA over-declared `signing_keys`, `timestamp`, and a `boolean | {object}` union for database/redis — those belong to the *different* `/health/ready` endpoint, not `/ready`. The narrowed DTO below reflects the real `/ready` shape (Phase-10 "real fields not over-declared legacy" precedent).

---

### Task 12.1: Readiness DTO + view-state + tone resolvers

**Files:**
- Create: `app/types/ops.types.ts`
- Create: `app/lib/ops/ops-view-state.ts`
- Test: `app/lib/ops/__tests__/ops-view-state.spec.ts`

**Interfaces:**
- Consumes: `StatusTone` from `@/lib/status-tone`; `ApiError` from `@/lib/api/api-client`.
- Produces:
  - `OpsQueueCheck = { readonly pending_jobs: number; readonly failed_jobs: number; readonly oldest_pending_age_seconds: number | null }`
  - `OpsReadinessChecks = { readonly database: boolean; readonly redis: boolean; readonly queue?: OpsQueueCheck }`
  - `OpsReadiness = { readonly service: string; readonly ready: boolean; readonly checks: OpsReadinessChecks }`
  - `OpsReadinessLabels` (10 string fields, below)
  - `OpsViewState = 'loading' | 'unauthenticated' | 'forbidden' | 'error' | 'ready'`
  - `resolveOpsViewState(args: ResolveOpsViewStateArgs): OpsViewState`
  - `resolveReadinessTone(ready: boolean): StatusTone`
  - `resolveCheckTone(ok: boolean): StatusTone`
  - `resolveQueueTone(queue: OpsQueueCheck): StatusTone`

- [ ] **Step 1: Write the failing test**

```ts
// app/lib/ops/__tests__/ops-view-state.spec.ts
import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api/api-client'
import {
  resolveOpsViewState,
  resolveReadinessTone,
  resolveCheckTone,
  resolveQueueTone,
} from '@/lib/ops/ops-view-state'
import type { OpsReadiness } from '@/types/ops.types'

const READY: OpsReadiness = {
  service: 'sso-backend',
  ready: true,
  checks: { database: true, redis: true },
}

describe('resolveOpsViewState', () => {
  it('is loading while pending with no readiness and no error', () => {
    expect(resolveOpsViewState({ pending: true, error: null, readiness: null })).toBe('loading')
  })

  it('is ready once readiness is present (even when degraded)', () => {
    expect(resolveOpsViewState({ pending: false, error: null, readiness: READY })).toBe('ready')
    expect(
      resolveOpsViewState({
        pending: false,
        error: null,
        readiness: { ...READY, ready: false },
      }),
    ).toBe('ready')
  })

  it('maps a 401 with no readiness to unauthenticated', () => {
    expect(
      resolveOpsViewState({ pending: false, error: new ApiError(401, 'no'), readiness: null }),
    ).toBe('unauthenticated')
  })

  it('maps a 403 with no readiness to forbidden', () => {
    expect(
      resolveOpsViewState({ pending: false, error: new ApiError(403, 'no'), readiness: null }),
    ).toBe('forbidden')
  })

  it('maps any other error with no readiness to error', () => {
    expect(
      resolveOpsViewState({ pending: false, error: new ApiError(502, 'boom'), readiness: null }),
    ).toBe('error')
    expect(
      resolveOpsViewState({ pending: false, error: new Error('net'), readiness: null }),
    ).toBe('error')
  })

  it('reads a plain hydration-shaped error (statusCode) when ApiError did not survive SSR', () => {
    expect(
      resolveOpsViewState({ pending: false, error: { statusCode: 403 }, readiness: null }),
    ).toBe('forbidden')
  })
})

describe('readiness tone resolvers', () => {
  it('overall: ready -> success, degraded -> danger', () => {
    expect(resolveReadinessTone(true)).toBe('success')
    expect(resolveReadinessTone(false)).toBe('danger')
  })

  it('check: ok -> success, down -> danger', () => {
    expect(resolveCheckTone(true)).toBe('success')
    expect(resolveCheckTone(false)).toBe('danger')
  })

  it('queue: failed > 0 -> danger; pending > 0 -> warning; otherwise success', () => {
    expect(
      resolveQueueTone({ pending_jobs: 0, failed_jobs: 3, oldest_pending_age_seconds: 5 }),
    ).toBe('danger')
    expect(
      resolveQueueTone({ pending_jobs: 4, failed_jobs: 0, oldest_pending_age_seconds: 5 }),
    ).toBe('warning')
    expect(
      resolveQueueTone({ pending_jobs: 0, failed_jobs: 0, oldest_pending_age_seconds: null }),
    ).toBe('success')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run app/lib/ops/__tests__/ops-view-state.spec.ts`
Expected: FAIL — cannot resolve `@/lib/ops/ops-view-state` / `@/types/ops.types`.

- [ ] **Step 3: Write the DTO**

```ts
// app/types/ops.types.ts

/** Queue health snapshot (config-gated; present only when the backend enables it). */
export type OpsQueueCheck = {
  readonly pending_jobs: number
  readonly failed_jobs: number
  readonly oldest_pending_age_seconds: number | null
}

/**
 * The NARROWED `/ready` checks. database/redis are plain booleans (the real
 * `/ready` shape — the legacy `boolean | {object}` union belongs to the separate
 * `/health/ready` endpoint). The config-gated `external_idps` map is intentionally
 * absent: it is stripped at the parse boundary (see `parseOpsReadiness`) so no IdP
 * endpoint config can hydrate into `__NUXT_DATA__`.
 */
export type OpsReadinessChecks = {
  readonly database: boolean
  readonly redis: boolean
  readonly queue?: OpsQueueCheck
}

export type OpsReadiness = {
  readonly service: string
  readonly ready: boolean
  readonly checks: OpsReadinessChecks
}

/** Display labels passed into the dumb readiness card (page owns i18n). */
export type OpsReadinessLabels = {
  readonly ready: string
  readonly degraded: string
  readonly database: string
  readonly redis: string
  readonly queue: string
  readonly ok: string
  readonly down: string
  readonly pending: string
  readonly failed: string
  readonly oldest: string
}
```

- [ ] **Step 4: Write the view-state + tone resolvers**

```ts
// app/lib/ops/ops-view-state.ts
import { ApiError } from '@/lib/api/api-client'
import type { StatusTone } from '@/lib/status-tone'
import type { OpsQueueCheck, OpsReadiness } from '@/types/ops.types'

export type OpsViewState = 'loading' | 'unauthenticated' | 'forbidden' | 'error' | 'ready'

export type ResolveOpsViewStateArgs = {
  // `pending` is part of the args for call-site uniformity with the other domain
  // composables; the readiness page has no idle/empty state, so it is unused here.
  readonly pending: boolean
  readonly error: unknown
  readonly readiness: OpsReadiness | null
}

// Security boundary: an error with NO readiness must surface the real
// auth/permission state, never be hidden. There is no "stale snapshot" path —
// readiness is a single fetch with no background refresh-with-data semantics.
export function resolveOpsViewState({ error, readiness }: ResolveOpsViewStateArgs): OpsViewState {
  if (error && !readiness) {
    const status = errorStatus(error)
    if (status === 401) return 'unauthenticated'
    if (status === 403) return 'forbidden'
    return 'error'
  }
  if (readiness) return 'ready'
  return 'loading'
}

// "down" / "degraded" is a genuinely critical state, so it earns the danger
// tone (matches the shipped external-idps `resolveHealthTone` and dashboard
// `locked/rejected -> danger`). This is the status-badge tone palette, NOT the
// reserved-for-destructive `#E4002B` accent.
export function resolveReadinessTone(ready: boolean): StatusTone {
  return ready ? 'success' : 'danger'
}

export function resolveCheckTone(ok: boolean): StatusTone {
  return ok ? 'success' : 'danger'
}

export function resolveQueueTone(queue: OpsQueueCheck): StatusTone {
  if (queue.failed_jobs > 0) return 'danger'
  if (queue.pending_jobs > 0) return 'warning'
  return 'success'
}

// Hydration-safe: a custom ApiError instance does not survive `useAsyncData`'s
// SSR error serialization, so also read the plain `{ statusCode | status }` shape.
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

Run: `./node_modules/.bin/vitest run app/lib/ops/__tests__/ops-view-state.spec.ts`
Expected: PASS (10 assertions across 2 describes).

- [ ] **Step 6: Verify gates + commit**

Run: `./node_modules/.bin/oxlint . && npx vue-tsc --noEmit`
Expected: oxlint 0/0, typecheck 0.

```bash
git add app/types/ops.types.ts app/lib/ops/ops-view-state.ts app/lib/ops/__tests__/ops-view-state.spec.ts
git commit -m "$(cat <<'EOF'
feat(sso-admin-frontend): ops readiness DTO + view-state + tone resolvers

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 12.2: Readiness parser (validate + narrow + strip)

**Files:**
- Create: `app/lib/ops/ops-readiness.ts`
- Test: `app/lib/ops/__tests__/ops-readiness.spec.ts`

**Interfaces:**
- Consumes: `OpsReadiness`, `OpsQueueCheck` from `@/types/ops.types`.
- Produces: `parseOpsReadiness(payload: unknown): OpsReadiness | null` — returns a **fresh narrowed literal** ({service, ready, checks:{database, redis, queue?}}) when the payload is a valid readiness response, else `null`. Drops `external_idps` and any other extra keys.

- [ ] **Step 1: Write the failing test**

```ts
// app/lib/ops/__tests__/ops-readiness.spec.ts
import { describe, expect, it } from 'vitest'
import { parseOpsReadiness } from '@/lib/ops/ops-readiness'

describe('parseOpsReadiness', () => {
  it('narrows a valid ready payload and strips external_idps + extra keys', () => {
    const raw = {
      service: 'sso-backend',
      ready: true,
      checks: {
        database: true,
        redis: true,
        queue: { pending_jobs: 1, failed_jobs: 0, oldest_pending_age_seconds: 12 },
        external_idps: { primary: { endpoint: 'https://idp.example/oidc' } },
      },
      extra: 'ignored',
    }
    const parsed = parseOpsReadiness(raw)
    expect(parsed).toEqual({
      service: 'sso-backend',
      ready: true,
      checks: {
        database: true,
        redis: true,
        queue: { pending_jobs: 1, failed_jobs: 0, oldest_pending_age_seconds: 12 },
      },
    })
    // external_idps must NOT survive (proven structurally, not just by toEqual).
    expect('external_idps' in (parsed as { checks: Record<string, unknown> }).checks).toBe(false)
  })

  it('keeps a degraded (ready:false) payload', () => {
    const parsed = parseOpsReadiness({
      service: 'sso-backend',
      ready: false,
      checks: { database: false, redis: true },
    })
    expect(parsed).not.toBeNull()
    expect(parsed?.ready).toBe(false)
    expect(parsed?.checks.queue).toBeUndefined()
  })

  it('coerces a missing/invalid oldest age to null and drops a malformed queue', () => {
    const ok = parseOpsReadiness({
      service: 'x',
      ready: true,
      checks: { database: true, redis: true, queue: { pending_jobs: 2, failed_jobs: 1 } },
    })
    expect(ok?.checks.queue).toEqual({
      pending_jobs: 2,
      failed_jobs: 1,
      oldest_pending_age_seconds: null,
    })

    const dropped = parseOpsReadiness({
      service: 'x',
      ready: true,
      checks: { database: true, redis: true, queue: { pending_jobs: 'nope' } },
    })
    expect(dropped?.checks.queue).toBeUndefined()
  })

  it('returns null for non-readiness shapes', () => {
    expect(parseOpsReadiness(null)).toBeNull()
    expect(parseOpsReadiness('nope')).toBeNull()
    expect(parseOpsReadiness({ service: 'x', ready: true })).toBeNull() // no checks
    expect(parseOpsReadiness({ service: 'x', ready: 'yes', checks: {} })).toBeNull() // ready not bool
    expect(
      parseOpsReadiness({ service: 'x', ready: true, checks: { database: 1, redis: true } }),
    ).toBeNull() // database not bool
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run app/lib/ops/__tests__/ops-readiness.spec.ts`
Expected: FAIL — cannot resolve `@/lib/ops/ops-readiness`.

- [ ] **Step 3: Write the parser**

```ts
// app/lib/ops/ops-readiness.ts
import type { OpsQueueCheck, OpsReadiness } from '@/types/ops.types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseQueue(value: unknown): OpsQueueCheck | undefined {
  if (!isRecord(value)) return undefined
  if (typeof value.pending_jobs !== 'number' || typeof value.failed_jobs !== 'number') {
    return undefined
  }
  const oldest = value.oldest_pending_age_seconds
  return {
    pending_jobs: value.pending_jobs,
    failed_jobs: value.failed_jobs,
    oldest_pending_age_seconds: typeof oldest === 'number' ? oldest : null,
  }
}

/**
 * Validates + NARROWS the raw `/ready` payload to the display DTO. Returns null
 * when the shape is not a readiness response (caller then surfaces an error).
 *
 * SECURITY: builds a FRESH literal carrying ONLY {service, ready, checks:
 * {database, redis, queue?}}. Any extra backend keys — notably the config-gated
 * `external_idps` health map, which can hold IdP endpoint config — are dropped
 * here and never reach the composable, the page, or `__NUXT_DATA__`.
 */
export function parseOpsReadiness(payload: unknown): OpsReadiness | null {
  if (!isRecord(payload)) return null
  const { service, ready, checks } = payload
  if (typeof service !== 'string' || typeof ready !== 'boolean' || !isRecord(checks)) {
    return null
  }
  if (typeof checks.database !== 'boolean' || typeof checks.redis !== 'boolean') {
    return null
  }
  const queue = parseQueue(checks.queue)
  return {
    service,
    ready,
    checks: {
      database: checks.database,
      redis: checks.redis,
      ...(queue ? { queue } : {}),
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run app/lib/ops/__tests__/ops-readiness.spec.ts`
Expected: PASS.

- [ ] **Step 5: Verify gates + commit**

Run: `./node_modules/.bin/oxlint . && npx vue-tsc --noEmit`

```bash
git add app/lib/ops/ops-readiness.ts app/lib/ops/__tests__/ops-readiness.spec.ts
git commit -m "$(cat <<'EOF'
feat(sso-admin-frontend): ops readiness parser (validate + narrow, strip external_idps)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 12.3: Operational drill evidence catalog

**Files:**
- Create: `app/lib/ops/ops-drills.ts`
- Test: `app/lib/ops/__tests__/ops-drills.spec.ts`

**Interfaces:**
- Produces:
  - `OPS_RUNBOOK_BASE_URL: string`
  - `OpsDrill = { readonly key: string; readonly title: string; readonly summary: string; readonly systemOfRecord: string; readonly runbookPath: string; readonly evidenceRef?: string }`
  - `OPS_DRILLS: readonly OpsDrill[]`
  - `runbookHref(runbookPath: string): string` → `${OPS_RUNBOOK_BASE_URL}/${runbookPath}`

- [ ] **Step 1: Write the failing test**

```ts
// app/lib/ops/__tests__/ops-drills.spec.ts
import { describe, expect, it } from 'vitest'
import { OPS_DRILLS, OPS_RUNBOOK_BASE_URL, runbookHref } from '@/lib/ops/ops-drills'

describe('ops drills catalog', () => {
  it('is non-empty with unique stable keys', () => {
    expect(OPS_DRILLS.length).toBeGreaterThan(0)
    const keys = OPS_DRILLS.map((d) => d.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('every drill carries the required reference fields', () => {
    for (const drill of OPS_DRILLS) {
      expect(drill.title.length).toBeGreaterThan(0)
      expect(drill.summary.length).toBeGreaterThan(0)
      expect(drill.systemOfRecord.length).toBeGreaterThan(0)
      expect(drill.runbookPath.length).toBeGreaterThan(0)
    }
  })

  it('builds an absolute runbook URL from a repo-relative path', () => {
    expect(runbookHref('docs/runbooks/x.md')).toBe(`${OPS_RUNBOOK_BASE_URL}/docs/runbooks/x.md`)
  })

  it('carries no secret-shaped content', () => {
    const blob = JSON.stringify(OPS_DRILLS)
    expect(blob).not.toMatch(/client_secret|plaintext_secret|access_token/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run app/lib/ops/__tests__/ops-drills.spec.ts`
Expected: FAIL — cannot resolve `@/lib/ops/ops-drills`.

- [ ] **Step 3: Write the catalog**

```ts
// app/lib/ops/ops-drills.ts

/**
 * Operational drill evidence catalog.
 *
 * The SSO backend admin contract intentionally does NOT serve drill evidence:
 * JWKS rotation, backup/restore, DR failover, incident response, and SIEM-sink
 * verification are exercised through CI workflows and ops runbooks, which are the
 * systems of record. Coupling the auth backend to CI-artifact storage would be
 * wrong layering, so this page surfaces the real runbook references instead.
 *
 * ponytail: drill content is operator-facing technical REFERENCE (file paths, CI
 * workflow names) — inherently non-localized identifiers, not UI chrome — so it
 * lives as a data module rather than i18n keys. Update the catalog when a runbook
 * moves.
 */
export const OPS_RUNBOOK_BASE_URL = 'https://github.com/Leavend/SSO_Kali/blob/main'

export type OpsDrill = {
  /** Stable key for list rendering + testids. */
  readonly key: string
  /** Human-readable drill name. */
  readonly title: string
  /** What the drill verifies, in operator terms. */
  readonly summary: string
  /** Where the authoritative evidence is produced (CI workflow / smoke scripts). */
  readonly systemOfRecord: string
  /** Repo-relative path to the runbook document of record. */
  readonly runbookPath: string
  /** Repo-relative path to the dated evidence pack, when one exists. */
  readonly evidenceRef?: string
}

export const OPS_DRILLS: readonly OpsDrill[] = [
  {
    key: 'jwks-rotation',
    title: 'JWKS rotation drill',
    summary:
      'Rotate the signing key with zero downtime: the new key publishes to JWKS while the previous key stays valid through the token-verification grace window.',
    systemOfRecord: 'CI workflow: .github/workflows/jwks-rotation-simulation.yml',
    runbookPath: 'docs/security/jwks-caching-rotation-runbook.md',
    evidenceRef: 'docs/ops/evidence/jwks-rotation-2026-05-30.md',
  },
  {
    key: 'discovery-jwks-availability',
    title: 'Discovery / JWKS availability drill',
    summary:
      'SLI smoke for the OIDC discovery and JWKS endpoints (latency + availability), run against production.',
    systemOfRecord:
      'Smoke probes: scripts/sso-backend-oidc-production-smoke.sh, scripts/sso-backend-oidc-metadata-vps-latency-probe.sh',
    runbookPath: 'docs/runbooks/on-call-observability-runbook.md',
  },
  {
    key: 'backup-restore',
    title: 'Backup restore drill',
    summary:
      'Restore the database/state from the latest backup and reconcile the result; evidence is collected in the dated evidence pack.',
    systemOfRecord: 'CI workflow: .github/workflows/backup-restore-drill.yml',
    runbookPath: 'docs/runbooks/backup-restore-drill-runbook.md',
    evidenceRef: 'docs/ops/evidence/backup-restore-2026-05-30.md',
  },
  {
    key: 'dr-failover',
    title: 'DR failover drill',
    summary:
      'Fail over / roll back the VPS coexistence pair with a zero-downtime signoff before and after cutover.',
    systemOfRecord:
      'CI workflows: .github/workflows/rollback.yml, .github/workflows/vps-maintenance.yml',
    runbookPath: 'docs/runbooks/rollback-runbook-vps-coexistence.md',
    evidenceRef: 'docs/ops/evidence/incident-dr-failover-2026-05-30.md',
  },
  {
    key: 'incident-runbook',
    title: 'Incident runbook evidence',
    summary:
      'On-call routing, severity matrix, and observability package for SSO control-plane incident response.',
    systemOfRecord: 'On-call rotation + observability package',
    runbookPath: 'docs/runbooks/on-call-observability-runbook.md',
    evidenceRef: 'docs/ops/evidence/incident-dr-failover-2026-05-30.md',
  },
  {
    key: 'siem-sink',
    title: 'SIEM sink verification',
    summary:
      'Verify audit-log forwarding to the observability / SIEM sink; in-app evidence is available via the export on the Audit Compliance page.',
    systemOfRecord: 'Observability package + audit export (Audit Compliance)',
    runbookPath: 'docs/runbooks/on-call-observability-runbook.md',
    evidenceRef: 'docs/ops/evidence/siem-sink-2026-05-30.md',
  },
]

/** Builds an absolute, browser-resolvable runbook URL from a repo-relative path. */
export function runbookHref(runbookPath: string): string {
  return `${OPS_RUNBOOK_BASE_URL}/${runbookPath}`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run app/lib/ops/__tests__/ops-drills.spec.ts`
Expected: PASS.

- [ ] **Step 5: Verify gates + commit**

Run: `./node_modules/.bin/oxlint . && npx vue-tsc --noEmit`

```bash
git add app/lib/ops/ops-drills.ts app/lib/ops/__tests__/ops-drills.spec.ts
git commit -m "$(cat <<'EOF'
feat(sso-admin-frontend): ops operational drill evidence catalog + runbook href

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 12.4: Ops API service (503-with-body aware)

**Files:**
- Create: `app/services/ops.api.ts`
- Test: `app/services/__tests__/ops.api.spec.ts`

**Interfaces:**
- Consumes: `apiClient`, `ApiError` from `@/lib/api/api-client`; `parseOpsReadiness` from `@/lib/ops/ops-readiness`; `OpsReadiness` from `@/types/ops.types`.
- Produces: `opsApi.getReadiness(): Promise<OpsReadiness>` — resolves with readiness on **200** AND **503-with-valid-body**; throws on 401/403/other and on a 200/503 with an unparseable body (the latter as `ApiError(502, ..., 'invalid_upstream_response')`).
- **No proxy change** — `GET /api/admin/ops/readiness` is already allow-listed and mapped to backend `/ready` in `server/utils/admin-proxy.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// app/services/__tests__/ops.api.spec.ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiClient } from '@/lib/api/api-client'
import { opsApi } from '@/services/ops.api'

const READY = {
  service: 'sso-backend',
  ready: true,
  checks: {
    database: true,
    redis: true,
    queue: { pending_jobs: 0, failed_jobs: 0, oldest_pending_age_seconds: null },
    external_idps: { primary: { endpoint: 'https://idp.example/oidc' } },
  },
}

afterEach(() => vi.restoreAllMocks())

describe('opsApi.getReadiness', () => {
  it('GETs the readiness path and returns the narrowed DTO (external_idps stripped)', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue(READY as never)
    const result = await opsApi.getReadiness()
    expect(get).toHaveBeenCalledWith('/api/admin/ops/readiness')
    expect(result.service).toBe('sso-backend')
    expect(result.ready).toBe(true)
    expect('external_idps' in result.checks).toBe(false)
  })

  it('surfaces the DEGRADED readiness from a 503 body instead of throwing', async () => {
    const body = { service: 'sso-backend', ready: false, checks: { database: false, redis: true } }
    vi.spyOn(apiClient, 'get').mockRejectedValue(
      new ApiError(503, 'service unavailable', 'service_unavailable', body),
    )
    const result = await opsApi.getReadiness()
    expect(result.ready).toBe(false)
    expect(result.checks.database).toBe(false)
  })

  it('rethrows a 503 whose body is not a readiness shape', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue(new ApiError(503, 'down', 'x', { nope: true }))
    await expect(opsApi.getReadiness()).rejects.toThrow('down')
  })

  it('throws invalid_upstream_response when a 200 body is not a readiness shape', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ nope: true } as never)
    await expect(opsApi.getReadiness()).rejects.toMatchObject({ status: 502 })
  })

  it('rethrows auth errors (401/403) untouched', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue(new ApiError(403, 'forbidden'))
    await expect(opsApi.getReadiness()).rejects.toThrow('forbidden')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run app/services/__tests__/ops.api.spec.ts`
Expected: FAIL — cannot resolve `@/services/ops.api`.

- [ ] **Step 3: Write the service**

```ts
// app/services/ops.api.ts
import { ApiError, apiClient } from '@/lib/api/api-client'
import { parseOpsReadiness } from '@/lib/ops/ops-readiness'
import type { OpsReadiness } from '@/types/ops.types'

export const opsApi = {
  /**
   * GET /api/admin/ops/readiness — the BFF proxies this to the backend `/ready`.
   *
   * The backend answers 200 when ready and **503 when a dependency is down**, but
   * the 503 body still carries the readiness breakdown. We surface that degraded
   * readiness (so the operator sees WHICH check failed) rather than a generic
   * error. Only genuine auth/transport failures (401/403/other) propagate. A 503
   * whose body is NOT a readiness shape is treated as a real outage and rethrown.
   *
   * `error.payload` is read here, server-side inside the `useAsyncData` handler,
   * where the ApiError is a live instance — the parsed readiness is then returned
   * as DATA, which serializes cleanly into the hydration payload (an ApiError's
   * custom `.payload` field would NOT survive SSR error serialization).
   */
  async getReadiness(): Promise<OpsReadiness> {
    let body: unknown
    try {
      body = await apiClient.get<unknown>('/api/admin/ops/readiness')
    } catch (error) {
      if (error instanceof ApiError && error.status === 503) {
        const degraded = parseOpsReadiness(error.payload)
        if (degraded) return degraded
      }
      throw error
    }
    const parsed = parseOpsReadiness(body)
    if (parsed) return parsed
    throw new ApiError(502, 'Invalid readiness response', 'invalid_upstream_response', body)
  },
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run app/services/__tests__/ops.api.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Verify gates + commit**

Run: `./node_modules/.bin/oxlint . && npx vue-tsc --noEmit`

```bash
git add app/services/ops.api.ts app/services/__tests__/ops.api.spec.ts
git commit -m "$(cat <<'EOF'
feat(sso-admin-frontend): ops.api getReadiness (surfaces degraded readiness from 503 body)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 12.5: `useOpsReadiness` SSR composable

**Files:**
- Create: `app/composables/useOpsReadiness.ts`
- Test: `app/composables/__tests__/useOpsReadiness.nuxt.spec.ts`

**Interfaces:**
- Consumes: `useAsyncData` (Nuxt auto-import); `opsApi.getReadiness` from `@/services/ops.api`; `resolveOpsViewState`/`OpsViewState` from `@/lib/ops/ops-view-state`; `ApiError`/`getLastRequestId` from `@/lib/api/api-client`; `OpsReadiness` from `@/types/ops.types`.
- Produces: `useOpsReadiness(): UseOpsReadinessReturn` where
  `UseOpsReadinessReturn = { readonly readiness: ComputedRef<OpsReadiness | null>; readonly viewState: ComputedRef<OpsViewState>; readonly requestId: ComputedRef<string | null>; readonly refresh: () => Promise<void> }`.

- [ ] **Step 1: Write the failing test** (mirrors the shipped `useIpAccessRules.nuxt.spec.ts` idiom — mock the service, drive `useAsyncData` refs)

```ts
// app/composables/__tests__/useOpsReadiness.nuxt.spec.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { ApiError } from '@/lib/api/api-client'
import type { OpsReadiness } from '@/types/ops.types'

const getReadinessMock = vi.fn<() => Promise<unknown>>()
vi.mock('@/services/ops.api', () => ({ opsApi: { getReadiness: getReadinessMock } }))

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

const { useOpsReadiness } = await import('../useOpsReadiness')

const READY: OpsReadiness = {
  service: 'sso-backend',
  ready: true,
  checks: { database: true, redis: true },
}

beforeEach(() => {
  dataRef.value = null
  pendingRef.value = false
  errorRef.value = null
  getReadinessMock.mockReset()
  getReadinessMock.mockResolvedValue(READY)
})
afterEach(() => vi.clearAllMocks())

describe('useOpsReadiness', () => {
  it('fetches readiness once', () => {
    useOpsReadiness()
    expect(getReadinessMock).toHaveBeenCalledTimes(1)
  })

  it('maps loading then ready', () => {
    const r = useOpsReadiness()
    pendingRef.value = true
    expect(r.viewState.value).toBe('loading')
    pendingRef.value = false
    dataRef.value = READY
    expect(r.viewState.value).toBe('ready')
    expect(r.readiness.value).toEqual(READY)
  })

  it('maps 401 -> unauthenticated and 403 -> forbidden when no readiness', () => {
    const r = useOpsReadiness()
    errorRef.value = new ApiError(401, 'no')
    expect(r.viewState.value).toBe('unauthenticated')
    errorRef.value = new ApiError(403, 'no')
    expect(r.viewState.value).toBe('forbidden')
  })

  it('maps any other error to error when no readiness', () => {
    const r = useOpsReadiness()
    errorRef.value = new ApiError(502, 'boom')
    expect(r.viewState.value).toBe('error')
  })

  it('surfaces the ApiError requestId', () => {
    const r = useOpsReadiness()
    errorRef.value = new ApiError(403, 'no', undefined, {}, 'req-ops')
    expect(r.requestId.value).toBe('req-ops')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run app/composables/__tests__/useOpsReadiness.nuxt.spec.ts`
Expected: FAIL — cannot resolve `../useOpsReadiness`.

- [ ] **Step 3: Write the composable**

```ts
// app/composables/useOpsReadiness.ts
import { computed, toRaw, type ComputedRef } from 'vue'
import { ApiError, getLastRequestId } from '@/lib/api/api-client'
import { opsApi } from '@/services/ops.api'
import { resolveOpsViewState, type OpsViewState } from '@/lib/ops/ops-view-state'
import type { OpsReadiness } from '@/types/ops.types'

export type UseOpsReadinessReturn = {
  readonly readiness: ComputedRef<OpsReadiness | null>
  readonly viewState: ComputedRef<OpsViewState>
  readonly requestId: ComputedRef<string | null>
  readonly refresh: () => Promise<void>
}

export function useOpsReadiness(): UseOpsReadinessReturn {
  // Runs during SSR so the narrowed readiness resolves server-side and hydrates
  // into the payload (DTO only — service name, booleans, small queue counts). The
  // access token stays in the Nitro event.context and never reaches the page.
  const { data, pending, error, refresh } = useAsyncData<OpsReadiness>(
    'admin-ops-readiness',
    () => opsApi.getReadiness(),
  )

  // toRaw mirrors the read-only single-fetch twin `useDashboardSummary`: the
  // narrowed DTO is display-only, so callers receive the plain object (identity
  // comparisons / deep picks behave as expected, no reactive proxy wrapper).
  const readiness = computed<OpsReadiness | null>(() =>
    data.value != null ? toRaw(data.value) : null,
  )

  const viewState = computed<OpsViewState>(() =>
    resolveOpsViewState({
      pending: pending.value,
      error: error.value,
      readiness: readiness.value,
    }),
  )

  const requestId = computed<string | null>(() =>
    error.value instanceof ApiError
      ? (error.value.requestId ?? getLastRequestId())
      : getLastRequestId(),
  )

  return {
    readiness,
    viewState,
    requestId,
    refresh: async () => {
      await refresh()
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run app/composables/__tests__/useOpsReadiness.nuxt.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Verify gates + commit**

Run: `./node_modules/.bin/oxlint . && npx vue-tsc --noEmit`

```bash
git add app/composables/useOpsReadiness.ts app/composables/__tests__/useOpsReadiness.nuxt.spec.ts
git commit -m "$(cat <<'EOF'
feat(sso-admin-frontend): useOpsReadiness SSR composable

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 12.6: Ops presentational components (readiness card + drills list)

**Files:**
- Create: `app/components/ops/OpsReadinessCard.vue`
- Create: `app/components/ops/OpsDrillsList.vue`
- Test: `app/components/ops/__tests__/OpsReadinessCard.spec.ts`
- Test: `app/components/ops/__tests__/OpsDrillsList.spec.ts`

**Interfaces:**
- `OpsReadinessCard` props: `{ readonly readiness: OpsReadiness; readonly labels: OpsReadinessLabels }`. Reuses `UiStatusBadge`, `UiFolio`, and the 12.1 tone resolvers. Renders the overall status badge (`ops-readiness-status`), per-check badges (`ops-check-database`, `ops-check-redis`, `ops-check-queue` — queue row only when present). No i18n, no fetch.
- `OpsDrillsList` props: `{ readonly drills: readonly OpsDrill[]; readonly runbookCtaLabel: string; readonly evidenceCtaLabel: string; readonly systemOfRecordLabel: string }`. Imports `runbookHref` + `OpsDrill` from `@/lib/ops/ops-drills`. Renders external links with `target="_blank" rel="noopener noreferrer"`; evidence link only when `evidenceRef` is set.

- [ ] **Step 1: Write the failing tests**

```ts
// app/components/ops/__tests__/OpsReadinessCard.spec.ts
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import OpsReadinessCard from '@/components/ops/OpsReadinessCard.vue'
import type { OpsReadiness, OpsReadinessLabels } from '@/types/ops.types'

const LABELS: OpsReadinessLabels = {
  ready: 'Ready',
  degraded: 'Degraded',
  database: 'Database',
  redis: 'Redis',
  queue: 'Queue',
  ok: 'OK',
  down: 'Down',
  pending: 'pending',
  failed: 'failed',
  oldest: 'Oldest pending',
}

function mountCard(readiness: OpsReadiness) {
  return mount(OpsReadinessCard, { props: { readiness, labels: LABELS } })
}

describe('OpsReadinessCard', () => {
  it('renders the service + a ready status badge (success tone, never colour-alone)', () => {
    const w = mountCard({ service: 'sso-backend', ready: true, checks: { database: true, redis: true } })
    expect(w.text()).toContain('sso-backend')
    const status = w.find('[data-testid="ops-readiness-status"]')
    expect(status.attributes('data-tone')).toBe('success')
    expect(status.text()).toContain('Ready')
  })

  it('shows the degraded label + danger tone when not ready, and down checks', () => {
    const w = mountCard({ service: 'sso-backend', ready: false, checks: { database: false, redis: true } })
    expect(w.find('[data-testid="ops-readiness-status"]').attributes('data-tone')).toBe('danger')
    expect(w.find('[data-testid="ops-readiness-status"]').text()).toContain('Degraded')
    expect(w.find('[data-testid="ops-check-database"]').attributes('data-tone')).toBe('danger')
    expect(w.find('[data-testid="ops-check-database"]').text()).toContain('Down')
    expect(w.find('[data-testid="ops-check-redis"]').attributes('data-tone')).toBe('success')
  })

  it('renders the queue row with a composed summary when queue is present', () => {
    const w = mountCard({
      service: 'sso-backend',
      ready: true,
      checks: {
        database: true,
        redis: true,
        queue: { pending_jobs: 3, failed_jobs: 1, oldest_pending_age_seconds: 42 },
      },
    })
    const queue = w.find('[data-testid="ops-check-queue"]')
    expect(queue.exists()).toBe(true)
    expect(queue.attributes('data-tone')).toBe('danger') // failed > 0
    expect(queue.text()).toContain('3 pending')
    expect(queue.text()).toContain('1 failed')
  })

  it('omits the queue row when queue is absent', () => {
    const w = mountCard({ service: 'sso-backend', ready: true, checks: { database: true, redis: true } })
    expect(w.find('[data-testid="ops-check-queue"]').exists()).toBe(false)
  })
})
```

```ts
// app/components/ops/__tests__/OpsDrillsList.spec.ts
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import OpsDrillsList from '@/components/ops/OpsDrillsList.vue'
import { OPS_RUNBOOK_BASE_URL, type OpsDrill } from '@/lib/ops/ops-drills'

const DRILLS: readonly OpsDrill[] = [
  {
    key: 'with-evidence',
    title: 'Drill A',
    summary: 'Summary A',
    systemOfRecord: 'CI workflow A',
    runbookPath: 'docs/runbooks/a.md',
    evidenceRef: 'docs/ops/evidence/a.md',
  },
  {
    key: 'no-evidence',
    title: 'Drill B',
    summary: 'Summary B',
    systemOfRecord: 'CI workflow B',
    runbookPath: 'docs/runbooks/b.md',
  },
]

function mountList() {
  return mount(OpsDrillsList, {
    props: {
      drills: DRILLS,
      runbookCtaLabel: 'Open runbook',
      evidenceCtaLabel: 'View evidence',
      systemOfRecordLabel: 'System of record',
    },
  })
}

describe('OpsDrillsList', () => {
  it('renders a card per drill with title, summary, and system of record', () => {
    const w = mountList()
    expect(w.find('[data-testid="ops-drill-with-evidence"]').exists()).toBe(true)
    expect(w.find('[data-testid="ops-drill-no-evidence"]').exists()).toBe(true)
    expect(w.text()).toContain('Drill A')
    expect(w.text()).toContain('Summary A')
    expect(w.text()).toContain('System of record')
    expect(w.text()).toContain('CI workflow A')
  })

  it('renders the runbook link as an absolute URL opening safely in a new tab', () => {
    const w = mountList()
    const link = w.find('[data-testid="ops-drill-runbook-with-evidence"]')
    expect(link.attributes('href')).toBe(`${OPS_RUNBOOK_BASE_URL}/docs/runbooks/a.md`)
    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('rel')).toBe('noopener noreferrer')
  })

  it('renders the evidence link only when evidenceRef is set', () => {
    const w = mountList()
    expect(w.find('[data-testid="ops-drill-evidence-with-evidence"]').exists()).toBe(true)
    expect(w.find('[data-testid="ops-drill-evidence-no-evidence"]').exists()).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `./node_modules/.bin/vitest run app/components/ops/__tests__/`
Expected: FAIL — components do not exist.

- [ ] **Step 3: Write `OpsReadinessCard.vue`**

```vue
<!-- app/components/ops/OpsReadinessCard.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import UiFolio from '@/components/ui/UiFolio.vue'
import {
  resolveReadinessTone,
  resolveCheckTone,
  resolveQueueTone,
} from '@/lib/ops/ops-view-state'
import type { OpsReadiness, OpsReadinessLabels } from '@/types/ops.types'

const props = defineProps<{
  readonly readiness: OpsReadiness
  readonly labels: OpsReadinessLabels
}>()

// Composed in the card from numeric values + unit labels (no i18n call here —
// the card is presentational; the page passes the unit labels in).
const queueSummary = computed<string>(() => {
  const queue = props.readiness.checks.queue
  if (!queue) return ''
  return `${queue.pending_jobs} ${props.labels.pending} · ${queue.failed_jobs} ${props.labels.failed}`
})
</script>

<template>
  <section class="ops-readiness" data-testid="ops-readiness" aria-label="readiness">
    <div class="ops-readiness__head">
      <strong class="ops-readiness__service">{{ readiness.service }}</strong>
      <UiStatusBadge
        data-testid="ops-readiness-status"
        :tone="resolveReadinessTone(readiness.ready)"
        :label="readiness.ready ? labels.ready : labels.degraded"
      />
    </div>

    <dl class="ops-readiness__grid">
      <div class="ops-readiness__row">
        <dt>{{ labels.database }}</dt>
        <dd>
          <UiStatusBadge
            data-testid="ops-check-database"
            :tone="resolveCheckTone(readiness.checks.database)"
            :label="readiness.checks.database ? labels.ok : labels.down"
          />
        </dd>
      </div>

      <div class="ops-readiness__row">
        <dt>{{ labels.redis }}</dt>
        <dd>
          <UiStatusBadge
            data-testid="ops-check-redis"
            :tone="resolveCheckTone(readiness.checks.redis)"
            :label="readiness.checks.redis ? labels.ok : labels.down"
          />
        </dd>
      </div>

      <div v-if="readiness.checks.queue" class="ops-readiness__row">
        <dt>{{ labels.queue }}</dt>
        <dd class="ops-readiness__queue">
          <UiStatusBadge
            data-testid="ops-check-queue"
            :tone="resolveQueueTone(readiness.checks.queue)"
            :label="queueSummary"
          />
          <span
            v-if="readiness.checks.queue.oldest_pending_age_seconds !== null"
            class="ops-readiness__oldest"
          >
            {{ labels.oldest }}:
            <UiFolio
              :value="String(readiness.checks.queue.oldest_pending_age_seconds)"
              variant="count"
            />
          </span>
        </dd>
      </div>
    </dl>
  </section>
</template>

<style scoped>
.ops-readiness {
  display: grid;
  gap: 16px;
  padding: 20px;
  background: var(--card);
  border: 1px solid var(--border);
}
.ops-readiness__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
}
.ops-readiness__service {
  font: 600 0.9375rem/1.2 var(--font-sans);
  color: var(--fg);
}
.ops-readiness__grid {
  margin: 0;
  display: grid;
  gap: 10px;
}
.ops-readiness__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.ops-readiness__row dt {
  font: 600 0.625rem/1.2 var(--font-sans);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.ops-readiness__row dd {
  margin: 0;
}
.ops-readiness__queue {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.ops-readiness__oldest {
  font: 400 0.75rem/1.4 var(--font-sans);
  color: var(--fg-2);
}
</style>
```

- [ ] **Step 4: Write `OpsDrillsList.vue`**

```vue
<!-- app/components/ops/OpsDrillsList.vue -->
<script setup lang="ts">
import { runbookHref, type OpsDrill } from '@/lib/ops/ops-drills'

defineProps<{
  readonly drills: readonly OpsDrill[]
  readonly runbookCtaLabel: string
  readonly evidenceCtaLabel: string
  readonly systemOfRecordLabel: string
}>()
</script>

<template>
  <ul class="ops-drills" data-testid="ops-drills">
    <li
      v-for="drill in drills"
      :key="drill.key"
      class="ops-drills__card"
      :data-testid="`ops-drill-${drill.key}`"
    >
      <strong class="ops-drills__title">{{ drill.title }}</strong>
      <p class="ops-drills__summary">{{ drill.summary }}</p>
      <p class="ops-drills__sor">{{ systemOfRecordLabel }}: {{ drill.systemOfRecord }}</p>
      <p class="ops-drills__links">
        <a
          class="ops-drills__link"
          :href="runbookHref(drill.runbookPath)"
          target="_blank"
          rel="noopener noreferrer"
          :data-testid="`ops-drill-runbook-${drill.key}`"
        >
          {{ runbookCtaLabel }}
        </a>
        <a
          v-if="drill.evidenceRef"
          class="ops-drills__link"
          :href="runbookHref(drill.evidenceRef)"
          target="_blank"
          rel="noopener noreferrer"
          :data-testid="`ops-drill-evidence-${drill.key}`"
        >
          {{ evidenceCtaLabel }}
        </a>
      </p>
    </li>
  </ul>
</template>

<style scoped>
.ops-drills {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 12px;
}
.ops-drills__card {
  display: grid;
  gap: 6px;
  padding: 16px;
  background: var(--card);
  border: 1px solid var(--border);
}
.ops-drills__title {
  font: 600 0.875rem/1.3 var(--font-sans);
  color: var(--fg);
}
.ops-drills__summary {
  margin: 0;
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--fg-2);
}
.ops-drills__sor {
  margin: 0;
  font: 400 0.75rem/1.4 var(--font-sans);
  color: var(--fg-3);
}
.ops-drills__links {
  margin: 4px 0 0;
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}
.ops-drills__link {
  font: 600 0.8125rem/1.4 var(--font-sans);
  color: var(--accent);
  text-decoration: underline;
  text-underline-offset: 2px;
}
.ops-drills__link:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
</style>
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `./node_modules/.bin/vitest run app/components/ops/__tests__/`
Expected: PASS (4 + 3 tests).

- [ ] **Step 6: Verify gates + commit**

Run: `./node_modules/.bin/oxlint . && ./node_modules/.bin/eslint app/components/ops/OpsReadinessCard.vue app/components/ops/OpsDrillsList.vue && npx vue-tsc --noEmit`
Expected: oxlint 0/0, eslint 0, typecheck 0.

```bash
git add app/components/ops/
git commit -m "$(cat <<'EOF'
feat(sso-admin-frontend): Swiss ops readiness card + drills list components

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 12.7: Ops page (compose all states) + locale

**Files:**
- Modify (replace stub): `app/pages/ops.vue`
- Modify: `app/locales/en.json` (`ops` block), `app/locales/id.json` (`ops` block)
- Test: `app/pages/__tests__/ops.page.nuxt.spec.ts`

**Interfaces:**
- Consumes: `useOpsReadiness` (12.5); `OPS_DRILLS` (12.3); `OpsReadinessLabels` (12.1); `OpsReadinessCard`/`OpsDrillsList` (12.6); `useSessionStore`; `useI18n`; `UiSkeleton`/`UiStatusView`/`UiButton`.
- **`definePageMeta` MUST keep `name: 'admin.ops'`, `permissions: ['admin.dashboard.view']`** verbatim — `route-map.spec.ts` already asserts this row and must stay green.
- Locale: drop dead `ops.empty_title` / `ops.empty_desc` (no empty state); add the readiness/queue/drill keys below. Parity must hold.

- [ ] **Step 1: Write the failing page test**

```ts
// app/pages/__tests__/ops.page.nuxt.spec.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import enLocale from '@/locales/en.json'
import type { OpsReadiness } from '@/types/ops.types'

const READY: OpsReadiness = {
  service: 'sso-backend',
  ready: true,
  checks: {
    database: true,
    redis: true,
    queue: { pending_jobs: 0, failed_jobs: 0, oldest_pending_age_seconds: null },
  },
}
const readinessRef = ref<OpsReadiness | null>(READY)
const viewStateRef = ref<'loading' | 'unauthenticated' | 'forbidden' | 'error' | 'ready'>('ready')
const refreshMock = vi.fn<() => Promise<void>>(async () => {})

vi.mock('@/composables/useOpsReadiness', () => ({
  useOpsReadiness: () => ({
    readiness: readinessRef,
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
      return params
        ? val.replace(/\{(\w+)\}/gu, (_: string, k: string) => String(params[k] ?? ''))
        : val
    },
  }),
}))
mockNuxtImport('navigateTo', () => vi.fn<(...a: unknown[]) => Promise<void>>(async () => {}))
const Page = (await import('../ops.vue')).default

beforeEach(() => {
  readinessRef.value = READY
  viewStateRef.value = 'ready'
})
afterEach(() => vi.clearAllMocks())

describe('ops page', () => {
  it('renders readiness + drills in the ready state through the admin shell', async () => {
    const w = await mountSuspended(Page)
    expect(w.find('[data-page="ops"]').exists()).toBe(true)
    expect(w.find('[data-testid="ops-readiness"]').exists()).toBe(true)
    expect(w.find('[data-testid="ops-readiness-status"]').text()).toContain(enLocale.ops.status_ready)
    expect(w.find('[data-testid="ops-check-database"]').exists()).toBe(true)
    expect(w.find('[data-testid="ops-drills"]').exists()).toBe(true)
  })

  it('shows a degraded status badge (danger tone) when not ready', async () => {
    readinessRef.value = { service: 'sso-backend', ready: false, checks: { database: false, redis: true } }
    const w = await mountSuspended(Page)
    const status = w.find('[data-testid="ops-readiness-status"]')
    expect(status.attributes('data-tone')).toBe('danger')
    expect(status.text()).toContain(enLocale.ops.status_degraded)
  })

  it('renders the loading skeleton', async () => {
    readinessRef.value = null
    viewStateRef.value = 'loading'
    const w = await mountSuspended(Page)
    expect(w.find('[data-testid="ops-readiness"]').exists()).toBe(false)
    expect(w.find('[data-testid="ops-drills"]').exists()).toBe(false)
  })

  it('renders the forbidden surface', async () => {
    readinessRef.value = null
    viewStateRef.value = 'forbidden'
    const w = await mountSuspended(Page)
    expect(w.text()).toContain(enLocale.ops.forbidden_title)
  })

  it('renders the error surface with a refresh action', async () => {
    readinessRef.value = null
    viewStateRef.value = 'error'
    const w = await mountSuspended(Page)
    expect(w.text()).toContain(enLocale.ops.error_title)
    await w.find('[data-testid="ops-refresh"]').trigger('click')
    expect(refreshMock).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run app/pages/__tests__/ops.page.nuxt.spec.ts`
Expected: FAIL — the stub page has no readiness/drills/states.

- [ ] **Step 3: Write the page**

```vue
<!-- app/pages/ops.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import { useSessionStore } from '@/stores/session.store'
import { useI18n } from '@/composables/useI18n'
import { useOpsReadiness } from '@/composables/useOpsReadiness'
import { OPS_DRILLS } from '@/lib/ops/ops-drills'
import type { OpsReadinessLabels } from '@/types/ops.types'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import UiButton from '@/components/ui/UiButton.vue'
import OpsReadinessCard from '@/components/ops/OpsReadinessCard.vue'
import OpsDrillsList from '@/components/ops/OpsDrillsList.vue'

definePageMeta({
  name: 'admin.ops',
  layout: 'admin',
  requiresAdmin: true,
  permissions: ['admin.dashboard.view'],
})

const { t } = useI18n()
const store = useSessionStore()

await useAsyncData('admin-ops-principal', () => store.ensureSession())

const { readiness, viewState, requestId, refresh } = useOpsReadiness()

const readinessLabels = computed<OpsReadinessLabels>(() => ({
  ready: t('ops.status_ready'),
  degraded: t('ops.status_degraded'),
  database: t('ops.check_database'),
  redis: t('ops.check_redis'),
  queue: t('ops.check_queue'),
  ok: t('ops.check_ok'),
  down: t('ops.check_down'),
  pending: t('ops.queue_pending'),
  failed: t('ops.queue_failed'),
  oldest: t('ops.queue_oldest'),
}))

async function onRefresh(): Promise<void> {
  await refresh()
}
</script>

<template>
  <section class="ops" data-page="ops" data-admin-shell>
    <header class="ops__hero">
      <span class="ops__eyebrow">{{ t('ops.eyebrow') }}</span>
      <h1 class="ops__title">{{ t('ops.title') }}</h1>
      <p class="ops__summary">{{ t('ops.summary') }}</p>
      <p class="ops__principal" data-principal-name>
        {{ t('ops.signed_in_as', { name: store.principal?.display_name ?? '—' }) }}
      </p>
    </header>

    <UiSkeleton v-if="viewState === 'loading'" :rows="5" :label="t('ops.loading')" />

    <UiStatusView
      v-else-if="viewState === 'forbidden'"
      tone="forbidden"
      :eyebrow="t('ops.eyebrow')"
      :title="t('ops.forbidden_title')"
      :description="t('common.forbidden_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="viewState === 'unauthenticated'"
      tone="step_up"
      :eyebrow="t('ops.eyebrow')"
      :title="t('common.session_expired_title')"
      :description="t('common.session_expired_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="viewState === 'error'"
      tone="error"
      :eyebrow="t('ops.eyebrow')"
      :title="t('ops.error_title')"
      :description="t('common.error_loading_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    >
      <template #actions>
        <UiButton variant="secondary" size="sm" data-testid="ops-refresh" @click="onRefresh">
          {{ t('common.btn_refresh') }}
        </UiButton>
      </template>
    </UiStatusView>

    <template v-else-if="readiness">
      <section class="ops__section" aria-labelledby="ops-readiness-title">
        <h2 id="ops-readiness-title" class="ops__section-title">{{ t('ops.readiness_title') }}</h2>
        <OpsReadinessCard :readiness="readiness" :labels="readinessLabels" />
      </section>

      <section class="ops__section" aria-labelledby="ops-drills-title">
        <h2 id="ops-drills-title" class="ops__section-title">{{ t('ops.drills_title') }}</h2>
        <p class="ops__section-summary">{{ t('ops.drills_summary') }}</p>
        <OpsDrillsList
          :drills="OPS_DRILLS"
          :runbook-cta-label="t('ops.drill_runbook_cta')"
          :evidence-cta-label="t('ops.drill_evidence_cta')"
          :system-of-record-label="t('ops.drill_system_of_record')"
        />
      </section>
    </template>
  </section>
</template>

<style scoped>
.ops {
  display: grid;
  gap: 24px;
  padding: 24px;
}
.ops__hero {
  display: grid;
  gap: 6px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border);
}
.ops__eyebrow {
  font: 600 0.6875rem/1 var(--font-sans);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.ops__title {
  margin: 0;
  font: 600 1.5rem/1.2 var(--font-sans);
  letter-spacing: -0.02em;
  color: var(--fg);
}
.ops__summary,
.ops__principal {
  margin: 0;
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--fg-2);
}
.ops__section {
  display: grid;
  gap: 12px;
}
.ops__section-title {
  margin: 0;
  font: 600 1rem/1.3 var(--font-sans);
  color: var(--fg);
}
.ops__section-summary {
  margin: 0;
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--fg-2);
}
</style>
```

- [ ] **Step 4: Update the `ops` locale blocks (both files)**

Replace the existing `"ops": { ... }` block in `app/locales/en.json` with:

```json
  "ops": {
    "eyebrow": "Operations",
    "title": "Ops Evidence",
    "summary": "Readiness, operational drill evidence, and compliance evidence references — without credential telemetry in the browser.",
    "signed_in_as": "Signed in as {name}",
    "loading": "Loading ops evidence",
    "forbidden_title": "Ops evidence access denied",
    "error_title": "Ops evidence could not be loaded",
    "readiness_title": "Health & readiness",
    "status_ready": "Ready",
    "status_degraded": "Degraded",
    "check_database": "Database",
    "check_redis": "Redis",
    "check_queue": "Queue",
    "check_ok": "OK",
    "check_down": "Down",
    "queue_pending": "pending",
    "queue_failed": "failed",
    "queue_oldest": "Oldest pending",
    "drills_title": "Drill evidence",
    "drills_summary": "Operational drills run through CI workflows and runbooks (not the admin API). Each card links the system of record and the official runbook to execute the drill and collect evidence.",
    "drill_system_of_record": "System of record",
    "drill_runbook_cta": "Open runbook",
    "drill_evidence_cta": "View evidence"
  },
```

Replace the existing `"ops": { ... }` block in `app/locales/id.json` with:

```json
  "ops": {
    "eyebrow": "Operasional",
    "title": "Evidence Operasional",
    "summary": "Readiness, operational drill evidence, dan compliance evidence references — tanpa credential telemetry di browser.",
    "signed_in_as": "Masuk sebagai {name}",
    "loading": "Memuat evidence operasional",
    "forbidden_title": "Akses evidence operasional ditolak",
    "error_title": "Evidence operasional belum bisa dimuat",
    "readiness_title": "Health & Readiness",
    "status_ready": "Siap",
    "status_degraded": "Terdegradasi",
    "check_database": "Database",
    "check_redis": "Redis",
    "check_queue": "Queue",
    "check_ok": "OK",
    "check_down": "Mati",
    "queue_pending": "pending",
    "queue_failed": "gagal",
    "queue_oldest": "Pending terlama",
    "drills_title": "Drill evidence",
    "drills_summary": "Drill operasional dijalankan lewat CI workflow dan runbook (bukan admin API). Tiap kartu menautkan system of record dan runbook resmi untuk menjalankan drill dan mengumpulkan evidence.",
    "drill_system_of_record": "System of record",
    "drill_runbook_cta": "Buka runbook",
    "drill_evidence_cta": "Lihat evidence"
  },
```

- [ ] **Step 5: Run the page test + route-map + locale parity**

Run: `./node_modules/.bin/vitest run app/pages/__tests__/ops.page.nuxt.spec.ts app/pages/__tests__/route-map.spec.ts`
Expected: PASS (page 5 tests + route-map green — the `admin.ops` row unchanged).

Run the parity check:
```bash
node -e "const e=require('./app/locales/en.json'),i=require('./app/locales/id.json');const f=(o,p='')=>Object.entries(o).flatMap(([k,v])=>typeof v==='object'&&v?f(v,p+k+'.'):[p+k]);const ek=f(e).sort(),ik=f(i).sort();const d=ek.filter(k=>!ik.includes(k)).concat(ik.filter(k=>!ek.includes(k)));console.log('parity diff:',d); if(d.length)process.exit(1)"
```
Expected: `parity diff: []`.

- [ ] **Step 6: Verify gates + commit**

Run: `./node_modules/.bin/oxlint . && ./node_modules/.bin/eslint app/pages/ops.vue && npx vue-tsc --noEmit`
Expected: oxlint 0/0, eslint 0, typecheck 0.

```bash
git add app/pages/ops.vue app/locales/en.json app/locales/id.json app/pages/__tests__/ops.page.nuxt.spec.ts
git commit -m "$(cat <<'EOF'
feat(sso-admin-frontend): Swiss ops page (readiness + drills, all states)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 12.8: SSR leak gate + deferred e2e + DoD

**Files:**
- Create: `test/fixtures/ssr-leak/server/routes/api/admin/ops/readiness/index.get.ts`
- Modify: `test/ssr-token-leak.gate.spec.ts`
- Create: `e2e/ops.spec.ts` (authored, DEFERRED — not run this phase)

**Interfaces:**
- Consumes the gate's existing `collectSecretLeaks`/`collectPiiShapeLeaks`/`extractPayload` helpers + the `$fetch`/`setup` harness.
- `me.get` fixture already grants `admin.dashboard.view` → no fixture-permission change.
- STRICT (no `allowSessionId`) — the readiness DTO carries no token/secret/session-id/gov-PII. The fixture plants an `external_idps` **canary** so the gate proves `parseOpsReadiness` strips it before hydration.

- [ ] **Step 1: Write the fixture route**

```ts
// test/fixtures/ssr-leak/server/routes/api/admin/ops/readiness/index.get.ts
// SSR token-leak fixture: a representative readiness response so the §3.3 gate
// renders the ops page READY. Booleans + small queue counts only — no token,
// secret, session id, or PII-shaped digit run. `external_idps` carries a CANARY
// string to PROVE parseOpsReadiness strips the config-gated IdP health map at the
// service boundary, so it never reaches the SSR HTML or __NUXT_DATA__.
import { defineEventHandler } from 'h3'

export default defineEventHandler(() => ({
  service: 'sso-backend',
  ready: true,
  checks: {
    database: true,
    redis: true,
    queue: { pending_jobs: 2, failed_jobs: 0, oldest_pending_age_seconds: 12 },
    external_idps: {
      primary: { ok: true, endpoint: 'https://OPS-EXTERNAL-IDP-CANARY.example/oidc' },
    },
  },
}))
```

- [ ] **Step 2: Add the gate fetch helper + assertions**

In `test/ssr-token-leak.gate.spec.ts`, add a `fetchOps` helper next to `fetchIpAccess` (around line 84):

```ts
function fetchOps(): Promise<string> {
  // admin_locale=en so the readiness status badge renders the English label.
  return $fetch('/ops', { headers: { cookie: 'admin_locale=en' } })
}
```

Then add these three `it` blocks inside the `describe`, immediately before the `collectSecretLeaks is LIVE` negative-control test (around line 432):

```ts
  it('renders the ops readiness server-side in its ready state', async () => {
    const html = await fetchOps()
    expect(html).toContain('data-admin-shell')
    expect(html).toContain('data-page="ops"')
    // the service + a check label render (status shown as a label, never colour-alone)
    expect(html).toContain('sso-backend')
    expect(html).toContain('Database')
  })

  it('does not leak token/secret/PII values into the ops SSR HTML', async () => {
    // Strict — the readiness DTO carries only a service name, booleans, and small
    // queue counts; no token, secret, session id, or gov-PII. NO allowSessionId.
    const html = await fetchOps()
    expect(collectSecretLeaks(html, 'ops SSR HTML')).toEqual([])
    // external_idps health map (incl. IdP endpoint config) is stripped at parse —
    // its canary must never reach the SSR HTML.
    expect(html).not.toContain('OPS-EXTERNAL-IDP-CANARY')
  })

  it('does not leak token/secret/PII values into the ops hydration payload', async () => {
    const html = await fetchOps()
    const serialized = JSON.stringify(JSON.parse(extractPayload(html)))
    expect(collectSecretLeaks(serialized, 'ops __NUXT__ payload')).toEqual([])
    expect(collectPiiShapeLeaks(serialized, 'ops __NUXT__ payload')).toEqual([])
    // proves parseOpsReadiness dropped external_idps before hydration
    expect(serialized).not.toContain('OPS-EXTERNAL-IDP-CANARY')
  })
```

- [ ] **Step 3: Write the deferred e2e spec**

```ts
// e2e/ops.spec.ts
import { test, expect } from '@playwright/test'

// DEFERRED to Phase 18 cutover: playwright.config.ts is still legacy-SPA-wired
// (ports 5173/4173, no Nuxt build:web; Nuxt serves on 3000). Authored now against
// the shipped Nuxt routes so it becomes a real gate at cutover. Do NOT run as a
// gate this phase.
test('ops page shows readiness + drill evidence', async ({ page, context }) => {
  await context.addCookies([
    { name: 'admin_locale', value: 'en', url: 'http://localhost:3000' },
  ])
  await page.goto('/ops')

  await expect(page.getByTestId('ops-readiness')).toBeVisible()
  await expect(page.getByTestId('ops-readiness-status')).toContainText('Ready')
  await expect(page.getByTestId('ops-check-database')).toBeVisible()

  await expect(page.getByTestId('ops-drills')).toBeVisible()
  const runbook = page.getByTestId('ops-drill-runbook-jwks-rotation')
  await expect(runbook).toHaveAttribute('rel', /noopener/)
  await expect(runbook).toHaveAttribute('target', '_blank')
})
```

- [ ] **Step 4: Rebuild the leak-gate fixture output + run the gate**

`test/globalSetup.ts` rebuilds the `test/fixtures/ssr-leak` layer's `.output` on every fresh `vitest run` (it owns a build lock and rebuilds when it holds it), so the new `ops/readiness/index.get.ts` route is picked up automatically — just run the gate:

```bash
./node_modules/.bin/vitest run test/ssr-token-leak.gate.spec.ts
```
Expected: PASS — all prior gate tests + the 3 new ops tests + the live negative control.

> Recovery note for the implementer: if the gate fails with "no `__NUXT_DATA__`", a stale render, or the new ops route missing, a prior interrupted run may have left the **build lock** behind (so `globalSetup` saw the lock, set `owner=false`, and skipped the rebuild — removing only `.output` does NOT force a rebuild while the lock survives). Clear both the lock and the output, then re-run the gate:
> ```bash
> rm -rf node_modules/.cache/sso-admin-e2e-build test/fixtures/ssr-leak/.output
> ./node_modules/.bin/vitest run test/ssr-token-leak.gate.spec.ts
> ```

- [ ] **Step 5: Full DoD gate**

```bash
./node_modules/.bin/oxlint .
./node_modules/.bin/eslint app/pages/ops.vue app/components/ops/OpsReadinessCard.vue app/components/ops/OpsDrillsList.vue
npx vue-tsc --noEmit
./node_modules/.bin/vitest run
npm run build
```
Expected: oxlint 0/0, eslint 0, typecheck 0, **full suite green** (≈1263 + new ops tests), build PASS, SSR leak gate green (now includes ops).

- [ ] **Step 6: Commit**

```bash
git add test/fixtures/ssr-leak/server/routes/api/admin/ops e2e/ops.spec.ts test/ssr-token-leak.gate.spec.ts
git commit -m "$(cat <<'EOF'
test(sso-admin-frontend): STRICT ops SSR leak gate (external_idps strip canary) + deferred e2e

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**1. Spec coverage** (`/ops` → `pages/ops.vue` → `admin.dashboard.view`, line 122; "readiness + operational drill evidence + compliance evidence references"):
- Readiness display → 12.1 (DTO/tone), 12.2 (parse/narrow), 12.4 (503-aware fetch), 12.5 (composable), 12.6 (card), 12.7 (page). ✅
- Operational drill evidence → 12.3 (catalog), 12.6 (list), 12.7 (page). ✅
- Compliance evidence references → the SIEM-sink drill links the Audit Compliance export (`siem-sink` drill `systemOfRecord`); a dedicated compliance widget already lives on the Phase-6 observability/compliance pages. Ops references it via the drill, matching legacy. ✅
- `admin.dashboard.view` permission + `name: admin.ops` preserved in `definePageMeta` (route-map green). ✅
- SSR leak gate (STRICT) → 12.8. ✅

**2. Placeholder scan:** No `TBD`/`add appropriate`/`similar to`/`write tests for the above` — every step carries full code. ✅

**3. Type consistency:** `OpsReadiness`/`OpsReadinessChecks`/`OpsQueueCheck`/`OpsReadinessLabels` defined in 12.1 and consumed identically in 12.2/12.4/12.5/12.6/12.7. `OpsViewState` union (`loading|unauthenticated|forbidden|error|ready` — no `empty`, no `stale`) consistent across 12.1/12.5/12.7. `parseOpsReadiness` signature (`unknown → OpsReadiness | null`) identical in 12.2/12.4. `opsApi.getReadiness(): Promise<OpsReadiness>` identical in 12.4/12.5. `runbookHref`/`OpsDrill`/`OPS_DRILLS` identical in 12.3/12.6. Tone resolvers (`resolveReadinessTone`/`resolveCheckTone`/`resolveQueueTone`) defined in 12.1, used in 12.6. Locale keys referenced in 12.7's page (`ops.status_ready`…`ops.drill_evidence_cta`, `common.*`) all exist after the 12.7 block replacement + the verified `common.*` keys. ✅

**Security invariants checklist (verify during execution):**
- Page reads **zero** `error.message` (it has no error-message surface — only status-keyed view-state copy). ✅ by construction.
- Readiness `error.payload` is read **only server-side** inside the service (12.4), returned as DATA; no ApiError custom field relied on post-hydration. ✅
- `parseOpsReadiness` strips `external_idps` (proven by 12.2 unit test + 12.8 SSR canary). ✅
- **No destructive affordance** on the page → zero `#E4002B` accent; `danger` tone appears only on status badges for genuinely-down checks (precedent: `resolveHealthTone`). ✅
- STRICT leak gate (no `allowSessionId`). ✅
- No proxy change, no `me.get` fixture change. ✅
