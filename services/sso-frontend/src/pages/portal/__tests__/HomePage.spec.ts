import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import HomePage from '../HomePage.vue'
import { useProfileStore } from '@/stores/profile.store'
import { useSessionStore } from '@/stores/session.store'

vi.mock('@/services/profile.api', () => ({
  profileApi: {
    getSessions: vi.fn().mockResolvedValue([]),
    getConnectedApps: vi.fn().mockResolvedValue([]),
  },
}))

describe('HomePage', () => {
  beforeEach(() => {
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
})
