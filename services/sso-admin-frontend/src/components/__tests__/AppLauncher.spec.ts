import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import AppLauncher from '../AppLauncher.vue'

const TRIGGER = '[data-testid="app-launcher-trigger"]'
const POPOVER = '[data-testid="app-launcher-popover"]'
const MANAGE = '[data-testid="app-launcher-manage"]'

function mountLauncher() {
  // Attach to the document so focus management (focus()/document.activeElement)
  // behaves like a real browser.
  return mount(AppLauncher, { attachTo: document.body })
}

describe('AppLauncher', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('renders the waffle trigger as a real button with menu semantics, closed by default', () => {
    const wrapper = mountLauncher()
    const trigger = wrapper.get(TRIGGER)

    expect(trigger.element.tagName).toBe('BUTTON')
    expect(trigger.attributes('aria-haspopup')).toBe('menu')
    expect(trigger.attributes('aria-expanded')).toBe('false')
    expect(wrapper.find(POPOVER).exists()).toBe(false)

    wrapper.unmount()
  })

  it('opens the popover on click and flips aria-expanded', async () => {
    const wrapper = mountLauncher()

    await wrapper.get(TRIGGER).trigger('click')

    expect(wrapper.get(TRIGGER).attributes('aria-expanded')).toBe('true')
    const popover = wrapper.get(POPOVER)
    expect(popover.attributes('role')).toBe('menu')

    wrapper.unmount()
  })

  it('renders the favorites group and the other-apps group as menuitems', async () => {
    const wrapper = mountLauncher()
    await wrapper.get(TRIGGER).trigger('click')

    const groups = wrapper.findAll('.al-group')
    expect(groups.length).toBe(2)
    // Group labels come from i18n (test env resolves to the English locale).
    expect(wrapper.get(POPOVER).text()).toContain('Frequently used')
    expect(wrapper.get(POPOVER).text()).toContain('Other apps')

    const tiles = wrapper.findAll('.al-tile')
    expect(tiles.length).toBeGreaterThan(0)
    expect(tiles.every((tile) => tile.attributes('role') === 'menuitem')).toBe(true)

    wrapper.unmount()
  })

  it('renders the footer "manage connected apps" link pointing at the portal /apps page', async () => {
    const wrapper = mountLauncher()
    await wrapper.get(TRIGGER).trigger('click')

    const manage = wrapper.get(MANAGE)
    expect(manage.attributes('role')).toBe('menuitem')
    expect(manage.attributes('href')).toMatch(/\/apps$/)
    expect(manage.attributes('rel')).toContain('noopener')

    wrapper.unmount()
  })

  it('closes on Escape and returns focus to the trigger', async () => {
    const wrapper = mountLauncher()
    const trigger = wrapper.get(TRIGGER).element as HTMLButtonElement

    await wrapper.get(TRIGGER).trigger('click')
    expect(wrapper.find(POPOVER).exists()).toBe(true)

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()

    expect(wrapper.find(POPOVER).exists()).toBe(false)
    expect(wrapper.get(TRIGGER).attributes('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(trigger)

    wrapper.unmount()
  })

  it('closes when the backdrop is clicked', async () => {
    const wrapper = mountLauncher()
    await wrapper.get(TRIGGER).trigger('click')
    expect(wrapper.find(POPOVER).exists()).toBe(true)

    await wrapper.get('.al-backdrop').trigger('click')

    expect(wrapper.find(POPOVER).exists()).toBe(false)

    wrapper.unmount()
  })

  it('emits "open" and does not navigate for the current-app entry without re-login', async () => {
    const wrapper = mountLauncher()
    await wrapper.get(TRIGGER).trigger('click')

    // First favorite is the current app ("Akun SSO", url '/').
    await wrapper.get('.al-tile').trigger('click')

    expect(wrapper.emitted('open')).toBeTruthy()
    expect(wrapper.find(POPOVER).exists()).toBe(false)

    wrapper.unmount()
  })

  it('accepts a custom apps list via prop', async () => {
    const wrapper = mount(AppLauncher, {
      attachTo: document.body,
      props: {
        apps: [
          { name: 'Solo Fav', short: 'Solo', icon: 'app', grad: 'red', fav: true },
        ],
      },
    })

    await wrapper.get(TRIGGER).trigger('click')
    const tiles = wrapper.findAll('.al-tile')
    expect(tiles.length).toBe(1)
    expect(wrapper.get('.al-tile').text()).toContain('Solo')
    // No "rest" group → only one group rendered.
    expect(wrapper.findAll('.al-group').length).toBe(1)

    wrapper.unmount()
  })
})
