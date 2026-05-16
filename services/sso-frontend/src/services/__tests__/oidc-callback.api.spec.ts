import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '@/lib/api/api-client'
import { completeOidcCallback } from '../oidc-callback.api'

describe('completeOidcCallback', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('submits code/state through the central same-origin apiClient', async () => {
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({
      authenticated: true,
      post_login_redirect: '/home',
    })

    const result = await completeOidcCallback({ code: 'code-123', state: 'state-123' })

    expect(postSpy).toHaveBeenCalledWith('/auth/callback', {
      code: 'code-123',
      state: 'state-123',
    })
    expect(result).toEqual({ authenticated: true, post_login_redirect: '/home' })
    expect(JSON.stringify(result)).not.toContain('access_token')
    expect(JSON.stringify(result)).not.toContain('refresh_token')
    expect(JSON.stringify(result)).not.toContain('id_token')
  })
})
