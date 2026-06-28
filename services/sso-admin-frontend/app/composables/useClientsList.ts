import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'
import { ApiError, getLastRequestId } from '@/lib/api/api-client'
import { clientsApi } from '@/services/clients.api'
import { resolveClientsViewState, type ClientsViewState } from '@/lib/clients/clients-view-state'
import {
  CLIENTS_PAGE_SIZE,
  clientsPageCount,
  filterClients,
  mergeClients,
  paginateClients,
  type ClientsStatusFilter,
} from '@/lib/clients/clients-list'
import type { AdminClientListItem } from '@/types/clients.types'

// The handler returns the merged list plus the request id captured at fetch time,
// so a redacted support ref survives into the hydrated payload even on success.
type ClientsListData = {
  readonly clients: readonly AdminClientListItem[]
  readonly requestId: string | null
}

export type UseClientsListReturn = {
  readonly clients: ComputedRef<readonly AdminClientListItem[] | null>
  readonly filtered: ComputedRef<readonly AdminClientListItem[]>
  readonly paged: ComputedRef<readonly AdminClientListItem[]>
  readonly viewState: ComputedRef<ClientsViewState>
  readonly total: ComputedRef<number>
  readonly filteredTotal: ComputedRef<number>
  readonly page: Ref<number>
  readonly pageCount: ComputedRef<number>
  readonly query: Ref<string>
  readonly statusFilter: Ref<ClientsStatusFilter>
  readonly requestId: ComputedRef<string | null>
  readonly isStale: ComputedRef<boolean>
  readonly refresh: () => Promise<void>
}

export function useClientsList(): UseClientsListReturn {
  // Runs during SSR: the runtime clients and the staged registrations are fetched
  // in parallel and merged server-side, so the masked DTO hydrates with no client
  // flash. Only `has_secret_hash` crosses — never a secret — and the Bearer token
  // stays in the Nitro event.context, never reaching the page/__NUXT__.
  const { data, pending, error, refresh } = useAsyncData<ClientsListData>(
    'admin-clients-list',
    async () => {
      const [list, regs] = await Promise.all([clientsApi.list(), clientsApi.registrations()])
      return {
        clients: mergeClients(list.clients, regs.registrations),
        requestId: getLastRequestId(),
      }
    },
  )

  // `null` (no response yet) is kept distinct from `[]` (an answered, empty list)
  // so the view-state resolver tells "loading/error" apart from "empty".
  const clients = computed<readonly AdminClientListItem[] | null>(() => data.value?.clients ?? null)
  const rows = computed<readonly AdminClientListItem[]>(() => clients.value ?? [])

  const query = ref('')
  const statusFilter = ref<ClientsStatusFilter>('all')
  const page = ref(1)

  const filtered = computed<readonly AdminClientListItem[]>(() =>
    filterClients(rows.value, { query: query.value, status: statusFilter.value }),
  )
  const total = computed<number>(() => rows.value.length)
  const filteredTotal = computed<number>(() => filtered.value.length)
  const pageCount = computed<number>(() => clientsPageCount(filteredTotal.value, CLIENTS_PAGE_SIZE))
  const paged = computed<readonly AdminClientListItem[]>(() =>
    paginateClients(filtered.value, page.value, CLIENTS_PAGE_SIZE),
  )

  const viewState = computed<ClientsViewState>(() =>
    resolveClientsViewState({ pending: pending.value, error: error.value, list: clients.value }),
  )

  // A background refresh failed but we still hold a good list — keep it on screen
  // with a stale notice rather than blanking the table.
  const isStale = computed<boolean>(() => Boolean(error.value) && clients.value !== null)

  const requestId = computed<string | null>(() =>
    error.value instanceof ApiError
      ? (error.value.requestId ?? getLastRequestId())
      : (data.value?.requestId ?? getLastRequestId()),
  )

  // Reset to the first page whenever the result set changes, so a narrowing
  // search/filter never strands the operator on an out-of-range page.
  watch([query, statusFilter], () => {
    page.value = 1
  })

  return {
    clients,
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
