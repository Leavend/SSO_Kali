// *.nuxt.spec.ts → 'nuxt' env: mountSuspended drives the page's async setup
// (useAsyncData('admin-roles-principal') + useI18n auto-imports). The two list
// composables + the session store are mocked so each state is deterministic and
// no real network runs; the pure grant-map helpers (buildRoleGrantMap/isGranted/
// togglePendingGrant/diffRoleGrants) run for real so the dirty-tracking wiring is
// exercised end to end.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiInput from '@/components/ui/UiInput.vue'
import RolesTable from '@/components/roles/RolesTable.vue'
import RoleMatrix from '@/components/roles/RoleMatrix.vue'
import { isGranted, type RoleGrantMap } from '@/lib/roles/roles-matrix'
import type { AdminPermission, AdminRole } from '@/types/users.types'
import type { RolesViewState } from '@/lib/roles/roles-view-state'

// Sample rows read clearly as samples. One protected system role + one custom role.
const systemRole: AdminRole = {
  id: 1,
  slug: 'admin',
  name: 'Administrator',
  description: null,
  is_system: true,
  permissions: [{ slug: 'admin.roles.read', name: 'Read roles', category: 'roles' }],
  user_count: 3,
  users_count: 3,
}
const customRole: AdminRole = {
  id: 2,
  slug: 'editor',
  name: 'Editor',
  description: 'Content editor',
  is_system: false,
  permissions: [],
  user_count: 1,
  users_count: 1,
}
const samplePermissions: readonly AdminPermission[] = [
  {
    slug: 'admin.roles.read',
    name: 'Read roles',
    description: 'View role catalog',
    category: 'roles',
  },
  {
    slug: 'admin.roles.write',
    name: 'Write roles',
    description: 'Manage roles',
    category: 'roles',
  },
]

// useRolesList mock surface
const roles = ref<readonly AdminRole[] | null>(null)
const paged = ref<readonly AdminRole[]>([])
const viewState = ref<RolesViewState>('loading')
const requestId = ref<string | null>(null)
const total = ref(0)
const filteredTotal = ref(0)
const page = ref(1)
const pageCount = ref(1)
const query = ref('')
const isStale = ref(false)
const refreshMock = vi.fn<() => Promise<void>>(async () => {})

vi.mock('@/composables/useRolesList', () => ({
  useRolesList: () => ({
    roles,
    filtered: ref([]),
    paged,
    viewState,
    total,
    filteredTotal,
    page,
    pageCount,
    query,
    requestId,
    isStale,
    pending: ref(false),
    refresh: refreshMock,
  }),
}))

// usePermissionCatalog mock surface
const permissions = ref<readonly AdminPermission[] | null>(null)
vi.mock('@/composables/usePermissionCatalog', () => ({
  usePermissionCatalog: () => ({
    permissions,
    viewState: ref<RolesViewState>('ready'),
    isStale: ref(false),
    requestId: ref<string | null>(null),
    pending: ref(false),
    refresh: vi.fn<() => Promise<void>>(async () => {}),
  }),
}))

const canWrite = ref(true)
const canTerminate = ref(true)
vi.mock('@/stores/session.store', () => ({
  useSessionStore: () => ({
    principal: { display_name: 'Admin Sentinel' },
    ensureSession: vi.fn<() => Promise<string>>(async () => 'authenticated'),
    hasPermission: (permission: string) => {
      if (permission === 'admin.roles.write') return canWrite.value
      if (permission === 'admin.sessions.terminate') return canTerminate.value
      return true
    },
  }),
}))

const RolesPage = (await import('../roles.vue')).default

beforeEach(() => {
  roles.value = null
  paged.value = []
  viewState.value = 'loading'
  requestId.value = null
  total.value = 0
  filteredTotal.value = 0
  page.value = 1
  pageCount.value = 1
  query.value = ''
  isStale.value = false
  permissions.value = null
  canWrite.value = true
  canTerminate.value = true
  vi.clearAllMocks()
})
afterEach(() => vi.clearAllMocks())

