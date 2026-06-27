// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('admin BFF user API', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('VITE_SSO_BASE_URL', 'https://api-sso.example.test')
    vi.stubEnv('VITE_ADMIN_BASE_URL', 'https://admin-sso.example.test')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

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
})
