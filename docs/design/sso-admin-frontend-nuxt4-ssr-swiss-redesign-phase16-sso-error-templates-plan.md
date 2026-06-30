# Phase 16 — SSO Error Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the legacy `sso-error-templates` SPA feature to the Nuxt 4 SSR admin as the FINAL domain — a read surface (list + detail drawer) plus two step-up-gated write flows (edit copy via PATCH, reset-to-default via POST), all Swiss-styled and token-blind.

**Architecture:** Mirror the shipped `ip-access` domain exactly: pure DTO/view-state/form libs (jsdom-tested) → token-blind `apiClient` service → `useAsyncData`-backed SSR composable → presentational table → teleported edit dialog → privileged reset confirm → page that wires states + drawer + both privileged flows. Both writes route through the existing `usePrivilegedAction` runner (step-up FIRST, 422→safe status-keyed copy, never `.message`). The BFF `admin-proxy` allow-list gains nothing new except a one-character bug fix (a stale `PUT` route that must be `PATCH` to match the backend). Edit prefills from the selected list row — the index response already carries every field, so there is no GET-by-code.

**Tech Stack:** Nuxt 4.4.8 (SSR, srcDir `app/`), Vue 3.5 SFC, TS strict, Vitest 4 + `@nuxt/test-utils` 4, reka-ui dialog primitives.

## Global Constraints

- **Branch stays OFF `main`** until the Phase 18 cutover. Commit only the tasks below.
- **Commit trailer (every commit):** `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **No traceability markers** (`OG#`, `UC###`, `FR###`, `BE-FR###`) anywhere — source, tests, comments, routes, config, locale. Use descriptive domain names.
- **Token-blind SPA.** The browser never holds the access token; the BFF injects `Bearer`. Never read/forward tokens in app code.
- **§3.3 SSR leak gate is STRICT for this domain.** The error-template DTO is admin-authored end-user error copy — no token, secret, OIDC `sid`, or government PII. No `allowSessionId`, no `allowOidcDiscoveryVocabulary` exemption.
- **Swiss colour discipline.** `#002FA7` (Klein, `--accent`) is the brand/primary; `#E4002B` (`--danger`) is reserved for destructive affordances + inline form-validation text ONLY. Status is never colour-alone — always tone **plus** label via `UiStatusBadge`. No gradients, no shadows. **Reset is a revert, not a delete → its confirm button is `--accent` (primary), NOT danger.** The only `#E4002B` on this page is inline field-error text in the edit dialog.
- **PII handling.** N/A to this domain's DTO, but never log raw request bodies; the 422 path maps to safe domain copy and never renders a raw backend `message`.
- **Test env by filename.** `*.nuxt.spec.ts` / `*.page.nuxt.spec.ts` → nuxt env (`mountSuspended`, `mockNuxtImport`). Plain `*.spec.ts` → jsdom (`@vue/test-utils mount`). Any component that teleports (`UiDialog`, `UiDetailDrawer`, `PrivilegedActionDialog`) MUST be a `.nuxt.spec.ts` with `mountSuspended`.
- **oxlint gates.** Every `vi.fn(...)` is typed; every `.toThrow(...)` / `.rejects.toThrow()` carries a message argument; `expect(value, message)` is banned (collect-and-`toEqual([])` instead).
- **Page identity is frozen.** `definePageMeta` keeps `name: 'admin.sso-error-templates'`, `layout: 'admin'`, `requiresAdmin: true`, `permissions: ['admin.security-policy.read']` verbatim — `app/pages/__tests__/route-map.spec.ts` asserts this exact tuple. Write capability is a SEPARATE runtime check: `store.hasPermission('admin.sso-error-templates.write')`.

## Backend contract (read-only reference — do not change)

`routes/admin.php`:
- `GET  /admin/api/sso-error-templates` — index (returns ALL templates, every field).
- `GET  /admin/api/sso-error-templates/{errorCode}` — show (unused by this SPA; index is complete).
- `PATCH /admin/api/sso-error-templates/{errorCode}` — update. Write group: `RequireAdminPermission::SSO_ERROR_TEMPLATES_WRITE` + `EnsureFreshAdminAuth:step_up` + `EnsureAdminMfaAssurance` + `throttle:admin-write`.
- `POST /admin/api/sso-error-templates/{errorCode}/reset` — reset to default, body `{ locale }`. Same write group.
- `{errorCode}` route constraint: `[a-z_]+` (backend); the BFF allow-list pattern is the broader `[a-z0-9_-]+`.

`UpsertSsoErrorTemplateRequest` validation:
- `locale` required, `in:id,en`
- `title` required string `max:120`
- `message` required string `max:500`
- `action_label` required string `max:80`
- `action_url` nullable `url` (https) `max:500`
- `retry_allowed`, `alternative_login_allowed`, `is_enabled` required boolean

BFF mapping (`server/utils/admin-proxy.ts`): same-origin `/api/admin/sso-error-templates*` → backend `/admin/api/sso-error-templates*`, Bearer injected server-side. The index GET (`ALLOWED_ADMIN_ROUTES`) and the reset POST (`ALLOWED_ADMIN_ROUTE_PATTERNS` line 103) are already correct; the GET-by-code (line 101) stays (harmless, unused); **only the update route (line 102) is wrong — it reads `PUT`, must be `PATCH`.**

## File Structure

| File | Responsibility |
|---|---|
| `app/types/sso-error-templates.types.ts` | DTO + payload interfaces (create) |
| `app/lib/sso-error-templates/sso-error-templates-view-state.ts` | view-state resolver + `resolveEnabledTone` + `templateKey` (create) |
| `app/lib/sso-error-templates/sso-error-template-form.ts` | form model + `validate*` + `buildUpsertPayload` + `templateToFormModel` (create) |
| `app/services/sso-error-templates.api.ts` | token-blind `list`/`update`(PATCH)/`reset`(POST) (create) |
| `server/utils/admin-proxy.ts` | **fix line 102 `PUT` → `PATCH`** (modify) |
| `server/__tests__/admin-proxy.spec.ts` | assert PATCH allowed + PUT rejected (modify) |
| `app/composables/useSsoErrorTemplates.ts` | SSR list composable (create) |
| `app/components/sso-error-templates/SsoErrorTemplatesTable.vue` | presentational `UiDataList` table (create) |
| `app/components/sso-error-templates/SsoErrorTemplateFormDialog.vue` | teleported edit dialog, prefilled (create) |
| `app/pages/sso-error-templates.vue` | states + table + drawer + edit + reset (replace stub) |
| `app/locales/en.json`, `app/locales/id.json` | replace the `sso_templates` block wholesale (modify) |
| `test/fixtures/ssr-leak/server/routes/api/admin/sso-error-templates/index.get.ts` | sentinel template list for the gate (create) |
| `test/fixtures/ssr-leak/server/routes/api/admin/me.get.ts` | grant `admin.sso-error-templates.write` (modify) |
| `test/ssr-token-leak.gate.spec.ts` | STRICT gate for `/sso-error-templates` (modify) |

---

### Task 16.1: DTO types + view-state + enabled tone + composite key

**Files:**
- Create: `app/types/sso-error-templates.types.ts`
- Create: `app/lib/sso-error-templates/sso-error-templates-view-state.ts`
- Test: `app/lib/sso-error-templates/__tests__/sso-error-templates-view-state.spec.ts`

**Interfaces:**
- Produces: `SsoErrorTemplate`, `SsoErrorTemplateLocale` (`'id'|'en'`), `SsoErrorTemplatesResponse`, `SsoErrorTemplateResponse`, `UpsertSsoErrorTemplatePayload`; `resolveSsoErrorTemplatesViewState({pending,error,templates}) → SsoErrorTemplatesViewState`; `resolveEnabledTone(boolean) → StatusTone`; `templateKey({error_code,locale}) → string` (`"${error_code}::${locale}"`).

- [ ] **Step 1: Write the failing test**

```ts
// app/lib/sso-error-templates/__tests__/sso-error-templates-view-state.spec.ts
import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api/api-client'
import {
  resolveEnabledTone,
  resolveSsoErrorTemplatesViewState,
  templateKey,
} from '@/lib/sso-error-templates/sso-error-templates-view-state'
import type { SsoErrorTemplate } from '@/types/sso-error-templates.types'

const tpl = (over: Partial<SsoErrorTemplate> = {}): SsoErrorTemplate => ({
  error_code: 'access_denied',
  locale: 'en',
  title: 'Access denied',
  message: 'You do not have access.',
  action_label: 'Back to sign-in',
  action_url: null,
  retry_allowed: false,
  alternative_login_allowed: false,
  is_enabled: true,
  ...over,
})

describe('resolveSsoErrorTemplatesViewState', () => {
  it('returns loading when no data and no error', () => {
    expect(resolveSsoErrorTemplatesViewState({ pending: true, error: null, templates: null })).toBe(
      'loading',
    )
  })
  it('maps 401 to unauthenticated and 403 to forbidden', () => {
    expect(
      resolveSsoErrorTemplatesViewState({
        pending: false,
        error: new ApiError(401, 'no'),
        templates: null,
      }),
    ).toBe('unauthenticated')
    expect(
      resolveSsoErrorTemplatesViewState({
        pending: false,
        error: new ApiError(403, 'no'),
        templates: null,
      }),
    ).toBe('forbidden')
  })
  it('returns error for other failures and empty/ready for data', () => {
    expect(
      resolveSsoErrorTemplatesViewState({
        pending: false,
        error: new ApiError(500, 'boom'),
        templates: null,
      }),
    ).toBe('error')
    expect(
      resolveSsoErrorTemplatesViewState({ pending: false, error: null, templates: [] }),
    ).toBe('empty')
    expect(
      resolveSsoErrorTemplatesViewState({ pending: false, error: null, templates: [tpl()] }),
    ).toBe('ready')
  })
  it('prefers stale data over error (error + cached templates → ready)', () => {
    expect(
      resolveSsoErrorTemplatesViewState({
        pending: false,
        error: new ApiError(500, 'boom'),
        templates: [tpl()],
      }),
    ).toBe('ready')
  })
})

describe('resolveEnabledTone / templateKey', () => {
  it('enabled → success, disabled → neutral', () => {
    expect(resolveEnabledTone(true)).toBe('success')
    expect(resolveEnabledTone(false)).toBe('neutral')
  })
  it('builds a stable composite key from error_code + locale', () => {
    expect(templateKey(tpl({ error_code: 'mfa_required', locale: 'id' }))).toBe('mfa_required::id')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run app/lib/sso-error-templates/__tests__/sso-error-templates-view-state.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the types**

```ts
// app/types/sso-error-templates.types.ts
export type SsoErrorTemplateLocale = 'id' | 'en'

export interface SsoErrorTemplate {
  readonly error_code: string
  readonly locale: string
  readonly title: string
  readonly message: string
  readonly action_label: string
  readonly action_url: string | null
  readonly retry_allowed: boolean
  readonly alternative_login_allowed: boolean
  readonly is_enabled: boolean
}

export interface SsoErrorTemplatesResponse {
  readonly templates: readonly SsoErrorTemplate[]
}

