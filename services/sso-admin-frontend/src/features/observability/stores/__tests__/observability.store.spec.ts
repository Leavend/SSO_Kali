import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ApiError, getLastRequestId } from '@/lib/api/api-client'
import { observabilityApi } from '../../services/observability.api'
import { useObservabilityStore } from '../observability.store'
import type { ObservabilitySummary } from '../../types'

vi.mock('../../services/observability.api', () => ({
  observabilityApi: {
    getSummary: vi.fn<() => Promise<ObservabilitySummary>>(),
  },
}))

vi.mock('@/lib/api/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/api-client')>()
  return {
    ...actual,
    getLastRequestId: vi.fn<() => string | null>(() => 'req-observability-1'),
  }
})

const summary: ObservabilitySummary = {
  generated_at: '2026-06-21T00:00:00Z',
  partial: false,
  degraded: [],
  services: [
    {
      key: 'sso-backend',
      name: 'SSO-Backend',
      status: 'healthy',
      summary: 'Ready',
      freshness_seconds: 15,
    },
  ],
  metrics: { window_seconds: 900, freshness_seconds: 30 },
  freshness: { recent_events_seconds: 5 },
  logs: [],
  traces: { status: 'unavailable', reason: 'No tracing yet' },
}

describe('useObservabilityStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(observabilityApi.getSummary).mockReset()
    vi.mocked(getLastRequestId).mockReturnValue('req-observability-1')
  })

  it('loads summary and stores request evidence', async () => {
    vi.mocked(observabilityApi.getSummary).mockResolvedValue(summary)
    const store = useObservabilityStore()

    await store.load()

    expect(store.status).toBe('success')
    expect(store.summary).toEqual(summary)
    expect(store.requestId).toBe('req-observability-1')
  })

  it('maps forbidden errors without leaking raw backend text', async () => {
    vi.mocked(observabilityApi.getSummary).mockRejectedValue(
      new ApiError(403, 'SQLSTATE forbidden leak'),
    )
    const store = useObservabilityStore()

    await store.load()

    expect(store.status).toBe('forbidden')
    expect(store.errorMessage).toContain('Observability cockpit')
    expect(store.errorMessage).not.toContain('SQLSTATE')
  })

  it('maps unauthenticated errors on initial load', async () => {
    vi.mocked(observabilityApi.getSummary).mockRejectedValue(new ApiError(401, 'session expired'))
    const store = useObservabilityStore()

    await store.load()

    expect(store.status).toBe('unauthenticated')
    expect(store.summary).toBeNull()
    expect(store.errorMessage).not.toContain('session expired')
    expect(store.errorMessage).toBeTruthy()
  })

  it('keeps the last summary stale when a background refresh returns 403', async () => {
    vi.mocked(observabilityApi.getSummary)
      .mockResolvedValueOnce(summary)
      .mockRejectedValueOnce(new ApiError(403, 'SQLSTATE forbidden leak'))
    const store = useObservabilityStore()

    await store.load()
    await store.refresh()

    expect(store.status).toBe('stale')
    expect(store.isStale).toBe(true)
    expect(store.summary).toEqual(summary)
    expect(store.errorMessage).toContain('Observability cockpit')
    expect(store.errorMessage).not.toContain('SQLSTATE')
  })

  it('keeps the last summary stale when a background refresh returns 401', async () => {
    vi.mocked(observabilityApi.getSummary)
      .mockResolvedValueOnce(summary)
      .mockRejectedValueOnce(new ApiError(401, 'unauthenticated'))
    const store = useObservabilityStore()

    await store.load()
    await store.refresh()

    expect(store.status).toBe('stale')
    expect(store.isStale).toBe(true)
    expect(store.summary).toEqual(summary)
    expect(store.errorMessage).toContain('Observability cockpit')
  })

  it('marks silent refresh failures as stale while keeping the last summary', async () => {
    vi.mocked(observabilityApi.getSummary)
      .mockResolvedValueOnce(summary)
      .mockRejectedValueOnce(new ApiError(502, 'Bad gateway'))
    const store = useObservabilityStore()

    await store.load()
    await store.refresh()

    expect(store.status).toBe('stale')
    expect(store.isStale).toBe(true)
    expect(store.summary).toEqual(summary)
    expect(store.errorMessage).toContain('Observability cockpit')
  })

  it('surfaces an error when the first refresh fails silently before any summary loads', async () => {
    vi.mocked(observabilityApi.getSummary).mockRejectedValueOnce(new ApiError(500, 'boom'))
    const store = useObservabilityStore()

    // A background refresh that races ahead of the first successful load.
    await store.refresh()

    expect(store.status).toBe('error')
    expect(store.isLoading).toBe(false)
    expect(store.summary).toBeNull()
    expect(store.errorMessage).toContain('Observability cockpit')
  })

  it('surfaces an error when a silent network failure occurs before any summary loads', async () => {
    vi.mocked(observabilityApi.getSummary).mockRejectedValueOnce(new Error('network down'))
    const store = useObservabilityStore()

    await store.refresh()

    expect(store.status).toBe('error')
    expect(store.isLoading).toBe(false)
    expect(store.errorMessage).toContain('Observability cockpit')
  })
})
