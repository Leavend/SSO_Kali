import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import HomeView from '../HomeView.vue'
import { authApi } from '@/services/auth.api'
import { useSessionStore } from '@/stores/session.store'
import type { AdminPrincipalResponse, SsoSessionResponse } from '@/types/auth.types'

vi.mock('@/services/auth.api', () => ({
  authApi: {
    getSession: vi.fn<() => Promise<SsoSessionResponse>>(),
    getPrincipal: vi.fn<() => Promise<AdminPrincipalResponse>>(),
  },
}))

const principal: AdminPrincipalResponse = {
  principal: {
    subject_id: 'sub_admin',
    email: 'admin@dev-sso.local',
    display_name: 'Admin User',
    role: 'admin',
    last_login_at: null,
    permissions: {
      view_admin_panel: true,
      manage_sessions: false,
      permissions: ['admin.dashboard.view'],
      capabilities: { 'admin.dashboard.view': true },
      menus: [],
    },
    auth_context: {
      auth_time: null,
      amr: [],
      acr: null,
      mfa_enforced: true,
      mfa_verified: true,
    },
  },
}

describe('HomeView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('shows OIDC Foundation navigation only after dashboard permission is loaded', async () => {
    vi.mocked(authApi.getPrincipal).mockResolvedValue(principal)
    useSessionStore()

    const wrapper = mount(HomeView, {
      global: {
        stubs: {
          RouterLink: { template: '<a><slot /></a>' },
        },
      },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('OIDC Foundation')
  })
})
