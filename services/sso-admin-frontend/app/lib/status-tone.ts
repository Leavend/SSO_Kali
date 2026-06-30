export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'brand' | 'neutral'

const TONE_VALUES: ReadonlySet<string> = new Set([
  'success',
  'warning',
  'danger',
  'info',
  'brand',
  'neutral',
])

const ALIAS_TONE: Readonly<Record<string, StatusTone>> = {
  active: 'success',
  enabled: 'success',
  succeeded: 'success',
  success: 'success',
  allow: 'success',
  allowed: 'success',
  online: 'success',
  verified: 'success',
  pending: 'warning',
  staged: 'warning',
  warning: 'warning',
  expiring: 'warning',
  idle: 'warning',
  locked: 'danger',
  failed: 'danger',
  deny: 'danger',
  denied: 'danger',
  revoked: 'danger',
  error: 'danger',
  danger: 'danger',
  info: 'info',
  guarded: 'info',
  brand: 'brand',
  ready: 'brand',
  inactive: 'neutral',
  disabled: 'neutral',
  deactivated: 'neutral',
  unknown: 'neutral',
  neutral: 'neutral',
}

export function resolveStatusTone(value: string | null | undefined): StatusTone {
  if (!value) return 'neutral'
  const key = value.trim().toLowerCase()
  if (TONE_VALUES.has(key)) return key as StatusTone
  return ALIAS_TONE[key] ?? 'neutral'
}
