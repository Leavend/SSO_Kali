import { describe, expect, it } from 'vitest'
import { buildProxyRequestHeaders, buildProxyResponseHeaders } from '../proxy-headers.js'

describe('buildProxyResponseHeaders', () => {
  it('preserves every Set-Cookie value returned by the upstream', () => {
    const headers = new Headers()
    headers.append('Set-Cookie', '__Host-laravel_session=lsess; Path=/; Secure; HttpOnly; SameSite=Lax')
    headers.append('Set-Cookie', '__Host-sso_session=ssoses; Path=/; Secure; HttpOnly; SameSite=Lax')
    headers.append('Set-Cookie', 'XSRF-TOKEN=tokenA; Path=/; Secure; SameSite=Lax')
    headers.set('Content-Type', 'application/json; charset=utf-8')

    const forwarded = buildProxyResponseHeaders(headers)

    expect(forwarded['set-cookie']).toEqual([
      '__Host-laravel_session=lsess; Path=/; Secure; HttpOnly; SameSite=Lax',
      '__Host-sso_session=ssoses; Path=/; Secure; HttpOnly; SameSite=Lax',
      'XSRF-TOKEN=tokenA; Path=/; Secure; SameSite=Lax',
    ])
    expect(forwarded['content-type']).toBe('application/json; charset=utf-8')
  })

  it('omits the Set-Cookie entry entirely when the upstream sent none', () => {
    const headers = new Headers()
    headers.set('Content-Type', 'application/json')

    const forwarded = buildProxyResponseHeaders(headers)

    expect(forwarded).not.toHaveProperty('set-cookie')
    expect(forwarded['content-type']).toBe('application/json')
  })

  it('strips hop-by-hop response headers that must not cross the BFF boundary', () => {
    const headers = new Headers()
    headers.set('transfer-encoding', 'chunked')
    headers.set('content-length', '123')
    headers.set('connection', 'keep-alive')
    headers.set('content-type', 'text/plain')

    const forwarded = buildProxyResponseHeaders(headers)

    expect(forwarded).not.toHaveProperty('transfer-encoding')
    expect(forwarded).not.toHaveProperty('content-length')
    expect(forwarded).not.toHaveProperty('connection')
    expect(forwarded['content-type']).toBe('text/plain')
  })

  it('falls back to splitting joined Set-Cookie when getSetCookie is unavailable', () => {
    const fakeHeaders = {
      getSetCookie: undefined,
      get(name: string): string | null {
        return name === 'set-cookie'
          ? '__Host-sso_session=abc; Expires=Wed, 23 Aug 2026 12:00:00 GMT; Secure, XSRF-TOKEN=xyz; Path=/; Secure'
          : null
      },
      forEach(callback: (value: string, name: string) => void): void {
        callback('text/plain', 'content-type')
      },
    } as unknown as Headers

    const forwarded = buildProxyResponseHeaders(fakeHeaders)

    expect(forwarded['set-cookie']).toEqual([
      '__Host-sso_session=abc; Expires=Wed, 23 Aug 2026 12:00:00 GMT; Secure',
      'XSRF-TOKEN=xyz; Path=/; Secure',
    ])
  })
})

describe('buildProxyRequestHeaders', () => {
  it('forwards the cookie header so the upstream sees the SSO session cookie', () => {
    const forwarded = buildProxyRequestHeaders({
      cookie: '__Host-sso_session=abc-123; XSRF-TOKEN=tok',
      'x-request-id': 'req-1',
      'content-type': 'application/json',
      host: 'sso.timeh.my.id',
    })

    expect(forwarded.get('cookie')).toBe('__Host-sso_session=abc-123; XSRF-TOKEN=tok')
    expect(forwarded.get('x-request-id')).toBe('req-1')
    expect(forwarded.get('content-type')).toBe('application/json')
    expect(forwarded.get('host')).toBeNull()
  })

  it('preserves multi-valued client headers when the runtime delivers them as arrays', () => {
    const forwarded = buildProxyRequestHeaders({
      'set-cookie': ['a=1', 'b=2'],
    })

    expect(forwarded.get('set-cookie')).toBe('a=1, b=2')
  })

  it('drops hop-by-hop request headers before forwarding upstream', () => {
    const forwarded = buildProxyRequestHeaders({
      host: 'sso.timeh.my.id',
      connection: 'keep-alive',
      'content-length': '42',
      'x-request-id': 'req-1',
    })

    expect(forwarded.get('host')).toBeNull()
    expect(forwarded.get('connection')).toBeNull()
    expect(forwarded.get('content-length')).toBeNull()
    expect(forwarded.get('x-request-id')).toBe('req-1')
  })
})
