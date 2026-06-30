// app/components/oidc-foundation/__tests__/OidcJwksPanel.spec.ts
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import OidcJwksPanel from '@/components/oidc-foundation/OidcJwksPanel.vue'
import type { OidcJwksKey } from '@/types/oidc-foundation.types'

const LABELS = {
  title: 'JWKS', caption: 'JWKS keys', kid: 'Key ID', alg: 'Algorithm',
  use: 'Use', status: 'Status', published: 'Published', rotated: 'Rotated',
}
const KEYS: OidcJwksKey[] = [
  { kid: 'key-2026-a', alg: 'RS256', use: 'sig', status: 'published', published_at: '2026-05-01T00:00:00Z', rotated_at: null },
  { kid: 'key-2025-z', alg: 'RS256', use: 'sig', status: 'rotated', published_at: '2025-01-01T00:00:00Z', rotated_at: '2026-05-01T00:00:00Z' },
]

describe('OidcJwksPanel', () => {
  it('renders a row per key with kid + a healthy badge for the published key', () => {
    const w = mount(OidcJwksPanel, { props: { keys: KEYS, labels: LABELS } })
    expect(w.find('[data-testid="oidc-jwks"]').exists()).toBe(true)
    expect(w.text()).toContain('key-2026-a')
    expect(w.text()).toContain('published') // the real backend key status
    expect(w.text()).toContain('RS256')
    // a published key reads as success (resolveJwksKeyTone), shown as tone + label
    const badges = w.findAll('.status')
    expect(badges.some((b) => b.attributes('data-tone') === 'success')).toBe(true)
  })
})
