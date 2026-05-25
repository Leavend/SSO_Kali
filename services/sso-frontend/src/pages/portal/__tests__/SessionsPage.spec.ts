import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import SessionsPage from '../SessionsPage.vue'
import { useProfileStore } from '@/stores/profile.store'
import type { UserSessionSummary } from '@/types/profile.types'

vi.mock('@/services/profile.api', () => ({
  profileApi: {
    getSessions: vi.fn().mockResolvedValue([]),
    revokeSession: vi.fn(),
    revokeAllSessions: vi.fn(),
  },
}))

vi.mock('@/composables/useAuthRedirect', () => ({
  useAuthRedirect: () => ({
    toLogin: vi.fn(),
    toHome: vi.fn(),
    reloadTo: vi.fn(),
  }),
}))

const currentSession: UserSessionSummary = {
  session_id: 'session-current',
  user_agent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
  ip_address: '103.88.12.10',
  location: 'Bontang, Kalimantan Timur',
  opened_at: '2026-05-20T16:30:00Z',
  last_used_at: '2026-05-20T18:42:00Z',
  expires_at: '2026-05-21T02:42:00Z',
  is_current: true,
  client_count: 2,
  client_ids: ['portal', 'dashboard'],
  client_display_names: ['Dev-SSO Portal', 'Bontang Civic Dashboard'],
}

const otherSession: UserSessionSummary = {
  session_id: 'session-mobile-1',
  user_agent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
  ip_address: '36.82.10.20',
  location: null,
  opened_at: '2026-05-19T07:30:00Z',
  last_used_at: '2026-05-20T10:11:00Z',
  expires_at: '2026-05-20T22:11:00Z',
  is_current: false,
  client_count: 1,
  client_ids: ['mobile-companion'],
  client_display_names: ['Mobile Companion'],
}

describe('SessionsPage', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  function mountPageWithSessions(
    sessions: readonly UserSessionSummary[],
  ): ReturnType<typeof mount> {
    const profile = useProfileStore()
    profile.sessions = sessions

    return mount(SessionsPage, {
      global: {
        stubs: {
          ConfirmDialog: {
            props: ['open', 'title', 'description', 'confirmLabel'],
            emits: ['confirm'],
            template: `
              <section v-if="open" data-testid="confirm-dialog">
                <h2>{{ title }}</h2>
                <p>{{ description }}</p>
                <button data-testid="confirm-action" @click="$emit('confirm')">{{ confirmLabel }}</button>
              </section>
            `,
          },
          SsoAlertBanner: true,
          Skeleton: true,
        },
      },
    })
  }

  it('uses a secondary global end-all action with confirmation copy', async () => {
    const wrapper = mountPageWithSessions([currentSession, otherSession])

    expect(wrapper.text()).toContain('Keamanan Perangkat')
    expect(wrapper.text()).toContain('Pantau semua perangkat yang sedang login')

    const endAllButton = wrapper.find('[aria-label="Akhiri semua sesi"]')
    expect(endAllButton.text()).toContain('Akhiri Semua Sesi')
    expect(endAllButton.classes()).toContain('sm:w-fit')
    expect(endAllButton.classes()).not.toContain('bg-destructive')
    expect(wrapper.text()).not.toContain('Logout Semua Perangkat')

    await endAllButton.trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="confirm-dialog"]').text()).toContain(
      'Semua perangkat akan dikeluarkan, termasuk perangkat ini',
    )
    expect(wrapper.find('[data-testid="confirm-action"]').text()).toContain('Akhiri Semua Sesi')
  })

  it('renders sessions as a vertical priority list with current session first', () => {
    const wrapper = mountPageWithSessions([otherSession, currentSession])

    const sessionList = wrapper.find('[data-testid="sessions-list"]')
    const cards = wrapper.findAll('[data-testid="session-card"]')

    expect(sessionList.classes()).toContain('grid')
    expect(sessionList.classes()).toContain('gap-3')
    expect(sessionList.classes()).not.toContain('xl:grid-cols-2')
    expect(cards[0]?.text()).toContain('Sesi Aktif Saat Ini')
    expect(cards[1]?.text()).toContain('36.82.10.20')
  })

  it('shows an empty state when only the current session exists', () => {
    const wrapper = mountPageWithSessions([currentSession])

    expect(wrapper.find('[data-testid="sessions-other-empty"]').text()).toContain(
      'Tidak ada sesi aktif lainnya',
    )
    expect(wrapper.text()).toContain('Akun kamu hanya diakses dari perangkat ini')
  })
})
