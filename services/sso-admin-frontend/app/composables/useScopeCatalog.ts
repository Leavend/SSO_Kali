import { computed, type ComputedRef } from 'vue'
import { clientsApi } from '@/services/clients.api'
import type { ScopeCatalogEntry, ScopeCatalogResponse } from '@/types/clients.types'

export type UseScopeCatalogReturn = {
  readonly scopes: ComputedRef<readonly ScopeCatalogEntry[]>
  readonly pending: ComputedRef<boolean>
  readonly error: ComputedRef<unknown>
}

export function useScopeCatalog(): UseScopeCatalogReturn {
  // Runs during SSR so the scope catalog hydrates with the page. It FAILS CLOSED:
  // any error yields [] so a catalog outage degrades the scope grid to "no catalog
  // scopes" rather than blocking client create/edit. The catalog carries no secret.
  const { data, pending, error } = useAsyncData<ScopeCatalogResponse>('admin-scope-catalog', () =>
    clientsApi.getScopes(),
  )

  const scopes = computed<readonly ScopeCatalogEntry[]>(() =>
    error.value ? [] : (data.value?.scopes ?? []),
  )

  return {
    scopes,
    pending: computed<boolean>(() => pending.value),
    error: computed<unknown>(() => error.value),
  }
}
