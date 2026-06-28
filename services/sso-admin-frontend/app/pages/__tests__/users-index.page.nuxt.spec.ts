// *.nuxt.spec.ts → 'nuxt' env: mountSuspended drives the page's async setup
// (useAsyncData('admin-users-principal') + useI18n auto-imports). The list
// composable, the session store, and navigateTo are mocked so each state is
// deterministic and no real network/navigation runs.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import UsersTable from '@/components/users/UsersTable.vue'
import type { AdminUserListItem } from '@/types/users.types'
import type { UsersStatusFilter } from '@/lib/users/users-list'
import type { UsersViewState } from '@/lib/users/users-view-state'

// A masked sample row: government identifiers arrive pre-masked from the backend
// (bullet runs, NEVER the raw 16/18/10-digit value). It reads clearly as a sample.
const sampleUser: AdminUserListItem = {
  id: 1,
  subject_id: 'user-sub-0001',
  email: 'casey.operator@example.test',
  given_name: 'Casey',
  family_name: 'Operator',
  display_name: 'Casey Operator',
  role: 'admin',
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
  nik: '••••••••••••3456',
  nip: null,
  nisn: null,
  birth_date: null,
  mfa_enrolled: false,
  mfa_methods: [],
  mfa_mandatory: false,
  roles: [],
  login_context: null,
}

const paged = ref<readonly AdminUserListItem[]>([])
const viewState = ref<UsersViewState>('loading')
const requestId = ref<string | null>(null)
const total = ref(0)
const filteredTotal = ref(0)
const page = ref(1)
const pageCount = ref(1)
const query = ref('')
const statusFilter = ref<UsersStatusFilter>('all')
const isStale = ref(false)
const refreshMock = vi.fn<() => Promise<void>>(async () => {})

vi.mock('@/composables/useUsersList', () => ({
  useUsersList: () => ({
    users: ref([]),
    filtered: ref([]),
    paged,
    viewState,
    total,
    filteredTotal,
    page,
    pageCount,
    query,
    statusFilter,
    requestId,
    isStale,
    refresh: refreshMock,
  }),
}))

const canWrite = ref(true)
vi.mock('@/stores/session.store', () => ({
  useSessionStore: () => ({
    principal: { display_name: 'Admin Sentinel' },
    ensureSession: vi.fn<() => Promise<string>>(async () => 'authenticated'),
    hasPermission: (permission: string) =>
      permission === 'admin.users.write' ? canWrite.value : true,
  }),
}))

// vi.hoisted ensures navigateMock is created before mockNuxtImport's hoisted factory runs
const navigateMock = vi.hoisted(() => vi.fn<(...args: unknown[]) => unknown>())
mockNuxtImport('navigateTo', () => navigateMock)

const UsersIndex = (await import('../users/index.vue')).default

beforeEach(() => {
  paged.value = []
  viewState.value = 'loading'
  requestId.value = null
  total.value = 0
  filteredTotal.value = 0
  page.value = 1
  pageCount.value = 1
  query.value = ''
  statusFilter.value = 'all'
  isStale.value = false
  canWrite.value = true
  vi.clearAllMocks()
})
afterEach(() => vi.clearAllMocks())

