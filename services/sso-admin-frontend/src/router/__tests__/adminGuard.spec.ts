import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RouteLocationNormalized } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { resolveAdminGuard } from '../guards'
import { useSessionStore } from '@/stores/session.store'
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
      capabilities: {
        'admin.panel.view': true,
        'admin.dashboard.view': true,
      },
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

const userPrincipal: AdminPrincipalResponse = {
  principal: {
    ...adminPrincipal.principal,
    subject_id: 'sub_user',
    email: 'user@dev-sso.local',
    display_name: 'Normal User',
    role: 'user',
    permissions: {
      view_admin_panel: false,
      manage_sessions: false,
      permissions: [],
      capabilities: {},
      menus: [],
    },
  },
}

function route(overrides: Partial<RouteLocationNormalized> = {}): RouteLocationNormalized {
  return {
    fullPath: '/',
    path: '/',
    query: {},
    hash: '',
    name: 'admin.home',
    params: {},
    matched: [],
    redirectedFrom: undefined,
    meta: { requiresAdmin: true },
    ...overrides,
  } as RouteLocationNormalized
}

describe('resolveAdminGuard', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.stubGlobal('location', {
      assign: vi.fn<(url: string) => void>(),
      origin: 'https://sso.test',
    })
  })

  it('allows public admin frontend routes without checking the SSO session', async () => {
    await expect(resolveAdminGuard(route({ meta: {} }))).resolves.toBe(true)
    expect(authApi.getPrincipal).not.toHaveBeenCalled()
  })

  it('redirects unauthenticated visitors to the SSO portal login with admin return path', async () => {
    vi.mocked(authApi.getPrincipal).mockRejectedValue(new ApiError(401, 'No active SSO session.'))

    await expect(resolveAdminGuard(route({ fullPath: '/' }))).resolves.toBe(false)

    expect(window.location.assign).toHaveBeenCalledWith(
      'https://dev-sso.timeh.my.id/?redirect=%2F__vue-preview%2F',
    )
  })

  it('sends authenticated non-admin users to the forbidden route', async () => {
    vi.mocked(authApi.getPrincipal).mockResolvedValue(userPrincipal)

    await expect(resolveAdminGuard(route())).resolves.toEqual({ name: 'admin.forbidden' })
  })

  it('allows authenticated admin users to access the admin frontend', async () => {
    vi.mocked(authApi.getPrincipal).mockResolvedValue(adminPrincipal)

    await expect(resolveAdminGuard(route())).resolves.toBe(true)
  })

  it('allows already loaded multi-role admins without another session request', async () => {
    const session = useSessionStore()
    session.setPrincipal({ ...adminPrincipal.principal, role: 'admin' })

    await expect(resolveAdminGuard(route())).resolves.toBe(true)
    expect(authApi.getPrincipal).not.toHaveBeenCalled()
  })

  it('sends admins without required route permissions to the forbidden route', async () => {
    vi.mocked(authApi.getPrincipal).mockResolvedValue({
      principal: {
        ...adminPrincipal.principal,
        permissions: {
          view_admin_panel: true,
          manage_sessions: false,
          permissions: ['admin.panel.view'],
          capabilities: {
            'admin.panel.view': true,
            'admin.dashboard.view': false,
          },
          menus: [],
        },
      },
    })

    await expect(
      resolveAdminGuard(
        route({ meta: { requiresAdmin: true, permissions: ['admin.dashboard.view'] } }),
      ),
    ).resolves.toEqual({ name: 'admin.forbidden' })
  })

  it('redirects to login when principal loading returns 401', async () => {
    vi.mocked(authApi.getPrincipal).mockRejectedValue(new ApiError(401, 'No active SSO session.'))

    await expect(
      resolveAdminGuard(
        route({
          fullPath: '/oidc-foundation',
          meta: { requiresAdmin: true, permissions: ['admin.dashboard.view'] },
        }),
      ),
    ).resolves.toBe(false)

    expect(window.location.assign).toHaveBeenCalledWith(
      'https://dev-sso.timeh.my.id/?redirect=%2F__vue-preview%2Foidc-foundation',
    )
  })

  it('shows retryable admin error state instead of forbidden on principal service failures', async () => {
    vi.mocked(authApi.getPrincipal).mockRejectedValue(new ApiError(502, 'upstream unavailable'))

    await expect(resolveAdminGuard(route())).resolves.toEqual({ name: 'admin.error' })
  })

  it('routes invalid upstream bootstrap responses to the API unreachable view', async () => {
    vi.mocked(authApi.getPrincipal).mockRejectedValue(
      new ApiError(502, 'Invalid upstream response', 'invalid_upstream_response'),
    )

    await expect(resolveAdminGuard(route())).resolves.toEqual({ name: 'admin.api-unreachable' })
  })

  it('routes admins without enrolled MFA to the MFA required view', async () => {
    vi.mocked(authApi.getPrincipal).mockRejectedValue(
      new ApiError(403, 'MFA enrollment required', 'mfa_enrollment_required'),
    )

    await expect(resolveAdminGuard(route())).resolves.toEqual({ name: 'admin.mfa-required' })
  })

  it('routes stale admin assurance bootstrap failures to the step-up view', async () => {
    vi.mocked(authApi.getPrincipal).mockRejectedValue(
      new ApiError(428, 'Step up required', 'step_up_required'),
    )

    await expect(resolveAdminGuard(route())).resolves.toEqual({ name: 'admin.step-up-required' })
  })

  it('routes current backend reauth_required bootstrap failures to the step-up view', async () => {
    vi.mocked(authApi.getPrincipal).mockRejectedValue(
      new ApiError(401, 'Fresh authentication is required', 'reauth_required'),
    )

    await expect(resolveAdminGuard(route())).resolves.toEqual({ name: 'admin.step-up-required' })
  })

  it('allows admins with required route permissions', async () => {
    vi.mocked(authApi.getPrincipal).mockResolvedValue(adminPrincipal)

    await expect(
      resolveAdminGuard(
        route({ meta: { requiresAdmin: true, permissions: ['admin.dashboard.view'] } }),
      ),
    ).resolves.toBe(true)
  })
})
