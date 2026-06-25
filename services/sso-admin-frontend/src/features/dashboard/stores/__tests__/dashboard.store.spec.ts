import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ApiError, getLastRequestId } from '@/lib/api/api-client'
import { dashboardApi } from '../../services/dashboard.api'
import { useDashboardStore } from '../dashboard.store'
import type { DashboardSummary } from '../../types'

vi.mock('../../services/dashboard.api', () => ({
  dashboardApi: {
    getSummary: vi.fn<() => Promise<DashboardSummary>>(),
  },
}))

vi.mock('@/lib/api/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/api-client')>()
  return {
    ...actual,
    getLastRequestId: vi.fn<() => string | null>(() => 'req-dashboard-1'),
  }
})

const summary: DashboardSummary = {
  generated_at: '2026-05-27T00:00:00Z',
  counters: {
    users: { total: 10, active: 8, disabled: 1, locked: 1 },
    sessions: { portal_active: 5, rp_active: 7 },
    clients: { total: 3, active: 2, staged: 1, decommissioned: 0 },
    audit: { admin_last_24h: 4, auth_last_24h: 9 },
    incidents: { admin_denied_last_24h: 2 },
    data_subject_requests: { submitted: 1, approved: 1, rejected: 0, fulfilled: 2, on_hold: 0 },
  },
}

describe('useDashboardStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(dashboardApi.getSummary).mockReset()
    vi.mocked(getLastRequestId).mockReturnValue('req-dashboard-1')
  })

  it('stores dashboard summary and request evidence on success', async () => {
    vi.mocked(dashboardApi.getSummary).mockResolvedValue(summary)
    const store = useDashboardStore()

    await store.load()

    expect(store.status).toBe('success')
    expect(store.summary).toEqual(summary)
    expect(store.requestId).toBe('req-dashboard-1')
  })

  it('refreshes silently without returning to loading state', async () => {
    const updatedSummary: DashboardSummary = {
      ...summary,
      generated_at: '2026-05-27T00:01:00Z',
      counters: {
        ...summary.counters,
        users: { total: 11, active: 9, disabled: 1, locked: 1 },
      },
    }
    vi.mocked(dashboardApi.getSummary).mockResolvedValue(updatedSummary)
    const store = useDashboardStore()
    store.status = 'success'
    store.summary = summary

    await store.refresh()

    expect(store.status).toBe('success')
    expect(store.summary).toEqual(updatedSummary)
  })

  it('keeps existing dashboard summary as stale on transient silent refresh errors', async () => {
    vi.mocked(dashboardApi.getSummary).mockRejectedValue(
      new ApiError(500, 'SQLSTATE leaked admin trace', 'server_error', null, 'req-refresh-fail'),
    )
    const store = useDashboardStore()
    store.status = 'success'
    store.summary = summary
    store.errorMessage = null

    await store.refresh()

    expect(store.status).toBe('stale')
    expect(store.isStale).toBe(true)
    expect(store.summary).toEqual(summary)
    expect(store.errorMessage).not.toContain('SQLSTATE')
    expect(store.errorMessage).toBeTruthy()
  })

  it('keeps the last summary stale when a background refresh returns 403', async () => {
    vi.mocked(dashboardApi.getSummary)
      .mockResolvedValueOnce(summary)
      .mockRejectedValueOnce(new ApiError(403, 'SQLSTATE forbidden leak', 'forbidden', null, 'req-403'))
    const store = useDashboardStore()

    await store.load()
    await store.refresh()

    expect(store.status).toBe('stale')
    expect(store.isStale).toBe(true)
    expect(store.summary).toEqual(summary)
    expect(store.errorMessage).not.toContain('SQLSTATE')
    expect(store.errorMessage).not.toContain('izin')
    expect(store.errorMessage).toBeTruthy()
  })

  it('keeps the last summary stale when a background refresh returns 401', async () => {
    vi.mocked(dashboardApi.getSummary)
      .mockResolvedValueOnce(summary)
      .mockRejectedValueOnce(new ApiError(401, 'raw session trace', 'unauthenticated', null, 'req-401'))
    const store = useDashboardStore()

    await store.load()
    await store.refresh()

    expect(store.status).toBe('stale')
    expect(store.isStale).toBe(true)
    expect(store.summary).toEqual(summary)
    expect(store.errorMessage).not.toContain('raw session trace')
    expect(store.errorMessage).not.toContain('berakhir')
    expect(store.errorMessage).toBeTruthy()
  })

  it('maps 401 to safe unauthenticated copy on initial load', async () => {
    vi.mocked(dashboardApi.getSummary).mockRejectedValue(new ApiError(401, 'raw session trace'))
    const store = useDashboardStore()

    await store.load()

    expect(store.status).toBe('unauthenticated')
    expect(store.summary).toBeNull()
    expect(store.errorMessage).toBe('Sesi admin berakhir. Login ulang untuk melanjutkan.')
    expect(store.errorMessage).not.toContain('raw session trace')
  })

  it('maps 403 to safe forbidden copy on initial load', async () => {
    vi.mocked(dashboardApi.getSummary).mockRejectedValue(new ApiError(403, 'raw forbidden trace'))
    const store = useDashboardStore()

    await store.load()

    expect(store.status).toBe('forbidden')
    expect(store.summary).toBeNull()
    expect(store.errorMessage).toBe('Kamu tidak memiliki izin untuk melihat dashboard admin.')
    expect(store.errorMessage).not.toContain('raw forbidden trace')
  })

  it('surfaces unauthenticated when a silent refresh 401 races ahead of any summary', async () => {
    vi.mocked(dashboardApi.getSummary).mockRejectedValueOnce(new ApiError(401, 'raw session trace'))
    const store = useDashboardStore()

    // A background refresh that races ahead of the first successful load.
    await store.refresh()

    expect(store.status).toBe('unauthenticated')
    expect(store.summary).toBeNull()
    expect(store.errorMessage).not.toContain('raw session trace')
    expect(store.errorMessage).toBeTruthy()
  })

  it('maps 5xx to generic copy with request evidence', async () => {
    vi.mocked(dashboardApi.getSummary).mockRejectedValue(
      new ApiError(500, 'SQLSTATE leaked admin trace', 'server_error', null, 'req-fail-1'),
    )
    const store = useDashboardStore()

    await store.load()

    expect(store.status).toBe('error')
    expect(store.requestId).toBe('req-fail-1')
    expect(store.errorMessage).toBe(
      'Dashboard admin belum bisa dimuat. Coba lagi atau gunakan request ID req-fail-1 untuk investigasi.',
    )
    expect(store.errorMessage).not.toContain('SQLSTATE')
  })
})
