/**
 * Roles & Permissions domain types.
 * Contract: GET /admin/api/roles  GET /admin/api/permissions
 * FR-053 / UC-51, UC-56–UC-57, UC-73
 */

export type AdminRole = {
  readonly slug: string
  readonly label: string
  readonly name?: string
  readonly description?: string | null
  readonly is_system?: boolean
  readonly permissions: readonly string[]
  readonly user_count?: number | null
  readonly created_at?: string | null
  readonly updated_at?: string | null
}

export type AdminPermission = {
  readonly key: string
  readonly label?: string | null
  readonly group?: string | null
}

export type RolesListResponse = {
  readonly roles: readonly AdminRole[]
}

export type PermissionsListResponse = {
  readonly permissions: readonly AdminPermission[]
}

export type CreateRolePayload = {
  readonly slug: string
  readonly name: string
  readonly description?: string | null
  readonly permission_slugs?: readonly string[]
}

export type UpdateRolePayload = {
  readonly name?: string
  readonly description?: string | null
}
