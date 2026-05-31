import { afterEach, describe, expect, it, vi } from 'vitest'
import { useI18n } from '../useI18n'

describe('useI18n', () => {
  afterEach(() => {
    window.localStorage.removeItem('dev-sso-locale')
    useI18n().setLocale('id')
    vi.unstubAllGlobals()
  })

  it('defaults to Indonesian even when browser locale is English', async () => {
    vi.resetModules()
    vi.stubGlobal('navigator', { language: 'en-US' })
    window.localStorage.removeItem('dev-sso-locale')

    const { useI18n: useFreshI18n } = await import('../useI18n')
    const { locale, t } = useFreshI18n()

    expect(locale.value).toBe('id')
    expect(t('auth.login.title')).toBe('Masuk ke akunmu')
  })

  it('resolves simple dot-notation key', () => {
    const { setLocale, t } = useI18n()
    setLocale('id')
    expect(t('app.name')).toBe('Dev-SSO')
  })

  it('resolves nested key', () => {
    const { setLocale, t } = useI18n()
    setLocale('id')
    expect(t('auth.login.title')).toBe('Masuk ke akunmu')
  })

  it('resolves English messages without falling back to Indonesian', () => {
    const { setLocale, t } = useI18n()
    setLocale('en')
    expect(t('auth.login.title')).toBe('Sign in to your account')
  })

  it('interpolates {placeholder} params', () => {
    const { setLocale, t } = useI18n()
    setLocale('id')
    expect(t('portal.footer', { year: 2026 })).toBe('© 2026 Dev-SSO Platform')
  })

  it('returns key as fallback when not found', () => {
    const { t } = useI18n()
    expect(t('nonexistent.key')).toBe('nonexistent.key')
  })

  it('handles missing params gracefully (keeps placeholder)', () => {
    const { setLocale, t } = useI18n()
    setLocale('id')
    expect(t('portal.footer')).toBe('© {year} Dev-SSO Platform')
  })

  it('updates document lang when locale changes', () => {
    const { locale, setLocale } = useI18n()
    setLocale('en')
    expect(locale.value).toBe('en')
    expect(document.documentElement.getAttribute('lang')).toBe('en')
  })
})
