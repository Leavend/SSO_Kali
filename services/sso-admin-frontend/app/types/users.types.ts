// Safe, masked admin Users DTOs for the BFF endpoints under /api/admin/users.
// Every field is readonly. The government identifiers nik/nip/nisn/birth_date are
// the BACKEND-MASKED form (GovernmentIdentifier masking) or null — the raw values
// never cross the network boundary and must never enter the SSR payload.
export type UserAccountStatus = 'active' | 'locked' | 'disabled' | 'deactivated'

export const USER_ACCOUNT_STATUSES = ['active', 'locked', 'disabled', 'deactivated'] as const

export type UserRoleRef = {
  readonly slug: string
  readonly name: string
  readonly is_system: boolean
}

export type LoginContext = {
  readonly ip_address: string | null
  readonly mfa_required: boolean
  readonly last_seen_at: string | null
}

export type UserSession = {
  readonly id: string
  readonly ip_address?: string | null
  readonly user_agent?: string | null
  readonly last_seen_at?: string | null
  readonly created_at?: string | null
}

export type AdminUserSummary = {
  readonly id: number
  readonly subject_id: string
  readonly email: string
  readonly given_name: string | null
  readonly family_name: string | null
  readonly display_name: string | null
  readonly role: string | null
  readonly status: string | null
  readonly effective_status: UserAccountStatus
  readonly disabled_at: string | null
  readonly disabled_reason: string | null
  readonly locked_at: string | null
  readonly locked_until: string | null
  readonly locked_reason: string | null
  readonly locked_by_subject_id: string | null
  readonly lock_count: number
  readonly local_account_enabled: boolean
  readonly profile_synced_at: string | null
  readonly email_verified_at: string | null
  readonly last_login_at: string | null
  readonly created_at: string | null
  // MASKED identifiers (string) or null — never raw NIK/NIP/NISN/birth_date.
  readonly nik: string | null
  readonly nip: string | null
  readonly nisn: string | null
  readonly birth_date: string | null
  readonly mfa_enrolled: boolean
  readonly mfa_methods: readonly string[]
  readonly mfa_mandatory: boolean
  readonly roles: readonly UserRoleRef[]
}

export type AdminUserListItem = AdminUserSummary & {
  readonly login_context: LoginContext | null
}

export type AdminUserDetail = AdminUserSummary

export type UserRoleView = {
  readonly subject_id: string
  readonly email: string
  readonly display_name: string | null
  readonly role: string | null
  readonly status: string | null
  readonly roles: readonly UserRoleRef[]
}

export type UserListResponse = {
  readonly users: readonly AdminUserListItem[]
}

export type UserDetailResponse = {
  readonly user: AdminUserDetail
  readonly login_context: LoginContext | null
  readonly sessions: readonly UserSession[]
}

export type UserMutationResponse = {
  readonly user: AdminUserDetail
}

export type CreateUserResponse = {
  readonly user: AdminUserDetail
  readonly delivery_status: string
}

export type PasswordResetResponse = {
  readonly user: AdminUserDetail
  readonly password_reset: { readonly expires_at: string }
  readonly delivery_status: string
}

export type ResetMfaResponse = {
  readonly reset: boolean
  readonly message: string
  readonly reenrollment_required: boolean
}

export type UserRoleResponse = {
  readonly user: UserRoleView
}

export type CreateUserPayload = {
  readonly email: string
  readonly display_name: string
  readonly role: 'admin' | 'user' | 'pegawai'
  readonly given_name?: string
  readonly family_name?: string
  readonly password?: string
  readonly local_account_enabled?: boolean
  readonly nik?: string
  readonly nip?: string
  readonly nisn?: string
  readonly birth_date?: string
}

export type SyncProfilePayload = {
  readonly email?: string
  readonly display_name?: string
  readonly given_name?: string
  readonly family_name?: string
  readonly nik?: string
  readonly nip?: string
  readonly nisn?: string
  readonly birth_date?: string
}

export type LockPayload = {
  readonly reason: string
  readonly locked_until?: string
}

export type ReasonPayload = {
  readonly reason: string
}

export type AssignRolesPayload = {
  readonly role_slugs: readonly [string]
}

// GET /admin/api/roles — masked governance DTO (no token/secret/PII). Both
// `user_count` and `users_count` are returned by the backend (same value); the
// frontend treats them as interchangeable counters.
export type AdminRole = {
  readonly id: number
  readonly slug: string
  readonly name: string
  readonly description: string | null
  readonly is_system: boolean
  readonly permissions: readonly {
    readonly slug: string
    readonly name: string
    readonly category: string | null
  }[]
  readonly user_count: number
  readonly users_count: number
}

export type RolesResponse = { readonly roles: readonly AdminRole[] }
