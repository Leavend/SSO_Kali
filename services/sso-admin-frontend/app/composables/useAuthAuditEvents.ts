// app/composables/useAuthAuditEvents.ts
import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { ApiError, getLastRequestId } from '@/lib/api/api-client'
import { authAuditApi } from '@/services/auth-audit.api'
import {
  resolveAuthAuditViewState,
  type AuthAuditViewState,
} from '@/lib/auth-audit/auth-audit-view-state'
import { DEFAULT_AUTH_AUDIT_LIMIT } from '@/lib/auth-audit/auth-audit-query'
import type {
  AuthAuditEvent,
  AuthAuditFilters,
  AuthAuditListResponse,
} from '@/types/auth-audit.types'

export type UseAuthAuditEventsReturn = {
  readonly events: ComputedRef<readonly AuthAuditEvent[] | null>
  readonly viewState: ComputedRef<AuthAuditViewState>
  readonly isStale: ComputedRef<boolean>
  readonly requestId: ComputedRef<string | null>
  readonly pending: Ref<boolean>
  readonly hasMore: ComputedRef<boolean>
  readonly search: (filters: AuthAuditFilters) => Promise<void>
  readonly loadMore: () => Promise<void>
  readonly refresh: () => Promise<void>
}

export function useAuthAuditEvents(
  initialFilters: AuthAuditFilters = {},
): UseAuthAuditEventsReturn {
  // initialFilters seed the SSR first fetch (e.g. a client_id deep-link from the
  // clients-detail consent-trail link) so the first page renders pre-filtered.
  const filters = ref<AuthAuditFilters>({ ...initialFilters, limit: DEFAULT_AUTH_AUDIT_LIMIT })
  // Client-appended cursor pages (beyond the SSR first page) + the live cursor.
  const extraEvents = ref<readonly AuthAuditEvent[]>([])
  const extraCursor = ref<string | null>(null)

  // First page runs during SSR so the masked event list hydrates as safe DTO only
  // (email allowed; no token/secret/gov-PII). Refetches on filter change.
  const { data, pending, error, refresh } = useAsyncData<AuthAuditListResponse>(
    'admin-authentication-audit',
    () => authAuditApi.listEvents(filters.value),
    { watch: [filters] },
  )

  const firstPage = computed<readonly AuthAuditEvent[] | null>(() => data.value?.events ?? null)
  const events = computed<readonly AuthAuditEvent[] | null>(() =>
    firstPage.value ? [...firstPage.value, ...extraEvents.value] : null,
  )

  // After a loadMore the live cursor is extraCursor; before any loadMore it is the
  // first page's next_cursor.
  const nextCursor = computed<string | null>(() =>
    extraEvents.value.length > 0
      ? extraCursor.value
      : (data.value?.pagination?.next_cursor ?? null),
  )
  const hasMore = computed<boolean>(() => Boolean(nextCursor.value))

  const viewState = computed<AuthAuditViewState>(() =>
    resolveAuthAuditViewState({
      pending: pending.value,
      error: error.value,
      events: firstPage.value,
    }),
  )
  const isStale = computed<boolean>(() => Boolean(error.value) && firstPage.value !== null)
  const requestId = computed<string | null>(() =>
    error.value instanceof ApiError
      ? (error.value.requestId ?? getLastRequestId())
      : getLastRequestId(),
  )

  function resetPages(): void {
    extraEvents.value = []
    extraCursor.value = null
  }

  async function search(next: AuthAuditFilters): Promise<void> {
    resetPages()
    // Replacing the ref triggers the useAsyncData watch -> first page refetches.
    filters.value = { ...next, limit: DEFAULT_AUTH_AUDIT_LIMIT }
  }

  async function loadMore(): Promise<void> {
    const cursor = nextCursor.value
    if (!cursor) return
    const response = await authAuditApi.listEvents({ ...filters.value, cursor })
    extraEvents.value = [...extraEvents.value, ...response.events]
    extraCursor.value = response.pagination?.next_cursor ?? null
  }

  return {
    events,
    viewState,
    isStale,
    requestId,
    pending,
    hasMore,
    search,
    loadMore,
    refresh: async () => {
      resetPages()
      await refresh()
    },
  }
}
