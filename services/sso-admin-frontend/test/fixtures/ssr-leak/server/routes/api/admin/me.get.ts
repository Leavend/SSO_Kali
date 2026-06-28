import { defineEventHandler } from 'h3'

// More-specific route that overrides the base /api/admin/[...] proxy so the global
// admin guard + session store can resolve a principal WITHOUT a live backend. It
// returns a SAFE, masked principal for the sentinel admin: no tokens, no raw PII —
// only display fields, role, and capability flags cross to the client. Shape
// matches AdminPrincipalResponse ({ principal: AdminPrincipal }) consumed by the
// store. (The server-only tokens + raw PII live on event.context.session, injected
// by app/plugins/sentinel-session.server.ts during the page render; this fixture
// stub stands in for the backend's masked profile response.)
export default defineEventHandler(() => {
  return {
    principal: {
      subject_id: 'sub-admin-sentinel',
      email: 'admin@example.test',
      display_name: 'Admin Sentinel',
      given_name: null,
      family_name: null,
      role: 'admin',
      last_login_at: null,
      auth_context: {
        auth_time: null,
        amr: ['pwd'],
        acr: null,
        mfa_enforced: true,
        mfa_verified: true,
      },
      permissions: {
        view_admin_panel: true,
        manage_sessions: true,
        permissions: [
          'admin.dashboard.view',
          'admin.users.read',
          'admin.users.write',
          'admin.users.lock',
          'admin.roles.read',
          'admin.roles.write',
          'admin.clients.read',
          'admin.clients.write',
          'admin.sessions.terminate',
        ],
        capabilities: {
          'admin.dashboard.view': true,
          'admin.users.read': true,
          'admin.users.write': true,
          'admin.users.lock': true,
          'admin.roles.read': true,
          'admin.roles.write': true,
          'admin.clients.read': true,
          'admin.clients.write': true,
          'admin.sessions.terminate': true,
        },
        menus: [
          {
            id: 'dashboard',
            label: 'Dashboard',
            required_permission: 'admin.dashboard.view',
            visible: true,
          },
          {
            id: 'users',
            label: 'Users',
            required_permission: 'admin.users.read',
            visible: true,
          },
          {
            id: 'clients',
            label: 'Clients',
            required_permission: 'admin.clients.read',
            visible: true,
          },
        ],
      },
    },
  }
})
