import type { ParsedUserAgent } from '@/lib/parse-user-agent'
import type { UserSessionSummary } from '@/types/profile.types'

export interface SessionLocationPresentation {
  readonly ipAddress: string
  readonly location: string
  readonly isUnknownIp: boolean
  readonly isUnknownLocation: boolean
  readonly isForeignIp: boolean
}

const SESSION_TIMESTAMP_FORMATTER = new Intl.DateTimeFormat('id-ID', {
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Asia/Makassar',
})

export function formatSessionTimestamp(value: string | null | undefined, fallback = '—'): string {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return SESSION_TIMESTAMP_FORMATTER.format(date).replaceAll('.', ':')
}

export function relativeSessionTime(value: string, now = new Date()): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'waktu tidak valid'
  const diffMs = Math.max(0, now.getTime() - date.getTime())
  const diffMinutes = Math.floor(diffMs / 60_000)
  if (diffMinutes < 1) return 'baru saja'
  if (diffMinutes < 60) return `${diffMinutes} menit lalu`
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours} jam lalu`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 30) return `${diffDays} hari lalu`
  const diffMonths = Math.floor(diffDays / 30)
  if (diffMonths < 12) return `${diffMonths} bulan lalu`
  const diffYears = Math.floor(diffDays / 365)
  return `${diffYears} tahun lalu`
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
