import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import LocaleSwitcher from './LocaleSwitcher.vue'
import { useI18n } from '@/composables/useI18n'

describe('LocaleSwitcher', () => {
  beforeEach(async () => {
    window.localStorage.clear()
    await useI18n().setLocale('id')
  })

  it('flips locale in one click, persists it, and updates the target-language label', async () => {
    const wrapper = mount(LocaleSwitcher)

    expect(wrapper.get('button').attributes('aria-label')).toBe('Ganti bahasa ke English')
    expect(wrapper.text()).toContain('ID')
    expect(wrapper.text()).toContain('EN')

    await wrapper.get('button').trigger('click')
    await useI18n().loadLocale('en')
    await wrapper.vm.$nextTick()

    expect(useI18n().locale.value).toBe('en')
    expect(window.localStorage.getItem('dev-sso-admin-locale')).toBe('en')
    expect(wrapper.get('button').attributes('aria-label')).toBe('Switch language to Indonesian')
  })

  it('shows only current locale code when collapsed is true', () => {
    const wrapper = mount(LocaleSwitcher, {
      props: {
        collapsed: true,
      },
    })
    expect(wrapper.text()).toBe('ID')
    expect(wrapper.text()).not.toContain('EN')
  })
})
