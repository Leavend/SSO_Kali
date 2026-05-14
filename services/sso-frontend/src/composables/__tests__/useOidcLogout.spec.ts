import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useOidcLogout } from '../useOidcLogout'
import { setLocationPortForTest } from '@/lib/browser/location-port'
import { useSessionStore } from '@/stores/session.store'

const windowAssignMock = vi.fn()

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

class MockBroadcastChannel {
  name: string
  onmessage: ((event: MessageEvent) => void) | null = null
  private listeners: Array<(event: MessageEvent) => void> = []
  static lastInstance: MockBroadcastChannel | null = null
  static lastMessage: unknown = null

  constructor(name: string) {
    this.name = name
    MockBroadcastChannel.lastInstance = this
  }
  postMessage(data: unknown): void {
    MockBroadcastChannel.lastMessage = data
  }
  addEventListener(_type: string, fn: (event: MessageEvent) => void): void {
    this.listeners.push(fn)
  }
  removeEventListener(_type: string, fn: (event: MessageEvent) => void): void {
    this.listeners = this.listeners.filter((l) => l !== fn)
  }
  close(): void { /* no-op */ }
  simulateMessage(data: unknown): void {
    const event = { data } as MessageEvent
    this.listeners.forEach((fn) => fn(event))
  }
}

describe('useOidcLogout', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    windowAssignMock.mockReset()
    setLocationPortForTest({ assign: windowAssignMock, origin: 'https://sso.test' })
    vi.stubGlobal('BroadcastChannel', MockBroadcastChannel)
    vi.stubEnv('VITE_OIDC_ISSUER', 'https://sso.example.com')
    vi.stubEnv('VITE_OIDC_CLIENT_ID', 'portal-client')
    MockBroadcastChannel.lastMessage = null
    MockBroadcastChannel.lastInstance = null
  })

  afterEach(() => {
    setLocationPortForTest(null)
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('logout() clears session and redirects to end_session_endpoint', async () => {
    const session = useSessionStore()
    vi.spyOn(session, 'logout').mockResolvedValue()

    const { logout } = useOidcLogout()
    await logout()

    expect(session.logout).toHaveBeenCalled()
    expect(windowAssignMock).toHaveBeenCalledTimes(1)

    const url = new URL(windowAssignMock.mock.calls[0]![0] as string)
    expect(url.origin + url.pathname).toBe('https://sso.example.com/connect/logout')
    expect(url.searchParams.get('client_id')).toBe('portal-client')
    expect(url.searchParams.get('post_logout_redirect_uri')).toBe('http://localhost:3000/')
  })

  it('logout() includes id_token_hint when set', async () => {
    const session = useSessionStore()
    vi.spyOn(session, 'logout').mockResolvedValue()

    const { setIdTokenHint, logout } = useOidcLogout()
    setIdTokenHint('eyJhbGciOiJSUzI1NiJ9.test-token')
    await logout()

    const url = new URL(windowAssignMock.mock.calls[0]![0] as string)
    expect(url.searchParams.get('id_token_hint')).toBe('eyJhbGciOiJSUzI1NiJ9.test-token')
  })

  it('logout() omits id_token_hint when not set', async () => {
    const session = useSessionStore()
    vi.spyOn(session, 'logout').mockResolvedValue()

    const { logout } = useOidcLogout()
    await logout()

    const url = new URL(windowAssignMock.mock.calls[0]![0] as string)
    expect(url.searchParams.has('id_token_hint')).toBe(false)
  })

  it('logout() clears id_token_hint after use', async () => {
    const session = useSessionStore()
    vi.spyOn(session, 'logout').mockResolvedValue()

    const { setIdTokenHint, logout } = useOidcLogout()
    setIdTokenHint('token-1')
    await logout()

    // Second logout should not have hint
    windowAssignMock.mockReset()
    await logout()
    const url = new URL(windowAssignMock.mock.calls[0]![0] as string)
    expect(url.searchParams.has('id_token_hint')).toBe(false)
  })

  it('logout() broadcasts logout event to other tabs', async () => {
    const session = useSessionStore()
    vi.spyOn(session, 'logout').mockResolvedValue()

    const { logout } = useOidcLogout()
    await logout()

    expect(MockBroadcastChannel.lastMessage).toEqual({ type: 'logout' })
  })

  it('logout() still redirects even if server logout fails', async () => {
    const session = useSessionStore()
    vi.spyOn(session, 'logout').mockRejectedValue(new Error('network'))

    const { logout } = useOidcLogout()
    await logout()

    expect(windowAssignMock).toHaveBeenCalledTimes(1)
  })

  it('listenForLogoutBroadcast calls onLogout when broadcast received', () => {
    const session = useSessionStore()
    session.user = { id: 1, subject_id: 'sub', email: 'a@b.com', display_name: 'A', roles: [] } as never

    const onLogout = vi.fn()
    const { listenForLogoutBroadcast } = useOidcLogout()
    const cleanup = listenForLogoutBroadcast(onLogout)

    // Simulate broadcast from another tab
    MockBroadcastChannel.lastInstance!.simulateMessage({ type: 'logout' })

    expect(onLogout).toHaveBeenCalledTimes(1)
    expect(session.user).toBeNull()

    cleanup()
  })

  it('listenForLogoutBroadcast ignores non-logout messages', () => {
    const onLogout = vi.fn()
    const { listenForLogoutBroadcast } = useOidcLogout()
    listenForLogoutBroadcast(onLogout)

    MockBroadcastChannel.lastInstance!.simulateMessage({ type: 'refresh_done' })

    expect(onLogout).not.toHaveBeenCalled()
  })

  it('setIdTokenHint / clearIdTokenHint manage hint state', async () => {
    const session = useSessionStore()
    vi.spyOn(session, 'logout').mockResolvedValue()

    const { setIdTokenHint, clearIdTokenHint, logout } = useOidcLogout()

    setIdTokenHint('my-token')
    clearIdTokenHint()
    await logout()

    const url = new URL(windowAssignMock.mock.calls[0]![0] as string)
    expect(url.searchParams.has('id_token_hint')).toBe(false)
  })
})
