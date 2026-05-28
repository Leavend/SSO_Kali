import { describe, expect, it, vi } from 'vitest'
import { apiClient } from '@/lib/api/api-client'
import { externalIdpsApi } from '../external-idps.api'

vi.mock('@/lib/api/api-client', () => ({
  apiClient: {
    get: vi.fn<() => Promise<unknown>>(),
    post: vi.fn<() => Promise<unknown>>(),
    patch: vi.fn<() => Promise<unknown>>(),
    delete: vi.fn<() => Promise<unknown>>(),
  },
}))

describe('externalIdpsApi', () => {
  it('uses explicit admin BFF routes for federation providers', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ providers: [] })
    vi.mocked(apiClient.post).mockResolvedValue({ provider: { provider_key: 'google' } })
    vi.mocked(apiClient.patch).mockResolvedValue({ provider: { provider_key: 'google' } })
    vi.mocked(apiClient.delete).mockResolvedValue(undefined)

    await externalIdpsApi.list()
    await externalIdpsApi.show('google')
    await externalIdpsApi.create({
      provider_key: 'google',
      display_name: 'Google Workspace',
      issuer: 'https://accounts.google.com',
      metadata_url: 'https://accounts.google.com/.well-known/openid-configuration',
      client_id: 'google-client',
    })
    await externalIdpsApi.update('google', { enabled: false })
    await externalIdpsApi.previewMapping('google', { sub: 'ext-sub', email: 'admin@example.test' })
    await externalIdpsApi.delete('google')

    expect(apiClient.get).toHaveBeenNthCalledWith(1, '/api/admin/external-idps')
    expect(apiClient.get).toHaveBeenNthCalledWith(2, '/api/admin/external-idps/google')
    expect(apiClient.post).toHaveBeenNthCalledWith(1, '/api/admin/external-idps', {
      provider_key: 'google',
      display_name: 'Google Workspace',
      issuer: 'https://accounts.google.com',
      metadata_url: 'https://accounts.google.com/.well-known/openid-configuration',
      client_id: 'google-client',
    })
    expect(apiClient.patch).toHaveBeenCalledWith('/api/admin/external-idps/google', {
      enabled: false,
    })
    expect(apiClient.post).toHaveBeenNthCalledWith(
      2,
      '/api/admin/external-idps/google/mapping-preview',
      { claims: { sub: 'ext-sub', email: 'admin@example.test' } },
    )
    expect(apiClient.delete).toHaveBeenCalledWith('/api/admin/external-idps/google')
  })
})
