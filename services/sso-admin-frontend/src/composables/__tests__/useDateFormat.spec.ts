import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  clearTimeZonePreference,
  resolveLocale,
  resolveTimeZone,
  setTimeZonePreference,
  useDateFormat,
} from '../useDateFormat'

const localeRef = { value: 'id' }

vi.mock('../useI18n', () => ({
  useI18n: () => ({ locale: localeRef }),
}))

describe('useDateFormat', () => {
  beforeEach(() => {
    localeRef.value = 'id'
    window.localStorage.clear()
    clearTimeZonePreference()
    document.documentElement.lang = 'id'
  })

  it('resolves locale from document language', () => {
    document.documentElement.lang = 'en-US'
    expect(resolveLocale()).toBe('en-GB')

    document.documentElement.lang = 'id-ID'
    expect(resolveLocale()).toBe('id-ID')
  })

  it('supports timezone override preference', () => {
    setTimeZonePreference('Asia/Makassar')
    expect(resolveTimeZone()).toBe('Asia/Makassar')
    expect(window.localStorage.getItem('sso.tz')).toBe('Asia/Makassar')

    clearTimeZonePreference()
    expect(window.localStorage.getItem('sso.tz')).toBeNull()
  })

  it('formats absolute, relative, smart, and ISO title values', () => {
    setTimeZonePreference('UTC')
    const dateFormat = useDateFormat()
    const now = new Date('2026-06-07T12:00:00.000Z')

    expect(dateFormat.absolute('2026-06-07T10:30:00.000Z')).toContain('10.30')
    expect(dateFormat.relative('2026-06-07T11:58:00.000Z', now)).toContain('2 menit')
    expect(dateFormat.smart('2026-06-07T11:58:00.000Z', now)).toContain('2 menit')
    expect(dateFormat.iso('2026-06-07T10:30:00.000000Z')).toBe('2026-06-07T10:30:00.000Z')
    expect(dateFormat.title(null)).toBe('—')
  })

  it('reacts to active i18n locale', () => {
    localeRef.value = 'en'
    const dateFormat = useDateFormat()
    expect(dateFormat.locale.value).toBe('en-GB')
  })
})
