// Security-policy DTOs. The backend serializes via SecurityPolicyService::present()
// (no API Resource). `payload` is non-secret admin-authored config (the backend
// never writes a secret into it); `actor_subject_id` is the acting admin's opaque
// OIDC subject id (ULID — not gov-PII); `reason` is free-text audit justification.
export type SecurityPolicyCategory = 'password' | 'mfa' | 'session' | 'lockout' | 'legal_hold'

export type SecurityPolicyStatus = 'draft' | 'active' | 'superseded' | 'rolled_back'

export type SecurityPolicy = {
  readonly id: number
  readonly category: string
  readonly version: number
  readonly status: string
  readonly payload: Readonly<Record<string, unknown>>
  readonly effective_at?: string | null
  readonly activated_at?: string | null
  readonly superseded_at?: string | null
  readonly actor_subject_id?: string | null
  readonly reason?: string | null
  readonly created_at: string
  readonly updated_at: string
}

export type SecurityPolicyListResponse = {
  readonly category: string
  // The active policy's payload object, or `[]` (empty array) when none is active —
  // the backend returns a PHP empty array, which serializes as JSON `[]`, not `{}`.
  readonly active: Readonly<Record<string, unknown>> | readonly unknown[]
  readonly policies: readonly SecurityPolicy[]
}

export type ProposePolicyPayload = {
  readonly payload: Readonly<Record<string, unknown>>
  readonly reason?: string
}

export type PolicyTransitionPayload = {
  readonly reason?: string
  readonly effective_at?: string
}

export type PolicyMutationResponse = {
  readonly policy: SecurityPolicy
}
