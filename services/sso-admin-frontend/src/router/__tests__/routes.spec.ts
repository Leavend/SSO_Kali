import { describe, expect, it } from 'vitest'
import router, { preloadInitialAdminRoute } from '../index'
import AdminShellLayout from '@/layouts/AdminShellLayout.vue'

describe('admin routes', () => {
  it('registers the dashboard route behind dashboard permission', () => {
    const route = router.getRoutes().find((entry) => entry.name === 'admin.dashboard')

    expect(route?.path).toBe('/dashboard')
    expect(route?.meta).toMatchObject({
      requiresAdmin: true,
      permissions: ['admin.dashboard.view'],
    })
  })

  it('registers the OIDC Foundation route behind dashboard permission', () => {
    const route = router.getRoutes().find((entry) => entry.name === 'admin.oidc-foundation')

    expect(route?.path).toBe('/oidc-foundation')
    expect(route?.meta).toMatchObject({
      requiresAdmin: true,
      permissions: ['admin.dashboard.view'],
    })
  })

  it('registers the SSO error templates route behind security policy read permission', () => {
    const route = router.getRoutes().find((entry) => entry.name === 'admin.sso-error-templates')

    expect(route?.path).toBe('/sso-error-templates')
    expect(route?.meta).toMatchObject({
      requiresAdmin: true,
      permissions: ['admin.security-policy.read'],
    })
  })

  it('registers the client create route behind clients write permission', () => {
    const route = router.getRoutes().find((entry) => entry.name === 'admin.clients.create')

    expect(route?.path).toBe('/clients/new')
    expect(route?.meta).toMatchObject({
      requiresAdmin: true,
      permissions: ['admin.clients.write'],
    })
  })

  it('registers the user create route behind users write permission', () => {
    const route = router.getRoutes().find((entry) => entry.name === 'admin.users.create')

    expect(route?.path).toBe('/users/new')
    expect(route?.meta).toMatchObject({
      requiresAdmin: true,
      permissions: ['admin.users.write'],
    })
  })

  it('keeps every requiresAdmin route under the admin shell enforcement layout', () => {
    const protectedRoutes = router.getRoutes().filter((route) => route.meta.requiresAdmin === true)

    expect(protectedRoutes.length).toBeGreaterThan(0)

    for (const protectedRoute of protectedRoutes) {
      const resolvedRoute = router.resolve(protectedRoute.path)
      expect(
        resolvedRoute.matched.some((match) => match.components?.default === AdminShellLayout),
      ).toBe(true)
    }
  })

  it('preloads the initial route from the registered route component instead of a parallel map', async () => {
    const clientsCreateRoute = router.resolve('/clients/new')
    const registeredComponent =
      clientsCreateRoute.matched[clientsCreateRoute.matched.length - 1]?.components?.default

    const [preloadedModule, registeredModule] = await Promise.all([
      preloadInitialAdminRoute('/clients/new'),
      (registeredComponent as () => Promise<unknown>)(),
    ])

    expect(preloadedModule).toStrictEqual(registeredModule)
  })
})