describe('roles page', () => {
  it('always renders the masked principal hero + sentinels, regardless of state', async () => {
    const wrapper = await mountSuspended(RolesPage)
    expect(wrapper.find('[data-page="roles"]').exists()).toBe(true)
    expect(wrapper.find('[data-admin-shell]').exists()).toBe(true)
    const principal = wrapper.find('[data-principal-name]')
    expect(principal.exists()).toBe(true)
    expect(principal.text()).toContain('Admin Sentinel')
    expect(wrapper.html()).not.toMatch(/access_token|refresh_token|id_token|Bearer|SENTINEL-/)
  })

  it('loading → skeleton, no table/matrix', async () => {
    viewState.value = 'loading'
    const wrapper = await mountSuspended(RolesPage)
    expect(wrapper.findComponent(UiSkeleton).exists()).toBe(true)
    expect(wrapper.findComponent(RolesTable).exists()).toBe(false)
    expect(wrapper.findComponent(RoleMatrix).exists()).toBe(false)
  })

  it('forbidden → forbidden status view (distinct from empty), raw request id redacted', async () => {
    viewState.value = 'forbidden'
    requestId.value = 'admin-req-DENIED42'
    const wrapper = await mountSuspended(RolesPage)
    expect(wrapper.findComponent(UiStatusView).props('tone')).toBe('forbidden')
    expect(wrapper.findComponent(UiEmptyState).exists()).toBe(false)
    expect(wrapper.text()).not.toContain('admin-req-DENIED42')
  })

  it('unauthenticated → step_up status view', async () => {
    viewState.value = 'unauthenticated'
    const wrapper = await mountSuspended(RolesPage)
    expect(wrapper.findComponent(UiStatusView).props('tone')).toBe('step_up')
  })

  it('error → error status view with a refresh action; raw request id redacted to REF-', async () => {
    viewState.value = 'error'
    requestId.value = 'admin-req-FAILED99'
    const wrapper = await mountSuspended(RolesPage)
    expect(wrapper.findComponent(UiStatusView).props('tone')).toBe('error')
    expect(wrapper.text()).toContain('REF-')
    expect(wrapper.text()).not.toContain('admin-req-FAILED99')
    await wrapper.find('[data-testid="roles-refresh"]').trigger('click')
    expect(refreshMock).toHaveBeenCalledTimes(1)
  })

  it('empty → empty state, not a status view', async () => {
    viewState.value = 'empty'
    const wrapper = await mountSuspended(RolesPage)
    expect(wrapper.findComponent(UiEmptyState).exists()).toBe(true)
    expect(wrapper.findComponent(UiStatusView).exists()).toBe(false)
  })

  it('ready → search input + RolesTable (paged) + RoleMatrix (full roles × permissions), no token/PII', async () => {
    viewState.value = 'ready'
    roles.value = [systemRole, customRole]
    paged.value = [systemRole, customRole]
    permissions.value = samplePermissions
    total.value = 2
    filteredTotal.value = 2
    const wrapper = await mountSuspended(RolesPage)
    expect(wrapper.findComponent(UiInput).exists()).toBe(true)
    const table = wrapper.findComponent(RolesTable)
    const matrix = wrapper.findComponent(RoleMatrix)
    expect(table.exists()).toBe(true)
    expect(matrix.exists()).toBe(true)
    expect(table.props('roles')).toHaveLength(2)
    expect(matrix.props('roles')).toHaveLength(2)
    expect(matrix.props('permissions')).toHaveLength(2)
    // Matrix grants are seeded from buildRoleGrantMap: admin holds admin.roles.read.
    const grants = matrix.props('grants') as RoleGrantMap
    expect(isGranted(grants, 'admin', 'admin.roles.read')).toBe(true)
    expect(isGranted(grants, 'editor', 'admin.roles.read')).toBe(false)
    expect(wrapper.html()).not.toMatch(/access_token|Bearer|SENTINEL-/)
    expect(wrapper.html()).not.toMatch(/\d{16}|\d{18}|\d{10}/)
  })

  it('canWrite gates the create button + RolesTable/RoleMatrix write affordance', async () => {
    viewState.value = 'ready'
    roles.value = [customRole]
    paged.value = [customRole]
    permissions.value = samplePermissions
    canWrite.value = true
    const allowed = await mountSuspended(RolesPage)
    expect(allowed.find('[data-testid="roles-create"]').exists()).toBe(true)
    expect(allowed.findComponent(RolesTable).props('canWrite')).toBe(true)
    expect(allowed.findComponent(RoleMatrix).props('canWrite')).toBe(true)
    canWrite.value = false
    const denied = await mountSuspended(RolesPage)
    expect(denied.find('[data-testid="roles-create"]').exists()).toBe(false)
    expect(denied.findComponent(RolesTable).props('canWrite')).toBe(false)
    expect(denied.findComponent(RoleMatrix).props('canWrite')).toBe(false)
  })

  it('canDelete requires admin.roles.write AND admin.sessions.terminate', async () => {
    viewState.value = 'ready'
    roles.value = [customRole]
    paged.value = [customRole]
    permissions.value = samplePermissions
    canWrite.value = true
    canTerminate.value = true
    const both = await mountSuspended(RolesPage)
    expect(both.findComponent(RolesTable).props('canDelete')).toBe(true)
    canTerminate.value = false
    const noTerminate = await mountSuspended(RolesPage)
    expect(noTerminate.findComponent(RolesTable).props('canDelete')).toBe(false)
  })

  it('matrix toggle updates the page-owned pending grants + marks the role dirty', async () => {
    viewState.value = 'ready'
    roles.value = [customRole]
    paged.value = [customRole]
    permissions.value = samplePermissions
    const wrapper = await mountSuspended(RolesPage)
    const matrix = wrapper.findComponent(RoleMatrix)
    expect(matrix.props('dirtyRoleSlugs')).toEqual([])
    matrix.vm.$emit('toggle', {
      roleSlug: 'editor',
      permissionSlug: 'admin.roles.write',
      granted: true,
    })
    await nextTick()
    const grants = matrix.props('grants') as RoleGrantMap
    expect(isGranted(grants, 'editor', 'admin.roles.write')).toBe(true)
    expect(matrix.props('dirtyRoleSlugs')).toContain('editor')
  })

  it('write affordances are stub hooks here — emitting save/delete/edit calls no API', async () => {
    viewState.value = 'ready'
    roles.value = [customRole]
    paged.value = [customRole]
    permissions.value = samplePermissions
    const wrapper = await mountSuspended(RolesPage)
    // These are wired in 7.8–7.10; in 7.7 they must not throw and must not refresh
    // the list (no API path exists yet).
    wrapper.findComponent(RoleMatrix).vm.$emit('save', 'editor')
    wrapper.findComponent(RolesTable).vm.$emit('edit', customRole)
    wrapper.findComponent(RolesTable).vm.$emit('delete', customRole)
    wrapper.findComponent(RolesTable).vm.$emit('managePermissions', customRole)
    await nextTick()
    expect(refreshMock).not.toHaveBeenCalled()
  })
})
