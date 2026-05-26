export type SsoUser = {
  readonly id: number
  readonly subject_id: string
  readonly email: string
  readonly display_name: string
  readonly roles: readonly string[]
}

export type SsoSessionResponse =
  | {
      readonly authenticated: true
      readonly user: SsoUser
    }
  | {
      readonly authenticated: false
      readonly user: null
    }

export type AdminAuthContext = {
  readonly auth_time: string | null
  readonly amr: readonly string[]
  readonly acr: string | null
  readonly mfa_enforced: boolean
  readonly mfa_verified: boolean
}

export type AdminPermissionMenu = {
  readonly id: string
  readonly label: string
  readonly required_permission: string
  readonly visible: boolean
}

export type AdminPermissionMatrix = {
  readonly view_admin_panel: boolean
  readonly manage_sessions: boolean
  readonly permissions: readonly string[]
  readonly capabilities: Readonly<Record<string, boolean>>
  readonly menus: readonly AdminPermissionMenu[]
}

export type AdminPrincipal = {
  readonly subject_id: string
  readonly email: string
  readonly display_name: string
  readonly role: string
  readonly last_login_at: string | null
  readonly auth_context: AdminAuthContext
  readonly permissions: AdminPermissionMatrix
}

export type AdminPrincipalResponse = {
  readonly principal: AdminPrincipal
}
