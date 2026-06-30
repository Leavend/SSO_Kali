import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api/api-client'
import {
  isObservabilitySummaryEmpty,
  isObservabilityStale,
  resolveObservabilityViewState,
  resolveServiceStatusTone,
} from '../observability-view-state'
import type { ObservabilitySummary } from '@/types/observability.types'

const ready: ObservabilitySummary = {
  generated_at: '2026-06-28T14:32:15Z',
  partial: false,
  degraded: [],
  services: [
    {
      key: 'sso-backend',
      name: 'SSO-Backend',
      status: 'healthy',
      summary: 'All checks passing',
      latency_p95_ms: 42,
      freshness_seconds: 5,
      checks: { database: true, redis: true },
      queue: { pending_jobs: 0, failed_jobs: 0, oldest_pending_age_seconds: null },
    },
  ],
  metrics: {
    window_seconds: 900,
    freshness_seconds: 30,
    queue: { pending_jobs: 0, failed_jobs: 0, oldest_pending_age_seconds: null },
    auth_funnel: { total_15m: 0, succeeded_15m: 0, failed_15m: 0 },
    admin_activity: { total_15m: 0, denied_15m: 0 },
  },
  freshness: { recent_events_seconds: 5 },
  logs: [
    {
      id: 'log-1',
      service: 'admin-sso',
      severity: 'info',
      message: 'admin.session.login',
      reference: 'REF-ABCD1234',
      occurred_at: '2026-06-28T14:30:00Z',
    },
  ],
  traces: {
    status: 'unavailable',
    reason: 'no collector',
    next_step: 'configure OTLP',
    last_seen_trace_id: null,
  },
}

// "Empty" = the backend answered but there is nothing to show: no services and
// no log events. Distinct from forbidden (403 → no permission).
const empty: ObservabilitySummary = { ...ready, services: [], logs: [] }

describe('resolveServiceStatusTone', () => {
  it('maps every service status to its Swiss tone (never colour-alone upstream)', () => {
    expect(resolveServiceStatusTone('healthy')).toBe('success')
    expect(resolveServiceStatusTone('degraded')).toBe('warning')
    expect(resolveServiceStatusTone('down')).toBe('danger')
    expect(resolveServiceStatusTone('unknown')).toBe('neutral')
  })
})

describe('isObservabilitySummaryEmpty', () => {
  it('is true only when there are no services and no log events', () => {
    expect(isObservabilitySummaryEmpty(empty)).toBe(true)
    expect(isObservabilitySummaryEmpty(ready)).toBe(false)
    expect(isObservabilitySummaryEmpty({ ...ready, services: [] })).toBe(false)
    expect(isObservabilitySummaryEmpty({ ...ready, logs: [] })).toBe(false)
  })
})

describe('resolveObservabilityViewState', () => {
  it('loading when no summary and no error', () => {
    expect(resolveObservabilityViewState({ error: null, summary: null })).toBe('loading')
  })
  it('maps a first-load 401 to unauthenticated', () => {
    expect(
      resolveObservabilityViewState({ error: new ApiError(401, 'no session'), summary: null }),
    ).toBe('unauthenticated')
  })
  it('maps a first-load 403 to forbidden (distinct from empty)', () => {
    expect(
      resolveObservabilityViewState({ error: new ApiError(403, 'forbidden'), summary: null }),
    ).toBe('forbidden')
  })
  it('maps other first-load errors to error (incl. H3-shaped statusCode)', () => {
    expect(resolveObservabilityViewState({ error: new ApiError(500, 'boom'), summary: null })).toBe(
      'error',
    )
    expect(resolveObservabilityViewState({ error: { statusCode: 502 }, summary: null })).toBe(
      'error',
    )
  })
  it('ready / empty when a summary is present, keeping data on screen through a background error', () => {
    expect(resolveObservabilityViewState({ error: null, summary: ready })).toBe('ready')
    expect(resolveObservabilityViewState({ error: null, summary: empty })).toBe('empty')
    expect(
      resolveObservabilityViewState({ error: new ApiError(500, 'boom'), summary: ready }),
    ).toBe('ready')
  })
})

describe('isObservabilityStale', () => {
  it('is true only when an error coexists with a prior summary', () => {
    expect(isObservabilityStale(new ApiError(500, 'x'), ready)).toBe(true)
    expect(isObservabilityStale(null, ready)).toBe(false)
    expect(isObservabilityStale(new ApiError(500, 'x'), null)).toBe(false)
  })
})
