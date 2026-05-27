import { describe, expect, it, vi } from 'vitest'
import { apiClient } from '@/lib/api/api-client'
import { clientsApi } from '../clients.api'

vi.mock('@/lib/api/api-client', () => ({
  apiClient: {
    get: vi.fn<() => Promise<unknown>>(),
    post: vi.fn<() => Promise<unknown>>(),
    patch: vi.fn<() => Promise<unknown>>(),
  },
}))

describe('clientsApi', () => {
  it('uses explicit admin BFF routes for client management', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ clients: [] })
    vi.mocked(apiClient.post).mockResolvedValue({ rotation: { client_id: 'prototype-app-a' } })
    vi.mocked(apiClient.patch).mockResolvedValue({ client: { client_id: 'prototype-app-a' } })

    await clientsApi.list()
    await clientsApi.show('prototype-app-a')
    await clientsApi.update('prototype-app-a', { display_name: 'Prototype App A' })
    await clientsApi.rotateSecret('prototype-app-a')

    expect(apiClient.get).toHaveBeenNthCalledWith(1, '/api/admin/clients')
    expect(apiClient.get).toHaveBeenNthCalledWith(2, '/api/admin/clients/prototype-app-a')
    expect(apiClient.patch).toHaveBeenCalledWith('/api/admin/clients/prototype-app-a', {
      display_name: 'Prototype App A',
    })
    expect(apiClient.post).toHaveBeenCalledWith('/api/admin/clients/prototype-app-a/rotate-secret')
  })
})
