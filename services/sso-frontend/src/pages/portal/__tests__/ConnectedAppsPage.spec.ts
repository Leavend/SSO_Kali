import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ConnectedAppsPage from '../ConnectedAppsPage.vue'
import { useProfileStore } from '@/stores/profile.store'

vi.mock('@/services/profile.api', () => ({
  profileApi: {
    getConnectedApps: vi.fn().mockResolvedValue([]),
    revokeConnectedApp: vi.fn(),
  },
}))

describe('ConnectedAppsPage', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('centers and balances the empty state on mobile portal viewports', () => {
    const profile = useProfileStore()
    profile.connectedApps = []

    const wrapper = mount(ConnectedAppsPage, {
      global: {
        stubs: {
          ConfirmDialog: true,
          Skeleton: true,
        },
      },
    })

    const emptyState = wrapper.find('[data-testid="connected-apps-empty-state"]')
    const emptyIcon = wrapper.find('[data-testid="connected-apps-empty-icon"]')
    const emptyCopy = wrapper.find('[data-testid="connected-apps-empty-copy"]')
    const emptyCard = emptyState.element.parentElement

    expect(emptyCard?.classList.contains('px-5')).toBe(true)
    expect(emptyState.classes()).toContain('items-center')
    expect(emptyState.classes()).toContain('text-center')
    expect(emptyIcon.classes()).toContain('mx-auto')
    expect(emptyIcon.classes()).toContain('size-12')
    expect(emptyCopy.classes()).toContain('max-w-[18rem]')
  })

  it('keeps connected app cards responsive and truncates long identifiers', () => {
    const profile = useProfileStore()
    profile.connectedApps = [{
      client_id: 'very-long-client-id-that-must-not-overflow-mobile-width',
      display_name: 'Example Production Application With Long Name',
      first_connected_at: '2026-05-13T08:00:00Z',
      last_used_at: '2026-05-13T08:30:00Z',
      expires_at: '2026-05-13T12:00:00Z',
      active_refresh_tokens: 1,
    }]

    const wrapper = mount(ConnectedAppsPage, {
      global: {
        stubs: {
          ConfirmDialog: true,
          Skeleton: true,
        },
      },
    })

    const appCard = wrapper.find('[data-testid="connected-app-card"]')
    const appContent = wrapper.find('[data-testid="connected-app-content"]')
    const appClientId = wrapper.find('[data-testid="connected-app-client-id"]')

    expect(appCard.classes()).toContain('min-w-0')
    expect(appCard.classes()).toContain('sm:flex-row')
    expect(appContent.classes()).toContain('min-w-0')
    expect(appClientId.classes()).toContain('truncate')
  })
})
