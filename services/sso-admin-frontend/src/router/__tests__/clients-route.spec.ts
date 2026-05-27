import { describe, expect, it } from 'vitest'
import router from '../index'

describe('clients route', () => {
  it('registers the OAuth client console behind admin client read permission', () => {
    const route = router.getRoutes().find((route) => route.name === 'admin.clients')

    expect(route?.path).toBe('/clients')
    expect(route?.meta).toMatchObject({ requiresAdmin: true, permissions: ['admin.clients.read'] })
  })
})
