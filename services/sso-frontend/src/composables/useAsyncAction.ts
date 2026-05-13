/**
 * useAsyncAction — composable untuk manajemen pending/error pattern di UI.
 */

import { ref, type Ref } from 'vue'
import type { ApiError } from '@/lib/api/api-error'
import { isApiError } from '@/lib/api/api-error'

type AsyncFn<TArgs extends unknown[], TResult> = (...args: TArgs) => Promise<TResult>

export type UseAsyncActionReturn<TArgs extends unknown[], TResult> = {
  readonly pending: Ref<boolean>
  readonly error: Ref<ApiError | Error | null>
  readonly lastResult: Ref<TResult | null>
  run: (...args: TArgs) => Promise<TResult | null>
  reset: () => void
}

export function useAsyncAction<TArgs extends unknown[], TResult>(
  action: AsyncFn<TArgs, TResult>,
): UseAsyncActionReturn<TArgs, TResult> {
  const pending = ref(false)
  const error = ref<ApiError | Error | null>(null)
  const lastResult = ref<TResult | null>(null) as Ref<TResult | null>

  async function run(...args: TArgs): Promise<TResult | null> {
    pending.value = true
    error.value = null
    try {
      const result = await action(...args)
      lastResult.value = result
      return result
    } catch (caught) {
      error.value = isApiError(caught) || caught instanceof Error ? caught : new Error(String(caught))
      return null
    } finally {
      pending.value = false
    }
  }

  function reset(): void {
    pending.value = false
    error.value = null
    lastResult.value = null
  }

  return { pending, error, lastResult, run, reset }
}
