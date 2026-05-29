import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ApiError, getLastRequestId } from '@/lib/api/api-client'
import { usersApi } from '../../services/users.api'
import { useUsersStore } from '../users.store'
import type { AdminUser, UserDetailResponse, UserMutationResponse } from '../../types'

vi.mock('../../services/users.api', () => ({
  usersApi: {
    list: vi.fn<() => Promise<{ users: readonly AdminUser[] }>>(),
    show: vi.fn<(subjectId: string) => Promise<UserDetailResponse>>(),
    lock: vi.fn<(subjectId: string, payload: unknown) => Promise<UserMutationResponse>>(),
    unlock: vi.fn<(subjectId: string, payload: unknown) => Promise<UserMutationResponse>>(),
    deactivate: vi.fn<(subjectId: string, payload: unknown) => Promise<UserMutationResponse>>(),
    reactivate: vi.fn<(subjectId: string) => Promise<UserMutationResponse>>(),
    issuePasswordReset: vi.fn<(subjectId: string) => Promise<UserMutationResponse>>(),
    resetMfa: vi.fn<(subjectId: string, payload: unknown) => Promise<UserMutationResponse>>(),
  },
}))

vi.mock('@/lib/api/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/api-client')>()
  return {
    ...actual,
    getLastRequestId: vi.fn<() => string | null>(() => 'req-users-1'),
  }
})

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

describe('useUsersStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(usersApi.list).mockReset()
    vi.mocked(usersApi.show).mockReset()
    vi.mocked(usersApi.lock).mockReset()
    vi.mocked(usersApi.unlock).mockReset()
    vi.mocked(usersApi.deactivate).mockReset()
    vi.mocked(usersApi.reactivate).mockReset()
    vi.mocked(usersApi.issuePasswordReset).mockReset()
    vi.mocked(usersApi.resetMfa).mockReset()
    vi.mocked(getLastRequestId).mockReturnValue('req-users-1')
  })

  it('loads users and request evidence', async () => {
    vi.mocked(usersApi.list).mockResolvedValue({ users: [user] })
    const store = useUsersStore()

    await store.load()

    expect(store.status).toBe('success')
    expect(store.users).toEqual([user])
    expect(store.selectedSubjectId).toBe('sub_admin')
    expect(store.requestId).toBe('req-users-1')
  })

  it('loads selected user detail with login/session evidence', async () => {
    vi.mocked(usersApi.show).mockResolvedValue({
      user,
      login_context: {
        ip_address: '203.0.113.10',
        risk_score: 15,
        mfa_required: true,
      },
      sessions: [{ session_id: 'sess_1', client_id: 'portal' }],
    })
    const store = useUsersStore()

    await store.selectUser('sub_admin')

    expect(store.selectedUser).toEqual(user)
    expect(store.loginContext?.mfa_required).toBe(true)
    expect(store.sessions).toHaveLength(1)
  })

  it('applies lifecycle actions and stores audit evidence', async () => {
    vi.mocked(usersApi.lock).mockResolvedValue({
      user: { ...user, status: 'locked' },
      audit_event_id: 'AUD01',
    })
    const store = useUsersStore()
    store.users = [user]
    store.selectedSubjectId = 'sub_admin'

    await store.lockSelected('Security review')

    expect(usersApi.lock).toHaveBeenCalledWith('sub_admin', {
      reason: 'Security review',
    })
    expect(store.selectedUser?.status).toBe('locked')
    expect(store.auditEventId).toBe('AUD01')
  })

  it('drops password reset token and keeps only safe audit evidence', async () => {
    vi.mocked(usersApi.issuePasswordReset).mockResolvedValue({
      password_reset: {
        token: 'reset-token-once',
        expires_at: '2026-05-27T02:00:00Z',
      },
      audit_event_id: 'AUD-RESET-1',
    })
    const store = useUsersStore()
    store.selectedSubjectId = 'sub_admin'

    await store.issuePasswordResetSelected()

    expect(store.passwordResetToken).toBeNull()
    expect(store.passwordResetExpiresAt).toBe('2026-05-27T02:00:00Z')
    expect(store.auditEventId).toBe('AUD-RESET-1')
  })

  it('maps forbidden errors to safe copy', async () => {
    vi.mocked(usersApi.list).mockRejectedValue(new ApiError(403, 'SQLSTATE forbidden leak'))
    const store = useUsersStore()

    await store.load()

    expect(store.status).toBe('forbidden')
    expect(store.errorMessage).toBe('Kamu tidak memiliki izin untuk melihat users admin.')
    expect(store.errorMessage).not.toContain('SQLSTATE')
  })

  it('maps step-up errors to safe action copy with request evidence', async () => {
    vi.mocked(usersApi.lock).mockRejectedValue(
      new ApiError(428, 'raw ACR failure trace', 'fresh_auth_required', null, 'req-step-up'),
    )
    const store = useUsersStore()
    store.selectedSubjectId = 'sub_admin'

    await store.lockSelected('Security review')

    expect(store.actionStatus).toBe('step_up_required')
    expect(store.requestId).toBe('req-step-up')
    expect(store.errorMessage).toBe(
      'Aksi ini membutuhkan fresh-auth atau MFA assurance. Ulangi login admin lalu coba lagi.',
    )
    expect(store.errorMessage).not.toContain('raw ACR')
  })
})
