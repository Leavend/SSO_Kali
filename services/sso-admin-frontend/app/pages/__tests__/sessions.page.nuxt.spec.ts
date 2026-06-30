import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import enLocale from '@/locales/en.json'
import type { SessionsViewState } from '@/lib/sessions/sessions-view-state'
import type { AdminSession } from '@/types/sessions.types'

const SESSION: AdminSession = {
  session_id: 'sess_alpha_handle',
  client_id: 'portal',
  subject_id: '01HZX9SUBJECTULID00000000AB',
  email: 'alice@example.test',
  display_name: 'Alice Admin',
  scope: 'openid profile',
  ip_address: '203.0.113.10',
  user_agent: 'Mozilla/5.0 (Macintosh)',
  created_at: '2026-06-01T00:00:00Z',
  last_activity_at: '2026-06-02T08:30:00Z',
  expires_at: '2026-07-01T00:00:00Z',
}

const sessionsRef = ref<readonly AdminSession[] | null>([SESSION])
const viewStateRef = ref<SessionsViewState>('ready')
const refreshMock = vi.fn<() => Promise<void>>(async () => {})
vi.mock('@/composables/useSessionsList', () => ({
  useSessionsList: () => ({
    sessions: sessionsRef,
    viewState: computed(() => viewStateRef.value),
    isStale: computed(() => false),
    requestId: computed(() => null),
    pending: ref(false),
    refresh: refreshMock,
  }),
}))

let permitted: string[] = []
vi.mock('@/stores/session.store', () => ({
  useSessionStore: () => ({
    principal: { display_name: 'Admin Sentinel', subject_id: '01HZX9ADMINULID00000000ZZ' },
    ensureSession: vi.fn<(force?: boolean) => Promise<string>>(async () => 'authenticated'),
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

const SessionsPage = (await import('../sessions.vue')).default

beforeEach(() => {
  permitted = ['admin.sessions.terminate']
  sessionsRef.value = [SESSION]
  viewStateRef.value = 'ready'
  refreshMock.mockReset()
})
afterEach(() => {
  vi.clearAllMocks()
})

describe('sessions page — states', () => {
  it('renders the loading skeleton', async () => {
    viewStateRef.value = 'loading'
    const wrapper = await mountSuspended(SessionsPage)
    expect(wrapper.find('[data-page="sessions"]').exists()).toBe(true)
    expect(wrapper.find(`[aria-label="${enLocale.sessions.loading}"]`).exists()).toBe(true)
  })

  it('renders the forbidden surface', async () => {
    viewStateRef.value = 'forbidden'
    const wrapper = await mountSuspended(SessionsPage)
    expect(wrapper.text()).toContain(enLocale.sessions.forbidden_title)
  })

  it('renders the empty surface when there are no active sessions', async () => {
    viewStateRef.value = 'empty'
    sessionsRef.value = []
    const wrapper = await mountSuspended(SessionsPage)
    expect(wrapper.text()).toContain(enLocale.sessions.empty)
  })

  it('renders the sessions table in the ready state', async () => {
    const wrapper = await mountSuspended(SessionsPage)
    expect(wrapper.find('[data-testid="session-select-sess_alpha_handle"]').exists()).toBe(true)
  })
})

describe('sessions page — search + detail drawer', () => {
  it('filters the table by the search query', async () => {
    sessionsRef.value = [
      SESSION,
      {
        ...SESSION,
        session_id: 'sess_bravo_handle',
        display_name: 'Bob Operator',
        ip_address: '198.51.100.7',
      },
    ]
    const wrapper = await mountSuspended(SessionsPage)
    await wrapper.find('[data-testid="sessions-search"]').setValue('bob')
    await flushPromises()
    expect(wrapper.find('[data-testid="session-select-sess_bravo_handle"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="session-select-sess_alpha_handle"]').exists()).toBe(false)
  })

  it('opens the read-only detail drawer with session metadata on row select', async () => {
    const wrapper = await mountSuspended(SessionsPage)
    await wrapper.find('[data-testid="session-select-sess_alpha_handle"]').trigger('click')
    await flushPromises()
    const drawer = wrapper.find('[data-testid="session-detail"]')
    expect(drawer.exists()).toBe(true)
    expect(drawer.text()).toContain('alice@example.test') // email
    expect(drawer.text()).toContain('203.0.113.10') // ip mono
    expect(drawer.text()).toContain('Mozilla/5.0 (Macintosh)') // user agent
  })
})
