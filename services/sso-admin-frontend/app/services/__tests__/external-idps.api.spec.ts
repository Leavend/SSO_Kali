import { afterEach, describe, expect, it, vi } from 'vitest'
import { externalIdpsApi } from '../external-idps.api'
import { apiClient } from '@/lib/api/api-client'

vi.mock('@/lib/api/api-client', () => ({
  apiClient: {
    get: vi.fn<(path: string) => Promise<unknown>>(),
    post: vi.fn<(path: string, body?: unknown) => Promise<unknown>>(),
    patch: vi.fn<(path: string, body?: unknown) => Promise<unknown>>(),
    delete: vi.fn<(path: string) => Promise<unknown>>(),
  },
}))

const get = vi.mocked(apiClient.get)
const post = vi.mocked(apiClient.post)
const patch = vi.mocked(apiClient.patch)
const del = vi.mocked(apiClient.delete)

afterEach(() => {
  vi.clearAllMocks()
})

describe('externalIdpsApi', () => {
  it('list GETs the collection', async () => {
    get.mockResolvedValue({ providers: [] })
    await externalIdpsApi.list()
    expect(get).toHaveBeenCalledWith('/api/admin/external-idps')
  })
  it('show GETs the keyed resource', async () => {
    get.mockResolvedValue({ provider: {} })
    await externalIdpsApi.show('acme')
    expect(get).toHaveBeenCalledWith('/api/admin/external-idps/acme')
  })
  it('create POSTs the payload', async () => {
    post.mockResolvedValue({ provider: {} })
    await externalIdpsApi.create({
      provider_key: 'acme',
      display_name: 'A',
      issuer: 'https://i',
      metadata_url: 'https://m',
      client_id: 'c',
    })
    expect(post).toHaveBeenCalledWith(
      '/api/admin/external-idps',
      expect.objectContaining({ provider_key: 'acme' }),
    )
  })
  it('update PATCHes the keyed resource', async () => {
    patch.mockResolvedValue({ provider: {} })
    await externalIdpsApi.update('acme', { display_name: 'B' })
    expect(patch).toHaveBeenCalledWith('/api/admin/external-idps/acme', { display_name: 'B' })
  })
  it('previewMapping POSTs claims to the mapping-preview endpoint', async () => {
    post.mockResolvedValue({ preview: {} })
    await externalIdpsApi.previewMapping('acme', { sub: 'x' })
    expect(post).toHaveBeenCalledWith('/api/admin/external-idps/acme/mapping-preview', {
      claims: { sub: 'x' },
    })
  })
  it('remove DELETEs the keyed resource (path-encoded)', async () => {
    del.mockResolvedValue(undefined)
    await externalIdpsApi.remove('a/b')
    expect(del).toHaveBeenCalledWith('/api/admin/external-idps/a%2Fb')
  })
})
