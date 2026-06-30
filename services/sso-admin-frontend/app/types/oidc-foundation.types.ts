
export type OidcAvailabilityStatus = 'healthy' | 'degraded' | 'unavailable' | 'unknown'
// 'recorded' is the value the backend currently emits for jwks_rotation.status;
// 'available' is the forward-looking healthy value. Both are positive evidence.
export type OidcEvidenceStatus = 'available' | 'recorded' | 'missing' | 'failed' | 'stale'
export type OidcConsistencyStatus = 'pass' | 'warning' | 'mismatch' | 'unknown'
export type ScopeLabelStatus = 'mapped' | 'missing_label' | 'unknown_custom' | 'deprecated'

export type OidcDiscoveryMetadata = {
  readonly issuer: string
  readonly authorization_endpoint: string
  readonly token_endpoint: string
  readonly jwks_uri: string
  readonly userinfo_endpoint: string
  readonly response_types_supported: readonly string[]
  readonly grant_types_supported: readonly string[]
  readonly scopes_supported: readonly string[]
  readonly claims_supported: readonly string[]
  readonly id_token_signing_alg_values_supported: readonly string[]
}

export type OidcJwksKey = {
  readonly kid: string
  readonly alg: string
  readonly use: string
  readonly status: string
  readonly published_at: string | null
  readonly rotated_at: string | null
}

export type OidcEndpointAvailability = {
  readonly name: string
  readonly status: OidcAvailabilityStatus
  readonly http_status: number | null
  readonly latency_ms: number | null
  readonly last_checked_at: string | null
  readonly evidence_ref: string | null
}

export type OidcRotationEvidence = {
  readonly status: OidcEvidenceStatus
  readonly label: string
  readonly environment: string | null
  readonly latest_drill_at: string | null
  readonly operator_signoff: string | null
  readonly evidence_ref: string | null
}

export type OidcAvailabilityEvidence = {
  readonly status: OidcEvidenceStatus
  readonly label: string
  readonly checked_at: string | null
  readonly evidence_ref: string | null
}

export type OidcScopeCatalogItem = {
  readonly name: string
  readonly label: string
  readonly description: string
  readonly label_status: ScopeLabelStatus
}

export type OidcClaimCatalogItem = {
  readonly name: string
  readonly scope_dependency: string | null
  readonly sensitivity: string
}

export type OidcAlgorithmCatalogItem = {
  readonly name: string
  readonly usage: string
  readonly status: string
}

export type OidcIssuerConsistency = {
  readonly status: OidcConsistencyStatus
  readonly configured_issuer: string
  readonly discovery_issuer: string
  readonly public_base_url: string
  readonly last_checked_at: string
}

export type OidcEndpointConsistency = {
  readonly name: string
  readonly discovered_url: string
  readonly expected_url: string
  readonly status: 'pass' | 'mismatch'
}

export type OidcFoundationSnapshot = {
  readonly checked_at: string
  readonly correlation_id: string | null
  readonly discovery: OidcDiscoveryMetadata
  readonly jwks: { readonly keys: readonly OidcJwksKey[] }
  readonly availability: {
    readonly discovery: OidcEndpointAvailability
    readonly jwks: OidcEndpointAvailability
  }
  readonly evidence: {
    readonly jwks_rotation: OidcRotationEvidence
    readonly availability_timeline: readonly OidcAvailabilityEvidence[]
  }
  readonly catalog: {
    readonly scopes: readonly OidcScopeCatalogItem[]
    readonly claims: readonly OidcClaimCatalogItem[]
    readonly algorithms: readonly OidcAlgorithmCatalogItem[]
  }
  readonly issuer_consistency: OidcIssuerConsistency
  readonly endpoint_consistency: readonly OidcEndpointConsistency[]
}
