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
