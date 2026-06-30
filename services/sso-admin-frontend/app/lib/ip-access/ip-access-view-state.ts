import { ApiError } from '@/lib/api/api-client'
import type { StatusTone } from '@/lib/status-tone'
import type { IpAccessMode, IpAccessRule } from '@/types/ip-access.types'

export type IpAccessViewState =
  | 'loading'
  | 'unauthenticated'
  | 'forbidden'
  | 'error'
  | 'empty'
  | 'ready'

export function resolveIpAccessViewState({
  error,
  rules,
}: {
  readonly pending: boolean
  readonly error: unknown
  readonly rules: readonly IpAccessRule[] | null
}): IpAccessViewState {
  if (error && !rules) {
    const status = errorStatus(error)
    if (status === 401) return 'unauthenticated'
    if (status === 403) return 'forbidden'
    return 'error'
  }
  if (rules) return rules.length === 0 ? 'empty' : 'ready'
  return 'loading'
}

// Swiss: #E4002B/--danger is reserved for destructive affordances + inline
// validation, NOT for a benign mode badge. allow → success, block → warning
// (the badge carries both tone AND label; colour is never load-bearing). This is
// a deliberate divergence from the legacy SPA, which rendered block in danger-red.
export function resolveModeTone(mode: IpAccessMode): StatusTone {
  return mode === 'allow' ? 'success' : 'warning'
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
