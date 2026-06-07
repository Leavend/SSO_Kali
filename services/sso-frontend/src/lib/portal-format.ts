import { formatDateTimeAbsolute } from './datetime'

export function formatPortalDateTime(value: string | null | undefined, fallback = '—'): string {
  return formatDateTimeAbsolute(value, { fallback })
}
