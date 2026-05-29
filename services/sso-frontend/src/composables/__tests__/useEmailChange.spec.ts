import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEmailChange } from '../useEmailChange'
import { profileApi } from '@/services/profile.api'
import { ApiError } from '@/lib/api/api-error'

vi.mock('@/services/profile.api', () => ({
  profileApi: {
    requestEmailChange: vi.fn(),
    confirmEmailChange: vi.fn(),
  },
}))

describe('useEmailChange', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('initial state', () => {
    it('starts on request step with no errors', () => {
      const { step, pending, error, success, fieldErrors, newEmail } = useEmailChange()

      expect(step.value).toBe('request')
      expect(pending.value).toBe(false)
      expect(error.value).toBeNull()
      expect(success.value).toBeNull()
      expect(fieldErrors.value).toEqual({})
      expect(newEmail.value).toBe('')
    })
  })

  describe('requestChange()', () => {
    it('moves to confirm step on successful request', async () => {
      vi.mocked(profileApi.requestEmailChange).mockResolvedValueOnce({
        message: 'Token verifikasi telah dikirim ke email baru.',
      })

      const { step, requestChange } = useEmailChange()
      await requestChange('new@example.com', 'password123')

      expect(step.value).toBe('confirm')
      expect(profileApi.requestEmailChange).toHaveBeenCalledWith({
        new_email: 'new@example.com',
        current_password: 'password123',
      })
    })

    it('sets fieldErrors for empty email', async () => {
      const { fieldErrors, requestChange } = useEmailChange()
      await requestChange('', 'password123')

      expect(fieldErrors.value.new_email).toBe('Email wajib diisi.')
      expect(profileApi.requestEmailChange).not.toHaveBeenCalled()
    })

    it('sets fieldErrors for invalid email format', async () => {
      const { fieldErrors, requestChange } = useEmailChange()
      await requestChange('not-an-email', 'password123')

      expect(fieldErrors.value.new_email).toBe('Format email tidak valid.')
      expect(profileApi.requestEmailChange).not.toHaveBeenCalled()
    })

    it('sets fieldErrors for empty password', async () => {
      const { fieldErrors, requestChange } = useEmailChange()
      await requestChange('new@example.com', '')

      expect(fieldErrors.value.current_password).toBe('Password saat ini wajib diisi.')
      expect(profileApi.requestEmailChange).not.toHaveBeenCalled()
    })

    it('sets error on API failure', async () => {
      vi.mocked(profileApi.requestEmailChange).mockRejectedValueOnce(
        new ApiError(401, 'Invalid password'),
      )

      const { error, requestChange } = useEmailChange()
      await requestChange('new@example.com', 'wrong')

      expect(error.value).toBe('Invalid password')
    })

    it('sets success message on API success', async () => {
      vi.mocked(profileApi.requestEmailChange).mockResolvedValueOnce({
        message: 'Token terkirim.',
      })

      const { success, requestChange } = useEmailChange()
      await requestChange('new@example.com', 'password123')

      expect(success.value).toBe('Token terkirim.')
    })

    it('keeps pending true during request and false after', async () => {
      vi.mocked(profileApi.requestEmailChange).mockResolvedValueOnce({
        message: 'Token terkirim.',
      })

      const { pending, requestChange } = useEmailChange()
      const promise = requestChange('new@example.com', 'password123')
      expect(pending.value).toBe(true)
      await promise
      expect(pending.value).toBe(false)
    })
  })

  describe('confirmChange()', () => {
    it('calls confirmEmailChange with token', async () => {
      vi.mocked(profileApi.confirmEmailChange).mockResolvedValueOnce({
        message: 'Email berhasil diubah.',
      })

      const { confirmChange } = useEmailChange()
      await confirmChange('abc123')

      expect(profileApi.confirmEmailChange).toHaveBeenCalledWith({ token: 'abc123' })
    })

    it('sets error on empty token', async () => {
      const { fieldErrors, confirmChange } = useEmailChange()
      await confirmChange('')

      expect(fieldErrors.value.token).toBe('Token verifikasi wajib diisi.')
      expect(profileApi.confirmEmailChange).not.toHaveBeenCalled()
    })

    it('sets error on API failure', async () => {
      vi.mocked(profileApi.confirmEmailChange).mockRejectedValueOnce(
        new ApiError(422, 'Token tidak valid atau kedaluwarsa.'),
      )

      const { error, confirmChange } = useEmailChange()
      await confirmChange('invalid-token')

      expect(error.value).toBe('Token tidak valid atau kedaluwarsa.')
    })
  })

  describe('reset()', () => {
    it('returns state to initial values', async () => {
      vi.mocked(profileApi.requestEmailChange).mockResolvedValueOnce({
        message: 'Token terkirim.',
      })

      const { step, pending, error, success, fieldErrors, newEmail, requestChange, reset } =
        useEmailChange()
      await requestChange('new@example.com', 'password123')

      reset()

      expect(step.value).toBe('request')
      expect(pending.value).toBe(false)
      expect(error.value).toBeNull()
      expect(success.value).toBeNull()
      expect(fieldErrors.value).toEqual({})
      expect(newEmail.value).toBe('')
    })
  })
})