describe('users list page', () => {
  it('always renders the masked principal hero with no token/PII, regardless of state', async () => {
    const wrapper = await mountSuspended(UsersIndex)
    expect(wrapper.find('[data-page="users"]').exists()).toBe(true)
    const principal = wrapper.find('[data-principal-name]')
    expect(principal.exists()).toBe(true)
    expect(principal.text()).toContain('Admin Sentinel')
    expect(wrapper.html()).not.toMatch(/access_token|refresh_token|id_token|Bearer|SENTINEL-/)
  })

  it('loading → skeleton, no table', async () => {
    viewState.value = 'loading'
    const wrapper = await mountSuspended(UsersIndex)
    expect(wrapper.findComponent(UiSkeleton).exists()).toBe(true)
    expect(wrapper.findComponent(UsersTable).exists()).toBe(false)
  })

  it('forbidden → forbidden status view (distinct from empty)', async () => {
    viewState.value = 'forbidden'
    requestId.value = 'admin-req-DENIED42'
    const wrapper = await mountSuspended(UsersIndex)
    expect(wrapper.findComponent(UiStatusView).props('tone')).toBe('forbidden')
    expect(wrapper.findComponent(UiEmptyState).exists()).toBe(false)
    expect(wrapper.text()).not.toContain('admin-req-DENIED42')
  })

  it('unauthenticated → step_up status view', async () => {
    viewState.value = 'unauthenticated'
    const wrapper = await mountSuspended(UsersIndex)
    expect(wrapper.findComponent(UiStatusView).props('tone')).toBe('step_up')
  })

  it('error → error status view with a refresh action; raw request id redacted to REF-', async () => {
    viewState.value = 'error'
    requestId.value = 'admin-req-FAILED99'
    const wrapper = await mountSuspended(UsersIndex)
    expect(wrapper.findComponent(UiStatusView).props('tone')).toBe('error')
    expect(wrapper.text()).toContain('REF-')
    expect(wrapper.text()).not.toContain('admin-req-FAILED99')
    await wrapper.find('[data-test="users-refresh"]').trigger('click')
    expect(refreshMock).toHaveBeenCalledTimes(1)
  })

  it('empty → empty state, not a status view', async () => {
    viewState.value = 'empty'
    const wrapper = await mountSuspended(UsersIndex)
    expect(wrapper.findComponent(UiEmptyState).exists()).toBe(true)
    expect(wrapper.findComponent(UiStatusView).exists()).toBe(false)
  })

  it('ready → search input + status select + table with mapped rows, no raw PII', async () => {
    viewState.value = 'ready'
    paged.value = [sampleUser]
    total.value = 1
    filteredTotal.value = 1
    const wrapper = await mountSuspended(UsersIndex)
    expect(wrapper.findComponent(UiInput).exists()).toBe(true)
    expect(wrapper.findComponent(UiSelect).exists()).toBe(true)
    const table = wrapper.findComponent(UsersTable)
    expect(table.exists()).toBe(true)
    const rows = table.props('rows') as ReadonlyArray<{
      id: string
      displayName: string
      statusTone: string
    }>
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      id: 'user-sub-0001',
      displayName: 'Casey Operator',
      statusTone: 'success',
    })
    // No token and no raw NIK(16)/NIP(18)/NISN(10) digit run leaks into the markup.
    expect(wrapper.html()).not.toMatch(/access_token|Bearer|SENTINEL-/)
    expect(wrapper.html()).not.toMatch(/\d{16}|\d{18}|\d{10}/)
  })

  it('status filter offers "all" + every account status', async () => {
    viewState.value = 'ready'
    paged.value = [sampleUser]
    total.value = 1
    filteredTotal.value = 1
    const wrapper = await mountSuspended(UsersIndex)
    const options = wrapper.findComponent(UiSelect).props('options') as ReadonlyArray<{
      value: string
    }>
    expect(options.map((o) => o.value)).toEqual([
      'all',
      'active',
      'locked',
      'disabled',
      'deactivated',
    ])
  })

  it('shows the New user link only with admin.users.write', async () => {
    viewState.value = 'ready'
    paged.value = [sampleUser]
    canWrite.value = true
    const allowed = await mountSuspended(UsersIndex)
    expect(allowed.find('[data-test="users-create"]').exists()).toBe(true)
    canWrite.value = false
    const denied = await mountSuspended(UsersIndex)
    expect(denied.find('[data-test="users-create"]').exists()).toBe(false)
  })

  it('row select navigates to the named detail route with the subject id', async () => {
    viewState.value = 'ready'
    paged.value = [sampleUser]
    total.value = 1
    filteredTotal.value = 1
    const wrapper = await mountSuspended(UsersIndex)
    wrapper.findComponent(UsersTable).vm.$emit('select', 'user-sub-0001')
    expect(navigateMock).toHaveBeenCalledWith({
      name: 'admin.users.detail',
      params: { subjectId: 'user-sub-0001' },
    })
  })
})
