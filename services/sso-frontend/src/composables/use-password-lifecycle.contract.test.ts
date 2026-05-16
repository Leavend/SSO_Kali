import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api/api-error'
import {
  useChangePassword,
  usePasswordResetConfirm,
  usePasswordResetRequest,
} from './usePasswordLifecycle'
import { authApi } from '@/services/auth.api'
import { profileApi } from '@/services/profile.api'

vi.mock('@/services/auth.api', () => ({
  authApi: {
    requestPasswordReset: vi.fn(),
    confirmPasswordReset: vi.fn(),
  },
}))

vi.mock('@/services/profile.api', () => ({
  profileApi: {
    changePassword: vi.fn(),
  },
}))

describe('password lifecycle composables', () => {
  beforeEach(() => {
    vi.mocked(authApi.requestPasswordReset).mockReset()
    vi.mocked(authApi.confirmPasswordReset).mockReset()
    vi.mocked(profileApi.changePassword).mockReset()
  })

  it('validates strong self-service password changes before calling the API', async () => {
    const password = useChangePassword()
    password.form.current_password = 'OldPassword123!'
    password.form.new_password = 'short'
    password.form.new_password_confirmation = 'short'

    await password.submit()

    expect(profileApi.changePassword).not.toHaveBeenCalled()
    expect(password.fieldErrors.value['new_password']).toContain('Password belum memenuhi')
    expect(password.strengthItems.value).toContain('Minimal 12 karakter')
  })

  it('surfaces 422 field errors and never shows raw backend traces', async () => {
    vi.mocked(profileApi.changePassword).mockRejectedValue(
      new ApiError(422, 'Validasi gagal.', null, [
        { field: 'current_password', message: 'Password saat ini salah.' },
      ]),
    )
    const password = useChangePassword()
    password.form.current_password = 'OldPassword123!'
    password.form.new_password = 'NewSecure456!'
    password.form.new_password_confirmation = 'NewSecure456!'

    await password.submit()

    expect(password.fieldErrors.value['current_password']).toBe('Password saat ini salah.')
    expect(password.error.value).toBe('Validasi gagal.')
  })

  it('announces session revocation after a successful password change', async () => {
    vi.mocked(profileApi.changePassword).mockResolvedValue({
      message: 'Password berhasil diubah.',
      changed_at: '2026-05-17T12:00:00Z',
      other_sessions_revoked: true,
    })
    const password = useChangePassword()
    password.form.current_password = 'OldPassword123!'
    password.form.new_password = 'NewSecure456!'
    password.form.new_password_confirmation = 'NewSecure456!'

    await password.submit()

    expect(password.success.value).toContain('Semua sesi lain telah dicabut')
  })

  it('requests reset instructions with anti-enumeration success copy', async () => {
    vi.mocked(authApi.requestPasswordReset).mockResolvedValue({
      message: 'Jika email terdaftar, instruksi reset password akan dikirim.',
      sent: true,
    })
    const reset = usePasswordResetRequest()
    reset.form.email = 'user@example.test'

    await reset.submit()

    expect(authApi.requestPasswordReset).toHaveBeenCalledWith({ email: 'user@example.test' })
    expect(reset.success.value).toContain('Jika email terdaftar')
  })

  it('confirms password reset with safe 419/429 copy from ApiError', async () => {
    vi.mocked(authApi.confirmPasswordReset).mockRejectedValue(
      new ApiError(429, 'Terlalu banyak permintaan. Coba lagi nanti.', 'too_many_attempts'),
    )
    const reset = usePasswordResetConfirm('reset-token')
    reset.form.email = 'user@example.test'
    reset.form.password = 'NewSecure456!'
    reset.form.password_confirmation = 'NewSecure456!'

    await reset.submit()

    expect(reset.error.value).toBe('Terlalu banyak permintaan. Coba lagi nanti.')
    expect(reset.error.value).not.toContain('SQLSTATE')
  })
})
