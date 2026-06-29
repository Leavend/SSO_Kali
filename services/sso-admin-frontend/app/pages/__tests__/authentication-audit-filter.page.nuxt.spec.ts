// app/pages/__tests__/authentication-audit-filter.page.nuxt.spec.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import enLocale from '@/locales/en.json'
import type { AuthAuditEvent } from '@/types/auth-audit.types'

function event(): AuthAuditEvent {
  return {
    event_id: 'EV1',
    event_type: 'user.login',
    outcome: 'succeeded',
    subject: { subject_id: '01HSUB', email: 'user@example.gov' },
    client_id: 'portal',
    session_id: 'sess_1',
    request: { ip_address: '203.0.113.9', user_agent: 'UA', request_id: 'req_1' },
    error_code: null,
    context: {},
    occurred_at: '2026-06-28T14:32:15+00:00',
  }
}

const eventsRef = ref<readonly AuthAuditEvent[] | null>([event()])
const hasMoreRef = ref(true)
const searchMock = vi.fn<(f: unknown) => Promise<void>>(async () => {})
const loadMoreMock = vi.fn<() => Promise<void>>(async () => {})

vi.mock('@/composables/useAuthAuditEvents', () => ({
  useAuthAuditEvents: () => ({
    events: computed(() => eventsRef.value),
    viewState: computed(() => 'ready' as const),
    isStale: computed(() => false),
    requestId: computed(() => null),
    pending: ref(false),
    hasMore: computed(() => hasMoreRef.value),
    search: searchMock,
    loadMore: loadMoreMock,
    refresh: vi.fn<() => Promise<void>>(async () => {}),
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
  hasMoreRef.value = true
})
afterEach(() => vi.clearAllMocks())

describe('authentication-audit page — filter + load-more wiring', () => {
  it('drives the composable search with the entered filters', async () => {
    const w = await mountSuspended(Page)
    await w.find('[data-testid="auth-audit-filter-event-type"]').setValue('user.logout')
    await w.find('[data-testid="auth-audit-filter-form"]').trigger('submit')
    await flushPromises()
    const arg = searchMock.mock.calls[0]?.[0] as Record<string, unknown>
    expect(arg.event_type).toBe('user.logout')
  })

  it('reset drives an empty search', async () => {
    const w = await mountSuspended(Page)
    await w.find('[data-testid="auth-audit-filter-reset"]').trigger('click')
    await flushPromises()
    expect(searchMock).toHaveBeenCalledWith({})
  })

  it('load-more calls the composable loadMore', async () => {
    const w = await mountSuspended(Page)
    await w.find('[data-testid="auth-audit-load-more"]').trigger('click')
    await flushPromises()
    expect(loadMoreMock).toHaveBeenCalledTimes(1)
  })
})
