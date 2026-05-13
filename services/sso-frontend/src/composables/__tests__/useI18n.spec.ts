import { describe, expect, it } from 'vitest'
import { useI18n } from '../useI18n'

describe('useI18n', () => {
  it('resolves simple dot-notation key', () => {
    const { t } = useI18n()
    expect(t('app.name')).toBe('Dev-SSO')
  })

  it('resolves nested key', () => {
    const { t } = useI18n()
    expect(t('auth.login.title')).toBe('Masuk ke akunmu')
  })

  it('interpolates {placeholder} params', () => {
    const { t } = useI18n()
    expect(t('portal.footer', { year: 2026 })).toBe('© 2026 Dev-SSO Platform')
  })

  it('returns key as fallback when not found', () => {
    const { t } = useI18n()
    expect(t('nonexistent.key')).toBe('nonexistent.key')
  })

  it('handles missing params gracefully (keeps placeholder)', () => {
    const { t } = useI18n()
    expect(t('portal.footer')).toBe('© {year} Dev-SSO Platform')
  })

  it('locale defaults to id', () => {
    const { locale } = useI18n()
    expect(locale.value).toBe('id')
  })
})
