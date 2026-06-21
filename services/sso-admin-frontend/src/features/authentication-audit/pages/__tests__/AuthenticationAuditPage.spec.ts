import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import AuthenticationAuditPage from '../AuthenticationAuditPage.vue'
import { useAuthAuditStore } from '../../stores/auth-audit.store'
import { useI18n } from '@/composables/useI18n'

vi.mock('../../services/auth-audit.api', () => ({
  authAuditApi: {
    listEvents: vi.fn<() => Promise<unknown>>(),
    showEvent: vi.fn<() => Promise<unknown>>(),
  },
}))

const mockEvent = {
  event_id: 'EVT-001',
  event_type: 'login',
  outcome: 'succeeded',
  subject: { subject_id: 'sub-user-1', email: 'user@example.test' },
  client_id: 'sso-portal',
  session_id: 'sid-abc-123',
  request: {
    ip_address: '127.0.0.1',
    request_id: 'req-xyz-789',
    user_agent: 'Mozilla/5.0 Chrome/120',
  },
  error_code: null,
  occurred_at: '2026-06-01T10:00:00Z',
  context: {
    tenant: 'default',
  },
}

const maskedIdentifierEvent = {
  ...mockEvent,
  event_id: 'EVT-UUID-001',
  subject: {
    subject_id: 'cb36675a-b0f3-4494-9987-6a6901020304',
    email: null,
  },
  client_id: 'sso-admin-panel',
  session_id: '550e8400-e29b-41d4-a716-446655440000',
  request: {
    ...mockEvent.request,
    request_id: '0194f2b6-8a5e-7c30-b8f1-2d4c6e9a1122',
  },
}

