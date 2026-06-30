// app/composables/useOidcFoundation.ts
import { computed, toRaw, type ComputedRef } from 'vue'
import { ApiError, getLastRequestId } from '@/lib/api/api-client'
import { oidcFoundationApi } from '@/services/oidc-foundation.api'
import {
  resolveOidcFoundationViewState,
  type OidcFoundationViewState,
} from '@/lib/oidc-foundation/oidc-foundation-view-state'
import type { OidcFoundationSnapshot } from '@/types/oidc-foundation.types'

export type UseOidcFoundationReturn = {
  readonly snapshot: ComputedRef<OidcFoundationSnapshot | null>
  readonly viewState: ComputedRef<OidcFoundationViewState>
  readonly requestId: ComputedRef<string | null>
  readonly refresh: () => Promise<void>
}

export function useOidcFoundation(): UseOidcFoundationReturn {
  // Runs during SSR so the public snapshot resolves server-side and hydrates as
  // safe DTO only (no token/secret/private key/PII). The token stays in Nitro
  // event.context.
  const { data, pending, error, refresh } = useAsyncData<OidcFoundationSnapshot>(
    'admin-oidc-foundation',
    () => oidcFoundationApi.getSnapshot(),
  )

  const snapshot = computed<OidcFoundationSnapshot | null>(() =>
    data.value != null ? toRaw(data.value) : null,
  )

  const viewState = computed<OidcFoundationViewState>(() =>
    resolveOidcFoundationViewState({
      pending: pending.value,
      error: error.value,
      snapshot: snapshot.value,
    }),
  )

  const requestId = computed<string | null>(() =>
    error.value instanceof ApiError
      ? (error.value.requestId ?? getLastRequestId())
      : getLastRequestId(),
  )

  return {
    snapshot,
    viewState,
    requestId,
    refresh: async () => {
      await refresh()
    },
  }
}
