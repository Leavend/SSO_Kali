import { describe, expect, it } from 'vitest'
import { shouldProxyPortalPath } from '../proxy-routes.js'

describe('portal BFF proxy route inventory', () => {
  it('proxies protocol endpoints needed by FR-036 and FR-043', () => {
    expect(shouldProxyPortalPath('/introspect')).toBe(true)
    expect(shouldProxyPortalPath('/oauth2/introspect')).toBe(true)
    expect(shouldProxyPortalPath('/connect/logout')).toBe(true)
    expect(shouldProxyPortalPath('/connect/logout/frontchannel')).toBe(true)
  })
})
