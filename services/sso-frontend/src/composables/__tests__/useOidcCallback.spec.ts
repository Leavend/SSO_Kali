import { afterEach, describe, expect, it, vi } from 'vitest'
import { useOidcCallback } from '../useOidcCallback'
import * as callbackApi from '@/services/oidc-callback.api'

describe('useOidcCallback', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fails with missing_params when code or state absent', async () => {
    const callback = useOidcCallback()
    const result = await callback.handle({})

    expect(result).toBeNull()
    expect(callback.error.value).toBe('missing_params')
  })

  it('forwards authorize_error when provider returns error param', async () => {
    const callback = useOidcCallback()
    const result = await callback.handle({
      error: 'access_denied',
      error_description: 'User declined',
    })

    expect(result).toBeNull()
    expect(callback.error.value).toBe('authorize_error')
    expect(callback.errorDescription.value).toBe('User declined')
  })

  it('submits only code/state to same-origin BFF and never handles OAuth tokens', async () => {
    const complete = vi.spyOn(callbackApi, 'completeOidcCallback').mockResolvedValue({
      authenticated: true,
      post_login_redirect: '/home',
    })

    const callback = useOidcCallback()
    const result = await callback.handle({ code: 'auth-code', state: 'csrf-state' })

    expect(complete).toHaveBeenCalledWith({ code: 'auth-code', state: 'csrf-state' })
    expect(result).toEqual({ authenticated: true, post_login_redirect: '/home' })
    expect(JSON.stringify(result)).not.toContain('access_token')
    expect(JSON.stringify(result)).not.toContain('refresh_token')
    expect(JSON.stringify(result)).not.toContain('id_token')
    expect(callback.error.value).toBeNull()
  })

  it('fails when BFF session exchange rejects', async () => {
    vi.spyOn(callbackApi, 'completeOidcCallback').mockRejectedValue(new Error('boom'))

    const callback = useOidcCallback()
    const result = await callback.handle({ code: 'c', state: 's' })

    expect(result).toBeNull()
    expect(callback.error.value).toBe('session_exchange_failed')
  })
})
