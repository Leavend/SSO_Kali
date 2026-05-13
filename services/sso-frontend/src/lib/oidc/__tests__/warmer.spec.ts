import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The warmer reads OIDC config at call time — stub the env before import is unusable,
// but we can mock the imported modules.

vi.mock('../discovery', () => ({
  fetchDiscovery: vi.fn().mockResolvedValue({ issuer: 'https://sso.example.com' }),
}))
vi.mock('../jwks', () => ({
  fetchJwks: vi.fn().mockResolvedValue([]),
}))
vi.mock('../config', () => ({
  readOidcConfig: () => ({
    issuer: 'https://sso.example.com',
    client_id: 'test',
    authorize_endpoint: '',
    token_endpoint: '',
    end_session_endpoint: '',
    redirect_uri: '',
    post_logout_redirect_uri: '',
    scope: 'openid',
  }),
}))

import { fetchDiscovery } from '../discovery'
import { fetchJwks } from '../jwks'
import { warmOidcMetadata } from '../warmer'

describe('warmOidcMetadata', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('schedules discovery + jwks fetch via requestIdleCallback when available', async () => {
    vi.stubGlobal('requestIdleCallback', (cb: () => void) => {
      cb()
      return 1
    })

    warmOidcMetadata()
    await new Promise((r) => setTimeout(r, 0))

    expect(fetchDiscovery).toHaveBeenCalledWith(
      'https://sso.example.com/.well-known/openid-configuration',
    )
    expect(fetchJwks).toHaveBeenCalledWith('https://sso.example.com/.well-known/jwks.json')
  })

  it('falls back to setTimeout when requestIdleCallback is unavailable', async () => {
    vi.stubGlobal('requestIdleCallback', undefined)

    warmOidcMetadata()
    await new Promise((r) => setTimeout(r, 10))

    expect(fetchDiscovery).toHaveBeenCalled()
    expect(fetchJwks).toHaveBeenCalled()
  })

  it('never throws even when both fetches reject', async () => {
    vi.mocked(fetchDiscovery).mockRejectedValueOnce(new Error('boom'))
    vi.mocked(fetchJwks).mockRejectedValueOnce(new Error('boom'))
    vi.stubGlobal('requestIdleCallback', (cb: () => void) => {
      cb()
      return 1
    })

    expect(() => warmOidcMetadata()).not.toThrow()
    await new Promise((r) => setTimeout(r, 0))
  })
})
