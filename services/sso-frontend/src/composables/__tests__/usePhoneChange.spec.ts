import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePhoneChange } from '../usePhoneChange'
import { profileApi } from '@/services/profile.api'
import { ApiError } from '@/lib/api/api-error'

vi.mock('@/services/profile.api', () => ({
  profileApi: {
    requestPhoneChange: vi.fn(),
    confirmPhoneChange: vi.fn(),
  },
}))

describe('usePhoneChange', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('initial state', () => {
    it('starts on request step with no errors', () => {
      const { step, pending, error, success, fieldErrors, newPhone } = usePhoneChange()

      expect(step.value).toBe('request')
      expect(pending.value).toBe(false)
      expect(error.value).toBeNull()
      expect(success.value).toBeNull()
      expect(fieldErrors.value).toEqual({})
      expect(newPhone.value).toBe('')
    })
  })

  describe('requestChange()', () => {
    it('moves to confirm step on successful request', async () => {
      vi.mocked(profileApi.requestPhoneChange).mockResolvedValueOnce({
        message: 'Kode OTP telah dikirim ke nomor baru.',
      })

      const { step, requestChange } = usePhoneChange()
      await requestChange('+6281234567890', 'password123')

      expect(step.value).toBe('confirm')
      expect(profileApi.requestPhoneChange).toHaveBeenCalledWith({
        new_phone: '+6281234567890',
        current_password: 'password123',
      })
    })

    it('sets fieldErrors for empty phone', async () => {
      const { fieldErrors, requestChange } = usePhoneChange()
      await requestChange('', 'password123')

      expect(fieldErrors.value.new_phone).toBe('Nomor telepon wajib diisi.')
      expect(profileApi.requestPhoneChange).not.toHaveBeenCalled()
    })

    it('sets fieldErrors for invalid phone format', async () => {
      const { fieldErrors, requestChange } = usePhoneChange()
      await requestChange('abc', 'password123')

      expect(fieldErrors.value.new_phone).toBe('Format nomor telepon tidak valid.')
      expect(profileApi.requestPhoneChange).not.toHaveBeenCalled()
    })

    it('sets fieldErrors for empty password', async () => {
      const { fieldErrors, requestChange } = usePhoneChange()
      await requestChange('+6281234567890', '')

      expect(fieldErrors.value.current_password).toBe('Password saat ini wajib diisi.')
      expect(profileApi.requestPhoneChange).not.toHaveBeenCalled()
    })

    it('sets error on API failure', async () => {
      vi.mocked(profileApi.requestPhoneChange).mockRejectedValueOnce(
        new ApiError(401, 'Invalid password'),
      )

      const { error, requestChange } = usePhoneChange()
      await requestChange('+6281234567890', 'wrong')

      expect(error.value).toBe('Invalid password')
    })

    it('sets success message on API success', async () => {
      vi.mocked(profileApi.requestPhoneChange).mockResolvedValueOnce({
        message: 'OTP terkirim.',
      })

      const { success, requestChange } = usePhoneChange()
      await requestChange('+6281234567890', 'password123')

      expect(success.value).toBe('OTP terkirim.')
    })

    it('keeps pending true during request and false after', async () => {
      vi.mocked(profileApi.requestPhoneChange).mockResolvedValueOnce({
        message: 'OTP terkirim.',
      })

      const { pending, requestChange } = usePhoneChange()
      const promise = requestChange('+6281234567890', 'password123')
      expect(pending.value).toBe(true)
      await promise
      expect(pending.value).toBe(false)
    })
  })

  describe('confirmChange()', () => {
    it('calls confirmPhoneChange with OTP', async () => {
      vi.mocked(profileApi.confirmPhoneChange).mockResolvedValueOnce({
        message: 'Nomor telepon berhasil diubah.',
      })

      const { confirmChange } = usePhoneChange()
      await confirmChange('123456')

      expect(profileApi.confirmPhoneChange).toHaveBeenCalledWith({ otp: '123456' })
    })

    it('sets error on empty OTP', async () => {
      const { fieldErrors, confirmChange } = usePhoneChange()
      await confirmChange('')

      expect(fieldErrors.value.otp).toBe('Kode OTP wajib diisi.')
      expect(profileApi.confirmPhoneChange).not.toHaveBeenCalled()
    })

    it('sets error on API failure', async () => {
      vi.mocked(profileApi.confirmPhoneChange).mockRejectedValueOnce(
        new ApiError(422, 'OTP tidak valid atau kedaluwarsa.'),
      )

      const { error, confirmChange } = usePhoneChange()
      await confirmChange('000000')

      expect(error.value).toBe('OTP tidak valid atau kedaluwarsa.')
    })
  })

  describe('reset()', () => {
    it('returns state to initial values', async () => {
      vi.mocked(profileApi.requestPhoneChange).mockResolvedValueOnce({
        message: 'OTP terkirim.',
      })

      const { step, pending, error, success, fieldErrors, newPhone, requestChange, reset } =
        usePhoneChange()
      await requestChange('+6281234567890', 'password123')

      reset()

      expect(step.value).toBe('request')
      expect(pending.value).toBe(false)
      expect(error.value).toBeNull()
      expect(success.value).toBeNull()
      expect(fieldErrors.value).toEqual({})
      expect(newPhone.value).toBe('')
    })
  })
})
