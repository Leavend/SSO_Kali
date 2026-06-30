import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  SSO_WIDGET_SESSION_COOKIE,
  clearWidgetSessionCookie,
  expiredWidgetHostCookieOptions,
  widgetHostCookieOptions,
  widgetSessionCookie,
} from '../utils/widget-cookie'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('SSO_WIDGET_SESSION_COOKIE constant', () => {
  it('is exactly __Host-sso_session', () => {
    expect(SSO_WIDGET_SESSION_COOKIE).toBe('__Host-sso_session')
  })
})

describe('widgetHostCookieOptions', () => {
  it('returns httpOnly + secure + Lax + path=/ + given maxAge', () => {
    const opts = widgetHostCookieOptions(7200)
    expect(opts).toEqual({
      httpOnly: true,
      maxAge: 7200,
      path: '/',
      sameSite: 'Lax',
      secure: true,
    })
  })

  it('accepts maxAge=0 for expiry', () => {
    const opts = widgetHostCookieOptions(0)
    expect(opts.maxAge).toBe(0)
    expect(opts.sameSite).toBe('Lax')
  })
})

describe('expiredWidgetHostCookieOptions', () => {
  it('sets maxAge=0 and expires at the epoch', () => {
    const opts = expiredWidgetHostCookieOptions()
    expect(opts.maxAge).toBe(0)
    expect(opts.expires).toEqual(new Date(0))
    expect(opts.sameSite).toBe('Lax')
    expect(opts.httpOnly).toBe(true)
    expect(opts.secure).toBe(true)
  })
})

describe('admin BFF widget cookie', () => {
  it('mints __Host-sso_session from a non-empty sid with Lax host-only attributes', () => {
    const cookie = widgetSessionCookie({ sid: 'idp-session-id', maxAgeSeconds: 3600 })
    expect(cookie).not.toBeNull()
    expect(cookie).toContain(`${SSO_WIDGET_SESSION_COOKIE}=idp-session-id`)
    expect(cookie).toContain('Max-Age=3600')
    expect(cookie).toContain('Path=/')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('Secure')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).not.toMatch(/Domain=/u)
  })

  it('returns null when the id_token carried no usable sid', () => {
    expect(widgetSessionCookie({ sid: undefined, maxAgeSeconds: 3600 })).toBeNull()
    expect(widgetSessionCookie({ sid: '', maxAgeSeconds: 3600 })).toBeNull()
  })

  it('clears __Host-sso_session with Max-Age=0 and the epoch Expires date', () => {
    const cookie = clearWidgetSessionCookie()
    expect(cookie).toContain(`${SSO_WIDGET_SESSION_COOKIE}=`)
    expect(cookie).toContain('Max-Age=0')
    expect(cookie).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT')
    expect(cookie).toContain('SameSite=Lax')
  })

  it('embeds the raw sid value as cookie value', () => {
    const sid = 'raw-session-abc123'
    const cookie = widgetSessionCookie({ sid, maxAgeSeconds: 1800 })
    expect(cookie).toContain(`__Host-sso_session=${sid}`)
  })

  it('includes HttpOnly on the clear cookie', () => {
    const cookie = clearWidgetSessionCookie()
    expect(cookie).toContain('HttpOnly')
  })

  it('clear cookie has no Domain attribute', () => {
    expect(clearWidgetSessionCookie()).not.toMatch(/Domain=/u)
  })
})
