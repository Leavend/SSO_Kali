import type { IncomingMessage } from 'node:http'
import { Readable } from 'node:stream'
import { jwtVerify } from 'jose'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('jose', () => ({
  createRemoteJWKSet: vi.fn<() => () => void>(() => vi.fn<() => void>()),
  jwtVerify: vi.fn<() => Promise<{ payload: Record<string, unknown> }>>(async () => ({
    payload: { sub: 'admin-subject', exp: 4_102_444_800, nonce: 'n' },
  })),
}))

function requestWithCookie(cookie: string): IncomingMessage {
  const request = Readable.from([]) as Readable & { headers: Record<string, string> }
  request.headers = { cookie, 'x-request-id': 'req-admin-login-flow' }
  return request as unknown as IncomingMessage
}

describe('admin BFF auth flow', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('VITE_ADMIN_BASE_URL', 'https://admin-sso.example.test')
    vi.stubEnv('VITE_SSO_BASE_URL', 'https://api-sso.example.test')
    vi.stubEnv('ADMIN_OIDC_PUBLIC_ISSUER', 'https://sso.example.test')
    vi.stubEnv('ADMIN_OIDC_CLIENT_ID', 'sso-admin-panel')
    vi.stubEnv('SESSION_ENCRYPTION_SECRET', 'test-admin-session-secret-32-bytes-long')
    vi.stubEnv('SSO_ADMIN_SESSION_REDIS_URL', '')
  })

  it('returns an authenticated admin from OIDC callback to the admin dashboard', async () => {
    let tokenRequest: RequestInit | undefined
    let userinfoRequest: RequestInit | undefined
    const fetchMock = vi.fn<(input: string | URL, init?: RequestInit) => Promise<Response>>(
      async (input, init) => {
        const url = input.toString()

        if (url.endsWith('/.well-known/openid-configuration')) {
          return Response.json({
            issuer: 'https://api-sso.example.test',
            authorization_endpoint: 'https://api-sso.example.test/authorize',
            token_endpoint: 'https://api-sso.example.test/token',
            jwks_uri: 'https://api-sso.example.test/jwks',
            response_types_supported: ['code'],
            subject_types_supported: ['public'],
            id_token_signing_alg_values_supported: ['RS256'],
          })
        }

        if (url === 'https://api-sso.example.test/token') {
          tokenRequest = init
          return Response.json({
            access_token: 'server-side-access-token',
            id_token: 'verified-id-token',
            refresh_token: 'server-side-refresh-token',
            expires_in: 3600,
          })
        }

        if (url === 'https://api-sso.example.test/userinfo') {
          userinfoRequest = init
          return Response.json({
            sub: 'admin-subject',
            email: 'admin@example.test',
            name: 'Admin User',
            role: 'admin',
            auth_time: 1_780_000_000,
            amr: ['pwd', 'mfa'],
            acr: 'urn:timeh:aal2',
            last_login_at: '2026-06-01T08:00:00Z',
          })
        }

        return new Response('not found', { status: 404 })
      },
    )
    vi.stubGlobal('fetch', fetchMock)

    const { handleCallback, handleLogin } = await import('../auth-handlers.js')

    const login = await handleLogin(
      new URL('https://admin-sso.example.test/auth/login?return_to=/dashboard'),
    )
    const location = new URL(String(login.headers?.location))
    const cookies = login.headers?.['set-cookie']
    const txCookie = Array.isArray(cookies) ? cookies[0] : String(cookies)
    const cookieHeader = txCookie.split(';')[0]

    expect(login.status).toBe(302)
    expect(location.origin).toBe('https://sso.example.test')
    expect(location.pathname).toBe('/authorize')
    expect(location.searchParams.get('client_id')).toBe('sso-admin-panel')
    expect(location.searchParams.get('redirect_uri')).toBe(
      'https://admin-sso.example.test/auth/callback',
    )
    vi.mocked(jwtVerify).mockResolvedValueOnce(
      {
        payload: {
          sub: 'admin-subject',
          exp: 4_102_444_800,
          nonce: location.searchParams.get('nonce'),
        },
        protectedHeader: { alg: 'RS256' },
      } as unknown as Awaited<ReturnType<typeof jwtVerify>>,
    )

    const callback = await handleCallback(
      requestWithCookie(cookieHeader),
      new URL(
        `https://admin-sso.example.test/auth/callback?code=admin-code&state=${location.searchParams.get('state')}`,
      ),
    )

    expect(callback.status).toBe(302)
    expect(callback.headers?.location).toBe('https://admin-sso.example.test/dashboard')
    expect(callback.headers?.location).not.toContain('sso.example.test/home')
    expect(callback.headers?.['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringContaining('__Host-sso-admin-session=')]),
    )
    expect(tokenRequest?.method).toBe('POST')
    expect(String(tokenRequest?.body)).toContain(
      'redirect_uri=https%3A%2F%2Fadmin-sso.example.test%2Fauth%2Fcallback',
    )
    expect((userinfoRequest?.headers as Record<string, string> | undefined)?.Authorization).toBe(
      'Bearer server-side-access-token',
    )
  })
})
