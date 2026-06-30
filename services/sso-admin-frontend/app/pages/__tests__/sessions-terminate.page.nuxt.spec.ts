import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import enLocale from '@/locales/en.json'
import { ApiError } from '@/lib/api/api-client'
import type { SessionRevokeResponse, AdminSession } from '@/types/sessions.types'

const revokeMock = vi.fn<(id: string) => Promise<SessionRevokeResponse>>()
vi.mock('@/services/sessions.api', () => ({
  sessionsApi: { list: vi.fn<() => Promise<unknown>>(), revoke: revokeMock },
}))

const ADMIN_SUBJECT = '01HZX9ADMINULID00000000ZZ'
const OTHER: AdminSession = {
  session_id: 'sess_other',
  client_id: 'portal',
  subject_id: 'subj_other',
  email: 'bob@example.test',
  display_name: 'Bob Operator',
  ip_address: '198.51.100.7',
}
const MINE: AdminSession = {
  session_id: 'sess_mine',
  client_id: 'console',
  subject_id: ADMIN_SUBJECT,
  email: 'admin@example.test',
  display_name: 'Admin Sentinel',
  ip_address: '203.0.113.9',
}
const sessionsRef = ref<readonly AdminSession[] | null>([OTHER, MINE])
const refreshMock = vi.fn<() => Promise<void>>(async () => {})
vi.mock('@/composables/useSessionsList', () => ({
  useSessionsList: () => ({
    sessions: sessionsRef,
    viewState: computed(() => 'ready' as const),
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
    principal: { display_name: 'Admin Sentinel', subject_id: ADMIN_SUBJECT },
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
      return params
        ? val.replace(/\{(\w+)\}/gu, (_: string, k: string) => String(params[k] ?? ''))
        : val
    },
  }),
}))

const navigateMock = vi.hoisted(() => vi.fn<(...a: unknown[]) => Promise<void>>(async () => {}))
mockNuxtImport('navigateTo', () => navigateMock)
mockNuxtImport('useRoute', () => () => ({ fullPath: '/sessions' }))
mockNuxtImport('useRequestURL', () => () => new URL('https://admin-sso.example/sessions'))
// app.baseURL is consumed by Nuxt's own router plugin, so the stub must keep it
// alongside the public.basePath reverifySelf reads (mirror roles-delete.page.nuxt.spec).
mockNuxtImport('useRuntimeConfig', () => () => ({
  app: { baseURL: '/' },
  public: { basePath: '/' },
}))

const SessionsPage = (await import('../sessions.vue')).default

async function openDrawerAndTerminate(
  wrapper: Awaited<ReturnType<typeof mountSuspended>>,
  id: string,
) {
  await wrapper.find(`[data-testid="session-select-${id}"]`).trigger('click')
  await flushPromises()
  await wrapper.find('[data-testid="session-terminate"]').trigger('click')
  await flushPromises()
}

beforeEach(() => {
  permitted = ['admin.sessions.terminate']
  sessionsRef.value = [OTHER, MINE]
  revokeMock.mockReset()
  refreshMock.mockReset()
  ensureSessionMock.mockReset()
  ensureSessionMock.mockResolvedValue('authenticated')
})
afterEach(() => {
  vi.clearAllMocks()
})

describe('sessions terminate — gate + lifecycle', () => {
  it('hides Revoke without the terminate capability', async () => {
    permitted = []
    const wrapper = await mountSuspended(SessionsPage)
    await wrapper.find('[data-testid="session-select-sess_other"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="session-terminate"]').exists()).toBe(false)
  })

  it('confirm revokes the session, refreshes, and reports success; cancel calls no API', async () => {
    revokeMock.mockResolvedValue({ revoked: true, session_id: 'sess_other' })
    const wrapper = await mountSuspended(SessionsPage)
    await wrapper.find('[data-testid="session-select-sess_other"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="session-terminate"]').trigger('click')
    await flushPromises()
    expect(revokeMock).not.toHaveBeenCalled() // dialog open, not yet confirmed
    await wrapper.find('[data-testid="privileged-action-cancel"]').trigger('click')
    await flushPromises()
    expect(revokeMock).not.toHaveBeenCalled()
    // re-open + confirm
    await openDrawerAndTerminate(wrapper, 'sess_other')
    await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
    await flushPromises()
    expect(revokeMock).toHaveBeenCalledWith('sess_other')
    expect(refreshMock).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="sessions-action-success"]').text()).toBe(
      enLocale.sessions.terminate_success,
    )
  })
})

