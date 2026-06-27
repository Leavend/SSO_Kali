// @vitest-environment node
// NOTE: the `// @vitest-environment node` pragma above is non-functional —
// defineVitestConfig auto-routes *.spec.ts files to the jsdom project and
// overrides per-file environment pragmas. Tests are written to work under jsdom.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PortalSession } from '../utils/session'

function session(overrides: Partial<PortalSession> = {}): PortalSession {
  return {
    accessToken: 'a',
    idToken: 'i',
    refreshToken: 'r',
    sub: 'sub-admin',
    subject: 'sub-admin',
    email: 'admin@example.test',
    displayName: 'Admin',
    role: 'admin',
    expiresAt: 4_000_000_000,
    authTime: null,
    amr: [],
    acr: null,
    lastLoginAt: null,
    issuedAt: 1_780_455_600,
    absoluteExpiresAt: 4_000_000_000,
    lastRefreshedAt: 1_780_455_600,
    ...overrides,
  }
}

describe('admin BFF session store', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
    vi.stubEnv('VITE_ADMIN_BASE_URL', 'https://admin-sso.example.test')
    vi.stubEnv('VITE_SSO_BASE_URL', 'https://api-sso.example.test')
    vi.setSystemTime(new Date('2026-06-03T03:00:00Z'))
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('namespaces session keys under admin:sessions:', async () => {
    vi.stubEnv('SSO_ADMIN_SESSION_REDIS_URL', '')
    const { sessionStoreKey } = await import('../utils/session-store')
    expect(sessionStoreKey('opaque-id')).toBe('admin:sessions:opaque-id')
  })

  it('round-trips a record through the in-memory fallback when no Redis URL is set', async () => {
    vi.stubEnv('SSO_ADMIN_SESSION_REDIS_URL', '')
    const { createSessionRecord, readSessionRecord } = await import('../utils/session-store')
    const id = await createSessionRecord(session())
    expect((await readSessionRecord(id))?.accessToken).toBe('a')
  })

  it('writes to Redis with an EX clamped to min(idle TTL, absolute remaining)', async () => {
    const set = vi.fn(async () => 'OK')
    const fakeClient = {
      on: vi.fn(),
      connect: vi.fn(async () => undefined),
      set,
      get: vi.fn(async () => null),
      del: vi.fn(async () => 1),
    }
    vi.doMock('redis', () => ({ createClient: vi.fn(() => fakeClient) }))
    vi.stubEnv('SSO_ADMIN_SESSION_REDIS_URL', 'redis://localhost:6379/5')

    const { createSessionRecord, sessionStoreKey } = await import('../utils/session-store')
    const { unixTime } = await import('../utils/session')
    const id = await createSessionRecord(session({ absoluteExpiresAt: unixTime() + 100 }))

    expect(set).toHaveBeenCalledTimes(1)
    const [key, value, options] = set.mock.calls[0]!
    expect(key).toBe(sessionStoreKey(id))
    expect(JSON.parse(value as string).accessToken).toBe('a')
    expect(options).toEqual({ EX: 100 })
  })

  it('throws in production when the Redis URL is not configured', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('SSO_ADMIN_SESSION_REDIS_URL', '')
    const { createSessionRecord } = await import('../utils/session-store')
    await expect(createSessionRecord(session())).rejects.toThrow(
      'SSO_ADMIN_SESSION_REDIS_URL must be configured in production.',
    )
  })
})
