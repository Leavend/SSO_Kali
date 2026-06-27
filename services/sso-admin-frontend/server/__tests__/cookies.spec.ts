// @vitest-environment node
// NOTE: the `// @vitest-environment node` pragma above is non-functional —
// defineVitestConfig auto-routes *.spec.ts files to the jsdom project and
// overrides per-file environment pragmas. This comment is kept for intent
// documentation only. The cookie helpers are pure functions with no DOM
// dependency, so jsdom is harmless here.
import type { IncomingMessage } from 'node:http'
import type { H3Event } from 'h3'
import { describe, expect, it } from 'vitest'
import {
  SSO_PORTAL_SESSION_COOKIE,
  SSO_PORTAL_TX_COOKIE,
  appendEventCookie,
  expiredHostCookieOptions,
  hostCookieOptions,
  readCookie,
  readEventCookie,
  serializeCookie,
} from '../utils/cookies'

function makeReq(cookie?: string): IncomingMessage {
  return { headers: cookie ? { cookie } : {} } as unknown as IncomingMessage
}

function makeEvent(cookie?: string): {
  event: H3Event
  resHeaders: Record<string, string | string[] | undefined>
} {
  const resHeaders: Record<string, string | string[] | undefined> = {}
  const event = {
    node: {
      req: makeReq(cookie),
      res: {
        getHeader: (name: string) => resHeaders[name],
        setHeader: (name: string, value: string | string[]) => {
          resHeaders[name] = value
        },
      },
    },
  } as unknown as H3Event
  return { event, resHeaders }
}

describe('admin BFF cookies', () => {
  it('pins the admin __Host- session and transaction cookie names', () => {
    expect(SSO_PORTAL_SESSION_COOKIE).toBe('__Host-sso-admin-session')
    expect(SSO_PORTAL_TX_COOKIE).toBe('__Host-sso-admin-tx')
  })

  it('serializes a __Host- session cookie with Secure, HttpOnly, SameSite=Strict, Path=/ and no Domain', () => {
    const cookie = serializeCookie(SSO_PORTAL_SESSION_COOKIE, 'opaque-id', hostCookieOptions(3600))
    expect(cookie).toContain('__Host-sso-admin-session=opaque-id')
    expect(cookie).toContain('Max-Age=3600')
    expect(cookie).toContain('Path=/')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('Secure')
    expect(cookie).toContain('SameSite=Strict')
    expect(cookie).not.toMatch(/Domain=/u)
  })

  it('expires a __Host- cookie with Max-Age=0 and the epoch Expires date', () => {
    const cookie = serializeCookie(SSO_PORTAL_SESSION_COOKIE, '', expiredHostCookieOptions())
    expect(cookie).toContain('Max-Age=0')
    expect(cookie).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT')
  })

  it('refuses to serialize a cookie that does not use the __Host- prefix', () => {
    expect(() => serializeCookie('sso-admin-session', 'x', hostCookieOptions(1))).toThrow(
      'Frontend session cookies must use the __Host- prefix.',
    )
  })

  it('reads a cookie from an h3 event request and accumulates multi-value Set-Cookie on the response', () => {
    const { event, resHeaders } = makeEvent('__Host-sso-admin-session=abc; other=1')
    expect(readEventCookie(event, SSO_PORTAL_SESSION_COOKIE)).toBe('abc')
    expect(readCookie(event.node.req, 'other')).toBe('1')

    appendEventCookie(event, serializeCookie(SSO_PORTAL_SESSION_COOKIE, 'one', hostCookieOptions(1)))
    appendEventCookie(event, serializeCookie(SSO_PORTAL_TX_COOKIE, 'two', hostCookieOptions(1)))
    const setCookie = resHeaders['set-cookie']
    expect(Array.isArray(setCookie)).toBe(true)
    expect((setCookie as string[]).length).toBe(2)
    expect((setCookie as string[])[0]).toContain('__Host-sso-admin-session=one')
    expect((setCookie as string[])[1]).toContain('__Host-sso-admin-tx=two')
  })
})
