/**
 * Maps a status string (semantic tone OR a domain alias) onto one of the five
 * Bontang DS design tones. Tones drive the `data-tone` attribute consumed by the
 * `.status[data-tone]` badge styles (token-backed `--{tone}-soft` colours).
 *
 * Color is never the sole status indicator — the badge always renders a dot plus
 * the human-readable label — but the resolved tone keeps the colour cue aligned
 * with the meaning of each status across Users / Sessions / Audit tables.
 */
export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'brand' | 'neutral'

const TONE_VALUES: ReadonlySet<string> = new Set([
  'success',
  'warning',
  'danger',
  'info',
  'brand',
  'neutral',
])

/**
 * Domain aliases → tone. Kept lowercase; callers are normalised before lookup so
 * `Active`, `ACTIVE`, and `active` all resolve identically.
 */
const ALIAS_TONE: Readonly<Record<string, StatusTone>> = {
  // healthy / live
  active: 'success',
  enabled: 'success',
  succeeded: 'success',
  success: 'success',
  allow: 'success',
  allowed: 'success',
  online: 'success',
  verified: 'success',
  // attention / transitional
  pending: 'warning',
  staged: 'warning',
  warning: 'warning',
  expiring: 'warning',
  idle: 'warning',
  // blocked / failed
  locked: 'danger',
  failed: 'danger',
  deny: 'danger',
  denied: 'danger',
  revoked: 'danger',
  error: 'danger',
  danger: 'danger',
  // informational
  info: 'info',
  guarded: 'info',
  // brand / primary
  brand: 'brand',
  ready: 'brand',
  // muted / inactive
  inactive: 'neutral',
  disabled: 'neutral',
  deactivated: 'neutral',
  unknown: 'neutral',
  neutral: 'neutral',
}

/**
 * Resolve any status value to a design tone. Accepts the five canonical tones
 * directly, the documented domain aliases (active/locked/pending/staged/…), and
 * falls back to `neutral` for anything unrecognised so the UI never throws.
 */
export function resolveStatusTone(value: string | null | undefined): StatusTone {
  if (!value) return 'neutral'
  const key = value.trim().toLowerCase()
  if (TONE_VALUES.has(key)) return key as StatusTone
  return ALIAS_TONE[key] ?? 'neutral'
}
