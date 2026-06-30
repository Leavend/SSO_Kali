// app/lib/ops/__tests__/ops-readiness.spec.ts
import { describe, expect, it } from 'vitest'
import { parseOpsReadiness } from '@/lib/ops/ops-readiness'

describe('parseOpsReadiness', () => {
  it('narrows a valid ready payload and strips external_idps + extra keys', () => {
    const raw = {
      service: 'sso-backend',
      ready: true,
      checks: {
        database: true,
        redis: true,
        queue: { pending_jobs: 1, failed_jobs: 0, oldest_pending_age_seconds: 12 },
        external_idps: { primary: { endpoint: 'https://idp.example/oidc' } },
      },
      extra: 'ignored',
    }
    const parsed = parseOpsReadiness(raw)
    expect(parsed).toEqual({
      service: 'sso-backend',
      ready: true,
      checks: {
        database: true,
        redis: true,
        queue: { pending_jobs: 1, failed_jobs: 0, oldest_pending_age_seconds: 12 },
      },
    })
    // external_idps must NOT survive (proven structurally, not just by toEqual).
    expect('external_idps' in (parsed as { checks: Record<string, unknown> }).checks).toBe(false)
  })

  it('keeps a degraded (ready:false) payload', () => {
    const parsed = parseOpsReadiness({
      service: 'sso-backend',
      ready: false,
      checks: { database: false, redis: true },
    })
    expect(parsed).not.toBeNull()
    expect(parsed?.ready).toBe(false)
    expect(parsed?.checks.queue).toBeUndefined()
  })

  it('coerces a missing/invalid oldest age to null and drops a malformed queue', () => {
    const ok = parseOpsReadiness({
      service: 'x',
      ready: true,
      checks: { database: true, redis: true, queue: { pending_jobs: 2, failed_jobs: 1 } },
    })
    expect(ok?.checks.queue).toEqual({
      pending_jobs: 2,
      failed_jobs: 1,
      oldest_pending_age_seconds: null,
    })

    const dropped = parseOpsReadiness({
      service: 'x',
      ready: true,
      checks: { database: true, redis: true, queue: { pending_jobs: 'nope' } },
    })
    expect(dropped?.checks.queue).toBeUndefined()
  })

  it('returns null for non-readiness shapes', () => {
    expect(parseOpsReadiness(null)).toBeNull()
    expect(parseOpsReadiness('nope')).toBeNull()
    expect(parseOpsReadiness({ service: 'x', ready: true })).toBeNull() // no checks
    expect(parseOpsReadiness({ service: 'x', ready: 'yes', checks: {} })).toBeNull() // ready not bool
    expect(
      parseOpsReadiness({ service: 'x', ready: true, checks: { database: 1, redis: true } }),
    ).toBeNull() // database not bool
  })
})
