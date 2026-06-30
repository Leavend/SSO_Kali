// @vitest-environment node
import type { H3Event } from 'h3'
import { describe, expect, it } from 'vitest'
import {
  html,
  json,
  methodNotAllowed,
  redirect,
  sendAppResponse,
  text,
  unauthorized,
} from '../utils/response'

function mockEvent() {
  const headers: Record<string, unknown> = {}
  const res = {
    statusCode: 0,
    setHeader(name: string, value: unknown) {
      headers[name] = value
    },
    end(body?: unknown) {
      ;(this as Record<string, unknown>).body = body
    },
  }
  const event = { node: { res } } as unknown as H3Event
  return { event, res: res as typeof res & { body?: unknown }, headers }
}

describe('admin BFF response builders', () => {
  it('builds a no-store JSON response', () => {
    const r = json(200, { ok: true })
    expect(r.status).toBe(200)
    expect(r.headers?.['content-type']).toBe('application/json; charset=utf-8')
    expect(r.headers?.['cache-control']).toBe('no-store, no-cache, private, max-age=0')
    expect(r.body).toBe('{"ok":true}')
  })

  it('builds text and html responses with the right content types', () => {
    expect(text(200, 'ok\n').headers?.['content-type']).toBe('text/plain; charset=utf-8')
    expect(html(200, '<p>').headers?.['content-type']).toBe('text/html; charset=utf-8')
  })

  it('builds a 302 redirect carrying Set-Cookie entries', () => {
    const r = redirect('/dashboard', ['__Host-sso-admin-session=x'])
    expect(r.status).toBe(302)
    expect(r.headers?.location).toBe('/dashboard')
    expect(r.headers?.['set-cookie']).toEqual(['__Host-sso-admin-session=x'])
  })

  it('exposes canonical 405 and 401 error responses', () => {
    expect(methodNotAllowed().status).toBe(405)
    expect(unauthorized().status).toBe(401)
    expect(JSON.parse(unauthorized().body as string)).toEqual({
      error: 'no_session',
      message: 'No active SSO session.',
    })
  })

  it('sendAppResponse writes status, security headers, multi Set-Cookie and body to the H3 event', () => {
    const { event, res, headers } = mockEvent()
    sendAppResponse(event, json(200, { ok: true }, { 'set-cookie': ['a=1', 'b=2'] }))

    expect(res.statusCode).toBe(200)
    expect(headers['content-type']).toBe('application/json; charset=utf-8')
    expect(headers['set-cookie']).toEqual(['a=1', 'b=2'])
    expect(headers['x-content-type-options']).toBe('nosniff')
    expect(headers['content-security-policy']).toContain("default-src 'self'")
    expect(res.body).toBe('{"ok":true}')
  })
})
