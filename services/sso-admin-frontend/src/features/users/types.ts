export type AdminUser = {
  readonly id?: number
  readonly subject_id: string
  readonly email: string
  readonly given_name?: string | null
  readonly family_name?: string | null
  readonly display_name?: string | null
  readonly role?: string | null
  readonly roles?: readonly {
    readonly slug: string
    readonly name: string
    readonly is_system: boolean
  }[]
  readonly status?: string | null
  readonly effective_status?: 'active' | 'locked' | 'disabled' | 'deactivated' | null
  readonly disabled_at?: string | null
  readonly disabled_reason?: string | null
  readonly locked_at?: string | null
  readonly locked_until?: string | null
  readonly locked_reason?: string | null
  readonly lock_count?: number | null
  readonly local_account_enabled?: boolean
  readonly profile_synced_at?: string | null
  readonly email_verified_at?: string | null
  readonly last_login_at?: string | null
  readonly created_at?: string | null
}

export type AdminUserSession = {
  readonly id?: string
  readonly session_id?: string
  readonly client_id?: string | null
  readonly ip_address?: string | null
  readonly user_agent?: string | null
  readonly created_at?: string | null
  readonly last_activity_at?: string | null
}

export type AdminUserLoginContext = {
  readonly ip_address?: string | null
  readonly mfa_required?: boolean
  readonly last_seen_at?: string | null
}

export type UserListResponse = {
  readonly users: readonly AdminUser[]
}

export type UserDetailResponse = {
  readonly user: AdminUser
  readonly login_context?: AdminUserLoginContext | null
  readonly sessions?: readonly AdminUserSession[]
}

export type CreateUserPayload = {
  readonly email: string
  readonly display_name: string
  readonly given_name?: string
  readonly family_name?: string
  readonly role: 'admin' | 'user'
  readonly password?: string
  readonly local_account_enabled?: boolean
}

export type CreateUserResponse = {
  readonly user: AdminUser
  readonly delivery_status?: 'none' | 'queued' | 'failed'
}

export type UserMutationResponse = {
  readonly user?: AdminUser
  readonly audit_event_id?: string | null
  readonly delivery_status?: 'none' | 'queued' | 'failed'
  readonly password_reset?: {
    readonly token?: string
    readonly expires_at?: string | null
  }
  readonly reset?: boolean
  readonly message?: string
  readonly reenrollment_required?: boolean
}

export type UserReasonPayload = {
  readonly reason?: string
}

export type UserLockPayload = UserReasonPayload & {
  readonly locked_until?: string | null
}

export type SyncProfilePayload = {
  readonly email?: string
  readonly display_name?: string
  readonly given_name?: string
  readonly family_name?: string
}
