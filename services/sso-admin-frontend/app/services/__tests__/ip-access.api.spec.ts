// app/services/__tests__/ip-access.api.spec.ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '@/lib/api/api-client'
import { ipAccessApi } from '@/services/ip-access.api'

afterEach(() => vi.restoreAllMocks())

describe('ipAccessApi', () => {
  it('list GETs the collection', async () => {
    const get = vi
      .spyOn(apiClient, 'get')
      .mockResolvedValue({ rules: [] } as never)
    await ipAccessApi.list()
    expect(get).toHaveBeenCalledWith('/api/admin/ip-access-rules')
  })

  it('create POSTs the payload', async () => {
    const post = vi
      .spyOn(apiClient, 'post')
      .mockResolvedValue({ rule: {} } as never)
    const payload = { cidr: '10.0.0.0/8', mode: 'block', reason: 'x' } as const
    await ipAccessApi.create(payload)
    expect(post).toHaveBeenCalledWith('/api/admin/ip-access-rules', payload)
  })

  it('remove DELETEs by numeric id', async () => {
    const del = vi
      .spyOn(apiClient, 'delete')
      .mockResolvedValue(undefined as never)
    await ipAccessApi.remove(42)
    expect(del).toHaveBeenCalledWith('/api/admin/ip-access-rules/42')
  })
})
