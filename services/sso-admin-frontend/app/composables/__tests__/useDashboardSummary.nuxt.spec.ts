// *.nuxt.spec.ts → routed to the 'nuxt' env where mockNuxtImport is available.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { ApiError } from '@/lib/api/api-client'
import { dashboardApi } from '@/services/dashboard.api'
import { useDashboardSummary } from '../useDashboardSummary'
import type { DashboardSummary } from '@/types/dashboard.types'

vi.mock('@/services/dashboard.api', () => ({
  dashboardApi: { getSummary: vi.fn<() => Promise<DashboardSummary>>() },
}))

// Controllable useAsyncData stand-in: the test mutates data/pending/error and
// asserts the composable's derived state. Captures the key + handler so we can
// prove the composable wires the service correctly.
const data = ref<DashboardSummary | null>(null)
const pending = ref(false)
const error = ref<unknown>(null)
const refreshMock = vi.fn<() => Promise<void>>(async () => {})
let capturedKey: string | null = null
let capturedHandler: (() => unknown) | null = null

mockNuxtImport('useAsyncData', () => {
  return (key: string, handler: () => unknown) => {
    capturedKey = key
    capturedHandler = handler
    return { data, pending, error, refresh: refreshMock }
  }
})

const ready: DashboardSummary = {
  generated_at: '2026-06-28T14:32:15Z',
  partial: false,
  degraded: [],
  counters: {
    users: { total: 1250, active: 1100, disabled: 50, deactivated: 100, locked: 0 },
    sessions: { portal_active: 420, rp_active: 380 },
    clients: { total: 85, active: 72, staged: 8, decommissioned: 5 },
    audit: { admin_last_24h: 2340, auth_last_24h: 18500 },
    incidents: { admin_denied_last_24h: 12 },
    data_subject_requests: { submitted: 3, approved: 7, rejected: 2, fulfilled: 18, on_hold: 1 },
  },
}

beforeEach(() => {
  data.value = null
  pending.value = false
  error.value = null
  capturedKey = null
  capturedHandler = null
  vi.clearAllMocks()
})

afterEach(() => vi.clearAllMocks())

describe('useDashboardSummary', () => {
  it('wires the service under a stable asyncData key', () => {
    useDashboardSummary()
    expect(capturedKey).toBe('admin-dashboard-summary')
    capturedHandler?.()
    expect(dashboardApi.getSummary).toHaveBeenCalledTimes(1)
  })

  it('derives ready / empty / loading from the summary', () => {
    const dash = useDashboardSummary()
    expect(dash.viewState.value).toBe('loading')
    data.value = ready
    expect(dash.viewState.value).toBe('ready')
    expect(dash.summary.value).toBe(ready)
  })

  it('maps a first-load 403 to forbidden and exposes the redacted request id', () => {
    error.value = new ApiError(403, 'forbidden', 'forbidden', null, 'admin-req-DENIED42')
    const dash = useDashboardSummary()
    expect(dash.viewState.value).toBe('forbidden')
    expect(dash.requestId.value).toBe('admin-req-DENIED42')
  })

  it('maps a first-load 401 to unauthenticated', () => {
    error.value = new ApiError(401, 'no session')
    expect(useDashboardSummary().viewState.value).toBe('unauthenticated')
  })

  it('keeps the last good snapshot on a background refresh failure (stale)', () => {
    data.value = ready
    error.value = new ApiError(500, 'boom')
    const dash = useDashboardSummary()
    expect(dash.viewState.value).toBe('ready')
    expect(dash.isStale.value).toBe(true)
  })

  it('surfaces the degraded group list only when the summary is partial', () => {
    data.value = { ...ready, partial: true, degraded: ['sessions', 'audit'] }
    const dash = useDashboardSummary()
    expect(dash.degraded.value).toEqual(['sessions', 'audit'])
    data.value = ready
    expect(useDashboardSummary().degraded.value).toEqual([])
  })

  it('refresh() delegates to the underlying asyncData refresh', async () => {
    await useDashboardSummary().refresh()
    expect(refreshMock).toHaveBeenCalledTimes(1)
  })
})
