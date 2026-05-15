import { describe, expect, it, vi } from 'vitest'
import { useMfaEnrollment } from '../useMfaEnrollment'
import { ApiError } from '@/lib/api/api-error'
import { mfaApi } from '@/services/mfa.api'

vi.mock('@/services/mfa.api', () => ({
  mfaApi: {
    getStatus: vi.fn(),
    startEnrollment: vi.fn(),
    verifyTotp: vi.fn(),
    remove: vi.fn(),
    regenerateRecoveryCodes: vi.fn(),
  },
}))

describe('useMfaEnrollment', () => {
  it('loads not-enrolled MFA status', async () => {
    vi.mocked(mfaApi.getStatus).mockResolvedValueOnce({
      enrolled: false,
      methods: [],
      totp_verified_at: null,
      recovery_codes_remaining: 0,
    })

    const mfa = useMfaEnrollment()
    await mfa.fetchStatus()

    expect(mfa.isEnrolled.value).toBe(false)
    expect(mfa.step.value).toBe('idle')
  })

  it('starts enrollment with QR secret state', async () => {
    vi.mocked(mfaApi.startEnrollment).mockResolvedValueOnce({
      secret: 'SECRET',
      qr_uri: 'otpauth://totp/test',
      provisioning_uri: 'otpauth://totp/test',
    })

    const mfa = useMfaEnrollment()
    await mfa.startEnrollment()

    expect(mfa.step.value).toBe('scanning')
    expect(mfa.enrollData.value?.secret).toBe('SECRET')
  })

  it('verifies TOTP and displays recovery codes once', async () => {
    vi.mocked(mfaApi.verifyTotp).mockResolvedValueOnce({
      verified: true,
      recovery_codes: ['AAAA-BBBB', 'CCCC-DDDD'],
    })
    vi.mocked(mfaApi.getStatus).mockResolvedValueOnce({
      enrolled: true,
      methods: ['totp'],
      totp_verified_at: '2026-05-15T00:00:00Z',
      recovery_codes_remaining: 2,
    })

    const mfa = useMfaEnrollment()
    await mfa.verifyCode('123456')

    expect(mfa.step.value).toBe('recovery')
    expect(mfa.recoveryCodes.value).toEqual(['AAAA-BBBB', 'CCCC-DDDD'])

    mfa.completeSetup()
    expect(mfa.recoveryCodes.value).toEqual([])
  })

  it('maps verification failure to safe copy only', async () => {
    vi.mocked(mfaApi.verifyTotp).mockRejectedValueOnce(
      new ApiError(422, 'SQL trace invalid token for user@example.com', null, [
        { field: 'code', message: 'raw code failure' },
      ]),
    )

    const mfa = useMfaEnrollment()
    await expect(mfa.verifyCode('000000')).rejects.toBeInstanceOf(ApiError)

    expect(mfa.error.value).toBe('Kode verifikasi tidak valid atau sudah kedaluwarsa.')
    expect(mfa.error.value).not.toContain('user@example.com')
  })

  it('regenerates recovery codes with password confirmation', async () => {
    vi.mocked(mfaApi.regenerateRecoveryCodes).mockResolvedValueOnce({
      regenerated: true,
      recovery_codes: ['NEW-CODE'],
    })
    vi.mocked(mfaApi.getStatus).mockResolvedValueOnce({
      enrolled: true,
      methods: ['totp'],
      totp_verified_at: '2026-05-15T00:00:00Z',
      recovery_codes_remaining: 1,
    })

    const mfa = useMfaEnrollment()
    await expect(mfa.regenerateCodes('password')).resolves.toBe(true)

    expect(mfa.step.value).toBe('recovery')
    expect(mfa.recoveryCodes.value).toEqual(['NEW-CODE'])
  })

  it('removes MFA with password confirmation', async () => {
    vi.mocked(mfaApi.remove).mockResolvedValueOnce({ removed: true, message: 'ok' })
    vi.mocked(mfaApi.getStatus).mockResolvedValueOnce({
      enrolled: false,
      methods: [],
      totp_verified_at: null,
      recovery_codes_remaining: 0,
    })

    const mfa = useMfaEnrollment()
    await expect(mfa.remove('password')).resolves.toBe(true)

    expect(mfa.step.value).toBe('idle')
  })
})
