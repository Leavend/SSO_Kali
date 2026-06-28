import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import ClientsTable from '@/components/clients/ClientsTable.vue'
import type { AdminClientListItem } from '@/types/clients.types'
import type { ClientsStatusFilter } from '@/lib/clients/clients-list'
import type { ClientsViewState } from '@/lib/clients/clients-view-state'

// A sample merged client row. It reads clearly as a sample. The list/detail DTOs
// carry ONLY has_secret_hash (a boolean) — never a client_secret value or field.
// client_id is a public identifier and is allowed to hydrate.
const sampleClient: AdminClientListItem = {
  client_id: 'portal-web',
  display_name: 'Operator Portal',
  type: 'confidential',
  environment: 'live',
  app_base_url: 'https://portal.example.test',
  redirect_uris: ['https://portal.example.test/callback'],
  post_logout_redirect_uris: [],
  allowed_scopes: ['openid', 'profile'],
  backchannel_logout_uri: null,
  backchannel_logout_internal: false,
  owner_email: 'owner@example.test',
  provisioning: 'jit',
  status: 'active',
  category: 'kepegawaian',
  has_secret_hash: true,
}

const paged = ref<readonly AdminClientListItem[]>([])
const viewState = ref<ClientsViewState>('loading')
const requestId = ref<string | null>(null)
const total = ref(0)
const filteredTotal = ref(0)
const page = ref(1)
const pageCount = ref(1)
const query = ref('')
const statusFilter = ref<ClientsStatusFilter>('all')
const isStale = ref(false)
const refreshMock = vi.fn<() => Promise<void>>(async () => {})

vi.mock('@/composables/useClientsList', () => ({
  useClientsList: () => ({
    clients: ref([]),
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
      permission === 'admin.clients.write' ? canWrite.value : true,
  }),
}))

// vi.hoisted ensures navigateMock exists before mockNuxtImport's hoisted factory runs.
const navigateMock = vi.hoisted(() => vi.fn<(...args: unknown[]) => unknown>())
mockNuxtImport('navigateTo', () => navigateMock)

const ClientsIndex = (await import('../clients/index.vue')).default

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

describe('clients list page', () => {
  it('always renders the masked principal hero with no token/secret/PII, regardless of state', async () => {
    const wrapper = await mountSuspended(ClientsIndex)
    expect(wrapper.find('[data-page="clients"]').exists()).toBe(true)
    const principal = wrapper.find('[data-principal-name]')
    expect(principal.exists()).toBe(true)
    expect(principal.text()).toContain('Admin Sentinel')
    expect(wrapper.html()).not.toMatch(/access_token|refresh_token|id_token|Bearer/)
    expect(wrapper.html()).not.toMatch(/client_secret|clientSecret/)
  })

  it('loading → skeleton, no table', async () => {
    viewState.value = 'loading'
    const wrapper = await mountSuspended(ClientsIndex)
    expect(wrapper.findComponent(UiSkeleton).exists()).toBe(true)
    expect(wrapper.findComponent(ClientsTable).exists()).toBe(false)
  })

  it('forbidden → forbidden status view (distinct from empty), raw request id redacted', async () => {
    viewState.value = 'forbidden'
    requestId.value = 'admin-req-DENIED42'
    const wrapper = await mountSuspended(ClientsIndex)
    expect(wrapper.findComponent(UiStatusView).props('tone')).toBe('forbidden')
    expect(wrapper.findComponent(UiEmptyState).exists()).toBe(false)
    expect(wrapper.text()).not.toContain('admin-req-DENIED42')
  })

  it('unauthenticated → step_up status view', async () => {
    viewState.value = 'unauthenticated'
    const wrapper = await mountSuspended(ClientsIndex)
    expect(wrapper.findComponent(UiStatusView).props('tone')).toBe('step_up')
  })

  it('error → error status view with a refresh action; raw request id redacted to REF-', async () => {
    viewState.value = 'error'
    requestId.value = 'admin-req-FAILED99'
    const wrapper = await mountSuspended(ClientsIndex)
    expect(wrapper.findComponent(UiStatusView).props('tone')).toBe('error')
    expect(wrapper.text()).toContain('REF-')
    expect(wrapper.text()).not.toContain('admin-req-FAILED99')
    await wrapper.find('[data-test="clients-refresh"]').trigger('click')
    expect(refreshMock).toHaveBeenCalledTimes(1)
  })

  it('empty → empty state, not a status view (authorized but zero rows)', async () => {
    viewState.value = 'empty'
    const wrapper = await mountSuspended(ClientsIndex)
    expect(wrapper.findComponent(UiEmptyState).exists()).toBe(true)
    expect(wrapper.findComponent(UiStatusView).exists()).toBe(false)
  })

  it('ready → isStale banner + search input + status select + table with mapped rows, no secret/PII', async () => {
    viewState.value = 'ready'
    paged.value = [sampleClient]
    total.value = 1
    filteredTotal.value = 1
    isStale.value = true
    const wrapper = await mountSuspended(ClientsIndex)
    expect(wrapper.find('[role="status"]').exists()).toBe(true) // stale banner
    expect(wrapper.findComponent(UiInput).exists()).toBe(true)
    expect(wrapper.findComponent(UiSelect).exists()).toBe(true)
    const table = wrapper.findComponent(ClientsTable)
    expect(table.exists()).toBe(true)
    const rows = table.props('rows') as ReadonlyArray<{
      id: string
      name: string
      clientId: string
      statusTone: string
    }>
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      id: 'portal-web',
      name: 'Operator Portal',
      clientId: 'portal-web',
      statusTone: 'success',
    })
    // No token, no client_secret value/field, no raw NIK(16)/NIP(18)/NISN(10) digit run.
    expect(wrapper.html()).not.toMatch(/access_token|Bearer/)
    expect(wrapper.html()).not.toMatch(/client_secret|clientSecret/)
    expect(wrapper.html()).not.toMatch(/\d{16}|\d{18}|\d{10}/)
  })

  it('status filter offers "all" + every client status', async () => {
    viewState.value = 'ready'
    paged.value = [sampleClient]
    total.value = 1
    filteredTotal.value = 1
    const wrapper = await mountSuspended(ClientsIndex)
    const options = wrapper.findComponent(UiSelect).props('options') as ReadonlyArray<{
      value: string
    }>
    expect(options.map((o) => o.value)).toEqual([
      'all',
      'active',
      'staged',
      'disabled',
      'decommissioned',
    ])
  })

  it('shows the New client link only with admin.clients.write', async () => {
    viewState.value = 'ready'
    paged.value = [sampleClient]
    canWrite.value = true
    const allowed = await mountSuspended(ClientsIndex)
    expect(allowed.find('[data-test="clients-create"]').exists()).toBe(true)
    canWrite.value = false
    const denied = await mountSuspended(ClientsIndex)
    expect(denied.find('[data-test="clients-create"]').exists()).toBe(false)
  })

  it('row select navigates to the named detail route with the client id', async () => {
    viewState.value = 'ready'
    paged.value = [sampleClient]
    total.value = 1
    filteredTotal.value = 1
    const wrapper = await mountSuspended(ClientsIndex)
    wrapper.findComponent(ClientsTable).vm.$emit('select', 'portal-web')
    expect(navigateMock).toHaveBeenCalledWith({
      name: 'admin.clients.detail',
      params: { clientId: 'portal-web' },
    })
  })
})
