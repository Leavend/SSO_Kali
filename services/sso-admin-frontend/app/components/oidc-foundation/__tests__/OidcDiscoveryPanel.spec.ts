// app/components/oidc-foundation/__tests__/OidcDiscoveryPanel.spec.ts
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import OidcDiscoveryPanel from '@/components/oidc-foundation/OidcDiscoveryPanel.vue'
import type { OidcDiscoveryMetadata } from '@/types/oidc-foundation.types'

const LABELS = {
  title: 'Discovery',
  issuer: 'Issuer',
  authorization: 'Authorization endpoint',
  token: 'Token endpoint',
  jwksUri: 'JWKS URI',
  userinfo: 'Userinfo endpoint',
  responseTypes: 'Response types',
  grantTypes: 'Grant types',
  scopes: 'Scopes',
  claims: 'Claims',
  signingAlgs: 'ID token signing algorithms',
}

const DISCOVERY: OidcDiscoveryMetadata = {
  issuer: 'https://sso.example/oidc',
  authorization_endpoint: 'https://sso.example/oauth/authorize',
  token_endpoint: 'https://sso.example/oauth/token',
  jwks_uri: 'https://sso.example/oauth/jwks',
  userinfo_endpoint: 'https://sso.example/oauth/userinfo',
  response_types_supported: ['code'],
  grant_types_supported: ['authorization_code', 'refresh_token'],
  scopes_supported: ['openid', 'profile', 'email'],
  claims_supported: ['sub', 'email'],
  id_token_signing_alg_values_supported: ['RS256'],
}

describe('OidcDiscoveryPanel', () => {
  it('renders the issuer + endpoints + supported lists', () => {
    const w = mount(OidcDiscoveryPanel, { props: { discovery: DISCOVERY, labels: LABELS } })
    expect(w.find('[data-testid="oidc-discovery"]').exists()).toBe(true)
    expect(w.text()).toContain('https://sso.example/oidc')
    expect(w.text()).toContain('https://sso.example/oauth/jwks')
    expect(w.text()).toContain('authorization_code, refresh_token')
    expect(w.text()).toContain('openid, profile, email')
    expect(w.text()).toContain('RS256')
  })
})
