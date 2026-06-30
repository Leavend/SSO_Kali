# Phase 10 — External Identity Providers (Federation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the `/external-idps` admin surface as a Nuxt-4 SSR, Swiss-redesigned **federation console** — list/inspect external OIDC identity providers (config, health, mapping), create/edit them (with a write-only upstream `client_secret`), preview claim mapping, and delete one through a step-up-gated, type-to-confirm destructive action — at functional parity with the legacy SPA, test-first, leaking no secret in the SSR payload.

**Architecture:** `app/pages/external-idps.vue` (SSR, permission-gated, all six states) → `app/composables/useExternalIdpsList.ts` (`useAsyncData`, view-state + stale + requestId) → `app/services/external-idps.api.ts` (single network seam) → Nitro BFF (`/api/admin/*` → `/admin/api/*`, injects `Bearer`, already allow-listed) → Laravel backend. Pure logic (view-state, health/enabled tone, client-side search, form validation, payload builders, claims-JSON parse) lives in `app/lib/external-idps/`. The four writes (create · update · mapping-preview · delete) each run through the **reused** `usePrivilegedAction` + `PrivilegedActionDialog`/form so the full `403/419/422/428/429/5xx` + step-up matrix surfaces safe, status-keyed copy and a redacted support reference. The upstream `client_secret` is a **write-only** form field (admin-supplied, never returned, never hydrated).

**Tech Stack:** Nuxt 4.4.8 (full SSR), Vue 3.5 SFC, TypeScript strict, Pinia (`useSessionStore` read-only for `hasPermission`), `useAsyncData` + `apiClient`, Vitest 4 + `@nuxt/test-utils` 4 (nuxt-runtime specs `*.nuxt.spec.ts`), Playwright (e2e authored; run deferred to Phase 18). Reka UI primitives via the Swiss `Ui*` components.

## Global Constraints

These apply to **every** task.

