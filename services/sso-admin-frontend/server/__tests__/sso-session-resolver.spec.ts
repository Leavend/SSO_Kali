// @vitest-environment node
// NOTE: the `// @vitest-environment node` pragma above is non-functional —
// defineVitestConfig auto-routes *.spec.ts files to the jsdom project and
// overrides per-file environment pragmas. This comment is kept for intent
// documentation only. All utils work correctly in the jsdom project.
import type { IncomingMessage } from 'node:http'
import { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PortalSession } from '../utils/session'

function requestWithCookie(cookie: string): IncomingMessage {
  const request = Readable.from([]) as Readable & { headers: Record<string, string> }
  request.headers = { cookie, 'x-request-id': 'req-admin-resolve' }
  return request as unknown as IncomingMessage
}

function requestWithNoCookie(): IncomingMessage {
  const request = Readable.from([]) as Readable & { headers: Record<string, string> }
  request.headers = {}
  return request as unknown as IncomingMessage
}

function cookieHeader(cookie: string): string {
  return cookie.split(';')[0] ?? ''
}

function baseSession(overrides: Partial<PortalSession> = {}): PortalSession {
  return {
    accessToken: 'legacy-admin-access-token',
    idToken: 'id-token',
    refreshToken: 'refresh-token',
    sub: 'sub-admin',
    subject: 'sub-admin',
    email: 'admin@example.test',
    displayName: 'Admin',
    role: 'admin',
    expiresAt: 1_780_014_000,
    authTime: 1_780_000_000,
    amr: ['pwd', 'mfa'],
    acr: 'urn:timeh:aal2',
    lastLoginAt: null,
    issuedAt: 1_780_000_000,
    absoluteExpiresAt: 1_780_086_400,
    lastRefreshedAt: 1_780_000_000,
    ...overrides,
  }
}

// unix time at system clock: 2026-05-27T00:00:00Z
const CURRENT_UNIX = 1_779_840_000

