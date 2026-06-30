import { ApiError } from '@/lib/api/api-client'
import { resolveStatusTone, type StatusTone } from '@/lib/status-tone'
import type { AdminClientDetail, AdminClientListItem, ClientStatus } from '@/types/clients.types'

export type ClientsViewState =
  | 'loading'
  | 'unauthenticated'
  | 'forbidden'
  | 'error'
  | 'empty'
  | 'ready'

export type ClientDetailViewState =
  | 'loading'
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'error'
  | 'ready'

// "Empty" = the backend answered with an empty population. Deliberately distinct
// from `forbidden` (a 403 → no permission) so the page shows "no clients yet"
// copy rather than an access-denied surface.
export function isClientsListEmpty(list: readonly AdminClientListItem[]): boolean {
  return list.length === 0
}

export function resolveClientsViewState({
  error,
  list,
}: {
  readonly pending: boolean
  readonly error: unknown
  readonly list: readonly AdminClientListItem[] | null
}): ClientsViewState {
  // Security boundary: an error with NO prior snapshot surfaces the real
  // auth/permission state. Once a list exists it stays on screen even if a
  // background refresh fails (handled by the composable's stale flag).
  if (error && !list) {
    const status = errorStatus(error)
    if (status === 401) return 'unauthenticated'
    if (status === 403) return 'forbidden'
    return 'error'
  }
  if (list) return isClientsListEmpty(list) ? 'empty' : 'ready'
  return 'loading'
}

export function resolveClientDetailViewState({
  error,
  client,
}: {
  readonly pending: boolean
  readonly error: unknown
  readonly client: AdminClientDetail | null
}): ClientDetailViewState {
  if (error && !client) {
    const status = errorStatus(error)
    if (status === 401) return 'unauthenticated'
    if (status === 403) return 'forbidden'
    if (status === 404) return 'not_found'
    return 'error'
  }
  if (client) return 'ready'
  return 'loading'
}

// Reuse the shared alias map (active→success, staged→warning,
// disabled→neutral, decommissioned→neutral) — Swiss reserves red for genuinely
// critical states, never routine lifecycle.
export function resolveClientStatusTone(
  status: ClientStatus | string | null | undefined,
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
