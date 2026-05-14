import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PortalHeader from '../PortalHeader.vue'

describe('PortalHeader', () => {
  it('keeps the mobile menu trigger at an accessible touch target size', () => {
    const wrapper = mount(PortalHeader, {
      global: {
        stubs: {
          AppBrandMark: true,
          PortalNavLink: true,
          PortalUserMenu: true,
          RouterLink: true,
          ThemeToggleButton: true,
        },
      },
    })

    const menuButton = wrapper.find('button[aria-label="Buka menu"]')

    expect(menuButton.classes()).toContain('size-11')
  })

  it('uses narrow-screen-safe header spacing', () => {
    const wrapper = mount(PortalHeader, {
      global: {
        stubs: {
          AppBrandMark: true,
          PortalNavLink: true,
          PortalUserMenu: true,
          RouterLink: true,
          ThemeToggleButton: true,
        },
      },
    })

    const headerRow = wrapper.find('[data-testid="portal-header-row"]')
    const brandLink = wrapper.find('[data-testid="portal-header-brand"]')

    expect(headerRow.classes()).toContain('gap-2')
    expect(headerRow.classes()).toContain('sm:gap-3')
    expect(headerRow.classes()).toContain('lg:gap-4')
    expect(headerRow.classes()).toContain('min-w-0')
    expect(brandLink.classes()).toContain('min-w-0')
  })

  it('contains desktop navigation and account actions for Nest Hub widths', () => {
    const wrapper = mount(PortalHeader, {
      global: {
        stubs: {
          AppBrandMark: true,
          PortalNavLink: true,
          PortalUserMenu: true,
          RouterLink: true,
          ThemeToggleButton: true,
        },
      },
    })

    const desktopNav = wrapper.find('[data-testid="portal-desktop-nav"]')
    const actions = wrapper.find('[data-testid="portal-header-actions"]')

    expect(desktopNav.classes()).toContain('min-w-0')
    expect(desktopNav.classes()).toContain('overflow-hidden')
    expect(desktopNav.classes()).toContain('gap-0.5')
    expect(actions.classes()).toContain('shrink-0')
    expect(actions.classes()).toContain('gap-1.5')
  })
})
