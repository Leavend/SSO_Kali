import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSessionStore } from '../session.store'
import { ApiError } from '@/lib/api/api-client'
import { authApi } from '@/services/auth.api'
import type { AdminPrincipalResponse } from '@/types/auth.types'

vi.mock('@/services/auth.api', () => ({
  authApi: {
    getPrincipal: vi.fn<() => Promise<AdminPrincipalResponse>>(),
  },
}))

const adminPrincipal: AdminPrincipalResponse = {
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
      amr: ['pwd', 'mfa'],
      acr: 'urn:example:loa:2',
      mfa_enforced: true,
      mfa_verified: true,
    },
  },
}

describe('useSessionStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('bootstraps the admin session from the BFF principal endpoint', async () => {
    vi.mocked(authApi.getPrincipal).mockResolvedValue(adminPrincipal)

    const session = useSessionStore()

    await expect(session.ensureSession()).resolves.toBe('authenticated')
    expect(session.isAuthenticated).toBe(true)
    expect(session.roles).toEqual(['admin'])
    expect(session.user?.email).toBe('admin@dev-sso.local')
    expect(session.hasPermission('admin.dashboard.view')).toBe(true)
  })

  it('returns unauthenticated when the BFF principal endpoint returns 401', async () => {
    vi.mocked(authApi.getPrincipal).mockRejectedValue(new ApiError(401, 'No active SSO session.'))

    const session = useSessionStore()

    await expect(session.ensureSession()).resolves.toBe('unauthenticated')
    expect(session.isAuthenticated).toBe(false)
    expect(session.roles).toEqual([])
    expect(session.user).toBeNull()
  })

  it('returns error without collapsing network failures into unauthenticated state', async () => {
    vi.mocked(authApi.getPrincipal).mockRejectedValue(new Error('network down'))

    const session = useSessionStore()

    await expect(session.ensureSession()).resolves.toBe('error')
    expect(session.isAuthenticated).toBe(false)
    expect(session.user).toBeNull()
  })
})