describe('AuthenticationAuditPage', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()

    // Mock navigator.clipboard
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn<() => Promise<void>>().mockImplementation(() => Promise.resolve()),
      },
    })
  })

  it('renders page layout and title correctly', () => {
    const store = useAuthAuditStore()
    store.events = [mockEvent]
    store.status = 'success'

    const wrapper = mount(AuthenticationAuditPage)

    expect(wrapper.text()).toContain('Authentication Audit')
    expect(wrapper.find('.auth-audit-layout').exists()).toBe(true)
    expect(wrapper.find('.auth-audit-sidebar').exists()).toBe(true)
  })

  it('renders loading state when store status is loading', () => {
    const store = useAuthAuditStore()
    store.status = 'loading'

    const wrapper = mount(AuthenticationAuditPage)

    expect(wrapper.text()).toContain('Loading authentication audit')
  })

  it('renders forbidden state when store status is forbidden', () => {
    const store = useAuthAuditStore()
    store.status = 'forbidden'
    store.errorMessage = 'Akses ditolak.'

    const wrapper = mount(AuthenticationAuditPage)

    expect(wrapper.text()).toContain('Access denied')
    expect(wrapper.text()).toContain('Akses ditolak.')
  })

  it('renders empty state when there are no events', () => {
    const store = useAuthAuditStore()
    store.events = []
    store.status = 'success'

    const wrapper = mount(AuthenticationAuditPage)

    expect(wrapper.text()).toContain('No authentication events yet')
  })

  it('renders audit events in the list sidebar', () => {
    const store = useAuthAuditStore()
    store.events = [mockEvent]
    store.status = 'success'

    const wrapper = mount(AuthenticationAuditPage)

    expect(wrapper.text()).toContain('login')
    expect(wrapper.text()).toContain('succeeded')
    expect(wrapper.text()).toContain('user@example.test')
  })

  it('shows request code as the default filter and expands advanced filters', async () => {
    const store = useAuthAuditStore()
    store.events = [mockEvent]
    store.status = 'success'

    const wrapper = mount(AuthenticationAuditPage)

    expect(wrapper.find('.filters-toggle-btn').attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('#auth-audit-request-id').exists()).toBe(true)
    expect(wrapper.find('.filters-content').attributes('style')).toContain('display: none')

    await wrapper.find('.filters-toggle-btn').trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.filters-toggle-btn').attributes('aria-expanded')).toBe('true')
    expect(wrapper.find('.filters-content').attributes('style')).not.toContain('display: none')
    expect(wrapper.find('#auth-audit-error-code').exists()).toBe(true)
    expect(wrapper.find('#auth-audit-consent-action').exists()).toBe(true)
  })

  it('submits maximal authentication audit filters', async () => {
    const store = useAuthAuditStore()
    store.events = [mockEvent]
    store.status = 'success'
    const searchSpy = vi.spyOn(store, 'search').mockResolvedValue(undefined)

    const wrapper = mount(AuthenticationAuditPage)

    await wrapper.find('#auth-audit-request-id').setValue('req-abc-123')
    await wrapper.find('.filters-toggle-btn').trigger('click')
    await wrapper.find('#auth-audit-error-code').setValue('invalid_credentials')
    await wrapper.find('#auth-audit-consent-action').setValue('revoke')
    await wrapper.find('.auth-audit-search-button').trigger('click')

    expect(searchSpy).toHaveBeenCalledWith({
      request_id: 'req-abc-123',
      error_code: 'invalid_credentials',
      consent_action: 'revoke',
    })
  })

  it('resets maximal authentication audit filters', async () => {
    const store = useAuthAuditStore()
    store.events = [mockEvent]
    store.status = 'success'
    const searchSpy = vi.spyOn(store, 'search').mockResolvedValue(undefined)

    const wrapper = mount(AuthenticationAuditPage)

    await wrapper.find('#auth-audit-request-id').setValue('req-abc-123')
    await wrapper.find('.filters-toggle-btn').trigger('click')
    await wrapper.find('#auth-audit-error-code').setValue('invalid_credentials')
    await wrapper.find('#auth-audit-consent-action').setValue('deny')
    await wrapper.find('.auth-audit-reset-button').trigger('click')

    await wrapper.vm.$nextTick()

    expect(searchSpy).toHaveBeenCalledWith({})
    expect((wrapper.find('#auth-audit-request-id').element as HTMLInputElement).value).toBe('')
    expect((wrapper.find('#auth-audit-error-code').element as HTMLInputElement).value).toBe('')
    expect((wrapper.find('#auth-audit-consent-action').element as HTMLSelectElement).value).toBe('')
  })

  it('triggers store.selectEvent when audit event card is clicked', async () => {
    const store = useAuthAuditStore()
    store.events = [mockEvent]
    store.status = 'success'
    const selectSpy = vi.spyOn(store, 'selectEvent')

    const wrapper = mount(AuthenticationAuditPage)
    await wrapper.find('.event-card-item__select').trigger('click')

    expect(selectSpy).toHaveBeenCalledWith('EVT-001')
  })

  it('renders detailed view of selected event', () => {
    const store = useAuthAuditStore()
    store.events = [mockEvent]
    store.selectedEventDetail = mockEvent
    store.selectedEventId = 'EVT-001'
    store.status = 'success'

    const wrapper = mount(AuthenticationAuditPage)

    expect(wrapper.find('.auth-audit-detail').exists()).toBe(true)
    expect(wrapper.text()).toContain('Event Detail')
    expect(wrapper.text()).toContain('REF-IDABC123')
    expect(wrapper.text()).toContain('REF-EQXYZ789')
    expect(wrapper.text()).not.toContain('sid-abc-123')
    expect(wrapper.text()).not.toContain('req-xyz-789')
    expect(wrapper.text()).toContain('Mozilla/5.0 Chrome/120')
  })

  it('allows copying selected Event ID to clipboard', async () => {
    const store = useAuthAuditStore()
    store.events = [mockEvent]
    store.selectedEventDetail = mockEvent
    store.selectedEventId = 'EVT-001'
    store.status = 'success'

    const wrapper = mount(AuthenticationAuditPage)
    await wrapper.find('.copy-btn').trigger('click')

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('REF-EVT001')
  })

  it('copies displayed references instead of raw identifiers from event details', async () => {
    const store = useAuthAuditStore()
    store.events = [maskedIdentifierEvent]
    store.selectedEventDetail = maskedIdentifierEvent
    store.selectedEventId = 'EVT-UUID-001'
    store.status = 'success'

    const wrapper = mount(AuthenticationAuditPage)

    await wrapper.find('[data-testid="copy-subject-id"]').trigger('click')
    await wrapper.find('[data-testid="copy-client-id"]').trigger('click')
    await wrapper.find('[data-testid="copy-session-id"]').trigger('click')
    await wrapper.find('[data-testid="copy-request-id"]').trigger('click')

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('REF-01020304')
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('SSO Admin Panel')
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('REF-55440000')
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('REF-6E9A1122')
    expect(navigator.clipboard.writeText).not.toHaveBeenCalledWith(
      'cb36675a-b0f3-4494-9987-6a6901020304',
    )
    expect(navigator.clipboard.writeText).not.toHaveBeenCalledWith(
      '550e8400-e29b-41d4-a716-446655440000',
    )
  })

  it('filters by displayed reference values instead of raw identifiers from event details', async () => {
    const store = useAuthAuditStore()
    store.events = [maskedIdentifierEvent]
    store.selectedEventDetail = maskedIdentifierEvent
    store.selectedEventId = 'EVT-UUID-001'
    store.status = 'success'
    const searchSpy = vi.spyOn(store, 'search').mockResolvedValue(undefined)

    const wrapper = mount(AuthenticationAuditPage)

    await wrapper.find('[data-testid="filter-subject-id"]').trigger('click')

    expect((wrapper.find('#auth-audit-subject-id').element as HTMLInputElement).value).toBe(
      'REF-01020304',
    )
    expect(searchSpy).toHaveBeenLastCalledWith({ subject_id: 'REF-01020304' })
    expect(searchSpy).not.toHaveBeenCalledWith({
      subject_id: 'cb36675a-b0f3-4494-9987-6a6901020304',
    })

    await wrapper.find('[data-testid="filter-client-id"]').trigger('click')

    expect((wrapper.find('#auth-audit-client-id').element as HTMLInputElement).value).toBe(
      'SSO Admin Panel',
    )
    expect(searchSpy).toHaveBeenLastCalledWith({
      subject_id: 'REF-01020304',
      client_id: 'SSO Admin Panel',
    })
  })

  it('shows applied filter chips when collapsed and removes a chip by resubmitting remaining filters', async () => {
    const store = useAuthAuditStore()
    store.events = [mockEvent]
    store.status = 'success'
    const searchSpy = vi.spyOn(store, 'search').mockImplementation(async (filters) => {
      store.filters = { ...filters, limit: 50 }
    })

    const wrapper = mount(AuthenticationAuditPage)

    await wrapper.find('.filters-toggle-btn').trigger('click')
    await wrapper.find('#auth-audit-subject-id').setValue('REF-01020304')
    await wrapper.find('#auth-audit-outcome').setValue('succeeded')
    await wrapper.find('#auth-audit-request-id').setValue('REF-6E9A1122')
    await wrapper.find('.auth-audit-search-button').trigger('click')
    await wrapper.vm.$nextTick()

    await wrapper.find('.filters-toggle-btn').trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.active-filter-count').text()).toBe('3')
    expect(wrapper.text()).toContain('Account code: REF-01020304')
    expect(wrapper.text()).toContain('Outcome: Success')
    expect(wrapper.text()).toContain('Request code: REF-6E9A1122')
    expect(wrapper.find('.filters-primary #auth-audit-request-id').exists()).toBe(false)

    await wrapper.find('[data-testid="remove-filter-subject-id"]').trigger('click')

    expect((wrapper.find('#auth-audit-subject-id').element as HTMLInputElement).value).toBe('')
    expect(searchSpy).toHaveBeenLastCalledWith({
      request_id: 'REF-6E9A1122',
      outcome: 'succeeded',
    })
  })

  it('keeps collapsed chips tied to applied filters rather than unsent draft edits', async () => {
    const store = useAuthAuditStore()
    store.events = [mockEvent]
    store.status = 'success'
    store.filters = { request_id: 'REF-6E9A1122', limit: 50 }

    const wrapper = mount(AuthenticationAuditPage)

    await wrapper.find('.filters-toggle-btn').trigger('click')
    await wrapper.find('#auth-audit-subject-id').setValue('REF-DRAFT123')
    await wrapper.find('.filters-toggle-btn').trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('Request code: REF-6E9A1122')
    expect(wrapper.text()).not.toContain('REF-DRAFT123')
  })

  it('shows layout selected state indicator classes', () => {
    const store = useAuthAuditStore()
    store.events = [mockEvent]
    store.status = 'success'

    const wrapperWithoutSelection = mount(AuthenticationAuditPage)
    expect(wrapperWithoutSelection.find('.auth-audit-layout--has-selection').exists()).toBe(false)

    store.selectedEventId = 'EVT-001'
    const wrapperWithSelection = mount(AuthenticationAuditPage)
    expect(wrapperWithSelection.find('.auth-audit-layout--has-selection').exists()).toBe(true)
  })
})
