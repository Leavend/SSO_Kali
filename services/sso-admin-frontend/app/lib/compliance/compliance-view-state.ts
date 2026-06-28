import { ApiError } from '@/lib/api/api-client'
import { resolveStatusTone, type StatusTone } from '@/lib/status-tone'
import type { DataSubjectRequest, DsrStatus, RetentionStatus } from '@/types/compliance.types'

export type ComplianceViewState =
  | 'loading'
  | 'unauthenticated'
  | 'forbidden'
  | 'error'
  | 'empty'
  | 'ready'

// Explicit DSR-status → tone map. The shared `resolveStatusTone` alias map does
// not carry these lifecycle states, so the map is authoritative; `resolveStatusTone`
// is the defensive fallback (delegating where possible). Swiss reserves red for
// the genuinely terminal `rejected` decision; routine `cancelled` is neutral.
const DSR_TONE: Readonly<Record<DsrStatus, StatusTone>> = {
  submitted: 'warning',
  on_hold: 'warning',
  approved: 'success',
  fulfilled: 'success',
  rejected: 'danger',
  cancelled: 'neutral',
}

export function resolveDsrStatusTone(status: DsrStatus): StatusTone {
  return DSR_TONE[status] ?? resolveStatusTone(status)
}

export function resolveRetentionViewState({
  error,
  retention,
}: {
  readonly error: unknown
  readonly retention: RetentionStatus | null
}): ComplianceViewState {
  // Security boundary: an error with NO prior snapshot surfaces the real
  // auth/permission state; once a snapshot exists it stays on screen even if a
  // background refresh fails (handled by `isComplianceStale`).
  if (error && !retention) {
    const status = errorStatus(error)
    if (status === 401) return 'unauthenticated'
    if (status === 403) return 'forbidden'
    return 'error'
  }
  // "Empty" (no retention items) is distinct from `forbidden` (a 403).
  if (retention) return retention.items.length === 0 ? 'empty' : 'ready'
  return 'loading'
}

export function resolveDsrListViewState({
  error,
  requests,
}: {
  readonly error: unknown
  readonly requests: readonly DataSubjectRequest[] | null
}): ComplianceViewState {
  if (error && !requests) {
    const status = errorStatus(error)
    if (status === 401) return 'unauthenticated'
    if (status === 403) return 'forbidden'
    return 'error'
  }
  // `null` (no answer yet) → loading; `[]` (the backend answered empty) → empty,
  // deliberately distinct from `forbidden`.
  if (requests) return requests.length === 0 ? 'empty' : 'ready'
  return 'loading'
}

// A background refresh failed but we still hold a good snapshot (retention OR the
// DSR list) — show it with a stale notice instead of blanking the console.
export function isComplianceStale(error: unknown, data: unknown | null): boolean {
  return Boolean(error) && data !== null
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
