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
        pathname: '/api/admin/security-policies/password/raw-token',
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

  it('allows explicit client management routes without opening the whole admin API', () => {
    const listRequest = buildAdminApiRequest({
      internalBaseUrl: 'https://backend.internal/',
      pathname: '/api/admin/clients',
      search: '',
      method: 'GET',
      headers: { 'x-request-id': 'req-clients-1' },
      session: portalSession(),
    })
    const updateRequest = buildAdminApiRequest({
      internalBaseUrl: 'https://backend.internal/',
      pathname: '/api/admin/clients/prototype-app-a',
      search: '',
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      session: portalSession(),
    })
    const rotateRequest = buildAdminApiRequest({
      internalBaseUrl: 'https://backend.internal/',
      pathname: '/api/admin/clients/prototype-app-a/rotate-secret',
      search: '',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      session: portalSession(),
    })

    expect(listRequest.url).toBe('https://backend.internal/admin/api/clients')
    expect(updateRequest.url).toBe('https://backend.internal/admin/api/clients/prototype-app-a')
    expect(rotateRequest.url).toBe(
      'https://backend.internal/admin/api/clients/prototype-app-a/rotate-secret',
    )
    expect(() =>
      buildAdminApiRequest({
        internalBaseUrl: 'https://backend.internal/',
        pathname: '/api/admin/secrets',
        search: '',
        method: 'GET',
        headers: {},
        session: portalSession(),
      }),
    ).toThrow('Admin API proxy path is not allowed.')
  })

  it('allows explicit user lifecycle routes without opening the whole admin API', () => {
    const listRequest = buildAdminApiRequest({
      internalBaseUrl: 'https://backend.internal/',
      pathname: '/api/admin/users',
      search: '?q=admin',
      method: 'GET',
      headers: { 'x-request-id': 'req-users-1' },
      session: portalSession(),
    })
    const detailRequest = buildAdminApiRequest({
      internalBaseUrl: 'https://backend.internal/',
      pathname: '/api/admin/users/sub_admin',
      search: '',
      method: 'GET',
      headers: {},
      session: portalSession(),
    })
    const lockRequest = buildAdminApiRequest({
      internalBaseUrl: 'https://backend.internal/',
      pathname: '/api/admin/users/sub_admin/lock',
      search: '',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      session: portalSession(),
    })
    const resetMfaRequest = buildAdminApiRequest({
      internalBaseUrl: 'https://backend.internal/',
      pathname: '/api/admin/users/sub_admin/reset-mfa',
      search: '',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      session: portalSession(),
    })

    expect(listRequest.url).toBe('https://backend.internal/admin/api/users?q=admin')
    expect(detailRequest.url).toBe('https://backend.internal/admin/api/users/sub_admin')
    expect(lockRequest.url).toBe('https://backend.internal/admin/api/users/sub_admin/lock')
    expect(resetMfaRequest.url).toBe('https://backend.internal/admin/api/users/sub_admin/reset-mfa')
    expect(() =>
      buildAdminApiRequest({
        internalBaseUrl: 'https://backend.internal/',
        pathname: '/api/admin/users/sub_admin/raw-token',
        search: '',
        method: 'GET',
        headers: {},
        session: portalSession(),
      }),
    ).toThrow('Admin API proxy path is not allowed.')
  })

  it('allows explicit audit and DSR compliance routes without opening admin API', () => {
    const eventsRequest = buildAdminApiRequest({
      internalBaseUrl: 'https://backend.internal/',
      pathname: '/api/admin/audit/events',
      search: '?outcome=denied',
      method: 'GET',
      headers: { 'x-request-id': 'req-audit-1' },
      session: portalSession(),
    })
    const eventRequest = buildAdminApiRequest({
      internalBaseUrl: 'https://backend.internal/',
      pathname: '/api/admin/audit/events/AUD01',
      search: '',
      method: 'GET',
      headers: {},
      session: portalSession(),
    })
    const authAuditRequest = buildAdminApiRequest({
      internalBaseUrl: 'https://backend.internal/',
      pathname: '/api/admin/audit/authentication-events',
      search: '?event_type=refresh_token_reuse_detected',
      method: 'GET',
      headers: {},
      session: portalSession(),
    })
    const authAuditDetailRequest = buildAdminApiRequest({
      internalBaseUrl: 'https://backend.internal/',
      pathname: '/api/admin/audit/authentication-events/AUTH01',
      search: '',
      method: 'GET',
      headers: {},
      session: portalSession(),
    })
    const integrityRequest = buildAdminApiRequest({
      internalBaseUrl: 'https://backend.internal/',
      pathname: '/api/admin/audit/integrity',
      search: '',
      method: 'GET',
      headers: {},
      session: portalSession(),
    })
    const dsrRequest = buildAdminApiRequest({
      internalBaseUrl: 'https://backend.internal/',
      pathname: '/api/admin/data-subject-requests',
      search: '?status=submitted',
      method: 'GET',
      headers: {},
      session: portalSession(),
    })
    const reviewRequest = buildAdminApiRequest({
      internalBaseUrl: 'https://backend.internal/',
      pathname: '/api/admin/data-subject-requests/01HX7S8Y9ZABCDEF1234567890/review',
      search: '',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      session: portalSession(),
    })

    expect(eventsRequest.url).toBe('https://backend.internal/admin/api/audit/events?outcome=denied')
    expect(eventRequest.url).toBe('https://backend.internal/admin/api/audit/events/AUD01')
    expect(authAuditRequest.url).toBe(
      'https://backend.internal/admin/api/audit/authentication-events?event_type=refresh_token_reuse_detected',
    )
    expect(authAuditDetailRequest.url).toBe(
      'https://backend.internal/admin/api/audit/authentication-events/AUTH01',
    )
    expect(integrityRequest.url).toBe('https://backend.internal/admin/api/audit/integrity')
    expect(dsrRequest.url).toBe('https://backend.internal/admin/api/data-subject-requests?status=submitted')
    expect(reviewRequest.url).toBe(
      'https://backend.internal/admin/api/data-subject-requests/01HX7S8Y9ZABCDEF1234567890/review',
    )
    expect(() =>
      buildAdminApiRequest({
        internalBaseUrl: 'https://backend.internal/',
        pathname: '/api/admin/audit/raw-token',
        search: '',
        method: 'GET',
        headers: {},
        session: portalSession(),
      }),
    ).toThrow('Admin API proxy path is not allowed.')
  })

  it('allows explicit policy and RBAC routes without opening admin API', () => {
    const policyRequest = buildAdminApiRequest({
      internalBaseUrl: 'https://backend.internal/',
      pathname: '/api/admin/security-policies/password',
      search: '',
      method: 'GET',
      headers: { 'x-request-id': 'req-policy-1' },
      session: portalSession(),
    })
    const draftRequest = buildAdminApiRequest({
      internalBaseUrl: 'https://backend.internal/',
      pathname: '/api/admin/security-policies/password',
      search: '',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      session: portalSession(),
    })
    const activateRequest = buildAdminApiRequest({
      internalBaseUrl: 'https://backend.internal/',
      pathname: '/api/admin/security-policies/password/2/activate',
      search: '',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      session: portalSession(),
    })
    const rolesRequest = buildAdminApiRequest({
      internalBaseUrl: 'https://backend.internal/',
      pathname: '/api/admin/roles/auditor-lite/permissions',
      search: '',
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      session: portalSession(),
    })

    expect(policyRequest.url).toBe('https://backend.internal/admin/api/security-policies/password')
    expect(draftRequest.url).toBe('https://backend.internal/admin/api/security-policies/password')
    expect(activateRequest.url).toBe(
      'https://backend.internal/admin/api/security-policies/password/2/activate',
    )
    expect(rolesRequest.url).toBe('https://backend.internal/admin/api/roles/auditor-lite/permissions')
    expect(() =>
      buildAdminApiRequest({
        internalBaseUrl: 'https://backend.internal/',
        pathname: '/api/admin/security-policies/password/raw-token',
        search: '',
        method: 'GET',
        headers: {},
        session: portalSession(),
      }),
    ).toThrow('Admin API proxy path is not allowed.')
  })

  it('allows explicit ops readiness route without opening admin API', () => {
    const request = buildAdminApiRequest({
      internalBaseUrl: 'https://backend.internal/',
      pathname: '/api/admin/ops/readiness',
      search: '',
      method: 'GET',
      headers: { 'x-request-id': 'req-ops-1' },
      session: portalSession(),
    })

    expect(request.url).toBe('https://backend.internal/ready')
    expect(() =>
      buildAdminApiRequest({
        internalBaseUrl: 'https://backend.internal/',
        pathname: '/api/admin/ops/metrics-token',
        search: '',
        method: 'GET',
        headers: {},
        session: portalSession(),
      }),
    ).toThrow('Admin API proxy path is not allowed.')
  })

  it('allows explicit external IdP federation routes without opening admin API', () => {
    const listRequest = buildAdminApiRequest({
      internalBaseUrl: 'https://backend.internal/',
      pathname: '/api/admin/external-idps',
      search: '',
      method: 'GET',
      headers: { 'x-request-id': 'req-idp-1' },
      session: portalSession(),
    })
    const updateRequest = buildAdminApiRequest({
      internalBaseUrl: 'https://backend.internal/',
      pathname: '/api/admin/external-idps/google',
      search: '',
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      session: portalSession(),
    })
    const previewRequest = buildAdminApiRequest({
      internalBaseUrl: 'https://backend.internal/',
      pathname: '/api/admin/external-idps/google/mapping-preview',
      search: '',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      session: portalSession(),
    })
    const deleteRequest = buildAdminApiRequest({
      internalBaseUrl: 'https://backend.internal/',
      pathname: '/api/admin/external-idps/google',
      search: '',
      method: 'DELETE',
      headers: {},
      session: portalSession(),
    })

    expect(listRequest.url).toBe('https://backend.internal/admin/api/external-idps')
    expect(updateRequest.url).toBe('https://backend.internal/admin/api/external-idps/google')
    expect(previewRequest.url).toBe(
      'https://backend.internal/admin/api/external-idps/google/mapping-preview',
    )
    expect(deleteRequest.url).toBe('https://backend.internal/admin/api/external-idps/google')
    expect(() =>
      buildAdminApiRequest({
        internalBaseUrl: 'https://backend.internal/',
        pathname: '/api/admin/external-idps/google/raw-token',
        search: '',
        method: 'GET',
        headers: {},
        session: portalSession(),
      }),
    ).toThrow('Admin API proxy path is not allowed.')
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
