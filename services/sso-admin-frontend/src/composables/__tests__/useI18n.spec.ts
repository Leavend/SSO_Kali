import { describe, expect, it } from 'vitest'
import { useI18n } from '../useI18n'

describe('admin useI18n', () => {
  it('resolves Indonesian and English copy', () => {
    const { setLocale, t } = useI18n()

    setLocale('id')
    expect(t('admin.forbidden.eyebrow')).toBe('Akses Ditolak')

    setLocale('en')
    expect(t('admin.forbidden.eyebrow')).toBe('Access Denied')
  })

  it('updates html lang for admin API Accept-Language propagation', () => {
    const { locale, setLocale } = useI18n()

    setLocale('en')

    expect(locale.value).toBe('en')
    expect(document.documentElement.getAttribute('lang')).toBe('en')
  })

  it('keeps missing keys explicit', () => {
    const { t } = useI18n()

    expect(t('admin.missing.copy')).toBe('admin.missing.copy')
  })
})
