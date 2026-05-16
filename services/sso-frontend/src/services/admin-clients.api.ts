import { adminBffRequest } from './admin-bff-client'

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

type BackendRotateSecretResponse =
  | RotateSecretResponse
  | {
      readonly rotation: {
        readonly plaintext_once: string
      }
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
    const data = await adminBffRequest<{ readonly clients: readonly AdminClient[] }>(
      '/api/admin/clients',
    )
    return data.clients
  },

  async create(draft: ClientDraft): Promise<void> {
    await adminBffRequest('/api/admin/client-integrations/stage', { method: 'POST', body: draft })
  },

  update(clientId: string, payload: ClientUpdate): Promise<AdminClient> {
    return adminBffRequest<AdminClient>(`/api/admin/clients/${encodeURIComponent(clientId)}`, {
      method: 'PATCH',
      body: payload,
    })
  },

  async rotateSecret(clientId: string): Promise<RotateSecretResponse> {
    const data = await adminBffRequest<BackendRotateSecretResponse>(
      `/api/admin/clients/${encodeURIComponent(clientId)}/rotate-secret`,
      { method: 'POST' },
    )
    return 'client_secret' in data ? data : { client_secret: data.rotation.plaintext_once }
  },

  async decommission(clientId: string): Promise<void> {
    await adminBffRequest(`/api/admin/clients/${encodeURIComponent(clientId)}`, {
      method: 'DELETE',
    })
  },

  suspend(clientId: string, reason: string): Promise<ClientLifecycleResponse> {
    return adminBffRequest<ClientLifecycleResponse>(
      `/api/admin/client-integrations/${encodeURIComponent(clientId)}/disable`,
      { method: 'POST', body: { reason } },
    )
  },

  activate(clientId: string): Promise<ClientLifecycleResponse> {
    return adminBffRequest<ClientLifecycleResponse>(
      `/api/admin/client-integrations/${encodeURIComponent(clientId)}/activate`,
      { method: 'POST' },
    )
  },

  syncScopes(clientId: string, scopes: readonly string[]): Promise<ClientScopeResponse> {
    return adminBffRequest<ClientScopeResponse>(
      `/api/admin/clients/${encodeURIComponent(clientId)}/scopes`,
      { method: 'PUT', body: { scopes } },
    )
  },
}
