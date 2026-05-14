import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import MySessionsView from '../MySessionsView.vue'
import { useSessionStore } from '../../stores/session'

const mySessions = [
  {
    session_id: 'session-mobile-1',
    user_agent: 'Mozilla/5.0',
    opened_at: '2026-05-13T08:00:00Z',
    last_used_at: '2026-05-13T08:30:00Z',
    expires_at: '2026-05-13T12:00:00Z',
    is_current: false,
    client_count: 1,
    client_ids: ['portal'],
    client_display_names: ['SSO Portal'],
  },
]

function mountMySessionsView() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const session = useSessionStore()
  session.mySessions = mySessions
  session.loadMySessions = async () => {}

  return mount(MySessionsView, {
    global: {
      plugins: [pinia],
      stubs: {
        PageHeader: true,
      },
    },
  })
}

describe('MySessionsView', () => {
  it('keeps session cards compact with centered icon and icon-only revoke on mobile', () => {
    const wrapper = mountMySessionsView()

    const item = wrapper.find('[data-testid="my-session-item"]')
    const icon = wrapper.find('[data-testid="my-session-icon"]')
    const revokeButton = wrapper.find('[data-testid="my-session-revoke-button"]')
    const revokeLabel = wrapper.find('[data-testid="my-session-revoke-label"]')

    expect(item.classes()).toContain('grid-cols-[2.5rem_minmax(0,1fr)_2.5rem]')
    expect(icon.classes()).toContain('justify-self-center')
    expect(icon.classes()).toContain('self-center')
    expect(revokeButton.classes()).toContain('size-10')
    expect(revokeButton.classes()).toContain('sm:w-fit')
    expect(revokeLabel.classes()).toContain('sr-only')
    expect(revokeLabel.classes()).toContain('sm:not-sr-only')
  })

  it('truncates long session metadata instead of pushing the action column', () => {
    const wrapper = mountMySessionsView()

    expect(wrapper.find('[data-testid="my-session-meta"]').classes()).toContain('min-w-0')
    expect(wrapper.find('[data-testid="my-session-client-names"]').classes()).toContain('truncate')
    expect(wrapper.find('[data-testid="my-session-activity"]').classes()).toContain('truncate')
  })
})
