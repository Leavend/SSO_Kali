import { afterEach, describe, expect, it, vi } from 'vitest'
import { completeOidcCallback } from '../oidc-callback.api'

describe('completeOidcCallback', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('submits code/state to the same-origin BFF only', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ authenticated: true, post_login_redirect: '/home' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const result = await completeOidcCallback({ code: 'code-123', state: 'state-123' })

    expect(fetchMock).toHaveBeenCalledWith('/auth/callback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ code: 'code-123', state: 'state-123' }),
    })
    expect(result).toEqual({ authenticated: true, post_login_redirect: '/home' })
    expect(JSON.stringify(result)).not.toContain('access_token')
    expect(JSON.stringify(result)).not.toContain('refresh_token')
    expect(JSON.stringify(result)).not.toContain('id_token')
  })
})
