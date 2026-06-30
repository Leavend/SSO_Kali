import { computed, toRaw, toValue, type ComputedRef, type MaybeRefOrGetter } from 'vue'
import { ApiError, getLastRequestId } from '@/lib/api/api-client'
import { clientsApi } from '@/services/clients.api'
import {
  resolveClientDetailViewState,
  type ClientDetailViewState,
} from '@/lib/clients/clients-view-state'
import type { AdminClientDetail, ClientDetailResponse } from '@/types/clients.types'

export type UseClientDetailReturn = {
  readonly client: ComputedRef<AdminClientDetail | null>
  readonly viewState: ComputedRef<ClientDetailViewState>
  readonly requestId: ComputedRef<string | null>
  readonly refresh: () => Promise<void>
}

export function useClientDetail(clientId: MaybeRefOrGetter<string>): UseClientDetailReturn {
  // ponytail: the id is resolved once at setup. Nuxt re-runs page setup on a
  // route-param change (navigating /clients/A → /clients/B remounts), so a static
  // per-client key is correct; make it reactive only if same-component id swaps
  // ever appear.
  const id = toValue(clientId)

  // Runs during SSR so the masked detail DTO resolves server-side and hydrates
  // into the payload (only `has_secret_hash` — never a secret). The Bearer token
  // stays in Nitro event.context and never reaches window.__NUXT__.
  const { data, pending, error, refresh } = useAsyncData<ClientDetailResponse>(
    'admin-client-detail:' + id,
    () => clientsApi.show(id),
  )

  // toRaw: the masked DTO is display-only; callers receive plain objects so
  // identity comparisons and toRaw-based deep picks behave as expected.
  const client = computed<AdminClientDetail | null>(() =>
    data.value != null ? toRaw(data.value.client) : null,
  )

  const viewState = computed<ClientDetailViewState>(() =>
    resolveClientDetailViewState({
      pending: pending.value,
      error: error.value,
      client: client.value,
    }),
  )

  const requestId = computed<string | null>(() =>
    error.value instanceof ApiError
      ? (error.value.requestId ?? getLastRequestId())
      : getLastRequestId(),
  )

  return {
    client,
    viewState,
    requestId,
    refresh: async () => {
      await refresh()
    },
  }
}
