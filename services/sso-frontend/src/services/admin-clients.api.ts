import { apiClient } from '@/lib/api/api-client'

export type AdminClient = {
  readonly client_id: string
  readonly type: string
  readonly redirect_uris: readonly string[]
  readonly backchannel_logout_uri: string | null
  readonly backchannel_logout_internal: boolean
  readonly status?: string
  readonly scopes?: readonly string[]
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

export type ClientLifecycleResponse = {
  readonly registration: { readonly client_id: string; readonly status: string }
  readonly tokens_revoked?: number
  readonly sessions_terminated?: number
}

export type ClientScopeResponse = {
  readonly client_id: string
  readonly scopes: readonly string[]
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

  suspend(clientId: string, reason: string): Promise<ClientLifecycleResponse> {
    return apiClient.post<ClientLifecycleResponse>(
      `/api/admin/client-integrations/${encodeURIComponent(clientId)}/disable`,
      { reason },
    )
  },

  activate(clientId: string): Promise<ClientLifecycleResponse> {
    return apiClient.post<ClientLifecycleResponse>(
      `/api/admin/client-integrations/${encodeURIComponent(clientId)}/activate`,
    )
  },

  syncScopes(clientId: string, scopes: readonly string[]): Promise<ClientScopeResponse> {
    return apiClient.put<ClientScopeResponse>(
      `/api/admin/clients/${encodeURIComponent(clientId)}/scopes`,
      { scopes },
    )
  },
}
