// Plain *.spec.ts (jsdom environment) — the layout component has no async
// setup so mountSuspended is not needed. The session store is mocked at the
// module level to avoid the Nuxt instance that useState requires at runtime.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import AdminLayout from '../admin.vue'
import { useSessionStore } from '@/stores/session.store'
import type { AdminPrincipal } from '@/types/auth.types'

// ---------------------------------------------------------------------------
// Module mock — hoisted before imports by Vitest
// ---------------------------------------------------------------------------

vi.mock('@/stores/session.store', () => ({
  useSessionStore: vi.fn<() => { principal: AdminPrincipal | null }>(),
}))

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

function principal(): AdminPrincipal {
  return {
    subject_id: 'sub_admin',
    email: 'admin@dev-sso.local',
    display_name: 'Admin User',
    role: 'admin',
    last_login_at: null,
    auth_context: { auth_time: null, amr: [], acr: null, mfa_enforced: true, mfa_verified: true },
    permissions: {
      view_admin_panel: true,
      manage_sessions: true,
      permissions: [],
      capabilities: {},
      menus: [
        {
          id: 'dashboard',
          label: 'Dashboard',
          required_permission: 'admin.dashboard.view',
          visible: true,
        },
        {
          id: 'audit',
          label: 'Audit',
          required_permission: 'admin.observability.read',
          visible: true,
        },
        {
          id: 'roles',
          label: 'Roles',
          required_permission: 'admin.roles.read',
          visible: false,
        },
      ],
    },
  }
}

const stubs = {
  NuxtLink: { props: ['to'], template: '<a :href="String(to)" :data-to="String(to)"><slot /></a>' },
  ClientOnly: { template: '<div><slot /></div>' },
  SsoAccountBar: { template: '<div data-testid="sso-account-bar" />' },
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('admin layout', () => {
  beforeEach(() => {
    // Return a plain object that mirrors the Pinia store's unwrapped shape.
    // Pinia automatically unwraps refs when accessed via the store proxy, so
    // we mimic that: principal is the raw value, not a Ref.
    vi.mocked(useSessionStore).mockReturnValue({
      principal: null,
    } as unknown as ReturnType<typeof useSessionStore>)
  })

  it('renders a nav link per visible principal menu and maps audit to /observability', () => {
    vi.mocked(useSessionStore).mockReturnValue({
      principal: principal(),
    } as unknown as ReturnType<typeof useSessionStore>)
    const wrapper = mount(AdminLayout, { global: { stubs }, slots: { default: 'PAGE' } })

    const links = wrapper.findAll('[data-menu-id]')
    expect(links).toHaveLength(2) // hidden 'roles' menu excluded
    expect(wrapper.get('[data-menu-id="dashboard"]').attributes('data-to')).toBe('/dashboard')
    expect(wrapper.get('[data-menu-id="audit"]').attributes('data-to')).toBe('/observability')
  })

  it('renders the topbar, the page slot, and a same-origin sign-out link', () => {
    vi.mocked(useSessionStore).mockReturnValue({
      principal: principal(),
    } as unknown as ReturnType<typeof useSessionStore>)
    const wrapper = mount(AdminLayout, { global: { stubs }, slots: { default: 'PAGE' } })

    expect(wrapper.find('[data-testid="admin-topbar"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('PAGE')
    expect(wrapper.get('a.admin-logout').attributes('href')).toBe('/auth/logout')
    expect(wrapper.find('[data-testid="sso-account-bar"]').exists()).toBe(true)
  })

  it('renders no nav links when there is no principal yet', () => {
    const wrapper = mount(AdminLayout, { global: { stubs }, slots: { default: 'PAGE' } })
    expect(wrapper.findAll('[data-menu-id]')).toHaveLength(0)
  })
})
