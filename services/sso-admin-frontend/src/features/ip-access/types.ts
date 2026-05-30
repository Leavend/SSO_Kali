export type IpAccessRule = {
  readonly id: number
  readonly cidr: string
  readonly mode: 'allow' | 'block'
  readonly reason: string | null
  readonly expires_at: string | null
  readonly actor_subject_id: string | null
  readonly created_at: string | null
  readonly updated_at: string | null
}

export type IpAccessRuleCreatePayload = {
  readonly cidr: string
  readonly mode: 'allow' | 'block'
  readonly reason: string
  readonly expires_at?: string | null
}
