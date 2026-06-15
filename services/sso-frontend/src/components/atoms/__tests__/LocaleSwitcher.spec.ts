import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import LocaleSwitcher from '../LocaleSwitcher.vue'
import { useI18n } from '@/composables/useI18n'

/** Drain the microtask queue several times so dynamic `import()` chunks resolve. */
const flushPromises = async (): Promise<void> => {
  for (let i = 0; i < 10; i += 1) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  }
}
void vi

describe('LocaleSwitcher', () => {
  beforeEach(async () => {
    window.localStorage.clear()
    await useI18n().setLocale('id')
  })

  it('flips locale in one click, persists it, and updates the target-language label', async () => {
    const wrapper = mount(LocaleSwitcher)

    expect(wrapper.get('button').attributes('aria-label')).toBe('Ganti bahasa ke English')

    await wrapper.get('button').trigger('click')
    // Wait for the async setLocale to load the en chunk, then flush Vue's
    // re-render queue so the computed `ariaLabel` reflects the new locale.
    await flushPromises()
    await nextTick()
    await flushPromises()

    expect(useI18n().locale.value).toBe('en')
    expect(window.localStorage.getItem('dev-sso-locale')).toBe('en')
    // Computed `ariaLabel` reads `activeMessages` indirectly through `t()`.
    // Since `t()` itself is not a reactive source, Vue's scheduler needs an
    // explicit nextTick after the dynamic chunk loads to commit the new
    // computed value to the DOM.
    await nextTick()
    expect(wrapper.get('button').attributes('aria-label')).toBe('Switch language to Indonesian')
  })
})
