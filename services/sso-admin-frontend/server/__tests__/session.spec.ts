// @vitest-environment node
// NOTE: the `// @vitest-environment node` pragma above is non-functional —
// defineVitestConfig auto-routes *.spec.ts files to the jsdom project and
// overrides per-file environment pragmas. This comment is kept for intent
// documentation only. node:crypto is available in the jsdom project so AES-
// 256-GCM operations work correctly without a node environment override.
import type { IncomingMessage } from 'node:http'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SsoPrincipal } from '../utils/types'

function makeReq(cookie?: string): IncomingMessage {
  return { headers: cookie ? { cookie } : {} } as unknown as IncomingMessage
}

function principal(): SsoPrincipal {
  return {
    subjectId: 'sub-admin',
    email: 'admin@example.test',
    displayName: 'Admin User',
    role: 'admin',
    expiresAt: 0,
    authContext: { auth_time: 1_780_000_000, amr: ['pwd', 'mfa'], acr: 'urn:timeh:aal2' },
    lastLoginAt: null,
  }
}

describe('admin BFF session lifecycle', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('VITE_ADMIN_BASE_URL', 'https://admin-sso.example.test')
    vi.stubEnv('VITE_SSO_BASE_URL', 'https://api-sso.example.test')
    vi.stubEnv('SESSION_ENCRYPTION_SECRET', 'test-admin-session-secret-32-bytes-long')
    vi.stubEnv('SSO_ADMIN_SESSION_REDIS_URL', '')
    vi.setSystemTime(new Date('2026-06-03T03:00:00Z'))
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('builds a session from bootstrap tokens with a 30-day absolute expiry', async () => {
    const { sessionFromBootstrap, unixTime } = await import('../utils/session')
    const now = unixTime()
    const session = sessionFromBootstrap(
      {
        accessToken: 'access-token',
        idToken: 'id-token',
        refreshToken: 'refresh-token',
        expiresAt: now + 3600,
        sid: 'sid-123',
      },
      principal(),
    )

    expect(session.accessToken).toBe('access-token')
    expect(session.idToken).toBe('id-token')
    expect(session.refreshToken).toBe('refresh-token')
    expect(session.sub).toBe('sub-admin')
    expect(session.sid).toBe('sid-123')
    expect(session.role).toBe('admin')
    expect(session.absoluteExpiresAt).toBe(now + 60 * 60 * 24 * 30)
  })

  it('publicSession excludes every token and the raw sid field', async () => {
    const { sessionFromBootstrap, publicSession } = await import('../utils/session')
    const session = sessionFromBootstrap(
      {
        accessToken: 'access-token',
        idToken: 'id-token',
        refreshToken: 'refresh-token',
        expiresAt: 0,
        sid: 'sid-123',
      },
      principal(),
    )
    const view = publicSession(session) as Record<string, unknown>

    expect(view).not.toHaveProperty('accessToken')
    expect(view).not.toHaveProperty('idToken')
    expect(view).not.toHaveProperty('refreshToken')
    expect(view).not.toHaveProperty('sid')
    expect(view.subject).toBe('sub-admin')
    expect(view.role).toBe('admin')
  })

  it('treats a session as expired once it is within the buffer window', async () => {
    const { isSessionExpired, unixTime } = await import('../utils/session')
    const now = unixTime()
    expect(isSessionExpired(now + 10, 30)).toBe(true)
    expect(isSessionExpired(now + 120, 30)).toBe(false)
  })

  it('clamps the cookie max-age to the smaller of idle TTL and absolute remaining', async () => {
    const { sessionCookieMaxAge, unixTime } = await import('../utils/session')
    const now = unixTime()
    const base = {
      accessToken: 'a',
      idToken: 'i',
      refreshToken: 'r',
      sub: 'sub-admin',
      subject: 'sub-admin',
      email: 'admin@example.test',
      displayName: 'Admin',
      role: 'admin',
      expiresAt: now + 3600,
      authTime: null,
      amr: [],
      acr: null,
      lastLoginAt: null,
      issuedAt: now,
      lastRefreshedAt: now,
    }
    expect(sessionCookieMaxAge({ ...base, absoluteExpiresAt: now + 100 })).toBe(100)
    expect(sessionCookieMaxAge({ ...base, absoluteExpiresAt: now + 60 * 60 * 24 * 365 })).toBe(
      60 * 60 * 24 * 7,
    )
  })

  it('round-trips an auth transaction through the encrypted __Host- tx cookie', async () => {
    const { transactionCookie, pullTransaction } = await import('../utils/session')
    const cookie = transactionCookie({
      state: 'st',
      nonce: 'no',
      codeVerifier: 've',
      returnTo: '/dashboard',
    })
    const value = cookie.split(';')[0]
    const tx = pullTransaction(makeReq(value))
    expect(tx).toEqual({ state: 'st', nonce: 'no', codeVerifier: 've', returnTo: '/dashboard' })
  })

  it('persists a session in the in-memory store and reads it back by its opaque cookie id', async () => {
    const { sessionFromBootstrap, sessionCookie, readSession } = await import('../utils/session')
    const session = sessionFromBootstrap(
      {
        accessToken: 'access-token',
        idToken: 'id-token',
        refreshToken: 'refresh-token',
        expiresAt: 0,
        sid: 'sid-123',
      },
      principal(),
    )
    const cookie = (await sessionCookie(session)).split(';')[0]
    const restored = await readSession(makeReq(cookie))
    expect(restored?.accessToken).toBe('access-token')
    expect(restored?.sub).toBe('sub-admin')
  })
})
