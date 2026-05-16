import { describe, expect, it } from 'vitest'
import { SSO_PORTAL_SESSION_COOKIE, hostCookieOptions, readCookie, serializeCookie } from '../server/cookies'
import type { IncomingMessage } from 'node:http'

describe('session cookies', () => {
  it('serializes httpOnly secure strict cookies', () => {
    const cookie = serializeCookie(SSO_PORTAL_SESSION_COOKIE, 'abc', hostCookieOptions(300))

    expect(cookie).toContain('__Host-sso-portal-session=abc')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('Secure')
    expect(cookie).toContain('SameSite=Strict')
  })

  it('reads encoded cookies from requests', () => {
    const request = {
      headers: {
        cookie: `${SSO_PORTAL_SESSION_COOKIE}=hello%20world; other=value`,
      },
    } as IncomingMessage

    expect(readCookie(request, SSO_PORTAL_SESSION_COOKIE)).toBe('hello world')
  })
})
