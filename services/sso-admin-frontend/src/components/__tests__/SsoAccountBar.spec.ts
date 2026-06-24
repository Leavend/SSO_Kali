import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import SsoAccountBar from '../SsoAccountBar.vue'
import { useSessionStore } from '@/stores/session.store'
import type { AdminPrincipal } from '@/types/auth.types'
import { ssoAccountWidgetApi } from '@/services/sso-account-widget.api'

vi.mock('@/services/sso-account-widget.api', async () => {
  const actual = await vi.importActual<typeof import('@/services/sso-account-widget.api')>(
    '@/services/sso-account-widget.api',
  )
  return {
    ...actual,
    ssoAccountWidgetApi: {
      apps: vi.fn<typeof actual.ssoAccountWidgetApi.apps>(),
      accounts: vi.fn<typeof actual.ssoAccountWidgetApi.accounts>(),
      switchAccount: vi.fn<typeof actual.ssoAccountWidgetApi.switchAccount>(),
      logout: vi.fn<typeof actual.ssoAccountWidgetApi.logout>(),
    },
  }
})

const principal: AdminPrincipal = {
  subject_id: 'sub-admin',
  email: 'admin@example.com',
  display_name: 'Admin Example',
  role: 'admin',
  last_login_at: null,
  auth_context: {
    auth_time: null,
    amr: ['pwd', 'mfa'],
    acr: 'urn:loa:2',
    mfa_enforced: true,
    mfa_verified: true,
  },
  permissions: {
    view_admin_panel: true,
    manage_sessions: false,
    permissions: ['profile.read'],
    capabilities: { 'profile.read': true },
    menus: [],
  },
}

