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

export type ClientCreatePayload = Pick<AdminClient, 'client_id' | 'redirect_uris'> &
  Partial<
    Pick<
      AdminClient,
      | 'display_name'
      | 'owner_email'
      | 'type'
      | 'environment'
      | 'app_base_url'
      | 'post_logout_redirect_uris'
      | 'allowed_scopes'
    >
  >

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
