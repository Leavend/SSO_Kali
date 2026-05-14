import { defineComponent, h } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import PortalLayout from '../PortalLayout.vue'
import { useSessionStore } from '@/stores/session.store'

vi.mock('vue-router', () => ({
  RouterLink: defineComponent({
    name: 'RouterLink',
    props: {
      to: { type: [String, Object], required: true },
    },
    setup(props, { slots }) {
      return () => h('a', { href: String(props.to) }, slots.default?.())
    },
  }),
  RouterView: defineComponent({
    name: 'RouterView',
    setup(_, { slots }) {
      return () => slots.default?.({ Component: defineComponent({ template: '<div />' }) })
    },
  }),
  useRoute: () => ({ path: '/sessions' }),
}))

function mountPortalLayout() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const session = useSessionStore()
  session.user = {
    id: 1,
    subject_id: 'user-1',
    display_name: 'Tio Pranoto With Very Long Name',
    email: 'very.long.account.email@example-company.internal',
    roles: ['admin'],
  }

  return mount(PortalLayout, {
    global: {
      plugins: [pinia],
      stubs: {
        Transition: false,
      },
    },
  })
}

describe('PortalLayout', () => {
  it('uses a mobile-first shell without wrapping the navigation into content space', () => {
    const wrapper = mountPortalLayout()

    const shell = wrapper.find('[data-testid="portal-shell"]')
    const headerInner = wrapper.find('[data-testid="portal-header-inner"]')
    const nav = wrapper.find('[data-testid="portal-primary-nav"]')
    const main = wrapper.find('[data-testid="portal-main"]')

    expect(shell.classes()).toContain('overflow-x-clip')
    expect(headerInner.classes()).toContain('min-w-0')
    expect(headerInner.classes()).toContain('flex-nowrap')
    expect(nav.classes()).toContain('hidden')
    expect(nav.classes()).toContain('lg:flex')
    expect(main.classes()).toContain('w-full')
    expect(main.classes()).toContain('min-w-0')
  })

  it('constrains account identity text so header actions stay reachable on narrow screens', () => {
    const wrapper = mountPortalLayout()

    const accountSummary = wrapper.find('[data-testid="portal-account-summary"]')
    const accountName = wrapper.find('[data-testid="portal-account-name"]')
    const accountEmail = wrapper.find('[data-testid="portal-account-email"]')

    expect(accountSummary.classes()).toContain('min-w-0')
    expect(accountSummary.classes()).toContain('max-w-[8rem]')
    expect(accountName.classes()).toContain('truncate')
    expect(accountEmail.classes()).toContain('truncate')
  })
})
