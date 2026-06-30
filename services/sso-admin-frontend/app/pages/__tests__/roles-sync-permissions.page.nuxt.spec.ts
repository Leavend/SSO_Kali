// *.nuxt.spec.ts → 'nuxt' env. The page's sync-permissions flow is the unit under
// test: stub matrix emits toggle/save, the REAL PrivilegedActionDialog renders the
// impact + confirm, and the service/runner/list are mocked for deterministic branches.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import idLocale from '@/locales/id.json' // default locale is 'id' → assert the rendered copy
import type {
  AdminPermission,
  AdminRole,
  RoleMutationResponse,
  SyncPermissionsPayload,
} from '@/types/users.types'
import type { PrivilegedActionFailure, PrivilegedActionStatus } from '@/lib/users/privileged-action'

// --- fixtures ---------------------------------------------------------------
const EDITOR: AdminRole = {
  id: 7,
  slug: 'editor',
  name: 'Editor',
  description: 'Content editor',
  is_system: false,
  permissions: [{ slug: 'users.read', name: 'Read users', category: 'users' }],
  user_count: 4,
  users_count: 4,
}
const SYSTEM: AdminRole = {
  id: 1,
  slug: 'platform-admin',
  name: 'Platform Admin',
  description: null,
  is_system: true,
  permissions: [{ slug: 'users.read', name: 'Read users', category: 'users' }],
  user_count: 2,
  users_count: 2,
}
const PERMISSIONS: readonly AdminPermission[] = [
  { slug: 'users.read', name: 'Read users', description: 'Read user records', category: 'users' },
  {
    slug: 'clients.read',
    name: 'Read clients',
    description: 'Read OIDC clients',
    category: 'clients',
  },
]

// --- service seam -----------------------------------------------------------
const syncPermissionsMock =
  vi.fn<(slug: string, payload: SyncPermissionsPayload) => Promise<RoleMutationResponse>>()
vi.mock('@/services/roles.api', () => ({
  rolesApi: {
    list: vi.fn<() => Promise<unknown>>(),
    permissions: vi.fn<() => Promise<unknown>>(),
    store: vi.fn<(p: unknown) => Promise<unknown>>(),
    update: vi.fn<(s: string, p: unknown) => Promise<unknown>>(),
    syncPermissions: syncPermissionsMock,
    destroy: vi.fn<(s: string) => Promise<unknown>>(),
  },
}))

// --- list + catalog composables --------------------------------------------
const rolesRef = ref<readonly AdminRole[] | null>([EDITOR, SYSTEM])
const refreshMock = vi.fn<() => Promise<void>>(async () => {})
vi.mock('@/composables/useRolesList', () => ({
  useRolesList: () => ({
    roles: rolesRef,
    filtered: computed(() => rolesRef.value ?? []),
    paged: computed(() => rolesRef.value ?? []),
    total: computed(() => rolesRef.value?.length ?? 0),
    filteredTotal: computed(() => rolesRef.value?.length ?? 0),
    pageCount: computed(() => 1),
    page: ref(1),
    query: ref(''),
    viewState: computed(() => 'ready' as const),
    isStale: computed(() => false),
    requestId: computed(() => null),
    pending: ref(false),
    refresh: refreshMock,
  }),
}))
vi.mock('@/composables/usePermissionCatalog', () => ({
  usePermissionCatalog: () => ({
    permissions: ref(PERMISSIONS),
    viewState: computed(() => 'ready' as const),
    isStale: computed(() => false),
    requestId: computed(() => null),
    pending: ref(false),
    refresh: vi.fn<() => Promise<void>>(async () => {}),
  }),
}))

// --- session store ----------------------------------------------------------
// `roles` is the acting principal's role set (drives the self-lockout guard);
// ensureSession returns a SessionEnsureResult string so the re-verify path can
// be exercised. Both are mutated per-test.
const hasPermissionMock = vi.fn<(p: string) => boolean>(() => true)
const principalRoles = ref<readonly string[]>([])
const ensureSessionMock = vi.fn<(force?: boolean) => Promise<string>>(async () => 'authenticated')
vi.mock('@/stores/session.store', () => ({
  useSessionStore: () => ({
    hasPermission: hasPermissionMock,
    hasEveryPermission: () => true,
    ensureSession: ensureSessionMock,
    get roles() {
      return principalRoles.value
    },
    principal: ref(null),
  }),
}))

