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

// NuxtLink stub serialises the `to` prop as JSON so tests can assert on
// both string paths (fallback) and route-name objects ({ name: '...' }).
const stubs = {
  NuxtLink: {
    props: ['to'],
    template: '<a :data-to="JSON.stringify(to)"><slot /></a>',
  },
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

  it('renders the data-admin-shell root element (Phase-0 / 2c.1 dependency)', () => {
    const wrapper = mount(AdminLayout, { global: { stubs }, slots: { default: 'PAGE' } })
    expect(wrapper.find('[data-admin-shell]').exists()).toBe(true)
  })

  it('renders a nav link per visible principal menu and maps audit to admin.observability', () => {
    vi.mocked(useSessionStore).mockReturnValue({
      principal: principal(),
    } as unknown as ReturnType<typeof useSessionStore>)
    const wrapper = mount(AdminLayout, { global: { stubs }, slots: { default: 'PAGE' } })

    const links = wrapper.findAll('[data-menu-id]')
    expect(links).toHaveLength(2) // hidden 'roles' menu excluded

    expect(wrapper.get('[data-menu-id="dashboard"]').attributes('data-to')).toBe(
      JSON.stringify({ name: 'admin.dashboard' }),
    )
    // audit id remaps to admin.observability (same logic as the old /observability path remap)
    expect(wrapper.get('[data-menu-id="audit"]').attributes('data-to')).toBe(
      JSON.stringify({ name: 'admin.observability' }),
    )
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

  it('renders no nav links and no account bar when there is no principal yet', () => {
    const wrapper = mount(AdminLayout, { global: { stubs }, slots: { default: 'PAGE' } })
    expect(wrapper.findAll('[data-menu-id]')).toHaveLength(0)
    // v-if="session.principal" guard hides the account bar when unauthenticated
    expect(wrapper.find('[data-testid="sso-account-bar"]').exists()).toBe(false)
  })

  it('applies router-link-exact-active class to the currently-active nav link', () => {
    vi.mocked(useSessionStore).mockReturnValue({
      principal: principal(),
    } as unknown as ReturnType<typeof useSessionStore>)

    // Stub that simulates the router marking the dashboard link as the exact-active route
    const activeStubs = {
      ...stubs,
      NuxtLink: {
        props: ['to'],
        template: `<a
          :class="typeof to === 'object' && to.name === 'admin.dashboard' ? 'router-link-exact-active' : ''"
          :data-to="JSON.stringify(to)"
        ><slot /></a>`,
      },
    }

    const wrapper = mount(AdminLayout, {
      global: { stubs: activeStubs },
      slots: { default: 'PAGE' },
    })

    const dashboardLink = wrapper.get('[data-menu-id="dashboard"]')
    expect(dashboardLink.classes()).toContain('router-link-exact-active')

    // Non-active link should not carry the active class
    const auditLink = wrapper.get('[data-menu-id="audit"]')
    expect(auditLink.classes()).not.toContain('router-link-exact-active')
  })
})
