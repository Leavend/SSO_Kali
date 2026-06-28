import { ApiError } from '@/lib/api/api-client'
import { resolveStatusTone, type StatusTone } from '@/lib/status-tone'
import type { AdminUserDetail, AdminUserListItem, UserAccountStatus } from '@/types/users.types'

export type UsersViewState =
  | 'loading'
  | 'unauthenticated'
  | 'forbidden'
  | 'error'
  | 'empty'
  | 'ready'

export type UserDetailViewState =
  | 'loading'
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'error'
  | 'ready'

// "Empty" = the backend answered with an empty population. Deliberately distinct
// from `forbidden` (a 403 → no permission) so the page shows "no users yet" copy
// rather than an access-denied surface.
export function isUsersListEmpty(list: readonly AdminUserListItem[]): boolean {
  return list.length === 0
}

export function resolveUsersViewState({
  error,
  list,
}: {
  readonly pending: boolean
  readonly error: unknown
  readonly list: readonly AdminUserListItem[] | null
}): UsersViewState {
  // Security boundary: an error with NO prior snapshot surfaces the real
  // auth/permission state. Once a list exists it stays on screen even if a
  // background refresh fails (handled by the composable's stale flag).
  if (error && !list) {
    const status = errorStatus(error)
    if (status === 401) return 'unauthenticated'
    if (status === 403) return 'forbidden'
    return 'error'
  }
  if (list) return isUsersListEmpty(list) ? 'empty' : 'ready'
  return 'loading'
}

export function resolveUserDetailViewState({
  error,
  user,
}: {
  readonly pending: boolean
  readonly error: unknown
  readonly user: AdminUserDetail | null
}): UserDetailViewState {
  if (error && !user) {
    const status = errorStatus(error)
    if (status === 401) return 'unauthenticated'
    if (status === 403) return 'forbidden'
    if (status === 404) return 'not_found'
    return 'error'
  }
  if (user) return 'ready'
  return 'loading'
}

// Reuse the shared alias map (active→success, locked→danger,
// disabled/deactivated→neutral) — Swiss reserves red for the genuinely critical
// `locked` state; routine lifecycle states are neutral.
export function resolveUserStatusTone(
  status: UserAccountStatus | string | null | undefined,
): StatusTone {
  return resolveStatusTone(status ?? null)
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
