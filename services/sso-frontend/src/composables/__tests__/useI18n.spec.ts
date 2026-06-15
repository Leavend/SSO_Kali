import { afterEach, describe, expect, it, vi } from 'vitest'
import enLocale from '@/locales/en/messages.json'
import idLocale from '@/locales/id/messages.json'
import { useI18n } from '../useI18n'

function flattenKeys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return [prefix]

  return Object.entries(value).flatMap(([key, child]) =>
    flattenKeys(child, prefix ? `${prefix}.${key}` : key),
  )
}

function leafValues(value: unknown): unknown[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return [value]
  return Object.values(value).flatMap(leafValues)
}

describe('useI18n', () => {
  afterEach(() => {
    window.localStorage.removeItem('dev-sso-locale')
    void useI18n().setLocale('id')
    vi.unstubAllGlobals()
  })

  it('falls back to browser navigator language when no storage or document locale', async () => {
    // After the ISS-PERF2 refactor, detectInitialLocale now chains
    //   storage → document → navigator → DEFAULT_LOCALE.
    // jsdom defaults <html lang> to '' and localStorage to empty, so the
    // navigator stub is the only signal the resolver can use here.
    vi.resetModules()
    vi.stubGlobal('navigator', { language: 'en-US' })
    window.localStorage.removeItem('dev-sso-locale')
    document.documentElement.setAttribute('lang', '')

    const { useI18n: useFreshI18n } = await import('../useI18n')
    const { locale } = useFreshI18n()

    expect(locale.value).toBe('en')
  })

  it('falls back to default id when navigator is unsupported and storage is empty', async () => {
    vi.resetModules()
    vi.stubGlobal('navigator', { language: 'fr-FR' })
    window.localStorage.removeItem('dev-sso-locale')
    document.documentElement.setAttribute('lang', '')

    const { useI18n: useFreshI18n } = await import('../useI18n')
    const { locale } = useFreshI18n()

    expect(locale.value).toBe('id')
  })

  it('resolves simple dot-notation key', async () => {
    const { setLocale, t } = useI18n()
    await setLocale('id')
    expect(t('app.name')).toBe('Dev-SSO')
  })

  it('resolves nested key', async () => {
    const { setLocale, t } = useI18n()
    await setLocale('id')
    expect(t('auth.login.title')).toBe('Masuk ke akunmu')
  })

  it('resolves English messages without falling back to Indonesian', async () => {
    const { setLocale, t } = useI18n()
    await setLocale('en')
    expect(t('auth.login.title')).toBe('Sign in to your account')
  })

  it('interpolates {placeholder} params', async () => {
    const { setLocale, t } = useI18n()
    await setLocale('id')
    expect(t('portal.footer', { year: 2026 })).toBe('© 2026 Dev-SSO Platform')
  })

  it('returns key as fallback when not found', () => {
    const { t } = useI18n()
    expect(t('nonexistent.key')).toBe('nonexistent.key')
  })

  it('handles missing params gracefully (keeps placeholder)', async () => {
    const { setLocale, t } = useI18n()
    await setLocale('id')
    expect(t('portal.footer')).toBe('© {year} Dev-SSO Platform')
  })

  it('updates document lang when locale changes', async () => {
    const { locale, setLocale } = useI18n()
    await setLocale('en')
    expect(locale.value).toBe('en')
    expect(document.documentElement.getAttribute('lang')).toBe('en')
  })

  it('keeps Indonesian and English catalog keys in exact non-empty parity', () => {
    expect(flattenKeys(idLocale).sort()).toEqual(flattenKeys(enLocale).sort())

    for (const catalog of [idLocale, enLocale]) {
      for (const value of leafValues(catalog)) {
        expect(typeof value === 'string' && value.trim().length > 0).toBe(true)
      }
    }
  })
})
