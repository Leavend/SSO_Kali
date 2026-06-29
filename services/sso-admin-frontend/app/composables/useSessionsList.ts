import { computed, type ComputedRef, type Ref } from 'vue'
import { ApiError, getLastRequestId } from '@/lib/api/api-client'
import { sessionsApi } from '@/services/sessions.api'
import {
  resolveSessionsViewState,
  type SessionsViewState,
} from '@/lib/sessions/sessions-view-state'
import type { AdminSession, SessionListResponse } from '@/types/sessions.types'

export type UseSessionsListReturn = {
  readonly sessions: Ref<readonly AdminSession[] | null>
  readonly viewState: ComputedRef<SessionsViewState>
  readonly isStale: ComputedRef<boolean>
  readonly requestId: ComputedRef<string | null>
  readonly pending: Ref<boolean>
  readonly refresh: () => Promise<void>
}

export function useSessionsList(): UseSessionsListReturn {
  // Runs during SSR so the masked session list resolves server-side and hydrates as
  // safe operational DTO only (no token/secret). The token stays in Nitro context.
  const { data, pending, error, refresh } = useAsyncData<SessionListResponse>(
    'admin-sessions-list',
    () => sessionsApi.list(),
  )

  const sessions = computed<readonly AdminSession[] | null>(() => data.value?.sessions ?? null)

  const viewState = computed<SessionsViewState>(() =>
    resolveSessionsViewState({
      pending: pending.value,
      error: error.value,
      sessions: sessions.value,
    }),
  )

  const isStale = computed<boolean>(() => Boolean(error.value) && sessions.value !== null)

  const requestId = computed<string | null>(() =>
    error.value instanceof ApiError
      ? (error.value.requestId ?? getLastRequestId())
      : getLastRequestId(),
  )

  return {
    sessions,
    viewState,
    isStale,
    requestId,
    pending,
    refresh: async () => {
      await refresh()
    },
  }
}
