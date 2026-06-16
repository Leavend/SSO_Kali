import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useSessionStore } from '@/stores/session.store'
import UsersPage from '../UsersPage.vue'
import { useUsersStore } from '../../stores/users.store'
import { useSessionsStore } from '../../../sessions/stores/sessions.store'
import { useRolesStore } from '../../../roles/stores/roles.store'
import { useToast } from '@/components/ui/useToast'
import { useI18n } from '@/composables/useI18n'
import type { AdminUser } from '../../types'

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: vi.fn<() => void>(),
  }),
}))

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
    useI18n().setLocale('en')
    seedFullAccessPrincipal()
  })

  it('renders user list, detail, assurance evidence, sessions, and reference code', () => {
    const store = useUsersStore()
    store.status = 'success'
    store.users = [user]
    store.selectedSubjectId = 'sub_admin'
    store.loginContext = {
      ip_address: '203.0.113.10',
      mfa_required: true,
    }
    store.sessions = [{ session_id: 'sess_1', client_id: 'portal' }]
    store.requestId = 'req-users-1'

    const wrapper = mount(UsersPage)

    expect(wrapper.text()).toContain('Users')
    expect(wrapper.text()).toContain('Admin User')
    expect(wrapper.text()).toContain('admin@example.test')
    expect(wrapper.text()).toContain('MFA required')
    expect(wrapper.text()).not.toContain('Risk score')
    expect(wrapper.text()).toContain('REF-SESS1')
    expect(wrapper.text()).toContain('Kode referensi')
    expect(wrapper.text()).toContain('REF-EQUSERS1')
    expect(wrapper.text()).not.toContain('sess_1')
    expect(wrapper.text()).not.toContain('req-users-1')
    expect(wrapper.text()).not.toMatch(/Bearer|refreshToken|password|SQLSTATE/i)
  })

  it('keeps last-login evidence out of the user list card', () => {
    const store = useUsersStore()
    store.status = 'success'
    store.users = [user]
    store.selectedSubjectId = 'sub_admin'

    const wrapper = mount(UsersPage)

    expect(wrapper.find('.user-card-item__last-login').exists()).toBe(false)
    expect(wrapper.find('.user-card-item').text()).not.toContain('Last login')
  })

  it('renders last-login evidence in the selected user stat card from detail context fallback', () => {
    const store = useUsersStore()
    store.status = 'success'
    store.users = [{ ...user, last_login_at: null }]
    store.selectedSubjectId = 'sub_admin'
    store.loginContext = {
      ip_address: '203.0.113.10',
      mfa_required: false,
      last_seen_at: '2026-05-27T01:00:00Z',
    }

    const wrapper = mount(UsersPage)

    const lastLoginStat = wrapper
      .findAll('.user-stat-card')
      .find((card) => card.text().includes('Last login'))
    expect(lastLoginStat?.text()).toContain('27 May 2026')
  })

  it('renders safe forbidden state', () => {
    const store = useUsersStore()
    store.status = 'forbidden'
    store.errorMessage = 'Kamu tidak memiliki izin untuk melihat users admin.'

    const wrapper = mount(UsersPage)

    expect(wrapper.text()).toContain('User access denied')
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
    expect(wrapper.text()).toContain('REF-UDRESET1')
    expect(wrapper.text()).not.toContain('AUD-RESET-1')
    expect(wrapper.text()).not.toContain('reset-token-once')
  })

  it('renders empty state when no users are available', () => {
    const store = useUsersStore()
    store.status = 'success'
    store.users = []
    store.selectedSubjectId = null

    const wrapper = mount(UsersPage)

    expect(wrapper.text()).toContain('No users to display.')
    expect(wrapper.find('.ui-empty-state').exists()).toBe(true)
  })

  it('renders loading inside the final users layout shell to prevent layout shift', () => {
    const store = useUsersStore()
    store.status = 'loading'

    const wrapper = mount(UsersPage)

    expect(wrapper.find('.users-layout').exists()).toBe(true)
    expect(wrapper.find('.users-list').exists()).toBe(true)
    expect(wrapper.find('.user-detail-container').exists()).toBe(true)
    expect(wrapper.find('.ui-skeleton').exists()).toBe(false)
    expect(wrapper.findAll('.user-card-item--skeleton')).toHaveLength(6)
    expect(wrapper.find('.user-detail-loading-shell').exists()).toBe(true)
  })

  it('uses shared status, data, and form primitives', async () => {
    const store = useUsersStore()
    store.status = 'loading'

    const wrapper = mount(UsersPage)

    expect(wrapper.find('.users-layout').exists()).toBe(true)

    store.status = 'forbidden'
    store.errorMessage = 'Kamu tidak memiliki izin untuk melihat users admin.'
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.ui-status-view').exists()).toBe(true)

    store.status = 'success'
    store.users = [user]
    store.selectedSubjectId = 'sub_admin'
    await wrapper.vm.$nextTick()
    // The searchable list itself uses shared form primitives.
    expect(wrapper.find('input#search-users').exists()).toBe(true)
  })

  it('renders revoke user sessions button and calls sessionsStore.revokeUserSessions', async () => {
    const store = useUsersStore()
    store.status = 'success'
    store.users = [user]
    store.selectedSubjectId = 'sub_admin'
    store.loginContext = {
      ip_address: '203.0.113.10',
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
      mfa_required: false,
    }
    const syncSpy = vi.spyOn(store, 'syncProfileSelected')

    const wrapper = mount(UsersPage)

    expect(wrapper.text()).toContain('Sync Profile')
    expect(wrapper.text()).toContain('29 May 2026')

    const emailInput = wrapper.find('input[name="sync-email"]')
    const givenNameInput = wrapper.find('input[name="sync-given-name"]')
    const familyNameInput = wrapper.find('input[name="sync-family-name"]')

    expect((emailInput.element as HTMLInputElement).value).toBe('admin@example.test')
    expect(wrapper.find('input[name="sync-display-name"]').exists()).toBe(false)
    expect((givenNameInput.element as HTMLInputElement).value).toBe('Admin')
    expect((familyNameInput.element as HTMLInputElement).value).toBe('One')
    expect(wrapper.find('[data-testid="sync-display-name-preview"]').text()).toContain('Admin One')

    await wrapper.find('button.sync-profile-button').trigger('click')

    expect(syncSpy).toHaveBeenCalledWith({
      email: 'admin@example.test',
      display_name: 'Admin One',
      given_name: 'Admin',
      family_name: 'One',
    })
  })

  it('submits sync profile display name from one given-name word and one family-name word without a display-name field', async () => {
    const store = useUsersStore()
    store.status = 'success'
    store.users = [
      {
        ...user,
        display_name: 'Legacy Display',
        given_name: 'Admin Middle',
        family_name: 'User Family',
      },
    ]
    store.selectedSubjectId = 'sub_admin'
    const syncSpy = vi.spyOn(store, 'syncProfileSelected')

    const wrapper = mount(UsersPage)

    expect(wrapper.find('input[name="sync-display-name"]').exists()).toBe(false)

    await wrapper.find('button.sync-profile-button').trigger('click')

    expect(syncSpy).toHaveBeenCalledWith({
      email: 'admin@example.test',
      display_name: 'Admin User',
      given_name: 'Admin Middle',
      family_name: 'User Family',
    })
  })

  it('updates sync profile display-name preview while typing given and family names', async () => {
    const store = useUsersStore()
    store.status = 'success'
    store.users = [
      {
        ...user,
        display_name: 'Legacy Display',
        given_name: 'Admin Middle',
        family_name: 'User Family',
      },
    ]
    store.selectedSubjectId = 'sub_admin'

    const wrapper = mount(UsersPage)

    expect(wrapper.find('[data-testid="sync-display-name-preview"]').text()).toContain('Admin User')

    await wrapper.find('input[name="sync-given-name"]').setValue('Tio Hady')
    await wrapper.find('input[name="sync-family-name"]').setValue('Pranoto Family')

    expect(wrapper.find('[data-testid="sync-display-name-preview"]').text()).toContain(
      'Tio Pranoto',
    )
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
    seedPrincipal({
      'admin.users.lock': true,
      'admin.sessions.terminate': true,
    })
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

  it('renders an accessible tablist with Overview selected by default', () => {
    const store = useUsersStore()
    store.status = 'success'
    store.users = [user]
    store.selectedSubjectId = 'sub_admin'

    const wrapper = mount(UsersPage)

    expect(wrapper.find('[role="tablist"]').exists()).toBe(true)
    const tabs = wrapper.findAll('[role="tab"]')
    // overview + security + sessions + lifecycle (full-access principal)
    expect(tabs).toHaveLength(4)
    const selected = tabs.filter((tab) => tab.attributes('aria-selected') === 'true')
    expect(selected).toHaveLength(1)
    expect(selected[0]!.text()).toContain('Overview')
  })

  it('activates the matching panel when a tab is clicked', async () => {
    const store = useUsersStore()
    store.status = 'success'
    store.users = [user]
    store.selectedSubjectId = 'sub_admin'
    store.sessions = [{ session_id: 'sess_1', client_id: 'portal' }]

    const wrapper = mount(UsersPage)

    expect(wrapper.find('#user-panel-overview').exists()).toBe(true)
    expect(wrapper.find('#user-panel-overview').attributes('hidden')).toBeUndefined()
    expect(wrapper.find('#user-panel-sessions').attributes('hidden')).toBeDefined()

    const sessionsTab = wrapper
      .findAll('[role="tab"]')
      .find((tab) => tab.text().includes('Sessions'))!
    await sessionsTab.trigger('click')

    expect(sessionsTab.attributes('aria-selected')).toBe('true')
    expect(wrapper.find('#user-panel-sessions').attributes('hidden')).toBeUndefined()
    expect(wrapper.find('#user-panel-overview').attributes('hidden')).toBeDefined()
  })

  it('keeps Assign Roles in the Overview panel for role writers and limits choices to primary roles', async () => {
    seedPrincipal({
      'admin.users.write': true,
      'admin.roles.write': true,
    })
    const store = useUsersStore()
    const rolesStore = useRolesStore()
    store.status = 'success'
    store.users = [
      {
        ...user,
        roles: [{ slug: 'user', name: 'User', is_system: true }],
      },
    ]
    store.selectedSubjectId = 'sub_admin'
    rolesStore.roles = [
      {
        slug: 'admin',
        label: 'Administrator',
        is_system: true,
        permissions: [],
        user_count: 2,
      },
      {
        slug: 'user',
        label: 'User',
        is_system: true,
        permissions: [],
        user_count: 3,
      },
    ]

    const wrapper = mount(UsersPage)

    expect(wrapper.find('#user-panel-roles').exists()).toBe(false)
    expect(wrapper.findAll('[role="tab"]').some((tab) => tab.text().includes('Assign Roles'))).toBe(
      false,
    )
    expect(wrapper.find('#user-panel-overview').attributes('hidden')).toBeUndefined()
    expect(wrapper.text()).toContain('Assign Role')
    expect(wrapper.text()).toContain('Administrator')
    expect(wrapper.text()).toContain('User')
    expect(wrapper.findAll('input[type="radio"]').length).toBe(2)
    expect(wrapper.find('.save-roles-button').exists()).toBe(true)
  })

  it('hides the Lifecycle tab for principals without lock or write access', () => {
    seedPrincipal({})
    const store = useUsersStore()
    store.status = 'success'
    store.users = [user]
    store.selectedSubjectId = 'sub_admin'

    const wrapper = mount(UsersPage)

    const labels = wrapper.findAll('[role="tab"]').map((tab) => tab.text())
    expect(labels.some((label) => label.includes('Lifecycle'))).toBe(false)
    expect(labels.some((label) => label.includes('Overview'))).toBe(true)
    expect(labels.some((label) => label.includes('Sessions'))).toBe(true)
  })

  it('moves tab selection to the next tab on ArrowRight', async () => {
    const store = useUsersStore()
    store.status = 'success'
    store.users = [user]
    store.selectedSubjectId = 'sub_admin'

    const wrapper = mount(UsersPage)

    await wrapper.findAll('[role="tab"]')[0]!.trigger('keydown', { key: 'ArrowRight' })

    const tabs = wrapper.findAll('[role="tab"]')
    expect(tabs[0]!.attributes('aria-selected')).toBe('false')
    expect(tabs[1]!.attributes('aria-selected')).toBe('true')
  })

  it('calls ensureSession(true) to refresh the active session when admin assigns roles to themselves', async () => {
    seedPrincipal({
      'admin.users.write': true,
      'admin.roles.write': true,
    })
    const store = useUsersStore()
    const session = useSessionStore()
    const rolesStore = useRolesStore()
    const { toasts, clearToasts } = useToast()

    clearToasts()
    store.status = 'success'
    store.users = [
      {
        subject_id: 'admin-1',
        email: 'admin@example.test',
        display_name: 'Admin One',
        role: 'admin',
        roles: [{ slug: 'admin', name: 'Admin', is_system: true }],
        status: 'active',
        local_account_enabled: true,
      },
    ]
    store.selectedSubjectId = 'admin-1'

    rolesStore.roles = [
      {
        slug: 'admin',
        label: 'Admin',
        is_system: true,
        permissions: [],
        user_count: 1,
      },
      {
        slug: 'user',
        label: 'User',
        is_system: true,
        permissions: [],
        user_count: 2,
      },
    ]

    const assignSpy = vi.spyOn(store, 'assignRoles').mockImplementation(async () => {
      store.actionStatus = 'success'
    })
    const selectSpy = vi.spyOn(store, 'selectUser').mockResolvedValue()
    const ensureSpy = vi.spyOn(session, 'ensureSession').mockResolvedValue('authenticated')

    const wrapper = mount(UsersPage)

    // Verify self roles save triggers refresh
    const saveBtn = wrapper.find('.save-roles-button')
    expect(saveBtn.exists()).toBe(true)
    await saveBtn.trigger('click')

    expect(assignSpy).toHaveBeenCalledWith('admin-1', 'admin')
    expect(selectSpy).toHaveBeenCalledWith('admin-1')
    expect(ensureSpy).toHaveBeenCalledWith(true)

    // Check warning toast
    expect(toasts.value.some((t) => t.title.includes('updated your own roles'))).toBe(true)
  })

  it('displays a warning toast that changes take effect after relogin when assigning roles to another user', async () => {
    seedPrincipal({
      'admin.users.write': true,
      'admin.roles.write': true,
    })
    const store = useUsersStore()
    const session = useSessionStore()
    const rolesStore = useRolesStore()
    const { toasts, clearToasts } = useToast()

    clearToasts()
    store.status = 'success'
    store.users = [
      {
        subject_id: 'other-user-1',
        email: 'other@example.test',
        display_name: 'Other User',
        role: 'user',
        roles: [{ slug: 'user', name: 'User', is_system: true }],
        status: 'active',
        local_account_enabled: true,
      },
    ]
    store.selectedSubjectId = 'other-user-1'

    rolesStore.roles = [
      {
        slug: 'admin',
        label: 'Admin',
        is_system: true,
        permissions: [],
        user_count: 1,
      },
      {
        slug: 'user',
        label: 'User',
        is_system: true,
        permissions: [],
        user_count: 2,
      },
    ]

    const assignSpy = vi.spyOn(store, 'assignRoles').mockImplementation(async () => {
      store.actionStatus = 'success'
    })
    const selectSpy = vi.spyOn(store, 'selectUser').mockResolvedValue()
    const ensureSpy = vi.spyOn(session, 'ensureSession')

    const wrapper = mount(UsersPage)

    const saveBtn = wrapper.find('.save-roles-button')
    await saveBtn.trigger('click')

    expect(assignSpy).toHaveBeenCalledWith('other-user-1', 'user')
    expect(selectSpy).toHaveBeenCalledWith('other-user-1')
    expect(ensureSpy).not.toHaveBeenCalled()

    // Check warning toast for other user
    expect(
      toasts.value.some((t) => t.title.includes('will take effect after the user logs in again')),
    ).toBe(true)
  })

  it('restores pending intent on mount, selects user, pre-fills reason, and pushes info toast', async () => {
    const store = useUsersStore()
    const { toasts, clearToasts } = useToast()
    clearToasts()

    store.status = 'success'
    store.users = [user]
    store.selectedSubjectId = 'sub_admin'
    store.pendingIntent = {
      action: 'lock',
      subjectId: 'sub_admin',
      payload: { reason: 'Pending security lock reason' },
    }

    const restoreSpy = vi.spyOn(store, 'restorePendingIntent').mockImplementation(() => {})
    const selectSpy = vi.spyOn(store, 'selectUser').mockImplementation(async (id) => {
      store.selectedSubjectId = id
    })
    const clearSpy = vi.spyOn(store, 'clearPendingIntent')

    const wrapper = mount(UsersPage)

    await new Promise((resolve) => setTimeout(resolve, 0))
    await wrapper.vm.$nextTick()

    expect(restoreSpy).toHaveBeenCalled()
    expect(selectSpy).toHaveBeenCalledWith('sub_admin')
    const reasonInput = wrapper.find('input[name="lifecycle-reason"]')
    expect((reasonInput.element as HTMLInputElement).value).toBe('Pending security lock reason')
    expect(toasts.value.some((t) => t.title.includes('Sesi admin disegarkan'))).toBe(true)
    expect(clearSpy).toHaveBeenCalled()
  })

  it('disables lifecycle buttons contextually based on target user status and action loading state', async () => {
    const store = useUsersStore()
    store.status = 'success'
    store.selectedSubjectId = 'sub_admin'

    // Case 1: User is active
    store.users = [{ ...user, status: 'active' }]
    let wrapper = mount(UsersPage)

    expect(wrapper.find('button.lifecycle-lock-button').attributes('disabled')).toBeUndefined()
    expect(wrapper.find('button.lifecycle-unlock-button').attributes('disabled')).toBeDefined()
    expect(
      wrapper.find('button.lifecycle-deactivate-button').attributes('disabled'),
    ).toBeUndefined()
    expect(wrapper.find('button.lifecycle-reactivate-button').attributes('disabled')).toBeDefined()

    // Case 2: User is locked
    store.users = [{ ...user, status: 'locked' }]
    wrapper = mount(UsersPage)

    expect(wrapper.find('button.lifecycle-lock-button').attributes('disabled')).toBeDefined()
    expect(wrapper.find('button.lifecycle-unlock-button').attributes('disabled')).toBeUndefined()
    expect(
      wrapper.find('button.lifecycle-deactivate-button').attributes('disabled'),
    ).toBeUndefined()
    expect(wrapper.find('button.lifecycle-reactivate-button').attributes('disabled')).toBeDefined()

    // Case 3: User is deactivated
    store.users = [{ ...user, status: 'deactivated' }]
    wrapper = mount(UsersPage)

    expect(wrapper.find('button.lifecycle-lock-button').attributes('disabled')).toBeDefined()
    expect(wrapper.find('button.lifecycle-unlock-button').attributes('disabled')).toBeDefined()
    expect(wrapper.find('button.lifecycle-deactivate-button').attributes('disabled')).toBeDefined()
    expect(
      wrapper.find('button.lifecycle-reactivate-button').attributes('disabled'),
    ).toBeUndefined()

    // Case 4: Action is loading
    store.users = [{ ...user, status: 'active' }]
    store.actionStatus = 'loading'
    wrapper = mount(UsersPage)

    expect(wrapper.find('button.lifecycle-lock-button').attributes('disabled')).toBeDefined()
    expect(wrapper.find('button.lifecycle-unlock-button').attributes('disabled')).toBeDefined()
    expect(wrapper.find('button.lifecycle-deactivate-button').attributes('disabled')).toBeDefined()
    expect(wrapper.find('button.lifecycle-reactivate-button').attributes('disabled')).toBeDefined()

    // Case 5: User is active but effective_status is locked
    store.users = [{ ...user, status: 'active', effective_status: 'locked' }]
    store.actionStatus = 'idle'
    wrapper = mount(UsersPage)

    expect(wrapper.find('button.lifecycle-lock-button').attributes('disabled')).toBeDefined()
    expect(wrapper.find('button.lifecycle-unlock-button').attributes('disabled')).toBeUndefined()
    expect(
      wrapper.find('button.lifecycle-deactivate-button').attributes('disabled'),
    ).toBeUndefined()
    expect(wrapper.find('button.lifecycle-reactivate-button').attributes('disabled')).toBeDefined()

    // Case 6: User is active but effective_status is disabled
    store.users = [{ ...user, status: 'active', effective_status: 'disabled' }]
    wrapper = mount(UsersPage)

    expect(wrapper.find('button.lifecycle-lock-button').attributes('disabled')).toBeDefined()
    expect(wrapper.find('button.lifecycle-unlock-button').attributes('disabled')).toBeDefined()
    expect(wrapper.find('button.lifecycle-deactivate-button').attributes('disabled')).toBeDefined()
    expect(
      wrapper.find('button.lifecycle-reactivate-button').attributes('disabled'),
    ).toBeUndefined()
  })
})
