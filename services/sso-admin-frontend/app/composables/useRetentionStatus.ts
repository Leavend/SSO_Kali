import { computed, toRaw, type ComputedRef } from 'vue'
import { ApiError, getLastRequestId } from '@/lib/api/api-client'
import { observabilityApi } from '@/services/observability.api'
import {
  isComplianceStale,
  resolveRetentionViewState,
  type ComplianceViewState,
} from '@/lib/compliance/compliance-view-state'
import type { RetentionResponse, RetentionStatus } from '@/types/compliance.types'

export type UseRetentionStatusReturn = {
  readonly retention: ComputedRef<RetentionStatus | null>
  readonly viewState: ComputedRef<ComplianceViewState>
  readonly requestId: ComputedRef<string | null>
  readonly isStale: ComputedRef<boolean>
  readonly refresh: () => Promise<void>
}

export function useRetentionStatus(): UseRetentionStatusReturn {
  // Runs during SSR so the masked retention status resolves server-side and
  // hydrates into the payload (safe DTO only — categories, windows, prune
  // timestamps). The access token stays in the Nitro event.context and never
  // reaches the page or window.__NUXT__.
  const { data, error, refresh } = useAsyncData<RetentionResponse>('admin-retention-status', () =>
    observabilityApi.getRetention(),
  )

  // toRaw: the masked DTO is display-only; callers receive the plain object so
  // identity comparisons work as expected. `null` (no response yet) is kept
  // distinct from an answered status so the resolver tells loading from empty.
  const retention = computed<RetentionStatus | null>(() =>
    data.value != null ? toRaw(data.value.retention) : null,
  )

  const viewState = computed<ComplianceViewState>(() =>
    resolveRetentionViewState({ error: error.value, retention: retention.value }),
  )

  // A background refresh failed but we still hold a good snapshot — keep it on
  // screen with a stale notice rather than blanking the panel.
  const isStale = computed<boolean>(() => isComplianceStale(error.value, retention.value))

  const requestId = computed<string | null>(() =>
    error.value instanceof ApiError
      ? (error.value.requestId ?? getLastRequestId())
      : getLastRequestId(),
  )

  return {
    retention,
    viewState,
    requestId,
    isStale,
    refresh: async () => {
      await refresh()
    },
  }
}
