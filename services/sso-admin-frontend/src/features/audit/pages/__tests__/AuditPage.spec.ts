import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useSessionStore } from '@/stores/session.store'
import AuditPage from '../AuditPage.vue'
import { useAuditStore } from '../../stores/audit.store'
import type { AdminAuditEvent, AuthenticationAuditEvent, DataSubjectRequest } from '../../types'
import { useDateFormat } from '@/composables/useDateFormat'

// Import tabs and dialogs for stubbing and component finding
import AuditLogsTab from '../../components/AuditLogsTab.vue'
import EvidenceContextPanel from '@/components/EvidenceContextPanel.vue'
import UiDialog from '@/components/ui/UiDialog.vue'

vi.mock('../../services/audit.api', () => ({
  auditApi: {
    listEvents: vi.fn<() => Promise<unknown>>(),
    showEvent: vi.fn<() => Promise<unknown>>(),
    getIntegrity: vi.fn<() => Promise<unknown>>(),
    getRetentionStatus: vi.fn<() => Promise<unknown>>(),
    exportEvents: vi.fn<() => Promise<unknown>>(),
    generateEvidencePack: vi.fn<() => Promise<unknown>>(),
    listDataSubjectRequests: vi.fn<() => Promise<unknown>>(),
    listAuthenticationEvents: vi.fn<() => Promise<unknown>>(),
    showAuthenticationEvent: vi.fn<() => Promise<unknown>>(),
    reviewDataSubjectRequest: vi.fn<() => Promise<unknown>>(),
    fulfillDataSubjectRequest: vi.fn<() => Promise<unknown>>(),
  },
}))

const routeState = vi.hoisted(() => ({ query: {} as Record<string, unknown> }))

