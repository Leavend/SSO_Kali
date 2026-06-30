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
  readonly loadingMore: ComputedRef<boolean>
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
  // undefined = no loadMore yet (use the first page's cursor); after a loadMore it
  // holds that response's next_cursor (possibly null), so an empty page can't revert
  // hasMore back to the already-consumed first-page cursor.
  const extraCursor = ref<string | null | undefined>(undefined)
  // In-flight guard: a concurrent loadMore (rapid double-click) would otherwise read
  // the same cursor twice and append the same page twice (duplicate rows / keys).
  const isLoadingMore = ref(false)

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

  // After a loadMore the live cursor is extraCursor (set once a loadMore has run,
  // even if it returned an empty page); before any loadMore it is the first page's
  // next_cursor.
  const nextCursor = computed<string | null>(() =>
    extraCursor.value !== undefined
      ? extraCursor.value
      : (data.value?.pagination?.next_cursor ?? null),
  )
  const hasMore = computed<boolean>(() => Boolean(nextCursor.value))
  const loadingMore = computed<boolean>(() => isLoadingMore.value)

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
    extraCursor.value = undefined
    isLoadingMore.value = false
  }

  async function search(next: AuthAuditFilters): Promise<void> {
    resetPages()
    // Replacing the ref triggers the useAsyncData watch -> first page refetches.
    filters.value = { ...next, limit: DEFAULT_AUTH_AUDIT_LIMIT }
  }

  async function loadMore(): Promise<void> {
    const cursor = nextCursor.value
    if (isLoadingMore.value || !cursor) return
    isLoadingMore.value = true
    try {
      const response = await authAuditApi.listEvents({ ...filters.value, cursor })
      extraEvents.value = [...extraEvents.value, ...response.events]
      extraCursor.value = response.pagination?.next_cursor ?? null
    } finally {
      isLoadingMore.value = false
    }
  }

  return {
    events,
    viewState,
    isStale,
    requestId,
    pending,
    hasMore,
    loadingMore,
    search,
    loadMore,
    refresh: async () => {
      resetPages()
      await refresh()
    },
  }
}
