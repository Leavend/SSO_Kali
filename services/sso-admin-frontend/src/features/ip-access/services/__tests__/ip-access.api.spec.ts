import { describe, expect, it, vi } from 'vitest'
import { apiClient } from '@/lib/api/api-client'
import { ipAccessApi } from '../ip-access.api'

vi.mock('@/lib/api/api-client', () => ({
  apiClient: {
    get: vi.fn<() => Promise<unknown>>(),
    post: vi.fn<() => Promise<unknown>>(),
    delete: vi.fn<() => Promise<unknown>>(),
  },
}))

describe('ipAccessApi', () => {
  it('lists ip access rules', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ rules: [] })

    await ipAccessApi.list()

    expect(apiClient.get).toHaveBeenCalledWith('/api/admin/ip-access-rules')
  })

  it('creates an ip access rule', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      rule: { id: 1, cidr: '10.0.0.0/8', mode: 'allow' },
    })

    await ipAccessApi.create({ cidr: '10.0.0.0/8', mode: 'allow', reason: 'Internal' })

    expect(apiClient.post).toHaveBeenCalledWith('/api/admin/ip-access-rules', {
      cidr: '10.0.0.0/8',
      mode: 'allow',
      reason: 'Internal',
    })
  })

  it('deletes an ip access rule', async () => {
    vi.mocked(apiClient.delete).mockResolvedValue(undefined)

    await ipAccessApi.destroy(1)

    expect(apiClient.delete).toHaveBeenCalledWith('/api/admin/ip-access-rules/1')
  })
})
