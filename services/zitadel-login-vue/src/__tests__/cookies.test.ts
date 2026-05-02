import { describe, expect, it } from 'vitest'

import type { RuntimeConfig } from '../server/config'
import { parseLoginState, serializeLoginState, sessionCookie } from '../server/cookies'

const config: RuntimeConfig = {
  apiUrl: 'http://zitadel-api:8080',
  appBaseUrl: 'https://dev-sso.timeh.my.id',
  cookieSecret: 'test-zitadel-login-vue-cookie-secret-32',
  instanceHost: 'id.dev-sso.timeh.my.id',
  port: 3010,
  publicBasePath: '/ui/v2/auth',
  publicHost: 'id.dev-sso.timeh.my.id',
  requireTotpAfterPassword: true,
  secureCookies: true,
}

describe('login session cookie', () => {
  it('keeps ZITADEL session tokens in signed HttpOnly cookies', () => {
    const value = serializeLoginState({ loginName: 'user@example.com', sessionId: '1', sessionToken: 'token' }, config)
    const cookie = sessionCookie(value, config)

    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('Secure')
    expect(cookie).toContain('SameSite=Lax')
    expect(parseLoginState(value, config)?.loginName).toBe('user@example.com')
  })

  it('rejects tampered cookie payloads', () => {
    const value = serializeLoginState({ loginName: 'user@example.com', sessionId: '1', sessionToken: 'token' }, config)
    expect(parseLoginState(`${value}tampered`, config)).toBeNull()
  })
})
