// *.nuxt.spec.ts → 'nuxt' env: mountSuspended runs roles.vue's async setup
// (useAsyncData principal + useI18n + definePageMeta). The list/catalog
// composables, session store, navigateTo and i18n are mocked; the privileged-
// action runner + dialog are REAL so the delete matrix is exercised genuinely,
// and only rolesApi.destroy is a spy.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { type DOMWrapper, flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import enLocale from '@/locales/en.json'
import { ApiError } from '@/lib/api/api-client'
import type { AdminRole, AdminPermission, RoleDeleteResponse } from '@/types/users.types'

// --- service seam: only destroy matters here; the rest are inert spies -------
const destroyMock = vi.fn<(slug: string) => Promise<RoleDeleteResponse>>()
vi.mock('@/services/roles.api', () => ({
  rolesApi: {
    list: vi.fn<() => Promise<unknown>>(),
    permissions: vi.fn<() => Promise<unknown>>(),
    store: vi.fn<(p: unknown) => Promise<unknown>>(),
    update: vi.fn<(s: string, p: unknown) => Promise<unknown>>(),
    syncPermissions: vi.fn<(s: string, p: unknown) => Promise<unknown>>(),
    destroy: destroyMock,
  },
}))

// --- list composable (ready state with one custom + one system role) --------
const CUSTOM_ROLE: AdminRole = {
  id: 2,
  slug: 'support-agent',
  name: 'Support Agent',
  description: 'Front-line support operators',
  is_system: false,
  permissions: [{ slug: 'users.read', name: 'Read users', category: 'users' }],
  user_count: 4,
  users_count: 4,
}
const SYSTEM_ROLE: AdminRole = {
  id: 1,
  slug: 'platform-admin',
  name: 'Platform Admin',
  description: 'Full administrative access',
  is_system: true,
  permissions: [{ slug: 'users.read', name: 'Read users', category: 'users' }],
  user_count: 3,
  users_count: 3,
}
const PERMISSIONS: readonly AdminPermission[] = [
  {
    slug: 'users.read',
    name: 'Read users',
    description: 'Allow reading user records',
    category: 'users',
  },
]
const rolesRef = ref<readonly AdminRole[]>([CUSTOM_ROLE, SYSTEM_ROLE])
const refreshMock = vi.fn<() => Promise<void>>(async () => {})
vi.mock('@/composables/useRolesList', () => ({
  useRolesList: () => ({
    roles: rolesRef,
    filtered: computed(() => rolesRef.value),
    paged: computed(() => rolesRef.value),
    total: computed(() => rolesRef.value.length),
    filteredTotal: computed(() => rolesRef.value.length),
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

// --- session store: mutable capability allow-list drives the double gate -----
// `roles` is the acting principal's role set (self-lockout guard); ensureSession
// returns a SessionEnsureResult string so the self re-verify path can be driven.
let permitted: string[] = []
let principalRoles: readonly string[] = []
const ensureSessionMock = vi.fn<(force?: boolean) => Promise<string>>(async () => 'authenticated')
vi.mock('@/stores/session.store', () => ({
  useSessionStore: () => ({
    principal: { display_name: 'Admin Sentinel' },
    ensureSession: ensureSessionMock,
    hasPermission: (p: string) => permitted.includes(p),
    get roles() {
      return principalRoles
    },
  }),
}))

// --- i18n pinned to en so assertions use literal English strings ------------
vi.mock('@/composables/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      let val: unknown = enLocale
      for (const part of key.split('.')) val = (val as Record<string, unknown>)?.[part]
      if (typeof val !== 'string') return key
      if (!params) return val
      return val.replace(/\{(\w+)\}/gu, (_: string, k: string) => String(params[k] ?? ''))
    },
  }),
}))

const navigateMock = vi.hoisted(() => vi.fn<(...a: unknown[]) => Promise<void>>(async () => {}))
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

const BOTH = ['admin.roles.read', 'admin.roles.write', 'admin.sessions.terminate']
type Wrapper = Awaited<ReturnType<typeof mountSuspended>>

function deleteButtons(wrapper: Wrapper) {
  return wrapper
    .findAll('button')
    .filter((b: DOMWrapper<Element>) => b.text() === enLocale.roles.btn_delete)
}

async function openDeleteDialog(wrapper: Wrapper): Promise<void> {
  const buttons = deleteButtons(wrapper)
  expect(buttons.length).toBe(1)
  await buttons[0]!.trigger('click')
  await flushPromises()
}

