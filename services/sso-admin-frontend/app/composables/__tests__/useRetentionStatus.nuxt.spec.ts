// *.nuxt.spec.ts → routed to the 'nuxt' env where mockNuxtImport is available.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { ApiError } from '@/lib/api/api-client'
import { observabilityApi } from '@/services/observability.api'
import { useRetentionStatus } from '../useRetentionStatus'
import type { RetentionResponse } from '@/types/compliance.types'

vi.mock('@/services/observability.api', () => ({
  observabilityApi: { getRetention: vi.fn<() => Promise<RetentionResponse>>() },
}))

// Controllable useAsyncData stand-in: the test mutates data/error and asserts the
// composable's derived state, and captures the key + handler so we can prove the
// composable wires the service correctly. `pending` is supplied but unused by the
// Phase-6 resolver (loading is derived from a null snapshot).
const data = ref<RetentionResponse | null>(null)
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

const ready: RetentionResponse = {
  retention: {
    generated_at: '2026-06-28T14:32:15Z',
    items: [
      {
        category: 'audit_events',
        label: 'Audit events',
        window: { days: 365 },
        schedule: 'daily',
        candidate_count: 12,
        last_pruned_at: '2026-06-27T02:00:00Z',
        last_pruned_count: 40,
      },
    ],
  },
}
const empty: RetentionResponse = {
  retention: { generated_at: '2026-06-28T14:32:15Z', items: [] },
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

describe('useRetentionStatus', () => {
  it('wires the service under a stable asyncData key', () => {
    useRetentionStatus()
    expect(capturedKey).toBe('admin-retention-status')
    capturedHandler?.()
    expect(observabilityApi.getRetention).toHaveBeenCalledTimes(1)
  })

  it('derives loading / ready / empty from the retention snapshot', () => {
    const status = useRetentionStatus()
    expect(status.viewState.value).toBe('loading')
    expect(status.retention.value).toBeNull()
    data.value = ready
    expect(status.viewState.value).toBe('ready')
    expect(status.retention.value?.items).toHaveLength(1)
    data.value = empty
    expect(status.viewState.value).toBe('empty')
  })

  it('maps a first-load 403 to forbidden and exposes the redacted request id', () => {
    error.value = new ApiError(403, 'forbidden', 'forbidden', null, 'admin-req-DENIED42')
    const status = useRetentionStatus()
    expect(status.viewState.value).toBe('forbidden')
    expect(status.requestId.value).toBe('admin-req-DENIED42')
  })

  it('maps a first-load 401 to unauthenticated', () => {
    error.value = new ApiError(401, 'no session')
    expect(useRetentionStatus().viewState.value).toBe('unauthenticated')
  })

  it('keeps the last good snapshot on a background refresh failure (stale)', () => {
    data.value = ready
    error.value = new ApiError(500, 'boom')
    const status = useRetentionStatus()
    expect(status.viewState.value).toBe('ready')
    expect(status.isStale.value).toBe(true)
  })

  it('refresh() delegates to the underlying asyncData refresh', async () => {
    await useRetentionStatus().refresh()
    expect(refreshMock).toHaveBeenCalledTimes(1)
  })

  it('hydrates only the masked retention DTO — no token/secret field leaks', () => {
    data.value = ready
    const status = useRetentionStatus()
    const serialized = JSON.stringify(status.retention.value)
    expect(serialized).not.toMatch(/access_token|refresh_token|id_token|Bearer|client_secret/i)
    expect(serialized).not.toMatch(/\b\d{16}\b|\b\d{18}\b|\b\d{10}\b/)
  })
})
