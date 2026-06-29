// app/pages/__tests__/authentication-audit.page.nuxt.spec.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import enLocale from '@/locales/en.json'
import type { AuthAuditEvent } from '@/types/auth-audit.types'

function event(over: Partial<AuthAuditEvent> = {}): AuthAuditEvent {
  return {
    event_id: 'EV1',
    event_type: 'user.login',
    outcome: 'failed',
    subject: { subject_id: '01HSUB', email: 'user@example.gov' },
    client_id: 'portal',
    session_id: 'sess_1',
    request: { ip_address: '203.0.113.9', user_agent: 'UA', request_id: 'req_1' },
    error_code: 'invalid_credentials',
    context: { mfa: 'totp' },
    occurred_at: '2026-06-28T14:32:15+00:00',
    ...over,
  }
}

const eventsRef = ref<readonly AuthAuditEvent[] | null>([event()])
const viewStateRef = ref<'loading' | 'unauthenticated' | 'forbidden' | 'error' | 'empty' | 'ready'>('ready')
const hasMoreRef = ref(false)
const searchMock = vi.fn<(f: unknown) => Promise<void>>(async () => {})
const loadMoreMock = vi.fn<() => Promise<void>>(async () => {})
const refreshMock = vi.fn<() => Promise<void>>(async () => {})

vi.mock('@/composables/useAuthAuditEvents', () => ({
  useAuthAuditEvents: () => ({
    events: computed(() => eventsRef.value),
    viewState: computed(() => viewStateRef.value),
    isStale: computed(() => false),
    requestId: computed(() => null),
    pending: ref(false),
    hasMore: computed(() => hasMoreRef.value),
    search: searchMock,
    loadMore: loadMoreMock,
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
mockNuxtImport('useRoute', () => () => ({ query: {} }))
const Page = (await import('../authentication-audit.vue')).default

beforeEach(() => {
  eventsRef.value = [event()]
  viewStateRef.value = 'ready'
  hasMoreRef.value = false
})
afterEach(() => vi.clearAllMocks())

describe('authentication-audit page — read surface', () => {
  it('renders the table + event through the admin shell', async () => {
    const w = await mountSuspended(Page)
    expect(w.find('[data-page="authentication-audit"]').exists()).toBe(true)
    expect(w.find('[data-testid="auth-audit-select-EV1"]').exists()).toBe(true)
    expect(w.text()).toContain('user@example.gov')
  })

  it('opens the detail drawer on select and shows ip + redacted-aware context', async () => {
    const w = await mountSuspended(Page)
    await w.find('[data-testid="auth-audit-select-EV1"]').trigger('click')
    await flushPromises()
    const drawer = w.find('[data-testid="auth-audit-detail"]')
    expect(drawer.exists()).toBe(true)
    expect(drawer.text()).toContain('203.0.113.9')
    expect(drawer.text()).toContain('invalid_credentials')
  })

  it('renders the empty state when there are no events', async () => {
    eventsRef.value = []
    viewStateRef.value = 'empty'
    const w = await mountSuspended(Page)
    expect(w.text()).toContain(enLocale.auth_audit.empty_title)
  })

  it('renders the forbidden surface', async () => {
    eventsRef.value = null
    viewStateRef.value = 'forbidden'
    const w = await mountSuspended(Page)
    expect(w.text()).toContain(enLocale.auth_audit.forbidden_title)
  })

  it('shows the load-more button only when hasMore', async () => {
    hasMoreRef.value = true
    const w = await mountSuspended(Page)
    expect(w.find('[data-testid="auth-audit-load-more"]').exists()).toBe(true)
    hasMoreRef.value = false
    const w2 = await mountSuspended(Page)
    expect(w2.find('[data-testid="auth-audit-load-more"]').exists()).toBe(false)
  })
})
