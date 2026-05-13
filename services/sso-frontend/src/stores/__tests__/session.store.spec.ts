import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { authApi } from '@/services/auth.api'
import type { SsoLoginResponse } from '@/types/auth.types'
import { useSessionStore } from '../session.store'

describe('useSessionStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.restoreAllMocks()
  })

  it('starts unauthenticated', () => {
    const store = useSessionStore()
    expect(store.isAuthenticated).toBe(false)
    expect(store.user).toBeNull()
    expect(store.displayName).toBe('')
  })

  it('ensureSession() hydrates user when backend returns authenticated', async () => {
    vi.spyOn(authApi, 'getSession').mockResolvedValue({
      authenticated: true,
      user: {
        id: 1,
        subject_id: 'user-uuid',
        email: 'admin@example.com',
        display_name: 'Admin Utama',
        roles: ['super-admin'],
      },
    })

    const store = useSessionStore()
    const ok = await store.ensureSession()

    expect(ok).toBe(true)
    expect(store.isAuthenticated).toBe(true)
    expect(store.displayName).toBe('Admin Utama')
    expect(store.roles).toEqual(['super-admin'])
  })

  it('ensureSession() clears user when backend reports unauthenticated', async () => {
    vi.spyOn(authApi, 'getSession').mockResolvedValue({ authenticated: false })

    const store = useSessionStore()
    store.$patch({ user: { id: 99, subject_id: 's', email: 'x', display_name: 'x', roles: [] } })

    const ok = await store.ensureSession()

    expect(ok).toBe(false)
    expect(store.user).toBeNull()
  })

  it('ensureSession() swallows API error and clears user', async () => {
    vi.spyOn(authApi, 'getSession').mockRejectedValue(new Error('offline'))

    const store = useSessionStore()
    const ok = await store.ensureSession()

    expect(ok).toBe(false)
    expect(store.user).toBeNull()
    expect(store.status).toBe('idle')
  })

  it('login() updates user when authenticated', async () => {
    const response: SsoLoginResponse = {
      authenticated: true,
      user: {
        id: 2,
        subject_id: 'u2',
        email: 'user@example.com',
        display_name: 'User',
        roles: ['user'],
      },
      session: { expires_at: '2099-12-31T23:59:59Z' },
      next: { type: 'session', auth_request_id: null },
    }
    vi.spyOn(authApi, 'login').mockResolvedValue(response)

    const store = useSessionStore()
    const result = await store.login({ identifier: 'user@example.com', password: 'secret' })

    expect(result).toEqual(response)
    expect(store.isAuthenticated).toBe(true)
    expect(store.user?.email).toBe('user@example.com')
  })

  it('login() returns failure and keeps store unauthenticated', async () => {
    vi.spyOn(authApi, 'login').mockResolvedValue({
      authenticated: false,
      error: 'invalid_credentials',
      message: 'Invalid',
    })

    const store = useSessionStore()
    const result = await store.login({ identifier: 'x', password: 'y' })

    expect(result.authenticated).toBe(false)
    expect(store.isAuthenticated).toBe(false)
  })

  it('logout() always clears user even when service throws', async () => {
    const store = useSessionStore()
    store.$patch({
      user: { id: 1, subject_id: 's', email: 'x', display_name: 'x', roles: [] },
    })

    vi.spyOn(authApi, 'logout').mockRejectedValue(new Error('network'))
    await store.logout()

    expect(store.user).toBeNull()
    expect(store.status).toBe('idle')
  })
})
