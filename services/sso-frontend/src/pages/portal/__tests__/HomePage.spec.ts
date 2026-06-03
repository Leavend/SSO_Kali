import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import HomePage from '../HomePage.vue'
import { useProfileStore } from '@/stores/profile.store'
import { useSessionStore } from '@/stores/session.store'
import { profileApi } from '@/services/profile.api'

vi.mock('@/services/profile.api', () => ({
  profileApi: {
    getSessions: vi.fn().mockResolvedValue([]),
    getConnectedApps: vi.fn().mockResolvedValue([]),
  },
}))

describe('HomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
  })

  it('renders the portal liquid-glass hero and dashboard metrics', () => {
    const session = useSessionStore()
    const profile = useProfileStore()
    session.user = {
      id: 'u-1',
      email: 'user@example.test',
      display_name: 'Bontang User',
      roles: ['member'],
    }
    profile.sessions = []
    profile.connectedApps = []

    const wrapper = mount(HomePage, {
      global: {
        stubs: {
          PortalPageHeader: {
            props: ['eyebrow', 'title', 'description', 'icon'],
            template:
              '<header data-testid="portal-page-header" class="portal-glass-hero"><slot name="actions" /></header>',
          },
          RouterLink: true,
        },
      },
    })

    expect(wrapper.find('[data-testid="portal-page-header"]').classes()).toContain(
      'portal-glass-hero',
    )
    expect(wrapper.findAll('[data-testid="home-metric-card"]')).toHaveLength(3)
    expect(wrapper.findAll('[data-testid="home-shortcut-card"]')).toHaveLength(4)
  })

  it('shows an error state instead of zero when sessions fail to load', async () => {
    vi.mocked(profileApi.getSessions).mockRejectedValueOnce(new Error('network'))
    vi.mocked(profileApi.getConnectedApps).mockResolvedValueOnce([
      {
        client_id: 'sso-admin-panel',
        display_name: 'Admin Panel',
        first_connected_at: '2026-06-03T05:24:00Z',
        last_used_at: '2026-06-03T05:24:00Z',
        expires_at: null,
        active_refresh_tokens: 1,
      },
    ])

    const session = useSessionStore()
    session.user = {
      id: 'u-1',
      email: 'user@example.test',
      display_name: 'Bontang User',
      roles: ['member'],
    }

    const wrapper = mount(HomePage, {
      global: {
        stubs: {
          PortalPageHeader: true,
          RouterLink: true,
        },
      },
    })
    await flushPromises()

    expect(wrapper.get('[data-testid="home-sessions-metric"]').text()).toBe('—')
    expect(wrapper.find('[data-testid="home-sessions-error"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="home-connected-apps-metric"]').text()).toBe('1')
  })

  it('shows loaded dashboard counters when both requests succeed', async () => {
    vi.mocked(profileApi.getSessions).mockResolvedValueOnce([
      {
        session_id: 'sess-1',
        opened_at: '2026-06-03T05:00:00Z',
        last_used_at: '2026-06-03T05:24:00Z',
        expires_at: '2026-06-04T05:24:00Z',
        client_count: 1,
        client_ids: ['sso-admin-panel'],
        client_display_names: ['Admin Panel'],
      },
    ])
    vi.mocked(profileApi.getConnectedApps).mockResolvedValueOnce([
      {
        client_id: 'sso-admin-panel',
        display_name: 'Admin Panel',
        first_connected_at: '2026-06-03T05:24:00Z',
        last_used_at: '2026-06-03T05:24:00Z',
        expires_at: null,
        active_refresh_tokens: 1,
      },
    ])

    const wrapper = mount(HomePage, {
      global: {
        stubs: {
          PortalPageHeader: true,
          RouterLink: true,
        },
      },
    })
    await flushPromises()

    expect(wrapper.get('[data-testid="home-sessions-metric"]').text()).toBe('1')
    expect(wrapper.get('[data-testid="home-connected-apps-metric"]').text()).toBe('1')
  })
})
