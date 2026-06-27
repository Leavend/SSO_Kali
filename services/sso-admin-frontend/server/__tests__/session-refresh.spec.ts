// @vitest-environment node
// NOTE: the `// @vitest-environment node` pragma above is non-functional —
// defineVitestConfig auto-routes *.spec.ts files to the jsdom project and
// overrides per-file environment pragmas. The jsdom project has access to
// node:crypto and global fetch, so all tests run correctly as-is.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PortalSession } from '../utils/session'

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
    vi.stubEnv('ADMIN_OIDC_CLIENT_SECRET', 'admin-bff-secret')
    vi.stubEnv('SESSION_ENCRYPTION_SECRET', 'test-admin-session-secret-32-bytes-long')
    vi.stubEnv('SSO_ADMIN_SESSION_REDIS_URL', '')
    vi.setSystemTime(new Date('2026-06-03T03:00:00Z'))
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  // ---------------------------------------------------------------------------
  // Brief-specified tests (ported 1:1, paths rebased to ../utils/)
  // ---------------------------------------------------------------------------

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

    const { refreshPortalSession } = await import('../utils/session-refresh')
    const refreshed = await refreshPortalSession(baseSession, { requestId: 'req-refresh' })

    expect(refreshed.accessToken).toBe('new-access-token')
    expect(refreshed.role).toBe('admin')
    expect(new URLSearchParams(String(calls[0]?.init?.body)).get('client_secret')).toBe(
      'admin-bff-secret',
    )
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

    const { refreshPortalSession } = await import('../utils/session-refresh')
    const refreshed = await refreshPortalSession(baseSession, { requestId: 'req-refresh' })

    expect(refreshed.accessToken).toBe('new-access-token')
    expect(refreshed.role).toBe('user')
  })

  // ---------------------------------------------------------------------------
  // sessionNeedsRefresh — default 180-second buffer
  // ---------------------------------------------------------------------------

  describe('sessionNeedsRefresh', () => {
    it('returns true when expiresAt is within the default 180-second buffer', async () => {
      const { sessionNeedsRefresh } = await import('../utils/session-refresh')
      const { unixTime } = await import('../utils/session')
      const now = unixTime()
      // Within 180s → should refresh
      const session = { ...baseSession, expiresAt: now + 100 }
      expect(sessionNeedsRefresh(session)).toBe(true)
    })

    it('returns false when expiresAt is beyond the default 180-second buffer', async () => {
      const { sessionNeedsRefresh } = await import('../utils/session-refresh')
      const { unixTime } = await import('../utils/session')
      const now = unixTime()
      // 300s in the future → beyond 180s buffer → no refresh needed
      const session = { ...baseSession, expiresAt: now + 300 }
      expect(sessionNeedsRefresh(session)).toBe(false)
    })

    it('uses a custom buffer when provided', async () => {
      const { sessionNeedsRefresh } = await import('../utils/session-refresh')
      const { unixTime } = await import('../utils/session')
      const now = unixTime()
      const session = { ...baseSession, expiresAt: now + 200 }
      // buffer 100 → 200s remaining > 100s buffer → false (no refresh)
      expect(sessionNeedsRefresh(session, 100)).toBe(false)
      // buffer 250 → 200s remaining < 250s buffer → true (refresh needed)
      expect(sessionNeedsRefresh(session, 250)).toBe(true)
    })

    it('returns true for an already-expired session', async () => {
      const { sessionNeedsRefresh } = await import('../utils/session-refresh')
      const session = { ...baseSession, expiresAt: 1_000_000 } // long in the past
      expect(sessionNeedsRefresh(session)).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // refreshPortalSession — success path: token + expiry + rotation
  // ---------------------------------------------------------------------------

  describe('refreshPortalSession success path', () => {
    it('persists the new access token and recomputes expiresAt from now + expires_in', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: string | URL) => {
          const url = input.toString()
          if (url === 'https://api-sso.example.test/token') {
            return Response.json({ access_token: 'brand-new-token', expires_in: 3600 })
          }
          if (url === 'https://api-sso.example.test/userinfo') {
            return Response.json({ sub: 'sub-admin', roles: ['user'] })
          }
          return new Response('', { status: 404 })
        }),
      )

      const { refreshPortalSession } = await import('../utils/session-refresh')
      const { unixTime } = await import('../utils/session')
      const now = unixTime()
      const refreshed = await refreshPortalSession(baseSession)

      expect(refreshed.accessToken).toBe('brand-new-token')
      // expiresAt = now (frozen by setSystemTime) + 3600
      expect(refreshed.expiresAt).toBe(now + 3600)
      expect(refreshed.lastRefreshedAt).toBe(now)
    })

    it('rotates the refresh token when the backend returns a new one', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: string | URL) => {
          const url = input.toString()
          if (url === 'https://api-sso.example.test/token') {
            return Response.json({
              access_token: 'new-access',
              refresh_token: 'rotated-refresh-token',
              expires_in: 3600,
            })
          }
          if (url === 'https://api-sso.example.test/userinfo') {
            return Response.json({ sub: 'sub-admin', roles: ['user'] })
          }
          return new Response('', { status: 404 })
        }),
      )

      const { refreshPortalSession } = await import('../utils/session-refresh')
      const refreshed = await refreshPortalSession(baseSession)

      expect(refreshed.refreshToken).toBe('rotated-refresh-token')
    })

    it('preserves the existing refresh token when the backend does not return a new one', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: string | URL) => {
          const url = input.toString()
          if (url === 'https://api-sso.example.test/token') {
            // No refresh_token field → caller should keep the old one
            return Response.json({ access_token: 'new-access', expires_in: 3600 })
          }
          if (url === 'https://api-sso.example.test/userinfo') {
            return Response.json({ sub: 'sub-admin', roles: ['user'] })
          }
          return new Response('', { status: 404 })
        }),
      )

      const { refreshPortalSession } = await import('../utils/session-refresh')
      const refreshed = await refreshPortalSession(baseSession)

      expect(refreshed.refreshToken).toBe('refresh-token') // original preserved
    })

    it('sends the old refresh token, grant_type, and client_id to the token endpoint', async () => {
      let capturedBody: string | null = null
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: string | URL, init?: RequestInit) => {
          const url = input.toString()
          if (url === 'https://api-sso.example.test/token') {
            capturedBody = String(init?.body ?? '')
            return Response.json({ access_token: 'new-access', expires_in: 3600 })
          }
          if (url === 'https://api-sso.example.test/userinfo') {
            return Response.json({ sub: 'sub-admin', roles: ['user'] })
          }
          return new Response('', { status: 404 })
        }),
      )

      const { refreshPortalSession } = await import('../utils/session-refresh')
      await refreshPortalSession(baseSession, { requestId: 'req-body-check' })

      const params = new URLSearchParams(capturedBody!)
      expect(params.get('grant_type')).toBe('refresh_token')
      expect(params.get('refresh_token')).toBe('refresh-token')
      expect(params.get('client_id')).toBe('sso-admin-panel')
    })

    it('forwards the X-Request-Id header to both token and userinfo endpoints', async () => {
      const headers: Array<Headers> = []
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: string | URL, init?: RequestInit) => {
          const url = input.toString()
          headers.push(new Headers(init?.headers))
          if (url === 'https://api-sso.example.test/token') {
            return Response.json({ access_token: 'new-access', expires_in: 3600 })
          }
          if (url === 'https://api-sso.example.test/userinfo') {
            return Response.json({ sub: 'sub-admin', roles: ['user'] })
          }
          return new Response('', { status: 404 })
        }),
      )

      const { refreshPortalSession } = await import('../utils/session-refresh')
      await refreshPortalSession(baseSession, { requestId: 'req-hdr-check' })

      // First call is to the token endpoint
      expect(headers[0]?.get('x-request-id')).toBe('req-hdr-check')
      // Second call is to userinfo
      expect(headers[1]?.get('x-request-id')).toBe('req-hdr-check')
    })

    it('omits X-Request-Id when no context is provided', async () => {
      let capturedHeaders: Headers | null = null
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: string | URL, init?: RequestInit) => {
          const url = input.toString()
          if (url === 'https://api-sso.example.test/token') {
            capturedHeaders = new Headers(init?.headers)
            return Response.json({ access_token: 'token-no-ctx', expires_in: 1800 })
          }
          if (url === 'https://api-sso.example.test/userinfo') {
            return Response.json({ sub: 'sub-admin', roles: ['user'] })
          }
          return new Response('', { status: 404 })
        }),
      )

      const { refreshPortalSession } = await import('../utils/session-refresh')
      const refreshed = await refreshPortalSession(baseSession) // no context

      expect(refreshed.accessToken).toBe('token-no-ctx')
      expect(capturedHeaders!.get('x-request-id')).toBeNull()
    })

    it('preserves all unmodified session fields after refresh', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: string | URL) => {
          const url = input.toString()
          if (url === 'https://api-sso.example.test/token') {
            return Response.json({ access_token: 'new-access', expires_in: 3600 })
          }
          if (url === 'https://api-sso.example.test/userinfo') {
            return Response.json({ sub: 'sub-admin', roles: ['user'] })
          }
          return new Response('', { status: 404 })
        }),
      )

      const { refreshPortalSession } = await import('../utils/session-refresh')
      const refreshed = await refreshPortalSession(baseSession)

      // Fields that must be unchanged
      expect(refreshed.sub).toBe('sub-admin')
      expect(refreshed.email).toBe('admin@example.test')
      expect(refreshed.displayName).toBe('Admin')
      expect(refreshed.idToken).toBe('id-token')
      expect(refreshed.amr).toEqual(['pwd'])
      expect(refreshed.absoluteExpiresAt).toBe(1_900_000_000)
      expect(refreshed.issuedAt).toBe(1_700_000_000)
    })
  })

  // ---------------------------------------------------------------------------
  // refreshPortalSession — failure path (fail-closed)
  // ---------------------------------------------------------------------------

  describe('refreshPortalSession failure path', () => {
    it('throws when the token endpoint returns 400 (invalid_grant)', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: string | URL) => {
          const url = input.toString()
          if (url === 'https://api-sso.example.test/token') {
            return new Response(
              JSON.stringify({
                error: 'invalid_grant',
                error_description: 'Refresh token expired.',
              }),
              { status: 400, headers: { 'content-type': 'application/json' } },
            )
          }
          return new Response('not found', { status: 404 })
        }),
      )

      const { refreshPortalSession } = await import('../utils/session-refresh')
      await expect(refreshPortalSession(baseSession)).rejects.toThrow('Refresh failed: HTTP 400')
    })

    it('throws when the token endpoint returns 401', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: string | URL) => {
          const url = input.toString()
          if (url === 'https://api-sso.example.test/token') {
            return new Response('Unauthorized', { status: 401 })
          }
          return new Response('not found', { status: 404 })
        }),
      )

      const { refreshPortalSession } = await import('../utils/session-refresh')
      await expect(refreshPortalSession(baseSession)).rejects.toThrow('Refresh failed: HTTP 401')
    })

    it('throws when ADMIN_OIDC_CLIENT_SECRET is not configured (fail-closed)', async () => {
      // Override the client secret to empty — env() returns undefined for empty strings
      vi.stubEnv('ADMIN_OIDC_CLIENT_SECRET', '')

      const { refreshPortalSession } = await import('../utils/session-refresh')
      await expect(refreshPortalSession(baseSession)).rejects.toThrow(
        'ADMIN_OIDC_CLIENT_SECRET is required',
      )
    })

    it('does not expose the raw refresh token in the error message on failure (no token leak)', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: string | URL) => {
          const url = input.toString()
          if (url === 'https://api-sso.example.test/token') {
            return new Response('Bad request', { status: 400 })
          }
          return new Response('not found', { status: 404 })
        }),
      )

      const { refreshPortalSession } = await import('../utils/session-refresh')
      let error: Error | null = null
      try {
        await refreshPortalSession(baseSession)
      } catch (e) {
        error = e as Error
      }

      expect(error).not.toBeNull()
      // The thrown error must NOT contain the raw refresh token or old access token
      expect(error!.message).not.toContain('refresh-token')
      expect(error!.message).not.toContain('old-access-token')
    })

    it('does not call userinfo when the token endpoint fails', async () => {
      let userinfoCalled = false
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: string | URL) => {
          const url = input.toString()
          if (url === 'https://api-sso.example.test/token') {
            return new Response('Service Unavailable', { status: 503 })
          }
          if (url === 'https://api-sso.example.test/userinfo') {
            userinfoCalled = true
            return Response.json({ sub: 'sub-admin' })
          }
          return new Response('not found', { status: 404 })
        }),
      )

      const { refreshPortalSession } = await import('../utils/session-refresh')
      await expect(refreshPortalSession(baseSession)).rejects.toThrow('Refresh failed')
      expect(userinfoCalled).toBe(false)
    })
  })
})
