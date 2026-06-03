import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildUserApiError } from '../user-api-error.js'
import { fetchProfile } from '../user-api.js'
import type { PortalSession } from '../session.js'

vi.mock('../config.js', () => ({
  getConfig: () => ({
    internalBaseUrl: 'https://backend.internal',
    issuer: 'https://id.dev-sso.test',
  }),
}))

function portalSession(): PortalSession {
  const now = Math.floor(Date.now() / 1000)
  return {
    accessToken: 'server-held-access-token',
    idToken: 'server-held-id-token',
    refreshToken: 'server-held-refresh-token',
    sub: 'sub_user',
    subject: 'sub_user',
    email: 'user@dev-sso.local',
    displayName: 'User',
    role: 'user',
    expiresAt: now + 3600,
    authTime: now,
    amr: ['pwd'],
    acr: 'urn:example:loa:1',
    lastLoginAt: null,
    issuedAt: now,
    absoluteExpiresAt: now + 7200,
    lastRefreshedAt: now,
  }
}

describe('user API backend correlation', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('forwards the BFF request id to profile backend calls', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ sub: 'sub_user', email: 'user@dev-sso.local' }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await fetchProfile(portalSession(), { requestId: 'bff-req-123' })

    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>
    const init = calls[0][1]
    expect(new Headers(init.headers).get('x-request-id')).toBe('bff-req-123')
    expect(new Headers(init.headers).get('accept-encoding')).toBe('identity')
  })

  it('keeps backend request id on API errors for support references', async () => {
    const response = Response.json(
      { error: 'profile_failed', message: 'Profile failed.', request_id: 'bff-req-456' },
      { status: 500, headers: { 'X-Request-Id': 'bff-req-456' } },
    )

    const error = await buildUserApiError(response)

    expect(error.requestId).toBe('bff-req-456')
  })
})
