import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api/api-client'
import {
  isDashboardEmpty,
  isDashboardStale,
  resolveCounterTone,
  resolveDashboardViewState,
} from '../dashboard-view-state'
import type { DashboardSummary } from '@/types/dashboard.types'

const ready: DashboardSummary = {
  generated_at: '2026-06-28T14:32:15Z',
  partial: false,
  degraded: [],
  counters: {
    users: { total: 1250, active: 1100, disabled: 50, deactivated: 100, locked: 0 },
    sessions: { portal_active: 420, rp_active: 380 },
    clients: { total: 85, active: 72, staged: 8, decommissioned: 5 },
    audit: { admin_last_24h: 2340, auth_last_24h: 18500 },
    incidents: { admin_denied_last_24h: 12 },
    data_subject_requests: { submitted: 3, approved: 7, rejected: 2, fulfilled: 18, on_hold: 1 },
  },
}

const empty: DashboardSummary = {
  generated_at: '2026-06-28T14:32:15Z',
  partial: false,
  degraded: [],
  counters: {
    users: { total: 0, active: 0, disabled: 0, deactivated: 0, locked: 0 },
    sessions: { portal_active: 0, rp_active: 0 },
    clients: { total: 0, active: 0, staged: 0, decommissioned: 0 },
    audit: { admin_last_24h: 0, auth_last_24h: 0 },
    incidents: { admin_denied_last_24h: 0 },
    data_subject_requests: { submitted: 0, approved: 0, rejected: 0, fulfilled: 0, on_hold: 0 },
  },
}

describe('resolveCounterTone', () => {
  it('maps state-bearing counter keys to a tone, zero/null to neutral', () => {
    expect(resolveCounterTone('locked', 3)).toBe('danger')
    expect(resolveCounterTone('admin_denied_last_24h', 12)).toBe('danger')
    expect(resolveCounterTone('rejected', 2)).toBe('danger')
    expect(resolveCounterTone('staged', 8)).toBe('warning')
    expect(resolveCounterTone('on_hold', 1)).toBe('warning')
    expect(resolveCounterTone('active', 1100)).toBe('success')
    expect(resolveCounterTone('fulfilled', 18)).toBe('success')
    expect(resolveCounterTone('approved', 7)).toBe('success')
    // Routine lifecycle counts are NEUTRAL, not danger (Swiss: red = critical only).
    expect(resolveCounterTone('disabled', 50)).toBe('neutral')
    expect(resolveCounterTone('deactivated', 100)).toBe('neutral')
    expect(resolveCounterTone('decommissioned', 5)).toBe('neutral')
    // 'deactivated'/'portal_active' must NOT match 'active' via substring → neutral.
    expect(resolveCounterTone('portal_active', 420)).toBe('neutral')
    expect(resolveCounterTone('rp_active', 380)).toBe('neutral')
    expect(resolveCounterTone('total', 1250)).toBe('neutral')
    expect(resolveCounterTone('locked', 0)).toBe('neutral')
    expect(resolveCounterTone('active', null)).toBe('neutral')
  })
})

describe('isDashboardEmpty', () => {
  it('is true only when every counter across every group is null or 0', () => {
    expect(isDashboardEmpty(empty)).toBe(true)
    expect(isDashboardEmpty(ready)).toBe(false)
  })
})

describe('resolveDashboardViewState', () => {
  it('loading when no summary, no error', () => {
    expect(resolveDashboardViewState({ pending: true, error: null, summary: null })).toBe('loading')
  })
  it('maps a first-load 401 to unauthenticated', () => {
    expect(
      resolveDashboardViewState({
        pending: false,
        error: new ApiError(401, 'no session'),
        summary: null,
      }),
    ).toBe('unauthenticated')
  })
  it('maps a first-load 403 to forbidden (distinct from empty)', () => {
    expect(
      resolveDashboardViewState({
        pending: false,
        error: new ApiError(403, 'forbidden'),
        summary: null,
      }),
    ).toBe('forbidden')
  })
  it('maps other first-load errors to error (incl. H3-shaped statusCode)', () => {
    expect(
      resolveDashboardViewState({
        pending: false,
        error: new ApiError(500, 'boom'),
        summary: null,
      }),
    ).toBe('error')
    expect(
      resolveDashboardViewState({ pending: false, error: { statusCode: 502 }, summary: null }),
    ).toBe('error')
  })
  it('ready / empty when a summary is present (error is kept on screen, not blanked)', () => {
    expect(resolveDashboardViewState({ pending: false, error: null, summary: ready })).toBe('ready')
    expect(resolveDashboardViewState({ pending: false, error: null, summary: empty })).toBe('empty')
    // background refresh failed but we still hold a good snapshot → keep it visible
    expect(
      resolveDashboardViewState({
        pending: false,
        error: new ApiError(500, 'boom'),
        summary: ready,
      }),
    ).toBe('ready')
  })
})

describe('isDashboardStale', () => {
  it('is true only when an error coexists with a prior summary', () => {
    expect(isDashboardStale(new ApiError(500, 'x'), ready)).toBe(true)
    expect(isDashboardStale(null, ready)).toBe(false)
    expect(isDashboardStale(new ApiError(500, 'x'), null)).toBe(false)
  })
})
