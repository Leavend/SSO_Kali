import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import enLocale from '@/locales/en.json'
import type { OpsReadiness } from '@/types/ops.types'

const READY: OpsReadiness = {
  service: 'sso-backend',
  ready: true,
  checks: {
    database: true,
    redis: true,
    queue: { pending_jobs: 0, failed_jobs: 0, oldest_pending_age_seconds: null },
  },
}
const readinessRef = ref<OpsReadiness | null>(READY)
const viewStateRef = ref<'loading' | 'unauthenticated' | 'forbidden' | 'error' | 'ready'>('ready')
const refreshMock = vi.fn<() => Promise<void>>(async () => {})

vi.mock('@/composables/useOpsReadiness', () => ({
  useOpsReadiness: () => ({
    readiness: readinessRef,
    viewState: computed(() => viewStateRef.value),
    requestId: computed(() => null),
    refresh: refreshMock,
  }),
}))

vi.mock('@/stores/session.store', () => ({
  useSessionStore: () => ({
    principal: { display_name: 'Admin', subject_id: 'a1' },
    ensureSession: vi.fn<() => Promise<string>>(async () => 'authenticated'),
    hasPermission: () => true,
    get roles() {
      return [] as readonly string[]
    },
  }),
}))
vi.mock('@/composables/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      let val: unknown = enLocale
      for (const part of key.split('.')) val = (val as Record<string, unknown>)?.[part]
      if (typeof val !== 'string') return key
      return params
        ? val.replace(/\{(\w+)\}/gu, (_: string, k: string) => String(params[k] ?? ''))
        : val
    },
  }),
}))
mockNuxtImport('navigateTo', () => vi.fn<(...a: unknown[]) => Promise<void>>(async () => {}))
const Page = (await import('../ops.vue')).default

beforeEach(() => {
  readinessRef.value = READY
  viewStateRef.value = 'ready'
})
afterEach(() => vi.clearAllMocks())

describe('ops page', () => {
  it('renders readiness + drills in the ready state through the admin shell', async () => {
    const w = await mountSuspended(Page)
    expect(w.find('[data-page="ops"]').exists()).toBe(true)
    expect(w.find('[data-testid="ops-readiness"]').exists()).toBe(true)
    expect(w.find('[data-testid="ops-readiness-status"]').text()).toContain(enLocale.ops.status_ready)
    expect(w.find('[data-testid="ops-check-database"]').exists()).toBe(true)
    expect(w.find('[data-testid="ops-drills"]').exists()).toBe(true)
  })

  it('shows a degraded status badge (danger tone) when not ready', async () => {
    readinessRef.value = { service: 'sso-backend', ready: false, checks: { database: false, redis: true } }
    const w = await mountSuspended(Page)
    const status = w.find('[data-testid="ops-readiness-status"]')
    expect(status.attributes('data-tone')).toBe('danger')
    expect(status.text()).toContain(enLocale.ops.status_degraded)
  })

  it('renders the loading skeleton', async () => {
    readinessRef.value = null
    viewStateRef.value = 'loading'
    const w = await mountSuspended(Page)
    expect(w.find('[data-testid="ops-readiness"]').exists()).toBe(false)
    expect(w.find('[data-testid="ops-drills"]').exists()).toBe(false)
  })

  it('renders the forbidden surface', async () => {
    readinessRef.value = null
    viewStateRef.value = 'forbidden'
    const w = await mountSuspended(Page)
    expect(w.text()).toContain(enLocale.ops.forbidden_title)
  })

  it('renders the error surface with a refresh action', async () => {
    readinessRef.value = null
    viewStateRef.value = 'error'
    const w = await mountSuspended(Page)
    expect(w.text()).toContain(enLocale.ops.error_title)
    await w.find('[data-testid="ops-refresh"]').trigger('click')
    expect(refreshMock).toHaveBeenCalledTimes(1)
  })
})
