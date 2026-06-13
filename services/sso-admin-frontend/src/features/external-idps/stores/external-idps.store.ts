import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { ApiError, getLastRequestId } from '@/lib/api/api-client'
import { isAdminProxyTransportFailure, formatTransportErrorMessage } from '@/lib/display-identifiers'
import { triggerStepUpReauth } from '@/lib/stepup/stepup'
import { externalIdpsApi } from '../services/external-idps.api'
import type {
  ExternalIdpCreatePayload,
  ExternalIdpMappingPreview,
  ExternalIdpUpdatePayload,
  ExternalIdentityProvider,
} from '../types'

export type ExternalIdpsStatus =
  | 'idle'
  | 'loading'
  | 'success'
  | 'unauthenticated'
  | 'forbidden'
  | 'error'
export type ExternalIdpActionStatus = 'idle' | 'loading' | 'success' | 'step_up_required' | 'error'

export const useExternalIdpsStore = defineStore('admin-external-idps', () => {
  const status = ref<ExternalIdpsStatus>('idle')
  const actionStatus = ref<ExternalIdpActionStatus>('idle')
  const providers = ref<readonly ExternalIdentityProvider[]>([])
  const selectedProviderKey = ref<string | null>(null)
  const mappingPreview = ref<ExternalIdpMappingPreview | null>(null)
  const errorMessage = ref<string | null>(null)
  const requestId = ref<string | null>(null)

  const selectedProvider = computed<ExternalIdentityProvider | null>(
    () => providers.value.find((p) => p.provider_key === selectedProviderKey.value) ?? null,
  )

  async function load(): Promise<void> {
    status.value = 'loading'
    errorMessage.value = null

    try {
      const response = await externalIdpsApi.list()
      providers.value = response.providers
      selectedProviderKey.value = response.providers[0]?.provider_key ?? null
      requestId.value = getLastRequestId()
      status.value = 'success'
    } catch (error) {
      providers.value = []
      selectedProviderKey.value = null
      handleLoadError(error)
    }
  }

  async function selectProvider(providerKey: string): Promise<void> {
    selectedProviderKey.value = providerKey
    mappingPreview.value = null
    errorMessage.value = null

    try {
      const response = await externalIdpsApi.show(providerKey)
      upsertProvider(response.provider)
      requestId.value = getLastRequestId()
    } catch (error) {
      handleActionError(error)
    }
  }

  async function createProvider(payload: ExternalIdpCreatePayload): Promise<void> {
    actionStatus.value = 'loading'
    errorMessage.value = null

    try {
      const response = await externalIdpsApi.create(payload)
      upsertProvider(response.provider)
      selectedProviderKey.value = response.provider.provider_key
      requestId.value = getLastRequestId()
      actionStatus.value = 'success'
    } catch (error) {
      handleActionError(error)
    }
  }

  async function updateSelected(payload: ExternalIdpUpdatePayload): Promise<void> {
    if (!selectedProviderKey.value) return
    actionStatus.value = 'loading'
    errorMessage.value = null

    try {
      const response = await externalIdpsApi.update(selectedProviderKey.value, payload)
      upsertProvider(response.provider)
      requestId.value = getLastRequestId()
      actionStatus.value = 'success'
    } catch (error) {
      handleActionError(error)
    }
  }

  async function previewSelectedMapping(claims: Readonly<Record<string, unknown>>): Promise<void> {
    if (!selectedProviderKey.value) return
    actionStatus.value = 'loading'
    errorMessage.value = null

    try {
      const response = await externalIdpsApi.previewMapping(selectedProviderKey.value, claims)
      mappingPreview.value = response.preview
      requestId.value = getLastRequestId()
      actionStatus.value = 'success'
    } catch (error) {
      handleActionError(error)
    }
  }

  async function deleteSelected(): Promise<void> {
    if (!selectedProviderKey.value) return
    actionStatus.value = 'loading'
    errorMessage.value = null

    try {
      await externalIdpsApi.delete(selectedProviderKey.value)
      providers.value = providers.value.filter((p) => p.provider_key !== selectedProviderKey.value)
      selectedProviderKey.value = providers.value[0]?.provider_key ?? null
      mappingPreview.value = null
      requestId.value = getLastRequestId()
      actionStatus.value = 'success'
    } catch (error) {
      handleActionError(error)
    }
  }

  function upsertProvider(nextProvider: ExternalIdentityProvider): void {
    providers.value = providers.value.some((p) => p.provider_key === nextProvider.provider_key)
      ? providers.value.map((p) =>
          p.provider_key === nextProvider.provider_key ? nextProvider : p,
        )
      : [nextProvider, ...providers.value]
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
        errorMessage.value = 'Kamu tidak memiliki izin untuk melihat External IdP admin.'
        return
      }
    } else {
      requestId.value = getLastRequestId()
    }

    status.value = 'error'
    if (isAdminProxyTransportFailure(error)) {
      errorMessage.value = formatTransportErrorMessage(requestId.value) ?? 'External IdP admin belum bisa dimuat.'
    } else {
      errorMessage.value = requestId.value
        ? `External IdP admin belum bisa dimuat. Coba lagi atau gunakan request ID ${requestId.value} untuk investigasi.`
        : 'External IdP admin belum bisa dimuat. Coba lagi beberapa saat lagi.'
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
        'Aksi External IdP membutuhkan fresh-auth atau MFA assurance. Ulangi login admin lalu coba lagi.'
      triggerStepUpReauth()
      return
    }

    actionStatus.value = 'error'
    if (isAdminProxyTransportFailure(error)) {
      errorMessage.value = formatTransportErrorMessage(requestId.value) ?? 'Operasi External IdP gagal.'
    } else {
      errorMessage.value = requestId.value
        ? `Operasi External IdP gagal. Gunakan request ID ${requestId.value} untuk investigasi.`
        : 'Operasi External IdP gagal. Coba lagi beberapa saat lagi.'
    }
  }

  return {
    status,
    actionStatus,
    providers,
    selectedProviderKey,
    selectedProvider,
    mappingPreview,
    errorMessage,
    requestId,
    load,
    selectProvider,
    createProvider,
    updateSelected,
    previewSelectedMapping,
    deleteSelected,
  }
})
