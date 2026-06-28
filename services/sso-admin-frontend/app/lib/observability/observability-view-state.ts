import { ApiError } from '@/lib/api/api-client'
import { resolveStatusTone, type StatusTone } from '@/lib/status-tone'
import type { ObservabilityServiceStatus, ObservabilitySummary } from '@/types/observability.types'

export type ObservabilityViewState =
  | 'loading'
  | 'unauthenticated'
  | 'forbidden'
  | 'error'
  | 'empty'
  | 'ready'

// Explicit service-status → tone map. The shared `resolveStatusTone` alias map
// does not carry `healthy`/`degraded`/`down`, so the map below is authoritative;
// `resolveStatusTone` is the defensive fallback for any unexpected backend value
// (delegating where possible per the contract). Never colour-alone downstream:
// the tone always pairs with a label via UiStatusBadge.
const SERVICE_TONE: Readonly<Record<ObservabilityServiceStatus, StatusTone>> = {
  healthy: 'success',
  degraded: 'warning',
  down: 'danger',
  unknown: 'neutral',
}

export function resolveServiceStatusTone(status: ObservabilityServiceStatus): StatusTone {
  return SERVICE_TONE[status] ?? resolveStatusTone(status)
}

// "Empty" = the backend answered but there is nothing to render: no services and
// no log events. Deliberately distinct from `forbidden` (a 403 → no permission)
// so the page shows "no data yet" copy rather than an access-denied surface.
export function isObservabilitySummaryEmpty(summary: ObservabilitySummary): boolean {
  return summary.services.length === 0 && summary.logs.length === 0
}

export function resolveObservabilityViewState({
  error,
  summary,
}: {
  readonly error: unknown
  readonly summary: ObservabilitySummary | null
}): ObservabilityViewState {
  // Security boundary: an error with NO prior snapshot must surface the real
  // auth/permission state, never be hidden. A background-refresh error that
  // still has a good snapshot is handled by `isObservabilityStale` (data stays
  // on screen) — symmetric with the dashboard gate.
  if (error && !summary) {
    const status = errorStatus(error)
    if (status === 401) return 'unauthenticated'
    if (status === 403) return 'forbidden'
    return 'error'
  }
  if (summary) return isObservabilitySummaryEmpty(summary) ? 'empty' : 'ready'
  return 'loading'
}

// A background refresh failed but we still hold a good snapshot — show the data
// with a degraded/stale banner instead of blanking the cockpit.
export function isObservabilityStale(
  error: unknown,
  summary: ObservabilitySummary | null,
): boolean {
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
