// app/composables/__tests__/useOpsReadiness.nuxt.spec.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { ApiError } from '@/lib/api/api-client'
import type { OpsReadiness } from '@/types/ops.types'

const getReadinessMock = vi.fn<() => Promise<unknown>>()
vi.mock('@/services/ops.api', () => ({ opsApi: { getReadiness: getReadinessMock } }))

const dataRef = ref<unknown>(null)
const pendingRef = ref(false)
const errorRef = ref<unknown>(null)
const refreshMock = vi.fn<() => Promise<void>>(async () => {})

mockNuxtImport('useAsyncData', () => {
  return (_key: string, handler: () => Promise<unknown>) => {
    void handler()
    return { data: dataRef, pending: pendingRef, error: errorRef, refresh: refreshMock }
  }
})

const { useOpsReadiness } = await import('../useOpsReadiness')

const READY: OpsReadiness = {
  service: 'sso-backend',
  ready: true,
  checks: { database: true, redis: true },
}

beforeEach(() => {
  dataRef.value = null
  pendingRef.value = false
  errorRef.value = null
  getReadinessMock.mockReset()
  getReadinessMock.mockResolvedValue(READY)
})
afterEach(() => vi.clearAllMocks())

describe('useOpsReadiness', () => {
  it('fetches readiness once', () => {
    useOpsReadiness()
    expect(getReadinessMock).toHaveBeenCalledTimes(1)
  })

  it('maps loading then ready', () => {
    const r = useOpsReadiness()
    pendingRef.value = true
    expect(r.viewState.value).toBe('loading')
    pendingRef.value = false
    dataRef.value = READY
    expect(r.viewState.value).toBe('ready')
    expect(r.readiness.value).toEqual(READY)
  })

  it('maps 401 -> unauthenticated and 403 -> forbidden when no readiness', () => {
    const r = useOpsReadiness()
    errorRef.value = new ApiError(401, 'no')
    expect(r.viewState.value).toBe('unauthenticated')
    errorRef.value = new ApiError(403, 'no')
    expect(r.viewState.value).toBe('forbidden')
  })

  it('maps any other error to error when no readiness', () => {
    const r = useOpsReadiness()
    errorRef.value = new ApiError(502, 'boom')
    expect(r.viewState.value).toBe('error')
  })

  it('surfaces the ApiError requestId', () => {
    const r = useOpsReadiness()
    errorRef.value = new ApiError(403, 'no', undefined, {}, 'req-ops')
    expect(r.requestId.value).toBe('req-ops')
  })
})