describe('SsoAccountBar', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    useSessionStore().setPrincipal(principal)
    vi.mocked(ssoAccountWidgetApi.apps).mockReset()
    vi.mocked(ssoAccountWidgetApi.accounts).mockReset()
    vi.mocked(ssoAccountWidgetApi.switchAccount).mockReset()
    vi.mocked(ssoAccountWidgetApi.logout).mockReset()
  })

  it('renders app launcher and account menu from the admin principal', async () => {
    vi.mocked(ssoAccountWidgetApi.accounts).mockResolvedValueOnce([])
    const wrapper = mount(SsoAccountBar, {
      global: { stubs: { RouterLink: { template: '<a href="/profile"><slot /></a>' } } },
    })

    expect(wrapper.find('[data-testid="sso-account-apps-trigger"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="sso-account-menu-trigger"]').text()).toBe('A')

    await wrapper.get('[data-testid="sso-account-menu-trigger"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="sso-account-menu"]').text()).toContain('Admin Example')
    expect(wrapper.get('[data-testid="sso-account-menu"]').text()).toContain('admin@example.com')
    expect(wrapper.get('[data-testid="sso-account-menu"]').text()).toContain('Kelola Akun')
  })

  it('keeps widget app failures stable without hiding the principal avatar', async () => {
    vi.mocked(ssoAccountWidgetApi.apps).mockRejectedValue(new Error('cors'))
    const wrapper = mount(SsoAccountBar, {
      global: { stubs: { RouterLink: true } },
    })

    await wrapper.get('[data-testid="sso-account-apps-trigger"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="sso-account-menu-trigger"]').text()).toBe('A')
    expect(wrapper.get('[data-testid="sso-account-apps-menu"]').text()).toContain(
      'Gagal memuat aplikasi.',
    )

    await wrapper.get('[data-testid="sso-account-apps-trigger"]').trigger('click')
    await wrapper.get('[data-testid="sso-account-apps-trigger"]').trigger('click')
    await flushPromises()

    expect(ssoAccountWidgetApi.apps).toHaveBeenCalledTimes(1)
    expect(wrapper.get('[data-testid="sso-account-apps-menu"]').text()).toContain(
      'Gagal memuat aplikasi.',
    )
  })

  it('keeps widget account failures stable without hiding the principal identity', async () => {
    vi.mocked(ssoAccountWidgetApi.accounts).mockRejectedValue(new Error('cors'))
    const wrapper = mount(SsoAccountBar, {
      global: { stubs: { RouterLink: { template: '<a href="/profile"><slot /></a>' } } },
    })

    await wrapper.get('[data-testid="sso-account-menu-trigger"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="sso-account-menu"]').text()).toContain('Admin Example')
    expect(wrapper.get('[data-testid="sso-account-menu"]').text()).toContain('Gagal memuat akun.')

    await wrapper.get('[data-testid="sso-account-menu-trigger"]').trigger('click')
    await wrapper.get('[data-testid="sso-account-menu-trigger"]').trigger('click')
    await flushPromises()

    expect(ssoAccountWidgetApi.accounts).toHaveBeenCalledTimes(1)
    expect(wrapper.get('[data-testid="sso-account-menu"]').text()).toContain('Gagal memuat akun.')
  })

  it('renders only web-scheme app launcher links', async () => {
    vi.mocked(ssoAccountWidgetApi.apps).mockResolvedValueOnce([
      {
        client_id: 'portal',
        display_name: 'Portal',
        app_base_url: 'https://portal.example.test',
        category: 'publik',
      },
      {
        client_id: 'unsafe',
        display_name: 'Unsafe',
        app_base_url: 'javascript:alert(1)',
        category: 'publik',
      },
    ])
    const wrapper = mount(SsoAccountBar, {
      global: { stubs: { RouterLink: true } },
    })

    await wrapper.get('[data-testid="sso-account-apps-trigger"]').trigger('click')
    await flushPromises()

    const links = wrapper.findAll('.sso-account-bar__app')
    expect(links).toHaveLength(1)
    expect(links[0]?.attributes('href')).toBe('https://portal.example.test/')
    expect(wrapper.text()).not.toContain('Unsafe')
  })

  it('switches to a device-bound account and reloads the shell', async () => {
    vi.mocked(ssoAccountWidgetApi.accounts).mockResolvedValueOnce([
      {
        account_id: 'acct-current',
        subject_id: 'sub-admin',
        display_name: 'Admin Example',
        email: 'a***n@example.com',
        status: 'active',
        is_current: true,
      },
      {
        account_id: 'acct-other',
        subject_id: 'sub-other',
        display_name: 'Other Account',
        email: 'o***r@example.com',
        status: 'active',
        is_current: false,
      },
    ])
    vi.mocked(ssoAccountWidgetApi.switchAccount).mockResolvedValueOnce({ success: true })
    const reload = vi.fn<() => void>()
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload },
      configurable: true,
    })
    const wrapper = mount(SsoAccountBar, {
      global: { stubs: { RouterLink: true } },
    })

    await wrapper.get('[data-testid="sso-account-menu-trigger"]').trigger('click')
    await flushPromises()
    await wrapper.get('.sso-account-bar__account').trigger('click')
    await flushPromises()

    expect(ssoAccountWidgetApi.switchAccount).toHaveBeenCalledWith('acct-other')
    expect(reload).toHaveBeenCalled()
  })

  it('uses the recovery login url when switching to an expired account', async () => {
    vi.mocked(ssoAccountWidgetApi.accounts).mockResolvedValueOnce([
      {
        account_id: 'acct-current',
        subject_id: 'sub-admin',
        display_name: 'Admin Example',
        email: 'a***n@example.com',
        status: 'active',
        is_current: true,
      },
      {
        account_id: 'acct-expired',
        subject_id: 'sub-expired',
        display_name: 'Expired Account',
        email: 'e*****d@example.com',
        status: 'session_expired',
        is_current: false,
      },
    ])
    vi.mocked(ssoAccountWidgetApi.switchAccount).mockResolvedValueOnce({
      success: false,
      error: 'session_expired',
      login_url: 'https://sso.example.test/login',
    })
    const assign = vi.fn<Location['assign']>()
    Object.defineProperty(window, 'location', {
      value: { ...window.location, assign },
      configurable: true,
    })
    const wrapper = mount(SsoAccountBar, {
      global: { stubs: { RouterLink: true } },
    })

    await wrapper.get('[data-testid="sso-account-menu-trigger"]').trigger('click')
    await flushPromises()
    await wrapper.get('.sso-account-bar__account').trigger('click')
    await flushPromises()

    expect(assign).toHaveBeenCalledWith('https://sso.example.test/login')
  })

  it('does not use unsafe recovery login urls from switch failures', async () => {
    vi.mocked(ssoAccountWidgetApi.accounts).mockResolvedValueOnce([
      {
        account_id: 'acct-current',
        subject_id: 'sub-admin',
        display_name: 'Admin Example',
        email: 'a***n@example.com',
        status: 'active',
        is_current: true,
      },
      {
        account_id: 'acct-expired',
        subject_id: 'sub-expired',
        display_name: 'Expired Account',
        email: 'e*****d@example.com',
        status: 'session_expired',
        is_current: false,
      },
    ])
    vi.mocked(ssoAccountWidgetApi.switchAccount).mockResolvedValueOnce({
      success: false,
      error: 'session_expired',
      login_url: 'javascript:alert(1)',
    })
    const assign = vi.fn<Location['assign']>()
    Object.defineProperty(window, 'location', {
      value: { ...window.location, assign },
      configurable: true,
    })
    const wrapper = mount(SsoAccountBar, {
      global: { stubs: { RouterLink: true } },
    })

    await wrapper.get('[data-testid="sso-account-menu-trigger"]').trigger('click')
    await flushPromises()
    await wrapper.get('.sso-account-bar__account').trigger('click')
    await flushPromises()

    expect(assign).not.toHaveBeenCalled()
    expect(wrapper.find('.sso-account-bar__status a').exists()).toBe(false)
    expect(wrapper.find('.sso-account-bar__account').exists()).toBe(false)
  })

  it('logs out through the gated widget logout endpoint', async () => {
    vi.mocked(ssoAccountWidgetApi.accounts).mockResolvedValueOnce([])
    vi.mocked(ssoAccountWidgetApi.logout).mockResolvedValueOnce({ success: true })
    const reload = vi.fn<() => void>()
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload },
      configurable: true,
    })
    const wrapper = mount(SsoAccountBar, {
      global: { stubs: { RouterLink: true } },
    })

    await wrapper.get('[data-testid="sso-account-menu-trigger"]').trigger('click')
    await flushPromises()
    await wrapper.get('.sso-account-bar__action--danger').trigger('click')
    await flushPromises()

    expect(ssoAccountWidgetApi.logout).toHaveBeenCalled()
    expect(reload).toHaveBeenCalled()
  })
})
