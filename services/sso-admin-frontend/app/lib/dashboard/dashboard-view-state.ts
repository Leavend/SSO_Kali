import { ApiError } from '@/lib/api/api-client'
import type { StatusTone } from '@/lib/status-tone'
import type { DashboardSummary } from '@/types/dashboard.types'

export type DashboardViewState =
  | 'loading'
  | 'unauthenticated'
  | 'forbidden'
  | 'error'
  | 'empty'
  | 'ready'

export type ResolveViewStateArgs = {
  readonly pending: boolean
  readonly error: unknown
  readonly summary: DashboardSummary | null
}

// State-bearing counter keys carry a tone so the metric reads as a status, not a
// bare number (Swiss "never colour alone": tone always pairs with a label +
// the UiStatusBadge dot/shape). Zero and null are always neutral.
//
// EXACT-key matching (not substring `includes`): `deactivated` contains the
// substring `active`, so a loose SUCCESS match would mis-tone it; and Swiss
// reserves red for genuinely critical states only. Routine lifecycle counts
// (disabled, deactivated, decommissioned, total, submitted, *_active session
// counts, *_last_24h volumes) stay NEUTRAL. `denied` is matched as a suffix for
// the `admin_denied_last_24h` incident counter.
const DANGER_KEYS = new Set(['locked', 'rejected'])
const WARNING_KEYS = new Set(['staged', 'on_hold'])
const SUCCESS_KEYS = new Set(['active', 'fulfilled', 'approved'])

export function resolveCounterTone(key: string, value: number | null): StatusTone {
  if (value == null || value === 0) return 'neutral'
  const k = key.toLowerCase()
  if (DANGER_KEYS.has(k) || k.includes('denied')) return 'danger'
  if (WARNING_KEYS.has(k)) return 'warning'
  if (SUCCESS_KEYS.has(k)) return 'success'
  return 'neutral'
}

// "Empty" = the backend answered, but every counter across every group is null
// or 0. Deliberately distinct from `forbidden` (a 403 → no permission) so the
// page shows "no data yet" copy rather than an access-denied surface.
export function isDashboardEmpty(summary: DashboardSummary): boolean {
  return Object.values(summary.counters).every((group) =>
    Object.values(group).every((value) => value == null || value === 0),
  )
}

export function resolveDashboardViewState({
  error,
  summary,
}: ResolveViewStateArgs): DashboardViewState {
  // Security boundary: an error with NO prior snapshot must surface the real
  // auth/permission state, never be hidden. A background-refresh error that
  // still has a good snapshot is handled by `isDashboardStale` (data stays on
  // screen) — symmetric with the legacy dashboard store gate.
  if (error && !summary) {
    const status = errorStatus(error)
    if (status === 401) return 'unauthenticated'
    if (status === 403) return 'forbidden'
    return 'error'
  }
  if (summary) return isDashboardEmpty(summary) ? 'empty' : 'ready'
  return 'loading'
}

// A background refresh failed but we still hold a good snapshot — show the data
// with a degraded/stale banner instead of blanking the cockpit.
export function isDashboardStale(error: unknown, summary: DashboardSummary | null): boolean {
  return Boolean(error) && summary !== null
}

function errorStatus(error: unknown): number | null {
  if (error instanceof ApiError) return error.status
  if (typeof error === 'object' && error !== null) {
    const candidate = error as { statusCode?: unknown; status?: unknown }
    if (typeof candidate.statusCode === 'number') return candidate.statusCode
    if (typeof candidate.status === 'number') return candidate.status
  }
  return null
}
