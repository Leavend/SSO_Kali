import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useSessionStore } from '@/stores/session.store'
import AuditPage from '../AuditPage.vue'
import { useAuditStore } from '../../stores/audit.store'
import type { AdminAuditEvent, AuthenticationAuditEvent, DataSubjectRequest } from '../../types'

vi.mock('../../services/audit.api', () => ({
  auditApi: {
    listEvents: vi.fn<() => Promise<unknown>>(),
    showEvent: vi.fn<() => Promise<unknown>>(),
    getIntegrity: vi.fn<() => Promise<unknown>>(),
    exportEvents: vi.fn<() => Promise<unknown>>(),
    generateEvidencePack: vi.fn<() => Promise<unknown>>(),
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
  actor: {
    subject_id: 'sub_admin',
    email: 'admin@example.test',
    role: 'admin',
  },
  request: {
    method: 'POST',
    path: '/admin/api/users/sub_target/lock',
    ip_address: '203.0.113.10',
  },
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

function seedPrincipal(capabilities: Record<string, boolean>): void {
  useSessionStore().setPrincipal({
    subject_id: 'admin-1',
    email: 'admin@example.test',
    display_name: 'Admin One',
    role: 'admin',
    last_login_at: null,
    auth_context: {
      auth_time: null,
      amr: [],
      acr: null,
      mfa_enforced: false,
      mfa_verified: false,
    },
    permissions: {
      view_admin_panel: true,
      manage_sessions: capabilities['admin.sessions.terminate'] === true,
      capabilities,
      permissions: Object.keys(capabilities),
      menus: [],
    },
  })
}

function seedFullAccessPrincipal(): void {
  seedPrincipal({
    'admin.audit.export': true,
    'admin.dsr.review': true,
  })
}

describe('AuditPage', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    seedFullAccessPrincipal()
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
    expect(wrapper.text()).toContain('ACR permissive policy (NG-03)')
    expect(wrapper.text()).toContain('Portal/backend observable evidence')
    expect(wrapper.text()).toContain('Consent revocation audit viewer')
    expect(wrapper.text()).toContain('Legacy portal session fallback sunset')
    expect(wrapper.text()).toContain('Token lifetime production guard')
    expect(wrapper.text()).toContain('Session / logout evidence console')
    expect(wrapper.text()).toContain('Safe error regression review')
    expect(wrapper.text()).toContain('Audit evidence context')
    expect(wrapper.text()).toContain('Request ID')
    expect(wrapper.text()).toContain('req-audit-1')
    expect(wrapper.text()).toContain('Correlation ID')
    expect(wrapper.text()).toContain('SID')
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

  it('renders empty state when audit evidence is not available yet', () => {
    const store = useAuditStore()
    store.status = 'success'
    store.events = []
    store.dataSubjectRequests = []
    store.authenticationEvents = []
    store.integrity = null

    const wrapper = mount(AuditPage)

    expect(wrapper.text()).toContain('Belum ada evidence audit untuk ditampilkan.')
  })

  it('renders audit search controls for incident correlation', () => {
    const store = useAuditStore()
    store.status = 'success'
    store.events = [event]
    store.authenticationEvents = [authEvent]
    store.integrity = { verified: true, checked_events: 1 }

    const wrapper = mount(AuditPage)

    expect(wrapper.text()).toContain('Cari audit event')
    expect(wrapper.text()).toContain('Correlation / request ID')
    expect(wrapper.text()).toContain('SID')
    expect(wrapper.text()).toContain('Action')
    expect(wrapper.text()).toContain('Outcome')
    expect(wrapper.text()).toContain('Taxonomy')
    expect(wrapper.text()).toContain('Admin subject')
    expect(wrapper.text()).toContain('Subject ID')
    expect(wrapper.text()).toContain('Search')
    expect(wrapper.text()).toContain('Reset')
  })

  it('submits audit and authentication search filters', async () => {
    const store = useAuditStore()
    store.status = 'success'
    store.events = [event]
    store.authenticationEvents = [authEvent]
    store.integrity = { verified: true, checked_events: 1 }
    const searchEventsSpy = vi.spyOn(store, 'searchEvents').mockResolvedValue()
    const searchAuthSpy = vi.spyOn(store, 'searchAuthenticationEvents').mockResolvedValue()

    const wrapper = mount(AuditPage)

    await wrapper.find('input[name="audit-search-request-id"]').setValue('req-auth-event-1')
    await wrapper.find('input[name="audit-search-session-id"]').setValue('sid-123')
    await wrapper.find('input[name="audit-search-action"]').setValue('admin.user.lock')
    await wrapper.find('input[name="audit-search-outcome"]').setValue('failed')
    await wrapper.find('input[name="audit-search-taxonomy"]').setValue('user_lifecycle')
    await wrapper.find('input[name="audit-search-admin-subject-id"]').setValue('admin-1')
    await wrapper.find('input[name="audit-search-subject-id"]').setValue('sub_target')
    await wrapper.find('input[name="audit-search-from"]').setValue('2026-05-01')
    await wrapper.find('input[name="audit-search-to"]').setValue('2026-05-30')
    await wrapper.find('button.audit-search-button').trigger('click')

    expect(searchEventsSpy).toHaveBeenCalledWith({
      action: 'admin.user.lock',
      outcome: 'failed',
      taxonomy: 'user_lifecycle',
      admin_subject_id: 'admin-1',
      from: '2026-05-01',
      to: '2026-05-30',
    })
    expect(searchAuthSpy).toHaveBeenCalledWith({
      request_id: 'req-auth-event-1',
      session_id: 'sid-123',
      subject_id: 'sub_target',
      outcome: 'failed',
      from: '2026-05-01',
      to: '2026-05-30',
    })
  })

  it('resets audit search filters', async () => {
    const store = useAuditStore()
    store.status = 'success'
    store.events = [event]
    store.authenticationEvents = [authEvent]
    store.integrity = { verified: true, checked_events: 1 }
    const searchEventsSpy = vi.spyOn(store, 'searchEvents').mockResolvedValue()
    const searchAuthSpy = vi.spyOn(store, 'searchAuthenticationEvents').mockResolvedValue()

    const wrapper = mount(AuditPage)

    await wrapper.find('input[name="audit-search-action"]').setValue('admin.user.lock')
    await wrapper.find('button.audit-reset-button').trigger('click')

    expect(searchEventsSpy).toHaveBeenCalledWith({})
    expect(searchAuthSpy).toHaveBeenCalledWith({})
    expect(
      (wrapper.find('input[name="audit-search-action"]').element as HTMLInputElement).value,
    ).toBe('')
  })

  it('loads more audit and authentication events from cursor pagination', async () => {
    const store = useAuditStore()
    store.status = 'success'
    store.events = [event]
    store.authenticationEvents = [authEvent]
    store.integrity = { verified: true, checked_events: 1 }
    store.eventPagination = { next_cursor: 'cursor-audit-2', has_more: true }
    store.authenticationEventPagination = { next_cursor: 'cursor-auth-2', has_more: true }
    const loadMoreEventsSpy = vi.spyOn(store, 'loadMoreEvents').mockResolvedValue()
    const loadMoreAuthSpy = vi.spyOn(store, 'loadMoreAuthenticationEvents').mockResolvedValue()

    const wrapper = mount(AuditPage)

    await wrapper.find('button.audit-load-more-button').trigger('click')
    await wrapper.find('button.authentication-load-more-button').trigger('click')

    expect(loadMoreEventsSpy).toHaveBeenCalled()
    expect(loadMoreAuthSpy).toHaveBeenCalled()
  })

  it('submits the export form and calls store.exportEvents with parsed filters', async () => {
    const store = useAuditStore()
    store.status = 'success'
    store.events = [event]
    store.integrity = { verified: true, checked_events: 1 }
    const exportSpy = vi.spyOn(store, 'exportEvents').mockResolvedValue()

    const wrapper = mount(AuditPage)

    expect(wrapper.text()).toContain('Export Audit Trail')

    await wrapper.find('input[name="export-from"]').setValue('2026-01-01')
    await wrapper.find('input[name="export-to"]').setValue('2026-01-31')
    await wrapper.find('input[name="export-action"]').setValue('admin.user.lock')
    await wrapper.find('input[name="export-outcome"]').setValue('failed')

    await wrapper.find('button.audit-export-button').trigger('click')

    expect(exportSpy).toHaveBeenCalledWith({
      format: 'csv',
      from: '2026-01-01',
      to: '2026-01-31',
      action: 'admin.user.lock',
      outcome: 'failed',
    })
  })

  it('exports as jsonl when the jsonl format radio is selected', async () => {
    const store = useAuditStore()
    store.status = 'success'
    store.events = [event]
    store.integrity = { verified: true, checked_events: 1 }
    const exportSpy = vi.spyOn(store, 'exportEvents').mockResolvedValue()

    const wrapper = mount(AuditPage)

    await wrapper.find('input[name="export-format"][value="jsonl"]').setValue()
    await wrapper.find('button.audit-export-button').trigger('click')

    expect(exportSpy).toHaveBeenCalledWith(expect.objectContaining({ format: 'jsonl' }))
  })

  it('shows a re-authentication prompt when export requires step-up', () => {
    const store = useAuditStore()
    store.status = 'success'
    store.events = [event]
    store.integrity = { verified: true, checked_events: 1 }
    store.actionStatus = 'step_up_required'
    store.errorMessage =
      'Aksi audit membutuhkan re-autentikasi (fresh-auth atau MFA assurance). Ulangi login admin lalu coba lagi.'

    const wrapper = mount(AuditPage)

    expect(wrapper.text()).toContain('re-autentikasi')
  })

  it('hides audit export and DSR review actions for read-only principals', () => {
    seedPrincipal({})
    const store = useAuditStore()
    store.status = 'success'
    store.events = [event]
    store.integrity = { verified: true, checked_events: 1 }
    store.dataSubjectRequests = [dsr]

    const wrapper = mount(AuditPage)

    expect(wrapper.text()).not.toContain('Export')
    expect(wrapper.text()).not.toContain('Approve')
    expect(wrapper.text()).not.toContain('Reject')
    expect(wrapper.text()).not.toContain('Dry-run fulfill')
  })

  it('renders audit export and DSR review actions for matching permissions', () => {
    seedPrincipal({ 'admin.audit.export': true, 'admin.dsr.review': true })
    const store = useAuditStore()
    store.status = 'success'
    store.events = [event]
    store.integrity = { verified: true, checked_events: 1 }
    store.dataSubjectRequests = [dsr]

    const wrapper = mount(AuditPage)

    expect(wrapper.text()).toContain('Export')
    expect(wrapper.text()).toContain('Approve')
    expect(wrapper.text()).toContain('Reject')
    expect(wrapper.text()).toContain('Dry-run fulfill')
  })

  it('renders the compliance evidence pack generator for permitted principals', () => {
    const store = useAuditStore()
    store.status = 'success'
    store.events = [event]
    store.integrity = { verified: true, checked_events: 1 }

    const wrapper = mount(AuditPage)

    expect(wrapper.text()).toContain('Compliance Evidence Pack')
    expect(wrapper.find('button.compliance-evidence-pack-button').exists()).toBe(true)
  })

  it('keeps generate disabled until a range or correlation id is set, then calls store.generateEvidencePack', async () => {
    const store = useAuditStore()
    store.status = 'success'
    store.events = [event]
    store.integrity = { verified: true, checked_events: 1 }
    const packSpy = vi.spyOn(store, 'generateEvidencePack').mockResolvedValue()

    const wrapper = mount(AuditPage)

    const button = wrapper.find('button.compliance-evidence-pack-button')
    expect(button.attributes('disabled')).toBeDefined()

    await wrapper.find('input[name="evidence-pack-correlation-id"]').setValue('INC-42')
    expect(button.attributes('disabled')).toBeUndefined()

    await button.trigger('click')

    expect(packSpy).toHaveBeenCalledWith({ format: 'zip', correlation_id: 'INC-42' })
  })

  it('hides the compliance evidence pack generator for principals without audit export permission', () => {
    seedPrincipal({ 'admin.dsr.review': true })
    const store = useAuditStore()
    store.status = 'success'
    store.events = [event]
    store.integrity = { verified: true, checked_events: 1 }

    const wrapper = mount(AuditPage)

    expect(wrapper.text()).not.toContain('Compliance Evidence Pack')
    expect(wrapper.find('button.compliance-evidence-pack-button').exists()).toBe(false)
  })
})
