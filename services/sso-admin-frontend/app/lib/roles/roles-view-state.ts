import { ApiError } from '@/lib/api/api-client'
import type { StatusTone } from '@/lib/status-tone'
import type { AdminRole } from '@/types/users.types'

export type RolesViewState =
  | 'loading'
  | 'unauthenticated'
  | 'forbidden'
  | 'error'
  | 'empty'
  | 'ready'

// "Empty" = the backend answered with a zero-length role list. Deliberately
// distinct from `forbidden` (a 403 → no permission) so the page shows a
// "no roles yet" surface, not an access-denied one. `null` (unfetched) is a
// third state — it stays `loading`, never collapsing into `empty`.
export function isRolesEmpty(roles: readonly AdminRole[]): boolean {
  return roles.length === 0
}

export function resolveRolesViewState({
  error,
  roles,
}: {
  readonly pending: boolean
  readonly error: unknown
  readonly roles: readonly AdminRole[] | null
}): RolesViewState {
  // Security boundary: an error with NO prior snapshot surfaces the real
  // auth/permission state. Once a list exists it stays on screen even if a
  // background refresh fails (the composable's stale flag carries that).
  if (error && !roles) {
    const status = errorStatus(error)
    if (status === 401) return 'unauthenticated'
    if (status === 403) return 'forbidden'
    return 'error'
  }
  if (roles) return isRolesEmpty(roles) ? 'empty' : 'ready'
  return 'loading'
}

// System (built-in) roles read as `info` (protected, informational); custom
// roles are `neutral`. Swiss: status is tone + label via UiStatusBadge, never
// colour-alone, and red is reserved for the destructive affordance only.
// ponytail: fixed two-state map, not a status-alias lookup — no resolveStatusTone needed
export function resolveRoleStatusTone(isSystem: boolean): StatusTone {
  return isSystem ? 'info' : 'neutral'
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
