// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('admin BFF user API', () => {
  beforeEach(() => {
    vi.resetModules()
    // M-1: stub ADMIN_OIDC_ISSUER (authoritative runtime var) instead of
    // VITE_SSO_BASE_URL (build-only var, unreliable at Node runtime).
    vi.stubEnv('ADMIN_OIDC_ISSUER', 'https://api-sso.example.test')
    vi.stubEnv('VITE_ADMIN_BASE_URL', 'https://admin-sso.example.test')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  // -------------------------------------------------------------------------
  // Existing tests (M-1 applied: VITE_SSO_BASE_URL → ADMIN_OIDC_ISSUER)
  // -------------------------------------------------------------------------

  it('maps the userinfo response to a principal and authenticates the request', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        calls.push({ url: input.toString(), init })
        return Response.json({
          sub: 'sub-admin',
          email: 'admin@example.test',
          name: 'Admin User',
          roles: ['admin', 'auditor'],
          auth_time: 1_780_000_000,
          amr: ['pwd'],
          acr: 'urn:timeh:aal1',
          last_login_at: '2026-06-01T00:00:00Z',
        })
      }),
    )

    const { fetchPrincipalWithAccessToken } = await import('../utils/user-api')
    const principal = await fetchPrincipalWithAccessToken('access-token', { requestId: 'req-1' })

    expect(principal.subjectId).toBe('sub-admin')
    expect(principal.role).toBe('admin')
    expect(principal.displayName).toBe('Admin User')
    expect(principal.authContext.amr).toEqual(['pwd'])
    expect(principal.lastLoginAt).toBe('2026-06-01T00:00:00Z')

    expect(calls[0]?.url).toBe('https://api-sso.example.test/userinfo')
    const headers = new Headers(calls[0]?.init?.headers)
    expect(headers.get('authorization')).toBe('Bearer access-token')
    expect(headers.get('accept-encoding')).toBe('identity')
    expect(headers.get('x-request-id')).toBe('req-1')
  })

  it('throws a typed UserApiError when userinfo returns a non-2xx response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ error: 'reauth_required', message: 'Sesi kedaluwarsa.' }, { status: 401 }),
      ),
    )

    const { fetchPrincipalWithAccessToken } = await import('../utils/user-api')
    await expect(
      fetchPrincipalWithAccessToken('expired', { requestId: 'req-2' }),
    ).rejects.toMatchObject({
      status: 401,
      code: 'reauth_required',
      message: 'Sesi kedaluwarsa.',
    })
  })

  // -------------------------------------------------------------------------
  // Profile-path Bearer injection
  // -------------------------------------------------------------------------

  describe('profile-path Bearer injection', () => {
    // Minimal PortalSession shape — only accessToken is used by profileFetch.
    const SESSION = {
      accessToken: 'tok-secret',
      idToken: 'id-tok',
      refreshToken: 'ref-tok',
      sub: 'u-1',
      subject: 'u-1',
      email: 'user@example.test',
      displayName: 'User',
      role: 'admin',
      expiresAt: 9_999_999_999,
      authTime: null,
      amr: [],
      acr: null,
      lastLoginAt: null,
      issuedAt: 1_000_000,
      absoluteExpiresAt: 9_999_999_999,
      lastRefreshedAt: 1_000_000,
    } as const

    beforeEach(() => {
      // Distinct from ADMIN_OIDC_ISSUER so the test proves internalBaseUrl is used.
      vi.stubEnv('SSO_INTERNAL_BASE_URL', 'https://internal.example.test')
    })

    it('fetchProfile hits internalBaseUrl /api/profile with Bearer token', async () => {
      const calls: Array<{ url: string; init?: RequestInit }> = []
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: string | URL, init?: RequestInit) => {
          calls.push({ url: input.toString(), init })
          return Response.json({
            profile: { subject_id: 'u-1', status: 'active' },
            authorization: { scope: 'openid' },
            security: {},
          })
        }),
      )

      const { fetchProfile } = await import('../utils/user-api')
      await fetchProfile(SESSION as any, { requestId: 'req-p1' })

      // Must hit the internal base, NOT the public issuer.
      expect(calls[0]?.url).toBe('https://internal.example.test/api/profile')
      const headers = new Headers(calls[0]?.init?.headers)
      expect(headers.get('authorization')).toBe('Bearer tok-secret')
      expect(headers.get('x-request-id')).toBe('req-p1')
    })

    it('fetchProfile throws UserApiError on non-2xx, access token absent from error', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          Response.json({ error: 'reauth_required', message: 'Token expired.' }, { status: 401 }),
        ),
      )

      const { fetchProfile } = await import('../utils/user-api')
      let caught: unknown
      try {
        await fetchProfile(SESSION as any, { requestId: 'req-p2' })
      } catch (e) {
        caught = e
      }

      expect(caught).toMatchObject({ status: 401, code: 'reauth_required' })
      // Access token must NOT be present on the thrown error object.
      expect((caught as any).accessToken).toBeUndefined()
    })

    it('revokeMySession sends DELETE with Bearer to /api/profile/sessions/:id', async () => {
      const calls: Array<{ url: string; init?: RequestInit }> = []
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: string | URL, init?: RequestInit) => {
          calls.push({ url: input.toString(), init })
          return Response.json({})
        }),
      )

      const { revokeMySession } = await import('../utils/user-api')
      await revokeMySession(SESSION as any, 'sess-abc', { requestId: 'req-rs' })

      expect(calls[0]?.url).toBe('https://internal.example.test/api/profile/sessions/sess-abc')
      const headers = new Headers(calls[0]?.init?.headers)
      expect(headers.get('authorization')).toBe('Bearer tok-secret')
      expect((calls[0]!.init as RequestInit).method).toBe('DELETE')
    })
  })

  // -------------------------------------------------------------------------
  // buildUserApiError normalization table
  // -------------------------------------------------------------------------

  describe('buildUserApiError normalization', () => {
    it('403 → fallback message, null code, empty violations', async () => {
      const { buildUserApiError } = await import('../utils/user-api-error')
      // Empty JSON body → payloadMessage returns null fields → fallback triggers.
      const res = Response.json({}, { status: 403 })
      const err = await buildUserApiError(res)
      expect(err.status).toBe(403)
      expect(err.code).toBeNull()
      expect(err.message).toBe('Akses ke sumber daya ini tidak diizinkan.')
      expect(err.violations).toEqual([])
    })

    it('422 → extracts code + message + violations array', async () => {
      const { buildUserApiError } = await import('../utils/user-api-error')
      const body = JSON.stringify({
        error: 'validation_error',
        message: 'Validasi gagal.',
        violations: ['field_a is required', 'field_b too long'],
      })
      const res = new Response(body, {
        status: 422,
        headers: { 'content-type': 'application/json' },
      })
      const err = await buildUserApiError(res)
      expect(err.status).toBe(422)
      expect(err.code).toBe('validation_error')
      expect(err.message).toBe('Validasi gagal.')
      expect(err.violations).toEqual(['field_a is required', 'field_b too long'])
    })

    it('429 → fallback "too many attempts" message when body carries no message', async () => {
      const { buildUserApiError } = await import('../utils/user-api-error')
      const res = Response.json({}, { status: 429 })
      const err = await buildUserApiError(res)
      expect(err.status).toBe(429)
      expect(err.message).toBe('Terlalu banyak percobaan. Coba lagi dalam beberapa saat.')
    })

    it('5xx → fallback "service unavailable" message', async () => {
      const { buildUserApiError } = await import('../utils/user-api-error')
      const res = Response.json({}, { status: 503 })
      const err = await buildUserApiError(res)
      expect(err.status).toBe(503)
      expect(err.message).toBe('Layanan SSO sedang tidak tersedia. Silakan coba lagi.')
    })

    it('text/plain body → uses body text as message, null code', async () => {
      const { buildUserApiError } = await import('../utils/user-api-error')
      const res = new Response('Gateway timeout from upstream', {
        status: 504,
        headers: { 'content-type': 'text/plain' },
      })
      const err = await buildUserApiError(res)
      expect(err.status).toBe(504)
      expect(err.message).toBe('Gateway timeout from upstream')
      expect(err.code).toBeNull()
    })

    it('body-less text/plain response → falls back to status-derived message', async () => {
      const { buildUserApiError } = await import('../utils/user-api-error')
      const res = new Response('', {
        status: 503,
        headers: { 'content-type': 'text/plain' },
      })
      const err = await buildUserApiError(res)
      expect(err.status).toBe(503)
      // textPayload returns null for empty body; fallbackMessage kicks in.
      expect(err.message).toBe('Layanan SSO sedang tidak tersedia. Silakan coba lagi.')
    })
  })

  // -------------------------------------------------------------------------
  // SSR-guard predicates
  // -------------------------------------------------------------------------

  describe('UserApiError predicates', () => {
    it('isReauthRequiredApiError: true for reauth_required code, false otherwise', async () => {
      const { UserApiError, isReauthRequiredApiError } = await import('../utils/user-api-error')
      const match = new UserApiError(401, 'Sesi kedaluwarsa.', 'reauth_required')
      const wrongCode = new UserApiError(401, 'Other.', 'mfa_required')
      expect(isReauthRequiredApiError(match)).toBe(true)
      expect(isReauthRequiredApiError(wrongCode)).toBe(false)
      expect(isReauthRequiredApiError(new Error('plain error'))).toBe(false)
      expect(isReauthRequiredApiError(null)).toBe(false)
    })

    it('isMfaRequiredApiError: true for mfa_required code, false otherwise', async () => {
      const { UserApiError, isMfaRequiredApiError } = await import('../utils/user-api-error')
      const match = new UserApiError(403, 'MFA needed.', 'mfa_required')
      const wrongCode = new UserApiError(403, 'Other.', 'reauth_required')
      expect(isMfaRequiredApiError(match)).toBe(true)
      expect(isMfaRequiredApiError(wrongCode)).toBe(false)
      expect(isMfaRequiredApiError(undefined)).toBe(false)
    })

    it('isTooManyAttemptsApiError: true for status 429 OR too_many_attempts code', async () => {
      const { UserApiError, isTooManyAttemptsApiError } = await import('../utils/user-api-error')
      const byCode = new UserApiError(400, 'Rate limited.', 'too_many_attempts')
      const byStatus = new UserApiError(429, 'Rate limited.', null)
      const neither = new UserApiError(400, 'Bad request.', 'other_error')
      expect(isTooManyAttemptsApiError(byCode)).toBe(true)
      expect(isTooManyAttemptsApiError(byStatus)).toBe(true)
      expect(isTooManyAttemptsApiError(neither)).toBe(false)
      expect(isTooManyAttemptsApiError('not an error')).toBe(false)
    })
  })
})
