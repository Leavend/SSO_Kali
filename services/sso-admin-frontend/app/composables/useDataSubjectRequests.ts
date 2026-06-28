import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'
import { ApiError, getLastRequestId } from '@/lib/api/api-client'
import { observabilityApi } from '@/services/observability.api'
import {
  isComplianceStale,
  resolveDsrListViewState,
  type ComplianceViewState,
} from '@/lib/compliance/compliance-view-state'
import { DSR_PAGE_SIZE, dsrPageCount, filterDsr, paginateDsr } from '@/lib/compliance/dsr-list'
import type { DataSubjectRequest, DsrListResponse, DsrStatus } from '@/types/compliance.types'

export type UseDataSubjectRequestsReturn = {
  readonly requests: ComputedRef<readonly DataSubjectRequest[] | null>
  readonly filtered: ComputedRef<readonly DataSubjectRequest[]>
  readonly paged: ComputedRef<readonly DataSubjectRequest[]>
  readonly viewState: ComputedRef<ComplianceViewState>
  readonly total: ComputedRef<number>
  readonly filteredTotal: ComputedRef<number>
  readonly page: Ref<number>
  readonly pageCount: ComputedRef<number>
  readonly query: Ref<string>
  readonly statusFilter: Ref<DsrStatus | 'all'>
  readonly requestId: ComputedRef<string | null>
  readonly isStale: ComputedRef<boolean>
  readonly refresh: () => Promise<void>
}

export function useDataSubjectRequests(): UseDataSubjectRequestsReturn {
  // Runs during SSR so the masked DSR queue resolves server-side and hydrates into
  // the payload (safe DTO only — opaque request_id/subject_id + lifecycle dates).
  // The access token stays in the Nitro event.context and never reaches the
  // page/__NUXT__.
  const { data, error, refresh } = useAsyncData<DsrListResponse>('admin-dsr-list', () =>
    observabilityApi.listDataSubjectRequests(),
  )

  // `null` (no response yet) is kept distinct from `[]` (an answered, empty queue)
  // so the view-state resolver tells "loading/error" apart from "empty". `rows` is
  // the non-null projection used for the derived filter/paginate pipeline.
  const requests = computed<readonly DataSubjectRequest[] | null>(
    () => data.value?.requests ?? null,
  )
  const rows = computed<readonly DataSubjectRequest[]>(() => requests.value ?? [])

  const query = ref('')
  const statusFilter = ref<DsrStatus | 'all'>('all')
  const page = ref(1)

  // The backend DSR list has no query params, so search / status-filter /
  // pagination are derived client-side over the hydrated, already-masked queue.
  const filtered = computed<readonly DataSubjectRequest[]>(() =>
    filterDsr(rows.value, { query: query.value, status: statusFilter.value }),
  )
  const total = computed<number>(() => rows.value.length)
  const filteredTotal = computed<number>(() => filtered.value.length)
  const pageCount = computed<number>(() => dsrPageCount(filteredTotal.value, DSR_PAGE_SIZE))
  const paged = computed<readonly DataSubjectRequest[]>(() =>
    paginateDsr(filtered.value, page.value, DSR_PAGE_SIZE),
  )

  const viewState = computed<ComplianceViewState>(() =>
    resolveDsrListViewState({ error: error.value, requests: requests.value }),
  )

  // A background refresh failed but we still hold a good queue — keep it on screen
  // with a stale notice rather than blanking the table.
  const isStale = computed<boolean>(() => isComplianceStale(error.value, requests.value))

  const requestId = computed<string | null>(() =>
    error.value instanceof ApiError
      ? (error.value.requestId ?? getLastRequestId())
      : getLastRequestId(),
  )

  // Reset to the first page whenever the result set changes, so a narrowing
  // search/filter never strands the operator on an out-of-range page.
  watch([query, statusFilter], () => {
    page.value = 1
  })

  return {
    requests,
    filtered,
    paged,
    viewState,
    total,
    filteredTotal,
    page,
    pageCount,
    query,
    statusFilter,
    requestId,
    isStale,
    refresh: async () => {
      await refresh()
    },
  }
}