- **Backend is the security boundary.** The UI gate is UX minimization; the backend re-checks permission + (for delete) session-management role + fresh-auth + MFA on every call.
- **Permission gate.** The `/external-idps` route is gated `admin.external-idps.read` via `definePageMeta` (matches the stub + spec). Write affordances (create/edit/mapping-preview) gate on `hasPermission('admin.external-idps.write')`. **Delete is double-gated** `hasPermission('admin.external-idps.write') && hasPermission('admin.sessions.terminate')` (the backend additionally requires the session-management role — the UI cannot see the role, the backend enforces it).
- **Permission keys (verbatim):** read `admin.external-idps.read`; create/update/**mapping-preview** `admin.external-idps.write`; delete additionally `admin.sessions.terminate` + the session-management role.
- **Step-up tiers (verbatim):** create/update/mapping-preview = `EnsureFreshAdminAuth:write` (~1800s); **delete = `:step_up`** (~300s, stricter). Stale auth → **HTTP 428** `{ error: "reauth_required", step_up_url }`. A separate **403** `mfa_required` gate also applies. The privileged-action matrix maps 428/412/`reauth_required`/`step_up_required` → `step_up_required` (checked FIRST) and surfaces `step_up_url`.
- **⚠️ 422 LEAKS RAW SQL — NEVER RENDER `error.message`.** The backend returns **422 `external_idp_invalid`** for a duplicate `provider_key`/`issuer`/`metadata_url` (a DB unique-constraint `QueryException` whose message contains the raw SQL constraint text) AND for update/delete key-not-found ("External IdP not found."). The privileged-action matrix maps all 422 → `invalid`; the UI MUST surface a SAFE, status-keyed domain string (NEVER `error.message`, NEVER the `fieldErrors` payload for the duplicate case). Create-invalid → "A provider with that key, issuer, or metadata URL already exists, or the input was rejected." Update/delete-invalid → "That provider could not be found or the change was rejected." This is the single most important security rule of this phase.
- **Other error codes (verbatim):** 404 `not_found` (GET detail + mapping-preview when the key is unknown); 422 `invalid_payload` (mapping-preview bad/missing `claims`); 403 `forbidden`/`mfa_required`; 401 `unauthorized`; 429 throttle (read 60/min, write 10/min). Delete returns **204** on success and **never blocks on in-use** (child rows cascade); a missing key on delete is 422 `external_idp_invalid` (not 404).
- **Provider DTO (verbatim, 18 fields from `publicView`):** `provider_key, display_name, issuer, metadata_url, client_id, authorization_endpoint, token_endpoint, userinfo_endpoint, jwks_uri, allowed_algorithms, scopes, priority, enabled, is_backup, tls_validation_enabled, signature_validation_enabled, has_client_secret, health_status`. The legacy frontend type over-declared 8 breaker/audit fields (`consecutive_failures/successes, breaker_tripped_at, breaker_reason, last_discovered_at, last_health_checked_at, created_by_subject_id, updated_by_subject_id`) that the API **never returns** — do NOT include them in the DTO or render them. `health_status` ∈ `{ unknown, healthy, unhealthy }`.
- **Secret is WRITE-ONLY (verbatim).** The response carries `has_client_secret: boolean` ONLY — the secret value is **never** returned (encrypted at rest, scrubbed even from audit logs). There is **no one-time-secret reveal** (the secret is admin-supplied, not generated; the create response is the same provider DTO). The `client_secret` form field is a `type="password"` input held in a **client-only ref**, sent only when non-empty (on edit, empty means "keep existing"), never displayed/logged/hydrated. `has_client_secret` renders as a "configured"/"not set" status, never the value.
- **SSR token-leak gate (design §3.3, mandatory):** Tokens, secrets, raw PII must **never** enter the SSR HTML or `__NUXT__`/`__NUXT_DATA__`. **FORBIDDEN:** token values/names (`accessToken|refreshToken|idToken|access_token|refresh_token|id_token`); secret values/names (`sessionEncryptionSecret|adminOidcClientSecret|client_secret`); raw NIK(16)/NIP(18)/NISN(10) digit runs; raw backend exceptions; the `SSR_LEAK_CANARY`. **The provider DTO carries NO secret and NO gov-PII** — `client_id`/`issuer`/endpoints are public OIDC config (like `client_id` in Phase 5), `has_client_secret` is a boolean, and the `created_by/updated_by` subject ids are not returned. So the external-idps leak-gate blocks use the **strict** checks (no `allowSessionId`). The `/external-idps` fixture must avoid token-name keys and 10/16/18-digit runs.
- **Swiss design system:** single Klein-blue accent `--accent #002FA7`; **`--danger #E4002B` reserved for destructive affordances only** — in this domain that is the **delete** action (and inline form-validation text). Status is tone **+** text label via `UiStatusBadge` (never colour-alone) — enabled/disabled and `health_status` both render as tone+label. Hairline borders, no shadows, sharp radii. Folio numerals; `--font-mono` only for raw IDs/URLs (`provider_key`, `client_id`, `issuer`, endpoints). Standard labels — no themed copy, Lucide icons only.
- **No traceability markers** (`OG#`, `UC###`, `FR###`, `BE-FR###`) anywhere.
- **Locale parity:** `app/locales/en.json` and `app/locales/id.json` stay in sync. The `external_idps.*` block already exists (11 keys) — extend it. (The legacy page hardcoded most copy; the redesign moves ALL strings into i18n.)
- **Reuse, don't rebuild:** the Nitro proxy already allow-lists all 6 external-idps routes; every `Ui*` primitive, the privileged-action infra (`usePrivilegedAction` + `PrivilegedActionDialog`), `apiClient`/`ApiError`, and the SSR-leak-gate harness all exist — consume them as-is. Phase 10 builds only the provider DTOs, pure helpers, service, composable, table, page, form dialog, the four write actions, and the leak-gate/e2e extension.
- **`npm run lint` is `run-s lint:*`** → BOTH `lint:oxlint` AND `lint:eslint` must pass. oxlint rules that bite: every `vi.fn(...)` needs a type parameter; every `.toThrow(...)` needs a message. `npm run format:check` is `prettier --check --experimental-cli .` (use the npm script — plain `npx prettier --check .` false-reds on a pre-existing UAT markdown).
- **Commit trailer (verbatim):** `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## Task Index

| Task | Title | Deliverable |
|---|---|---|
| 10.1 | Provider DTO types + view-state + health/enabled tone | `app/types/external-idps.types.ts`, `app/lib/external-idps/external-idps-view-state.ts` |
| 10.2 | Pure helpers (search · form validation · payload builders · claims parse) | `app/lib/external-idps/external-idps-list.ts`, `app/lib/external-idps/external-idps-form.ts` |
| 10.3 | `external-idps.api.ts` service | `app/services/external-idps.api.ts` |
| 10.4 | `useExternalIdpsList` SSR composable | `app/composables/useExternalIdpsList.ts` |
| 10.5 | `ExternalIdpsTable.vue` (Swiss provider table) | `app/components/external-idps/ExternalIdpsTable.vue` |
| 10.6 | `/external-idps` page — six states, search, detail drawer (read) | `app/pages/external-idps.vue` |
| 10.7 | `ExternalIdpFormDialog.vue` (shared create/edit form, write-only secret) | `app/components/external-idps/ExternalIdpFormDialog.vue` |
| 10.8 | Create + update privileged actions (422-duplicate → safe copy) | `app/pages/external-idps.vue` |
| 10.9 | Mapping-preview privileged action + result panel | `app/pages/external-idps.vue` + `app/components/external-idps/MappingPreviewPanel.vue` |
| 10.10 | Delete-provider danger action (type-to-confirm, double-gate, step-up) | `app/pages/external-idps.vue` |
| 10.11 | Extend SSR token-leak gate + e2e + full Phase-10 DoD | `test/ssr-token-leak.gate.spec.ts`, fixture, `e2e/external-idps.spec.ts` |

---

### Task 10.1: Provider DTO types + pure view-state + health/enabled tone

**Files:**
- Create: `app/types/external-idps.types.ts`
- Create: `app/lib/external-idps/external-idps-view-state.ts`
- Test: `app/lib/external-idps/__tests__/external-idps-view-state.spec.ts`

**Interfaces:**
- Consumes: `ApiError` (`@/lib/api/api-client`); `StatusTone` (`@/lib/status-tone`).
- Produces:
  - `app/types/external-idps.types.ts`: `ExternalIdpHealthStatus = 'unknown'|'healthy'|'unhealthy'`; `ExternalIdentityProvider` (the REAL 18 fields); `ExternalIdpListResponse` ({ providers, meta? }); `ExternalIdpDetailResponse` ({ provider }); `ExternalIdpCreatePayload`; `ExternalIdpUpdatePayload`; `ExternalIdpMappingPreview` ({ mapped, errors, warnings, missing_email_strategy, safe_to_link }); `ExternalIdpMappingPreviewResponse` ({ preview }).
  - `app/lib/external-idps/external-idps-view-state.ts`: `ExternalIdpsViewState = 'loading'|'unauthenticated'|'forbidden'|'error'|'empty'|'ready'`; `resolveExternalIdpsViewState({ pending, error, providers })`; `resolveHealthTone(status: string | null | undefined): StatusTone`; `resolveEnabledTone(enabled: boolean | undefined): StatusTone`.

- [ ] **Step 1: Write the failing test** — `app/lib/external-idps/__tests__/external-idps-view-state.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api/api-client'
import {
  resolveEnabledTone,
  resolveExternalIdpsViewState,
  resolveHealthTone,
} from '../external-idps-view-state'
import type { ExternalIdentityProvider } from '@/types/external-idps.types'

const provider = (over: Partial<ExternalIdentityProvider> = {}): ExternalIdentityProvider => ({
  provider_key: 'acme',
  display_name: 'Acme IdP',
  issuer: 'https://idp.acme.test',
  metadata_url: 'https://idp.acme.test/.well-known/openid-configuration',
  client_id: 'sso-client',
  enabled: true,
  has_client_secret: true,
  health_status: 'healthy',
  ...over,
})

describe('resolveExternalIdpsViewState', () => {
  it('is loading when nothing resolved yet', () => {
    expect(resolveExternalIdpsViewState({ pending: true, error: null, providers: null })).toBe('loading')
  })
  it('maps 401/403/other (no prior list) to unauthenticated/forbidden/error', () => {
    expect(resolveExternalIdpsViewState({ pending: false, error: new ApiError(401, 'x'), providers: null })).toBe('unauthenticated')
    expect(resolveExternalIdpsViewState({ pending: false, error: new ApiError(403, 'x'), providers: null })).toBe('forbidden')
    expect(resolveExternalIdpsViewState({ pending: false, error: new ApiError(500, 'x'), providers: null })).toBe('error')
  })
  it('is empty / ready by list length', () => {
    expect(resolveExternalIdpsViewState({ pending: false, error: null, providers: [] })).toBe('empty')
    expect(resolveExternalIdpsViewState({ pending: false, error: null, providers: [provider()] })).toBe('ready')
  })
  it('keeps a good list on a background-refresh error (ready)', () => {
    expect(resolveExternalIdpsViewState({ pending: false, error: new ApiError(500, 'x'), providers: [provider()] })).toBe('ready')
  })
})

describe('resolveHealthTone', () => {
  it('maps health_status to a distinct accessible tone (paired with a label in the badge)', () => {
    expect(resolveHealthTone('healthy')).toBe('success')
    expect(resolveHealthTone('unhealthy')).toBe('danger')
    expect(resolveHealthTone('unknown')).toBe('neutral')
    expect(resolveHealthTone(null)).toBe('neutral')
    expect(resolveHealthTone('something')).toBe('neutral')
  })
})

describe('resolveEnabledTone', () => {
  it('enabled=success, disabled=neutral', () => {
    expect(resolveEnabledTone(true)).toBe('success')
    expect(resolveEnabledTone(false)).toBe('neutral')
    expect(resolveEnabledTone(undefined)).toBe('neutral')
  })
})
```

- [ ] **Step 2: Run it — expect FAIL** (`npm run test -- app/lib/external-idps/__tests__/external-idps-view-state.spec.ts`): module-not-found.

- [ ] **Step 3: Create `app/types/external-idps.types.ts`:**

```ts
// External identity provider DTOs — the EXACT backend shape from
// ExternalIdentityProviderRegistry::publicView() (18 fields). The response carries
// has_client_secret (a boolean), NEVER the secret value. client_id/issuer/endpoints
// are public OIDC config; no token/secret/gov-PII is serialized.
export type ExternalIdpHealthStatus = 'unknown' | 'healthy' | 'unhealthy'

export type ExternalIdentityProvider = {
  readonly provider_key: string
  readonly display_name: string
  readonly issuer: string
  readonly metadata_url: string
  readonly client_id: string
  readonly authorization_endpoint?: string | null
  readonly token_endpoint?: string | null
  readonly userinfo_endpoint?: string | null
  readonly jwks_uri?: string | null
  readonly allowed_algorithms?: readonly string[]
  readonly scopes?: readonly string[]
  readonly priority?: number
  readonly enabled?: boolean
  readonly is_backup?: boolean
  readonly tls_validation_enabled?: boolean
  readonly signature_validation_enabled?: boolean
  readonly has_client_secret?: boolean
  readonly health_status?: string | null
}

export type ExternalIdpListResponse = {
  readonly providers: readonly ExternalIdentityProvider[]
  readonly meta?: {
    readonly current_page?: number
    readonly per_page?: number
    readonly total?: number
  }
}

export type ExternalIdpDetailResponse = {
  readonly provider: ExternalIdentityProvider
}

// client_secret is WRITE-ONLY (sent on create/update when non-empty; never returned).
export type ExternalIdpCreatePayload = {
  readonly provider_key: string
  readonly display_name: string
  readonly issuer: string
  readonly metadata_url: string
  readonly client_id: string
  readonly client_secret?: string
  readonly allowed_algorithms?: readonly string[]
  readonly scopes?: readonly string[]
  readonly priority?: number
  readonly enabled?: boolean
  readonly is_backup?: boolean
}

export type ExternalIdpUpdatePayload = {
  readonly display_name?: string
  readonly metadata_url?: string
  readonly client_id?: string
  readonly client_secret?: string
  readonly allowed_algorithms?: readonly string[]
  readonly scopes?: readonly string[]
  readonly priority?: number
  readonly enabled?: boolean
  readonly is_backup?: boolean
  readonly tls_validation_enabled?: boolean
  readonly signature_validation_enabled?: boolean
}

export type ExternalIdpMappingPreview = {
  readonly mapped: Readonly<Record<string, unknown>> | null
  readonly errors: readonly string[]
  readonly warnings: readonly string[]
  readonly missing_email_strategy: string
  readonly safe_to_link: boolean
}

export type ExternalIdpMappingPreviewResponse = {
  readonly preview: ExternalIdpMappingPreview
}
```

- [ ] **Step 4: Create `app/lib/external-idps/external-idps-view-state.ts`:**

```ts
import { ApiError } from '@/lib/api/api-client'
import type { StatusTone } from '@/lib/status-tone'
import type { ExternalIdentityProvider } from '@/types/external-idps.types'

export type ExternalIdpsViewState =
  | 'loading'
  | 'unauthenticated'
  | 'forbidden'
  | 'error'
  | 'empty'
  | 'ready'

export function resolveExternalIdpsViewState({
  error,
  providers,
}: {
  readonly pending: boolean
  readonly error: unknown
  readonly providers: readonly ExternalIdentityProvider[] | null
}): ExternalIdpsViewState {
  if (error && !providers) {
    const status = errorStatus(error)
    if (status === 401) return 'unauthenticated'
    if (status === 403) return 'forbidden'
    return 'error'
  }
  if (providers) return providers.length === 0 ? 'empty' : 'ready'
  return 'loading'
}

// health_status ∈ {healthy, unhealthy, unknown}. Tone + label via UiStatusBadge
// (never colour-alone); danger only for genuinely unhealthy.
export function resolveHealthTone(status: string | null | undefined): StatusTone {
  switch (status) {
    case 'healthy':
      return 'success'
    case 'unhealthy':
      return 'danger'
    default:
      return 'neutral'
  }
}

export function resolveEnabledTone(enabled: boolean | undefined): StatusTone {
  return enabled ? 'success' : 'neutral'
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

- [ ] **Step 5: Run it — expect PASS** (view-state 6 + health 5 + enabled 3 assertions).

- [ ] **Step 6: Commit:**

```bash
git add app/types/external-idps.types.ts app/lib/external-idps/external-idps-view-state.ts app/lib/external-idps/__tests__/external-idps-view-state.spec.ts
git commit -m "$(cat <<'EOF'
feat(sso-admin-frontend): external-idp DTO types + view-state + health/enabled tone

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Task-scoped DoD:** `npm run typecheck && npm run lint && npm run format:check && npm run test -- app/lib/external-idps/__tests__/external-idps-view-state.spec.ts` — all green. No render/network here, so no SSR-leak step (that is Task 10.11).

---

### Task 10.2: Pure helpers (search · form validation · payload builders · claims parse)

**Files:**
- Create: `app/lib/external-idps/external-idps-list.ts`
- Create: `app/lib/external-idps/external-idps-form.ts`
- Test: `app/lib/external-idps/__tests__/external-idps-list.spec.ts`
- Test: `app/lib/external-idps/__tests__/external-idps-form.spec.ts`

**Interfaces:**
- Consumes: `ExternalIdentityProvider`, `ExternalIdpCreatePayload`, `ExternalIdpUpdatePayload` (`@/types/external-idps.types`).
- Produces:
  - `external-idps-list.ts`: `filterProviders(providers, query): readonly ExternalIdentityProvider[]` (case-insensitive over `display_name`, `provider_key`, `issuer`; empty/whitespace → same ref). `parseClaimsJson(text): { ok: true; value: Record<string, unknown> } | { ok: false; error: 'syntax' | 'not_object' }` (for the mapping-preview claims input — never throws).
  - `external-idps-form.ts`: `ExternalIdpFormModel` (the flat form ref shape — strings for the comma fields + booleans); `validateProviderForm(form, mode: 'create' | 'edit'): { valid: boolean; fieldErrors: Record<string, string> }` (create requires provider_key/display_name/issuer/metadata_url/client_id, provider_key matches `^[a-z0-9_-]+$`, issuer + metadata_url start `https://`; edit validates only the present fields); `buildCreatePayload(form): ExternalIdpCreatePayload` and `buildUpdatePayload(form): ExternalIdpUpdatePayload` (split the comma `algorithms`/`scopes` strings into trimmed non-empty arrays, coerce `priority` to a number, omit `client_secret` when blank — empty means "keep existing").

- [ ] **Step 1: Write the failing tests.** `app/lib/external-idps/__tests__/external-idps-list.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { filterProviders, parseClaimsJson } from '../external-idps-list'
import type { ExternalIdentityProvider } from '@/types/external-idps.types'

const make = (over: Partial<ExternalIdentityProvider>): ExternalIdentityProvider => ({
  provider_key: 'acme',
  display_name: 'Acme IdP',
  issuer: 'https://idp.acme.test',
  metadata_url: 'https://idp.acme.test/.well-known/openid-configuration',
  client_id: 'sso',
  ...over,
})

const providers: readonly ExternalIdentityProvider[] = [
  make({ provider_key: 'acme', display_name: 'Acme IdP', issuer: 'https://idp.acme.test' }),
  make({ provider_key: 'globex', display_name: 'Globex SSO', issuer: 'https://login.globex.test' }),
]

describe('filterProviders', () => {
  it('returns the same ref for an empty/whitespace query', () => {
    expect(filterProviders(providers, '')).toBe(providers)
    expect(filterProviders(providers, '  ')).toBe(providers)
  })
  it('matches display_name / provider_key / issuer (case-insensitive)', () => {
    expect(filterProviders(providers, 'globex').map((p) => p.provider_key)).toEqual(['globex'])
    expect(filterProviders(providers, 'ACME').map((p) => p.provider_key)).toEqual(['acme'])
    expect(filterProviders(providers, 'login.globex').map((p) => p.provider_key)).toEqual(['globex'])
  })
  it('returns [] when nothing matches', () => {
    expect(filterProviders(providers, 'zzz')).toEqual([])
  })
})

describe('parseClaimsJson', () => {
  it('accepts a JSON object', () => {
    expect(parseClaimsJson('{"sub":"x"}')).toEqual({ ok: true, value: { sub: 'x' } })
  })
  it('rejects malformed JSON without throwing', () => {
    expect(parseClaimsJson('{bad')).toEqual({ ok: false, error: 'syntax' })
  })
  it('rejects non-object JSON', () => {
    expect(parseClaimsJson('[1,2]')).toEqual({ ok: false, error: 'not_object' })
    expect(parseClaimsJson('"x"')).toEqual({ ok: false, error: 'not_object' })
  })
})
```

`app/lib/external-idps/__tests__/external-idps-form.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  buildCreatePayload,
  buildUpdatePayload,
  validateProviderForm,
  type ExternalIdpFormModel,
} from '../external-idps-form'

const base: ExternalIdpFormModel = {
  provider_key: 'acme',
  display_name: 'Acme IdP',
  issuer: 'https://idp.acme.test',
  metadata_url: 'https://idp.acme.test/.well-known/openid-configuration',
  client_id: 'sso-client',
  client_secret: '',
  algorithms: 'RS256, ES256',
  scopes: 'openid, profile',
  priority: '100',
  enabled: true,
  is_backup: false,
  tls_validation_enabled: true,
  signature_validation_enabled: true,
}

describe('validateProviderForm (create)', () => {
  it('passes a complete valid form', () => {
    expect(validateProviderForm(base, 'create')).toEqual({ valid: true, fieldErrors: {} })
  })
  it('flags each missing required field', () => {
    const r = validateProviderForm({ ...base, provider_key: '', display_name: '  ', client_id: '' }, 'create')
    expect(r.valid).toBe(false)
    expect(Object.keys(r.fieldErrors).sort()).toEqual(['client_id', 'display_name', 'provider_key'])
  })
  it('flags a bad provider_key shape', () => {
    expect(validateProviderForm({ ...base, provider_key: 'Bad Key!' }, 'create').fieldErrors.provider_key).toBeTruthy()
  })
  it('flags non-https issuer/metadata', () => {
    const r = validateProviderForm({ ...base, issuer: 'http://x', metadata_url: 'ftp://y' }, 'create')
    expect(r.fieldErrors.issuer).toBeTruthy()
    expect(r.fieldErrors.metadata_url).toBeTruthy()
  })
})

describe('validateProviderForm (edit)', () => {
  it('does not require provider_key (immutable on edit) and passes a valid edit', () => {
    expect(validateProviderForm({ ...base, provider_key: '' }, 'edit')).toEqual({ valid: true, fieldErrors: {} })
  })
  it('still rejects a non-https metadata_url when present', () => {
    expect(validateProviderForm({ ...base, metadata_url: 'http://x' }, 'edit').fieldErrors.metadata_url).toBeTruthy()
  })
})

describe('buildCreatePayload', () => {
  it('splits comma fields, coerces priority, and includes a non-empty secret', () => {
    expect(buildCreatePayload({ ...base, client_secret: 'topsecret' })).toEqual({
      provider_key: 'acme',
      display_name: 'Acme IdP',
      issuer: 'https://idp.acme.test',
      metadata_url: 'https://idp.acme.test/.well-known/openid-configuration',
      client_id: 'sso-client',
      client_secret: 'topsecret',
      allowed_algorithms: ['RS256', 'ES256'],
      scopes: ['openid', 'profile'],
      priority: 100,
      enabled: true,
      is_backup: false,
    })
  })
  it('omits client_secret when blank', () => {
    expect(buildCreatePayload(base).client_secret).toBeUndefined()
  })
})

describe('buildUpdatePayload', () => {
  it('omits client_secret when blank (keep existing) and includes the edit-only switches', () => {
    const p = buildUpdatePayload(base)
    expect(p.client_secret).toBeUndefined()
    expect(p.tls_validation_enabled).toBe(true)
    expect(p.signature_validation_enabled).toBe(true)
    expect(p.allowed_algorithms).toEqual(['RS256', 'ES256'])
  })
  it('includes a freshly typed secret', () => {
    expect(buildUpdatePayload({ ...base, client_secret: 'rotated' }).client_secret).toBe('rotated')
  })
})

describe('payload builders — cleared optional fields are omitted (not 0/[])', () => {
  it('omits priority/algorithms/scopes when the operator clears them', () => {
    const cleared: ExternalIdpFormModel = { ...base, priority: '', algorithms: '', scopes: '' }
    const create = buildCreatePayload(cleared)
    expect('priority' in create).toBe(false)
    expect('allowed_algorithms' in create).toBe(false)
    expect('scopes' in create).toBe(false)
    const update = buildUpdatePayload(cleared)
    expect('priority' in update).toBe(false)
    expect('allowed_algorithms' in update).toBe(false)
    expect('scopes' in update).toBe(false)
  })
})
```

- [ ] **Step 2: Run them — expect FAIL** (module-not-found).

- [ ] **Step 3: Create `app/lib/external-idps/external-idps-list.ts`:**

```ts
import type { ExternalIdentityProvider } from '@/types/external-idps.types'

export function filterProviders(
  providers: readonly ExternalIdentityProvider[],
  query: string,
): readonly ExternalIdentityProvider[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return providers
  return providers.filter((provider) =>
    [provider.display_name, provider.provider_key, provider.issuer].some(
      (field) => field != null && field.toLowerCase().includes(needle),
    ),
  )
}

// Parse the mapping-preview "sample claims" textarea into a JSON object. Never throws.
export type ParsedClaims =
  | { readonly ok: true; readonly value: Record<string, unknown> }
  | { readonly ok: false; readonly error: 'syntax' | 'not_object' }

export function parseClaimsJson(text: string): ParsedClaims {
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
```

- [ ] **Step 4: Create `app/lib/external-idps/external-idps-form.ts`:**

```ts
import type {
  ExternalIdpCreatePayload,
  ExternalIdpUpdatePayload,
} from '@/types/external-idps.types'

// Flat form model — the comma-separated text fields and the numeric priority are
// strings here (raw input); the payload builders normalize them.
export type ExternalIdpFormModel = {
  provider_key: string
  display_name: string
  issuer: string
  metadata_url: string
  client_id: string
  client_secret: string
  algorithms: string
  scopes: string
  priority: string
  enabled: boolean
  is_backup: boolean
  tls_validation_enabled: boolean
  signature_validation_enabled: boolean
}

const PROVIDER_KEY_RE = /^[a-z0-9_-]+$/u

export function validateProviderForm(
  form: ExternalIdpFormModel,
  mode: 'create' | 'edit',
): { valid: boolean; fieldErrors: Record<string, string> } {
  const fieldErrors: Record<string, string> = {}
  const required = (key: keyof ExternalIdpFormModel) => String(form[key]).trim().length > 0

  if (mode === 'create') {
    if (!required('provider_key')) fieldErrors.provider_key = 'required'
    else if (!PROVIDER_KEY_RE.test(form.provider_key.trim())) fieldErrors.provider_key = 'pattern'
    if (!required('display_name')) fieldErrors.display_name = 'required'
    if (!required('issuer')) fieldErrors.issuer = 'required'
    if (!required('metadata_url')) fieldErrors.metadata_url = 'required'
    if (!required('client_id')) fieldErrors.client_id = 'required'
  }

  // HTTPS is required for issuer + metadata_url whenever a value is present (both modes).
  if (form.issuer.trim() && !form.issuer.trim().startsWith('https://')) fieldErrors.issuer = 'https'
  if (form.metadata_url.trim() && !form.metadata_url.trim().startsWith('https://'))
    fieldErrors.metadata_url = 'https'

  return { valid: Object.keys(fieldErrors).length === 0, fieldErrors }
}

function splitList(value: string): readonly string[] {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
}

// Backend rules: priority is `sometimes|integer|min:1`; allowed_algorithms/scopes are
// `sometimes|array|min:1`. So OMIT any of these the operator cleared (the backend keeps
// the existing value / applies its default) rather than sending 0 or [] and forcing a
// misleading 422. The happy path (defaults '100' / 'RS256' / 'openid') always includes
// them.
function optionalFields(form: ExternalIdpFormModel): {
  allowed_algorithms?: readonly string[]
  scopes?: readonly string[]
  priority?: number
} {
  const algorithms = splitList(form.algorithms)
  const scopes = splitList(form.scopes)
  const priority = form.priority.trim() ? Number(form.priority) : Number.NaN
  return {
    ...(algorithms.length ? { allowed_algorithms: algorithms } : {}),
    ...(scopes.length ? { scopes } : {}),
    ...(Number.isFinite(priority) && priority >= 1 ? { priority } : {}),
  }
}

export function buildCreatePayload(form: ExternalIdpFormModel): ExternalIdpCreatePayload {
  return {
    provider_key: form.provider_key.trim(),
    display_name: form.display_name.trim(),
    issuer: form.issuer.trim(),
    metadata_url: form.metadata_url.trim(),
    client_id: form.client_id.trim(),
    ...(form.client_secret.trim() ? { client_secret: form.client_secret } : {}),
    ...optionalFields(form),
    enabled: form.enabled,
    is_backup: form.is_backup,
  }
}

export function buildUpdatePayload(form: ExternalIdpFormModel): ExternalIdpUpdatePayload {
  return {
    display_name: form.display_name.trim(),
    metadata_url: form.metadata_url.trim(),
    client_id: form.client_id.trim(),
    ...(form.client_secret.trim() ? { client_secret: form.client_secret } : {}),
    ...optionalFields(form),
    enabled: form.enabled,
    is_backup: form.is_backup,
    tls_validation_enabled: form.tls_validation_enabled,
    signature_validation_enabled: form.signature_validation_enabled,
  }
}
```

- [ ] **Step 5: Run them — expect PASS.**

- [ ] **Step 6: Commit:**

```bash
git add app/lib/external-idps/external-idps-list.ts app/lib/external-idps/external-idps-form.ts app/lib/external-idps/__tests__/external-idps-list.spec.ts app/lib/external-idps/__tests__/external-idps-form.spec.ts
git commit -m "$(cat <<'EOF'
feat(sso-admin-frontend): pure external-idp helpers (search, form validation, payloads, claims parse)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Task-scoped DoD:** `npm run typecheck && npm run lint && npm run format:check && npm run test -- app/lib/external-idps/__tests__/external-idps-list.spec.ts app/lib/external-idps/__tests__/external-idps-form.spec.ts` — all green.

---

### Task 10.3: `external-idps.api.ts` service (single network seam)

**Files:**
- Create: `app/services/external-idps.api.ts`
- Test: `app/services/__tests__/external-idps.api.spec.ts`

**Interfaces:**
- Consumes: `apiClient` (`get`/`post`/`patch`/`delete`); the response/payload types from `@/types/external-idps.types`.
- Produces: `externalIdpsApi` with `list()`, `show(key)`, `create(payload)`, `update(key, payload)`, `previewMapping(key, claims)`, `remove(key)` (named `remove`, not `delete` — `delete` is a reserved word and oxlint/eslint dislike it as a method name in some configs; the legacy used `delete` but `remove` is safer). Paths under `/api/admin/external-idps`; `key` path-encoded.

- [ ] **Step 1: Write the failing test** — `app/services/__tests__/external-idps.api.spec.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { externalIdpsApi } from '../external-idps.api'
import { apiClient } from '@/lib/api/api-client'

vi.mock('@/lib/api/api-client', () => ({
  apiClient: {
    get: vi.fn<(path: string) => Promise<unknown>>(),
    post: vi.fn<(path: string, body?: unknown) => Promise<unknown>>(),
    patch: vi.fn<(path: string, body?: unknown) => Promise<unknown>>(),
    delete: vi.fn<(path: string) => Promise<unknown>>(),
  },
}))

const get = vi.mocked(apiClient.get)
const post = vi.mocked(apiClient.post)
const patch = vi.mocked(apiClient.patch)
const del = vi.mocked(apiClient.delete)

afterEach(() => {
  vi.clearAllMocks()
})

describe('externalIdpsApi', () => {
  it('list GETs the collection', async () => {
    get.mockResolvedValue({ providers: [] })
    await externalIdpsApi.list()
    expect(get).toHaveBeenCalledWith('/api/admin/external-idps')
  })
  it('show GETs the keyed resource', async () => {
    get.mockResolvedValue({ provider: {} })
    await externalIdpsApi.show('acme')
    expect(get).toHaveBeenCalledWith('/api/admin/external-idps/acme')
  })
  it('create POSTs the payload', async () => {
    post.mockResolvedValue({ provider: {} })
    await externalIdpsApi.create({ provider_key: 'acme', display_name: 'A', issuer: 'https://i', metadata_url: 'https://m', client_id: 'c' })
    expect(post).toHaveBeenCalledWith('/api/admin/external-idps', expect.objectContaining({ provider_key: 'acme' }))
  })
  it('update PATCHes the keyed resource', async () => {
    patch.mockResolvedValue({ provider: {} })
    await externalIdpsApi.update('acme', { display_name: 'B' })
    expect(patch).toHaveBeenCalledWith('/api/admin/external-idps/acme', { display_name: 'B' })
  })
  it('previewMapping POSTs claims to the mapping-preview endpoint', async () => {
    post.mockResolvedValue({ preview: {} })
    await externalIdpsApi.previewMapping('acme', { sub: 'x' })
    expect(post).toHaveBeenCalledWith('/api/admin/external-idps/acme/mapping-preview', { claims: { sub: 'x' } })
  })
  it('remove DELETEs the keyed resource (path-encoded)', async () => {
    del.mockResolvedValue(undefined)
    await externalIdpsApi.remove('a/b')
    expect(del).toHaveBeenCalledWith('/api/admin/external-idps/a%2Fb')
  })
})
```

- [ ] **Step 2: Run it — expect FAIL** (module-not-found).

- [ ] **Step 3: Create `app/services/external-idps.api.ts`:**

```ts
import { apiClient } from '@/lib/api/api-client'
import type {
  ExternalIdpCreatePayload,
  ExternalIdpDetailResponse,
  ExternalIdpListResponse,
  ExternalIdpMappingPreviewResponse,
  ExternalIdpUpdatePayload,
} from '@/types/external-idps.types'

const BASE = '/api/admin/external-idps'

function keyPath(key: string): string {
  return `${BASE}/${encodeURIComponent(key)}`
}

export const externalIdpsApi = {
  list(): Promise<ExternalIdpListResponse> {
    return apiClient.get<ExternalIdpListResponse>(BASE)
  },
  show(key: string): Promise<ExternalIdpDetailResponse> {
    return apiClient.get<ExternalIdpDetailResponse>(keyPath(key))
  },
  create(payload: ExternalIdpCreatePayload): Promise<ExternalIdpDetailResponse> {
    return apiClient.post<ExternalIdpDetailResponse>(BASE, payload)
  },
  update(key: string, payload: ExternalIdpUpdatePayload): Promise<ExternalIdpDetailResponse> {
    return apiClient.patch<ExternalIdpDetailResponse>(keyPath(key), payload)
  },
  previewMapping(
    key: string,
    claims: Readonly<Record<string, unknown>>,
  ): Promise<ExternalIdpMappingPreviewResponse> {
    return apiClient.post<ExternalIdpMappingPreviewResponse>(`${keyPath(key)}/mapping-preview`, {
      claims,
    })
  },
  remove(key: string): Promise<void> {
    return apiClient.delete<void>(keyPath(key))
  },
}
```

- [ ] **Step 4: Run it — expect PASS.**

- [ ] **Step 5: Commit:**

```bash
git add app/services/external-idps.api.ts app/services/__tests__/external-idps.api.spec.ts
git commit -m "$(cat <<'EOF'
feat(sso-admin-frontend): external-idps.api service over the admin api-client

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Task-scoped DoD:** `npm run typecheck && npm run lint && npm run format:check && npm run test -- app/services/__tests__/external-idps.api.spec.ts` — all green.

---

### Task 10.4: `useExternalIdpsList` SSR composable

**Files:**
- Create: `app/composables/useExternalIdpsList.ts`
- Test: `app/composables/__tests__/useExternalIdpsList.nuxt.spec.ts`

**Interfaces:**
- Consumes: `useAsyncData`; `externalIdpsApi` (`@/services/external-idps.api`); `resolveExternalIdpsViewState`, `ExternalIdpsViewState` (`@/lib/external-idps/external-idps-view-state`); `ApiError`, `getLastRequestId`; `ExternalIdentityProvider`, `ExternalIdpListResponse`.
- Produces: `useExternalIdpsList(): { providers: Ref<readonly ExternalIdentityProvider[] | null>; viewState; isStale; requestId; pending; refresh }` — SSR-resolves the list, view-state + stale + requestId pattern (mirrors `useSessionsList`).

- [ ] **Step 1: Write the failing test** — `app/composables/__tests__/useExternalIdpsList.nuxt.spec.ts` (mirror `useSessionsList.nuxt.spec.ts` — mock `useAsyncData`, spy `externalIdpsApi.list`):

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { ApiError } from '@/lib/api/api-client'
import type { ExternalIdentityProvider } from '@/types/external-idps.types'

const listMock = vi.fn<() => Promise<unknown>>()
vi.mock('@/services/external-idps.api', () => ({ externalIdpsApi: { list: listMock } }))

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

const { useExternalIdpsList } = await import('../useExternalIdpsList')

const provider: ExternalIdentityProvider = {
  provider_key: 'acme', display_name: 'Acme', issuer: 'https://i', metadata_url: 'https://m', client_id: 'c',
}

beforeEach(() => {
  dataRef.value = null
  pendingRef.value = false
  errorRef.value = null
  listMock.mockReset()
  listMock.mockResolvedValue({ providers: [] })
})
afterEach(() => {
  vi.clearAllMocks()
})

describe('useExternalIdpsList', () => {
  it('fetches the provider list', () => {
    useExternalIdpsList()
    expect(listMock).toHaveBeenCalledTimes(1)
  })
  it('maps loading / empty / ready', () => {
    const r = useExternalIdpsList()
    pendingRef.value = true
    expect(r.viewState.value).toBe('loading')
    pendingRef.value = false
    dataRef.value = { providers: [] }
    expect(r.viewState.value).toBe('empty')
    dataRef.value = { providers: [provider] }
    expect(r.viewState.value).toBe('ready')
    expect(r.providers.value).toEqual([provider])
  })
  it('keeps the last-good list and flags stale on a refresh error', () => {
    const r = useExternalIdpsList()
    dataRef.value = { providers: [provider] }
    errorRef.value = new ApiError(500, 'boom')
    expect(r.viewState.value).toBe('ready')
    expect(r.isStale.value).toBe(true)
  })
  it('surfaces the ApiError requestId', () => {
    const r = useExternalIdpsList()
    errorRef.value = new ApiError(403, 'no', undefined, {}, 'req-idp')
    expect(r.requestId.value).toBe('req-idp')
  })
})
```

- [ ] **Step 2: Run it — expect FAIL** (module-not-found).

- [ ] **Step 3: Create `app/composables/useExternalIdpsList.ts`:**

```ts
import { computed, type ComputedRef, type Ref } from 'vue'
import { ApiError, getLastRequestId } from '@/lib/api/api-client'
import { externalIdpsApi } from '@/services/external-idps.api'
import {
  resolveExternalIdpsViewState,
  type ExternalIdpsViewState,
} from '@/lib/external-idps/external-idps-view-state'
import type {
  ExternalIdentityProvider,
  ExternalIdpListResponse,
} from '@/types/external-idps.types'

export type UseExternalIdpsListReturn = {
  readonly providers: Ref<readonly ExternalIdentityProvider[] | null>
  readonly viewState: ComputedRef<ExternalIdpsViewState>
  readonly isStale: ComputedRef<boolean>
  readonly requestId: ComputedRef<string | null>
  readonly pending: Ref<boolean>
  readonly refresh: () => Promise<void>
}

export function useExternalIdpsList(): UseExternalIdpsListReturn {
  // SSR-resolves the masked provider list (no secret in the DTO — has_client_secret is
  // a boolean). The token stays in Nitro event.context.
  const { data, pending, error, refresh } = useAsyncData<ExternalIdpListResponse>(
    'admin-external-idps-list',
    () => externalIdpsApi.list(),
  )

  const providers = computed<readonly ExternalIdentityProvider[] | null>(
    () => data.value?.providers ?? null,
  )

  const viewState = computed<ExternalIdpsViewState>(() =>
    resolveExternalIdpsViewState({
      pending: pending.value,
      error: error.value,
      providers: providers.value,
    }),
  )

  const isStale = computed<boolean>(() => Boolean(error.value) && providers.value !== null)

  const requestId = computed<string | null>(() =>
    error.value instanceof ApiError
      ? (error.value.requestId ?? getLastRequestId())
      : getLastRequestId(),
  )

  return {
    providers,
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
git add app/composables/useExternalIdpsList.ts app/composables/__tests__/useExternalIdpsList.nuxt.spec.ts
git commit -m "$(cat <<'EOF'
feat(sso-admin-frontend): useExternalIdpsList SSR composable

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Task-scoped DoD:** `npm run typecheck && npm run lint && npm run format:check && npm run test -- app/composables/__tests__/useExternalIdpsList.nuxt.spec.ts` — all green.

---

### Task 10.5: `ExternalIdpsTable.vue` (Swiss provider table)

**Files:**
- Create: `app/components/external-idps/ExternalIdpsTable.vue`
- Test: `app/components/external-idps/__tests__/ExternalIdpsTable.spec.ts`

**Interfaces:**
- Consumes: `UiDataList` (+ `UiDataListColumn`, `UiDataListRow`), `UiStatusBadge`, `UiFolio` (`@/components/ui/*`); `resolveHealthTone`, `resolveEnabledTone` (`@/lib/external-idps/external-idps-view-state`); `ExternalIdentityProvider` (`@/types/external-idps.types`).
- Produces: `ExternalIdpsTable.vue` — props `providers: readonly ExternalIdentityProvider[]`, `caption`, `providerLabel`, `keyLabel`, `statusLabel`, `healthLabel`, `enabledText: string`, `disabledText: string`, `healthLabels: Readonly<Record<string, string>>` (status → display); emits `select(providerKey: string)`. The provider cell is a keyboard-reachable button (emits `select`); `provider_key` renders mono (`UiFolio variant="id"`); enabled + health each render a tone+label `UiStatusBadge` (never colour-alone).

> ponytail: presentational only — no fetch, no privileged action, no i18n inside (labels passed as props, like the other domain tables). Explicit `Ui*` imports → plain jsdom `mount` spec.

- [ ] **Step 1: Write the failing test** — `app/components/external-idps/__tests__/ExternalIdpsTable.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ExternalIdpsTable from '../ExternalIdpsTable.vue'
import type { ExternalIdentityProvider } from '@/types/external-idps.types'

const providers: readonly ExternalIdentityProvider[] = [
  { provider_key: 'acme', display_name: 'Acme IdP', issuer: 'https://i', metadata_url: 'https://m', client_id: 'c', enabled: true, health_status: 'healthy' },
  { provider_key: 'globex', display_name: 'Globex SSO', issuer: 'https://i2', metadata_url: 'https://m2', client_id: 'c2', enabled: false, health_status: 'unhealthy' },
]

const props = {
  providers,
  caption: 'Providers',
  providerLabel: 'Provider',
  keyLabel: 'Key',
  statusLabel: 'Status',
  healthLabel: 'Health',
  enabledText: 'Enabled',
  disabledText: 'Disabled',
  healthLabels: { healthy: 'Healthy', unhealthy: 'Unhealthy', unknown: 'Unknown' },
}

describe('ExternalIdpsTable', () => {
  it('renders one selectable row per provider with status + health labels', () => {
    const wrapper = mount(ExternalIdpsTable, { props })
    expect(wrapper.find('[data-testid="external-idp-select-acme"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="external-idp-select-globex"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Enabled')
    expect(wrapper.text()).toContain('Disabled')
    expect(wrapper.text()).toContain('Healthy')
    expect(wrapper.text()).toContain('Unhealthy')
  })
  it('emits select with the provider key on provider-cell click', async () => {
    const wrapper = mount(ExternalIdpsTable, { props })
    await wrapper.find('[data-testid="external-idp-select-acme"]').trigger('click')
    expect(wrapper.emitted('select')).toEqual([['acme']])
  })
})
```

- [ ] **Step 2: Run it — expect FAIL** (component does not exist).

- [ ] **Step 3: Create `app/components/external-idps/ExternalIdpsTable.vue`:**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import UiDataList, {
  type UiDataListColumn,
  type UiDataListRow,
} from '@/components/ui/UiDataList.vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import UiFolio from '@/components/ui/UiFolio.vue'
import {
  resolveEnabledTone,
  resolveHealthTone,
} from '@/lib/external-idps/external-idps-view-state'
import type { ExternalIdentityProvider } from '@/types/external-idps.types'

const props = defineProps<{
  readonly providers: readonly ExternalIdentityProvider[]
  readonly caption: string
  readonly providerLabel: string
  readonly keyLabel: string
  readonly statusLabel: string
  readonly healthLabel: string
  readonly enabledText: string
  readonly disabledText: string
  readonly healthLabels: Readonly<Record<string, string>>
}>()

const emit = defineEmits<{
  (event: 'select', providerKey: string): void
}>()

const columns = computed<readonly UiDataListColumn[]>(() => [
  { key: 'provider', label: props.providerLabel, align: 'left' },
  { key: 'pkey', label: props.keyLabel, align: 'left' },
  { key: 'status', label: props.statusLabel, align: 'left' },
  { key: 'health', label: props.healthLabel, align: 'right' },
])

const rows = computed<readonly UiDataListRow[]>(() =>
  props.providers.map((provider) => ({
    id: provider.provider_key,
    provider: provider.display_name,
    pkey: provider.provider_key,
    enabled: provider.enabled ? 'on' : 'off',
    health: provider.health_status ?? 'unknown',
  })),
)

function providerByKey(key: string): ExternalIdentityProvider | undefined {
  return props.providers.find((provider) => provider.provider_key === key)
}

function healthText(status: string): string {
  return props.healthLabels[status] ?? status
}
</script>

<template>
  <UiDataList :caption="caption" :columns="columns" :rows="rows">
    <template #cell(provider)="{ row }">
      <button
        type="button"
        class="external-idps-table__select"
        :data-testid="`external-idp-select-${row.id}`"
        @click="emit('select', String(row.id))"
      >
        {{ row['provider'] }}
      </button>
    </template>

    <template #cell(pkey)="{ row }">
      <UiFolio :value="String(row['pkey'])" variant="id" />
    </template>

    <template #cell(status)="{ row }">
      <UiStatusBadge
        :tone="resolveEnabledTone(providerByKey(String(row.id))?.enabled)"
        :label="row['enabled'] === 'on' ? enabledText : disabledText"
      />
    </template>

    <template #cell(health)="{ row }">
      <UiStatusBadge
        :tone="resolveHealthTone(String(row['health']))"
        :label="healthText(String(row['health']))"
      />
    </template>
  </UiDataList>
</template>

<style scoped>
.external-idps-table__select {
  appearance: none;
  padding: 0;
  background: none;
  border: none;
  font: inherit;
  color: var(--accent);
  cursor: pointer;
  text-align: left;
}
.external-idps-table__select:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
</style>
```

- [ ] **Step 4: Run it — expect PASS.**

- [ ] **Step 5: Commit:**

```bash
git add app/components/external-idps/ExternalIdpsTable.vue app/components/external-idps/__tests__/ExternalIdpsTable.spec.ts
git commit -m "$(cat <<'EOF'
feat(sso-admin-frontend): Swiss ExternalIdpsTable (provider list, status + health)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Task-scoped DoD:** `npm run typecheck && npm run lint && npm run format:check && npm run test -- app/components/external-idps/__tests__/ExternalIdpsTable.spec.ts` — all green.

---

### Task 10.6: `/external-idps` page — six states, search, detail drawer (read surface)

**Files:**
- Modify: `app/pages/external-idps.vue` (replace the placeholder body)
- Modify: `app/locales/en.json` + `app/locales/id.json` (extend the `external_idps.*` block — see Step 3)
- Test: `app/pages/__tests__/external-idps.page.nuxt.spec.ts`

**Interfaces:**
- Consumes: `useExternalIdpsList` (10.4); `filterProviders` (10.2); `ExternalIdpsTable` (10.5); `useSessionStore`; `useI18n`; `UiSkeleton`, `UiStatusView`, `UiEmptyState`, `UiInput`, `UiFormField`, `UiFolio`, `UiButton`, `UiStatusBadge`, `UiDetailDrawer` (`@/components/ui/*`); `resolveHealthTone`, `resolveEnabledTone` (10.1); `ExternalIdentityProvider`.
- Produces (`app/pages/external-idps.vue`): the read surface — a search `UiInput`, the `ExternalIdpsTable`, an "Add provider" button (gated `canWrite`), and a read-only `UiDetailDrawer` (selected provider → enabled + health badges, provider_key/client_id/issuer/metadata_url/endpoints/jwks mono, algorithms, scopes, priority, is_backup, tls/signature validation, `has_client_secret` as "configured"/"not set"). Six states. Declares the canonical handler names Tasks 10.8–10.10 fill: `onSelectProvider`, `onCloseDrawer`, `onRefresh`, plus stubs `onCreateRequested()`, `onEditRequested(p: ExternalIdentityProvider)`, `onPreviewRequested(p: ExternalIdentityProvider)`, `onDeleteRequested(p: ExternalIdentityProvider)`. `canWrite`/`canDelete` computeds, `successMessage` region.

> ponytail: no per-provider GET (the list DTO is complete) and no pagination (small provider set — search covers it). The `has_client_secret` boolean renders as a status, never the secret.

- [ ] **Step 1: Write the failing test** — `app/pages/__tests__/external-idps.page.nuxt.spec.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import enLocale from '@/locales/en.json'
import type { ExternalIdpsViewState } from '@/lib/external-idps/external-idps-view-state'
import type { ExternalIdentityProvider } from '@/types/external-idps.types'

const PROVIDER: ExternalIdentityProvider = {
  provider_key: 'acme',
  display_name: 'Acme IdP',
  issuer: 'https://idp.acme.test',
  metadata_url: 'https://idp.acme.test/.well-known/openid-configuration',
  client_id: 'sso-client',
  jwks_uri: 'https://idp.acme.test/jwks',
  allowed_algorithms: ['RS256'],
  scopes: ['openid', 'profile'],
  priority: 100,
  enabled: true,
  is_backup: false,
  tls_validation_enabled: true,
  signature_validation_enabled: true,
  has_client_secret: true,
  health_status: 'healthy',
}

const providersRef = ref<readonly ExternalIdentityProvider[] | null>([PROVIDER])
const viewStateRef = ref<ExternalIdpsViewState>('ready')
const refreshMock = vi.fn<() => Promise<void>>(async () => {})
vi.mock('@/composables/useExternalIdpsList', () => ({
  useExternalIdpsList: () => ({
    providers: providersRef,
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
    principal: { display_name: 'Admin Sentinel', subject_id: 'admin-1' },
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
      if (!params) return val
      return val.replace(/\{(\w+)\}/gu, (_: string, k: string) => String(params[k] ?? ''))
    },
  }),
}))

mockNuxtImport('navigateTo', () => vi.fn<(...a: unknown[]) => Promise<void>>(async () => {}))

const ExternalIdpsPage = (await import('../external-idps.vue')).default

beforeEach(() => {
  permitted = ['admin.external-idps.read']
  providersRef.value = [PROVIDER]
  viewStateRef.value = 'ready'
  refreshMock.mockReset()
})
afterEach(() => {
  vi.clearAllMocks()
})

describe('external-idps page — states', () => {
  it('renders the loading skeleton', async () => {
    viewStateRef.value = 'loading'
    const wrapper = await mountSuspended(ExternalIdpsPage)
    expect(wrapper.find('[data-page="external-idps"]').exists()).toBe(true)
    expect(wrapper.find(`[aria-label="${enLocale.external_idps.loading}"]`).exists()).toBe(true)
  })
  it('renders the forbidden surface', async () => {
    viewStateRef.value = 'forbidden'
    const wrapper = await mountSuspended(ExternalIdpsPage)
    expect(wrapper.text()).toContain(enLocale.external_idps.forbidden_title)
  })
  it('renders the empty surface', async () => {
    viewStateRef.value = 'empty'
    providersRef.value = []
    const wrapper = await mountSuspended(ExternalIdpsPage)
    expect(wrapper.text()).toContain(enLocale.external_idps.empty_title)
  })
  it('renders the providers table in the ready state', async () => {
    const wrapper = await mountSuspended(ExternalIdpsPage)
    expect(wrapper.find('[data-testid="external-idp-select-acme"]').exists()).toBe(true)
  })
})

describe('external-idps page — search + detail drawer', () => {
  it('filters the table by the search query', async () => {
    providersRef.value = [PROVIDER, { ...PROVIDER, provider_key: 'globex', display_name: 'Globex SSO' }]
    const wrapper = await mountSuspended(ExternalIdpsPage)
    await wrapper.find('[data-testid="external-idps-search"]').setValue('globex')
    await flushPromises()
    expect(wrapper.find('[data-testid="external-idp-select-globex"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="external-idp-select-acme"]').exists()).toBe(false)
  })
  it('opens the read-only drawer with config + secret-configured status on row select', async () => {
    const wrapper = await mountSuspended(ExternalIdpsPage)
    await wrapper.find('[data-testid="external-idp-select-acme"]').trigger('click')
    await flushPromises()
    const drawer = wrapper.find('[data-testid="external-idp-detail"]')
    expect(drawer.exists()).toBe(true)
    expect(drawer.text()).toContain('sso-client') // client_id
    expect(drawer.text()).toContain('idp.acme.test') // issuer/metadata
    expect(drawer.text()).toContain(enLocale.external_idps.secret_configured)
  })
  it('hides the Add button without the write capability', async () => {
    const wrapper = await mountSuspended(ExternalIdpsPage)
    expect(wrapper.find('[data-testid="external-idps-create"]').exists()).toBe(false)
  })
  it('shows the Add button with the write capability', async () => {
    permitted = ['admin.external-idps.read', 'admin.external-idps.write']
    const wrapper = await mountSuspended(ExternalIdpsPage)
    expect(wrapper.find('[data-testid="external-idps-create"]').exists()).toBe(true)
  })
})
```

- [ ] **Step 2: Run it — expect FAIL** (placeholder renders only `<h1>`).

- [ ] **Step 3: Extend the `external_idps.*` locale block** (BOTH files, add net-new keys; keep parity):

`en.json` → `external_idps`:
```json
    "signed_in_as": "Signed in as {name}",
    "search_label": "Search providers",
    "search_placeholder": "Search by name, key, issuer...",
    "btn_add": "Add provider",
    "list_caption": "External identity providers",
    "col_health": "Health",
    "status_enabled": "Enabled",
    "status_disabled": "Disabled",
    "health_healthy": "Healthy",
    "health_unhealthy": "Unhealthy",
    "health_unknown": "Unknown",
    "secret_configured": "Secret configured",
    "secret_not_set": "No secret set",
    "ov_provider_key": "Provider key",
    "ov_client_id": "Client ID",
    "ov_issuer": "Issuer",
    "ov_metadata_url": "Metadata URL",
    "ov_authorization_endpoint": "Authorization endpoint",
    "ov_token_endpoint": "Token endpoint",
    "ov_userinfo_endpoint": "Userinfo endpoint",
    "ov_jwks_uri": "JWKS URI",
    "ov_algorithms": "Algorithms",
    "ov_scopes": "Scopes",
    "ov_priority": "Priority",
    "ov_backup": "Backup failover",
    "ov_tls": "TLS validation",
    "ov_signature": "Signature validation",
    "on": "On",
    "off": "Off"
```
`id.json` → `external_idps`:
```json
    "signed_in_as": "Masuk sebagai {name}",
    "search_label": "Cari provider",
    "search_placeholder": "Cari nama, key, issuer...",
    "btn_add": "Tambah provider",
    "list_caption": "Penyedia identitas eksternal",
    "col_health": "Kesehatan",
    "status_enabled": "Aktif",
    "status_disabled": "Nonaktif",
    "health_healthy": "Sehat",
    "health_unhealthy": "Tidak sehat",
    "health_unknown": "Tidak diketahui",
    "secret_configured": "Secret terkonfigurasi",
    "secret_not_set": "Tidak ada secret",
    "ov_provider_key": "Provider key",
    "ov_client_id": "Client ID",
    "ov_issuer": "Issuer",
    "ov_metadata_url": "Metadata URL",
    "ov_authorization_endpoint": "Authorization endpoint",
    "ov_token_endpoint": "Token endpoint",
    "ov_userinfo_endpoint": "Userinfo endpoint",
    "ov_jwks_uri": "JWKS URI",
    "ov_algorithms": "Algoritma",
    "ov_scopes": "Scope",
    "ov_priority": "Prioritas",
    "ov_backup": "Failover cadangan",
    "ov_tls": "Validasi TLS",
    "ov_signature": "Validasi tanda tangan",
    "on": "Aktif",
    "off": "Nonaktif"
```

- [ ] **Step 4: Replace `app/pages/external-idps.vue`** (read surface; write wiring lands in 10.8–10.10):

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useSessionStore } from '@/stores/session.store'
import { useI18n } from '@/composables/useI18n'
import { useExternalIdpsList } from '@/composables/useExternalIdpsList'
import { filterProviders } from '@/lib/external-idps/external-idps-list'
import {
  resolveEnabledTone,
  resolveHealthTone,
} from '@/lib/external-idps/external-idps-view-state'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiFormField from '@/components/ui/UiFormField.vue'
import UiFolio from '@/components/ui/UiFolio.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import UiDetailDrawer from '@/components/ui/UiDetailDrawer.vue'
import ExternalIdpsTable from '@/components/external-idps/ExternalIdpsTable.vue'
import type { ExternalIdentityProvider } from '@/types/external-idps.types'

definePageMeta({
  name: 'admin.external-idps',
  layout: 'admin',
  requiresAdmin: true,
  permissions: ['admin.external-idps.read'],
})

const { t } = useI18n()
const store = useSessionStore()

await useAsyncData('admin-external-idps-principal', () => store.ensureSession())

const { providers, viewState, requestId, isStale, refresh } = useExternalIdpsList()

const providerList = computed<readonly ExternalIdentityProvider[]>(() => providers.value ?? [])
const searchQuery = ref('')
const filtered = computed<readonly ExternalIdentityProvider[]>(() =>
  filterProviders(providerList.value, searchQuery.value),
)

const canWrite = computed<boolean>(() => store.hasPermission('admin.external-idps.write'))
// Delete is double-gated: write + sessions.terminate (the backend also requires the
// session-management role, which the UI cannot see — it is enforced server-side).
const canDelete = computed<boolean>(
  () => canWrite.value && store.hasPermission('admin.sessions.terminate'),
)

const healthLabels = computed<Readonly<Record<string, string>>>(() => ({
  healthy: t('external_idps.health_healthy'),
  unhealthy: t('external_idps.health_unhealthy'),
  unknown: t('external_idps.health_unknown'),
}))

const selectedKey = ref<string | null>(null)
const selectedProvider = computed<ExternalIdentityProvider | null>(
  () => providerList.value.find((p) => p.provider_key === selectedKey.value) ?? null,
)

const successMessage = ref<string | null>(null)

function onSelectProvider(key: string): void {
  selectedKey.value = key
}
function onCloseDrawer(): void {
  selectedKey.value = null
}
async function onRefresh(): Promise<void> {
  await refresh()
}

// Handler bodies filled by later tasks (declared once; never renamed):
function onCreateRequested(): void {
  /* Task 10.8 */
}
function onEditRequested(_provider: ExternalIdentityProvider): void {
  /* Task 10.8 */
}
function onPreviewRequested(_provider: ExternalIdentityProvider): void {
  /* Task 10.9 */
}
function onDeleteRequested(_provider: ExternalIdentityProvider): void {
  /* Task 10.10 */
}
</script>

