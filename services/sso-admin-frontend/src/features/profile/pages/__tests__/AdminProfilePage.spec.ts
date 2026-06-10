import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import AdminProfilePage from '../AdminProfilePage.vue'
import { useAdminProfileStore } from '../../stores/admin-profile.store'

vi.mock('../../services/profile.api', () => ({
  profileApi: {
    getProfile: vi.fn<() => Promise<unknown>>(),
  },
}))

const mockPrincipal = {
  subject_id: 'admin-001',
  email: 'admin@sso.example.com',
  display_name: 'Administrator User',
  given_name: 'Admin',
  family_name: 'User',
  role: 'admin-role',
  permissions: ['admin.users.read', 'admin.roles.read'],
}

describe('AdminProfilePage', () => {
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
    const store = useAdminProfileStore()
    store.principal = mockPrincipal
    store.status = 'success'

    const wrapper = mount(AdminProfilePage)

    expect(wrapper.text()).toContain('Admin Profile')
    expect(wrapper.find('.admin-profile-layout').exists()).toBe(true)
    expect(wrapper.find('.profile-identity-card').exists()).toBe(true)
  })

  it('renders loading state when store status is loading', () => {
    const store = useAdminProfileStore()
    store.status = 'loading'

    const wrapper = mount(AdminProfilePage)

    expect(wrapper.find('.ui-skeleton').exists()).toBe(true)
    expect(wrapper.text()).toContain('Loading')
  })

  it('renders forbidden state when store status is forbidden', () => {
    const store = useAdminProfileStore()
    store.status = 'forbidden'
    store.errorMessage = 'Forbidden action'

    const wrapper = mount(AdminProfilePage)

    expect(wrapper.text()).toContain('Access denied')
    expect(wrapper.text()).toContain('Forbidden action')
  })

  it('renders unauthenticated state when store status is unauthenticated', () => {
    const store = useAdminProfileStore()
    store.status = 'unauthenticated'
    store.errorMessage = 'Session expired'

    const wrapper = mount(AdminProfilePage)

    expect(wrapper.text()).toContain('Admin session expired')
    expect(wrapper.text()).toContain('Session expired')
  })

  it('renders error state when store status is error', () => {
    const store = useAdminProfileStore()
    store.status = 'error'
    store.errorMessage = 'Server error'

    const wrapper = mount(AdminProfilePage)

    expect(wrapper.text()).toContain('Profile could not be loaded')
    expect(wrapper.text()).toContain('Server error')
  })

  it('renders principal data correctly', () => {
    const store = useAdminProfileStore()
    store.principal = mockPrincipal
    store.status = 'success'

    const wrapper = mount(AdminProfilePage)

    expect(wrapper.find('.profile-display-name').text()).toBe('Admin User')
    expect(wrapper.text()).toContain('admin@sso.example.com')
    expect(wrapper.text()).toContain('REF-ADMIN001')
    expect(wrapper.text()).not.toContain('admin-001')
    expect(wrapper.text()).toContain('Admin')
    expect(wrapper.text()).toContain('User')
    expect(wrapper.text()).toContain('admin-role')
    expect(wrapper.text()).toContain('admin.users.read')
    expect(wrapper.text()).toContain('admin.roles.read')
  })

  it('shows display name as the first given-name word plus first family-name word', () => {
    const store = useAdminProfileStore()
    store.principal = {
      ...mockPrincipal,
      display_name: 'Legacy Display',
      given_name: 'Admin Middle',
      family_name: 'User Family',
    }
    store.status = 'success'

    const wrapper = mount(AdminProfilePage)

    expect(wrapper.find('.profile-display-name').text()).toBe('Admin User')
    expect(wrapper.find('.profile-avatar').text()).toBe('A')
  })

  it('allows copying admin reference to clipboard', async () => {
    const store = useAdminProfileStore()
    store.principal = mockPrincipal
    store.status = 'success'

    const wrapper = mount(AdminProfilePage)
    await wrapper.find('.copy-btn').trigger('click')

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('REF-ADMIN001')
  })
})