// --- shared privileged-action runner ---------------------------------------
const status = ref<PrivilegedActionStatus>('idle')
const isSubmitting = ref(false)
const failure = ref<PrivilegedActionFailure | null>(null)
const stepUpUrl = ref<string | null>(null)
const runMock = vi.fn<(runner: () => Promise<unknown>) => Promise<unknown>>(async (runner) => {
  status.value = 'submitting'
  isSubmitting.value = true
  try {
    const data = await runner()
    status.value = 'success'
    return data
  } finally {
    isSubmitting.value = false
  }
})
const resetMock = vi.fn<() => void>(() => {
  status.value = 'idle'
  failure.value = null
})
vi.mock('@/composables/usePrivilegedAction', () => ({
  usePrivilegedAction: () => ({
    status,
    isSubmitting: computed(() => isSubmitting.value),
    failure,
    requestId: computed(() => failure.value?.requestId ?? null),
    auditEventId: computed(() => failure.value?.auditEventId ?? null),
    fieldErrors: computed(() => failure.value?.fieldErrors ?? {}),
    stepUpUrl,
    run: runMock,
    reset: resetMock,
  }),
}))

// --- stub the matrix / table / form (covered in 7.5/7.6/7.8) ---------------
// Matrix stub emits the toggle/save the page wires; it never emits save for a
// system role (system columns render a badge, not a switch — Task 7.6).
vi.mock('@/components/roles/RoleMatrix.vue', () => ({
  default: defineComponent({
    name: 'RoleMatrixStub',
    emits: ['toggle', 'save'],
    setup(_, { emit }) {
      return () =>
        h('div', { 'data-testid': 'role-matrix-stub' }, [
          h(
            'button',
            {
              'data-testid': 'stub-grant-clients',
              onClick: () =>
                emit('toggle', {
                  roleSlug: 'editor',
                  permissionSlug: 'clients.read',
                  granted: true,
                }),
            },
            'grant',
          ),
          h(
            'button',
            {
              'data-testid': 'stub-revoke-users',
              onClick: () =>
                emit('toggle', {
                  roleSlug: 'editor',
                  permissionSlug: 'users.read',
                  granted: false,
                }),
            },
            'revoke',
          ),
          h(
            'button',
            { 'data-testid': 'stub-save', onClick: () => emit('save', 'editor') },
            'save',
          ),
        ])
    },
  }),
}))
vi.mock('@/components/roles/RolesTable.vue', () => ({
  default: defineComponent({ name: 'RolesTableStub', setup: () => () => h('div', 'roles-table') }),
}))
vi.mock('@/components/roles/RoleFormDialog.vue', () => ({
  default: defineComponent({ name: 'RoleFormDialogStub', setup: () => () => null }),
}))

const navigateMock = vi.hoisted(() => vi.fn<() => Promise<void>>(async () => {}))
mockNuxtImport('navigateTo', () => navigateMock)
// reverifySelf reads these auto-imports (mirror UserRoleAssignment.nuxt.spec).
mockNuxtImport('useRoute', () => () => ({ fullPath: '/roles' }))
mockNuxtImport('useRequestURL', () => () => new URL('https://admin-sso.example/roles'))
// app.baseURL is consumed by Nuxt's own router plugin, so the stub must keep it
// alongside the public.basePath reverifySelf reads (mirror UserRoleAssignment.nuxt.spec).
mockNuxtImport('useRuntimeConfig', () => () => ({
  app: { baseURL: '/' },
  public: { basePath: '/' },
}))

const RolesPage = (await import('../roles.vue')).default

