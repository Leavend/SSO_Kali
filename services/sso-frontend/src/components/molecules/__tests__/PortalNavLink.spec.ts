import { mount } from '@vue/test-utils'
import { Activity } from 'lucide-vue-next'
import { defineComponent, h } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import PortalNavLink from '../PortalNavLink.vue'

vi.mock('vue-router', () => ({
  RouterLink: defineComponent({
    name: 'RouterLink',
    props: { to: { type: String, required: true } },
    setup(props, { attrs, slots }) {
      return () => h('a', { ...attrs, href: props.to }, slots.default?.())
    },
  }),
  useRoute: () => ({ path: '/sessions' }),
}))

describe('PortalNavLink', () => {
  it('uses compact visible copy on constrained desktop widths while preserving the full accessible label', () => {
    const wrapper = mount(PortalNavLink, {
      props: {
        to: '/sessions',
        label: 'Sesi Aktif',
        shortLabel: 'Sesi',
        icon: Activity,
      },
    })

    const link = wrapper.find('a')
    const compactLabel = wrapper.find('[data-testid="portal-nav-label-short"]')
    const fullLabel = wrapper.find('[data-testid="portal-nav-label-full"]')

    expect(link.attributes('aria-label')).toBe('Sesi Aktif')
    expect(link.classes()).toContain('portal-nav-pill')
    expect(link.classes()).toContain('shrink-0')
    expect(link.classes()).toContain('isolate')
    expect(compactLabel.text()).toBe('Sesi')
    expect(compactLabel.classes()).toContain('xl:hidden')
    expect(fullLabel.text()).toBe('Sesi Aktif')
    expect(fullLabel.classes()).toContain('hidden')
    expect(fullLabel.classes()).toContain('xl:inline')
    expect(link.classes()).toContain('portal-nav-pill--active')
  })

  it('falls back to the full label when no compact label is provided', () => {
    const wrapper = mount(PortalNavLink, {
      props: {
        to: '/profile',
        label: 'Profil',
        icon: Activity,
      },
    })

    expect(wrapper.find('[data-testid="portal-nav-label-short"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="portal-nav-label-full"]').text()).toBe('Profil')
  })
})
