import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import StatusPill from '@/components/StatusPill.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'

vi.mock('@/composables/useI18n', () => ({
  useI18n: () => ({ t: (k: string) => k }),
}))

describe('Swiss status surfaces', () => {
  it('UiStatusBadge pairs colour with a dot and a text label (never colour-alone)', () => {
    const wrapper = mount(UiStatusBadge, { props: { status: 'active' } })
    expect(wrapper.get('.status').attributes('data-tone')).toBe('success')
    expect(wrapper.find('.status__dot').exists()).toBe(true)
    expect(wrapper.get('.status__label').text()).toBe('active')
  })

  it('StatusPill maps a readiness state to its standard label + tone', () => {
    const wrapper = mount(StatusPill, { props: { state: 'ready' } })
    expect(wrapper.text()).toBe('Ready')
    expect(wrapper.get('.status').attributes('data-tone')).toBe('brand')
  })

  it('UiStatusView renders the tone icon, redacts raw IDs and shows the support ref', () => {
    const wrapper = mount(UiStatusView, {
      props: {
        tone: 'forbidden',
        eyebrow: 'Forbidden',
        title: 'You do not have access',
        description: 'Trace 11111111-2222-4333-8444-555555555555 was rejected.',
        requestId: 'abcdef0123456789',
      },
    })
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(wrapper.find('svg').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('11111111-2222-4333-8444-555555555555')
    expect(wrapper.text()).toContain('REF-')
  })

  it('UiEmptyState shows title, description and an action slot', () => {
    const wrapper = mount(UiEmptyState, {
      props: { title: 'No audit events', description: 'Adjust filters and retry.' },
      slots: { action: '<button type="button">Refresh</button>' },
    })
    expect(wrapper.text()).toContain('No audit events')
    expect(wrapper.text()).toContain('Refresh')
  })

  it('UiSkeleton exposes a stable loading status region with N rows', () => {
    const wrapper = mount(UiSkeleton, { props: { rows: 3, label: 'Loading users' } })
    expect(wrapper.attributes('role')).toBe('status')
    expect(wrapper.attributes('aria-label')).toBe('Loading users')
    expect(wrapper.findAll('[data-testid="ui-skeleton-row"]')).toHaveLength(3)
  })
})
