import { afterEach, describe, expect, it, vi } from 'vitest'

import { resolveWidgetBaseUrl } from '@/services/sso-account-widget.api'

describe('sso account widget base host', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('is same-origin (relative) by default so the host-only __Host-sso_session cookie is sent', () => {
    vi.stubEnv('VITE_SSO_BASE_URL', 'https://api-sso.timeh.my.id')
    vi.stubEnv('VITE_OIDC_ISSUER', 'https://api-sso.timeh.my.id')
    vi.stubEnv('VITE_ZITADEL_ISSUER_URL', 'https://api-sso.timeh.my.id')
    vi.stubEnv('VITE_SSO_FRONTEND_BASE_URL', 'https://sso.timeh.my.id')
    vi.stubEnv('VITE_SSO_WIDGET_BASE_URL', '')

    // Same-origin: the admin BFF proxies /widget/* to the backend and holds the
    // locally-minted __Host-sso_session on the admin origin. A relative base
    // keeps the credentialed fetch first-party, so the cookie is always sent.
    expect(resolveWidgetBaseUrl()).toBe('')
  })

  it('does NOT cross-origin to the front-door host by default (WACC2 supersedes WACC1)', () => {
    vi.stubEnv('VITE_SSO_FRONTEND_BASE_URL', 'https://sso.timeh.my.id')
    vi.stubEnv('VITE_SSO_WIDGET_BASE_URL', '')

    const resolved = resolveWidgetBaseUrl()
    expect(resolved).not.toContain('sso.timeh.my.id')
    expect(resolved).not.toContain('api-sso')
  })

  it('honours an explicit VITE_SSO_WIDGET_BASE_URL override as a documented fallback', () => {
    vi.stubEnv('VITE_SSO_WIDGET_BASE_URL', 'https://sso.timeh.my.id')

    expect(resolveWidgetBaseUrl()).toBe('https://sso.timeh.my.id')
  })

  it('strips a trailing slash from an explicit override', () => {
    vi.stubEnv('VITE_SSO_WIDGET_BASE_URL', 'https://sso.timeh.my.id/')

    expect(resolveWidgetBaseUrl()).toBe('https://sso.timeh.my.id')
  })
})
