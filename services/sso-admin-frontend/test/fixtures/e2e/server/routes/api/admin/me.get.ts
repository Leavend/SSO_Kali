import { defineEventHandler, getCookie } from 'h3'

// e2e principal route — overrides the app's /api/admin/[...] proxy so SSR resolves
// an admin principal with NO backend. Permissions come from the `e2e_perms` cookie
// (comma-separated slugs) the spec sets; absent → the FULL admin set so an
// unscoped spec still renders every affordance. Menus mirror the layout's
// MENU_ROUTE_MAP (app/layouts/admin.vue) so the sidebar nav is complete.
const ALL_PERMISSIONS = [
  'admin.dashboard.view',
  'admin.users.read',
  'admin.users.write',
  'admin.users.lock',
  'admin.roles.read',
  'admin.roles.write',
  'admin.clients.read',
  'admin.clients.write',
  'admin.external-idps.read',
  'admin.external-idps.write',
  'admin.ip-access.read',
  'admin.ip-access.write',
  'admin.sessions.terminate',
  'admin.observability.read',
  'admin.security-policy.read',
  'admin.security-policy.write',
  'admin.security-policy.activate',
  'admin.authentication-audit.read',
  'admin.sso-error-templates.write',
  'admin.audit.export',
  'admin.dsr.review',
  'profile.read',
] as const

const MENUS = [
  { id: 'dashboard', label: 'Dashboard', required_permission: 'admin.dashboard.view' },
  { id: 'oidc-foundation', label: 'OIDC Foundation', required_permission: 'admin.dashboard.view' },
  { id: 'users', label: 'Users', required_permission: 'admin.users.read' },
  { id: 'clients', label: 'Clients', required_permission: 'admin.clients.read' },
  { id: 'roles', label: 'Roles', required_permission: 'admin.roles.read' },
  { id: 'sessions', label: 'Sessions', required_permission: 'admin.sessions.terminate' },
  { id: 'policy', label: 'Security Policy', required_permission: 'admin.security-policy.read' },
  { id: 'external-idps', label: 'External IdPs', required_permission: 'admin.external-idps.read' },
  { id: 'ops', label: 'Ops', required_permission: 'admin.dashboard.view' },
  { id: 'ip-access', label: 'IP Access', required_permission: 'admin.ip-access.read' },
  { id: 'audit', label: 'Observability', required_permission: 'admin.observability.read' },
  {
    id: 'authentication-audit',
    label: 'Authentication Audit',
    required_permission: 'admin.authentication-audit.read',
  },
  {
    id: 'sso-error-templates',
    label: 'SSO Error Templates',
    required_permission: 'admin.security-policy.read',
  },
  { id: 'profile', label: 'Profile', required_permission: 'profile.read' },
] as const

export default defineEventHandler((event) => {
  const cookie = getCookie(event, 'e2e_perms')
  const permissions =
    cookie && cookie.length > 0
      ? cookie.split(',').map((p) => p.trim()).filter(Boolean)
      : [...ALL_PERMISSIONS]
  const capabilities = Object.fromEntries(permissions.map((p) => [p, true]))

  return {
    principal: {
      subject_id: 'sub-e2e-admin',
      email: 'admin@dev-sso.local',
      display_name: 'Admin User',
      given_name: 'Admin',
      family_name: 'User',
      role: 'admin',
      last_login_at: null,
      auth_context: {
        auth_time: null,
        amr: ['pwd', 'mfa'],
        acr: 'urn:example:loa:2',
        mfa_enforced: true,
        mfa_verified: true,
      },
      permissions: {
        view_admin_panel: true,
        manage_sessions: permissions.includes('admin.sessions.terminate'),
        permissions,
        capabilities,
        menus: MENUS.map((menu) => ({ ...menu, visible: permissions.includes(menu.required_permission) })),
      },
    },
  }
})