<template>
  <section class="external-idps" data-page="external-idps" data-admin-shell>
    <header class="external-idps__hero">
      <span class="external-idps__eyebrow">{{ t('external_idps.eyebrow') }}</span>
      <div class="external-idps__heading">
        <div>
          <h1 class="external-idps__title">{{ t('external_idps.title') }}</h1>
          <p class="external-idps__summary">{{ t('external_idps.summary') }}</p>
          <p class="external-idps__principal" data-principal-name>
            {{ t('external_idps.signed_in_as', { name: store.principal?.display_name ?? '—' }) }}
          </p>
        </div>
        <UiButton
          v-if="canWrite"
          variant="primary"
          size="sm"
          data-testid="external-idps-create"
          @click="onCreateRequested"
        >
          {{ t('external_idps.btn_add') }}
        </UiButton>
      </div>
    </header>

    <p
      v-if="successMessage"
      class="external-idps__success"
      role="status"
      aria-live="polite"
      data-testid="external-idps-action-success"
    >
      {{ successMessage }}
    </p>

    <UiSkeleton v-if="viewState === 'loading'" :rows="6" :label="t('external_idps.loading')" />

    <UiStatusView
      v-else-if="viewState === 'forbidden'"
      tone="forbidden"
      :eyebrow="t('external_idps.eyebrow')"
      :title="t('external_idps.forbidden_title')"
      :description="t('common.forbidden_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="viewState === 'unauthenticated'"
      tone="step_up"
      :eyebrow="t('external_idps.eyebrow')"
      :title="t('common.session_expired_title')"
      :description="t('common.session_expired_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="viewState === 'error'"
      tone="error"
      :eyebrow="t('external_idps.eyebrow')"
      :title="t('external_idps.error_title')"
      :description="t('common.error_loading_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    >
      <template #actions>
        <UiButton variant="secondary" size="sm" data-testid="external-idps-refresh" @click="onRefresh">
          {{ t('common.btn_refresh') }}
        </UiButton>
      </template>
    </UiStatusView>

    <UiEmptyState
      v-else-if="viewState === 'empty'"
      :title="t('external_idps.empty_title')"
      :description="t('external_idps.empty_desc')"
    />

    <template v-else>
      <div v-if="isStale" class="external-idps__banner" role="status">
        {{ t('common.error_loading_desc') }}
      </div>

      <UiFormField id="external-idps-search" :label="t('external_idps.search_label')">
        <UiInput
          id="external-idps-search"
          v-model="searchQuery"
          :placeholder="t('external_idps.search_placeholder')"
          data-testid="external-idps-search"
        />
      </UiFormField>

      <ExternalIdpsTable
        :providers="filtered"
        :caption="t('external_idps.list_caption')"
        :provider-label="t('external_idps.col_provider')"
        :key-label="t('external_idps.col_key')"
        :status-label="t('external_idps.col_status')"
        :health-label="t('external_idps.col_health')"
        :enabled-text="t('external_idps.status_enabled')"
        :disabled-text="t('external_idps.status_disabled')"
        :health-labels="healthLabels"
        @select="onSelectProvider"
      />

      <UiDetailDrawer
        v-if="selectedProvider"
        :open="selectedProvider !== null"
        title-id="external-idp-detail-drawer"
        :title="selectedProvider.display_name"
        :description="selectedProvider.issuer"
        :close-label="t('common.close')"
        wide
        @close="onCloseDrawer"
      >
        <div class="idp-detail" data-testid="external-idp-detail">
          <div class="idp-detail__head">
            <UiStatusBadge
              :tone="resolveEnabledTone(selectedProvider.enabled)"
              :label="selectedProvider.enabled ? t('external_idps.status_enabled') : t('external_idps.status_disabled')"
            />
            <UiStatusBadge
              :tone="resolveHealthTone(selectedProvider.health_status)"
              :label="healthLabels[selectedProvider.health_status ?? 'unknown'] ?? (selectedProvider.health_status ?? 'unknown')"
            />
            <UiStatusBadge
              :tone="selectedProvider.has_client_secret ? 'info' : 'neutral'"
              :label="selectedProvider.has_client_secret ? t('external_idps.secret_configured') : t('external_idps.secret_not_set')"
            />
          </div>
          <dl class="idp-detail__grid">
            <div>
              <dt>{{ t('external_idps.ov_provider_key') }}</dt>
              <dd><UiFolio :value="selectedProvider.provider_key" variant="id" /></dd>
            </div>
            <div>
              <dt>{{ t('external_idps.ov_client_id') }}</dt>
              <dd><UiFolio :value="selectedProvider.client_id" variant="id" /></dd>
            </div>
            <div class="idp-detail__wide">
              <dt>{{ t('external_idps.ov_issuer') }}</dt>
              <dd><UiFolio :value="selectedProvider.issuer" variant="id" /></dd>
            </div>
            <div class="idp-detail__wide">
              <dt>{{ t('external_idps.ov_metadata_url') }}</dt>
              <dd><UiFolio :value="selectedProvider.metadata_url" variant="id" /></dd>
            </div>
            <div v-if="selectedProvider.authorization_endpoint" class="idp-detail__wide">
              <dt>{{ t('external_idps.ov_authorization_endpoint') }}</dt>
              <dd><UiFolio :value="selectedProvider.authorization_endpoint" variant="id" /></dd>
            </div>
            <div v-if="selectedProvider.token_endpoint" class="idp-detail__wide">
              <dt>{{ t('external_idps.ov_token_endpoint') }}</dt>
              <dd><UiFolio :value="selectedProvider.token_endpoint" variant="id" /></dd>
            </div>
            <div v-if="selectedProvider.userinfo_endpoint" class="idp-detail__wide">
              <dt>{{ t('external_idps.ov_userinfo_endpoint') }}</dt>
              <dd><UiFolio :value="selectedProvider.userinfo_endpoint" variant="id" /></dd>
            </div>
            <div v-if="selectedProvider.jwks_uri" class="idp-detail__wide">
              <dt>{{ t('external_idps.ov_jwks_uri') }}</dt>
              <dd><UiFolio :value="selectedProvider.jwks_uri" variant="id" /></dd>
            </div>
            <div>
              <dt>{{ t('external_idps.ov_algorithms') }}</dt>
              <dd>{{ (selectedProvider.allowed_algorithms ?? []).join(', ') || '—' }}</dd>
            </div>
            <div>
              <dt>{{ t('external_idps.ov_scopes') }}</dt>
              <dd>{{ (selectedProvider.scopes ?? []).join(', ') || '—' }}</dd>
            </div>
            <div>
              <dt>{{ t('external_idps.ov_priority') }}</dt>
              <dd>{{ selectedProvider.priority ?? '—' }}</dd>
            </div>
            <div>
              <dt>{{ t('external_idps.ov_backup') }}</dt>
              <dd>{{ selectedProvider.is_backup ? t('external_idps.on') : t('external_idps.off') }}</dd>
            </div>
            <div>
              <dt>{{ t('external_idps.ov_tls') }}</dt>
              <dd>{{ selectedProvider.tls_validation_enabled ? t('external_idps.on') : t('external_idps.off') }}</dd>
            </div>
            <div>
              <dt>{{ t('external_idps.ov_signature') }}</dt>
              <dd>{{ selectedProvider.signature_validation_enabled ? t('external_idps.on') : t('external_idps.off') }}</dd>
            </div>
          </dl>
        </div>
      </UiDetailDrawer>
    </template>
  </section>
