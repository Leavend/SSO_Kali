import type { IncomingMessage } from 'node:http'
import { Readable } from 'node:stream'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PortalSession } from '../session.js'

const session: PortalSession = {
  accessToken: 'old-access-token',
  idToken: 'id-token',
  refreshToken: 'refresh-token',
  sub: 'subject-1',
  subject: 'subject-1',
  email: 'user@example.test',
  displayName: 'User',
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

describe('portal BFF session refresh', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('VITE_SSO_BASE_URL', 'https://api-sso.example.test')
    vi.stubEnv('VITE_CLIENT_ID', 'sso-frontend-portal')
    vi.stubEnv('SSO_PORTAL_CLIENT_SECRET', 'portal-bff-secret')
    vi.setSystemTime(new Date('2026-06-12T03:00:00Z'))
  })

  it('authenticates the confidential client during refresh', async () => {
    let tokenRequest: RequestInit | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: string | URL, init?: RequestInit) => {
        tokenRequest = init
        return Response.json({ access_token: 'new-access-token', expires_in: 3600 })
      }),
    )

    const { refreshPortalSession } = await import('../session-refresh.js')
    await refreshPortalSession(session, { requestId: 'req-refresh' })

    const body = new URLSearchParams(String(tokenRequest?.body))
    expect(body.get('client_id')).toBe('sso-frontend-portal')
    expect(body.get('client_secret')).toBe('portal-bff-secret')
    expect(body.get('refresh_token')).toBe('refresh-token')
  })

  it('authenticates the confidential client during refresh-token revocation', async () => {
    const calls: Array<{ readonly url: string; readonly init?: RequestInit }> = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        calls.push({ url: input.toString(), init })
        return new Response(null, { status: 200 })
      }),
    )

    const [{ handleLogout }, { sessionCookie }] = await Promise.all([
      import('../auth-handlers.js'),
      import('../session.js'),
    ])
    const cookie = (await sessionCookie(session)).split(';')[0]
    const request = Readable.from([]) as Readable & { headers: Record<string, string> }
    request.headers = { cookie }

    await handleLogout(request as unknown as IncomingMessage)

    const revocation = calls.find((call) => call.url.endsWith('/revocation'))
    const body = new URLSearchParams(String(revocation?.init?.body))
    expect(body.get('client_secret')).toBe('portal-bff-secret')
    expect(body.get('token')).toBe('refresh-token')
  })
})
