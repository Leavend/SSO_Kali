import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import DashboardMetricGroup, { type DashboardMetricRow } from '../DashboardMetricGroup.vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'

const rows: readonly DashboardMetricRow[] = [
  { id: 'users.total', label: 'Total Akun', value: 1250, tone: 'neutral' },
  { id: 'users.active', label: 'Pengguna Aktif', value: 1100, tone: 'success' },
  { id: 'users.locked', label: 'Akun Terkunci', value: 3, tone: 'danger' },
  { id: 'users.deactivated', label: 'Deaktivasi', value: null, tone: 'neutral' },
]

function mountGroup() {
  return mount(DashboardMetricGroup, {
    props: { caption: 'Pengguna', metricLabel: 'Metrik', countLabel: 'Jumlah', rows },
  })
}

describe('DashboardMetricGroup', () => {
  it('renders the caption and every metric label', () => {
    const wrapper = mountGroup()
    expect(wrapper.text()).toContain('Pengguna')
    expect(wrapper.text()).toContain('Total Akun')
    expect(wrapper.text()).toContain('Pengguna Aktif')
    expect(wrapper.text()).toContain('Akun Terkunci')
  })

  it('renders tone-bearing counters as a status badge (tone + label, never colour-alone)', () => {
    const wrapper = mountGroup()
    const badges = wrapper.findAllComponents(UiStatusBadge)
    const tones = badges.map((b) => b.props('tone'))
    expect(tones).toContain('success')
    expect(tones).toContain('danger')
    // neutral counters are NOT rendered as badges
    expect(tones).not.toContain('neutral')
  })

  it('formats numeric values and renders null as an em dash', () => {
    const wrapper = mountGroup()
    expect(wrapper.text()).toMatch(/1[.,]?250/) // locale-tolerant grouping
    expect(wrapper.text()).toContain('—')
  })
})
