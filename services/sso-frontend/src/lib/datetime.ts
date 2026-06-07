import { computed, ref, type ComputedRef } from 'vue'
import { useI18n } from '@/composables/useI18n'
import {
  formatDateTimeAbsolute,
  formatDateTimeRelative,
  parseIso,
  type DateFormatOptions,
} from '@/shared/datetime'

export { formatDateTimeAbsolute, formatDateTimeRelative } from '@/shared/datetime'

export type { DateFormatOptions }
export type UseDateFormatReturn = {
  readonly locale: ComputedRef<string>
  readonly timeZone: ComputedRef<string>
  readonly absolute: (iso: string | null | undefined, opts?: DateFormatOptions) => string
  readonly relative: (iso: string | null | undefined, now?: Date) => string
  readonly smart: (iso: string | null | undefined, now?: Date) => string
  readonly iso: (iso: string | null | undefined) => string
  readonly title: (iso: string | null | undefined) => string
}

const TIME_ZONE_STORAGE_KEY = 'sso.tz' as const
const DEFAULT_FALLBACK = '—' as const
const LOCALE_MAP = { id: 'id-ID', en: 'en-GB' } as const
const timeZonePreference = ref<string | null>(readStoredTimeZone())

export function resolveTimeZone(): string {
  return timeZonePreference.value ?? detectBrowserTimeZone() ?? 'UTC'
}

export function setTimeZonePreference(timeZone: string): void {
  if (!isValidTimeZone(timeZone)) return
  timeZonePreference.value = timeZone
  persistTimeZone(timeZone)
}

export function clearTimeZonePreference(): void {
  timeZonePreference.value = null
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(TIME_ZONE_STORAGE_KEY)
  } catch {
    // Preference cleanup is best-effort.
  }
}

export function resolveLocale(): string {
  const lang = typeof document === 'undefined' ? 'id' : document.documentElement.lang
  const base = lang.toLowerCase().split('-')[0]
  return base === 'en' ? LOCALE_MAP.en : LOCALE_MAP.id
}

export function useDateFormat(): UseDateFormatReturn {
  const { locale: activeLocale } = useI18n()
  const locale = computed(() => (activeLocale.value === 'en' ? LOCALE_MAP.en : LOCALE_MAP.id))
  const timeZone = computed(resolveTimeZone)

  function absolute(iso: string | null | undefined, opts: DateFormatOptions = {}): string {
    return formatDateTimeAbsolute(iso, { ...opts, locale: locale.value, timeZone: timeZone.value })
  }

  function relative(iso: string | null | undefined, now = new Date()): string {
    return formatDateTimeRelative(iso, { locale: locale.value, now })
  }

  function smart(iso: string | null | undefined, now = new Date()): string {
    const date = parseIso(iso)
    if (!date) return DEFAULT_FALLBACK
    const diffMs = Math.abs(now.getTime() - date.getTime())
    return diffMs < 7 * 24 * 60 * 60 * 1000 ? relative(iso, now) : absolute(iso)
  }

  function isoValue(iso: string | null | undefined): string {
    return parseIso(iso)?.toISOString() ?? DEFAULT_FALLBACK
  }

  return { locale, timeZone, absolute, relative, smart, iso: isoValue, title: isoValue }
}

function detectBrowserTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null
  } catch {
    return null
  }
}

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone }).format(new Date())
    return true
  } catch {
    return false
  }
}

function readStoredTimeZone(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const value = window.localStorage.getItem(TIME_ZONE_STORAGE_KEY)
    return value && isValidTimeZone(value) ? value : null
  } catch {
    return null
  }
}

function persistTimeZone(timeZone: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(TIME_ZONE_STORAGE_KEY, timeZone)
  } catch {
    // Preference persistence is best-effort.
  }
}
