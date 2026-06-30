// @vitest-environment nuxt
// NOTE: the pragma above is IGNORED by defineVitestConfig — env routing is by
// filename. This file is named *.nuxt.spec.ts so it is auto-routed to the
// 'nuxt' project (environment: 'nuxt') where mockNuxtImport / useState /
// useCookie / useRuntimeConfig are available in-process.
import { describe, expect, it } from 'vitest'
import { isRef } from 'vue'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { useI18n } from '@/composables/useI18n'
import { getAdminEnvironment } from '@/config/adminEnvironment'

mockNuxtImport('useRuntimeConfig', () => {
  return () => ({
    // app.baseURL is required by the Nuxt router plugin at app initialization.
    app: { baseURL: '/' },
    public: {
      ssoBaseUrl: 'https://sso.example.test',
      ssoWidgetBaseUrl: 'https://widget.example.test',
      docsBaseUrl: 'https://docs.example.test',
      basePath: '/admin-base',
    },
  })
})

describe('useI18n (SSR-safe shared i18n)', () => {
  it('returns a ref locale defaulting to id with id messages', () => {
    const { locale, t } = useI18n()
    expect(isRef(locale)).toBe(true)
    expect(locale.value).toBe('id')
    expect(t('app_launcher.favorites')).toBe('Sering dipakai')
  })

  it('switches locale + messages via setLocale', () => {
    const { locale, t, setLocale } = useI18n()
    setLocale('en')
    expect(locale.value).toBe('en')
    expect(t('app_launcher.favorites')).toBe('Frequently used')
    setLocale('id') // leave shared state clean for ordering-independent reads
    expect(t('app_launcher.favorites')).toBe('Sering dipakai')
  })

  it('falls back to the key when a message is missing', () => {
    const { t } = useI18n()
    expect(t('nope.not.here')).toBe('nope.not.here')
  })

  it('interpolates {param} placeholders', () => {
    const { t, setLocale } = useI18n()
    setLocale('en')
    expect(t('roles.confirm_delete_desc', { target: 'Ops' })).toBe(
      'Are you sure you want to delete role Ops? This action is irreversible.',
    )
    setLocale('id')
  })
})

describe('getAdminEnvironment (single source = runtimeConfig.public)', () => {
  it('derives ssoBaseUrl + companions from runtimeConfig.public', () => {
    const env = getAdminEnvironment()
    expect(env.ssoBaseUrl).toBe('https://sso.example.test')
    expect(env.widgetBaseUrl).toBe('https://widget.example.test')
    expect(env.docsBaseUrl).toBe('https://docs.example.test')
    expect(env.publicBasePath).toBe('/admin-base')
  })
})
