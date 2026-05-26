import type { ConnectedApp } from '@/types/profile.types'

export interface ConnectedAppPresentation {
  readonly initials: string
  readonly accentClass: string
  readonly description: string
  readonly category: string
  readonly scopes: readonly string[]
  readonly isActive: boolean
  readonly isDormant: boolean
  readonly isSensitive: boolean
  readonly relativeLastUsed: string
  readonly warning: string | null
}

const SENSITIVE_SCOPES = new Set(['offline_access', 'sessions.revoke', 'mfa.manage', 'permissions'])
const DEFAULT_SCOPES: readonly string[] = ['profile.read', 'email']
const ACCENT_CLASSES: readonly string[] = [
  'from-sky-500 to-blue-700',
  'from-violet-500 to-fuchsia-700',
  'from-emerald-500 to-teal-700',
  'from-amber-500 to-orange-700',
  'from-rose-500 to-red-700',
]

export function presentConnectedApp(app: ConnectedApp, now = new Date()): ConnectedAppPresentation {
  const scopes = app.scopes && app.scopes.length > 0 ? app.scopes : DEFAULT_SCOPES
  const isSensitive = scopes.some((scope) => SENSITIVE_SCOPES.has(scope))
  return {
    initials: app.logo_initials ?? initialsFromName(app.display_name),
    accentClass:
      ACCENT_CLASSES[hashString(app.display_name) % ACCENT_CLASSES.length] ?? ACCENT_CLASSES[0],
    description: app.description ?? 'Aplikasi yang memiliki akses melalui Dev-SSO.',
    category: app.category ?? 'Aplikasi',
    scopes,
    isActive: app.active_refresh_tokens > 0,
    isDormant: daysSince(app.last_used_at, now) >= 30,
    isSensitive,
    relativeLastUsed: relativeAppTime(app.last_used_at, now),
    warning: isSensitive ? sensitiveScopeWarning(scopes) : null,
  }
}

export function relativeAppTime(value: string, now = new Date()): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'waktu tidak valid'
  const diffMs = Math.max(0, now.getTime() - date.getTime())
  const diffMinutes = Math.floor(diffMs / 60_000)
  if (diffMinutes < 1) return 'baru saja'
  if (diffMinutes < 60) return `${diffMinutes} menit lalu`
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours} jam lalu`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays === 1) return 'Kemarin'
  if (diffDays < 30) return `${diffDays} hari lalu`
  const diffMonths = Math.floor(diffDays / 30)
  if (diffMonths < 12) return `${diffMonths} bulan lalu`
  const diffYears = Math.floor(diffDays / 365)
  return `${diffYears} tahun lalu`
}

function initialsFromName(value: string): string {
  const words = value
    .split(/\s+/u)
    .map((word) => word.trim())
    .filter(Boolean)
  if (words.length === 0) return 'APP'
  return words
    .slice(0, 3)
    .map((word) => word.charAt(0).toUpperCase())
    .join('')
}

function hashString(value: string): number {
  return [...value].reduce((hash, char) => hash + char.charCodeAt(0), 0)
}

function daysSince(value: string, now: Date): number {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 0
  return Math.floor(Math.max(0, now.getTime() - date.getTime()) / 86_400_000)
}

function sensitiveScopeWarning(scopes: readonly string[]): string {
  const hasSessionAccess = scopes.includes('sessions.revoke')
  const hasOfflineAccess = scopes.includes('offline_access')
  if (hasSessionAccess && hasOfflineAccess) {
    return 'Aplikasi ini memiliki akses ke sesi dan dapat memperbarui token tanpa login ulang.'
  }
  if (hasOfflineAccess) return 'Aplikasi ini dapat memperbarui token tanpa login ulang.'
  if (hasSessionAccess) return 'Aplikasi ini memiliki akses ke sesi akun kamu.'
  return 'Aplikasi ini memiliki izin sensitif.'
}
