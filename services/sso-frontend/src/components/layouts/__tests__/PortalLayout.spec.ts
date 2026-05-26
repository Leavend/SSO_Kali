import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import PortalLayout from '../PortalLayout.vue'

vi.mock('@/composables/useSessionHeartbeat', () => ({
  useSessionHeartbeat: vi.fn(),
}))

vi.mock('@/composables/useAuthRedirect', () => ({
  useAuthRedirect: () => ({
    toLogin: vi.fn(),
  }),
}))

describe('PortalLayout', () => {
  it('offsets main content below the fixed portal header', () => {
    const wrapper = mount(PortalLayout, {
      global: {
        stubs: {
          PortalHeader: true,
          RouterView: true,
          SsoGlassBackground: true,
        },
      },
    })

    const main = wrapper.find('#portal-main')

    expect(main.classes()).toContain('pt-20')
    expect(main.classes()).toContain('sm:pt-24')
  })
})
