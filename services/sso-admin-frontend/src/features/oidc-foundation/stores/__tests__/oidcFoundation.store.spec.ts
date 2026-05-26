import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ApiError } from '@/lib/api/api-client'
import { oidcFoundationApi } from '../../services/oidcFoundation.api'
import { useOidcFoundationStore } from '../oidcFoundation.store'
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
  ],
}

describe('useOidcFoundationStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('loads the OIDC foundation snapshot', async () => {
    vi.mocked(oidcFoundationApi.getSnapshot).mockResolvedValue(snapshot)
    const store = useOidcFoundationStore()

    await store.load()

    expect(store.status).toBe('success')
    expect(store.snapshot?.discovery.issuer).toBe('https://sso.test')
    expect(store.snapshot?.jwks.keys[0]?.kid).toBe('kid-1')
    expect(store.errorMessage).toBeNull()
  })

  it('normalizes forbidden errors into a safe forbidden state', async () => {
    vi.mocked(oidcFoundationApi.getSnapshot).mockRejectedValue(
      new ApiError(403, 'forbidden raw backend trace'),
    )
    const store = useOidcFoundationStore()

    await store.load()

    expect(store.status).toBe('forbidden')
    expect(store.errorMessage).toBe('Kamu tidak memiliki izin untuk melihat OIDC Foundation.')
  })

  it('normalizes expired sessions into a safe unauthenticated state', async () => {
    vi.mocked(oidcFoundationApi.getSnapshot).mockRejectedValue(
      new ApiError(401, 'No active SSO session.', 'no_session', { redirectTo: '/' }),
    )
    const store = useOidcFoundationStore()

    await store.load()

    expect(store.status).toBe('unauthenticated')
    expect(store.errorMessage).toBe('Sesi admin berakhir. Login ulang untuk melanjutkan.')
  })

  it('normalizes backend failures into safe error copy and clears loading state', async () => {
    vi.mocked(oidcFoundationApi.getSnapshot).mockRejectedValue(
      new ApiError(502, 'SQLSTATE leaked raw error'),
    )
    const store = useOidcFoundationStore()

    await store.load()

    expect(store.status).toBe('error')
    expect(store.errorMessage).toBe(
      'Status OIDC Foundation belum bisa dimuat. Coba lagi atau gunakan correlation ID dari response jika tersedia.',
    )
    expect(store.isLoading).toBe(false)
  })
})
