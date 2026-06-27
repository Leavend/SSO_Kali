import { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PortalSession } from '../utils/session'

// Phase 1 token-custody gate. Tokens (access/refresh/id) and the widget `sid`
// live ONLY on the server-only event.context.session. The ONLY session-derived
// value allowed to cross to the client is event.context.principalState, which
// MUST be token-free. The full SSR-render + window.__NUXT__ grep gate over a
// representative authenticated page is Task 2c.1.
//
// The middleware resolves the session through the READ-ONLY `resolveAdminSession`
// path: no token refresh, no RP-session registration, no store write, no cookie
// mint — so a cookie-carrying request must produce no network side effects.

const SENTINEL = {
  access: 'SENTINEL-ACCESS-TOKEN',
  refresh: 'SENTINEL-REFRESH-TOKEN',
  id: 'SENTINEL-ID-TOKEN',
  sid: 'SENTINEL-WIDGET-SID',
}

function sentinelSession(): PortalSession {
  return {
    accessToken: SENTINEL.access,
    idToken: SENTINEL.id,
    refreshToken: SENTINEL.refresh,
    sub: 'sub-admin',
    sid: SENTINEL.sid,
    subject: 'sub-admin',
    email: 'admin@example.test',
    displayName: 'Admin',
    role: 'admin',
    expiresAt: 4_102_444_800,
    authTime: null,
    amr: ['pwd'],
    acr: null,
    lastLoginAt: null,
    issuedAt: 1_780_000_000,
    absoluteExpiresAt: 4_102_444_800,
    lastRefreshedAt: 1_780_000_000,
  }
}

function fakeEvent(cookie: string) {
  const req = Readable.from([]) as Readable & { headers: Record<string, string> }
  req.headers = { cookie }
  return { node: { req }, context: {} } as never as {
    context: { session?: PortalSession | null; principalState?: unknown }
  }
}

describe('server-only session token custody (Phase 1)', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('SESSION_ENCRYPTION_SECRET', 'test-admin-session-secret-32-bytes-long')
    vi.stubEnv('SSO_ADMIN_SESSION_REDIS_URL', '')
    vi.stubEnv('NODE_ENV', 'test')
    vi.setSystemTime(new Date('2026-06-01T00:00:00Z'))
    // The read-only resolve must make no network calls; a stub lets us assert it.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('keeps tokens on event.context.session and exposes only a token-free principalState', async () => {
    const { sessionCookie, publicSession } = await import('../utils/session')
    const cookie = (await sessionCookie(sentinelSession())).split(';')[0]!
    const { attachSessionContext } = await import('../middleware/session')
    const event = fakeEvent(cookie)

    await attachSessionContext(event as never)

    // Server-only custody: the full tokens ARE present on the request context.
    expect(event.context.session?.accessToken).toBe(SENTINEL.access)
    expect(event.context.session?.refreshToken).toBe(SENTINEL.refresh)

    // Client projection MUST exist, MUST be token-free, and MUST equal the
    // canonical token-free view.
    expect(event.context.principalState).toBeDefined()
    expect(event.context.principalState).toEqual(publicSession(sentinelSession()))
    const serialized = JSON.stringify(event.context.principalState)
    expect(serialized).not.toContain(SENTINEL.access)
    expect(serialized).not.toContain(SENTINEL.refresh)
    expect(serialized).not.toContain(SENTINEL.id)
    expect(serialized).not.toContain(SENTINEL.sid)
    expect(serialized).not.toMatch(/accessToken|refreshToken|idToken/)

    // Read-only guarantee: resolving the session triggers no refresh/register.
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })

  it('sets principalState to null when there is no session', async () => {
    const { attachSessionContext } = await import('../middleware/session')
    const event = fakeEvent('')
    await attachSessionContext(event as never)
    expect(event.context.session).toBeNull()
    expect(event.context.principalState).toBeNull()
  })
})
