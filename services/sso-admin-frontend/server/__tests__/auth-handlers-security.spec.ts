import type { IncomingMessage } from 'node:http'
import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'
import { jwtVerify } from 'jose'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Security hardening suite for the OIDC auth handlers. The byte-for-byte
// behavioral parity is asserted in auth-flow.spec.ts; this file pins the
// fail-closed and no-leak invariants that protect the crown-jewel flow:
//   - PKCE S256: state/nonce/verifier entropy + code_challenge == S256(verifier),
//     bound into the encrypted transaction cookie.
//   - Every callback rejection path issues NO session (state/nonce/JWKS/token/secret).
//   - Logout revokes BOTH the access token and the refresh token at the backend.
//   - Tokens/secrets never reach a browser-facing body and are never logged.

vi.mock('jose', () => ({
  createRemoteJWKSet: vi.fn<() => () => void>(() => vi.fn<() => void>()),
  jwtVerify: vi.fn<() => Promise<{ payload: Record<string, unknown> }>>(async () => ({
    payload: { sub: 'admin-subject', exp: 4_102_444_800, nonce: 'n' },
  })),
}))

const TOKEN_URL = 'https://api-sso.example.test/token'
const USERINFO_URL = 'https://api-sso.example.test/userinfo'
const REGISTER_URL = 'https://api-sso.example.test/connect/register-session'
const REVOCATION_URL = 'https://api-sso.example.test/revocation'
const LOGOUT_URL = 'https://api-sso.example.test/connect/logout'

const SECRETS = [
  'server-side-access-token',
  'server-side-refresh-token',
  'verified-id-token',
  'admin-bff-secret',
] as const

