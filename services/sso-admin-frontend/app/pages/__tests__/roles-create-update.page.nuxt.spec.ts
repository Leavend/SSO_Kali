// *.nuxt.spec.ts → 'nuxt' env. The list/catalog composables, the session store,
// the roles service seam, the shared privileged-action runner and navigateTo are
// mocked so each create/update branch is deterministic. We drive the real
// RoleFormDialog / RolesTable child components via their emitted events.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import RoleFormDialog from '@/components/roles/RoleFormDialog.vue'
import RolesTable from '@/components/roles/RolesTable.vue'
import type {
  AdminRole,
  CreateRolePayload,
  RoleMutationResponse,
  UpdateRolePayload,
} from '@/types/users.types'
import type {
  PrivilegedActionFailure,
  PrivilegedActionFailureStatus,
  PrivilegedActionStatus,
} from '@/lib/users/privileged-action'

const roleA: AdminRole = {
  id: 1,
  slug: 'platform-admin',
  name: 'Platform Admin',
  description: 'Full access',
  is_system: true,
  permissions: [{ slug: 'users.read', name: 'Read users', category: 'users' }],
  user_count: 3,
  users_count: 3,
}
const roleB: AdminRole = {
  id: 2,
  slug: 'support-agent',
  name: 'Support Agent',
  description: 'Tickets',
  is_system: false,
  permissions: [],
  user_count: 4,
  users_count: 4,
}

// --- roles service seam -----------------------------------------------------
const storeMock = vi.fn<(p: CreateRolePayload) => Promise<RoleMutationResponse>>()
const updateMock = vi.fn<(slug: string, p: UpdateRolePayload) => Promise<RoleMutationResponse>>()
vi.mock('@/services/roles.api', () => ({
  rolesApi: {
    list: vi.fn<() => Promise<void>>(),
    permissions: vi.fn<() => Promise<void>>(),
    store: storeMock,
    update: updateMock,
    syncPermissions: vi.fn<() => Promise<void>>(),
    destroy: vi.fn<() => Promise<void>>(),
  },
}))

// --- list / catalog composables ---------------------------------------------
const refreshMock = vi.fn<() => Promise<void>>(async () => {})
vi.mock('@/composables/useRolesList', () => ({
  useRolesList: () => {
    const roles = ref<readonly AdminRole[]>([roleA, roleB])
    return {
      roles,
      filtered: computed(() => roles.value),
      paged: computed(() => roles.value),
      total: computed(() => roles.value.length),
      filteredTotal: computed(() => roles.value.length),
      pageCount: computed(() => 1),
      page: ref(1),
      query: ref(''),
      viewState: computed(() => 'ready' as const),
      isStale: computed(() => false),
      requestId: computed(() => null),
      pending: ref(false),
      refresh: refreshMock,
    }
  },
}))
vi.mock('@/composables/usePermissionCatalog', () => ({
  usePermissionCatalog: () => ({
    permissions: ref([
      { slug: 'users.read', name: 'Read users', description: 'Read', category: 'users' },
    ]),
    viewState: computed(() => 'ready' as const),
    isStale: computed(() => false),
    requestId: computed(() => null),
    pending: ref(false),
    refresh: vi.fn<() => Promise<void>>(),
  }),
}))

// --- session store ----------------------------------------------------------
const hasPermissionMock = vi.fn<(p: string) => boolean>(() => true)
vi.mock('@/stores/session.store', () => ({
  useSessionStore: () => ({
    hasPermission: hasPermissionMock,
    ensureSession: vi.fn<() => Promise<{ display_name: string }>>(async () => ({
      display_name: 'Ops Admin',
    })),
    principal: { display_name: 'Ops Admin' },
  }),
}))

