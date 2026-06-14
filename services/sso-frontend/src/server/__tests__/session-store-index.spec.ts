import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSessionRecord } from '../session-store.js'
import type { PortalSession } from '../session.js'

function portalSession(overrides: Partial<PortalSession> = {}): PortalSession {
  const now = Math.floor(Date.now() / 1000)
  return {
    accessToken: 'server-only-access-token',
    idToken: 'server-only-id-token',
    refreshToken: 'server-only-refresh-token',
    sub: 'user-1',
    sid: 'sid-1',
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
    ...overrides,
  }
}

describe('portal session index ttl', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-14T00:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it('never shortens a shared subject index ttl when a shorter-lived sibling session is written', async () => {
    vi.stubEnv('SSO_FRONTEND_SESSION_REDIS_URL', 'redis://session-store.test:6379')
    vi.stubEnv('REDIS_URL', '')
    vi.resetModules()

    const expireSpy = vi.fn(async () => true)
    const sAddSpy = vi.fn(async () => 1)
    const setSpy = vi.fn(async () => 'OK')
    const getSpy = vi.fn(async () => null)
    const delSpy = vi.fn(async () => 1)
    const sRemSpy = vi.fn(async () => 1)
    const keysSpy = vi.fn(async () => [])
    const connectSpy = vi.fn(async () => undefined)
    const onSpy = vi.fn()

    vi.doMock('redis', () => ({
      createClient: () => ({
        set: setSpy,
        get: getSpy,
        del: delSpy,
        sAdd: sAddSpy,
        sRem: sRemSpy,
        expire: expireSpy,
        keys: keysSpy,
        connect: connectSpy,
        on: onSpy,
      }),
    }))

    const { createSessionRecord: writeSession } = await import('../session-store.js')

    await writeSession(
      portalSession({
        sub: 'shared-subject',
        sid: 'sid-long',
        absoluteExpiresAt: Math.floor(Date.now() / 1000) + 7200,
      }),
    )
    await writeSession(
      portalSession({
        sub: 'shared-subject',
        sid: 'sid-short',
        absoluteExpiresAt: Math.floor(Date.now() / 1000) + 30,
      }),
    )

    const subjectExpires = expireSpy.mock.calls.filter(
      (call) => (call as unknown as Array<unknown>)[0] === 'portal:subject-index:shared-subject',
    ) as Array<Array<unknown>>

    expect(subjectExpires).toHaveLength(2)
    expect(subjectExpires[0]?.[2]).toBeUndefined()
    expect(subjectExpires[1]?.[2]).toBeUndefined()
    expect(subjectExpires[0]?.[1]).toBe(subjectExpires[1]?.[1])
  })
})
