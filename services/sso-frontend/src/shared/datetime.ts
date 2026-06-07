export type DateFormatOptions = Intl.DateTimeFormatOptions & { readonly fallback?: string }

const DEFAULT_FALLBACK = '—' as const
const RELATIVE_DIVISIONS: readonly { readonly amount: number; readonly unit: Intl.RelativeTimeFormatUnit }[] = [
  { amount: 60, unit: 'second' },
  { amount: 60, unit: 'minute' },
  { amount: 24, unit: 'hour' },
  { amount: 7, unit: 'day' },
  { amount: 4.345, unit: 'week' },
  { amount: 12, unit: 'month' },
  { amount: Number.POSITIVE_INFINITY, unit: 'year' },
]

export function formatDateTimeAbsolute(
  iso: string | null | undefined,
  opts: DateFormatOptions & { readonly locale?: string; readonly timeZone?: string } = {},
): string {
  const fallback = opts.fallback ?? DEFAULT_FALLBACK
  const date = parseIso(iso)
  if (!date) return fallback
  const { fallback: _fallback, locale, timeZone, ...formatOptions } = opts
  void _fallback
  return new Intl.DateTimeFormat(locale ?? 'id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: timeZone ?? 'UTC',
    timeZoneName: 'short',
    ...formatOptions,
  }).format(date)
}

export function formatDateTimeRelative(
  iso: string | null | undefined,
  opts: { readonly locale?: string; readonly now?: Date; readonly fallback?: string } = {},
): string {
  const date = parseIso(iso)
  if (!date) return opts.fallback ?? DEFAULT_FALLBACK
  let seconds = (date.getTime() - (opts.now ?? new Date()).getTime()) / 1000
  const formatter = new Intl.RelativeTimeFormat(opts.locale ?? 'id-ID', { numeric: 'auto' })
  for (const division of RELATIVE_DIVISIONS) {
    if (Math.abs(seconds) < division.amount) {
      return formatter.format(Math.round(seconds), division.unit)
    }
    seconds /= division.amount
  }
  return formatDateTimeAbsolute(iso, opts)
}

export function parseIso(value: string | null | undefined): Date | null {
  if (!value) return null
  const normalized = value.replace(/\.([0-9]{3})[0-9]+(?=Z|[+-][0-9]{2}:?[0-9]{2}$)/u, '.$1')
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date
}
