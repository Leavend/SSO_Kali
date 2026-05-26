const PRIVACY_DATE_TIME_FORMATTER = new Intl.DateTimeFormat('id-ID', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Asia/Makassar',
})

export function formatPrivacyTimestamp(
  value: string | null | undefined,
  fallback = 'Belum selesai',
): string {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return PRIVACY_DATE_TIME_FORMATTER.format(date).replaceAll('.', ':')
}