beforeEach(() => {
  permitted = [...BOTH]
  principalRoles = [] // not self-affecting by default
  rolesRef.value = [CUSTOM_ROLE, SYSTEM_ROLE]
  destroyMock.mockReset()
  refreshMock.mockReset()
  ensureSessionMock.mockReset()
  ensureSessionMock.mockResolvedValue('authenticated')
})
afterEach(() => {
  vi.clearAllMocks()
})

describe('roles delete — double gate + system-role protection', () => {
  it('shows exactly one delete affordance (custom role only) with BOTH capabilities', async () => {
    const wrapper = await mountSuspended(RolesPage)
    // one custom + one system role → system role must NOT expose delete
    expect(deleteButtons(wrapper).length).toBe(1)
  })

  it('hides delete when admin.sessions.terminate is missing (single gate is not enough)', async () => {
    permitted = ['admin.roles.read', 'admin.roles.write']
    const wrapper = await mountSuspended(RolesPage)
    expect(deleteButtons(wrapper).length).toBe(0)
  })

  it('hides delete when admin.roles.write is missing', async () => {
    permitted = ['admin.roles.read', 'admin.sessions.terminate']
    const wrapper = await mountSuspended(RolesPage)
    expect(deleteButtons(wrapper).length).toBe(0)
  })

  it('hides delete entirely for a read-only admin', async () => {
    permitted = ['admin.roles.read']
    const wrapper = await mountSuspended(RolesPage)
    expect(deleteButtons(wrapper).length).toBe(0)
  })
})

describe('roles delete — danger confirm lifecycle', () => {
  it('opens the danger dialog naming the target + blast radius and calls no API before confirm', async () => {
    const wrapper = await mountSuspended(RolesPage)
    await openDeleteDialog(wrapper)
    const impact = wrapper.find('[data-testid="privileged-action-impact"]')
    expect(impact.exists()).toBe(true)
    expect(impact.text()).toContain('Support Agent')
    expect(impact.text()).toContain('4') // role.user_count blast radius
    const confirm = wrapper.find('[data-testid="privileged-action-confirm"]')
    expect(confirm.exists()).toBe(true)
    expect(confirm.text()).toBe(enLocale.common.btn_delete)
    expect(destroyMock).not.toHaveBeenCalled()
  })

  it('cancel calls no API and dismisses the dialog', async () => {
    const wrapper = await mountSuspended(RolesPage)
    await openDeleteDialog(wrapper)
    await wrapper.find('[data-testid="privileged-action-cancel"]').trigger('click')
    await flushPromises()
    expect(destroyMock).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="privileged-action-confirm"]').exists()).toBe(false)
  })

  it('confirm deletes the role, refreshes the list, and surfaces the success message', async () => {
    destroyMock.mockResolvedValue({ deleted: true, role_slug: 'support-agent' })
    const wrapper = await mountSuspended(RolesPage)
    await openDeleteDialog(wrapper)
    await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
    await flushPromises()
    expect(destroyMock).toHaveBeenCalledWith('support-agent')
    expect(refreshMock).toHaveBeenCalledTimes(1)
    const success = wrapper.find('[data-testid="roles-action-success"]')
    expect(success.exists()).toBe(true)
    expect(success.text()).toBe(enLocale.roles.roles_delete_success)
    expect(wrapper.find('[data-testid="privileged-action-confirm"]').exists()).toBe(false)
  })
})

