import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import AdminShellLayout from '../AdminShellLayout.vue'
import { useSessionStore } from '@/stores/session.store'
import type { AdminPrincipal } from '@/types/auth.types'

const principal: AdminPrincipal = {
  subject_id: 'sub-admin',
  email: 'admin@example.com',
  display_name: 'Admin Example',
  role: 'admin',
  last_login_at: '2026-05-27T00:00:00Z',
  auth_context: {
    auth_time: '2026-05-27T00:00:00Z',
    amr: ['pwd', 'mfa'],
    acr: 'urn:loa:2',
    mfa_enforced: true,
    mfa_verified: true,
  },
  permissions: {
    view_admin_panel: true,
    manage_sessions: false,
    permissions: ['admin.dashboard.view'],
    capabilities: { 'admin.dashboard.view': true },
    menus: [
      {
        id: 'dashboard',
        label: 'Dashboard',
        required_permission: 'admin.dashboard.view',
        visible: true,
      },
      {
        id: 'users',
        label: 'Users',
        required_permission: 'admin.users.read',
        visible: false,
      },
    ],
  },
}

describe('AdminShellLayout', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    useSessionStore().setPrincipal(principal)
  })

  it('renders only visible backend-computed admin menus', () => {
    const wrapper = mount(AdminShellLayout, {
      global: {
        stubs: {
          RouterLink: { template: '<a :href="to"><slot /></a>', props: ['to'] },
          RouterView: { template: '<section>Route content</section>' },
        },
      },
    })

    expect(wrapper.get('nav').text()).toContain('Dashboard')
    expect(wrapper.text()).not.toContain('Users')
  })

  it('shows principal identity without exposing tokens', () => {
    const wrapper = mount(AdminShellLayout, {
      global: {
        stubs: {
          RouterLink: { template: '<a :href="to"><slot /></a>', props: ['to'] },
          RouterView: true,
        },
      },
    })

    expect(wrapper.text()).toContain('Admin Example')
    expect(wrapper.text()).toContain('admin@example.com')
    expect(wrapper.text()).not.toMatch(/accessToken|refreshToken|idToken|Bearer/i)
  })

  it('renders refreshed shell landmarks topbar breadcrumb and logout action', () => {
    const wrapper = mount(AdminShellLayout, {
      global: {
        stubs: {
          RouterLink: { template: '<a :href="to"><slot /></a>', props: ['to'] },
          RouterView: true,
        },
      },
    })

    expect(wrapper.find('[data-testid="admin-topbar"]').exists()).toBe(true)
    expect(wrapper.get('[aria-label="Breadcrumb"]').text()).toContain('Control Plane')
    expect(
      wrapper.get('[data-testid="admin-mobile-menu-toggle"]').attributes('aria-expanded'),
    ).toBe('false')
    // The logout link MUST point at the admin BFF's own same-origin /auth/logout
    // route — the only handler that revokes the admin's tokens, deletes the
    // server-side session record, clears the session cookie, and triggers IdP
    // single sign-out. It must NOT point at the portal origin (ssoBaseUrl/logout),
    // which leaves the admin BFF session fully intact.
    expect(wrapper.get('[data-testid="admin-logout-action"]').attributes('href')).toBe(
      '/auth/logout',
    )
  })
})
