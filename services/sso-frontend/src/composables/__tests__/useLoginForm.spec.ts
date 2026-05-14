import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useLoginForm } from '../useLoginForm'
import { useSessionStore } from '@/stores/session.store'
import { ApiError } from '@/lib/api/api-error'
import { setLocationPortForTest } from '@/lib/browser/location-port'
import type { SsoLoginResponse } from '@/types/auth.types'

const routerPushMock = vi.fn<(...args: unknown[]) => Promise<void>>()
const routeQuery: { redirect?: string; auth_request_id?: string } = {}
const windowAssignMock = vi.fn()

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerPushMock }),
  useRoute: () => ({ query: routeQuery }),
}))

describe('useLoginForm', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    routerPushMock.mockReset()
    routerPushMock.mockResolvedValue(undefined)
    windowAssignMock.mockReset()
    routeQuery.redirect = undefined
    routeQuery.auth_request_id = undefined

    setLocationPortForTest({ assign: windowAssignMock, origin: 'https://sso.test' })
  })

  afterEach(() => {
    setLocationPortForTest(null)
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('canSubmit stays false when form is empty', () => {
    const login = useLoginForm()
    expect(login.canSubmit.value).toBe(false)
  })

  it('canSubmit becomes true when both fields are filled', () => {
    const login = useLoginForm()
    login.form.identifier = 'user@example.com'
    login.form.password = 'secret'
    expect(login.canSubmit.value).toBe(true)
  })

  it('submit() calls session.login and redirects to /home on session response', async () => {
    const session = useSessionStore()
    const response: SsoLoginResponse = {
      authenticated: true,
      user: {
        id: 1,
        subject_id: 'sub',
        email: 'user@example.com',
        display_name: 'User',
        roles: ['user'],
      },
      session: { expires_at: '2099-12-31T00:00:00Z' },
      next: { type: 'session', auth_request_id: null },
    }
    const spy = vi.spyOn(session, 'login').mockResolvedValue(response)

    const login = useLoginForm()
    login.form.identifier = ' user@example.com '
    login.form.password = 'secret'

    await login.submit()

    expect(spy).toHaveBeenCalledWith({
      identifier: 'user@example.com',
      password: 'secret',
      auth_request_id: null,
    })
    expect(routerPushMock).toHaveBeenCalledWith('/home')
    expect(login.pending.value).toBe(false)
  })

  it('submit() honors ?redirect query when safe', async () => {
    routeQuery.redirect = '/apps'
    const session = useSessionStore()
    vi.spyOn(session, 'login').mockResolvedValue({
      authenticated: true,
      user: { id: 1, subject_id: 's', email: 'x', display_name: 'x', roles: [] },
      session: { expires_at: '2099-12-31T00:00:00Z' },
      next: { type: 'session', auth_request_id: null },
    })

    const login = useLoginForm()
    login.form.identifier = 'u'
    login.form.password = 'p'
    await login.submit()

    expect(routerPushMock).toHaveBeenCalledWith('/apps')
  })

  it('submit() ignores external redirect to prevent open redirect attack', async () => {
    routeQuery.redirect = '//evil.test/hack'
    const session = useSessionStore()
    vi.spyOn(session, 'login').mockResolvedValue({
      authenticated: true,
      user: { id: 1, subject_id: 's', email: 'x', display_name: 'x', roles: [] },
      session: { expires_at: '2099-12-31T00:00:00Z' },
      next: { type: 'session', auth_request_id: null },
    })

    const login = useLoginForm()
    login.form.identifier = 'u'
    login.form.password = 'p'
    await login.submit()

    expect(routerPushMock).toHaveBeenCalledWith('/home')
  })

  it('submit() continues to authorize when BE returns continue_authorize', async () => {
    const session = useSessionStore()
    vi.spyOn(session, 'login').mockResolvedValue({
      authenticated: true,
      user: { id: 1, subject_id: 's', email: 'x', display_name: 'x', roles: [] },
      session: { expires_at: '2099-12-31T00:00:00Z' },
      next: { type: 'continue_authorize', auth_request_id: 'auth-req-123' },
    })

    const login = useLoginForm()
    login.form.identifier = 'u'
    login.form.password = 'p'
    await login.submit()

    expect(windowAssignMock).toHaveBeenCalledWith(
      'https://sso.test/authorize?auth_request_id=auth-req-123',
    )
    expect(routerPushMock).not.toHaveBeenCalled()
  })

  it('submit() shows generic banner on authenticated=false (anti user-enumeration)', async () => {
    const session = useSessionStore()
    vi.spyOn(session, 'login').mockResolvedValue({
      authenticated: false,
      error: 'invalid_credentials',
      message: 'The email does not exist in our system', // malicious detail from BE
    })

    const login = useLoginForm()
    login.form.identifier = 'u'
    login.form.password = 'p'
    await login.submit()

    // UC-08 anti-enumeration: pesan generik, bukan raw BE
    expect(login.bannerError.value).toMatch(/email atau password/i)
  })

  it('submit() populates fieldErrors when BE returns 422 violations', async () => {
    const session = useSessionStore()
    vi.spyOn(session, 'login').mockRejectedValue(
      new ApiError(422, 'Data tidak valid.', null, [
        { field: 'identifier', message: 'Email wajib diisi.' },
        { field: 'password', message: 'Password wajib diisi.' },
      ]),
    )

    const login = useLoginForm()
    login.form.identifier = 'x'
    login.form.password = 'y'
    await login.submit()

    expect(login.fieldErrors.value).toEqual({
      identifier: 'Email wajib diisi.',
      password: 'Password wajib diisi.',
    })
  })

  it('submit() shows fallback message for unexpected errors', async () => {
    const session = useSessionStore()
    vi.spyOn(session, 'login').mockRejectedValue(new Error('boom'))

    const login = useLoginForm()
    login.form.identifier = 'x'
    login.form.password = 'y'
    await login.submit()

    expect(login.bannerError.value).toMatch(/Gagal memproses login/i)
  })

  it('submit() is a no-op when canSubmit is false', async () => {
    const session = useSessionStore()
    const spy = vi.spyOn(session, 'login').mockResolvedValue({
      authenticated: false,
      error: 'never',
      message: 'never',
    })

    const login = useLoginForm()
    await login.submit()

    expect(spy).not.toHaveBeenCalled()
  })
})
