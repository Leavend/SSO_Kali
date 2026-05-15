import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import router from '../index'
import { authApi } from '@/services/auth.api'

describe('admin client-management routes', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    if (router.currentRoute.value.fullPath !== '/') await router.push('/')
  })

  it('documents the routed admin client-management UI location', () => {
    expect(router.resolve('/admin/clients').name).toBe('admin.clients')
  })

  it('allows admins to open client management', async () => {
    vi.spyOn(authApi, 'getSession').mockResolvedValueOnce({
      authenticated: true,
      user: {
        id: 1,
        subject_id: 'admin-uuid',
        email: 'admin@example.com',
        display_name: 'Admin SSO',
        roles: ['admin'],
      },
    })

    await router.push('/admin/clients')
    await router.isReady()

    expect(router.currentRoute.value.name).toBe('admin.clients')
  })

  it('denies non-admin users', async () => {
    vi.spyOn(authApi, 'getSession').mockResolvedValueOnce({
      authenticated: true,
      user: {
        id: 2,
        subject_id: 'user-uuid',
        email: 'user@example.com',
        display_name: 'User SSO',
        roles: ['user'],
      },
    })

    await router.push('/admin/clients')
    await router.isReady()

    expect(router.currentRoute.value.name).toBe('portal.home')
  })
})
