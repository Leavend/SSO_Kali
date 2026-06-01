import { describe, expect, it } from 'vitest'
import { buildAdminApiRequest } from '../admin-proxy.js'
import type { PortalSession } from '../session.js'

const session: PortalSession = {
  accessToken: 'access-token-admin',
  idToken: 'id-token',
  refreshToken: 'refresh-token',
  sub: 'sub-admin',
  subject: 'sub-admin',
  email: 'admin@example.test',
  displayName: 'Admin',
  role: 'admin',
  expiresAt: 1_900_000_000,
  authTime: null,
  amr: ['pwd'],
  acr: null,
  lastLoginAt: null,
  issuedAt: 1_800_000_000,
  absoluteExpiresAt: 1_900_000_000,
  lastRefreshedAt: 1_800_000_000,
}

describe('admin BFF API proxy', () => {
  it('maps same-origin admin API paths to backend admin paths and injects Bearer server-side', () => {
    const request = buildAdminApiRequest({
      internalBaseUrl: 'https://backend.internal',
      pathname: '/api/admin/users/sub_admin/lock',
      search: '',
      method: 'POST',
      headers: { accept: 'application/json', 'x-request-id': 'req-1' },
      session,
    })

    expect(request.url).toBe('https://backend.internal/admin/api/users/sub_admin/lock')
    expect(headers(request).get('Authorization')).toBe('Bearer access-token-admin')
    expect(headers(request).get('Accept')).toBe('application/json')
    expect(headers(request).get('X-Request-Id')).toBe('req-1')
  })

  it('keeps operational readiness mapped to the backend health endpoint', () => {
    const request = buildAdminApiRequest({
      internalBaseUrl: 'https://backend.internal/',
      pathname: '/api/admin/ops/readiness',
      search: '',
      method: 'GET',
      headers: {},
      session,
    })

    expect(request.url).toBe('https://backend.internal/ready')
  })

  it('rejects unlisted admin proxy paths before reaching the backend', () => {
    expect(() =>
      buildAdminApiRequest({
        internalBaseUrl: 'https://backend.internal',
        pathname: '/api/admin/../../token',
        search: '',
        method: 'GET',
        headers: {},
        session,
      }),
    ).toThrow('Admin API proxy path is not allowed.')
  })

  it('rejects browser-supplied Authorization headers and always uses the server token', () => {
    const request = buildAdminApiRequest({
      internalBaseUrl: 'https://backend.internal',
      pathname: '/api/admin/me',
      search: '',
      method: 'GET',
      headers: { authorization: 'Bearer browser-token' },
      session,
    })

    expect(headers(request).get('Authorization')).toBe('Bearer access-token-admin')
  })
})

function headers(request: ReturnType<typeof buildAdminApiRequest>): Headers {
  expect(request.init.headers).toBeInstanceOf(Headers)
  return request.init.headers as Headers
}
