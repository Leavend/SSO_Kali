import type { IncomingMessage } from 'node:http'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { handleAdminApi, handleSession } from '../server/admin-handlers'
import { handleLogout, handleRefresh } from '../server/auth-handlers'
import { sessionCookie } from '../server/session'
import type { AdminSession } from '../server/session'

describe('admin BFF session refresh boundary', () => {
  beforeEach(() => {
    process.env.SESSION_ENCRYPTION_SECRET = 'test-secret-with-more-than-32-characters'
    process.env.SSO_INTERNAL_BASE_URL = 'https://sso.internal'
    process.env.SSO_INTERNAL_TOKEN_URL = 'https://sso.internal/token'
    process.env.SSO_INTERNAL_ADMIN_API_URL = 'https://sso.internal/admin/api'
    process.env.VITE_ADMIN_BASE_URL = 'https://dev-sso.timeh.my.id'
    process.env.VITE_CLIENT_ID = 'sso-admin-panel'
    delete process.env.ADMIN_SESSION_IDLE_TTL_SECONDS
    delete process.env.ADMIN_SESSION_ABSOLUTE_TTL_SECONDS
    delete process.env.ADMIN_FRESH_AUTH_TTL_SECONDS
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('silently refreshes an expired access token before reading admin session', async () => {
    vi.stubGlobal('fetch', tokenFetch())

    const response = await handleSession(requestWithSession(expiredSession()))
    const payload = JSON.parse(String(response.body)) as { readonly principal: { readonly expiresAt: number } }

    expect(response.status).toBe(200)
    expect(payload.principal.expiresAt).toBeGreaterThan(now())
    expect(serializedCookies(response)).toContain('__Secure-admin-session=')
  })

  it('refreshes before proxying admin APIs so the session list remains reachable', async () => {
    const fetchMock = tokenThenAdminFetch({ sessions: [] })
    vi.stubGlobal('fetch', fetchMock)

    const response = await handleAdminApi({
      request: requestWithSession(expiredSession(), 'GET'),
      requestUrl: new URL('https://dev-sso.timeh.my.id/api/admin/sessions'),
    })

    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://sso.internal/admin/api/sessions',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer fresh-access' }) }),
    )
  })

  it('refreshes expired access before global logout fanout', async () => {
    const fetchMock = logoutFetch()
    vi.stubGlobal('fetch', fetchMock)

    const response = await handleLogout(requestWithSession(expiredSession()))

    expect(response.status).toBe(302)
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://sso.internal/connect/logout',
      expect.objectContaining({ headers: { Authorization: 'Bearer fresh-access' } }),
    )
  })

  it('refresh endpoint accepts refreshable cookies even after access expiry', async () => {
    vi.stubGlobal('fetch', tokenFetch())

    const response = await handleRefresh(requestWithSession(expiredSession(), 'POST'))

    expect(response.status).toBe(200)
    expect(JSON.parse(String(response.body))).toMatchObject({ status: 'refreshed' })
  })

  it('does not rotate refresh tokens while the access token is still fresh', async () => {
    const fetchMock = tokenFetch()
    vi.stubGlobal('fetch', fetchMock)

    const response = await handleRefresh(requestWithSession(freshSession(), 'POST'))

    expect(response.status).toBe(200)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(serializedCookies(response)).toContain('Max-Age=604800')
  })

  it('keeps refreshed admin sessions usable beyond short access-token windows', async () => {
    vi.stubGlobal('fetch', tokenFetch())

    const response = await handleSession(requestWithSession(sessionWithOlderAuth()))

    expect(response.status).toBe(200)
    expect(JSON.parse(String(response.body))).toMatchObject({ principal: { email: 'huanamasi123@gmail.com' } })
  })
})

function requestWithSession(session: AdminSession, method = 'GET'): IncomingMessage {
  return { headers: { cookie: sessionCookie(session) }, method } as IncomingMessage
}

function expiredSession(): AdminSession {
  const issuedAt = now() - 3600

  return {
    accessToken: 'expired-access',
    idToken: 'id-token',
    refreshToken: 'refresh-token',
    sub: 'user-1',
    subject: 'user-1',
    email: 'huanamasi123@gmail.com',
    displayName: 'Tio Pranoto',
    role: 'admin',
    expiresAt: now() - 60,
    authTime: now() - 60,
    amr: ['pwd', 'otp'],
    acr: null,
    lastLoginAt: null,
    permissions: { view_admin_panel: true, manage_sessions: true },
    issuedAt,
    absoluteExpiresAt: issuedAt + 60 * 60 * 24 * 30,
    lastRefreshedAt: issuedAt,
  }
}

function freshSession(): AdminSession {
  return {
    ...expiredSession(),
    accessToken: 'fresh-access',
    expiresAt: now() + 900,
  }
}

function sessionWithOlderAuth(): AdminSession {
  return {
    ...expiredSession(),
    authTime: now() - 60 * 60 * 4,
  }
}

function tokenFetch(): ReturnType<typeof vi.fn> {
  return vi.fn(async () => jsonResponse({ access_token: 'fresh-access', refresh_token: 'fresh-refresh', expires_in: 900 }))
}

function tokenThenAdminFetch(payload: unknown): ReturnType<typeof vi.fn> {
  return vi.fn(async (input: string | URL | Request) => {
    if (String(input).endsWith('/token')) return jsonResponse({ access_token: 'fresh-access', expires_in: 900 })
    return jsonResponse(payload)
  })
}

function logoutFetch(): ReturnType<typeof vi.fn> {
  return vi.fn(async (input: string | URL | Request) => {
    if (String(input).endsWith('/token')) return jsonResponse({ access_token: 'fresh-access', expires_in: 900 })
    return new Response(null, { status: 204 })
  })
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } })
}

function serializedCookies(response: { readonly headers?: Record<string, unknown> }): string {
  const cookies = response.headers?.['set-cookie']
  return Array.isArray(cookies) ? cookies.join(';') : String(cookies)
}

function now(): number {
  return Math.floor(Date.now() / 1000)
}
