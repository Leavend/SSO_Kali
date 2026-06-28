// Safe, masked admin Clients DTOs for the BFF endpoints under /api/admin/clients
// and /api/admin/client-integrations. Every field is readonly.
//
// INVARIANT: No `client_secret` crosses into a list/detail DTO — only
// `has_secret_hash`; the plaintext secret exists only on
// `CreateClientResponse.plaintext_secret` and `ClientSecretRotation`, and is
// never persisted (one-time reveal, client-only ref). `client_id` is a public
// identifier and is allowed to hydrate.
export type ClientStatus = 'active' | 'staged' | 'disabled' | 'decommissioned'
export type ClientType = 'public' | 'confidential'
export type ClientCategory = 'publik' | 'kepegawaian'
export type ClientEnvironment = 'live' | 'development'
export type ClientProvisioning = 'jit' | 'scim' | 'seeded'

export const CLIENT_STATUSES = ['active', 'staged', 'disabled', 'decommissioned'] as const

export type ScopeCatalogEntry = {
  readonly name: string
  readonly description: string
  readonly claims: readonly string[]
  readonly default_allowed: boolean
}

// Merged list shape: the lean downstream registry overlaid with the registration
// row (see Task 5.2 mergeClients). Optional because list vs detail vs merged
// sources expose different subsets.
export type AdminClientListItem = {
  readonly client_id: string
  readonly display_name?: string | null
  readonly type?: ClientType | string | null
  readonly environment?: string | null
  readonly app_base_url?: string | null
  readonly redirect_uris: readonly string[]
  readonly post_logout_redirect_uris?: readonly string[]
  readonly allowed_scopes?: readonly string[]
  readonly backchannel_logout_uri?: string | null
  readonly backchannel_logout_internal?: boolean
  readonly owner_email?: string | null
  readonly provisioning?: string | null
  readonly status?: ClientStatus | string | null
  readonly category?: ClientCategory
  readonly has_secret_hash?: boolean
}

// Registration row (GET /clients/{id}) — list item + secret/lifecycle timestamps.
// Still carries only `has_secret_hash`, never the secret.
export type AdminClientDetail = AdminClientListItem & {
  readonly activated_at?: string | null
  readonly disabled_at?: string | null
  readonly secret_rotated_at?: string | null
  readonly secret_expires_at?: string | null
}

// client-integrations payload subset (no secret timestamps / no category).
export type ClientRegistration = {
  readonly client_id: string
  readonly display_name?: string | null
  readonly type?: ClientType | string | null
  readonly environment?: string | null
  readonly app_base_url?: string | null
  readonly redirect_uris: readonly string[]
  readonly post_logout_redirect_uris?: readonly string[]
  readonly backchannel_logout_uri?: string | null
  readonly allowed_scopes?: readonly string[]
  readonly owner_email?: string | null
  readonly provisioning?: string | null
  readonly status?: ClientStatus | string | null
  readonly activated_at?: string | null
  readonly disabled_at?: string | null
  readonly has_secret_hash?: boolean
}

// One-time plaintext secret carrier (rotate-secret). The backend returns
// `plaintext_once` AND `plaintext_secret` (same value); the others are accepted
// for fallback resolution (Task 5.9 extractRevealedSecret). NEVER persisted.
export type ClientSecretRotation = {
  readonly client_id: string
  plaintext_once?: string
  plaintext_secret?: string
  client_secret?: string
  secret?: string
  rotated_at?: string
  expires_at?: string
  secret_rotated_at?: string
  secret_expires_at?: string
}

export type ClientListResponse = { readonly clients: readonly AdminClientListItem[] }
export type ClientRegistrationsResponse = { readonly registrations: readonly ClientRegistration[] }
export type ClientDetailResponse = { readonly client: AdminClientDetail }
export type ClientMutationResponse = { readonly client: AdminClientDetail }
export type ClientIntegrationResponse = { readonly registration: ClientRegistration }
// plaintext_secret present ONLY for confidential clients; ABSENT for public.
export type CreateClientResponse = {
  readonly registration: ClientRegistration
  readonly plaintext_secret?: string
}
export type RotateSecretResponse = { readonly rotation: ClientSecretRotation }
export type ScopeCatalogResponse = { readonly scopes: readonly ScopeCatalogEntry[] }
export type DeleteClientResponse = { readonly message: string }

export type ClientCreatePayload = {
  app_name: string
  client_id: string
  environment: ClientEnvironment
  client_type: ClientType
  app_base_url: string
  callback_path: string
  logout_path: string
  owner_email: string
  provisioning: ClientProvisioning
  allowed_scopes: readonly string[]
  category: ClientCategory
}

export type ClientUpdatePayload = Partial<{
  display_name: string
  owner_email: string
  redirect_uris: readonly string[]
  post_logout_redirect_uris: readonly string[]
  backchannel_logout_uri: string | null
  category: ClientCategory
}>

export type SyncScopesPayload = { scopes: readonly string[] }
export type DisablePayload = { reason?: string }
export type DecommissionPayload = { reason?: string }
export type ActivatePayload = { secret_hash?: string }
