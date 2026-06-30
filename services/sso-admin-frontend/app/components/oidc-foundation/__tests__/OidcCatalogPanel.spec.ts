// app/components/oidc-foundation/__tests__/OidcCatalogPanel.spec.ts
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import OidcCatalogPanel from '@/components/oidc-foundation/OidcCatalogPanel.vue'
import type { OidcFoundationSnapshot } from '@/types/oidc-foundation.types'

const LABELS = {
  title: 'Catalog', scopesTitle: 'Scopes', claimsTitle: 'Claims', algorithmsTitle: 'Algorithms',
  scopeName: 'Scope', scopeLabel: 'Label', scopeDescription: 'Description', scopeStatus: 'Label status',
  claimName: 'Claim', claimScope: 'Scope dependency', claimSensitivity: 'Sensitivity',
  algName: 'Algorithm', algUsage: 'Usage', algStatus: 'Status',
  captionScopes: 'Scope catalog', captionClaims: 'Claim catalog', captionAlgorithms: 'Algorithm catalog',
}
const CATALOG: OidcFoundationSnapshot['catalog'] = {
  scopes: [{ name: 'openid', label: 'OpenID', description: 'Base scope', label_status: 'mapped' }],
  claims: [{ name: 'email', scope_dependency: 'email', sensitivity: 'pii' }],
  algorithms: [{ name: 'RS256', usage: 'id_token', status: 'active' }],
}

describe('OidcCatalogPanel', () => {
  it('renders the scope / claim / algorithm tables', () => {
    const w = mount(OidcCatalogPanel, { props: { catalog: CATALOG, labels: LABELS } })
    expect(w.find('[data-testid="oidc-catalog"]').exists()).toBe(true)
    expect(w.text()).toContain('openid')
    expect(w.text()).toContain('mapped')
    expect(w.text()).toContain('email')
    expect(w.text()).toContain('RS256')
  })
})
