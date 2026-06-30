// *.nuxt.spec.ts → routed to the 'nuxt' env where mockNuxtImport is available.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { ApiError } from '@/lib/api/api-client'
import { observabilityApi } from '@/services/observability.api'
import { useObservabilitySummary } from '../useObservabilitySummary'
import type { ObservabilitySummary } from '@/types/observability.types'

vi.mock('@/services/observability.api', () => ({
  observabilityApi: { getSummary: vi.fn<() => Promise<ObservabilitySummary>>() },
}))

// Controllable useAsyncData stand-in: the test mutates data/error and asserts the
// composable's derived state. Captures the key + handler so we can prove the
// composable wires the service correctly. `pending` is returned for shape parity
// with real useAsyncData even though this composable does not destructure it
// (the observability resolver derives loading from "no error, no summary").
const data = ref<ObservabilitySummary | null>(null)
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

const ready: ObservabilitySummary = {
  generated_at: '2026-06-28T14:32:15Z',
  partial: false,
  degraded: [],
  services: [
    {
      key: 'backend',
      name: 'Identity Provider',
      status: 'healthy',
      summary: 'All checks passing',
      latency_p95_ms: 84,
      freshness_seconds: 12,
    },
    {
      key: 'queue',
      name: 'Queue Worker',
      status: 'degraded',
      summary: 'Backlog growing',
      queue: { pending_jobs: 42, failed_jobs: 3, oldest_pending_age_seconds: 180 },
    },
  ],
  metrics: {
    window_seconds: 3600,
    auth_funnel: { authorize: 1200, token: 1150, denied: 12 },
    admin_activity: { actions: 340, denied: 4 },
  },
  freshness: { recent_events_seconds: 8 },
  logs: [
    {
      id: 'evt-1',
      service: 'backend',
      severity: 'warning',
      message: 'Token refresh retried',
      reference: 'corr-ABCD1234',
      occurred_at: '2026-06-28T14:31:00Z',
    },
  ],
  traces: { status: 'available', reason: 'Sampling active', last_seen_trace_id: 'trace-9f8e' },
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

describe('useObservabilitySummary', () => {
  it('wires the service under a stable asyncData key', () => {
    useObservabilitySummary()
    expect(capturedKey).toBe('admin-observability-summary')
    capturedHandler?.()
    expect(observabilityApi.getSummary).toHaveBeenCalledTimes(1)
  })

  it('derives loading then ready from the summary, exposing the raw masked DTO', () => {
    const obs = useObservabilitySummary()
    expect(obs.viewState.value).toBe('loading')
    data.value = ready
    expect(obs.viewState.value).toBe('ready')
    expect(obs.summary.value).toEqual(ready)
  })

  it('maps a first-load 403 to forbidden and exposes the redacted request id', () => {
    error.value = new ApiError(403, 'forbidden', 'forbidden', null, 'admin-req-DENIED42')
    const obs = useObservabilitySummary()
    expect(obs.viewState.value).toBe('forbidden')
    expect(obs.requestId.value).toBe('admin-req-DENIED42')
  })

  it('maps a first-load 401 to unauthenticated', () => {
    error.value = new ApiError(401, 'no session')
    expect(useObservabilitySummary().viewState.value).toBe('unauthenticated')
  })

  it('keeps the last good snapshot on a background refresh failure (stale)', () => {
    data.value = ready
    error.value = new ApiError(500, 'boom')
    const obs = useObservabilitySummary()
    expect(obs.viewState.value).toBe('ready')
    expect(obs.isStale.value).toBe(true)
  })

  it('surfaces the degraded section list only when the summary is partial', () => {
    data.value = { ...ready, partial: true, degraded: ['queue', 'traces'] }
    const obs = useObservabilitySummary()
    expect(obs.degraded.value).toEqual(['queue', 'traces'])
    data.value = ready
    expect(useObservabilitySummary().degraded.value).toEqual([])
  })

  it('refresh() delegates to the underlying asyncData refresh', async () => {
    await useObservabilitySummary().refresh()
    expect(refreshMock).toHaveBeenCalledTimes(1)
  })
})