export interface SsoErrorTemplateResponse {
  readonly template: SsoErrorTemplate
}

export interface UpsertSsoErrorTemplatePayload {
  readonly locale: SsoErrorTemplateLocale
  readonly title: string
  readonly message: string
  readonly action_label: string
  readonly action_url: string | null
  readonly retry_allowed: boolean
  readonly alternative_login_allowed: boolean
  readonly is_enabled: boolean
}
```

- [ ] **Step 4: Write the view-state lib**

```ts
// app/lib/sso-error-templates/sso-error-templates-view-state.ts
import { ApiError } from '@/lib/api/api-client'
import type { StatusTone } from '@/lib/status-tone'
import type { SsoErrorTemplate } from '@/types/sso-error-templates.types'

export type SsoErrorTemplatesViewState =
  | 'loading'
  | 'unauthenticated'
  | 'forbidden'
  | 'error'
  | 'empty'
  | 'ready'

export function resolveSsoErrorTemplatesViewState({
  error,
  templates,
}: {
  readonly pending: boolean
  readonly error: unknown
  readonly templates: readonly SsoErrorTemplate[] | null
}): SsoErrorTemplatesViewState {
  if (error && !templates) {
    const status = errorStatus(error)
    if (status === 401) return 'unauthenticated'
    if (status === 403) return 'forbidden'
    return 'error'
  }
  if (templates) return templates.length === 0 ? 'empty' : 'ready'
  return 'loading'
}

// Swiss: enabled = success tone, disabled = neutral. A disabled template is a
// deliberate operational state, not an error — #E4002B/--danger stays reserved
// for destructive affordances + inline validation. The badge carries tone AND
// label; colour is never load-bearing.
export function resolveEnabledTone(isEnabled: boolean): StatusTone {
  return isEnabled ? 'success' : 'neutral'
}

