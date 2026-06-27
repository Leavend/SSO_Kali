import { computed, toRaw, type ComputedRef } from 'vue'
import { ApiError, getLastRequestId } from '@/lib/api/api-client'
import { dashboardApi } from '@/services/dashboard.api'
import {
  isDashboardStale,
  resolveDashboardViewState,
  type DashboardViewState,
} from '@/lib/dashboard/dashboard-view-state'
import type { DashboardSummary } from '@/types/dashboard.types'

export type UseDashboardSummaryReturn = {
  readonly summary: ComputedRef<DashboardSummary | null>
  readonly viewState: ComputedRef<DashboardViewState>
  readonly requestId: ComputedRef<string | null>
  readonly degraded: ComputedRef<readonly string[]>
  readonly isStale: ComputedRef<boolean>
  readonly refresh: () => Promise<void>
}

export function useDashboardSummary(): UseDashboardSummaryReturn {
  // Runs during SSR so the masked summary resolves server-side and hydrates into
  // the payload (safe DTO only — counters + timestamp). The access token stays in
  // the Nitro event.context and never reaches the page or window.__NUXT__.
  const { data, pending, error, refresh } = useAsyncData<DashboardSummary>(
    'admin-dashboard-summary',
    () => dashboardApi.getSummary(),
  )

  // toRaw: the masked DTO is display-only; callers receive the plain object so
  // identity comparisons (and toRaw-based deep picks) work as expected.
  const summary = computed<DashboardSummary | null>(() =>
    data.value != null ? toRaw(data.value) : null,
  )

  const viewState = computed<DashboardViewState>(() =>
    resolveDashboardViewState({
      pending: pending.value,
      error: error.value,
      summary: summary.value,
    }),
  )

  const isStale = computed<boolean>(() => isDashboardStale(error.value, summary.value))

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
