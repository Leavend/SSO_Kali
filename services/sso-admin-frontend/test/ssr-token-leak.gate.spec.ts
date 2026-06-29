/**
 * §3.3 SSR token-leak render gate (the crown jewel).
 *
 * Renders a REAL authenticated admin page (the dashboard, through the admin
 * layout) under full SSR with a mocked `event.context.session` carrying sentinel
 * OIDC token VALUES (access / refresh / id / sid) and sentinel raw-PII VALUES
 * shaped exactly like a NIK (16 digits), NIP (18 digits), and NISN (10 digits),
 * plus a private `runtimeConfig` canary. It then asserts neither the rendered
 * HTML nor the parsed Nuxt hydration payload (`__NUXT_DATA__`, the SSR-serialized
 * form of `window.__NUXT__`) contains any of those token values/names, any of the
 * raw-PII values/shapes, or the private canary. Tokens + raw PII must stay in
 * Nitro `event.context` only; the admin's own `email` is an intentional safe
 * display field and is deliberately NOT asserted absent.
 *
 * Harness (Task 0.4 constraint): the e2e in-process full build is blocked at the
 * vitest-worker level, so the SSR-leak fixture LAYER is pre-built in a subprocess
 * by test/globalSetup.ts and this spec runs `setup({ build: false })` against its
 * pre-built `.output`. `setup()` is called directly inside the async `describe`
 * callback (NOT in beforeAll): @nuxt/test-utils v4 registers its own beforeAll
 * during collection, so wrapping it nests the hook and it fires after the tests,
 * leaving `$fetch` without a URL context. Mirrors test/ssr-smoke.spec.ts.
 */
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils/e2e'
import { SENTINEL, SSR_LEAK_CANARY } from './fixtures/ssr-leak/sentinels'

// process.cwd() is the service root (services/sso-admin-frontend) when tests run
// via `npm run test` — reliable in jsdom where import.meta.url is not file://
// (mirrors app/pages/__tests__/route-map.spec.ts).
const fixtureDir = resolve(process.cwd(), 'test', 'fixtures', 'ssr-leak')

// The fixture's server-only Nuxt plugin injects an authenticated sentinel session
// (tokens + raw PII) onto event.context for every SSR render, so /dashboard renders
// as a signed-in admin. No cookie/credentials are needed.
function fetchDashboard(): Promise<string> {
  return $fetch('/dashboard')
}

function fetchUsersList(): Promise<string> {
  return $fetch('/users')
}

function fetchUserDetail(): Promise<string> {
  return $fetch('/users/sub-target-sentinel')
}

function fetchClientsList(): Promise<string> {
  return $fetch('/clients')
}

function fetchClientDetail(): Promise<string> {
  return $fetch('/clients/acme-portal')
}

function fetchObservability(): Promise<string> {
  return $fetch('/observability')
}

function fetchCompliance(): Promise<string> {
  return $fetch('/observability/compliance')
}

function fetchRoles(): Promise<string> {
  return $fetch('/roles')
}

