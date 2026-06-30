import { describe, expect, it, vi } from 'vitest'
import type { DashboardSummary } from '@/types/dashboard.types'

const get = vi.fn<(path: string) => Promise<unknown>>()
vi.mock('@/lib/api/api-client', () => ({ apiClient: { get } }))

const { dashboardApi } = await import('../dashboard.api')

describe('dashboardApi', () => {
  it('GETs the same-origin BFF summary path and returns the DTO unchanged', async () => {
    const payload: DashboardSummary = {
      generated_at: '2026-06-28T14:32:15Z',
      partial: false,
      degraded: [],
      counters: {
        users: { total: 1, active: 1, disabled: 0, deactivated: 0, locked: 0 },
        sessions: { portal_active: 0, rp_active: 0 },
        clients: { total: 0, active: 0, staged: 0, decommissioned: 0 },
        audit: { admin_last_24h: 0, auth_last_24h: 0 },
        incidents: { admin_denied_last_24h: 0 },
        data_subject_requests: { submitted: 0, approved: 0, rejected: 0, fulfilled: 0, on_hold: 0 },
      },
    }
    get.mockResolvedValue(payload)
    await expect(dashboardApi.getSummary()).resolves.toBe(payload)
    expect(get).toHaveBeenCalledWith('/api/admin/dashboard/summary')
  })
})
