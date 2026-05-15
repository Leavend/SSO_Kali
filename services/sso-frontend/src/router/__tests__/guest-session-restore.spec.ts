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
})
