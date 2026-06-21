import { describe, expect, it, vi } from 'vitest'
import { apiClient } from '@/lib/api/api-client'
import { observabilityApi } from '../observability.api'

vi.mock('@/lib/api/api-client', () => ({
  apiClient: {
    get: vi.fn<() => Promise<unknown>>(),
  },
}))

describe('observabilityApi', () => {
  it('loads the admin-safe observability summary route', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ generated_at: '2026-06-21T00:00:00Z' })

    await observabilityApi.getSummary()

    expect(apiClient.get).toHaveBeenCalledWith('/api/admin/observability/summary')
  })
})
