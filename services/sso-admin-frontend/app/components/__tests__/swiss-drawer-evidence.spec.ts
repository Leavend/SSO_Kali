import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import UiDetailDrawer from '@/components/ui/UiDetailDrawer.vue'
import EvidenceContextPanel from '@/components/EvidenceContextPanel.vue'

vi.mock('@/composables/useI18n', () => ({
  useI18n: () => ({ t: (k: string) => k }),
}))

afterEach(() => {
  document.body.innerHTML = ''
})

describe('Swiss detail drawer', () => {
  it('moves focus to close, traps it, closes on Escape and backdrop (a11y dialog contract)', async () => {
    const wrapper = mount(UiDetailDrawer, {
      attachTo: document.body,
      props: {
        open: false,
        titleId: 'sess',
        title: 'Session detail',
        description: 'Device-bound session.',
        closeLabel: 'Close',
      },
      slots: { default: '<button>Inside</button>', footer: '<button>Save</button>' },
    })
    await wrapper.setProps({ open: true })
    await nextTick()

    const dialog = wrapper.get('[role="dialog"]')
    expect(dialog.attributes('aria-modal')).toBe('true')
    expect(dialog.attributes('aria-labelledby')).toBe('sess-title')
    expect(document.activeElement).toBe(wrapper.get('[aria-label="Close"]').element)
    expect(wrapper.text()).toContain('Save')

    await wrapper.get('.drawer-root').trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('close')).toHaveLength(1)

    await wrapper.get('[data-testid="drawer-overlay"]').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(2)
  })
})

describe('Swiss evidence context panel', () => {
  it('renders a masked support reference and mono technical IDs', () => {
    const wrapper = mount(EvidenceContextPanel, {
      props: { requestId: 'abcdef0123456789', clientId: 'admin-portal' },
    })
    expect(wrapper.text()).toContain('REF-')
    expect(wrapper.find('details').exists()).toBe(true)
    expect(wrapper.text()).toContain('Admin Portal')
  })

  it('renders nothing when there is no evidence', () => {
    const wrapper = mount(EvidenceContextPanel, { props: {} })
    expect(wrapper.find('section').exists()).toBe(false)
  })
})
