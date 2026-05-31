import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api/api-error'
import { apiClient } from '@/lib/api/api-client'
import { useRegisterForm } from '../useRegisterForm'

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/lib/api/api-client', () => ({
  apiClient: {
    post: vi.fn(),
  },
}))

describe('useRegisterForm', () => {
  beforeEach(() => {
    vi.mocked(apiClient.post).mockReset()
  })

  it('shows retry-after cooldown copy for 429 registration throttles', async () => {
    vi.mocked(apiClient.post).mockRejectedValue(
      new ApiError(429, 'SQLSTATE throttle trace', 'too_many_attempts', [], 'http', 45),
    )
    const register = useRegisterForm()
    register.form.name = 'User Baru'
    register.form.email = 'user@example.test'
    register.form.password = 'SecurePassword123!'
    register.form.password_confirmation = 'SecurePassword123!'
    register.steps.goTo('confirm')

    await register.onSubmit(new Event('submit'))

    expect(register.bannerError.value).toBe('Terlalu banyak percobaan. Coba lagi dalam 45 detik.')
    expect(register.bannerError.value).not.toContain('SQLSTATE')
  })
})
