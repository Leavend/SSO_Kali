import { computed, toRaw, toValue, type ComputedRef, type MaybeRefOrGetter } from 'vue'
import { ApiError, getLastRequestId } from '@/lib/api/api-client'
import { usersApi } from '@/services/users.api'
import { resolveUserDetailViewState, type UserDetailViewState } from '@/lib/users/users-view-state'
import type {
  AdminUserDetail,
  LoginContext,
  UserDetailResponse,
  UserSession,
} from '@/types/users.types'

export type UseUserDetailReturn = {
  readonly user: ComputedRef<AdminUserDetail | null>
  readonly loginContext: ComputedRef<LoginContext | null>
  readonly sessions: ComputedRef<readonly UserSession[]>
  readonly viewState: ComputedRef<UserDetailViewState>
  readonly requestId: ComputedRef<string | null>
  readonly refresh: () => Promise<void>
}

export function useUserDetail(subjectId: MaybeRefOrGetter<string>): UseUserDetailReturn {
  // ponytail: the id is resolved once at setup. Nuxt re-runs page setup on a
  // route-param change (navigating /users/A → /users/B remounts), so a static
  // per-subject key is correct; make it reactive only if same-component id swaps
  // ever appear.
  const id = toValue(subjectId)

  // Runs during SSR so the masked detail DTO resolves server-side and hydrates
  // into the payload (already-masked PII + raw session id the page masks). The
  // Bearer token stays in Nitro event.context and never reaches window.__NUXT__.
  const { data, pending, error, refresh } = useAsyncData<UserDetailResponse>(
    'admin-user-detail:' + id,
    () => usersApi.show(id),
  )

  // toRaw: the masked DTO is display-only; callers receive plain objects so
  // identity comparisons and toRaw-based deep picks behave as expected.
  const user = computed<AdminUserDetail | null>(() =>
    data.value != null ? toRaw(data.value.user) : null,
  )

  const loginContext = computed<LoginContext | null>(() =>
    data.value != null ? (data.value.login_context ?? null) : null,
  )

  const sessions = computed<readonly UserSession[]>(() => data.value?.sessions ?? [])

  const viewState = computed<UserDetailViewState>(() =>
    resolveUserDetailViewState({
      pending: pending.value,
      error: error.value,
      user: user.value,
    }),
  )

  const requestId = computed<string | null>(() =>
    error.value instanceof ApiError
      ? (error.value.requestId ?? getLastRequestId())
      : getLastRequestId(),
  )

  return {
    user,
    loginContext,
    sessions,
    viewState,
    requestId,
    refresh: async () => {
      await refresh()
    },
  }
}
