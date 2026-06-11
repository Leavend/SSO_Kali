import { describe, expect, it } from 'vitest'

import { getAdminEnvironment } from '@/config/adminEnvironment'

describe('getAdminEnvironment', () => {
  it('provides production-safe defaults for canary builds', () => {
    expect(getAdminEnvironment()).toMatchObject({
      adminBaseUrl: 'https://dev-sso.timeh.my.id',
      publicBasePath: '/__vue-preview',
      ssoBaseUrl: 'https://dev-sso.timeh.my.id',
      zitadelIssuerUrl: 'https://id.dev-sso.timeh.my.id',
      docsBaseUrl: 'https://docs.sso.timeh.my.id',
      VITE_ADMIN_DASHBOARD_POLL_MS: '30000',
      VITE_ADMIN_USERS_POLL_MS: '45000',
    })
  })
})
