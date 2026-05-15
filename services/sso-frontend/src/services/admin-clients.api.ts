import { apiClient } from '@/lib/api/api-client'

export type AdminClient = {
  readonly client_id: string
  readonly type: string
  readonly redirect_uris: readonly string[]
  readonly backchannel_logout_uri: string | null
  readonly backchannel_logout_internal: boolean
}

export type ClientDraft = {
  readonly clientId: string
  readonly displayName: string
  readonly redirectUris: readonly string[]
}

export type ClientUpdate = {
  readonly redirect_uris?: readonly string[]
  readonly backchannel_logout_uri?: string | null
  readonly backchannel_logout_internal?: boolean
}

export type RotateSecretResponse = {
  readonly client_secret: string
}

export const adminClientsApi = {
  async list(): Promise<readonly AdminClient[]> {
    const data = await apiClient.get<{ readonly clients: readonly AdminClient[] }>('/api/admin/clients')
    return data.clients
  },

  async create(draft: ClientDraft): Promise<void> {
    await apiClient.post('/api/admin/client-integrations/stage', draft)
  },

  update(clientId: string, payload: ClientUpdate): Promise<AdminClient> {
    return apiClient.patch<AdminClient>(`/api/admin/clients/${encodeURIComponent(clientId)}`, payload)
  },

  rotateSecret(clientId: string): Promise<RotateSecretResponse> {
    return apiClient.post<RotateSecretResponse>(`/api/admin/clients/${encodeURIComponent(clientId)}/rotate-secret`)
  },

  async decommission(clientId: string): Promise<void> {
    await apiClient.delete(`/api/admin/clients/${encodeURIComponent(clientId)}`)
  },
}
