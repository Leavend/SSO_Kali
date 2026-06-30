import { ApiError } from '@/lib/api/api-client'
import type { StatusTone } from '@/lib/status-tone'
import type { ExternalIdentityProvider } from '@/types/external-idps.types'

export type ExternalIdpsViewState =
  | 'loading'
  | 'unauthenticated'
  | 'forbidden'
  | 'error'
  | 'empty'
  | 'ready'

export function resolveExternalIdpsViewState({
  error,
  providers,
}: {
  readonly pending: boolean
  readonly error: unknown
  readonly providers: readonly ExternalIdentityProvider[] | null
}): ExternalIdpsViewState {
  if (error && !providers) {
    const status = errorStatus(error)
    if (status === 401) return 'unauthenticated'
    if (status === 403) return 'forbidden'
    return 'error'
  }
  if (providers) return providers.length === 0 ? 'empty' : 'ready'
  return 'loading'
}

// health_status ∈ {healthy, unhealthy, unknown}. Tone + label via UiStatusBadge
// (never colour-alone); danger only for genuinely unhealthy.
export function resolveHealthTone(status: string | null | undefined): StatusTone {
  switch (status) {
    case 'healthy':
      return 'success'
    case 'unhealthy':
      return 'danger'
    default:
      return 'neutral'
  }
}

export function resolveEnabledTone(enabled: boolean | undefined): StatusTone {
  return enabled ? 'success' : 'neutral'
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
