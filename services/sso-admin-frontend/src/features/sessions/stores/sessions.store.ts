import { ref } from 'vue'
import { defineStore } from 'pinia'
import { ApiError, getLastRequestId } from '@/lib/api/api-client'
import { formatSupportReference } from '@/lib/display-identifiers'
import { triggerStepUpReauth } from '@/lib/stepup/stepup'
import { sessionsApi } from '../services/sessions.api'
import type { AdminSession } from '../types'

export type SessionStatus =
  | 'idle'
  | 'loading'
  | 'success'
  | 'unauthenticated'
  | 'forbidden'
  | 'error'
export type SessionActionStatus = 'idle' | 'loading' | 'success' | 'step_up_required' | 'error'

export const useSessionsStore = defineStore('admin-sessions', () => {
  const status = ref<SessionStatus>('idle')
  const actionStatus = ref<SessionActionStatus>('idle')
  const sessions = ref<readonly AdminSession[]>([])
  const selectedSessionId = ref<string | null>(null)
  const errorMessage = ref<string | null>(null)
  const requestId = ref<string | null>(null)

  async function load(): Promise<void> {
    status.value = 'loading'
    errorMessage.value = null

    try {
      const response = await sessionsApi.list()
      sessions.value = response.sessions
      requestId.value = getLastRequestId()
      status.value = 'success'
    } catch (error) {
      sessions.value = []
      handleListError(error)
    }
  }

  async function selectSession(sessionId: string): Promise<void> {
    selectedSessionId.value = sessionId
    errorMessage.value = null

    try {
      await sessionsApi.show(sessionId)
      requestId.value = getLastRequestId()
    } catch (error) {
      handleActionError(error)
    }
  }

  async function revokeSession(sessionId: string): Promise<void> {
    actionStatus.value = 'loading'
    errorMessage.value = null

    try {
      await sessionsApi.revoke(sessionId)
      sessions.value = sessions.value.filter((session) => session.session_id !== sessionId)
      requestId.value = getLastRequestId()
      actionStatus.value = 'success'
    } catch (error) {
      handleActionError(error)
    }
  }

  async function revokeUserSessions(subjectId: string): Promise<void> {
    actionStatus.value = 'loading'
    errorMessage.value = null

    try {
      await sessionsApi.revokeUserSessions(subjectId)
      requestId.value = getLastRequestId()
      actionStatus.value = 'success'
    } catch (error) {
      handleActionError(error)
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
        errorMessage.value = 'Kamu tidak memiliki izin untuk melihat sessions admin.'
        return
      }
    } else {
      requestId.value = getLastRequestId()
    }

    status.value = 'error'
    const ref = formatSupportReference(requestId.value)
    errorMessage.value = ref
      ? `Sessions admin belum bisa dimuat. Gunakan kode referensi ${ref} untuk investigasi.`
      : 'Sessions admin belum bisa dimuat. Coba lagi beberapa saat lagi.'
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
    errorMessage.value = ref
      ? `Operasi sesi gagal. Gunakan kode referensi ${ref} untuk investigasi.`
      : 'Operasi sesi gagal. Coba lagi beberapa saat lagi.'
  }

  return {
    status,
    actionStatus,
    sessions,
    selectedSessionId,
    errorMessage,
    requestId,
    load,
    selectSession,
    revokeSession,
    revokeUserSessions,
  }
})
