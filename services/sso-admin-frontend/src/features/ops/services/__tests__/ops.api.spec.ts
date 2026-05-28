import { describe, expect, it, vi } from 'vitest'
import { apiClient } from '@/lib/api/api-client'
import { opsApi } from '../ops.api'

vi.mock('@/lib/api/api-client', () => ({
  apiClient: {
    get: vi.fn<() => Promise<unknown>>(),
  },
}))

describe('opsApi', () => {
  it('uses explicit admin BFF route for readiness evidence', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ service: 'sso-backend', ready: true, checks: {} })

    await opsApi.getReadiness()

    expect(apiClient.get).toHaveBeenCalledWith('/api/admin/ops/readiness')
  })
})
