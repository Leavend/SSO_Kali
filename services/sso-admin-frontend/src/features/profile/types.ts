/**
 * Admin Profile domain types.
 * Contract: GET /admin/api/me  (principal bootstrap endpoint)
 * Permission: profile.read  (AdminPermission::PROFILE_READ)
 * FR: admin principal self-view
 */

export type AdminPrincipal = {
  readonly subject_id: string
  readonly email?: string | null
  readonly display_name?: string | null
  readonly given_name?: string | null
  readonly family_name?: string | null
  readonly role?: string | null
  readonly permissions?: readonly string[]
}

export type AdminProfileResponse = {
  readonly principal: AdminPrincipal
}
