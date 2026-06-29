// External identity provider DTOs — the EXACT backend shape from
// ExternalIdentityProviderRegistry::publicView() (18 fields). The response carries
// has_client_secret (a boolean), NEVER the secret value. client_id/issuer/endpoints
// are public OIDC config; no token/secret/gov-PII is serialized.
export type ExternalIdpHealthStatus = 'unknown' | 'healthy' | 'unhealthy'

export type ExternalIdentityProvider = {
  readonly provider_key: string
  readonly display_name: string
  readonly issuer: string
  readonly metadata_url: string
  readonly client_id: string
  readonly authorization_endpoint?: string | null
  readonly token_endpoint?: string | null
  readonly userinfo_endpoint?: string | null
  readonly jwks_uri?: string | null
  readonly allowed_algorithms?: readonly string[]
  readonly scopes?: readonly string[]
  readonly priority?: number
  readonly enabled?: boolean
  readonly is_backup?: boolean
  readonly tls_validation_enabled?: boolean
  readonly signature_validation_enabled?: boolean
  readonly has_client_secret?: boolean
  readonly health_status?: string | null
}

export type ExternalIdpListResponse = {
  readonly providers: readonly ExternalIdentityProvider[]
  readonly meta?: {
    readonly current_page?: number
    readonly per_page?: number
    readonly total?: number
  }
}

export type ExternalIdpDetailResponse = {
  readonly provider: ExternalIdentityProvider
}

// client_secret is WRITE-ONLY (sent on create/update when non-empty; never returned).
export type ExternalIdpCreatePayload = {
  readonly provider_key: string
  readonly display_name: string
  readonly issuer: string
  readonly metadata_url: string
  readonly client_id: string
  readonly client_secret?: string
  readonly allowed_algorithms?: readonly string[]
  readonly scopes?: readonly string[]
  readonly priority?: number
  readonly enabled?: boolean
  readonly is_backup?: boolean
}

export type ExternalIdpUpdatePayload = {
  readonly display_name?: string
  readonly metadata_url?: string
  readonly client_id?: string
  readonly client_secret?: string
  readonly allowed_algorithms?: readonly string[]
  readonly scopes?: readonly string[]
  readonly priority?: number
  readonly enabled?: boolean
  readonly is_backup?: boolean
  readonly tls_validation_enabled?: boolean
  readonly signature_validation_enabled?: boolean
}

export type ExternalIdpMappingPreview = {
  readonly mapped: Readonly<Record<string, unknown>> | null
  readonly errors: readonly string[]
  readonly warnings: readonly string[]
  readonly missing_email_strategy: string
  readonly safe_to_link: boolean
}

export type ExternalIdpMappingPreviewResponse = {
  readonly preview: ExternalIdpMappingPreview
}