function failWith(s: PrivilegedActionFailure): void {
  runMock.mockImplementationOnce(async () => {
    status.value = s.status
    failure.value = s
    stepUpUrl.value = s.stepUpUrl
    isSubmitting.value = false
    return null
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  rolesRef.value = [EDITOR, SYSTEM]
  status.value = 'idle'
  isSubmitting.value = false
  failure.value = null
  stepUpUrl.value = null
  hasPermissionMock.mockReturnValue(true)
  principalRoles.value = [] // not self-affecting by default
  ensureSessionMock.mockResolvedValue('authenticated')
  syncPermissionsMock.mockResolvedValue({
    role: { ...EDITOR, permissions: [...EDITOR.permissions] },
  })
})
afterEach(() => vi.clearAllMocks())

async function openConfirm(wrapper: Awaited<ReturnType<typeof mountSuspended>>) {
  await wrapper.find('[data-testid="stub-grant-clients"]').trigger('click')
  await wrapper.find('[data-testid="stub-save"]').trigger('click')
  await wrapper.vm.$nextTick()
}

describe('roles page — sync-permissions confirm', () => {
  it('save opens the confirm dialog with the impact summary, and calls no API yet', async () => {
    const wrapper = await mountSuspended(RolesPage)
    await openConfirm(wrapper)
    const impact = wrapper.find('[data-testid="privileged-action-impact"]')
    expect(impact.exists()).toBe(true)
    expect(impact.text()).toContain('Editor') // {target} = role name
    expect(impact.text()).toContain('4') // affectedUsers = user_count
    expect(syncPermissionsMock).not.toHaveBeenCalled()
    expect(runMock).not.toHaveBeenCalled()
  })

  it('4.1 confirm → PUT the full sorted pending set, then refresh + success notice + clean dialog', async () => {
    const wrapper = await mountSuspended(RolesPage)
    await openConfirm(wrapper)
    await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()

    expect(syncPermissionsMock).toHaveBeenCalledTimes(1)
    expect(syncPermissionsMock).toHaveBeenCalledWith('editor', {
      permission_slugs: ['clients.read', 'users.read'], // sorted replace body
    })
    expect(refreshMock).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="roles-action-success"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="privileged-action-impact"]').exists()).toBe(false) // dialog closed
  })

  it('empty selection ([]) is allowed and clears all permissions', async () => {
    const wrapper = await mountSuspended(RolesPage)
    await wrapper.find('[data-testid="stub-revoke-users"]').trigger('click') // pending → {}
    await wrapper.find('[data-testid="stub-save"]').trigger('click')
    await wrapper.vm.$nextTick()
    await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(syncPermissionsMock).toHaveBeenCalledWith('editor', { permission_slugs: [] })
  })

  it('cancel calls no API and closes the dialog', async () => {
    const wrapper = await mountSuspended(RolesPage)
    await openConfirm(wrapper)
    await wrapper.find('[data-testid="privileged-action-cancel"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(syncPermissionsMock).not.toHaveBeenCalled()
    expect(refreshMock).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="privileged-action-impact"]').exists()).toBe(false)
  })

  it('4.2 forbidden / 403 → safe error + redacted REF in the dialog, no refresh', async () => {
    failWith({
      status: 'forbidden',
      requestId: 'admin-req-DENIED42',
      auditEventId: null,
      fieldErrors: {},
      stepUpUrl: null,
    })
    const wrapper = await mountSuspended(RolesPage)
    await openConfirm(wrapper)
    await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="privileged-action-error"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('REF-')
    expect(wrapper.text()).not.toContain('admin-req-DENIED42') // raw id redacted
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('4.3 unauthenticated / 401 → safe error, no refresh', async () => {
    failWith({
      status: 'unauthenticated',
      requestId: null,
      auditEventId: null,
      fieldErrors: {},
      stepUpUrl: null,
    })
    const wrapper = await mountSuspended(RolesPage)
    await openConfirm(wrapper)
    await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="privileged-action-error"]').exists()).toBe(true)
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('4.6 validation / 422 → safe error copy, no refresh, no raw exception', async () => {
    failWith({
      status: 'invalid',
      requestId: 'admin-req-VAL',
      auditEventId: null,
      fieldErrors: { permission_slugs: ['Unknown permission.'] },
      stepUpUrl: null,
    })
    const wrapper = await mountSuspended(RolesPage)
    await openConfirm(wrapper)
    await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="privileged-action-error"]').exists()).toBe(true)
    expect(wrapper.text()).not.toMatch(/SQLSTATE|stack trace|Bearer/i)
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('4.7 step-up / 428 → step-up link to step_up_url in the dialog, no refresh', async () => {
    failWith({
      status: 'step_up_required',
      requestId: null,
      auditEventId: null,
      fieldErrors: {},
      stepUpUrl: '/auth/login?prompt=login&max_age=0',
    })
    const wrapper = await mountSuspended(RolesPage)
    await openConfirm(wrapper)
    await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
    await wrapper.vm.$nextTick()
    const link = wrapper.find('[data-testid="privileged-action-stepup"] a')
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toBe('/auth/login?prompt=login&max_age=0')
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('4.5 rate limit / 429 + 4.8 5xx → safe copy + REF, no refresh', async () => {
    for (const s of ['rate_limited', 'error'] as const) {
      failWith({
        status: s,
        requestId: 'admin-req-X',
        auditEventId: null,
        fieldErrors: {},
        stepUpUrl: null,
      })
      const wrapper = await mountSuspended(RolesPage)
      await openConfirm(wrapper)
      await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
      await wrapper.vm.$nextTick()
      expect(wrapper.find('[data-testid="privileged-action-error"]').exists()).toBe(true)
      expect(wrapper.text()).toContain('REF-')
      expect(wrapper.text()).not.toContain('admin-req-X')
      expect(refreshMock).not.toHaveBeenCalled()
    }
  })

  it('4.10 leaves no stale submitting/disabled after an error (confirm stays usable)', async () => {
    failWith({
      status: 'error',
      requestId: null,
      auditEventId: null,
      fieldErrors: {},
      stepUpUrl: null,
    })
    const wrapper = await mountSuspended(RolesPage)
    await openConfirm(wrapper)
    await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
    await wrapper.vm.$nextTick()
    const confirm = wrapper.find('[data-testid="privileged-action-confirm"]')
    expect(confirm.exists()).toBe(true) // dialog stays open through the failure
    expect(confirm.attributes('disabled')).toBeUndefined()
  })

  it('4.9 surfaces an audit/correlation id REDACTED (REF-…), never raw', async () => {
    failWith({
      status: 'error',
      requestId: 'admin-req-AUD',
      auditEventId: 'audit-XYZ',
      fieldErrors: {},
      stepUpUrl: null,
    })
    const wrapper = await mountSuspended(RolesPage)
    await openConfirm(wrapper)
    await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('REF-')
    expect(wrapper.text()).not.toContain('admin-req-AUD')
    expect(wrapper.text()).not.toContain('audit-XYZ')
  })

  describe('self-lockout guard', () => {
    it('self-affecting save shows a distinct self-warning in the confirm dialog', async () => {
      principalRoles.value = ['editor'] // the acting admin holds the edited role
      const wrapper = await mountSuspended(RolesPage)
      await openConfirm(wrapper)
      const impact = wrapper.find('[data-testid="privileged-action-impact"]')
      expect(impact.exists()).toBe(true)
      expect(impact.text()).toContain(idLocale.roles.self_affect_warn)
    })

    it('non-self save does NOT show the self-warning and never re-verifies the session', async () => {
      principalRoles.value = ['some-other-role']
      const wrapper = await mountSuspended(RolesPage)
      await openConfirm(wrapper)
      expect(wrapper.find('[data-testid="privileged-action-impact"]').text()).not.toContain(
        idLocale.roles.self_affect_warn,
      )
      await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
      await wrapper.vm.$nextTick()
      // The page's useAsyncData bootstrap calls ensureSession() (no args); the guard
      // would call ensureSession(true). Non-self must NOT trigger the re-verify.
      expect(ensureSessionMock).not.toHaveBeenCalledWith(true)
      expect(navigateMock).not.toHaveBeenCalled()
    })

    it('self-affecting success re-verifies the principal and stays put while authenticated', async () => {
      principalRoles.value = ['editor']
      ensureSessionMock.mockResolvedValue('authenticated')
      const wrapper = await mountSuspended(RolesPage)
      await openConfirm(wrapper)
      await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
      await flushPromises() // run → refresh → reverifySelf → ensureSession chain
      expect(syncPermissionsMock).toHaveBeenCalledTimes(1)
      expect(ensureSessionMock).toHaveBeenCalledWith(true)
      expect(navigateMock).not.toHaveBeenCalled()
      expect(wrapper.find('[data-testid="roles-action-success"]').exists()).toBe(true)
    })

    it('self-affecting success that drops the session re-routes via the bootstrap resolver', async () => {
      principalRoles.value = ['editor']
      // persistent (not Once): the useAsyncData bootstrap consumes the first call,
      // so the guard's re-verify must also resolve 'unauthenticated'.
      ensureSessionMock.mockResolvedValue('unauthenticated')
      const wrapper = await mountSuspended(RolesPage)
      await openConfirm(wrapper)
      await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
      await flushPromises() // run → refresh → reverifySelf → ensureSession → navigateTo
      expect(ensureSessionMock).toHaveBeenCalledWith(true)
      expect(navigateMock).toHaveBeenCalled() // resolveBootstrapFailure → login/route
    })
  })

  it('renders no token or raw PII shape in the page output', async () => {
    const wrapper = await mountSuspended(RolesPage)
    await openConfirm(wrapper)
    const html = wrapper.html()
    expect(html).not.toMatch(/access_token|refresh_token|id_token|Bearer/)
    expect(html).not.toMatch(/\b\d{16}\b|\b\d{18}\b|\b\d{10}\b/) // raw NIK/NIP/NISN shapes
  })
})
