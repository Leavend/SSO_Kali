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

  it('forwards authorize_error and maps known OAuth code to safe localized copy', async () => {
    const callback = useOidcCallback()
    const result = await callback.handle({
      error: 'access_denied',
      error_description: 'SQLSTATE[23505] sensitive backend trace',
    })

    expect(result).toBeNull()
    expect(callback.error.value).toBe('authorize_error')
    expect(callback.errorCode.value).toBe('access_denied')
    expect(callback.errorMessage.value).toBeTypeOf('string')
    expect(callback.errorMessage.value).not.toContain('SQLSTATE')
    expect(callback.errorMessage.value).not.toContain('sensitive backend trace')
  })

  it('falls back to a generic message for unknown OAuth error codes', async () => {
    const callback = useOidcCallback()
    const result = await callback.handle({
      error: 'totally_unknown',
      error_description: 'rm -rf /',
    })

    expect(result).toBeNull()
    expect(callback.error.value).toBe('authorize_error')
    expect(callback.errorMessage.value).toBeTypeOf('string')
    expect(callback.errorMessage.value).not.toContain('rm -rf')
  })

  it.each(['login_required', 'consent_required', 'invalid_scope', 'mfa_enrollment_required'])(
    'maps %s to a localized non-empty message without exposing description',
    async (code) => {
      const callback = useOidcCallback()
      await callback.handle({ error: code, error_description: '<script>steal()</script>' })

      expect(callback.error.value).toBe('authorize_error')
      expect(callback.errorCode.value).toBe(code)
      expect(callback.errorMessage.value).toBeTypeOf('string')
      expect(callback.errorMessage.value!.length).toBeGreaterThan(0)
      expect(callback.errorMessage.value).not.toContain('<script>')
    },
  )

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
