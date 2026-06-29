import { ApiError } from '@/lib/api/api-client'
import type { StatusTone } from '@/lib/status-tone'
import type { OpsQueueCheck, OpsReadiness } from '@/types/ops.types'

export type OpsViewState = 'loading' | 'unauthenticated' | 'forbidden' | 'error' | 'ready'

export type ResolveOpsViewStateArgs = {
  // `pending` is part of the args for call-site uniformity with the other domain
  // composables; the readiness page has no idle/empty state, so it is unused here.
  readonly pending: boolean
  readonly error: unknown
  readonly readiness: OpsReadiness | null
}

// Security boundary: an error with NO readiness must surface the real
// auth/permission state, never be hidden. There is no "stale snapshot" path —
// readiness is a single fetch with no background refresh-with-data semantics.
export function resolveOpsViewState({ error, readiness }: ResolveOpsViewStateArgs): OpsViewState {
  if (error && !readiness) {
    const status = errorStatus(error)
    if (status === 401) return 'unauthenticated'
    if (status === 403) return 'forbidden'
    return 'error'
  }
  if (readiness) return 'ready'
  return 'loading'
}

// "down" / "degraded" is a genuinely critical state, so it earns the danger
// tone (matches the shipped external-idps `resolveHealthTone` and dashboard
// `locked/rejected -> danger`). This is the status-badge tone palette, NOT the
// reserved-for-destructive `#E4002B` accent.
export function resolveReadinessTone(ready: boolean): StatusTone {
  return ready ? 'success' : 'danger'
}

export function resolveCheckTone(ok: boolean): StatusTone {
  return ok ? 'success' : 'danger'
}

export function resolveQueueTone(queue: OpsQueueCheck): StatusTone {
  if (queue.failed_jobs > 0) return 'danger'
  if (queue.pending_jobs > 0) return 'warning'
  return 'success'
}

// Hydration-safe: a custom ApiError instance does not survive `useAsyncData`'s
// SSR error serialization, so also read the plain `{ statusCode | status }` shape.
function errorStatus(error: unknown): number | null {
  if (error instanceof ApiError) return error.status
  if (typeof error === 'object' && error !== null) {
    const candidate = error as { statusCode?: unknown; status?: unknown }
    if (typeof candidate.statusCode === 'number') return candidate.statusCode
    if (typeof candidate.status === 'number') return candidate.status
  }
  return null
}
