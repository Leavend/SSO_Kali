import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  clearAuthorizeRequest,
  saveAuthorizeRequest,
  takeAuthorizeRequest,
  type AuthorizeRequestSnapshot,
} from '../request-storage'

function makeSnapshot(overrides: Partial<AuthorizeRequestSnapshot> = {}): AuthorizeRequestSnapshot {
  return {
    client_id: 'test-client',
    redirect_uri: 'https://sso.test/auth/callback',
    state: 'state-123',
    nonce: 'nonce-456',
    code_verifier: 'verifier-abc',
    scope: 'openid profile',
    post_login_redirect: '/home',
    issuer: 'https://sso.test',
    issued_at: Date.now(),
    ...overrides,
  }
}

describe('request-storage', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  afterEach(() => {
    sessionStorage.clear()
  })

  it('saveAuthorizeRequest stores snapshot in sessionStorage', () => {
    const snapshot = makeSnapshot()
    saveAuthorizeRequest(snapshot)

    const raw = sessionStorage.getItem('dev-sso.oidc.authorize_request')
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw!)).toEqual(snapshot)
  })

  it('takeAuthorizeRequest retrieves and removes snapshot', () => {
    const snapshot = makeSnapshot({ state: 'unique-state' })
    saveAuthorizeRequest(snapshot)

    const result = takeAuthorizeRequest()
    expect(result).toEqual(snapshot)
    expect(result?.state).toBe('unique-state')

    // Should be removed after take
    expect(takeAuthorizeRequest()).toBeNull()
  })

  it('takeAuthorizeRequest returns null when nothing stored', () => {
    expect(takeAuthorizeRequest()).toBeNull()
  })

  it('clearAuthorizeRequest removes stored snapshot', () => {
    saveAuthorizeRequest(makeSnapshot())
    clearAuthorizeRequest()
    expect(takeAuthorizeRequest()).toBeNull()
  })

  it('takeAuthorizeRequest returns null for corrupted JSON', () => {
    sessionStorage.setItem('dev-sso.oidc.authorize_request', '{invalid json')
    expect(takeAuthorizeRequest()).toBeNull()
  })
})
