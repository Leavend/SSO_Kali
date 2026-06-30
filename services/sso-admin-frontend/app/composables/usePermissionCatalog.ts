import { computed, type ComputedRef, type Ref } from 'vue'
import { ApiError, getLastRequestId } from '@/lib/api/api-client'
import { rolesApi } from '@/services/roles.api'
import { resolveRolesViewState, type RolesViewState } from '@/lib/roles/roles-view-state'
import type { AdminPermission, AdminRole, PermissionsResponse } from '@/types/users.types'

export type UsePermissionCatalogReturn = {
  readonly permissions: Ref<readonly AdminPermission[] | null>
  readonly viewState: ComputedRef<RolesViewState>
  readonly isStale: ComputedRef<boolean>
  readonly requestId: ComputedRef<string | null>
  readonly pending: Ref<boolean>
  readonly refresh: () => Promise<void>
}

export function usePermissionCatalog(): UsePermissionCatalogReturn {
  // Runs during SSR so the permission catalog resolves server-side and hydrates
  // into the payload (safe config only — slugs, names, descriptions, categories;
  // permission slugs are public config). Independent of the role-list fetch so a
  // failing catalog degrades the matrix column labels, not the whole page.
  const { data, pending, error, refresh } = useAsyncData<PermissionsResponse>(
    'admin-permissions',
    () => rolesApi.permissions(),
  )

  // `null` (unfetched) stays distinct from `[]` (answered, empty catalog).
  const permissions = computed<readonly AdminPermission[] | null>(
    () => data.value?.permissions ?? null,
  )

  const viewState = computed<RolesViewState>(() =>
    resolveRolesViewState({
      pending: pending.value,
      error: error.value,
      // ponytail: the resolver is emptiness-only (null vs [] vs has-items); the
      // catalog reuses it through the AdminRole-shaped arg — only null-ness and
      // .length are read, never role-specific fields. No second resolver needed.
      roles: permissions.value as readonly AdminRole[] | null,
    }),
  )

  const isStale = computed<boolean>(() => Boolean(error.value) && permissions.value !== null)

  const requestId = computed<string | null>(() =>
    error.value instanceof ApiError
      ? (error.value.requestId ?? getLastRequestId())
      : getLastRequestId(),
  )

  return {
    permissions,
    viewState,
    isStale,
    requestId,
    pending,
    refresh: async () => {
      await refresh()
    },
  }
}
