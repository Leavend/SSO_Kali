import { beforeEach, describe, expect, it } from 'vitest'
import { handleIdentityUiRedirect } from '../server/auth-handlers'

describe('identity UI redirects', () => {
  beforeEach(() => {
    process.env.SSO_IDENTITY_UI_BASE_URL = 'https://id.dev-sso.timeh.my.id/ui/v2/login'
  })

  it('preserves login_hint for password reset and registration links', () => {
    const response = handleIdentityUiRedirect(
      new URL('https://dev-sso.timeh.my.id/auth/register?login_hint=admin%40example.com'),
      'register',
    )

    expect(response.status).toBe(302)
    expect(response.headers?.location).toBe(
      'https://id.dev-sso.timeh.my.id/ui/v2/login/register?login_hint=admin%40example.com',
    )
    expect(response.headers?.['cache-control']).toContain('no-store')
  })
})