</template>

<style scoped>
.external-idps {
  display: grid;
  gap: 24px;
  padding: 24px;
}
.external-idps__hero {
  display: grid;
  gap: 6px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border);
}
.external-idps__heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.external-idps__eyebrow {
  font: 600 0.6875rem/1 var(--font-sans);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.external-idps__title {
  margin: 0;
  font: 600 1.5rem/1.2 var(--font-sans);
  letter-spacing: -0.02em;
  color: var(--fg);
}
.external-idps__summary,
.external-idps__principal {
  margin: 0;
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--fg-2);
}
.external-idps__success {
  margin: 0;
  padding: 10px 14px;
  font: 500 0.8125rem/1.4 var(--font-sans);
  color: var(--fg);
  background: var(--card);
  border: 1px solid var(--border);
}
.external-idps__banner {
  padding: 10px 14px;
  font: 500 0.8125rem/1.4 var(--font-sans);
  color: var(--warning-soft-fg);
  background: var(--warning-soft);
  border: 1px solid var(--warning-soft-fg);
}
.idp-detail {
  display: grid;
  gap: 16px;
}
.idp-detail__head {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.idp-detail__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 16px;
  margin: 0;
}
.idp-detail__wide {
  grid-column: 1 / -1;
}
.idp-detail__grid dt {
  font: 600 0.625rem/1.2 var(--font-sans);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.idp-detail__grid dd {
  margin: 2px 0 0;
  font: 400 0.8125rem/1.4 var(--font-sans);
  color: var(--fg);
  overflow-wrap: anywhere;
}
</style>
```

- [ ] **Step 5: Run it — expect PASS** (states 4 + search + drawer + add-gate 2).

- [ ] **Step 6: Commit:**

```bash
git add app/pages/external-idps.vue app/pages/__tests__/external-idps.page.nuxt.spec.ts app/locales/en.json app/locales/id.json
git commit -m "$(cat <<'EOF'
feat(sso-admin-frontend): compose Swiss external-idps page (states, search, read drawer)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Task-scoped DoD:** `npm run typecheck && npm run lint && npm run format:check && npm run test -- app/pages/__tests__/external-idps.page.nuxt.spec.ts` — all green (both lint passes). The SSR-leak gate over `/external-idps` lands in Task 10.11.

---

### Task 10.7: `ExternalIdpFormDialog.vue` (shared create/edit form, write-only secret)

**Files:**
- Create: `app/components/external-idps/ExternalIdpFormDialog.vue`
- Modify: `app/locales/en.json` + `app/locales/id.json` (add the `external_idps.form_*` + `field_*` + title/cta keys — see Step 3)
- Test: `app/components/external-idps/__tests__/ExternalIdpFormDialog.nuxt.spec.ts`

**Interfaces:**
- Consumes: `UiDialog`, `UiFormField`, `UiInput`, `UiSwitch`, `UiButton` (`@/components/ui/*`); `useI18n` (`@/composables/useI18n`); `validateProviderForm`, `buildCreatePayload`, `buildUpdatePayload`, `ExternalIdpFormModel` (`@/lib/external-idps/external-idps-form`); `formatSupportReference` (`@/lib/display-identifiers`); `ExternalIdentityProvider`, `ExternalIdpCreatePayload`, `ExternalIdpUpdatePayload` (`@/types/external-idps.types`).
- Produces: `ExternalIdpFormDialog.vue` — props `open`, `mode: 'create' | 'edit'`, `provider?: ExternalIdentityProvider | null`, `submitting?`, `errorMessage?: string | null` (the SAFE status-keyed copy from the page — NEVER a raw backend message), `stepUpUrl?: string | null`, `requestId?: string | null`. Emits `submit(payload: ExternalIdpCreatePayload | ExternalIdpUpdatePayload)`, `cancel`. Owns local form refs re-seeded on open (edit prefills from `provider`, `provider_key`/`issuer` disabled in edit mode; `client_secret` ALWAYS starts blank — never prefilled, write-only). Validates on submit via `validateProviderForm` (client-side field codes → localized messages); builds + emits the payload via `buildCreatePayload`/`buildUpdatePayload`. Renders the `errorMessage` + a redacted `REF-…` + the step-up link, exactly like `RoleFormDialog`. Uses internal i18n for its 13 field labels (a domain component, not a generic `Ui` primitive — passing 13+ label props is worse than self-contained labels).

> ponytail: mirrors `RoleFormDialog` (UiDialog + re-seed watch + formatSupportReference + error/step-up block) — one form for both create and edit. `client_secret` is a `type="password"` ref that NEVER prefills and is sent only when non-empty (the payload builders enforce this). The page surfaces the duplicate-key 422 as the SAFE `errorMessage`, never field errors, never the raw message.

- [ ] **Step 1: Write the failing test** — `app/components/external-idps/__tests__/ExternalIdpFormDialog.nuxt.spec.ts`. (`*.nuxt.spec.ts` so `mountSuspended` + `mockNuxtImport` are available, but the component itself is mounted directly; mock `useI18n` to echo keys so assertions read literal labels.)

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import ExternalIdpFormDialog from '../ExternalIdpFormDialog.vue'
import type { ExternalIdentityProvider } from '@/types/external-idps.types'

vi.mock('@/composables/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

const PROVIDER: ExternalIdentityProvider = {
  provider_key: 'acme',
  display_name: 'Acme IdP',
  issuer: 'https://idp.acme.test',
  metadata_url: 'https://idp.acme.test/.well-known/openid-configuration',
  client_id: 'sso-client',
  allowed_algorithms: ['RS256'],
  scopes: ['openid'],
  priority: 100,
  enabled: true,
  is_backup: false,
  tls_validation_enabled: true,
  signature_validation_enabled: false,
  has_client_secret: true,
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('ExternalIdpFormDialog — create mode', () => {
  it('starts blank and blocks submit with field errors on empty required fields', async () => {
    const wrapper = await mountSuspended(ExternalIdpFormDialog, {
      props: { open: true, mode: 'create' as const },
    })
    await wrapper.find('[data-testid="external-idp-form"]').trigger('submit')
    expect(wrapper.emitted('submit')).toBeFalsy()
    // a field error rendered for the empty required key
    expect(wrapper.find('[data-testid="external-idp-form"]').text()).toContain('external_idps.field_required')
  })

  it('emits a create payload with a non-empty secret and split algorithms', async () => {
    const wrapper = await mountSuspended(ExternalIdpFormDialog, {
      props: { open: true, mode: 'create' as const },
    })
    await wrapper.find('[data-testid="idp-field-provider_key"]').setValue('acme')
    await wrapper.find('[data-testid="idp-field-display_name"]').setValue('Acme IdP')
    await wrapper.find('[data-testid="idp-field-issuer"]').setValue('https://idp.acme.test')
    await wrapper.find('[data-testid="idp-field-metadata_url"]').setValue('https://idp.acme.test/m')
    await wrapper.find('[data-testid="idp-field-client_id"]').setValue('sso-client')
    await wrapper.find('[data-testid="idp-field-client_secret"]').setValue('topsecret')
    await wrapper.find('[data-testid="idp-field-algorithms"]').setValue('RS256, ES256')
    await wrapper.find('[data-testid="external-idp-form"]').trigger('submit')
    const events = wrapper.emitted('submit')
    expect(events).toBeTruthy()
    expect(events![0]![0]).toMatchObject({
      provider_key: 'acme',
      client_secret: 'topsecret',
      allowed_algorithms: ['RS256', 'ES256'],
    })
  })
})

describe('ExternalIdpFormDialog — edit mode', () => {
  it('prefills from the provider but leaves the secret blank, and emits an update payload omitting the blank secret', async () => {
    const wrapper = await mountSuspended(ExternalIdpFormDialog, {
      props: { open: true, mode: 'edit' as const, provider: PROVIDER },
    })
    expect((wrapper.find('[data-testid="idp-field-display_name"]').element as HTMLInputElement).value).toBe('Acme IdP')
    expect((wrapper.find('[data-testid="idp-field-client_secret"]').element as HTMLInputElement).value).toBe('')
    // provider_key is immutable in edit mode
    expect(wrapper.find('[data-testid="idp-field-provider_key"]').attributes('disabled')).toBeDefined()
    await wrapper.find('[data-testid="idp-field-display_name"]').setValue('Acme Renamed')
    await wrapper.find('[data-testid="external-idp-form"]').trigger('submit')
    const events = wrapper.emitted('submit')
    expect(events).toBeTruthy()
    const payload = events![0]![0] as Record<string, unknown>
    expect(payload.display_name).toBe('Acme Renamed')
    expect('client_secret' in payload).toBe(false) // blank secret omitted
    expect(payload.tls_validation_enabled).toBe(true) // edit-only switch present
  })

  it('renders the safe errorMessage + a redacted REF + the step-up link', async () => {
    const wrapper = await mountSuspended(ExternalIdpFormDialog, {
      props: {
        open: true,
        mode: 'create' as const,
        errorMessage: 'A provider with that key already exists.',
        requestId: 'req-dup-123',
        stepUpUrl: 'https://idp.example/step-up',
      },
    })
    expect(wrapper.find('[data-testid="external-idp-form-error"]').text()).toContain('already exists')
    expect(wrapper.find('[data-testid="external-idp-form-ref"]').text()).toMatch(/^REF-/u)
    expect(wrapper.html()).not.toContain('req-dup-123') // raw id never rendered
    expect(wrapper.find('[data-testid="external-idp-form-stepup"]').attributes('href')).toBe('https://idp.example/step-up')
  })
})
```

- [ ] **Step 2: Run it — expect FAIL** (component does not exist).

- [ ] **Step 3: Add the form locale keys** (BOTH files, inside `external_idps`):

`en.json`:
```json
    "create_title": "Add external provider",
    "edit_title": "Edit external provider",
    "form_provider_key": "Provider key",
    "form_display_name": "Display name",
    "form_issuer": "Issuer URL",
    "form_metadata_url": "Metadata URL",
    "form_client_id": "Client ID",
    "form_client_secret": "Client secret",
    "form_client_secret_hint_edit": "Leave blank to keep the current secret.",
    "form_algorithms": "Allowed algorithms (comma-separated)",
    "form_scopes": "Scopes (comma-separated)",
    "form_priority": "Priority",
    "form_enabled": "Enabled",
    "form_is_backup": "Backup failover",
    "form_tls": "TLS validation",
    "form_signature": "Signature validation",
    "field_required": "This field is required.",
    "field_pattern": "Use only lowercase letters, numbers, hyphens, or underscores.",
    "field_https": "Must be an https:// URL.",
    "btn_save": "Save provider",
    "btn_cancel": "Cancel",
    "create_invalid": "A provider with that key, issuer, or metadata URL already exists, or the input was rejected.",
    "update_invalid": "That provider could not be found or the change was rejected.",
    "create_success": "External provider created.",
    "update_success": "Provider configuration saved.",
    "step_up_cta": "Re-authenticate to continue"
```
`id.json`:
```json
    "create_title": "Tambah provider eksternal",
    "edit_title": "Ubah provider eksternal",
    "form_provider_key": "Provider key",
    "form_display_name": "Nama tampilan",
    "form_issuer": "URL Issuer",
    "form_metadata_url": "URL Metadata",
    "form_client_id": "Client ID",
    "form_client_secret": "Client secret",
    "form_client_secret_hint_edit": "Kosongkan untuk tetap memakai secret saat ini.",
    "form_algorithms": "Algoritma diizinkan (pisahkan dengan koma)",
    "form_scopes": "Scope (pisahkan dengan koma)",
    "form_priority": "Prioritas",
    "form_enabled": "Aktif",
    "form_is_backup": "Failover cadangan",
    "form_tls": "Validasi TLS",
    "form_signature": "Validasi tanda tangan",
    "field_required": "Field ini wajib diisi.",
    "field_pattern": "Gunakan hanya huruf kecil, angka, tanda hubung, atau garis bawah.",
    "field_https": "Harus berupa URL https://.",
    "btn_save": "Simpan provider",
    "btn_cancel": "Batal",
    "create_invalid": "Provider dengan key, issuer, atau metadata URL tersebut sudah ada, atau input ditolak.",
    "update_invalid": "Provider tersebut tidak ditemukan atau perubahan ditolak.",
    "create_success": "Provider eksternal dibuat.",
    "update_success": "Konfigurasi provider disimpan.",
    "step_up_cta": "Autentikasi ulang untuk melanjutkan"
```

- [ ] **Step 4: Create `app/components/external-idps/ExternalIdpFormDialog.vue`:**

```vue
<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import UiDialog from '@/components/ui/UiDialog.vue'
import UiFormField from '@/components/ui/UiFormField.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { useI18n } from '@/composables/useI18n'
import {
  buildCreatePayload,
  buildUpdatePayload,
  validateProviderForm,
  type ExternalIdpFormModel,
} from '@/lib/external-idps/external-idps-form'
import { formatSupportReference } from '@/lib/display-identifiers'
import type {
  ExternalIdentityProvider,
  ExternalIdpCreatePayload,
  ExternalIdpUpdatePayload,
} from '@/types/external-idps.types'

const props = withDefaults(
  defineProps<{
    readonly open: boolean
    readonly mode: 'create' | 'edit'
    readonly provider?: ExternalIdentityProvider | null
    readonly submitting?: boolean
    readonly errorMessage?: string | null
    readonly stepUpUrl?: string | null
    readonly requestId?: string | null
  }>(),
  { provider: null, submitting: false, errorMessage: null, stepUpUrl: null, requestId: null },
)

const emit = defineEmits<{
  (event: 'submit', payload: ExternalIdpCreatePayload | ExternalIdpUpdatePayload): void
  (event: 'cancel'): void
}>()

const { t } = useI18n()

function blank(): ExternalIdpFormModel {
  return {
    provider_key: '',
    display_name: '',
    issuer: '',
    metadata_url: '',
    client_id: '',
    client_secret: '',
    algorithms: 'RS256',
    scopes: 'openid',
    priority: '100',
    enabled: true,
    is_backup: false,
    tls_validation_enabled: true,
    signature_validation_enabled: true,
  }
}

const form = reactive<ExternalIdpFormModel>(blank())
const submitAttempted = ref(false)

// Re-seed on (re)open. Edit prefills from the provider; client_secret ALWAYS starts
// blank (write-only — never prefilled). provider_key/issuer are immutable in edit.
watch(
  () => [props.open, props.mode, props.provider] as const,
  () => {
    if (!props.open) return
    const next = blank()
    if (props.mode === 'edit' && props.provider) {
      const p = props.provider
      next.provider_key = p.provider_key
      next.display_name = p.display_name
      next.issuer = p.issuer
      next.metadata_url = p.metadata_url
      next.client_id = p.client_id
      next.algorithms = (p.allowed_algorithms ?? []).join(', ')
      next.scopes = (p.scopes ?? []).join(', ')
      next.priority = String(p.priority ?? 100)
      next.enabled = p.enabled ?? true
      next.is_backup = p.is_backup ?? false
      next.tls_validation_enabled = p.tls_validation_enabled ?? true
      next.signature_validation_enabled = p.signature_validation_enabled ?? true
    }
    Object.assign(form, next)
    submitAttempted.value = false
  },
  { immediate: true },
)

const validation = computed(() => validateProviderForm(form, props.mode))

function fieldError(field: string): string | undefined {
  if (!submitAttempted.value) return undefined
  const code = validation.value.fieldErrors[field]
  return code ? t(`external_idps.field_${code}`) : undefined
}

const title = computed(() =>
  props.mode === 'create' ? t('external_idps.create_title') : t('external_idps.edit_title'),
)
const reference = computed(() =>
  props.requestId ? formatSupportReference(props.requestId) : null,
)
const canSubmit = computed(() => validation.value.valid && !props.submitting)
const isEdit = computed(() => props.mode === 'edit')

function onSubmit(): void {
  submitAttempted.value = true
  if (!validation.value.valid || props.submitting) return
  emit('submit', isEdit.value ? buildUpdatePayload(form) : buildCreatePayload(form))
}
</script>

<template>
  <UiDialog
    :open="open"
    title-id="external-idp-form-dialog"
    :title="title"
    :description="title"
    :close-label="t('external_idps.btn_cancel')"
    wide
    @close="emit('cancel')"
  >
    <form class="idp-form" data-testid="external-idp-form" @submit.prevent="onSubmit">
      <UiFormField
        id="idp_provider_key"
        :label="t('external_idps.form_provider_key')"
        :error="fieldError('provider_key')"
        :required="!isEdit"
      >
        <UiInput
          id="idp_provider_key"
          v-model="form.provider_key"
          data-testid="idp-field-provider_key"
          autocomplete="off"
          :disabled="isEdit"
          :invalid="Boolean(fieldError('provider_key'))"
        />
      </UiFormField>

      <UiFormField id="idp_display_name" :label="t('external_idps.form_display_name')" :error="fieldError('display_name')" :required="!isEdit">
        <UiInput id="idp_display_name" v-model="form.display_name" data-testid="idp-field-display_name" autocomplete="off" :invalid="Boolean(fieldError('display_name'))" />
      </UiFormField>

      <UiFormField id="idp_issuer" :label="t('external_idps.form_issuer')" :error="fieldError('issuer')" :required="!isEdit">
        <UiInput id="idp_issuer" v-model="form.issuer" data-testid="idp-field-issuer" autocomplete="off" :disabled="isEdit" :invalid="Boolean(fieldError('issuer'))" />
      </UiFormField>

      <UiFormField id="idp_metadata_url" :label="t('external_idps.form_metadata_url')" :error="fieldError('metadata_url')" :required="!isEdit">
        <UiInput id="idp_metadata_url" v-model="form.metadata_url" data-testid="idp-field-metadata_url" autocomplete="off" :invalid="Boolean(fieldError('metadata_url'))" />
      </UiFormField>

      <UiFormField id="idp_client_id" :label="t('external_idps.form_client_id')" :error="fieldError('client_id')" :required="!isEdit">
        <UiInput id="idp_client_id" v-model="form.client_id" data-testid="idp-field-client_id" autocomplete="off" :invalid="Boolean(fieldError('client_id'))" />
      </UiFormField>

      <UiFormField
        id="idp_client_secret"
        :label="t('external_idps.form_client_secret')"
        :hint="isEdit ? t('external_idps.form_client_secret_hint_edit') : undefined"
      >
        <UiInput id="idp_client_secret" v-model="form.client_secret" type="password" data-testid="idp-field-client_secret" autocomplete="new-password" />
      </UiFormField>

      <UiFormField id="idp_algorithms" :label="t('external_idps.form_algorithms')">
        <UiInput id="idp_algorithms" v-model="form.algorithms" data-testid="idp-field-algorithms" autocomplete="off" />
      </UiFormField>

      <UiFormField id="idp_scopes" :label="t('external_idps.form_scopes')">
        <UiInput id="idp_scopes" v-model="form.scopes" data-testid="idp-field-scopes" autocomplete="off" />
      </UiFormField>

      <UiFormField id="idp_priority" :label="t('external_idps.form_priority')">
        <UiInput id="idp_priority" v-model="form.priority" type="number" data-testid="idp-field-priority" autocomplete="off" />
      </UiFormField>

      <div class="idp-form__switches">
        <UiSwitch v-model="form.enabled" :label="t('external_idps.form_enabled')" />
        <UiSwitch v-model="form.is_backup" :label="t('external_idps.form_is_backup')" />
        <template v-if="isEdit">
          <UiSwitch v-model="form.tls_validation_enabled" :label="t('external_idps.form_tls')" />
          <UiSwitch v-model="form.signature_validation_enabled" :label="t('external_idps.form_signature')" />
        </template>
      </div>

      <p v-if="errorMessage" class="idp-form__error" role="alert" data-testid="external-idp-form-error">
        {{ errorMessage }}
        <span v-if="reference" class="idp-form__ref" data-testid="external-idp-form-ref">{{ reference }}</span>
      </p>

      <a v-if="stepUpUrl" class="idp-form__step-up" :href="stepUpUrl" data-testid="external-idp-form-stepup">
        {{ t('external_idps.step_up_cta') }}
      </a>

      <div class="idp-form__actions">
        <UiButton type="button" variant="ghost" size="sm" @click="emit('cancel')">
          {{ t('external_idps.btn_cancel') }}
        </UiButton>
        <UiButton type="submit" variant="primary" size="sm" :disabled="!canSubmit" data-testid="external-idp-form-submit">
          {{ t('external_idps.btn_save') }}
        </UiButton>
      </div>
    </form>
  </UiDialog>
</template>

<style scoped>
.idp-form {
  display: grid;
  gap: 14px;
}
.idp-form__switches {
  display: grid;
  gap: 10px;
  padding: 10px 0;
  border-top: 1px solid var(--border);
}
.idp-form__error {
  margin: 0;
  font: 500 0.75rem/1.4 var(--font-sans);
  color: var(--danger);
}
.idp-form__ref {
  margin-left: 6px;
  font-family: var(--font-mono);
  color: var(--fg-3);
}
.idp-form__step-up {
  font: 600 0.8125rem/1 var(--font-sans);
  color: var(--accent);
  text-decoration: underline;
}
.idp-form__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
```

- [ ] **Step 5: Run it — expect PASS.**

- [ ] **Step 6: Commit:**

```bash
git add app/components/external-idps/ExternalIdpFormDialog.vue app/components/external-idps/__tests__/ExternalIdpFormDialog.nuxt.spec.ts app/locales/en.json app/locales/id.json
git commit -m "$(cat <<'EOF'
feat(sso-admin-frontend): ExternalIdpFormDialog (shared create/edit, write-only secret)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Task-scoped DoD:** `npm run typecheck && npm run lint && npm run format:check && npm run test -- app/components/external-idps/__tests__/ExternalIdpFormDialog.nuxt.spec.ts` — all green.

---

### Task 10.8: Create + update privileged actions (422 duplicate → SAFE copy)

**Files:**
- Modify: `app/pages/external-idps.vue` (fill `onCreateRequested` + `onEditRequested`; add the form dialog + the create/update `usePrivilegedAction` instances)
- Test: `app/pages/__tests__/external-idps-write.page.nuxt.spec.ts`

**Interfaces:**
- Consumes: `usePrivilegedAction`, `ExternalIdpFormDialog` (10.7), `externalIdpsApi.create`/`update`, `ExternalIdpDetailResponse`, `ExternalIdpCreatePayload`/`ExternalIdpUpdatePayload`.
- Produces (`app/pages/external-idps.vue`): create + update via the shared `ExternalIdpFormDialog`; each runs through `usePrivilegedAction<ExternalIdpDetailResponse>` (`:write` step-up); on success closes the dialog, sets `successMessage` (`create_success`/`update_success`), and `refresh()`es. **The 422 `external_idp_invalid` (duplicate key / not-found) maps to the SAFE `create_invalid`/`update_invalid` copy — `error.message` (raw SQL) is NEVER rendered.** Step-up → link; only `REF-…`; cancel calls no API; a failed write leaves no stale loading and does not refresh.

> ponytail: one shared dialog + two action instances (create/update). The form holds the write-only secret; the matrix handles step-up/REF; the only domain-specific logic is mapping 422 → the safe domain string (NEVER `error.message`).

- [ ] **Step 1: Write the failing test** — `app/pages/__tests__/external-idps-write.page.nuxt.spec.ts` (same harness as the page spec; `usePrivilegedAction` + `ExternalIdpFormDialog` REAL, spy only `externalIdpsApi.create`/`update`; `permitted` includes `admin.external-idps.write`):

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import enLocale from '@/locales/en.json'
import { ApiError } from '@/lib/api/api-client'
import type { ExternalIdentityProvider, ExternalIdpDetailResponse } from '@/types/external-idps.types'

const createMock = vi.fn<(p: unknown) => Promise<ExternalIdpDetailResponse>>()
const updateMock = vi.fn<(k: string, p: unknown) => Promise<ExternalIdpDetailResponse>>()
vi.mock('@/services/external-idps.api', () => ({
  externalIdpsApi: { list: vi.fn<() => Promise<unknown>>(), create: createMock, update: updateMock, show: vi.fn(), previewMapping: vi.fn(), remove: vi.fn() },
}))

const PROVIDER: ExternalIdentityProvider = {
  provider_key: 'acme', display_name: 'Acme IdP', issuer: 'https://idp.acme.test',
  metadata_url: 'https://idp.acme.test/m', client_id: 'sso-client', enabled: true, has_client_secret: true, health_status: 'healthy',
}
const providersRef = ref<readonly ExternalIdentityProvider[] | null>([PROVIDER])
const refreshMock = vi.fn<() => Promise<void>>(async () => {})
vi.mock('@/composables/useExternalIdpsList', () => ({
  useExternalIdpsList: () => ({
    providers: providersRef, viewState: computed(() => 'ready' as const), isStale: computed(() => false),
    requestId: computed(() => null), pending: ref(false), refresh: refreshMock,
  }),
}))
let permitted: string[] = []
vi.mock('@/stores/session.store', () => ({
  useSessionStore: () => ({
    principal: { display_name: 'Admin', subject_id: 'a1' },
    ensureSession: vi.fn<() => Promise<string>>(async () => 'authenticated'),
    hasPermission: (p: string) => permitted.includes(p), get roles() { return [] as readonly string[] },
  }),
}))
// Real i18n echo via enLocale so assertions read literal English.
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

const Page = (await import('../external-idps.vue')).default

async function openCreate(wrapper: Awaited<ReturnType<typeof mountSuspended>>) {
  await wrapper.find('[data-testid="external-idps-create"]').trigger('click')
  await flushPromises()
}
async function fillValidCreate(wrapper: Awaited<ReturnType<typeof mountSuspended>>) {
  await wrapper.find('[data-testid="idp-field-provider_key"]').setValue('newidp')
  await wrapper.find('[data-testid="idp-field-display_name"]').setValue('New IdP')
  await wrapper.find('[data-testid="idp-field-issuer"]').setValue('https://new.test')
  await wrapper.find('[data-testid="idp-field-metadata_url"]').setValue('https://new.test/m')
  await wrapper.find('[data-testid="idp-field-client_id"]').setValue('newclient')
}

beforeEach(() => {
  permitted = ['admin.external-idps.read', 'admin.external-idps.write']
  providersRef.value = [PROVIDER]
  createMock.mockReset()
  updateMock.mockReset()
  refreshMock.mockReset()
})
afterEach(() => { vi.clearAllMocks() })

describe('external-idps create', () => {
  it('opens the form, creates, refreshes, and reports success', async () => {
    createMock.mockResolvedValue({ provider: { ...PROVIDER, provider_key: 'newidp' } })
    const wrapper = await mountSuspended(Page)
    await openCreate(wrapper)
    await fillValidCreate(wrapper)
    await wrapper.find('[data-testid="external-idp-form"]').trigger('submit')
    await flushPromises()
    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({ provider_key: 'newidp' }))
    expect(refreshMock).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="external-idps-action-success"]').text()).toBe(enLocale.external_idps.create_success)
  })

  it('maps a 422 duplicate to SAFE copy and NEVER renders the raw SQL message', async () => {
    createMock.mockRejectedValue(
      new ApiError(422, "SQLSTATE[23000]: Integrity constraint violation: 1062 Duplicate entry 'acme' for key 'external_identity_providers_provider_key_unique'", 'external_idp_invalid', {}, 'req-422'),
    )
    const wrapper = await mountSuspended(Page)
    await openCreate(wrapper)
    await fillValidCreate(wrapper)
    await wrapper.find('[data-testid="external-idp-form"]').trigger('submit')
    await flushPromises()
    expect(wrapper.find('[data-testid="external-idp-form-error"]').text()).toContain(enLocale.external_idps.create_invalid)
    expect(wrapper.html()).not.toContain('SQLSTATE')
    expect(wrapper.html()).not.toContain('external_identity_providers_provider_key_unique')
    expect(wrapper.html()).not.toContain('req-422')
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('surfaces the step-up link on 428', async () => {
    createMock.mockRejectedValue(new ApiError(428, 'reauth', 'reauth_required', { step_up_url: 'https://idp.example/step-up' }, 'req-428'))
    const wrapper = await mountSuspended(Page)
    await openCreate(wrapper)
    await fillValidCreate(wrapper)
    await wrapper.find('[data-testid="external-idp-form"]').trigger('submit')
    await flushPromises()
    expect(wrapper.find('[data-testid="external-idp-form-stepup"]').attributes('href')).toBe('https://idp.example/step-up')
    expect(refreshMock).not.toHaveBeenCalled()
  })
})

describe('external-idps update', () => {
  it('edits the selected provider and reports success', async () => {
    updateMock.mockResolvedValue({ provider: { ...PROVIDER, display_name: 'Acme Renamed' } })
    const wrapper = await mountSuspended(Page)
    await wrapper.find('[data-testid="external-idp-select-acme"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="external-idp-edit"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="idp-field-display_name"]').setValue('Acme Renamed')
    await wrapper.find('[data-testid="external-idp-form"]').trigger('submit')
    await flushPromises()
    expect(updateMock).toHaveBeenCalledWith('acme', expect.objectContaining({ display_name: 'Acme Renamed' }))
    expect(refreshMock).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="external-idps-action-success"]').text()).toBe(enLocale.external_idps.update_success)
  })
})
```

- [ ] **Step 2: Run it — expect FAIL** (no form wiring / no Edit button yet).

- [ ] **Step 3: Wire create + update into `app/pages/external-idps.vue`.** Add to `<script setup>`:

```ts
import { usePrivilegedAction } from '@/composables/usePrivilegedAction'
import ExternalIdpFormDialog from '@/components/external-idps/ExternalIdpFormDialog.vue'
import { externalIdpsApi } from '@/services/external-idps.api'
import type {
  ExternalIdpCreatePayload,
  ExternalIdpDetailResponse,
  ExternalIdpUpdatePayload,
} from '@/types/external-idps.types'

const formOpen = ref(false)
const formMode = ref<'create' | 'edit'>('create')
const editingProvider = ref<ExternalIdentityProvider | null>(null)

const createAction = usePrivilegedAction<ExternalIdpDetailResponse>()
const updateAction = usePrivilegedAction<ExternalIdpDetailResponse>()
const formAction = computed(() => (formMode.value === 'create' ? createAction : updateAction))

// SAFE status-keyed copy — the 422 external_idp_invalid carries a raw SQL message
// (duplicate-key QueryException) which MUST NOT be rendered; map to safe domain copy.
const formError = computed<string | null>(() => {
  const status = formAction.value.failure.value?.status
  if (!status || status === 'step_up_required') return null
  if (status === 'invalid')
    return formMode.value === 'create'
      ? t('external_idps.create_invalid')
      : t('external_idps.update_invalid')
  return t('common.error_generic')
})

// REPLACE the 10.6 stub bodies (do NOT rename).
function onCreateRequested(): void {
  createAction.reset()
  successMessage.value = null
  formMode.value = 'create'
  editingProvider.value = null
  formOpen.value = true
}
function onEditRequested(provider: ExternalIdentityProvider): void {
  updateAction.reset()
  successMessage.value = null
  formMode.value = 'edit'
  editingProvider.value = provider
  formOpen.value = true
}
function onFormCancel(): void {
  formOpen.value = false
}
async function onFormSubmit(
  payload: ExternalIdpCreatePayload | ExternalIdpUpdatePayload,
): Promise<void> {
  if (formMode.value === 'create') {
    const result = await createAction.run(() =>
      externalIdpsApi.create(payload as ExternalIdpCreatePayload),
    )
    if (result === null) return
    formOpen.value = false
    successMessage.value = t('external_idps.create_success')
    await refresh()
    return
  }
  const key = editingProvider.value?.provider_key
  if (!key) return
  const result = await updateAction.run(() =>
    externalIdpsApi.update(key, payload as ExternalIdpUpdatePayload),
  )
  if (result === null) return
  formOpen.value = false
  selectedKey.value = null
  successMessage.value = t('external_idps.update_success')
  await refresh()
}
```

Add an **Edit** button inside the drawer (gated `canWrite`, after the `<dl>`), and the form dialog at page level:

```vue
          <div v-if="canWrite || canDelete" class="idp-detail__actions">
            <UiButton
              v-if="canWrite"
              variant="secondary"
              size="sm"
              data-testid="external-idp-edit"
              @click="onEditRequested(selectedProvider)"
            >
              {{ t('common.btn_edit') }}
            </UiButton>
          </div>
```

```vue
    <ExternalIdpFormDialog
      :open="formOpen"
      :mode="formMode"
      :provider="editingProvider"
      :submitting="formAction.isSubmitting.value"
      :error-message="formError"
      :request-id="formAction.requestId.value"
      :step-up-url="formAction.stepUpUrl.value"
      @submit="onFormSubmit"
      @cancel="onFormCancel"
    />
```

Add `.idp-detail__actions { display: flex; flex-wrap: wrap; gap: 8px; padding-top: 8px; border-top: 1px solid var(--border); }` to `<style>`.

- [ ] **Step 4: Run it — expect PASS** (create success/422-safe/428 + update success).

- [ ] **Step 5: Commit:**

```bash
git add app/pages/external-idps.vue app/pages/__tests__/external-idps-write.page.nuxt.spec.ts
git commit -m "$(cat <<'EOF'
feat(sso-admin-frontend): external-idp create + update with safe 422 duplicate copy

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Task-scoped DoD:** `npm run typecheck && npm run lint && npm run format:check && npm run test -- app/pages/__tests__/external-idps-write.page.nuxt.spec.ts app/pages/__tests__/external-idps.page.nuxt.spec.ts` — all green.

---

### Task 10.9: Mapping-preview privileged action + result panel

**Files:**
- Create: `app/components/external-idps/MappingPreviewPanel.vue`
- Modify: `app/pages/external-idps.vue` (fill `onPreviewRequested`; add the preview dialog + `usePrivilegedAction`)
- Modify: `app/locales/en.json` + `app/locales/id.json` (add the preview keys)
- Test: `app/pages/__tests__/external-idps-preview.page.nuxt.spec.ts`

**Interfaces:**
- Consumes: `usePrivilegedAction`, `UiDialog`, `UiTextarea`, `UiButton`, `UiStatusBadge`, `MappingPreviewPanel` (10.9); `parseClaimsJson` (10.2); `externalIdpsApi.previewMapping`; `ExternalIdpMappingPreviewResponse`, `ExternalIdpMappingPreview`.
- Produces:
  - `MappingPreviewPanel.vue` — props `preview: ExternalIdpMappingPreview`, `safeLabel`, `unsafeLabel`, `strategyLabel`, `mappedLabel`, `warningsLabel`, `errorsLabel: string`. Renders `safe_to_link` as a `success`/`danger` `UiStatusBadge` (tone+label), `missing_email_strategy`, the `mapped` claims as a mono `<pre>` (`JSON.stringify(mapped, null, 2)` — the admin's own reflected sample input, token/secret keys already stripped server-side), and `warnings`/`errors` lists.
  - (`app/pages/external-idps.vue`) a "Preview mapping" affordance in the drawer (gated `canWrite`) that opens a dialog with a claims `UiTextarea` (default sample) + a Preview button; `parseClaimsJson` guards client-side (invalid → inline error, no API); valid → `usePrivilegedAction<ExternalIdpMappingPreviewResponse>().run(() => externalIdpsApi.previewMapping(key, claims))` (`:write` step-up); on success renders `MappingPreviewPanel`; cancel calls no API. The preview is **transient** (a client action result, not SSR-hydrated).

> ponytail: the preview is a transient client action — its `mapped` output (the admin's own sample claims, reflected) is not part of the SSR payload, so the leak gate doesn't cover it; the backend's `safeSnapshot` already strips token/secret keys. Reuse the privileged-action runner; the only domain logic is the client-side JSON parse-guard.

- [ ] **Step 1: Write the failing test** — `app/pages/__tests__/external-idps-preview.page.nuxt.spec.ts` (harness as the write spec; `usePrivilegedAction` REAL, spy only `externalIdpsApi.previewMapping`):

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import enLocale from '@/locales/en.json'
import { ApiError } from '@/lib/api/api-client'
import type { ExternalIdentityProvider, ExternalIdpMappingPreviewResponse } from '@/types/external-idps.types'

const previewMock = vi.fn<(k: string, c: unknown) => Promise<ExternalIdpMappingPreviewResponse>>()
vi.mock('@/services/external-idps.api', () => ({
  externalIdpsApi: { list: vi.fn<() => Promise<unknown>>(), create: vi.fn(), update: vi.fn(), show: vi.fn(), previewMapping: previewMock, remove: vi.fn() },
}))
const PROVIDER: ExternalIdentityProvider = { provider_key: 'acme', display_name: 'Acme IdP', issuer: 'https://i', metadata_url: 'https://m', client_id: 'c', enabled: true, has_client_secret: true }
const providersRef = ref<readonly ExternalIdentityProvider[] | null>([PROVIDER])
vi.mock('@/composables/useExternalIdpsList', () => ({
  useExternalIdpsList: () => ({ providers: providersRef, viewState: computed(() => 'ready' as const), isStale: computed(() => false), requestId: computed(() => null), pending: ref(false), refresh: vi.fn<() => Promise<void>>(async () => {}) }),
}))
let permitted: string[] = []
vi.mock('@/stores/session.store', () => ({
  useSessionStore: () => ({ principal: { display_name: 'Admin', subject_id: 'a1' }, ensureSession: vi.fn<() => Promise<string>>(async () => 'authenticated'), hasPermission: (p: string) => permitted.includes(p), get roles() { return [] as readonly string[] } }),
}))
vi.mock('@/composables/useI18n', () => ({
  useI18n: () => ({ t: (key: string, params?: Record<string, unknown>) => { let val: unknown = enLocale; for (const part of key.split('.')) val = (val as Record<string, unknown>)?.[part]; if (typeof val !== 'string') return key; return params ? val.replace(/\{(\w+)\}/gu, (_: string, k: string) => String(params[k] ?? '')) : val } }),
}))
mockNuxtImport('navigateTo', () => vi.fn<(...a: unknown[]) => Promise<void>>(async () => {}))
const Page = (await import('../external-idps.vue')).default

async function openPreview(wrapper: Awaited<ReturnType<typeof mountSuspended>>) {
  await wrapper.find('[data-testid="external-idp-select-acme"]').trigger('click')
  await flushPromises()
  await wrapper.find('[data-testid="external-idp-preview"]').trigger('click')
  await flushPromises()
}

beforeEach(() => { permitted = ['admin.external-idps.read', 'admin.external-idps.write']; providersRef.value = [PROVIDER]; previewMock.mockReset() })
afterEach(() => { vi.clearAllMocks() })

describe('external-idps mapping preview', () => {
  it('blocks invalid JSON client-side (no API call)', async () => {
    const wrapper = await mountSuspended(Page)
    await openPreview(wrapper)
    await wrapper.find('[data-testid="idp-preview-claims"]').setValue('{bad json')
    await wrapper.find('[data-testid="idp-preview-submit"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="idp-preview-parse-error"]').exists()).toBe(true)
    expect(previewMock).not.toHaveBeenCalled()
  })

  it('runs the preview and renders the mapped result + safe-to-link', async () => {
    previewMock.mockResolvedValue({ preview: { mapped: { subject: 'ext-1', email: 'u@x.test' }, errors: [], warnings: ['Email missing fallback'], missing_email_strategy: 'reject', safe_to_link: true } })
    const wrapper = await mountSuspended(Page)
    await openPreview(wrapper)
    await wrapper.find('[data-testid="idp-preview-claims"]').setValue('{"sub":"ext-1","email":"u@x.test"}')
    await wrapper.find('[data-testid="idp-preview-submit"]').trigger('click')
    await flushPromises()
    expect(previewMock).toHaveBeenCalledWith('acme', { sub: 'ext-1', email: 'u@x.test' })
    const panel = wrapper.find('[data-testid="idp-preview-result"]')
    expect(panel.exists()).toBe(true)
    expect(panel.text()).toContain('ext-1') // mapped subject rendered
    expect(panel.text()).toContain(enLocale.external_idps.preview_safe)
  })

  it('surfaces safe copy + REF on a 5xx without leaking the raw id', async () => {
    previewMock.mockRejectedValue(new ApiError(500, 'boom', undefined, {}, 'req-500'))
    const wrapper = await mountSuspended(Page)
    await openPreview(wrapper)
    await wrapper.find('[data-testid="idp-preview-claims"]').setValue('{"sub":"x"}')
    await wrapper.find('[data-testid="idp-preview-submit"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="idp-preview-error"]').text()).toContain(enLocale.common.error_generic)
    expect(wrapper.html()).not.toContain('req-500')
  })
})
```

- [ ] **Step 2: Run it — expect FAIL.**

- [ ] **Step 3: Add the preview keys** (BOTH locales, in `external_idps`):

`en.json`:
```json
    "btn_preview": "Preview mapping",
    "preview_title": "Preview claim mapping",
    "preview_claims_label": "Sample claims (JSON)",
    "preview_submit": "Run preview",
    "preview_parse_error": "Sample claims must be a valid JSON object.",
    "preview_safe": "Safe to link",
    "preview_unsafe": "Not safe to link",
    "preview_strategy": "Missing-email strategy",
    "preview_mapped": "Mapped identity",
    "preview_warnings": "Warnings",
    "preview_errors": "Errors"
```
`id.json`:
```json
    "btn_preview": "Pratinjau pemetaan",
    "preview_title": "Pratinjau pemetaan klaim",
    "preview_claims_label": "Contoh klaim (JSON)",
    "preview_submit": "Jalankan pratinjau",
    "preview_parse_error": "Contoh klaim harus berupa objek JSON yang valid.",
    "preview_safe": "Aman untuk ditautkan",
    "preview_unsafe": "Tidak aman untuk ditautkan",
    "preview_strategy": "Strategi email kosong",
    "preview_mapped": "Identitas terpetakan",
    "preview_warnings": "Peringatan",
    "preview_errors": "Kesalahan"
```

- [ ] **Step 4: Create `app/components/external-idps/MappingPreviewPanel.vue`:**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import type { ExternalIdpMappingPreview } from '@/types/external-idps.types'

const props = defineProps<{
  readonly preview: ExternalIdpMappingPreview
  readonly safeLabel: string
  readonly unsafeLabel: string
  readonly strategyLabel: string
  readonly mappedLabel: string
  readonly warningsLabel: string
  readonly errorsLabel: string
}>()

// The mapped object is the admin's own sample claims, reflected after the server-side
// mapper ran (token/secret keys already stripped by the backend safeSnapshot).
const mappedJson = computed<string>(() =>
  props.preview.mapped ? JSON.stringify(props.preview.mapped, null, 2) : '—',
)
</script>

<template>
  <div class="mapping-preview" data-testid="idp-preview-result">
    <div class="mapping-preview__head">
      <UiStatusBadge
        :tone="preview.safe_to_link ? 'success' : 'danger'"
        :label="preview.safe_to_link ? safeLabel : unsafeLabel"
      />
      <span class="mapping-preview__strategy">{{ strategyLabel }}: {{ preview.missing_email_strategy }}</span>
    </div>

    <h4 class="mapping-preview__h4">{{ mappedLabel }}</h4>
    <pre class="mapping-preview__json">{{ mappedJson }}</pre>

    <div v-if="preview.warnings.length" class="mapping-preview__list mapping-preview__list--warn">
      <h4 class="mapping-preview__h4">{{ warningsLabel }}</h4>
      <ul>
        <li v-for="(warning, index) in preview.warnings" :key="`w-${index}`">{{ warning }}</li>
      </ul>
    </div>

    <div v-if="preview.errors.length" class="mapping-preview__list mapping-preview__list--error">
      <h4 class="mapping-preview__h4">{{ errorsLabel }}</h4>
      <ul>
        <li v-for="(error, index) in preview.errors" :key="`e-${index}`">{{ error }}</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.mapping-preview {
  display: grid;
  gap: 10px;
}
.mapping-preview__head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.mapping-preview__strategy {
  font: 400 0.75rem/1.4 var(--font-sans);
  color: var(--fg-3);
}
.mapping-preview__h4 {
  margin: 0;
  font: 600 0.75rem/1.2 var(--font-sans);
  color: var(--fg);
}
.mapping-preview__json {
  margin: 0;
  padding: 12px;
  overflow-x: auto;
  font: 400 0.75rem/1.5 var(--font-mono);
  color: var(--fg);
  background: var(--bg-2);
  border: 1px solid var(--border);
  white-space: pre;
}
.mapping-preview__list ul {
  margin: 4px 0 0;
  padding-left: 18px;
  font: 400 0.75rem/1.5 var(--font-sans);
}
.mapping-preview__list--warn {
  color: var(--warning-soft-fg);
}
.mapping-preview__list--error {
  color: var(--danger);
}
</style>
```

- [ ] **Step 5: Wire the preview flow into `app/pages/external-idps.vue`.** Add to `<script setup>`:

```ts
import UiDialog from '@/components/ui/UiDialog.vue'
import UiTextarea from '@/components/ui/UiTextarea.vue'
import MappingPreviewPanel from '@/components/external-idps/MappingPreviewPanel.vue'
import { parseClaimsJson } from '@/lib/external-idps/external-idps-list'
import type { ExternalIdpMappingPreview, ExternalIdpMappingPreviewResponse } from '@/types/external-idps.types'

const previewOpen = ref(false)
const previewKey = ref<string | null>(null)
const previewClaims = ref('{\n  "sub": "ext-user-123",\n  "email": "user@example.com"\n}')
const previewParseError = ref<string | null>(null)
const previewResult = ref<ExternalIdpMappingPreview | null>(null)
const previewAction = usePrivilegedAction<ExternalIdpMappingPreviewResponse>()

const previewError = computed<string | null>(() => {
  const status = previewAction.failure.value?.status
  if (!status || status === 'step_up_required') return null
  return t('common.error_generic')
})

// REPLACE the 10.6 stub body (do NOT rename).
function onPreviewRequested(provider: ExternalIdentityProvider): void {
  previewAction.reset()
  previewParseError.value = null
  previewResult.value = null
  previewKey.value = provider.provider_key
  previewOpen.value = true
}
function onPreviewCancel(): void {
  previewOpen.value = false
}
async function onPreviewSubmit(): Promise<void> {
  const key = previewKey.value
  if (!key) return
  const parsed = parseClaimsJson(previewClaims.value)
  if (!parsed.ok) {
    previewParseError.value = t('external_idps.preview_parse_error')
    return
  }
  previewParseError.value = null
  const result = await previewAction.run(() => externalIdpsApi.previewMapping(key, parsed.value))
  if (result === null) return // failure (error/step-up/REF) stays in the dialog
  previewResult.value = result.preview
}
```

Add a "Preview mapping" button in the drawer `idp-detail__actions` (gated `canWrite`, next to Edit), and the preview dialog at page level:

```vue
            <UiButton
              v-if="canWrite"
              variant="secondary"
              size="sm"
              data-testid="external-idp-preview"
              @click="onPreviewRequested(selectedProvider)"
            >
              {{ t('external_idps.btn_preview') }}
            </UiButton>
```

```vue
    <UiDialog
      v-if="previewOpen"
      :open="previewOpen"
      title-id="external-idp-preview-dialog"
      :title="t('external_idps.preview_title')"
      :description="t('external_idps.preview_title')"
      :close-label="t('external_idps.btn_cancel')"
      wide
      @close="onPreviewCancel"
    >
      <div class="idp-preview">
        <UiFormField id="idp-preview-claims" :label="t('external_idps.preview_claims_label')">
          <UiTextarea id="idp-preview-claims" v-model="previewClaims" :rows="5" data-testid="idp-preview-claims" />
        </UiFormField>
        <p v-if="previewParseError" class="idp-preview__error" role="alert" data-testid="idp-preview-parse-error">
          {{ previewParseError }}
        </p>
        <p v-if="previewError" class="idp-preview__error" role="alert" data-testid="idp-preview-error">
          {{ previewError }}
          <span v-if="previewAction.requestId.value" class="idp-preview__ref">{{ formatSupportReference(previewAction.requestId.value) }}</span>
        </p>
        <a v-if="previewAction.stepUpUrl.value" class="idp-preview__step-up" :href="previewAction.stepUpUrl.value" data-testid="idp-preview-stepup">
          {{ t('external_idps.step_up_cta') }}
        </a>
        <UiButton variant="primary" size="sm" :disabled="previewAction.isSubmitting.value" data-testid="idp-preview-submit" @click="onPreviewSubmit">
          {{ t('external_idps.preview_submit') }}
        </UiButton>
        <MappingPreviewPanel
          v-if="previewResult"
          :preview="previewResult"
          :safe-label="t('external_idps.preview_safe')"
          :unsafe-label="t('external_idps.preview_unsafe')"
          :strategy-label="t('external_idps.preview_strategy')"
          :mapped-label="t('external_idps.preview_mapped')"
          :warnings-label="t('external_idps.preview_warnings')"
          :errors-label="t('external_idps.preview_errors')"
        />
      </div>
    </UiDialog>
```

Add the `formatSupportReference` import (`import { formatSupportReference } from '@/lib/display-identifiers'`) and `.idp-preview { display: grid; gap: 12px; } .idp-preview__error { margin: 0; font: 500 0.75rem/1.4 var(--font-sans); color: var(--danger); } .idp-preview__ref { margin-left: 6px; font-family: var(--font-mono); color: var(--fg-3); } .idp-preview__step-up { font: 600 0.8125rem/1 var(--font-sans); color: var(--accent); text-decoration: underline; }` to `<style>`.

- [ ] **Step 6: Run it — expect PASS.** Re-run the read + write specs for no-regression.

- [ ] **Step 7: Commit:**

```bash
git add app/components/external-idps/MappingPreviewPanel.vue app/pages/external-idps.vue app/pages/__tests__/external-idps-preview.page.nuxt.spec.ts app/locales/en.json app/locales/id.json
git commit -m "$(cat <<'EOF'
feat(sso-admin-frontend): external-idp mapping-preview privileged action + result panel

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Task-scoped DoD:** `npm run typecheck && npm run lint && npm run format:check && npm run test -- app/pages/__tests__/external-idps-preview.page.nuxt.spec.ts app/pages/__tests__/external-idps.page.nuxt.spec.ts app/pages/__tests__/external-idps-write.page.nuxt.spec.ts` — all green.

---

### Task 10.10: Delete-provider danger action (double-gate + step-up)

**Files:**
- Modify: `app/pages/external-idps.vue` (fill `onDeleteRequested`; add the delete `usePrivilegedAction` + danger dialog + the drawer Delete button)
- Modify: `app/locales/en.json` + `app/locales/id.json` (add delete keys)
- Test: `app/pages/__tests__/external-idps-delete.page.nuxt.spec.ts`

**Interfaces:**
- Consumes: `usePrivilegedAction`, `PrivilegedActionDialog` (`@/components/users/PrivilegedActionDialog.vue`), `externalIdpsApi.remove`.
- Produces (`app/pages/external-idps.vue`): a Delete affordance **inside the drawer**, shown only when `canDelete` (`admin.external-idps.write` && `admin.sessions.terminate`); a `usePrivilegedAction<void>()` instance + reused `PrivilegedActionDialog` with **`danger`** (the single `--danger #E4002B` affordance in this domain). The confirm copy names the provider and **warns about the cascade** (deleting a provider unlinks every federated user). On confirm runs `externalIdpsApi.remove(provider_key)`; success → close dialog + close drawer + `refresh()` + `successMessage` (`delete_success`); **422 `external_idp_invalid` (not-found) → safe `delete_invalid` copy** (NEVER the raw message); 428 → step-up; only `REF-…`; cancel calls no API.

> ponytail: aligns with the roles/policy/sessions delete pattern — a danger `PrivilegedActionDialog`, NOT a bespoke type-to-confirm input. The backend double-gate (write + sessions.terminate + the session-management role) + `:step_up` freshness is the authoritative safeguard; the UI warns about the cascade. 422 maps to safe copy (the raw "not found" / SQL text is never rendered).

- [ ] **Step 1: Write the failing test** — `app/pages/__tests__/external-idps-delete.page.nuxt.spec.ts` (harness as the write spec; `usePrivilegedAction` + `PrivilegedActionDialog` REAL, spy only `externalIdpsApi.remove`; `permitted` includes both caps):

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import enLocale from '@/locales/en.json'
import { ApiError } from '@/lib/api/api-client'
import type { ExternalIdentityProvider } from '@/types/external-idps.types'

const removeMock = vi.fn<(k: string) => Promise<void>>()
vi.mock('@/services/external-idps.api', () => ({
  externalIdpsApi: { list: vi.fn<() => Promise<unknown>>(), create: vi.fn(), update: vi.fn(), show: vi.fn(), previewMapping: vi.fn(), remove: removeMock },
}))
const PROVIDER: ExternalIdentityProvider = { provider_key: 'acme', display_name: 'Acme IdP', issuer: 'https://i', metadata_url: 'https://m', client_id: 'c', enabled: true, has_client_secret: true }
const providersRef = ref<readonly ExternalIdentityProvider[] | null>([PROVIDER])
const refreshMock = vi.fn<() => Promise<void>>(async () => {})
vi.mock('@/composables/useExternalIdpsList', () => ({
  useExternalIdpsList: () => ({ providers: providersRef, viewState: computed(() => 'ready' as const), isStale: computed(() => false), requestId: computed(() => null), pending: ref(false), refresh: refreshMock }),
}))
let permitted: string[] = []
vi.mock('@/stores/session.store', () => ({
  useSessionStore: () => ({ principal: { display_name: 'Admin', subject_id: 'a1' }, ensureSession: vi.fn<() => Promise<string>>(async () => 'authenticated'), hasPermission: (p: string) => permitted.includes(p), get roles() { return [] as readonly string[] } }),
}))
vi.mock('@/composables/useI18n', () => ({
  useI18n: () => ({ t: (key: string, params?: Record<string, unknown>) => { let val: unknown = enLocale; for (const part of key.split('.')) val = (val as Record<string, unknown>)?.[part]; if (typeof val !== 'string') return key; return params ? val.replace(/\{(\w+)\}/gu, (_: string, k: string) => String(params[k] ?? '')) : val } }),
}))
mockNuxtImport('navigateTo', () => vi.fn<(...a: unknown[]) => Promise<void>>(async () => {}))
const Page = (await import('../external-idps.vue')).default

async function openDelete(wrapper: Awaited<ReturnType<typeof mountSuspended>>) {
  await wrapper.find('[data-testid="external-idp-select-acme"]').trigger('click')
  await flushPromises()
  await wrapper.find('[data-testid="external-idp-delete"]').trigger('click')
  await flushPromises()
}

beforeEach(() => { permitted = ['admin.external-idps.read', 'admin.external-idps.write', 'admin.sessions.terminate']; providersRef.value = [PROVIDER]; removeMock.mockReset(); refreshMock.mockReset() })
afterEach(() => { vi.clearAllMocks() })

describe('external-idps delete — double gate', () => {
  it('hides Delete without sessions.terminate (single gate is not enough)', async () => {
    permitted = ['admin.external-idps.read', 'admin.external-idps.write']
    const wrapper = await mountSuspended(Page)
    await wrapper.find('[data-testid="external-idp-select-acme"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="external-idp-delete"]').exists()).toBe(false)
  })

  it('confirm deletes, refreshes, and reports success; cancel calls no API', async () => {
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
    expect(removeMock).toHaveBeenCalledWith('acme')
    expect(refreshMock).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="external-idps-action-success"]').text()).toBe(enLocale.external_idps.delete_success)
  })

  it('maps 422 not-found to SAFE copy (never the raw message) and does not refresh', async () => {
    removeMock.mockRejectedValue(new ApiError(422, 'External IdP not found.', 'external_idp_invalid', {}, 'req-422'))
    const wrapper = await mountSuspended(Page)
    await openDelete(wrapper)
    await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="privileged-action-error"]').text()).toContain(enLocale.external_idps.delete_invalid)
    expect(wrapper.html()).not.toContain('External IdP not found.')
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('surfaces step-up on 428', async () => {
    removeMock.mockRejectedValue(new ApiError(428, 'reauth', 'reauth_required', { step_up_url: 'https://idp.example/step-up' }, 'req-428'))
    const wrapper = await mountSuspended(Page)
    await openDelete(wrapper)
    await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="privileged-action-stepup"]').find('a').attributes('href')).toBe('https://idp.example/step-up')
    expect(refreshMock).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run it — expect FAIL.**

- [ ] **Step 3: Add delete keys** (BOTH locales, in `external_idps`):

`en.json`:
```json
    "confirm_delete_title": "Delete external provider?",
    "confirm_delete_desc": "Permanently delete {name} and unlink every user federated through it. This cannot be undone.",
    "delete_success": "External provider deleted.",
    "delete_invalid": "That provider could not be found, or the change was rejected."
```
`id.json`:
```json
    "confirm_delete_title": "Hapus provider eksternal?",
    "confirm_delete_desc": "Hapus permanen {name} dan putuskan tautan setiap pengguna yang berfederasi melaluinya. Tindakan ini tidak dapat dibatalkan.",
    "delete_success": "Provider eksternal dihapus.",
    "delete_invalid": "Provider tersebut tidak ditemukan, atau perubahan ditolak."
```

- [ ] **Step 4: Wire delete into `app/pages/external-idps.vue`.** Add to `<script setup>`:

```ts
import PrivilegedActionDialog from '@/components/users/PrivilegedActionDialog.vue'

const deleteAction = usePrivilegedAction<void>()
const deleteTarget = ref<ExternalIdentityProvider | null>(null)

const deleteDescription = computed<string>(() =>
  deleteTarget.value
    ? t('external_idps.confirm_delete_desc', { name: deleteTarget.value.display_name })
    : '',
)
const deleteError = computed<string | null>(() => {
  const status = deleteAction.failure.value?.status
  if (!status || status === 'step_up_required') return null
  if (status === 'invalid') return t('external_idps.delete_invalid')
  return t('common.error_generic')
})

// REPLACE the 10.6 stub body (do NOT rename).
function onDeleteRequested(provider: ExternalIdentityProvider): void {
  deleteAction.reset()
  successMessage.value = null
  deleteTarget.value = provider
}
function onDeleteCancel(): void {
  deleteTarget.value = null
}
async function onDeleteConfirm(): Promise<void> {
  const target = deleteTarget.value
  if (!target) return
  const result = await deleteAction.run(() => externalIdpsApi.remove(target.provider_key))
  if (result === null) return
  deleteTarget.value = null
  selectedKey.value = null
  successMessage.value = t('external_idps.delete_success')
  await refresh()
}
```

> Note: `usePrivilegedAction<void>().run(() => externalIdpsApi.remove(key))` resolves `undefined` on success. Because `run` returns `T | null` and `T = void`, a SUCCESS resolves to `undefined` and a FAILURE to `null` — but `undefined === null` is false, so the `if (result === null) return` failure guard is correct (success: `undefined`, falls through; failure: `null`, returns). Confirm `usePrivilegedAction`'s `run` returns the resolved value (here `undefined`) on success, not `null`; the delete spec's success test (refresh called) verifies this end-to-end.

Add the Delete button to the drawer `idp-detail__actions` (gated `canDelete`, danger) and the danger dialog at page level:

```vue
            <UiButton
              v-if="canDelete"
              variant="danger"
              size="sm"
              data-testid="external-idp-delete"
              @click="onDeleteRequested(selectedProvider)"
            >
              {{ t('common.btn_delete') }}
            </UiButton>
```

```vue
    <PrivilegedActionDialog
      v-if="deleteTarget !== null"
      :open="deleteTarget !== null"
      :title="t('external_idps.confirm_delete_title')"
      :description="deleteDescription"
      :confirm-label="t('common.btn_delete')"
      :cancel-label="t('common.btn_cancel')"
      danger
      :submitting="deleteAction.isSubmitting.value"
      :error-message="deleteError"
      :request-id="deleteAction.requestId.value"
      :step-up-url="deleteAction.stepUpUrl.value"
      :step-up-label="t('external_idps.step_up_cta')"
      @confirm="onDeleteConfirm"
      @cancel="onDeleteCancel"
    />
```

- [ ] **Step 5: Run it — expect PASS.** Re-run the read/write/preview specs (no regression).

- [ ] **Step 6: Commit:**

```bash
git add app/pages/external-idps.vue app/pages/__tests__/external-idps-delete.page.nuxt.spec.ts app/locales/en.json app/locales/id.json
git commit -m "$(cat <<'EOF'
feat(sso-admin-frontend): external-idp delete danger action (double-gate, safe 422)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Task-scoped DoD:** `npm run typecheck && npm run lint && npm run format:check && npm run test -- app/pages/__tests__/external-idps-delete.page.nuxt.spec.ts app/pages/__tests__/external-idps.page.nuxt.spec.ts` — all green.

---

### Task 10.11: Extend the SSR token-leak gate + e2e + full Phase-10 DoD

**Files:**
- Modify: `test/ssr-token-leak.gate.spec.ts` (add `fetchExternalIdps` + three `it` blocks)
- Create: `test/fixtures/ssr-leak/server/routes/api/admin/external-idps/index.get.ts` (the provider list fixture)
- Verify (add caps if missing): `test/fixtures/ssr-leak/server/routes/api/admin/me.get.ts` — the sentinel principal must grant `admin.external-idps.read` (so `/external-idps` renders READY) + `admin.external-idps.write` (so the Add/Edit/Preview affordances hydrate); `admin.sessions.terminate` is already present (added in earlier phases) so the Delete affordance hydrates too
- Create: `e2e/external-idps.spec.ts` (Playwright — the create + delete high-risk paths)

**Interfaces:**
- Consumes: the gate helpers `extractPayload`, `collectSecretLeaks`, `collectPiiShapeLeaks`, the `$fetch`/`setup` harness; `external-idps.vue` as the rendered `/external-idps` route.
- Produces: `fetchExternalIdps = () => $fetch('/external-idps', { headers: { cookie: 'admin_locale=en' } })`; a "renders ready (masked)" assertion (`data-admin-shell` + a fixture provider name); `collectSecretLeaks(html)`/`collectSecretLeaks(payload)`/`collectPiiShapeLeaks(payload)` all `toEqual([])` — **strict (no `allowSessionId`)** (the provider DTO carries no secret — `has_client_secret` is a boolean — and no session id or gov-PII; `client_id`/`issuer`/endpoints are public OIDC config).

This is the **final integration + proof task** of Phase 10. It writes no product code — it proves, against a real SSR render and a real browser, that the federation surface (Tasks 10.1–10.10) leaks no secret (the response carries `has_client_secret`, never the value) and that its highest-risk flows (create + delete) work end to end. It mirrors the roles/policy/sessions gate extensions.

- [ ] **Step 1: RED — extend the leak gate.** Add `fetchExternalIdps` next to the other fetchers, and the three `it` blocks after the sessions group:

```ts
function fetchExternalIdps(): Promise<string> {
  return $fetch('/external-idps', { headers: { cookie: 'admin_locale=en' } })
}
```
```ts
  it('renders the external providers list server-side in their ready (masked) state', async () => {
    const html = await fetchExternalIdps()
    expect(html).toContain('data-admin-shell')
    // a provider display name + the "secret configured" status render — proving the
    // table mounted and that has_client_secret is shown as a STATUS, not a value.
    expect(html).toContain('Sentinel Federation')
    expect(html).toContain('Acme')
  })

  it('does not leak token/secret/PII values into the external-idps SSR HTML', async () => {
    // Strict — the provider DTO carries has_client_secret (a boolean), client_id/
    // issuer/endpoints (public OIDC config), and no session id or gov-PII.
    const html = await fetchExternalIdps()
    expect(collectSecretLeaks(html, 'external-idps SSR HTML')).toEqual([])
  })

  it('does not leak token/secret/PII values into the external-idps hydration payload', async () => {
    const html = await fetchExternalIdps()
    const serialized = JSON.stringify(JSON.parse(extractPayload(html)))
    expect(collectSecretLeaks(serialized, 'external-idps __NUXT__ payload')).toEqual([])
    expect(collectPiiShapeLeaks(serialized, 'external-idps __NUXT__ payload')).toEqual([])
  })
```

- [ ] **Step 2: Run it — expect FAIL** (`npm run test -- test/ssr-token-leak.gate.spec.ts`): the "ready (masked)" block fails — no `external-idps` fixture route, so the SSR fetch errors and the page is not READY.

- [ ] **Step 3: GREEN — add the fixture route + verify caps.** Create `test/fixtures/ssr-leak/server/routes/api/admin/external-idps/index.get.ts`:

```ts
// SSR token-leak fixture: a representative masked provider list so the §3.3 gate
// renders the External IdPs page READY. has_client_secret is a BOOLEAN (never the
// secret value); client_id/issuer/endpoints are public OIDC config; no token, secret,
// session id, or PII-shaped digit run.
import { defineEventHandler } from 'h3'

export default defineEventHandler(() => ({
  providers: [
    {
      provider_key: 'sentinel-fed',
      display_name: 'Sentinel Federation',
      issuer: 'https://idp.sentinel.dev-sso.local',
      metadata_url: 'https://idp.sentinel.dev-sso.local/.well-known/openid-configuration',
      client_id: 'sso-sentinel-client',
      authorization_endpoint: 'https://idp.sentinel.dev-sso.local/authorize',
      token_endpoint: 'https://idp.sentinel.dev-sso.local/token',
      userinfo_endpoint: 'https://idp.sentinel.dev-sso.local/userinfo',
      jwks_uri: 'https://idp.sentinel.dev-sso.local/jwks',
      allowed_algorithms: ['RS256'],
      scopes: ['openid', 'profile', 'email'],
      priority: 100,
      enabled: true,
      is_backup: false,
      tls_validation_enabled: true,
      signature_validation_enabled: true,
      has_client_secret: true,
      health_status: 'healthy',
    },
    {
      provider_key: 'acme-backup',
      display_name: 'Acme Backup',
      issuer: 'https://login.acme.dev-sso.local',
      metadata_url: 'https://login.acme.dev-sso.local/.well-known/openid-configuration',
      client_id: 'sso-acme-client',
      allowed_algorithms: ['RS256', 'ES256'],
      scopes: ['openid'],
      priority: 200,
      enabled: false,
      is_backup: true,
      tls_validation_enabled: true,
      signature_validation_enabled: false,
      has_client_secret: false,
      health_status: 'unknown',
    },
  ],
  meta: { current_page: 1, per_page: 25, total: 2 },
}))
```

Then confirm the sentinel principal grants the caps:
```bash
grep -E "admin.external-idps.(read|write)|admin.sessions.terminate" test/fixtures/ssr-leak/server/routes/api/admin/me.get.ts
```
Expected: `admin.external-idps.read` + `admin.external-idps.write` present under `capabilities` (and `permissions.permissions[]`); `admin.sessions.terminate` already present. If either external-idps cap is missing, add it to BOTH (additive — does not affect other domains' gate blocks).

- [ ] **Step 3b: ⚠️ REQUIRED — exclude the benign `has_client_secret` boolean from the secret-field-NAME collector.** The provider DTO carries `has_client_secret` (a boolean status — NEVER the value), and `useExternalIdpsList` serializes the provider list into `__NUXT_DATA__`. The existing `collectSecretLeaks` field-NAME regex (`test/ssr-token-leak.gate.spec.ts`, ~line 139) substring-matches `client_secret` **inside** `has_client_secret`, so without this change the strict `collectSecretLeaks(...).toEqual([])` assertions fail with a phantom "leaks a client-secret field name". The clients domain dodged this by naming its boolean `has_secret_hash`; the external-idp backend field name is fixed ground-truth and cannot be renamed, so the **collector** must exclude the `has_` prefix (mirroring the existing `has_secret_hash` exemption). Change the regex (keep the `SENTINEL.clientSecret` VALUE `reportContains` check above it UNCHANGED — a real secret value must still trip):

```ts
  // Client-secret + rotate-response plaintext field NAMES (snake_case wire +
  // camelCase shapes). The masked DTOs carry only the BOOLEAN status fields
  // `has_secret_hash` (clients) / `has_client_secret` (external-idps) — never the
  // value — so the `has_` prefix is excluded; `client_id` is also not matched.
  reportMatches(
    /(?<!has_)client_secret|(?<!has_)clientSecret|plaintext_secret|plaintext_once/,
    'leaks a client-secret field name',
  )
```

Verify the negative-control tripwire still fires: the planted `{"client":{"client_secret":"<sentinel>"}}` (gate ~line 382) has `client_secret` preceded by `"`, not `has_`, so `(?<!has_)client_secret` still matches it — the tripwire stays LIVE. Stage this file with the gate spec in Step 5 (it is the same file).

- [ ] **Step 4: Run it — expect PASS** (`npm run test -- test/ssr-token-leak.gate.spec.ts`). Expected: all external-idps blocks green (the strict collectors return `[]` now that `has_client_secret` is excluded); the pre-existing dashboard/users/clients/observability/roles/policy/sessions blocks + the negative-control tripwire stay green.

- [ ] **Step 5: Commit the gate extension:**

```bash
git add test/ssr-token-leak.gate.spec.ts test/fixtures/ssr-leak/server/routes/api/admin/external-idps/index.get.ts test/fixtures/ssr-leak/server/routes/api/admin/me.get.ts
git commit -m "$(cat <<'EOF'
test(sso-admin-frontend): extend SSR leak gate to the external providers list

Render /external-idps under full SSR with the sentinel admin and assert the
provider list hydrates as masked config only: has_client_secret is a boolean
(never the secret value), client_id/issuer/endpoints are public OIDC config, and
no token value/name, secret, or PII-shaped digit run reaches the SSR HTML or
__NUXT_DATA__. Strict checks (no allowSessionId).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 6: Author the e2e** — `e2e/external-idps.spec.ts` (mirror `e2e/policy.spec.ts`: `admin_locale=en` cookie; mock `/api/admin/me` + `/api/admin/external-idps` + the POST/DELETE; drive create + delete). **Do NOT run `npm run test:e2e`** — Playwright is wired to the legacy SPA, so e2e is systemically deferred to Phase 18. Author + commit; it parses under tsc/eslint in the DoD.

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
      permissions: ['admin.dashboard.view', 'admin.external-idps.read', 'admin.external-idps.write', 'admin.sessions.terminate'],
      capabilities: { 'admin.dashboard.view': true, 'admin.external-idps.read': true, 'admin.external-idps.write': true, 'admin.sessions.terminate': true },
      menus: [
        { id: 'dashboard', label: 'Dashboard', required_permission: 'admin.dashboard.view', visible: true },
        { id: 'external-idps', label: 'External IdP', required_permission: 'admin.external-idps.read', visible: true },
      ],
    },
  },
}
const readOnly = {
  principal: {
    ...principal.principal,
    permissions: { view_admin_panel: true, manage_sessions: false, permissions: ['admin.dashboard.view'], capabilities: { 'admin.dashboard.view': true }, menus: [{ id: 'dashboard', label: 'Dashboard', required_permission: 'admin.dashboard.view', visible: true }] },
  },
}
const provider = { provider_key: 'acme', display_name: 'Acme IdP', issuer: 'https://idp.acme.test', metadata_url: 'https://idp.acme.test/m', client_id: 'sso-client', enabled: true, has_client_secret: true, health_status: 'healthy' }

async function mockMe(page: Page, body: object) {
  await page.route('**/api/admin/me', async (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(body) }))
}
async function mockList(page: Page) {
  await page.route('**/api/admin/external-idps', async (r) => {
    if (r.request().method() !== 'GET') return r.continue()
    await r.fulfill({ contentType: 'application/json', headers: { 'x-request-id': 'req-idp-e2e' }, body: JSON.stringify({ providers: [provider] }) })
  })
}

test('create: open the form, submit, POST fires', async ({ page }) => {
  await mockMe(page, principal)
  await mockList(page)
  let posted: unknown = null
  await page.route('**/api/admin/external-idps', async (r) => {
    if (r.request().method() !== 'POST') return r.continue()
    posted = r.request().postDataJSON()
    await r.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ provider: { ...provider, provider_key: 'newidp', display_name: 'New IdP' } }) })
  })
  await page.goto('/external-idps')
  await page.getByTestId('external-idps-create').click()
  await page.getByTestId('idp-field-provider_key').fill('newidp')
  await page.getByTestId('idp-field-display_name').fill('New IdP')
  await page.getByTestId('idp-field-issuer').fill('https://new.test')
  await page.getByTestId('idp-field-metadata_url').fill('https://new.test/m')
  await page.getByTestId('idp-field-client_id').fill('newclient')
  await page.getByTestId('idp-field-client_secret').fill('s3cret')
  await page.getByTestId('external-idp-form-submit').click()
  await expect.poll(() => posted).not.toBeNull()
  expect(posted).toMatchObject({ provider_key: 'newidp' })
  await expect(page.getByText(/Bearer|access_token|client_secret/u)).toHaveCount(0)
})

test('delete: drawer danger confirm fires DELETE; cancel calls no API', async ({ page }) => {
  await mockMe(page, principal)
  await mockList(page)
  let deleted = false
  await page.route('**/api/admin/external-idps/acme', async (r) => {
    if (r.request().method() !== 'DELETE') return r.continue()
    deleted = true
    await r.fulfill({ status: 204, body: '' })
  })
  await page.goto('/external-idps')
  await page.getByTestId('external-idp-select-acme').click()
  await page.getByTestId('external-idp-delete').click()
  await page.getByTestId('privileged-action-cancel').click()
  expect(deleted).toBe(false)
  await page.getByTestId('external-idp-select-acme').click()
  await page.getByTestId('external-idp-delete').click()
  await page.getByTestId('privileged-action-confirm').click()
  await expect.poll(() => deleted).toBe(true)
})

test('forbidden: an admin without external-idps.read sees the safe forbidden surface', async ({ page }) => {
  await mockMe(page, readOnly)
  await page.goto('/external-idps')
  await expect(page).toHaveURL(/\/forbidden$/u)
  await expect(page.getByText(/Bearer|access_token|client_secret/u)).toHaveCount(0)
})
```

- [ ] **Step 7: Commit the e2e:**

```bash
git add e2e/external-idps.spec.ts
git commit -m "$(cat <<'EOF'
test(sso-admin-frontend): e2e the external-idp create + delete high-risk paths

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 8: Run the full Phase-10 DoD gate** from `services/sso-admin-frontend` (report any blocked command explicitly):

```bash
npm run typecheck && npm run lint && npm run format:check && npm run test && npm run build
```
e2e (`npm run test:e2e`) is **deferred to Phase 18** (legacy-SPA `playwright.config.ts`) — do not run it; report it as deferred.

---

## Phase 10 Definition of Done

- [ ] DTO types + view-state + tones (10.1) + pure helpers search/form/payloads/claims (10.2) + `external-idps.api` service (10.3) + `useExternalIdpsList` SSR composable (10.4) + `ExternalIdpsTable` (10.5) + the `/external-idps` page all-six-states read surface (10.6) + `ExternalIdpFormDialog` (10.7) + create/update (10.8) + mapping-preview (10.9) + delete (10.10) + SSR-leak-gate/e2e (10.11) all implemented test-first, each committed green.
- [ ] **Full gate green** from `services/sso-admin-frontend`: `npm run typecheck` (0), `npm run lint` (0 — BOTH `lint:oxlint` and `lint:eslint`), `npm run format:check`, `npm run test` (full suite, incl. the new gate blocks + all external-idps specs), `npm run build` — all PASS.
- [ ] **SSR token-leak gate extended** (10.11) over the provider list with **strict** checks (no `allowSessionId`): no token value/name, secret value/name (`has_client_secret` is a boolean, never the value), raw NIK/NIP/NISN digit run, raw backend exception, or `SSR_LEAK_CANARY` in the `/external-idps` SSR HTML or `__NUXT_DATA__`; collectors assert `.toEqual([])`; the pre-existing tripwire stays green.
- [ ] **⚠️ 422 SQL-leak guard:** the create/update/delete 422 `external_idp_invalid` (which carries a raw SQL constraint message and/or "not found") maps to SAFE, status-keyed domain copy (`create_invalid`/`update_invalid`/`delete_invalid`) — `error.message` and the raw SQL text are PROVEN absent from the rendered HTML by the write + delete specs. Only `REF-…` (never a raw request id) is shown.
- [ ] **Secret write-only:** `client_secret` is a `type="password"` field that never prefills and is sent only when non-empty (edit-blank = keep existing); `has_client_secret` renders as a "configured"/"not set" status, never the value; the secret never reaches the SSR payload (the DTO has no secret field) or any log.
- [ ] **Privileged-action matrix** on all four writes (create/update/mapping-preview `:write`, delete `:step_up`): every status (403/419/422/428/429/5xx + step-up) surfaces safe, status-keyed copy; cancel calls no API; a failed write leaves no stale loading; no `refresh()` on failure; mapping-preview guards invalid claims client-side (no API call).
- [ ] **Domain UI rules:** read gated `admin.external-idps.read` (page); create/edit/preview gated `admin.external-idps.write`; **delete double-gated** `write && sessions.terminate` (backend additionally enforces the session-management role); the provider DTO uses the REAL 18 fields (the 8 over-declared legacy breaker/audit fields are NOT rendered).
- [ ] **Swiss discipline:** single accent; **`--danger #E4002B` only on the delete affordance** (+ inline form-validation text); enabled + `health_status` render as tone + label via `UiStatusBadge` (never colour-alone); `--font-mono` for `provider_key`/`client_id`/URLs; hairline borders, no shadows.
- [ ] **Type discipline:** new types in `app/types/external-idps.types.ts`, never duplicated.
- [ ] **Locale parity:** `app/locales/en.json` + `id.json` stay in sync; all added `external_idps.*` keys present in both; no traceability markers anywhere; ALL copy in i18n (the legacy hardcoded most strings).
- [ ] **E2E authored** for create + delete + the forbidden flow (`e2e/external-idps.spec.ts`); run **deferred to Phase 18** (legacy-SPA `playwright.config.ts`, systemic) — recorded, not silently skipped.
- [ ] **Branch discipline:** the feature branch stays off `main` until the Phase 18 cutover.

---
