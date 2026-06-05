export type AdminClient = {
  readonly client_id: string
  readonly display_name?: string | null
  readonly type?: string | null
  readonly environment?: string | null
  readonly app_base_url?: string | null
  readonly redirect_uris: readonly string[]
  readonly post_logout_redirect_uris?: readonly string[]
  readonly allowed_scopes?: readonly string[]
  readonly backchannel_logout_uri?: string | null
  readonly owner_email?: string | null
  readonly provisioning?: string | null
  readonly status?: string | null
  readonly activated_at?: string | null
  readonly disabled_at?: string | null
  readonly secret_rotated_at?: string | null
  readonly secret_expires_at?: string | null
  readonly has_secret_hash?: boolean
}

export type ClientListResponse = {
  readonly clients: readonly AdminClient[]
}

export type ClientDetailResponse = {
  readonly client: AdminClient
}

export type ClientRegistrationsResponse = {
  readonly registrations: readonly AdminClient[]
}

export type ClientUpdatePayload = Partial<
  Pick<
    AdminClient,
    | 'display_name'
    | 'owner_email'
    | 'redirect_uris'
    | 'post_logout_redirect_uris'
    | 'backchannel_logout_uri'
  >
>

export type ClientCreatePayload = {
  readonly app_name: string
  readonly client_id: string
  readonly environment: 'development' | 'live'
  readonly client_type: 'public' | 'confidential'
  readonly app_base_url: string
  readonly callback_path: string
  readonly logout_path: string
  readonly owner_email: string
  readonly provisioning: 'jit' | 'scim'
}

export type ClientCreateResponse = {
  readonly registration: AdminClient
  readonly plaintext_secret?: string
  readonly client_secret?: string
  readonly secret?: string
}

export type ClientScopeSyncPayload = {
  readonly scopes: readonly string[]
}

export type ClientScopeSyncResponse = {
  readonly client: AdminClient
}

export type ClientLifecyclePayload = {
  readonly reason: string
}

export type ClientLifecycleResponse = {
  readonly registration: AdminClient
}

export type ClientSecretRotation = {
  readonly client_id: string
  readonly client_secret?: string
  readonly plaintext_secret?: string
  readonly secret?: string
  readonly secret_rotated_at?: string | null
  readonly secret_expires_at?: string | null
}

export type ClientSecretRotationResponse = {
  readonly rotation: ClientSecretRotation
}

export type ClientIntegrationContract = {
  readonly clientId?: string
  readonly displayName?: string
  readonly redirectUri?: string
  readonly backchannelLogoutUri?: string
  readonly authorizeUrl?: string
  readonly tokenUrl?: string
  readonly userinfoUrl?: string
  readonly issuer?: string
  readonly scopes?: readonly string[]
  readonly env?: readonly string[]
  readonly provisioningSteps?: readonly string[]
  readonly rolloutSteps?: readonly string[]
  readonly findings?: readonly string[]
}

export type ClientIntegrationContractResponse = {
  readonly contract: ClientIntegrationContract
}
