# Phase 14 — Admin Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the admin **Profile** page (`/profile`) to Nuxt 4 SSR + the Swiss design system — a read-only self-view of the currently signed-in admin principal (identity, role, MFA/auth posture, active permissions), with no token/secret/raw-gov-PII reaching SSR HTML or `__NUXT_DATA__`.

**Architecture:** The simplest domain. There is **no new fetch, no API service, no composable**: the principal is already resolved into the shared session store (`useSessionStore().principal`, an `AdminPrincipal` held in `useState` and hydrated). The page bootstraps via `store.ensureSession()` (same as every admin page) and renders `store.principal`. The legacy SPA's separate `profileApi.getProfile()` → `/api/admin/me` was redundant (it re-fetched the exact data the store already holds) — dropped. No mutations, no actions, no danger affordances.

**Tech Stack:** Nuxt 4.4.8 (SSR), Vue 3.5 SFC, TypeScript strict, Vitest 4 + `@nuxt/test-utils` 4, the shipped Swiss DS (`UiStatusBadge`, `UiFolio`, `UiSkeleton`), `useState` (via the session store), `useAsyncData` (principal bootstrap only).

## Global Constraints

- **Branch stays OFF `main`** until Phase 18 cutover. Commit only the listed task commits.
- **Commit trailer (verbatim):** `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **No traceability markers** (`OG#`/`UC###`/`FR###`/`BE-FR###` etc.) anywhere — names, comments, routes, tests, config, locale keys, test names. (The legacy code carried `FR`/permission markers in comments — do NOT port them.)
- **No token / secret / raw-gov-PII (NIK/NIP/NISN/birth_date) in SSR HTML or `__NUXT_DATA__`.** The principal DTO is the masked profile (the session store already enforces this — Phase 2c proves the principal hydration is token-free). **Email IS an allowed display field** (§3.3, Phase 4). `subject_id` (opaque ULID), `role`, `amr` (auth methods like `pwd`), `acr`, MFA booleans, and the permission slug list are all non-sensitive. The §3.3 leak gate uses the **STRICT** form (no `allowSessionId`).
- **Swiss discipline:** hairline borders, no shadows, **no gradients** (the legacy profile page's gradient avatar is banned by the 2b.10 discipline gate — do NOT port it), single Klein accent `#002FA7`; `#E4002B`/`--danger` only on destructive affordances + inline form-validation. This page has **no** destructive affordance → renders **zero** `#E4002B` accent. Status is **never colour-alone** — tone + label via `UiStatusBadge`.
- **i18n parity:** every key added to `en.json` must exist in `id.json` (and vice-versa). `t(key, params)` supports `{param}` interpolation. Run the parity check before the locale-touching commit.
- **oxlint:** every `vi.fn(...)` needs a type parameter; every `.toThrow(...)` needs a message. The controller verifies **both** oxlint AND eslint (`.vue` errors are eslint-only).
- **Test env routing by FILENAME:** pure-logic + dumb-component tests are jsdom (`@vue/test-utils` `mount`, plain `*.spec.ts`); the page test is nuxt env (`*.page.nuxt.spec.ts`, `mountSuspended`/`mockNuxtImport`).
- **DoD per task (controller-verified DIRECT, bypassing rtk cache):** `./node_modules/.bin/oxlint .` (0/0), `./node_modules/.bin/eslint <touched .vue>` (0), `npx vue-tsc --noEmit` (0), the task's vitest specs green; the locale task also runs the parity check. Final task adds full-suite + build + SSR leak gate.
- **e2e is DEFERRED to Phase 18** (playwright.config.ts is still legacy-SPA-wired). Author `e2e/profile.spec.ts` against the shipped Nuxt routes but do **not** run it as a gate this phase.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `app/lib/profile/profile-view-state.ts` | Pure `resolveProfileViewState` + `resolveMfaTone` | 14.1 |
| `app/components/profile/ProfileIdentityCard.vue` | Dumb identity card (display name, email, subject id, names, role) | 14.2 |
| `app/components/profile/ProfileSecurityCard.vue` | Dumb security card (MFA posture badge, AMR, ACR, last login, auth time) | 14.2 |
| `app/pages/profile.vue` | Bootstrap + compose cards + active-permissions list (replaces stub) | 14.3 |
| `app/locales/en.json` / `id.json` | `profile` block (replace with the final Swiss key set) | 14.3 |
| `test/ssr-token-leak.gate.spec.ts` | STRICT profile leak assertions | 14.4 |
| `test/fixtures/ssr-leak/server/routes/api/admin/me.get.ts` | Grant `profile.read` | 14.4 |
| `e2e/profile.spec.ts` | Deferred Playwright spec (authored, not run) | 14.4 |

**No new files:** no `app/types/profile.types.ts` (the `AdminPrincipal`/`AdminAuthContext`/`AdminPermissionMatrix` types already exist in `app/types/auth.types.ts`), no `app/services/profile.api.ts` (reads the store), no `app/composables/useProfile.ts` (reads the store). **No proxy change** (`GET /api/admin/me` is already allow-listed and already consumed by the session store).

**Authoritative principal shape (`app/types/auth.types.ts`, fetched into the store via `GET /api/admin/me`):**
```ts
AdminAuthContext = { auth_time: string | null; amr: readonly string[]; acr: string | null; mfa_enforced: boolean; mfa_verified: boolean }
AdminPermissionMatrix = { view_admin_panel: boolean; manage_sessions: boolean; permissions: readonly string[]; capabilities: Readonly<Record<string, boolean>>; menus: readonly AdminPermissionMenu[] }
AdminPrincipal = { subject_id: string; email: string; display_name: string; given_name?: string | null; family_name?: string | null; role: string; last_login_at: string | null; auth_context: AdminAuthContext; permissions: AdminPermissionMatrix }
```

---

### Task 14.1: Profile view-state + MFA tone

**Files:**
- Create: `app/lib/profile/profile-view-state.ts`
- Test: `app/lib/profile/__tests__/profile-view-state.spec.ts`

**Interfaces:**
- Consumes: `StatusTone` from `@/lib/status-tone`; `AdminAuthContext`/`AdminPrincipal` from `@/types/auth.types`.
- Produces:
  - `ProfileViewState = 'loading' | 'ready'`
  - `resolveProfileViewState(args: { readonly principal: AdminPrincipal | null }): ProfileViewState`
  - `resolveMfaTone(authContext: AdminAuthContext): StatusTone`

> Why only two view-states: the page reads `store.principal`, and the global admin guard (`admin-guard.global.ts`) already redirects unauthenticated/forbidden before the page renders. So the page only needs `loading` (principal not yet resolved) vs `ready`. There is no independent fetch that can 401/403/error here.

- [ ] **Step 1: Write the failing test**

```ts
// app/lib/profile/__tests__/profile-view-state.spec.ts
import { describe, expect, it } from 'vitest'
import { resolveProfileViewState, resolveMfaTone } from '@/lib/profile/profile-view-state'
import type { AdminAuthContext, AdminPrincipal } from '@/types/auth.types'

const AUTH: AdminAuthContext = {
  auth_time: null,
  amr: ['pwd'],
  acr: null,
  mfa_enforced: true,
  mfa_verified: true,
}

const PRINCIPAL: AdminPrincipal = {
  subject_id: 'sub-admin',
  email: 'admin@example.test',
  display_name: 'Admin',
  given_name: null,
  family_name: null,
  role: 'admin',
  last_login_at: null,
  auth_context: AUTH,
  permissions: { view_admin_panel: true, manage_sessions: true, permissions: [], capabilities: {}, menus: [] },
}

describe('resolveProfileViewState', () => {
  it('is loading without a principal, ready with one', () => {
    expect(resolveProfileViewState({ principal: null })).toBe('loading')
    expect(resolveProfileViewState({ principal: PRINCIPAL })).toBe('ready')
  })
})

describe('resolveMfaTone', () => {
  it('verified -> success', () => {
    expect(resolveMfaTone({ ...AUTH, mfa_enforced: true, mfa_verified: true })).toBe('success')
  })
  it('enforced but not verified -> warning', () => {
    expect(resolveMfaTone({ ...AUTH, mfa_enforced: true, mfa_verified: false })).toBe('warning')
  })
  it('not enforced -> neutral', () => {
    expect(resolveMfaTone({ ...AUTH, mfa_enforced: false, mfa_verified: false })).toBe('neutral')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run app/lib/profile/__tests__/profile-view-state.spec.ts`
Expected: FAIL — module unresolved.

- [ ] **Step 3: Write the resolver**

```ts
// app/lib/profile/profile-view-state.ts
import type { StatusTone } from '@/lib/status-tone'
import type { AdminAuthContext, AdminPrincipal } from '@/types/auth.types'

export type ProfileViewState = 'loading' | 'ready'

// The principal lives in the shared session store (hydrated useState); the admin
// guard owns the unauthenticated/forbidden redirects, so the page only models
// "principal not yet resolved" (loading) vs "resolved" (ready).
export function resolveProfileViewState({
  principal,
}: {
  readonly principal: AdminPrincipal | null
}): ProfileViewState {
  return principal ? 'ready' : 'loading'
}

// MFA posture: verified -> success; enforced but not yet verified -> warning;
// not enforced -> neutral. danger is reserved for destructive affordances — an
// unverified-but-enforced MFA is a warning, not a destructive state.
export function resolveMfaTone(authContext: AdminAuthContext): StatusTone {
  if (authContext.mfa_verified) return 'success'
  if (authContext.mfa_enforced) return 'warning'
  return 'neutral'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run app/lib/profile/__tests__/profile-view-state.spec.ts`
Expected: PASS.

- [ ] **Step 5: Verify gates + commit**

Run: `./node_modules/.bin/oxlint . && npx vue-tsc --noEmit`

```bash
git add app/lib/profile/profile-view-state.ts app/lib/profile/__tests__/profile-view-state.spec.ts
git commit -m "$(cat <<'EOF'
feat(sso-admin-frontend): profile view-state + MFA tone resolvers

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 14.2: Profile cards (identity + security)

**Files:**
- Create: `app/components/profile/ProfileIdentityCard.vue`
- Create: `app/components/profile/ProfileSecurityCard.vue`
- Test: `app/components/profile/__tests__/ProfileIdentityCard.spec.ts`
- Test: `app/components/profile/__tests__/ProfileSecurityCard.spec.ts`

**Interfaces:**
- `ProfileIdentityCard` props: `{ readonly principal: AdminPrincipal; readonly labels: ProfileIdentityLabels }` where `ProfileIdentityLabels = { title, email, subjectId, givenName, familyName, role }` (all `string`). Renders display name as the card heading; email/subject_id/given_name/family_name in a definition grid (null → em dash); role as a `UiStatusBadge` (tone `neutral`). subject_id via `UiFolio` `variant="id"`.
- `ProfileSecurityCard` props: `{ readonly principal: AdminPrincipal; readonly labels: ProfileSecurityLabels }` where `ProfileSecurityLabels = { title, mfa, mfaVerified, mfaEnforced, mfaOff, amr, acr, lastLogin, authTime }` (all `string`). Renders a single MFA posture badge (tone via `resolveMfaTone`, label = verified→mfaVerified / enforced→mfaEnforced / else→mfaOff), the AMR methods, ACR, last login + auth time (`UiFolio` `variant="timestamp"`, null → em dash). No i18n, no fetch.

- [ ] **Step 1: Write the failing tests**

```ts
// app/components/profile/__tests__/ProfileIdentityCard.spec.ts
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ProfileIdentityCard from '@/components/profile/ProfileIdentityCard.vue'
import type { AdminPrincipal } from '@/types/auth.types'

const LABELS = {
  title: 'Identity',
  email: 'Email',
  subjectId: 'Admin code',
  givenName: 'First name',
  familyName: 'Last name',
  role: 'Role',
}

function principal(over: Partial<AdminPrincipal> = {}): AdminPrincipal {
  return {
    subject_id: 'sub-admin-7',
    email: 'admin@example.test',
    display_name: 'Admin Sentinel',
    given_name: 'Admin',
    family_name: null,
    role: 'admin',
    last_login_at: null,
    auth_context: { auth_time: null, amr: ['pwd'], acr: null, mfa_enforced: true, mfa_verified: true },
    permissions: { view_admin_panel: true, manage_sessions: true, permissions: [], capabilities: {}, menus: [] },
    ...over,
  }
}

describe('ProfileIdentityCard', () => {
  it('renders the display name, email (allowed field), subject id, and role badge', () => {
    const w = mount(ProfileIdentityCard, { props: { principal: principal(), labels: LABELS } })
    expect(w.text()).toContain('Admin Sentinel')
    expect(w.text()).toContain('admin@example.test')
    expect(w.text()).toContain('sub-admin-7')
    const role = w.find('[data-testid="profile-role"]')
    expect(role.text()).toContain('admin')
    expect(role.attributes('data-tone')).toBe('neutral')
  })

  it('renders an em dash for a null name field', () => {
    const w = mount(ProfileIdentityCard, { props: { principal: principal({ family_name: null }), labels: LABELS } })
    expect(w.find('[data-testid="profile-family-name"]').text()).toBe('—')
  })
})
```

```ts
// app/components/profile/__tests__/ProfileSecurityCard.spec.ts
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ProfileSecurityCard from '@/components/profile/ProfileSecurityCard.vue'
import type { AdminPrincipal } from '@/types/auth.types'

const LABELS = {
  title: 'Security',
  mfa: 'MFA',
  mfaVerified: 'Verified',
  mfaEnforced: 'Enforced, not verified',
  mfaOff: 'Not enforced',
  amr: 'Auth methods',
  acr: 'Auth context class',
  lastLogin: 'Last login',
  authTime: 'Auth time',
}

function principal(authOver = {}): AdminPrincipal {
  return {
    subject_id: 'sub-admin',
    email: 'admin@example.test',
    display_name: 'Admin',
    given_name: null,
    family_name: null,
    role: 'admin',
    last_login_at: '2026-06-28T09:00:00Z',
    auth_context: { auth_time: null, amr: ['pwd', 'mfa'], acr: null, mfa_enforced: true, mfa_verified: true, ...authOver },
    permissions: { view_admin_panel: true, manage_sessions: true, permissions: [], capabilities: {}, menus: [] },
  }
}

describe('ProfileSecurityCard', () => {
  it('renders the MFA posture badge (verified -> success) + auth methods', () => {
    const w = mount(ProfileSecurityCard, { props: { principal: principal(), labels: LABELS } })
    const mfa = w.find('[data-testid="profile-mfa-status"]')
    expect(mfa.attributes('data-tone')).toBe('success')
    expect(mfa.text()).toContain('Verified')
    expect(w.text()).toContain('pwd')
    expect(w.text()).toContain('mfa')
  })

  it('shows the enforced-not-verified posture as a warning', () => {
    const w = mount(ProfileSecurityCard, {
      props: { principal: principal({ mfa_enforced: true, mfa_verified: false }), labels: LABELS },
    })
    const mfa = w.find('[data-testid="profile-mfa-status"]')
    expect(mfa.attributes('data-tone')).toBe('warning')
    expect(mfa.text()).toContain('Enforced, not verified')
  })

  it('renders last login as a folio and em dash for null auth time', () => {
    const w = mount(ProfileSecurityCard, { props: { principal: principal(), labels: LABELS } })
    expect(w.text()).toContain('2026-06-28T09:00:00Z')
    expect(w.find('[data-testid="profile-auth-time"]').text()).toBe('—')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `./node_modules/.bin/vitest run app/components/profile/__tests__/`
Expected: FAIL — components missing.

- [ ] **Step 3: Write `ProfileIdentityCard.vue`**

```vue
<!-- app/components/profile/ProfileIdentityCard.vue -->
<script setup lang="ts">
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import UiFolio from '@/components/ui/UiFolio.vue'
import type { AdminPrincipal } from '@/types/auth.types'

export type ProfileIdentityLabels = {
  readonly title: string
  readonly email: string
  readonly subjectId: string
  readonly givenName: string
  readonly familyName: string
  readonly role: string
}

defineProps<{
  readonly principal: AdminPrincipal
  readonly labels: ProfileIdentityLabels
}>()
</script>

<template>
  <section class="profile-card" data-testid="profile-identity" aria-labelledby="profile-identity-title">
    <div class="profile-card__head">
      <h2 id="profile-identity-title" class="profile-card__title">{{ labels.title }}</h2>
      <UiStatusBadge data-testid="profile-role" tone="neutral" :label="`${labels.role}: ${principal.role}`" />
    </div>
    <p class="profile-card__name">{{ principal.display_name }}</p>
    <dl class="profile-card__grid">
      <div class="profile-card__wide">
        <dt>{{ labels.email }}</dt>
        <dd data-testid="profile-email">{{ principal.email }}</dd>
      </div>
      <div class="profile-card__wide">
        <dt>{{ labels.subjectId }}</dt>
        <dd><UiFolio :value="principal.subject_id" variant="id" /></dd>
      </div>
      <div>
        <dt>{{ labels.givenName }}</dt>
        <dd data-testid="profile-given-name">{{ principal.given_name ?? '—' }}</dd>
      </div>
      <div>
        <dt>{{ labels.familyName }}</dt>
        <dd data-testid="profile-family-name">{{ principal.family_name ?? '—' }}</dd>
      </div>
    </dl>
  </section>
</template>

<style scoped>
.profile-card {
  display: grid;
  gap: 14px;
  padding: 20px;
  background: var(--card);
  border: 1px solid var(--border);
}
.profile-card__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.profile-card__title {
  margin: 0;
  font: 600 1rem/1.3 var(--font-sans);
  color: var(--fg);
}
.profile-card__name {
  margin: 0;
  font: 600 1.25rem/1.2 var(--font-sans);
  letter-spacing: -0.01em;
  color: var(--fg);
}
.profile-card__grid {
  margin: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 16px;
}
.profile-card__wide {
  grid-column: 1 / -1;
}
.profile-card__grid dt {
  font: 600 0.625rem/1.2 var(--font-sans);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.profile-card__grid dd {
  margin: 2px 0 0;
  font: 400 0.8125rem/1.4 var(--font-sans);
  color: var(--fg);
  overflow-wrap: anywhere;
}
</style>
```

- [ ] **Step 4: Write `ProfileSecurityCard.vue`**

```vue
<!-- app/components/profile/ProfileSecurityCard.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import UiFolio from '@/components/ui/UiFolio.vue'
import { resolveMfaTone } from '@/lib/profile/profile-view-state'
import type { AdminPrincipal } from '@/types/auth.types'

export type ProfileSecurityLabels = {
  readonly title: string
  readonly mfa: string
  readonly mfaVerified: string
  readonly mfaEnforced: string
  readonly mfaOff: string
  readonly amr: string
  readonly acr: string
  readonly lastLogin: string
  readonly authTime: string
}

const props = defineProps<{
  readonly principal: AdminPrincipal
  readonly labels: ProfileSecurityLabels
}>()

const mfaLabel = computed<string>(() => {
  const ctx = props.principal.auth_context
  if (ctx.mfa_verified) return props.labels.mfaVerified
  if (ctx.mfa_enforced) return props.labels.mfaEnforced
  return props.labels.mfaOff
})

const amrText = computed<string>(() => props.principal.auth_context.amr.join(', ') || '—')
</script>

<template>
  <section class="profile-card" data-testid="profile-security" aria-labelledby="profile-security-title">
    <div class="profile-card__head">
      <h2 id="profile-security-title" class="profile-card__title">{{ labels.title }}</h2>
      <UiStatusBadge
        data-testid="profile-mfa-status"
        :tone="resolveMfaTone(principal.auth_context)"
        :label="`${labels.mfa}: ${mfaLabel}`"
      />
    </div>
    <dl class="profile-card__grid">
      <div class="profile-card__wide">
        <dt>{{ labels.amr }}</dt>
        <dd data-testid="profile-amr">{{ amrText }}</dd>
      </div>
      <div>
        <dt>{{ labels.acr }}</dt>
        <dd>{{ principal.auth_context.acr ?? '—' }}</dd>
      </div>
      <div>
        <dt>{{ labels.lastLogin }}</dt>
        <dd>
          <UiFolio v-if="principal.last_login_at" :value="principal.last_login_at" variant="timestamp" />
          <span v-else>—</span>
        </dd>
      </div>
      <div>
        <dt>{{ labels.authTime }}</dt>
        <dd data-testid="profile-auth-time">
          <UiFolio
            v-if="principal.auth_context.auth_time"
            :value="principal.auth_context.auth_time"
            variant="timestamp"
          />
          <span v-else>—</span>
        </dd>
      </div>
    </dl>
  </section>
</template>

<style scoped>
.profile-card {
  display: grid;
  gap: 14px;
  padding: 20px;
  background: var(--card);
  border: 1px solid var(--border);
}
.profile-card__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.profile-card__title {
  margin: 0;
  font: 600 1rem/1.3 var(--font-sans);
  color: var(--fg);
}
.profile-card__grid {
  margin: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 16px;
}
.profile-card__wide {
  grid-column: 1 / -1;
}
.profile-card__grid dt {
  font: 600 0.625rem/1.2 var(--font-sans);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.profile-card__grid dd {
  margin: 2px 0 0;
  font: 400 0.8125rem/1.4 var(--font-sans);
  color: var(--fg);
  overflow-wrap: anywhere;
}
</style>
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `./node_modules/.bin/vitest run app/components/profile/__tests__/`
Expected: PASS (2 + 3 tests).

- [ ] **Step 6: Verify gates + commit**

Run: `./node_modules/.bin/oxlint . && ./node_modules/.bin/eslint app/components/profile/ProfileIdentityCard.vue app/components/profile/ProfileSecurityCard.vue && npx vue-tsc --noEmit`

```bash
git add app/components/profile/
git commit -m "$(cat <<'EOF'
feat(sso-admin-frontend): Swiss profile identity + security cards

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 14.3: Profile page + locale

**Files:**
- Modify (replace stub): `app/pages/profile.vue`
- Modify: `app/locales/en.json` (`profile` block), `app/locales/id.json` (`profile` block)
- Test: `app/pages/__tests__/profile.page.nuxt.spec.ts`

**Interfaces:**
- Consumes: `resolveProfileViewState` (14.1); `ProfileIdentityCard`/`ProfileSecurityCard` + their label types (14.2); `useSessionStore`; `useI18n`; `UiSkeleton`.
- **`definePageMeta` MUST keep `name: 'admin.profile'`, `permissions: ['profile.read']`** verbatim — `route-map.spec.ts` asserts this row.
- Replace the `profile` locale block wholesale with the final Swiss key set below (drops the legacy `forbidden_title`/`error_title` — no such state on this page — and adds the security/auth keys + `signed_in_as` + `permissions_empty`).
- Renders: hero (eyebrow/title/summary/signed-in-as), then on `ready` the identity card + security card + active-permissions list (`principal.permissions.permissions`). `loading` → skeleton.

- [ ] **Step 1: Write the failing page test**

```ts
// app/pages/__tests__/profile.page.nuxt.spec.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import enLocale from '@/locales/en.json'
import type { AdminPrincipal } from '@/types/auth.types'

function principal(): AdminPrincipal {
  return {
    subject_id: 'sub-admin-sentinel',
    email: 'admin@example.test',
    display_name: 'Admin Sentinel',
    given_name: null,
    family_name: null,
    role: 'admin',
    last_login_at: '2026-06-28T09:00:00Z',
    auth_context: { auth_time: null, amr: ['pwd'], acr: null, mfa_enforced: true, mfa_verified: true },
    permissions: {
      view_admin_panel: true,
      manage_sessions: true,
      permissions: ['admin.dashboard.view', 'profile.read'],
      capabilities: {},
      menus: [],
    },
  }
}

const principalRef = ref<AdminPrincipal | null>(principal())
vi.mock('@/stores/session.store', () => ({
  useSessionStore: () => ({
    get principal() {
      return principalRef.value
    },
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
const Page = (await import('../profile.vue')).default

beforeEach(() => {
  principalRef.value = principal()
})
afterEach(() => vi.clearAllMocks())

describe('profile page', () => {
  it('renders identity + security cards through the admin shell', async () => {
    const w = await mountSuspended(Page)
    expect(w.find('[data-page="profile"]').exists()).toBe(true)
    expect(w.find('[data-testid="profile-identity"]').exists()).toBe(true)
    expect(w.find('[data-testid="profile-security"]').exists()).toBe(true)
    expect(w.text()).toContain('Admin Sentinel')
    expect(w.text()).toContain('admin@example.test')
  })

  it('lists the active permissions', async () => {
    const w = await mountSuspended(Page)
    const perms = w.find('[data-testid="profile-permissions"]')
    expect(perms.exists()).toBe(true)
    expect(perms.text()).toContain('admin.dashboard.view')
    expect(perms.text()).toContain('profile.read')
  })

  it('renders the loading skeleton when the principal is not yet resolved', async () => {
    principalRef.value = null
    const w = await mountSuspended(Page)
    expect(w.find('[data-testid="profile-identity"]').exists()).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run app/pages/__tests__/profile.page.nuxt.spec.ts`
Expected: FAIL — the stub renders nothing.

- [ ] **Step 3: Replace the `profile` locale block (both files)**

Replace the existing `"profile": { … }` block in `app/locales/en.json` with:

```json
  "profile": {
    "eyebrow": "Admin Account",
    "title": "Admin Profile",
    "summary": "The currently signed-in admin principal, read from the backend session. Read-only — no account changes are made here.",
    "signed_in_as": "Signed in as {name}",
    "loading": "Loading profile",
    "identity_title": "Identity",
    "label_email": "Email",
    "label_subject_id": "Admin code",
    "label_given_name": "First name",
    "label_family_name": "Last name",
    "label_role": "Role",
    "security_title": "Authentication",
    "label_mfa": "MFA",
    "mfa_verified": "Verified",
    "mfa_enforced": "Enforced, not verified",
    "mfa_off": "Not enforced",
    "label_amr": "Auth methods",
    "label_acr": "Auth context class",
    "label_last_login": "Last login",
    "label_auth_time": "Auth time",
    "permissions_title": "Active permissions",
    "permissions_empty": "No permissions granted"
  },
```

Replace the existing `"profile": { … }` block in `app/locales/id.json` with:

```json
  "profile": {
    "eyebrow": "Akun Admin",
    "title": "Profil Admin",
    "summary": "Principal admin yang sedang login, dibaca dari sesi backend. Read-only — tidak ada perubahan akun di sini.",
    "signed_in_as": "Masuk sebagai {name}",
    "loading": "Memuat profil",
    "identity_title": "Identitas",
    "label_email": "Email",
    "label_subject_id": "Kode admin",
    "label_given_name": "Nama depan",
    "label_family_name": "Nama belakang",
    "label_role": "Peran",
    "security_title": "Autentikasi",
    "label_mfa": "MFA",
    "mfa_verified": "Terverifikasi",
    "mfa_enforced": "Diwajibkan, belum diverifikasi",
    "mfa_off": "Tidak diwajibkan",
    "label_amr": "Metode auth",
    "label_acr": "Auth context class",
    "label_last_login": "Login terakhir",
    "label_auth_time": "Waktu auth",
    "permissions_title": "Permission aktif",
    "permissions_empty": "Tidak ada permission"
  },
```

- [ ] **Step 4: Write the page**

```vue
<!-- app/pages/profile.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import { useSessionStore } from '@/stores/session.store'
import { useI18n } from '@/composables/useI18n'
import { resolveProfileViewState } from '@/lib/profile/profile-view-state'
import ProfileIdentityCard, {
  type ProfileIdentityLabels,
} from '@/components/profile/ProfileIdentityCard.vue'
import ProfileSecurityCard, {
  type ProfileSecurityLabels,
} from '@/components/profile/ProfileSecurityCard.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'

definePageMeta({
  name: 'admin.profile',
  layout: 'admin',
  requiresAdmin: true,
  permissions: ['profile.read'],
})

const { t } = useI18n()
const store = useSessionStore()

// Same principal bootstrap as every admin page; the store dedups if already loaded.
await useAsyncData('admin-profile-principal', () => store.ensureSession())

const principal = computed(() => store.principal)
const viewState = computed(() => resolveProfileViewState({ principal: principal.value }))

const permissionList = computed<readonly string[]>(
  () => principal.value?.permissions.permissions ?? [],
)

const identityLabels = computed<ProfileIdentityLabels>(() => ({
  title: t('profile.identity_title'),
  email: t('profile.label_email'),
  subjectId: t('profile.label_subject_id'),
  givenName: t('profile.label_given_name'),
  familyName: t('profile.label_family_name'),
  role: t('profile.label_role'),
}))

const securityLabels = computed<ProfileSecurityLabels>(() => ({
  title: t('profile.security_title'),
  mfa: t('profile.label_mfa'),
  mfaVerified: t('profile.mfa_verified'),
  mfaEnforced: t('profile.mfa_enforced'),
  mfaOff: t('profile.mfa_off'),
  amr: t('profile.label_amr'),
  acr: t('profile.label_acr'),
  lastLogin: t('profile.label_last_login'),
  authTime: t('profile.label_auth_time'),
}))
</script>

<template>
  <section class="profile" data-page="profile" data-admin-shell>
    <header class="profile__hero">
      <span class="profile__eyebrow">{{ t('profile.eyebrow') }}</span>
      <h1 class="profile__title">{{ t('profile.title') }}</h1>
      <p class="profile__summary">{{ t('profile.summary') }}</p>
      <p class="profile__principal" data-principal-name>
        {{ t('profile.signed_in_as', { name: principal?.display_name ?? '—' }) }}
      </p>
    </header>

    <UiSkeleton v-if="viewState === 'loading'" :rows="6" :label="t('profile.loading')" />

    <template v-else-if="principal">
      <div class="profile__grid">
        <ProfileIdentityCard :principal="principal" :labels="identityLabels" />
        <ProfileSecurityCard :principal="principal" :labels="securityLabels" />
      </div>

      <section class="profile__permissions" aria-labelledby="profile-permissions-title">
        <h2 id="profile-permissions-title" class="profile__permissions-title">
          {{ t('profile.permissions_title') }}
        </h2>
        <ul v-if="permissionList.length" class="profile__permissions-list" data-testid="profile-permissions">
          <li v-for="permission in permissionList" :key="permission" class="profile__permission">
            {{ permission }}
          </li>
        </ul>
        <p v-else class="profile__permissions-empty">{{ t('profile.permissions_empty') }}</p>
      </section>
    </template>
  </section>
</template>

<style scoped>
.profile {
  display: grid;
  gap: 24px;
  padding: 24px;
}
.profile__hero {
  display: grid;
  gap: 6px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border);
}
.profile__eyebrow {
  font: 600 0.6875rem/1 var(--font-sans);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.profile__title {
  margin: 0;
  font: 600 1.5rem/1.2 var(--font-sans);
  letter-spacing: -0.02em;
  color: var(--fg);
}
.profile__summary,
.profile__principal {
  margin: 0;
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--fg-2);
}
.profile__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
}
.profile__permissions {
  display: grid;
  gap: 10px;
}
.profile__permissions-title {
  margin: 0;
  font: 600 1rem/1.3 var(--font-sans);
  color: var(--fg);
}
.profile__permissions-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.profile__permission {
  padding: 4px 10px;
  font: 500 0.75rem/1.4 var(--font-mono, monospace);
  color: var(--fg-2);
  background: var(--bg-2);
  border: 1px solid var(--border);
}
.profile__permissions-empty {
  margin: 0;
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--fg-2);
}
</style>
```

- [ ] **Step 5: Run the page test + route-map + parity**

Run: `./node_modules/.bin/vitest run app/pages/__tests__/profile.page.nuxt.spec.ts app/pages/__tests__/route-map.spec.ts`
Expected: PASS (page 3 tests + route-map green — the `admin.profile` row unchanged).

Run the parity check:
```bash
node -e "const e=require('./app/locales/en.json'),i=require('./app/locales/id.json');const f=(o,p='')=>Object.entries(o).flatMap(([k,v])=>typeof v==='object'&&v?f(v,p+k+'.'):[p+k]);const ek=f(e).sort(),ik=f(i).sort();const d=ek.filter(k=>!ik.includes(k)).concat(ik.filter(k=>!ek.includes(k)));console.log('parity diff:',d); if(d.length)process.exit(1)"
```
Expected: `parity diff: []`.

- [ ] **Step 6: Verify gates + commit**

Run: `./node_modules/.bin/oxlint . && ./node_modules/.bin/eslint app/pages/profile.vue && npx vue-tsc --noEmit`

```bash
git add app/pages/profile.vue app/locales/en.json app/locales/id.json app/pages/__tests__/profile.page.nuxt.spec.ts
git commit -m "$(cat <<'EOF'
feat(sso-admin-frontend): Swiss profile page (identity + security + permissions)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 14.4: SSR leak gate + me.get permission + deferred e2e + DoD

**Files:**
- Modify: `test/fixtures/ssr-leak/server/routes/api/admin/me.get.ts` (grant `profile.read`)
- Modify: `test/ssr-token-leak.gate.spec.ts`
- Create: `e2e/profile.spec.ts` (authored, DEFERRED — not run this phase)

**Interfaces:**
- Consumes the gate's existing `collectSecretLeaks`/`collectPiiShapeLeaks`/`extractPayload` helpers + the `$fetch`/`setup` harness.
- STRICT (no `allowSessionId`). The profile page reads the masked `store.principal` (already hydrated via the session-store `useState`); it renders email (allowed), subject_id (opaque), role, amr, acr, MFA booleans, and the permission slug list — no token/secret/gov-PII. The admin's own OIDC `sid` + tokens live only in `event.context` (injected by the sentinel plugin) and must stay absent from the render.
- **`me.get` must grant `profile.read`** so the admin guard lets `/profile` render READY (the fixture principal currently omits it).

- [ ] **Step 1: Grant the permission in the me.get fixture**

In `test/fixtures/ssr-leak/server/routes/api/admin/me.get.ts`, add `'profile.read'` to the `permissions` array AND `'profile.read': true` to the `capabilities` object (mirror how `admin.dashboard.view` is granted). Do not touch other entries.

- [ ] **Step 2: Add the gate fetch helper + assertions**

In `test/ssr-token-leak.gate.spec.ts`, add a `fetchProfile` helper next to `fetchAuthAudit`:

```ts
function fetchProfile(): Promise<string> {
  // admin_locale=en so the MFA posture badge renders the English label.
  return $fetch('/profile', { headers: { cookie: 'admin_locale=en' } })
}
```

Then add these three `it` blocks inside the `describe`, immediately before the `collectSecretLeaks is LIVE` negative-control test:

```ts
  it('renders the admin profile server-side in its ready state', async () => {
    const html = await fetchProfile()
    expect(html).toContain('data-admin-shell')
    expect(html).toContain('data-page="profile"')
    // the masked principal renders: display name + the (allowed) email + the
    // profile.read slug this phase grants (ties the assertion to Step 1's change)
    expect(html).toContain('Admin Sentinel')
    expect(html).toContain('admin@example.test')
    expect(html).toContain('profile.read')
  })

  it('does not leak token/secret/PII values into the profile SSR HTML', async () => {
    // Strict — the profile renders only the masked principal (email allowed; subject_id
    // opaque; role/amr/acr/permission slugs non-sensitive). The admin's own tokens + OIDC
    // sid live in event.context and must NOT reach the render. NO allowSessionId.
    const html = await fetchProfile()
    expect(collectSecretLeaks(html, 'profile SSR HTML')).toEqual([])
  })

  it('does not leak token/secret/PII values into the profile hydration payload', async () => {
    const html = await fetchProfile()
    const serialized = JSON.stringify(JSON.parse(extractPayload(html)))
    expect(collectSecretLeaks(serialized, 'profile __NUXT__ payload')).toEqual([])
    expect(collectPiiShapeLeaks(serialized, 'profile __NUXT__ payload')).toEqual([])
  })
```

- [ ] **Step 3: Write the deferred e2e spec**

```ts
// e2e/profile.spec.ts
import { test, expect } from '@playwright/test'

// DEFERRED to Phase 18 cutover: playwright.config.ts is still legacy-SPA-wired
// (ports 5173/4173, no Nuxt build:web; Nuxt serves on 3000). Authored now against
// the shipped Nuxt routes so it becomes a real gate at cutover. Do NOT run as a
// gate this phase.
test('profile page shows the admin identity + security posture', async ({ page, context }) => {
  await context.addCookies([
    { name: 'admin_locale', value: 'en', url: 'http://localhost:3000' },
  ])
  await page.goto('/profile')

  await expect(page.getByTestId('profile-identity')).toBeVisible()
  await expect(page.getByTestId('profile-security')).toBeVisible()
  await expect(page.getByTestId('profile-mfa-status')).toBeVisible()
  await expect(page.getByTestId('profile-permissions')).toBeVisible()
})
```

- [ ] **Step 4: Run the leak gate**

`test/globalSetup.ts` rebuilds the `ssr-leak` fixture layer on every fresh `vitest run`, so the me.get grant is picked up automatically:

```bash
./node_modules/.bin/vitest run test/ssr-token-leak.gate.spec.ts
```
Expected: PASS — all prior gate tests + the 3 new profile tests + the live negative control.

> Recovery note: if the gate fails with "no `__NUXT_DATA__`", a stale render, or a `/profile` redirect (the guard redirected because `profile.read` was missing — confirm Step 1 landed), a prior interrupted run may also have left the build lock behind. Clear both lock and output, then re-run:
> ```bash
> rm -rf node_modules/.cache/sso-admin-e2e-build test/fixtures/ssr-leak/.output
> ./node_modules/.bin/vitest run test/ssr-token-leak.gate.spec.ts
> ```

- [ ] **Step 5: Full DoD gate**

```bash
./node_modules/.bin/oxlint .
./node_modules/.bin/eslint app/pages/profile.vue app/components/profile/ProfileIdentityCard.vue app/components/profile/ProfileSecurityCard.vue
npx vue-tsc --noEmit
./node_modules/.bin/vitest run
npm run build
```
Expected: oxlint 0/0, eslint 0, typecheck 0, **full suite green**, build PASS, SSR leak gate green (now includes profile).

- [ ] **Step 6: Commit**

```bash
git add test/fixtures/ssr-leak/server/routes/api/admin/me.get.ts test/ssr-token-leak.gate.spec.ts e2e/profile.spec.ts
git commit -m "$(cat <<'EOF'
test(sso-admin-frontend): STRICT profile SSR leak gate + me.get profile.read grant + deferred e2e

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**1. Spec coverage** (`/profile` → `pages/profile.vue` → `profile.read`, spec line 125; "admin principal self-view"):
- Principal identity (display name, email, subject id, names, role) → 14.2 (`ProfileIdentityCard`), 14.3 (page). ✅
- Auth/MFA posture (MFA, AMR, ACR, last login, auth time) → 14.1 (`resolveMfaTone`), 14.2 (`ProfileSecurityCard`). ✅
- Active permissions → 14.3 (page list). ✅
- `profile.read` permission + `name: admin.profile` preserved (route-map green); me.get grants it (14.4). ✅
- STRICT SSR leak gate → 14.4. ✅

**2. Placeholder scan:** No `TBD`/`add appropriate`/`similar to`/`write tests for the above` — every step carries full code. ✅

**3. Type consistency:** `AdminPrincipal`/`AdminAuthContext`/`AdminPermissionMatrix` come from the existing `@/types/auth.types`, consumed identically in 14.1/14.2/14.3. `ProfileViewState` (loading|ready) + `resolveProfileViewState` + `resolveMfaTone` defined in 14.1, used in 14.2/14.3. `ProfileIdentityLabels`/`ProfileSecurityLabels` defined in 14.2, consumed in 14.3. The page reads `store.principal.permissions.permissions` (the `AdminPermissionMatrix.permissions` slug array). Locale keys referenced by the page/cards (`profile.*`) all exist after the 14.3 block replacement. ✅

**Security invariants checklist (verify during execution):**
- No api/composable/fetch added — the page reads the already-masked `store.principal` (no new leak surface). ✅
- Email rendered verbatim (allowed §3.3); NIK/NIP/NISN/birth_date never in the principal DTO. ✅
- STRICT leak gate (no `allowSessionId`): the admin's own OIDC `sid` + tokens stay in `event.context`, absent from the render. Fixture principal has no 10/16/18-digit run (`sub-admin-sentinel`, null timestamps, `amr:['pwd']`). ✅
- **No destructive affordance** → zero `#E4002B` accent. **No gradient avatar** (the legacy gradient is banned by the 2b.10 discipline gate). MFA posture uses `success`/`warning`/`neutral` tone on a status badge (never colour-alone). ✅
- No proxy change; me.get grants `profile.read` so the guard renders the page. ✅
