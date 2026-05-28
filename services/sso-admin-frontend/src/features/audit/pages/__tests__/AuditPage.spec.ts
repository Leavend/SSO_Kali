import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import AuditPage from '../AuditPage.vue'
import { useAuditStore } from '../../stores/audit.store'
import type { AdminAuditEvent, AuthenticationAuditEvent, DataSubjectRequest } from '../../types'

vi.mock('../../services/audit.api', () => ({
  auditApi: {
    listEvents: vi.fn<() => Promise<unknown>>(),
    showEvent: vi.fn<() => Promise<unknown>>(),
    getIntegrity: vi.fn<() => Promise<unknown>>(),
    listDataSubjectRequests: vi.fn<() => Promise<unknown>>(),
    listAuthenticationEvents: vi.fn<() => Promise<unknown>>(),
    showAuthenticationEvent: vi.fn<() => Promise<unknown>>(),
    reviewDataSubjectRequest: vi.fn<() => Promise<unknown>>(),
    fulfillDataSubjectRequest: vi.fn<() => Promise<unknown>>(),
  },
}))

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

describe('AuditPage', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders audit evidence, integrity, DSR queue, and request ID', () => {
    const store = useAuditStore()
    store.status = 'success'
    store.events = [event]
    store.integrity = { verified: true, checked_events: 1 }
    store.dataSubjectRequests = [dsr]
    store.authenticationEvents = [authEvent]
    store.selectedAuthenticationEventId = 'AUTH01'
    store.requestId = 'req-audit-1'

    const wrapper = mount(AuditPage)

    expect(wrapper.text()).toContain('Audit Compliance')
    expect(wrapper.text()).toContain('AUD01')
    expect(wrapper.text()).toContain('admin.user.lock')
    expect(wrapper.text()).toContain('Integrity verified')
    expect(wrapper.text()).toContain('01HX7S8Y9ZABCDEF1234567890')
    expect(wrapper.text()).toContain('Security notification evidence')
    expect(wrapper.text()).toContain('refresh_token_reuse_detected')
    expect(wrapper.text()).toContain('Suspicious login challenge matrix')
    expect(wrapper.text()).toContain('Unknown ACR policy')
    expect(wrapper.text()).toContain('Request ID: req-audit-1')
    expect(wrapper.text()).not.toMatch(/Bearer|refreshToken|SQLSTATE/i)
  })

  it('renders safe forbidden state', () => {
    const store = useAuditStore()
    store.status = 'forbidden'
    store.errorMessage = 'Kamu tidak memiliki izin untuk melihat audit compliance.'

    const wrapper = mount(AuditPage)

    expect(wrapper.text()).toContain('Akses audit ditolak')
    expect(wrapper.text()).not.toContain('SQLSTATE')
  })

  it('renders safe error state with request evidence', () => {
    const store = useAuditStore()
    store.status = 'error'
    store.requestId = 'req-audit-fail'
    store.errorMessage =
      'Audit compliance belum bisa dimuat. Coba lagi atau gunakan request ID req-audit-fail untuk investigasi.'

    const wrapper = mount(AuditPage)

    expect(wrapper.text()).toContain('Audit compliance belum bisa dimuat')
    expect(wrapper.text()).toContain('req-audit-fail')
    expect(wrapper.text()).not.toMatch(/Bearer|SQLSTATE/i)
  })
})
