import type { IncomingMessage } from 'node:http'
import { Readable } from 'node:stream'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('jose', () => ({
  createRemoteJWKSet: vi.fn<() => () => void>(() => vi.fn<() => void>()),
  jwtVerify: vi.fn<() => Promise<{ payload: Record<string, unknown> }>>(async () => ({
    payload: {
      sub: 'portal-subject',
      sid: 'portal-session-sid',
      iss: 'https://api-sso.example.test',
      aud: 'sso-frontend-portal',
      exp: 4_102_444_800,
      iat: 1_780_000_000,
      jti: 'logout-token-1',
      events: { 'http://schemas.openid.net/event/backchannel-logout': {} },
    },
  })),
}))

function postRequest(body: string, cookie?: string): IncomingMessage {
  const request = Readable.from([body]) as Readable & {
    headers: Record<string, string>
    method: string
  }
  request.headers = {
    'content-type': 'application/x-www-form-urlencoded',
    ...(cookie ? { cookie } : {}),
  }
  request.method = 'POST'
  return request as unknown as IncomingMessage
}

describe('portal back-channel logout', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('VITE_SSO_BASE_URL', 'https://api-sso.example.test')
    vi.stubEnv('VITE_SSO_FRONTEND_BASE_URL', 'https://sso.example.test')
    vi.stubEnv('VITE_CLIENT_ID', 'sso-frontend-portal')
    vi.stubEnv('SESSION_ENCRYPTION_SECRET', 'test-portal-session-secret-32-bytes-long')
    vi.stubEnv('SSO_FRONTEND_SESSION_REDIS_URL', '')
    vi.stubGlobal(
      'fetch',
      vi.fn<(input: string | URL) => Promise<Response>>(async (input) => {
        if (input.toString().endsWith('/.well-known/openid-configuration')) {
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

        return new Response('not found', { status: 404 })
      }),
    )
  })

  it('revokes portal sessions for a matching sid-scoped logout token', async () => {
    const [{ handleBackChannelLogout }, { sessionCookie }, { readSessionRecord }] = await Promise.all([
      import('../backchannel-logout.js'),
      import('../session.js'),
      import('../session-store.js'),
    ])

    const cookie = (
      await sessionCookie({
        accessToken: 'portal-access-token',
        idToken: 'portal-id-token',
        refreshToken: 'portal-refresh-token',
        sub: 'portal-subject',
        sid: 'portal-session-sid',
        subject: 'portal-subject',
        email: 'portal@example.test',
        displayName: 'Portal User',
        role: 'admin',
        expiresAt: 4_102_444_800,
        authTime: null,
        amr: ['pwd'],
        acr: null,
        lastLoginAt: null,
        issuedAt: 1_780_000_000,
        absoluteExpiresAt: 4_102_444_800,
        lastRefreshedAt: 1_780_000_000,
      })
    ).split(';')[0]!
    const sessionId = cookie.split('=')[1]!

    expect(await readSessionRecord(sessionId)).not.toBeNull()

    const response = await handleBackChannelLogout(
      postRequest('logout_token=logout-token-value', cookie),
    )

    expect(response.status).toBe(200)
    expect(response.body).toContain('"logged_out":true')
    expect(response.body).toContain('"sessions_revoked":1')
    expect(await readSessionRecord(sessionId)).toBeNull()
  })

  it('revokes only the matching sid session when multiple sessions share a subject', async () => {
    const jose = await import('jose')
    vi.mocked(jose.jwtVerify).mockResolvedValueOnce({
      payload: {
        sid: 'portal-session-sid-a',
        iss: 'https://api-sso.example.test',
        aud: 'sso-frontend-portal',
        exp: 4_102_444_800,
        iat: 1_780_000_000,
        jti: 'logout-token-3',
        events: { 'http://schemas.openid.net/event/backchannel-logout': {} },
      },
      protectedHeader: { alg: 'RS256' },
    } as unknown as Awaited<ReturnType<typeof jose.jwtVerify>>)

    const [{ handleBackChannelLogout }, { sessionCookie }, { readSessionRecord }] = await Promise.all([
      import('../backchannel-logout.js'),
      import('../session.js'),
      import('../session-store.js'),
    ])

    const cookieA = (
      await sessionCookie({
        accessToken: 'portal-access-token-a',
        idToken: 'portal-id-token-a',
        refreshToken: 'portal-refresh-token-a',
        sub: 'portal-subject',
        sid: 'portal-session-sid-a',
        subject: 'portal-subject',
        email: 'portal@example.test',
        displayName: 'Portal User',
        role: 'admin',
        expiresAt: 4_102_444_800,
        authTime: null,
        amr: ['pwd'],
        acr: null,
        lastLoginAt: null,
        issuedAt: 1_780_000_000,
        absoluteExpiresAt: 4_102_444_800,
        lastRefreshedAt: 1_780_000_000,
      })
    ).split(';')[0]!
    const sessionIdA = cookieA.split('=')[1]!

    const cookieB = (
      await sessionCookie({
        accessToken: 'portal-access-token-b',
        idToken: 'portal-id-token-b',
        refreshToken: 'portal-refresh-token-b',
        sub: 'portal-subject',
        sid: 'portal-session-sid-b',
        subject: 'portal-subject',
        email: 'portal@example.test',
        displayName: 'Portal User',
        role: 'admin',
        expiresAt: 4_102_444_800,
        authTime: null,
        amr: ['pwd'],
        acr: null,
        lastLoginAt: null,
        issuedAt: 1_780_000_000,
        absoluteExpiresAt: 4_102_444_800,
        lastRefreshedAt: 1_780_000_000,
      })
    ).split(';')[0]!
    const sessionIdB = cookieB.split('=')[1]!

    const response = await handleBackChannelLogout(
      postRequest('logout_token=logout-token-value', cookieA),
    )

    expect(response.status).toBe(200)
    expect(await readSessionRecord(sessionIdA)).toBeNull()
    expect(await readSessionRecord(sessionIdB)).not.toBeNull()
  })

  it('revokes all portal sessions for a subject-only logout token', async () => {
    const jose = await import('jose')
    vi.mocked(jose.jwtVerify).mockResolvedValueOnce({
      payload: {
        sub: 'portal-subject',
        iss: 'https://api-sso.example.test',
        aud: 'sso-frontend-portal',
        exp: 4_102_444_800,
        iat: 1_780_000_000,
        jti: 'logout-token-2',
        events: { 'http://schemas.openid.net/event/backchannel-logout': {} },
      },
      protectedHeader: { alg: 'RS256' },
    } as unknown as Awaited<ReturnType<typeof jose.jwtVerify>>)

    const [{ handleBackChannelLogout }, { sessionCookie }, { readSessionRecord }] = await Promise.all([
      import('../backchannel-logout.js'),
      import('../session.js'),
      import('../session-store.js'),
    ])

    const cookie = (
      await sessionCookie({
        accessToken: 'portal-access-token',
        idToken: 'portal-id-token',
        refreshToken: 'portal-refresh-token',
        sub: 'portal-subject',
        sid: 'portal-session-sid-2',
        subject: 'portal-subject',
        email: 'portal@example.test',
        displayName: 'Portal User',
        role: 'admin',
        expiresAt: 4_102_444_800,
        authTime: null,
        amr: ['pwd'],
        acr: null,
        lastLoginAt: null,
        issuedAt: 1_780_000_000,
        absoluteExpiresAt: 4_102_444_800,
        lastRefreshedAt: 1_780_000_000,
      })
    ).split(';')[0]!
    const sessionId = cookie.split('=')[1]!

    const response = await handleBackChannelLogout(
      postRequest('logout_token=logout-token-value', cookie),
    )

    expect(response.status).toBe(200)
    expect(response.body).toContain('"sessions_revoked":1')
    expect(await readSessionRecord(sessionId)).toBeNull()
  })
})