describe('sessions terminate — self-lockout guard', () => {
  it('warns when revoking one of the acting admin own sessions', async () => {
    const wrapper = await mountSuspended(SessionsPage)
    await openDrawerAndTerminate(wrapper, 'sess_mine')
    expect(wrapper.find('[data-testid="privileged-action-impact"]').text()).toContain(
      enLocale.sessions.self_affect_warn,
    )
  })

  it('non-self terminate shows no self-warning and never re-verifies', async () => {
    revokeMock.mockResolvedValue({ revoked: true, session_id: 'sess_other' })
    const wrapper = await mountSuspended(SessionsPage)
    await openDrawerAndTerminate(wrapper, 'sess_other')
    expect(wrapper.find('[data-testid="privileged-action-impact"]').text()).not.toContain(
      enLocale.sessions.self_affect_warn,
    )
    await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
    await flushPromises()
    expect(ensureSessionMock).not.toHaveBeenCalledWith(true)
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('self terminate that drops the session re-routes via the bootstrap resolver', async () => {
    revokeMock.mockResolvedValue({ revoked: true, session_id: 'sess_mine' })
    ensureSessionMock.mockResolvedValue('unauthenticated')
    const wrapper = await mountSuspended(SessionsPage)
    await openDrawerAndTerminate(wrapper, 'sess_mine')
    await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
    await flushPromises()
    expect(revokeMock).toHaveBeenCalledWith('sess_mine')
    expect(ensureSessionMock).toHaveBeenCalledWith(true)
    expect(navigateMock).toHaveBeenCalled()
  })

  it('self terminate of a different device stays put while still authenticated', async () => {
    revokeMock.mockResolvedValue({ revoked: true, session_id: 'sess_mine' })
    ensureSessionMock.mockResolvedValue('authenticated')
    const wrapper = await mountSuspended(SessionsPage)
    await openDrawerAndTerminate(wrapper, 'sess_mine')
    await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
    await flushPromises()
    expect(ensureSessionMock).toHaveBeenCalledWith(true)
    expect(navigateMock).not.toHaveBeenCalled()
  })
})

describe('sessions terminate — failure matrix (real runner)', () => {
  it.each([403, 419, 429, 500])(
    'surfaces safe copy + a redacted REF for %i without refreshing',
    async (status) => {
      revokeMock.mockRejectedValue(new ApiError(status, 'boom', undefined, {}, `req-${status}`))
      const wrapper = await mountSuspended(SessionsPage)
      await openDrawerAndTerminate(wrapper, 'sess_other')
      await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
      await flushPromises()
      expect(wrapper.find('[data-testid="privileged-action-error"]').text()).toContain(
        enLocale.common.error_generic,
      )
      expect(wrapper.find('[data-testid="privileged-action-ref"]').text()).toMatch(/^REF-/u)
      expect(wrapper.html()).not.toContain(`req-${status}`)
      expect(refreshMock).not.toHaveBeenCalled()
    },
  )

  it('surfaces the step-up link on 428 and does not refresh', async () => {
    revokeMock.mockRejectedValue(
      new ApiError(
        428,
        'reauth',
        'reauth_required',
        { step_up_url: 'https://idp.example/step-up' },
        'req-428',
      ),
    )
    const wrapper = await mountSuspended(SessionsPage)
    await openDrawerAndTerminate(wrapper, 'sess_other')
    await wrapper.find('[data-testid="privileged-action-confirm"]').trigger('click')
    await flushPromises()
    expect(
      wrapper.find('[data-testid="privileged-action-stepup"]').find('a').attributes('href'),
    ).toBe('https://idp.example/step-up')
    expect(wrapper.find('[data-testid="privileged-action-error"]').exists()).toBe(false)
    expect(refreshMock).not.toHaveBeenCalled()
  })
})
