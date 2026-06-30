// SSR token-leak fixture: a representative masked role list so the §3.3 gate
// renders the Roles page in its READY state (a system role + a custom role) and the
// existing payload collectors also cover the AdminRole DTO. Slugs/names/descriptions
// + small counts only — no token, secret, session id, or PII-shaped digit run (a
// more specific route wins over the layer's catch-all server/routes/api/admin/[...].ts).
import { defineEventHandler } from 'h3'

export default defineEventHandler(() => ({
  roles: [
    {
      id: 1,
      slug: 'admin',
      name: 'Administrator',
      description: 'Built-in role with full administrative access.',
      is_system: true,
      permissions: [
        { slug: 'admin.users.read', name: 'View users', category: 'Users' },
        { slug: 'admin.users.write', name: 'Manage users', category: 'Users' },
        { slug: 'admin.roles.read', name: 'View roles', category: 'Roles' },
      ],
      user_count: 3,
      users_count: 3,
    },
    {
      id: 2,
      slug: 'content-editor',
      name: 'Content Editor',
      description: 'Custom role for content and user management.',
      is_system: false,
      permissions: [{ slug: 'admin.users.read', name: 'View users', category: 'Users' }],
      user_count: 7,
      users_count: 7,
    },
  ],
}))
