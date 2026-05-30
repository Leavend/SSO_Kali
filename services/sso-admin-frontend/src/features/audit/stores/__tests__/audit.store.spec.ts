import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ApiError, getLastRequestId } from '@/lib/api/api-client'
import { triggerBlobDownload } from '@/lib/download/trigger-download'
import { auditApi } from '../../services/audit.api'
import { useAuditStore } from '../audit.store'
import type {
  AdminAuditEvent,
  AuthenticationAuditEvent,
  AuditIntegrity,
  DataSubjectRequest,
} from '../../types'

vi.mock('../../services/audit.api', () => ({
  auditApi: {
    listEvents: vi.fn<() => Promise<{ events: readonly AdminAuditEvent[]; pagination?: unknown }>>(),
    showEvent: vi.fn<(eventId: string) => Promise<{ event: AdminAuditEvent }>>(),
    getIntegrity: vi.fn<() => Promise<{ integrity: AuditIntegrity }>>(),
    exportEvents: vi.fn<() => Promise<{ blob: Blob; filename: string | null }>>(),
    listDataSubjectRequests: vi.fn<() => Promise<{ requests: readonly DataSubjectRequest[] }>>(),
    listAuthenticationEvents:
      vi.fn<() => Promise<{ events: readonly AuthenticationAuditEvent[]; pagination?: unknown }>>(),
    showAuthenticationEvent: vi.fn<() => Promise<{ event: AuthenticationAuditEvent }>>(),
    reviewDataSubjectRequest: vi.fn<() => Promise<{ request: DataSubjectRequest }>>(),
    fulfillDataSubjectRequest:
      vi.fn<() => Promise<{ request?: DataSubjectRequest; dry_run?: boolean }>>(),
  },
}))

vi.mock('@/lib/download/trigger-download', () => ({
  triggerBlobDownload: vi.fn<(blob: Blob, filename: string) => void>(),
}))

vi.mock('@/lib/api/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/api-client')>()
  return {
    ...actual,
    getLastRequestId: vi.fn<() => string | null>(() => 'req-audit-1'),
  }
})

const event: AdminAuditEvent = {
  event_id: 'AUD01',
  action: 'admin.user.lock',
  outcome: 'succeeded',
  taxonomy: 'user_lifecycle',
  actor: { subject_id: 'sub_admin', email: 'admin@example.test', role: 'admin' },
  request: { method: 'POST', path: '/admin/api/users/sub_target/lock', ip_address: '203.0.113.10' },
  reason: 'Security review',
  context: { token: '[redacted]', subject_id: 'sub_target' },
  hash_chain: { previous_hash: 'prev-hash', event_hash: 'event-hash' },
  occurred_at: '2026-05-27T00:00:00Z',
}

const authEvent: AuthenticationAuditEvent = {
  event_id: 'AUTH01',
  event_type: 'refresh_token_reuse_detected',
  outcome: 'failed',
  subject: { subject_id: 'sub_target', email: 'target@example.test' },
  client_id: 'prototype-app-a',
  session_id: 'sid-123',
  request: {
    ip_address: '203.0.113.40',
    user_agent: 'Test Browser',
    request_id: 'req-auth-event-1',
  },
  error_code: 'refresh_token_reuse_detected',
  context: { token: '[redacted]', notification: 'queued' },
  occurred_at: '2026-05-27T00:00:00Z',
}

const dsr: DataSubjectRequest = {
  request_id: '01HX7S8Y9ZABCDEF1234567890',
  subject_id: 'sub_target',
  type: 'export',
  status: 'submitted',
  reason: 'Privacy request',
  reviewer_subject_id: null,
  reviewer_notes: null,
  submitted_at: '2026-05-27T00:00:00Z',
  reviewed_at: null,
  fulfilled_at: null,
  sla_due_at: '2026-06-26T00:00:00Z',
}