function extractPayload(html: string): string {
  const match = html.match(/<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
  if (!match?.[1]) {
    throw new Error('no __NUXT_DATA__ hydration payload found in SSR HTML')
  }
  return match[1]
}

// Collect (rather than assert per-line) so the gate uses single-argument expect
// (oxlint jest/valid-expect bans `expect(value, message)`); the returned label
// array is itself the self-describing failure output via `.toEqual([])`.
//
// `allowSessionId` (default false): on the dashboard the sentinel `sid` is the
// OIDC session id held in Nitro event.context — a server-only value the gate
// proves never reaches the client, so the dashboard keeps the strict check. The
// user-detail DTO carries a DEVICE session id (device_sessions row) which the
// §3.3 decision treats as an allowed operational identifier — needed by the 4.11
// session actions, displayed only via formatTechnicalPreview, NOT a credential —
// so the users-page checks exempt it. Tokens/secrets/canary/raw-PII stay strict
// in both contexts.
function collectSecretLeaks(
  haystack: string,
  where: string,
  { allowSessionId = false }: { allowSessionId?: boolean } = {},
): readonly string[] {
  const leaks: string[] = []
  const reportContains = (needle: string, label: string): void => {
    if (haystack.includes(needle)) leaks.push(`${where} ${label}`)
  }
  const reportMatches = (pattern: RegExp, label: string): void => {
    if (pattern.test(haystack)) leaks.push(`${where} ${label}`)
  }

  // OIDC token VALUES.
  reportContains(SENTINEL.access, 'leaks the access-token value')
  reportContains(SENTINEL.refresh, 'leaks the refresh-token value')
  reportContains(SENTINEL.id, 'leaks the id-token value')
  if (!allowSessionId) reportContains(SENTINEL.sid, 'leaks the session-id (sid) value')
  // OIDC token field NAMES (camelCase session shape + snake_case OIDC wire shape).
  reportMatches(
    /accessToken|refreshToken|idToken|access_token|refresh_token|id_token/,
    'leaks a token field name',
  )
  // Raw government PII VALUES.
  reportContains(SENTINEL.nik, 'leaks the raw NIK value')
  reportContains(SENTINEL.nip, 'leaks the raw NIP value')
  reportContains(SENTINEL.nisn, 'leaks the raw NISN value')
  // Private runtimeConfig canary + private secret field names.
  reportContains(SSR_LEAK_CANARY, 'leaks the runtimeConfig canary')
  reportMatches(
    /sessionEncryptionSecret|adminOidcClientSecret/,
    'leaks a private secret field name',
  )
  // Plaintext client-secret VALUE (one-time secret — never on the SSR path).
  reportContains(SENTINEL.clientSecret, 'leaks the client-secret value')
  // Client-secret + rotate-response plaintext field NAMES (snake_case wire +
  // camelCase shapes). The masked list/detail DTOs carry only `has_secret_hash`,
  // never these names; `client_id` and `has_secret_hash` are deliberately NOT matched.
  reportMatches(
    /client_secret|clientSecret|plaintext_secret|plaintext_once/,
    'leaks a client-secret field name',
  )

  return leaks
}

function collectPiiShapeLeaks(payload: string, where: string): readonly string[] {
  const leaks: string[] = []
  // Word-bounded digit runs. 16/18/10 do not overlap: a 16-digit run is not a
  // boundary-isolated 10-digit run, so the patterns are mutually exclusive.
  if (/(?<!\d)\d{16}(?!\d)/.test(payload)) leaks.push(`${where} leaks a 16-digit NIK-shaped value`)
  if (/(?<!\d)\d{18}(?!\d)/.test(payload)) leaks.push(`${where} leaks an 18-digit NIP-shaped value`)
  if (/(?<!\d)\d{10}(?!\d)/.test(payload)) leaks.push(`${where} leaks a 10-digit NISN-shaped value`)
  return leaks
}

// The async describe callback is required by @nuxt/test-utils v4 (see header):
// setup() must register its own beforeAll during collection. This is the only
// place the otherwise-correct valid-describe-callback rule is suppressed.
// eslint-disable-next-line vitest/valid-describe-callback
describe('SSR token-leak render gate (§3.3)', async () => {
  await setup({
    rootDir: fixtureDir,
    server: true,
    build: false,
    browser: false,
    // Point at the pre-built fixture output produced by test/globalSetup.ts.
    nuxtConfig: { nitro: { output: { dir: resolve(fixtureDir, '.output') } } },
  })

  it('renders the authenticated dashboard server-side through the admin shell', async () => {
    const html = await fetchDashboard()
    // Representative authenticated page renders (safe channel works) ...
    expect(html).toContain('data-page="dashboard"')
    expect(html).toContain('Admin Sentinel')
    // ... and it renders through the admin layout (data-admin-shell SSR coverage,
    // restored from Task 2a.6 when the old index→shell smoke assertion was lost).
    expect(html).toContain('data-admin-shell')
    // The summary path rendered the READY state (folio timestamp is verbatim).
    expect(html).toContain('2026-06-28T14:32:15Z')
  })

  it('does not leak token/PII/secret values into the SSR HTML', async () => {
    const html = await fetchDashboard()
    expect(collectSecretLeaks(html, 'SSR HTML')).toEqual([])
  })

  it('does not leak token/PII/secret values into the hydration payload', async () => {
    const html = await fetchDashboard()
    const parsed: unknown = JSON.parse(extractPayload(html))
    const serialized = JSON.stringify(parsed)
    expect(collectSecretLeaks(serialized, '__NUXT__ payload')).toEqual([])
    expect(collectPiiShapeLeaks(serialized, '__NUXT__ payload')).toEqual([])
  })

  it('renders the users list + detail server-side in their ready (masked) state', async () => {
    const listHtml = await fetchUsersList()
    expect(listHtml).toContain('data-admin-shell')
    expect(listHtml).toContain('Target User')

    const detailHtml = await fetchUserDetail()
    expect(detailHtml).toContain('data-admin-shell')
    expect(detailHtml).toContain('Target User')
    // The raw session id was rendered through formatTechnicalPreview, proving the
    // page masks it (REF-4A1B9C0D is SENTINEL.sid normalized + sliced to 8).
    expect(detailHtml).toContain('REF-4A1B9C0D')
  })

  it('does not leak token/PII/secret values into the users-page SSR HTML', async () => {
    // allowSessionId: the user-detail DTO carries a DEVICE session id (allowed
    // §3.3 operational identifier, masked to REF- for display); tokens/secrets/PII
    // stay strict. The raw OIDC sid never reaches the client (dashboard proves it).
    const listHtml = await fetchUsersList()
    const detailHtml = await fetchUserDetail()
    expect(collectSecretLeaks(listHtml, 'users-list SSR HTML', { allowSessionId: true })).toEqual(
      [],
    )
    expect(
      collectSecretLeaks(detailHtml, 'user-detail SSR HTML', { allowSessionId: true }),
    ).toEqual([])
  })

  it('does not leak token/PII/secret values into the users-page hydration payload', async () => {
    for (const html of [await fetchUsersList(), await fetchUserDetail()]) {
      const serialized = JSON.stringify(JSON.parse(extractPayload(html)))
      expect(
        collectSecretLeaks(serialized, 'users __NUXT__ payload', { allowSessionId: true }),
      ).toEqual([])
      expect(collectPiiShapeLeaks(serialized, 'users __NUXT__ payload')).toEqual([])
    }
  })

  it('renders the clients list + detail server-side in their ready (masked) state', async () => {
    const listHtml = await fetchClientsList()
    expect(listHtml).toContain('data-admin-shell')
    expect(listHtml).toContain('Acme Portal')

    const detailHtml = await fetchClientDetail()
    expect(detailHtml).toContain('data-admin-shell')
    expect(detailHtml).toContain('Acme Portal')
    // The public client_id is allowed to render (it is a public identifier, not a secret).
    expect(detailHtml).toContain('acme-portal')
  })

  it('does not leak token/secret/PII values into the clients-page SSR HTML', async () => {
    const listHtml = await fetchClientsList()
    const detailHtml = await fetchClientDetail()
    expect(collectSecretLeaks(listHtml, 'clients-list SSR HTML')).toEqual([])
    expect(collectSecretLeaks(detailHtml, 'client-detail SSR HTML')).toEqual([])
  })

  it('does not leak token/secret/PII values into the clients-page hydration payload', async () => {
    for (const html of [await fetchClientsList(), await fetchClientDetail()]) {
      const serialized = JSON.stringify(JSON.parse(extractPayload(html)))
      expect(collectSecretLeaks(serialized, 'clients __NUXT__ payload')).toEqual([])
      expect(collectPiiShapeLeaks(serialized, 'clients __NUXT__ payload')).toEqual([])
    }
  })

  it('renders the observability + compliance pages server-side in their ready (masked) state', async () => {
    const cockpit = await fetchObservability()
    expect(cockpit).toContain('data-admin-shell')
    // The summary rendered the READY state (service name + folio timestamp verbatim).
    expect(cockpit).toContain('IdP Backend')
    expect(cockpit).toContain('2026-06-28T14:32:15Z')

    const compliance = await fetchCompliance()
    expect(compliance).toContain('data-admin-shell')
    // Retention rendered READY ...
    expect(compliance).toContain('Authentication audit events')
    // ... and the DSR queue masked the opaque subject id through formatTechnicalPreview
    // (REF-SRAURORA is 'sub-dsr-aurora' normalized + sliced to its last 8 chars).
    expect(compliance).toContain('REF-SRAURORA')
  })

  it('does not leak token/PII/secret values into the observability/compliance SSR HTML', async () => {
    const cockpit = await fetchObservability()
    const compliance = await fetchCompliance()
    expect(collectSecretLeaks(cockpit, 'observability SSR HTML')).toEqual([])
    expect(collectSecretLeaks(compliance, 'compliance SSR HTML')).toEqual([])
  })

  it('does not leak token/PII/secret values into the observability/compliance hydration payload', async () => {
    for (const html of [await fetchObservability(), await fetchCompliance()]) {
      const serialized = JSON.stringify(JSON.parse(extractPayload(html)))
      expect(collectSecretLeaks(serialized, 'observability __NUXT__ payload')).toEqual([])
      expect(collectPiiShapeLeaks(serialized, 'observability __NUXT__ payload')).toEqual([])
    }
  })

  it('renders the roles list + matrix server-side in their ready (masked) state', async () => {
    const html = await fetchRoles()
    expect(html).toContain('data-admin-shell')
    // A custom (editable) role column header renders ...
    expect(html).toContain('Content Editor')
    // ... and a permission row label renders, proving the role × permission matrix mounted.
    expect(html).toContain('Manage users')
  })

  it('does not leak token/secret/PII values into the roles-page SSR HTML', async () => {
    // Strict — the roles DTOs carry only slugs/names/descriptions/counts (no token,
    // secret, session id, or PII), so NO allowSessionId exemption applies.
    const html = await fetchRoles()
    expect(collectSecretLeaks(html, 'roles SSR HTML')).toEqual([])
  })

  it('does not leak token/secret/PII values into the roles-page hydration payload', async () => {
    const html = await fetchRoles()
    const serialized = JSON.stringify(JSON.parse(extractPayload(html)))
    expect(collectSecretLeaks(serialized, 'roles __NUXT__ payload')).toEqual([])
    expect(collectPiiShapeLeaks(serialized, 'roles __NUXT__ payload')).toEqual([])
  })

  it('strips the DSR free-text PII canary from the compliance SSR HTML and hydration payload (proves the Task-6.4 runtime strip, not a null fixture)', async () => {
    // The DSR fixture row carries a NON-null reason/reviewer_notes/reviewer_subject_id
    // canary (the shared presenter emits them). The service maps each row to the
    // narrowed DTO at runtime, so the free-text reaches neither the SSR HTML nor
    // __NUXT_DATA__ — a null fixture would pass even if that strip regressed, so the
    // canary keeps the gate honest. (The token-name + digit-run collectors are
    // structurally blind to free-text PII; these literal checks close that gap.)
    const compliance = await fetchCompliance()
    const payload = JSON.stringify(JSON.parse(extractPayload(compliance)))
    for (const haystack of [compliance, payload]) {
      expect(haystack).not.toContain('SSR_PII_CANARY')
      expect(haystack).not.toContain('Budi Santoso')
      expect(haystack).not.toContain('budi@example.gov')
      expect(haystack).not.toContain('internal note')
      expect(haystack).not.toContain('sub-reviewer-canary')
    }
  })

  it('collectSecretLeaks is LIVE — it reports a planted client secret (negative control)', () => {
    // Tripwire self-test: prove the detector is not vacuously green. A payload that
    // embeds the sentinel secret value AND a client_secret field name MUST be
    // reported — otherwise the `.toEqual([])` assertions above could pass even with
    // a broken detector.
    const planted = `{"client":{"client_secret":"${SENTINEL.clientSecret}"}}`
    expect(collectSecretLeaks(planted, 'negative control')).not.toEqual([])
  })
})