describe('roles delete — self-lockout guard', () => {
  it('shows the distinct self-warning when deleting a role the acting admin holds', async () => {
    principalRoles = ['support-agent']
    const wrapper = await mountSuspended(RolesPage)
    await openDeleteDialog(wrapper)
    const impact = wrapper.find('[data-testid="privileged-action-impact"]')
    expect(impact.text()).toContain(enLocale.roles.self_affect_warn)
  })

  it('non-self delete shows no self-warning and never re-verifies the session', async () => {
    principalRoles = ['some-other-role']
    destroyMock.mockResolvedValue({ deleted: true, role_slug: 'support-agent' })
    const wrapper = await mountSuspended(RolesPage)
    await openDeleteDialog(wrapper)
    expect(wrapper.find('[data-testid="privileged-action-impact"]').text()).not.toContain(
      enLocale.roles.self_affect_warn,
    )
    await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
    await flushPromises()
    // useAsyncData bootstrap calls ensureSession() (no args); the guard would call
    // ensureSession(true). Non-self must NOT trigger the re-verify.
    expect(ensureSessionMock).not.toHaveBeenCalledWith(true)
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('self-affecting success re-verifies the principal and stays put while authenticated', async () => {
    principalRoles = ['support-agent']
    destroyMock.mockResolvedValue({ deleted: true, role_slug: 'support-agent' })
    ensureSessionMock.mockResolvedValue('authenticated')
    const wrapper = await mountSuspended(RolesPage)
    await openDeleteDialog(wrapper)
    await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
    await flushPromises()
    expect(destroyMock).toHaveBeenCalledWith('support-agent')
    expect(refreshMock).toHaveBeenCalledTimes(1)
    expect(ensureSessionMock).toHaveBeenCalledWith(true)
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('self-affecting success that drops the session re-routes via the bootstrap resolver', async () => {
    principalRoles = ['support-agent']
    destroyMock.mockResolvedValue({ deleted: true, role_slug: 'support-agent' })
    // persistent (not Once): the useAsyncData bootstrap consumes the first call,
    // so the guard's re-verify must also resolve 'unauthenticated'.
    ensureSessionMock.mockResolvedValue('unauthenticated')
    const wrapper = await mountSuspended(RolesPage)
    await openDeleteDialog(wrapper)
    await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
    await flushPromises()
    expect(ensureSessionMock).toHaveBeenCalledWith(true)
    expect(navigateMock).toHaveBeenCalled() // resolveBootstrapFailure → login/route
  })
})

describe('roles delete — privileged-action failure matrix (real runner)', () => {
  it.each([401, 403, 419, 429, 500])(
    'surfaces safe copy + a redacted REF for %i without refreshing or going stale',
    async (status) => {
      destroyMock.mockRejectedValue(new ApiError(status, 'boom', undefined, {}, `req-${status}`))
      const wrapper = await mountSuspended(RolesPage)
      await openDeleteDialog(wrapper)
      await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
      await flushPromises()
      const error = wrapper.find('[data-testid="privileged-action-error"]')
      expect(error.exists()).toBe(true)
      expect(error.text()).toContain(enLocale.common.error_generic)
      const ref = wrapper.find('[data-testid="privileged-action-ref"]')
      expect(ref.exists()).toBe(true)
      expect(ref.text()).toMatch(/^REF-/u)
      // no raw correlation id leaks into the surface
      expect(wrapper.html()).not.toContain(`req-${status}`)
      expect(refreshMock).not.toHaveBeenCalled()
      // dialog stays open and the confirm is re-enabled (no stale loading/disabled)
      const confirm = wrapper.find('[data-testid="privileged-action-confirm"]')
      expect(confirm.exists()).toBe(true)
      expect(confirm.attributes('disabled')).toBeUndefined()
    },
  )

  it('maps 422 role_management_failed to safe domain copy (role still has users)', async () => {
    destroyMock.mockRejectedValue(
      new ApiError(422, 'Role still has assigned users.', 'role_management_failed', {}, 'req-422'),
    )
    const wrapper = await mountSuspended(RolesPage)
    await openDeleteDialog(wrapper)
    await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
    await flushPromises()
    const error = wrapper.find('[data-testid="privileged-action-error"]')
    expect(error.exists()).toBe(true)
    expect(error.text()).toContain(enLocale.roles.delete_failed_has_users)
    // raw backend exception string is never rendered
    expect(wrapper.html()).not.toContain('Role still has assigned users.')
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('surfaces the step-up link on 428 and does not refresh', async () => {
    destroyMock.mockRejectedValue(
      new ApiError(
        428,
        'reauth required',
        'step_up_required',
        { step_up_url: 'https://idp.example/step-up' },
        'req-428',
      ),
    )
    const wrapper = await mountSuspended(RolesPage)
    await openDeleteDialog(wrapper)
    await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
    await flushPromises()
    const stepup = wrapper.find('[data-testid="privileged-action-stepup"]')
    expect(stepup.exists()).toBe(true)
    expect(stepup.find('a').attributes('href')).toBe('https://idp.example/step-up')
    // step-up is not a generic error; the error surface stays absent
    expect(wrapper.find('[data-testid="privileged-action-error"]').exists()).toBe(false)
    expect(refreshMock).not.toHaveBeenCalled()
    const confirm = wrapper.find('[data-testid="privileged-action-confirm"]')
    expect(confirm.attributes('disabled')).toBeUndefined()
  })
})
