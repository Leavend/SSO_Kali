import { computed, toRaw, type ComputedRef } from 'vue'
import { ApiError, getLastRequestId } from '@/lib/api/api-client'
import { observabilityApi } from '@/services/observability.api'
import {
  isObservabilityStale,
  resolveObservabilityViewState,
  type ObservabilityViewState,
} from '@/lib/observability/observability-view-state'
import type { ObservabilitySummary } from '@/types/observability.types'

export type UseObservabilitySummaryReturn = {
  readonly summary: ComputedRef<ObservabilitySummary | null>
  readonly viewState: ComputedRef<ObservabilityViewState>
  readonly requestId: ComputedRef<string | null>
  readonly degraded: ComputedRef<readonly string[]>
  readonly isStale: ComputedRef<boolean>
  readonly refresh: () => Promise<void>
}

export function useObservabilitySummary(): UseObservabilitySummaryReturn {
  // Runs during SSR so the masked summary resolves server-side and hydrates into
  // the payload (safe DTO only — service health, aggregate metrics, masked log
  // references + timestamps). The access token stays in the Nitro event.context
  // and never reaches the page or window.__NUXT__.
  const { data, error, refresh } = useAsyncData<ObservabilitySummary>(
    'admin-observability-summary',
    () => observabilityApi.getSummary(),
  )

  // toRaw: the masked DTO is display-only; callers receive the plain object so
  // identity comparisons (and toRaw-based deep picks) work as expected.
  const summary = computed<ObservabilitySummary | null>(() =>
    data.value != null ? toRaw(data.value) : null,
  )

  const viewState = computed<ObservabilityViewState>(() =>
    resolveObservabilityViewState({ error: error.value, summary: summary.value }),
  )

  const isStale = computed<boolean>(() => isObservabilityStale(error.value, summary.value))

  const requestId = computed<string | null>(() =>
    error.value instanceof ApiError
      ? (error.value.requestId ?? getLastRequestId())
      : getLastRequestId(),
  )

  const degraded = computed<readonly string[]>(() =>
    summary.value?.partial ? summary.value.degraded : [],
  )

  return {
    summary,
    viewState,
    requestId,
    degraded,
    isStale,
    refresh: async () => {
      await refresh()
    },
  }
}
