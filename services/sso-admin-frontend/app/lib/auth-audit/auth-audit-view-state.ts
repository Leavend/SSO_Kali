import { ApiError } from '@/lib/api/api-client'
import type { StatusTone } from '@/lib/status-tone'
import type { AuthAuditEvent } from '@/types/auth-audit.types'

export type AuthAuditViewState =
  | 'loading'
  | 'unauthenticated'
  | 'forbidden'
  | 'error'
  | 'empty'
  | 'ready'

export type ResolveAuthAuditViewStateArgs = {
  // `pending` is part of the args for call-site uniformity with the other domain
  // composables; the resolver derives loading from the absence of events + error.
  readonly pending: boolean
  readonly error: unknown
  readonly events: readonly AuthAuditEvent[] | null
}

// Security boundary: an error with NO prior events must surface the real
// auth/permission state. A background error that still holds events keeps the
// list on screen (handled as stale by the composable).
export function resolveAuthAuditViewState({
  error,
  events,
}: ResolveAuthAuditViewStateArgs): AuthAuditViewState {
  if (error && !events) {
    const status = errorStatus(error)
    if (status === 401) return 'unauthenticated'
    if (status === 403) return 'forbidden'
    return 'error'
  }
  if (events) return events.length === 0 ? 'empty' : 'ready'
  return 'loading'
}

// outcome ∈ {failed, started, succeeded}. A failed authentication is a genuinely
// critical state -> danger tone (the shipped resolveHealthTone precedent); this is
// the status-badge tone palette, not the reserved-for-destructive #E4002B accent.
export function resolveOutcomeTone(outcome: string): StatusTone {
  switch (outcome) {
    case 'succeeded':
      return 'success'
    case 'failed':
      return 'danger'
    case 'started':
      return 'info'
    default:
      return 'neutral'
  }
}

// Hydration-safe: a custom ApiError instance does not survive useAsyncData's SSR
// error serialization, so also read the plain `{ statusCode | status }` shape.
function errorStatus(error: unknown): number | null {
  if (error instanceof ApiError) return error.status
  if (typeof error === 'object' && error !== null) {
    const candidate = error as { statusCode?: unknown; status?: unknown }
    if (typeof candidate.statusCode === 'number') return candidate.statusCode
    if (typeof candidate.status === 'number') return candidate.status
  }
  return null
}
