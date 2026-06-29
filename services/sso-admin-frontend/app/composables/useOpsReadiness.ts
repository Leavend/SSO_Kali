// app/composables/useOpsReadiness.ts
import { computed, toRaw, type ComputedRef } from 'vue'
import { ApiError, getLastRequestId } from '@/lib/api/api-client'
import { opsApi } from '@/services/ops.api'
import { resolveOpsViewState, type OpsViewState } from '@/lib/ops/ops-view-state'
import type { OpsReadiness } from '@/types/ops.types'

export type UseOpsReadinessReturn = {
  readonly readiness: ComputedRef<OpsReadiness | null>
  readonly viewState: ComputedRef<OpsViewState>
  readonly requestId: ComputedRef<string | null>
  readonly refresh: () => Promise<void>
}

export function useOpsReadiness(): UseOpsReadinessReturn {
  // Runs during SSR so the narrowed readiness resolves server-side and hydrates
  // into the payload (DTO only — service name, booleans, small queue counts). The
  // access token stays in the Nitro event.context and never reaches the page.
  const { data, pending, error, refresh } = useAsyncData<OpsReadiness>(
    'admin-ops-readiness',
    () => opsApi.getReadiness(),
  )

  // toRaw mirrors the read-only single-fetch twin `useDashboardSummary`: the
  // narrowed DTO is display-only, so callers receive the plain object (identity
  // comparisons / deep picks behave as expected, no reactive proxy wrapper).
  const readiness = computed<OpsReadiness | null>(() =>
    data.value != null ? toRaw(data.value) : null,
  )

  const viewState = computed<OpsViewState>(() =>
    resolveOpsViewState({
      pending: pending.value,
      error: error.value,
      readiness: readiness.value,
    }),
  )

  const requestId = computed<string | null>(() =>
    error.value instanceof ApiError
      ? (error.value.requestId ?? getLastRequestId())
      : getLastRequestId(),
  )

  return {
    readiness,
    viewState,
    requestId,
    refresh: async () => {
      await refresh()
    },
  }
}