describe('useAuditStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(auditApi.listEvents).mockReset()
    vi.mocked(auditApi.showEvent).mockReset()
    vi.mocked(auditApi.getIntegrity).mockReset()
    vi.mocked(auditApi.exportEvents).mockReset()
    vi.mocked(auditApi.listDataSubjectRequests).mockReset()
    vi.mocked(auditApi.listAuthenticationEvents).mockReset()
    vi.mocked(auditApi.showAuthenticationEvent).mockReset()
    vi.mocked(auditApi.reviewDataSubjectRequest).mockReset()
    vi.mocked(auditApi.fulfillDataSubjectRequest).mockReset()
    vi.mocked(triggerBlobDownload).mockReset()
    vi.mocked(getLastRequestId).mockReturnValue('req-audit-1')
  })

  it('loads audit, integrity, DSR queues, and request evidence', async () => {
    vi.mocked(auditApi.listEvents).mockResolvedValue({ events: [event] })
    vi.mocked(auditApi.getIntegrity).mockResolvedValue({
      integrity: { verified: true, checked_events: 1 },
    })
    vi.mocked(auditApi.listDataSubjectRequests).mockResolvedValue({ requests: [dsr] })
    vi.mocked(auditApi.listAuthenticationEvents).mockResolvedValue({ events: [authEvent] })
    const store = useAuditStore()

    await store.load()

    expect(store.status).toBe('success')
    expect(store.events).toEqual([event])
    expect(store.integrity?.verified).toBe(true)
    expect(store.dataSubjectRequests).toEqual([dsr])
    expect(store.authenticationEvents).toEqual([authEvent])
    expect(store.requestId).toBe('req-audit-1')
  })

  it('searches audit events with filters and stores pagination evidence', async () => {
    vi.mocked(auditApi.listEvents).mockResolvedValue({
      events: [event],
      pagination: { next_cursor: 'cursor-audit-2', has_more: true },
    })
    const store = useAuditStore()

    await store.searchEvents({
      action: 'admin.user.lock',
      outcome: 'succeeded',
      taxonomy: 'user_lifecycle',
      admin_subject_id: 'admin-1',
      from: '2026-05-01',
      to: '2026-05-30',
    })

    expect(auditApi.listEvents).toHaveBeenCalledWith({
      action: 'admin.user.lock',
      outcome: 'succeeded',
      taxonomy: 'user_lifecycle',
      admin_subject_id: 'admin-1',
      from: '2026-05-01',
      to: '2026-05-30',
      limit: 50,
    })
    expect(store.events).toEqual([event])
    expect(store.selectedEventId).toBe('AUD01')
    expect(store.eventPagination?.next_cursor).toBe('cursor-audit-2')
    expect(store.eventFilters.action).toBe('admin.user.lock')
  })

  it('loads more audit events with the stored cursor and appends results', async () => {
    vi.mocked(auditApi.listEvents).mockResolvedValue({
      events: [{ ...event, event_id: 'AUD02', action: 'admin.user.unlock' }],
      pagination: { next_cursor: null, has_more: false },
    })
    const store = useAuditStore()
    store.events = [event]
    store.eventFilters = { action: 'admin.user.lock', limit: 50 }
    store.eventPagination = { next_cursor: 'cursor-audit-2', has_more: true }

    await store.loadMoreEvents()

    expect(auditApi.listEvents).toHaveBeenCalledWith({
      action: 'admin.user.lock',
      limit: 50,
      cursor: 'cursor-audit-2',
    })
    expect(store.events).toHaveLength(2)
    expect(store.eventPagination?.has_more).toBe(false)
  })

  it('searches authentication audit events with correlation filters', async () => {
    vi.mocked(auditApi.listAuthenticationEvents).mockResolvedValue({
      events: [authEvent],
      pagination: { next_cursor: 'cursor-auth-2', has_more: true },
    })
    const store = useAuditStore()

    await store.searchAuthenticationEvents({
      request_id: 'req-auth-event-1',
      subject_id: 'sub_target',
      session_id: 'sid-123',
      outcome: 'failed',
      from: '2026-05-01',
      to: '2026-05-30',
    })

    expect(auditApi.listAuthenticationEvents).toHaveBeenCalledWith({
      request_id: 'req-auth-event-1',
      subject_id: 'sub_target',
      session_id: 'sid-123',
      outcome: 'failed',
      from: '2026-05-01',
      to: '2026-05-30',
      limit: 25,
    })
    expect(store.authenticationEvents).toEqual([authEvent])
    expect(store.selectedAuthenticationEventId).toBe('AUTH01')
    expect(store.authenticationEventPagination?.next_cursor).toBe('cursor-auth-2')
  })

  it('loads more authentication audit events with the stored cursor', async () => {
    vi.mocked(auditApi.listAuthenticationEvents).mockResolvedValue({
      events: [{ ...authEvent, event_id: 'AUTH02', session_id: 'sid-456' }],
      pagination: { next_cursor: null, has_more: false },
    })
    const store = useAuditStore()
    store.authenticationEvents = [authEvent]
    store.authenticationEventFilters = { request_id: 'req-auth-event-1', limit: 25 }
    store.authenticationEventPagination = { next_cursor: 'cursor-auth-2', has_more: true }

    await store.loadMoreAuthenticationEvents()

    expect(auditApi.listAuthenticationEvents).toHaveBeenCalledWith({
      request_id: 'req-auth-event-1',
      limit: 25,
      cursor: 'cursor-auth-2',
    })
    expect(store.authenticationEvents).toHaveLength(2)
    expect(store.authenticationEventPagination?.has_more).toBe(false)
  })

  it('maps audit search errors to safe copy with request evidence', async () => {
    vi.mocked(auditApi.listEvents).mockRejectedValue(
      new ApiError(500, 'SQLSTATE raw failure', 'server_error', null, 'req-search-fail'),
    )
    const store = useAuditStore()

    await store.searchEvents({ action: 'admin.user.lock' })

    expect(store.status).toBe('error')
    expect(store.errorMessage).toContain('req-search-fail')
    expect(store.errorMessage).not.toContain('SQLSTATE')
  })

  it('loads selected audit event detail', async () => {
    vi.mocked(auditApi.showEvent).mockResolvedValue({ event })
    const store = useAuditStore()

    await store.selectEvent('AUD01')

    expect(store.selectedEvent).toEqual(event)
    expect(auditApi.showEvent).toHaveBeenCalledWith('AUD01')
  })

  it('loads selected authentication event detail', async () => {
    vi.mocked(auditApi.showAuthenticationEvent).mockResolvedValue({ event: authEvent })
    const store = useAuditStore()

    await store.selectAuthenticationEvent('AUTH01')

    expect(store.selectedAuthenticationEvent).toEqual(authEvent)
    expect(auditApi.showAuthenticationEvent).toHaveBeenCalledWith('AUTH01')
  })

  it('reviews DSR and stores audit evidence safely', async () => {
    vi.mocked(auditApi.reviewDataSubjectRequest).mockResolvedValue({
      request: { ...dsr, status: 'approved', reviewer_notes: 'Verified evidence' },
    })
    const store = useAuditStore()
    store.dataSubjectRequests = [dsr]

    await store.reviewRequest(dsr.request_id, 'approved', 'Verified evidence')

    expect(store.dataSubjectRequests[0]?.status).toBe('approved')
    expect(store.requestId).toBe('req-audit-1')
  })

  it('maps forbidden errors to safe copy', async () => {
    vi.mocked(auditApi.listEvents).mockRejectedValue(new ApiError(403, 'SQLSTATE forbidden leak'))
    const store = useAuditStore()

    await store.load()

    expect(store.status).toBe('forbidden')
    expect(store.errorMessage).toBe('Kamu tidak memiliki izin untuk melihat audit compliance.')
    expect(store.errorMessage).not.toContain('SQLSTATE')
  })

  it('maps server errors to safe copy with request evidence', async () => {
    vi.mocked(auditApi.listEvents).mockRejectedValue(
      new ApiError(500, 'Bearer leaked trace', 'server_error', null, 'req-audit-fail'),
    )
    const store = useAuditStore()

    await store.load()

    expect(store.status).toBe('error')
    expect(store.requestId).toBe('req-audit-fail')
    expect(store.errorMessage).toBe(
      'Audit compliance belum bisa dimuat. Coba lagi atau gunakan request ID req-audit-fail untuk investigasi.',
    )
    expect(store.errorMessage).not.toMatch(/Bearer|SQLSTATE/i)
  })

  describe('exportEvents', () => {
    it('downloads the export blob using the backend filename and stores evidence', async () => {
      const blob = new Blob(['action,outcome\n'], { type: 'text/csv' })
      vi.mocked(auditApi.exportEvents).mockResolvedValue({ blob, filename: 'audit-export.csv' })
      const store = useAuditStore()

      await store.exportEvents({ format: 'csv', outcome: 'failed' })

      expect(auditApi.exportEvents).toHaveBeenCalledWith({ format: 'csv', outcome: 'failed' })
      expect(triggerBlobDownload).toHaveBeenCalledWith(blob, 'audit-export.csv')
      expect(store.actionStatus).toBe('success')
      expect(store.requestId).toBe('req-audit-1')
    })

    it('falls back to a format-derived filename when backend omits one', async () => {
      const blob = new Blob(['{}\n'], { type: 'application/x-ndjson' })
      vi.mocked(auditApi.exportEvents).mockResolvedValue({ blob, filename: null })
      const store = useAuditStore()

      await store.exportEvents({ format: 'jsonl' })

      expect(triggerBlobDownload).toHaveBeenCalledWith(blob, expect.stringMatching(/\.jsonl$/))
      expect(store.actionStatus).toBe('success')
    })

    it('maps step-up 428 to a re-authentication prompt without downloading', async () => {
      vi.mocked(auditApi.exportEvents).mockRejectedValue(
        new ApiError(428, 'raw ACR trace', 'fresh_auth_required', null, 'req-export-step'),
      )
      const store = useAuditStore()

      await store.exportEvents({ format: 'csv' })

      expect(triggerBlobDownload).not.toHaveBeenCalled()
      expect(store.actionStatus).toBe('step_up_required')
      expect(store.requestId).toBe('req-export-step')
      expect(store.errorMessage).toContain('re-autentikasi')
      expect(store.errorMessage).not.toContain('raw ACR')
    })
  })
})
