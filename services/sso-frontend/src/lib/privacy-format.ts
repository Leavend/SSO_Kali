import { formatDateTimeAbsolute } from './datetime'

export function formatPrivacyTimestamp(
  value: string | null | undefined,
  fallback = 'Belum selesai',
): string {
  return formatDateTimeAbsolute(value, { fallback })
}
