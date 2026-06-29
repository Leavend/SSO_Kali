// *.nuxt.spec.ts → nuxt env. The composable, session store, i18n and navigateTo are
// mocked so each state is deterministic; mountSuspended runs the page's async setup.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import enLocale from '@/locales/en.json'
import type { PolicyViewState } from '@/lib/policy/policy-view-state'
import type { SecurityPolicy } from '@/types/policy.types'

const ACTIVE_POLICY: SecurityPolicy = {
  id: 7,
  category: 'password',
  version: 3,
  status: 'active',
  payload: { min_length: 14, require_special: true },
  effective_at: '2026-06-20T10:00:00Z',
  actor_subject_id: '01HZX9ADMINULID0000000000',
  reason: 'Tighten password policy',
  created_at: '2026-06-20T10:00:00Z',
  updated_at: '2026-06-20T10:00:00Z',
}

const policiesRef = ref<readonly SecurityPolicy[] | null>([ACTIVE_POLICY])
const activeRef = ref<Readonly<Record<string, unknown>> | null>({ min_length: 14 })
const viewStateRef = ref<PolicyViewState>('ready')
const refreshMock = vi.fn<() => Promise<void>>(async () => {})
vi.mock('@/composables/useSecurityPolicies', () => ({
  useSecurityPolicies: () => ({
    policies: policiesRef,
    active: computed(() => activeRef.value),
    viewState: computed(() => viewStateRef.value),
    isStale: computed(() => false),
    requestId: computed(() => null),
    pending: ref(false),
    refresh: refreshMock,
  }),
}))

let permitted: string[] = []
const ensureSessionMock = vi.fn<(force?: boolean) => Promise<string>>(async () => 'authenticated')
vi.mock('@/stores/session.store', () => ({
  useSessionStore: () => ({
    principal: { display_name: 'Admin Sentinel' },
    ensureSession: ensureSessionMock,
    hasPermission: (p: string) => permitted.includes(p),
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
      if (!params) return val
      return val.replace(/\{(\w+)\}/gu, (_: string, k: string) => String(params[k] ?? ''))
    },
  }),
}))

mockNuxtImport('navigateTo', () => vi.fn<(...a: unknown[]) => Promise<void>>(async () => {}))

const PolicyPage = (await import('../policy.vue')).default

beforeEach(() => {
  permitted = ['admin.security-policy.read']
  policiesRef.value = [ACTIVE_POLICY]
  activeRef.value = { min_length: 14 }
  viewStateRef.value = 'ready'
  refreshMock.mockReset()
})
afterEach(() => {
  vi.clearAllMocks()
})

describe('policy page — states', () => {
  it('renders the loading skeleton', async () => {
    viewStateRef.value = 'loading'
    const wrapper = await mountSuspended(PolicyPage)
    expect(wrapper.find('[data-page="policy"]').exists()).toBe(true)
    // UiSkeleton surfaces its label as an accessible aria-label, not visible text
    // (matches the merged roles page), so assert the labelled skeleton renders.
    expect(wrapper.find(`[aria-label="${enLocale.policy.loading}"]`).exists()).toBe(true)
  })

  it('renders the forbidden surface', async () => {
    viewStateRef.value = 'forbidden'
    const wrapper = await mountSuspended(PolicyPage)
    expect(wrapper.text()).toContain(enLocale.policy.forbidden_title)
  })

  it('renders the empty surface when the category has no versions', async () => {
    viewStateRef.value = 'empty'
    policiesRef.value = []
    const wrapper = await mountSuspended(PolicyPage)
    expect(wrapper.text()).toContain(enLocale.policy.empty_title)
  })

  it('renders the versions table in the ready state', async () => {
    const wrapper = await mountSuspended(PolicyPage)
    expect(wrapper.find('[data-testid="policy-version-select-7"]').exists()).toBe(true)
  })
})

describe('policy page — active summary + detail drawer', () => {
  it('shows the active configuration payload (read surface)', async () => {
    const wrapper = await mountSuspended(PolicyPage)
    expect(wrapper.find('[data-testid="policy-active-summary"]').text()).toContain('min_length')
  })

  it('opens the read-only detail drawer with the version payload + actor on row select', async () => {
    const wrapper = await mountSuspended(PolicyPage)
    await wrapper.find('[data-testid="policy-version-select-7"]').trigger('click')
    await flushPromises()
    const drawer = wrapper.find('[data-testid="policy-detail"]')
    expect(drawer.exists()).toBe(true)
    expect(drawer.text()).toContain('require_special') // payload JSON rendered
    expect(drawer.text()).toContain('01HZX9ADMINULID0000000000') // actor mono
    expect(drawer.text()).toContain('Tighten password policy') // reason
  })
})
