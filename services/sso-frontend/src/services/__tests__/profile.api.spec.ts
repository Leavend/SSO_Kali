import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '@/lib/api/api-client'
import { profileApi } from '../profile.api'

describe('profile.api — email/phone change contract', () => {
  let postSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    postSpy = vi.spyOn(apiClient, 'post')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('requestEmailChange()', () => {
    it('sends POST /api/profile/email-change with new_email and current_password', async () => {
      postSpy.mockResolvedValueOnce({ message: 'Token terkirim.' })

      await profileApi.requestEmailChange({
        new_email: 'new@example.com',
        current_password: 'secret123',
      })

      expect(postSpy).toHaveBeenCalledWith('/api/profile/email-change', {
        new_email: 'new@example.com',
        current_password: 'secret123',
      })
    })
  })

  describe('confirmEmailChange()', () => {
    it('sends POST /api/profile/email-change/confirm with token', async () => {
      postSpy.mockResolvedValueOnce({ message: 'Email berhasil diubah.' })

      await profileApi.confirmEmailChange({ token: 'abc-token-123' })

      expect(postSpy).toHaveBeenCalledWith('/api/profile/email-change/confirm', {
        token: 'abc-token-123',
      })
    })
  })

  describe('requestPhoneChange()', () => {
    it('sends POST /api/profile/phone-change with new_phone and current_password', async () => {
      postSpy.mockResolvedValueOnce({ message: 'OTP terkirim.' })

      await profileApi.requestPhoneChange({
        new_phone: '+6281234567890',
        current_password: 'secret123',
      })

      expect(postSpy).toHaveBeenCalledWith('/api/profile/phone-change', {
        new_phone: '+6281234567890',
        current_password: 'secret123',
      })
    })
  })

  describe('confirmPhoneChange()', () => {
    it('sends POST /api/profile/phone-change/confirm with otp', async () => {
      postSpy.mockResolvedValueOnce({ message: 'Nomor telepon berhasil diubah.' })

      await profileApi.confirmPhoneChange({ otp: '123456' })

      expect(postSpy).toHaveBeenCalledWith('/api/profile/phone-change/confirm', {
        otp: '123456',
      })
    })
  })
})
