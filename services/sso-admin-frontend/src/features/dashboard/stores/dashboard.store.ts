import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { ApiError, getLastRequestId } from '@/lib/api/api-client'
import { isAdminProxyTransportFailure, formatTransportErrorMessage } from '@/lib/display-identifiers'
import { dashboardApi } from '../services/dashboard.api'
import type { DashboardSummary } from '../types'

export type DashboardStatus =
  | 'idle'
  | 'loading'
  | 'success'
  | 'unauthenticated'
  | 'forbidden'
  | 'error'

export const useDashboardStore = defineStore('admin-dashboard', () => {
  const status = ref<DashboardStatus>('idle')
  const summary = ref<DashboardSummary | null>(null)
  const errorMessage = ref<string | null>(null)
  const requestId = ref<string | null>(null)

  const isLoading = computed<boolean>(() => status.value === 'loading')

  async function load(silent = false): Promise<void> {
    if (!silent) {
      status.value = 'loading'
      errorMessage.value = null
    }

    try {
      summary.value = await dashboardApi.getSummary()
      requestId.value = getLastRequestId()
      status.value = 'success'
    } catch (error) {
      if (!silent) {
        summary.value = null
      }

      if (error instanceof ApiError) {
        requestId.value = error.requestId ?? getLastRequestId()

        if (error.status === 401) {
          status.value = 'unauthenticated'
          errorMessage.value = 'Sesi admin berakhir. Login ulang untuk melanjutkan.'
          return
        }

        if (error.status === 403) {
          status.value = 'forbidden'
          errorMessage.value = 'Kamu tidak memiliki izin untuk melihat dashboard admin.'
          return
        }
      } else {
        if (!silent) {
          requestId.value = getLastRequestId()
        }
      }

      if (!silent) {
        status.value = 'error'
        if (isAdminProxyTransportFailure(error)) {
          errorMessage.value = formatTransportErrorMessage(requestId.value) ?? 'Dashboard admin belum bisa dimuat.'
        } else {
          errorMessage.value = requestId.value
            ? `Dashboard admin belum bisa dimuat. Coba lagi atau gunakan request ID ${requestId.value} untuk investigasi.`
            : 'Dashboard admin belum bisa dimuat. Coba lagi beberapa saat lagi.'
        }
      }
    }
  }

  const refresh = (): Promise<void> => load(true)

  return {
    status,
    summary,
    errorMessage,
    requestId,
    isLoading,
    load,
    refresh,
  }
})
