// *.nuxt.spec.ts → 'nuxt' env: mountSuspended handles the page's async setup
// (useAsyncData + useI18n auto-imports). Data boundary + session store are mocked.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import DashboardMetricGroup from '@/components/dashboard/DashboardMetricGroup.vue'
import type { DashboardSummary } from '@/types/dashboard.types'
import type { DashboardViewState } from '@/lib/dashboard/dashboard-view-state'

const summary = ref<DashboardSummary | null>(null)
const viewState = ref<DashboardViewState>('loading')
const requestId = ref<string | null>(null)
const degraded = ref<readonly string[]>([])
const isStale = ref(false)
const refreshMock = vi.fn<() => Promise<void>>(async () => {})

vi.mock('@/composables/useDashboardSummary', () => ({
  useDashboardSummary: () => ({
    summary,
    viewState,
    requestId,
    degraded,
    isStale,
    refresh: refreshMock,
  }),
}))

vi.mock('@/stores/session.store', () => ({
  useSessionStore: () => ({
    principal: { display_name: 'Admin Sentinel' },
    ensureSession: vi.fn<() => Promise<string>>(async () => 'authenticated'),
  }),
}))

const READY: DashboardSummary = {
  generated_at: '2026-06-28T14:32:15Z',
  partial: false,
  degraded: [],
  counters: {
    users: { total: 1250, active: 1100, disabled: 50, deactivated: 100, locked: 0 },
    sessions: { portal_active: 420, rp_active: 380 },
    clients: { total: 85, active: 72, staged: 8, decommissioned: 5 },
    audit: { admin_last_24h: 2340, auth_last_24h: 18500 },
    incidents: { admin_denied_last_24h: 12 },
    data_subject_requests: { submitted: 3, approved: 7, rejected: 2, fulfilled: 18, on_hold: 1 },
  },
}
const EMPTY: DashboardSummary = {
  ...READY,
  counters: {
    users: { total: 0, active: 0, disabled: 0, deactivated: 0, locked: 0 },
    sessions: { portal_active: 0, rp_active: 0 },
    clients: { total: 0, active: 0, staged: 0, decommissioned: 0 },
    audit: { admin_last_24h: 0, auth_last_24h: 0 },
    incidents: { admin_denied_last_24h: 0 },
    data_subject_requests: { submitted: 0, approved: 0, rejected: 0, fulfilled: 0, on_hold: 0 },
  },
}

const Dashboard = (await import('../dashboard.vue')).default

beforeEach(() => {
  summary.value = null
  viewState.value = 'loading'
  requestId.value = null
  degraded.value = []
  isStale.value = false
  vi.clearAllMocks()
})
afterEach(() => vi.clearAllMocks())

describe('dashboard page', () => {
  it('always renders the masked principal in the hero with no token/PII', async () => {
    const wrapper = await mountSuspended(Dashboard)
    const principal = wrapper.find('[data-principal-name]')
    expect(principal.exists()).toBe(true)
    expect(principal.text()).toContain('Admin Sentinel')
    expect(wrapper.find('[data-page="dashboard"]').exists()).toBe(true)
    expect(wrapper.html()).not.toMatch(/access_token|refresh_token|id_token|Bearer|SENTINEL-/)
  })

  it('loading → skeleton, no metric groups', async () => {
    viewState.value = 'loading'
    const wrapper = await mountSuspended(Dashboard)
    expect(wrapper.findComponent(UiSkeleton).exists()).toBe(true)
    expect(wrapper.findAllComponents(DashboardMetricGroup).length).toBe(0)
  })

  it('forbidden → forbidden status view (no-permission), distinct from empty', async () => {
    viewState.value = 'forbidden'
    requestId.value = 'admin-req-DENIED42'
    const wrapper = await mountSuspended(Dashboard)
    const view = wrapper.findComponent(UiStatusView)
    expect(view.props('tone')).toBe('forbidden')
    expect(wrapper.findComponent(UiEmptyState).exists()).toBe(false)
    expect(wrapper.text()).not.toMatch(/SQLSTATE|stack trace|Bearer/i)
  })

  it('unauthenticated → step_up status view', async () => {
    viewState.value = 'unauthenticated'
    const wrapper = await mountSuspended(Dashboard)
    expect(wrapper.findComponent(UiStatusView).props('tone')).toBe('step_up')
  })

  it('error → error status view; raw request id is redacted to REF-XXXXXXXX', async () => {
    viewState.value = 'error'
    requestId.value = 'admin-req-FAILED99'
    const wrapper = await mountSuspended(Dashboard)
    expect(wrapper.findComponent(UiStatusView).props('tone')).toBe('error')
    expect(wrapper.text()).toContain('REF-')
    expect(wrapper.text()).not.toContain('admin-req-FAILED99')
  })

  it('empty (all-zero) → empty state, not a status view', async () => {
    viewState.value = 'empty'
    summary.value = EMPTY
    const wrapper = await mountSuspended(Dashboard)
    expect(wrapper.findComponent(UiEmptyState).exists()).toBe(true)
    expect(wrapper.findComponent(UiStatusView).exists()).toBe(false)
  })

  it('ready → six metric groups + generated_at folio, no secrets', async () => {
    viewState.value = 'ready'
    summary.value = READY
    const wrapper = await mountSuspended(Dashboard)
    expect(wrapper.findAllComponents(DashboardMetricGroup).length).toBe(6)
    expect(wrapper.text()).toContain('Total Akun') // localized counter label (id default)
    expect(wrapper.html()).toContain('2026-06-28T14:32:15Z') // folio timestamp
    expect(wrapper.html()).not.toMatch(/access_token|Bearer|SENTINEL-/)
  })

  it('partial → degraded banner naming the groups, data still visible', async () => {
    viewState.value = 'ready'
    summary.value = { ...READY, partial: true, degraded: ['sessions'] }
    degraded.value = ['sessions']
    const wrapper = await mountSuspended(Dashboard)
    expect(wrapper.find('[role="status"]').exists()).toBe(true)
    expect(wrapper.findAllComponents(DashboardMetricGroup).length).toBe(6)
  })
})
