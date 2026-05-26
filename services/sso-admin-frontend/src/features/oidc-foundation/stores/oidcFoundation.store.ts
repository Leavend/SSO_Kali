import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { ApiError } from '@/lib/api/api-client'
import { oidcFoundationApi } from '../services/oidcFoundation.api'
import type { OidcFoundationSnapshot } from '../types'

export type OidcFoundationStatus =
  | 'idle'
  | 'loading'
  | 'success'
  | 'unauthenticated'
  | 'forbidden'
  | 'error'

export const useOidcFoundationStore = defineStore('oidc-foundation', () => {
  const status = ref<OidcFoundationStatus>('idle')
  const snapshot = ref<OidcFoundationSnapshot | null>(null)
  const errorMessage = ref<string | null>(null)

  const isLoading = computed<boolean>(() => status.value === 'loading')

  async function load(): Promise<void> {
    status.value = 'loading'
    errorMessage.value = null

    try {
      snapshot.value = await oidcFoundationApi.getSnapshot()
      status.value = 'success'
    } catch (error) {
      snapshot.value = null

      if (error instanceof ApiError) {
        if (error.status === 401) {
          status.value = 'unauthenticated'
          errorMessage.value = 'Sesi admin berakhir. Login ulang untuk melanjutkan.'
          return
        }

        if (error.status === 403) {
          status.value = 'forbidden'
          errorMessage.value = 'Kamu tidak memiliki izin untuk melihat OIDC Foundation.'
          return
        }
      }

      status.value = 'error'
      errorMessage.value =
        'Status OIDC Foundation belum bisa dimuat. Coba lagi atau gunakan correlation ID dari response jika tersedia.'
    }
  }

  return {
    status,
    snapshot,
    errorMessage,
    isLoading,
    load,
  }
})
