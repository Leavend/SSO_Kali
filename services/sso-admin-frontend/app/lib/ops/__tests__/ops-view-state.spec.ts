import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api/api-client'
import {
  resolveOpsViewState,
  resolveReadinessTone,
  resolveCheckTone,
  resolveQueueTone,
} from '@/lib/ops/ops-view-state'
import type { OpsReadiness } from '@/types/ops.types'

const READY: OpsReadiness = {
  service: 'sso-backend',
  ready: true,
  checks: { database: true, redis: true },
}

describe('resolveOpsViewState', () => {
  it('is loading while pending with no readiness and no error', () => {
    expect(resolveOpsViewState({ pending: true, error: null, readiness: null })).toBe('loading')
  })

  it('is ready once readiness is present (even when degraded)', () => {
    expect(resolveOpsViewState({ pending: false, error: null, readiness: READY })).toBe('ready')
    expect(
      resolveOpsViewState({
        pending: false,
        error: null,
        readiness: { ...READY, ready: false },
      }),
    ).toBe('ready')
  })

  it('maps a 401 with no readiness to unauthenticated', () => {
    expect(
      resolveOpsViewState({ pending: false, error: new ApiError(401, 'no'), readiness: null }),
    ).toBe('unauthenticated')
  })

  it('maps a 403 with no readiness to forbidden', () => {
    expect(
      resolveOpsViewState({ pending: false, error: new ApiError(403, 'no'), readiness: null }),
    ).toBe('forbidden')
  })

  it('maps any other error with no readiness to error', () => {
    expect(
      resolveOpsViewState({ pending: false, error: new ApiError(502, 'boom'), readiness: null }),
    ).toBe('error')
    expect(
      resolveOpsViewState({ pending: false, error: new Error('net'), readiness: null }),
    ).toBe('error')
  })

  it('reads a plain hydration-shaped error (statusCode) when ApiError did not survive SSR', () => {
    expect(
      resolveOpsViewState({ pending: false, error: { statusCode: 403 }, readiness: null }),
    ).toBe('forbidden')
  })
})

describe('readiness tone resolvers', () => {
  it('overall: ready -> success, degraded -> danger', () => {
    expect(resolveReadinessTone(true)).toBe('success')
    expect(resolveReadinessTone(false)).toBe('danger')
  })

  it('check: ok -> success, down -> danger', () => {
    expect(resolveCheckTone(true)).toBe('success')
    expect(resolveCheckTone(false)).toBe('danger')
  })

  it('queue: failed > 0 -> danger; pending > 0 -> warning; otherwise success', () => {
    expect(
      resolveQueueTone({ pending_jobs: 0, failed_jobs: 3, oldest_pending_age_seconds: 5 }),
    ).toBe('danger')
    expect(
      resolveQueueTone({ pending_jobs: 4, failed_jobs: 0, oldest_pending_age_seconds: 5 }),
    ).toBe('warning')
    expect(
      resolveQueueTone({ pending_jobs: 0, failed_jobs: 0, oldest_pending_age_seconds: null }),
    ).toBe('success')
  })
})
