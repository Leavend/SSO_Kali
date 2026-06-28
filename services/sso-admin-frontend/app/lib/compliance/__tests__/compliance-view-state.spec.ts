import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api/api-client'
import {
  isComplianceStale,
  resolveDsrListViewState,
  resolveDsrStatusTone,
  resolveRetentionViewState,
} from '../compliance-view-state'
import type { DataSubjectRequest, RetentionStatus } from '@/types/compliance.types'

const retention: RetentionStatus = {
  generated_at: '2026-06-28T14:32:15Z',
  items: [
    {
      category: 'admin_audit_events',
      label: 'Admin audit events',
      window: { days: 730 },
      candidate_count: 12,
    },
  ],
}
const emptyRetention: RetentionStatus = { generated_at: '2026-06-28T14:32:15Z', items: [] }

const dsr: DataSubjectRequest = {
  request_id: '01HXYZABCDEFGHJKMNPQRSTV',
  subject_id: 'sub_opaque_0001',
  type: 'export',
  status: 'submitted',
  submitted_at: '2026-06-28T10:00:00Z',
}

describe('resolveDsrStatusTone', () => {
  it('maps every DSR status to its Swiss tone', () => {
    expect(resolveDsrStatusTone('submitted')).toBe('warning')
    expect(resolveDsrStatusTone('on_hold')).toBe('warning')
    expect(resolveDsrStatusTone('approved')).toBe('success')
    expect(resolveDsrStatusTone('fulfilled')).toBe('success')
    expect(resolveDsrStatusTone('rejected')).toBe('danger')
    expect(resolveDsrStatusTone('cancelled')).toBe('neutral')
  })
})

describe('resolveRetentionViewState', () => {
  it('loading when no retention and no error', () => {
    expect(resolveRetentionViewState({ error: null, retention: null })).toBe('loading')
  })
  it('maps first-load 401/403/other to unauthenticated/forbidden/error', () => {
    expect(
      resolveRetentionViewState({ error: new ApiError(401, 'no session'), retention: null }),
    ).toBe('unauthenticated')
    expect(
      resolveRetentionViewState({ error: new ApiError(403, 'forbidden'), retention: null }),
    ).toBe('forbidden')
    expect(resolveRetentionViewState({ error: new ApiError(500, 'boom'), retention: null })).toBe(
      'error',
    )
    expect(resolveRetentionViewState({ error: { statusCode: 502 }, retention: null })).toBe('error')
  })
  it('ready / empty when retention is present and keeps data on background error', () => {
    expect(resolveRetentionViewState({ error: null, retention })).toBe('ready')
    expect(resolveRetentionViewState({ error: null, retention: emptyRetention })).toBe('empty')
    expect(resolveRetentionViewState({ error: new ApiError(500, 'boom'), retention })).toBe('ready')
  })
})

describe('resolveDsrListViewState', () => {
  it('loading when no list and no error', () => {
    expect(resolveDsrListViewState({ error: null, requests: null })).toBe('loading')
  })
  it('maps first-load 401/403/other to unauthenticated/forbidden/error', () => {
    expect(
      resolveDsrListViewState({ error: new ApiError(401, 'no session'), requests: null }),
    ).toBe('unauthenticated')
    expect(resolveDsrListViewState({ error: new ApiError(403, 'forbidden'), requests: null })).toBe(
      'forbidden',
    )
    expect(resolveDsrListViewState({ error: new ApiError(500, 'boom'), requests: null })).toBe(
      'error',
    )
  })
  it('empty distinct from forbidden; ready when populated; data kept on background error', () => {
    expect(resolveDsrListViewState({ error: null, requests: [] })).toBe('empty')
    expect(resolveDsrListViewState({ error: null, requests: [dsr] })).toBe('ready')
    expect(resolveDsrListViewState({ error: new ApiError(500, 'boom'), requests: [dsr] })).toBe(
      'ready',
    )
  })
})

describe('isComplianceStale', () => {
  it('is true only when an error coexists with prior data (any non-null snapshot)', () => {
    expect(isComplianceStale(new ApiError(500, 'x'), retention)).toBe(true)
    expect(isComplianceStale(new ApiError(500, 'x'), [dsr])).toBe(true)
    expect(isComplianceStale(null, retention)).toBe(false)
    expect(isComplianceStale(new ApiError(500, 'x'), null)).toBe(false)
  })
})
