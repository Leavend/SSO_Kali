import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useOidcAuthorize } from '../useOidcAuthorize'
import { setLocationPortForTest } from '@/lib/browser/location-port'
import * as pkceModule from '@/lib/oidc/pkce'
import * as storageModule from '@/lib/oidc/request-storage'

const windowAssignMock = vi.fn()

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

describe('useOidcAuthorize', () => {
  beforeEach(() => {
    windowAssignMock.mockReset()
    setLocationPortForTest({ assign: windowAssignMock, origin: 'https://sso.test' })
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
  })

  afterEach(() => {
    setLocationPortForTest(null)
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
})
