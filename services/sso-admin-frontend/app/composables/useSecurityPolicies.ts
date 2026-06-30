import { computed, type ComputedRef, type Ref } from 'vue'
import { ApiError, getLastRequestId } from '@/lib/api/api-client'
import { policyApi } from '@/services/policy.api'
import { resolvePolicyViewState, type PolicyViewState } from '@/lib/policy/policy-view-state'
import type {
  SecurityPolicy,
  SecurityPolicyCategory,
  SecurityPolicyListResponse,
} from '@/types/policy.types'

export type UseSecurityPoliciesReturn = {
  readonly policies: Ref<readonly SecurityPolicy[] | null>
  readonly active: ComputedRef<Readonly<Record<string, unknown>> | null>
  readonly viewState: ComputedRef<PolicyViewState>
  readonly isStale: ComputedRef<boolean>
  readonly requestId: ComputedRef<string | null>
  readonly pending: Ref<boolean>
  readonly refresh: () => Promise<void>
}

export function useSecurityPolicies(
  category: Ref<SecurityPolicyCategory>,
): UseSecurityPoliciesReturn {
  // Runs during SSR so the masked policy list resolves server-side and hydrates as
  // safe DTO only. The token stays in Nitro event.context. Refetches on category
  // change via the watch option (one static key; data is replaced per category).
  const { data, pending, error, refresh } = useAsyncData<SecurityPolicyListResponse>(
    'admin-security-policies',
    () => policyApi.list(category.value),
    { watch: [category] },
  )

  const policies = computed<readonly SecurityPolicy[] | null>(() => data.value?.policies ?? null)

  // The backend returns the active payload object, or `[]` when none is active.
  // Normalize `[]`, `{}`, and absent all to null so the page shows one "no active
  // configuration" surface.
  const active = computed<Readonly<Record<string, unknown>> | null>(() => {
    const value = data.value?.active
    if (!value || Array.isArray(value)) return null
    // Array.isArray does not narrow the readonly-array union member; cast back to the
    // object branch the guard above already established.
    const record = value as Readonly<Record<string, unknown>>
    return Object.keys(record).length > 0 ? record : null
  })

  const viewState = computed<PolicyViewState>(() =>
    resolvePolicyViewState({
      pending: pending.value,
      error: error.value,
      policies: policies.value,
    }),
  )

  const isStale = computed<boolean>(() => Boolean(error.value) && policies.value !== null)

  const requestId = computed<string | null>(() =>
    error.value instanceof ApiError
      ? (error.value.requestId ?? getLastRequestId())
      : getLastRequestId(),
  )

  return {
    policies,
    active,
    viewState,
    isStale,
    requestId,
    pending,
    refresh: async () => {
      await refresh()
    },
  }
}
