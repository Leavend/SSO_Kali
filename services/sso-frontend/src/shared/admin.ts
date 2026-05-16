export type AdminMenuItem = {
  readonly id: string
  readonly label: string
  readonly required_permission: string
  readonly visible: boolean
}

export type AdminPermissions = {
  readonly view_admin_panel: boolean
  readonly manage_sessions: boolean
  readonly permissions?: readonly string[]
  readonly capabilities?: Readonly<Record<string, boolean>>
  readonly menus?: readonly AdminMenuItem[]
}

export type AdminAuthContext = {
  readonly auth_time: number | null
  readonly amr: readonly string[]
  readonly acr: string | null
}

export type AdminPrincipal = {
  readonly subject_id: string
  readonly email: string
  readonly display_name: string
  readonly role: string
  readonly last_login_at: string | null
  readonly auth_context: AdminAuthContext
  readonly permissions: AdminPermissions
}

export type ApiUser = {
  readonly id: number
  readonly subject_id: string
  readonly email: string
  readonly display_name: string
  readonly role: string
  readonly status?: string
  readonly given_name?: string | null
  readonly family_name?: string | null
  readonly disabled_at?: string | null
  readonly disabled_reason?: string | null
  readonly locked_at?: string | null
  readonly locked_until?: string | null
  readonly locked_reason?: string | null
  readonly lock_count?: number
  readonly local_account_enabled?: boolean
  readonly email_verified_at?: string | null
  readonly last_login_at: string | null
  readonly created_at: string
  readonly login_context: {
    readonly ip_address: string | null
    readonly risk_score: number
    readonly mfa_required: boolean
    readonly last_seen_at: string | null
  } | null
}

export type ApiSession = {
  readonly session_id: string
  readonly client_id: string
  readonly subject_id: string
  readonly email: string
  readonly display_name: string
  readonly scope: string
  readonly created_at: string
  readonly expires_at: string
}

export type ApiClient = {
  readonly client_id: string
  readonly type: string
  readonly redirect_uris: readonly string[]
  readonly backchannel_logout_uri: string | null
  readonly backchannel_logout_internal: boolean
}

export type AdminSessionView = {
  readonly subject: string
  readonly email: string
  readonly displayName: string
  readonly role: string
  readonly expiresAt: number
  readonly authTime: number | null
  readonly amr: readonly string[]
  readonly acr: string | null
  readonly lastLoginAt: string | null
  readonly permissions: AdminPermissions
}

export type AdminDashboardPayload = {
  readonly principal: AdminSessionView
  readonly users: readonly ApiUser[]
  readonly sessions: readonly ApiSession[]
  readonly clients: readonly ApiClient[]
}
