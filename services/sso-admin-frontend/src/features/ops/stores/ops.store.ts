import { ref } from 'vue'
import { defineStore } from 'pinia'
import { ApiError, getLastRequestId } from '@/lib/api/api-client'
import { formatSectionError } from '@/lib/display-identifiers'
import { opsApi } from '../services/ops.api'
import type { OpsReadiness } from '../types'

export type OpsStatus = 'idle' | 'loading' | 'success' | 'unauthenticated' | 'forbidden' | 'error'

export const useOpsStore = defineStore('admin-ops', () => {
  const status = ref<OpsStatus>('idle')
  const readiness = ref<OpsReadiness | null>(null)
  const errorMessage = ref<string | null>(null)
  const requestId = ref<string | null>(null)

  async function load(): Promise<void> {
    status.value = 'loading'
    errorMessage.value = null

    try {
      readiness.value = await opsApi.getReadiness()
      requestId.value = getLastRequestId()
      status.value = 'success'
    } catch (error) {
      readiness.value = null
      handleLoadError(error)
    }
  }

  function handleLoadError(error: unknown): void {
    if (error instanceof ApiError) {
      requestId.value = error.requestId ?? getLastRequestId()

      if (error.status === 401) {
        status.value = 'unauthenticated'
      } else if (error.status === 403) {
        status.value = 'forbidden'
      } else {
        status.value = 'error'
      }
    } else {
      requestId.value = getLastRequestId()
      status.value = 'error'
    }

    errorMessage.value = formatSectionError('Ops evidence', error)
  }

  return { status, readiness, errorMessage, requestId, load }
})