vi.mock('vue-router', () => ({
  useRoute: () => routeState,
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

const retentionStatus = {
  generated_at: '2026-05-31T00:00:00Z',
  items: [
    {
      category: 'authentication_audit_events',
      label: 'Authentication audit events',
      window: { days: 90 },
      cutoff: '2026-03-02T00:00:00Z',
      schedule: 'daily',
      candidate_count: 3,
      last_pruned_at: '2026-05-31T00:10:00Z',
      last_pruned_count: 12,
    },
  ],
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

async function mountAuditPage() {
  const wrapper = mount(AuditPage, {
    global: {
      stubs: {
        EvidenceContextPanel,
        UiDialog,
      },
    },
  })
  const start = Date.now()
  while (Date.now() - start < 1000) {
    await wrapper.vm.$nextTick()
    await flushPromises()
    const txt = wrapper.text()
    if (
      txt.includes('Search audit events') ||
      txt.includes('Audit access denied') ||
      txt.includes('Audit compliance could not be loaded')
    ) {
      return wrapper
    }
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  return wrapper
}

async function switchTab(wrapper: any, index: number, checkText: string) {
  await wrapper.findAll('button.audit-tab-btn')[index]!.trigger('click')
  const start = Date.now()
  while (Date.now() - start < 1000) {
    await wrapper.vm.$nextTick()
    await flushPromises()
    if (wrapper.text().includes(checkText)) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

describe('AuditPage', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    routeState.query = {}
    seedFullAccessPrincipal()
  })

  it('renders audit evidence, integrity, DSR queue, and request ID', async () => {
    const store = useAuditStore()
    store.status = 'success'
    store.events = [event]
    store.integrity = { verified: true, checked_events: 1 }
    store.retentionStatus = retentionStatus
    store.dataSubjectRequests = [dsr]
    store.authenticationEvents = [authEvent]
    store.selectedAuthenticationEventId = 'AUTH01'
    store.requestId = 'req-audit-1'

    const wrapper = await mountAuditPage()

    expect(wrapper.text()).toContain('Audit Compliance')
    expect(wrapper.text()).toContain('REF-AUD01')
    expect(wrapper.text()).toContain('admin.user.lock')

    // Switch to Security Notification tab
    await switchTab(wrapper, 1, 'Security notification evidence')
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

    // Switch to Reports tab
    await switchTab(wrapper, 2, 'Export Audit Trail')
    expect(wrapper.text()).toContain('Export Audit Trail')
    expect(wrapper.text()).toContain('Compliance Evidence Pack')

    // Switch to Retention tab
    await switchTab(wrapper, 3, 'Retention status')
    expect(wrapper.text()).toContain('Integrity verified')
    expect(wrapper.text()).toContain('Retention status')
    expect(wrapper.text()).toContain('90 hari')
    expect(wrapper.text()).toContain('Authentication audit events')
    const dateFormat = useDateFormat()
    expect(wrapper.text()).toContain(dateFormat.smart('2026-05-31T00:10:00Z'))
    expect(wrapper.text()).toContain('12')
    expect(wrapper.text()).toContain('3')

    // Switch to DSR tab
    await switchTab(wrapper, 4, 'REF-34567890')
    expect(wrapper.text()).toContain('REF-34567890')
    expect(wrapper.text()).not.toContain('01HX7S8Y9ZABCDEF1234567890')

    // Shared labels
    expect(wrapper.text()).toContain('Audit evidence context')
    expect(wrapper.text()).toContain('Kode referensi')
    expect(wrapper.text()).toContain('REF-EQAUDIT1')
    expect(wrapper.text()).not.toContain('req-audit-1')
    expect(wrapper.text()).toContain('Correlation')
    expect(wrapper.text()).toContain('Session')
    expect(wrapper.text()).not.toMatch(/Bearer|refreshToken|SQLSTATE/i)
  })

  it('renders safe forbidden state', async () => {
    const store = useAuditStore()
    store.status = 'forbidden'
    store.errorMessage = 'Kamu tidak memiliki izin untuk melihat audit compliance.'

    const wrapper = await mountAuditPage()

    expect(wrapper.text()).toContain('Audit access denied')
    expect(wrapper.text()).not.toContain('SQLSTATE')
  })

  it('renders safe error state with request evidence', async () => {
    const store = useAuditStore()
    store.status = 'error'
    store.requestId = 'req-audit-fail'
    store.errorMessage =
      'Audit compliance belum bisa dimuat. Coba lagi atau gunakan request ID req-audit-fail untuk investigasi.'

    const wrapper = await mountAuditPage()

    expect(wrapper.text()).toContain('Audit compliance could not be loaded')
    expect(wrapper.text()).toContain('REF-UDITFAIL')
    expect(wrapper.text()).not.toContain('req-audit-fail')
    expect(wrapper.text()).not.toMatch(/Bearer|SQLSTATE/i)
  })

  it('keeps the audit workspace available when audit evidence is not available yet', async () => {
    const store = useAuditStore()
    store.status = 'success'
    store.events = []
    store.dataSubjectRequests = []
    store.authenticationEvents = []
    store.integrity = null

    const wrapper = await mountAuditPage()

    expect(wrapper.text()).toContain('Search audit events')
    expect(wrapper.text()).toContain('No audit events yet.')
    expect(wrapper.text()).toContain('Choose All, Allow, Deny, or Revoke')
    expect(wrapper.find('[data-test="audit-consent-idle-prompt"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('No consent events match the selected filter.')
    expect(wrapper.find('.ui-empty-state').exists()).toBe(false)
  })

  it('renders the consent table when consent evidence is the only loaded slice', async () => {
    const store = useAuditStore()
    store.status = 'success'
    store.events = []
    store.authenticationEvents = []
    store.consentEvents = [{ ...authEvent, event_id: 'CONSENT01', event_type: 'consent_decision' }]
    store.dataSubjectRequests = []
    store.integrity = null

    const wrapper = await mountAuditPage()

    expect(wrapper.text()).toContain('Consent event table')
    expect(wrapper.find('.ui-empty-state').exists()).toBe(false)
  })

  it('renders static audit controls immediately while reserving loading table space', async () => {
    const store = useAuditStore()
    store.status = 'loading'

    const wrapper = await mountAuditPage()

    expect(wrapper.text()).toContain('Search audit events')
    expect(wrapper.text()).toContain('Correlation / request code')
    expect(wrapper.get('input[name="audit-search-request-id"]').isVisible()).toBe(true)
    expect(wrapper.get('input[name="audit-search-action"]').isVisible()).toBe(true)
    expect(wrapper.get('input[name="audit-search-outcome"]').isVisible()).toBe(true)
    expect(wrapper.find('button.audit-advanced-filter-button').exists()).toBe(true)
    expect(wrapper.find('button.consent-filter-all-button').exists()).toBe(true)
    expect(wrapper.find('.audit-tabs-container').exists()).toBe(true)
    expect(wrapper.find('[data-test="audit-loading-search-shell"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="audit-consent-idle-prompt"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-test="audit-loading-table-shell"]')).toHaveLength(1)
    expect(wrapper.findAll('.audit-table-skeleton__row')).toHaveLength(4)
    expect(wrapper.find('.audit-table-empty-state').exists()).toBe(false)
    expect(wrapper.text()).not.toMatch(/Bearer|refreshToken|SQLSTATE/i)

    store.status = 'forbidden'
    store.errorMessage = 'Kamu tidak memiliki izin untuk melihat audit compliance.'
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.ui-status-view').exists()).toBe(true)

    store.status = 'success'
    store.events = [event]
    store.authenticationEvents = [authEvent]
    store.integrity = { verified: true, checked_events: 1 }
    await wrapper.vm.$nextTick()
    const start = Date.now()
    while (Date.now() - start < 1000) {
      await wrapper.vm.$nextTick()
      await flushPromises()
      if (wrapper.find('.ui-data-list').exists()) {
        break
      }
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    expect(wrapper.find('.ui-data-list').exists()).toBe(true)
    expect(wrapper.find('.ui-form-field').exists()).toBe(true)
    expect(wrapper.find('.ui-control').exists()).toBe(true)
  })

  it('keeps static audit controls usable when a section fails', async () => {
    const store = useAuditStore()
    store.status = 'partial'
    store.events = [event]
    store.authenticationEvents = [authEvent]
    store.sections.events = {
      status: 'error',
      error: 'Admin audit events failed to load.',
      requestId: 'req-events-failed',
    }

    const wrapper = await mountAuditPage()

    expect(wrapper.text()).toContain('Search audit events')
    expect(wrapper.text()).toContain('Admin audit events failed to load.')
    expect(wrapper.find('button.audit-search-button').exists()).toBe(true)
    expect(wrapper.find('.ui-data-list').exists()).toBe(true)
  })

  it('renders audit search controls for incident correlation', async () => {
    const store = useAuditStore()
    store.status = 'success'
    store.events = [event]
    store.authenticationEvents = [authEvent]
    store.integrity = { verified: true, checked_events: 1 }

    const wrapper = await mountAuditPage()

    expect(wrapper.text()).toContain('Search audit events')
    expect(wrapper.text()).toContain('Correlation / request code')
    expect(wrapper.text()).toContain('Session code')
    expect(wrapper.text()).toContain('Action')
    expect(wrapper.text()).toContain('Outcome')
    expect(wrapper.text()).toContain('Taxonomy')
    expect(wrapper.text()).toContain('Admin code')
    expect(wrapper.text()).toContain('Account code')
    expect(wrapper.text()).toContain('Application')
    expect(wrapper.text()).toContain('Search')
    expect(wrapper.text()).toContain('Reset')
  })

  it('keeps advanced audit filters collapsed by default without dropping their values', async () => {
    const store = useAuditStore()
    store.status = 'success'
    store.events = [event]
    store.authenticationEvents = [authEvent]
    store.integrity = { verified: true, checked_events: 1 }
    const searchAuthSpy = vi.spyOn(store, 'searchAuthenticationEvents').mockResolvedValue()

    const wrapper = await mountAuditPage()

    expect(wrapper.get('input[name="audit-search-request-id"]').isVisible()).toBe(true)
    expect(wrapper.get('input[name="audit-search-action"]').isVisible()).toBe(true)
    expect(wrapper.get('input[name="audit-search-outcome"]').isVisible()).toBe(true)

    const logsTab = wrapper.findComponent(AuditLogsTab)
    const advancedFiltersGrid = logsTab.findAll('.audit-filter-grid')[1]!
    expect(advancedFiltersGrid.attributes('style')).toContain('display: none')

    await logsTab.find('button.audit-advanced-filter-button').trigger('click')
    await wrapper.vm.$nextTick()
    await flushPromises()
    expect(advancedFiltersGrid.attributes('style') || '').not.toContain('display: none')

    await wrapper.find('input[name="audit-search-session-id"]').setValue('sid-advanced')
    await wrapper.get('button.audit-advanced-filter-button').trigger('click')
    await wrapper.find('button.audit-search-button').trigger('click')

    expect(searchAuthSpy).toHaveBeenCalledWith(
      expect.objectContaining({ session_id: 'sid-advanced' }),
    )
  })

  it('opens audit event details in a shared dialog instead of an inline detail pane', async () => {
    const store = useAuditStore()
    store.status = 'success'
    store.events = [event]
    store.authenticationEvents = [authEvent]
    store.integrity = { verified: true, checked_events: 1 }

    const wrapper = await mountAuditPage()

    expect(wrapper.find('.audit-master-detail').exists()).toBe(false)
    expect(wrapper.find('[data-dialog-id="audit-event-detail-dialog"]').exists()).toBe(false)

    await wrapper.find('button').trigger('click')
    const viewButtons = wrapper.findAll('button').filter((button) => button.text() === 'View')
    await viewButtons[0]?.trigger('click')
    const start = Date.now()
    while (Date.now() - start < 1000) {
      await wrapper.vm.$nextTick()
      await flushPromises()
      if (wrapper.find('[data-dialog-id="audit-event-detail-dialog"]').exists()) {
        break
      }
      await new Promise((resolve) => setTimeout(resolve, 5))
    }

    expect(wrapper.find('[data-dialog-id="audit-event-detail-dialog"]').exists()).toBe(true)
    expect(wrapper.find('.user-modal-overlay.audit-detail-overlay').exists()).toBe(true)
    expect(wrapper.text()).toContain('/admin/api/users/sub_target/lock')
  })

  it('applies the consent quick filter to the dedicated consent audit slice', async () => {
    const store = useAuditStore()
    store.status = 'success'
    store.events = [event]
    store.authenticationEvents = [authEvent]
    store.integrity = { verified: true, checked_events: 1 }
    const searchEventsSpy = vi.spyOn(store, 'searchEvents').mockResolvedValue()
    const searchAuthSpy = vi.spyOn(store, 'searchAuthenticationEvents').mockResolvedValue()
    const searchConsentSpy = vi.spyOn(store, 'searchConsentEvents').mockResolvedValue()

    const wrapper = await mountAuditPage()

    await wrapper.find('input[name="audit-search-subject-id"]').setValue('sub_target')
    await wrapper.find('input[name="audit-search-client-id"]').setValue('prototype-app-a')
    await wrapper.find('button.consent-filter-revoke-button').trigger('click')
    await Promise.resolve()
    await wrapper.vm.$nextTick()
    await flushPromises()

    expect(searchEventsSpy).not.toHaveBeenCalled()
    expect(searchAuthSpy).not.toHaveBeenCalled()
    expect(searchConsentSpy).toHaveBeenCalledWith({
      event_type: 'consent_decision',
      consent_action: 'revoke',
      outcome: 'succeeded',
      subject_id: 'sub_target',
      client_id: 'prototype-app-a',
    })
    expect(wrapper.find('[data-test="audit-consent-idle-prompt"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('No consent events match the selected filter.')
  })

  it('applies consent audit route query from client or user detail links', async () => {
    routeState.query = {
      consent: '1',
      subject_id: 'sub_query',
      client_id: 'client-query',
      consent_action: 'deny',
    }
    const store = useAuditStore()
    store.status = 'success'
    store.events = [event]
    store.authenticationEvents = [authEvent]
    store.integrity = { verified: true, checked_events: 1 }
    const searchEventsSpy = vi.spyOn(store, 'searchEvents').mockResolvedValue()
    const searchAuthSpy = vi.spyOn(store, 'searchAuthenticationEvents').mockResolvedValue()
    const searchConsentSpy = vi.spyOn(store, 'searchConsentEvents').mockResolvedValue()

    const wrapper = await mountAuditPage()
    await Promise.resolve()
    await wrapper.vm.$nextTick()

    expect(searchEventsSpy).not.toHaveBeenCalled()
    expect(searchAuthSpy).not.toHaveBeenCalled()
    expect(searchConsentSpy).toHaveBeenCalledWith({
      event_type: 'consent_decision',
      consent_action: 'deny',
      outcome: 'failed',
      subject_id: 'sub_query',
      client_id: 'client-query',
    })
    expect(wrapper.find('[data-test="audit-consent-idle-prompt"]').exists()).toBe(false)
  })

  it('submits audit and authentication search filters', async () => {
    const store = useAuditStore()
    store.status = 'success'
    store.events = [event]
    store.authenticationEvents = [authEvent]
    store.integrity = { verified: true, checked_events: 1 }
    const searchEventsSpy = vi.spyOn(store, 'searchEvents').mockResolvedValue()
    const searchAuthSpy = vi.spyOn(store, 'searchAuthenticationEvents').mockResolvedValue()

    const wrapper = await mountAuditPage()

    await wrapper.find('input[name="audit-search-request-id"]').setValue('req-auth-event-1')
    await wrapper.find('input[name="audit-search-session-id"]').setValue('sid-123')
    await wrapper.find('input[name="audit-search-action"]').setValue('admin.user.lock')
    await wrapper.find('input[name="audit-search-outcome"]').setValue('failed')
    await wrapper.find('input[name="audit-search-taxonomy"]').setValue('user_lifecycle')
    await wrapper.find('input[name="audit-search-admin-subject-id"]').setValue('admin-1')
    await wrapper.find('input[name="audit-search-subject-id"]').setValue('sub_target')
    await wrapper.find('input[name="audit-search-client-id"]').setValue('prototype-app-a')
    await wrapper.find('input[name="audit-search-from"]').setValue('2026-05-01')
    await wrapper.find('input[name="audit-search-to"]').setValue('2026-05-30')
    await wrapper.find('button.audit-search-button').trigger('click')

    expect(searchEventsSpy).toHaveBeenCalledWith({
      action: 'admin.user.lock',
      outcome: 'failed',
      taxonomy: 'user_lifecycle',
      admin_subject_id: 'admin-1',
      request_id: 'req-auth-event-1',
      from: '2026-05-01',
      to: '2026-05-30',
    })
    expect(searchAuthSpy).toHaveBeenCalledWith({
      request_id: 'req-auth-event-1',
      session_id: 'sid-123',
      subject_id: 'sub_target',
      client_id: 'prototype-app-a',
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

    const wrapper = await mountAuditPage()

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

    const wrapper = await mountAuditPage()

    await wrapper.find('button.audit-load-more-button').trigger('click')

    await switchTab(wrapper, 1, 'Security notification evidence')
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

    const wrapper = await mountAuditPage()

    await switchTab(wrapper, 2, 'Export Audit Trail')

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

    const wrapper = await mountAuditPage()

    await switchTab(wrapper, 2, 'Export Audit Trail')

    await wrapper.find('input[name="export-format"][value="jsonl"]').setValue()
    await wrapper.find('button.audit-export-button').trigger('click')

    expect(exportSpy).toHaveBeenCalledWith(expect.objectContaining({ format: 'jsonl' }))
  })

  it('shows a re-authentication prompt when export requires step-up', async () => {
    const store = useAuditStore()
    store.status = 'success'
    store.events = [event]
    store.integrity = { verified: true, checked_events: 1 }
    store.actionStatus = 'step_up_required'
    store.errorMessage =
      'Aksi audit membutuhkan re-autentikasi (fresh-auth atau MFA assurance). Ulangi login admin lalu coba lagi.'

    const wrapper = await mountAuditPage()

    await switchTab(wrapper, 2, 'Export Audit Trail')

    expect(wrapper.text()).toContain('re-autentikasi')
  })

  it('hides audit export and DSR review actions for read-only principals', async () => {
    seedPrincipal({})
    const store = useAuditStore()
    store.status = 'success'
    store.events = [event]
    store.integrity = { verified: true, checked_events: 1 }
    store.dataSubjectRequests = [dsr]

    const wrapper = await mountAuditPage()

    expect(wrapper.text()).not.toContain('Export')
    expect(wrapper.text()).not.toContain('Approve')
    expect(wrapper.text()).not.toContain('Reject')
    expect(wrapper.text()).not.toContain('Dry-run fulfill')
  })

  it('renders audit export and DSR review actions for matching permissions', async () => {
    seedPrincipal({ 'admin.audit.export': true, 'admin.dsr.review': true })
    const store = useAuditStore()
    store.status = 'success'
    store.events = [event]
    store.integrity = { verified: true, checked_events: 1 }
    store.dataSubjectRequests = [dsr]

    const wrapper = await mountAuditPage()

    await switchTab(wrapper, 2, 'Export Audit Trail')
    expect(wrapper.text()).toContain('Export')

    await switchTab(wrapper, 4, 'DSR queue')
    expect(wrapper.text()).toContain('Approve')
    expect(wrapper.text()).toContain('Reject')
    expect(wrapper.text()).toContain('Dry-run fulfill')
  })

  it('renders the compliance evidence pack generator for permitted principals', async () => {
    const store = useAuditStore()
    store.status = 'success'
    store.events = [event]
    store.integrity = { verified: true, checked_events: 1 }

    const wrapper = await mountAuditPage()

    await switchTab(wrapper, 2, 'Export Audit Trail')

    expect(wrapper.text()).toContain('Compliance Evidence Pack')
    expect(wrapper.find('button.compliance-evidence-pack-button').exists()).toBe(true)
  })

  it('keeps generate disabled until a range or correlation id is set, then calls store.generateEvidencePack', async () => {
    const store = useAuditStore()
    store.status = 'success'
    store.events = [event]
    store.integrity = { verified: true, checked_events: 1 }
    const packSpy = vi.spyOn(store, 'generateEvidencePack').mockResolvedValue()

    const wrapper = await mountAuditPage()

    await switchTab(wrapper, 2, 'Export Audit Trail')

    const button = wrapper.find('button.compliance-evidence-pack-button')
    expect(button.attributes('disabled')).toBeDefined()

    await wrapper.find('input[name="evidence-pack-correlation-id"]').setValue('INC-42')
    expect(button.attributes('disabled')).toBeUndefined()

    await button.trigger('click')

    expect(packSpy).toHaveBeenCalledWith({ format: 'zip', correlation_id: 'INC-42' })
  })

  it('hides the compliance evidence pack generator for principals without audit export permission', async () => {
    seedPrincipal({ 'admin.dsr.review': true })
    const store = useAuditStore()
    store.status = 'success'
    store.events = [event]
    store.integrity = { verified: true, checked_events: 1 }

    const wrapper = await mountAuditPage()

    const reportsTabBtn = wrapper.findAll('button.audit-tab-btn').find(btn => btn.text().includes('Reports'))
    expect(reportsTabBtn).toBeUndefined()
  })
})
