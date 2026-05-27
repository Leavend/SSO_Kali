import { describe, expect, it } from 'vitest'
import router from '../index'

describe('users route', () => {
  it('registers the user lifecycle console behind admin user read permission', () => {
    const route = router.getRoutes().find((route) => route.name === 'admin.users')

    expect(route?.path).toBe('/users')
    expect(route?.meta).toMatchObject({ requiresAdmin: true, permissions: ['admin.users.read'] })
  })
})
