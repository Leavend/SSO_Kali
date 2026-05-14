import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthRedirect } from '../useAuthRedirect'

const routerPushMock = vi.fn()
const windowAssignMock = vi.fn()

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerPushMock }),
}))

describe('useAuthRedirect', () => {
  beforeEach(() => {
    routerPushMock.mockReset()
    windowAssignMock.mockReset()
    vi.stubGlobal('location', { ...window.location, assign: windowAssignMock })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('toLogin() navigates to auth.login without redirect query', () => {
    const { toLogin } = useAuthRedirect()
    toLogin()
    expect(routerPushMock).toHaveBeenCalledWith({ name: 'auth.login', query: {} })
  })

  it('toLogin(path) navigates to auth.login with redirect query', () => {
    const { toLogin } = useAuthRedirect()
    toLogin('/profile')
    expect(routerPushMock).toHaveBeenCalledWith({ name: 'auth.login', query: { redirect: '/profile' } })
  })

  it('toHome() navigates to home route', () => {
    const { toHome } = useAuthRedirect()
    toHome()
    expect(routerPushMock).toHaveBeenCalledWith({ name: 'home' })
  })

  it('reloadTo() calls window.location.assign', () => {
    const { reloadTo } = useAuthRedirect()
    reloadTo('/authorize?id=abc')
    expect(windowAssignMock).toHaveBeenCalledWith('/authorize?id=abc')
  })
})
