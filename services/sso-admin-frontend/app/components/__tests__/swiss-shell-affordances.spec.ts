import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import UiThemeToggle from '@/components/ui/UiThemeToggle.vue'
import LocaleSwitcher from '@/components/LocaleSwitcher.vue'
import AppLauncher from '@/components/AppLauncher.vue'

const { toggleTheme, setLocale } = vi.hoisted(() => ({
  toggleTheme: vi.fn<() => void>(),
  setLocale: vi.fn<(locale: string) => void>(),
}))

vi.mock('@/components/ui/useTheme', async () => {
  const { ref } = await import('vue')
  return { useTheme: () => ({ isDark: ref(false), toggleTheme }) }
})
vi.mock('@/composables/useI18n', async () => {
  const { ref } = await import('vue')
  return { useI18n: () => ({ locale: ref('id'), t: (k: string) => k, setLocale }) }
})
vi.mock('@/services/sso-account-widget.api', () => ({
  safeWidgetAppUrl: (u: string) => u,
}))
vi.mock('@/config/adminEnvironment', () => ({
  getAdminEnvironment: () => ({ ssoBaseUrl: 'https://sso.example' }),
}))

afterEach(() => {
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('Swiss shell affordances', () => {
  it('UiThemeToggle is a labelled icon button that toggles theme', async () => {
    const wrapper = mount(UiThemeToggle)
    const btn = wrapper.get('button')
    expect(btn.attributes('aria-label')).toBe('Use dark theme')
    expect(btn.find('svg').exists()).toBe(true)
    await btn.trigger('click')
    expect(toggleTheme).toHaveBeenCalledTimes(1)
  })

  it('LocaleSwitcher toggles to the other locale', async () => {
    const wrapper = mount(LocaleSwitcher)
    await wrapper.get('button').trigger('click')
    expect(setLocale).toHaveBeenCalledWith('en')
  })

  it('AppLauncher opens a menu popover and closes on Escape (focus restored)', async () => {
    const wrapper = mount(AppLauncher, { attachTo: document.body })
    const trigger = wrapper.get('[data-testid="app-launcher-trigger"]')
    expect(trigger.find('svg').exists()).toBe(true)
    await trigger.trigger('click')
    await nextTick()
    expect(wrapper.find('[data-testid="app-launcher-popover"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="app-launcher-trigger"]').attributes('aria-expanded')).toBe(
      'true',
    )

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    expect(wrapper.find('[data-testid="app-launcher-popover"]').exists()).toBe(false)
    expect(document.activeElement).toBe(wrapper.get('[data-testid="app-launcher-trigger"]').element)
  })

  it('AppLauncher emits the chosen app from the menu grid', async () => {
    const wrapper = mount(AppLauncher, {
      attachTo: document.body,
      props: {
        apps: [
          { name: 'Akun SSO', short: 'Akun SSO', icon: 'user', grad: '', fav: true, url: '/' },
        ],
      },
    })
    await wrapper.get('[data-testid="app-launcher-trigger"]').trigger('click')
    await nextTick()
    await wrapper.get('[role="menuitem"].al-tile').trigger('click')
    expect(wrapper.emitted('open')?.[0]?.[0]).toMatchObject({ name: 'Akun SSO' })
  })
})
