import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ApiError, getLastRequestId } from '@/lib/api/api-client'
import { opsApi } from '../../services/ops.api'
import { useOpsStore } from '../ops.store'
import type { OpsReadiness } from '../../types'

vi.mock('../../services/ops.api', () => ({
  opsApi: {
    getReadiness: vi.fn<() => Promise<OpsReadiness>>(),
  },
}))

vi.mock('@/lib/api/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/api-client')>()
  return {
    ...actual,
    getLastRequestId: vi.fn<() => string | null>(() => 'req-ops-1'),
  }
})

const readiness: OpsReadiness = {
  service: 'sso-backend',
  ready: true,
  checks: {
    database: true,
    redis: true,
    queue: { pending_jobs: 0, failed_jobs: 0, oldest_pending_age_seconds: null },
  },
}

describe('useOpsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(opsApi.getReadiness).mockReset()
    vi.mocked(getLastRequestId).mockReturnValue('req-ops-1')
  })

  it('loads readiness and stores request evidence', async () => {
    vi.mocked(opsApi.getReadiness).mockResolvedValue(readiness)
    const store = useOpsStore()

    await store.load()

    expect(store.status).toBe('success')
    expect(store.readiness).toEqual(readiness)
    expect(store.requestId).toBe('req-ops-1')
  })

  it('maps forbidden errors to safe copy', async () => {
    vi.mocked(opsApi.getReadiness).mockRejectedValue(new ApiError(403, 'SQLSTATE forbidden leak'))
    const store = useOpsStore()

    await store.load()

    expect(store.status).toBe('forbidden')
    expect(store.errorMessage).toBe('Kamu tidak memiliki izin untuk melihat ops evidence.')
    expect(store.errorMessage).not.toContain('SQLSTATE')
  })

  it('maps server errors to safe copy with request ID', async () => {
    vi.mocked(opsApi.getReadiness).mockRejectedValue(
      new ApiError(500, 'raw metrics token leak', 'server_error', null, 'req-ops-fail'),
    )
    const store = useOpsStore()

    await store.load()

    expect(store.status).toBe('error')
    expect(store.requestId).toBe('req-ops-fail')
    // formatSupportReference('req-ops-fail') → 'REQOPSFAIL' (10 chars) → slice(-8) → 'QOPSFAIL'
    expect(store.errorMessage).toContain('kode referensi REF-QOPSFAIL')
    expect(store.errorMessage).not.toContain('request ID')
    expect(store.errorMessage).not.toContain('raw metrics token')
  })
})
