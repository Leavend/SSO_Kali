import { computed, type ComputedRef, type Ref } from 'vue'
import { ApiError, getLastRequestId } from '@/lib/api/api-client'
import { externalIdpsApi } from '@/services/external-idps.api'
import {
  resolveExternalIdpsViewState,
  type ExternalIdpsViewState,
} from '@/lib/external-idps/external-idps-view-state'
import type { ExternalIdentityProvider, ExternalIdpListResponse } from '@/types/external-idps.types'

export type UseExternalIdpsListReturn = {
  readonly providers: Ref<readonly ExternalIdentityProvider[] | null>
  readonly viewState: ComputedRef<ExternalIdpsViewState>
  readonly isStale: ComputedRef<boolean>
  readonly requestId: ComputedRef<string | null>
  readonly pending: Ref<boolean>
  readonly refresh: () => Promise<void>
}

export function useExternalIdpsList(): UseExternalIdpsListReturn {
  // SSR-resolves the masked provider list (no secret in the DTO — has_client_secret is
  // a boolean). The token stays in Nitro event.context.
  const { data, pending, error, refresh } = useAsyncData<ExternalIdpListResponse>(
    'admin-external-idps-list',
    () => externalIdpsApi.list(),
  )

  const providers = computed<readonly ExternalIdentityProvider[] | null>(
    () => data.value?.providers ?? null,
  )

  const viewState = computed<ExternalIdpsViewState>(() =>
    resolveExternalIdpsViewState({
      pending: pending.value,
      error: error.value,
      providers: providers.value,
    }),
  )

  const isStale = computed<boolean>(() => Boolean(error.value) && providers.value !== null)

  const requestId = computed<string | null>(() =>
    error.value instanceof ApiError
      ? (error.value.requestId ?? getLastRequestId())
      : getLastRequestId(),
  )

  return {
    providers,
    viewState,
    isStale,
    requestId,
    pending,
    refresh: async () => {
      await refresh()
    },
  }
}
