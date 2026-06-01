import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useSessionStore } from '@/stores/session.store'
import UsersPage from '../UsersPage.vue'
import { useUsersStore } from '../../stores/users.store'
import { useSessionsStore } from '../../../sessions/stores/sessions.store'
import type { AdminUser } from '../../types'

vi.mock('../../services/users.api', () => ({
  usersApi: {
    create: vi.fn<() => Promise<unknown>>(),
    list: vi.fn<() => Promise<unknown>>(),
    show: vi.fn<() => Promise<unknown>>(),
    lock: vi.fn<() => Promise<unknown>>(),
    unlock: vi.fn<() => Promise<unknown>>(),
    deactivate: vi.fn<() => Promise<unknown>>(),
    reactivate: vi.fn<() => Promise<unknown>>(),
    issuePasswordReset: vi.fn<() => Promise<unknown>>(),
    resetMfa: vi.fn<() => Promise<unknown>>(),
    syncProfile: vi.fn<() => Promise<unknown>>(),
  },
}))

vi.mock('../../../sessions/services/sessions.api', () => ({
  sessionsApi: {
    list: vi.fn<() => Promise<unknown>>(),
    show: vi.fn<() => Promise<unknown>>(),
    revoke: vi.fn<() => Promise<unknown>>(),
    revokeUserSessions: vi.fn<() => Promise<unknown>>(),
  },
}))

const user: AdminUser = {
  subject_id: 'sub_admin',
  email: 'admin@example.test',
  display_name: 'Admin User',
  role: 'admin',
  status: 'active',
  local_account_enabled: true,
  email_verified_at: '2026-05-27T00:00:00Z',
  last_login_at: '2026-05-27T01:00:00Z',
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
    'admin.users.write': true,
    'admin.users.lock': true,
    'admin.sessions.terminate': true,
  })
}

