import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiClient } from '@/lib/api/api-client'
import { opsApi } from '@/services/ops.api'

const READY = {
  service: 'sso-backend',
  ready: true,
  checks: {
    database: true,
    redis: true,
    queue: { pending_jobs: 0, failed_jobs: 0, oldest_pending_age_seconds: null },
    external_idps: { primary: { endpoint: 'https://idp.example/oidc' } },
  },
}

afterEach(() => vi.restoreAllMocks())

describe('opsApi.getReadiness', () => {
  it('GETs the readiness path and returns the narrowed DTO (external_idps stripped)', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue(READY as never)
    const result = await opsApi.getReadiness()
    expect(get).toHaveBeenCalledWith('/api/admin/ops/readiness')
    expect(result.service).toBe('sso-backend')
    expect(result.ready).toBe(true)
    expect('external_idps' in result.checks).toBe(false)
  })

  it('surfaces the DEGRADED readiness from a 503 body instead of throwing', async () => {
    const body = { service: 'sso-backend', ready: false, checks: { database: false, redis: true } }
    vi.spyOn(apiClient, 'get').mockRejectedValue(
      new ApiError(503, 'service unavailable', 'service_unavailable', body),
    )
    const result = await opsApi.getReadiness()
    expect(result.ready).toBe(false)
    expect(result.checks.database).toBe(false)
  })

  it('rethrows a 503 whose body is not a readiness shape', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue(new ApiError(503, 'down', 'x', { nope: true }))
    await expect(opsApi.getReadiness()).rejects.toThrow('down')
  })

  it('throws invalid_upstream_response when a 200 body is not a readiness shape', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ nope: true } as never)
    await expect(opsApi.getReadiness()).rejects.toMatchObject({ status: 502 })
  })

  it('rethrows auth errors (401/403) untouched', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue(new ApiError(403, 'forbidden'))
    await expect(opsApi.getReadiness()).rejects.toThrow('forbidden')
  })
})
