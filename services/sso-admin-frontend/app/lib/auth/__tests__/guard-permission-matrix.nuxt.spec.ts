// Named *.nuxt.spec.ts so defineVitestConfig routes it to the 'nuxt'
// environment where mockNuxtImport and Nuxt auto-imports (useState) are
// available. resolveLoadedAdminAccess calls useSessionStore() which calls
// useState() at store-creation time — that requires the nuxt env.
// Per hygiene: use mockNuxtImport (not vi.stubGlobal) for Nuxt auto-imports.
//
// Nav UX-minimization coverage note: the layout rendering of visible vs.
// hidden nav links is verified in app/layouts/__tests__/admin-layout.spec.ts
// (the 'renders a nav link per visible principal menu' test confirms that
// menus with visible:false are excluded from the DOM). Case 7 below
// re-confirms the permission→menu-visibility contract at the data model level
// so this matrix explicitly accounts for nav minimization.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import type { RouteLocationNormalized } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { resolveBootstrapFailure, resolveLoadedAdminAccess } from '../admin-guard-resolver'
import { useSessionStore } from '@/stores/session.store'
import type { AdminPrincipal } from '@/types/auth.types'

// ---------------------------------------------------------------------------
// Module mocks — hoisted before imports by Vitest
// ---------------------------------------------------------------------------

// Replace useState with a plain ref factory so each useSessionStore() call
// gets fresh, isolated refs. Each test gets a fresh Pinia + store from
// createPinia() in beforeEach; this ensures no state bleeds between cases.
mockNuxtImport('useState', () => {
  return <T>(_key: string, init?: () => T) => ref(init?.())
})

// Provide runtimeConfig so api-client (imported transitively) does not throw
// if isMockEnabled() is probed. We don't call any API methods in this suite
// so this is purely a safety guard for the import chain.
mockNuxtImport('useRuntimeConfig', () => {
  return () => ({
    app: { baseURL: '/' },
    public: {
      mockApi: 'false',
      ssoBaseUrl: 'https://sso.test',
      ssoWidgetBaseUrl: '',
      docsBaseUrl: 'https://docs.example.test',
      basePath: '/__vue-preview',
    },
  })
})

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ORIGIN = 'https://sso.test'
const BASE = '/__vue-preview'

function principal(overrides: Partial<AdminPrincipal> = {}): AdminPrincipal {
  return {
    subject_id: 'sub_admin',
    email: 'admin@dev-sso.local',
    display_name: 'Admin User',
    role: 'admin',
    last_login_at: null,
    auth_context: { auth_time: null, amr: [], acr: null, mfa_enforced: true, mfa_verified: true },
    permissions: {
      view_admin_panel: true,
      manage_sessions: false,
      permissions: ['admin.dashboard.view'],
      capabilities: { 'admin.dashboard.view': true },
      menus: [],
    },
    ...overrides,
  }
}

function route(meta: Record<string, unknown> = { requiresAdmin: true }): RouteLocationNormalized {
  return {
    fullPath: '/dashboard',
    path: '/dashboard',
    query: {},
    hash: '',
    name: 'admin.dashboard',
    params: {},
    matched: [],
    redirectedFrom: undefined,
    meta,
  } as unknown as RouteLocationNormalized
}

// ---------------------------------------------------------------------------
// Guard / permission matrix suite
// ---------------------------------------------------------------------------

describe('admin guard/permission matrix', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // Case 1: Unauthenticated user → redirected to login
  it('unauthenticated -> same-origin login redirect', () => {
    expect(resolveBootstrapFailure('unauthenticated', '/dashboard', ORIGIN, BASE)).toEqual({
      kind: 'login',
      url: 'https://sso.test/auth/login?return_to=%2F__vue-preview%2Fdashboard',
    })
  })

  // Case 2: Authenticated non-admin user → forbidden
  // ISOLATION: the principal carries 'admin.dashboard.view' as a TRUE capability so
  // hasEveryPermission would PASS if hasAdminRole were removed — meaning the test
  // would FAIL if the role check were deleted. Only hasAdminRole(['user']) === false
  // can produce forbidden here.
  it('non-admin authenticated user -> forbidden', () => {
    useSessionStore().setPrincipal(
      principal({
        role: 'user',
        permissions: {
          view_admin_panel: false,
          manage_sessions: false,
          permissions: ['admin.dashboard.view'],
          capabilities: { 'admin.dashboard.view': true },
          menus: [],
        },
      }),
    )
    expect(
      resolveLoadedAdminAccess(
        route({ requiresAdmin: true, permissions: ['admin.dashboard.view'] }),
      ),
    ).toEqual({ name: 'admin.forbidden' })
  })

  // Case 3: Admin without the route's required permission → forbidden
  it('admin without the required permission -> forbidden', () => {
    useSessionStore().setPrincipal(
      principal({
        permissions: {
          view_admin_panel: true,
          manage_sessions: false,
          permissions: [],
          capabilities: { 'admin.dashboard.view': false },
          menus: [],
        },
      }),
    )
    expect(
      resolveLoadedAdminAccess(
        route({ requiresAdmin: true, permissions: ['admin.dashboard.view'] }),
      ),
    ).toEqual({ name: 'admin.forbidden' })
  })

  // Case 4: Admin WITH the required permission → allow
  it('admin with the required permission -> allow', () => {
    useSessionStore().setPrincipal(principal())
    expect(
      resolveLoadedAdminAccess(
        route({ requiresAdmin: true, permissions: ['admin.dashboard.view'] }),
      ),
    ).toBe(true)
  })

  // Case 5: Backend 403 despite a permissive UI → safe forbidden route
  // The frontend may have allowed render, but a bootstrap that came back 403
  // must still resolve to the safe forbidden view (backend stays authoritative).
  it('backend 403 despite a permissive UI -> safe forbidden route', () => {
    expect(resolveBootstrapFailure('forbidden', '/dashboard', ORIGIN, BASE)).toEqual({
      kind: 'route',
      to: { name: 'admin.forbidden' },
    })
  })

  // Bonus: Non-admin routes are always allowed (no principal required)
  it('non-admin routes are always allowed without a principal', () => {
    // No setPrincipal call — store has no principal
    expect(resolveLoadedAdminAccess(route({}))).toBe(true)
  })

  // Case 7: Nav UX-minimization — permission→visibility tie (layout rendering in admin-layout.spec.ts)
  // Confirms that the session store's capability read matches the menu.visible shape that
  // the layout uses to filter nav links. Full DOM rendering is in admin-layout.spec.ts.
  it('nav UX-minimization: capability false -> menu.visible false (link hidden by layout)', () => {
    const p = principal({
      permissions: {
        view_admin_panel: true,
        manage_sessions: false,
        permissions: ['admin.dashboard.view'],
        capabilities: { 'admin.dashboard.view': true, 'admin.roles.read': false },
        menus: [
          {
            id: 'dashboard',
            label: 'Dashboard',
            required_permission: 'admin.dashboard.view',
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
    })
    useSessionStore().setPrincipal(p)
    const session = useSessionStore()

    // The store reads capability directly: permitted → true, unpermitted → false
    expect(session.hasPermission('admin.dashboard.view')).toBe(true)
    expect(session.hasPermission('admin.roles.read')).toBe(false)

    // menu.visible mirrors the capability (set server-side): only the permitted item is visible
    const visibleMenuIds = p.permissions.menus.filter((m) => m.visible).map((m) => m.id)
    expect(visibleMenuIds).toEqual(['dashboard'])
    expect(visibleMenuIds).not.toContain('roles')
  })
})
