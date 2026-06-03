import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ApiError } from '@/lib/api/api-client'
import { profileApi } from '../../services/profile.api'
import { useAdminProfileStore } from '../admin-profile.store'

vi.mock('../../services/profile.api')
vi.mock('@/lib/api/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/api-client')>()
  return { ...actual, getLastRequestId: vi.fn<() => string>(() => 'req-profile-id') }
})

const mockPrincipal = {
  subject_id: 'admin-001',
  email: 'admin@sso.example.com',
  display_name: 'Administrator',
  given_name: 'Admin',
  family_name: 'User',
  role: 'admin',
  permissions: ['admin.users.read', 'admin.roles.read'],
}

describe('useAdminProfileStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  describe('initial state', () => {
    it('initializes idle with null principal', () => {
      const store = useAdminProfileStore()

      expect(store.status).toBe('idle')
      expect(store.principal).toBeNull()
      expect(store.errorMessage).toBeNull()
    })
  })

  describe('load()', () => {
    it('populates principal on success', async () => {
      vi.mocked(profileApi.getProfile).mockResolvedValueOnce({ principal: mockPrincipal })

      const store = useAdminProfileStore()
      await store.load()

      expect(store.status).toBe('success')
      expect(store.principal?.subject_id).toBe('admin-001')
      expect(store.principal?.email).toBe('admin@sso.example.com')
    })

    it('sets loading during request', () => {
      vi.mocked(profileApi.getProfile).mockReturnValueOnce(new Promise(() => {}))

      const store = useAdminProfileStore()
      void store.load()

      expect(store.status).toBe('loading')
    })

    it('sets unauthenticated on 401', async () => {
      vi.mocked(profileApi.getProfile).mockRejectedValueOnce(
        new ApiError(401, 'Unauthenticated', 'req-401'),
      )

      const store = useAdminProfileStore()
      await store.load()

      expect(store.status).toBe('unauthenticated')
      expect(store.principal).toBeNull()
    })

    it('sets forbidden on 403', async () => {
      vi.mocked(profileApi.getProfile).mockRejectedValueOnce(
        new ApiError(403, 'Forbidden', 'req-403'),
      )

      const store = useAdminProfileStore()
      await store.load()

      expect(store.status).toBe('forbidden')
      expect(store.errorMessage).toContain('izin')
    })

    it('sets error status on generic failure', async () => {
      vi.mocked(profileApi.getProfile).mockRejectedValueOnce(new Error('Network timeout'))

      const store = useAdminProfileStore()
      await store.load()

      expect(store.status).toBe('error')
      expect(store.principal).toBeNull()
    })

    it('does not store token or secret in principal state', async () => {
      vi.mocked(profileApi.getProfile).mockResolvedValueOnce({ principal: mockPrincipal })

      const store = useAdminProfileStore()
      await store.load()

      // Principal must not contain access_token, refresh_token, or client_secret
      const principalJson = JSON.stringify(store.principal)
      expect(principalJson).not.toContain('access_token')
      expect(principalJson).not.toContain('refresh_token')
      expect(principalJson).not.toContain('client_secret')
    })
  })
})
