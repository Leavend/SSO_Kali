import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { ApiError } from '@/lib/api/api-error'
import { useAsyncAction } from '../useAsyncAction'

describe('useAsyncAction', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('starts idle and captures result when action succeeds', async () => {
    const action = vi.fn().mockResolvedValue('ok')
    const { pending, error, lastResult, run } = useAsyncAction(action)

    expect(pending.value).toBe(false)
    expect(error.value).toBeNull()
    expect(lastResult.value).toBeNull()

    const result = await run()

    expect(result).toBe('ok')
    expect(lastResult.value).toBe('ok')
    expect(pending.value).toBe(false)
    expect(action).toHaveBeenCalledTimes(1)
  })

  it('flips pending flag during execution', async () => {
    const gate = ref<((value: 'done') => void) | null>(null)
    const action = () => new Promise<'done'>((resolve) => { gate.value = resolve })

    const { pending, run } = useAsyncAction(action)
    const pendingDuring = run()

    await Promise.resolve()
    expect(pending.value).toBe(true)
    gate.value?.('done')
    await pendingDuring
    expect(pending.value).toBe(false)
  })

  it('captures ApiError and exposes it through error ref', async () => {
    const apiError = new ApiError(422, 'Invalid', null, [
      { field: 'identifier', message: 'required' },
    ])
    const action = vi.fn().mockRejectedValue(apiError)

    const { error, run } = useAsyncAction(action)
    const result = await run()

    expect(result).toBeNull()
    expect(error.value).toBe(apiError)
  })

  it('wraps non-Error throwables', async () => {
    const action = vi.fn().mockRejectedValue('boom')
    const { error, run } = useAsyncAction(action)

    await run()

    expect(error.value).toBeInstanceOf(Error)
    expect(error.value?.message).toBe('boom')
  })

  it('reset() clears state', async () => {
    const action = vi.fn().mockResolvedValue(1)
    const { pending, error, lastResult, run, reset } = useAsyncAction(action)

    await run()
    reset()

    expect(pending.value).toBe(false)
    expect(error.value).toBeNull()
    expect(lastResult.value).toBeNull()
  })
})