describe('admin BFF SSO session resolver', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('VITE_ADMIN_BASE_URL', 'https://admin-sso.example.test')
    vi.stubEnv('VITE_SSO_BASE_URL', 'https://api-sso.example.test')
    vi.stubEnv('ADMIN_OIDC_CLIENT_ID', 'sso-admin-panel')
    vi.stubEnv('SESSION_ENCRYPTION_SECRET', 'test-admin-session-secret-32-bytes-long')
    vi.stubEnv('SSO_ADMIN_SESSION_REDIS_URL', '')
    vi.setSystemTime(new Date('2026-05-27T00:00:00Z'))
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  // ── brief minimum: RP registration heartbeat ────────────────────────────

  it('self-heals legacy active admin sessions by registering the RP session', async () => {
    let registerRequest: RequestInit | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn<(input: string | URL, init?: RequestInit) => Promise<Response>>(async (input, init) => {
        if (input.toString() === 'https://api-sso.example.test/connect/register-session') {
          registerRequest = init
          return Response.json({ registered: true, client_id: 'sso-admin-panel' })
        }

        return new Response('not found', { status: 404 })
      }),
    )

    const { sessionCookie } = await import('../utils/session')
    const { resolveSsoSession } = await import('../utils/sso-session-resolver')
    const cookie = cookieHeader(await sessionCookie(baseSession()))

    const resolved = await resolveSsoSession(requestWithCookie(cookie))

    expect(resolved?.session.rpSessionRegisteredAt).toBe(CURRENT_UNIX)
    expect(registerRequest?.method).toBe('POST')
    expect((registerRequest?.headers as Record<string, string> | undefined)?.Authorization).toBe(
      'Bearer legacy-admin-access-token',
    )
    expect(new Headers(registerRequest?.headers).get('x-request-id')).toBe('req-admin-resolve')
  })

  it('does not re-register a recently registered admin RP session on every request', async () => {
    const fetchMock = vi.fn<() => Promise<Response>>(async () => Response.json({ registered: true }))
    vi.stubGlobal('fetch', fetchMock)

    const { sessionCookie } = await import('../utils/session')
    const { resolveSsoSession } = await import('../utils/sso-session-resolver')
    const cookie = cookieHeader(await sessionCookie(baseSession({ rpSessionRegisteredAt: 1_779_839_900 })))

    const resolved = await resolveSsoSession(requestWithCookie(cookie))

    expect(resolved?.session.rpSessionRegisteredAt).toBe(1_779_839_900)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  // ── null paths: missing / invalid cookies ───────────────────────────────

  it('returns null when the request has no session cookie', async () => {
    vi.stubGlobal('fetch', vi.fn())

    const { resolveSsoSession } = await import('../utils/sso-session-resolver')
    const resolved = await resolveSsoSession(requestWithNoCookie())

    expect(resolved).toBeNull()
  })

  it('returns null when the session cookie references a missing store record', async () => {
    vi.stubGlobal('fetch', vi.fn())

    // A valid-looking base64url session ID that was never written to the store
    const fakeId = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' // 43 A's
    const fakeCookie = `__Host-sso-admin-session=${fakeId}`

    const { resolveSsoSession } = await import('../utils/sso-session-resolver')
    const resolved = await resolveSsoSession(requestWithCookie(fakeCookie))

    expect(resolved).toBeNull()
  })

  it('returns null when the session is absolutely expired (store auto-deletes)', async () => {
    vi.stubGlobal('fetch', vi.fn())

    const { sessionCookie } = await import('../utils/session')
    const { resolveSsoSession } = await import('../utils/sso-session-resolver')

    // absoluteExpiresAt is in the past — the session store will delete and return null
    const cookie = cookieHeader(
      await sessionCookie(
        baseSession({ absoluteExpiresAt: CURRENT_UNIX - 1 }),
      ),
    )

    const resolved = await resolveSsoSession(requestWithCookie(cookie))

    expect(resolved).toBeNull()
  })

  // ── refresh path ─────────────────────────────────────────────────────────

  it('refreshes the session when the access token is within the 180-second expiry buffer', async () => {
    vi.stubEnv('ADMIN_OIDC_CLIENT_SECRET', 'test-client-secret')

    vi.stubGlobal(
      'fetch',
      vi.fn<(input: string | URL, init?: RequestInit) => Promise<Response>>(async (input) => {
        const url = input.toString()
        if (url === 'https://api-sso.example.test/token') {
          return Response.json({
            access_token: 'new-access-token',
            refresh_token: 'new-refresh-token',
            expires_in: 3600,
          })
        }
        if (url === 'https://api-sso.example.test/userinfo') {
          return Response.json({
            sub: 'sub-admin',
            email: 'admin@example.test',
            name: 'Admin',
            role: 'admin',
          })
        }
        if (url === 'https://api-sso.example.test/connect/register-session') {
          return Response.json({ registered: true })
        }
        return new Response('not found', { status: 404 })
      }),
    )

    const { sessionCookie } = await import('../utils/session')
    const { resolveSsoSession } = await import('../utils/sso-session-resolver')

    // expiresAt is 100 seconds from now — within the 180-second buffer → needs refresh
    const nearExpirySession = baseSession({ expiresAt: CURRENT_UNIX + 100 })
    const cookie = cookieHeader(await sessionCookie(nearExpirySession))

    const resolved = await resolveSsoSession(requestWithCookie(cookie))

    expect(resolved).not.toBeNull()
    expect(resolved?.session.accessToken).toBe('new-access-token')
    expect(resolved?.session.refreshToken).toBe('new-refresh-token')
    expect(resolved?.session.expiresAt).toBe(CURRENT_UNIX + 3600)
    // Refresh path always forces RP registration
    expect(resolved?.session.rpSessionRegisteredAt).toBe(CURRENT_UNIX)
    // A new cookie must be set to extend the browser session
    expect(resolved?.cookies.length).toBeGreaterThan(0)
    expect(resolved?.cookies[0]).toContain('__Host-sso-admin-session=')
  })

  // ── RP registration failure: best-effort, must not block the session ────

  it('returns the session unchanged when the RP registration request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<() => Promise<Response>>(async () => new Response('server error', { status: 500 })),
    )

    const { sessionCookie } = await import('../utils/session')
    const { resolveSsoSession } = await import('../utils/sso-session-resolver')
    const cookie = cookieHeader(await sessionCookie(baseSession()))

    const resolved = await resolveSsoSession(requestWithCookie(cookie))

    // Session is still resolved (fail-open for registration)
    expect(resolved).not.toBeNull()
    // But rpSessionRegisteredAt is NOT updated because registration failed
    expect(resolved?.session.rpSessionRegisteredAt).toBeUndefined()
    // No new cookie is issued (session was not refreshed)
    expect(resolved?.cookies).toHaveLength(0)
  })

  // ── sessionHeaders utility ───────────────────────────────────────────────

  it('sessionHeaders returns set-cookie when the resolved session carries new cookies', async () => {
    const { sessionHeaders } = await import('../utils/sso-session-resolver')

    const resolved = {
      sessionId: 'session-id',
      session: baseSession(),
      cookies: ['__Host-sso-admin-session=abc; Max-Age=604800; Path=/; HttpOnly; Secure; SameSite=Strict'],
    }

    expect(sessionHeaders(resolved)).toEqual({
      'set-cookie': resolved.cookies,
    })
  })

  it('sessionHeaders returns an empty object when the resolved session has no new cookies', async () => {
    const { sessionHeaders } = await import('../utils/sso-session-resolver')

    const resolved = {
      sessionId: 'session-id',
      session: baseSession(),
      cookies: [] as readonly string[],
    }

    expect(sessionHeaders(resolved)).toEqual({})
  })
})