// error_code is not unique on its own (one code has an `id` and an `en` row), so
// the list key + selection identity is the error_code+locale pair.
export function templateKey(template: Pick<SsoErrorTemplate, 'error_code' | 'locale'>): string {
  return `${template.error_code}::${template.locale}`
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

- [ ] **Step 5: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run app/lib/sso-error-templates/__tests__/sso-error-templates-view-state.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/types/sso-error-templates.types.ts app/lib/sso-error-templates/sso-error-templates-view-state.ts app/lib/sso-error-templates/__tests__/sso-error-templates-view-state.spec.ts
git commit -m "feat(sso-admin-frontend): Swiss SSO error-template DTO + view-state"
```

---

### Task 16.2: Form lib — validate, build payload, seed from template

**Files:**
- Create: `app/lib/sso-error-templates/sso-error-template-form.ts`
- Test: `app/lib/sso-error-templates/__tests__/sso-error-template-form.spec.ts`

**Interfaces:**
- Consumes: `SsoErrorTemplate`, `SsoErrorTemplateLocale`, `UpsertSsoErrorTemplatePayload` (16.1).
- Produces: `SsoErrorTemplateFormModel`; `validateSsoErrorTemplateForm(form) → {valid, fieldErrors}` (codes: `required` | `too_long` | `invalid_url`); `buildUpsertPayload(form) → UpsertSsoErrorTemplatePayload`; `templateToFormModel(template) → SsoErrorTemplateFormModel`.

- [ ] **Step 1: Write the failing test**

```ts
// app/lib/sso-error-templates/__tests__/sso-error-template-form.spec.ts
import { describe, expect, it } from 'vitest'
import {
  buildUpsertPayload,
  templateToFormModel,
  validateSsoErrorTemplateForm,
  type SsoErrorTemplateFormModel,
} from '@/lib/sso-error-templates/sso-error-template-form'
import type { SsoErrorTemplate } from '@/types/sso-error-templates.types'

const model = (over: Partial<SsoErrorTemplateFormModel> = {}): SsoErrorTemplateFormModel => ({
  locale: 'en',
  title: 'Access denied',
  message: 'You do not have access to this application.',
  action_label: 'Back to sign-in',
  action_url: '',
  retry_allowed: false,
  alternative_login_allowed: true,
  is_enabled: true,
  ...over,
})

describe('validateSsoErrorTemplateForm', () => {
  it('accepts a well-formed model with a blank optional action_url', () => {
    expect(validateSsoErrorTemplateForm(model()).valid).toBe(true)
  })
  it('flags required text fields', () => {
    const r = validateSsoErrorTemplateForm(model({ title: '   ', message: '', action_label: '' }))
    expect(r.fieldErrors).toMatchObject({
      title: 'required',
      message: 'required',
      action_label: 'required',
    })
  })
  it('flags over-length title/message/action_label', () => {
    const r = validateSsoErrorTemplateForm(
      model({ title: 'a'.repeat(121), message: 'm'.repeat(501), action_label: 'b'.repeat(81) }),
    )
    expect(r.fieldErrors).toMatchObject({
      title: 'too_long',
      message: 'too_long',
      action_label: 'too_long',
    })
  })
  it('rejects a non-https or unparsable action_url, accepts https', () => {
    expect(validateSsoErrorTemplateForm(model({ action_url: 'http://x.test' })).fieldErrors).toMatchObject({
      action_url: 'invalid_url',
    })
    expect(validateSsoErrorTemplateForm(model({ action_url: 'not a url' })).fieldErrors).toMatchObject({
      action_url: 'invalid_url',
    })
    expect(validateSsoErrorTemplateForm(model({ action_url: 'https://sso.example/help' })).valid).toBe(
      true,
    )
  })
  it('flags an over-length action_url before scheme', () => {
    const long = `https://sso.example/${'p'.repeat(500)}`
    expect(validateSsoErrorTemplateForm(model({ action_url: long })).fieldErrors).toMatchObject({
      action_url: 'too_long',
    })
  })
})

describe('buildUpsertPayload', () => {
  it('trims text and maps a blank action_url to null', () => {
    expect(buildUpsertPayload(model({ title: '  Hi  ', action_url: '   ' }))).toEqual({
      locale: 'en',
      title: 'Hi',
      message: 'You do not have access to this application.',
      action_label: 'Back to sign-in',
      action_url: null,
      retry_allowed: false,
      alternative_login_allowed: true,
      is_enabled: true,
    })
  })
  it('keeps a present action_url', () => {
    expect(buildUpsertPayload(model({ action_url: ' https://sso.example/help ' })).action_url).toBe(
      'https://sso.example/help',
    )
  })
})

describe('templateToFormModel', () => {
  it('seeds the model from a template, normalising a null action_url to empty string', () => {
    const template: SsoErrorTemplate = {
      error_code: 'mfa_required',
      locale: 'id',
      title: 'Verifikasi diperlukan',
      message: 'Selesaikan verifikasi.',
      action_label: 'Lanjut',
      action_url: null,
      retry_allowed: true,
      alternative_login_allowed: false,
      is_enabled: false,
    }
    expect(templateToFormModel(template)).toEqual({
      locale: 'id',
      title: 'Verifikasi diperlukan',
      message: 'Selesaikan verifikasi.',
      action_label: 'Lanjut',
      action_url: '',
      retry_allowed: true,
      alternative_login_allowed: false,
      is_enabled: false,
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run app/lib/sso-error-templates/__tests__/sso-error-template-form.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the form lib**

```ts
// app/lib/sso-error-templates/sso-error-template-form.ts
import type {
  SsoErrorTemplate,
  SsoErrorTemplateLocale,
  UpsertSsoErrorTemplatePayload,
} from '@/types/sso-error-templates.types'

export type SsoErrorTemplateFormModel = {
  locale: SsoErrorTemplateLocale
  title: string
  message: string
  action_label: string
  action_url: string
  retry_allowed: boolean
  alternative_login_allowed: boolean
  is_enabled: boolean
}

// Mirror UpsertSsoErrorTemplateRequest: title max:120, message max:500,
// action_label max:80, action_url nullable url:https max:500.
const TITLE_MAX = 120
const MESSAGE_MAX = 500
const ACTION_LABEL_MAX = 80
const ACTION_URL_MAX = 500

export function validateSsoErrorTemplateForm(
  form: SsoErrorTemplateFormModel,
): { valid: boolean; fieldErrors: Record<string, string> } {
  const fieldErrors: Record<string, string> = {}

  const title = form.title.trim()
  if (!title) fieldErrors.title = 'required'
  else if (title.length > TITLE_MAX) fieldErrors.title = 'too_long'

  const message = form.message.trim()
  if (!message) fieldErrors.message = 'required'
  else if (message.length > MESSAGE_MAX) fieldErrors.message = 'too_long'

  const actionLabel = form.action_label.trim()
  if (!actionLabel) fieldErrors.action_label = 'required'
  else if (actionLabel.length > ACTION_LABEL_MAX) fieldErrors.action_label = 'too_long'

  // action_url is optional; only validate length + https scheme when present.
  const actionUrl = form.action_url.trim()
  if (actionUrl) {
    if (actionUrl.length > ACTION_URL_MAX) fieldErrors.action_url = 'too_long'
    else if (!isHttpsUrl(actionUrl)) fieldErrors.action_url = 'invalid_url'
  }

  return { valid: Object.keys(fieldErrors).length === 0, fieldErrors }
}

// Backend rule is `url:https` — must parse as a URL with an https scheme.
function isHttpsUrl(value: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return false
  }
  return parsed.protocol === 'https:'
}

export function buildUpsertPayload(
  form: SsoErrorTemplateFormModel,
): UpsertSsoErrorTemplatePayload {
  const actionUrl = form.action_url.trim()
  return {
    locale: form.locale,
    title: form.title.trim(),
    message: form.message.trim(),
    action_label: form.action_label.trim(),
    action_url: actionUrl ? actionUrl : null,
    retry_allowed: form.retry_allowed,
    alternative_login_allowed: form.alternative_login_allowed,
    is_enabled: form.is_enabled,
  }
}

export function templateToFormModel(template: SsoErrorTemplate): SsoErrorTemplateFormModel {
  return {
    locale: template.locale === 'en' ? 'en' : 'id',
    title: template.title,
    message: template.message,
    action_label: template.action_label,
    action_url: template.action_url ?? '',
    retry_allowed: template.retry_allowed,
    alternative_login_allowed: template.alternative_login_allowed,
    is_enabled: template.is_enabled,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run app/lib/sso-error-templates/__tests__/sso-error-template-form.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/lib/sso-error-templates/sso-error-template-form.ts app/lib/sso-error-templates/__tests__/sso-error-template-form.spec.ts
git commit -m "feat(sso-admin-frontend): SSO error-template form validation + payload builder"
```

---

### Task 16.3: API service + BFF proxy PUT→PATCH fix

**Files:**
- Create: `app/services/sso-error-templates.api.ts`
- Modify: `server/utils/admin-proxy.ts:102`
- Test (service): `app/services/__tests__/sso-error-templates.api.spec.ts`
- Test (proxy): `server/__tests__/admin-proxy.spec.ts` (append cases)

**Interfaces:**
- Consumes: `apiClient.get/patch/post` (`@/lib/api/api-client`); `SsoErrorTemplatesResponse`, `SsoErrorTemplateResponse`, `UpsertSsoErrorTemplatePayload`, `SsoErrorTemplateLocale` (16.1).
- Produces: `ssoErrorTemplatesApi.list() → Promise<SsoErrorTemplatesResponse>`; `.update(errorCode, payload) → Promise<SsoErrorTemplateResponse>` (PATCH); `.reset(errorCode, locale) → Promise<SsoErrorTemplateResponse>` (POST body `{locale}`).

- [ ] **Step 1: Write the failing service test**

```ts
// app/services/__tests__/sso-error-templates.api.spec.ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ssoErrorTemplatesApi } from '@/services/sso-error-templates.api'
import { apiClient } from '@/lib/api/api-client'
import type { UpsertSsoErrorTemplatePayload } from '@/types/sso-error-templates.types'

const payload: UpsertSsoErrorTemplatePayload = {
  locale: 'en',
  title: 'Access denied',
  message: 'You do not have access.',
  action_label: 'Back to sign-in',
  action_url: null,
  retry_allowed: false,
  alternative_login_allowed: true,
  is_enabled: true,
}

afterEach(() => vi.restoreAllMocks())

describe('ssoErrorTemplatesApi', () => {
  it('lists via GET on the admin base path', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ templates: [] } as never)
    await ssoErrorTemplatesApi.list()
    expect(get).toHaveBeenCalledWith('/api/admin/sso-error-templates')
  })
  it('updates via PATCH on the per-code path (encoded) with the payload', async () => {
    const patch = vi.spyOn(apiClient, 'patch').mockResolvedValue({ template: {} } as never)
    await ssoErrorTemplatesApi.update('access_denied', payload)
    expect(patch).toHaveBeenCalledWith('/api/admin/sso-error-templates/access_denied', payload)
  })
  it('resets via POST on the per-code reset path with the locale body', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ template: {} } as never)
    await ssoErrorTemplatesApi.reset('access_denied', 'id')
    expect(post).toHaveBeenCalledWith('/api/admin/sso-error-templates/access_denied/reset', {
      locale: 'id',
    })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `./node_modules/.bin/vitest run app/services/__tests__/sso-error-templates.api.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the service**

```ts
// app/services/sso-error-templates.api.ts
import { apiClient } from '@/lib/api/api-client'
import type {
  SsoErrorTemplateLocale,
  SsoErrorTemplateResponse,
  SsoErrorTemplatesResponse,
  UpsertSsoErrorTemplatePayload,
} from '@/types/sso-error-templates.types'

const BASE = '/api/admin/sso-error-templates'

// error_code is a fixed catalog key (backend route param [a-z_]+), not user
// free-text, but encode it defensively before interpolation.
export const ssoErrorTemplatesApi = {
  list(): Promise<SsoErrorTemplatesResponse> {
    return apiClient.get<SsoErrorTemplatesResponse>(BASE)
  },
  update(
    errorCode: string,
    payload: UpsertSsoErrorTemplatePayload,
  ): Promise<SsoErrorTemplateResponse> {
    return apiClient.patch<SsoErrorTemplateResponse>(
      `${BASE}/${encodeURIComponent(errorCode)}`,
      payload,
    )
  },
  reset(errorCode: string, locale: SsoErrorTemplateLocale): Promise<SsoErrorTemplateResponse> {
    return apiClient.post<SsoErrorTemplateResponse>(
      `${BASE}/${encodeURIComponent(errorCode)}/reset`,
      { locale },
    )
  },
}
```

- [ ] **Step 4: Run service test to verify it passes**

Run: `./node_modules/.bin/vitest run app/services/__tests__/sso-error-templates.api.spec.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing proxy test (append inside the existing `describe`)**

```ts
  it('allows PATCH /api/admin/sso-error-templates/:code and rejects the stale PUT verb', () => {
    const request = buildAdminApiRequest({
      internalBaseUrl: 'https://backend.internal',
      pathname: '/api/admin/sso-error-templates/access_denied',
      search: '',
      method: 'PATCH',
      headers: { accept: 'application/json', 'x-request-id': 'req-tpl' },
      session,
    })
    expect(request.url).toBe('https://backend.internal/admin/api/sso-error-templates/access_denied')
    expect(headers(request).get('Authorization')).toBe('Bearer access-token-admin')

    // The backend route is PATCH — PUT must NOT pass the allow-list (path is known,
    // so the policy reports a method violation, not a path violation).
    expect(() =>
      buildAdminApiRequest({
        internalBaseUrl: 'https://backend.internal',
        pathname: '/api/admin/sso-error-templates/access_denied',
        search: '',
        method: 'PUT',
        headers: { accept: 'application/json' },
        session,
      }),
    ).toThrow('Admin API proxy method is not allowed.')
  })

  it('allows POST /api/admin/sso-error-templates/:code/reset', () => {
    const request = buildAdminApiRequest({
      internalBaseUrl: 'https://backend.internal',
      pathname: '/api/admin/sso-error-templates/access_denied/reset',
      search: '',
      method: 'POST',
      headers: { accept: 'application/json' },
      session,
    })
    expect(request.url).toBe(
      'https://backend.internal/admin/api/sso-error-templates/access_denied/reset',
    )
  })
```

- [ ] **Step 6: Run proxy test to verify the PATCH case fails (PUT still allowed = bug)**

Run: `./node_modules/.bin/vitest run server/__tests__/admin-proxy.spec.ts -t 'sso-error-templates'`
Expected: FAIL — the PATCH route is missing AND the PUT `.toThrow` does not throw (line 102 still allows PUT).

- [ ] **Step 7: Fix the proxy — change line 102 `PUT` to `PATCH`**

In `server/utils/admin-proxy.ts`, inside `ALLOWED_ADMIN_ROUTE_PATTERNS`, replace:

```ts
  new RegExp(`^PUT /api/admin/sso-error-templates/${ERROR_TEMPLATE_KEY_PATTERN}$`, 'u'),
```

with:

```ts
  new RegExp(`^PATCH /api/admin/sso-error-templates/${ERROR_TEMPLATE_KEY_PATTERN}$`, 'u'),
```

(The GET-by-code line 101 and the reset POST line 103 are already correct — leave them.)

- [ ] **Step 8: Run proxy test to verify it passes**

Run: `./node_modules/.bin/vitest run server/__tests__/admin-proxy.spec.ts -t 'sso-error-templates'`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add app/services/sso-error-templates.api.ts app/services/__tests__/sso-error-templates.api.spec.ts server/utils/admin-proxy.ts server/__tests__/admin-proxy.spec.ts
git commit -m "feat(sso-admin-frontend): SSO error-template API service + fix BFF proxy PUT→PATCH"
```

---

### Task 16.4: SSR list composable

**Files:**
- Create: `app/composables/useSsoErrorTemplates.ts`
- Test: `app/composables/__tests__/useSsoErrorTemplates.nuxt.spec.ts`

**Interfaces:**
- Consumes: `ssoErrorTemplatesApi.list` (16.3); `resolveSsoErrorTemplatesViewState` (16.1); `useAsyncData` (Nuxt auto-import).
- Produces: `useSsoErrorTemplates() → { templates, viewState, isStale, requestId, pending, refresh }` (mirror of `useIpAccessRules`).

- [ ] **Step 1: Write the failing test**

```ts
// app/composables/__tests__/useSsoErrorTemplates.nuxt.spec.ts
import { describe, expect, it, vi } from 'vitest'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { ref } from 'vue'
import { useSsoErrorTemplates } from '@/composables/useSsoErrorTemplates'
import type { SsoErrorTemplate } from '@/types/sso-error-templates.types'

const tpl: SsoErrorTemplate = {
  error_code: 'access_denied',
  locale: 'en',
  title: 'Access denied',
  message: 'No access.',
  action_label: 'Back',
  action_url: null,
  retry_allowed: false,
  alternative_login_allowed: false,
  is_enabled: true,
}

const { useAsyncDataMock } = vi.hoisted(() => ({ useAsyncDataMock: vi.fn<() => unknown>() }))
mockNuxtImport('useAsyncData', () => useAsyncDataMock)

describe('useSsoErrorTemplates', () => {
  it('exposes templates + ready view-state when data resolves', () => {
    useAsyncDataMock.mockReturnValue({
      data: ref({ templates: [tpl] }),
      pending: ref(false),
      error: ref(null),
      refresh: vi.fn<() => Promise<void>>(),
    })
    const { templates, viewState } = useSsoErrorTemplates()
    expect(templates.value).toEqual([tpl])
    expect(viewState.value).toBe('ready')
  })
  it('reports loading while pending with no data', () => {
    useAsyncDataMock.mockReturnValue({
      data: ref(null),
      pending: ref(true),
      error: ref(null),
      refresh: vi.fn<() => Promise<void>>(),
    })
    expect(useSsoErrorTemplates().viewState.value).toBe('loading')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `./node_modules/.bin/vitest run app/composables/__tests__/useSsoErrorTemplates.nuxt.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the composable**

```ts
// app/composables/useSsoErrorTemplates.ts
import { computed, type ComputedRef, type Ref } from 'vue'
import { ApiError, getLastRequestId } from '@/lib/api/api-client'
import { ssoErrorTemplatesApi } from '@/services/sso-error-templates.api'
import {
  resolveSsoErrorTemplatesViewState,
  type SsoErrorTemplatesViewState,
} from '@/lib/sso-error-templates/sso-error-templates-view-state'
import type {
  SsoErrorTemplate,
  SsoErrorTemplatesResponse,
} from '@/types/sso-error-templates.types'

export type UseSsoErrorTemplatesReturn = {
  readonly templates: Ref<readonly SsoErrorTemplate[] | null>
  readonly viewState: ComputedRef<SsoErrorTemplatesViewState>
  readonly isStale: ComputedRef<boolean>
  readonly requestId: ComputedRef<string | null>
  readonly pending: Ref<boolean>
  readonly refresh: () => Promise<void>
}

export function useSsoErrorTemplates(): UseSsoErrorTemplatesReturn {
  const { data, pending, error, refresh } = useAsyncData<SsoErrorTemplatesResponse>(
    'admin-sso-error-templates',
    () => ssoErrorTemplatesApi.list(),
  )

  const templates = computed<readonly SsoErrorTemplate[] | null>(
    () => data.value?.templates ?? null,
  )

  const viewState = computed<SsoErrorTemplatesViewState>(() =>
    resolveSsoErrorTemplatesViewState({
      pending: pending.value,
      error: error.value,
      templates: templates.value,
    }),
  )

  const isStale = computed<boolean>(() => Boolean(error.value) && templates.value !== null)

  const requestId = computed<string | null>(() =>
    error.value instanceof ApiError
      ? (error.value.requestId ?? getLastRequestId())
      : getLastRequestId(),
  )

  return {
    templates,
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

- [ ] **Step 4: Run to verify it passes**

Run: `./node_modules/.bin/vitest run app/composables/__tests__/useSsoErrorTemplates.nuxt.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/composables/useSsoErrorTemplates.ts app/composables/__tests__/useSsoErrorTemplates.nuxt.spec.ts
git commit -m "feat(sso-admin-frontend): SSR-first SSO error-templates list composable"
```

---

### Task 16.5: Presentational table

**Files:**
- Create: `app/components/sso-error-templates/SsoErrorTemplatesTable.vue`
- Test: `app/components/sso-error-templates/__tests__/SsoErrorTemplatesTable.spec.ts` (jsdom — `UiDataList` does not teleport)

**Interfaces:**
- Consumes: `UiDataList` (+ column/row types), `UiStatusBadge`; `resolveEnabledTone`, `templateKey` (16.1).
- Produces: `<SsoErrorTemplatesTable>` props `templates, caption, codeLabel, localeLabel, titleLabel, statusLabel, enabledText, disabledText`; emits `select(key: string)` (the composite `templateKey`).

- [ ] **Step 1: Write the failing test**

```ts
// app/components/sso-error-templates/__tests__/SsoErrorTemplatesTable.spec.ts
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import SsoErrorTemplatesTable from '@/components/sso-error-templates/SsoErrorTemplatesTable.vue'
import type { SsoErrorTemplate } from '@/types/sso-error-templates.types'

const templates: SsoErrorTemplate[] = [
  {
    error_code: 'access_denied',
    locale: 'en',
    title: 'Access denied',
    message: 'No access.',
    action_label: 'Back',
    action_url: null,
    retry_allowed: false,
    alternative_login_allowed: false,
    is_enabled: true,
  },
  {
    error_code: 'access_denied',
    locale: 'id',
    title: 'Akses ditolak',
    message: 'Tidak ada akses.',
    action_label: 'Kembali',
    action_url: null,
    retry_allowed: false,
    alternative_login_allowed: false,
    is_enabled: false,
  },
]

const props = {
  templates,
  caption: 'Error templates',
  codeLabel: 'Code',
  localeLabel: 'Locale',
  titleLabel: 'Title',
  statusLabel: 'Status',
  enabledText: 'Enabled',
  disabledText: 'Disabled',
}

describe('SsoErrorTemplatesTable', () => {
  it('renders one selectable row per template with the title + status label', () => {
    const wrapper = mount(SsoErrorTemplatesTable, { props })
    expect(wrapper.text()).toContain('Access denied')
    expect(wrapper.text()).toContain('Akses ditolak')
    expect(wrapper.text()).toContain('Enabled')
    expect(wrapper.text()).toContain('Disabled')
  })
  it('emits select with the composite error_code::locale key', async () => {
    const wrapper = mount(SsoErrorTemplatesTable, { props })
    await wrapper.get('[data-testid="sso-templates-select-access_denied::id"]').trigger('click')
    expect(wrapper.emitted('select')?.[0]).toEqual(['access_denied::id'])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `./node_modules/.bin/vitest run app/components/sso-error-templates/__tests__/SsoErrorTemplatesTable.spec.ts`
Expected: FAIL — component not found.

- [ ] **Step 3: Write the component**

```vue
<!-- app/components/sso-error-templates/SsoErrorTemplatesTable.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import UiDataList, {
  type UiDataListColumn,
  type UiDataListRow,
} from '@/components/ui/UiDataList.vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import {
  resolveEnabledTone,
  templateKey,
} from '@/lib/sso-error-templates/sso-error-templates-view-state'
import type { SsoErrorTemplate } from '@/types/sso-error-templates.types'

const props = defineProps<{
  readonly templates: readonly SsoErrorTemplate[]
  readonly caption: string
  readonly codeLabel: string
  readonly localeLabel: string
  readonly titleLabel: string
  readonly statusLabel: string
  readonly enabledText: string
  readonly disabledText: string
}>()

const emit = defineEmits<{ (event: 'select', key: string): void }>()

const columns = computed<readonly UiDataListColumn[]>(() => [
  { key: 'error_code', label: props.codeLabel, align: 'left' },
  { key: 'locale', label: props.localeLabel, align: 'left' },
  { key: 'title', label: props.titleLabel, align: 'left' },
  { key: 'status', label: props.statusLabel, align: 'left' },
])

const rows = computed<readonly UiDataListRow[]>(() =>
  props.templates.map((template) => ({
    id: templateKey(template),
    error_code: template.error_code,
    locale: template.locale,
    title: template.title,
    status: template.is_enabled ? props.enabledText : props.disabledText,
  })),
)

function templateByKey(key: string): SsoErrorTemplate | undefined {
  return props.templates.find((template) => templateKey(template) === key)
}
</script>

<template>
  <UiDataList :caption="caption" :columns="columns" :rows="rows">
    <template #cell(error_code)="{ row }">
      <button
        type="button"
        class="sso-templates-table__select"
        :data-testid="`sso-templates-select-${row.id}`"
        @click="emit('select', String(row.id))"
      >
        {{ String(row['error_code']) }}
      </button>
    </template>

    <template #cell(status)="{ row }">
      <UiStatusBadge
        :tone="resolveEnabledTone(templateByKey(String(row.id))?.is_enabled ?? false)"
        :label="String(row['status'])"
      />
    </template>
  </UiDataList>
</template>

<style scoped>
.sso-templates-table__select {
  appearance: none;
  padding: 0;
  background: none;
  border: none;
  font: inherit;
  color: var(--accent);
  cursor: pointer;
  text-align: left;
}
.sso-templates-table__select:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
</style>
```

- [ ] **Step 4: Run to verify it passes**

Run: `./node_modules/.bin/vitest run app/components/sso-error-templates/__tests__/SsoErrorTemplatesTable.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/components/sso-error-templates/SsoErrorTemplatesTable.vue app/components/sso-error-templates/__tests__/SsoErrorTemplatesTable.spec.ts
git commit -m "feat(sso-admin-frontend): Swiss SSO error-templates table"
```

---

### Task 16.6: Teleported edit dialog (prefilled)

**Files:**
- Create: `app/components/sso-error-templates/SsoErrorTemplateFormDialog.vue`
- Test: `app/components/sso-error-templates/__tests__/SsoErrorTemplateFormDialog.nuxt.spec.ts` (nuxt env — `UiDialog` teleports)

**Interfaces:**
- Consumes: `UiDialog`, `UiFormField`, `UiInput`, `UiTextarea`, `UiSwitch`, `UiButton`; `useI18n`; `validateSsoErrorTemplateForm`, `buildUpsertPayload`, `templateToFormModel` (16.2); `formatSupportReference`; `SsoErrorTemplate`, `UpsertSsoErrorTemplatePayload` (16.1).
- Produces: `<SsoErrorTemplateFormDialog>` props `open, template (SsoErrorTemplate|null), submitting?, errorMessage?, stepUpUrl?, requestId?`; emits `submit(payload)`, `cancel`. Re-seeds the form from `template` on every open; validation gated by an internal `submitAttempted` ref.

- [ ] **Step 1: Write the failing test**

```ts
// app/components/sso-error-templates/__tests__/SsoErrorTemplateFormDialog.nuxt.spec.ts
import { describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import SsoErrorTemplateFormDialog from '@/components/sso-error-templates/SsoErrorTemplateFormDialog.vue'
import type { SsoErrorTemplate } from '@/types/sso-error-templates.types'

// Mirror IpAccessRuleFormDialog.nuxt.spec.ts: a key-returning t() keeps the
// assertions locale-independent (the real default locale is 'id').
vi.mock('@/composables/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

const template: SsoErrorTemplate = {
  error_code: 'access_denied',
  locale: 'en',
  title: 'Access denied',
  message: 'You do not have access.',
  action_label: 'Back to sign-in',
  action_url: 'https://sso.example/help',
  retry_allowed: false,
  alternative_login_allowed: true,
  is_enabled: true,
}

describe('SsoErrorTemplateFormDialog', () => {
  it('prefills the inputs from the selected template on open', async () => {
    const wrapper = await mountSuspended(SsoErrorTemplateFormDialog, {
      props: { open: true, template },
    })
    const title = wrapper.find('[data-testid="sso-template-field-title"]')
      .element as HTMLInputElement
    expect(title.value).toBe('Access denied')
  })

  it('emits submit with the carried-through locale + edited copy when valid', async () => {
    const wrapper = await mountSuspended(SsoErrorTemplateFormDialog, {
      props: { open: true, template },
    })
    await wrapper.get('[data-testid="sso-template-form"]').trigger('submit')
    const payload = wrapper.emitted('submit')?.[0]?.[0]
    expect(payload).toMatchObject({ locale: 'en', title: 'Access denied' })
  })

  it('blocks submit and shows a field error when title is cleared', async () => {
    const wrapper = await mountSuspended(SsoErrorTemplateFormDialog, {
      props: { open: true, template },
    })
    await wrapper.get('[data-testid="sso-template-field-title"]').setValue('')
    await wrapper.get('[data-testid="sso-template-form"]').trigger('submit')
    expect(wrapper.emitted('submit')).toBeUndefined()
  })

  it('renders a step-up link and a redacted reference when provided', async () => {
    const wrapper = await mountSuspended(SsoErrorTemplateFormDialog, {
      props: {
        open: true,
        template,
        errorMessage: 'Could not save',
        requestId: 'req-abcdef12',
        stepUpUrl: '/admin/step-up?next=/sso-error-templates',
      },
    })
    expect(wrapper.find('[data-testid="sso-template-form-stepup"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="sso-template-form-ref"]').text()).toContain('REF-')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `./node_modules/.bin/vitest run app/components/sso-error-templates/__tests__/SsoErrorTemplateFormDialog.nuxt.spec.ts`
Expected: FAIL — component not found.

- [ ] **Step 3: Write the component**

```vue
<!-- app/components/sso-error-templates/SsoErrorTemplateFormDialog.vue -->
<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import UiDialog from '@/components/ui/UiDialog.vue'
import UiFormField from '@/components/ui/UiFormField.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiTextarea from '@/components/ui/UiTextarea.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { useI18n } from '@/composables/useI18n'
import {
  buildUpsertPayload,
  templateToFormModel,
  validateSsoErrorTemplateForm,
  type SsoErrorTemplateFormModel,
} from '@/lib/sso-error-templates/sso-error-template-form'
import { formatSupportReference } from '@/lib/display-identifiers'
import type {
  SsoErrorTemplate,
  UpsertSsoErrorTemplatePayload,
} from '@/types/sso-error-templates.types'

const props = withDefaults(
  defineProps<{
    readonly open: boolean
    readonly template: SsoErrorTemplate | null
    readonly submitting?: boolean
    readonly errorMessage?: string | null
    readonly stepUpUrl?: string | null
    readonly requestId?: string | null
  }>(),
  { submitting: false, errorMessage: null, stepUpUrl: null, requestId: null },
)

const emit = defineEmits<{
  (event: 'submit', payload: UpsertSsoErrorTemplatePayload): void
  (event: 'cancel'): void
}>()

const { t } = useI18n()

function blank(): SsoErrorTemplateFormModel {
  return {
    locale: 'id',
    title: '',
    message: '',
    action_label: '',
    action_url: '',
    retry_allowed: false,
    alternative_login_allowed: false,
    is_enabled: true,
  }
}

const form = reactive<SsoErrorTemplateFormModel>(blank())
const submitAttempted = ref(false)

// Re-seed from the selected template on every (re)open so the form reflects the
// row being edited and a previous draft never bleeds into the next. locale is
// carried through (not editable) — it is the row's identity alongside error_code.
watch(
  () => props.open,
  (open) => {
    if (!open) return
    Object.assign(form, props.template ? templateToFormModel(props.template) : blank())
    submitAttempted.value = false
  },
  { immediate: true },
)

const validation = computed(() => validateSsoErrorTemplateForm(form))

function fieldError(field: string): string | undefined {
  if (!submitAttempted.value) return undefined
  const code = validation.value.fieldErrors[field]
  return code ? t(`sso_templates.field_${code}`) : undefined
}

const reference = computed(() => (props.requestId ? formatSupportReference(props.requestId) : null))
const canSubmit = computed(() => validation.value.valid && !props.submitting)

function onSubmit(): void {
  submitAttempted.value = true
  if (!validation.value.valid || props.submitting) return
  emit('submit', buildUpsertPayload(form))
}
</script>

<template>
  <UiDialog
    :open="open"
    title-id="sso-template-form-dialog"
    :title="t('sso_templates.edit_title')"
    :description="
      t('sso_templates.edit_desc', {
        code: template?.error_code ?? '—',
        locale: template?.locale ?? '—',
      })
    "
    :close-label="t('common.btn_cancel')"
    @close="emit('cancel')"
  >
    <form class="sso-template-form" data-testid="sso-template-form" @submit.prevent="onSubmit">
      <UiFormField
        id="sso_template_title"
        :label="t('sso_templates.label_title')"
        :error="fieldError('title')"
        required
      >
        <UiInput
          id="sso_template_title"
          v-model="form.title"
          data-testid="sso-template-field-title"
          autocomplete="off"
          :invalid="Boolean(fieldError('title'))"
        />
      </UiFormField>

      <UiFormField
        id="sso_template_message"
        :label="t('sso_templates.label_message')"
        :error="fieldError('message')"
        required
      >
        <UiTextarea
          id="sso_template_message"
          v-model="form.message"
          data-testid="sso-template-field-message"
          :invalid="Boolean(fieldError('message'))"
        />
      </UiFormField>

      <UiFormField
        id="sso_template_action_label"
        :label="t('sso_templates.label_action_label')"
        :error="fieldError('action_label')"
        required
      >
        <UiInput
          id="sso_template_action_label"
          v-model="form.action_label"
          data-testid="sso-template-field-action_label"
          autocomplete="off"
          :invalid="Boolean(fieldError('action_label'))"
        />
      </UiFormField>

      <UiFormField
        id="sso_template_action_url"
        :label="t('sso_templates.label_action_url')"
        :hint="t('sso_templates.action_url_hint')"
        :error="fieldError('action_url')"
      >
        <UiInput
          id="sso_template_action_url"
          v-model="form.action_url"
          type="url"
          data-testid="sso-template-field-action_url"
          autocomplete="off"
          :placeholder="t('sso_templates.action_url_placeholder')"
          :invalid="Boolean(fieldError('action_url'))"
        />
      </UiFormField>

      <div class="sso-template-form__switches">
        <UiSwitch
          :model-value="form.retry_allowed"
          :label="t('sso_templates.label_retry_allowed')"
          @update:model-value="(value) => (form.retry_allowed = value)"
        />
        <UiSwitch
          :model-value="form.alternative_login_allowed"
          :label="t('sso_templates.label_alternative_login_allowed')"
          @update:model-value="(value) => (form.alternative_login_allowed = value)"
        />
        <UiSwitch
          :model-value="form.is_enabled"
          :label="t('sso_templates.label_is_enabled')"
          @update:model-value="(value) => (form.is_enabled = value)"
        />
      </div>

      <p
        v-if="errorMessage"
        class="sso-template-form__error"
        role="alert"
        data-testid="sso-template-form-error"
      >
        {{ errorMessage }}
        <span v-if="reference" class="sso-template-form__ref" data-testid="sso-template-form-ref">{{
          reference
        }}</span>
      </p>

      <a
        v-if="stepUpUrl"
        class="sso-template-form__step-up"
        :href="stepUpUrl"
        data-testid="sso-template-form-stepup"
      >
        {{ t('sso_templates.step_up_cta') }}
      </a>

      <div class="sso-template-form__actions">
        <UiButton type="button" variant="ghost" size="sm" @click="emit('cancel')">
          {{ t('common.btn_cancel') }}
        </UiButton>
        <UiButton
          type="submit"
          variant="primary"
          size="sm"
          :disabled="!canSubmit"
          data-testid="sso-template-form-submit"
        >
          {{ t('common.btn_save') }}
        </UiButton>
      </div>
    </form>
  </UiDialog>
</template>

<style scoped>
.sso-template-form {
  display: grid;
  gap: 14px;
}
.sso-template-form__switches {
  display: grid;
  gap: 10px;
}
.sso-template-form__error {
  margin: 0;
  font: 500 0.75rem/1.4 var(--font-sans);
  color: var(--danger);
}
.sso-template-form__ref {
  margin-left: 6px;
  font-family: var(--font-mono);
  color: var(--fg-3);
}
.sso-template-form__step-up {
  font: 600 0.8125rem/1 var(--font-sans);
  color: var(--accent);
  text-decoration: underline;
}
.sso-template-form__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
```

- [ ] **Step 4: Run to verify it passes**

Run: `./node_modules/.bin/vitest run app/components/sso-error-templates/__tests__/SsoErrorTemplateFormDialog.nuxt.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/components/sso-error-templates/SsoErrorTemplateFormDialog.vue app/components/sso-error-templates/__tests__/SsoErrorTemplateFormDialog.nuxt.spec.ts
git commit -m "feat(sso-admin-frontend): prefilled SSO error-template edit dialog"
```

---

### Task 16.7: Page read surface (states + table + drawer) + locale

**Files:**
- Modify (replace stub): `app/pages/sso-error-templates.vue`
- Modify: `app/locales/en.json` (replace the `sso_templates` block wholesale)
- Modify: `app/locales/id.json` (replace the `sso_templates` block wholesale)
- Test: `app/pages/__tests__/sso-error-templates.page.nuxt.spec.ts`

**Interfaces:**
- Consumes: `useSessionStore`, `useI18n`, `useSsoErrorTemplates` (16.4), `resolveEnabledTone`/`templateKey` (16.1), `SsoErrorTemplatesTable` (16.5); `UiSkeleton`, `UiStatusView`, `UiEmptyState`, `UiButton`, `UiStatusBadge`, `UiDetailDrawer`.
- Produces: the full read surface. `definePageMeta` unchanged. The drawer's Edit/Reset buttons + their privileged flows land in 16.8/16.9 — this task ships read-only (loading/forbidden/unauthenticated/error/empty/ready + drawer with the full copy). Carries `data-page="sso-error-templates"` + `data-admin-shell` for the §3.3 gate.

- [ ] **Step 1: Replace the `sso_templates` block in `app/locales/en.json`**

Replace the existing 8-key `"sso_templates": { ... }` object with:

```json
  "sso_templates": {
    "eyebrow": "Security Governance",
    "title": "SSO Error Templates",
    "summary": "Customise the error screens users see when SSO sign-in fails. Changes are audited.",
    "signed_in_as": "Signed in as {name}",
    "loading": "Loading SSO error templates",
    "forbidden_title": "Access denied",
    "error_title": "SSO error templates could not be loaded",
    "empty_title": "No SSO error templates yet",
    "empty_desc": "The SSO error catalog has not been loaded.",
    "list_caption": "SSO error templates",
    "col_error_code": "Error code",
    "col_locale": "Locale",
    "col_title": "Title",
    "col_status": "Status",
    "status_enabled": "Enabled",
    "status_disabled": "Disabled",
    "locale_id": "Indonesian",
    "locale_en": "English",
    "ov_message": "Message",
    "ov_action_label": "Action label",
    "ov_action_url": "Action URL",
    "ov_retry": "Retry allowed",
    "ov_alternative_login": "Alternative login",
    "ov_yes": "Yes",
    "ov_no": "No",
    "none": "None",
    "btn_edit": "Edit template",
    "btn_reset": "Reset to default",
    "edit_title": "Edit error template",
    "edit_desc": "Editing {code} ({locale}). Changes require re-verification and are audited.",
    "label_title": "Title",
    "label_message": "Message",
    "label_action_label": "Action label",
    "label_action_url": "Action URL",
    "label_retry_allowed": "Allow retry",
    "label_alternative_login_allowed": "Allow alternative login",
    "label_is_enabled": "Template enabled",
    "action_url_hint": "Optional. Must be an https URL.",
    "action_url_placeholder": "https://sso.example/help",
    "field_required": "This field is required.",
    "field_too_long": "This value is too long.",
    "field_invalid_url": "Enter a valid https URL.",
    "step_up_cta": "Re-verify to continue",
    "edit_success": "Error template updated.",
    "edit_invalid": "The template could not be saved. Check the title, message, and action fields.",
    "confirm_reset_title": "Reset error template",
    "confirm_reset_desc": "Restore {code} ({locale}) to the system default. Your custom copy will be replaced. This action is audited.",
    "reset_success": "Error template reset to default.",
    "reset_invalid": "The template could not be reset."
  }
```

- [ ] **Step 2: Replace the `sso_templates` block in `app/locales/id.json`**

Replace the existing 8-key `"sso_templates": { ... }` object with:

```json
  "sso_templates": {
    "eyebrow": "Tata Kelola Keamanan",
    "title": "Templat Galat SSO",
    "summary": "Sesuaikan layar galat yang dilihat pengguna saat masuk SSO gagal. Perubahan diaudit.",
    "signed_in_as": "Masuk sebagai {name}",
    "loading": "Memuat templat galat SSO",
    "forbidden_title": "Akses ditolak",
    "error_title": "Templat galat SSO tidak dapat dimuat",
    "empty_title": "Belum ada templat galat SSO",
    "empty_desc": "Katalog galat SSO belum dimuat.",
    "list_caption": "Templat galat SSO",
    "col_error_code": "Kode galat",
    "col_locale": "Bahasa",
    "col_title": "Judul",
    "col_status": "Status",
    "status_enabled": "Aktif",
    "status_disabled": "Nonaktif",
    "locale_id": "Indonesia",
    "locale_en": "Inggris",
    "ov_message": "Pesan",
    "ov_action_label": "Label tindakan",
    "ov_action_url": "URL tindakan",
    "ov_retry": "Boleh coba lagi",
    "ov_alternative_login": "Login alternatif",
    "ov_yes": "Ya",
    "ov_no": "Tidak",
    "none": "Tidak ada",
    "btn_edit": "Ubah templat",
    "btn_reset": "Setel ulang ke bawaan",
    "edit_title": "Ubah templat galat",
    "edit_desc": "Mengubah {code} ({locale}). Perubahan memerlukan verifikasi ulang dan diaudit.",
    "label_title": "Judul",
    "label_message": "Pesan",
    "label_action_label": "Label tindakan",
    "label_action_url": "URL tindakan",
    "label_retry_allowed": "Izinkan coba lagi",
    "label_alternative_login_allowed": "Izinkan login alternatif",
    "label_is_enabled": "Templat aktif",
    "action_url_hint": "Opsional. Harus berupa URL https.",
    "action_url_placeholder": "https://sso.example/bantuan",
    "field_required": "Bidang ini wajib diisi.",
    "field_too_long": "Nilai ini terlalu panjang.",
    "field_invalid_url": "Masukkan URL https yang valid.",
    "step_up_cta": "Verifikasi ulang untuk lanjut",
    "edit_success": "Templat galat diperbarui.",
    "edit_invalid": "Templat tidak dapat disimpan. Periksa judul, pesan, dan bidang tindakan.",
    "confirm_reset_title": "Setel ulang templat galat",
    "confirm_reset_desc": "Kembalikan {code} ({locale}) ke bawaan sistem. Salinan kustom Anda akan diganti. Tindakan ini diaudit.",
    "reset_success": "Templat galat disetel ulang ke bawaan.",
    "reset_invalid": "Templat tidak dapat disetel ulang."
  }
```

- [ ] **Step 3: Write the failing page test**

This spec is the CANONICAL harness for the page — Tasks 16.8 and 16.9 append `describe` blocks to it and reuse these module-level mocks. It mirrors `app/pages/__tests__/ip-access.page.nuxt.spec.ts` exactly: module-level `vi.mock` of the api / composable / store, an `enLocale`-walker mock of `useI18n` (the real default locale is `id`, so an unmocked `t()` would render Indonesian and an English string assertion would fail), and a dynamic `import` of the page AFTER the mocks. Do NOT `mockNuxtImport('definePageMeta'/'useAsyncData')` — `definePageMeta` is a compile-time macro (mocking it can break collection), and the real `useAsyncData` runs fine against the mocked store's `ensureSession`.

```ts
// app/pages/__tests__/sso-error-templates.page.nuxt.spec.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import enLocale from '@/locales/en.json'
import type { SsoErrorTemplate } from '@/types/sso-error-templates.types'

// Module-level, typed service mocks — 16.8/16.9 set .mockResolvedValue per test.
const listMock = vi.fn<() => Promise<unknown>>()
const updateMock = vi.fn<(code: string, payload: unknown) => Promise<unknown>>()
const resetMock = vi.fn<(code: string, locale: string) => Promise<unknown>>()
vi.mock('@/services/sso-error-templates.api', () => ({
  ssoErrorTemplatesApi: { list: listMock, update: updateMock, reset: resetMock },
}))

const TPL_EN: SsoErrorTemplate = {
  error_code: 'access_denied',
  locale: 'en',
  title: 'Access denied',
  message: 'You do not have access.',
  action_label: 'Back to sign-in',
  action_url: 'https://sso.example/help',
  retry_allowed: false,
  alternative_login_allowed: true,
  is_enabled: true,
}

const templatesRef = ref<readonly SsoErrorTemplate[] | null>([TPL_EN])
const viewStateRef = ref<
  'loading' | 'forbidden' | 'unauthenticated' | 'error' | 'empty' | 'ready'
>('ready')
const refreshMock = vi.fn<() => Promise<void>>(async () => {})
vi.mock('@/composables/useSsoErrorTemplates', () => ({
  useSsoErrorTemplates: () => ({
    templates: templatesRef,
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
    principal: { display_name: 'Admin Sentinel', subject_id: 'a1' },
    ensureSession: vi.fn<() => Promise<string>>(async () => 'authenticated'),
    hasPermission: (p: string) => permitted.includes(p),
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
const Page = (await import('../sso-error-templates.vue')).default

beforeEach(() => {
  permitted = ['admin.security-policy.read', 'admin.sso-error-templates.write']
  templatesRef.value = [TPL_EN]
  viewStateRef.value = 'ready'
})
afterEach(() => vi.clearAllMocks())

describe('sso-error-templates page — read surface', () => {
  it('renders the ready table with the error code + title', async () => {
    const wrapper = await mountSuspended(Page)
    expect(wrapper.find('[data-page="sso-error-templates"]').exists()).toBe(true)
    expect(wrapper.html()).toContain('access_denied')
    expect(wrapper.html()).toContain('Access denied')
  })

  it('renders the empty state when there are no templates', async () => {
    templatesRef.value = []
    viewStateRef.value = 'empty'
    const wrapper = await mountSuspended(Page)
    expect(wrapper.text()).toContain(enLocale.sso_templates.empty_title)
  })

  it('opens the detail drawer with the full copy when a row is selected', async () => {
    const wrapper = await mountSuspended(Page)
    await wrapper.get('[data-testid="sso-templates-select-access_denied::en"]').trigger('click')
    await flushPromises()
    const drawer = wrapper.find('[data-testid="sso-template-detail"]')
    expect(drawer.exists()).toBe(true)
    expect(drawer.text()).toContain('You do not have access.')
  })
})
```

- [ ] **Step 4: Run to verify it fails**

Run: `./node_modules/.bin/vitest run app/pages/__tests__/sso-error-templates.page.nuxt.spec.ts`
Expected: FAIL — the stub renders no table/drawer.

- [ ] **Step 5: Write the page (read surface; edit/reset wiring added in 16.8/16.9)**

```vue
<!-- app/pages/sso-error-templates.vue -->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useSessionStore } from '@/stores/session.store'
import { useI18n } from '@/composables/useI18n'
import { useSsoErrorTemplates } from '@/composables/useSsoErrorTemplates'
import {
  resolveEnabledTone,
  templateKey,
} from '@/lib/sso-error-templates/sso-error-templates-view-state'
import SsoErrorTemplatesTable from '@/components/sso-error-templates/SsoErrorTemplatesTable.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import UiDetailDrawer from '@/components/ui/UiDetailDrawer.vue'
import type { SsoErrorTemplate } from '@/types/sso-error-templates.types'

definePageMeta({
  name: 'admin.sso-error-templates',
  layout: 'admin',
  requiresAdmin: true,
  permissions: ['admin.security-policy.read'],
})

const { t } = useI18n()
const store = useSessionStore()

await useAsyncData('admin-sso-error-templates-principal', () => store.ensureSession())

const { templates, viewState, requestId, isStale, refresh } = useSsoErrorTemplates()

const templateList = computed<readonly SsoErrorTemplate[]>(() => templates.value ?? [])

const canWrite = computed<boolean>(() => store.hasPermission('admin.sso-error-templates.write'))

const localeLabels = computed<Readonly<Record<string, string>>>(() => ({
  id: t('sso_templates.locale_id'),
  en: t('sso_templates.locale_en'),
}))

const selectedKey = ref<string | null>(null)
const selectedTemplate = computed<SsoErrorTemplate | null>(
  () => templateList.value.find((tpl) => templateKey(tpl) === selectedKey.value) ?? null,
)

const successMessage = ref<string | null>(null)

function onSelect(key: string): void {
  selectedKey.value = key
}
function onCloseDrawer(): void {
  selectedKey.value = null
}
async function onRefresh(): Promise<void> {
  await refresh()
}
function yesNo(value: boolean): string {
  return value ? t('sso_templates.ov_yes') : t('sso_templates.ov_no')
}
</script>

<template>
  <section class="sso-templates" data-page="sso-error-templates" data-admin-shell>
    <header class="sso-templates__hero">
      <span class="sso-templates__eyebrow">{{ t('sso_templates.eyebrow') }}</span>
      <div class="sso-templates__heading">
        <div>
          <h1 class="sso-templates__title">{{ t('sso_templates.title') }}</h1>
          <p class="sso-templates__summary">{{ t('sso_templates.summary') }}</p>
          <p class="sso-templates__principal" data-principal-name>
            {{ t('sso_templates.signed_in_as', { name: store.principal?.display_name ?? '—' }) }}
          </p>
        </div>
      </div>
    </header>

    <p
      v-if="successMessage"
      class="sso-templates__success"
      role="status"
      aria-live="polite"
      data-testid="sso-templates-action-success"
    >
      {{ successMessage }}
    </p>

    <UiSkeleton v-if="viewState === 'loading'" :rows="6" :label="t('sso_templates.loading')" />

    <UiStatusView
      v-else-if="viewState === 'forbidden'"
      tone="forbidden"
      :eyebrow="t('sso_templates.eyebrow')"
      :title="t('sso_templates.forbidden_title')"
      :description="t('common.forbidden_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="viewState === 'unauthenticated'"
      tone="step_up"
      :eyebrow="t('sso_templates.eyebrow')"
      :title="t('common.session_expired_title')"
      :description="t('common.session_expired_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="viewState === 'error'"
      tone="error"
      :eyebrow="t('sso_templates.eyebrow')"
      :title="t('sso_templates.error_title')"
      :description="t('common.error_loading_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    >
      <template #actions>
        <UiButton
          variant="secondary"
          size="sm"
          data-testid="sso-templates-refresh"
          @click="onRefresh"
        >
          {{ t('common.btn_refresh') }}
        </UiButton>
      </template>
    </UiStatusView>

    <UiEmptyState
      v-else-if="viewState === 'empty'"
      :title="t('sso_templates.empty_title')"
      :description="t('sso_templates.empty_desc')"
    />

    <template v-else>
      <div v-if="isStale" class="sso-templates__banner" role="status">
        {{ t('common.error_loading_desc') }}
      </div>

      <SsoErrorTemplatesTable
        :templates="templateList"
        :caption="t('sso_templates.list_caption')"
        :code-label="t('sso_templates.col_error_code')"
        :locale-label="t('sso_templates.col_locale')"
        :title-label="t('sso_templates.col_title')"
        :status-label="t('sso_templates.col_status')"
        :enabled-text="t('sso_templates.status_enabled')"
        :disabled-text="t('sso_templates.status_disabled')"
        @select="onSelect"
      />

      <UiDetailDrawer
        v-if="selectedTemplate"
        :open="selectedTemplate !== null"
        title-id="sso-template-detail-drawer"
        :title="selectedTemplate.title"
        :description="`${selectedTemplate.error_code} · ${localeLabels[selectedTemplate.locale] ?? selectedTemplate.locale}`"
        :close-label="t('common.close')"
        @close="onCloseDrawer"
      >
        <div class="sso-detail" data-testid="sso-template-detail">
          <div class="sso-detail__head">
            <UiStatusBadge
              :tone="resolveEnabledTone(selectedTemplate.is_enabled)"
              :label="
                selectedTemplate.is_enabled
                  ? t('sso_templates.status_enabled')
                  : t('sso_templates.status_disabled')
              "
            />
          </div>
          <dl class="sso-detail__grid">
            <div class="sso-detail__wide">
              <dt>{{ t('sso_templates.ov_message') }}</dt>
              <dd>{{ selectedTemplate.message }}</dd>
            </div>
            <div>
              <dt>{{ t('sso_templates.ov_action_label') }}</dt>
              <dd>{{ selectedTemplate.action_label }}</dd>
            </div>
            <div>
              <dt>{{ t('sso_templates.ov_action_url') }}</dt>
              <dd>{{ selectedTemplate.action_url ?? t('sso_templates.none') }}</dd>
            </div>
            <div>
              <dt>{{ t('sso_templates.ov_retry') }}</dt>
              <dd>{{ yesNo(selectedTemplate.retry_allowed) }}</dd>
            </div>
            <div>
              <dt>{{ t('sso_templates.ov_alternative_login') }}</dt>
              <dd>{{ yesNo(selectedTemplate.alternative_login_allowed) }}</dd>
            </div>
          </dl>
        </div>
      </UiDetailDrawer>
    </template>
  </section>
</template>

<style scoped>
.sso-templates {
  display: grid;
  gap: 24px;
  padding: 24px;
}
.sso-templates__hero {
  display: grid;
  gap: 6px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border);
}
.sso-templates__heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.sso-templates__eyebrow {
  font: 600 0.6875rem/1 var(--font-sans);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.sso-templates__title {
  margin: 0;
  font: 600 1.5rem/1.2 var(--font-sans);
  letter-spacing: -0.02em;
  color: var(--fg);
}
.sso-templates__summary,
.sso-templates__principal {
  margin: 0;
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--fg-2);
}
.sso-templates__success {
  margin: 0;
  padding: 10px 14px;
  font: 500 0.8125rem/1.4 var(--font-sans);
  color: var(--fg);
  background: var(--card);
  border: 1px solid var(--border);
}
.sso-templates__banner {
  padding: 10px 14px;
  font: 500 0.8125rem/1.4 var(--font-sans);
  color: var(--warning-soft-fg);
  background: var(--warning-soft);
  border: 1px solid var(--warning-soft-fg);
}
.sso-detail {
  display: grid;
  gap: 16px;
}
.sso-detail__head {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.sso-detail__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 16px;
  margin: 0;
}
.sso-detail__wide {
  grid-column: 1 / -1;
}
.sso-detail__grid dt {
  font: 600 0.625rem/1.2 var(--font-sans);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.sso-detail__grid dd {
  margin: 2px 0 0;
  font: 400 0.8125rem/1.4 var(--font-sans);
  color: var(--fg);
  overflow-wrap: anywhere;
}
</style>
```

- [ ] **Step 6: Run page test + route-map regression**

Run: `./node_modules/.bin/vitest run app/pages/__tests__/sso-error-templates.page.nuxt.spec.ts app/pages/__tests__/route-map.spec.ts`
Expected: PASS (route-map still finds `name: 'admin.sso-error-templates'` + `permissions: ['admin.security-policy.read']`).

- [ ] **Step 7: Commit**

```bash
git add app/pages/sso-error-templates.vue app/pages/__tests__/sso-error-templates.page.nuxt.spec.ts app/locales/en.json app/locales/id.json
git commit -m "feat(sso-admin-frontend): Swiss SSO error-templates read surface + drawer + locale"
```

---

### Task 16.8: Edit flow (PATCH) — privileged, step-up, safe 422

**Files:**
- Modify: `app/pages/sso-error-templates.vue`
- Modify: `app/pages/__tests__/sso-error-templates.page.nuxt.spec.ts`

**Interfaces:**
- Consumes: `usePrivilegedAction` (`run()` returns `T|null`), `SsoErrorTemplateFormDialog` (16.6), `ssoErrorTemplatesApi.update` (16.3).
- Produces: an Edit button in the drawer (gated by `canWrite`) that opens the dialog prefilled with `selectedTemplate`; submit routes through `editAction.run(() => ssoErrorTemplatesApi.update(target.error_code, payload))`; success closes both, refreshes, shows success copy; failure stays in the dialog. `formError` maps status → safe copy (`step_up_required`→null/link, `invalid`→`edit_invalid`, else→`common.error_generic`) — never the raw backend message.

- [ ] **Step 1: Write the failing test (append a new `describe` to the 16.7 spec)**

Reuse the harness from 16.7 (`Page`, `updateMock`, `refreshMock`, mutable `permitted`/`templatesRef`). Append:

```ts
describe('sso-error-templates page — edit (PATCH)', () => {
  it('opens the prefilled edit dialog from the drawer when canWrite', async () => {
    const wrapper = await mountSuspended(Page)
    await wrapper.get('[data-testid="sso-templates-select-access_denied::en"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="sso-template-edit"]').trigger('click')
    expect(wrapper.find('[data-testid="sso-template-form"]').exists()).toBe(true)
  })

  it('hides the Edit affordance without write permission', async () => {
    permitted = ['admin.security-policy.read']
    const wrapper = await mountSuspended(Page)
    await wrapper.get('[data-testid="sso-templates-select-access_denied::en"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="sso-template-edit"]').exists()).toBe(false)
  })

  it('submits an edit via update() and refreshes on success', async () => {
    updateMock.mockResolvedValue({ template: TPL_EN })
    const wrapper = await mountSuspended(Page)
    await wrapper.get('[data-testid="sso-templates-select-access_denied::en"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="sso-template-edit"]').trigger('click')
    await wrapper.get('[data-testid="sso-template-form"]').trigger('submit')
    await flushPromises()
    expect(updateMock).toHaveBeenCalledWith(
      'access_denied',
      expect.objectContaining({ locale: 'en', title: 'Access denied' }),
    )
    expect(refreshMock).toHaveBeenCalled()
  })
})
```

> The submit test exercises the real wiring through the module-level `updateMock` (not a dead `vi.doMock`); the safe-422 copy mapping is additionally covered by the controller's direct verify.

- [ ] **Step 2: Run to verify it fails**

Run: `./node_modules/.bin/vitest run app/pages/__tests__/sso-error-templates.page.nuxt.spec.ts -t 'edit (PATCH)'`
Expected: FAIL — no `sso-template-edit` button yet.

- [ ] **Step 3: Wire the edit flow into the page**

Add imports to the page `<script setup>`:

```ts
import SsoErrorTemplateFormDialog from '@/components/sso-error-templates/SsoErrorTemplateFormDialog.vue'
import { usePrivilegedAction } from '@/composables/usePrivilegedAction'
import { ssoErrorTemplatesApi } from '@/services/sso-error-templates.api'
import type {
  SsoErrorTemplateResponse,
  UpsertSsoErrorTemplatePayload,
} from '@/types/sso-error-templates.types'
```

Add the edit state + handlers (after `onRefresh`/`yesNo`):

```ts
const formOpen = ref(false)
const editAction = usePrivilegedAction<SsoErrorTemplateResponse>()

// SAFE status-keyed copy — a 422 may carry a raw DB/validation message which MUST
// NOT be rendered; map to safe domain copy. step_up surfaces via the dialog link.
const formError = computed<string | null>(() => {
  const status = editAction.failure.value?.status
  if (!status || status === 'step_up_required') return null
  if (status === 'invalid') return t('sso_templates.edit_invalid')
  return t('common.error_generic')
})

function onEditRequested(): void {
  editAction.reset()
  successMessage.value = null
  formOpen.value = true
}
function onFormCancel(): void {
  formOpen.value = false
}
async function onFormSubmit(payload: UpsertSsoErrorTemplatePayload): Promise<void> {
  const target = selectedTemplate.value
  if (!target) return
  const result = await editAction.run(() =>
    ssoErrorTemplatesApi.update(target.error_code, payload),
  )
  if (result === null) return // failure (invalid/step-up/error) stays in the dialog
  formOpen.value = false
  selectedKey.value = null
  successMessage.value = t('sso_templates.edit_success')
  await refresh()
}
```

Add an Edit button inside the drawer's `.sso-detail` block (after the `<dl>`), gated by `canWrite`:

```html
          <div v-if="canWrite" class="sso-detail__actions">
            <UiButton
              variant="primary"
              size="sm"
              data-testid="sso-template-edit"
              @click="onEditRequested"
            >
              {{ t('sso_templates.btn_edit') }}
            </UiButton>
          </div>
```

Add the dialog before `</section>`:

```html
    <SsoErrorTemplateFormDialog
      :open="formOpen"
      :template="selectedTemplate"
      :submitting="editAction.isSubmitting.value"
      :error-message="formError"
      :request-id="editAction.requestId.value"
      :step-up-url="editAction.stepUpUrl.value"
      @submit="onFormSubmit"
      @cancel="onFormCancel"
    />
```

Add the actions style (mirror ip-detail__actions):

```css
.sso-detail__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `./node_modules/.bin/vitest run app/pages/__tests__/sso-error-templates.page.nuxt.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/pages/sso-error-templates.vue app/pages/__tests__/sso-error-templates.page.nuxt.spec.ts
git commit -m "feat(sso-admin-frontend): step-up-gated SSO error-template edit (PATCH)"
```

---

### Task 16.9: Reset flow (POST) — privileged confirm, accent (revert, not delete)

**Files:**
- Modify: `app/pages/sso-error-templates.vue`
- Modify: `app/pages/__tests__/sso-error-templates.page.nuxt.spec.ts`

**Interfaces:**
- Consumes: `PrivilegedActionDialog` (NO `danger` prop → confirm is `--accent`), a second `usePrivilegedAction`, `ssoErrorTemplatesApi.reset` (16.3).
- Produces: a Reset button in the drawer (gated by `canWrite`) that opens a `PrivilegedActionDialog` confirm; confirm routes through `resetAction.run(() => ssoErrorTemplatesApi.reset(target.error_code, target.locale))`; success closes both, refreshes, shows success copy. `resetError` maps status → safe copy (`reset_invalid` for invalid, else `common.error_generic`).

- [ ] **Step 1: Write the failing test (append a new `describe` to the 16.7 spec)**

Reuse the harness (`Page`, `resetMock`, `refreshMock`). `UiButton` renders `variant="primary"` as the class `ui-btn--primary` and `variant="danger"` as `ui-btn--danger` (verified in `app/components/ui/UiButton.vue`), so assert the confirm carries the PRIMARY class — a positive, non-brittle proof that reset is non-destructive-styled. Append:

```ts
describe('sso-error-templates page — reset (POST)', () => {
  it('resets via a non-destructive (accent, not danger) confirm dialog', async () => {
    const wrapper = await mountSuspended(Page)
    await wrapper.get('[data-testid="sso-templates-select-access_denied::en"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="sso-template-reset"]').trigger('click')
    await flushPromises()
    const confirm = wrapper.find('[data-testid="privileged-action-confirm"]')
    expect(confirm.exists()).toBe(true)
    // Reset is a revert, not a delete — the confirm is primary (Klein accent),
    // NOT the destructive #E4002B variant.
    expect(confirm.classes()).toContain('ui-btn--primary')
    expect(confirm.classes()).not.toContain('ui-btn--danger')
  })

  it('confirms reset via reset() and refreshes on success', async () => {
    resetMock.mockResolvedValue({ template: TPL_EN })
    const wrapper = await mountSuspended(Page)
    await wrapper.get('[data-testid="sso-templates-select-access_denied::en"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="sso-template-reset"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="privileged-action-confirm"]').trigger('click')
    await flushPromises()
    expect(resetMock).toHaveBeenCalledWith('access_denied', 'en')
    expect(refreshMock).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `./node_modules/.bin/vitest run app/pages/__tests__/sso-error-templates.page.nuxt.spec.ts -t 'reset (POST)'`
Expected: FAIL — no `sso-template-reset` button yet.

- [ ] **Step 3: Wire the reset flow into the page**

Add the import:

```ts
import PrivilegedActionDialog from '@/components/users/PrivilegedActionDialog.vue'
```

Add the reset state + handlers:

```ts
const resetAction = usePrivilegedAction<SsoErrorTemplateResponse>()
const resetTarget = ref<SsoErrorTemplate | null>(null)

const resetDescription = computed<string>(() =>
  resetTarget.value
    ? t('sso_templates.confirm_reset_desc', {
        code: resetTarget.value.error_code,
        locale: localeLabels.value[resetTarget.value.locale] ?? resetTarget.value.locale,
      })
    : '',
)

// SAFE status-keyed copy — never render a raw backend message on a 422/not-found.
const resetError = computed<string | null>(() => {
  const status = resetAction.failure.value?.status
  if (!status || status === 'step_up_required') return null
  if (status === 'invalid') return t('sso_templates.reset_invalid')
  return t('common.error_generic')
})

function onResetRequested(template: SsoErrorTemplate): void {
  resetAction.reset()
  successMessage.value = null
  resetTarget.value = template
}
function onResetCancel(): void {
  resetTarget.value = null
}
async function onResetConfirm(): Promise<void> {
  const target = resetTarget.value
  if (!target) return
  const result = await resetAction.run(() =>
    ssoErrorTemplatesApi.reset(target.error_code, target.locale === 'en' ? 'en' : 'id'),
  )
  if (result === null) return
  resetTarget.value = null
  selectedKey.value = null
  successMessage.value = t('sso_templates.reset_success')
  await refresh()
}
```

Add a Reset button next to Edit inside `.sso-detail__actions`:

```html
            <UiButton
              variant="secondary"
              size="sm"
              data-testid="sso-template-reset"
              @click="onResetRequested(selectedTemplate)"
            >
              {{ t('sso_templates.btn_reset') }}
            </UiButton>
```

Add the confirm dialog before `</section>` (NO `danger` prop — revert, not delete):

```html
    <PrivilegedActionDialog
      v-if="resetTarget !== null"
      :open="resetTarget !== null"
      :title="t('sso_templates.confirm_reset_title')"
      :description="resetDescription"
      :confirm-label="t('sso_templates.btn_reset')"
      :cancel-label="t('common.btn_cancel')"
      :submitting="resetAction.isSubmitting.value"
      :error-message="resetError"
      :request-id="resetAction.requestId.value"
      :step-up-url="resetAction.stepUpUrl.value"
      :step-up-label="t('sso_templates.step_up_cta')"
      @confirm="onResetConfirm"
      @cancel="onResetCancel"
    />
```

- [ ] **Step 4: Run to verify it passes**

Run: `./node_modules/.bin/vitest run app/pages/__tests__/sso-error-templates.page.nuxt.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/pages/sso-error-templates.vue app/pages/__tests__/sso-error-templates.page.nuxt.spec.ts
git commit -m "feat(sso-admin-frontend): step-up-gated SSO error-template reset (POST, non-destructive)"
```

---

### Task 16.10: STRICT §3.3 leak gate + fixture + write-permission grant + DoD

**Files:**
- Create: `test/fixtures/ssr-leak/server/routes/api/admin/sso-error-templates/index.get.ts`
- Modify: `test/fixtures/ssr-leak/server/routes/api/admin/me.get.ts` (grant `admin.sso-error-templates.write`)
- Modify: `test/ssr-token-leak.gate.spec.ts` (add `fetchSsoErrorTemplates` + STRICT gate trio)

**Interfaces:**
- Consumes: the fixture session injection + the shipped page; `collectSecretLeaks` / `collectPiiShapeLeaks` / `extractPayload` (existing, STRICT — no options).
- Produces: SSR-render + HTML-leak + payload-leak assertions proving the error-templates surface leaks no token/secret/PII even with the write affordances rendered.

- [ ] **Step 1: Create the fixture route**

```ts
// test/fixtures/ssr-leak/server/routes/api/admin/sso-error-templates/index.get.ts
// SSR token-leak fixture: a representative SSO error-template catalog so the §3.3
// gate renders the page READY. Admin-authored end-user error copy — no token,
// secret, session id, or PII. Deliberately free of any 10/16/18-digit run and of
// any token-name substring so the STRICT collectors stay honest.
import { defineEventHandler } from 'h3'

export default defineEventHandler(() => ({
  templates: [
    {
      error_code: 'access_denied',
      locale: 'en',
      title: 'Access denied',
      message: 'You do not have access to this application. Contact your administrator.',
      action_label: 'Back to sign-in',
      action_url: 'https://sso.example/help',
      retry_allowed: false,
      alternative_login_allowed: true,
      is_enabled: true,
    },
    {
      error_code: 'access_denied',
      locale: 'id',
      title: 'Akses ditolak',
      message: 'Anda tidak memiliki akses ke aplikasi ini. Hubungi administrator Anda.',
      action_label: 'Kembali ke masuk',
      action_url: null,
      retry_allowed: false,
      alternative_login_allowed: true,
      is_enabled: false,
    },
  ],
}))
```

- [ ] **Step 2: Grant the write permission in the fixture principal**

In `test/fixtures/ssr-leak/server/routes/api/admin/me.get.ts`, add `'admin.sso-error-templates.write'` to BOTH the `permissions[]` array (after `'admin.authentication-audit.read'`) AND the `capabilities` map (`'admin.sso-error-templates.write': true,`). This grant is primarily for the deferred Phase-18 e2e, which drives the Edit/Reset flows. Note the gate's SSR fetch renders the READ surface only — no row is selected, so the drawer (and the Edit/Reset buttons inside it) and the closed edit/reset dialogs are NOT in the SSR HTML; those privileged surfaces are leak-checked by their own component specs. The gate here proves the read render leaks nothing.

```ts
          // ...in permissions: [ ... ]
          'admin.authentication-audit.read',
          'admin.sso-error-templates.write',
          'profile.read',
```

```ts
          // ...in capabilities: { ... }
          'admin.authentication-audit.read': true,
          'admin.sso-error-templates.write': true,
          'profile.read': true,
```

- [ ] **Step 3: Add the gate fetch helper + render assertion (append in `test/ssr-token-leak.gate.spec.ts`)**

Add the fetch helper near the other `fetch*` functions:

```ts
function fetchSsoErrorTemplates(): Promise<string> {
  // admin_locale=en so the status badge renders the English label under the gate.
  return $fetch('/sso-error-templates', { headers: { cookie: 'admin_locale=en' } })
}
```

Add the render + STRICT leak trio (place before the negative-control tripwire, which must stay last):

```ts
  it('renders the SSO error templates server-side in their ready state', async () => {
    const html = await fetchSsoErrorTemplates()
    expect(html).toContain('data-admin-shell')
    expect(html).toContain('data-page="sso-error-templates"')
    // an error code + a title render; enabled state shown as a label, never colour-alone
    expect(html).toContain('access_denied')
    expect(html).toContain('Access denied')
    expect(html).toContain('Enabled')
  })

  it('does not leak token/secret/PII values into the sso-error-templates SSR HTML', async () => {
    // STRICT — the error-template DTO is admin-authored end-user copy: no token,
    // secret, OIDC sid, or government PII. NO exemption applies.
    const html = await fetchSsoErrorTemplates()
    expect(collectSecretLeaks(html, 'sso-error-templates SSR HTML')).toEqual([])
  })

  it('does not leak token/secret/PII values into the sso-error-templates hydration payload', async () => {
    const html = await fetchSsoErrorTemplates()
    const serialized = JSON.stringify(JSON.parse(extractPayload(html)))
    expect(collectSecretLeaks(serialized, 'sso-error-templates __NUXT__ payload')).toEqual([])
    expect(collectPiiShapeLeaks(serialized, 'sso-error-templates __NUXT__ payload')).toEqual([])
  })
```

- [ ] **Step 4: Rebuild the SSR-leak fixture + run the gate**

The §3.3 gate runs against a PRE-BUILT `.output`. After adding a fixture route, the fixture layer must be rebuilt by the global setup. Run the gate spec (globalSetup rebuilds in a subprocess):

Run: `./node_modules/.bin/vitest run test/ssr-token-leak.gate.spec.ts`
Expected: PASS — the new render assertion + STRICT leak trio are green, and the negative-control tripwire still reports the planted secret.

> If the fixture `.output` is cached and does not pick up the new route, force a clean rebuild per the repo's gate convention (the same path `test/globalSetup.ts` uses) and re-run. Do NOT weaken the collectors to make the gate pass.

- [ ] **Step 5: Run the whole-increment gate sweep (controller DoD)**

```bash
cd /Users/leavend/Project_SSO/services/sso-admin-frontend
./node_modules/.bin/vitest run
./node_modules/.bin/oxlint
./node_modules/.bin/eslint app/pages/sso-error-templates.vue app/components/sso-error-templates server/utils/admin-proxy.ts
./node_modules/.bin/vue-tsc --noEmit
```

Expected: all green. Playwright e2e is DEFERRED to Phase 18 (note the deferral in the ledger, do not run it here).

- [ ] **Step 6: Commit**

```bash
git add test/fixtures/ssr-leak/server/routes/api/admin/sso-error-templates/index.get.ts test/fixtures/ssr-leak/server/routes/api/admin/me.get.ts test/ssr-token-leak.gate.spec.ts
git commit -m "test(sso-admin-frontend): STRICT §3.3 leak gate for SSO error templates + write-perm fixture"
```

---

## Self-Review

**Spec coverage (legacy feature → task):**
- list (GET) → 16.3 service, 16.4 composable, 16.5 table, 16.7 page ✓
- update (PATCH, was wrongly PUT in legacy + proxy) → 16.3 (service + proxy fix), 16.6 dialog, 16.8 flow ✓
- reset (POST `{locale}`) → 16.3 service, 16.9 flow ✓
- per-locale rows (id/en) → composite `templateKey`, 16.1/16.5/16.7 ✓
- validation (title/message/action_label/action_url) → 16.2 ✓
- step-up + safe-422 + correlation REF → 16.6/16.8/16.9 via `usePrivilegedAction` ✓
- token-blindness + §3.3 → 16.3 (Bearer server-side), 16.10 STRICT gate ✓
- page identity frozen → 16.7 keeps `definePageMeta`, route-map regression run ✓
- write affordance gated on `admin.sso-error-templates.write` → 16.7/16.8/16.9 + 16.10 fixture grant ✓

**Placeholder scan:** every code step carries full code; no TBD/“add validation”/“similar to”. ✓

**Type consistency:** `SsoErrorTemplate`/`UpsertSsoErrorTemplatePayload`/`SsoErrorTemplateLocale` defined in 16.1 and used verbatim downstream; `templateKey` signature stable across 16.1/16.5/16.7; `ssoErrorTemplatesApi.{list,update,reset}` signatures stable across 16.3/16.4/16.8/16.9; `usePrivilegedAction<SsoErrorTemplateResponse>` consistent in 16.8/16.9. ✓

**Swiss/danger discipline:** the only `--danger` on the page is inline field-error text (16.6); reset confirm omits `danger` (16.9); status via tone+label (16.1/16.5). ✓
