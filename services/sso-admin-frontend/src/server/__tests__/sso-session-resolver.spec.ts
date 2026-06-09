import type { IncomingMessage } from 'node:http'
import { Readable } from 'node:stream'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PortalSession } from '../session.js'

function requestWithCookie(cookie: string): IncomingMessage {
  const request = Readable.from([]) as Readable & { headers: Record<string, string> }
  request.headers = { cookie, 'x-request-id': 'req-admin-resolve' }
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

    const { sessionCookie } = await import('../session.js')
    const { resolveSsoSession } = await import('../sso-session-resolver.js')
    const cookie = cookieHeader(await sessionCookie(baseSession()))

    const resolved = await resolveSsoSession(requestWithCookie(cookie))

    expect(resolved?.session.rpSessionRegisteredAt).toBe(1_779_840_000)
    expect(registerRequest?.method).toBe('POST')
    expect((registerRequest?.headers as Record<string, string> | undefined)?.Authorization).toBe(
      'Bearer legacy-admin-access-token',
    )
    expect(new Headers(registerRequest?.headers).get('x-request-id')).toBe('req-admin-resolve')
  })

  it('does not re-register a recently registered admin RP session on every request', async () => {
    const fetchMock = vi.fn<() => Promise<Response>>(async () =>
      Response.json({ registered: true }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const { sessionCookie } = await import('../session.js')
    const { resolveSsoSession } = await import('../sso-session-resolver.js')
    const cookie = cookieHeader(
      await sessionCookie(baseSession({ rpSessionRegisteredAt: 1_779_839_900 })),
    )

    const resolved = await resolveSsoSession(requestWithCookie(cookie))

    expect(resolved?.session.rpSessionRegisteredAt).toBe(1_779_839_900)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
