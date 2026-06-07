import { computed, ref, type ComputedRef } from 'vue'
import { useI18n } from '@/composables/useI18n'

export type DateFormatOptions = Intl.DateTimeFormatOptions & { readonly fallback?: string }
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

const RELATIVE_DIVISIONS: readonly { readonly amount: number; readonly unit: Intl.RelativeTimeFormatUnit }[] = [
  { amount: 60, unit: 'second' },
  { amount: 60, unit: 'minute' },
  { amount: 24, unit: 'hour' },
  { amount: 7, unit: 'day' },
  { amount: 4.345, unit: 'week' },
  { amount: 12, unit: 'month' },
  { amount: Number.POSITIVE_INFINITY, unit: 'year' },
]

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
    const fallback = opts.fallback ?? DEFAULT_FALLBACK
    const date = parseIso(iso)
    if (!date) return fallback
    const { fallback: _fallback, ...formatOptions } = opts
    void _fallback
    return new Intl.DateTimeFormat(locale.value, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: timeZone.value,
      timeZoneName: 'short',
      ...formatOptions,
    }).format(date)
  }

  function relative(iso: string | null | undefined, now = new Date()): string {
    const date = parseIso(iso)
    if (!date) return DEFAULT_FALLBACK
    let seconds = (date.getTime() - now.getTime()) / 1000
    const formatter = new Intl.RelativeTimeFormat(locale.value, { numeric: 'auto' })
    for (const division of RELATIVE_DIVISIONS) {
      if (Math.abs(seconds) < division.amount) {
        return formatter.format(Math.round(seconds), division.unit)
      }
      seconds /= division.amount
    }
    return absolute(iso)
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

function parseIso(value: string | null | undefined): Date | null {
  if (!value) return null
  const normalized = value.replace(/\.([0-9]{3})[0-9]+(?=Z|[+-][0-9]{2}:?[0-9]{2}$)/u, '.$1')
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date
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
