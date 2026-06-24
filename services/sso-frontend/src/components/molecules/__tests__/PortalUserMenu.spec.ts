import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import PortalUserMenu from '../PortalUserMenu.vue'
import { useSessionStore } from '@/stores/session.store'
import { ssoAccountWidgetApi } from '@/services/sso-account-widget.api'

vi.mock('@/services/sso-account-widget.api', async () => {
  const actual = await vi.importActual<typeof import('@/services/sso-account-widget.api')>(
    '@/services/sso-account-widget.api',
  )
  return {
    ...actual,
    ssoAccountWidgetApi: {
      apps: vi.fn(),
      accounts: vi.fn(),
      switchAccount: vi.fn(),
      logout: vi.fn(),
    },
  }
})

describe('PortalUserMenu', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    useSessionStore().user = {
      id: 1,
      subject_id: 'sub-user',
      email: 'user@example.com',
      display_name: 'Portal User',
      roles: ['user'],
    }
    vi.mocked(ssoAccountWidgetApi.apps).mockReset()
    vi.mocked(ssoAccountWidgetApi.accounts).mockReset()
    vi.mocked(ssoAccountWidgetApi.switchAccount).mockReset()
    vi.mocked(ssoAccountWidgetApi.logout).mockReset()
  })

  it('renders app launcher and account menu from the portal session', async () => {
    vi.mocked(ssoAccountWidgetApi.accounts).mockResolvedValueOnce([])
    const wrapper = mount(PortalUserMenu, {
      global: {
        stubs: {
          RouterLink: { template: '<a href="/profile"><slot /></a>' },
          ConfirmDialog: true,
        },
      },
    })

    expect(wrapper.get('[data-testid="portal-account-apps-trigger"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="portal-account-menu-trigger"]').text()).toContain(
      'Portal User',
    )

    await wrapper.get('[data-testid="portal-account-menu-trigger"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="portal-account-menu"]').text()).toContain('Portal User')
    expect(wrapper.get('[data-testid="portal-account-menu"]').text()).toContain('user@example.com')
    expect(wrapper.get('[data-testid="portal-account-menu"]').text()).toContain('Kelola Akun')
  })

  it('renders only safe app launcher links', async () => {
    vi.mocked(ssoAccountWidgetApi.apps).mockResolvedValueOnce([
      {
        client_id: 'admin',
        display_name: 'Admin',
        app_base_url: 'https://admin.example.test',
        category: 'publik',
      },
      {
        client_id: 'unsafe',
        display_name: 'Unsafe',
        app_base_url: 'data:text/html,boom',
        category: 'publik',
      },
    ])
    const wrapper = mount(PortalUserMenu, {
      global: { stubs: { RouterLink: true, ConfirmDialog: true } },
    })

    await wrapper.get('[data-testid="portal-account-apps-trigger"]').trigger('click')
    await flushPromises()

    const links = wrapper.findAll('[role="menuitem"][href]')
    expect(links).toHaveLength(1)
    expect(links[0]?.attributes('href')).toBe('https://admin.example.test/')
    expect(wrapper.text()).not.toContain('Unsafe')
  })

  it('switches account and reloads the portal shell', async () => {
    vi.mocked(ssoAccountWidgetApi.accounts).mockResolvedValueOnce([
      {
        account_id: 'acct-current',
        subject_id: 'sub-user',
        display_name: 'Portal User',
        email: 'u***r@example.com',
        status: 'active',
        is_current: true,
      },
      {
        account_id: 'acct-other',
        subject_id: 'sub-other',
        display_name: 'Other User',
        email: 'o***r@example.com',
        status: 'active',
        is_current: false,
      },
    ])
    vi.mocked(ssoAccountWidgetApi.switchAccount).mockResolvedValueOnce({ success: true })
    const reload = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload },
      configurable: true,
    })
    const wrapper = mount(PortalUserMenu, {
      global: { stubs: { RouterLink: true, ConfirmDialog: true } },
    })

    await wrapper.get('[data-testid="portal-account-menu-trigger"]').trigger('click')
    await flushPromises()
    await wrapper.get('button[role="menuitem"]').trigger('click')
    await flushPromises()

    expect(ssoAccountWidgetApi.switchAccount).toHaveBeenCalledWith('acct-other')
    expect(reload).toHaveBeenCalled()
  })

  it('does not use unsafe recovery login urls from switch failures', async () => {
    vi.mocked(ssoAccountWidgetApi.accounts).mockResolvedValueOnce([
      {
        account_id: 'acct-current',
        subject_id: 'sub-user',
        display_name: 'Portal User',
        email: 'u***r@example.com',
        status: 'active',
        is_current: true,
      },
      {
        account_id: 'acct-expired',
        subject_id: 'sub-expired',
        display_name: 'Expired User',
        email: 'e*****d@example.com',
        status: 'session_expired',
        is_current: false,
      },
    ])
    vi.mocked(ssoAccountWidgetApi.switchAccount).mockResolvedValueOnce({
      success: false,
      error: 'session_expired',
      login_url: 'data:text/html,boom',
    })
    const assign = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { ...window.location, assign },
      configurable: true,
    })
    const wrapper = mount(PortalUserMenu, {
      global: { stubs: { RouterLink: true, ConfirmDialog: true } },
    })

    await wrapper.get('[data-testid="portal-account-menu-trigger"]').trigger('click')
    await flushPromises()
    await wrapper.get('button[role="menuitem"]').trigger('click')
    await flushPromises()

    expect(assign).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="portal-account-menu"] a.underline').exists()).toBe(false)
    expect(wrapper.find('button[role="menuitem"]').exists()).toBe(false)
  })

  it('logs out through the gated widget logout endpoint', async () => {
    vi.mocked(ssoAccountWidgetApi.logout).mockResolvedValueOnce({ success: true })
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/login', name: 'auth.login', component: { template: '<div />' } },
        { path: '/', name: 'home', component: { template: '<div />' } },
      ],
    })
    const wrapper = mount(PortalUserMenu, {
      global: {
        plugins: [router],
        stubs: {
          RouterLink: true,
          ConfirmDialog: { template: `<button data-testid="confirm-logout" @click="$emit('confirm')" />` },
        },
      },
    })

    await wrapper.get('button[aria-label="Keluar"]').trigger('click')
    await wrapper.get('[data-testid="confirm-logout"]').trigger('click')
    await flushPromises()

    expect(ssoAccountWidgetApi.logout).toHaveBeenCalled()
    expect(useSessionStore().user).toBeNull()
  })
})
