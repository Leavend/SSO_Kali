import { adminBffRequest } from './admin-bff-client'
import type {
  AdminPasswordReset,
  AdminUser,
  AdminUserDraft,
  AdminUserProfilePatch,
} from '@/types/admin.types'

export type LockUserPayload = {
  readonly reason: string
  readonly locked_until?: string | null
}

export const adminUsersApi = {
  async list(): Promise<readonly AdminUser[]> {
    const data = await adminBffRequest<{ readonly users: readonly AdminUser[] }>('/api/admin/users')
    return data.users
  },

  async create(draft: AdminUserDraft): Promise<AdminUser> {
    const data = await adminBffRequest<{ readonly user: AdminUser }>('/api/admin/users', {
      method: 'POST',
      body: draft,
    })
    return data.user
  },

  async syncProfile(subjectId: string, patch: AdminUserProfilePatch): Promise<AdminUser> {
    const data = await adminBffRequest<{ readonly user: AdminUser }>(
      userPath(subjectId, 'sync-profile'),
      {
        method: 'POST',
        body: patch,
      },
    )
    return data.user
  },

  async deactivate(subjectId: string, reason: string): Promise<AdminUser> {
    const data = await adminBffRequest<{ readonly user: AdminUser }>(
      userPath(subjectId, 'deactivate'),
      {
        method: 'POST',
        body: { reason },
      },
    )
    return data.user
  },

  async reactivate(subjectId: string): Promise<AdminUser> {
    const data = await adminBffRequest<{ readonly user: AdminUser }>(
      userPath(subjectId, 'reactivate'),
      {
        method: 'POST',
      },
    )
    return data.user
  },

  async lock(subjectId: string, payload: LockUserPayload): Promise<AdminUser> {
    const data = await adminBffRequest<{ readonly user: AdminUser }>(userPath(subjectId, 'lock'), {
      method: 'POST',
      body: payload,
    })
    return data.user
  },

  async unlock(subjectId: string, reason: string): Promise<AdminUser> {
    const data = await adminBffRequest<{ readonly user: AdminUser }>(
      userPath(subjectId, 'unlock'),
      {
        method: 'POST',
        body: { reason },
      },
    )
    return data.user
  },

  async issuePasswordReset(subjectId: string): Promise<AdminPasswordReset> {
    const data = await adminBffRequest<{ readonly password_reset: AdminPasswordReset }>(
      userPath(subjectId, 'password-reset'),
      { method: 'POST' },
    )
    return data.password_reset
  },
}

function userPath(subjectId: string, action: string): string {
  return `/api/admin/users/${encodeURIComponent(subjectId)}/${action}`
}
