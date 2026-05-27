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
  readonly active: Readonly<Record<string, unknown>>
  readonly policies: readonly SecurityPolicy[]
}

export type SecurityPolicyMutationPayload = {
  readonly payload: Readonly<Record<string, unknown>>
  readonly reason?: string
}

export type SecurityPolicyTransitionPayload = {
  readonly reason?: string
  readonly effective_at?: string
}

export type AdminPermission = {
  readonly slug: string
  readonly name?: string | null
  readonly description?: string | null
  readonly category?: string | null
}

export type AdminRole = {
  readonly id: number
  readonly slug: string
  readonly name: string
  readonly description?: string | null
  readonly is_system?: boolean
  readonly users_count?: number
  readonly permissions: readonly AdminPermission[]
}

export type RolePayload = {
  readonly slug?: string
  readonly name?: string
  readonly description?: string | null
  readonly permission_slugs?: readonly string[]
}
