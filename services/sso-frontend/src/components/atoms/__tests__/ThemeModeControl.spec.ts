import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ThemeModeControl from '../ThemeModeControl.vue'
import { useThemeStore } from '@/stores/theme.store'

describe('ThemeModeControl', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders light, dark, and system options as radio menu items', () => {
    const wrapper = mount(ThemeModeControl)
    const options = wrapper.findAll('[role="menuitemradio"]')

    expect(options).toHaveLength(3)
    expect(wrapper.find('[data-mode="light"]').exists()).toBe(true)
    expect(wrapper.find('[data-mode="dark"]').exists()).toBe(true)
    expect(wrapper.find('[data-mode="auto"]').exists()).toBe(true)
  })

  it('marks exactly the active mode as checked', () => {
    const theme = useThemeStore()
    theme.setMode('dark')

    const wrapper = mount(ThemeModeControl)
    const checked = wrapper
      .findAll('[role="menuitemradio"]')
      .filter((option) => option.attributes('aria-checked') === 'true')

    expect(checked).toHaveLength(1)
    expect(checked[0]?.attributes('data-mode')).toBe('dark')
  })

  it('selects the chosen mode on click — including system (auto)', async () => {
    const theme = useThemeStore()
    theme.setMode('light')

    const wrapper = mount(ThemeModeControl)
    await wrapper.get('[data-mode="auto"]').trigger('click')

    expect(theme.mode).toBe('auto')
  })

  it('uses radiogroup/radio roles when standalone (outside a menu)', () => {
    const wrapper = mount(ThemeModeControl, { props: { standalone: true } })

    expect(wrapper.find('[role="radiogroup"]').exists()).toBe(true)
    expect(wrapper.findAll('[role="radio"]')).toHaveLength(3)
    expect(wrapper.findAll('[role="menuitemradio"]')).toHaveLength(0)
  })

  it('follows the radiogroup keyboard pattern when standalone: roving tabindex + arrow selection', async () => {
    const theme = useThemeStore()
    theme.setMode('light')

    const wrapper = mount(ThemeModeControl, { props: { standalone: true } })

    // One tab stop: only the active radio is tabbable.
    expect(wrapper.get('[data-mode="light"]').attributes('tabindex')).toBe('0')
    expect(wrapper.get('[data-mode="dark"]').attributes('tabindex')).toBe('-1')
    expect(wrapper.get('[data-mode="auto"]').attributes('tabindex')).toBe('-1')

    // Arrow moves selection (selection follows focus) and the roving index.
    await wrapper.get('[role="radiogroup"]').trigger('keydown', { key: 'ArrowRight' })
    expect(theme.mode).toBe('dark')
    expect(wrapper.get('[data-mode="dark"]').attributes('tabindex')).toBe('0')
    expect(wrapper.get('[data-mode="light"]').attributes('tabindex')).toBe('-1')

    // Wraps past the last option back to the first.
    await wrapper.get('[role="radiogroup"]').trigger('keydown', { key: 'ArrowRight' }) // dark → auto
    await wrapper.get('[role="radiogroup"]').trigger('keydown', { key: 'ArrowRight' }) // auto → light
    expect(theme.mode).toBe('light')

    // Home/End jump to the ends.
    await wrapper.get('[role="radiogroup"]').trigger('keydown', { key: 'End' })
    expect(theme.mode).toBe('auto')
    await wrapper.get('[role="radiogroup"]').trigger('keydown', { key: 'Home' })
    expect(theme.mode).toBe('light')
  })

  it('does not impose roving tabindex in the in-menu variant (menu owns arrow nav)', () => {
    const wrapper = mount(ThemeModeControl)

    expect(wrapper.get('[data-mode="light"]').attributes('tabindex')).toBeUndefined()
  })

  it('keeps exactly one tab stop and one checked radio even for an unknown stored mode', () => {
    const theme = useThemeStore()
    // useColorMode (emitAuto) passes a corrupted/foreign 'dev-sso-theme' value
    // through unclamped — the radiogroup must still expose one tab stop (APG).
    ;(theme as unknown as { mode: string }).mode = 'sepia'

    const wrapper = mount(ThemeModeControl, { props: { standalone: true } })
    const radios = wrapper.findAll('[role="radio"]')

    expect(radios.filter((radio) => radio.attributes('tabindex') === '0')).toHaveLength(1)
    expect(radios.filter((radio) => radio.attributes('aria-checked') === 'true')).toHaveLength(1)
  })
})
