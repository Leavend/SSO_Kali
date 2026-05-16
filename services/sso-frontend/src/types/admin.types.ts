export type AdminPermissionSlug =
  | 'admin.panel.view'
  | 'admin.dashboard.view'
  | 'admin.users.read'
  | 'admin.users.write'
  | 'admin.users.lock'
  | 'admin.clients.read'
  | 'admin.clients.write'
  | 'admin.sessions.read'
  | 'admin.sessions.terminate'
  | 'admin.audit.read'
  | 'admin.audit.export'
  | 'admin.authentication-audit.read'
  | 'admin.dsr.read'
  | 'admin.dsr.review'
  | 'admin.security-policy.read'
  | 'admin.security-policy.write'
  | 'admin.security-policy.activate'
  | string

export type AdminCapabilityMap = Readonly<Record<AdminPermissionSlug, boolean>>

export type AdminUserAction = 'deactivate' | 'reactivate' | 'lock' | 'unlock' | 'password-reset'

export type AdminPrincipal = {
  readonly subject_id: string
  readonly email: string
  readonly display_name: string
  readonly role: string
  readonly last_login_at: string | null
  readonly permissions: {
    readonly view_admin_panel: boolean
    readonly manage_sessions: boolean
    readonly permissions?: readonly string[]
    readonly capabilities?: AdminCapabilityMap
  }
}

export type AdminDashboardSummary = {
  readonly generated_at: string
  readonly counters: {
    readonly users: Record<'total' | 'active' | 'disabled' | 'locked', number>
    readonly sessions: Record<'portal_active' | 'rp_active', number>
    readonly clients: Record<'total' | 'active' | 'staged' | 'decommissioned', number>
    readonly audit: Record<'admin_last_24h' | 'auth_last_24h', number>
    readonly incidents: Record<'admin_denied_last_24h', number>
    readonly data_subject_requests: Record<
      'submitted' | 'approved' | 'rejected' | 'fulfilled',
      number
    >
  }
}

export type AdminUser = {
  readonly id: number
  readonly subject_id: string
  readonly email: string
  readonly display_name: string
  readonly given_name: string | null
  readonly family_name: string | null
  readonly role: string
  readonly status: string
  readonly disabled_at: string | null
  readonly disabled_reason: string | null
  readonly locked_at: string | null
  readonly locked_until: string | null
  readonly locked_reason: string | null
  readonly lock_count: number
  readonly local_account_enabled: boolean
  readonly email_verified_at: string | null
  readonly last_login_at: string | null
  readonly created_at: string
  readonly login_context?: {
    readonly ip_address: string | null
    readonly risk_score: number
    readonly mfa_required: boolean
    readonly last_seen_at: string | null
  } | null
}

export type AdminUserDraft = {
  readonly email: string
  readonly display_name: string
  readonly given_name: string
  readonly family_name: string
  readonly role: string
  readonly password: string
  readonly local_account_enabled: boolean
}

export type AdminUserProfilePatch = {
  readonly email: string
  readonly display_name: string
  readonly given_name: string
  readonly family_name: string
}

export type AdminPasswordReset = {
  readonly token: string
  readonly expires_at: string
}

export type AdminAuditEvent = {
  readonly event_id: string
  readonly action: string
  readonly outcome: 'succeeded' | 'denied' | 'failed'
  readonly taxonomy: string
  readonly actor: {
    readonly subject_id: string
    readonly email: string
    readonly role: string
  }
  readonly request: {
    readonly method: string
    readonly path: string
    readonly ip_address: string | null
  }
  readonly reason: string | null
  readonly hash_chain: {
    readonly previous_hash: string | null
    readonly event_hash: string
  }
  readonly occurred_at: string | null
}

export type AdminAuditFilters = {
  readonly action?: string
  readonly outcome?: string
  readonly taxonomy?: string
  readonly admin_subject_id?: string
  readonly from?: string
  readonly to?: string
  readonly cursor?: string
  readonly limit?: number
}

export type AdminAuditPagination = {
  readonly per_page: number
  readonly next_cursor: string | null
  readonly previous_cursor: string | null
  readonly has_more: boolean
}

export type AdminAuditIntegrity = {
  readonly valid: boolean
  readonly checked_events: number
  readonly first_event_id: string | null
  readonly last_event_id: string | null
  readonly last_event_hash: string | null
  readonly broken_event_id: string | null
}
