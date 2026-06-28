// *.nuxt.spec.ts → 'nuxt' env: mountSuspended + mockNuxtImport for the auto-imports.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import type { SessionEnsureResult } from '@/stores/session.store'
import type { AdminUserDetail, RolesResponse, UserRoleResponse } from '@/types/users.types'
import type { PrivilegedActionFailure, PrivilegedActionStatus } from '@/lib/users/privileged-action'

// --- domain doubles ---------------------------------------------------------
const ROLES: RolesResponse = {
  roles: [
    {
      id: 1,
      slug: 'user',
      name: 'Pengguna',
      description: null,
      is_system: true,
      permissions: [],
      user_count: 1100,
      users_count: 1100,
    },
    {
      id: 2,
      slug: 'admin',
      name: 'Administrator',
      description: null,
      is_system: true,
      permissions: [],
      user_count: 4,
      users_count: 4,
    },
  ],
}

function makeUser(subjectId: string, roleSlug: string): AdminUserDetail {
  return {
    id: 9,
    subject_id: subjectId,
    email: 'ops.sample@example.test',
    given_name: 'Ops',
    family_name: 'Sample',
    display_name: 'Ops Sample',
    role: roleSlug,
    status: 'active',
    effective_status: 'active',
    disabled_at: null,
    disabled_reason: null,
    locked_at: null,
    locked_until: null,
    locked_reason: null,
    locked_by_subject_id: null,
    lock_count: 0,
    local_account_enabled: true,
    profile_synced_at: null,
    email_verified_at: null,
    last_login_at: null,
    created_at: null,
    nik: '1234********3456',
    nip: null,
    nisn: null,
    birth_date: '****-**-15',
    mfa_enrolled: false,
    mfa_methods: [],
    mfa_mandatory: false,
    roles: [
      {
        slug: roleSlug,
        name: roleSlug === 'admin' ? 'Administrator' : 'Pengguna',
        is_system: true,
      },
    ],
  }
}

const SELF = 'USR-SELF-0001'
const OTHER = 'USR-OTHER-0002'

// --- service mocks ----------------------------------------------------------
const assignRoles = vi.fn<() => Promise<UserRoleResponse>>()
vi.mock('@/services/users.api', () => ({ usersApi: { assignRoles } }))
vi.mock('@/services/roles.api', () => ({
  rolesApi: { list: vi.fn<() => Promise<RolesResponse>>(async () => ROLES) },
}))

// --- session store mock -----------------------------------------------------
const principalSubject = ref<string>('USR-ADMIN-0000')
const ensureResult = ref<SessionEnsureResult>('authenticated')
const ensureSession = vi.fn<(force?: boolean) => Promise<SessionEnsureResult>>(
  async () => ensureResult.value,
)
const hasPermission = vi.fn<(permission: string) => boolean>(() => true)
vi.mock('@/stores/session.store', () => ({
  useSessionStore: () => ({
    principal: {
      subject_id: principalSubject.value,
      email: 'admin@example.test',
      display_name: 'Admin',
      role: 'admin',
    },
    ensureSession,
    hasPermission,
  }),
}))

// --- usePrivilegedAction mock (controllable run/failure) --------------------
const status = ref<PrivilegedActionStatus>('idle')
const isSubmitting = ref(false)
const failure = ref<PrivilegedActionFailure | null>(null)
const requestId = ref<string | null>(null)
const stepUpUrl = ref<string | null>(null) // shared so the 428 case can drive the step-up link
const run = vi.fn<(runner: () => Promise<unknown>) => Promise<unknown>>()
vi.mock('@/composables/usePrivilegedAction', () => ({
  usePrivilegedAction: () => ({
    status,
    isSubmitting,
    failure,
    requestId,
    auditEventId: ref<string | null>(null),
    fieldErrors: ref<Readonly<Record<string, readonly string[]>>>({}),
    stepUpUrl,
    run,
    reset: vi.fn<() => void>(),
  }),
}))

// --- Nuxt auto-imports ------------------------------------------------------
const rolesData = ref<RolesResponse | null>(ROLES)
const rolesError = ref<unknown>(null) // fail-closed: a non-null error empties the catalog
mockNuxtImport('useAsyncData', () => {
  return (_key: string, _handler: () => unknown) => ({ data: rolesData, error: rolesError })
})
// vi.hoisted ensures navigateTo is created before mockNuxtImport's hoisted factory runs
const navigateTo = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<void>>(async () => {}))
mockNuxtImport('navigateTo', () => navigateTo)
mockNuxtImport('useRoute', () => () => ({ fullPath: `/users/${SELF}` }))
mockNuxtImport('useRequestURL', () => () => new URL('https://admin-sso.example.test/'))
// app.baseURL is consumed by Nuxt's own router plugin, so the stub must keep it
// alongside the public.basePath the component reads.
mockNuxtImport('useRuntimeConfig', () => () => ({
  app: { baseURL: '/' },
  public: { basePath: '/' },
}))

