import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useOidcAuthorize } from '../useOidcAuthorize'
import * as pkceModule from '@/lib/oidc/pkce'
import * as storageModule from '@/lib/oidc/request-storage'
import * as discoveryModule from '@/lib/oidc/discovery'

const windowAssignMock = vi.fn()

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

function stubDiscovery(
  overrides: Partial<discoveryModule.DiscoveryMetadata> = {},
): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(discoveryModule, 'fetchDiscovery').mockResolvedValue({
    issuer: 'https://sso.example.com',
    authorization_endpoint: 'https://sso.example.com/oauth/authorize',
    token_endpoint: 'https://sso.example.com/oauth/token',
    jwks_uri: 'https://sso.example.com/.well-known/jwks.json',
    response_types_supported: ['code'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['ES256'],
    ...overrides,
  } as discoveryModule.DiscoveryMetadata)
}

describe('useOidcAuthorize', () => {
  beforeEach(() => {
    windowAssignMock.mockReset()
    vi.stubGlobal('location', { ...window.location, assign: windowAssignMock, origin: 'https://sso.test' })
    vi.stubEnv('VITE_OIDC_ISSUER', 'https://sso.example.com')
    vi.stubEnv('VITE_OIDC_CLIENT_ID', 'portal-client')
    vi.stubEnv('VITE_OIDC_REDIRECT_URI', 'https://sso.test/auth/callback')

    vi.spyOn(pkceModule, 'createPkcePair').mockResolvedValue({
      code_verifier: 'test-verifier',
      code_challenge: 'test-challenge',
      code_challenge_method: 'S256',
    })
    vi.spyOn(pkceModule, 'createState').mockReturnValue('test-state')
    vi.spyOn(pkceModule, 'createNonce').mockReturnValue('test-nonce')

    stubDiscovery()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    sessionStorage.clear()
  })

  it('saves authorize request snapshot to sessionStorage', async () => {
    const saveSpy = vi.spyOn(storageModule, 'saveAuthorizeRequest')

    const { start } = useOidcAuthorize()
    await start()

    expect(saveSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: 'portal-client',
        state: 'test-state',
        nonce: 'test-nonce',
        code_verifier: 'test-verifier',
        post_login_redirect: '/home',
      }),
    )
  })

  it('redirects to authorize URL with PKCE params', async () => {
    const { start } = useOidcAuthorize()
    await start()

    expect(windowAssignMock).toHaveBeenCalledTimes(1)
    const url = new URL(windowAssignMock.mock.calls[0]![0] as string)

    expect(url.origin + url.pathname).toBe('https://sso.example.com/oauth/authorize')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('client_id')).toBe('portal-client')
    expect(url.searchParams.get('state')).toBe('test-state')
    expect(url.searchParams.get('nonce')).toBe('test-nonce')
    expect(url.searchParams.get('code_challenge')).toBe('test-challenge')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
  })

  it('uses custom post_login_redirect when provided', async () => {
    const saveSpy = vi.spyOn(storageModule, 'saveAuthorizeRequest')

    const { start } = useOidcAuthorize()
    await start({ post_login_redirect: '/dashboard' })

    expect(saveSpy).toHaveBeenCalledWith(
      expect.objectContaining({ post_login_redirect: '/dashboard' }),
    )
  })

  it('includes prompt param when specified', async () => {
    const { start } = useOidcAuthorize()
    await start({ prompt: 'login' })

    const url = new URL(windowAssignMock.mock.calls[0]![0] as string)
    expect(url.searchParams.get('prompt')).toBe('login')
  })

  it('omits prompt param when not specified', async () => {
    const { start } = useOidcAuthorize()
    await start()

    const url = new URL(windowAssignMock.mock.calls[0]![0] as string)
    expect(url.searchParams.has('prompt')).toBe(false)
  })

  it.each(['none', 'login', 'consent', 'select_account'] as const)(
    'forwards prompt=%s to authorize URL',
    async (prompt) => {
      const { start } = useOidcAuthorize()
      await start({ prompt })

      const url = new URL(windowAssignMock.mock.calls[0]![0] as string)
      expect(url.searchParams.get('prompt')).toBe(prompt)
    },
  )

  it('forwards acr_values from a string', async () => {
    const { start } = useOidcAuthorize()
    await start({ acr_values: 'urn:sso:loa:mfa' })

    const url = new URL(windowAssignMock.mock.calls[0]![0] as string)
    expect(url.searchParams.get('acr_values')).toBe('urn:sso:loa:mfa')
  })

  it('joins acr_values arrays with single spaces and drops empties', async () => {
    const { start } = useOidcAuthorize()
    await start({ acr_values: [' urn:sso:loa:mfa ', '', 'urn:sso:loa:hardware'] })

    const url = new URL(windowAssignMock.mock.calls[0]![0] as string)
    expect(url.searchParams.get('acr_values')).toBe('urn:sso:loa:mfa urn:sso:loa:hardware')
  })

  it('forwards max_age=0 to force re-authentication', async () => {
    const { start } = useOidcAuthorize()
    await start({ max_age: 0 })

    const url = new URL(windowAssignMock.mock.calls[0]![0] as string)
    expect(url.searchParams.get('max_age')).toBe('0')
  })

  it('drops invalid max_age values', async () => {
    const { start } = useOidcAuthorize()
    await start({ max_age: -5 })

    const url = new URL(windowAssignMock.mock.calls[0]![0] as string)
    expect(url.searchParams.has('max_age')).toBe(false)
  })

  it('uses authorize endpoint from validated discovery, not local config', async () => {
    vi.spyOn(discoveryModule, 'fetchDiscovery').mockResolvedValue({
      issuer: 'https://sso.example.com',
      authorization_endpoint: 'https://sso.example.com/discovered/authorize',
      token_endpoint: 'https://sso.example.com/oauth/token',
      jwks_uri: 'https://sso.example.com/.well-known/jwks.json',
      response_types_supported: ['code'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['ES256'],
    } as discoveryModule.DiscoveryMetadata)

    const { start } = useOidcAuthorize()
    await start()

    const url = new URL(windowAssignMock.mock.calls[0]![0] as string)
    expect(url.origin + url.pathname).toBe('https://sso.example.com/discovered/authorize')
  })

  it('rejects authorize start when discovery issuer drifts from configured issuer', async () => {
    vi.spyOn(discoveryModule, 'fetchDiscovery').mockResolvedValue({
      issuer: 'https://attacker.example.com',
      authorization_endpoint: 'https://attacker.example.com/oauth/authorize',
      token_endpoint: 'https://attacker.example.com/oauth/token',
      jwks_uri: 'https://attacker.example.com/.well-known/jwks.json',
      response_types_supported: ['code'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['ES256'],
    } as discoveryModule.DiscoveryMetadata)

    const { start } = useOidcAuthorize()
    await expect(start()).rejects.toThrowError(/Discovery issuer/u)
    expect(windowAssignMock).not.toHaveBeenCalled()
  })
})