function discoveryBody(): Record<string, unknown> {
  return {
    issuer: 'https://api-sso.example.test',
    authorization_endpoint: 'https://api-sso.example.test/authorize',
    token_endpoint: TOKEN_URL,
    jwks_uri: 'https://api-sso.example.test/jwks',
    response_types_supported: ['code'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
  }
}

function userinfoBody(): Record<string, unknown> {
  return {
    sub: 'admin-subject',
    email: 'admin@example.test',
    name: 'Admin User',
    role: 'admin',
    auth_time: 1_780_000_000,
    amr: ['pwd', 'mfa'],
    acr: 'urn:timeh:aal2',
    last_login_at: '2026-06-01T08:00:00Z',
  }
}

function successTokenBody(): Record<string, unknown> {
  return {
    access_token: 'server-side-access-token',
    id_token: 'verified-id-token',
    refresh_token: 'server-side-refresh-token',
    expires_in: 3600,
  }
}

type FetchCall = { readonly url: string; readonly init?: RequestInit }

/**
 * Route fetch mock for the login + callback flow. `tokenResponse` lets a test
 * force a token-endpoint failure; all other endpoints return success bodies.
 */
function installFetchMock(options: { tokenResponse?: () => Response } = {}): FetchCall[] {
  const calls: FetchCall[] = []
  const fetchMock = vi.fn<(input: string | URL, init?: RequestInit) => Promise<Response>>(
    async (input, init) => {
      const url = input.toString()
      calls.push({ url, init })

      if (url === REGISTER_URL)
        return Response.json({ registered: true, client_id: 'sso-admin-panel' })
      if (url.endsWith('/.well-known/openid-configuration')) return Response.json(discoveryBody())
      if (url === TOKEN_URL) return options.tokenResponse?.() ?? Response.json(successTokenBody())
      if (url === USERINFO_URL) return Response.json(userinfoBody())

      return new Response('not found', { status: 404 })
    },
  )
  vi.stubGlobal('fetch', fetchMock)
  return calls
}

function requestWithCookie(cookie: string): IncomingMessage {
  const request = Readable.from([]) as Readable & { headers: Record<string, string> }
  request.headers = { cookie, 'x-request-id': 'req-admin-security' }
  return request as unknown as IncomingMessage
}

function requestWithBody(cookie: string, body: unknown): IncomingMessage {
  const request = Readable.from([Buffer.from(JSON.stringify(body))]) as Readable & {
    headers: Record<string, string>
  }
  request.headers = { cookie, 'x-request-id': 'req-admin-security' }
  return request as unknown as IncomingMessage
}

function setCookieList(response: { headers?: Record<string, unknown> }): string[] {
  const raw = response.headers?.['set-cookie']
  if (!raw) return []
  return Array.isArray(raw) ? (raw as string[]) : [String(raw)]
}

type LoginContext = {
  readonly handleCallback: (typeof import('../utils/auth-handlers'))['handleCallback']
  readonly handleCallbackSession: (typeof import('../utils/auth-handlers'))['handleCallbackSession']
  readonly cookieHeader: string
  readonly state: string
  readonly nonce: string
}

async function loginAndPrepare(): Promise<LoginContext> {
  const { handleLogin, handleCallback, handleCallbackSession } =
    await import('../utils/auth-handlers')
  const login = await handleLogin(
    new URL('https://admin-sso.example.test/auth/login?return_to=/dashboard'),
  )
  const location = new URL(String(login.headers?.location))
  const txCookie = setCookieList(login)[0] ?? ''
  return {
    handleCallback,
    handleCallbackSession,
    cookieHeader: txCookie.split(';')[0]!,
    state: location.searchParams.get('state')!,
    nonce: location.searchParams.get('nonce')!,
  }
}

function callbackUrl(state: string): URL {
  return new URL(`https://admin-sso.example.test/auth/callback?code=admin-code&state=${state}`)
}

function resolveIdToken(payload: Record<string, unknown>): void {
  vi.mocked(jwtVerify).mockResolvedValueOnce({
    payload,
    protectedHeader: { alg: 'RS256' },
  } as unknown as Awaited<ReturnType<typeof jwtVerify>>)
}

describe('admin OIDC auth handler security invariants', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('VITE_ADMIN_BASE_URL', 'https://admin-sso.example.test')
    vi.stubEnv('VITE_SSO_BASE_URL', 'https://api-sso.example.test')
    vi.stubEnv('ADMIN_OIDC_PUBLIC_ISSUER', 'https://sso.example.test')
    vi.stubEnv('ADMIN_OIDC_CLIENT_ID', 'sso-admin-panel')
    vi.stubEnv('ADMIN_OIDC_CLIENT_SECRET', 'admin-bff-secret')
    vi.stubEnv('SESSION_ENCRYPTION_SECRET', 'test-admin-session-secret-32-bytes-long')
    vi.stubEnv('SSO_ADMIN_SESSION_REDIS_URL', '')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  describe('PKCE S256', () => {
    it('generates state, nonce, and code_verifier with sufficient, distinct entropy', async () => {
      const { generateState, generateNonce, generateCodeVerifier } = await import('../utils/pkce')

      const states = new Set([generateState(), generateState(), generateState()])
      const nonces = new Set([generateNonce(), generateNonce(), generateNonce()])
      const verifiers = new Set([
        generateCodeVerifier(),
        generateCodeVerifier(),
        generateCodeVerifier(),
      ])

      // No collisions across repeated draws (randomness wired up).
      expect(states.size).toBe(3)
      expect(nonces.size).toBe(3)
      expect(verifiers.size).toBe(3)

      // 16 random bytes -> 22 base64url chars; 32 bytes -> 43 chars; URL-safe alphabet only.
      for (const value of [...states, ...nonces]) {
        expect(value).toMatch(/^[A-Za-z0-9_-]{22}$/u)
      }
      for (const value of verifiers) {
        expect(value).toMatch(/^[A-Za-z0-9_-]{43}$/u)
      }
    })

    it('derives code_challenge as the base64url SHA-256 of the verifier', async () => {
      const { generateCodeVerifier, generateCodeChallenge } = await import('../utils/pkce')
      const verifier = generateCodeVerifier()

      const challenge = await generateCodeChallenge(verifier)
      const expected = createHash('sha256').update(verifier).digest('base64url')

      expect(challenge).toBe(expected)
    })

    it('binds state/nonce/verifier into the tx cookie and sends S256(verifier) as code_challenge', async () => {
      installFetchMock()
      const { handleLogin } = await import('../utils/auth-handlers')
      const { pullTransaction } = await import('../utils/session')

      const login = await handleLogin(
        new URL('https://admin-sso.example.test/auth/login?return_to=/dashboard'),
      )
      const location = new URL(String(login.headers?.location))
      const cookieHeader = (setCookieList(login)[0] ?? '').split(';')[0]!
      const tx = pullTransaction(requestWithCookie(cookieHeader))

      expect(tx).not.toBeNull()
      expect(tx?.state).toBe(location.searchParams.get('state'))
      expect(tx?.nonce).toBe(location.searchParams.get('nonce'))
      expect(tx?.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/u)
      expect(location.searchParams.get('code_challenge_method')).toBe('S256')
      expect(location.searchParams.get('code_challenge')).toBe(
        createHash('sha256').update(tx!.codeVerifier).digest('base64url'),
      )
      // The verifier itself must never appear in the redirect URL.
      expect(location.search).not.toContain(tx!.codeVerifier)
    })
  })

  describe('callback fail-closed (no session issued)', () => {
    it('rejects a state mismatch without exchanging the code', async () => {
      const calls = installFetchMock()
      const { handleCallback } = await loginAndPrepare()

      const callback = await handleCallback(
        requestWithCookie('__Host-sso-admin-tx=tampered'),
        callbackUrl('attacker-supplied-state'),
      )

      expect(callback.status).toBe(302)
      expect(callback.headers?.location).toBe('https://admin-sso.example.test/handshake-failed')
      expect(setCookieList(callback).some((c) => c.startsWith('__Host-sso-admin-session='))).toBe(
        false,
      )
      expect(calls.some((c) => c.url === TOKEN_URL)).toBe(false)
    })

    it('rejects a nonce mismatch even after a successful code exchange', async () => {
      const calls = installFetchMock()
      const { handleCallback, cookieHeader, state } = await loginAndPrepare()
      resolveIdToken({ sub: 'admin-subject', exp: 4_102_444_800, nonce: 'attacker-nonce' })

      const callback = await handleCallback(requestWithCookie(cookieHeader), callbackUrl(state))

      expect(callback.headers?.location).toBe('https://admin-sso.example.test/handshake-failed')
      expect(setCookieList(callback).some((c) => c.startsWith('__Host-sso-admin-session='))).toBe(
        false,
      )
      // Exchange DID happen, proving the rejection is the nonce check, not an earlier gate.
      expect(calls.some((c) => c.url === TOKEN_URL)).toBe(true)
    })

    it('rejects an id_token whose signature fails JWKS verification', async () => {
      installFetchMock()
      const { handleCallback, cookieHeader, state } = await loginAndPrepare()
      vi.mocked(jwtVerify).mockRejectedValueOnce(new Error('signature verification failed'))

      const callback = await handleCallback(requestWithCookie(cookieHeader), callbackUrl(state))

      expect(callback.headers?.location).toBe('https://admin-sso.example.test/handshake-failed')
      expect(setCookieList(callback).some((c) => c.startsWith('__Host-sso-admin-session='))).toBe(
        false,
      )
    })

    it('rejects when the token endpoint returns an error', async () => {
      const calls = installFetchMock({
        tokenResponse: () => new Response('invalid_grant', { status: 400 }),
      })
      const { handleCallback, cookieHeader, state } = await loginAndPrepare()

      const callback = await handleCallback(requestWithCookie(cookieHeader), callbackUrl(state))

      expect(callback.headers?.location).toBe('https://admin-sso.example.test/handshake-failed')
      expect(setCookieList(callback).some((c) => c.startsWith('__Host-sso-admin-session='))).toBe(
        false,
      )
      // No principal fetch after a failed exchange.
      expect(calls.some((c) => c.url === USERINFO_URL)).toBe(false)
    })

    it('refuses the confidential exchange when the client secret is missing', async () => {
      vi.stubEnv('ADMIN_OIDC_CLIENT_SECRET', '')
      const calls = installFetchMock()
      const { handleCallback, cookieHeader, state } = await loginAndPrepare()

      const callback = await handleCallback(requestWithCookie(cookieHeader), callbackUrl(state))

      expect(callback.headers?.location).toBe('https://admin-sso.example.test/handshake-failed')
      expect(setCookieList(callback).some((c) => c.startsWith('__Host-sso-admin-session='))).toBe(
        false,
      )
      // The token request is never even attempted without a client secret.
      expect(calls.some((c) => c.url === TOKEN_URL)).toBe(false)
    })

    it('clears the transaction cookie on every rejection', async () => {
      installFetchMock()
      const { handleCallback, cookieHeader, state } = await loginAndPrepare()
      vi.mocked(jwtVerify).mockRejectedValueOnce(new Error('boom'))

      const callback = await handleCallback(requestWithCookie(cookieHeader), callbackUrl(state))
      const cleared = setCookieList(callback).find((c) => c.startsWith('__Host-sso-admin-tx='))

      expect(cleared).toBeDefined()
      expect(cleared).toContain('__Host-sso-admin-tx=;')
      expect(cleared).toContain('Expires=Thu, 01 Jan 1970')
    })
  })

  describe('logout revocation', () => {
    it('revokes BOTH the access token and the refresh token at the backend, then clears cookies', async () => {
      const calls = installFetchMock()
      const [{ handleLogout }, { sessionCookie }] = await Promise.all([
        import('../utils/auth-handlers'),
        import('../utils/session'),
      ])
      const cookie = (
        await sessionCookie({
          accessToken: 'server-side-access-token',
          idToken: 'verified-id-token',
          refreshToken: 'server-side-refresh-token',
          sub: 'admin-subject',
          subject: 'admin-subject',
          email: 'admin@example.test',
          displayName: 'Admin',
          role: 'admin',
          sid: 'sso-session-id',
          expiresAt: 4_102_444_800,
          authTime: null,
          amr: ['pwd', 'mfa'],
          acr: null,
          lastLoginAt: null,
          issuedAt: 1_780_000_000,
          absoluteExpiresAt: 4_102_444_800,
          lastRefreshedAt: 1_780_000_000,
        })
      ).split(';')[0]!

      const logout = await handleLogout(requestWithCookie(cookie))

      // Access token revoked via the authenticated logout endpoint.
      const accessRevoke = calls.find((c) => c.url === LOGOUT_URL)
      expect(accessRevoke?.init?.method).toBe('POST')
      expect(
        (accessRevoke?.init?.headers as Record<string, string> | undefined)?.Authorization,
      ).toBe('Bearer server-side-access-token')

      // Refresh token revoked via the confidential revocation endpoint.
      const refreshRevoke = calls.find((c) => c.url === REVOCATION_URL)
      const body = new URLSearchParams(String(refreshRevoke?.init?.body))
      expect(body.get('token')).toBe('server-side-refresh-token')
      expect(body.get('token_type_hint')).toBe('refresh_token')
      expect(body.get('client_secret')).toBe('admin-bff-secret')

      // Session + widget cookies cleared (epoch expiry).
      const cookies = setCookieList(logout)
      const clearedSession = cookies.find((c) => c.startsWith('__Host-sso-admin-session='))
      const clearedWidget = cookies.find((c) => c.startsWith('__Host-sso_session='))
      expect(clearedSession).toContain('__Host-sso-admin-session=;')
      expect(clearedWidget).toContain('__Host-sso_session=;')
      expect(clearedWidget).toContain('Expires=Thu, 01 Jan 1970')
    })
  })

  describe('no token / secret / PII leakage', () => {
    it('never returns tokens or secrets in the callback-session response body', async () => {
      installFetchMock()
      const { handleCallbackSession, cookieHeader, nonce, state } = await loginAndPrepare()
      resolveIdToken({ sub: 'admin-subject', exp: 4_102_444_800, nonce, sid: 'sso-session-id' })

      const response = await handleCallbackSession(
        requestWithBody(cookieHeader, { code: 'c', state }),
      )

      expect(response.status).toBe(200)
      const body = String(response.body)
      expect(JSON.parse(body)).toMatchObject({
        authenticated: true,
        post_login_redirect: '/dashboard',
      })
      for (const secret of SECRETS) {
        expect(body).not.toContain(secret)
      }
    })

    it('does not log tokens or secrets on a successful login', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      installFetchMock()
      const { handleCallback, cookieHeader, nonce, state } = await loginAndPrepare()
      resolveIdToken({ sub: 'admin-subject', exp: 4_102_444_800, nonce })

      await handleCallback(requestWithCookie(cookieHeader), callbackUrl(state))

      const logged = [...errorSpy.mock.calls, ...logSpy.mock.calls]
        .flat()
        .map((arg) => String(arg))
        .join('\n')
      for (const secret of SECRETS) {
        expect(logged).not.toContain(secret)
      }
    })

    it('does not log tokens or secrets when a callback fails', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      installFetchMock()
      const { handleCallback, cookieHeader, state } = await loginAndPrepare()
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: { sub: 'admin-subject', exp: 4_102_444_800, nonce: 'wrong-nonce' },
        protectedHeader: { alg: 'RS256' },
      } as unknown as Awaited<ReturnType<typeof jwtVerify>>)

      await handleCallback(requestWithCookie(cookieHeader), callbackUrl(state))

      const logged = errorSpy.mock.calls
        .flat()
        .map((arg) => String(arg))
        .join('\n')
      // The failure IS logged for audit (event + subject), but never with tokens/secrets.
      expect(logged).toContain('sso_admin_callback_failed')
      for (const secret of SECRETS) {
        expect(logged).not.toContain(secret)
      }
    })
  })
})
