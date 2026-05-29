import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ApiError, getLastRequestId } from '@/lib/api/api-client'
import { usersApi } from '../../services/users.api'
import { useUsersStore } from '../users.store'
import type {
  AdminUser,
  CreateUserResponse,
  UserDetailResponse,
  UserMutationResponse,
} from '../../types'

vi.mock('../../services/users.api', () => ({
  usersApi: {
    create: vi.fn<(payload: unknown) => Promise<CreateUserResponse>>(),
    list: vi.fn<() => Promise<{ users: readonly AdminUser[] }>>(),
    show: vi.fn<(subjectId: string) => Promise<UserDetailResponse>>(),
    lock: vi.fn<(subjectId: string, payload: unknown) => Promise<UserMutationResponse>>(),
    unlock: vi.fn<(subjectId: string, payload: unknown) => Promise<UserMutationResponse>>(),
    deactivate: vi.fn<(subjectId: string, payload: unknown) => Promise<UserMutationResponse>>(),
    reactivate: vi.fn<(subjectId: string) => Promise<UserMutationResponse>>(),
    issuePasswordReset: vi.fn<(subjectId: string) => Promise<UserMutationResponse>>(),
    resetMfa: vi.fn<(subjectId: string, payload: unknown) => Promise<UserMutationResponse>>(),
    syncProfile: vi.fn<(subjectId: string, payload: unknown) => Promise<UserMutationResponse>>(),
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
    vi.mocked(usersApi.create).mockReset()
    vi.mocked(usersApi.list).mockReset()
    vi.mocked(usersApi.show).mockReset()
    vi.mocked(usersApi.lock).mockReset()
    vi.mocked(usersApi.unlock).mockReset()
    vi.mocked(usersApi.deactivate).mockReset()
    vi.mocked(usersApi.reactivate).mockReset()
    vi.mocked(usersApi.issuePasswordReset).mockReset()
    vi.mocked(usersApi.resetMfa).mockReset()
    vi.mocked(usersApi.syncProfile).mockReset()
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

  describe('createUser', () => {
    const createPayload = {
      email: 'new@example.test',
      display_name: 'New User',
      role: 'user' as const,
      local_account_enabled: true,
    }

    it('posts create payload, appends user, sets selectedSubjectId', async () => {
      const newUser: AdminUser = {
        subject_id: 'sub_new',
        email: 'new@example.test',
        display_name: 'New User',
        role: 'user',
        status: 'active',
        local_account_enabled: true,
      }
      vi.mocked(usersApi.create).mockResolvedValue({ user: newUser })
      const store = useUsersStore()
      store.users = [user]

      await store.createUser(createPayload)

      expect(usersApi.create).toHaveBeenCalledWith(createPayload)
      expect(store.users).toHaveLength(2)
      expect(store.users[1]?.subject_id).toBe('sub_new')
      expect(store.selectedSubjectId).toBe('sub_new')
      expect(store.actionStatus).toBe('success')
      expect(store.auditEventId).toBeNull()
    })

    it('maps validation error 422 to safe action copy', async () => {
      vi.mocked(usersApi.create).mockRejectedValue(
        new ApiError(422, 'raw validation: email not unique', 'validation_error'),
      )
      const store = useUsersStore()

      await store.createUser(createPayload)

      expect(store.actionStatus).toBe('error')
      expect(store.errorMessage).not.toContain('raw validation')
    })

    it('maps step-up 428 to step_up_required state', async () => {
      vi.mocked(usersApi.create).mockRejectedValue(
        new ApiError(428, 'fresh auth required', 'fresh_auth_required'),
      )
      const store = useUsersStore()

      await store.createUser(createPayload)

      expect(store.actionStatus).toBe('step_up_required')
      expect(store.errorMessage).toBe(
        'Aksi ini membutuhkan fresh-auth atau MFA assurance. Ulangi login admin lalu coba lagi.',
      )
    })

    it('maps forbidden 403 to safe copy', async () => {
      vi.mocked(usersApi.create).mockRejectedValue(
        new ApiError(403, 'raw permission missing', 'permission_required'),
      )
      const store = useUsersStore()

      await store.createUser(createPayload)

      expect(store.actionStatus).toBe('error')
      expect(store.errorMessage).not.toContain('raw permission')
    })
  })

  describe('syncProfileSelected', () => {
    const syncPayload = {
      email: 'synced@example.test',
      display_name: 'Synced User',
    }

    it('posts sync payload and upserts updated user', async () => {
      const syncedUser: AdminUser = {
        ...user,
        email: 'synced@example.test',
        display_name: 'Synced User',
      }
      vi.mocked(usersApi.syncProfile).mockResolvedValue({
        user: syncedUser,
        audit_event_id: 'AUD-SYNC-1',
      })
      const store = useUsersStore()
      store.users = [user]
      store.selectedSubjectId = 'sub_admin'

      await store.syncProfileSelected(syncPayload)

      expect(usersApi.syncProfile).toHaveBeenCalledWith('sub_admin', syncPayload)
      expect(store.selectedUser?.email).toBe('synced@example.test')
      expect(store.selectedUser?.display_name).toBe('Synced User')
      expect(store.auditEventId).toBe('AUD-SYNC-1')
      expect(store.actionStatus).toBe('success')
    })

    it('maps step-up 428 to step_up_required state', async () => {
      vi.mocked(usersApi.syncProfile).mockRejectedValue(
        new ApiError(428, 'fresh auth required', 'fresh_auth_required', null, 'req-step-up'),
      )
      const store = useUsersStore()
      store.selectedSubjectId = 'sub_admin'

      await store.syncProfileSelected(syncPayload)

      expect(store.actionStatus).toBe('step_up_required')
      expect(store.requestId).toBe('req-step-up')
      expect(store.errorMessage).toBe(
        'Aksi ini membutuhkan fresh-auth atau MFA assurance. Ulangi login admin lalu coba lagi.',
      )
    })
  })
})
