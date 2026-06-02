import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSsoCompletion } from '../useSsoCompletion'

describe('useSsoCompletion', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('posts auth_request_id with cookie credentials and returns redirect_uri', async () => {
    const fetchMock = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>(() =>
      Promise.resolve(Response.json({ redirect_uri: 'https://admin-sso.test/auth/callback?code=c' })),
    )
    vi.stubGlobal('fetch', fetchMock)

    const redirectUri = await useSsoCompletion().complete('auth-req-1')

    expect(fetchMock).toHaveBeenCalledWith('/connect/sso-complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auth_request_id: 'auth-req-1' }),
      credentials: 'include',
    })
    expect(redirectUri).toBe('https://admin-sso.test/auth/callback?code=c')
  })

  it('returns null when completion endpoint is not available', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>(() =>
        Promise.resolve(new Response('not found', { status: 404 })),
      ),
    )

    await expect(useSsoCompletion().complete('auth-req-1')).resolves.toBeNull()
  })
})
