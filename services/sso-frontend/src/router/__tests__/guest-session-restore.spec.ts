import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import router from '../index'
import { authApi } from '@/services/auth.api'

const realLocation = window.location

function stubLocationAssign(): ReturnType<typeof vi.fn> {
  const assign = vi.fn()
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...realLocation, assign },
  })
  return assign
}

function restoreLocation(): void {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: realLocation,
  })
}

describe('router guest session restore', () => {
  afterEach(() => {
    restoreLocation()
  })

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

  it('front-channels unauthenticated visitors to the IdP for silent SSO', async () => {
    setActivePinia(createPinia())
    vi.spyOn(authApi, 'getSession').mockRejectedValue(new Error('no session'))
    const assignSpy = stubLocationAssign()

    // Use a protected route distinct from any route a prior test may have
    // landed on, so the guard always runs (Vue Router skips same-route pushes).
    await router.push('/profile').catch(() => undefined)
    await router.isReady()

    expect(authApi.getSession).toHaveBeenCalled()
    expect(assignSpy).toHaveBeenCalledTimes(1)
    expect(assignSpy).toHaveBeenCalledWith('/auth/login?return_to=%2Fprofile')
    // The SPA navigation must be cancelled — the router never reaches the
    // protected destination.
    expect(router.currentRoute.value.name).not.toBe('portal.profile')
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
    // Install a stub (not a once-mock) so subsequent `.not.toHaveBeenCalled()`
    // assertions can see the spy. The previous test in this file cleared all
    // mocks; without this stub the global `vi.restoreAllMocks()` in afterEach
    // would have removed the spy entirely and `.not.toHaveBeenCalled()` would
    // throw "is not a spy or a call to a spy!".
    vi.spyOn(authApi, 'getSession').mockResolvedValue({
      authenticated: false,
      user: null,
    })
    vi.clearAllMocks()

    await router.push('/login?auth_request_id=test123&client=sso-admin-panel')
    await router.isReady()

    expect(authApi.getSession).not.toHaveBeenCalled()
    expect(router.currentRoute.value.name).toBe('auth.login')
    expect(router.currentRoute.value.query.auth_request_id).toBe('test123')
    expect(router.currentRoute.value.query.client).toBe('sso-admin-panel')
  })
})
