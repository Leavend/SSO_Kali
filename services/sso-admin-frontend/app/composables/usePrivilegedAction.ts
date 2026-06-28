import { computed, ref, type ComputedRef, type Ref } from 'vue'
import {
  resolvePrivilegedActionFailure,
  type PrivilegedActionFailure,
  type PrivilegedActionStatus,
} from '@/lib/users/privileged-action'

export type UsePrivilegedActionReturn<T> = {
  readonly status: Ref<PrivilegedActionStatus>
  readonly isSubmitting: ComputedRef<boolean>
  readonly failure: Ref<PrivilegedActionFailure | null>
  readonly requestId: ComputedRef<string | null>
  readonly auditEventId: ComputedRef<string | null>
  readonly fieldErrors: ComputedRef<Readonly<Record<string, readonly string[]>>>
  readonly stepUpUrl: ComputedRef<string | null>
  readonly run: (runner: () => Promise<T>) => Promise<T | null>
  readonly reset: () => void
}

// Mutation runner shared by every Users write/destructive/role action. Owns the
// submitting → success | <failure-status> lifecycle. The try/catch guarantees
// `status` always settles off `submitting`, so a failed action can never leave a
// stale loading/disabled flag on the surface (TDD §4.10).
export function usePrivilegedAction<T>(): UsePrivilegedActionReturn<T> {
  const status = ref<PrivilegedActionStatus>('idle')
  const failure = ref<PrivilegedActionFailure | null>(null)

  async function run(runner: () => Promise<T>): Promise<T | null> {
    status.value = 'submitting'
    failure.value = null
    try {
      const result = await runner()
      status.value = 'success'
      return result
    } catch (error) {
      const mapped = resolvePrivilegedActionFailure(error)
      failure.value = mapped
      status.value = mapped.status
      return null
    }
  }

  function reset(): void {
    status.value = 'idle'
    failure.value = null
  }

  return {
    status,
    isSubmitting: computed(() => status.value === 'submitting'),
    failure,
    requestId: computed(() => failure.value?.requestId ?? null),
    auditEventId: computed(() => failure.value?.auditEventId ?? null),
    fieldErrors: computed(() => failure.value?.fieldErrors ?? {}),
    stepUpUrl: computed(() => failure.value?.stepUpUrl ?? null),
    run,
    reset,
  }
}
