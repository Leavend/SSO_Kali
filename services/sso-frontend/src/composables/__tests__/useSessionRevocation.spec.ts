import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSessionRevocation } from '../useSessionRevocation'
import { useProfileStore } from '@/stores/profile.store'
import { useSessionStore } from '@/stores/session.store'

const routerPushMock = vi.fn()

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerPushMock }),
}))

describe('useSessionRevocation', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    routerPushMock.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('askRevokeSession toggles confirmation and remembers session id', () => {
    const composable = useSessionRevocation()

    composable.askRevokeSession('sess-xyz')

    expect(composable.confirmSingleOpen.value).toBe(true)
    expect(composable.pendingSessionId.value).toBe('sess-xyz')
  })

  it('askRevokeAll only toggles global dialog', () => {
    const composable = useSessionRevocation()

    composable.askRevokeAll()

    expect(composable.confirmGlobalOpen.value).toBe(true)
    expect(composable.confirmSingleOpen.value).toBe(false)
  })

  it('confirmRevokeSession delegates to profile store and clears target', async () => {
    const profile = useProfileStore()
    const spy = vi.spyOn(profile, 'revokeSession').mockResolvedValue()

    const composable = useSessionRevocation()
    composable.askRevokeSession('sess-1')
    await composable.confirmRevokeSession()

    expect(spy).toHaveBeenCalledWith('sess-1')
    expect(composable.pendingSessionId.value).toBeNull()
  })

  it('confirmRevokeSession is a no-op when no target is set', async () => {
    const profile = useProfileStore()
    const spy = vi.spyOn(profile, 'revokeSession').mockResolvedValue()

    const composable = useSessionRevocation()
    await composable.confirmRevokeSession()

    expect(spy).not.toHaveBeenCalled()
  })

  it('confirmRevokeAll triggers logout + redirect to login on success', async () => {
    const profile = useProfileStore()
    const session = useSessionStore()

    vi.spyOn(profile, 'revokeAllSessions').mockResolvedValue({
      revoked: true,
      revoked_sessions: 2,
      revoked_refresh_tokens: 4,
    })
    const logoutSpy = vi.spyOn(session, 'logout').mockResolvedValue()

    const composable = useSessionRevocation()
    await composable.confirmRevokeAll()

    expect(logoutSpy).toHaveBeenCalled()
    expect(routerPushMock).toHaveBeenCalledWith({ name: 'auth.login', query: {} })
  })

  it('confirmRevokeAll does not logout when revoke fails', async () => {
    const profile = useProfileStore()
    const session = useSessionStore()

    vi.spyOn(profile, 'revokeAllSessions').mockRejectedValue(new Error('network'))
    const logoutSpy = vi.spyOn(session, 'logout').mockResolvedValue()

    const composable = useSessionRevocation()
    await composable.confirmRevokeAll()

    expect(logoutSpy).not.toHaveBeenCalled()
    expect(routerPushMock).not.toHaveBeenCalled()
  })
})
