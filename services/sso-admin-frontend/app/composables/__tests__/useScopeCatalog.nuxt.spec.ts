// *.nuxt.spec.ts → routed to the 'nuxt' env where mockNuxtImport is available.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { ApiError } from '@/lib/api/api-client'
import { clientsApi } from '@/services/clients.api'
import { useScopeCatalog } from '../useScopeCatalog'
import type { ScopeCatalogResponse } from '@/types/clients.types'

vi.mock('@/services/clients.api', () => ({
  clientsApi: { getScopes: vi.fn<() => Promise<ScopeCatalogResponse>>() },
}))

const data = ref<ScopeCatalogResponse | null>(null)
const pending = ref(false)
const error = ref<unknown>(null)
const refreshMock = vi.fn<() => Promise<void>>(async () => {})
let capturedKey: string | null = null
let capturedHandler: (() => unknown) | null = null

mockNuxtImport('useAsyncData', () => {
  return (key: string, handler: () => unknown) => {
    capturedKey = key
    capturedHandler = handler
    return { data, pending, error, refresh: refreshMock }
  }
})

const catalog: ScopeCatalogResponse = {
  scopes: [
    { name: 'openid', description: 'OpenID subject', claims: ['sub'], default_allowed: true },
    { name: 'profile', description: 'Profile claims', claims: ['name'], default_allowed: true },
  ],
}

beforeEach(() => {
  data.value = null
  pending.value = false
  error.value = null
  capturedKey = null
  capturedHandler = null
  vi.clearAllMocks()
})
afterEach(() => vi.clearAllMocks())

describe('useScopeCatalog', () => {
  it('wires the scope service under a stable asyncData key', () => {
    useScopeCatalog()
    expect(capturedKey).toBe('admin-scope-catalog')
    capturedHandler?.()
    expect(clientsApi.getScopes).toHaveBeenCalledTimes(1)
  })

  it('exposes the catalog scopes when the fetch resolves', () => {
    data.value = catalog
    const { scopes } = useScopeCatalog()
    expect(scopes.value.map((s) => s.name)).toEqual(['openid', 'profile'])
  })

  it('returns an empty catalog before the fetch resolves', () => {
    const { scopes } = useScopeCatalog()
    expect(scopes.value).toEqual([])
  })

  it('fails closed to [] on error — even if a stale catalog is still in data', () => {
    data.value = catalog
    error.value = new ApiError(500, 'catalog unavailable')
    const { scopes } = useScopeCatalog()
    expect(scopes.value).toEqual([])
  })

  it('passes pending and error through unchanged', () => {
    pending.value = true
    const err = new ApiError(503, 'down')
    error.value = err
    const c = useScopeCatalog()
    expect(c.pending.value).toBe(true)
    expect(c.error.value).toBe(err)
  })
})
