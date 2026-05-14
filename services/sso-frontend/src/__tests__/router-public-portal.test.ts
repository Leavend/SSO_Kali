import { describe, expect, it, vi } from 'vitest'

const ensureSession = vi.fn()
const ensureAdminSession = vi.fn()

vi.mock('@/stores/session', () => ({
  useSessionStore: () => ({ ensureSession }),
}))

vi.mock('@/stores/admin', () => ({
  useAdminStore: () => ({ ensureSession: ensureAdminSession, redirectTo: null }),
}))

describe('frontend router public portal routes', () => {
  it('registers user portal routes that existed before the regression', async () => {
    const { router } = await import('../web/router')

    expect(router.resolve('/home').name).toBe('home')
    expect(router.resolve('/profile').name).toBe('profile')
    expect(router.resolve('/sessions').name).toBe('my-sessions')
    expect(router.resolve('/apps').name).toBe('connected-apps')
    expect(router.resolve('/security').name).toBe('security')
  })

  it('keeps admin session management under the admin namespace', async () => {
    const { router } = await import('../web/router')

    expect(router.resolve('/admin/sessions').name).toBe('admin-sessions')
    expect(router.resolve('/admin/apps').name).toBe('admin-apps')
  })
})
