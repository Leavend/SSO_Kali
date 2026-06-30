import { computed, type ComputedRef, type Ref } from 'vue'
import { ApiError, getLastRequestId } from '@/lib/api/api-client'
import { ipAccessApi } from '@/services/ip-access.api'
import {
  resolveIpAccessViewState,
  type IpAccessViewState,
} from '@/lib/ip-access/ip-access-view-state'
import type { IpAccessListResponse, IpAccessRule } from '@/types/ip-access.types'

export type UseIpAccessRulesReturn = {
  readonly rules: Ref<readonly IpAccessRule[] | null>
  readonly viewState: ComputedRef<IpAccessViewState>
  readonly isStale: ComputedRef<boolean>
  readonly requestId: ComputedRef<string | null>
  readonly pending: Ref<boolean>
  readonly refresh: () => Promise<void>
}

export function useIpAccessRules(): UseIpAccessRulesReturn {
  const { data, pending, error, refresh } = useAsyncData<IpAccessListResponse>(
    'admin-ip-access-rules',
    () => ipAccessApi.list(),
  )

  const rules = computed<readonly IpAccessRule[] | null>(() => data.value?.rules ?? null)

  const viewState = computed<IpAccessViewState>(() =>
    resolveIpAccessViewState({ pending: pending.value, error: error.value, rules: rules.value }),
  )

  const isStale = computed<boolean>(() => Boolean(error.value) && rules.value !== null)

  const requestId = computed<string | null>(() =>
    error.value instanceof ApiError
      ? (error.value.requestId ?? getLastRequestId())
      : getLastRequestId(),
  )

  return {
    rules,
    viewState,
    isStale,
    requestId,
    pending,
    refresh: async () => {
      await refresh()
    },
  }
}
