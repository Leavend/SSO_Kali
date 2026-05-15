import { afterEach, describe, expect, it, vi } from 'vitest'
import { readOidcConfig } from '../config'

describe('readOidcConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('reads issuer and client_id from env', () => {
    vi.stubEnv('VITE_OIDC_ISSUER', 'https://sso.example.com')
    vi.stubEnv('VITE_OIDC_CLIENT_ID', 'my-client')

    const config = readOidcConfig()

    expect(config.issuer).toBe('https://sso.example.com')
    expect(config.client_id).toBe('my-client')
  })

  it('derives authorize and token endpoints from issuer when not explicitly set', () => {
    vi.stubEnv('VITE_OIDC_ISSUER', 'https://sso.example.com/')
    vi.stubEnv('VITE_OIDC_CLIENT_ID', 'c')

    const config = readOidcConfig()

    expect(config.authorize_endpoint).toBe('https://sso.example.com/oauth/authorize')
    expect(config.token_endpoint).toBe('https://sso.example.com/oauth/token')
  })

  it('uses explicit endpoints when provided', () => {
    vi.stubEnv('VITE_OIDC_ISSUER', 'https://sso.example.com')
    vi.stubEnv('VITE_OIDC_CLIENT_ID', 'c')
    vi.stubEnv('VITE_OIDC_AUTHORIZE_ENDPOINT', 'https://custom/authorize')
    vi.stubEnv('VITE_OIDC_TOKEN_ENDPOINT', 'https://custom/token')

    const config = readOidcConfig()

    expect(config.authorize_endpoint).toBe('https://custom/authorize')
    expect(config.token_endpoint).toBe('https://custom/token')
  })

  it('defaults scope to openid profile email (offline_access is explicit opt-in)', () => {
    vi.stubEnv('VITE_OIDC_ISSUER', 'https://sso.example.com')
    vi.stubEnv('VITE_OIDC_CLIENT_ID', 'c')

    const config = readOidcConfig()

    expect(config.scope).toBe('openid profile email')
  })

  it('throws when VITE_OIDC_ISSUER is missing', () => {
    vi.stubEnv('VITE_OIDC_ISSUER', '')
    vi.stubEnv('VITE_OIDC_CLIENT_ID', 'c')

    expect(() => readOidcConfig()).toThrow(/VITE_OIDC_ISSUER/)
  })

  it('throws when VITE_OIDC_CLIENT_ID is missing', () => {
    vi.stubEnv('VITE_OIDC_ISSUER', 'https://sso.example.com')
    vi.stubEnv('VITE_OIDC_CLIENT_ID', '')

    expect(() => readOidcConfig()).toThrow(/VITE_OIDC_CLIENT_ID/)
  })
})
