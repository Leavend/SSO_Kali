import { ref } from 'vue'
import { defineStore } from 'pinia'
import { ApiError, getLastRequestId } from '@/lib/api/api-client'
import { ipAccessApi } from '../services/ip-access.api'
import type { IpAccessRule, IpAccessRuleCreatePayload } from '../types'

export type IpAccessStatus =
  | 'idle'
  | 'loading'
  | 'success'
  | 'unauthenticated'
  | 'forbidden'
  | 'error'
export type ActionStatus = 'idle' | 'loading' | 'success' | 'step_up_required' | 'error'

export const useIpAccessStore = defineStore('admin-ip-access', () => {
  const status = ref<IpAccessStatus>('idle')
  const actionStatus = ref<ActionStatus>('idle')
  const rules = ref<IpAccessRule[]>([])
  const errorMessage = ref<string | null>(null)
  const requestId = ref<string | null>(null)

  async function load(): Promise<void> {
    status.value = 'loading'
    errorMessage.value = null

    try {
      const response = await ipAccessApi.list()
      rules.value = [...response.rules]
      requestId.value = getLastRequestId()
      status.value = 'success'
    } catch (error) {
      rules.value = []
      handleLoadError(error)
    }
  }

  async function create(payload: IpAccessRuleCreatePayload): Promise<void> {
    actionStatus.value = 'loading'
    errorMessage.value = null

    try {
      const response = await ipAccessApi.create(payload)
      rules.value = [response.rule, ...rules.value]
      requestId.value = getLastRequestId()
      actionStatus.value = 'success'
    } catch (error) {
      handleActionError(error)
    }
  }

  async function destroy(id: number): Promise<void> {
    actionStatus.value = 'loading'
    errorMessage.value = null

    try {
      await ipAccessApi.destroy(id)
      rules.value = rules.value.filter((r) => r.id !== id)
      requestId.value = getLastRequestId()
      actionStatus.value = 'success'
    } catch (error) {
      handleActionError(error)
    }
  }

  function handleLoadError(error: unknown): void {
    if (error instanceof ApiError) {
      requestId.value = error.requestId ?? getLastRequestId()

      if (error.status === 401) {
        status.value = 'unauthenticated'
        errorMessage.value = 'Sesi admin berakhir. Login ulang untuk melanjutkan.'
        return
      }

      if (error.status === 403) {
        status.value = 'forbidden'
        errorMessage.value = 'Kamu tidak memiliki izin untuk melihat IP access rules.'
        return
      }
    } else {
      requestId.value = getLastRequestId()
    }

    status.value = 'error'
    errorMessage.value = requestId.value
      ? `IP access rules belum bisa dimuat. Gunakan request ID ${requestId.value} untuk investigasi.`
      : 'IP access rules belum bisa dimuat. Coba lagi beberapa saat lagi.'
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
      ? `Operasi IP access rule gagal. Gunakan request ID ${requestId.value} untuk investigasi.`
      : 'Operasi IP access rule gagal. Coba lagi beberapa saat lagi.'
  }

  return {
    status,
    actionStatus,
    rules,
    errorMessage,
    requestId,
    load,
    create,
    destroy,
  }
})
