// app/composables/__tests__/useOidcFoundation.nuxt.spec.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { ApiError } from '@/lib/api/api-client'
import type { OidcFoundationSnapshot } from '@/types/oidc-foundation.types'

const getSnapshotMock = vi.fn<() => Promise<unknown>>()
vi.mock('@/services/oidc-foundation.api', () => ({ oidcFoundationApi: { getSnapshot: getSnapshotMock } }))

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

const { useOidcFoundation } = await import('../useOidcFoundation')

const SNAPSHOT = { checked_at: '2026-06-28T10:00:00Z', correlation_id: 'corr-1' } as OidcFoundationSnapshot

beforeEach(() => {
  dataRef.value = null
  pendingRef.value = false
  errorRef.value = null
  getSnapshotMock.mockReset()
  getSnapshotMock.mockResolvedValue(SNAPSHOT)
})
afterEach(() => vi.clearAllMocks())

describe('useOidcFoundation', () => {
  it('fetches the snapshot once', () => {
    useOidcFoundation()
    expect(getSnapshotMock).toHaveBeenCalledTimes(1)
  })
  it('maps loading then ready', () => {
    const r = useOidcFoundation()
    pendingRef.value = true
    expect(r.viewState.value).toBe('loading')
    pendingRef.value = false
    dataRef.value = SNAPSHOT
    expect(r.viewState.value).toBe('ready')
    expect(r.snapshot.value).toEqual(SNAPSHOT)
  })
  it('maps 403 forbidden and surfaces the ApiError requestId', () => {
    const r = useOidcFoundation()
    errorRef.value = new ApiError(403, 'no', undefined, {}, 'req-oidc')
    expect(r.viewState.value).toBe('forbidden')
    expect(r.requestId.value).toBe('req-oidc')
  })
})
