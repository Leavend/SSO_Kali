import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useI18n } from '../useI18n'

describe('admin useI18n', () => {
  const localeStorageKey = 'dev-sso-admin-locale'
  let originalHtmlLang: string | null
  let originalStoredLocale: string | null
  let hadOwnNavigatorLanguage: boolean
  let originalNavigatorLanguageDescriptor: PropertyDescriptor | undefined

  beforeEach(() => {
    originalHtmlLang = document.documentElement.getAttribute('lang')
    originalStoredLocale = window.localStorage.getItem(localeStorageKey)
    hadOwnNavigatorLanguage = Object.prototype.hasOwnProperty.call(window.navigator, 'language')
    originalNavigatorLanguageDescriptor = Object.getOwnPropertyDescriptor(window.navigator, 'language')
  })

  afterEach(() => {
    if (originalHtmlLang === null) {
      document.documentElement.removeAttribute('lang')
    } else {
      document.documentElement.setAttribute('lang', originalHtmlLang)
    }

    if (originalStoredLocale === null) {
      window.localStorage.removeItem(localeStorageKey)
    } else {
      window.localStorage.setItem(localeStorageKey, originalStoredLocale)
    }

    if (hadOwnNavigatorLanguage && originalNavigatorLanguageDescriptor) {
      Object.defineProperty(window.navigator, 'language', originalNavigatorLanguageDescriptor)
    } else {
      delete (window.navigator as unknown as { language?: string }).language
    }
  })

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

  it('honors document language before navigator language when no locale is stored', async () => {
    vi.resetModules()
    window.localStorage.removeItem(localeStorageKey)
    document.documentElement.setAttribute('lang', 'en')
    Object.defineProperty(window.navigator, 'language', {
      configurable: true,
      value: 'id-ID',
    })

    const { useI18n: useFreshI18n } = await import('../useI18n')

    expect(useFreshI18n().locale.value).toBe('en')
  })

  it('re-renders hard-loaded English preference after the lazy locale bundle resolves', async () => {
    vi.resetModules()
    window.localStorage.setItem(localeStorageKey, 'en')

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
