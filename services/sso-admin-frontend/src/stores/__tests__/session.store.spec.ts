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

  it('returns mfa_enrollment_required for explicit backend enrollment denials', async () => {
    vi.mocked(authApi.getPrincipal).mockRejectedValue(
      new ApiError(403, 'MFA enrollment required', 'mfa_enrollment_required'),
    )

    const session = useSessionStore()

    await expect(session.ensureSession()).resolves.toBe('mfa_enrollment_required')
    expect(session.isAuthenticated).toBe(false)
  })

  it('returns step_up_required for stale auth and MFA assurance bootstrap failures', async () => {
    vi.mocked(authApi.getPrincipal).mockRejectedValue(
      new ApiError(428, 'Step up required', 'step_up_required'),
    )

    const session = useSessionStore()

    await expect(session.ensureSession()).resolves.toBe('step_up_required')
    expect(session.isAuthenticated).toBe(false)
  })

  it('returns step_up_required for current backend reauth_required bootstrap failures', async () => {
    vi.mocked(authApi.getPrincipal).mockRejectedValue(
      new ApiError(401, 'Fresh authentication is required', 'reauth_required'),
    )

    const session = useSessionStore()

    await expect(session.ensureSession()).resolves.toBe('step_up_required')
  })

  it('keeps generic 403 mapped to forbidden', async () => {
    vi.mocked(authApi.getPrincipal).mockRejectedValue(new ApiError(403, 'Forbidden', 'forbidden'))

    const session = useSessionStore()

    await expect(session.ensureSession()).resolves.toBe('forbidden')
  })

  it('returns api_unreachable when the bootstrap endpoint returns an invalid upstream response', async () => {
    vi.mocked(authApi.getPrincipal).mockRejectedValue(
      new ApiError(
        502,
        'Admin API returned a successful response that was not valid JSON.',
        'invalid_upstream_response',
      ),
    )

    const session = useSessionStore()

    await expect(session.ensureSession()).resolves.toBe('api_unreachable')
    expect(session.isAuthenticated).toBe(false)
  })

  it('returns error without collapsing network failures into unauthenticated state', async () => {
    vi.mocked(authApi.getPrincipal).mockRejectedValue(new Error('network down'))

    const session = useSessionStore()

    await expect(session.ensureSession()).resolves.toBe('error')
    expect(session.isAuthenticated).toBe(false)
    expect(session.user).toBeNull()
  })
})