const UserRoleAssignment = (await import('../UserRoleAssignment.vue')).default

// Stub the confirm gate (reka-ui AlertDialog teleports its content; the stub keeps
// the two-step open→Confirm flow deterministic and inline). The real UiAlertDialog
// is exercised end-to-end in Task 4.13's Playwright spec.
const AlertStub = {
  name: 'UiAlertDialog',
  props: ['open', 'title', 'description', 'confirmLabel', 'cancelLabel', 'danger'],
  emits: ['confirm', 'cancel'],
  template: `<div v-if="open" data-testid="confirm-dialog">
    <p data-testid="confirm-desc">{{ description }}</p>
    <button data-testid="ui-alert-dialog-confirm" @click="$emit('confirm')">{{ confirmLabel || 'Confirm' }}</button>
    <button data-testid="ui-alert-dialog-cancel" @click="$emit('cancel')">{{ cancelLabel || 'Cancel' }}</button>
  </div>`,
}

beforeEach(() => {
  principalSubject.value = 'USR-ADMIN-0000'
  ensureResult.value = 'authenticated'
  status.value = 'idle'
  isSubmitting.value = false
  failure.value = null
  requestId.value = null
  stepUpUrl.value = null
  rolesData.value = ROLES
  rolesError.value = null
  hasPermission.mockReturnValue(true)
  // default: run() executes its runner (success), returning the resolved DTO
  run.mockImplementation(async (runner: () => Promise<unknown>) => runner())
  assignRoles.mockResolvedValue({
    user: {
      subject_id: OTHER,
      email: 'ops.sample@example.test',
      display_name: 'Ops Sample',
      role: 'admin',
      status: 'active',
      roles: [{ slug: 'admin', name: 'Administrator', is_system: true }],
    },
  })
  vi.clearAllMocks()
  run.mockImplementation(async (runner: () => Promise<unknown>) => runner())
})
afterEach(() => vi.clearAllMocks())

async function mountFor(subjectId: string, roleSlug = 'user') {
  return mountSuspended(UserRoleAssignment, {
    props: { user: makeUser(subjectId, roleSlug) },
    global: { stubs: { UiAlertDialog: AlertStub } },
  })
}

// Open the confirm gate, then click Confirm — the privileged-action flow now
// confirms before the mutation fires (design §8).
async function confirmAssign(wrapper: Awaited<ReturnType<typeof mountFor>>) {
  await wrapper.find('[data-testid="role-assign-submit"]').trigger('click')
  await wrapper.find('[data-testid="ui-alert-dialog-confirm"]').trigger('click')
  await wrapper.vm.$nextTick()
}

