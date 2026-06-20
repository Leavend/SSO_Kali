import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RouteLocationNormalized } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { resolveAdminGuard, resolveBootstrapFailure, resolveLoadedAdminAccess } from '../guards'
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

  it('starts session bootstrap without blocking first render for protected routes', async () => {
    const pendingPrincipal = new Promise<AdminPrincipalResponse>(() => {})
    vi.mocked(authApi.getPrincipal).mockReturnValue(pendingPrincipal)

    await expect(resolveAdminGuard(route({ fullPath: '/audit' }))).resolves.toBe(true)

    expect(authApi.getPrincipal).toHaveBeenCalledTimes(1)
  })

  it('redirects unauthenticated bootstrap failures to the same-origin admin BFF login', () => {
    vi.mocked(authApi.getPrincipal).mockRejectedValue(new ApiError(401, 'No active SSO session.'))

    expect(resolveBootstrapFailure('unauthenticated', '/')).toBe(false)

    expect(window.location.assign).toHaveBeenCalledWith(
      'https://sso.test/auth/login?return_to=%2F__vue-preview%2F',
    )
  })

  it('sends authenticated non-admin users to the forbidden route after bootstrap', () => {
    useSessionStore().setPrincipal(userPrincipal.principal)

    expect(resolveLoadedAdminAccess(route())).toEqual({ name: 'admin.forbidden' })
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

  it('sends admins without required route permissions to the forbidden route after bootstrap', () => {
    useSessionStore().setPrincipal({
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
    })

    expect(
      resolveLoadedAdminAccess(
        route({ meta: { requiresAdmin: true, permissions: ['admin.dashboard.view'] } }),
      ),
    ).toEqual({ name: 'admin.forbidden' })
  })

  it('redirects to login when bootstrap returns 401', () => {
    expect(resolveBootstrapFailure('unauthenticated', '/oidc-foundation')).toBe(false)

    expect(window.location.assign).toHaveBeenCalledWith(
      'https://sso.test/auth/login?return_to=%2F__vue-preview%2Foidc-foundation',
    )
  })

  it('shows retryable admin error state instead of forbidden on principal service failures', () => {
    expect(resolveBootstrapFailure('error', '/')).toEqual({ name: 'admin.error' })
  })

  it('routes invalid upstream bootstrap responses to the API unreachable view', () => {
    expect(resolveBootstrapFailure('api_unreachable', '/')).toEqual({
      name: 'admin.api-unreachable',
    })
  })

  it('routes admins without enrolled MFA to the MFA required view', () => {
    expect(resolveBootstrapFailure('mfa_enrollment_required', '/')).toEqual({
      name: 'admin.mfa-required',
      query: { return_to: '/' },
    })
  })

  it('routes admins without MFA assurance to the step-up view', () => {
    expect(resolveBootstrapFailure('step_up_required', '/')).toEqual({
      name: 'admin.step-up-required',
      query: { return_to: '/' },
    })
  })

  it('allows admins with required route permissions', async () => {
    useSessionStore().setPrincipal(adminPrincipal.principal)

    expect(
      resolveLoadedAdminAccess(
        route({ meta: { requiresAdmin: true, permissions: ['admin.dashboard.view'] } }),
      ),
    ).toBe(true)
  })
})
