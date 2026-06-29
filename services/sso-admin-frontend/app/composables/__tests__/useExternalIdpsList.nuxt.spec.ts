import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { ApiError } from '@/lib/api/api-client'
import type { ExternalIdentityProvider } from '@/types/external-idps.types'

const listMock = vi.fn<() => Promise<unknown>>()
vi.mock('@/services/external-idps.api', () => ({ externalIdpsApi: { list: listMock } }))

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

const { useExternalIdpsList } = await import('../useExternalIdpsList')

const provider: ExternalIdentityProvider = {
  provider_key: 'acme',
  display_name: 'Acme',
  issuer: 'https://i',
  metadata_url: 'https://m',
  client_id: 'c',
}

beforeEach(() => {
  dataRef.value = null
  pendingRef.value = false
  errorRef.value = null
  listMock.mockReset()
  listMock.mockResolvedValue({ providers: [] })
})
afterEach(() => {
  vi.clearAllMocks()
})

describe('useExternalIdpsList', () => {
  it('fetches the provider list', () => {
    useExternalIdpsList()
    expect(listMock).toHaveBeenCalledTimes(1)
  })
  it('maps loading / empty / ready', () => {
    const r = useExternalIdpsList()
    pendingRef.value = true
    expect(r.viewState.value).toBe('loading')
    pendingRef.value = false
    dataRef.value = { providers: [] }
    expect(r.viewState.value).toBe('empty')
    dataRef.value = { providers: [provider] }
    expect(r.viewState.value).toBe('ready')
    expect(r.providers.value).toEqual([provider])
  })
  it('keeps the last-good list and flags stale on a refresh error', () => {
    const r = useExternalIdpsList()
    dataRef.value = { providers: [provider] }
    errorRef.value = new ApiError(500, 'boom')
    expect(r.viewState.value).toBe('ready')
    expect(r.isStale.value).toBe(true)
  })
  it('surfaces the ApiError requestId', () => {
    const r = useExternalIdpsList()
    errorRef.value = new ApiError(403, 'no', undefined, {}, 'req-idp')
    expect(r.requestId.value).toBe('req-idp')
  })
})
