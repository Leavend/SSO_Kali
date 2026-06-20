import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { useI18n } from '../useI18n'

describe('admin useI18n', () => {
  it('resolves Indonesian and English copy', async () => {
    const { setLocale, t } = useI18n()

    await setLocale('id')
    expect(t('admin.forbidden.eyebrow')).toBe('Akses Ditolak')

    await setLocale('en')
    expect(t('admin.forbidden.eyebrow')).toBe('Access Denied')
  })

  it('updates html lang for admin API Accept-Language propagation', async () => {
    const { locale, setLocale } = useI18n()

    await setLocale('en')

    expect(locale.value).toBe('en')
    expect(document.documentElement.getAttribute('lang')).toBe('en')
  })

  it('keeps missing keys explicit', () => {
    const { t } = useI18n()

    expect(t('admin.missing.copy')).toBe('admin.missing.copy')
  })

  it('re-renders hard-loaded English preference after the lazy locale bundle resolves', async () => {
    vi.resetModules()
    window.localStorage.setItem('dev-sso-admin-locale', 'en')

    const { useI18n: useFreshI18n } = await import('../useI18n')
    const Probe = defineComponent({
      setup() {
        const { t } = useFreshI18n()
        return () => h('p', t('admin.forbidden.eyebrow'))
      },
    })

    const wrapper = mount(Probe)

    expect(wrapper.text()).toBe('Akses Ditolak')

    await useFreshI18n().loadLocale('en')
    await nextTick()

    expect(wrapper.text()).toBe('Access Denied')
  })
})
