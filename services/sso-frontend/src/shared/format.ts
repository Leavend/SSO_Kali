import { formatDateTimeAbsolute, formatDateTimeRelative } from './datetime.js'

export function formatDateTime(iso: string | null | undefined): string {
  return formatDateTimeAbsolute(iso, { fallback: '-' })
}

export function formatRelative(iso: string | null | undefined): string {
  return formatDateTimeRelative(iso, { fallback: 'Never' })
}

export function truncateId(id: string, keep = 8): string {
  if (id.length <= keep * 2) return id
  return `${id.slice(0, keep)}...${id.slice(-4)}`
}
