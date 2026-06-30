// app/pages/__tests__/ip-access-delete.page.nuxt.spec.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import enLocale from '@/locales/en.json'
import { ApiError } from '@/lib/api/api-client'
import type { IpAccessRule } from '@/types/ip-access.types'

const removeMock = vi.fn<(id: number) => Promise<void>>()
vi.mock('@/services/ip-access.api', () => ({
  ipAccessApi: {
    list: vi.fn<() => Promise<unknown>>(),
    create: vi.fn<(p: unknown) => Promise<unknown>>(),
    remove: removeMock,
  },
}))

const RULE: IpAccessRule = {
  id: 7,
  cidr: '203.0.113.0/24',
  mode: 'block',
  reason: 'maint',
  expires_at: null,
  actor_subject_id: 'sub-a',
  created_at: null,
  updated_at: null,
}
const rulesRef = ref<readonly IpAccessRule[] | null>([RULE])
const refreshMock = vi.fn<() => Promise<void>>(async () => {})
vi.mock('@/composables/useIpAccessRules', () => ({
  useIpAccessRules: () => ({
    rules: rulesRef,
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
    principal: { display_name: 'Admin', subject_id: 'a1' },
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
const Page = (await import('../ip-access.vue')).default

async function openDelete(wrapper: Awaited<ReturnType<typeof mountSuspended>>) {
  await wrapper.find('[data-testid="ip-access-select-7"]').trigger('click')
  await flushPromises()
  await wrapper.find('[data-testid="ip-access-delete"]').trigger('click')
  await flushPromises()
}

beforeEach(() => {
  permitted = ['admin.ip-access.read', 'admin.ip-access.write', 'admin.sessions.terminate']
  rulesRef.value = [RULE]
  removeMock.mockReset()
  refreshMock.mockReset()
})
afterEach(() => vi.clearAllMocks())

describe('ip-access delete — double gate', () => {
  it('hides Delete without sessions.terminate (single gate is not enough)', async () => {
    permitted = ['admin.ip-access.read', 'admin.ip-access.write']
    const wrapper = await mountSuspended(Page)
    await wrapper.find('[data-testid="ip-access-select-7"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="ip-access-delete"]').exists()).toBe(false)
  })

  it('confirm deletes, refreshes, reports success; cancel calls no API', async () => {
    removeMock.mockResolvedValue(undefined)
    const wrapper = await mountSuspended(Page)
    await openDelete(wrapper)
    expect(removeMock).not.toHaveBeenCalled()
    await wrapper.find('[data-testid="privileged-action-cancel"]').trigger('click')
    await flushPromises()
    expect(removeMock).not.toHaveBeenCalled()
    await openDelete(wrapper)
    await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
    await flushPromises()
    expect(removeMock).toHaveBeenCalledWith(7)
    expect(refreshMock).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="ip-access-action-success"]').text()).toBe(
      enLocale.ip_access.delete_success,
    )
  })

  it('maps a 422 to SAFE copy (never the raw message) and does not refresh', async () => {
    removeMock.mockRejectedValue(
      new ApiError(422, 'SQLSTATE row not found', 'validation', {}, 'req-422'),
    )
    const wrapper = await mountSuspended(Page)
    await openDelete(wrapper)
    await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="privileged-action-error"]').text()).toContain(
      enLocale.ip_access.delete_invalid,
    )
    expect(wrapper.html()).not.toContain('SQLSTATE')
    expect(wrapper.html()).not.toContain('req-422')
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('surfaces step-up on 428', async () => {
    removeMock.mockRejectedValue(
      new ApiError(428, 'reauth', 'reauth_required', { step_up_url: 'https://idp.example/up' }, 'r'),
    )
    const wrapper = await mountSuspended(Page)
    await openDelete(wrapper)
    await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
    await flushPromises()
    expect(
      wrapper.find('[data-testid="privileged-action-stepup"]').find('a').attributes('href'),
    ).toBe('https://idp.example/up')
    expect(refreshMock).not.toHaveBeenCalled()
  })
})
