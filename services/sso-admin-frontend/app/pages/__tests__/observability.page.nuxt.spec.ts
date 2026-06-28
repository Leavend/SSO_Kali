// *.nuxt.spec.ts → 'nuxt' env: mountSuspended handles the page's async setup
// (useAsyncData + useI18n auto-imports). Data boundary + session store are mocked.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import DashboardMetricGroup from '@/components/dashboard/DashboardMetricGroup.vue'
import ObservabilityServiceList from '@/components/observability/ObservabilityServiceList.vue'
import ObservabilityLogList from '@/components/observability/ObservabilityLogList.vue'
import type { ObservabilitySummary } from '@/types/observability.types'
import type { ObservabilityViewState } from '@/lib/observability/observability-view-state'

const summary = ref<ObservabilitySummary | null>(null)
const viewState = ref<ObservabilityViewState>('loading')
const requestId = ref<string | null>(null)
const degraded = ref<readonly string[]>([])
const isStale = ref(false)
const refreshMock = vi.fn<() => Promise<void>>(async () => {})

vi.mock('@/composables/useObservabilitySummary', () => ({
  useObservabilitySummary: () => ({
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
    hasPermission: (permission: string) => permission === 'admin.observability.read',
  }),
}))

const READY: ObservabilitySummary = {
  generated_at: '2026-06-28T14:32:15Z',
  partial: false,
  degraded: [],
  services: [
    {
      key: 'idp',
      name: 'Identity Provider',
      status: 'healthy',
      summary: 'All checks passing',
      latency_p95_ms: 42,
      freshness_seconds: 5,
    },
    {
      key: 'queue',
      name: 'Queue Worker',
      status: 'degraded',
      summary: 'Backlog growing',
      queue: { pending_jobs: 12, failed_jobs: 1, oldest_pending_age_seconds: 90 },
    },
  ],
  metrics: {
    window_seconds: 86400,
    auth_funnel: { attempts: 1800, succeeded: 1700, denied: 100 },
    admin_activity: { actions: 240, denied: 3 },
    queue: { pending_jobs: 12, failed_jobs: 1, oldest_pending_age_seconds: 90 },
  },
  logs: [
    {
      id: 'evt_01',
      service: 'idp',
      severity: 'warning',
      message: 'Slow token issuance',
      reference: 'corr-LOGREF123',
      occurred_at: '2026-06-28T14:30:00Z',
    },
  ],
  traces: {
    status: 'unavailable',
    reason: 'OTLP collector not configured',
    next_step: 'Enable the collector',
  },
}
const EMPTY: ObservabilitySummary = {
  ...READY,
  services: [],
  metrics: { window_seconds: 86400 },
  logs: [],
  traces: { status: 'unavailable', reason: 'No traces recorded' },
}

const Observability = (await import('../observability/index.vue')).default

beforeEach(() => {
  summary.value = null
  viewState.value = 'loading'
  requestId.value = null
  degraded.value = []
  isStale.value = false
  vi.clearAllMocks()
})
afterEach(() => vi.clearAllMocks())

describe('observability cockpit page', () => {
  it('always renders the masked principal in the hero with no token/PII', async () => {
    const wrapper = await mountSuspended(Observability)
    const principal = wrapper.find('[data-principal-name]')
    expect(principal.exists()).toBe(true)
    expect(principal.text()).toContain('Admin Sentinel')
    expect(wrapper.find('[data-page="observability"]').exists()).toBe(true)
    expect(wrapper.html()).not.toMatch(/access_token|refresh_token|id_token|Bearer/u)
  })

  it('always exposes a named-route cross-link to the compliance console', async () => {
    const wrapper = await mountSuspended(Observability)
    const link = wrapper.find('[data-compliance-link]')
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toBe('/observability/compliance')
  })

  it('loading → skeleton, no service list / metric groups / log list', async () => {
    viewState.value = 'loading'
    const wrapper = await mountSuspended(Observability)
    expect(wrapper.findComponent(UiSkeleton).exists()).toBe(true)
    expect(wrapper.findComponent(ObservabilityServiceList).exists()).toBe(false)
    expect(wrapper.findAllComponents(DashboardMetricGroup).length).toBe(0)
    expect(wrapper.findComponent(ObservabilityLogList).exists()).toBe(false)
  })

  it('forbidden → forbidden status view (no-permission), distinct from empty', async () => {
    viewState.value = 'forbidden'
    requestId.value = 'admin-req-DENIED42'
    const wrapper = await mountSuspended(Observability)
    expect(wrapper.findComponent(UiStatusView).props('tone')).toBe('forbidden')
    expect(wrapper.findComponent(UiEmptyState).exists()).toBe(false)
    expect(wrapper.text()).not.toMatch(/SQLSTATE|stack trace|Bearer/iu)
  })

  it('unauthenticated → step_up status view', async () => {
    viewState.value = 'unauthenticated'
    const wrapper = await mountSuspended(Observability)
    expect(wrapper.findComponent(UiStatusView).props('tone')).toBe('step_up')
  })

  it('error → error status view; raw request id is redacted to REF-XXXXXXXX', async () => {
    viewState.value = 'error'
    requestId.value = 'admin-req-FAILED99'
    const wrapper = await mountSuspended(Observability)
    expect(wrapper.findComponent(UiStatusView).props('tone')).toBe('error')
    expect(wrapper.text()).toContain('REF-')
    expect(wrapper.text()).not.toContain('admin-req-FAILED99')
  })

  it('empty → empty state, not a status view', async () => {
    viewState.value = 'empty'
    summary.value = EMPTY
    const wrapper = await mountSuspended(Observability)
    expect(wrapper.findComponent(UiEmptyState).exists()).toBe(true)
    expect(wrapper.findComponent(UiStatusView).exists()).toBe(false)
  })

  it('ready → service list + three metric groups + log list + traces badge, no leaks', async () => {
    viewState.value = 'ready'
    summary.value = READY
    const wrapper = await mountSuspended(Observability)
    expect(wrapper.findComponent(ObservabilityServiceList).exists()).toBe(true)
    expect(wrapper.findAllComponents(DashboardMetricGroup).length).toBe(3)
    expect(wrapper.findComponent(ObservabilityLogList).exists()).toBe(true)
    expect(wrapper.findComponent(UiStatusBadge).exists()).toBe(true)
    expect(wrapper.text()).toContain('Kesehatan layanan') // id-default localized cockpit copy
    expect(wrapper.html()).toContain('2026-06-28T14:32:15Z') // generated_at folio
    expect(wrapper.html()).not.toMatch(/access_token|refresh_token|id_token|Bearer/u)
    expect(wrapper.html()).not.toContain('corr-LOGREF123') // log reference is masked, never raw
  })

  it('partial → degraded banner naming the sections, workspace still visible', async () => {
    viewState.value = 'ready'
    summary.value = { ...READY, partial: true, degraded: ['queue'] }
    degraded.value = ['queue']
    const wrapper = await mountSuspended(Observability)
    expect(wrapper.find('[role="status"]').exists()).toBe(true)
    expect(wrapper.findComponent(ObservabilityServiceList).exists()).toBe(true)
  })

  it('stale → stale banner above a still-rendered workspace', async () => {
    viewState.value = 'ready'
    summary.value = READY
    isStale.value = true
    const wrapper = await mountSuspended(Observability)
    expect(wrapper.find('[role="status"]').exists()).toBe(true)
    expect(wrapper.findComponent(ObservabilityServiceList).exists()).toBe(true)
  })
})
