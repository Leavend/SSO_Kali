import { apiClient } from '@/lib/api/api-client'
import type {
  ActivatePayload,
  ClientCreatePayload,
  ClientDetailResponse,
  ClientIntegrationResponse,
  ClientListResponse,
  ClientMutationResponse,
  ClientRegistrationsResponse,
  ClientUpdatePayload,
  CreateClientResponse,
  DecommissionPayload,
  DeleteClientResponse,
  DisablePayload,
  RotateSecretResponse,
  ScopeCatalogResponse,
  SyncScopesPayload,
} from '@/types/clients.types'

// Same-origin BFF paths. The Nitro proxy (server/utils/admin-proxy.ts) injects
// the Bearer access token from event.context and rewrites /api/admin/* →
// /admin/api/* before forwarding to the backend. The browser/SPA is token-blind.
//
// This is the single network seam for the Clients domain. The SPLIT PATH SCHEME
// is load-bearing: read/update/scope-sync/delete/rotate use /api/admin/clients*;
// create/stage/activate/disable/decommission/registrations use
// /api/admin/client-integrations*. There is NO POST /api/admin/clients — new
// clients are created via POST /api/admin/client-integrations.
//
// Pure forwarding seam: no rendering, no error mapping, no secret handling. The
// plaintext client_secret returned by create (confidential) and rotateSecret is
// forwarded through UNCHANGED — never copied, transformed, persisted, or logged
// here; the one-time reveal modal owns it as a client-only ref (Tasks 5.9/5.10/5.12).
// Optional fields are omitted when empty so `sometimes`/`nullable` validators
// never see '' / undefined; backchannel_logout_uri is the exception — null is the
// meaningful "clear the URI" state, forwarded whenever it is not undefined.
function clientPath(clientId: string, action?: string): string {
  return action ? `/api/admin/clients/${clientId}/${action}` : `/api/admin/clients/${clientId}`
}

function integrationPath(clientId: string, action: string): string {
  return `/api/admin/client-integrations/${clientId}/${action}`
}

export const clientsApi = {
  list(): Promise<ClientListResponse> {
    return apiClient.get<ClientListResponse>('/api/admin/clients')
  },

  registrations(): Promise<ClientRegistrationsResponse> {
    return apiClient.get<ClientRegistrationsResponse>(
      '/api/admin/client-integrations/registrations',
    )
  },

  show(clientId: string): Promise<ClientDetailResponse> {
    return apiClient.get<ClientDetailResponse>(clientPath(clientId))
  },

  getScopes(): Promise<ScopeCatalogResponse> {
    return apiClient.get<ScopeCatalogResponse>('/api/admin/scopes')
  },

  create(payload: ClientCreatePayload): Promise<CreateClientResponse> {
    return apiClient.post<CreateClientResponse>('/api/admin/client-integrations', payload)
  },

  stage(payload: ClientCreatePayload): Promise<ClientIntegrationResponse> {
    return apiClient.post<ClientIntegrationResponse>(
      '/api/admin/client-integrations/stage',
      payload,
    )
  },

  update(clientId: string, payload: ClientUpdatePayload): Promise<ClientMutationResponse> {
    return apiClient.patch<ClientMutationResponse>(clientPath(clientId), {
      ...(payload.display_name !== undefined && { display_name: payload.display_name }),
      ...(payload.owner_email !== undefined && { owner_email: payload.owner_email }),
      ...(payload.redirect_uris && { redirect_uris: payload.redirect_uris }),
      ...(payload.post_logout_redirect_uris && {
        post_logout_redirect_uris: payload.post_logout_redirect_uris,
      }),
      ...(payload.backchannel_logout_uri !== undefined && {
        backchannel_logout_uri: payload.backchannel_logout_uri,
      }),
      ...(payload.category && { category: payload.category }),
    })
  },

  syncScopes(clientId: string, payload: SyncScopesPayload): Promise<ClientMutationResponse> {
    return apiClient.put<ClientMutationResponse>(clientPath(clientId, 'scopes'), {
      scopes: payload.scopes,
    })
  },

  rotateSecret(clientId: string): Promise<RotateSecretResponse> {
    return apiClient.post<RotateSecretResponse>(clientPath(clientId, 'rotate-secret'))
  },

  activate(clientId: string, payload: ActivatePayload): Promise<ClientIntegrationResponse> {
    return apiClient.post<ClientIntegrationResponse>(integrationPath(clientId, 'activate'), {
      ...(payload.secret_hash && { secret_hash: payload.secret_hash }),
    })
  },

  disable(clientId: string, payload: DisablePayload): Promise<ClientIntegrationResponse> {
    return apiClient.post<ClientIntegrationResponse>(integrationPath(clientId, 'disable'), {
      ...(payload.reason && { reason: payload.reason }),
    })
  },

  decommission(clientId: string, payload: DecommissionPayload): Promise<ClientIntegrationResponse> {
    return apiClient.post<ClientIntegrationResponse>(integrationPath(clientId, 'decommission'), {
      ...(payload.reason && { reason: payload.reason }),
    })
  },

  delete(clientId: string): Promise<DeleteClientResponse> {
    return apiClient.delete<DeleteClientResponse>(clientPath(clientId))
  },
}
