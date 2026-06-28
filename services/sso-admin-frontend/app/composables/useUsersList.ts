import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'
import { ApiError, getLastRequestId } from '@/lib/api/api-client'
import { usersApi } from '@/services/users.api'
import { resolveUsersViewState, type UsersViewState } from '@/lib/users/users-view-state'
import {
  USERS_PAGE_SIZE,
  filterUsers,
  pageCount as computePageCount,
  paginateUsers,
  type UsersStatusFilter,
} from '@/lib/users/users-list'
import type { AdminUserListItem, UserListResponse } from '@/types/users.types'

export type UseUsersListReturn = {
  readonly users: ComputedRef<readonly AdminUserListItem[]>
  readonly filtered: ComputedRef<readonly AdminUserListItem[]>
  readonly paged: ComputedRef<readonly AdminUserListItem[]>
  readonly viewState: ComputedRef<UsersViewState>
  readonly total: ComputedRef<number>
  readonly filteredTotal: ComputedRef<number>
  readonly page: Ref<number>
  readonly pageCount: ComputedRef<number>
  readonly query: Ref<string>
  readonly statusFilter: Ref<UsersStatusFilter>
  readonly requestId: ComputedRef<string | null>
  readonly isStale: ComputedRef<boolean>
  readonly refresh: () => Promise<void>
}

export function useUsersList(): UseUsersListReturn {
  // Runs during SSR so the masked list resolves server-side and hydrates into the
  // payload (safe DTO only — masked identifiers + lifecycle fields). The access
  // token stays in the Nitro event.context and never reaches the page/__NUXT__.
  const { data, pending, error, refresh } = useAsyncData<UserListResponse>('admin-users-list', () =>
    usersApi.list(),
  )

  // `null` (no response yet) is kept distinct from `[]` (an answered, empty list)
  // so the view-state resolver tells "loading/error" apart from "empty".
  const list = computed<readonly AdminUserListItem[] | null>(() => data.value?.users ?? null)
  const users = computed<readonly AdminUserListItem[]>(() => list.value ?? [])

  const query = ref('')
  const statusFilter = ref<UsersStatusFilter>('all')
  const page = ref(1)

  const filtered = computed<readonly AdminUserListItem[]>(() =>
    filterUsers(users.value, { query: query.value, status: statusFilter.value }),
  )
  const total = computed<number>(() => users.value.length)
  const filteredTotal = computed<number>(() => filtered.value.length)
  const pageCount = computed<number>(() => computePageCount(filteredTotal.value, USERS_PAGE_SIZE))
  const paged = computed<readonly AdminUserListItem[]>(() =>
    paginateUsers(filtered.value, page.value, USERS_PAGE_SIZE),
  )

  const viewState = computed<UsersViewState>(() =>
    resolveUsersViewState({ pending: pending.value, error: error.value, list: list.value }),
  )

  // A background refresh failed but we still hold a good list — keep it on screen
  // with a stale notice rather than blanking the table.
  const isStale = computed<boolean>(() => Boolean(error.value) && list.value !== null)

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
    users,
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
