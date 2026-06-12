import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import LocaleSwitcher from '../LocaleSwitcher.vue'
import { useI18n } from '@/composables/useI18n'

describe('LocaleSwitcher', () => {
  beforeEach(() => {
    window.localStorage.clear()
    useI18n().setLocale('id')
  })

  it('flips locale in one click, persists it, and updates the target-language label', async () => {
    const wrapper = mount(LocaleSwitcher)

    expect(wrapper.get('button').attributes('aria-label')).toBe('Ganti bahasa ke English')

    await wrapper.get('button').trigger('click')

    expect(useI18n().locale.value).toBe('en')
    expect(window.localStorage.getItem('dev-sso-locale')).toBe('en')
    expect(wrapper.get('button').attributes('aria-label')).toBe('Switch language to Indonesian')
  })
})
