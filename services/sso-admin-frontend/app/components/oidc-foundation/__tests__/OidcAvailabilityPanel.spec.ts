// app/components/oidc-foundation/__tests__/OidcAvailabilityPanel.spec.ts
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import OidcAvailabilityPanel from '@/components/oidc-foundation/OidcAvailabilityPanel.vue'
import type { OidcFoundationSnapshot } from '@/types/oidc-foundation.types'

const LABELS = {
  title: 'Availability', httpStatus: 'HTTP', latency: 'Latency (ms)',
  lastChecked: 'Last checked', rotationTitle: 'JWKS rotation', rotationEnvironment: 'Environment',
  rotationDrill: 'Latest drill', rotationSignoff: 'Operator signoff', timelineTitle: 'Availability timeline',
}
const AVAILABILITY: OidcFoundationSnapshot['availability'] = {
  discovery: { name: 'Discovery', status: 'healthy', http_status: 200, latency_ms: 42, last_checked_at: '2026-06-28T10:00:00Z', evidence_ref: null },
  jwks: { name: 'JWKS', status: 'unavailable', http_status: 503, latency_ms: null, last_checked_at: '2026-06-28T10:00:00Z', evidence_ref: null },
}
const EVIDENCE: OidcFoundationSnapshot['evidence'] = {
  jwks_rotation: { status: 'recorded', label: 'Rotation drill', environment: 'production', latest_drill_at: '2026-05-30T00:00:00Z', operator_signoff: 'ops', evidence_ref: null },
  availability_timeline: [{ status: 'available', label: 'Daily probe', checked_at: '2026-06-28T00:00:00Z', evidence_ref: null }],
}

describe('OidcAvailabilityPanel', () => {
  it('renders endpoint availability + rotation evidence + timeline', () => {
    const w = mount(OidcAvailabilityPanel, { props: { availability: AVAILABILITY, evidence: EVIDENCE, labels: LABELS } })
    expect(w.find('[data-testid="oidc-availability"]').exists()).toBe(true)
    const jwks = w.find('[data-testid="oidc-availability-jwks"]')
    expect(jwks.attributes('data-tone')).toBe('danger') // unavailable
    expect(w.text()).toContain('Rotation drill')
    expect(w.text()).toContain('Daily probe')
  })
})
