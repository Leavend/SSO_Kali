// *.nuxt.spec.ts → 'nuxt' env: mountSuspended handles the page's async setup
// (useAsyncData + useI18n auto-imports). Data boundaries + session store mocked.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiDataList from '@/components/ui/UiDataList.vue'
import ComplianceExportPanel from '@/components/compliance/ComplianceExportPanel.vue'
import DsrQueueTable from '@/components/compliance/DsrQueueTable.vue'
import DsrReviewActions from '@/components/compliance/DsrReviewActions.vue'
import type { ComplianceViewState } from '@/lib/compliance/compliance-view-state'
import type { DataSubjectRequest, DsrStatus, RetentionStatus } from '@/types/compliance.types'

// --- retention composable refs ---
const retention = ref<RetentionStatus | null>(null)
const retentionViewState = ref<ComplianceViewState>('loading')
const retentionRequestId = ref<string | null>(null)
const retentionStale = ref(false)
const retentionRefresh = vi.fn<() => Promise<void>>(async () => {})

// --- dsr composable refs ---
const requests = ref<readonly DataSubjectRequest[] | null>(null)
const paged = ref<readonly DataSubjectRequest[]>([])
const dsrViewState = ref<ComplianceViewState>('loading')
const dsrRequestId = ref<string | null>(null)
const dsrStale = ref(false)
const dsrQuery = ref('')
const dsrStatusFilter = ref<DsrStatus | 'all'>('all')
const dsrPage = ref(1)
const dsrPageCount = ref(1)
const dsrTotal = ref(0)
const dsrFilteredTotal = ref(0)
const dsrRefresh = vi.fn<() => Promise<void>>(async () => {})

vi.mock('@/composables/useRetentionStatus', () => ({
  useRetentionStatus: () => ({
    retention,
    viewState: retentionViewState,
    requestId: retentionRequestId,
    isStale: retentionStale,
    refresh: retentionRefresh,
  }),
}))

vi.mock('@/composables/useDataSubjectRequests', () => ({
  useDataSubjectRequests: () => ({
    requests,
    filtered: paged,
    paged,
    viewState: dsrViewState,
    total: dsrTotal,
    filteredTotal: dsrFilteredTotal,
    page: dsrPage,
    pageCount: dsrPageCount,
    query: dsrQuery,
    statusFilter: dsrStatusFilter,
    requestId: dsrRequestId,
    isStale: dsrStale,
    refresh: dsrRefresh,
  }),
}))

const hasPermission = vi.fn<(p: string) => boolean>(() => true)
vi.mock('@/stores/session.store', () => ({
  useSessionStore: () => ({
    principal: { display_name: 'Admin Sentinel' },
    ensureSession: vi.fn<() => Promise<string>>(async () => 'authenticated'),
    hasPermission,
  }),
}))

const RETENTION_READY: RetentionStatus = {
  generated_at: '2026-06-28T14:32:15Z',
  items: [
    {
      category: 'audit_events',
      label: 'Audit events',
      window: { days: 365 },
      schedule: 'daily 02:00',
      candidate_count: 1240,
      last_pruned_at: '2026-06-27T02:00:00Z',
      last_pruned_count: 980,
    },
  ],
}

const DSR_ROW: DataSubjectRequest = {
  request_id: '01HF8ZJ4QWERTYUIOPASDFGHJK',
  subject_id: 'sub-ABCDEF1234567890',
  type: 'export',
  status: 'submitted',
  submitted_at: '2026-06-28T10:00:00Z',
  sla_due_at: '2026-07-05T10:00:00Z',
}

const Compliance = (await import('../observability/compliance.vue')).default

function mountPage() {
  return mountSuspended(Compliance, {
    global: { stubs: { ComplianceExportPanel: true, DsrReviewActions: true } },
  })
}

beforeEach(() => {
  retention.value = null
  retentionViewState.value = 'loading'
  retentionRequestId.value = null
  retentionStale.value = false
  requests.value = null
  paged.value = []
  dsrViewState.value = 'loading'
  dsrRequestId.value = null
  dsrStale.value = false
  dsrQuery.value = ''
  dsrStatusFilter.value = 'all'
  dsrPage.value = 1
  dsrPageCount.value = 1
  dsrTotal.value = 0
  dsrFilteredTotal.value = 0
  hasPermission.mockReturnValue(true)
  vi.clearAllMocks()
})
afterEach(() => vi.clearAllMocks())

function ready() {
  retentionViewState.value = 'ready'
  retention.value = RETENTION_READY
  dsrViewState.value = 'ready'
  requests.value = [DSR_ROW]
  paged.value = [DSR_ROW]
  dsrTotal.value = 1
  dsrFilteredTotal.value = 1
}

