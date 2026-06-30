// *.nuxt.spec.ts → nuxt env. useAsyncData is mocked to run the handler once (so we
// assert policyApi.list got the category) and to return refs the test drives.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { ApiError } from '@/lib/api/api-client'
import type { SecurityPolicy, SecurityPolicyCategory } from '@/types/policy.types'

const listMock = vi.fn<(category: string) => Promise<unknown>>()
vi.mock('@/services/policy.api', () => ({ policyApi: { list: listMock } }))

const dataRef = ref<unknown>(null)
const pendingRef = ref(false)
const errorRef = ref<unknown>(null)
const refreshMock = vi.fn<() => Promise<void>>(async () => {})

mockNuxtImport('useAsyncData', () => {
  return (_key: string, handler: () => Promise<unknown>) => {
    void handler() // record the policyApi.list(category) call
    return { data: dataRef, pending: pendingRef, error: errorRef, refresh: refreshMock }
  }
})

const { useSecurityPolicies } = await import('../useSecurityPolicies')

const policy: SecurityPolicy = {
  id: 1,
  category: 'password',
  version: 1,
  status: 'active',
  payload: { min_length: 14 },
  created_at: '2026-06-01T00:00:00Z',
  updated_at: '2026-06-01T00:00:00Z',
}

beforeEach(() => {
  dataRef.value = null
  pendingRef.value = false
  errorRef.value = null
  listMock.mockReset()
  listMock.mockResolvedValue({ category: 'password', active: {}, policies: [] })
})
afterEach(() => {
  vi.clearAllMocks()
})

describe('useSecurityPolicies', () => {
  it('fetches the given category', () => {
    const category = ref<SecurityPolicyCategory>('session')
    useSecurityPolicies(category)
    expect(listMock).toHaveBeenCalledWith('session')
  })

  it('maps loading / empty / ready from the response', () => {
    const r = useSecurityPolicies(ref<SecurityPolicyCategory>('password'))
    pendingRef.value = true
    expect(r.viewState.value).toBe('loading')
    pendingRef.value = false
    dataRef.value = { category: 'password', active: {}, policies: [] }
    expect(r.viewState.value).toBe('empty')
    dataRef.value = { category: 'password', active: {}, policies: [policy] }
    expect(r.viewState.value).toBe('ready')
    expect(r.policies.value).toEqual([policy])
  })

  it('normalizes the active payload: [] and {} both become null, a real object passes through', () => {
    const r = useSecurityPolicies(ref<SecurityPolicyCategory>('password'))
    dataRef.value = { category: 'password', active: [], policies: [policy] }
    expect(r.active.value).toBeNull()
    dataRef.value = { category: 'password', active: {}, policies: [policy] }
    expect(r.active.value).toBeNull()
    dataRef.value = { category: 'password', active: { min_length: 14 }, policies: [policy] }
    expect(r.active.value).toEqual({ min_length: 14 })
  })

  it('keeps the last-good list and flags stale when a refresh errors', () => {
    const r = useSecurityPolicies(ref<SecurityPolicyCategory>('password'))
    dataRef.value = { category: 'password', active: {}, policies: [policy] }
    errorRef.value = new ApiError(500, 'boom')
    expect(r.viewState.value).toBe('ready')
    expect(r.isStale.value).toBe(true)
  })

  it('surfaces the ApiError requestId', () => {
    const r = useSecurityPolicies(ref<SecurityPolicyCategory>('password'))
    errorRef.value = new ApiError(403, 'no', undefined, {}, 'req-policy')
    expect(r.requestId.value).toBe('req-policy')
  })
})
