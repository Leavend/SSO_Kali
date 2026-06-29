import { ApiError, apiClient } from '@/lib/api/api-client'
import { parseOpsReadiness } from '@/lib/ops/ops-readiness'
import type { OpsReadiness } from '@/types/ops.types'

export const opsApi = {
  /**
   * GET /api/admin/ops/readiness — the BFF proxies this to the backend `/ready`.
   *
   * The backend answers 200 when ready and **503 when a dependency is down**, but
   * the 503 body still carries the readiness breakdown. We surface that degraded
   * readiness (so the operator sees WHICH check failed) rather than a generic
   * error. Only genuine auth/transport failures (401/403/other) propagate. A 503
   * whose body is NOT a readiness shape is treated as a real outage and rethrown.
   *
   * `error.payload` is read here, server-side inside the `useAsyncData` handler,
   * where the ApiError is a live instance — the parsed readiness is then returned
   * as DATA, which serializes cleanly into the hydration payload (an ApiError's
   * custom `.payload` field would NOT survive SSR error serialization).
   */
  async getReadiness(): Promise<OpsReadiness> {
    let body: unknown
    try {
      body = await apiClient.get<unknown>('/api/admin/ops/readiness')
    } catch (error) {
      if (error instanceof ApiError && error.status === 503) {
        const degraded = parseOpsReadiness(error.payload)
        if (degraded) return degraded
      }
      throw error
    }
    const parsed = parseOpsReadiness(body)
    if (parsed) return parsed
    throw new ApiError(502, 'Invalid readiness response', 'invalid_upstream_response', body)
  },
}
