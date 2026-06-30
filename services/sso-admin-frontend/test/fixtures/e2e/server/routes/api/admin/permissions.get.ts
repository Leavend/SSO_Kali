// SSR token-leak fixture: the permission catalog so usePermissionCatalog's
// useAsyncData('admin-permissions') resolves deterministically and the role ×
// permission matrix renders its rows during the gate. Slugs/names/descriptions/
// categories only — no token, secret, session id, or PII-shaped digit run.
import { defineEventHandler } from 'h3'

export default defineEventHandler(() => ({
  permissions: [
    {
      slug: 'admin.users.read',
      name: 'View users',
      description: 'Read the user directory.',
      category: 'Users',
    },
    {
      slug: 'admin.users.write',
      name: 'Manage users',
      description: 'Create, edit, and lock users.',
      category: 'Users',
    },
    {
      slug: 'admin.roles.read',
      name: 'View roles',
      description: 'Read the role catalog.',
      category: 'Roles',
    },
  ],
}))
