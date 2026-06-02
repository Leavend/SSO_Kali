import { describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import router from '../index'
import { authApi } from '@/services/auth.api'

describe('router guest session restore', () => {
  it('hydrates persistent SSO cookie on root route and redirects to portal home', async () => {
    setActivePinia(createPinia())
    vi.spyOn(authApi, 'getSession').mockResolvedValueOnce({
      authenticated: true,
      user: {
        id: 1,
        subject_id: 'user-uuid',
        email: 'user@example.com',
        display_name: 'User SSO',
        roles: ['user'],
      },
    })

    await router.push('/')
    await router.isReady()

    expect(authApi.getSession).toHaveBeenCalledTimes(1)
    expect(router.currentRoute.value.name).toBe('portal.home')
  })

  it('keeps unauthenticated visitors on login route', async () => {
    setActivePinia(createPinia())
    vi.spyOn(authApi, 'getSession').mockRejectedValueOnce(new Error('no session'))

    await router.push('/')
    await router.isReady()

    expect(authApi.getSession).toHaveBeenCalled()
    expect(router.currentRoute.value.name).toBe('auth.login')
  })

  it('keeps authenticated users on login route when auth_request_id is pending', async () => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.spyOn(authApi, 'getSession').mockResolvedValueOnce({
      authenticated: true,
      user: {
        id: 1,
        subject_id: 'user-uuid',
        email: 'user@example.com',
        display_name: 'User SSO',
        roles: ['user'],
      },
    })

    await router.push('/?auth_request_id=auth-req-admin')
    await router.isReady()

    expect(authApi.getSession).not.toHaveBeenCalled()
    expect(router.currentRoute.value.name).toBe('auth.login')
    expect(router.currentRoute.value.query.auth_request_id).toBe('auth-req-admin')
  })

  it('routes /login to the login page while preserving query parameters', async () => {
    setActivePinia(createPinia())
    vi.clearAllMocks()

    await router.push('/login?auth_request_id=test123&client=sso-admin-panel')
    await router.isReady()

    expect(authApi.getSession).not.toHaveBeenCalled()
    expect(router.currentRoute.value.name).toBe('auth.login')
    expect(router.currentRoute.value.query.auth_request_id).toBe('test123')
    expect(router.currentRoute.value.query.client).toBe('sso-admin-panel')
  })
})
