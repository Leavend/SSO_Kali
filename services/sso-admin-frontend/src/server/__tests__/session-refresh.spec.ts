import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PortalSession } from '../session.js'

const baseSession: PortalSession = {
  accessToken: 'old-access-token',
  idToken: 'id-token',
  refreshToken: 'refresh-token',
  sub: 'sub-admin',
  subject: 'sub-admin',
  email: 'admin@example.test',
  displayName: 'Admin',
  role: 'user',
  expiresAt: 1_800_000_000,
  authTime: null,
  amr: ['pwd'],
  acr: null,
  lastLoginAt: null,
  issuedAt: 1_700_000_000,
  absoluteExpiresAt: 1_900_000_000,
  lastRefreshedAt: 1_700_000_000,
}

describe('admin BFF session refresh', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('VITE_ADMIN_BASE_URL', 'https://admin-sso.example.test')
    vi.stubEnv('VITE_SSO_BASE_URL', 'https://api-sso.example.test')
    vi.stubEnv('ADMIN_OIDC_CLIENT_ID', 'sso-admin-panel')
    vi.stubEnv('SESSION_ENCRYPTION_SECRET', 'test-admin-session-secret-32-bytes-long')
    vi.stubEnv('SSO_ADMIN_SESSION_REDIS_URL', '')
    vi.setSystemTime(new Date('2026-06-03T03:00:00Z'))
  })

  it('refreshes the cached session role from userinfo after token refresh', async () => {
    const calls: Array<{ readonly url: string; readonly init?: RequestInit }> = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = input.toString()
        calls.push({ url, init })
        if (url === 'https://api-sso.example.test/token') {
          return Response.json({ access_token: 'new-access-token', expires_in: 3600 })
        }
        if (url === 'https://api-sso.example.test/userinfo') {
          return Response.json({ sub: 'sub-admin', email: 'admin@example.test', roles: ['admin'] })
        }
        return new Response('not found', { status: 404 })
      }),
    )

    const { refreshPortalSession } = await import('../session-refresh.js')
    const refreshed = await refreshPortalSession(baseSession, { requestId: 'req-refresh' })

    expect(refreshed.accessToken).toBe('new-access-token')
    expect(refreshed.role).toBe('admin')
    expect(new Headers(calls[0]?.init?.headers).get('accept-encoding')).toBe('identity')
    expect(new Headers(calls[1]?.init?.headers).get('accept-encoding')).toBe('identity')
  })

  it('keeps the cached session role when userinfo refresh fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = input.toString()
        if (url === 'https://api-sso.example.test/token') {
          return Response.json({ access_token: 'new-access-token', expires_in: 3600 })
        }
        if (url === 'https://api-sso.example.test/userinfo') {
          return new Response('unavailable', { status: 503 })
        }
        return new Response('not found', { status: 404 })
      }),
    )

    const { refreshPortalSession } = await import('../session-refresh.js')
    const refreshed = await refreshPortalSession(baseSession, { requestId: 'req-refresh' })

    expect(refreshed.accessToken).toBe('new-access-token')
    expect(refreshed.role).toBe('user')
  })
})
