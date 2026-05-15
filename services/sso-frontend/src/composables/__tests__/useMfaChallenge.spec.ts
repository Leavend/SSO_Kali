import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useMfaChallenge } from '../useMfaChallenge'
import { useMfaChallengeStore } from '@/stores/mfa-challenge.store'

const routerPushMock = vi.fn<(...args: unknown[]) => Promise<void>>()
const ensureSessionMock = vi.fn<() => Promise<unknown>>()
const windowAssignMock = vi.fn<(url: string) => void>()

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerPushMock }),
}))

vi.mock('@/stores/session.store', () => ({
  useSessionStore: () => ({ ensureSession: ensureSessionMock }),
}))

function primeChallenge(): void {
  const store = useMfaChallengeStore()
  store.setChallenge({
    challenge_id: 'fr019-challenge-1',
    methods_available: ['totp', 'recovery_code'],
    expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  })
}

describe('useMfaChallenge — BE-FR019-001', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    routerPushMock.mockReset()
    routerPushMock.mockResolvedValue(undefined)
    ensureSessionMock.mockReset()
    ensureSessionMock.mockResolvedValue(undefined)
    windowAssignMock.mockReset()

    vi.stubGlobal('location', {
      ...window.location,
      assign: windowAssignMock,
      origin: 'https://sso.test',
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('follows the server-issued continuation redirect when present', async () => {
    primeChallenge()

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            authenticated: true,
            mfa_method: 'totp',
            user: { subject_id: 's', email: 'u', display_name: 'u' },
            session: { expires_at: '2099-12-31T00:00:00Z' },
            continuation: {
              type: 'authorization_code',
              redirect_uri: 'https://app.test/callback?code=abc&state=xyz',
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )

    const mfa = useMfaChallenge()
    mfa.code.value = '123456'
    await mfa.submit()

    expect(fetchMock).toHaveBeenCalled()
    expect(windowAssignMock).toHaveBeenCalledWith(
      'https://app.test/callback?code=abc&state=xyz',
    )
    expect(routerPushMock).not.toHaveBeenCalled()
    expect(ensureSessionMock).not.toHaveBeenCalled()
  })

  it('falls back to /home when there is no continuation', async () => {
    primeChallenge()

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          authenticated: true,
          mfa_method: 'totp',
          user: { subject_id: 's', email: 'u', display_name: 'u' },
          session: { expires_at: '2099-12-31T00:00:00Z' },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )

    const mfa = useMfaChallenge()
    mfa.code.value = '123456'
    await mfa.submit()

    expect(windowAssignMock).not.toHaveBeenCalled()
    expect(ensureSessionMock).toHaveBeenCalledOnce()
    expect(routerPushMock).toHaveBeenCalledWith('/home')
  })

  it('refuses to follow an unsafe continuation redirect (open redirect guard)', async () => {
    primeChallenge()

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          authenticated: true,
          mfa_method: 'totp',
          user: { subject_id: 's', email: 'u', display_name: 'u' },
          session: { expires_at: '2099-12-31T00:00:00Z' },
          continuation: {
            type: 'authorization_code',
            redirect_uri: 'javascript:alert(1)',
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )

    const mfa = useMfaChallenge()
    mfa.code.value = '123456'
    await mfa.submit()

    expect(windowAssignMock).not.toHaveBeenCalled()
    expect(ensureSessionMock).toHaveBeenCalledOnce()
    expect(routerPushMock).toHaveBeenCalledWith('/home')
  })

  it('translates the pending-authorization conflict into a localized error', async () => {
    primeChallenge()

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          authenticated: false,
          error: 'The pending authorization request is no longer valid.',
        }),
        { status: 409, headers: { 'content-type': 'application/json' } },
      ),
    )

    const mfa = useMfaChallenge()
    mfa.code.value = '123456'
    await mfa.submit()

    expect(mfa.error.value).toMatch(/otorisasi sudah tidak berlaku/i)
    expect(windowAssignMock).not.toHaveBeenCalled()
    expect(routerPushMock).not.toHaveBeenCalled()
  })
})
