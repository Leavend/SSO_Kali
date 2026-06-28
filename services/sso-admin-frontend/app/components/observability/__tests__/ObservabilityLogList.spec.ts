import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ObservabilityLogList from '../ObservabilityLogList.vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import type { ObservabilityLogEvent } from '@/types/observability.types'

const logs: readonly ObservabilityLogEvent[] = [
  {
    id: 'evt-1',
    service: 'backend',
    severity: 'info',
    message: 'Token issued',
    reference: 'corr-0123456789abcdef',
    occurred_at: '2026-06-28T14:32:15Z',
  },
  {
    id: 'evt-2',
    service: 'portal',
    severity: 'warning',
    message: 'Slow upstream',
    occurred_at: '2026-06-28T14:31:00Z',
  },
  {
    id: 'evt-3',
    service: 'mailer',
    severity: 'error',
    message: 'Delivery failed',
    reference: null,
    occurred_at: '2026-06-28T14:30:00Z',
  },
]

function mountList() {
  return mount(ObservabilityLogList, {
    props: {
      caption: 'Peristiwa Terbaru',
      timeLabel: 'Waktu',
      messageLabel: 'Pesan',
      logs,
    },
  })
}

describe('ObservabilityLogList', () => {
  it('renders the caption, each service, message, and timestamp', () => {
    const wrapper = mountList()
    expect(wrapper.text()).toContain('Peristiwa Terbaru')
    expect(wrapper.text()).toContain('backend')
    expect(wrapper.text()).toContain('Token issued')
    expect(wrapper.text()).toContain('Delivery failed')
    expect(wrapper.text()).toContain('2026-06-28T14:32:15Z')
  })

  it('renders severity as a status badge (label + tone, never colour-alone)', () => {
    const wrapper = mountList()
    const statuses = wrapper.findAllComponents(UiStatusBadge).map((b) => b.props('status'))
    expect(statuses).toContain('info')
    expect(statuses).toContain('warning')
    expect(statuses).toContain('error')
  })

  it('masks the correlation reference to REF- and never renders the raw id', () => {
    const wrapper = mountList()
    expect(wrapper.text()).toContain('REF-')
    expect(wrapper.text()).not.toContain('corr-0123456789abcdef')
  })
})
