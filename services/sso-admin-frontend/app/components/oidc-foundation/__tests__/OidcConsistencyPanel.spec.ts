// app/components/oidc-foundation/__tests__/OidcConsistencyPanel.spec.ts
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import OidcConsistencyPanel from '@/components/oidc-foundation/OidcConsistencyPanel.vue'
import type { OidcEndpointConsistency, OidcIssuerConsistency } from '@/types/oidc-foundation.types'

const LABELS = {
  title: 'Consistency', issuerTitle: 'Issuer', configured: 'Configured issuer', discovered: 'Discovery issuer',
  publicBase: 'Public base URL', lastChecked: 'Last checked', endpointTitle: 'Endpoints', caption: 'Endpoint consistency',
  name: 'Endpoint', discoveredUrl: 'Discovered', expectedUrl: 'Expected', status: 'Status',
}
const ISSUER: OidcIssuerConsistency = {
  status: 'pass', configured_issuer: 'https://sso.example/oidc', discovery_issuer: 'https://sso.example/oidc',
  public_base_url: 'https://sso.example', last_checked_at: '2026-06-28T10:00:00Z',
}
const ENDPOINTS: OidcEndpointConsistency[] = [
  { name: 'token', discovered_url: 'https://sso.example/oauth/token', expected_url: 'https://sso.example/oauth/token', status: 'pass' },
  { name: 'jwks', discovered_url: 'https://sso.example/oauth/jwks', expected_url: 'https://sso.example/oauth/keys', status: 'mismatch' },
]

describe('OidcConsistencyPanel', () => {
  it('renders issuer consistency + endpoint table with status tones', () => {
    const w = mount(OidcConsistencyPanel, { props: { issuerConsistency: ISSUER, endpointConsistency: ENDPOINTS, labels: LABELS } })
    expect(w.find('[data-testid="oidc-consistency"]').exists()).toBe(true)
    expect(w.find('[data-testid="oidc-issuer-status"]').attributes('data-tone')).toBe('success')
    expect(w.text()).toContain('https://sso.example/oauth/keys')
  })
})
