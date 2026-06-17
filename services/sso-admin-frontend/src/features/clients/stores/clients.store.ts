import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { ApiError, getLastRequestId } from '@/lib/api/api-client'
import {
  formatSupportReference,
  isAdminProxyTransportFailure,
  formatTransportErrorMessage,
} from '@/lib/display-identifiers'
import { clientsApi } from '../services/clients.api'
import type {
  AdminClient,
  ClientCreatePayload,
  ClientCreateResponse,
  ClientCreationIntent,
  ClientLifecyclePayload,
  ClientUpdatePayload,
} from '../types'

export type ClientsStatus =
  | 'idle'
  | 'loading'
  | 'success'
  | 'unauthenticated'
  | 'forbidden'
  | 'error'
export type ClientDetailStatus = 'idle' | 'loading' | 'success' | 'error'
export type ClientActionStatus = 'idle' | 'loading' | 'success' | 'step_up_required' | 'error'

export const useClientsStore = defineStore('admin-clients', () => {
  const status = ref<ClientsStatus>('idle')
  const detailStatus = ref<ClientDetailStatus>('idle')
  const actionStatus = ref<ClientActionStatus>('idle')
  const clients = ref<readonly AdminClient[]>([])
  const selectedClientId = ref<string | null>(null)
  const errorMessage = ref<string | null>(null)
  const requestId = ref<string | null>(null)
  const rotationSecret = ref<string | null>(null)
  const rotationClientId = ref<string | null>(null)
  const createdClientIntent = ref<ClientCreationIntent | null>(null)

  const selectedClient = computed<AdminClient | null>(
    () => clients.value.find((client) => client.client_id === selectedClientId.value) ?? null,
  )
  const isLoading = computed<boolean>(() => status.value === 'loading')

  async function load(): Promise<void> {
    status.value = 'loading'
    errorMessage.value = null
    clearRotationSecret()

    try {
      const response = await clientsApi.list()
      const listRequestId = getLastRequestId()
      const registrations = await clientsApi.registrations()
      clients.value = mergeClients(response.clients, registrations.registrations)
      selectedClientId.value = clients.value[0]?.client_id ?? null
      requestId.value = listRequestId
      status.value = 'success'
    } catch (error) {
      clients.value = []
      selectedClientId.value = null
      handleListError(error)
    }
  }

  async function selectClient(clientId: string): Promise<void> {
    selectedClientId.value = clientId
    detailStatus.value = 'loading'
    errorMessage.value = null
    clearRotationSecret()

    try {
      const response = await clientsApi.show(clientId)
      upsertClient(response.client)
      requestId.value = getLastRequestId()
      detailStatus.value = 'success'
    } catch (error) {
      detailStatus.value = 'error'
      handleGenericError(error)
    }
  }

  async function createClient(payload: ClientCreatePayload): Promise<ClientCreateResponse | null> {
    actionStatus.value = 'loading'
    errorMessage.value = null
    clearRotationSecret()
    createdClientIntent.value = null

    try {
      const response = await clientsApi.create(payload)
      upsertClient(response.registration)
      selectedClientId.value = response.registration.client_id
      requestId.value = getLastRequestId()
      actionStatus.value = 'success'

      return response
    } catch (error) {
      handleGenericError(error)
      if (actionStatus.value === 'loading') actionStatus.value = 'error'

      return null
    }
  }

  async function updateSelected(payload: ClientUpdatePayload): Promise<void> {
    if (!selectedClientId.value) return
    errorMessage.value = null

    try {
      const response = await clientsApi.update(selectedClientId.value, payload)
      upsertClient({ ...response.client, ...payload })
      requestId.value = getLastRequestId()
    } catch (error) {
      handleGenericError(error)
    }
  }

  async function syncSelectedScopes(scopes: readonly string[]): Promise<void> {
    if (!selectedClientId.value) return
    errorMessage.value = null

    try {
      const response = await clientsApi.syncScopes(selectedClientId.value, {
        scopes: [...scopes],
      })
      upsertClient(response.client)
      requestId.value = getLastRequestId()
    } catch (error) {
      handleGenericError(error)
    }
  }

  async function disableSelected(payload: ClientLifecyclePayload): Promise<void> {
    if (!selectedClientId.value) return
    errorMessage.value = null
    clearRotationSecret()

    try {
      const response = await clientsApi.disable(selectedClientId.value, payload)
      upsertClient(response.registration)
      requestId.value = getLastRequestId()
    } catch (error) {
      handleGenericError(error)
    }
  }

  const scopes = ref<
    Array<{ name: string; description: string; claims: string[]; default_allowed: boolean }>
  >([])

  async function loadScopes(): Promise<void> {
    try {
      const response = await clientsApi.getScopes()
      scopes.value = response.scopes
    } catch (error) {
      console.error('Failed to load scopes', error)
    }
  }

  async function decommissionSelected(): Promise<void> {
    if (!selectedClientId.value) return
    errorMessage.value = null
    clearRotationSecret()

    try {
      const response = await clientsApi.decommission(selectedClientId.value)
      upsertClient(response.registration)
      requestId.value = getLastRequestId()
    } catch (error) {
      handleGenericError(error)
    }
  }

  async function deleteSelected(): Promise<void> {
    if (!selectedClientId.value) return
    errorMessage.value = null
    clearRotationSecret()

    try {
      await clientsApi.delete(selectedClientId.value)
      const deletedId = selectedClientId.value
      clients.value = clients.value.filter((client) => client.client_id !== deletedId)
      selectedClientId.value = clients.value[0]?.client_id ?? null
      requestId.value = getLastRequestId()
    } catch (error) {
      handleGenericError(error)
    }
  }

  async function rotateSelectedSecret(): Promise<void> {
    if (!selectedClientId.value) return
    clearRotationSecret()
    const response = await clientsApi.rotateSecret(selectedClientId.value)
    rotationClientId.value = response.rotation.client_id
    rotationSecret.value =
      response.rotation.plaintext_secret ??
      response.rotation.plaintext_once ??
      response.rotation.client_secret ??
      response.rotation.secret ??
      null
    requestId.value = getLastRequestId()
  }

  function clearRotationSecret(): void {
    rotationSecret.value = null
    rotationClientId.value = null
  }

  function setCreatedClientIntent(intent: ClientCreationIntent): void {
    createdClientIntent.value = intent
  }

  function consumeCreatedClientIntent(clientId?: string | null): ClientCreationIntent | null {
    const intent = createdClientIntent.value
    if (intent === null) return null
    if (clientId && intent.clientId !== clientId) return null
    createdClientIntent.value = null
    return intent
  }

  function upsertClient(nextClient: AdminClient): void {
    const index = clients.value.findIndex((client) => client.client_id === nextClient.client_id)
    clients.value =
      index === -1
        ? [...clients.value, nextClient]
        : clients.value.map((client) =>
            client.client_id === nextClient.client_id ? nextClient : client,
          )
  }

  function mergeClients(
    runtimeClients: readonly AdminClient[],
    registrationClients: readonly AdminClient[],
  ): readonly AdminClient[] {
    const merged = new Map<string, AdminClient>()

    for (const client of registrationClients) merged.set(client.client_id, client)
    for (const client of runtimeClients) {
      const registration = merged.get(client.client_id)
      merged.set(client.client_id, mergeClientMetadata(registration, client))
    }

    return [...merged.values()]
  }

  function mergeClientMetadata(
    registration: AdminClient | undefined,
    runtime: AdminClient,
  ): AdminClient {
    if (registration === undefined) return runtime

    const merged: Record<string, unknown> = { ...registration }

    for (const key of Object.keys(runtime) as Array<keyof AdminClient>) {
      merged[key] = runtime[key] ?? registration[key]
    }

    return merged as AdminClient
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
        errorMessage.value = 'Kamu tidak memiliki izin untuk melihat OAuth clients.'
        return
      }
    } else {
      requestId.value = getLastRequestId()
    }

    status.value = 'error'
    const ref = formatSupportReference(requestId.value)

    if (isAdminProxyTransportFailure(error)) {
      errorMessage.value =
        formatTransportErrorMessage(requestId.value) ?? 'OAuth clients belum bisa dimuat.'
    } else {
      errorMessage.value = ref
        ? `OAuth clients belum bisa dimuat. Gunakan kode referensi ${ref} untuk investigasi.`
        : 'OAuth clients belum bisa dimuat. Coba lagi beberapa saat lagi.'
    }
  }

  function handleGenericError(error: unknown): void {
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
        'Aksi OAuth client membutuhkan fresh-auth atau MFA assurance. Ulangi login admin lalu coba lagi.'
      return
    }

    if (error instanceof ApiError && error.status === 422) {
      const ref = formatSupportReference(requestId.value)
      errorMessage.value = ref
        ? `Validasi OAuth client gagal. Periksa input lalu gunakan kode referensi ${ref} untuk investigasi jika perlu.`
        : 'Validasi OAuth client gagal. Periksa input lalu coba lagi.'
      return
    }

    const ref = formatSupportReference(requestId.value)

    if (isAdminProxyTransportFailure(error)) {
      errorMessage.value =
        formatTransportErrorMessage(requestId.value) ?? 'Operasi OAuth client gagal.'
    } else {
      errorMessage.value = ref
        ? `Operasi OAuth client gagal. Gunakan kode referensi ${ref} untuk investigasi.`
        : 'Operasi OAuth client gagal. Coba lagi beberapa saat lagi.'
    }
  }

  return {
    status,
    detailStatus,
    actionStatus,
    clients,
    selectedClientId,
    selectedClient,
    errorMessage,
    requestId,
    rotationSecret,
    rotationClientId,
    createdClientIntent,
    isLoading,
    load,
    selectClient,
    createClient,
    updateSelected,
    syncSelectedScopes,
    disableSelected,
    decommissionSelected,
    deleteSelected,
    rotateSelectedSecret,
    clearRotationSecret,
    setCreatedClientIntent,
    consumeCreatedClientIntent,
    scopes,
    loadScopes,
  }
})
