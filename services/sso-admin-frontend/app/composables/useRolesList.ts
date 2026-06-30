import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'
import { ApiError, getLastRequestId } from '@/lib/api/api-client'
import { rolesApi } from '@/services/roles.api'
import { resolveRolesViewState, type RolesViewState } from '@/lib/roles/roles-view-state'
import { ROLES_PAGE_SIZE, filterRoles, paginateRoles, rolesPageCount } from '@/lib/roles/roles-list'
import type { AdminRole, RolesResponse } from '@/types/users.types'

export type UseRolesListReturn = {
  readonly roles: Ref<readonly AdminRole[] | null>
  readonly filtered: ComputedRef<readonly AdminRole[]>
  readonly paged: ComputedRef<readonly AdminRole[]>
  readonly total: ComputedRef<number>
  readonly filteredTotal: ComputedRef<number>
  readonly pageCount: ComputedRef<number>
  readonly page: Ref<number>
  readonly query: Ref<string>
  readonly viewState: ComputedRef<RolesViewState>
  readonly isStale: ComputedRef<boolean>
  readonly requestId: ComputedRef<string | null>
  readonly pending: Ref<boolean>
  readonly refresh: () => Promise<void>
}

export function useRolesList(): UseRolesListReturn {
  // Runs during SSR so the masked role list resolves server-side and hydrates
  // into the payload (safe DTO only — slugs, names, descriptions, counts). The
  // access token stays in the Nitro event.context and never reaches __NUXT__.
  const { data, pending, error, refresh } = useAsyncData<RolesResponse>('admin-roles-list', () =>
    rolesApi.list(),
  )

  // `null` (no response yet) is kept distinct from `[]` (an answered, empty
  // catalog) so the view-state resolver tells loading/error apart from empty.
  const roles = computed<readonly AdminRole[] | null>(() => data.value?.roles ?? null)
  const list = computed<readonly AdminRole[]>(() => roles.value ?? [])

  const query = ref('')
  const page = ref(1)

  const filtered = computed<readonly AdminRole[]>(() => filterRoles(list.value, query.value))
  const total = computed<number>(() => list.value.length)
  const filteredTotal = computed<number>(() => filtered.value.length)
  const pageCount = computed<number>(() => rolesPageCount(filteredTotal.value, ROLES_PAGE_SIZE))
  const paged = computed<readonly AdminRole[]>(() =>
    paginateRoles(filtered.value, page.value, ROLES_PAGE_SIZE),
  )

  const viewState = computed<RolesViewState>(() =>
    resolveRolesViewState({ pending: pending.value, error: error.value, roles: roles.value }),
  )

  // A background refresh failed but we still hold a good list — keep it on screen
  // with a stale notice rather than blanking the table.
  const isStale = computed<boolean>(() => Boolean(error.value) && roles.value !== null)

  const requestId = computed<string | null>(() =>
    error.value instanceof ApiError
      ? (error.value.requestId ?? getLastRequestId())
      : getLastRequestId(),
  )

  // Reset to the first page whenever the result set narrows, so a tighter search
  // never strands the operator on an out-of-range page.
  watch(query, () => {
    page.value = 1
  })

  return {
    roles,
    filtered,
    paged,
    total,
    filteredTotal,
    pageCount,
    page,
    query,
    viewState,
    isStale,
    requestId,
    pending,
    refresh: async () => {
      await refresh()
    },
  }
}