describe('UsersPage', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    seedFullAccessPrincipal()
  })

  it('renders user list, detail, assurance evidence, sessions, and request ID', () => {
    const store = useUsersStore()
    store.status = 'success'
    store.users = [user]
    store.selectedSubjectId = 'sub_admin'
    store.loginContext = {
      ip_address: '203.0.113.10',
      risk_score: 15,
      mfa_required: true,
    }
    store.sessions = [{ session_id: 'sess_1', client_id: 'portal' }]
    store.requestId = 'req-users-1'

    const wrapper = mount(UsersPage)

    expect(wrapper.text()).toContain('Users')
    expect(wrapper.text()).toContain('Admin User')
    expect(wrapper.text()).toContain('admin@example.test')
    expect(wrapper.text()).toContain('MFA required')
    expect(wrapper.text()).toContain('sess_1')
    expect(wrapper.text()).toContain('Request ID')
    expect(wrapper.text()).toContain('req-users-1')
    expect(wrapper.text()).not.toMatch(/Bearer|refreshToken|password|SQLSTATE/i)
  })

  it('renders safe forbidden state', () => {
    const store = useUsersStore()
    store.status = 'forbidden'
    store.errorMessage = 'Kamu tidak memiliki izin untuk melihat users admin.'

    const wrapper = mount(UsersPage)

    expect(wrapper.text()).toContain('Akses users ditolak')
    expect(wrapper.text()).not.toContain('SQLSTATE')
  })

  it('renders step-up required action copy', () => {
    const store = useUsersStore()
    store.status = 'success'
    store.users = [user]
    store.selectedSubjectId = 'sub_admin'
    store.actionStatus = 'step_up_required'
    store.errorMessage =
      'Aksi ini membutuhkan fresh-auth atau MFA assurance. Ulangi login admin lalu coba lagi.'

    const wrapper = mount(UsersPage)

    expect(wrapper.text()).toContain('fresh-auth atau MFA assurance')
    expect(wrapper.text()).not.toContain('raw ACR')
  })

  it('does not render password reset token and shows safe reset evidence instead', () => {
    const store = useUsersStore()
    store.status = 'success'
    store.users = [user]
    store.selectedSubjectId = 'sub_admin'
    store.auditEventId = 'AUD-RESET-1'
    store.passwordResetToken = 'reset-token-once'

    const wrapper = mount(UsersPage)

    expect(wrapper.text()).toContain('Password reset dikirim melalui channel aman backend.')
    expect(wrapper.text()).toContain('AUD-RESET-1')
    expect(wrapper.text()).not.toContain('reset-token-once')
  })

  it('renders empty state when no users are available', () => {
    const store = useUsersStore()
    store.status = 'success'
    store.users = []
    store.selectedSubjectId = null

    const wrapper = mount(UsersPage)

    expect(wrapper.text()).toContain('Belum ada user untuk ditampilkan.')
    expect(wrapper.find('.ui-empty-state').exists()).toBe(true)
  })

  it('uses shared loading, status, data, and form primitives', async () => {
    const store = useUsersStore()
    store.status = 'loading'

    const wrapper = mount(UsersPage)

    expect(wrapper.find('.ui-skeleton').exists()).toBe(true)

    store.status = 'forbidden'
    store.errorMessage = 'Kamu tidak memiliki izin untuk melihat users admin.'
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.ui-status-view').exists()).toBe(true)

    store.status = 'success'
    store.users = [user]
    store.selectedSubjectId = 'sub_admin'
    await wrapper.vm.$nextTick()
    await wrapper.find('button.create-user-toggle').trigger('click')
    expect(wrapper.find('.ui-data-list').exists()).toBe(true)
    expect(wrapper.find('.ui-form-field').exists()).toBe(true)
    expect(wrapper.find('.ui-control').exists()).toBe(true)
  })

  it('renders create user form with email, display_name, role inputs', async () => {
    const store = useUsersStore()
    store.status = 'success'
    store.users = [user]
    store.selectedSubjectId = 'sub_admin'

    const wrapper = mount(UsersPage)

    expect(wrapper.text()).toContain('Create User')
    await wrapper.find('button.create-user-toggle').trigger('click')
    expect(wrapper.find('input[name="create-email"]').exists()).toBe(true)
    expect(wrapper.find('input[name="create-display-name"]').exists()).toBe(true)
    expect(wrapper.find('select[name="create-role"]').exists()).toBe(true)
  })

  it('renders revoke user sessions button and calls sessionsStore.revokeUserSessions', async () => {
    const store = useUsersStore()
    store.status = 'success'
    store.users = [user]
    store.selectedSubjectId = 'sub_admin'
    store.loginContext = {
      ip_address: '203.0.113.10',
      risk_score: 3,
      mfa_required: false,
    }

    const sessionsStore = useSessionsStore()
    const revokeSpy = vi.spyOn(sessionsStore, 'revokeUserSessions')

    const wrapper = mount(UsersPage)

    expect(wrapper.text()).toContain('Revoke User Sessions')
    await wrapper.find('button.revoke-user-sessions-button').trigger('click')

    expect(revokeSpy).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Konfirmasi aksi admin')

    await wrapper.find('[data-testid="confirm-dialog-confirm"]').trigger('click')

    expect(revokeSpy).toHaveBeenCalledWith('sub_admin')
  })

  it('does not lock a user before destructive action confirmation and cancel is no-op', async () => {
    const store = useUsersStore()
    store.status = 'success'
    store.users = [user]
    store.selectedSubjectId = 'sub_admin'
    const lockSpy = vi.spyOn(store, 'lockSelected')

    const wrapper = mount(UsersPage)

    await wrapper.find('button.lifecycle-lock-button').trigger('click')
    expect(lockSpy).not.toHaveBeenCalled()

    await wrapper.find('[data-testid="confirm-dialog-cancel"]').trigger('click')
    expect(lockSpy).not.toHaveBeenCalled()
  })

  it('calls reset MFA only after destructive action confirmation', async () => {
    const store = useUsersStore()
    store.status = 'success'
    store.users = [user]
    store.selectedSubjectId = 'sub_admin'
    const resetSpy = vi.spyOn(store, 'resetMfaSelected')

    const wrapper = mount(UsersPage)

    await wrapper.find('button.lifecycle-reset-mfa-button').trigger('click')
    expect(resetSpy).not.toHaveBeenCalled()

    await wrapper.find('[data-testid="confirm-dialog-confirm"]').trigger('click')
    expect(resetSpy).toHaveBeenCalledWith('Admin review')
  })

  it('renders sync profile form with pre-filled fields and calls store.syncProfileSelected', async () => {
    const store = useUsersStore()
    store.status = 'success'
    store.users = [
      {
        ...user,
        given_name: 'Admin',
        family_name: 'One',
        profile_synced_at: '2026-05-29T08:00:00Z',
      },
    ]
    store.selectedSubjectId = 'sub_admin'
    store.loginContext = {
      ip_address: '203.0.113.10',
      risk_score: 3,
      mfa_required: false,
    }
    const syncSpy = vi.spyOn(store, 'syncProfileSelected')

    const wrapper = mount(UsersPage)

    expect(wrapper.text()).toContain('Sync Profile')
    expect(wrapper.text()).toContain('2026-05-29T08:00:00Z')

    const emailInput = wrapper.find('input[name="sync-email"]')
    const displayNameInput = wrapper.find('input[name="sync-display-name"]')
    const givenNameInput = wrapper.find('input[name="sync-given-name"]')
    const familyNameInput = wrapper.find('input[name="sync-family-name"]')

    expect((emailInput.element as HTMLInputElement).value).toBe('admin@example.test')
    expect((displayNameInput.element as HTMLInputElement).value).toBe('Admin User')
    expect((givenNameInput.element as HTMLInputElement).value).toBe('Admin')
    expect((familyNameInput.element as HTMLInputElement).value).toBe('One')

    await wrapper.find('button.sync-profile-button').trigger('click')

    expect(syncSpy).toHaveBeenCalledWith({
      email: 'admin@example.test',
      display_name: 'Admin User',
      given_name: 'Admin',
      family_name: 'One',
    })
  })

  it('hides user write, lock, and session actions for read-only principals', () => {
    seedPrincipal({})
    const store = useUsersStore()
    store.status = 'success'
    store.users = [user]
    store.selectedSubjectId = 'sub_admin'
    store.sessions = [{ session_id: 'sess_1', client_id: 'portal' }]

    const wrapper = mount(UsersPage)

    expect(wrapper.text()).not.toContain('Create User')
    expect(wrapper.text()).not.toContain('Sync Profile')
    expect(wrapper.text()).not.toContain('Revoke User Sessions')
    expect(wrapper.text()).not.toContain('Lock')
    expect(wrapper.text()).not.toContain('Unlock')
    expect(wrapper.text()).not.toContain('Deactivate')
    expect(wrapper.text()).not.toContain('Reactivate')
    expect(wrapper.text()).not.toContain('Reset MFA')
    expect(wrapper.text()).not.toContain('Issue reset link')
  })

  it('renders user action groups only for matching permissions', () => {
    seedPrincipal({ 'admin.users.lock': true, 'admin.sessions.terminate': true })
    const store = useUsersStore()
    store.status = 'success'
    store.users = [user]
    store.selectedSubjectId = 'sub_admin'
    store.sessions = [{ session_id: 'sess_1', client_id: 'portal' }]

    const wrapper = mount(UsersPage)

    expect(wrapper.text()).toContain('Lock')
    expect(wrapper.text()).toContain('Unlock')
    expect(wrapper.text()).toContain('Revoke User Sessions')
    expect(wrapper.text()).not.toContain('Create User')
    expect(wrapper.text()).not.toContain('Sync Profile')
    expect(wrapper.text()).not.toContain('Deactivate')
  })
})
