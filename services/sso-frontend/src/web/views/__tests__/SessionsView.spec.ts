import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import SessionsView from '../SessionsView.vue'
import { useAdminStore } from '../../stores/admin'

const sessions = [
  {
    session_id: 'session-with-a-very-long-identifier-1234567890',
    subject_id: 'subject-1',
    client_id: 'portal-user-web-client-with-long-name',
    display_name: 'A Very Long User Display Name That Must Not Push Actions',
    email: 'very.long.email.address@example-company.internal',
    scope: 'openid profile email',
    created_at: '2026-05-13T08:00:00Z',
    expires_at: '2026-05-13T12:00:00Z',
  },
]

function mountSessionsView() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const admin = useAdminStore()
  admin.sessions = sessions
  admin.principal = {
    subject: 'admin-1',
    displayName: 'Admin User',
    email: 'admin@example.test',
    role: 'admin',
    expiresAt: 1_777_000_000,
    authTime: null,
    amr: [],
    acr: null,
    lastLoginAt: null,
    permissions: { view_admin_panel: true, manage_sessions: true },
  }
  admin.loadSessions = async () => {}

  return mount(SessionsView, {
    global: {
      plugins: [pinia],
      stubs: {
        PageHeader: true,
        FilterBar: true,
        BulkActionBar: true,
        SlideOver: true,
        ConfirmDialog: true,
      },
    },
  })
}

describe('SessionsView', () => {
  it('keeps production session cards compact with action controls aligned on mobile', () => {
    const wrapper = mountSessionsView()

    const header = wrapper.find('[data-testid="sessions-page-header"]')
    const list = wrapper.find('[data-testid="sessions-list"]')
    const card = wrapper.find('[data-testid="session-card"]')
    const actions = wrapper.find('[data-testid="session-card-actions"]')
    const revokeButton = wrapper.find('[data-testid="session-revoke-button"]')
    const revokeLabel = wrapper.find('[data-testid="session-revoke-label"]')

    expect(header.classes()).toContain('sessions-page-header')
    expect(list.classes()).toContain('sessions-list--compact')
    expect(list.classes()).toContain('sessions-list--responsive-polished')
    expect(card.classes()).toContain('session-card--responsive')
    expect(card.classes()).toContain('session-card--mobile-polished')
    expect(actions.classes()).toContain('session-card__actions--responsive')
    expect(revokeButton.classes()).toContain('session-card__revoke--responsive')
    expect(revokeLabel.classes()).toContain('session-card__revoke-label')
  })

  it('truncates long production session metadata instead of overflowing action controls', () => {
    const wrapper = mountSessionsView()

    expect(wrapper.find('[data-testid="session-card-main"]').classes()).toContain('session-card__main--responsive')
    expect(wrapper.find('[data-testid="session-card-main"]').classes()).toContain('session-card__main--mobile-polished')
    expect(wrapper.find('[data-testid="session-card-identity"]').classes()).toContain('session-card__identity--responsive')
    expect(wrapper.find('[data-testid="session-card-email"]').classes()).toContain('session-card__text-truncate')
    expect(wrapper.find('[data-testid="session-card-meta"]').classes()).toContain('session-card__meta--responsive')
    expect(wrapper.find('[data-testid="session-card-meta"]').classes()).toContain('session-card__meta--mobile-polished')
  })
})
