import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import enLocale from '@/locales/en.json'
import { ApiError } from '@/lib/api/api-client'
import type { PolicyMutationResponse, SecurityPolicy } from '@/types/policy.types'

const activateMock = vi.fn<(c: string, v: number, p: unknown) => Promise<PolicyMutationResponse>>()
vi.mock('@/services/policy.api', () => ({
  policyApi: {
    list: vi.fn<() => void>(),
    propose: vi.fn<() => void>(),
    activate: activateMock,
    rollback: vi.fn<() => void>(),
  },
}))

const ACTIVE: SecurityPolicy = {
  id: 7,
  category: 'password',
  version: 3,
  status: 'active',
  payload: { min_length: 14 },
  effective_at: '2026-06-20T10:00:00Z',
  actor_subject_id: '01HZX9C7K3Q8VMETBD9R2F4K7N',
  reason: 'Baseline',
  created_at: '2026-06-20T10:00:00Z',
  updated_at: '2026-06-20T10:00:00Z',
}
const DRAFT: SecurityPolicy = { ...ACTIVE, id: 8, version: 4, status: 'draft', reason: 'New draft' }
const policiesRef = ref<readonly SecurityPolicy[] | null>([DRAFT, ACTIVE])
const refreshMock = vi.fn<() => Promise<void>>(async () => {})
vi.mock('@/composables/useSecurityPolicies', () => ({
  useSecurityPolicies: () => ({
    policies: policiesRef,
    active: computed(() => ({ min_length: 14 })),
    viewState: computed(() => 'ready' as const),
    isStale: computed(() => false),
    requestId: computed(() => null),
    pending: ref(false),
    refresh: refreshMock,
  }),
}))
let permitted: string[] = []
vi.mock('@/stores/session.store', () => ({
  useSessionStore: () => ({
    principal: { display_name: 'Admin Sentinel' },
    ensureSession: vi.fn<() => Promise<string>>(async () => 'authenticated'),
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
      return params
        ? val.replace(/\{(\w+)\}/gu, (_: string, k: string) => String(params[k] ?? ''))
        : val
    },
  }),
}))
mockNuxtImport('navigateTo', () => vi.fn<(...a: unknown[]) => Promise<void>>(async () => {}))

const PolicyPage = (await import('../policy.vue')).default

beforeEach(() => {
  permitted = ['admin.security-policy.read', 'admin.security-policy.activate']
  policiesRef.value = [DRAFT, ACTIVE]
  activateMock.mockReset()
  refreshMock.mockReset()
})
afterEach(() => {
  vi.clearAllMocks()
})

async function openDraftDrawer(wrapper: Awaited<ReturnType<typeof mountSuspended>>) {
  await wrapper.find('[data-testid="policy-version-select-8"]').trigger('click')
  await flushPromises()
}

describe('policy activate', () => {
  it('shows Activate only for a draft version, and only with the activate capability', async () => {
    const wrapper = await mountSuspended(PolicyPage)
    await openDraftDrawer(wrapper)
    expect(wrapper.find('[data-testid="policy-activate"]').exists()).toBe(true)
  })

  it('hides Activate on the active version', async () => {
    const wrapper = await mountSuspended(PolicyPage)
    await wrapper.find('[data-testid="policy-version-select-7"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="policy-activate"]').exists()).toBe(false)
  })

  it('hides Activate without the activate capability', async () => {
    permitted = ['admin.security-policy.read']
    const wrapper = await mountSuspended(PolicyPage)
    await openDraftDrawer(wrapper)
    expect(wrapper.find('[data-testid="policy-activate"]').exists()).toBe(false)
  })

  it('confirm shows the transition impact (replaces active version) and calls no API before confirm', async () => {
    const wrapper = await mountSuspended(PolicyPage)
    await openDraftDrawer(wrapper)
    await wrapper.find('[data-testid="policy-activate"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="privileged-action-impact"]').text()).toContain('4')
    expect(wrapper.find('[data-testid="privileged-action-impact"]').text()).toContain('3')
    expect(activateMock).not.toHaveBeenCalled()
  })

  it('activates, refreshes, and reports success', async () => {
    activateMock.mockResolvedValue({ policy: { ...DRAFT, status: 'active' } })
    const wrapper = await mountSuspended(PolicyPage)
    await openDraftDrawer(wrapper)
    await wrapper.find('[data-testid="policy-activate"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
    await flushPromises()
    expect(activateMock).toHaveBeenCalledWith('password', 4, { reason: undefined })
    expect(refreshMock).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="policy-action-success"]').text()).toBe(
      enLocale.policy.activate_success,
    )
  })

  it('maps 422 security_policy_invalid to safe domain copy without leaking the exception', async () => {
    activateMock.mockRejectedValue(
      new ApiError(
        422,
        'Rolled-back versions cannot be re-activated',
        'security_policy_invalid',
        {},
        'req-422',
      ),
    )
    const wrapper = await mountSuspended(PolicyPage)
    await openDraftDrawer(wrapper)
    await wrapper.find('[data-testid="policy-activate"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="privileged-action-error"]').text()).toContain(
      enLocale.policy.error_invalid_transition,
    )
    expect(wrapper.html()).not.toContain('Rolled-back versions cannot be re-activated')
    expect(refreshMock).not.toHaveBeenCalled()
  })
})
