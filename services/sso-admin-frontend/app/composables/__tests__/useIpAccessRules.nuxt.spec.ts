import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { ApiError } from '@/lib/api/api-client'
import type { IpAccessRule } from '@/types/ip-access.types'

const listMock = vi.fn<() => Promise<unknown>>()
vi.mock('@/services/ip-access.api', () => ({ ipAccessApi: { list: listMock } }))

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

const { useIpAccessRules } = await import('../useIpAccessRules')

const RULE: IpAccessRule = {
  id: 1,
  cidr: '10.0.0.0/8',
  mode: 'block',
  reason: null,
  expires_at: null,
  actor_subject_id: null,
  created_at: null,
  updated_at: null,
}

beforeEach(() => {
  dataRef.value = null
  pendingRef.value = false
  errorRef.value = null
  listMock.mockReset()
  listMock.mockResolvedValue({ rules: [] })
})
afterEach(() => {
  vi.clearAllMocks()
})

describe('useIpAccessRules', () => {
  it('fetches the rule list', () => {
    useIpAccessRules()
    expect(listMock).toHaveBeenCalledTimes(1)
  })
  it('maps loading / empty / ready', () => {
    const r = useIpAccessRules()
    pendingRef.value = true
    expect(r.viewState.value).toBe('loading')
    pendingRef.value = false
    dataRef.value = { rules: [] }
    expect(r.viewState.value).toBe('empty')
    dataRef.value = { rules: [RULE] }
    expect(r.viewState.value).toBe('ready')
    expect(r.rules.value).toEqual([RULE])
  })
  it('keeps the last-good list and flags stale on a refresh error', () => {
    const r = useIpAccessRules()
    dataRef.value = { rules: [RULE] }
    errorRef.value = new ApiError(500, 'boom')
    expect(r.viewState.value).toBe('ready')
    expect(r.isStale.value).toBe(true)
  })
  it('surfaces the ApiError requestId', () => {
    const r = useIpAccessRules()
    errorRef.value = new ApiError(403, 'no', undefined, {}, 'req-ip')
    expect(r.requestId.value).toBe('req-ip')
  })
})
