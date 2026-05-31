import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useSessionStore } from '@/stores/session.store'
import SessionsPage from '../SessionsPage.vue'
import { useSessionsStore } from '../../stores/sessions.store'
import type { AdminSession } from '../../types'

vi.mock('../../services/sessions.api', () => ({
  sessionsApi: {
    list: vi.fn<() => Promise<unknown>>(),
    show: vi.fn<() => Promise<unknown>>(),
    revoke: vi.fn<() => Promise<unknown>>(),
    revokeUserSessions: vi.fn<() => Promise<unknown>>(),
  },
}))

const session1: AdminSession = {
  session_id: 'sess-001',
  client_id: 'app-a',
  subject_id: 'sub-admin',
  user_email: 'admin@example.test',
  user_display_name: 'Admin User',
  ip_address: '203.0.113.10',
  user_agent: 'Mozilla/5.0 Chrome/120',
  last_activity_at: '2026-05-29T10:00:00Z',
}

const session2: AdminSession = {
  session_id: 'sess-002',
  client_id: 'portal',
  subject_id: 'sub-user',
  user_email: 'user@example.test',
  user_display_name: 'Regular User',
  ip_address: '198.51.100.5',
  last_activity_at: '2026-05-29T09:30:00Z',
}

function seedPrincipal(capabilities: Record<string, boolean>): void {
  useSessionStore().setPrincipal({
    subject_id: 'admin-1',
    email: 'admin@example.test',
    display_name: 'Admin One',
    role: 'admin',
    last_login_at: null,
    auth_context: {
      auth_time: null,
      amr: [],
      acr: null,
      mfa_enforced: false,
      mfa_verified: false,
    },
    permissions: {
      view_admin_panel: true,
      manage_sessions: capabilities['admin.sessions.terminate'] === true,
      capabilities,
      permissions: Object.keys(capabilities),
      menus: [],
    },
  })
}

function seedFullAccessPrincipal(): void {
  seedPrincipal({
      'admin.sessions.terminate': true,
  })
}

describe('SessionsPage', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    seedFullAccessPrincipal()
  })

  it('renders sessions table with session data', () => {
    const store = useSessionsStore()
    store.sessions = [session1, session2]
    store.status = 'success'
    store.requestId = 'req-sessions-1'

    const wrapper = mount(SessionsPage)

    expect(wrapper.text()).toContain('Sessions')
    expect(wrapper.text()).toContain('sess-001')
    expect(wrapper.text()).toContain('sess-002')
    expect(wrapper.text()).toContain('app-a')
    expect(wrapper.text()).toContain('Admin User')
    expect(wrapper.text()).toContain('203.0.113.10')
    expect(wrapper.text()).toContain('req-sessions-1')
  })

  it('renders loading state when status is loading', () => {
    const store = useSessionsStore()
    store.status = 'loading'

    const wrapper = mount(SessionsPage)

    expect(wrapper.text()).toContain('Memuat sessions')
  })

  it('renders forbidden state', () => {
    const store = useSessionsStore()
    store.status = 'forbidden'
    store.errorMessage = 'Kamu tidak memiliki izin.'

    const wrapper = mount(SessionsPage)

    expect(wrapper.text()).toContain('Akses sessions ditolak')
    expect(wrapper.text()).toContain('Kamu tidak memiliki izin.')
  })

  it('renders empty state when no sessions', () => {
    const store = useSessionsStore()
    store.sessions = []
    store.status = 'success'

    const wrapper = mount(SessionsPage)

    expect(wrapper.text()).toContain('Belum ada sesi yang dapat ditampilkan.')
  })

  it('renders revoke button for each session row', () => {
    const store = useSessionsStore()
    store.sessions = [session1, session2]
    store.status = 'success'

    const wrapper = mount(SessionsPage)

    const buttons = wrapper.findAll('button.revoke-button')
    expect(buttons).toHaveLength(2)
  })

  it('calls store.revokeSession when revoke button clicked', async () => {
    const store = useSessionsStore()
    store.sessions = [session1]
    store.status = 'success'
    const revokeSpy = vi.spyOn(store, 'revokeSession')

    const wrapper = mount(SessionsPage)
    await wrapper.find('button.revoke-button').trigger('click')

    expect(revokeSpy).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Konfirmasi aksi admin')

    await wrapper.find('[data-testid="confirm-dialog-confirm"]').trigger('click')

    expect(revokeSpy).toHaveBeenCalledWith('sess-001')
  })

  it('does not revoke a session when confirmation is cancelled', async () => {
    const store = useSessionsStore()
    store.sessions = [session1]
    store.status = 'success'
    const revokeSpy = vi.spyOn(store, 'revokeSession')

    const wrapper = mount(SessionsPage)
    await wrapper.find('button.revoke-button').trigger('click')
    await wrapper.find('[data-testid="confirm-dialog-cancel"]').trigger('click')

    expect(revokeSpy).not.toHaveBeenCalled()
  })

  it('shows step_up_required message when actionStatus is step_up_required', () => {
    const store = useSessionsStore()
    store.sessions = [session1]
    store.status = 'success'
    store.actionStatus = 'step_up_required'
    store.errorMessage = 'Aksi ini membutuhkan fresh-auth.'

    const wrapper = mount(SessionsPage)

    expect(wrapper.text()).toContain('Aksi ini membutuhkan fresh-auth.')
  })

  it('renders unauthenticated state', () => {
    const store = useSessionsStore()
    store.status = 'unauthenticated'
    store.errorMessage = 'Sesi admin berakhir.'

    const wrapper = mount(SessionsPage)

    expect(wrapper.text()).toContain('Sesi admin berakhir')
  })

  it('renders error state', () => {
    const store = useSessionsStore()
    store.status = 'error'
    store.errorMessage = 'Gunakan request ID req-123.'

    const wrapper = mount(SessionsPage)

    expect(wrapper.text()).toContain('Sessions admin belum bisa dimuat')
    expect(wrapper.text()).toContain('Gunakan request ID req-123.')
  })

  it('hides revoke buttons for read-only principals', () => {
    seedPrincipal({})
    const store = useSessionsStore()
    store.sessions = [session1, session2]
    store.status = 'success'

    const wrapper = mount(SessionsPage)

    expect(wrapper.findAll('button.revoke-button')).toHaveLength(0)
  })

})
