import { adminUsersApi } from '@/services/admin-users.api'
import type { AdminPasswordReset, AdminUser, AdminUserAction } from '@/types/admin.types'

export type PendingUserAction = {
  readonly action: AdminUserAction
  readonly user: AdminUser
}

export async function runAdminUserLifecycle(
  pending: PendingUserAction,
  reason: string,
  lockedUntil: string,
): Promise<AdminPasswordReset | null> {
  if (pending.action === 'deactivate')
    await adminUsersApi.deactivate(pending.user.subject_id, reason.trim())
  if (pending.action === 'reactivate') await adminUsersApi.reactivate(pending.user.subject_id)
  if (pending.action === 'lock') {
    await adminUsersApi.lock(pending.user.subject_id, {
      reason: reason.trim(),
      locked_until: lockedUntil || null,
    })
  }
  if (pending.action === 'unlock')
    await adminUsersApi.unlock(pending.user.subject_id, reason.trim())
  if (pending.action === 'password-reset')
    return adminUsersApi.issuePasswordReset(pending.user.subject_id)
  return null
}
