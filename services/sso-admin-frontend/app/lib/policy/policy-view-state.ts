import { ApiError } from '@/lib/api/api-client'
import type { StatusTone } from '@/lib/status-tone'
import type { SecurityPolicy } from '@/types/policy.types'

export type PolicyViewState =
  | 'loading'
  | 'unauthenticated'
  | 'forbidden'
  | 'error'
  | 'empty'
  | 'ready'

// "Empty" = the category answered with zero versions. Distinct from `forbidden`
// (403) so the page shows a "no policy yet" surface, not access-denied. `null`
// (unfetched) stays `loading` and never collapses into `empty`.
export function resolvePolicyViewState({
  error,
  policies,
}: {
  readonly pending: boolean
  readonly error: unknown
  readonly policies: readonly SecurityPolicy[] | null
}): PolicyViewState {
  // An error with NO prior snapshot surfaces the real auth/permission state. Once a
  // list exists it stays on screen even if a background refresh fails (the
  // composable's stale flag carries that).
  if (error && !policies) {
    const status = errorStatus(error)
    if (status === 401) return 'unauthenticated'
    if (status === 403) return 'forbidden'
    return 'error'
  }
  if (policies) return policies.length === 0 ? 'empty' : 'ready'
  return 'loading'
}

// Distinct tone per lifecycle status, always paired with a text label in
// UiStatusBadge (never colour-alone). active=success, draft=info, rolled_back=
// warning, superseded/unknown=neutral. Red (danger) is NOT used for status — it is
// reserved for the rollback affordance.
export function resolvePolicyStatusTone(status: string): StatusTone {
  switch (status) {
    case 'active':
      return 'success'
    case 'draft':
      return 'info'
    case 'rolled_back':
      return 'warning'
    case 'superseded':
    default:
      return 'neutral'
  }
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
