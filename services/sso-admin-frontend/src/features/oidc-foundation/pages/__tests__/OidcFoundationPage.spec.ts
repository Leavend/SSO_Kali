import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import OidcFoundationPage from '../OidcFoundationPage.vue'
import { ApiError } from '@/lib/api/api-client'
import { oidcFoundationApi } from '../../services/oidcFoundation.api'
import type { OidcFoundationSnapshot } from '../../types'

vi.mock('../../services/oidcFoundation.api', () => ({
  oidcFoundationApi: {
    getSnapshot: vi.fn<() => Promise<OidcFoundationSnapshot>>(),
  },
}))

const snapshot: OidcFoundationSnapshot = {
  checked_at: '2026-05-26T10:00:00+00:00',
  correlation_id: 'req_123',
  discovery: {
    issuer: 'https://sso.test',
    authorization_endpoint: 'https://sso.test/authorize',
    token_endpoint: 'https://sso.test/token',
    jwks_uri: 'https://sso.test/.well-known/jwks.json',
    userinfo_endpoint: 'https://sso.test/userinfo',
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    scopes_supported: ['openid', 'profile', 'email'],
    claims_supported: ['sub', 'email', 'email_verified', 'name'],
    id_token_signing_alg_values_supported: ['ES256'],
  },
  jwks: {
    keys: [
      {
        kid: 'kid-1',
        alg: 'ES256',
        use: 'sig',
        status: 'published',
        published_at: null,
        rotated_at: null,
      },
    ],
  },
  availability: {
    discovery: {
      name: 'Discovery metadata',
      status: 'healthy',
      http_status: 200,
      latency_ms: 42,
      last_checked_at: '2026-05-26T09:58:00+00:00',
      evidence_ref: 'smoke-1',
    },
    jwks: {
      name: 'JWKS public keys',
      status: 'unknown',
      http_status: null,
      latency_ms: null,
      last_checked_at: null,
      evidence_ref: null,
    },
  },
  evidence: {
    jwks_rotation: {
      status: 'missing',
      label: 'JWKS rotation evidence belum tercatat',
      environment: null,
      latest_drill_at: null,
      operator_signoff: null,
      evidence_ref: null,
    },
    availability_timeline: [],
  },
  catalog: {
    scopes: [
      {
        name: 'openid',
        label: 'Identitas OpenID',
        description: 'Login SSO',
        label_status: 'mapped',
      },
    ],
    claims: [{ name: 'email', scope_dependency: 'email', sensitivity: 'personal_data' }],
    algorithms: [{ name: 'ES256', usage: 'id_token_signing', status: 'active' }],
  },
  issuer_consistency: {
    status: 'pass',
    configured_issuer: 'https://sso.test',
    discovery_issuer: 'https://sso.test',
    public_base_url: 'https://sso.test',
    last_checked_at: '2026-05-26T10:00:00+00:00',
  },
  endpoint_consistency: [
    {
      name: 'authorization_endpoint',
      discovered_url: 'https://sso.test/authorize',
      expected_url: 'https://sso.test/authorize',
      status: 'pass',
    },
    {
      name: 'token_endpoint',
      discovered_url: 'https://wrong.test/token',
      expected_url: 'https://sso.test/token',
      status: 'mismatch',
    },
  ],
}

describe('OidcFoundationPage', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('renders all FR-001 through FR-005 sections without secret material', async () => {
    vi.mocked(oidcFoundationApi.getSnapshot).mockResolvedValue(snapshot)

    const wrapper = mount(OidcFoundationPage)
    await flushPromises()

    expect(wrapper.text()).toContain('OIDC Foundation')
    expect(wrapper.text()).toContain('Discovery Metadata')
    expect(wrapper.text()).toContain('https://sso.test/authorize')
    expect(wrapper.text()).toContain('JWKS Public Key Status')
    expect(wrapper.text()).toContain('kid-1')
    expect(wrapper.text()).toContain('Availability Evidence')
    expect(wrapper.text()).toContain('Discovery metadata')
    expect(wrapper.text()).toContain('Scope / Claim / Algorithm Catalog')
    expect(wrapper.text()).toContain('Identitas OpenID')
    expect(wrapper.text()).toContain('Endpoint Consistency')
    expect(wrapper.text()).toContain('mismatch')
    expect(wrapper.text()).not.toContain('private_key')
    expect(wrapper.text()).not.toContain('client_secret')
    expect(wrapper.text()).not.toContain('signing_secret')
  })

  it('renders forbidden state safely', async () => {
    vi.mocked(oidcFoundationApi.getSnapshot).mockRejectedValue(
      new ApiError(403, 'Request failed with status 403'),
    )

    const wrapper = mount(OidcFoundationPage)
    await flushPromises()

    expect(wrapper.text()).toContain('Kamu tidak memiliki izin untuk melihat OIDC Foundation.')
    expect(wrapper.text()).not.toContain('Request failed with status 403')
    expect(wrapper.find('.ui-status-view').exists()).toBe(true)
  })

  it('uses shared skeleton while loading', () => {
    vi.mocked(oidcFoundationApi.getSnapshot).mockImplementation(() => new Promise(() => {}))

    const wrapper = mount(OidcFoundationPage)

    expect(wrapper.find('.ui-skeleton').exists()).toBe(true)
  })
})
