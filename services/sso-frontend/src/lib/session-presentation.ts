import { formatDateTimeAbsolute, formatDateTimeRelative } from '@/lib/datetime'
import type { ParsedUserAgent } from '@/lib/parse-user-agent'
import type { UserSessionSummary } from '@/types/profile.types'

export interface SessionLocationPresentation {
  readonly ipAddress: string
  readonly location: string
  readonly isUnknownIp: boolean
  readonly isUnknownLocation: boolean
  readonly isForeignIp: boolean
}

export function formatSessionTimestamp(value: string | null | undefined, fallback = '—'): string {
  return formatDateTimeAbsolute(value, { fallback })
}

export function relativeSessionTime(value: string, now = new Date()): string {
  const formatted = formatDateTimeRelative(value, { now, fallback: 'waktu tidak valid' })
  return formatted === '—' ? 'waktu tidak valid' : formatted
}

export function isDormantSession(value: string, now = new Date()): boolean {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return false
  const diffMs = now.getTime() - date.getTime()
  return diffMs >= 7 * 24 * 60 * 60 * 1000
}

export function sessionLocation(
  session: UserSessionSummary,
  knownCurrentIp: string | null,
): SessionLocationPresentation {
  const ipAddress = session.ip_address ?? 'IP tidak dikenal'
  const location = session.location ?? 'Lokasi tidak dikenal'
  const isUnknownIp = !session.ip_address
  const isUnknownLocation = !session.location
  const isForeignIp = Boolean(
    session.ip_address && knownCurrentIp && session.ip_address !== knownCurrentIp,
  )
  return { ipAddress, location, isUnknownIp, isUnknownLocation, isForeignIp }
}

export function sessionDeviceLabel(parsed: ParsedUserAgent, rawUserAgent?: string | null): string {
  const model = deviceModel(rawUserAgent)
  const parts: string[] = []
  if (parsed.browser !== 'Unknown') parts.push(parsed.browser)
  if (parsed.os !== 'Unknown') parts.push(parsed.os)
  if (model) parts.push(model)
  return parts.length > 0 ? parts.join(' · ') : 'Perangkat tidak dikenal'
}

function deviceModel(userAgent?: string | null): string | null {
  if (!userAgent) return null
  if (/iPhone/i.test(userAgent)) return 'iPhone'
  if (/iPad/i.test(userAgent)) return 'iPad'
  if (/Macintosh|Mac OS X/i.test(userAgent)) return 'Mac'
  if (/Android/i.test(userAgent)) return 'Android device'
  return null
}
