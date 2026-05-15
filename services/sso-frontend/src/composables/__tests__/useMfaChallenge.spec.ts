import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useMfaChallenge } from '../useMfaChallenge'
import { ApiError } from '@/lib/api/api-error'
import { mfaApi } from '@/services/mfa.api'
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

vi.mock('@/services/mfa.api', () => ({
  mfaApi: {
    verifyChallenge: vi.fn(),
  },
}))

function primeChallenge(): void {
  const store = useMfaChallengeStore()
  store.setChallenge({
    challenge_id: 'fr019-challenge-1',
    methods_available: ['totp', 'recovery_code'],
    expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  })
}

describe('useMfaChallenge — FE-FR019-001', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    routerPushMock.mockReset()
    routerPushMock.mockResolvedValue(undefined)
    ensureSessionMock.mockReset()
    ensureSessionMock.mockResolvedValue(undefined)
    windowAssignMock.mockReset()
    vi.mocked(mfaApi.verifyChallenge).mockReset()

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

  it('verifies challenge through central mfaApi instead of direct fetch', async () => {
    primeChallenge()
    vi.mocked(mfaApi.verifyChallenge).mockResolvedValueOnce({
      authenticated: true,
      continuation: {
        type: 'authorization_code',
        redirect_uri: 'https://app.test/callback?code=abc&state=xyz',
      },
    })
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    const mfa = useMfaChallenge()
    mfa.code.value = '123456'
    await mfa.submit()

    expect(mfaApi.verifyChallenge).toHaveBeenCalledWith({
      challenge_id: 'fr019-challenge-1',
      method: 'totp',
      code: '123456',
    })
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(windowAssignMock).toHaveBeenCalledWith('https://app.test/callback?code=abc&state=xyz')
    expect(routerPushMock).not.toHaveBeenCalled()
    expect(ensureSessionMock).not.toHaveBeenCalled()
  })

  it('falls back to /home when there is no continuation', async () => {
    primeChallenge()
    vi.mocked(mfaApi.verifyChallenge).mockResolvedValueOnce({ authenticated: true })

    const mfa = useMfaChallenge()
    mfa.code.value = '123456'
    await mfa.submit()

    expect(windowAssignMock).not.toHaveBeenCalled()
    expect(ensureSessionMock).toHaveBeenCalledOnce()
    expect(routerPushMock).toHaveBeenCalledWith('/home')
  })

  it('refuses to follow an unsafe continuation redirect', async () => {
    primeChallenge()
    vi.mocked(mfaApi.verifyChallenge).mockResolvedValueOnce({
      authenticated: true,
      continuation: {
        type: 'authorization_code',
        redirect_uri: 'javascript:alert(1)',
      },
    })

    const mfa = useMfaChallenge()
    mfa.code.value = '123456'
    await mfa.submit()

    expect(windowAssignMock).not.toHaveBeenCalled()
    expect(ensureSessionMock).toHaveBeenCalledOnce()
    expect(routerPushMock).toHaveBeenCalledWith('/home')
  })

  it('maps expired challenge conflicts to safe localized copy', async () => {
    primeChallenge()
    vi.mocked(mfaApi.verifyChallenge).mockRejectedValueOnce(
      new ApiError(409, 'The pending authorization request is no longer valid.', 'conflict'),
    )

    const mfa = useMfaChallenge()
    mfa.code.value = '123456'
    await mfa.submit()

    expect(mfa.error.value).toBe('Sesi verifikasi telah kedaluwarsa. Silakan login ulang.')
    expect(mfa.error.value).not.toContain('pending authorization')
    expect(windowAssignMock).not.toHaveBeenCalled()
    expect(routerPushMock).not.toHaveBeenCalled()
  })

  it('maps 419 CSRF safely', async () => {
    primeChallenge()
    vi.mocked(mfaApi.verifyChallenge).mockRejectedValueOnce(
      new ApiError(419, 'CSRF token mismatch.', 'csrf_token_mismatch'),
    )

    const mfa = useMfaChallenge()
    mfa.code.value = '123456'
    await mfa.submit()

    expect(mfa.error.value).toBe('Sesi keamanan kedaluwarsa. Muat ulang halaman lalu coba lagi.')
    expect(mfa.error.value).not.toContain('CSRF')
  })

  it('maps 429 safely without raw backend text', async () => {
    primeChallenge()
    vi.mocked(mfaApi.verifyChallenge).mockRejectedValueOnce(
      new ApiError(429, 'Too Many Attempts: throttle bucket sso:mfa', 'too_many_attempts', [], 'http', 60),
    )

    const mfa = useMfaChallenge()
    mfa.code.value = '123456'
    await mfa.submit()

    expect(mfa.error.value).toBe('Terlalu banyak percobaan. Tunggu sebentar sebelum mencoba lagi.')
    expect(mfa.error.value).not.toContain('bucket')
  })

  it('translates backend unsuccessful response safely', async () => {
    primeChallenge()
    vi.mocked(mfaApi.verifyChallenge).mockResolvedValueOnce({
      authenticated: false,
      error: 'Invalid verification code.',
    })

    const mfa = useMfaChallenge()
    mfa.code.value = '000000'
    await mfa.submit()

    expect(mfa.error.value).toBe('Kode verifikasi tidak valid. Silakan coba lagi.')
  })
})
