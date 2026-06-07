import { beforeEach, describe, expect, it, vi } from 'vitest'
import { formatDateTime, formatRelative } from '../shared/format'
import {
  clearTimeZonePreference,
  formatDateTimeAbsolute,
  formatDateTimeRelative,
  resolveLocale,
  resolveTimeZone,
  setTimeZonePreference,
  useDateFormat,
} from './datetime'

const localeRef = { value: 'id' }

vi.mock('@/composables/useI18n', () => ({
  useI18n: () => ({ locale: localeRef }),
}))

describe('datetime formatting', () => {
  beforeEach(() => {
    localeRef.value = 'id'
    window.localStorage.clear()
    clearTimeZonePreference()
    document.documentElement.lang = 'id'
  })

  it('formats absolute dates with explicit timezone', () => {
    expect(
      formatDateTimeAbsolute('2026-06-07T10:30:00.000000Z', {
        locale: 'id-ID',
        timeZone: 'UTC',
      }),
    ).toContain('10.30')
  })

  it('formats relative dates locale-aware', () => {
    expect(
      formatDateTimeRelative('2026-06-07T11:58:00.000Z', {
        locale: 'id-ID',
        now: new Date('2026-06-07T12:00:00.000Z'),
      }),
    ).toContain('2 menit')
  })

  it('keeps shared formatter wrappers compatible', () => {
    expect(formatDateTime('2026-06-07T10:30:00.000Z')).not.toBe('-')
    expect(formatRelative(null)).toBe('Never')
  })

  it('supports browser locale and timezone preference in composable', () => {
    document.documentElement.lang = 'en-US'
    expect(resolveLocale()).toBe('en-GB')

    setTimeZonePreference('UTC')
    expect(resolveTimeZone()).toBe('UTC')

    localeRef.value = 'en'
    const dateFormat = useDateFormat()
    expect(dateFormat.locale.value).toBe('en-GB')
    expect(dateFormat.iso('2026-06-07T10:30:00.000000Z')).toBe('2026-06-07T10:30:00.000Z')
  })
})
