import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import enLocale from '@/locales/en.json'
import type { IpAccessRule } from '@/types/ip-access.types'

vi.mock('@/services/ip-access.api', () => ({
  ipAccessApi: {
    list: vi.fn<() => Promise<unknown>>(),
    create: vi.fn<(p: unknown) => Promise<unknown>>(),
    remove: vi.fn<(id: number) => Promise<void>>(),
  },
}))

const RULE: IpAccessRule = {
  id: 7,
  cidr: '203.0.113.0/24',
  mode: 'block',
  reason: 'Maintenance window',
  expires_at: null,
  actor_subject_id: 'sub-admin-7',
  created_at: '2026-06-20T10:00:00Z',
  updated_at: '2026-06-20T10:00:00Z',
}
const rulesRef = ref<readonly IpAccessRule[] | null>([RULE])
const viewStateRef = ref<'loading' | 'forbidden' | 'unauthenticated' | 'error' | 'empty' | 'ready'>(
  'ready',
)
vi.mock('@/composables/useIpAccessRules', () => ({
  useIpAccessRules: () => ({
    rules: rulesRef,
    viewState: computed(() => viewStateRef.value),
    isStale: computed(() => false),
    requestId: computed(() => null),
    pending: ref(false),
    refresh: vi.fn<() => Promise<void>>(async () => {}),
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

beforeEach(() => {
  permitted = ['admin.ip-access.read']
  rulesRef.value = [RULE]
  viewStateRef.value = 'ready'
})
afterEach(() => vi.clearAllMocks())

describe('ip-access page — read surface', () => {
  it('renders the table with the rule + Swiss mode label', async () => {
    const wrapper = await mountSuspended(Page)
    expect(wrapper.find('[data-page="ip-access"]').exists()).toBe(true)
    expect(wrapper.html()).toContain('203.0.113.0/24')
    expect(wrapper.html()).toContain(enLocale.ip_access.mode_block)
  })

  it('hides the Add button without write permission', async () => {
    const wrapper = await mountSuspended(Page)
    expect(wrapper.find('[data-testid="ip-access-create"]').exists()).toBe(false)
  })

  it('shows the Add button with write permission', async () => {
    permitted = ['admin.ip-access.read', 'admin.ip-access.write']
    const wrapper = await mountSuspended(Page)
    expect(wrapper.find('[data-testid="ip-access-create"]').exists()).toBe(true)
  })

  it('opens the detail drawer on select and shows reason + actor', async () => {
    const wrapper = await mountSuspended(Page)
    await wrapper.find('[data-testid="ip-access-select-7"]').trigger('click')
    await flushPromises()
    const drawer = wrapper.find('[data-testid="ip-access-detail"]')
    expect(drawer.exists()).toBe(true)
    expect(drawer.text()).toContain('Maintenance window')
    expect(drawer.text()).toContain('sub-admin-7')
  })

  it('hides the drawer Delete button without the double gate', async () => {
    permitted = ['admin.ip-access.read', 'admin.ip-access.write'] // missing sessions.terminate
    const wrapper = await mountSuspended(Page)
    await wrapper.find('[data-testid="ip-access-select-7"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="ip-access-delete"]').exists()).toBe(false)
  })

  it('renders the empty state when there are no rules', async () => {
    rulesRef.value = []
    viewStateRef.value = 'empty'
    const wrapper = await mountSuspended(Page)
    expect(wrapper.text()).toContain(enLocale.ip_access.empty_title)
  })
})
