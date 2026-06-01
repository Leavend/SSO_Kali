import { describe, expect, it, vi } from 'vitest'

describe('admin BFF runtime config', () => {
  it('uses admin host, admin OIDC client, and admin-scoped Redis/session cookies', async () => {
    vi.resetModules()
    vi.stubEnv('VITE_ADMIN_BASE_URL', 'https://admin-sso.example.test')
    vi.stubEnv('VITE_SSO_BASE_URL', 'https://api-sso.example.test')
    vi.stubEnv('ADMIN_OIDC_CLIENT_ID', 'sso-admin-panel')
    vi.stubEnv('SSO_ADMIN_SESSION_REDIS_URL', 'redis://redis:6379/5')

    const [{ getConfig }, cookies, store] = await Promise.all([
      import('../config.js'),
      import('../cookies.js'),
      import('../session-store.js'),
    ])

    expect(getConfig()).toMatchObject({
      issuer: 'https://api-sso.example.test',
      appBaseUrl: 'https://admin-sso.example.test',
      clientId: 'sso-admin-panel',
      redirectUri: 'https://admin-sso.example.test/auth/callback',
      sessionRedisUrl: 'redis://redis:6379/5',
      port: 8080,
    })
    expect(cookies.SSO_PORTAL_SESSION_COOKIE).toBe('__Host-sso-admin-session')
    expect(cookies.SSO_PORTAL_TX_COOKIE).toBe('__Host-sso-admin-tx')
    expect(store.sessionStoreKey('opaque-id')).toBe('admin:sessions:opaque-id')
  })
})