describe('compliance console page', () => {
  it('renders the masked principal with no token/PII', async () => {
    const wrapper = await mountPage()
    expect(wrapper.find('[data-page="compliance"]').exists()).toBe(true)
    expect(wrapper.find('[data-principal-name]').text()).toContain('Admin Sentinel')
    expect(wrapper.html()).not.toMatch(/access_token|refresh_token|id_token|Bearer/)
  })

  it('loading (either composable) → skeleton, no panels', async () => {
    retentionViewState.value = 'loading'
    dsrViewState.value = 'ready'
    const wrapper = await mountPage()
    expect(wrapper.findComponent(UiSkeleton).exists()).toBe(true)
    expect(wrapper.findComponent(DsrQueueTable).exists()).toBe(false)
  })

  it('forbidden (retention) → forbidden status view, distinct from empty', async () => {
    retentionViewState.value = 'forbidden'
    dsrViewState.value = 'ready'
    requests.value = []
    const wrapper = await mountPage()
    expect(wrapper.findComponent(UiStatusView).props('tone')).toBe('forbidden')
    expect(wrapper.findComponent(UiEmptyState).exists()).toBe(false)
  })

  it('unauthenticated (dsr) → step_up status view', async () => {
    retentionViewState.value = 'ready'
    retention.value = RETENTION_READY
    dsrViewState.value = 'unauthenticated'
    const wrapper = await mountPage()
    expect(wrapper.findComponent(UiStatusView).props('tone')).toBe('step_up')
  })

  it('error only when BOTH fail → error view; raw request id redacted to REF-', async () => {
    retentionViewState.value = 'error'
    dsrViewState.value = 'error'
    retentionRequestId.value = 'admin-req-FAILED99'
    const wrapper = await mountPage()
    expect(wrapper.findComponent(UiStatusView).props('tone')).toBe('error')
    expect(wrapper.text()).toContain('REF-')
    expect(wrapper.text()).not.toContain('admin-req-FAILED99')
  })

  it('one section error + the other ready → workspace renders (no page-level error view)', async () => {
    retentionViewState.value = 'error'
    dsrViewState.value = 'ready'
    requests.value = [DSR_ROW]
    paged.value = [DSR_ROW]
    const wrapper = await mountPage()
    expect(wrapper.findComponent(UiStatusView).exists()).toBe(false)
    expect(wrapper.findComponent(DsrQueueTable).exists()).toBe(true)
  })

  it('ready → retention list + export panel + DSR table, no secrets', async () => {
    ready()
    const wrapper = await mountPage()
    expect(wrapper.findComponent(UiDataList).exists()).toBe(true) // retention table
    expect(wrapper.findComponent(ComplianceExportPanel).exists()).toBe(true)
    expect(wrapper.findComponent(DsrQueueTable).exists()).toBe(true)
    expect(wrapper.html()).toContain('2026-06-28T14:32:15Z') // retention generated_at folio
    expect(wrapper.html()).not.toMatch(/access_token|Bearer|client_secret/)
  })

  it('DSR queue masks the raw subject id (no raw PII in DOM)', async () => {
    ready()
    const wrapper = await mountPage()
    // DsrQueueTable is mounted real → asserts the masking it applies surfaces here.
    expect(wrapper.html()).not.toContain('sub-ABCDEF1234567890')
    expect(wrapper.html()).not.toMatch(/\b\d{16}\b|\b\d{18}\b|\b\d{10}\b/)
    expect(wrapper.html()).toContain('REF-')
  })

  it('retention empty → no-retention-evidence empty state while DSR still renders', async () => {
    retentionViewState.value = 'empty'
    retention.value = { generated_at: '2026-06-28T14:32:15Z', items: [] }
    dsrViewState.value = 'ready'
    requests.value = [DSR_ROW]
    paged.value = [DSR_ROW]
    const wrapper = await mountPage()
    expect(wrapper.findAllComponents(UiEmptyState).length).toBeGreaterThanOrEqual(1)
    expect(wrapper.findComponent(DsrQueueTable).exists()).toBe(true)
  })

  it('hides the export panel and DSR actions when permissions are absent', async () => {
    ready()
    hasPermission.mockImplementation(
      (p: string) => p !== 'admin.audit.export' && p !== 'admin.dsr.review',
    )
    const wrapper = await mountPage()
    expect(wrapper.findComponent(ComplianceExportPanel).props('canExport')).toBe(false)
    expect(wrapper.findComponent(DsrQueueTable).props('canReview')).toBe(false)
  })

  it('a DSR action @done refreshes the queue (never stale)', async () => {
    ready()
    const wrapper = await mountPage()
    // open the review drawer from the table, then the actions emit done.
    wrapper.findComponent(DsrQueueTable).vm.$emit('review', DSR_ROW)
    await nextTick()
    wrapper.findComponent(DsrReviewActions).vm.$emit('done')
    await nextTick()
    expect(dsrRefresh).toHaveBeenCalledTimes(1)
  })

  it('stale snapshot shows a per-section status banner', async () => {
    ready()
    retentionStale.value = true
    const wrapper = await mountPage()
    expect(wrapper.find('[role="status"]').exists()).toBe(true)
    expect(wrapper.findComponent(UiDataList).exists()).toBe(true) // data still visible
  })
})
