import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import AuthenticationAuditPage from '../AuthenticationAuditPage.vue'
import { useAuthAuditStore } from '../../stores/auth-audit.store'

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
    expect(wrapper.find('#auth-audit-support-reference').exists()).toBe(true)
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
    await wrapper.find('#auth-audit-support-reference').setValue('REF-ABC12345')
    await wrapper.find('#auth-audit-consent-action').setValue('revoke')
    await wrapper.find('.auth-audit-search-button').trigger('click')

    expect(searchSpy).toHaveBeenCalledWith({
      request_id: 'req-abc-123',
      error_code: 'invalid_credentials',
      support_reference: 'REF-ABC12345',
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
    await wrapper.find('#auth-audit-support-reference').setValue('REF-ABC12345')
    await wrapper.find('#auth-audit-consent-action').setValue('deny')
    await wrapper.find('.auth-audit-reset-button').trigger('click')

    await wrapper.vm.$nextTick()

    expect(searchSpy).toHaveBeenCalledWith({})
    expect((wrapper.find('#auth-audit-request-id').element as HTMLInputElement).value).toBe('')
    expect((wrapper.find('#auth-audit-error-code').element as HTMLInputElement).value).toBe('')
    expect((wrapper.find('#auth-audit-support-reference').element as HTMLInputElement).value).toBe('')
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