// --- shared privileged-action runner ----------------------------------------
const status = ref<PrivilegedActionStatus>('idle')
const isSubmitting = ref(false)
const failure = ref<PrivilegedActionFailure | null>(null)
const stepUpUrl = ref<string | null>(null)
const runMock = vi.fn<(runner: () => Promise<unknown>) => Promise<unknown>>(async (runner) => {
  status.value = 'submitting'
  isSubmitting.value = true
  failure.value = null
  try {
    const data = await runner()
    status.value = 'success'
    return data
  } catch {
    return null
  } finally {
    isSubmitting.value = false
  }
})
const resetMock = vi.fn<() => void>(() => {
  status.value = 'idle'
  failure.value = null
  stepUpUrl.value = null
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

const navigateMock = vi.hoisted(() => vi.fn<() => Promise<void>>(async () => {}))
mockNuxtImport('navigateTo', () => navigateMock)

const RolesPage = (await import('../roles.vue')).default

const validCreate: CreateRolePayload = {
  slug: 'support-agent',
  name: 'Support Agent',
  description: null,
}
const validUpdate: UpdateRolePayload = { name: 'Renamed', description: null }

// PrivilegedActionFailure.status is the NARROWER PrivilegedActionFailureStatus
// (failure-only); typing the param wide as PrivilegedActionStatus is a TS2322 when
// it is assigned into `failure.value`. The wide PrivilegedActionStatus import stays
// for the `status` ref below.
function failWith(
  partial: Partial<PrivilegedActionFailure> & { status: PrivilegedActionFailureStatus },
): void {
  runMock.mockImplementationOnce(async () => {
    status.value = partial.status
    stepUpUrl.value = partial.stepUpUrl ?? null
    failure.value = {
      status: partial.status,
      requestId: partial.requestId ?? null,
      auditEventId: partial.auditEventId ?? null,
      fieldErrors: partial.fieldErrors ?? {},
      stepUpUrl: partial.stepUpUrl ?? null,
    }
    isSubmitting.value = false
    return null
  })
}

beforeEach(() => {
  status.value = 'idle'
  isSubmitting.value = false
  failure.value = null
  stepUpUrl.value = null
  hasPermissionMock.mockReturnValue(true)
  vi.clearAllMocks()
  storeMock.mockResolvedValue({ role: roleB })
  updateMock.mockResolvedValue({ role: roleB })
})
afterEach(() => vi.clearAllMocks())

describe('roles page — create privileged action', () => {
  it('4.1 success → store called with payload, list refreshed, success notice, dialog closed', async () => {
    const wrapper = await mountSuspended(RolesPage)
    await wrapper.find('[data-testid="roles-create"]').trigger('click')
    await wrapper.vm.$nextTick()
    const dialog = wrapper.findComponent(RoleFormDialog)
    expect(dialog.props('open')).toBe(true)
    expect(dialog.props('mode')).toBe('create')

    dialog.vm.$emit('submit', validCreate)
    await flushPromises()

    expect(storeMock).toHaveBeenCalledWith(validCreate)
    expect(refreshMock).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="roles-action-success"]').exists()).toBe(true)
    expect(wrapper.findComponent(RoleFormDialog).props('open')).toBe(false)
  })

  it('hides the create affordance when the admin lacks admin.roles.write', async () => {
    hasPermissionMock.mockReturnValue(false)
    const wrapper = await mountSuspended(RolesPage)
    expect(wrapper.find('[data-testid="roles-create"]').exists()).toBe(false)
  })

  it('4.2 missing permission / 403 → dialog stays open with safe copy + redacted REF, no refresh', async () => {
    failWith({ status: 'forbidden', requestId: 'admin-req-DENY1' })
    const wrapper = await mountSuspended(RolesPage)
    await wrapper.find('[data-testid="roles-create"]').trigger('click')
    await wrapper.vm.$nextTick()
    wrapper.findComponent(RoleFormDialog).vm.$emit('submit', validCreate)
    await flushPromises()
    const dialog = wrapper.findComponent(RoleFormDialog)
    expect(dialog.props('open')).toBe(true)
    expect(dialog.props('errorMessage')).toBeTruthy()
    expect(refreshMock).not.toHaveBeenCalled()
    expect(wrapper.text()).not.toContain('admin-req-DENY1')
    expect(wrapper.text()).toContain('REF-')
  })

  it('4.3 unauthenticated / 401 → safe session copy in dialog, no refresh', async () => {
    failWith({ status: 'unauthenticated' })
    const wrapper = await mountSuspended(RolesPage)
    await wrapper.find('[data-testid="roles-create"]').trigger('click')
    await wrapper.vm.$nextTick()
    wrapper.findComponent(RoleFormDialog).vm.$emit('submit', validCreate)
    await flushPromises()
    expect(wrapper.findComponent(RoleFormDialog).props('open')).toBe(true)
    expect(wrapper.findComponent(RoleFormDialog).props('errorMessage')).toBeTruthy()
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('4.4 session expired / 419 folds into unauthenticated → safe copy, no refresh', async () => {
    // resolvePrivilegedActionFailure maps 419 → 'unauthenticated'; same surface as 401.
    failWith({ status: 'unauthenticated' })
    const wrapper = await mountSuspended(RolesPage)
    await wrapper.find('[data-testid="roles-create"]').trigger('click')
    await wrapper.vm.$nextTick()
    wrapper.findComponent(RoleFormDialog).vm.$emit('submit', validCreate)
    await flushPromises()
    expect(wrapper.findComponent(RoleFormDialog).props('errorMessage')).toBeTruthy()
    // The privileged create action was attempted exactly once. (`failWith` stubs the
    // shared `runMock`, so the runner — and thus `rolesApi.store` — is bypassed; the
    // attempt is observed on the runner itself, not the API seam behind it.)
    expect(runMock).toHaveBeenCalledTimes(1)
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('4.5 rate limit / 429 → safe copy, no raw exception, no refresh', async () => {
    failWith({ status: 'rate_limited', requestId: 'admin-req-RL' })
    const wrapper = await mountSuspended(RolesPage)
    await wrapper.find('[data-testid="roles-create"]').trigger('click')
    await wrapper.vm.$nextTick()
    wrapper.findComponent(RoleFormDialog).vm.$emit('submit', validCreate)
    await flushPromises()
    expect(wrapper.findComponent(RoleFormDialog).props('errorMessage')).toBeTruthy()
    expect(wrapper.text()).not.toMatch(/SQLSTATE|stack trace|Bearer/i)
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('4.6 validation / 422 → server field errors bind to the dialog, dialog open, no refresh', async () => {
    failWith({ status: 'invalid', fieldErrors: { slug: ['Slug already registered.'] } })
    const wrapper = await mountSuspended(RolesPage)
    await wrapper.find('[data-testid="roles-create"]').trigger('click')
    await wrapper.vm.$nextTick()
    wrapper.findComponent(RoleFormDialog).vm.$emit('submit', validCreate)
    await flushPromises()
    const dialog = wrapper.findComponent(RoleFormDialog)
    expect(dialog.props('open')).toBe(true)
    expect(dialog.props('fieldErrors')?.slug).toContain('already registered.')
    expect(refreshMock).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="roles-action-success"]').exists()).toBe(false)
  })

  it('4.7 step-up / 428 → stepUpUrl forwarded to the dialog, dialog open, no refresh', async () => {
    failWith({ status: 'step_up_required', stepUpUrl: '/auth/login?prompt=login&max_age=0' })
    const wrapper = await mountSuspended(RolesPage)
    await wrapper.find('[data-testid="roles-create"]').trigger('click')
    await wrapper.vm.$nextTick()
    wrapper.findComponent(RoleFormDialog).vm.$emit('submit', validCreate)
    await flushPromises()
    const dialog = wrapper.findComponent(RoleFormDialog)
    expect(dialog.props('stepUpUrl')).toBe('/auth/login?prompt=login&max_age=0')
    expect(dialog.props('open')).toBe(true)
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('4.8 backend 5xx → error copy + redacted REF, raw id/exception absent', async () => {
    failWith({ status: 'error', requestId: 'admin-req-FAIL9' })
    const wrapper = await mountSuspended(RolesPage)
    await wrapper.find('[data-testid="roles-create"]').trigger('click')
    await wrapper.vm.$nextTick()
    wrapper.findComponent(RoleFormDialog).vm.$emit('submit', validCreate)
    await flushPromises()
    expect(wrapper.text()).toContain('REF-')
    expect(wrapper.text()).not.toContain('admin-req-FAIL9')
    expect(wrapper.text()).not.toMatch(/SQLSTATE|Bearer/i)
  })

  it('4.9 audit/correlation id from backend is surfaced redacted, never raw', async () => {
    failWith({ status: 'error', requestId: 'admin-req-ZZ', auditEventId: 'audit-XYZ' })
    const wrapper = await mountSuspended(RolesPage)
    await wrapper.find('[data-testid="roles-create"]').trigger('click')
    await wrapper.vm.$nextTick()
    wrapper.findComponent(RoleFormDialog).vm.$emit('submit', validCreate)
    await flushPromises()
    expect(wrapper.text()).toContain('REF-')
    expect(wrapper.text()).not.toContain('admin-req-ZZ')
    expect(wrapper.text()).not.toContain('audit-XYZ')
  })

  it('4.10 leaves no stale submitting state after an error', async () => {
    failWith({ status: 'error' })
    const wrapper = await mountSuspended(RolesPage)
    await wrapper.find('[data-testid="roles-create"]').trigger('click')
    await wrapper.vm.$nextTick()
    wrapper.findComponent(RoleFormDialog).vm.$emit('submit', validCreate)
    await flushPromises()
    expect(wrapper.findComponent(RoleFormDialog).props('submitting')).toBe(false)
  })

  it('cancel calls no API and closes the dialog', async () => {
    const wrapper = await mountSuspended(RolesPage)
    await wrapper.find('[data-testid="roles-create"]').trigger('click')
    await wrapper.vm.$nextTick()
    wrapper.findComponent(RoleFormDialog).vm.$emit('cancel')
    await flushPromises()
    expect(wrapper.findComponent(RoleFormDialog).props('open')).toBe(false)
    expect(storeMock).not.toHaveBeenCalled()
    expect(refreshMock).not.toHaveBeenCalled()
  })
})

describe('roles page — update privileged action', () => {
  // Drive the edit flow through RolesTable @edit → dialog submit so the SHARED
  // dialog is fed by `formAction` (= updateAction in edit mode), not createAction.
  async function openEditAndSubmit(): Promise<Awaited<ReturnType<typeof mountSuspended>>> {
    const wrapper = await mountSuspended(RolesPage)
    wrapper.findComponent(RolesTable).vm.$emit('edit', roleB)
    await wrapper.vm.$nextTick()
    const dialog = wrapper.findComponent(RoleFormDialog)
    expect(dialog.props('mode')).toBe('edit')
    expect(dialog.props('role')).toEqual(roleB)
    dialog.vm.$emit('submit', validUpdate)
    await flushPromises()
    return wrapper
  }

  it('edit success → update called with (slug, payload), list refreshed, success notice', async () => {
    const wrapper = await openEditAndSubmit()
    expect(updateMock).toHaveBeenCalledWith('support-agent', validUpdate)
    expect(storeMock).not.toHaveBeenCalled()
    expect(refreshMock).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="roles-action-success"]').exists()).toBe(true)
  })

  it('edit 403 → safe copy + redacted REF in the dialog, dialog open, no refresh', async () => {
    failWith({ status: 'forbidden', requestId: 'admin-req-EDENY' })
    const wrapper = await openEditAndSubmit()
    const dialog = wrapper.findComponent(RoleFormDialog)
    expect(dialog.props('open')).toBe(true)
    expect(dialog.props('errorMessage')).toBeTruthy()
    expect(wrapper.text()).toContain('REF-')
    expect(wrapper.text()).not.toContain('admin-req-EDENY')
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('edit 422 → updateAction field errors bind to the shared dialog, dialog open, no refresh', async () => {
    failWith({ status: 'invalid', fieldErrors: { name: ['Name already taken.'] } })
    const wrapper = await openEditAndSubmit()
    const dialog = wrapper.findComponent(RoleFormDialog)
    expect(dialog.props('open')).toBe(true)
    expect(dialog.props('fieldErrors')?.name).toContain('already taken.')
    expect(refreshMock).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="roles-action-success"]').exists()).toBe(false)
  })

  it('edit 428 → stepUpUrl forwarded to the shared dialog, dialog open, no refresh', async () => {
    failWith({ status: 'step_up_required', stepUpUrl: '/auth/login?prompt=login&max_age=0' })
    const wrapper = await openEditAndSubmit()
    const dialog = wrapper.findComponent(RoleFormDialog)
    expect(dialog.props('stepUpUrl')).toBe('/auth/login?prompt=login&max_age=0')
    expect(dialog.props('open')).toBe(true)
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('edit failure leaves no stale submitting state on the shared dialog', async () => {
    failWith({ status: 'error' })
    const wrapper = await openEditAndSubmit()
    expect(wrapper.findComponent(RoleFormDialog).props('submitting')).toBe(false)
  })
})

describe('roles page — SSR markup carries no token/secret', () => {
  it('renders role slugs (public config, allowed) but no token/secret patterns', async () => {
    const wrapper = await mountSuspended(RolesPage)
    const html = wrapper.html()
    expect(html).not.toMatch(/access_token|refresh_token|id_token|Bearer/)
    expect(html).not.toMatch(/client_secret|"secret"/)
    expect(html).toContain('support-agent') // role slug is public config and may render
  })
})
