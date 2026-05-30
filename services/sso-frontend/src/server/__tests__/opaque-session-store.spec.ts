import { afterEach, describe, expect, it, vi } from 'vitest'
import { encryptSession } from '../session-crypto.js'
import { readSession, sessionCookie, type PortalSession } from '../session.js'

function portalSession(): PortalSession {
  const now = Math.floor(Date.now() / 1000)
  return {
    accessToken: 'server-only-access-token',
    idToken: 'server-only-id-token',
    refreshToken: 'server-only-refresh-token',
    sub: 'user-1',
    subject: 'user-1',
    email: 'user@example.test',
    displayName: 'User Example',
    role: 'user',
    expiresAt: now + 3600,
    authTime: now,
    amr: ['pwd'],
    acr: 'urn:sso:loa:pwd',
    lastLoginAt: new Date(now * 1000).toISOString(),
    issuedAt: now,
    absoluteExpiresAt: now + 7200,
    lastRefreshedAt: now,
  }
}

describe('opaque portal session store', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('sets only an opaque session id in the browser cookie', async () => {
    const cookie = await sessionCookie(portalSession())

    expect(cookie).toContain('__Host-sso-portal-session=')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).not.toContain('server-only-access-token')
    expect(cookie).not.toContain('server-only-refresh-token')
    expect(cookie).not.toContain('server-only-id-token')
  })

  it('resolves server-side session data from the opaque id', async () => {
    const cookie = (await sessionCookie(portalSession())).split(';')[0]
    const request = { headers: { cookie } }

    expect((await readSession(request as never))?.accessToken).toBe('server-only-access-token')
  })

  it('ignores legacy encrypted token cookies even with a valid payload', async () => {
    // A valid encrypted legacy cookie must still be ignored — opaque session
    // fallback was removed; only __Host-sso-portal-session is accepted.
    const now = Math.floor(Date.now() / 1000)
    const legacyCookieName = '__Host-sso-portal-session-legacy'
    const validSessionPayload = {
      accessToken: 'server-only-access-token',
      idToken: 'server-only-id-token',
      refreshToken: 'server-only-refresh-token',
      sub: 'user-1',
      email: 'a@b.test',
      displayName: 'User Test',
      role: 'user',
      expiresAt: now + 3600,
      issuedAt: now,
      absoluteExpiresAt: now + 7200,
      lastRefreshedAt: now,
    }
    const encryptedToken = encryptSession(JSON.stringify(validSessionPayload))
    const request = {
      headers: { cookie: `${legacyCookieName}=${encryptedToken}` },
    }

    expect(await readSession(request as never)).toBeNull()
  })

  it('fails closed in production when a shared Redis session store is missing', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('SSO_FRONTEND_SESSION_REDIS_URL', '')
    vi.stubEnv('REDIS_URL', '')
    vi.resetModules()
    const { createSessionRecord } = await import('../session-store.js')

    await expect(createSessionRecord(portalSession())).rejects.toThrow(
      'SSO_FRONTEND_SESSION_REDIS_URL must be configured in production.',
    )
  })
})
