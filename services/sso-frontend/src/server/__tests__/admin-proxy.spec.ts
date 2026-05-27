import type { IncomingMessage } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import { buildAdminApiRequest, handleAdminApiProxy } from '../admin-proxy.js'
import { clearSessionCookie } from '../session.js'
import { resolveSsoSession } from '../sso-session-resolver.js'
import type { AdminApiRequest } from '../admin-proxy.js'
import type { PortalSession } from '../session.js'

vi.mock('../sso-session-resolver.js', () => ({
  resolveSsoSession: vi.fn(),
  sessionHeaders: vi.fn(() => ({})),
}))

vi.mock('../session.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../session.js')>()
  return {
    ...actual,
    clearSessionCookie: vi.fn(async () => ['__Host-sso-portal-session=; Max-Age=0']),
  }
})

function requestHeaders(request: AdminApiRequest): Headers {
  expect(request.init.headers).toBeInstanceOf(Headers)
  return request.init.headers as Headers
}

function portalSession(): PortalSession {
  const now = Math.floor(Date.now() / 1000)
  return {
    accessToken: 'server-held-admin-access-token',
    idToken: 'server-held-id-token',
    refreshToken: 'server-held-refresh-token',
    sub: 'sub_admin',
    subject: 'sub_admin',
    email: 'admin@dev-sso.local',
    displayName: 'Admin User',
    role: 'admin',
    expiresAt: now + 3600,
    authTime: now,
    amr: ['pwd', 'mfa'],
    acr: 'urn:example:loa:2',
    lastLoginAt: new Date(now * 1000).toISOString(),
    issuedAt: now,
    absoluteExpiresAt: now + 7200,
    lastRefreshedAt: now,
  }
}

describe('buildAdminApiRequest', () => {
  it('targets backend admin API and injects the server-side access token', () => {
    const request = buildAdminApiRequest({
      internalBaseUrl: 'https://backend.internal/',
      pathname: '/api/admin/oidc-foundation',
      search: '?refresh=0',
      method: 'GET',
      headers: {
        cookie: '__Host-sso-portal-session=opaque-session-id',
        authorization: 'Bearer browser-supplied-token',
        'x-request-id': 'req-admin-1',
      },
      session: portalSession(),
    })

    const headers = requestHeaders(request)

    expect(request.url).toBe('https://backend.internal/admin/api/oidc-foundation?refresh=0')
    expect(request.init.method).toBe('GET')
    expect(headers.get('authorization')).toBe('Bearer server-held-admin-access-token')
    expect(headers.get('cookie')).toBeNull()
    expect(headers.get('x-request-id')).toBe('req-admin-1')
  })

  it('rejects paths outside the admin BFF namespace', () => {
    expect(() =>
      buildAdminApiRequest({
        internalBaseUrl: 'https://backend.internal',
        pathname: '/admin/api/me',
        search: '',
        method: 'GET',
        headers: {},
        session: portalSession(),
      }),
    ).toThrow('Invalid admin API proxy path.')
  })

  it('rejects write methods for the read-only OIDC Foundation proxy surface', () => {
    expect(() =>
      buildAdminApiRequest({
        internalBaseUrl: 'https://backend.internal',
        pathname: '/api/admin/oidc-foundation',
        search: '',
        method: 'POST',
        headers: {},
        session: portalSession(),
      }),
    ).toThrow('Admin API proxy method is not allowed.')
  })

  it('rejects backend admin paths outside the explicit allowlist', () => {
    expect(() =>
      buildAdminApiRequest({
        internalBaseUrl: 'https://backend.internal',
        pathname: '/api/admin/users',
        search: '',
        method: 'GET',
        headers: {},
        session: portalSession(),
      }),
    ).toThrow('Admin API proxy path is not allowed.')
  })

  it('allows the read-only dashboard summary endpoint', () => {
    const request = buildAdminApiRequest({
      internalBaseUrl: 'https://backend.internal/',
      pathname: '/api/admin/dashboard/summary',
      search: '',
      method: 'GET',
      headers: { 'x-request-id': 'req-dashboard-1' },
      session: portalSession(),
    })

    const headers = requestHeaders(request)

    expect(request.url).toBe('https://backend.internal/admin/api/dashboard/summary')
    expect(request.init.method).toBe('GET')
    expect(headers.get('authorization')).toBe('Bearer server-held-admin-access-token')
    expect(headers.get('x-request-id')).toBe('req-dashboard-1')
  })

  it('forwards only safe admin proxy request headers', () => {
    const request = buildAdminApiRequest({
      internalBaseUrl: 'https://backend.internal',
      pathname: '/api/admin/me',
      search: '',
      method: 'GET',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'x-request-id': 'req-admin-2',
        forwarded: 'for=203.0.113.1;proto=https',
        'x-forwarded-for': '203.0.113.1',
        'x-real-ip': '203.0.113.1',
      },
      session: portalSession(),
    })

    const headers = requestHeaders(request)

    expect(headers.get('x-request-id')).toBe('req-admin-2')
    expect(headers.get('forwarded')).toBeNull()
    expect(headers.get('x-forwarded-for')).toBeNull()
    expect(headers.get('x-real-ip')).toBeNull()
  })
})

describe('handleAdminApiProxy', () => {
  it('returns controlled 401 JSON when BFF session refresh fails', async () => {
    vi.mocked(resolveSsoSession).mockRejectedValue(new Error('refresh failed with provider body'))

    const response = await handleAdminApiProxy({
      request: {
        method: 'GET',
        headers: { cookie: '__Host-sso-portal-session=session-id' },
      } as IncomingMessage,
      requestUrl: new URL('https://sso.test/api/admin/oidc-foundation'),
    })

    expect(response.status).toBe(401)
    expect(response.headers?.['set-cookie']).toEqual(['__Host-sso-portal-session=; Max-Age=0'])
    expect(response.body?.toString()).toContain('no_session')
    expect(clearSessionCookie).toHaveBeenCalled()
  })
})
