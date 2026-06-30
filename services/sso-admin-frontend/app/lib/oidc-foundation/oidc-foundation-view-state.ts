import { ApiError } from '@/lib/api/api-client'
import type { StatusTone } from '@/lib/status-tone'
import type {
  OidcAvailabilityStatus,
  OidcConsistencyStatus,
  OidcEvidenceStatus,
  OidcFoundationSnapshot,
  ScopeLabelStatus,
} from '@/types/oidc-foundation.types'

export type OidcFoundationViewState =
  | 'loading'
  | 'unauthenticated'
  | 'forbidden'
  | 'error'
  | 'ready'

export type ResolveOidcFoundationViewStateArgs = {
  // `pending` is part of the args for call-site uniformity with the other domain
  // composables; a snapshot always carries data, so there is no empty state.
  readonly pending: boolean
  readonly error: unknown
  readonly snapshot: OidcFoundationSnapshot | null
}

export function resolveOidcFoundationViewState({
  error,
  snapshot,
}: ResolveOidcFoundationViewStateArgs): OidcFoundationViewState {
  if (error && !snapshot) {
    const status = errorStatus(error)
    if (status === 401) return 'unauthenticated'
    if (status === 403) return 'forbidden'
    return 'error'
  }
  if (snapshot) return 'ready'
  return 'loading'
}

// danger is used for the genuinely-bad health states (unavailable / missing /
// failed / mismatch) — the shipped resolveHealthTone precedent. This is the
// status-badge tone palette, not the reserved-for-destructive #E4002B accent.
export function resolveAvailabilityTone(status: OidcAvailabilityStatus): StatusTone {
  switch (status) {
    case 'healthy':
      return 'success'
    case 'degraded':
      return 'warning'
    case 'unavailable':
      return 'danger'
    default:
      return 'neutral'
  }
}

export function resolveEvidenceTone(status: OidcEvidenceStatus): StatusTone {
  switch (status) {
    case 'available':
    case 'recorded':
      return 'success'
    case 'stale':
      return 'warning'
    case 'missing':
    case 'failed':
      return 'danger'
    default:
      return 'neutral'
  }
}

// JWKS key lifecycle status. The backend currently emits 'published' for every
// active signing key; the shared resolveStatusTone has no alias for it, so this
// domain-scoped resolver keeps a published key reading as healthy (success).
export function resolveJwksKeyTone(status: string): StatusTone {
  switch (status) {
    case 'published':
    case 'active':
      return 'success'
    case 'rotated':
    case 'retiring':
      return 'warning'
    default:
      return 'neutral'
  }
}

export function resolveConsistencyTone(status: OidcConsistencyStatus): StatusTone {
  switch (status) {
    case 'pass':
      return 'success'
    case 'warning':
      return 'warning'
    case 'mismatch':
      return 'danger'
    default:
      return 'neutral'
  }
}

export function resolveScopeLabelTone(status: ScopeLabelStatus): StatusTone {
  switch (status) {
    case 'mapped':
      return 'success'
    case 'missing_label':
    case 'unknown_custom':
      return 'warning'
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
