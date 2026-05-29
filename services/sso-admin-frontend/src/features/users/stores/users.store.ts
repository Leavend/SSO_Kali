import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { ApiError, getLastRequestId } from '@/lib/api/api-client'
import { usersApi } from '../services/users.api'
import type { AdminUser, AdminUserLoginContext, AdminUserSession, CreateUserPayload } from '../types'

export type UsersStatus = 'idle' | 'loading' | 'success' | 'unauthenticated' | 'forbidden' | 'error'
export type UserActionStatus = 'idle' | 'loading' | 'success' | 'step_up_required' | 'error'

export const useUsersStore = defineStore('admin-users', () => {
  const status = ref<UsersStatus>('idle')
  const actionStatus = ref<UserActionStatus>('idle')
  const users = ref<readonly AdminUser[]>([])
  const selectedSubjectId = ref<string | null>(null)
  const loginContext = ref<AdminUserLoginContext | null>(null)
  const sessions = ref<readonly AdminUserSession[]>([])
  const errorMessage = ref<string | null>(null)
  const requestId = ref<string | null>(null)
  const auditEventId = ref<string | null>(null)
  const passwordResetToken = ref<string | null>(null)
  const passwordResetExpiresAt = ref<string | null>(null)

  const selectedUser = computed<AdminUser | null>(
    () => users.value.find((user) => user.subject_id === selectedSubjectId.value) ?? null,
  )

  async function load(): Promise<void> {
    status.value = 'loading'
    errorMessage.value = null
    clearPasswordResetToken()

    try {
      const response = await usersApi.list()
      users.value = response.users
      selectedSubjectId.value = response.users[0]?.subject_id ?? null
      requestId.value = getLastRequestId()
      status.value = 'success'
    } catch (error) {
      users.value = []
      selectedSubjectId.value = null
      handleListError(error)
    }
  }

  async function selectUser(subjectId: string): Promise<void> {
    selectedSubjectId.value = subjectId
    errorMessage.value = null
    clearPasswordResetToken()

    try {
      const response = await usersApi.show(subjectId)
      upsertUser(response.user)
      loginContext.value = response.login_context ?? null
      sessions.value = response.sessions ?? []
      requestId.value = getLastRequestId()
    } catch (error) {
      handleActionError(error)
    }
  }

  async function createUser(payload: CreateUserPayload): Promise<void> {
    actionStatus.value = 'loading'
    errorMessage.value = null

    try {
      const response = await usersApi.create(payload)
      users.value = [...users.value, response.user]
      selectedSubjectId.value = response.user.subject_id
      auditEventId.value = null
      requestId.value = getLastRequestId()
      actionStatus.value = 'success'
    } catch (error) {
      handleActionError(error)
    }
  }

  async function lockSelected(reason: string): Promise<void> {
    await mutateSelected((subjectId) => usersApi.lock(subjectId, { reason }))
  }

  async function unlockSelected(reason: string): Promise<void> {
    await mutateSelected((subjectId) => usersApi.unlock(subjectId, { reason }))
  }

  async function deactivateSelected(reason: string): Promise<void> {
    await mutateSelected((subjectId) => usersApi.deactivate(subjectId, { reason }))
  }

  async function reactivateSelected(): Promise<void> {
    await mutateSelected((subjectId) => usersApi.reactivate(subjectId))
  }

  async function resetMfaSelected(reason: string): Promise<void> {
    await mutateSelected((subjectId) => usersApi.resetMfa(subjectId, { reason }))
  }

  async function issuePasswordResetSelected(): Promise<void> {
    if (!selectedSubjectId.value) return
    actionStatus.value = 'loading'
    errorMessage.value = null
    clearPasswordResetToken()

    try {
      const response = await usersApi.issuePasswordReset(selectedSubjectId.value)
      if (response.user) upsertUser(response.user)
      passwordResetToken.value = null
      passwordResetExpiresAt.value = response.password_reset?.expires_at ?? null
      auditEventId.value = response.audit_event_id ?? null
      requestId.value = getLastRequestId()
      actionStatus.value = 'success'
    } catch (error) {
      handleActionError(error)
    }
  }

  function clearPasswordResetToken(): void {
    passwordResetToken.value = null
    passwordResetExpiresAt.value = null
  }

  async function mutateSelected(
    callback: (subjectId: string) => Promise<{
      readonly user?: AdminUser
      readonly audit_event_id?: string | null
    }>,
  ): Promise<void> {
    if (!selectedSubjectId.value) return
    actionStatus.value = 'loading'
    errorMessage.value = null
    clearPasswordResetToken()

    try {
      const response = await callback(selectedSubjectId.value)
      if (response.user) upsertUser(response.user)
      auditEventId.value = response.audit_event_id ?? null
      requestId.value = getLastRequestId()
      actionStatus.value = 'success'
    } catch (error) {
      handleActionError(error)
    }
  }

  function upsertUser(nextUser: AdminUser): void {
    const index = users.value.findIndex((user) => user.subject_id === nextUser.subject_id)
    users.value =
      index === -1
        ? [...users.value, nextUser]
        : users.value.map((user) => (user.subject_id === nextUser.subject_id ? nextUser : user))
  }

  function handleListError(error: unknown): void {
    if (error instanceof ApiError) {
      requestId.value = error.requestId ?? getLastRequestId()

      if (error.status === 401) {
        status.value = 'unauthenticated'
        errorMessage.value = 'Sesi admin berakhir. Login ulang untuk melanjutkan.'
        return
      }

      if (error.status === 403) {
        status.value = 'forbidden'
        errorMessage.value = 'Kamu tidak memiliki izin untuk melihat users admin.'
        return
      }
    } else {
      requestId.value = getLastRequestId()
    }

    status.value = 'error'
    errorMessage.value = requestId.value
      ? `Users admin belum bisa dimuat. Coba lagi atau gunakan request ID ${requestId.value} untuk investigasi.`
      : 'Users admin belum bisa dimuat. Coba lagi beberapa saat lagi.'
  }

  function handleActionError(error: unknown): void {
    requestId.value =
      error instanceof ApiError ? (error.requestId ?? getLastRequestId()) : getLastRequestId()

    if (error instanceof ApiError && (error.status === 428 || error.status === 412)) {
      actionStatus.value = 'step_up_required'
      errorMessage.value =
        'Aksi ini membutuhkan fresh-auth atau MFA assurance. Ulangi login admin lalu coba lagi.'
      return
    }

    actionStatus.value = 'error'
    errorMessage.value = requestId.value
      ? `Operasi user gagal. Gunakan request ID ${requestId.value} untuk investigasi.`
      : 'Operasi user gagal. Coba lagi beberapa saat lagi.'
  }

  return {
    status,
    actionStatus,
    users,
    selectedSubjectId,
    selectedUser,
    loginContext,
    sessions,
    errorMessage,
    requestId,
    auditEventId,
    passwordResetToken,
    passwordResetExpiresAt,
    load,
    selectUser,
    createUser,
    lockSelected,
    unlockSelected,
    deactivateSelected,
    reactivateSelected,
    resetMfaSelected,
    issuePasswordResetSelected,
    clearPasswordResetToken,
  }
})
