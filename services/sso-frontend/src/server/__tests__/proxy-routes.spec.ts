import { describe, expect, it } from 'vitest'
import { shouldProxyPortalPath } from '../proxy-routes.js'

describe('portal BFF proxy route inventory', () => {
  it('proxies protocol endpoints needed by FR-036 and FR-043', () => {
    expect(shouldProxyPortalPath('/introspect')).toBe(true)
    expect(shouldProxyPortalPath('/oauth2/introspect')).toBe(true)
    expect(shouldProxyPortalPath('/connect/logout')).toBe(true)
    expect(shouldProxyPortalPath('/connect/logout/frontchannel')).toBe(true)
  })

  it('keeps portal back-channel logout as a local BFF endpoint', () => {
    expect(shouldProxyPortalPath('/auth/backchannel/logout')).toBe(false)
  })

  it('proxies SSO completion so logged-in portal users can finish admin authorize requests', () => {
    expect(shouldProxyPortalPath('/connect/sso-complete')).toBe(true)
  })

  it('proxies hosted account widget routes through the browser-facing SSO origin', () => {
    expect(shouldProxyPortalPath('/widget/apps')).toBe(true)
    expect(shouldProxyPortalPath('/widget/accounts')).toBe(true)
    expect(shouldProxyPortalPath('/widget/switch')).toBe(true)
    expect(shouldProxyPortalPath('/widget/logout')).toBe(true)
  })

  it('keeps bearer-only admin APIs out of the raw browser proxy route list', () => {
    expect(shouldProxyPortalPath('/admin/api/me')).toBe(false)
    expect(shouldProxyPortalPath('/admin/api/oidc-foundation')).toBe(false)
  })
})
