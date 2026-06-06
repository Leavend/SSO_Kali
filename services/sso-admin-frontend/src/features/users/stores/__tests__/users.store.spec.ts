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
    syncUserRoles:
      vi.fn<(subjectId: string, roleSlugs: readonly string[]) => Promise<UserMutationResponse>>(),
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
  let activeUserDetail: AdminUser

  beforeEach(() => {
    setActivePinia(createPinia())
    activeUserDetail = { ...user }
    vi.mocked(usersApi.create).mockReset()
    vi.mocked(usersApi.list).mockReset()
    vi.mocked(usersApi.show).mockReset()
    vi.mocked(usersApi.show).mockImplementation(async (subjectId) => {
      const store = useUsersStore()
      const existing = store.users.find((u) => u.subject_id === subjectId)
      return {
        user: existing || activeUserDetail,
        login_context: null,
        sessions: [],
      }
    })
    vi.mocked(usersApi.lock).mockReset()
    vi.mocked(usersApi.lock).mockImplementation(async (_subjectId, _payload) => {
      activeUserDetail = { ...activeUserDetail, status: 'locked' }
      return { user: activeUserDetail, audit_event_id: 'AUD01' }
    })
    vi.mocked(usersApi.unlock).mockReset()
    vi.mocked(usersApi.deactivate).mockReset()
    vi.mocked(usersApi.reactivate).mockReset()
    vi.mocked(usersApi.issuePasswordReset).mockReset()
    vi.mocked(usersApi.resetMfa).mockReset()
    vi.mocked(usersApi.syncProfile).mockReset()
    vi.mocked(usersApi.syncProfile).mockImplementation(async (_subjectId, payload: any) => {
      activeUserDetail = {
        ...activeUserDetail,
        ...(payload.email && { email: payload.email }),
        ...(payload.display_name && { display_name: payload.display_name }),
      }
      return { user: activeUserDetail, audit_event_id: 'AUD-SYNC-1' }
    })
    vi.mocked(usersApi.syncUserRoles).mockReset()
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

  describe('assignRoles', () => {
    const roleSlugs = ['admin', 'auditor']

    it('posts sync role payload and updates user', async () => {
      const updatedUser: AdminUser = {
        ...user,
        roles: [
          { slug: 'admin', name: 'Admin', is_system: true },
          { slug: 'auditor', name: 'Auditor', is_system: false },
        ],
      }
      vi.mocked(usersApi.syncUserRoles).mockResolvedValue({
        user: updatedUser,
        audit_event_id: 'AUD-ROLES-1',
      })
      const store = useUsersStore()
      store.users = [user]
      store.selectedSubjectId = 'sub_admin'

      await store.assignRoles('sub_admin', roleSlugs)

      expect(usersApi.syncUserRoles).toHaveBeenCalledWith('sub_admin', roleSlugs)
      expect(store.selectedUser?.roles).toHaveLength(2)
      expect(store.auditEventId).toBe('AUD-ROLES-1')
      expect(store.actionStatus).toBe('success')
    })

    it('maps 403 to forbidden state', async () => {
      vi.mocked(usersApi.syncUserRoles).mockRejectedValue(
        new ApiError(403, 'permission missing', 'permission_required'),
      )
      const store = useUsersStore()

      await store.assignRoles('sub_admin', roleSlugs)

      expect(store.status).toBe('forbidden')
      expect(store.actionStatus).toBe('error')
    })

    it('maps 401 to unauthenticated state', async () => {
      vi.mocked(usersApi.syncUserRoles).mockRejectedValue(
        new ApiError(401, 'unauthenticated', 'unauthenticated'),
      )
      const store = useUsersStore()

      await store.assignRoles('sub_admin', roleSlugs)

      expect(store.status).toBe('unauthenticated')
      expect(store.actionStatus).toBe('error')
    })
  })

  describe('ISS-L1 & ISS-L3: Mutative re-fetch & error handling', () => {
    it('re-fetches state after lock and updates status badge re-actively', async () => {
      vi.mocked(usersApi.lock).mockResolvedValue({
        user: { ...user, status: 'locked' },
        audit_event_id: 'AUD01',
      })
      vi.mocked(usersApi.show).mockResolvedValue({
        user: { ...user, status: 'locked' },
        login_context: {
          ip_address: '127.0.0.1',
          risk_score: 0,
          mfa_required: false,
        },
        sessions: [],
      })
      const store = useUsersStore()
      store.users = [user]
      store.selectedSubjectId = 'sub_admin'

      await store.lockSelected('Security')

      expect(usersApi.lock).toHaveBeenCalled()
      expect(usersApi.show).toHaveBeenCalledWith('sub_admin')
      expect(store.selectedUser?.status).toBe('locked')
      expect(store.actionStatus).toBe('success')
    })

    it('sets warning message if re-fetch fails after successful mutation', async () => {
      vi.mocked(usersApi.lock).mockResolvedValue({
        user: { ...user, status: 'locked' },
        audit_event_id: 'AUD01',
      })
      vi.mocked(usersApi.show).mockRejectedValue(new Error('Network error'))
      const store = useUsersStore()
      store.users = [user]
      store.selectedSubjectId = 'sub_admin'

      await store.lockSelected('Security')

      expect(usersApi.lock).toHaveBeenCalled()
      expect(store.actionStatus).toBe('success')
      expect(store.errorMessage).toBe('Aksi tersimpan, namun gagal memuat status terbaru—muat ulang.')
    })
  })
})
