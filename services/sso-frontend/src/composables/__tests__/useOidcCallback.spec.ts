import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useOidcCallback } from '../useOidcCallback'
import * as tokenApi from '@/services/oidc.api'
import { saveAuthorizeRequest, clearAuthorizeRequest } from '@/lib/oidc/request-storage'
import type { AuthorizeRequestSnapshot } from '@/lib/oidc/request-storage'

function baseSnapshot(overrides: Partial<AuthorizeRequestSnapshot> = {}): AuthorizeRequestSnapshot {
  return {
    client_id: 'sso-frontend-portal',
    redirect_uri: 'https://sso.test/auth/callback',
    state: 'state-abc',
    nonce: 'nonce-xyz',
    code_verifier: 'verifier',
    scope: 'openid profile',
    post_login_redirect: '/home',
    issuer: 'https://sso.example.com',
    issued_at: Date.now(),
    ...overrides,
  }
}

function makeIdToken(payload: Record<string, unknown>): string {
  const encode = (value: Record<string, unknown>): string =>
    btoa(JSON.stringify(value))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/u, '')
  return `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode(payload)}.sig`
}

describe('useOidcCallback', () => {
  beforeEach(() => {
    clearAuthorizeRequest()
  })

  afterEach(() => {
    clearAuthorizeRequest()
    vi.restoreAllMocks()
  })

  it('fails with missing_params when code or state absent', async () => {
    const callback = useOidcCallback()
    const result = await callback.handle({})

    expect(result).toBeNull()
    expect(callback.error.value).toBe('missing_params')
  })

  it('forwards authorize_error when provider returns error param', async () => {
    const callback = useOidcCallback()
    const result = await callback.handle({
      error: 'access_denied',
      error_description: 'User declined',
    })

    expect(result).toBeNull()
    expect(callback.error.value).toBe('authorize_error')
    expect(callback.errorDescription.value).toBe('User declined')
  })

  it('fails with state_missing when no snapshot stored', async () => {
    const callback = useOidcCallback()
    const result = await callback.handle({ code: 'c', state: 's' })

    expect(result).toBeNull()
    expect(callback.error.value).toBe('state_missing')
  })

  it('fails with state_mismatch when state does not equal snapshot', async () => {
    saveAuthorizeRequest(baseSnapshot({ state: 'saved-state' }))

    const callback = useOidcCallback()
    const result = await callback.handle({ code: 'c', state: 'different' })

    expect(result).toBeNull()
    expect(callback.error.value).toBe('state_mismatch')
  })

  it('fails when token exchange rejects', async () => {
    saveAuthorizeRequest(baseSnapshot())
    vi.spyOn(tokenApi, 'exchangeAuthorizationCode').mockRejectedValue(new Error('boom'))

    const callback = useOidcCallback()
    const result = await callback.handle({ code: 'c', state: 'state-abc' })

    expect(result).toBeNull()
    expect(callback.error.value).toBe('token_exchange_failed')
  })

  it('fails id_token_invalid when nonce mismatches', async () => {
    saveAuthorizeRequest(baseSnapshot())
    vi.spyOn(tokenApi, 'exchangeAuthorizationCode').mockResolvedValue({
      access_token: 'at',
      token_type: 'Bearer',
      expires_in: 3600,
      id_token: makeIdToken({
        iss: 'https://sso.example.com',
        aud: 'sso-frontend-portal',
        nonce: 'different-nonce',
        exp: Math.floor(Date.now() / 1000) + 300,
        iat: Math.floor(Date.now() / 1000),
        sub: 'user',
      }),
    })

    const callback = useOidcCallback()
    const result = await callback.handle({ code: 'c', state: 'state-abc' })

    expect(result).toBeNull()
    expect(callback.error.value).toBe('id_token_invalid')
  })

  it('returns tokens + claims on happy path', async () => {
    saveAuthorizeRequest(baseSnapshot())
    const idToken = makeIdToken({
      iss: 'https://sso.example.com',
      aud: 'sso-frontend-portal',
      nonce: 'nonce-xyz',
      exp: Math.floor(Date.now() / 1000) + 300,
      iat: Math.floor(Date.now() / 1000),
      sub: 'user-1',
    })

    vi.spyOn(tokenApi, 'exchangeAuthorizationCode').mockResolvedValue({
      access_token: 'at',
      token_type: 'Bearer',
      expires_in: 3600,
      id_token: idToken,
    })

    const callback = useOidcCallback()
    const result = await callback.handle({ code: 'c', state: 'state-abc' })

    expect(result).not.toBeNull()
    expect(result?.tokens.access_token).toBe('at')
    expect(result?.claims.sub).toBe('user-1')
    expect(result?.post_login_redirect).toBe('/home')
    expect(callback.error.value).toBeNull()
  })
})
