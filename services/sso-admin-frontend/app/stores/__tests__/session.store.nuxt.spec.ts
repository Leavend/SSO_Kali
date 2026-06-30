// Named *.nuxt.spec.ts so defineVitestConfig routes it to the 'nuxt'
// environment where mockNuxtImport / useNuxtApp are natively available.
// Per brief: "if the test needs the Nuxt runtime (useState) name it *.nuxt.spec.ts"
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { useSessionStore } from '../session.store'
import { ApiError } from '@/lib/api/api-client'
import { authApi } from '@/services/auth.api'
import type { AdminPrincipalResponse } from '@/types/auth.types'

// ---------------------------------------------------------------------------
// Module mocks — hoisted before imports by Vitest
// ---------------------------------------------------------------------------

vi.mock('@/services/auth.api', () => ({
  authApi: { getPrincipal: vi.fn<() => Promise<AdminPrincipalResponse>>() },
}))

// Replace useState with a plain ref factory so each useSessionStore() call
// gets fresh, isolated refs. Tests focus on store logic; SSR hydration safety
// is proven by types (no token/PII fields on the interface) + the explicit
// "no-token-in-state" test below.
mockNuxtImport('useState', () => {
  return <T>(_key: string, init?: () => T) => ref(init?.())
})

// Provide runtimeConfig so api-client (imported for ApiError) does not throw
// when the Nuxt app boots.
mockNuxtImport('useRuntimeConfig', () => {
  return () => ({
    app: { baseURL: '/' },
    public: {
      mockApi: 'false',
      ssoBaseUrl: 'https://sso.example.test',
      ssoWidgetBaseUrl: '',
      docsBaseUrl: 'https://docs.example.test',
      basePath: '/',
    },
  })
})

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

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
      acr: 'urn:loa:2',
      mfa_enforced: true,
      mfa_verified: true,
    },
  },
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('useSessionStore (Nuxt useState)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // -- bootstrap / happy path -----------------------------------------------

  it('bootstraps the admin session from the BFF principal endpoint', async () => {
    vi.mocked(authApi.getPrincipal).mockResolvedValue(adminPrincipal)
    const session = useSessionStore()
    await expect(session.ensureSession()).resolves.toBe('authenticated')
    expect(session.isAuthenticated).toBe(true)
    expect(session.roles).toEqual(['admin'])
    expect(session.user?.email).toBe('admin@dev-sso.local')
    expect(session.hasPermission('admin.dashboard.view')).toBe(true)
    expect(session.hasEveryPermission(['admin.dashboard.view'])).toBe(true)
  })

  // -- failure mapping -------------------------------------------------------

  it('returns unauthenticated when the principal endpoint returns 401', async () => {
    vi.mocked(authApi.getPrincipal).mockRejectedValue(new ApiError(401, 'No active SSO session.'))
    const session = useSessionStore()
    await expect(session.ensureSession()).resolves.toBe('unauthenticated')
    expect(session.isAuthenticated).toBe(false)
    expect(session.user).toBeNull()
  })

  it('maps explicit MFA enrollment denials', async () => {
    vi.mocked(authApi.getPrincipal).mockRejectedValue(
      new ApiError(403, 'MFA', 'mfa_enrollment_required'),
    )
    const session = useSessionStore()
    await expect(session.ensureSession()).resolves.toBe('mfa_enrollment_required')
  })

  it('maps step-up (428) and reauth_required to step_up_required', async () => {
    const session = useSessionStore()
    vi.mocked(authApi.getPrincipal).mockRejectedValue(
      new ApiError(428, 'Step up', 'step_up_required'),
    )
    await expect(session.ensureSession()).resolves.toBe('step_up_required')
    vi.mocked(authApi.getPrincipal).mockRejectedValue(
      new ApiError(401, 'Fresh auth', 'reauth_required'),
    )
    await expect(session.ensureSession(true)).resolves.toBe('step_up_required')
  })

  it('keeps generic 403 mapped to forbidden', async () => {
    vi.mocked(authApi.getPrincipal).mockRejectedValue(new ApiError(403, 'Forbidden', 'forbidden'))
    await expect(useSessionStore().ensureSession()).resolves.toBe('forbidden')
  })

  it('maps invalid_upstream_response to api_unreachable', async () => {
    vi.mocked(authApi.getPrincipal).mockRejectedValue(
      new ApiError(502, 'bad', 'invalid_upstream_response'),
    )
    await expect(useSessionStore().ensureSession()).resolves.toBe('api_unreachable')
  })

  it('returns error without collapsing network failures into unauthenticated', async () => {
    vi.mocked(authApi.getPrincipal).mockRejectedValue(new Error('network down'))
    const session = useSessionStore()
    await expect(session.ensureSession()).resolves.toBe('error')
    expect(session.user).toBeNull()
  })

  // -- dedup / bootstrap -----------------------------------------------------

  it('reuses a loaded principal without a second request via startSessionBootstrap', async () => {
    vi.mocked(authApi.getPrincipal).mockResolvedValue(adminPrincipal)
    const session = useSessionStore()
    await session.ensureSession()
    await expect(session.startSessionBootstrap()).resolves.toBe('authenticated')
    expect(authApi.getPrincipal).toHaveBeenCalledTimes(1)
  })

  it('deduplicates in-flight bootstrap requests', async () => {
    let resolveFn!: (v: AdminPrincipalResponse) => void
    const delayed = new Promise<AdminPrincipalResponse>((resolve) => {
      resolveFn = resolve
    })
    vi.mocked(authApi.getPrincipal).mockReturnValue(delayed)
    const session = useSessionStore()
    const p1 = session.startSessionBootstrap()
    const p2 = session.startSessionBootstrap()
    expect(authApi.getPrincipal).toHaveBeenCalledTimes(1)
    resolveFn(adminPrincipal)
    const [r1, r2] = await Promise.all([p1, p2])
    expect(r1).toBe('authenticated')
    expect(r2).toBe('authenticated')
    expect(authApi.getPrincipal).toHaveBeenCalledTimes(1)
  })

  // -- SSR-safe hydration proof ----------------------------------------------

  it('SSR-safe hydration: no token, secret, or raw government PII in store state', async () => {
    vi.mocked(authApi.getPrincipal).mockResolvedValue(adminPrincipal)
    const session = useSessionStore()
    await session.ensureSession()

    // user ref must not carry token-like or raw-PII fields
    const userValue = session.user as Record<string, unknown>
    expect(userValue).not.toHaveProperty('access_token')
    expect(userValue).not.toHaveProperty('refresh_token')
    expect(userValue).not.toHaveProperty('id_token')
    expect(userValue).not.toHaveProperty('client_secret')
    expect(userValue).not.toHaveProperty('nik')
    expect(userValue).not.toHaveProperty('nip')
    expect(userValue).not.toHaveProperty('nisn')

    // principal ref must not carry token-like or raw-PII fields
    const principalValue = session.principal as Record<string, unknown>
    expect(principalValue).not.toHaveProperty('access_token')
    expect(principalValue).not.toHaveProperty('refresh_token')
    expect(principalValue).not.toHaveProperty('id_token')
    expect(principalValue).not.toHaveProperty('client_secret')
    expect(principalValue).not.toHaveProperty('nik')
    expect(principalValue).not.toHaveProperty('nip')
    expect(principalValue).not.toHaveProperty('nisn')

    // only safe display fields are present in user
    expect(userValue).toHaveProperty('email', 'admin@dev-sso.local')
    expect(userValue).toHaveProperty('display_name', 'Admin User')
    expect(userValue).toHaveProperty('roles')
    expect(userValue).toHaveProperty('subject_id')
  })

  // -- permission helpers ---------------------------------------------------

  it('hasPermission returns false for unknown permissions', async () => {
    vi.mocked(authApi.getPrincipal).mockResolvedValue(adminPrincipal)
    const session = useSessionStore()
    await session.ensureSession()
    expect(session.hasPermission('admin.users.delete')).toBe(false)
    expect(session.hasEveryPermission(['admin.dashboard.view', 'admin.users.delete'])).toBe(false)
  })

  // -- mutation helpers ------------------------------------------------------

  it('clear() resets all state', async () => {
    vi.mocked(authApi.getPrincipal).mockResolvedValue(adminPrincipal)
    const session = useSessionStore()
    await session.ensureSession()
    expect(session.isAuthenticated).toBe(true)
    session.clear()
    expect(session.isAuthenticated).toBe(false)
    expect(session.user).toBeNull()
    expect(session.principal).toBeNull()
    expect(session.status).toBe('idle')
    expect(session.lastEnsureResult).toBeNull()
  })

  it('setUser directly sets a user and marks ready', () => {
    const session = useSessionStore()
    session.setUser({
      id: 1,
      subject_id: 'sub_test',
      email: 'test@admin.local',
      display_name: 'Test Admin',
      roles: ['super_admin'],
    })
    expect(session.isAuthenticated).toBe(true)
    expect(session.status).toBe('ready')
    expect(session.roles).toEqual(['super_admin'])
  })

  it('setPrincipal populates both principal and derived user', () => {
    const session = useSessionStore()
    session.setPrincipal(adminPrincipal.principal)
    expect(session.principal).toStrictEqual(adminPrincipal.principal)
    expect(session.user?.email).toBe('admin@dev-sso.local')
    expect(session.roles).toEqual(['admin'])
    expect(session.permissions['admin.dashboard.view']).toBe(true)
  })

  // -- status transitions ---------------------------------------------------

  it('status transitions through loading → ready on ensureSession', async () => {
    let resolveFn!: (v: AdminPrincipalResponse) => void
    const delayed = new Promise<AdminPrincipalResponse>((resolve) => {
      resolveFn = resolve
    })
    vi.mocked(authApi.getPrincipal).mockReturnValue(delayed)
    const session = useSessionStore()
    expect(session.status).toBe('idle')
    const ensurePromise = session.ensureSession()
    // Status should be 'loading' synchronously after calling ensureSession
    // but before await — the assignment happens before the first awaited call
    await Promise.resolve() // flush microtask queue
    expect(session.status).toBe('loading')
    resolveFn(adminPrincipal)
    await ensurePromise
    expect(session.status).toBe('ready')
  })
})
