import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { ApiError, getLastRequestId } from '@/lib/api/api-client'
import {
  formatSupportReference,
  isAdminProxyTransportFailure,
  formatTransportErrorMessage,
} from '@/lib/display-identifiers'
import { triggerStepUpReauth } from '@/lib/stepup/stepup'
import { usersApi } from '../services/users.api'
import type {
  AdminUser,
  AdminUserLoginContext,
  AdminUserSession,
  CreateUserPayload,
  SyncProfilePayload,
  UserDetailResponse,
} from '../types'

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
  const deliveryStatus = ref<'none' | 'queued' | 'failed' | null>(null)

  const selectedUser = computed<AdminUser | null>(
    () => users.value.find((user) => user.subject_id === selectedSubjectId.value) ?? null,
  )

  const pendingIntent = ref<{
    readonly action: string
    readonly subjectId: string
    readonly payload?: any
  } | null>(null)

  function savePendingIntent(action: string, subjectId: string, payload?: any): void {
    const intent = { action, subjectId, payload }
    pendingIntent.value = intent
    sessionStorage.setItem('pending_admin_action', JSON.stringify(intent))
  }

  function clearPendingIntent(): void {
    pendingIntent.value = null
    sessionStorage.removeItem('pending_admin_action')
  }

  function restorePendingIntent(): void {
    const raw = sessionStorage.getItem('pending_admin_action')
    if (raw) {
      try {
        pendingIntent.value = JSON.parse(raw)
      } catch {
        pendingIntent.value = null
      }
    }
  }

  // Fetch a user's detail and apply its evidence (login context + active
  // sessions) to the store. Shared by load (initial hydration), explicit
  // selection, and the background poll so all three populate the detail tabs
  // identically.
  async function fetchSelectedDetail(subjectId: string): Promise<void> {
    const response = await usersApi.show(subjectId)
    upsertUser(response.user)
    loginContext.value = loginContextEvidence(response)
    sessions.value = response.sessions ?? []
    requestId.value = getLastRequestId()
  }

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

      // Hydrate the auto-selected user's detail so the Security & MFA and
      // Sessions tabs render immediately instead of staying empty until the
      // next 45s auto-refresh tick. Best-effort: the list already rendered, and
      // the poll / explicit selection retries on failure.
      const firstSubjectId = selectedSubjectId.value
      if (firstSubjectId !== null) {
        try {
          await fetchSelectedDetail(firstSubjectId)
        } catch {
          /* detail hydration is best-effort and must not break the list view */
        }
      }
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
      await fetchSelectedDetail(subjectId)
    } catch (error) {
      handleActionError(error)
    }
  }

  async function refreshList(): Promise<void> {
    if (actionStatus.value === 'loading' || pendingIntent.value) return

    try {
      const response = await usersApi.list()
      users.value = mergeUsers(users.value, response.users)
      requestId.value = getLastRequestId()
      if (status.value !== 'unauthenticated' && status.value !== 'forbidden') {
        status.value = 'success'
      }
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        handleListError(error)
      }
    }
  }

  async function refreshSelected(): Promise<void> {
    const subjectId = selectedSubjectId.value
    if (!subjectId || actionStatus.value === 'loading' || pendingIntent.value) return

    try {
      await fetchSelectedDetail(subjectId)
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        handleListError(error)
      }
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
      deliveryStatus.value = response.delivery_status ?? null
      actionStatus.value = 'success'
    } catch (error) {
      handleActionError(error)
    }
  }

  async function lockSelected(reason: string): Promise<void> {
    if (!selectedSubjectId.value) return
    savePendingIntent('lock', selectedSubjectId.value, { reason })
    await mutateSelected((subjectId) => usersApi.lock(subjectId, { reason }))
    clearPendingIntent()
  }

  async function unlockSelected(reason: string): Promise<void> {
    if (!selectedSubjectId.value) return
    savePendingIntent('unlock', selectedSubjectId.value, { reason })
    await mutateSelected((subjectId) => usersApi.unlock(subjectId, { reason }))
    clearPendingIntent()
  }

  async function deactivateSelected(reason: string): Promise<void> {
    if (!selectedSubjectId.value) return
    savePendingIntent('deactivate', selectedSubjectId.value, { reason })
    await mutateSelected((subjectId) => usersApi.deactivate(subjectId, { reason }))
    clearPendingIntent()
  }

  async function reactivateSelected(): Promise<void> {
    if (!selectedSubjectId.value) return
    savePendingIntent('reactivate', selectedSubjectId.value)
    await mutateSelected((subjectId) => usersApi.reactivate(subjectId))
    clearPendingIntent()
  }

  async function resetMfaSelected(reason: string): Promise<void> {
    if (!selectedSubjectId.value) return
    savePendingIntent('reset_mfa', selectedSubjectId.value, { reason })
    await mutateSelected((subjectId) => usersApi.resetMfa(subjectId, { reason }))
    clearPendingIntent()
  }

  async function issuePasswordResetSelected(): Promise<void> {
    if (!selectedSubjectId.value) return
    savePendingIntent('issue_password_reset', selectedSubjectId.value)
    actionStatus.value = 'loading'
    errorMessage.value = null
    clearPasswordResetToken()

    try {
      const response = await usersApi.issuePasswordReset(selectedSubjectId.value)
      if (response.user) upsertUser(response.user)
      passwordResetToken.value = null
      passwordResetExpiresAt.value = response.password_reset?.expires_at ?? null
      auditEventId.value = response.audit_event_id ?? null
      deliveryStatus.value = response.delivery_status ?? null
      requestId.value = getLastRequestId()

      const subjectId = selectedSubjectId.value
      try {
        const showResponse = await usersApi.show(subjectId)
        upsertUser(showResponse.user)
        loginContext.value = loginContextEvidence(showResponse)
        sessions.value = showResponse.sessions ?? []
        requestId.value = getLastRequestId()
        actionStatus.value = 'success'
        clearPendingIntent()
      } catch {
        actionStatus.value = 'success'
        errorMessage.value = 'Aksi tersimpan, namun gagal memuat status terbaru—muat ulang.'
        clearPendingIntent()
      }
    } catch (error) {
      handleActionError(error)
    }
  }

  async function syncProfileSelected(payload: SyncProfilePayload): Promise<void> {
    if (!selectedSubjectId.value) return
    savePendingIntent('sync_profile', selectedSubjectId.value, payload)
    actionStatus.value = 'loading'
    errorMessage.value = null

    try {
      const response = await usersApi.syncProfile(selectedSubjectId.value, payload)
      if (response.user) upsertUser(response.user)
      auditEventId.value = response.audit_event_id ?? null
      requestId.value = getLastRequestId()

      const subjectId = selectedSubjectId.value
      try {
        const showResponse = await usersApi.show(subjectId)
        upsertUser(showResponse.user)
        loginContext.value = loginContextEvidence(showResponse)
        sessions.value = showResponse.sessions ?? []
        requestId.value = getLastRequestId()
        actionStatus.value = 'success'
        clearPendingIntent()
      } catch {
        actionStatus.value = 'success'
        errorMessage.value = 'Aksi tersimpan, namun gagal memuat status terbaru—muat ulang.'
        clearPendingIntent()
      }
    } catch (error) {
      handleActionError(error)
    }
  }

  async function assignRoles(subjectId: string, roleSlugs: readonly string[]): Promise<void> {
    savePendingIntent('assign_roles', subjectId, { roleSlugs })
    actionStatus.value = 'loading'
    errorMessage.value = null
    clearPasswordResetToken()

    try {
      const response = await usersApi.syncUserRoles(subjectId, roleSlugs)
      if (response.user) upsertUser(response.user)
      auditEventId.value = response.audit_event_id ?? null
      requestId.value = getLastRequestId()
      actionStatus.value = 'success'
      clearPendingIntent()
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 403) {
          status.value = 'forbidden'
          actionStatus.value = 'error'
          errorMessage.value = 'Kamu tidak memiliki izin untuk mengubah role user.'
          return
        }
        if (error.status === 401) {
          status.value = 'unauthenticated'
          actionStatus.value = 'error'
          errorMessage.value = 'Sesi admin berakhir. Login ulang untuk melanjutkan.'
          return
        }
      }
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

      const subjectId = selectedSubjectId.value
      try {
        const showResponse = await usersApi.show(subjectId)
        upsertUser(showResponse.user)
        loginContext.value = loginContextEvidence(showResponse)
        sessions.value = showResponse.sessions ?? []
        requestId.value = getLastRequestId()
        actionStatus.value = 'success'
      } catch {
        actionStatus.value = 'success'
        errorMessage.value = 'Aksi tersimpan, namun gagal memuat status terbaru—muat ulang.'
      }
    } catch (error) {
      handleActionError(error)
    }
  }

  function upsertUser(nextUser: AdminUser): void {
    const index = users.value.findIndex((user) => user.subject_id === nextUser.subject_id)
    users.value =
      index === -1
        ? [...users.value, nextUser]
        : users.value.map((user) =>
            user.subject_id === nextUser.subject_id ? mergeUserRecord(user, nextUser) : user,
          )
  }

  function loginContextEvidence(response: UserDetailResponse): AdminUserLoginContext | null {
    const context = response.login_context ?? null
    const session = response.sessions?.find((item) => item.ip_address)

    if (context !== null) {
      return {
        ...context,
        ip_address: context.ip_address ?? session?.ip_address ?? null,
        last_seen_at:
          context.last_seen_at ?? session?.last_activity_at ?? session?.created_at ?? null,
      }
    }

    return session?.ip_address
      ? {
          ip_address: session.ip_address,
          mfa_required: false,
          last_seen_at: session.last_activity_at ?? session.created_at ?? null,
        }
      : null
  }

  function mergeUsers(
    currentUsers: readonly AdminUser[],
    incomingUsers: readonly AdminUser[],
  ): readonly AdminUser[] {
    const incomingBySubject = new Map(incomingUsers.map((user) => [user.subject_id, user]))
    const merged = currentUsers
      .filter((user) => incomingBySubject.has(user.subject_id))
      .map((user) => mergeUserRecord(user, incomingBySubject.get(user.subject_id)))

    const existingIds = new Set(merged.map((user) => user.subject_id))
    for (const incoming of incomingUsers) {
      if (!existingIds.has(incoming.subject_id)) {
        merged.push(incoming)
      }
    }

    return merged
  }

  function mergeUserRecord(currentUser: AdminUser, incomingUser?: AdminUser): AdminUser {
    if (!incomingUser) return currentUser

    return {
      ...currentUser,
      ...incomingUser,
      last_login_at: incomingUser.last_login_at ?? currentUser.last_login_at ?? null,
    }
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
    const ref = formatSupportReference(requestId.value)

    if (isAdminProxyTransportFailure(error)) {
      errorMessage.value = formatTransportErrorMessage(requestId.value) ?? 'Users admin belum bisa dimuat.'
    } else {
      errorMessage.value = ref
        ? `Users admin belum bisa dimuat. Gunakan kode referensi ${ref} untuk investigasi.`
        : 'Users admin belum bisa dimuat. Coba lagi beberapa saat lagi.'
    }
  }

  function handleActionError(error: unknown): void {
    requestId.value =
      error instanceof ApiError ? (error.requestId ?? getLastRequestId()) : getLastRequestId()

    if (
      error instanceof ApiError &&
      (error.code === 'reauth_required' ||
        error.code === 'step_up_required' ||
        error.status === 428 ||
        error.status === 412)
    ) {
      actionStatus.value = 'step_up_required'
      errorMessage.value =
        'Aksi ini membutuhkan fresh-auth atau MFA assurance. Ulangi login admin lalu coba lagi.'
      triggerStepUpReauth()
      return
    }

    actionStatus.value = 'error'
    const ref = formatSupportReference(requestId.value)

    if (isAdminProxyTransportFailure(error)) {
      errorMessage.value = formatTransportErrorMessage(requestId.value) ?? 'Operasi user gagal.'
    } else {
      errorMessage.value = ref
        ? `Operasi user gagal. Gunakan kode referensi ${ref} untuk investigasi.`
        : 'Operasi user gagal. Coba lagi beberapa saat lagi.'
    }
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
    refreshList,
    refreshSelected,
    selectUser,
    createUser,
    lockSelected,
    unlockSelected,
    deactivateSelected,
    reactivateSelected,
    resetMfaSelected,
    issuePasswordResetSelected,
    syncProfileSelected,
    assignRoles,
    clearPasswordResetToken,
    pendingIntent,
    savePendingIntent,
    clearPendingIntent,
    restorePendingIntent,
    deliveryStatus,
  }
})
