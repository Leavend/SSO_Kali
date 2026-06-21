import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { ApiError, getLastRequestId } from '@/lib/api/api-client'
import { formatSectionError } from '@/lib/display-identifiers'
import { observabilityApi } from '../services/observability.api'
import type { ObservabilitySummary } from '../types'

export type ObservabilityStatus =
  | 'idle'
  | 'loading'
  | 'success'
  | 'unauthenticated'
  | 'forbidden'
  | 'error'

export const useObservabilityStore = defineStore('admin-observability', () => {
  const status = ref<ObservabilityStatus>('idle')
  const summary = ref<ObservabilitySummary | null>(null)
  const errorMessage = ref<string | null>(null)
  const requestId = ref<string | null>(null)

  const isLoading = computed(() => status.value === 'loading' || status.value === 'idle')

  async function load(silent = false): Promise<void> {
    if (!silent) {
      status.value = 'loading'
      errorMessage.value = null
    }

    try {
      summary.value = await observabilityApi.getSummary()
      requestId.value = getLastRequestId()
      status.value = 'success'
      errorMessage.value = null
    } catch (error) {
      if (!silent) summary.value = null
      handleError(error, silent)
    }
  }

  function handleError(error: unknown, silent: boolean): void {
    if (error instanceof ApiError) {
      requestId.value = error.requestId ?? getLastRequestId()
      if (error.status === 401) {
        status.value = 'unauthenticated'
      } else if (error.status === 403) {
        status.value = 'forbidden'
      } else if (!silent) {
        status.value = 'error'
      }
    } else if (!silent) {
      requestId.value = getLastRequestId()
      status.value = 'error'
    }

    if (!silent || status.value === 'forbidden' || status.value === 'unauthenticated') {
      errorMessage.value = formatSectionError('Observability cockpit', error)
    }
  }

  const refresh = (): Promise<void> => load(true)

  return { status, summary, errorMessage, requestId, isLoading, load, refresh }
})
