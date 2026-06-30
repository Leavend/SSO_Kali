// app/lib/ops/ops-readiness.ts
import type { OpsQueueCheck, OpsReadiness } from '@/types/ops.types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseQueue(value: unknown): OpsQueueCheck | undefined {
  if (!isRecord(value)) return undefined
  if (typeof value.pending_jobs !== 'number' || typeof value.failed_jobs !== 'number') {
    return undefined
  }
  const oldest = value.oldest_pending_age_seconds
  return {
    pending_jobs: value.pending_jobs,
    failed_jobs: value.failed_jobs,
    oldest_pending_age_seconds: typeof oldest === 'number' ? oldest : null,
  }
}

/**
 * Validates + NARROWS the raw `/ready` payload to the display DTO. Returns null
 * when the shape is not a readiness response (caller then surfaces an error).
 *
 * SECURITY: builds a FRESH literal carrying ONLY {service, ready, checks:
 * {database, redis, queue?}}. Any extra backend keys — notably the config-gated
 * `external_idps` health map, which can hold IdP endpoint config — are dropped
 * here and never reach the composable, the page, or `__NUXT_DATA__`.
 */
export function parseOpsReadiness(payload: unknown): OpsReadiness | null {
  if (!isRecord(payload)) return null
  const { service, ready, checks } = payload
  if (typeof service !== 'string' || typeof ready !== 'boolean' || !isRecord(checks)) {
    return null
  }
  if (typeof checks.database !== 'boolean' || typeof checks.redis !== 'boolean') {
    return null
  }
  const queue = parseQueue(checks.queue)
  return {
    service,
    ready,
    checks: {
      database: checks.database,
      redis: checks.redis,
      ...(queue ? { queue } : {}),
    },
  }
}
