import { ApiError } from '@/lib/api/api-client'
import type { AdminSession } from '@/types/sessions.types'

export type SessionsViewState =
  | 'loading'
  | 'unauthenticated'
  | 'forbidden'
  | 'error'
  | 'empty'
  | 'ready'

// "Empty" = the backend answered with zero active sessions. Distinct from `forbidden`
// (403) so the page shows a "no active sessions" surface, not access-denied. `null`
// (unfetched) stays `loading`.
export function resolveSessionsViewState({
  error,
  sessions,
}: {
  readonly pending: boolean
  readonly error: unknown
  readonly sessions: readonly AdminSession[] | null
}): SessionsViewState {
  if (error && !sessions) {
    const status = errorStatus(error)
    if (status === 401) return 'unauthenticated'
    if (status === 403) return 'forbidden'
    return 'error'
  }
  if (sessions) return sessions.length === 0 ? 'empty' : 'ready'
  return 'loading'
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
