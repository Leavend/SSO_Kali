import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ApiError, getLastRequestId } from '@/lib/api/api-client'
import { auditApi } from '../../services/audit.api'
import { useAuditStore } from '../audit.store'
import type { AdminAuditEvent, AuditIntegrity, DataSubjectRequest } from '../../types'

vi.mock('../../services/audit.api', () => ({
  auditApi: {
    listEvents: vi.fn<() => Promise<{ events: readonly AdminAuditEvent[] }>>(),
    showEvent: vi.fn<(eventId: string) => Promise<{ event: AdminAuditEvent }>>(),
    getIntegrity: vi.fn<() => Promise<{ integrity: AuditIntegrity }>>(),
    listDataSubjectRequests: vi.fn<() => Promise<{ requests: readonly DataSubjectRequest[] }>>(),
    reviewDataSubjectRequest: vi.fn<() => Promise<{ request: DataSubjectRequest }>>(),
    fulfillDataSubjectRequest:
      vi.fn<() => Promise<{ request?: DataSubjectRequest; dry_run?: boolean }>>(),
  },
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
    vi.mocked(auditApi.listDataSubjectRequests).mockReset()
    vi.mocked(auditApi.reviewDataSubjectRequest).mockReset()
    vi.mocked(auditApi.fulfillDataSubjectRequest).mockReset()
    vi.mocked(getLastRequestId).mockReturnValue('req-audit-1')
  })

  it('loads audit, integrity, DSR queues, and request evidence', async () => {
    vi.mocked(auditApi.listEvents).mockResolvedValue({ events: [event] })
    vi.mocked(auditApi.getIntegrity).mockResolvedValue({
      integrity: { verified: true, checked_events: 1 },
    })
    vi.mocked(auditApi.listDataSubjectRequests).mockResolvedValue({ requests: [dsr] })
    const store = useAuditStore()

    await store.load()

    expect(store.status).toBe('success')
    expect(store.events).toEqual([event])
    expect(store.integrity?.verified).toBe(true)
    expect(store.dataSubjectRequests).toEqual([dsr])
    expect(store.requestId).toBe('req-audit-1')
  })

  it('loads selected audit event detail', async () => {
    vi.mocked(auditApi.showEvent).mockResolvedValue({ event })
    const store = useAuditStore()

    await store.selectEvent('AUD01')

    expect(store.selectedEvent).toEqual(event)
    expect(auditApi.showEvent).toHaveBeenCalledWith('AUD01')
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
})
