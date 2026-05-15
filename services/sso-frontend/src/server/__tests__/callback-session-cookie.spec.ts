import { describe, expect, it } from 'vitest'
import { sessionCookie, type AdminSession } from '../session.js'

function session(): AdminSession {
  const now = Math.floor(Date.now() / 1000)

  return {
    accessToken: 'server-only-access-token',
    idToken: 'server-only-id-token',
    refreshToken: 'server-only-refresh-token',
    sub: 'user-1',
    subject: 'user-1',
    email: 'user@example.test',
    displayName: 'User Example',
    role: 'admin',
    expiresAt: now + 3600,
    authTime: now,
    amr: ['pwd'],
    acr: 'urn:sso:loa:pwd',
    lastLoginAt: new Date(now * 1000).toISOString(),
    permissions: {
      view_admin_panel: true,
      manage_sessions: true,
    },
    issuedAt: now,
    absoluteExpiresAt: now + 7200,
    lastRefreshedAt: now,
  }
}

describe('OIDC BFF callback session cookie', () => {
  it('stores the bootstrap session only in a secure HttpOnly host cookie', () => {
    const cookie = sessionCookie(session())

    expect(cookie).toContain('__Host-admin-session=')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('Secure')
    expect(cookie).toContain('SameSite=Strict')
    expect(cookie).toContain('Path=/')
    expect(cookie).not.toContain('Domain=')
  })
})
