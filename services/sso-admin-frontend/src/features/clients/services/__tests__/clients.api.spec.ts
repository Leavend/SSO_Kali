import { describe, expect, it, vi } from 'vitest'
import { apiClient } from '@/lib/api/api-client'
import { clientsApi } from '../clients.api'

vi.mock('@/lib/api/api-client', () => ({
  apiClient: {
    get: vi.fn<() => Promise<unknown>>(),
    post: vi.fn<() => Promise<unknown>>(),
    patch: vi.fn<() => Promise<unknown>>(),
    put: vi.fn<() => Promise<unknown>>(),
    delete: vi.fn<() => Promise<unknown>>(),
  },
}))

describe('clientsApi', () => {
  it('uses explicit admin BFF routes for client management', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ clients: [] })
    vi.mocked(apiClient.post).mockResolvedValue({ registration: { client_id: 'prototype-app-a' } })
    vi.mocked(apiClient.patch).mockResolvedValue({ client: { client_id: 'prototype-app-a' } })
    vi.mocked(apiClient.put).mockResolvedValue({ client: { client_id: 'prototype-app-a' } })

    await clientsApi.list()
    await clientsApi.registrations()
    await clientsApi.show('prototype-app-a')
    await clientsApi.create({
      app_name: 'Prototype App A',
      client_id: 'prototype-app-a',
      environment: 'development',
      client_type: 'public',
      app_base_url: 'https://app.example.test',
      callback_path: '/callback',
      logout_path: '/logout',
      owner_email: 'owner@example.test',
      provisioning: 'jit',
      allowed_scopes: ['openid', 'profile', 'email'],
    })
    await clientsApi.update('prototype-app-a', { display_name: 'Prototype App A' })
    await clientsApi.syncScopes('prototype-app-a', { scopes: ['openid', 'profile', 'email'] })
    await clientsApi.rotateSecret('prototype-app-a')
    await clientsApi.disable('prototype-app-a', { reason: 'incident response' })
    await clientsApi.decommission('prototype-app-a')
    await clientsApi.delete('prototype-app-a')

    expect(apiClient.get).toHaveBeenNthCalledWith(1, '/api/admin/clients')
    expect(apiClient.get).toHaveBeenNthCalledWith(2, '/api/admin/client-integrations/registrations')
    expect(apiClient.get).toHaveBeenNthCalledWith(3, '/api/admin/clients/prototype-app-a')
    expect(apiClient.post).toHaveBeenCalledWith('/api/admin/client-integrations', {
      app_name: 'Prototype App A',
      client_id: 'prototype-app-a',
      environment: 'development',
      client_type: 'public',
      app_base_url: 'https://app.example.test',
      callback_path: '/callback',
      logout_path: '/logout',
      owner_email: 'owner@example.test',
      provisioning: 'jit',
      allowed_scopes: ['openid', 'profile', 'email'],
    })
    expect(apiClient.patch).toHaveBeenCalledWith('/api/admin/clients/prototype-app-a', {
      display_name: 'Prototype App A',
    })
    expect(apiClient.put).toHaveBeenCalledWith('/api/admin/clients/prototype-app-a/scopes', {
      scopes: ['openid', 'profile', 'email'],
    })
    expect(apiClient.post).toHaveBeenCalledWith('/api/admin/clients/prototype-app-a/rotate-secret')
    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/admin/client-integrations/prototype-app-a/disable',
      { reason: 'incident response' },
    )
    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/admin/client-integrations/prototype-app-a/decommission'
    )
    expect(apiClient.delete).toHaveBeenCalledWith('/api/admin/clients/prototype-app-a')
  })
})
