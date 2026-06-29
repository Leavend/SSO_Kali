import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import enLocale from '@/locales/en.json'
import { ApiError } from '@/lib/api/api-client'
import type { PolicyMutationResponse, SecurityPolicy } from '@/types/policy.types'

const proposeMock = vi.fn<(category: string, payload: unknown) => Promise<PolicyMutationResponse>>()
vi.mock('@/services/policy.api', () => ({
  policyApi: {
    list: vi.fn<() => void>(),
    propose: proposeMock,
    activate: vi.fn<() => void>(),
    rollback: vi.fn<() => void>(),
  },
}))

const POLICY: SecurityPolicy = {
  id: 7,
  category: 'password',
  version: 3,
  status: 'active',
  payload: { min_length: 14 },
  effective_at: '2026-06-20T10:00:00Z',
  actor_subject_id: '01HZX9C7K3Q8VMETBD9R2F4K7N',
  reason: 'Tighten',
  created_at: '2026-06-20T10:00:00Z',
  updated_at: '2026-06-20T10:00:00Z',
}
const policiesRef = ref<readonly SecurityPolicy[] | null>([POLICY])
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
  permitted = ['admin.security-policy.read', 'admin.security-policy.write']
  policiesRef.value = [POLICY]
  proposeMock.mockReset()
  refreshMock.mockReset()
})
afterEach(() => {
  vi.clearAllMocks()
})

async function setPayload(wrapper: Awaited<ReturnType<typeof mountSuspended>>, text: string) {
  await wrapper.find('[data-testid="policy-draft-payload"]').setValue(text)
}

describe('policy propose — draft create', () => {
  it('hides the draft editor without the write capability', async () => {
    permitted = ['admin.security-policy.read']
    const wrapper = await mountSuspended(PolicyPage)
    expect(wrapper.find('[data-testid="policy-draft-payload"]').exists()).toBe(false)
  })

  it('shows an inline parse error and opens no dialog for invalid JSON', async () => {
    const wrapper = await mountSuspended(PolicyPage)
    await setPayload(wrapper, '{not json')
    await wrapper.find('[data-testid="policy-draft-submit"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="policy-draft-parse-error"]').text()).toContain(
      enLocale.policy.payload_parse_error,
    )
    expect(wrapper.find('[data-testid="privileged-action-confirm"]').exists()).toBe(false)
    expect(proposeMock).not.toHaveBeenCalled()
  })

  it('rejects a non-object payload (array) before any API call', async () => {
    const wrapper = await mountSuspended(PolicyPage)
    await setPayload(wrapper, '[1,2,3]')
    await wrapper.find('[data-testid="policy-draft-submit"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="policy-draft-parse-error"]').text()).toContain(
      enLocale.policy.payload_not_object,
    )
    expect(proposeMock).not.toHaveBeenCalled()
  })

  it('confirms valid JSON, proposes, refreshes, and reports success', async () => {
    proposeMock.mockResolvedValue({ policy: { ...POLICY, version: 4, status: 'draft' } })
    const wrapper = await mountSuspended(PolicyPage)
    await setPayload(wrapper, '{"min_length":16}')
    await wrapper.find('[data-testid="policy-draft-submit"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
    await flushPromises()
    expect(proposeMock).toHaveBeenCalledWith('password', {
      payload: { min_length: 16 },
      reason: undefined,
    })
    expect(refreshMock).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="policy-action-success"]').text()).toBe(
      enLocale.policy.propose_success,
    )
  })

  it('surfaces the step-up link on 428 and does not refresh', async () => {
    proposeMock.mockRejectedValue(
      new ApiError(
        428,
        'reauth',
        'reauth_required',
        { step_up_url: 'https://idp.example/step-up' },
        'req-428',
      ),
    )
    const wrapper = await mountSuspended(PolicyPage)
    await setPayload(wrapper, '{"min_length":16}')
    await wrapper.find('[data-testid="policy-draft-submit"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
    await flushPromises()
    expect(
      wrapper.find('[data-testid="privileged-action-stepup"]').find('a').attributes('href'),
    ).toBe('https://idp.example/step-up')
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('shows safe copy + a redacted REF on a 500 without leaking the raw request id', async () => {
    proposeMock.mockRejectedValue(new ApiError(500, 'boom', undefined, {}, 'req-500'))
    const wrapper = await mountSuspended(PolicyPage)
    await setPayload(wrapper, '{"min_length":16}')
    await wrapper.find('[data-testid="policy-draft-submit"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="privileged-action-error"]').text()).toContain(
      enLocale.common.error_generic,
    )
    expect(wrapper.find('[data-testid="privileged-action-ref"]').text()).toMatch(/^REF-/u)
    expect(wrapper.html()).not.toContain('req-500')
    expect(refreshMock).not.toHaveBeenCalled()
  })
})
