import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { ApiError, getLastRequestId } from '@/lib/api/api-client'
import { formatSectionError, formatSupportReference } from '@/lib/display-identifiers'
import { observabilityApi } from '../services/observability.api'
import type { ObservabilitySummary } from '../types'

export type ObservabilityStatus =
  | 'idle'
  | 'loading'
  | 'success'
  | 'unauthenticated'
  | 'forbidden'
  | 'error'
  | 'stale'

export const useObservabilityStore = defineStore('admin-observability', () => {
  const status = ref<ObservabilityStatus>('idle')
  const summary = ref<ObservabilitySummary | null>(null)
  const errorMessage = ref<string | null>(null)
  const requestId = ref<string | null>(null)

  const isLoading = computed(() => status.value === 'loading' || status.value === 'idle')
  const isStale = computed(() => status.value === 'stale')

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
    requestId.value =
      error instanceof ApiError ? (error.requestId ?? getLastRequestId()) : getLastRequestId()

    // A background refresh with a prior successful snapshot already on screen
    // should never blank the dashboard — keep the last good data and surface a
    // degraded/stale indicator instead. This holds even for a transient 401/403
    // auth blip: the cure for a genuine auth loss is the next foreground load,
    // not wiping a working cockpit on a momentary refresh failure. Symmetric
    // with how 5xx refresh failures are handled.
    if (silent && summary.value !== null) {
      status.value = 'stale'
      errorMessage.value = formatStaleError()
      return
    }

    // Initial load (no prior snapshot) is the security boundary: a genuine auth
    // loss must surface as unauthenticated/forbidden, not be hidden.
    if (error instanceof ApiError && error.status === 401) {
      status.value = 'unauthenticated'
    } else if (error instanceof ApiError && error.status === 403) {
      status.value = 'forbidden'
    } else {
      // A foreground failure, or a background failure with no prior summary to
      // fall back to: surface the error instead of leaving isLoading stuck true
      // (which would otherwise render a spinner that never resolves).
      status.value = 'error'
    }

    errorMessage.value = formatSectionError('Observability cockpit', error)
  }

  function formatStaleError(): string {
    // Stale banner copy is deliberately generic: the dashboard is still showing
    // a good snapshot, so auth-specific copy ("session expired") would be
    // misleading here. Keep the section label for context; the request ID is
    // already exposed via `requestId` for troubleshooting.
    const ref = formatSupportReference(requestId.value)
    const refSuffix = ref ? ` Gunakan kode referensi ${ref} untuk investigasi.` : ''
    return `Observability cockpit gagal di-refresh. Menampilkan snapshot terakhir yang berhasil.${refSuffix}`
  }

  const refresh = (): Promise<void> => load(true)

  return { status, summary, errorMessage, requestId, isLoading, isStale, load, refresh }
})
