import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '@/lib/api/api-client'
import { profileApi } from '../profile.api'

describe('profile.api — email/phone change contract', () => {
  let getSpy: ReturnType<typeof vi.spyOn>
  let postSpy: ReturnType<typeof vi.spyOn>
  let patchSpy: ReturnType<typeof vi.spyOn>
  let deleteSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    getSpy = vi.spyOn(apiClient, 'get')
    postSpy = vi.spyOn(apiClient, 'post')
    patchSpy = vi.spyOn(apiClient, 'patch')
    deleteSpy = vi.spyOn(apiClient, 'delete')
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

  describe('trusted devices', () => {
    it('loads GET /api/profile/devices and returns devices list', async () => {
      getSpy.mockResolvedValueOnce({ devices: [{ id: 7, label: 'Laptop', fingerprint: 'abc' }] })

      const devices = await profileApi.getTrustedDevices()

      expect(getSpy).toHaveBeenCalledWith('/api/profile/devices')
      expect(devices).toEqual([{ id: 7, label: 'Laptop', fingerprint: 'abc' }])
    })

    it('renames PATCH /api/profile/devices/{id} with label payload', async () => {
      patchSpy.mockResolvedValueOnce({ device: { id: 7, label: 'Laptop utama' } })

      await profileApi.renameTrustedDevice(7, { label: 'Laptop utama' })

      expect(patchSpy).toHaveBeenCalledWith('/api/profile/devices/7', { label: 'Laptop utama' })
    })

    it('revokes DELETE /api/profile/devices/{id}', async () => {
      deleteSpy.mockResolvedValueOnce({ device_id: 7, revoked: true })

      await profileApi.revokeTrustedDevice(7)

      expect(deleteSpy).toHaveBeenCalledWith('/api/profile/devices/7')
    })
  })
})
