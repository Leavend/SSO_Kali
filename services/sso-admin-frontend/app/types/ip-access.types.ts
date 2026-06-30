// IP access rule DTO — the EXACT backend shape (IpAccessRule model / API resource,
// 8 fields). No token, secret, session id, or gov-PII is serialized; cidr/reason/
// actor_subject_id are operational config + an opaque admin subject id.
export type IpAccessMode = 'allow' | 'block'

export type IpAccessRule = {
  readonly id: number
  readonly cidr: string
  readonly mode: IpAccessMode
  readonly reason: string | null
  readonly expires_at: string | null
  readonly actor_subject_id: string | null
  readonly created_at: string | null
  readonly updated_at: string | null
}

export type IpAccessListResponse = {
  readonly rules: readonly IpAccessRule[]
}

export type IpAccessRuleResponse = {
  readonly rule: IpAccessRule
}

// Create payload — reason is REQUIRED by StoreIpAccessRuleRequest; expires_at is
// omitted entirely when the operator leaves it blank (backend rule is nullable).
export type IpAccessRuleCreatePayload = {
  readonly cidr: string
  readonly mode: IpAccessMode
  readonly reason: string
  readonly expires_at?: string
}
