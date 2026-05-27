import { describe, expect, it, vi } from 'vitest'
import { apiClient } from '@/lib/api/api-client'
import { dashboardApi } from '../dashboard.api'

vi.mock('@/lib/api/api-client', () => ({
  apiClient: {
    get: vi.fn<() => Promise<unknown>>(),
  },
}))

describe('dashboardApi', () => {
  it('loads dashboard summary through the admin BFF', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      generated_at: '2026-05-27T00:00:00Z',
      counters: {},
    })

    await dashboardApi.getSummary()

    expect(apiClient.get).toHaveBeenCalledWith('/api/admin/dashboard/summary')
  })
})
