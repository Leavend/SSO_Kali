import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ObservabilityServiceList from '../ObservabilityServiceList.vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import type { ObservabilityService } from '@/types/observability.types'

const services: readonly ObservabilityService[] = [
  {
    key: 'backend',
    name: 'Identity Provider',
    status: 'healthy',
    summary: 'All checks passing',
    latency_p95_ms: 142,
    freshness_seconds: 30,
    queue: { pending_jobs: 4, failed_jobs: 0, oldest_pending_age_seconds: 12 },
  },
  {
    key: 'portal',
    name: 'Portal BFF',
    status: 'degraded',
    summary: 'Elevated latency',
    latency_p95_ms: 980,
    freshness_seconds: 60,
  },
  {
    key: 'mailer',
    name: 'Mailer',
    status: 'down',
    summary: 'No heartbeat',
  },
  {
    key: 'docs',
    name: 'Docs',
    status: 'unknown',
    summary: 'No probe configured',
  },
]

function mountList() {
  return mount(ObservabilityServiceList, {
    props: {
      caption: 'Layanan',
      nameLabel: 'Layanan',
      statusLabel: 'Status',
      services,
    },
  })
}

describe('ObservabilityServiceList', () => {
  it('renders the caption, every service name, and its summary', () => {
    const wrapper = mountList()
    expect(wrapper.text()).toContain('Layanan')
    expect(wrapper.text()).toContain('Identity Provider')
    expect(wrapper.text()).toContain('Portal BFF')
    expect(wrapper.text()).toContain('Mailer')
    expect(wrapper.text()).toContain('All checks passing')
    expect(wrapper.text()).toContain('No heartbeat')
  })

  it('maps each service status to a tone via resolveServiceStatusTone (tone + label, never colour-alone)', () => {
    const wrapper = mountList()
    const badges = wrapper.findAllComponents(UiStatusBadge)
    const tones = badges.map((b) => b.props('tone'))
    expect(tones).toContain('success') // healthy
    expect(tones).toContain('warning') // degraded
    expect(tones).toContain('danger') // down
    expect(tones).toContain('neutral') // unknown
    // every badge pairs the tone with a real text label
    expect(badges.every((b) => Boolean(b.props('label')))).toBe(true)
    expect(wrapper.text()).toContain('down')
  })

  it('renders latency / freshness / queue as folio numerals when present', () => {
    const wrapper = mountList()
    expect(wrapper.text()).toContain('142')
    expect(wrapper.text()).toContain('980')
    expect(wrapper.text()).toContain('4/0') // queue pending/failed
  })
})
