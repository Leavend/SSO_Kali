import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import SessionsPage from '../SessionsPage.vue'
import { useProfileStore } from '@/stores/profile.store'

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

describe('SessionsPage', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders the header action as full-width on mobile and compact on larger screens', () => {
    const wrapper = mount(SessionsPage, {
      global: {
        stubs: {
          ConfirmDialog: true,
          SessionCard: {
            template: '<article data-testid="session-card-stub" />',
          },
          SsoAlertBanner: true,
          Skeleton: true,
        },
      },
    })

    const logoutAllButton = wrapper.find('[aria-label="Logout dari semua perangkat"]')

    expect(logoutAllButton.classes()).toContain('w-full')
    expect(logoutAllButton.classes()).toContain('sm:w-fit')
  })

  it('keeps the mobile session list full-width with responsive two-column support on wide screens', () => {
    const profile = useProfileStore()
    profile.sessions = [{
      session_id: 'session-mobile-1',
      user_agent: 'Mozilla/5.0 (Android) Chrome/124.0',
      opened_at: '2026-05-13T08:00:00Z',
      last_used_at: '2026-05-13T08:30:00Z',
      expires_at: '2026-05-13T12:00:00Z',
      is_current: false,
      client_count: 1,
      client_ids: ['portal'],
      client_display_names: ['SSO Portal'],
    }]

    const wrapper = mount(SessionsPage, {
      global: {
        stubs: {
          ConfirmDialog: true,
          SessionCard: {
            template: '<article data-testid="session-card-stub" />',
          },
          SsoAlertBanner: true,
          Skeleton: true,
        },
      },
    })

    const sessionList = wrapper.find('[data-testid="sessions-list"]')

    expect(sessionList.classes()).toContain('w-full')
    expect(sessionList.classes()).toContain('min-w-0')
    expect(sessionList.classes()).toContain('xl:grid-cols-2')
    expect(sessionList.classes()).not.toContain('max-w-md')
  })
})
