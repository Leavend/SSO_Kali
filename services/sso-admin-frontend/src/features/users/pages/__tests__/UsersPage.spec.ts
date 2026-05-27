import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import UsersPage from '../UsersPage.vue'
import { useUsersStore } from '../../stores/users.store'
import type { AdminUser } from '../../types'

vi.mock('../../services/users.api', () => ({
  usersApi: {
    list: vi.fn<() => Promise<unknown>>(),
    show: vi.fn<() => Promise<unknown>>(),
    lock: vi.fn<() => Promise<unknown>>(),
    unlock: vi.fn<() => Promise<unknown>>(),
    deactivate: vi.fn<() => Promise<unknown>>(),
    reactivate: vi.fn<() => Promise<unknown>>(),
    issuePasswordReset: vi.fn<() => Promise<unknown>>(),
    resetMfa: vi.fn<() => Promise<unknown>>(),
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

describe('UsersPage', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders user list, detail, assurance evidence, sessions, and request ID', () => {
    const store = useUsersStore()
    store.status = 'success'
    store.users = [user]
    store.selectedSubjectId = 'sub_admin'
    store.loginContext = { ip_address: '203.0.113.10', risk_score: 15, mfa_required: true }
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

  it('renders password reset token once and clears it', async () => {
    const store = useUsersStore()
    store.status = 'success'
    store.users = [user]
    store.selectedSubjectId = 'sub_admin'
    store.passwordResetToken = 'reset-token-once'

    const wrapper = mount(UsersPage)

    expect(wrapper.text()).toContain('reset-token-once')

    await wrapper.get('button[data-test="clear-password-reset-token"]').trigger('click')

    expect(store.passwordResetToken).toBeNull()
    expect(wrapper.text()).not.toContain('reset-token-once')
  })
})
