import { describe, expect, it } from 'vitest'
import router from '../index'

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
})