describe('UserRoleAssignment', () => {
  it('renders one radio per role and pre-selects the user current role', async () => {
    const wrapper = await mountFor(OTHER, 'user')
    const radios = wrapper.findAll('input[type="radio"]')
    expect(radios).toHaveLength(2)
    expect(wrapper.text()).toContain('Pengguna')
    expect(wrapper.text()).toContain('Administrator')
    const checked = wrapper.find<HTMLInputElement>('input[value="user"]')
    expect(checked.element.checked).toBe(true)
  })

  it('assigns exactly one role (size:1 tuple) and emits done for another subject', async () => {
    const wrapper = await mountFor(OTHER, 'user')
    await wrapper.find('input[value="admin"]').setValue()
    await confirmAssign(wrapper)
    expect(assignRoles).toHaveBeenCalledWith(OTHER, { role_slugs: ['admin'] })
    expect(ensureSession).not.toHaveBeenCalled()
    expect(navigateTo).not.toHaveBeenCalled()
    expect(wrapper.emitted('done')).toHaveLength(1)
  })

  it('self-assignment that stays authenticated re-runs ensureSession then emits done', async () => {
    principalSubject.value = SELF
    ensureResult.value = 'authenticated'
    const wrapper = await mountFor(SELF, 'user')
    await wrapper.find('input[value="admin"]').setValue()
    await confirmAssign(wrapper)
    expect(ensureSession).toHaveBeenCalledWith(true)
    expect(navigateTo).not.toHaveBeenCalled()
    expect(wrapper.emitted('done')).toHaveLength(1)
  })

  it('self-assignment that needs step-up routes to step-up and does NOT emit done', async () => {
    principalSubject.value = SELF
    ensureResult.value = 'step_up_required'
    const wrapper = await mountFor(SELF, 'user')
    await wrapper.find('input[value="admin"]').setValue()
    await confirmAssign(wrapper)
    expect(ensureSession).toHaveBeenCalledWith(true)
    expect(navigateTo).toHaveBeenCalledWith({
      name: 'admin.step-up-required',
      query: { return_to: `/users/${SELF}` },
    })
    expect(wrapper.emitted('done')).toBeUndefined()
  })

  it('self-assignment that drops to unauthenticated routes to the external login url', async () => {
    principalSubject.value = SELF
    ensureResult.value = 'unauthenticated'
    const wrapper = await mountFor(SELF, 'user')
    await wrapper.find('input[value="admin"]').setValue()
    await confirmAssign(wrapper)
    const [url, opts] = navigateTo.mock.calls[0] ?? []
    expect(String(url)).toContain('/auth/login')
    expect(String(url)).toContain('return_to=')
    expect(opts).toEqual({ external: true })
    expect(wrapper.emitted('done')).toBeUndefined()
  })

  it('hides the submit when the admin lacks admin.roles.write and never calls the API', async () => {
    hasPermission.mockImplementation((p: string) => p !== 'admin.roles.write')
    const wrapper = await mountFor(OTHER, 'user')
    expect(wrapper.find('[data-testid="role-assign-submit"]').exists()).toBe(false)
    expect(assignRoles).not.toHaveBeenCalled()
  })

  it('on failure (e.g. 422 single-role / 403) shows safe copy + redacted REF, emits no done, leaves no stale loading', async () => {
    run.mockResolvedValue(null) // runner failed; usePrivilegedAction mapped + reset isSubmitting
    status.value = 'invalid'
    requestId.value = 'admin-req-ROLEFAIL7'
    failure.value = {
      status: 'invalid',
      requestId: 'admin-req-ROLEFAIL7',
      auditEventId: null,
      fieldErrors: { role_slugs: ['Satu akun hanya boleh memiliki satu peran.'] },
      stepUpUrl: null,
    }
    const wrapper = await mountFor(OTHER, 'user')
    await confirmAssign(wrapper)
    expect(wrapper.emitted('done')).toBeUndefined()
    expect(isSubmitting.value).toBe(false)
    expect(wrapper.text()).toContain('REF-')
    expect(wrapper.text()).not.toContain('admin-req-ROLEFAIL7')
  })

  it('on a 428 from the assign call surfaces a step-up re-auth link + step-up copy (not the generic failure)', async () => {
    run.mockResolvedValue(null)
    status.value = 'step_up_required'
    requestId.value = 'admin-req-STEPUP9'
    stepUpUrl.value = '/auth/login?prompt=login&max_age=0'
    failure.value = {
      status: 'step_up_required',
      requestId: 'admin-req-STEPUP9',
      auditEventId: null,
      fieldErrors: {},
      stepUpUrl: '/auth/login?prompt=login&max_age=0',
    }
    const wrapper = await mountFor(OTHER, 'user')
    await confirmAssign(wrapper)
    const link = wrapper.find('[data-testid="step-up-link"]')
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toBe('/auth/login?prompt=login&max_age=0')
    expect(wrapper.text()).toContain('step-up') // role_step_up_desc copy, both locales contain it
    expect(wrapper.emitted('done')).toBeUndefined()
  })

  it('fails closed with a safe notice (no radios, no submit) when the roles fetch errors', async () => {
    rolesError.value = new Error('backend unreachable')
    const wrapper = await mountFor(OTHER, 'user')
    expect(wrapper.findAll('input[type="radio"]')).toHaveLength(0)
    expect(wrapper.find('[data-testid="roles-unavailable"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="role-assign-submit"]').exists()).toBe(false)
    expect(assignRoles).not.toHaveBeenCalled()
  })

  it('renders no token, Bearer, or raw-PII digit run', async () => {
    const wrapper = await mountFor(OTHER, 'user')
    expect(wrapper.html()).not.toMatch(
      /Bearer|access_token|refresh_token|id_token|\b\d{16}\b|\b\d{18}\b|\b\d{10}\b/u,
    )
  })
})
